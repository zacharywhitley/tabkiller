/**
 * IndexedDB-backed GraphStore for the temporal browsing graph.
 *
 * Mirrors the public API of the design spike at spike/temporal-graph/store.ts:
 *   putNode, putEdge, getNode, nodesOfType, outEdges, inEdges,
 *   outPoint, outInterval, inPoint, inInterval, edgesOfType, stats
 *
 * Backing storage:
 *   graph_nodes  keyPath 'id',  indexes on (type, at_time), and the four
 *                node-type-specific single-field identity indexes.
 *   graph_edges  keyPath 'id',  indexes on (from_id, type), (to_id, type),
 *                (type, at_time) [point edges only], (type, valid_from)
 *                [interval edges only].
 *
 * Transactional invariants:
 *   - Every write is one `readwrite` transaction. Callers batching a node
 *     plus its outgoing edges use `writeBatch()` to keep them atomic.
 *   - Reads run in `readonly` transactions and never mutate.
 *   - No timestamps are wrapped in `Date`; the schema stores integer ms
 *     since epoch.
 */

import {
  STORE_NAMES,
  INDEX_NAMES,
} from '../../session/storage/schema';

import type {
  AnyNode,
  AnyEdge,
  NodeType,
  EdgeType,
  PointEdge,
  IntervalEdge,
  PointEdgeType,
  IntervalEdgeType,
  VisitNode,
} from './types';

// Discriminator sets kept close to the type declarations so a compiler
// change in types.ts surfaces here as an unused-symbol lint, not silent
// drift.
const POINT_EDGE_TYPES: ReadonlySet<PointEdgeType> = new Set<PointEdgeType>([
  'navigated_from',
  'opened_from',
  'arrived_via',
  'tagged_with',
]);

const INTERVAL_EDGE_TYPES: ReadonlySet<IntervalEdgeType> = new Set<IntervalEdgeType>([
  'of_page',
  'in_tab',
  'in_session',
  'in_window',
  'on_domain',
]);

function isPointEdgeType(t: EdgeType): t is PointEdgeType {
  return POINT_EDGE_TYPES.has(t as PointEdgeType);
}

function isIntervalEdgeType(t: EdgeType): t is IntervalEdgeType {
  return INTERVAL_EDGE_TYPES.has(t as IntervalEdgeType);
}

export interface GraphWriteBatch {
  nodes?: readonly AnyNode[];
  edges?: readonly AnyEdge[];
}

export class GraphStore {
  constructor(private readonly db: IDBDatabase) {}

  // ---- Write ----

  async putNode(node: AnyNode): Promise<void> {
    return this.writeBatch({ nodes: [node] });
  }

  async putEdge(edge: AnyEdge): Promise<void> {
    return this.writeBatch({ edges: [edge] });
  }

  /**
   * Delete a single node by id. Same transactional pattern as
   * `writeBatch`. Used by one-shot migrations that need to purge stale
   * records the normal capture flow has no way to reach. Silent when
   * the id does not exist — IDB `delete` treats that as a no-op.
   */
  async deleteNode(id: string): Promise<void> {
    const tx = this.db.transaction(STORE_NAMES.GRAPH_NODES, 'readwrite');
    try {
      tx.objectStore(STORE_NAMES.GRAPH_NODES).delete(id);
    } catch (err) {
      tx.abort();
      await awaitTransaction(tx).catch(() => undefined);
      throw err;
    }
    await awaitTransaction(tx);
  }

  /**
   * Delete a single edge by id. See `deleteNode` for the transactional
   * contract; both target one store each, so they're kept separate
   * rather than sharing a two-store transaction (which would upgrade
   * unrelated reads to needless locks).
   */
  async deleteEdge(id: string): Promise<void> {
    const tx = this.db.transaction(STORE_NAMES.GRAPH_EDGES, 'readwrite');
    try {
      tx.objectStore(STORE_NAMES.GRAPH_EDGES).delete(id);
    } catch (err) {
      tx.abort();
      await awaitTransaction(tx).catch(() => undefined);
      throw err;
    }
    await awaitTransaction(tx);
  }

  /**
   * Atomic multi-write: a node and any edges captured from the same
   * upstream event go in one transaction so a mid-batch crash cannot
   * leave dangling edges. A synchronous throw from `put` (e.g. a record
   * missing its keyPath) aborts the whole transaction before commit.
   */
  async writeBatch(batch: GraphWriteBatch): Promise<void> {
    const tx = this.db.transaction(
      [STORE_NAMES.GRAPH_NODES, STORE_NAMES.GRAPH_EDGES],
      'readwrite',
    );
    try {
      if (batch.nodes) {
        const nodeStore = tx.objectStore(STORE_NAMES.GRAPH_NODES);
        for (const node of batch.nodes) nodeStore.put(node);
      }
      if (batch.edges) {
        const edgeStore = tx.objectStore(STORE_NAMES.GRAPH_EDGES);
        for (const edge of batch.edges) edgeStore.put(edge);
      }
    } catch (err) {
      tx.abort();
      await awaitTransaction(tx).catch(() => undefined);
      throw err;
    }
    await awaitTransaction(tx);
  }

  // ---- Read: nodes ----

  async getNode<T extends AnyNode>(id: string): Promise<T | undefined> {
    const tx = this.db.transaction(STORE_NAMES.GRAPH_NODES, 'readonly');
    const store = tx.objectStore(STORE_NAMES.GRAPH_NODES);
    const value = await awaitRequest<T | undefined>(store.get(id));
    return value ?? undefined;
  }

  async nodesOfType<T extends AnyNode>(type: NodeType): Promise<T[]> {
    // Range-scan the `type` single-field index. Beats the older
    // full-store getAll() + JS filter by O(nodes-of-other-types), which
    // dominates as browsing history grows. The (type, at_time) compound
    // index couldn't do this job because it skips records without an
    // at_time field (Tab, Window, Page, Session, Domain, Tag,
    // SearchQuery all lack it).
    const tx = this.db.transaction(STORE_NAMES.GRAPH_NODES, 'readonly');
    const store = tx.objectStore(STORE_NAMES.GRAPH_NODES);
    const index = store.index(INDEX_NAMES.GRAPH_NODE_BY_TYPE);
    return awaitRequest<T[]>(index.getAll(IDBKeyRange.only(type)));
  }

  // ---- Read: edges ----

  async outEdges(fromId: string, type: EdgeType): Promise<AnyEdge[]> {
    return this.edgesByCompoundKey(INDEX_NAMES.GRAPH_EDGE_BY_FROM_TYPE, [fromId, type]);
  }

  async inEdges(toId: string, type: EdgeType): Promise<AnyEdge[]> {
    return this.edgesByCompoundKey(INDEX_NAMES.GRAPH_EDGE_BY_TO_TYPE, [toId, type]);
  }

  async outPoint(fromId: string, type: PointEdgeType): Promise<PointEdge[]> {
    const edges = await this.outEdges(fromId, type);
    return edges.filter((e): e is PointEdge => e.kind === 'point');
  }

  async outInterval(fromId: string, type: IntervalEdgeType): Promise<IntervalEdge[]> {
    const edges = await this.outEdges(fromId, type);
    return edges.filter((e): e is IntervalEdge => e.kind === 'interval');
  }

  async inPoint(toId: string, type: PointEdgeType): Promise<PointEdge[]> {
    const edges = await this.inEdges(toId, type);
    return edges.filter((e): e is PointEdge => e.kind === 'point');
  }

  async inInterval(toId: string, type: IntervalEdgeType): Promise<IntervalEdge[]> {
    const edges = await this.inEdges(toId, type);
    return edges.filter((e): e is IntervalEdge => e.kind === 'interval');
  }

  /**
   * All edges of a given type. Picks the temporal index that matches
   * the type's kind — point edges use (type, at_time), interval edges
   * use (type, valid_from).
   */
  async edgesOfType(type: EdgeType): Promise<AnyEdge[]> {
    const tx = this.db.transaction(STORE_NAMES.GRAPH_EDGES, 'readonly');
    const store = tx.objectStore(STORE_NAMES.GRAPH_EDGES);

    const indexName = isPointEdgeType(type)
      ? INDEX_NAMES.GRAPH_EDGE_BY_TYPE_AT_TIME
      : isIntervalEdgeType(type)
        ? INDEX_NAMES.GRAPH_EDGE_BY_TYPE_VALID_FROM
        : undefined;

    if (!indexName) {
      throw new Error(`Unknown edge type: ${type}`);
    }

    const index = store.index(indexName);
    const range = IDBKeyRange.bound([type, -Infinity], [type, Infinity]);
    return awaitRequest<AnyEdge[]>(index.getAll(range));
  }

  // ---- Read: Visit nodes by at_time range ----

  /**
   * Cursor over the `(type, at_time)` node index restricted to Visit
   * records with `at_time` in `[lower, upper]`. Direction 'asc' walks in
   * increasing at_time order, 'desc' in decreasing order. Nodes without
   * an `at_time` field are absent from the index and never appear.
   *
   * The query API (`src/database/graph/queries.ts`) needs this to walk
   * visits around a probe time without falling back to a full node-store
   * scan.
   */
  async visitsInAtTimeRange(
    lower: number,
    upper: number,
    direction: 'asc' | 'desc' = 'asc',
  ): Promise<VisitNode[]> {
    const tx = this.db.transaction(STORE_NAMES.GRAPH_NODES, 'readonly');
    const store = tx.objectStore(STORE_NAMES.GRAPH_NODES);
    const index = store.index(INDEX_NAMES.GRAPH_NODE_BY_TYPE_AT_TIME);
    const range = IDBKeyRange.bound(['Visit', lower], ['Visit', upper]);
    const cursorDirection: IDBCursorDirection = direction === 'asc' ? 'next' : 'prev';

    const results: VisitNode[] = [];
    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor(range, cursorDirection);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        results.push(cursor.value as VisitNode);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
    return results;
  }

  // ---- Identity lookups by named single-field index ----

  async nodeByPageUrl(normalizedUrl: string): Promise<AnyNode | undefined> {
    return this.firstByIndex(INDEX_NAMES.GRAPH_NODE_BY_PAGE_NORMALIZED_URL, normalizedUrl);
  }

  async nodeByDomainHostname(hostname: string): Promise<AnyNode | undefined> {
    return this.firstByIndex(INDEX_NAMES.GRAPH_NODE_BY_DOMAIN_HOSTNAME, hostname);
  }

  async nodeByTagSlug(slug: string): Promise<AnyNode | undefined> {
    return this.firstByIndex(INDEX_NAMES.GRAPH_NODE_BY_TAG_SLUG, slug);
  }

  async nodeByBrowserTabId(browserTabId: number): Promise<AnyNode | undefined> {
    return this.firstByIndex(INDEX_NAMES.GRAPH_NODE_BY_TAB_BROWSER_TAB_ID, browserTabId);
  }

  // ---- Debug ----

  async stats(): Promise<{ nodes: number; edges: number; nodesByType: Record<string, number> }> {
    const tx = this.db.transaction(
      [STORE_NAMES.GRAPH_NODES, STORE_NAMES.GRAPH_EDGES],
      'readonly',
    );
    const nodeStore = tx.objectStore(STORE_NAMES.GRAPH_NODES);
    const edgeStore = tx.objectStore(STORE_NAMES.GRAPH_EDGES);

    const [nodeCount, edgeCount, allNodes] = await Promise.all([
      awaitRequest<number>(nodeStore.count()),
      awaitRequest<number>(edgeStore.count()),
      awaitRequest<AnyNode[]>(nodeStore.getAll()),
    ]);

    const nodesByType: Record<string, number> = {};
    for (const node of allNodes) {
      nodesByType[node.type] = (nodesByType[node.type] ?? 0) + 1;
    }

    return { nodes: nodeCount, edges: edgeCount, nodesByType };
  }

  // ---- Private helpers ----

  private async edgesByCompoundKey(
    indexName: string,
    key: [string, EdgeType],
  ): Promise<AnyEdge[]> {
    const tx = this.db.transaction(STORE_NAMES.GRAPH_EDGES, 'readonly');
    const index = tx.objectStore(STORE_NAMES.GRAPH_EDGES).index(indexName);
    return awaitRequest<AnyEdge[]>(index.getAll(IDBKeyRange.only(key)));
  }

  private async firstByIndex(indexName: string, key: IDBValidKey): Promise<AnyNode | undefined> {
    const tx = this.db.transaction(STORE_NAMES.GRAPH_NODES, 'readonly');
    const index = tx.objectStore(STORE_NAMES.GRAPH_NODES).index(indexName);
    const value = await awaitRequest<AnyNode | undefined>(index.get(key));
    return value ?? undefined;
  }
}

// ---- IDB async plumbing ----

function awaitRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function awaitTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IDB transaction aborted'));
    tx.onerror = () => reject(tx.error);
  });
}
