/**
 * End-to-end drain test for the graph ingest pipeline.
 *
 * These tests wire a real GraphStore (against fake-indexeddb per the
 * CLAUDE.md "no mocks" rule) to a hand-rolled LocalEventStore double
 * that exposes just the drain-facing API the ingest depends on. Then
 * we seed the outbox with plain event fixtures, run drain, and assert
 * the graph store's state.
 *
 * Coverage:
 *   - happy-path: nav_committed → Visit/Page/Domain/of_page/in_tab/on_domain
 *   - atomicity: a transformer that throws leaves no partial writes for
 *     that event AND still processes subsequent events on next drain
 *   - idempotency: draining the same batch twice does not create dupes
 *   - alarm route: runAlarm() and drain() converge on the same code path
 */

// jsdom-26 does not ship structuredClone; fake-indexeddb needs it for
// its clone-on-insertion pass. Lift a node:v8-based shim onto the global
// before importing fake-indexeddb.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeV8 = require('node:v8') as typeof import('node:v8');
if (typeof (globalThis as { structuredClone?: unknown }).structuredClone !== 'function') {
  (globalThis as unknown as { structuredClone: (v: unknown) => unknown }).structuredClone = (v) =>
    nodeV8.deserialize(nodeV8.serialize(v));
}

import 'fake-indexeddb/auto';

import {
  DATABASE_NAME,
  DATABASE_VERSION,
  STORE_NAMES,
  createStoreConfig,
} from '../../../session/storage/schema';
import { GraphStore } from '../store';
import { GraphIngest } from '../ingest';
import { pageNodeId, visitNodeId } from '../transformers';
import type { BrowsingEvent } from '../../../shared/types';
import type { PageNode, VisitNode } from '../types';

// ---- Outbox double ----
//
// Structural stand-in for LocalEventStore that only exposes the two
// methods the ingest reads. We deliberately do NOT use the real class
// here: its persistence side-effects would drag in the storage utility
// (which needs the whole browser mock harness) and dilute what these
// tests are asserting — which is graph-side correctness, not outbox
// persistence. The outbox contract itself is small and stable enough
// that a hand-rolled double is safer than a hidden dependency.

class FakeOutbox {
  private eventsByBatch = new Map<string, BrowsingEvent[]>();
  private drained = new Set<string>();
  private batchOrder: string[] = [];

  push(batchId: string, events: BrowsingEvent[]): void {
    if (!this.eventsByBatch.has(batchId)) {
      this.eventsByBatch.set(batchId, []);
      this.batchOrder.push(batchId);
    }
    this.eventsByBatch.get(batchId)!.push(...events);
  }

  async pendingBatches(): Promise<Array<{ batchId: string; events: BrowsingEvent[] }>> {
    const result: Array<{ batchId: string; events: BrowsingEvent[] }> = [];
    for (const batchId of this.batchOrder) {
      const events = (this.eventsByBatch.get(batchId) ?? []).filter((e) => !this.drained.has(e.id));
      if (events.length > 0) result.push({ batchId, events });
    }
    return result;
  }

  async markDrained(eventIds: readonly string[]): Promise<void> {
    for (const id of eventIds) this.drained.add(id);
  }

  drainedIds(): Set<string> {
    return new Set(this.drained);
  }
}

// ---- Fresh DB helper ----

let dbSuffix = 0;
async function freshGraph(): Promise<GraphStore> {
  dbSuffix += 1;
  const name = `${DATABASE_NAME}_ingest_test_${Date.now()}_${dbSuffix}`;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, DATABASE_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const store of Object.values(STORE_NAMES)) {
        if (!d.objectStoreNames.contains(store)) {
          const cfg = createStoreConfig(store);
          const s = d.createObjectStore(store, cfg.options as IDBObjectStoreParameters);
          for (const idx of cfg.indexes) s.createIndex(idx.name, idx.keyPath, idx.options);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return new GraphStore(db);
}

function makeEvent(overrides: Partial<BrowsingEvent> & { id: string; type: BrowsingEvent['type']; timestamp: number }): BrowsingEvent {
  return {
    id: overrides.id,
    type: overrides.type,
    timestamp: overrides.timestamp,
    sessionId: overrides.sessionId ?? '',
    metadata: overrides.metadata ?? {},
    ...overrides,
  };
}

// ---- Tests ----

describe('GraphIngest.drain — happy path', () => {
  it('processes a tab_created followed by a navigation_committed and produces the expected graph', async () => {
    const graph = await freshGraph();
    const outbox = new FakeOutbox();

    outbox.push('b1', [
      makeEvent({
        id: 'tabc_1',
        type: 'tab_created',
        timestamp: 1000,
        tabId: 42,
        windowId: 7,
      }),
      makeEvent({
        id: 'nav_1',
        type: 'navigation_committed',
        timestamp: 1500,
        tabId: 42,
        url: 'https://example.com/article',
        title: 'Article',
        metadata: { transitionType: 'typed' },
      }),
    ]);

    const ingest = new GraphIngest({ outbox: outbox as any, graph });
    await ingest.drain();

    const stats = await graph.stats();
    // Expected nodes: Tab, Window, Domain, Page, Visit.
    expect(stats.nodesByType.Tab).toBe(1);
    expect(stats.nodesByType.Window).toBe(1);
    expect(stats.nodesByType.Domain).toBe(1);
    expect(stats.nodesByType.Page).toBe(1);
    expect(stats.nodesByType.Visit).toBe(1);

    // The Page should carry the normalized URL and visit_count 1.
    const page = await graph.getNode<PageNode>(pageNodeId('https://example.com/article'));
    expect(page).toBeDefined();
    expect(page!.normalized_url).toBe('https://example.com/article');
    expect(page!.visit_count).toBe(1);

    // Visit should be present with expected transition.
    const visit = await graph.getNode<VisitNode>(visitNodeId('nav_1'));
    expect(visit).toBeDefined();
    expect(visit!.transition).toBe('typed');

    // in_tab, of_page, on_domain, in_window edges all present.
    const inTab = await graph.edgesOfType('in_tab');
    expect(inTab).toHaveLength(1);
    const ofPage = await graph.edgesOfType('of_page');
    expect(ofPage).toHaveLength(1);
    const onDomain = await graph.edgesOfType('on_domain');
    expect(onDomain).toHaveLength(1);
    const inWindow = await graph.edgesOfType('in_window');
    expect(inWindow).toHaveLength(1);

    // Both source events were marked drained.
    expect(outbox.drainedIds().has('tabc_1')).toBe(true);
    expect(outbox.drainedIds().has('nav_1')).toBe(true);
  });

  it('emits navigated_from between two navigations on the same tab', async () => {
    const graph = await freshGraph();
    const outbox = new FakeOutbox();

    outbox.push('b1', [
      makeEvent({
        id: 'tabc_1', type: 'tab_created', timestamp: 1000, tabId: 42, windowId: 7,
      }),
      makeEvent({
        id: 'nav_1', type: 'navigation_committed', timestamp: 1500,
        tabId: 42, url: 'https://a.example/',
      }),
      makeEvent({
        id: 'nav_2', type: 'navigation_committed', timestamp: 2000,
        tabId: 42, url: 'https://b.example/',
      }),
    ]);

    const ingest = new GraphIngest({ outbox: outbox as any, graph });
    await ingest.drain();

    const navigatedFrom = await graph.edgesOfType('navigated_from');
    expect(navigatedFrom).toHaveLength(1);
    expect(navigatedFrom[0].from_id).toBe(visitNodeId('nav_2'));
    expect(navigatedFrom[0].to_id).toBe(visitNodeId('nav_1'));

    // Prior visit should be closed (ended_at set).
    const prior = await graph.getNode<VisitNode>(visitNodeId('nav_1'));
    expect(prior!.ended_at).toBe(2000);
  });

  it('opens a focus interval on the target visit when focus_transition arrives after navigation', async () => {
    const graph = await freshGraph();
    const outbox = new FakeOutbox();

    outbox.push('b1', [
      makeEvent({ id: 'tabc_1', type: 'tab_created', timestamp: 1000, tabId: 42, windowId: 7 }),
      makeEvent({
        id: 'nav_1', type: 'navigation_committed', timestamp: 1500,
        tabId: 42, url: 'https://a.example/',
      }),
      makeEvent({
        id: 'focus_1', type: 'focus_transition', timestamp: 2000,
        metadata: { focused_visit: visitNodeId('nav_1') },
      }),
    ]);

    const ingest = new GraphIngest({ outbox: outbox as any, graph });
    await ingest.drain();

    const visit = await graph.getNode<VisitNode>(visitNodeId('nav_1'));
    expect(visit!.focus_intervals).toEqual([{ start: 2000, end: null }]);
  });

  it('emits arrived_via when a search-results navigation is followed by a result click in the same tab', async () => {
    const graph = await freshGraph();
    const outbox = new FakeOutbox();

    outbox.push('b1', [
      makeEvent({ id: 'tabc_1', type: 'tab_created', timestamp: 1000, tabId: 42, windowId: 7 }),
      makeEvent({
        id: 'nav_search', type: 'navigation_committed', timestamp: 1500,
        tabId: 42, url: 'https://google.com/search?q=temporal+graph',
      }),
      makeEvent({
        id: 'nav_click', type: 'navigation_committed', timestamp: 2000,
        tabId: 42, url: 'https://result.example/article',
      }),
    ]);

    const ingest = new GraphIngest({ outbox: outbox as any, graph });
    await ingest.drain();

    const arrivedVia = await graph.edgesOfType('arrived_via');
    expect(arrivedVia).toHaveLength(1);
    expect(arrivedVia[0].from_id).toBe(visitNodeId('nav_click'));
    // The to_id is a SearchQuery node — verify it exists.
    const target = await graph.getNode(arrivedVia[0].to_id);
    expect(target?.type).toBe('SearchQuery');
  });

  it('emits opened_from when a child tab is created with an openerVisitId and then navigates', async () => {
    const graph = await freshGraph();
    const outbox = new FakeOutbox();

    outbox.push('b1', [
      makeEvent({ id: 'tabc_parent', type: 'tab_created', timestamp: 500, tabId: 1, windowId: 7 }),
      makeEvent({
        id: 'nav_parent', type: 'navigation_committed', timestamp: 600,
        tabId: 1, url: 'https://parent.example/',
      }),
      // Child tab opened with reference to parent's visit.
      makeEvent({
        id: 'tabc_child', type: 'tab_created', timestamp: 1000, tabId: 2, windowId: 7,
        metadata: { openerVisitId: visitNodeId('nav_parent') },
      }),
      // First navigation on the child tab.
      makeEvent({
        id: 'nav_child', type: 'navigation_committed', timestamp: 1500,
        tabId: 2, url: 'https://child.example/',
      }),
    ]);

    const ingest = new GraphIngest({ outbox: outbox as any, graph });
    await ingest.drain();

    const openedFrom = await graph.edgesOfType('opened_from');
    expect(openedFrom).toHaveLength(1);
    expect(openedFrom[0].from_id).toBe(visitNodeId('nav_child'));
    expect(openedFrom[0].to_id).toBe(visitNodeId('nav_parent'));
  });
});

describe('GraphIngest.drain — focus buffer (capture-completeness Gap 2)', () => {
  it('buffers a focus_transition whose focused_visit is not yet in the graph, then drains against the next Visit created for that tab', async () => {
    const graph = await freshGraph();
    const outbox = new FakeOutbox();

    // The focus_transition references visit_predicted, which never
    // materializes as its own outbox event — simulating the race where
    // the SW's local tab→visit map advanced ahead of the outbox drain.
    // The follow-up navigation_committed then defines the actual Visit,
    // and the buffered focus event should re-issue against it.
    outbox.push('b1', [
      makeEvent({ id: 'tabc_1', type: 'tab_created', timestamp: 1000, tabId: 42, windowId: 7 }),
      makeEvent({
        id: 'focus_early', type: 'focus_transition', timestamp: 1400,
        tabId: 42,
        metadata: {
          focused_visit: visitNodeId('nav_predicted_but_never_appended'),
          browserTabId: 42,
        },
      }),
      makeEvent({
        id: 'nav_actual', type: 'navigation_committed', timestamp: 1500,
        tabId: 42, url: 'https://example.com/',
      }),
    ]);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const ingest = new GraphIngest({ outbox: outbox as any, graph });
      await ingest.drain();
    } finally {
      warnSpy.mockRestore();
    }

    // The Visit that was ultimately created for tab 42 must have picked
    // up the buffered focus event's timestamp on its focus_intervals —
    // NOT the timestamp of a hypothetical replay at drain time.
    const visit = await graph.getNode<VisitNode>(visitNodeId('nav_actual'));
    expect(visit).toBeDefined();
    expect(visit!.focus_intervals).toEqual([{ start: 1400, end: null }]);

    // The focus event should NOT have produced a "visit not in graph"
    // warning — that's the whole point of the buffer.
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('focus_transition incoming visit not in graph'),
      expect.anything(),
    );

    // Both events are drained (the buffered focus event still gets
    // marked drained because applyEvent returned normally after
    // buffering — it's the outbox's responsibility to not replay).
    expect(outbox.drainedIds().has('focus_early')).toBe(true);
    expect(outbox.drainedIds().has('nav_actual')).toBe(true);
  });

  it('processes a focus_transition normally when its focused_visit is already in the graph', async () => {
    const graph = await freshGraph();
    const outbox = new FakeOutbox();

    // Two batches so the Visit is definitely committed before the focus
    // event runs. Focus event references the real Visit id — no buffer
    // path exercised — and the focus_intervals should reflect that.
    outbox.push('b1', [
      makeEvent({ id: 'tabc_1', type: 'tab_created', timestamp: 1000, tabId: 42, windowId: 7 }),
      makeEvent({
        id: 'nav_1', type: 'navigation_committed', timestamp: 1500,
        tabId: 42, url: 'https://a.example/',
      }),
    ]);
    const ingest = new GraphIngest({ outbox: outbox as any, graph });
    await ingest.drain();

    outbox.push('b2', [
      makeEvent({
        id: 'focus_1', type: 'focus_transition', timestamp: 2000,
        tabId: 42,
        metadata: {
          focused_visit: visitNodeId('nav_1'),
          browserTabId: 42,
        },
      }),
    ]);
    await ingest.drain();

    const visit = await graph.getNode<VisitNode>(visitNodeId('nav_1'));
    expect(visit!.focus_intervals).toEqual([{ start: 2000, end: null }]);
  });
});

describe('GraphIngest.drain — atomicity', () => {
  it('a failing transformer leaves no partial writes for that event and lets later events still process', async () => {
    const graph = await freshGraph();
    const outbox = new FakeOutbox();

    // The bad event: navigation_committed with a URL that WHATWG URL cannot
    // parse. transformNavigationCommitted returns {} and warns — but that's
    // not "failing". To force a write failure we push an event whose
    // transformer succeeds but whose write includes an invalid record.
    //
    // The simplest way to force a real write failure is to short-circuit
    // GraphStore.writeBatch with a wrapper that throws for one specific
    // node id. That covers "throw mid-transform" from the caller's POV.

    const originalWriteBatch = graph.writeBatch.bind(graph);
    let throwOnce = true;
    (graph as any).writeBatch = async (batch: any) => {
      if (throwOnce && batch.nodes?.some((n: any) => n.id === visitNodeId('nav_fail'))) {
        throwOnce = false;
        throw new Error('simulated write failure');
      }
      return originalWriteBatch(batch);
    };

    outbox.push('b1', [
      makeEvent({ id: 'tabc_1', type: 'tab_created', timestamp: 1000, tabId: 42, windowId: 7 }),
      makeEvent({
        id: 'nav_fail', type: 'navigation_committed', timestamp: 1500,
        tabId: 42, url: 'https://fail.example/',
      }),
      makeEvent({
        id: 'nav_ok', type: 'navigation_committed', timestamp: 2000,
        tabId: 42, url: 'https://ok.example/',
      }),
    ]);

    const ingest = new GraphIngest({ outbox: outbox as any, graph });
    await ingest.drain();

    // nav_fail's writeBatch threw — no Visit for it in the graph.
    const failedVisit = await graph.getNode<VisitNode>(visitNodeId('nav_fail'));
    expect(failedVisit).toBeUndefined();

    // Its id should NOT be marked drained.
    expect(outbox.drainedIds().has('nav_fail')).toBe(false);

    // But nav_ok still processed — its visit is present.
    const okVisit = await graph.getNode<VisitNode>(visitNodeId('nav_ok'));
    expect(okVisit).toBeDefined();
    expect(outbox.drainedIds().has('nav_ok')).toBe(true);

    // And a second drain should retry nav_fail (the writeBatch stub only
    // throws once, so the retry succeeds).
    await ingest.drain();
    const retryVisit = await graph.getNode<VisitNode>(visitNodeId('nav_fail'));
    expect(retryVisit).toBeDefined();
    expect(outbox.drainedIds().has('nav_fail')).toBe(true);
  });
});

describe('GraphIngest.drain — idempotency', () => {
  it('replaying the same batch does not double-count nodes or edges', async () => {
    const graph = await freshGraph();
    const outbox = new FakeOutbox();

    outbox.push('b1', [
      makeEvent({ id: 'tabc_1', type: 'tab_created', timestamp: 1000, tabId: 42, windowId: 7 }),
      makeEvent({
        id: 'nav_1', type: 'navigation_committed', timestamp: 1500,
        tabId: 42, url: 'https://a.example/',
      }),
    ]);

    const ingest = new GraphIngest({ outbox: outbox as any, graph });
    await ingest.drain();

    const stats1 = await graph.stats();

    // Reset drained set and drain again — the transforms produce the same
    // deterministic ids so writeBatch simply re-puts.
    (outbox as any).drained = new Set<string>();
    await ingest.drain();

    const stats2 = await graph.stats();
    expect(stats2.nodes).toBe(stats1.nodes);
    expect(stats2.edges).toBe(stats1.edges);
  });
});

describe('GraphIngest — alarm route and drainSoon debounce', () => {
  it('runAlarm() delegates to drain()', async () => {
    const graph = await freshGraph();
    const outbox = new FakeOutbox();

    outbox.push('b1', [
      makeEvent({ id: 'tabc_1', type: 'tab_created', timestamp: 1000, tabId: 42, windowId: 7 }),
    ]);

    const ingest = new GraphIngest({ outbox: outbox as any, graph });
    await ingest.runAlarm();

    const stats = await graph.stats();
    expect(stats.nodesByType.Tab).toBe(1);
    expect(outbox.drainedIds().has('tabc_1')).toBe(true);
  });

  it('drainSoon() coalesces multiple calls into a single drain', async () => {
    const graph = await freshGraph();
    const outbox = new FakeOutbox();

    outbox.push('b1', [
      makeEvent({ id: 'tabc_1', type: 'tab_created', timestamp: 1000, tabId: 42, windowId: 7 }),
    ]);

    // Capture the scheduled callback and its delay so we can drive it
    // deterministically without setTimeout.
    let scheduled: Array<{ fn: () => void; ms: number }> = [];
    const ingest = new GraphIngest({
      outbox: outbox as any,
      graph,
      scheduleDebounced: (fn, ms) => { scheduled.push({ fn, ms }); },
    });

    // Three back-to-back kicks → only one scheduled callback.
    ingest.drainSoon();
    ingest.drainSoon();
    ingest.drainSoon();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].ms).toBe(500);

    // Fire the scheduled callback — drain runs.
    await scheduled[0].fn();
    // Give the void drain() a tick to complete.
    await new Promise((resolve) => setTimeout(resolve, 10));

    const stats = await graph.stats();
    expect(stats.nodesByType.Tab).toBe(1);

    // After the scheduled call fires, drainScheduled clears — a new kick
    // schedules another callback.
    scheduled = [];
    ingest.drainSoon();
    expect(scheduled).toHaveLength(1);
  });
});
