/**
 * The temporal browsing graph query API.
 *
 * Six primitives, all backed by IDB-indexed traversals over `GraphStore`:
 *
 *   1. pagesOpenedFromDomain    — pages spawned from a domain in a window
 *   2. visitFocusedAt           — visit on screen at instant t
 *   3. visitsInTagPredatingTag  — retroactive-tag audit (event vs. record time)
 *   4. causalPredecessors       — walk the navigation chain backward
 *   5. visitsOnScreenBetween    — temporal-window visibility (the Q4 split)
 *   6. tabTreeForTag            — tab tree for every session with a tag
 *
 * Plus one sibling of #6 added for the debug-panel Tab-Tree view:
 *
 *   6b. tabTreeForSession       — same shape as tabTreeForTag, keyed by
 *                                 a Session id so untagged sessions can
 *                                 be inspected directly.
 *
 * Ported from `spike/temporal-graph/queries.ts` with the API-name update
 * called out in the PRD: `visitsBefore` became `causalPredecessors` and a
 * new sibling `visitsOnScreenBetween` was added because the spike surfaced
 * that "causal chain" and "temporal window" are distinct questions.
 *
 * Every primitive drives one of the compound indexes declared in
 * `src/session/storage/schema.ts` — no `getAll()` of a whole store, no
 * full linear scans in the query path.
 */

import type { GraphStore } from './store';
import type {
  PageNode,
  SessionNode,
  TabNode,
  TagNode,
  VisitNode,
  WindowNode,
} from './types';

// ---- 1. Pages I opened from <hostname> in a time window ----
//
// "Opened from" = a Visit whose `opened_from` edge points to a Visit whose
// Page is on <hostname>. Time filter applies to the child visit's at_time.
export interface PagesOpenedFromDomainResult {
  visit: VisitNode;
  page: PageNode;
  parent_page: PageNode;
}

export async function pagesOpenedFromDomain(
  g: GraphStore,
  hostname: string,
  from: number,
  to: number,
): Promise<PagesOpenedFromDomainResult[]> {
  const out: PagesOpenedFromDomainResult[] = [];

  const domain = await g.nodeByDomainHostname(hostname);
  if (!domain) return out;

  const pagesOnDomain = new Set(
    (await g.inInterval(domain.id, 'on_domain')).map((e) => e.from_id),
  );
  if (pagesOnDomain.size === 0) return out;

  const openedFromEdges = await g.edgesOfType('opened_from');

  for (const e of openedFromEdges) {
    if (e.kind !== 'point') continue;
    if (e.at_time < from || e.at_time > to) continue;

    const parentVisit = await g.getNode<VisitNode>(e.to_id);
    if (!parentVisit) continue;

    const parentPageEdge = (await g.outInterval(parentVisit.id, 'of_page'))[0];
    if (!parentPageEdge) continue;
    if (!pagesOnDomain.has(parentPageEdge.to_id)) continue;

    const childVisit = await g.getNode<VisitNode>(e.from_id);
    if (!childVisit) continue;
    const childPageEdge = (await g.outInterval(childVisit.id, 'of_page'))[0];
    if (!childPageEdge) continue;

    const childPage = await g.getNode<PageNode>(childPageEdge.to_id);
    const parentPage = await g.getNode<PageNode>(parentPageEdge.to_id);
    if (!childPage || !parentPage) continue;

    out.push({ visit: childVisit, page: childPage, parent_page: parentPage });
  }

  return out;
}

// ---- 2. What was I focused on at instant t? ----
//
// Focus is exclusive: at most one visit contains t. Walk visits backward on
// the (Visit, at_time) index — the first one with a focus interval covering
// t and whose ended_at hasn't already elapsed is the answer.
export interface VisitFocusedAtResult {
  visit: VisitNode;
  page: PageNode | null;
}

export async function visitFocusedAt(
  g: GraphStore,
  t: number,
): Promise<VisitFocusedAtResult | null> {
  const visits = await g.visitsInAtTimeRange(Number.NEGATIVE_INFINITY, t, 'desc');
  for (const v of visits) {
    if (v.ended_at != null && v.ended_at < t) continue;
    const focused = v.focus_intervals.some(
      (fi) => fi.start <= t && (fi.end == null || fi.end >= t),
    );
    if (!focused) continue;

    return { visit: v, page: await pageForVisit(g, v) };
  }
  return null;
}

// ---- 3. Visits in a tagged session whose event time predates the tag ----
//
// For every `tagged_with` edge targeting <tagSlug>:
//   - Load the session at the edge's from side.
//   - Enumerate its `in_session` visits.
//   - Keep those whose Visit.at_time < tagged_with.at_time (the tag was
//     applied AFTER the visit happened — retroactive audit).
export interface VisitsInTagPredatingTagResult {
  session: SessionNode;
  tag: TagNode;
  tag_applied_at: number;
  visit: VisitNode;
  page: PageNode | null;
}

export async function visitsInTagPredatingTag(
  g: GraphStore,
  tagSlug: string,
): Promise<VisitsInTagPredatingTagResult[]> {
  const out: VisitsInTagPredatingTagResult[] = [];

  const tag = (await g.nodeByTagSlug(tagSlug)) as TagNode | undefined;
  if (!tag) return out;

  for (const te of await g.inPoint(tag.id, 'tagged_with')) {
    const session = await g.getNode<SessionNode>(te.from_id);
    if (!session) continue;

    for (const ve of await g.inInterval(session.id, 'in_session')) {
      const visit = await g.getNode<VisitNode>(ve.from_id);
      if (!visit) continue;
      if (visit.at_time >= te.at_time) continue;

      out.push({
        session,
        tag,
        tag_applied_at: te.at_time,
        visit,
        page: await pageForVisit(g, visit),
      });
    }
  }
  return out;
}

// ---- 4. Causal predecessors: walk the navigation chain back within a window ----
//
// Follow `navigated_from` (intra-tab) or, when absent, `opened_from`
// (cross-tab spawn) from the anchor visit until the chain either
// terminates or steps outside `[anchor.at_time - windowMs, anchor.at_time]`.
//
// Renamed from the spike's `visitsBefore` per the PRD Q4 decision — this
// answers "what caused me to arrive here?", NOT "what was on screen?".
// For the on-screen question use `visitsOnScreenBetween`.
export interface CausalPredecessorResult {
  visit: VisitNode;
  page: PageNode | null;
  delta_ms: number;
}

export async function causalPredecessors(
  g: GraphStore,
  visitId: string,
  windowMs: number,
): Promise<CausalPredecessorResult[]> {
  const anchor = await g.getNode<VisitNode>(visitId);
  if (!anchor) return [];

  const out: CausalPredecessorResult[] = [];
  const cutoff = anchor.at_time - windowMs;

  let cursor: string = anchor.id;
  // Guard against a cycle in the chain — a synthetic self-loop or bug in
  // ingest could otherwise walk forever.
  const seen = new Set<string>([cursor]);
  while (true) {
    const nav = (await g.outPoint(cursor, 'navigated_from'))[0];
    const prevEdge = nav ?? (await g.outPoint(cursor, 'opened_from'))[0];
    if (!prevEdge) break;

    const prev = await g.getNode<VisitNode>(prevEdge.to_id);
    if (!prev) break;
    if (prev.at_time < cutoff) break;
    if (seen.has(prev.id)) break;
    seen.add(prev.id);

    out.push({
      visit: prev,
      page: await pageForVisit(g, prev),
      delta_ms: anchor.at_time - prev.at_time,
    });
    cursor = prev.id;
  }

  return out;
}

// ---- 5. Visits on screen in a time window ----
//
// NEW primitive introduced when the spike's Q4 revealed that "causal
// chain" and "temporal window" are distinct questions. Include every
// Visit whose `[at_time, ended_at]` overlaps `[tFrom, tTo]` — including
// visits whose `at_time` predates `tFrom` because they were already on
// screen when the window opened.
//
// Two cursor walks over the (Visit, at_time) index:
//   - Forward: visits started inside the window.
//   - Backward: visits started before the window whose interval still
//     overlaps. Terminate at the first ended visit whose `ended_at`
//     precedes `tFrom` — its interval cannot cover any part of the
//     window.
export interface VisitOnScreenResult {
  visit: VisitNode;
  page: PageNode | null;
}

export async function visitsOnScreenBetween(
  g: GraphStore,
  tFrom: number,
  tTo: number,
): Promise<VisitOnScreenResult[]> {
  const collected: VisitNode[] = [];
  const seen = new Set<string>();

  const inWindow = await g.visitsInAtTimeRange(tFrom, tTo, 'asc');
  for (const v of inWindow) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    collected.push(v);
  }

  const before = await g.visitsInAtTimeRange(
    Number.NEGATIVE_INFINITY,
    tFrom - 1,
    'desc',
  );
  for (const v of before) {
    if (v.ended_at != null && v.ended_at < tFrom) break;
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    collected.push(v);
  }

  collected.sort((a, b) => a.at_time - b.at_time);

  const out: VisitOnScreenResult[] = [];
  for (const v of collected) {
    out.push({ visit: v, page: await pageForVisit(g, v) });
  }
  return out;
}

// ---- 6. Structural + temporal: tab tree for every session with a tag ----
//
// For each Session tagged <tagSlug>, group its Visits by their in_tab
// target. For each such Tab, record the parent tab (via the first visit's
// opened_from → parent visit → in_tab) so the caller can reconstruct
// the tree of tabs spawned during the session.
export interface TabTreeTab {
  tab: TabNode;
  parent_tab_id: string | null;
  visits: Array<{ visit: VisitNode; page: PageNode | null }>;
}

export interface TabTreeSession {
  session: SessionNode;
  tabs: TabTreeTab[];
}

export async function tabTreeForTag(
  g: GraphStore,
  tagSlug: string,
): Promise<TabTreeSession[]> {
  const tag = (await g.nodeByTagSlug(tagSlug)) as TagNode | undefined;
  if (!tag) return [];

  const result: TabTreeSession[] = [];

  for (const te of await g.inPoint(tag.id, 'tagged_with')) {
    const session = await g.getNode<SessionNode>(te.from_id);
    if (!session) continue;
    result.push(await buildTabTreeForSession(g, session));
  }

  return result;
}

// tabTreeForSession — same shape as `tabTreeForTag`, keyed by session id
// so a caller (e.g. the debug panel) can inspect an untagged session
// without needing a tag. Always returns a 1-element array on hit for API
// symmetry with `tabTreeForTag`.
export async function tabTreeForSession(
  g: GraphStore,
  sessionId: string,
): Promise<TabTreeSession[]> {
  const session = await g.getNode<SessionNode>(sessionId);
  if (!session || session.type !== 'Session') return [];
  return [await buildTabTreeForSession(g, session)];
}

async function buildTabTreeForSession(
  g: GraphStore,
  session: SessionNode,
): Promise<TabTreeSession> {
  const byTab = new Map<string, VisitNode[]>();
  for (const ve of await g.inInterval(session.id, 'in_session')) {
    const visit = await g.getNode<VisitNode>(ve.from_id);
    if (!visit) continue;
    const tabEdge = (await g.outInterval(visit.id, 'in_tab'))[0];
    if (!tabEdge) continue;
    const list = byTab.get(tabEdge.to_id) ?? [];
    list.push(visit);
    byTab.set(tabEdge.to_id, list);
  }

  const tabs: TabTreeTab[] = [];
  for (const [tabId, visits] of byTab) {
    const tab = await g.getNode<TabNode>(tabId);
    if (!tab) continue;

    visits.sort((a, b) => a.at_time - b.at_time);
    const firstVisit = visits[0];
    const parent_tab_id = firstVisit ? await parentTabFor(g, firstVisit) : null;

    const enriched: TabTreeTab['visits'] = [];
    for (const v of visits) {
      enriched.push({ visit: v, page: await pageForVisit(g, v) });
    }

    tabs.push({ tab, parent_tab_id, visits: enriched });
  }

  tabs.sort((a, b) => a.tab.opened_at - b.tab.opened_at);
  return { session, tabs };
}

// ---- 7. Recent sessions (dashboard-only summary primitive) ----
//
// Returns up to `limit` sessions, newest `started_at` first, each with
// the aggregated metadata the dashboard's Session Browser row needs.
//
// Session nodes carry `started_at` (not `at_time`), so they are absent
// from the (type, at_time) index. This primitive scans `nodesOfType`
// and sorts in memory. At personal scale (a few thousand sessions on a
// heavy year) this is fine; no schema change was worth adding a second
// temporal index for.
export interface RecentSessionRow {
  session: SessionNode;
  visit_count: number;
  page_count: number;
  tags: TagNode[];
  first_page_titles: string[];
}

export async function recentSessions(
  g: GraphStore,
  limit: number,
): Promise<RecentSessionRow[]> {
  if (limit <= 0) return [];

  const all = await g.nodesOfType<SessionNode>('Session');
  all.sort((a, b) => b.started_at - a.started_at);
  const top = all.slice(0, limit);

  const out: RecentSessionRow[] = [];
  for (const session of top) {
    const visitEdges = await g.inInterval(session.id, 'in_session');

    const seenVisits = new Set<string>();
    const visits: VisitNode[] = [];
    for (const ve of visitEdges) {
      if (seenVisits.has(ve.from_id)) continue;
      const v = await g.getNode<VisitNode>(ve.from_id);
      if (!v) continue;
      seenVisits.add(v.id);
      visits.push(v);
    }
    visits.sort((a, b) => a.at_time - b.at_time);

    const pageIds = new Set<string>();
    const firstThreeTitles: string[] = [];
    for (const v of visits) {
      const page = await pageForVisit(g, v);
      if (!page) continue;
      if (!pageIds.has(page.id)) {
        pageIds.add(page.id);
        if (firstThreeTitles.length < 3) {
          const title = page.title.trim() !== '' ? page.title : page.normalized_url;
          firstThreeTitles.push(title);
        }
      }
    }

    const tags: TagNode[] = [];
    for (const te of await g.outPoint(session.id, 'tagged_with')) {
      const tag = await g.getNode<TagNode>(te.to_id);
      if (tag) tags.push(tag);
    }

    out.push({
      session,
      visit_count: visits.length,
      page_count: pageIds.size,
      tags,
      first_page_titles: firstThreeTitles,
    });
  }

  return out;
}

// ---- 8. Every Visit in a Session (dashboard timeline scoped mode) ----
//
// Returns the Visits that have an `in_session` edge pointing at
// `sessionId`, together with each Visit's Page and its owning Tab.
// A Visit that spans a session boundary (e.g. v5 in the fixture)
// generates one edge per session; this primitive filters by session
// id so straddling visits appear only where they belong.
export interface VisitInSessionRow {
  visit: VisitNode;
  page: PageNode | null;
  tab: TabNode | null;
}

export async function visitsInSession(
  g: GraphStore,
  sessionId: string,
): Promise<VisitInSessionRow[]> {
  const session = await g.getNode<SessionNode>(sessionId);
  if (!session || session.type !== 'Session') return [];

  const visits: VisitNode[] = [];
  const seen = new Set<string>();
  for (const ve of await g.inInterval(session.id, 'in_session')) {
    if (seen.has(ve.from_id)) continue;
    const v = await g.getNode<VisitNode>(ve.from_id);
    if (!v) continue;
    seen.add(v.id);
    visits.push(v);
  }
  visits.sort((a, b) => a.at_time - b.at_time);

  const out: VisitInSessionRow[] = [];
  for (const v of visits) {
    const page = await pageForVisit(g, v);
    const tabEdge = (await g.outInterval(v.id, 'in_tab'))[0];
    const tab = tabEdge ? (await g.getNode<TabNode>(tabEdge.to_id)) ?? null : null;
    out.push({ visit: v, page, tab });
  }
  return out;
}

// ---- 9. Pages matching a text query (dashboard Page Search) ----
//
// Case-insensitive substring match against Page.title,
// Page.normalized_url, and Page.raw_url_first_seen. Full linear scan;
// at personal scale (thousands of pages) this stays under a millisecond.
// Empty / whitespace-only query returns an empty array — a "match
// everything" mode would flood the UI without user intent.
export async function pagesMatching(
  g: GraphStore,
  query: string,
): Promise<PageNode[]> {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];

  const all = await g.nodesOfType<PageNode>('Page');
  const hits: PageNode[] = [];
  for (const p of all) {
    if (
      p.title.toLowerCase().includes(needle) ||
      p.normalized_url.toLowerCase().includes(needle) ||
      p.raw_url_first_seen.toLowerCase().includes(needle)
    ) {
      hits.push(p);
    }
  }
  hits.sort((a, b) => b.last_seen - a.last_seen);
  return hits;
}

// ---- 10. Pages + inter-Page transitions on-screen in a window ----
//
// Walks every Visit whose interval overlaps `[tFrom, tTo]`, collects
// the distinct Pages they landed on, and reduces the Visit-level
// `navigated_from` / `opened_from` point edges to Page-level directed
// transitions with a count. The node-graph view uses this — Visit-
// level edges would fan out too far and rendering 500 visits of the
// same Page as 500 nodes buries structure.
export interface PageTransition {
  from_page_id: string;
  to_page_id: string;
  kind: 'navigated_from' | 'opened_from';
  count: number;
}

export interface PagesAndTransitionsResult {
  pages: PageNode[];
  transitions: PageTransition[];
}

export async function pagesAndTransitionsBetween(
  g: GraphStore,
  tFrom: number,
  tTo: number,
): Promise<PagesAndTransitionsResult> {
  const visitRows = await visitsOnScreenBetween(g, tFrom, tTo);

  const pagesById = new Map<string, PageNode>();
  const visitToPageId = new Map<string, string>();
  for (const row of visitRows) {
    if (row.page) {
      pagesById.set(row.page.id, row.page);
      visitToPageId.set(row.visit.id, row.page.id);
    }
  }

  const transitionKey = (from: string, to: string, kind: string) =>
    `${kind}::${from}->${to}`;
  const transitions = new Map<string, PageTransition>();

  // When an edge points at a parent visit outside the current window (very
  // common: `opened_from` always points backward, and the opener is
  // typically older than tFrom), we still want the parent Page in the graph
  // so the edge is drawable. Cache lookups by parent visit id.
  const externalParentPageId = new Map<string, string | null>();
  async function resolveParentPageId(parentVisitId: string): Promise<string | null> {
    if (externalParentPageId.has(parentVisitId)) {
      return externalParentPageId.get(parentVisitId) ?? null;
    }
    const parentVisit = await g.getNode<VisitNode>(parentVisitId);
    if (!parentVisit) {
      externalParentPageId.set(parentVisitId, null);
      return null;
    }
    const parentPageEdge = (await g.outInterval(parentVisit.id, 'of_page'))[0];
    if (!parentPageEdge) {
      externalParentPageId.set(parentVisitId, null);
      return null;
    }
    const parentPage = await g.getNode<PageNode>(parentPageEdge.to_id);
    if (!parentPage) {
      externalParentPageId.set(parentVisitId, null);
      return null;
    }
    pagesById.set(parentPage.id, parentPage);
    visitToPageId.set(parentVisit.id, parentPage.id);
    externalParentPageId.set(parentVisitId, parentPage.id);
    return parentPage.id;
  }

  for (const row of visitRows) {
    const toPageId = visitToPageId.get(row.visit.id);
    if (!toPageId) continue;

    for (const kind of ['navigated_from', 'opened_from'] as const) {
      for (const edge of await g.outPoint(row.visit.id, kind)) {
        let fromPageId = visitToPageId.get(edge.to_id);
        if (!fromPageId) {
          const resolved = await resolveParentPageId(edge.to_id);
          if (!resolved) continue;
          fromPageId = resolved;
        }
        if (fromPageId === toPageId) continue;
        const key = transitionKey(fromPageId, toPageId, kind);
        const existing = transitions.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          transitions.set(key, {
            from_page_id: fromPageId,
            to_page_id: toPageId,
            kind,
            count: 1,
          });
        }
      }
    }
  }

  const pages = Array.from(pagesById.values()).sort(
    (a, b) => a.first_seen - b.first_seen,
  );
  return { pages, transitions: Array.from(transitions.values()) };
}

// ---- Internal helpers ----

async function pageForVisit(g: GraphStore, v: VisitNode): Promise<PageNode | null> {
  const pageEdge = (await g.outInterval(v.id, 'of_page'))[0];
  if (!pageEdge) return null;
  return (await g.getNode<PageNode>(pageEdge.to_id)) ?? null;
}

async function parentTabFor(g: GraphStore, visit: VisitNode): Promise<string | null> {
  const openedFrom = (await g.outPoint(visit.id, 'opened_from'))[0];
  if (!openedFrom) return null;
  const parentVisit = await g.getNode<VisitNode>(openedFrom.to_id);
  if (!parentVisit) return null;
  const tabEdge = (await g.outInterval(parentVisit.id, 'in_tab'))[0];
  return tabEdge?.to_id ?? null;
}

// ---- Tab-load view queries ----
//
// Answers "how many tabs and windows do I have open, is the count trending
// up or down, and which tabs sit in which window right now?" Used by the
// Tab Load dashboard view. Runs on the same graph nodes the ingest layer
// already populates (Tab.opened_at/closed_at, Window.opened_at/closed_at,
// in_window / in_tab edges).

export interface OpenCountsSample {
  at: number;
  tab_count: number;
  window_count: number;
}

/**
 * Sample open-tab and open-window counts across [tFrom, tTo] at `samples+1`
 * evenly-spaced instants. A tab or window is "open at t" iff
 *   opened_at <= t AND (closed_at == null OR closed_at > t)
 *
 * Deliberately in-memory — personal-scale data is hundreds to low thousands
 * of tabs; O(N * samples) is trivial.
 */
export async function openCountsBetween(
  g: GraphStore,
  tFrom: number,
  tTo: number,
  samples = 60,
): Promise<OpenCountsSample[]> {
  if (tTo <= tFrom || samples <= 0) return [];
  const tabs = await g.nodesOfType<TabNode>('Tab');
  const windows = await g.nodesOfType<WindowNode>('Window');

  const step = (tTo - tFrom) / samples;
  const out: OpenCountsSample[] = [];
  for (let i = 0; i <= samples; i++) {
    const at = tFrom + i * step;
    let tab_count = 0;
    for (const t of tabs) {
      if (t.opened_at > at) continue;
      if (t.closed_at != null && t.closed_at <= at) continue;
      tab_count++;
    }
    let window_count = 0;
    for (const w of windows) {
      if (w.opened_at > at) continue;
      if (w.closed_at != null && w.closed_at <= at) continue;
      window_count++;
    }
    out.push({ at, tab_count, window_count });
  }
  return out;
}

export interface OpenTabRow {
  tab: TabNode;
  window_id: string;
  current_page: PageNode | null;
  current_visit: VisitNode | null;
}

export interface OpenWindowGroup {
  window: WindowNode;
  tabs: OpenTabRow[];
}

/**
 * Right-now snapshot of currently-open tabs grouped by window. "Currently
 * open" is a Tab with `closed_at == null`. Every such Tab is included —
 * we don't require its `in_window` edge to point at an open Window,
 * because reconciliation may have closed a duplicate Window without
 * reparenting the Tab. To keep the display coherent we re-route each Tab
 * to any live Window with the same `browser_window_id`, falling back to
 * the referenced (possibly closed) Window when no live match exists.
 *
 * For each open Tab, the current page is the Visit with the greatest
 * `at_time` in that tab (typically its `ended_at == null` visit).
 */
export async function openTabsGrouped(g: GraphStore): Promise<OpenWindowGroup[]> {
  const openTabs = (await g.nodesOfType<TabNode>('Tab')).filter(
    (t) => t.closed_at == null,
  );
  const allWindows = await g.nodesOfType<WindowNode>('Window');
  const windowsById = new Map(allWindows.map((w) => [w.id, w]));
  const liveByBrowserWindowId = new Map<number, WindowNode>();
  for (const w of allWindows) {
    if (w.closed_at != null) continue;
    const existing = liveByBrowserWindowId.get(w.browser_window_id);
    if (!existing || existing.opened_at < w.opened_at) {
      liveByBrowserWindowId.set(w.browser_window_id, w);
    }
  }
  const groups = new Map<string, OpenTabRow[]>();
  const groupWindow = new Map<string, WindowNode>();

  for (const tab of openTabs) {
    const windowEdge = (await g.outInterval(tab.id, 'in_window'))[0];
    if (!windowEdge) continue;
    const referenced = windowsById.get(windowEdge.to_id);
    if (!referenced) continue;
    const resolvedWindow =
      liveByBrowserWindowId.get(referenced.browser_window_id) ?? referenced;

    const visitEdges = await g.inInterval(tab.id, 'in_tab');
    let currentVisit: VisitNode | null = null;
    for (const e of visitEdges) {
      const v = await g.getNode<VisitNode>(e.from_id);
      if (!v) continue;
      if (!currentVisit || v.at_time > currentVisit.at_time) currentVisit = v;
    }
    let currentPage: PageNode | null = null;
    if (currentVisit) {
      const pageEdge = (await g.outInterval(currentVisit.id, 'of_page'))[0];
      if (pageEdge) {
        currentPage = (await g.getNode<PageNode>(pageEdge.to_id)) ?? null;
      }
    }

    const row: OpenTabRow = {
      tab,
      window_id: resolvedWindow.id,
      current_page: currentPage,
      current_visit: currentVisit,
    };
    const bucket = groups.get(resolvedWindow.id);
    if (bucket) bucket.push(row);
    else {
      groups.set(resolvedWindow.id, [row]);
      groupWindow.set(resolvedWindow.id, resolvedWindow);
    }
  }

  const result: OpenWindowGroup[] = [];
  for (const [window_id, tabRows] of groups) {
    tabRows.sort((a, b) => a.tab.opened_at - b.tab.opened_at);
    const window = groupWindow.get(window_id);
    if (window) result.push({ window, tabs: tabRows });
  }
  result.sort((a, b) => a.window.opened_at - b.window.opened_at);
  return result;
}

// ---- Window/Tab/Visit tree in a time window ----
//
// Hierarchical structure for the Node Graph view. Answers "for the browsing
// I did between tFrom and tTo, show me every Window I had open, every Tab
// inside those Windows, and every Visit inside each Tab in chronological
// order." Used to place visits in nested vertical lanes and to draw the
// causal arrows (navigated_from within a tab, opened_from across tabs).

export interface WindowTabVisitTab {
  tab: TabNode;
  visits: { visit: VisitNode; page: PageNode | null }[];
}

export interface WindowTabVisitWindow {
  window: WindowNode;
  tabs: WindowTabVisitTab[];
}

/**
 * A window is "in-window" if its lifetime intersects [tFrom, tTo]:
 *   opened_at <= tTo AND (closed_at == null OR closed_at > tFrom)
 * Same rule for a Tab and a Visit. A Visit is placed under the Tab named
 * by its `in_tab` edge; a Tab is placed under the Window named by its
 * `in_window` edge. Empty Tabs and empty Windows are omitted so the graph
 * doesn't grow lanes for containers with nothing to show.
 */
export async function windowsWithVisitsBetween(
  g: GraphStore,
  tFrom: number,
  tTo: number,
): Promise<WindowTabVisitWindow[]> {
  const overlaps = (
    opened: number,
    closed: number | null,
  ): boolean => opened <= tTo && (closed == null || closed > tFrom);

  const windows = (await g.nodesOfType<WindowNode>('Window')).filter((w) =>
    overlaps(w.opened_at, w.closed_at),
  );
  const tabs = (await g.nodesOfType<TabNode>('Tab')).filter((t) =>
    overlaps(t.opened_at, t.closed_at),
  );
  const visits = (await g.nodesOfType<VisitNode>('Visit')).filter((v) =>
    overlaps(v.at_time, v.ended_at),
  );

  const visitsByTab = new Map<string, { visit: VisitNode; page: PageNode | null }[]>();
  for (const visit of visits) {
    const tabEdge = (await g.outInterval(visit.id, 'in_tab'))[0];
    if (!tabEdge) continue;
    const tabId = tabEdge.to_id;
    const pageEdge = (await g.outInterval(visit.id, 'of_page'))[0];
    const page = pageEdge ? ((await g.getNode<PageNode>(pageEdge.to_id)) ?? null) : null;
    const bucket = visitsByTab.get(tabId);
    if (bucket) bucket.push({ visit, page });
    else visitsByTab.set(tabId, [{ visit, page }]);
  }

  const tabsByWindow = new Map<string, WindowTabVisitTab[]>();
  for (const tab of tabs) {
    const tabVisits = visitsByTab.get(tab.id) ?? [];
    // Only include tabs that actually have captured browsing. Landed on
    // this rule after iterating: empty tab rows visible in the label
    // pane read as noise, and users need dot-content to make the row
    // useful. The toolbar exposes the "N with browsing / M open" ratio
    // so the count discrepancy vs. the Tabs view stays legible.
    if (tabVisits.length === 0) continue;
    tabVisits.sort((a, b) => a.visit.at_time - b.visit.at_time);
    const winEdge = (await g.outInterval(tab.id, 'in_window'))[0];
    if (!winEdge) continue;
    const winId = winEdge.to_id;
    const entry: WindowTabVisitTab = { tab, visits: tabVisits };
    const bucket = tabsByWindow.get(winId);
    if (bucket) bucket.push(entry);
    else tabsByWindow.set(winId, [entry]);
  }

  const result: WindowTabVisitWindow[] = [];
  for (const window of windows) {
    const winTabs = tabsByWindow.get(window.id);
    if (!winTabs || winTabs.length === 0) continue;
    winTabs.sort((a, b) => a.tab.opened_at - b.tab.opened_at);
    result.push({ window, tabs: winTabs });
  }
  result.sort((a, b) => a.window.opened_at - b.window.opened_at);
  return result;
}
