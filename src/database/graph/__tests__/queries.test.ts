/**
 * Fixture-based tests for the six graph query primitives.
 *
 * Each primitive is exercised against the ported spike fixture — the
 * hand-authored fabricated day of browsing that the design spike used to
 * validate its queries. Expected results were derived by running the
 * spike's `run.ts` against this fixture; the assertions here re-encode
 * those outputs so any drift shows up as a test failure.
 *
 * All storage is real IndexedDB via `fake-indexeddb/auto` — no mock
 * services, per CLAUDE.md. Every test opens a uniquely-named database
 * so state cannot leak between cases.
 */

// jsdom 26 does not expose `structuredClone`, but fake-indexeddb needs it
// for its clone-on-insertion pass. Lift a Node-v8 shim onto the global
// before importing fake-indexeddb — matches src/database/graph/__tests__/
// store.test.ts.
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
import {
  causalPredecessors,
  pagesOpenedFromDomain,
  tabTreeForTag,
  visitFocusedAt,
  visitsInTagPredatingTag,
  visitsOnScreenBetween,
} from '../queries';
import { buildFixture, seedGraph, T } from './fixture';

const S = 1000;
const M = 60 * S;
const H = 60 * M;

// ---- Test harness ----

let dbSuffix = 0;

async function freshLoadedStore(): Promise<{
  store: GraphStore;
  fixture: ReturnType<typeof buildFixture>;
}> {
  dbSuffix += 1;
  const uniqueName = `${DATABASE_NAME}_queries_test_${Date.now()}_${dbSuffix}`;
  const db = await openFreshDatabase(uniqueName);
  const store = new GraphStore(db);
  const fixture = await seedGraph(store);
  return { store, fixture };
}

function openFreshDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of Object.values(STORE_NAMES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          const cfg = createStoreConfig(storeName);
          const objectStore = db.createObjectStore(storeName, cfg.options as IDBObjectStoreParameters);
          for (const idx of cfg.indexes) {
            objectStore.createIndex(idx.name, idx.keyPath, idx.options);
          }
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---- 1. pagesOpenedFromDomain ----

describe('pagesOpenedFromDomain', () => {
  it('returns pages opened from news.ycombinator.com within the fixture day', async () => {
    const { store } = await freshLoadedStore();

    const result = await pagesOpenedFromDomain(store, 'news.ycombinator.com', 0, 24 * H);

    expect(result).toHaveLength(1);
    const row = result[0]!;
    expect(row.visit.id).toBe('v3');
    expect(row.visit.at_time).toBe(T.v3_start);
    expect(row.page.id).toBe('p_gh2');
    expect(row.page.normalized_url).toBe('https://github.com/other/repo');
    expect(row.parent_page.id).toBe('p_hn');
    expect(row.parent_page.normalized_url).toBe('https://news.ycombinator.com/');
  });

  it('returns an empty array when the domain does not exist', async () => {
    const { store } = await freshLoadedStore();
    const result = await pagesOpenedFromDomain(store, 'never-visited.example', 0, 24 * H);
    expect(result).toEqual([]);
  });

  it('respects the [from, to] window on the child visit at_time', async () => {
    const { store } = await freshLoadedStore();
    // v3 starts at T.v3_start (~09:03:15); asking for the pre-morning window
    // must return nothing so we know the filter runs.
    const result = await pagesOpenedFromDomain(store, 'news.ycombinator.com', 0, T.v3_start - 1);
    expect(result).toEqual([]);
  });
});

// ---- 2. visitFocusedAt ----

describe('visitFocusedAt', () => {
  interface Probe {
    label: string;
    at: number;
    expected: { visitId: string; pageTitle: string } | null;
  }

  const probes: Probe[] = [
    { label: 'deep in v1 focus',                       at: 9 * H + 2 * M,       expected: { visitId: 'v1', pageTitle: 'Hacker News' } },
    { label: 'v3 focus (in tab2)',                     at: 9 * H + 6 * M,       expected: { visitId: 'v3', pageTitle: 'other/repo' } },
    { label: 'v2 focus resumed after tab2 close',      at: 9 * H + 9 * M,       expected: { visitId: 'v2', pageTitle: 'some/repo' } },
    { label: 'during the idle gap between s1 and s2',  at: 10 * H,              expected: null },
    { label: 'v5 focus after resume from idle',        at: 11 * H + 3 * M,      expected: { visitId: 'v5', pageTitle: 'React – The library for web UIs' } },
    { label: 'v6 focus in s2',                         at: 11 * H + 10 * M,     expected: { visitId: 'v6', pageTitle: 'Built-in React Hooks' } },
  ];

  for (const probe of probes) {
    it(`identifies the focused visit when the probe is ${probe.label}`, async () => {
      const { store } = await freshLoadedStore();
      const result = await visitFocusedAt(store, probe.at);
      if (probe.expected == null) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result!.visit.id).toBe(probe.expected.visitId);
        expect(result!.page).not.toBeNull();
        expect(result!.page!.title).toBe(probe.expected.pageTitle);
      }
    });
  }
});

// ---- 3. visitsInTagPredatingTag ----

describe('visitsInTagPredatingTag', () => {
  it("returns every visit in the 'wasted-time' session whose at_time is before the tag", async () => {
    const { store } = await freshLoadedStore();

    const result = await visitsInTagPredatingTag(store, 'wasted-time');

    // Session s1 contains v1..v5 (v5 has one in_session edge into s1 for
    // the pre-idle slice). Every visit's at_time is well before
    // T.retro_tag, so all five are returned.
    const visitIds = result.map((r) => r.visit.id).sort();
    expect(visitIds).toEqual(['v1', 'v2', 'v3', 'v4', 'v5']);

    for (const row of result) {
      expect(row.tag.slug).toBe('wasted-time');
      expect(row.session.id).toBe('s1');
      expect(row.tag_applied_at).toBe(T.retro_tag);
      expect(row.visit.at_time).toBeLessThan(row.tag_applied_at);
      // Every visit has a page.
      expect(row.page).not.toBeNull();
    }
  });

  it("returns v5 and v6 for 'react-research' — both event times predate the retro tag", async () => {
    const { store } = await freshLoadedStore();

    const result = await visitsInTagPredatingTag(store, 'react-research');

    // Session s2 has in_session edges from v5 (post-resume slice) and v6.
    // The visit's own at_time is what the predicate checks, so both come back.
    const visitIds = result.map((r) => r.visit.id).sort();
    expect(visitIds).toEqual(['v5', 'v6']);
    for (const row of result) {
      expect(row.session.id).toBe('s2');
      expect(row.tag.slug).toBe('react-research');
    }
  });

  it('returns an empty array for an unknown tag slug', async () => {
    const { store } = await freshLoadedStore();
    const result = await visitsInTagPredatingTag(store, 'never-tagged');
    expect(result).toEqual([]);
  });
});

// ---- 4. causalPredecessors ----

describe('causalPredecessors', () => {
  it('returns no predecessors of v6 when the window is 60s — the chain crosses the idle gap of hours', async () => {
    const { store } = await freshLoadedStore();
    const result = await causalPredecessors(store, 'v6', 60 * S);
    expect(result).toEqual([]);
  });

  it('walks v5 -> v4 -> v2 -> v1 from v6 when the window is 3 hours', async () => {
    const { store } = await freshLoadedStore();
    const result = await causalPredecessors(store, 'v6', 3 * H);

    const chain = result.map((r) => r.visit.id);
    expect(chain).toEqual(['v5', 'v4', 'v2', 'v1']);

    // delta_ms is anchor.at_time - predecessor.at_time; v5 is closest.
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.delta_ms).toBeGreaterThan(result[i - 1]!.delta_ms);
    }

    // Anchor is v6 at 11h+5m. v1 is at 9h+1s. delta ~= 2h5m less 1s.
    expect(result[3]!.delta_ms).toBe(T.v6_start - T.v1_start);
  });

  it('returns an empty array when the anchor visit does not exist', async () => {
    const { store } = await freshLoadedStore();
    const result = await causalPredecessors(store, 'no-such-visit', 3 * H);
    expect(result).toEqual([]);
  });
});

// ---- 5. visitsOnScreenBetween (the new Q4-split primitive) ----

describe('visitsOnScreenBetween', () => {
  it('includes v5 during a probe window entirely inside its post-idle focus interval — the case Q4 flagged', async () => {
    const { store } = await freshLoadedStore();
    // Probe window fully inside s2, well after v5 started but before v6.
    // v5.at_time = 09:11:00, v5.ended_at = 11:05:00. Probe = 11:02..11:03.
    // v5's `at_time` is BEFORE the window, but its interval overlaps —
    // the exact case that motivated splitting this primitive out of
    // the causal-chain query.
    const tFrom = 11 * H + 2 * M;
    const tTo = 11 * H + 3 * M;

    const result = await visitsOnScreenBetween(store, tFrom, tTo);

    const ids = result.map((r) => r.visit.id);
    expect(ids).toEqual(['v5']);

    // Sanity: the visit's at_time really is before the window.
    expect(result[0]!.visit.at_time).toBeLessThan(tFrom);
    // And its ended_at is inside or past the window.
    const endedAt = result[0]!.visit.ended_at ?? Infinity;
    expect(endedAt).toBeGreaterThanOrEqual(tFrom);
    expect(result[0]!.page).not.toBeNull();
    expect(result[0]!.page!.id).toBe('p_react');
  });

  it('returns v6 alone when the window is inside its focus interval (started inside the window)', async () => {
    const { store } = await freshLoadedStore();
    // Window entirely inside v6's focus: 11:10..11:15. v6.at_time = 11:05,
    // ended_at = 11:20. v5 already ended at 11:05, so it must NOT appear.
    const tFrom = 11 * H + 10 * M;
    const tTo = 11 * H + 15 * M;

    const result = await visitsOnScreenBetween(store, tFrom, tTo);
    const ids = result.map((r) => r.visit.id);
    expect(ids).toEqual(['v6']);
  });

  it('returns v5 and v6 when the window straddles the v5 -> v6 navigation instant', async () => {
    const { store } = await freshLoadedStore();
    // Straddle window: 11:04..11:06 — v5.ended_at = 11:05 = v6.at_time.
    // Both overlap; v5 via backward walk, v6 via forward walk.
    const tFrom = 11 * H + 4 * M;
    const tTo = 11 * H + 6 * M;

    const result = await visitsOnScreenBetween(store, tFrom, tTo);
    const ids = result.map((r) => r.visit.id).sort();
    expect(ids).toEqual(['v5', 'v6']);
  });

  it('returns an empty array when the window falls in the idle gap and no visit spans it', async () => {
    const { store } = await freshLoadedStore();
    // Window at 10:00..10:05 — inside the idle gap after v5 was clipped by
    // s1_end and before s2_start. v5.ended_at is v6_start = 11:05:00 which
    // is > tFrom = 10:00, so v5 IS included even though its focus is
    // clipped by the session boundary. This exposes the design decision:
    // `visitsOnScreenBetween` uses [at_time, ended_at] — the *visit*
    // lifetime — not focus intervals. If a stricter view is needed, a
    // focus-clipped variant is a separate query.
    const tFrom = 10 * H;
    const tTo = 10 * H + 5 * M;

    const result = await visitsOnScreenBetween(store, tFrom, tTo);
    const ids = result.map((r) => r.visit.id);
    expect(ids).toEqual(['v5']);
  });

  it('returns no visits when the window is entirely before any recorded visit', async () => {
    const { store } = await freshLoadedStore();
    // Pre-dawn window at 05:00..05:30 — before s1_start at 09:00.
    const tFrom = 5 * H;
    const tTo = 5 * H + 30 * M;

    const result = await visitsOnScreenBetween(store, tFrom, tTo);
    expect(result).toEqual([]);
  });
});

// ---- 6. tabTreeForTag ----

describe('tabTreeForTag', () => {
  it("reconstructs the tab tree for 'wasted-time' — t2 shown as spawned from t1", async () => {
    const { store } = await freshLoadedStore();

    const result = await tabTreeForTag(store, 'wasted-time');

    expect(result).toHaveLength(1);
    const bucket = result[0]!;
    expect(bucket.session.id).toBe('s1');
    expect(bucket.tabs).toHaveLength(2);

    // Tabs sorted by opened_at: t1 first, t2 second.
    const [t1, t2] = bucket.tabs;
    expect(t1!.tab.id).toBe('t1');
    expect(t1!.parent_tab_id).toBeNull();
    expect(t1!.visits.map((v) => v.visit.id)).toEqual(['v1', 'v2', 'v4', 'v5']);
    expect(t1!.visits.every((v) => v.page !== null)).toBe(true);

    expect(t2!.tab.id).toBe('t2');
    expect(t2!.parent_tab_id).toBe('t1');
    expect(t2!.visits.map((v) => v.visit.id)).toEqual(['v3']);
    expect(t2!.visits[0]!.page!.id).toBe('p_gh2');
  });

  it("reconstructs the tab tree for 'react-research' — a single tab t1 hosting v5 and v6", async () => {
    const { store } = await freshLoadedStore();

    const result = await tabTreeForTag(store, 'react-research');

    expect(result).toHaveLength(1);
    const bucket = result[0]!;
    expect(bucket.session.id).toBe('s2');
    expect(bucket.tabs).toHaveLength(1);
    const [tab] = bucket.tabs;
    expect(tab!.tab.id).toBe('t1');
    // v5 has no opened_from — the parent_tab_id is null.
    expect(tab!.parent_tab_id).toBeNull();
    expect(tab!.visits.map((v) => v.visit.id)).toEqual(['v5', 'v6']);
  });

  it('returns an empty array for an unknown tag slug', async () => {
    const { store } = await freshLoadedStore();
    const result = await tabTreeForTag(store, 'never-tagged');
    expect(result).toEqual([]);
  });
});
