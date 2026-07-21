/**
 * One fabricated day of browsing, hand-authored so the timeline is legible
 * in query output. Time origin = 0 = "midnight on the fixture day"; all
 * times are ms since that origin.
 *
 * Ported verbatim from spike/temporal-graph/fixtures.ts so the ported
 * queries can be validated against the spike's expected outputs.
 *
 * Narrative (all times same day):
 *   09:00:00  window w1 + tab t1 open, session s1 starts (manual)
 *   09:00:01  v1: hn.com (typed) in t1
 *   09:03:00  click link -> v2: github.com/some/repo (link, navigated_from v1)
 *   09:03:15  right-click "open in new tab" from HN -> t2 opens, v3 in t2
 *             (link, opened_from v1)
 *   09:05:30  switch focus to t2/v3
 *   09:08:00  close t2. Focus returns to t1/v2
 *   09:10:00  in t1, type google search -> v4 (google.com/search?q=...),
 *             SearchQuery sq1
 *   09:11:00  click first result -> v5: react.dev (link, arrived_via sq1,
 *             navigated_from v4)
 *   09:25:00  idle -> session s1 ends. v5 remains the tab's current page.
 *   11:00:00  return from idle -> session s2 starts (detected_by 'idle').
 *             Focus resumes on v5.
 *   11:05:00  v5 navigates -> v6: react.dev/reference/hooks (link,
 *             navigated_from v5)
 *   11:20:00  idle -> s2 ends
 *   22:00:00  RETROACTIVE: user reviews the day, tags s1='wasted-time',
 *             s2='react-research'. Tag creation and tagged_with edges have
 *             at_time = 22:00:00 while every visit's at_time < 09:30:00.
 */

import type { GraphStore } from '../store';
import type {
  AnyNode,
  AnyEdge,
  DomainNode,
  IntervalEdge,
  IntervalEdgeType,
  PageNode,
  PointEdge,
  PointEdgeType,
  SearchQueryNode,
  SessionNode,
  TabNode,
  TagNode,
  VisitNode,
  WindowNode,
} from '../types';

const S = 1000;
const M = 60 * S;
const H = 60 * M;

export const T = {
  s1_start:   9 * H,
  v1_start:   9 * H + 1 * S,
  v2_start:   9 * H + 3 * M,
  v3_start:   9 * H + 3 * M + 15 * S,
  focus_v3:   9 * H + 5 * M + 30 * S,
  t2_close:   9 * H + 8 * M,
  v4_start:   9 * H + 10 * M,
  v5_start:   9 * H + 11 * M,
  s1_end:     9 * H + 25 * M,
  s2_start:   11 * H,
  v6_start:   11 * H + 5 * M,
  s2_end:     11 * H + 20 * M,
  retro_tag:  22 * H,
} as const;

// ---- ID helpers ----

let seq = 0;
const newId = (prefix: string) => `${prefix}_${++seq}`;

// ---- Node builders (explicit; no defaults magic) ----

function page(
  id: string,
  normalized_url: string,
  raw_url_first_seen: string,
  title: string,
  first_seen: number,
  last_seen: number,
  visit_count: number,
): PageNode {
  return {
    id, type: 'Page', recorded_at: first_seen,
    normalized_url, raw_url_first_seen, title,
    first_seen, last_seen, visit_count,
  };
}

function visit(
  id: string,
  at_time: number,
  ended_at: number | null,
  focus_intervals: VisitNode['focus_intervals'],
  transition: VisitNode['transition'],
): VisitNode {
  return {
    id, type: 'Visit', recorded_at: at_time,
    at_time, ended_at, focus_intervals, transition,
  };
}

function tab(id: string, browser_tab_id: number, opened_at: number, closed_at: number | null): TabNode {
  return { id, type: 'Tab', recorded_at: opened_at, opened_at, closed_at, browser_tab_id };
}

function win(id: string, browser_window_id: number, opened_at: number): WindowNode {
  return { id, type: 'Window', recorded_at: opened_at, opened_at, closed_at: null, browser_window_id };
}

function session(
  id: string,
  started_at: number,
  ended_at: number | null,
  detected_by: SessionNode['detected_by'],
): SessionNode {
  return { id, type: 'Session', recorded_at: started_at, started_at, ended_at, detected_by, title: null };
}

function domain(id: string, hostname: string, first_seen: number): DomainNode {
  return { id, type: 'Domain', recorded_at: first_seen, hostname, first_seen };
}

function tag(id: string, slug: string, label: string, created_at: number): TagNode {
  return { id, type: 'Tag', recorded_at: created_at, slug, label, created_at };
}

function searchQuery(
  id: string,
  engine: SearchQueryNode['engine'],
  query_text: string,
  results_url: string,
  at_time: number,
): SearchQueryNode {
  return { id, type: 'SearchQuery', recorded_at: at_time, engine, query_text, results_url };
}

// ---- Edge builders ----

function pointEdge(
  type: PointEdgeType,
  from_id: string,
  to_id: string,
  at_time: number,
  recorded_at: number = at_time,
): PointEdge {
  return {
    id: newId('pe'), kind: 'point', type, from_id, to_id,
    at_time, recorded_at,
  };
}

function intervalEdge(
  type: IntervalEdgeType,
  from_id: string,
  to_id: string,
  valid_from: number,
  valid_to: number | null,
  recorded_at?: number,
): IntervalEdge {
  return {
    id: newId('ie'), kind: 'interval', type, from_id, to_id,
    valid_from, valid_to,
    recorded_at: recorded_at ?? valid_from,
  };
}

// ---- Build the fixture ----

export function buildFixture(): { nodes: AnyNode[]; edges: AnyEdge[] } {
  // Reset id sequence so repeated calls produce identical edge ids.
  seq = 0;

  // Domains
  const dHn = domain('d_hn', 'news.ycombinator.com', T.v1_start);
  const dGh = domain('d_gh', 'github.com', T.v2_start);
  const dGoo = domain('d_google', 'google.com', T.v4_start);
  const dReact = domain('d_react', 'react.dev', T.v5_start);

  // Pages (visit_count set to how many Visit nodes point at each)
  const pHn      = page('p_hn',      'https://news.ycombinator.com/',
                        'https://news.ycombinator.com/', 'Hacker News',
                        T.v1_start, T.v1_start, 1);
  const pGh1     = page('p_gh1',     'https://github.com/some/repo',
                        'https://github.com/some/repo', 'some/repo',
                        T.v2_start, T.v2_start, 1);
  const pGh2     = page('p_gh2',     'https://github.com/other/repo',
                        'https://github.com/other/repo', 'other/repo',
                        T.v3_start, T.v3_start, 1);
  const pGooSearch = page('p_goo_search',
                          'https://google.com/search?q=react+hooks+tutorial',
                          'https://google.com/search?q=react+hooks+tutorial',
                          'react hooks tutorial - Google Search',
                          T.v4_start, T.v4_start, 1);
  const pReact   = page('p_react',   'https://react.dev/',
                        'https://react.dev/', 'React – The library for web UIs',
                        T.v5_start, T.v5_start, 1);
  const pReactHooks = page('p_react_hooks', 'https://react.dev/reference/hooks',
                           'https://react.dev/reference/hooks', 'Built-in React Hooks',
                           T.v6_start, T.v6_start, 1);

  // Sessions
  // s1's detected_by is 'manual' rather than 'session_restore' so display
  // primitives that filter session_restore (recentSessions,
  // sessionsOverlappingWindow) still return s1. See the comment on
  // sessionsOverlappingWindow for why session_restore is dropped.
  const s1 = session('s1', T.s1_start, T.s1_end, 'manual');
  const s2 = session('s2', T.s2_start, T.s2_end, 'idle');

  // Window + tabs
  const w1 = win('w1', 100, T.s1_start);
  const tab1 = tab('t1', 101, T.s1_start, null);
  const tab2 = tab('t2', 102, T.v3_start, T.t2_close);

  // Search query
  const sq1 = searchQuery('sq1', 'google', 'react hooks tutorial',
                          'https://google.com/search?q=react+hooks+tutorial',
                          T.v4_start);

  // Visits
  const v1 = visit('v1', T.v1_start,   T.v2_start,
                   [{ start: T.v1_start, end: T.v2_start }],
                   'typed');
  const v2 = visit('v2', T.v2_start,   T.v4_start,
                   [
                     { start: T.v2_start, end: T.focus_v3 },
                     { start: T.t2_close, end: T.v4_start },
                   ],
                   'link');
  const v3 = visit('v3', T.v3_start,   T.t2_close,
                   [{ start: T.focus_v3, end: T.t2_close }],
                   'link');
  const v4 = visit('v4', T.v4_start,   T.v5_start,
                   [{ start: T.v4_start, end: T.v5_start }],
                   'typed');
  const v5 = visit('v5', T.v5_start,   T.v6_start,
                   [
                     { start: T.v5_start, end: T.s1_end },   // clipped by idle
                     { start: T.s2_start, end: T.v6_start }, // resumed after idle
                   ],
                   'link');
  const v6 = visit('v6', T.v6_start,   T.s2_end,
                   [{ start: T.v6_start, end: T.s2_end }],
                   'link');

  // Retroactive tags
  const tagWasted = tag('tag_wasted', 'wasted-time', 'Wasted time', T.retro_tag);
  const tagReact  = tag('tag_react',  'react-research', 'React research', T.retro_tag);

  const nodes: AnyNode[] = [
    dHn, dGh, dGoo, dReact,
    pHn, pGh1, pGh2, pGooSearch, pReact, pReactHooks,
    s1, s2,
    w1, tab1, tab2,
    sq1,
    v1, v2, v3, v4, v5, v6,
    tagWasted, tagReact,
  ];

  const edges: AnyEdge[] = [
    // Page -> Domain
    intervalEdge('on_domain', pHn.id,          dHn.id,    T.v1_start, null),
    intervalEdge('on_domain', pGh1.id,         dGh.id,    T.v2_start, null),
    intervalEdge('on_domain', pGh2.id,         dGh.id,    T.v3_start, null),
    intervalEdge('on_domain', pGooSearch.id,   dGoo.id,   T.v4_start, null),
    intervalEdge('on_domain', pReact.id,       dReact.id, T.v5_start, null),
    intervalEdge('on_domain', pReactHooks.id,  dReact.id, T.v6_start, null),

    // Tab -> Window (permanent for tab lifetime)
    intervalEdge('in_window', tab1.id, w1.id, T.s1_start, null),
    intervalEdge('in_window', tab2.id, w1.id, T.v3_start, T.t2_close),

    // Visit -> Tab (each visit lives entirely in one tab)
    intervalEdge('in_tab', v1.id, tab1.id, v1.at_time, v1.ended_at),
    intervalEdge('in_tab', v2.id, tab1.id, v2.at_time, v2.ended_at),
    intervalEdge('in_tab', v3.id, tab2.id, v3.at_time, v3.ended_at),
    intervalEdge('in_tab', v4.id, tab1.id, v4.at_time, v4.ended_at),
    intervalEdge('in_tab', v5.id, tab1.id, v5.at_time, v5.ended_at),
    intervalEdge('in_tab', v6.id, tab1.id, v6.at_time, v6.ended_at),

    // Visit -> Page
    intervalEdge('of_page', v1.id, pHn.id,          v1.at_time, v1.ended_at),
    intervalEdge('of_page', v2.id, pGh1.id,         v2.at_time, v2.ended_at),
    intervalEdge('of_page', v3.id, pGh2.id,         v3.at_time, v3.ended_at),
    intervalEdge('of_page', v4.id, pGooSearch.id,   v4.at_time, v4.ended_at),
    intervalEdge('of_page', v5.id, pReact.id,       v5.at_time, v5.ended_at),
    intervalEdge('of_page', v6.id, pReactHooks.id,  v6.at_time, v6.ended_at),

    // Visit -> Session (v5 spans two sessions -> two edges)
    intervalEdge('in_session', v1.id, s1.id, v1.at_time, v1.ended_at),
    intervalEdge('in_session', v2.id, s1.id, v2.at_time, v2.ended_at),
    intervalEdge('in_session', v3.id, s1.id, v3.at_time, v3.ended_at),
    intervalEdge('in_session', v4.id, s1.id, v4.at_time, v4.ended_at),
    intervalEdge('in_session', v5.id, s1.id, v5.at_time, T.s1_end),
    intervalEdge('in_session', v5.id, s2.id, T.s2_start, v5.ended_at),
    intervalEdge('in_session', v6.id, s2.id, v6.at_time, v6.ended_at),

    // Intra-tab navigation (Visit --navigated_from--> previous Visit in same tab)
    pointEdge('navigated_from', v2.id, v1.id, v2.at_time),
    pointEdge('navigated_from', v4.id, v2.id, v4.at_time),
    pointEdge('navigated_from', v5.id, v4.id, v5.at_time),
    pointEdge('navigated_from', v6.id, v5.id, v6.at_time),

    // Opener chain - v3 was spawned from v1 (right-click "open in new tab")
    pointEdge('opened_from', v3.id, v1.id, v3.at_time),

    // Search arrival - v5 arrived via sq1
    pointEdge('arrived_via', v5.id, sq1.id, v5.at_time),

    // Retroactive tags: at_time is 22:00, but the sessions ended much earlier
    pointEdge('tagged_with', s1.id, tagWasted.id, T.retro_tag, T.retro_tag),
    pointEdge('tagged_with', s2.id, tagReact.id,  T.retro_tag, T.retro_tag),
  ];

  return { nodes, edges };
}

/**
 * Write the fixture into a real `GraphStore` in a single atomic batch so
 * tests do not need to care about intermediate states.
 */
export async function seedGraph(g: GraphStore): Promise<{ nodes: AnyNode[]; edges: AnyEdge[] }> {
  const fixture = buildFixture();
  await g.writeBatch({ nodes: fixture.nodes, edges: fixture.edges });
  return fixture;
}
