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
