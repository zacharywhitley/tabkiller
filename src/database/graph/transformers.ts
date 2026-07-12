/**
 * Per-event-type transformers for the graph ingest pipeline.
 *
 * Each transformer takes a `BrowsingEvent` from the LocalEventStore outbox
 * and an `IngestContext` (which exposes read-only graph lookups plus the
 * ingest's in-memory state) and returns the atomic `GraphWriteBatch` that
 * represents the event's contribution to the graph.
 *
 * Transformers do not mutate the graph directly — the caller (ingest.ts)
 * feeds the returned batch into `GraphStore.writeBatch`. This keeps each
 * event's transformation observable and atomic.
 *
 * Identifiers are derived deterministically so replays produce the same
 * records: node ids come from the driving event id (or a stable natural
 * key like normalized_url / hostname / slug), and edge ids concatenate
 * `edge_<sourceEventId>_<edgeType>_<index>`.
 */

import type { BrowsingEvent, EventType } from '../../shared/types';
import { normalizeUrl } from '../../utils/url';
import type {
  AnyEdge,
  AnyNode,
  DomainNode,
  FocusInterval,
  IntervalEdge,
  PageNode,
  PointEdge,
  SearchQueryNode,
  SessionNode,
  TabNode,
  TagNode,
  VisitNode,
  WindowNode,
} from './types';
import type { GraphWriteBatch } from './store';

// ---- Context ----

export interface IngestContext {
  // Deterministic time source (injectable for tests).
  now: () => number;

  // Ingest-owned in-memory state (buffers, pointers).
  previousVisitInTab: (browserTabId: number) => string | null;
  consumeOpenerBuffer: (browserTabId: number) => string | null;
  putOpenerBuffer: (browserTabId: number, openerVisitId: string) => void;
  consumeSearchBuffer: (browserTabId: number) => string | null;
  putSearchBuffer: (browserTabId: number, searchQueryId: string) => void;
  currentSessionId: () => string | null;
  setCurrentSessionId: (id: string | null) => void;
  currentlyFocusedVisitId: () => string | null;
  setCurrentlyFocusedVisitId: (id: string | null) => void;

  // Async read lookups against GraphStore.
  findPage: (normalizedUrl: string) => Promise<PageNode | undefined>;
  findDomain: (hostname: string) => Promise<DomainNode | undefined>;
  findTag: (slug: string) => Promise<TagNode | undefined>;
  findVisit: (visitId: string) => Promise<VisitNode | undefined>;
  findSession: (sessionId: string) => Promise<SessionNode | undefined>;
  findWindow: (windowId: string) => Promise<WindowNode | undefined>;
  findSearchQuery: (searchQueryId: string) => Promise<SearchQueryNode | undefined>;
  findTabByBrowserTabId: (browserTabId: number) => Promise<TabNode | undefined>;
  findWindowByBrowserWindowId: (browserWindowId: number) => Promise<WindowNode | undefined>;

  // Query helpers for edge close-out.
  activeIntervalEdgesFromVisit: (visitId: string) => Promise<IntervalEdge[]>;
  activeInSessionEdgesForSession: (sessionId: string) => Promise<IntervalEdge[]>;
  activeInWindowEdgeForTab: (tabId: string) => Promise<IntervalEdge | undefined>;
  activeVisits: () => Promise<VisitNode[]>;
  tabsInWindow: (windowId: string) => Promise<TabNode[]>;

  // Structured log sink for unknown/missing references.
  warn: (message: string, context: Record<string, unknown>) => void;
}

// ---- Id builders ----

export function visitNodeId(eventId: string): string {
  return `visit_${eventId}`;
}

export function tabNodeId(eventId: string): string {
  return `tab_${eventId}`;
}

export function sessionNodeId(eventId: string): string {
  return `session_${eventId}`;
}

export function tagNodeId(slug: string): string {
  return `tag_${slug}`;
}

export function pageNodeId(normalizedUrl: string): string {
  return `page_${stableHash(normalizedUrl)}`;
}

export function domainNodeId(hostname: string): string {
  return `domain_${hostname}`;
}

export function windowNodeId(browserWindowId: number): string {
  return `window_${browserWindowId}`;
}

export function searchQueryNodeId(engine: SearchQueryNode['engine'], queryText: string): string {
  return `searchquery_${engine}_${stableHash(queryText.trim().toLowerCase())}`;
}

export function edgeId(sourceEventId: string, edgeType: string, index = 0): string {
  return `edge_${sourceEventId}_${edgeType}_${index}`;
}

/**
 * FNV-1a 32-bit hash rendered as base36. Deterministic across service-worker
 * restarts and process boundaries — the store's node-id dedup guarantee
 * depends on it. Not cryptographic; the low collision rate on 32 bits is
 * adequate for our identity purposes at browser-history scale.
 */
function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// ---- Search-engine detection ----

interface SearchEngineHit {
  engine: SearchQueryNode['engine'];
  queryText: string;
}

const SEARCH_ENGINE_MATCHERS: Array<{
  test: (url: URL) => boolean;
  engine: SearchQueryNode['engine'];
  queryParam: string;
}> = [
  { test: (u) => /(^|\.)google\./.test(u.hostname) && u.pathname === '/search', engine: 'google', queryParam: 'q' },
  { test: (u) => /(^|\.)bing\./.test(u.hostname) && u.pathname === '/search', engine: 'bing', queryParam: 'q' },
  { test: (u) => /(^|\.)duckduckgo\./.test(u.hostname) && u.pathname === '/', engine: 'ddg', queryParam: 'q' },
  { test: (u) => /(^|\.)youtube\./.test(u.hostname) && u.pathname === '/results', engine: 'youtube', queryParam: 'search_query' },
];

export function detectSearchEngine(rawUrl: string): SearchEngineHit | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  for (const m of SEARCH_ENGINE_MATCHERS) {
    if (!m.test(url)) continue;
    const q = url.searchParams.get(m.queryParam);
    if (q && q.trim().length > 0) {
      return { engine: m.engine, queryText: q };
    }
  }
  return null;
}

// ---- Small helpers ----

function hostnameOf(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return null;
  }
}

/**
 * Map a raw `webNavigation.TransitionType` value to the graph schema's
 * VisitNode.transition enum.
 *
 * Chrome and Firefox both emit the WHATWG-agreed core set — `link`,
 * `typed`, `auto_bookmark`, `manual_subframe`, `generated`, `start_page`,
 * `form_submit`, `reload`, `keyword`, `keyword_generated` — plus a few
 * extras. Our schema does not distinguish `keyword` from typed URL-bar
 * navigation (both feel like typed to the user), and `start_page` is
 * modeled as a browser default so it is neither a link nor typed — we
 * mark it `unknown`.
 *
 * Anything else (including a missing value) surfaces as `unknown` and
 * emits a `warn` on the ingest context so a future extension of the
 * schema is prompted rather than silently swallowed.
 */
function mapTransition(
  t: string | undefined,
  ctx: IngestContext,
  eventId: string,
): VisitNode['transition'] {
  switch (t) {
    case 'link':
    case 'typed':
    case 'form_submit':
    case 'auto_bookmark':
    case 'reload':
    case 'generated':
      return t;
    case 'bookmark':
      return 'auto_bookmark';
    case 'back_forward':
      return 'back_forward';
    case 'keyword':
    case 'keyword_generated':
      // URL-bar keyword expansion — user typed a keyword that expanded
      // to a URL. Semantically closer to `typed` than to `link`.
      return 'typed';
    case 'manual_subframe':
    case 'auto_subframe':
      // Sub-frame navigations should not reach this transformer — the
      // service worker filters frameId !== 0. If it slips through, mark
      // it unknown rather than pretend it was a real user navigation.
      return 'unknown';
    case 'start_page':
      // Browser-default landing page (chrome://newtab, home page, etc).
      // Not a real navigation the user picked.
      return 'unknown';
    case undefined:
    case null:
    case '':
      return 'unknown';
    default:
      // Unknown value — do NOT silently default to `typed`. Log so we
      // notice a new Chrome/Firefox transition type and extend the map.
      ctx.warn('navigation_committed unknown transitionType', {
        eventId,
        transitionType: t,
      });
      return 'unknown';
  }
}

function closeTrailingFocusInterval(
  intervals: readonly FocusInterval[],
  endAt: number,
): FocusInterval[] {
  const result = intervals.map((iv) => ({ ...iv }));
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].end === null) {
      result[i].end = endAt;
      break;
    }
  }
  return result;
}

function sanitizeSlug(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const cleaned = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return cleaned.length > 0 ? cleaned : undefined;
}

function readDetectedBy(metadata: BrowsingEvent['metadata']): SessionNode['detected_by'] {
  const value = metadata?.detectedBy as string | undefined;
  switch (value) {
    case 'idle':
    case 'domain_shift':
    case 'manual':
    case 'session_restore':
      return value;
    default:
      return 'manual';
  }
}

/**
 * Deterministic per-visit index for the `session_started` fan-out. Two
 * distinct visits produce distinct indices so edge ids do not collide;
 * running the same session_started event again re-derives the same indices.
 */
function hashIndex(visitId: string): number {
  let h = 0;
  for (let i = 0; i < visitId.length; i++) {
    h = (h * 31 + visitId.charCodeAt(i)) >>> 0;
  }
  return h;
}

// ---- Dispatcher ----

/**
 * Dispatch to the type-specific transformer. Unknown event types resolve to
 * an empty batch so the drain marks them drained instead of stalling — the
 * outbox may legitimately hold event types the graph does not model.
 */
export async function transformEvent(
  event: BrowsingEvent,
  ctx: IngestContext,
): Promise<GraphWriteBatch> {
  const type = event.type as EventType;
  switch (type) {
    case 'tab_created':
      return transformTabCreated(event, ctx);
    case 'tab_updated':
      return transformTabUpdated(event, ctx);
    case 'tab_removed':
      return transformTabRemoved(event, ctx);
    case 'window_removed':
      return transformWindowRemoved(event, ctx);
    case 'navigation_committed':
      return transformNavigationCommitted(event, ctx);
    case 'focus_transition':
      return transformFocusTransition(event, ctx);
    case 'session_started':
      return transformSessionStarted(event, ctx);
    case 'session_ended':
      return transformSessionEnded(event, ctx);
    case 'tag_applied':
      return transformTagApplied(event, ctx);
    case 'tag_removed':
      return transformTagRemoved(event, ctx);
    default:
      return {};
  }
}

// ---- tab_created ----

export async function transformTabCreated(
  event: BrowsingEvent,
  ctx: IngestContext,
): Promise<GraphWriteBatch> {
  if (event.tabId === undefined || event.windowId === undefined) {
    ctx.warn('tab_created missing tabId or windowId', { eventId: event.id });
    return {};
  }

  const now = ctx.now();
  const nodes: AnyNode[] = [];
  const edges: AnyEdge[] = [];

  // Idempotency: bootstrap flows (initializeCurrentTabs on every SW start)
  // fire tab_created for every live browser tab, so without this check the
  // graph would gain a duplicate Tab node per browser tab on every SW
  // restart. If an open Tab with this browser_tab_id already exists, keep
  // it and skip the create (opener buffering below still runs).
  const existingTab = await ctx.findTabByBrowserTabId(event.tabId);
  const alreadyOpen = existingTab != null && existingTab.closed_at == null;

  const tabId = alreadyOpen ? existingTab!.id : tabNodeId(event.id);
  if (!alreadyOpen) {
    const tab: TabNode = {
      id: tabId,
      type: 'Tab',
      recorded_at: now,
      opened_at: event.timestamp,
      closed_at: null,
      browser_tab_id: event.tabId,
    };
    nodes.push(tab);
  }

  // Same idempotency for the lazy Window creation — a Window whose
  // browser_window_id is already open should not be duplicated.
  const windowId = windowNodeId(event.windowId);
  const existingWindow = await ctx.findWindow(windowId);
  const existingLiveWindow =
    existingWindow ??
    (await ctx.findWindowByBrowserWindowId(event.windowId));
  if (!existingLiveWindow || existingLiveWindow.closed_at != null) {
    const window: WindowNode = {
      id: existingLiveWindow?.id ?? windowId,
      type: 'Window',
      recorded_at: now,
      opened_at: event.timestamp,
      closed_at: null,
      browser_window_id: event.windowId,
    };
    nodes.push(window);
  }
  const resolvedWindowId = existingLiveWindow?.id ?? windowId;

  // in_window: Tab -> Window, valid for tab lifetime. Skip if the
  // relationship already exists (the Tab was already tracked).
  if (!alreadyOpen) {
    edges.push({
      id: edgeId(event.id, 'in_window'),
      kind: 'interval',
      type: 'in_window',
      from_id: tabId,
      to_id: resolvedWindowId,
      recorded_at: now,
      valid_from: event.timestamp,
      valid_to: null,
    });
  }

  // Opener buffering: the actual `opened_from` edge cannot be emitted here
  // because the child Visit does not exist yet. Stash the opener visit id
  // keyed by browser tab id; the next navigation_committed for this tab
  // will consume it. Still applies even for re-created tabs — a fresh
  // navigation event will consume the buffer.
  const openerVisitId = event.metadata?.openerVisitId;
  if (typeof openerVisitId === 'string' && openerVisitId.length > 0) {
    ctx.putOpenerBuffer(event.tabId, openerVisitId);
  }

  return { nodes, edges };
}

// ---- tab_updated ----

/**
 * Surface a late-arriving title on the Page node.
 *
 * SPAs commonly commit navigation with an empty or stale `<title>` and set
 * the real title asynchronously — `webNavigation.onCommitted` fires before
 * the DOM has resolved. The service worker forwards `tabs.onUpdated` events
 * whose `changeInfo.title` is set so this transformer can rewrite the
 * Page's `title` in place.
 *
 * URL and title changes that are NOT title-only still flow through
 * `navigation_committed` — this transformer only handles the title path.
 */
export async function transformTabUpdated(
  event: BrowsingEvent,
  ctx: IngestContext,
): Promise<GraphWriteBatch> {
  const title = event.title;
  const rawUrl = event.url;
  if (!title || !rawUrl) return {};

  const normalizedUrl = normalizeUrl(rawUrl);
  const existingPage = await ctx.findPage(normalizedUrl);
  if (!existingPage) return {};
  if (existingPage.title === title) return {};

  return {
    nodes: [
      {
        ...existingPage,
        recorded_at: ctx.now(),
        title,
      },
    ],
  };
}

// ---- tab_removed ----

export async function transformTabRemoved(
  event: BrowsingEvent,
  ctx: IngestContext,
): Promise<GraphWriteBatch> {
  if (event.tabId === undefined) {
    ctx.warn('tab_removed missing tabId', { eventId: event.id });
    return {};
  }

  const now = ctx.now();
  const nodes: AnyNode[] = [];
  const edges: AnyEdge[] = [];

  // Close the currently active visit in this tab (if any). Reconciliation:
  // any trailing null-end focus intervals get clipped to the tab-close time
  // so the visit's focus record is well-formed even if the browser tore
  // down before a matching focus_transition arrived.
  const previousVisitId = ctx.previousVisitInTab(event.tabId);
  if (previousVisitId) {
    const visit = await ctx.findVisit(previousVisitId);
    if (visit) {
      const closed = closeTrailingFocusInterval(visit.focus_intervals, event.timestamp);
      nodes.push({
        ...visit,
        recorded_at: now,
        ended_at: visit.ended_at ?? event.timestamp,
        focus_intervals: closed,
      });

      for (const edge of await ctx.activeIntervalEdgesFromVisit(visit.id)) {
        if (edge.valid_to === null) {
          edges.push({ ...edge, recorded_at: now, valid_to: event.timestamp });
        }
      }
    }
  }

  // Close the Tab node and its in_window edge.
  const tab = await ctx.findTabByBrowserTabId(event.tabId);
  if (tab) {
    nodes.push({
      ...tab,
      recorded_at: now,
      closed_at: event.timestamp,
    });

    const inWindow = await ctx.activeInWindowEdgeForTab(tab.id);
    if (inWindow && inWindow.valid_to === null) {
      edges.push({ ...inWindow, recorded_at: now, valid_to: event.timestamp });
    }
  }

  // In-memory state cleanup: if the closing tab held the focus, clear it.
  if (previousVisitId && ctx.currentlyFocusedVisitId() === previousVisitId) {
    ctx.setCurrentlyFocusedVisitId(null);
  }

  return { nodes, edges };
}

// ---- window_removed ----

export async function transformWindowRemoved(
  event: BrowsingEvent,
  ctx: IngestContext,
): Promise<GraphWriteBatch> {
  if (event.windowId === undefined) {
    ctx.warn('window_removed missing windowId', { eventId: event.id });
    return {};
  }

  const now = ctx.now();
  const nodes: AnyNode[] = [];
  const edges: AnyEdge[] = [];

  // Find the Window node by browser_window_id. No dedicated index — the
  // count is small at personal scale so a scan is fine.
  const window = await ctx.findWindowByBrowserWindowId(event.windowId);
  if (!window) return {};

  if (window.closed_at == null) {
    nodes.push({ ...window, recorded_at: now, closed_at: event.timestamp });
  }

  // Close every child Tab whose in_window edge points at this Window and
  // is still open, plus its active in_window edge. Chrome already fires
  // tabs.onRemoved for every tab in a closing window, so ordinarily each
  // Tab closes on its own event, but doing it here too covers events
  // that were lost while the SW was down.
  for (const tab of await ctx.tabsInWindow(window.id)) {
    if (tab.closed_at == null) {
      nodes.push({ ...tab, recorded_at: now, closed_at: event.timestamp });
    }
    const inWindow = await ctx.activeInWindowEdgeForTab(tab.id);
    if (inWindow && inWindow.valid_to === null) {
      edges.push({ ...inWindow, recorded_at: now, valid_to: event.timestamp });
    }
  }

  return { nodes, edges };
}

// ---- navigation_committed ----

export async function transformNavigationCommitted(
  event: BrowsingEvent,
  ctx: IngestContext,
): Promise<GraphWriteBatch> {
  if (event.tabId === undefined || !event.url) {
    ctx.warn('navigation_committed missing tabId or url', { eventId: event.id });
    return {};
  }

  const now = ctx.now();
  const nodes: AnyNode[] = [];
  const edges: AnyEdge[] = [];

  const visitId = visitNodeId(event.id);
  const normalizedUrl = normalizeUrl(event.url);
  const hostname = hostnameOf(normalizedUrl);
  if (!hostname) {
    ctx.warn('navigation_committed unparseable url', { eventId: event.id, url: event.url });
    return {};
  }

  // Domain: create-if-missing.
  const domainId = domainNodeId(hostname);
  const existingDomain = await ctx.findDomain(hostname);
  if (!existingDomain) {
    nodes.push({
      id: domainId,
      type: 'Domain',
      recorded_at: now,
      hostname,
      first_seen: event.timestamp,
    });
  }

  // Page: upsert. Increment visit_count, refresh last_seen and title.
  const pageId = pageNodeId(normalizedUrl);
  const existingPage = await ctx.findPage(normalizedUrl);
  const pageTitle = event.title || existingPage?.title || '';
  const page: PageNode = existingPage
    ? {
        ...existingPage,
        recorded_at: now,
        title: pageTitle,
        last_seen: event.timestamp,
        visit_count: existingPage.visit_count + 1,
      }
    : {
        id: pageId,
        type: 'Page',
        recorded_at: now,
        normalized_url: normalizedUrl,
        raw_url_first_seen: event.url,
        title: pageTitle,
        first_seen: event.timestamp,
        last_seen: event.timestamp,
        visit_count: 1,
      };
  nodes.push(page);

  // on_domain: Page -> Domain. Emit only on first Page creation — the
  // temporal spec treats this edge as permanent (valid_to always null).
  if (!existingPage) {
    edges.push({
      id: edgeId(event.id, 'on_domain'),
      kind: 'interval',
      type: 'on_domain',
      from_id: pageId,
      to_id: domainId,
      recorded_at: now,
      valid_from: event.timestamp,
      valid_to: null,
    });
  }

  // Close the previous visit in this tab. Primary reconciliation point:
  // trailing null-end focus intervals on the outgoing visit are clipped
  // to the new navigation's timestamp, ended_at is filled, and its
  // still-open of_page / in_tab / in_session edges are closed.
  //
  // Idempotency guard: if `previousVisitInTab` equals the current event's
  // derived Visit id we are re-processing the same event — replay is
  // supposed to be a no-op, so we skip the close-out to avoid emitting
  // a self-loop `navigated_from`.
  const previousVisitId = ctx.previousVisitInTab(event.tabId);
  if (previousVisitId && previousVisitId !== visitId) {
    const prev = await ctx.findVisit(previousVisitId);
    if (prev) {
      nodes.push({
        ...prev,
        recorded_at: now,
        ended_at: prev.ended_at ?? event.timestamp,
        focus_intervals: closeTrailingFocusInterval(prev.focus_intervals, event.timestamp),
      });

      for (const edge of await ctx.activeIntervalEdgesFromVisit(prev.id)) {
        if (edge.valid_to === null) {
          edges.push({ ...edge, recorded_at: now, valid_to: event.timestamp });
        }
      }

      // navigated_from: new Visit -> previous Visit.
      edges.push({
        id: edgeId(event.id, 'navigated_from'),
        kind: 'point',
        type: 'navigated_from',
        from_id: visitId,
        to_id: prev.id,
        recorded_at: now,
        at_time: event.timestamp,
      });
    } else {
      ctx.warn('navigation_committed references unknown previous visit', {
        eventId: event.id,
        previousVisitId,
      });
    }
  }

  // Search-buffer consumption: if the *previous* navigation on this tab
  // was a search-results page, emit `arrived_via` from the new Visit.
  const pendingSearchId = ctx.consumeSearchBuffer(event.tabId);
  if (pendingSearchId) {
    edges.push({
      id: edgeId(event.id, 'arrived_via'),
      kind: 'point',
      type: 'arrived_via',
      from_id: visitId,
      to_id: pendingSearchId,
      recorded_at: now,
      at_time: event.timestamp,
    });
  }

  // Opener chain: emit opened_from if the child tab's opener was buffered
  // at tab_created time.
  const openerVisitId = ctx.consumeOpenerBuffer(event.tabId);
  if (openerVisitId) {
    edges.push({
      id: edgeId(event.id, 'opened_from'),
      kind: 'point',
      type: 'opened_from',
      from_id: visitId,
      to_id: openerVisitId,
      recorded_at: now,
      at_time: event.timestamp,
    });
  }

  // The new Visit node itself.
  nodes.push({
    id: visitId,
    type: 'Visit',
    recorded_at: now,
    at_time: event.timestamp,
    ended_at: null,
    focus_intervals: [],
    transition: mapTransition(
      event.metadata?.transitionType as string | undefined,
      ctx,
      event.id,
    ),
  });

  // of_page: Visit -> Page, held for visit duration.
  edges.push({
    id: edgeId(event.id, 'of_page'),
    kind: 'interval',
    type: 'of_page',
    from_id: visitId,
    to_id: pageId,
    recorded_at: now,
    valid_from: event.timestamp,
    valid_to: null,
  });

  // in_tab: Visit -> Tab, held for visit duration. The Tab node comes from
  // the browser-tab-id index; if no Tab is registered yet (e.g. the first
  // navigation of a tab that predates ingest startup) the edge is skipped
  // and a warning is logged rather than silently dropped.
  const tab = await ctx.findTabByBrowserTabId(event.tabId);
  if (tab) {
    edges.push({
      id: edgeId(event.id, 'in_tab'),
      kind: 'interval',
      type: 'in_tab',
      from_id: visitId,
      to_id: tab.id,
      recorded_at: now,
      valid_from: event.timestamp,
      valid_to: null,
    });
  } else {
    ctx.warn('navigation_committed has no Tab node for browser_tab_id', {
      eventId: event.id,
      browserTabId: event.tabId,
    });
  }

  // in_session: Visit -> Session, if a session is active.
  const currentSessionId = ctx.currentSessionId();
  if (currentSessionId) {
    edges.push({
      id: edgeId(event.id, 'in_session'),
      kind: 'interval',
      type: 'in_session',
      from_id: visitId,
      to_id: currentSessionId,
      recorded_at: now,
      valid_from: event.timestamp,
      valid_to: null,
    });
  }

  // Search detection: if the new URL is a search page, emit a SearchQuery
  // node and buffer its id for the next navigation on this tab.
  const searchHit = detectSearchEngine(event.url);
  if (searchHit) {
    const searchId = searchQueryNodeId(searchHit.engine, searchHit.queryText);
    const existingSearch = await ctx.findSearchQuery(searchId);
    if (!existingSearch) {
      nodes.push({
        id: searchId,
        type: 'SearchQuery',
        recorded_at: now,
        engine: searchHit.engine,
        query_text: searchHit.queryText,
        results_url: event.url,
      });
    }
    ctx.putSearchBuffer(event.tabId, searchId);
  }

  return { nodes, edges };
}

// ---- focus_transition ----

export async function transformFocusTransition(
  event: BrowsingEvent,
  ctx: IngestContext,
): Promise<GraphWriteBatch> {
  const now = ctx.now();
  const nodes: AnyNode[] = [];
  const focusedVisit = event.metadata?.focused_visit as string | null | undefined;

  const outgoingVisitId = ctx.currentlyFocusedVisitId();
  const incomingVisitId = focusedVisit ?? null;

  // Close outgoing: any trailing null-end interval on the outgoing visit is
  // clipped to this transition's timestamp.
  if (outgoingVisitId && outgoingVisitId !== incomingVisitId) {
    const outgoing = await ctx.findVisit(outgoingVisitId);
    if (outgoing) {
      nodes.push({
        ...outgoing,
        recorded_at: now,
        focus_intervals: closeTrailingFocusInterval(outgoing.focus_intervals, event.timestamp),
      });
    } else {
      ctx.warn('focus_transition outgoing visit not in graph', {
        eventId: event.id,
        outgoingVisitId,
      });
    }
  }

  // Open incoming: append { start, end: null } to the incoming visit's
  // focus_intervals. Missing visit is logged (typically means the drain
  // is running mid-batch and the referenced navigation_committed has not
  // been ingested yet); we still emit any outgoing update above.
  if (incomingVisitId && incomingVisitId !== outgoingVisitId) {
    const incoming = await ctx.findVisit(incomingVisitId);
    if (incoming) {
      nodes.push({
        ...incoming,
        recorded_at: now,
        focus_intervals: [
          ...incoming.focus_intervals,
          { start: event.timestamp, end: null },
        ],
      });
    } else {
      ctx.warn('focus_transition incoming visit not in graph', {
        eventId: event.id,
        incomingVisitId,
      });
    }
  }

  ctx.setCurrentlyFocusedVisitId(incomingVisitId);

  return { nodes };
}

// ---- session_started ----

export async function transformSessionStarted(
  event: BrowsingEvent,
  ctx: IngestContext,
): Promise<GraphWriteBatch> {
  const now = ctx.now();
  const nodes: AnyNode[] = [];
  const edges: AnyEdge[] = [];

  const sessionId = sessionNodeId(event.id);
  const detectedBy = readDetectedBy(event.metadata);
  nodes.push({
    id: sessionId,
    type: 'Session',
    recorded_at: now,
    started_at: event.timestamp,
    ended_at: null,
    detected_by: detectedBy,
    title: (event.metadata?.title as string | undefined) ?? null,
  });

  ctx.setCurrentSessionId(sessionId);

  // v5-style multi-session visits: for any still-active Visit, add a fresh
  // in_session edge tying it to the newly started session.
  const active = await ctx.activeVisits();
  for (const visit of active) {
    edges.push({
      id: edgeId(event.id, 'in_session', hashIndex(visit.id)),
      kind: 'interval',
      type: 'in_session',
      from_id: visit.id,
      to_id: sessionId,
      recorded_at: now,
      valid_from: event.timestamp,
      valid_to: null,
    });
  }

  return { nodes, edges };
}

// ---- session_ended ----

export async function transformSessionEnded(
  event: BrowsingEvent,
  ctx: IngestContext,
): Promise<GraphWriteBatch> {
  const now = ctx.now();
  const nodes: AnyNode[] = [];
  const edges: AnyEdge[] = [];

  const target = (event.metadata?.sessionNodeId as string | undefined)
    ?? ctx.currentSessionId();
  if (!target) {
    ctx.warn('session_ended has no target session', { eventId: event.id });
    return {};
  }

  const session = await ctx.findSession(target);
  if (session) {
    nodes.push({
      ...session,
      recorded_at: now,
      ended_at: event.timestamp,
    });
  } else {
    ctx.warn('session_ended references unknown session', {
      eventId: event.id,
      sessionId: target,
    });
  }

  // Clip in_session edges pointing at this session that are still open.
  for (const edge of await ctx.activeInSessionEdgesForSession(target)) {
    if (edge.valid_to === null) {
      edges.push({ ...edge, recorded_at: now, valid_to: event.timestamp });
    }
  }

  if (ctx.currentSessionId() === target) {
    ctx.setCurrentSessionId(null);
  }

  return { nodes, edges };
}

// ---- tag_applied ----

export async function transformTagApplied(
  event: BrowsingEvent,
  ctx: IngestContext,
): Promise<GraphWriteBatch> {
  const now = ctx.now();
  const slug = (event.metadata?.slug as string | undefined)
    ?? sanitizeSlug(event.metadata?.label as string | undefined);
  if (!slug) {
    ctx.warn('tag_applied missing slug/label', { eventId: event.id });
    return {};
  }

  const nodes: AnyNode[] = [];
  const edges: AnyEdge[] = [];

  const tagId = tagNodeId(slug);
  const existingTag = await ctx.findTag(slug);
  if (!existingTag) {
    nodes.push({
      id: tagId,
      type: 'Tag',
      recorded_at: now,
      slug,
      label: (event.metadata?.label as string | undefined) ?? slug,
      created_at: event.timestamp,
    });
  }

  const target = (event.metadata?.sessionNodeId as string | undefined)
    ?? ctx.currentSessionId();
  if (!target) {
    ctx.warn('tag_applied has no target session', { eventId: event.id });
    return { nodes };
  }

  edges.push({
    id: edgeId(event.id, 'tagged_with'),
    kind: 'point',
    type: 'tagged_with',
    from_id: target,
    to_id: tagId,
    recorded_at: now,
    at_time: event.timestamp,
  });

  return { nodes, edges };
}

// ---- tag_removed ----

/**
 * Retracts a prior `tagged_with` edge. The graph model treats point edges
 * as append-only historical records; a proper implementation requires
 * either a delete API on GraphStore or an inverse `untagged_from` edge
 * type — neither exists at this task's slice. We log intent so a follow-up
 * can materialize the retraction without another schema migration.
 */
export async function transformTagRemoved(
  event: BrowsingEvent,
  ctx: IngestContext,
): Promise<GraphWriteBatch> {
  const slug = (event.metadata?.slug as string | undefined)
    ?? sanitizeSlug(event.metadata?.label as string | undefined);
  const target = (event.metadata?.sessionNodeId as string | undefined)
    ?? ctx.currentSessionId();
  ctx.warn('tag_removed not yet materialized as an edge deletion', {
    eventId: event.id,
    slug,
    sessionId: target,
  });
  return {};
}
