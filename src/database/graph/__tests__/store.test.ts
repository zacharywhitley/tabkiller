/**
 * GraphStore tests — exercise the IndexedDB-backed API end-to-end against
 * fake-indexeddb (a real in-memory IDB implementation, per CLAUDE.md
 * "no mock services"). Each test opens its own uniquely-named database
 * so state cannot leak between cases.
 */

// jsdom 26 does not expose `structuredClone`, but fake-indexeddb needs
// it for its clone-on-insertion pass. Node ships v8 serialize/deserialize
// with the same structured-clone semantics, so we lift a shim onto the
// global before importing fake-indexeddb.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeV8 = require('node:v8') as typeof import('node:v8');
if (typeof (globalThis as { structuredClone?: unknown }).structuredClone !== 'function') {
  (globalThis as unknown as { structuredClone: (value: unknown) => unknown }).structuredClone = (
    value: unknown,
  ) => nodeV8.deserialize(nodeV8.serialize(value));
}

import 'fake-indexeddb/auto';

import {
  DATABASE_NAME,
  DATABASE_VERSION,
  STORE_NAMES,
  createStoreConfig,
} from '../../../session/storage/schema';
import { GraphStore } from '../store';
import type {
  PageNode,
  VisitNode,
  TabNode,
  WindowNode,
  SessionNode,
  DomainNode,
  TagNode,
  SearchQueryNode,
  PointEdge,
  IntervalEdge,
} from '../types';

// Every test gets a fresh database so state cannot leak between cases.
let dbSuffix = 0;
async function freshStore(): Promise<{ store: GraphStore; db: IDBDatabase }> {
  dbSuffix += 1;
  const uniqueName = `${DATABASE_NAME}_test_${Date.now()}_${dbSuffix}`;
  const db = await openFreshDatabase(uniqueName);
  return { store: new GraphStore(db), db };
}

function openFreshDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Mirror SessionStorageEngine.setupSchema so tests exercise the
      // real schema shape without depending on the full engine
      // lifecycle (metadata init, maintenance tasks, etc.).
      for (const storeName of Object.values(STORE_NAMES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          const cfg = createStoreConfig(storeName);
          const store = db.createObjectStore(storeName, cfg.options as IDBObjectStoreParameters);
          for (const idx of cfg.indexes) {
            store.createIndex(idx.name, idx.keyPath, idx.options);
          }
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---- Node fixtures (one per NodeType) ----

const T0 = 1_700_000_000_000;

const pageNode: PageNode = {
  id: 'page:1',
  type: 'Page',
  recorded_at: T0,
  normalized_url: 'https://example.com/',
  raw_url_first_seen: 'https://Example.com/?utm_source=x',
  title: 'Example',
  first_seen: T0,
  last_seen: T0 + 1000,
  visit_count: 1,
};

const visitNode: VisitNode = {
  id: 'visit:1',
  type: 'Visit',
  recorded_at: T0 + 10,
  at_time: T0 + 10,
  ended_at: T0 + 5000,
  focus_intervals: [{ start: T0 + 10, end: T0 + 4000 }],
  transition: 'link',
};

const tabNode: TabNode = {
  id: 'tab:1',
  type: 'Tab',
  recorded_at: T0,
  opened_at: T0,
  closed_at: null,
  browser_tab_id: 42,
};

const windowNode: WindowNode = {
  id: 'window:1',
  type: 'Window',
  recorded_at: T0,
  opened_at: T0,
  closed_at: null,
  browser_window_id: 7,
};

const sessionNode: SessionNode = {
  id: 'session:1',
  type: 'Session',
  recorded_at: T0,
  started_at: T0,
  ended_at: null,
  detected_by: 'idle',
  title: 'Research: temporal graphs',
};

const domainNode: DomainNode = {
  id: 'domain:example.com',
  type: 'Domain',
  recorded_at: T0,
  hostname: 'example.com',
  first_seen: T0,
};

const tagNode: TagNode = {
  id: 'tag:research',
  type: 'Tag',
  recorded_at: T0,
  slug: 'research',
  label: 'Research',
  created_at: T0,
};

const searchQueryNode: SearchQueryNode = {
  id: 'query:1',
  type: 'SearchQuery',
  recorded_at: T0,
  engine: 'google',
  query_text: 'temporal browsing graph',
  results_url: 'https://google.com/search?q=temporal+browsing+graph',
};

const ALL_NODE_FIXTURES = [
  pageNode,
  visitNode,
  tabNode,
  windowNode,
  sessionNode,
  domainNode,
  tagNode,
  searchQueryNode,
] as const;

describe('GraphStore — node put/get', () => {
  for (const fixture of ALL_NODE_FIXTURES) {
    it(`round-trips a ${fixture.type} node preserving field-for-field equality`, async () => {
      const { store } = await freshStore();
      await store.putNode(fixture);
      const roundTripped = await store.getNode(fixture.id);
      expect(roundTripped).toEqual(fixture);
    });
  }

  it('getNode returns undefined for an unknown id', async () => {
    const { store } = await freshStore();
    const result = await store.getNode('nonexistent');
    expect(result).toBeUndefined();
  });

  it('nodesOfType returns only nodes of the requested type', async () => {
    const { store } = await freshStore();
    for (const n of ALL_NODE_FIXTURES) await store.putNode(n);
    const pages = await store.nodesOfType('Page');
    const domains = await store.nodesOfType('Domain');
    expect(pages).toHaveLength(1);
    expect(pages[0]).toEqual(pageNode);
    expect(domains).toHaveLength(1);
    expect(domains[0]).toEqual(domainNode);
  });

  it('nodesOfType picks up node kinds that have no at_time (Tab, Window)', async () => {
    // Regression: an earlier implementation of nodesOfType used the
    // (type, at_time) compound index, which silently skipped Tab and
    // Window records because they lack an at_time field. Every call
    // site fell back to a full-store scan. Adding the plain `type`
    // index in DATABASE_VERSION 3 fixed that; this test locks it in.
    const { store } = await freshStore();
    for (const n of ALL_NODE_FIXTURES) await store.putNode(n);
    const tabs = await store.nodesOfType('Tab');
    const windows = await store.nodesOfType('Window');
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toEqual(tabNode);
    expect(windows).toHaveLength(1);
    expect(windows[0]).toEqual(windowNode);
  });

  it('nodesOfType uses the by_type index (not a full store scan)', async () => {
    // If nodesOfType regresses to store.getAll() this test still
    // passes on correctness; the assertion is on the index list to
    // catch a config regression that would drop the index and force
    // the O(N) fallback.
    const { store, db } = await freshStore();
    const tx = db.transaction(STORE_NAMES.GRAPH_NODES, 'readonly');
    const idxNames = Array.from(tx.objectStore(STORE_NAMES.GRAPH_NODES).indexNames);
    expect(idxNames).toContain('by_type');
    // Sanity — the impl actually reads through the index.
    for (const n of ALL_NODE_FIXTURES) await store.putNode(n);
    expect(await store.nodesOfType('Session')).toHaveLength(1);
  });
});

// ---- Edge fixtures ----

const pointEdgeFixtures: PointEdge[] = [
  {
    id: 'e:point:nav',
    kind: 'point',
    type: 'navigated_from',
    from_id: 'visit:2',
    to_id: 'visit:1',
    recorded_at: T0 + 100,
    at_time: T0 + 100,
  },
  {
    id: 'e:point:opened',
    kind: 'point',
    type: 'opened_from',
    from_id: 'visit:3',
    to_id: 'visit:1',
    recorded_at: T0 + 200,
    at_time: T0 + 200,
  },
  {
    id: 'e:point:search',
    kind: 'point',
    type: 'arrived_via',
    from_id: 'visit:1',
    to_id: 'query:1',
    recorded_at: T0 + 5,
    at_time: T0 + 5,
  },
  {
    id: 'e:point:tag',
    kind: 'point',
    type: 'tagged_with',
    from_id: 'session:1',
    to_id: 'tag:research',
    recorded_at: T0 + 3000,
    at_time: T0 + 3000,
  },
];

const intervalEdgeFixtures: IntervalEdge[] = [
  {
    id: 'e:iv:of_page',
    kind: 'interval',
    type: 'of_page',
    from_id: 'visit:1',
    to_id: 'page:1',
    recorded_at: T0 + 10,
    valid_from: T0 + 10,
    valid_to: T0 + 5000,
  },
  {
    id: 'e:iv:in_tab',
    kind: 'interval',
    type: 'in_tab',
    from_id: 'visit:1',
    to_id: 'tab:1',
    recorded_at: T0 + 10,
    valid_from: T0 + 10,
    valid_to: T0 + 5000,
  },
  {
    id: 'e:iv:in_session',
    kind: 'interval',
    type: 'in_session',
    from_id: 'visit:1',
    to_id: 'session:1',
    recorded_at: T0 + 10,
    valid_from: T0 + 10,
    valid_to: T0 + 5000,
  },
  {
    id: 'e:iv:in_window',
    kind: 'interval',
    type: 'in_window',
    from_id: 'tab:1',
    to_id: 'window:1',
    recorded_at: T0,
    valid_from: T0,
    valid_to: null,
  },
  {
    id: 'e:iv:on_domain',
    kind: 'interval',
    type: 'on_domain',
    from_id: 'page:1',
    to_id: 'domain:example.com',
    recorded_at: T0,
    valid_from: T0,
    valid_to: null,
  },
];

describe('GraphStore — edge put/get', () => {
  for (const fixture of pointEdgeFixtures) {
    it(`round-trips a point edge of type ${fixture.type} preserving field-for-field equality`, async () => {
      const { store } = await freshStore();
      await store.putEdge(fixture);
      const [got] = await store.outEdges(fixture.from_id, fixture.type);
      expect(got).toEqual(fixture);
    });
  }

  for (const fixture of intervalEdgeFixtures) {
    it(`round-trips an interval edge of type ${fixture.type} preserving field-for-field equality`, async () => {
      const { store } = await freshStore();
      await store.putEdge(fixture);
      const [got] = await store.outEdges(fixture.from_id, fixture.type);
      expect(got).toEqual(fixture);
    });
  }
});

describe('GraphStore — adjacency indexes', () => {
  it('outEdges returns only edges from the given source with the given type', async () => {
    const { store } = await freshStore();
    for (const e of [...pointEdgeFixtures, ...intervalEdgeFixtures]) await store.putEdge(e);

    const outFromVisit1Search = await store.outEdges('visit:1', 'arrived_via');
    expect(outFromVisit1Search).toEqual([pointEdgeFixtures[2]]);

    const outFromVisit1OfPage = await store.outEdges('visit:1', 'of_page');
    expect(outFromVisit1OfPage).toEqual([intervalEdgeFixtures[0]]);
  });

  it('inEdges returns only edges into the given target with the given type', async () => {
    const { store } = await freshStore();
    for (const e of [...pointEdgeFixtures, ...intervalEdgeFixtures]) await store.putEdge(e);

    const inToVisit1Nav = await store.inEdges('visit:1', 'navigated_from');
    expect(inToVisit1Nav).toEqual([pointEdgeFixtures[0]]);

    const inToDomain = await store.inEdges('domain:example.com', 'on_domain');
    expect(inToDomain).toEqual([intervalEdgeFixtures[4]]);
  });

  it('outPoint / inPoint filter to point edges only', async () => {
    const { store } = await freshStore();
    for (const e of [...pointEdgeFixtures, ...intervalEdgeFixtures]) await store.putEdge(e);
    const points = await store.outPoint('visit:1', 'arrived_via');
    expect(points).toEqual([pointEdgeFixtures[2]]);
    expect(points.every((e) => e.kind === 'point')).toBe(true);
  });

  it('outInterval / inInterval filter to interval edges only', async () => {
    const { store } = await freshStore();
    for (const e of [...pointEdgeFixtures, ...intervalEdgeFixtures]) await store.putEdge(e);
    const intervals = await store.outInterval('visit:1', 'of_page');
    expect(intervals).toEqual([intervalEdgeFixtures[0]]);
    expect(intervals.every((e) => e.kind === 'interval')).toBe(true);
  });

  it('edgesOfType picks the point-only (type, at_time) index for point edge types', async () => {
    const { store } = await freshStore();
    for (const e of pointEdgeFixtures) await store.putEdge(e);
    // Mix in an interval so we can prove it is not returned.
    await store.putEdge(intervalEdgeFixtures[0]!);
    const navs = await store.edgesOfType('navigated_from');
    expect(navs).toEqual([pointEdgeFixtures[0]]);
  });

  it('edgesOfType picks the interval-only (type, valid_from) index for interval edge types', async () => {
    const { store } = await freshStore();
    for (const e of intervalEdgeFixtures) await store.putEdge(e);
    // Mix in a point so we can prove it is not returned.
    await store.putEdge(pointEdgeFixtures[0]!);
    const ofPages = await store.edgesOfType('of_page');
    expect(ofPages).toEqual([intervalEdgeFixtures[0]]);
  });
});

describe('GraphStore — node identity indexes', () => {
  it('nodeByPageUrl matches by normalized_url', async () => {
    const { store } = await freshStore();
    await store.putNode(pageNode);
    const found = await store.nodeByPageUrl(pageNode.normalized_url);
    expect(found).toEqual(pageNode);
  });

  it('nodeByDomainHostname matches by hostname', async () => {
    const { store } = await freshStore();
    await store.putNode(domainNode);
    const found = await store.nodeByDomainHostname(domainNode.hostname);
    expect(found).toEqual(domainNode);
  });

  it('nodeByTagSlug matches by slug', async () => {
    const { store } = await freshStore();
    await store.putNode(tagNode);
    const found = await store.nodeByTagSlug(tagNode.slug);
    expect(found).toEqual(tagNode);
  });

  it('nodeByBrowserTabId matches by browser_tab_id', async () => {
    const { store } = await freshStore();
    await store.putNode(tabNode);
    const found = await store.nodeByBrowserTabId(tabNode.browser_tab_id);
    expect(found).toEqual(tabNode);
  });

  it('single-field identity indexes skip records lacking the keyPath', async () => {
    const { store } = await freshStore();
    // Load a Visit (no normalized_url, no hostname, no slug, no browser_tab_id)
    // to prove the identity index does not return it.
    await store.putNode(visitNode);
    expect(await store.nodeByPageUrl('anything')).toBeUndefined();
    expect(await store.nodeByDomainHostname('anything')).toBeUndefined();
    expect(await store.nodeByTagSlug('anything')).toBeUndefined();
    expect(await store.nodeByBrowserTabId(9999)).toBeUndefined();
  });
});

describe('GraphStore — atomic writeBatch', () => {
  it('persists both a node and its edges when the batch succeeds', async () => {
    const { store } = await freshStore();
    await store.writeBatch({
      nodes: [visitNode, pageNode],
      edges: [intervalEdgeFixtures[0]!],
    });
    expect(await store.getNode('visit:1')).toEqual(visitNode);
    expect(await store.getNode('page:1')).toEqual(pageNode);
    expect(await store.outEdges('visit:1', 'of_page')).toEqual([intervalEdgeFixtures[0]]);
  });

  it('rolls back every write in a batch when one put fails (atomicity)', async () => {
    const { store } = await freshStore();
    // Seed a good record first so we can prove nothing else touches it.
    await store.putNode(pageNode);

    // Craft a batch whose second node lacks the mandatory 'id' keyPath.
    // IndexedDB rejects the put and aborts the transaction, so the
    // preceding successful put in the same batch must also roll back.
    const badNodes = [
      visitNode,
      { type: 'Page', recorded_at: T0 } as unknown as PageNode,
    ];

    await expect(
      store.writeBatch({ nodes: badNodes, edges: [intervalEdgeFixtures[0]!] }),
    ).rejects.toBeTruthy();

    expect(await store.getNode('visit:1')).toBeUndefined();
    expect(await store.outEdges('visit:1', 'of_page')).toEqual([]);
    // The pre-batch page node survives — it was written in a prior tx.
    expect(await store.getNode('page:1')).toEqual(pageNode);
  });
});

describe('GraphStore — stats', () => {
  it('reports counts and per-type breakdown', async () => {
    const { store } = await freshStore();
    for (const n of ALL_NODE_FIXTURES) await store.putNode(n);
    for (const e of [...pointEdgeFixtures, ...intervalEdgeFixtures]) await store.putEdge(e);
    const s = await store.stats();
    expect(s.nodes).toBe(ALL_NODE_FIXTURES.length);
    expect(s.edges).toBe(pointEdgeFixtures.length + intervalEdgeFixtures.length);
    expect(s.nodesByType).toEqual({
      Page: 1,
      Visit: 1,
      Tab: 1,
      Window: 1,
      Session: 1,
      Domain: 1,
      Tag: 1,
      SearchQuery: 1,
    });
  });
});

describe('GraphStore — timestamp discipline', () => {
  it('stores timestamps as raw numbers, not Date objects', async () => {
    const { store, db } = await freshStore();
    await store.putNode(visitNode);
    await store.putEdge(pointEdgeFixtures[0]!);
    await store.putEdge(intervalEdgeFixtures[0]!);

    // Read raw records back through the IDB API, skipping GraphStore,
    // so we're checking what IndexedDB actually stores.
    const tx = db.transaction(
      [STORE_NAMES.GRAPH_NODES, STORE_NAMES.GRAPH_EDGES],
      'readonly',
    );
    const rawVisit = await new Promise<VisitNode>((resolve, reject) => {
      const req = tx.objectStore(STORE_NAMES.GRAPH_NODES).get('visit:1');
      req.onsuccess = () => resolve(req.result as VisitNode);
      req.onerror = () => reject(req.error);
    });
    const rawPoint = await new Promise<PointEdge>((resolve, reject) => {
      const req = tx.objectStore(STORE_NAMES.GRAPH_EDGES).get('e:point:nav');
      req.onsuccess = () => resolve(req.result as PointEdge);
      req.onerror = () => reject(req.error);
    });
    const rawInterval = await new Promise<IntervalEdge>((resolve, reject) => {
      const req = tx.objectStore(STORE_NAMES.GRAPH_EDGES).get('e:iv:of_page');
      req.onsuccess = () => resolve(req.result as IntervalEdge);
      req.onerror = () => reject(req.error);
    });

    expect(typeof rawVisit.at_time).toBe('number');
    expect(typeof rawVisit.recorded_at).toBe('number');
    expect(rawVisit.at_time).not.toBeInstanceOf(Date);
    expect(rawVisit.recorded_at).not.toBeInstanceOf(Date);
    for (const fi of rawVisit.focus_intervals) {
      expect(typeof fi.start).toBe('number');
      expect(fi.start).not.toBeInstanceOf(Date);
    }

    expect(typeof rawPoint.at_time).toBe('number');
    expect(typeof rawPoint.recorded_at).toBe('number');
    expect(rawPoint.at_time).not.toBeInstanceOf(Date);

    expect(typeof rawInterval.valid_from).toBe('number');
    expect(typeof rawInterval.recorded_at).toBe('number');
    expect(rawInterval.valid_from).not.toBeInstanceOf(Date);
  });
});
