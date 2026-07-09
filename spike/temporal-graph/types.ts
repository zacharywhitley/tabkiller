// Temporal graph schema — spike edition.
//
// Every timestamp is milliseconds since epoch, UTC, integer.
// Every entity carries `recorded_at` (when we wrote it) in addition to
// its event/validity time. That's the light-bitemporality discipline:
// retroactive edits change what we say happened, not when we heard.

export type NodeType =
  | 'Page'
  | 'Visit'
  | 'Tab'
  | 'Window'
  | 'Session'
  | 'Domain'
  | 'Tag'
  | 'SearchQuery';

// ---- Nodes ----

interface NodeBase {
  id: string;
  type: NodeType;
  recorded_at: number;
}

export interface PageNode extends NodeBase {
  type: 'Page';
  normalized_url: string;   // identity: strip UTM/fbclid/gclid, lowercase host
  raw_url_first_seen: string;
  title: string;
  first_seen: number;
  last_seen: number;
  visit_count: number;
}

// Focus intervals live on the Visit as a materialized list. Upstream, they
// are derived from tabs.onActivated / windows.onFocusChanged event streams,
// but the read model wants direct range checks, not a scan of the log.
// `end` = null means "still focused / visit hasn't ended".
export interface FocusInterval {
  start: number;
  end: number | null;
}

export interface VisitNode extends NodeBase {
  type: 'Visit';
  at_time: number;              // when the visit started
  ended_at: number | null;      // when navigation left the page (or tab closed)
  focus_intervals: FocusInterval[];
  transition:                    // from webNavigation.transitionType
    | 'link'
    | 'typed'
    | 'form_submit'
    | 'auto_bookmark'
    | 'reload'
    | 'back_forward'
    | 'generated'
    | 'unknown';
}

export interface TabNode extends NodeBase {
  type: 'Tab';
  opened_at: number;
  closed_at: number | null;
  browser_tab_id: number;       // transient, useful for debugging only
}

export interface WindowNode extends NodeBase {
  type: 'Window';
  opened_at: number;
  closed_at: number | null;
  browser_window_id: number;
}

export interface SessionNode extends NodeBase {
  type: 'Session';
  started_at: number;
  ended_at: number | null;
  detected_by: 'idle' | 'domain_shift' | 'manual' | 'session_restore';
  title: string | null;
}

export interface DomainNode extends NodeBase {
  type: 'Domain';
  hostname: string;
  first_seen: number;
}

export interface TagNode extends NodeBase {
  type: 'Tag';
  slug: string;
  label: string;
  created_at: number;
}

export interface SearchQueryNode extends NodeBase {
  type: 'SearchQuery';
  engine: 'google' | 'bing' | 'ddg' | 'youtube' | 'other';
  query_text: string;
  results_url: string;
}

export type AnyNode =
  | PageNode
  | VisitNode
  | TabNode
  | WindowNode
  | SessionNode
  | DomainNode
  | TagNode
  | SearchQueryNode;

// ---- Edges ----
//
// Two shapes:
//   PointEdge    — an event happened at `at_time`
//   IntervalEdge — a state held from `valid_from` to `valid_to` (null = still true)
//
// Every edge is append-only. Retroactive changes create new edges; they
// never mutate old ones. `recorded_at` diverges from event time when the
// edge is added after the fact (retroactive tag, LLM-derived relation, etc.).

export type PointEdgeType =
  | 'navigated_from'   // Visit -> Visit (previous visit in same tab)
  | 'opened_from'      // Visit -> Visit (visit in parent tab that spawned this tab)
  | 'arrived_via'      // Visit -> SearchQuery
  | 'tagged_with';     // Session -> Tag  (edge, not string prop)

export type IntervalEdgeType =
  | 'of_page'          // Visit -> Page       (state held for visit duration)
  | 'in_tab'           // Visit -> Tab        (state held for visit duration)
  | 'in_session'       // Visit -> Session    (state held for visit duration)
  | 'in_window'        // Tab -> Window       (state held for tab lifetime)
  | 'on_domain';       // Page -> Domain      (permanent, valid_to always null)

export type EdgeType = PointEdgeType | IntervalEdgeType;

interface EdgeBase {
  id: string;
  from_id: string;
  to_id: string;
  recorded_at: number;
}

export interface PointEdge extends EdgeBase {
  kind: 'point';
  type: PointEdgeType;
  at_time: number;
}

export interface IntervalEdge extends EdgeBase {
  kind: 'interval';
  type: IntervalEdgeType;
  valid_from: number;
  valid_to: number | null;
}

export type AnyEdge = PointEdge | IntervalEdge;

// Convenience: type-narrowed lookups
export function isPointEdge(e: AnyEdge): e is PointEdge {
  return e.kind === 'point';
}
export function isIntervalEdge(e: AnyEdge): e is IntervalEdge {
  return e.kind === 'interval';
}
