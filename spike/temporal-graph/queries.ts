// The five target queries. Each is written to look like production code — if
// a query gets ugly here, the schema is wrong. Time filtering is inline
// (what a real IndexedDB implementation would do inside a cursor loop).

import type {
  AnyEdge,
  IntervalEdge,
  PageNode,
  SessionNode,
  TabNode,
  TagNode,
  VisitNode,
} from './types.js';
import { GraphStore } from './store.js';

// ---- 1. Point traversal: pages I opened from <domain> in [from, to] ----
//
// "Opened from" = a Visit whose `opened_from` edge points to a Visit whose
// page is on <domain>. Time filter on the child visit's at_time.
export function pagesOpenedFromDomain(
  g: GraphStore,
  hostname: string,
  from: number,
  to: number,
): Array<{ visit: VisitNode; page: PageNode; parent_page: PageNode }> {
  const out: Array<{ visit: VisitNode; page: PageNode; parent_page: PageNode }> = [];

  const domain = g.nodesOfType('Domain').find(d =>
    (d as { hostname?: string }).hostname === hostname);
  if (!domain) return out;

  // All Pages on this domain
  const pagesOnDomain = new Set(
    g.inInterval(domain.id, 'on_domain').map(e => e.from_id),
  );

  // Every opened_from edge: child_visit → parent_visit
  for (const e of g.edgesOfType('opened_from')) {
    if (e.kind !== 'point') continue;
    if (e.at_time < from || e.at_time > to) continue;

    const parentVisit = g.getNode<VisitNode>(e.to_id);
    if (!parentVisit) continue;

    // Parent visit's Page (via of_page interval edge)
    const parentPageEdge = g.outInterval(parentVisit.id, 'of_page')[0];
    if (!parentPageEdge) continue;
    if (!pagesOnDomain.has(parentPageEdge.to_id)) continue;

    const childVisit = g.getNode<VisitNode>(e.from_id);
    if (!childVisit) continue;
    const childPageEdge = g.outInterval(childVisit.id, 'of_page')[0];
    if (!childPageEdge) continue;

    const childPage = g.getNode<PageNode>(childPageEdge.to_id);
    const parentPage = g.getNode<PageNode>(parentPageEdge.to_id);
    if (!childPage || !parentPage) continue;

    out.push({ visit: childVisit, page: childPage, parent_page: parentPage });
  }

  return out;
}

// ---- 2. Interval query: what was I focused on at time T? ----
//
// The focused visit at T is the visit whose focus_intervals contain T.
// Since focus is exclusive, there's at most one. This is a scan over
// visits whose [at_time, ended_at] contains T — in a real impl you'd
// use a range index on Visit.at_time and clip.
export function visitFocusedAt(
  g: GraphStore,
  t: number,
): { visit: VisitNode; page: PageNode | null } | null {
  for (const v of g.nodesOfType<VisitNode>('Visit')) {
    if (v.at_time > t) continue;
    if (v.ended_at != null && v.ended_at < t) continue;
    const contained = v.focus_intervals.some(fi =>
      fi.start <= t && (fi.end == null || fi.end >= t));
    if (!contained) continue;

    const pageEdge = g.outInterval(v.id, 'of_page')[0];
    const page = pageEdge ? g.getNode<PageNode>(pageEdge.to_id) ?? null : null;
    return { visit: v, page };
  }
  return null;
}

// ---- 3. Retroactive edit: visits in a tagged session whose event time
//        is BEFORE the tag was applied (event-time vs. recorded-at) ----
//
// For every tagged_with edge into <tagSlug>:
//   - Find sessions carrying that tag
//   - For each session, list Visits linked via in_session
//   - Keep those whose Visit.at_time < tagged_with.at_time
//     (i.e., they happened before the tag was applied)
export function visitsInTagPredatingTag(
  g: GraphStore,
  tagSlug: string,
): Array<{
  session: SessionNode;
  tag: TagNode;
  tag_applied_at: number;
  visit: VisitNode;
  page: PageNode | null;
}> {
  const out: Array<{
    session: SessionNode;
    tag: TagNode;
    tag_applied_at: number;
    visit: VisitNode;
    page: PageNode | null;
  }> = [];

  const tag = g.nodesOfType<TagNode>('Tag').find(t => t.slug === tagSlug);
  if (!tag) return out;

  for (const te of g.inPoint(tag.id, 'tagged_with')) {
    const session = g.getNode<SessionNode>(te.from_id);
    if (!session) continue;

    for (const ve of g.inInterval(session.id, 'in_session')) {
      const visit = g.getNode<VisitNode>(ve.from_id);
      if (!visit) continue;
      if (visit.at_time >= te.at_time) continue;

      const pageEdge = g.outInterval(visit.id, 'of_page')[0];
      const page = pageEdge ? g.getNode<PageNode>(pageEdge.to_id) ?? null : null;
      out.push({ session, tag, tag_applied_at: te.at_time, visit, page });
    }
  }
  return out;
}

// ---- 4. Time adjacency: what did I look at in the N ms before this visit ----
//
// Walk `navigated_from` backwards from the given visit until we exhaust
// the chain or step outside the window. Include cross-tab predecessor
// via opened_from (the visit that spawned this tab).
export function visitsBefore(
  g: GraphStore,
  visitId: string,
  windowMs: number,
): Array<{ visit: VisitNode; page: PageNode | null; delta_ms: number }> {
  const anchor = g.getNode<VisitNode>(visitId);
  if (!anchor) return [];

  const out: Array<{ visit: VisitNode; page: PageNode | null; delta_ms: number }> = [];
  const cutoff = anchor.at_time - windowMs;

  const walk = (fromVisitId: string) => {
    // Prefer the intra-tab predecessor; fall back to opened_from
    const prev =
      g.outPoint(fromVisitId, 'navigated_from')[0] ??
      g.outPoint(fromVisitId, 'opened_from')[0];
    if (!prev) return;

    const v = g.getNode<VisitNode>(prev.to_id);
    if (!v) return;
    if (v.at_time < cutoff) return;

    const pageEdge = g.outInterval(v.id, 'of_page')[0];
    const page = pageEdge ? g.getNode<PageNode>(pageEdge.to_id) ?? null : null;
    out.push({ visit: v, page, delta_ms: anchor.at_time - v.at_time });
    walk(v.id);
  };

  walk(visitId);
  return out;
}

// ---- 5. Structural + temporal: reconstruct tab-tree for a tagged session ----
//
// Return, for each Tab that hosted any Visit inside the session:
//   - The Tab
//   - Its Visits inside the session, in order
//   - Parent Tab (via opened_from → parent Visit → its in_tab)
export function tabTreeForTag(
  g: GraphStore,
  tagSlug: string,
): Array<{
  session: SessionNode;
  tabs: Array<{
    tab: TabNode;
    parent_tab_id: string | null;
    visits: Array<{ visit: VisitNode; page: PageNode | null }>;
  }>;
}> {
  const tag = g.nodesOfType<TagNode>('Tag').find(t => t.slug === tagSlug);
  if (!tag) return [];

  const result: ReturnType<typeof tabTreeForTag> = [];

  for (const te of g.inPoint(tag.id, 'tagged_with')) {
    const session = g.getNode<SessionNode>(te.from_id);
    if (!session) continue;

    // All visits in session, grouped by their in_tab edge's to_id
    const byTab = new Map<string, VisitNode[]>();
    for (const ve of g.inInterval(session.id, 'in_session')) {
      const visit = g.getNode<VisitNode>(ve.from_id);
      if (!visit) continue;
      const tabEdge = g.outInterval(visit.id, 'in_tab')[0];
      if (!tabEdge) continue;
      const list = byTab.get(tabEdge.to_id) ?? [];
      list.push(visit);
      byTab.set(tabEdge.to_id, list);
    }

    const tabs: Array<{
      tab: TabNode;
      parent_tab_id: string | null;
      visits: Array<{ visit: VisitNode; page: PageNode | null }>;
    }> = [];

    for (const [tabId, visits] of byTab) {
      const tab = g.getNode<TabNode>(tabId);
      if (!tab) continue;

      visits.sort((a, b) => a.at_time - b.at_time);
      const firstVisit = visits[0];
      const parent_tab_id =
        firstVisit && parentTabFor(g, firstVisit) || null;

      const enriched = visits.map(v => {
        const pe = g.outInterval(v.id, 'of_page')[0];
        return { visit: v, page: pe ? g.getNode<PageNode>(pe.to_id) ?? null : null };
      });

      tabs.push({ tab, parent_tab_id, visits: enriched });
    }

    tabs.sort((a, b) => a.tab.opened_at - b.tab.opened_at);
    result.push({ session, tabs });
  }

  return result;
}

function parentTabFor(g: GraphStore, visit: VisitNode): string | null {
  const openedFrom = g.outPoint(visit.id, 'opened_from')[0];
  if (!openedFrom) return null;
  const parentVisit = g.getNode<VisitNode>(openedFrom.to_id);
  if (!parentVisit) return null;
  const tabEdge = g.outInterval(parentVisit.id, 'in_tab')[0];
  return tabEdge?.to_id ?? null;
}
