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
  openCountsBetween,
  openTabsGrouped,
  pagesAndTransitionsBetween,
  pagesMatching,
  pagesOpenedFromDomain,
  recentSessions,
  tabTreeForSession,
  tabTreeForTag,
  visitFocusedAt,
  visitsInSession,
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

// ---- 6b. tabTreeForSession (same shape as tabTreeForTag, keyed by session id) ----

describe('tabTreeForSession', () => {
  it("returns the same tab tree for session s1 that 'wasted-time' produces", async () => {
    const { store } = await freshLoadedStore();

    const bySession = await tabTreeForSession(store, 's1');
    const byTag = await tabTreeForTag(store, 'wasted-time');

    // Both queries should reconstruct the same tree because s1 is the
    // session tagged 'wasted-time'. The shared helper is exercised on
    // both paths — proves the refactor didn't drift.
    expect(bySession).toHaveLength(1);
    expect(byTag).toHaveLength(1);

    const a = bySession[0]!;
    const b = byTag[0]!;
    expect(a.session.id).toBe('s1');
    expect(b.session.id).toBe('s1');
    expect(a.tabs.map((t) => t.tab.id)).toEqual(b.tabs.map((t) => t.tab.id));
    expect(a.tabs.map((t) => t.parent_tab_id)).toEqual(
      b.tabs.map((t) => t.parent_tab_id),
    );
    for (let i = 0; i < a.tabs.length; i++) {
      expect(a.tabs[i]!.visits.map((v) => v.visit.id)).toEqual(
        b.tabs[i]!.visits.map((v) => v.visit.id),
      );
    }
  });

  it('returns an empty array when the session id does not exist', async () => {
    const { store } = await freshLoadedStore();
    const result = await tabTreeForSession(store, 'no-such-session');
    expect(result).toEqual([]);
  });
});

// ---- 7. recentSessions (dashboard-only) ----

describe('recentSessions', () => {
  it('returns sessions newest first with per-session aggregates', async () => {
    const { store } = await freshLoadedStore();

    const rows = await recentSessions(store, 10);

    expect(rows.map((r) => r.session.id)).toEqual(['s2', 's1']);

    const s2 = rows[0]!;
    expect(s2.session.started_at).toBe(T.s2_start);
    expect(s2.visit_count).toBe(2);
    expect(s2.page_count).toBe(2);
    expect(s2.first_page_titles).toEqual([
      'React – The library for web UIs',
      'Built-in React Hooks',
    ]);
    expect(s2.tags.map((t) => t.slug)).toEqual(['react-research']);

    const s1 = rows[1]!;
    expect(s1.visit_count).toBe(5);
    expect(s1.page_count).toBe(5);
    expect(s1.first_page_titles).toHaveLength(3);
    expect(s1.first_page_titles[0]).toBe('Hacker News');
    expect(s1.tags.map((t) => t.slug)).toEqual(['wasted-time']);
  });

  it('respects the limit — only N sessions come back even if more exist', async () => {
    const { store } = await freshLoadedStore();
    const rows = await recentSessions(store, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.session.id).toBe('s2');
  });

  it('returns an empty array when limit is zero or negative', async () => {
    const { store } = await freshLoadedStore();
    expect(await recentSessions(store, 0)).toEqual([]);
    expect(await recentSessions(store, -5)).toEqual([]);
  });

  it("filters 'session_restore' sessions — SW-wake noise, not user-perceptible", async () => {
    // Same rationale as sessionsOverlappingWindow. Insert a session_restore
    // session that would otherwise sort to the top and confirm it does
    // NOT appear in the results.
    const { store } = await freshLoadedStore();
    const noiseId = 's_noise';
    await store.writeBatch({
      nodes: [
        {
          id: noiseId,
          type: 'Session',
          recorded_at: T.retro_tag + 1000,
          started_at: T.retro_tag + 1000,
          ended_at: T.retro_tag + 2000,
          detected_by: 'session_restore',
          title: null,
        },
      ],
      edges: [],
    });

    const rows = await recentSessions(store, 10);
    expect(rows.map((r) => r.session.id)).toEqual(['s2', 's1']);
    expect(rows.some((r) => r.session.id === noiseId)).toBe(false);
  });
});

// ---- 8. visitsInSession (dashboard timeline scoped mode) ----

describe('visitsInSession', () => {
  it('returns the five visits in s1 with page + tab attached, ordered by at_time', async () => {
    const { store } = await freshLoadedStore();

    const rows = await visitsInSession(store, 's1');

    expect(rows.map((r) => r.visit.id)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5']);

    // Every row must resolve its Page (fixture guarantees this).
    for (const row of rows) {
      expect(row.page).not.toBeNull();
      expect(row.tab).not.toBeNull();
    }

    // v3 lives in the spawned tab t2; the other four in t1.
    const v3Row = rows.find((r) => r.visit.id === 'v3')!;
    expect(v3Row.tab!.id).toBe('t2');
    const v1Row = rows.find((r) => r.visit.id === 'v1')!;
    expect(v1Row.tab!.id).toBe('t1');
  });

  it("returns v5 and v6 for s2 — v5 straddles s1 and s2 and appears in each", async () => {
    const { store } = await freshLoadedStore();

    const rows = await visitsInSession(store, 's2');

    // v5 has an in_session edge to both s1 and s2 (fixture splits at
    // the idle boundary). The primitive filters by session id so v5
    // shows up here too, ordered before v6 which starts later.
    expect(rows.map((r) => r.visit.id)).toEqual(['v5', 'v6']);
  });

  it('returns an empty array when the session id does not exist', async () => {
    const { store } = await freshLoadedStore();
    expect(await visitsInSession(store, 'no-such-session')).toEqual([]);
  });
});

// ---- 9. pagesMatching (dashboard Page Search) ----

describe('pagesMatching', () => {
  it('matches Page.title and Page.normalized_url case-insensitively', async () => {
    const { store } = await freshLoadedStore();

    const ghHits = await pagesMatching(store, 'github');
    expect(ghHits.map((p) => p.id).sort()).toEqual(['p_gh1', 'p_gh2']);

    // 'react' as a needle also matches Google's search-results URL
    // (`?q=react+hooks+tutorial`), which is intentional — Page Search
    // should surface search-result pages that contain the needle.
    const reactHits = await pagesMatching(store, 'React');
    expect(reactHits.map((p) => p.id).sort()).toEqual([
      'p_goo_search', 'p_react', 'p_react_hooks',
    ]);
  });

  it("matches on the page title even when the URL doesn't contain the needle", async () => {
    const { store } = await freshLoadedStore();
    const hits = await pagesMatching(store, 'Hacker');
    expect(hits.map((p) => p.id)).toEqual(['p_hn']);
  });

  it('returns empty for an empty or whitespace-only query — explicit intent required', async () => {
    const { store } = await freshLoadedStore();
    expect(await pagesMatching(store, '')).toEqual([]);
    expect(await pagesMatching(store, '   ')).toEqual([]);
  });

  it('returns an empty array when nothing matches the needle', async () => {
    const { store } = await freshLoadedStore();
    expect(await pagesMatching(store, 'never-visited-anywhere')).toEqual([]);
  });

  it('orders hits by last_seen descending', async () => {
    const { store } = await freshLoadedStore();
    const hits = await pagesMatching(store, 'react');
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i]!.last_seen).toBeLessThanOrEqual(hits[i - 1]!.last_seen);
    }
  });
});

// ---- 10. pagesAndTransitionsBetween (dashboard Node-Graph view) ----

describe('pagesAndTransitionsBetween', () => {
  it('returns the six fixture pages and reduces visit-level edges to page-level transitions', async () => {
    const { store } = await freshLoadedStore();

    const window = 24 * H;
    const result = await pagesAndTransitionsBetween(store, 0, window);

    const pageIds = result.pages.map((p) => p.id).sort();
    expect(pageIds).toEqual([
      'p_gh1', 'p_gh2', 'p_goo_search', 'p_hn', 'p_react', 'p_react_hooks',
    ]);

    // Expected transitions from the fixture:
    //   navigated_from:  v2->v1 (p_gh1 <- p_hn),
    //                    v4->v2 (p_goo_search <- p_gh1),
    //                    v5->v4 (p_react <- p_goo_search),
    //                    v6->v5 (p_react_hooks <- p_react).
    //   opened_from:     v3->v1 (p_gh2 <- p_hn).
    // Reduced to page-level transitions (from, to, kind, count).
    const asKey = (t: typeof result.transitions[number]) =>
      `${t.kind}::${t.from_page_id}->${t.to_page_id}`;
    const keys = result.transitions.map(asKey).sort();
    expect(keys).toEqual(
      [
        'navigated_from::p_gh1->p_goo_search',
        'navigated_from::p_goo_search->p_react',
        'navigated_from::p_hn->p_gh1',
        'navigated_from::p_react->p_react_hooks',
        'opened_from::p_hn->p_gh2',
      ].sort(),
    );

    for (const t of result.transitions) {
      expect(t.count).toBe(1);
    }
  });

  it('pulls in out-of-window parent pages so incoming edges are drawable', async () => {
    const { store } = await freshLoadedStore();

    // Narrow window that covers v4..v6 but excludes v1/v2/v3.
    // v4's navigated_from points at v2 (outside window). The dashboard needs
    // to render "you got here from this earlier page" so v2's page (p_gh1)
    // must be surfaced as an external parent even though v2's at_time is
    // outside the window.
    const tFrom = T.v4_start;
    const tTo = T.v6_start + 1000;

    const result = await pagesAndTransitionsBetween(store, tFrom, tTo);

    const keys = result.transitions
      .map((t) => `${t.kind}::${t.from_page_id}->${t.to_page_id}`)
      .sort();
    expect(keys).toEqual([
      'navigated_from::p_gh1->p_goo_search',
      'navigated_from::p_goo_search->p_react',
      'navigated_from::p_react->p_react_hooks',
    ]);

    const pageIds = result.pages.map((p) => p.id).sort();
    expect(pageIds).toEqual(['p_gh1', 'p_goo_search', 'p_react', 'p_react_hooks']);
  });

  it('returns empty result for a window before any visit', async () => {
    const { store } = await freshLoadedStore();
    const result = await pagesAndTransitionsBetween(store, 0, 3 * H);
    expect(result.pages).toEqual([]);
    expect(result.transitions).toEqual([]);
  });
});

// ---- 9. Tab-load view queries ----
//
// Fixture recap for time reasoning:
//   w1 opened at T.s1_start,  never closed
//   t1 opened at T.s1_start,  never closed
//   t2 opened at T.v3_start,  closed at T.t2_close

describe('openCountsBetween', () => {
  it('reports 0 open before any window/tab exists', async () => {
    const { store } = await freshLoadedStore();
    const samples = await openCountsBetween(store, 0, T.s1_start - 1000, 3);
    for (const s of samples) {
      expect(s.tab_count).toBe(0);
      expect(s.window_count).toBe(0);
    }
  });

  it('reports the right counts across the tab2 lifetime and beyond', async () => {
    const { store } = await freshLoadedStore();

    // 5 samples spanning s1_start..s2_end. Enough to hit both regimes.
    const samples = await openCountsBetween(store, T.s1_start, T.s2_end, 20);

    // Before tab2 opens: 1 tab open (t1), 1 window.
    const beforeT2 = samples.find((s) => s.at < T.v3_start);
    expect(beforeT2?.tab_count).toBe(1);
    expect(beforeT2?.window_count).toBe(1);

    // While tab2 is open: 2 tabs.
    const duringT2 = samples.find((s) => s.at >= T.v3_start && s.at < T.t2_close);
    expect(duringT2?.tab_count).toBe(2);

    // After tab2 closes: back to 1 tab.
    const afterT2 = samples.find((s) => s.at > T.t2_close);
    expect(afterT2?.tab_count).toBe(1);
    expect(afterT2?.window_count).toBe(1);
  });

  it('returns [] for a zero-width or inverted window', async () => {
    const { store } = await freshLoadedStore();
    expect(await openCountsBetween(store, T.s1_start, T.s1_start, 10)).toEqual([]);
    expect(await openCountsBetween(store, T.s2_end, T.s1_start, 10)).toEqual([]);
  });
});

describe('openTabsGrouped', () => {
  it('groups the single still-open tab under its still-open window', async () => {
    const { store } = await freshLoadedStore();
    const groups = await openTabsGrouped(store);

    // Only w1 is still open (never got closed_at), only t1 sits in it
    // (t2 is closed).
    expect(groups.length).toBe(1);
    expect(groups[0].window.id).toBe('w1');
    expect(groups[0].tabs.length).toBe(1);
    expect(groups[0].tabs[0].tab.id).toBe('t1');
  });

  it("names the tab's most recent visit's page", async () => {
    const { store } = await freshLoadedStore();
    const groups = await openTabsGrouped(store);

    // t1 hosted v1..v6 (v6 is the most recent), which is
    // react.dev/reference/hooks in the fixture. Its page id is
    // `p_react_hooks`.
    expect(groups[0].tabs[0].current_visit?.id).toBe('v6');
    expect(groups[0].tabs[0].current_page?.id).toBe('p_react_hooks');
  });
});
