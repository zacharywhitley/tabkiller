// In-memory graph store — the analogue of the two IndexedDB object stores
// described in the schema proposal. Two collections plus the four indexes
// a real IDB implementation would create:
//
//   nodes                    Map<id, AnyNode>
//   nodes_by_type            Map<NodeType, Set<id>>
//   edges                    Map<id, AnyEdge>
//   edges_by_from[type]      Map<from_id, Map<edge_type, Set<edge_id>>>
//   edges_by_to[type]        Map<to_id,   Map<edge_type, Set<edge_id>>>
//
// Everything else is application code.

import type {
  AnyNode,
  AnyEdge,
  NodeType,
  EdgeType,
  PointEdge,
  IntervalEdge,
  PointEdgeType,
  IntervalEdgeType,
} from './types.js';

export class GraphStore {
  private nodes = new Map<string, AnyNode>();
  private nodesByType = new Map<NodeType, Set<string>>();
  private edges = new Map<string, AnyEdge>();
  private edgesByFrom = new Map<string, Map<EdgeType, Set<string>>>();
  private edgesByTo = new Map<string, Map<EdgeType, Set<string>>>();

  // ---- Write ----

  putNode(node: AnyNode): void {
    this.nodes.set(node.id, node);
    let set = this.nodesByType.get(node.type);
    if (!set) {
      set = new Set();
      this.nodesByType.set(node.type, set);
    }
    set.add(node.id);
  }

  putEdge(edge: AnyEdge): void {
    this.edges.set(edge.id, edge);
    this.addToIndex(this.edgesByFrom, edge.from_id, edge.type, edge.id);
    this.addToIndex(this.edgesByTo, edge.to_id, edge.type, edge.id);
  }

  private addToIndex(
    idx: Map<string, Map<EdgeType, Set<string>>>,
    key: string,
    edgeType: EdgeType,
    edgeId: string,
  ): void {
    let byType = idx.get(key);
    if (!byType) {
      byType = new Map();
      idx.set(key, byType);
    }
    let set = byType.get(edgeType);
    if (!set) {
      set = new Set();
      byType.set(edgeType, set);
    }
    set.add(edgeId);
  }

  // ---- Read: nodes ----

  getNode<T extends AnyNode>(id: string): T | undefined {
    return this.nodes.get(id) as T | undefined;
  }

  nodesOfType<T extends AnyNode>(type: NodeType): T[] {
    const ids = this.nodesByType.get(type);
    if (!ids) return [];
    const out: T[] = [];
    for (const id of ids) out.push(this.nodes.get(id) as T);
    return out;
  }

  // ---- Read: edges ----

  outEdges(fromId: string, type: EdgeType): AnyEdge[] {
    const ids = this.edgesByFrom.get(fromId)?.get(type);
    if (!ids) return [];
    return this.collect(ids);
  }

  inEdges(toId: string, type: EdgeType): AnyEdge[] {
    const ids = this.edgesByTo.get(toId)?.get(type);
    if (!ids) return [];
    return this.collect(ids);
  }

  outPoint(fromId: string, type: PointEdgeType): PointEdge[] {
    return this.outEdges(fromId, type).filter(
      (e): e is PointEdge => e.kind === 'point',
    );
  }

  outInterval(fromId: string, type: IntervalEdgeType): IntervalEdge[] {
    return this.outEdges(fromId, type).filter(
      (e): e is IntervalEdge => e.kind === 'interval',
    );
  }

  inPoint(toId: string, type: PointEdgeType): PointEdge[] {
    return this.inEdges(toId, type).filter(
      (e): e is PointEdge => e.kind === 'point',
    );
  }

  inInterval(toId: string, type: IntervalEdgeType): IntervalEdge[] {
    return this.inEdges(toId, type).filter(
      (e): e is IntervalEdge => e.kind === 'interval',
    );
  }

  edgesOfType(type: EdgeType): AnyEdge[] {
    const out: AnyEdge[] = [];
    for (const e of this.edges.values()) {
      if (e.type === type) out.push(e);
    }
    return out;
  }

  private collect(ids: Set<string>): AnyEdge[] {
    const out: AnyEdge[] = [];
    for (const id of ids) {
      const e = this.edges.get(id);
      if (e) out.push(e);
    }
    return out;
  }

  // ---- Debug ----

  stats() {
    return {
      nodes: this.nodes.size,
      edges: this.edges.size,
      nodesByType: Object.fromEntries(
        [...this.nodesByType.entries()].map(([t, s]) => [t, s.size]),
      ),
    };
  }
}
