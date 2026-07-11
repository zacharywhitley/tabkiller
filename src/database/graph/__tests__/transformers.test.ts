/**
 * Unit tests for the graph-ingest per-event-type transformers.
 *
 * Every transformer is exercised at least once; the shapes of the emitted
 * GraphWriteBatch (node types, edge types, ids, and the interval/point
 * discriminators) are checked against expected sets.
 *
 * These tests do NOT touch IndexedDB. The transformers only depend on the
 * `IngestContext` interface, which is implemented in-line as a mutable
 * object per test — keeps the assertions readable and the fixtures small.
 * The end-to-end drain + real IDB path is covered separately by
 * ingest.test.ts (per the CLAUDE.md "no mock services" rule that test
 * uses fake-indexeddb).
 */

import type { BrowsingEvent } from '../../../shared/types';
import {
  detectSearchEngine,
  domainNodeId,
  edgeId,
  pageNodeId,
  searchQueryNodeId,
  sessionNodeId,
  tabNodeId,
  tagNodeId,
  transformFocusTransition,
  transformNavigationCommitted,
  transformSessionEnded,
  transformSessionStarted,
  transformTabCreated,
  transformTabRemoved,
  transformTabUpdated,
  transformTagApplied,
  transformTagRemoved,
  visitNodeId,
  windowNodeId,
  type IngestContext,
} from '../transformers';
import type {
  DomainNode,
  IntervalEdge,
  PageNode,
  SearchQueryNode,
  SessionNode,
  TabNode,
  TagNode,
  VisitNode,
  WindowNode,
} from '../types';

const NOW = 2_000_000;
const NAV_TIME = 1_700_000;

interface StubStore {
  pages: Map<string, PageNode>;
  domains: Map<string, DomainNode>;
  tags: Map<string, TagNode>;
  visits: Map<string, VisitNode>;
  sessions: Map<string, SessionNode>;
  windows: Map<string, WindowNode>;
  searches: Map<string, SearchQueryNode>;
  tabs: Map<number, TabNode>;
  intervalEdgesFromVisit: Map<string, IntervalEdge[]>;
  inSessionEdgesForSession: Map<string, IntervalEdge[]>;
  inWindowEdgeForTab: Map<string, IntervalEdge | undefined>;
  activeVisitList: VisitNode[];
  warnings: Array<{ message: string; ctx: Record<string, unknown> }>;
}

function emptyStore(): StubStore {
  return {
    pages: new Map(),
    domains: new Map(),
    tags: new Map(),
    visits: new Map(),
    sessions: new Map(),
    windows: new Map(),
    searches: new Map(),
    tabs: new Map(),
    intervalEdgesFromVisit: new Map(),
    inSessionEdgesForSession: new Map(),
    inWindowEdgeForTab: new Map(),
    activeVisitList: [],
    warnings: [],
  };
}

interface ContextState {
  previousVisitByTab: Map<number, string>;
  openerBuffer: Map<number, string>;
  searchBuffer: Map<number, string>;
  currentSession: string | null;
  focused: string | null;
}

function emptyState(): ContextState {
  return {
    previousVisitByTab: new Map(),
    openerBuffer: new Map(),
    searchBuffer: new Map(),
    currentSession: null,
    focused: null,
  };
}

function makeContext(store: StubStore, state: ContextState): IngestContext {
  return {
    now: () => NOW,

    previousVisitInTab: (tabId) => state.previousVisitByTab.get(tabId) ?? null,
    consumeOpenerBuffer: (tabId) => {
      const v = state.openerBuffer.get(tabId) ?? null;
      state.openerBuffer.delete(tabId);
      return v;
    },
    putOpenerBuffer: (tabId, v) => { state.openerBuffer.set(tabId, v); },
    consumeSearchBuffer: (tabId) => {
      const v = state.searchBuffer.get(tabId) ?? null;
      state.searchBuffer.delete(tabId);
      return v;
    },
    putSearchBuffer: (tabId, v) => { state.searchBuffer.set(tabId, v); },
    currentSessionId: () => state.currentSession,
    setCurrentSessionId: (id) => { state.currentSession = id; },
    currentlyFocusedVisitId: () => state.focused,
    setCurrentlyFocusedVisitId: (id) => { state.focused = id; },

    findPage: async (url) => store.pages.get(url),
    findDomain: async (host) => store.domains.get(host),
    findTag: async (slug) => store.tags.get(slug),
    findVisit: async (id) => store.visits.get(id),
    findSession: async (id) => store.sessions.get(id),
    findWindow: async (id) => store.windows.get(id),
    findSearchQuery: async (id) => store.searches.get(id),
    findTabByBrowserTabId: async (id) => store.tabs.get(id),

    activeIntervalEdgesFromVisit: async (visitId) => store.intervalEdgesFromVisit.get(visitId) ?? [],
    activeInSessionEdgesForSession: async (sessionId) => store.inSessionEdgesForSession.get(sessionId) ?? [],
    activeInWindowEdgeForTab: async (tabId) => store.inWindowEdgeForTab.get(tabId),
    activeVisits: async () => store.activeVisitList,

    warn: (message, ctx) => { store.warnings.push({ message, ctx }); },
  };
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

// ============================================================================
// tab_created
// ============================================================================

describe('transformTabCreated', () => {
  it('emits a Tab node, a Window node (first sight), and an in_window interval edge', async () => {
    const store = emptyStore();
    const state = emptyState();
    const ctx = makeContext(store, state);

    const event = makeEvent({
      id: 'tabc_abc',
      type: 'tab_created',
      timestamp: NAV_TIME,
      tabId: 42,
      windowId: 7,
      metadata: {},
    });

    const batch = await transformTabCreated(event, ctx);

    expect(batch.nodes).toHaveLength(2);
    const tab = (batch.nodes ?? []).find((n): n is TabNode => n.type === 'Tab');
    expect(tab).toBeDefined();
    expect(tab!.id).toBe(tabNodeId('tabc_abc'));
    expect(tab!.browser_tab_id).toBe(42);
    expect(tab!.opened_at).toBe(NAV_TIME);
    expect(tab!.closed_at).toBeNull();

    const window = (batch.nodes ?? []).find((n): n is WindowNode => n.type === 'Window');
    expect(window).toBeDefined();
    expect(window!.id).toBe(windowNodeId(7));
    expect(window!.browser_window_id).toBe(7);
    expect(window!.opened_at).toBe(NAV_TIME);

    expect(batch.edges).toHaveLength(1);
    const inWindow = batch.edges![0];
    expect(inWindow.type).toBe('in_window');
    expect(inWindow.kind).toBe('interval');
    expect(inWindow.from_id).toBe(tab!.id);
    expect(inWindow.to_id).toBe(window!.id);
    expect((inWindow as IntervalEdge).valid_from).toBe(NAV_TIME);
    expect((inWindow as IntervalEdge).valid_to).toBeNull();
  });

  it('does not re-create an existing Window — only emits the Tab and in_window edge', async () => {
    const store = emptyStore();
    store.windows.set(windowNodeId(7), {
      id: windowNodeId(7),
      type: 'Window',
      recorded_at: 1,
      opened_at: 1,
      closed_at: null,
      browser_window_id: 7,
    });
    const state = emptyState();
    const ctx = makeContext(store, state);

    const event = makeEvent({
      id: 'tabc_second',
      type: 'tab_created',
      timestamp: NAV_TIME,
      tabId: 99,
      windowId: 7,
    });

    const batch = await transformTabCreated(event, ctx);

    expect(batch.nodes).toHaveLength(1);
    expect(batch.nodes![0].type).toBe('Tab');
    expect(batch.edges).toHaveLength(1);
    expect(batch.edges![0].type).toBe('in_window');
  });

  it('populates the opener buffer when metadata.openerVisitId is present', async () => {
    const store = emptyStore();
    const state = emptyState();
    const ctx = makeContext(store, state);

    await transformTabCreated(
      makeEvent({
        id: 'tabc_child',
        type: 'tab_created',
        timestamp: NAV_TIME,
        tabId: 55,
        windowId: 7,
        metadata: { openerVisitId: 'visit_parent_abc' },
      }),
      ctx,
    );

    expect(state.openerBuffer.get(55)).toBe('visit_parent_abc');
  });

  it('warns and emits nothing when tabId or windowId is missing', async () => {
    const store = emptyStore();
    const state = emptyState();
    const ctx = makeContext(store, state);

    const batch = await transformTabCreated(
      makeEvent({ id: 'tabc_bad', type: 'tab_created', timestamp: NAV_TIME }),
      ctx,
    );

    expect(batch).toEqual({});
    expect(store.warnings).toHaveLength(1);
    expect(store.warnings[0].message).toContain('tab_created missing tabId or windowId');
  });
});

// ============================================================================
// tab_updated
// ============================================================================

describe('transformTabUpdated', () => {
  it('emits nothing when the event carries no title (URL-only updates are handled via navigation_committed)', async () => {
    const store = emptyStore();
    const ctx = makeContext(store, emptyState());
    const batch = await transformTabUpdated(
      makeEvent({
        id: 'e',
        type: 'tab_updated',
        timestamp: NAV_TIME,
        tabId: 1,
        url: 'https://example.com/',
      }),
      ctx,
    );
    expect(batch).toEqual({});
  });

  it('emits nothing when the referenced Page is not in the graph yet', async () => {
    const store = emptyStore();
    const ctx = makeContext(store, emptyState());
    const batch = await transformTabUpdated(
      makeEvent({
        id: 'e',
        type: 'tab_updated',
        timestamp: NAV_TIME,
        tabId: 1,
        url: 'https://example.com/nothing-here',
        title: 'A Late Title',
      }),
      ctx,
    );
    expect(batch).toEqual({});
  });

  it('rewrites the Page title when a late-arriving title lands and the Page exists', async () => {
    const store = emptyStore();
    const existingPage: PageNode = {
      id: pageNodeId('https://example.com/'),
      type: 'Page',
      recorded_at: 1,
      normalized_url: 'https://example.com/',
      raw_url_first_seen: 'https://example.com/',
      title: '',
      first_seen: NAV_TIME,
      last_seen: NAV_TIME,
      visit_count: 1,
    };
    store.pages.set('https://example.com/', existingPage);

    const ctx = makeContext(store, emptyState());
    const batch = await transformTabUpdated(
      makeEvent({
        id: 'e',
        type: 'tab_updated',
        timestamp: NAV_TIME + 500,
        tabId: 1,
        url: 'https://example.com/',
        title: 'Real Title',
      }),
      ctx,
    );

    expect(batch.nodes).toHaveLength(1);
    const rewritten = (batch.nodes ?? [])[0] as PageNode;
    expect(rewritten.type).toBe('Page');
    expect(rewritten.title).toBe('Real Title');
    // Identity fields stay stable — this is a title patch, not a new visit.
    expect(rewritten.normalized_url).toBe('https://example.com/');
    expect(rewritten.visit_count).toBe(1);
    expect(rewritten.first_seen).toBe(NAV_TIME);
    expect(rewritten.recorded_at).toBe(NOW);
    // No edges — the Page is only being title-patched.
    expect(batch.edges ?? []).toHaveLength(0);
  });

  it('is a no-op when the incoming title matches the Page\'s current title', async () => {
    const store = emptyStore();
    const existingPage: PageNode = {
      id: pageNodeId('https://example.com/'),
      type: 'Page',
      recorded_at: 1,
      normalized_url: 'https://example.com/',
      raw_url_first_seen: 'https://example.com/',
      title: 'Already Right',
      first_seen: NAV_TIME,
      last_seen: NAV_TIME,
      visit_count: 1,
    };
    store.pages.set('https://example.com/', existingPage);

    const ctx = makeContext(store, emptyState());
    const batch = await transformTabUpdated(
      makeEvent({
        id: 'e',
        type: 'tab_updated',
        timestamp: NAV_TIME + 500,
        tabId: 1,
        url: 'https://example.com/',
        title: 'Already Right',
      }),
      ctx,
    );
    expect(batch).toEqual({});
  });

  it('normalizes tracking params before locating the Page to patch', async () => {
    const store = emptyStore();
    const existingPage: PageNode = {
      id: pageNodeId('https://example.com/article'),
      type: 'Page',
      recorded_at: 1,
      normalized_url: 'https://example.com/article',
      raw_url_first_seen: 'https://example.com/article',
      title: '',
      first_seen: NAV_TIME,
      last_seen: NAV_TIME,
      visit_count: 1,
    };
    store.pages.set('https://example.com/article', existingPage);

    const ctx = makeContext(store, emptyState());
    const batch = await transformTabUpdated(
      makeEvent({
        id: 'e',
        type: 'tab_updated',
        timestamp: NAV_TIME + 500,
        tabId: 1,
        url: 'https://example.com/article?utm_source=x&fbclid=y',
        title: 'Article Loaded',
      }),
      ctx,
    );

    expect(batch.nodes).toHaveLength(1);
    expect((batch.nodes as PageNode[])[0].title).toBe('Article Loaded');
  });
});

// ============================================================================
// tab_removed
// ============================================================================

describe('transformTabRemoved', () => {
  it('closes the Tab, closes the tab\'s in_window edge, and closes the visit\'s interval edges', async () => {
    const store = emptyStore();
    const state = emptyState();
    const now = NOW;

    // Existing Tab, still-open in_window edge, and an active Visit.
    const tab: TabNode = {
      id: tabNodeId('tabc_1'),
      type: 'Tab',
      recorded_at: 1,
      opened_at: 1000,
      closed_at: null,
      browser_tab_id: 42,
    };
    store.tabs.set(42, tab);

    const inWindow: IntervalEdge = {
      id: edgeId('tabc_1', 'in_window'),
      kind: 'interval',
      type: 'in_window',
      from_id: tab.id,
      to_id: windowNodeId(7),
      recorded_at: 1,
      valid_from: 1000,
      valid_to: null,
    };
    store.inWindowEdgeForTab.set(tab.id, inWindow);

    const visit: VisitNode = {
      id: visitNodeId('nav_1'),
      type: 'Visit',
      recorded_at: 1,
      at_time: 1500,
      ended_at: null,
      focus_intervals: [{ start: 1500, end: null }],
      transition: 'link',
    };
    store.visits.set(visit.id, visit);
    state.previousVisitByTab.set(42, visit.id);
    state.focused = visit.id;

    const openOfPage: IntervalEdge = {
      id: edgeId('nav_1', 'of_page'),
      kind: 'interval',
      type: 'of_page',
      from_id: visit.id,
      to_id: 'page_x',
      recorded_at: 1,
      valid_from: 1500,
      valid_to: null,
    };
    store.intervalEdgesFromVisit.set(visit.id, [openOfPage]);

    const ctx = makeContext(store, state);

    const event = makeEvent({
      id: 'tabr_1',
      type: 'tab_removed',
      timestamp: 3000,
      tabId: 42,
    });
    const batch = await transformTabRemoved(event, ctx);

    // Visit closed with ended_at + trailing focus interval clipped.
    const closedVisit = (batch.nodes ?? []).find((n): n is VisitNode => n.type === 'Visit');
    expect(closedVisit).toBeDefined();
    expect(closedVisit!.ended_at).toBe(3000);
    expect(closedVisit!.focus_intervals).toEqual([{ start: 1500, end: 3000 }]);
    expect(closedVisit!.recorded_at).toBe(now);

    // Tab closed.
    const closedTab = (batch.nodes ?? []).find((n): n is TabNode => n.type === 'Tab');
    expect(closedTab).toBeDefined();
    expect(closedTab!.closed_at).toBe(3000);

    // Edges: in_window closed, of_page closed.
    const closedInWindow = (batch.edges ?? []).find((e) => e.type === 'in_window');
    expect(closedInWindow).toBeDefined();
    expect((closedInWindow as IntervalEdge).valid_to).toBe(3000);

    const closedOfPage = (batch.edges ?? []).find((e) => e.type === 'of_page');
    expect(closedOfPage).toBeDefined();
    expect((closedOfPage as IntervalEdge).valid_to).toBe(3000);

    // Focus pointer cleared.
    expect(state.focused).toBeNull();
  });
});

// ============================================================================
// navigation_committed
// ============================================================================

describe('transformNavigationCommitted', () => {
  it('emits Page, Domain, Visit, of_page, in_tab, on_domain — first-ever navigation', async () => {
    const store = emptyStore();
    const state = emptyState();

    // A Tab pre-exists so the in_tab edge can be emitted.
    const tab: TabNode = {
      id: tabNodeId('tabc_1'),
      type: 'Tab',
      recorded_at: 1,
      opened_at: 1000,
      closed_at: null,
      browser_tab_id: 42,
    };
    store.tabs.set(42, tab);

    const ctx = makeContext(store, state);

    const event = makeEvent({
      id: 'nav_first',
      type: 'navigation_committed',
      timestamp: NAV_TIME,
      tabId: 42,
      url: 'https://example.com/article',
      title: 'Article',
      metadata: { transitionType: 'typed' },
    });

    const batch = await transformNavigationCommitted(event, ctx);

    // Nodes: Domain, Page, Visit.
    const nodeTypes = (batch.nodes ?? []).map((n) => n.type).sort();
    expect(nodeTypes).toEqual(['Domain', 'Page', 'Visit']);

    const visit = (batch.nodes ?? []).find((n): n is VisitNode => n.type === 'Visit');
    expect(visit!.id).toBe(visitNodeId('nav_first'));
    expect(visit!.at_time).toBe(NAV_TIME);
    expect(visit!.ended_at).toBeNull();
    expect(visit!.focus_intervals).toEqual([]);
    expect(visit!.transition).toBe('typed');

    const page = (batch.nodes ?? []).find((n): n is PageNode => n.type === 'Page');
    expect(page!.normalized_url).toBe('https://example.com/article');
    expect(page!.raw_url_first_seen).toBe('https://example.com/article');
    // The title from webNavigation flows through to the Page node —
    // this is Gap 1 in the capture-completeness followup: without the
    // service worker reading `chrome.tabs.get(tabId).title` at commit
    // time, this field was always empty.
    expect(page!.title).toBe('Article');
    expect(page!.visit_count).toBe(1);

    const domain = (batch.nodes ?? []).find((n): n is DomainNode => n.type === 'Domain');
    expect(domain!.hostname).toBe('example.com');

    // Edges: of_page, in_tab, on_domain. No navigated_from — no prior visit.
    const edgeTypes = (batch.edges ?? []).map((e) => e.type).sort();
    expect(edgeTypes).toEqual(['in_tab', 'of_page', 'on_domain']);
  });

  it('increments visit_count on an existing Page and skips on_domain (already permanent)', async () => {
    const store = emptyStore();
    const state = emptyState();

    const existingPage: PageNode = {
      id: pageNodeId('https://example.com/'),
      type: 'Page',
      recorded_at: 1,
      normalized_url: 'https://example.com/',
      raw_url_first_seen: 'https://example.com/',
      title: 'Old',
      first_seen: 1000,
      last_seen: 1000,
      visit_count: 2,
    };
    store.pages.set('https://example.com/', existingPage);
    store.domains.set('example.com', {
      id: domainNodeId('example.com'),
      type: 'Domain',
      recorded_at: 1,
      hostname: 'example.com',
      first_seen: 1000,
    });

    const tab: TabNode = {
      id: tabNodeId('tabc_1'),
      type: 'Tab',
      recorded_at: 1,
      opened_at: 1000,
      closed_at: null,
      browser_tab_id: 42,
    };
    store.tabs.set(42, tab);

    const ctx = makeContext(store, state);

    const batch = await transformNavigationCommitted(
      makeEvent({
        id: 'nav_second',
        type: 'navigation_committed',
        timestamp: NAV_TIME,
        tabId: 42,
        url: 'https://example.com/?utm_source=x', // normalized -> https://example.com/
        title: 'New Title',
        metadata: { transitionType: 'link' },
      }),
      ctx,
    );

    const updatedPage = (batch.nodes ?? []).find((n): n is PageNode => n.type === 'Page');
    expect(updatedPage!.visit_count).toBe(3);
    expect(updatedPage!.title).toBe('New Title');
    expect(updatedPage!.first_seen).toBe(1000);
    expect(updatedPage!.last_seen).toBe(NAV_TIME);

    const edgeTypes = (batch.edges ?? []).map((e) => e.type).sort();
    expect(edgeTypes).toEqual(['in_tab', 'of_page']);
    expect(edgeTypes).not.toContain('on_domain');
  });

  it('emits navigated_from and closes the previous visit when the same tab already had a visit', async () => {
    const store = emptyStore();
    const state = emptyState();

    // Prior visit, still open, on tab 42.
    const priorVisit: VisitNode = {
      id: visitNodeId('nav_prior'),
      type: 'Visit',
      recorded_at: 1,
      at_time: 1000,
      ended_at: null,
      focus_intervals: [{ start: 1000, end: null }],
      transition: 'link',
    };
    store.visits.set(priorVisit.id, priorVisit);
    state.previousVisitByTab.set(42, priorVisit.id);

    // Prior open edges.
    const priorOfPage: IntervalEdge = {
      id: edgeId('nav_prior', 'of_page'),
      kind: 'interval',
      type: 'of_page',
      from_id: priorVisit.id,
      to_id: 'page_x',
      recorded_at: 1,
      valid_from: 1000,
      valid_to: null,
    };
    store.intervalEdgesFromVisit.set(priorVisit.id, [priorOfPage]);

    const tab: TabNode = {
      id: tabNodeId('tabc_1'),
      type: 'Tab',
      recorded_at: 1,
      opened_at: 500,
      closed_at: null,
      browser_tab_id: 42,
    };
    store.tabs.set(42, tab);

    const ctx = makeContext(store, state);

    const batch = await transformNavigationCommitted(
      makeEvent({
        id: 'nav_next',
        type: 'navigation_committed',
        timestamp: NAV_TIME,
        tabId: 42,
        url: 'https://newsite.com/',
      }),
      ctx,
    );

    // Prior visit re-put with ended_at + trailing focus clipped.
    const closedPrior = (batch.nodes ?? []).find((n): n is VisitNode => n.id === priorVisit.id);
    expect(closedPrior).toBeDefined();
    expect(closedPrior!.ended_at).toBe(NAV_TIME);
    expect(closedPrior!.focus_intervals).toEqual([{ start: 1000, end: NAV_TIME }]);

    // navigated_from edge points from new visit to prior.
    const navFrom = (batch.edges ?? []).find((e) => e.type === 'navigated_from');
    expect(navFrom).toBeDefined();
    expect(navFrom!.from_id).toBe(visitNodeId('nav_next'));
    expect(navFrom!.to_id).toBe(priorVisit.id);

    // Prior of_page edge closed.
    const closedOfPage = (batch.edges ?? []).find((e) => e.id === priorOfPage.id);
    expect(closedOfPage).toBeDefined();
    expect((closedOfPage as IntervalEdge).valid_to).toBe(NAV_TIME);
  });

  it('emits in_session when a session is active', async () => {
    const store = emptyStore();
    const state = emptyState();
    state.currentSession = 'session_active';

    store.tabs.set(42, {
      id: tabNodeId('tabc_1'), type: 'Tab', recorded_at: 1,
      opened_at: 1, closed_at: null, browser_tab_id: 42,
    });

    const batch = await transformNavigationCommitted(
      makeEvent({
        id: 'nav_ins',
        type: 'navigation_committed',
        timestamp: NAV_TIME,
        tabId: 42,
        url: 'https://a.example/',
      }),
      makeContext(store, state),
    );

    const inSession = (batch.edges ?? []).find((e) => e.type === 'in_session');
    expect(inSession).toBeDefined();
    expect(inSession!.from_id).toBe(visitNodeId('nav_ins'));
    expect(inSession!.to_id).toBe('session_active');
  });

  it('consumes the opener buffer to emit opened_from', async () => {
    const store = emptyStore();
    const state = emptyState();
    state.openerBuffer.set(42, 'visit_parent_xyz');
    store.tabs.set(42, {
      id: tabNodeId('tabc_child'), type: 'Tab', recorded_at: 1,
      opened_at: 1, closed_at: null, browser_tab_id: 42,
    });

    const batch = await transformNavigationCommitted(
      makeEvent({
        id: 'nav_child',
        type: 'navigation_committed',
        timestamp: NAV_TIME,
        tabId: 42,
        url: 'https://child.example/',
      }),
      makeContext(store, state),
    );

    const openedFrom = (batch.edges ?? []).find((e) => e.type === 'opened_from');
    expect(openedFrom).toBeDefined();
    expect(openedFrom!.from_id).toBe(visitNodeId('nav_child'));
    expect(openedFrom!.to_id).toBe('visit_parent_xyz');
    expect(state.openerBuffer.has(42)).toBe(false);
  });

  it('detects Google search URLs, emits SearchQuery, and buffers for the next navigation to consume', async () => {
    const store = emptyStore();
    const state = emptyState();
    store.tabs.set(42, {
      id: tabNodeId('tabc_1'), type: 'Tab', recorded_at: 1,
      opened_at: 1, closed_at: null, browser_tab_id: 42,
    });

    const searchBatch = await transformNavigationCommitted(
      makeEvent({
        id: 'nav_search',
        type: 'navigation_committed',
        timestamp: NAV_TIME,
        tabId: 42,
        url: 'https://google.com/search?q=temporal+graph',
      }),
      makeContext(store, state),
    );

    const searchNode = (searchBatch.nodes ?? []).find((n): n is SearchQueryNode => n.type === 'SearchQuery');
    expect(searchNode).toBeDefined();
    expect(searchNode!.engine).toBe('google');
    // URLSearchParams.get decodes `+` to a space per the WHATWG URL spec.
    expect(searchNode!.query_text).toBe('temporal graph');

    // Search buffer populated for the next navigation on this tab.
    expect(state.searchBuffer.get(42)).toBe(searchNode!.id);

    // Follow-up navigation consumes it and emits arrived_via.
    // Register the search node in the stub so findSearchQuery returns it.
    store.searches.set(searchNode!.id, searchNode!);
    // Register the "search" visit as prior in tab so its close is not required for this assertion.
    store.visits.set(visitNodeId('nav_search'), {
      id: visitNodeId('nav_search'),
      type: 'Visit',
      recorded_at: 1,
      at_time: NAV_TIME,
      ended_at: null,
      focus_intervals: [],
      transition: 'link',
    });
    state.previousVisitByTab.set(42, visitNodeId('nav_search'));

    const clickBatch = await transformNavigationCommitted(
      makeEvent({
        id: 'nav_click',
        type: 'navigation_committed',
        timestamp: NAV_TIME + 5000,
        tabId: 42,
        url: 'https://result.example/article',
      }),
      makeContext(store, state),
    );

    const arrivedVia = (clickBatch.edges ?? []).find((e) => e.type === 'arrived_via');
    expect(arrivedVia).toBeDefined();
    expect(arrivedVia!.from_id).toBe(visitNodeId('nav_click'));
    expect(arrivedVia!.to_id).toBe(searchNode!.id);
  });

  it.each([
    ['link', 'link'],
    ['typed', 'typed'],
    ['form_submit', 'form_submit'],
    ['auto_bookmark', 'auto_bookmark'],
    ['reload', 'reload'],
    ['generated', 'generated'],
    ['bookmark', 'auto_bookmark'],
    ['back_forward', 'back_forward'],
    // Chrome-specific keyword variants collapse to `typed` — user typed
    // a keyword that expanded to a URL.
    ['keyword', 'typed'],
    ['keyword_generated', 'typed'],
    // Sub-frame transitions should be filtered at the SW, but if they
    // slip through we mark them unknown rather than pretend they were
    // real user navigations.
    ['manual_subframe', 'unknown'],
    ['auto_subframe', 'unknown'],
    // Browser-default landing page (chrome://newtab, home page).
    ['start_page', 'unknown'],
  ])('maps webNavigation transitionType %s → %s', async (rawTransition, expected) => {
    const store = emptyStore();
    const state = emptyState();
    store.tabs.set(42, {
      id: tabNodeId('tabc_1'), type: 'Tab', recorded_at: 1,
      opened_at: 1, closed_at: null, browser_tab_id: 42,
    });

    const batch = await transformNavigationCommitted(
      makeEvent({
        id: `nav_${rawTransition}`,
        type: 'navigation_committed',
        timestamp: NAV_TIME,
        tabId: 42,
        url: 'https://example.com/',
        metadata: { transitionType: rawTransition },
      }),
      makeContext(store, state),
    );

    const visit = (batch.nodes ?? []).find((n): n is VisitNode => n.type === 'Visit');
    expect(visit).toBeDefined();
    expect(visit!.transition).toBe(expected);
  });

  it('marks an unrecognized transitionType as `unknown` and logs a warning so we notice a new value', async () => {
    const store = emptyStore();
    const state = emptyState();
    store.tabs.set(42, {
      id: tabNodeId('tabc_1'), type: 'Tab', recorded_at: 1,
      opened_at: 1, closed_at: null, browser_tab_id: 42,
    });

    const batch = await transformNavigationCommitted(
      makeEvent({
        id: 'nav_alien',
        type: 'navigation_committed',
        timestamp: NAV_TIME,
        tabId: 42,
        url: 'https://example.com/',
        // Fictional transition type Chrome might add tomorrow.
        metadata: { transitionType: 'nfc_beacon_from_watch' },
      }),
      makeContext(store, state),
    );

    const visit = (batch.nodes ?? []).find((n): n is VisitNode => n.type === 'Visit');
    expect(visit!.transition).toBe('unknown');
    expect(store.warnings.some((w) => w.message.includes('unknown transitionType'))).toBe(true);
  });

  it('marks a missing transitionType as `unknown` without warning (missing is normal)', async () => {
    const store = emptyStore();
    const state = emptyState();
    store.tabs.set(42, {
      id: tabNodeId('tabc_1'), type: 'Tab', recorded_at: 1,
      opened_at: 1, closed_at: null, browser_tab_id: 42,
    });

    const batch = await transformNavigationCommitted(
      makeEvent({
        id: 'nav_none',
        type: 'navigation_committed',
        timestamp: NAV_TIME,
        tabId: 42,
        url: 'https://example.com/',
        metadata: {},
      }),
      makeContext(store, state),
    );

    const visit = (batch.nodes ?? []).find((n): n is VisitNode => n.type === 'Visit');
    expect(visit!.transition).toBe('unknown');
    expect(store.warnings.filter((w) => w.message.includes('unknown transitionType'))).toHaveLength(0);
  });

  it('normalizes tracking params before computing Page identity', async () => {
    const store = emptyStore();
    const state = emptyState();
    store.tabs.set(42, {
      id: tabNodeId('tabc_1'), type: 'Tab', recorded_at: 1,
      opened_at: 1, closed_at: null, browser_tab_id: 42,
    });

    const batch = await transformNavigationCommitted(
      makeEvent({
        id: 'nav_utm',
        type: 'navigation_committed',
        timestamp: NAV_TIME,
        tabId: 42,
        url: 'https://example.com/article?utm_source=x&fbclid=y',
      }),
      makeContext(store, state),
    );
    const page = (batch.nodes ?? []).find((n): n is PageNode => n.type === 'Page');
    expect(page!.normalized_url).toBe('https://example.com/article');
  });
});

// ============================================================================
// focus_transition
// ============================================================================

describe('transformFocusTransition', () => {
  it('opens a focus interval on the incoming visit', async () => {
    const store = emptyStore();
    const state = emptyState();

    const target: VisitNode = {
      id: 'visit_target',
      type: 'Visit',
      recorded_at: 1,
      at_time: 1000,
      ended_at: null,
      focus_intervals: [],
      transition: 'link',
    };
    store.visits.set(target.id, target);

    const batch = await transformFocusTransition(
      makeEvent({
        id: 'focus_a',
        type: 'focus_transition',
        timestamp: 2000,
        metadata: { focused_visit: target.id },
      }),
      makeContext(store, state),
    );

    const updated = (batch.nodes ?? []).find((n): n is VisitNode => n.id === target.id);
    expect(updated!.focus_intervals).toEqual([{ start: 2000, end: null }]);
    expect(state.focused).toBe(target.id);
  });

  it('closes the outgoing visit\'s trailing interval and opens on the incoming', async () => {
    const store = emptyStore();
    const state = emptyState();
    state.focused = 'visit_outgoing';

    const outgoing: VisitNode = {
      id: 'visit_outgoing',
      type: 'Visit',
      recorded_at: 1,
      at_time: 1000,
      ended_at: null,
      focus_intervals: [{ start: 1000, end: null }],
      transition: 'link',
    };
    const incoming: VisitNode = {
      id: 'visit_incoming',
      type: 'Visit',
      recorded_at: 1,
      at_time: 1500,
      ended_at: null,
      focus_intervals: [],
      transition: 'link',
    };
    store.visits.set(outgoing.id, outgoing);
    store.visits.set(incoming.id, incoming);

    const batch = await transformFocusTransition(
      makeEvent({
        id: 'focus_b',
        type: 'focus_transition',
        timestamp: 3000,
        metadata: { focused_visit: incoming.id },
      }),
      makeContext(store, state),
    );

    const updatedOutgoing = (batch.nodes ?? []).find((n): n is VisitNode => n.id === outgoing.id);
    expect(updatedOutgoing!.focus_intervals).toEqual([{ start: 1000, end: 3000 }]);

    const updatedIncoming = (batch.nodes ?? []).find((n): n is VisitNode => n.id === incoming.id);
    // Interval starts at the focus_transition timestamp, not the visit's at_time.
    expect(updatedIncoming!.focus_intervals).toEqual([{ start: 3000, end: null }]);

    expect(state.focused).toBe(incoming.id);
  });

  it('handles null (browser lost focus) by closing outgoing without opening a new interval', async () => {
    const store = emptyStore();
    const state = emptyState();
    state.focused = 'visit_active';

    const outgoing: VisitNode = {
      id: 'visit_active',
      type: 'Visit',
      recorded_at: 1,
      at_time: 1000,
      ended_at: null,
      focus_intervals: [{ start: 1000, end: null }],
      transition: 'link',
    };
    store.visits.set(outgoing.id, outgoing);

    const batch = await transformFocusTransition(
      makeEvent({
        id: 'focus_null',
        type: 'focus_transition',
        timestamp: 4000,
        metadata: { focused_visit: null },
      }),
      makeContext(store, state),
    );

    expect(batch.nodes).toHaveLength(1);
    const updated = (batch.nodes ?? [])[0] as VisitNode;
    expect(updated.focus_intervals).toEqual([{ start: 1000, end: 4000 }]);
    expect(state.focused).toBeNull();
  });

  it('warns and skips when the incoming visit does not exist in the graph yet', async () => {
    const store = emptyStore();
    const state = emptyState();

    const batch = await transformFocusTransition(
      makeEvent({
        id: 'focus_missing',
        type: 'focus_transition',
        timestamp: 5000,
        metadata: { focused_visit: 'visit_not_ingested_yet' },
      }),
      makeContext(store, state),
    );

    // No node emitted for the missing visit.
    expect((batch.nodes ?? []).length).toBe(0);
    expect(store.warnings.some((w) => w.message.includes('incoming visit not in graph'))).toBe(true);
    // Focus pointer still advanced — future close-outs target the new id (or
    // never fire until they see the visit for the first time).
    expect(state.focused).toBe('visit_not_ingested_yet');
  });
});

// ============================================================================
// session_started
// ============================================================================

describe('transformSessionStarted', () => {
  it('creates a Session node, updates current-session pointer, and fans out in_session to active visits', async () => {
    const store = emptyStore();
    const state = emptyState();

    const activeVisit: VisitNode = {
      id: 'visit_active',
      type: 'Visit',
      recorded_at: 1,
      at_time: 500,
      ended_at: null,
      focus_intervals: [],
      transition: 'link',
    };
    store.activeVisitList = [activeVisit];

    const batch = await transformSessionStarted(
      makeEvent({
        id: 'sess_a',
        type: 'session_started',
        timestamp: 1000,
        metadata: { detectedBy: 'idle', title: 'Research' },
      }),
      makeContext(store, state),
    );

    const session = (batch.nodes ?? []).find((n): n is SessionNode => n.type === 'Session');
    expect(session!.id).toBe(sessionNodeId('sess_a'));
    expect(session!.detected_by).toBe('idle');
    expect(session!.started_at).toBe(1000);
    expect(session!.ended_at).toBeNull();
    expect(session!.title).toBe('Research');

    expect(state.currentSession).toBe(sessionNodeId('sess_a'));

    // in_session edge fanned out for the active visit.
    const inSession = (batch.edges ?? []).find((e) => e.type === 'in_session');
    expect(inSession).toBeDefined();
    expect(inSession!.from_id).toBe(activeVisit.id);
    expect(inSession!.to_id).toBe(sessionNodeId('sess_a'));
  });
});

// ============================================================================
// session_ended
// ============================================================================

describe('transformSessionEnded', () => {
  it('closes the Session\'s ended_at and clips open in_session edges', async () => {
    const store = emptyStore();
    const state = emptyState();
    state.currentSession = 'session_x';

    const session: SessionNode = {
      id: 'session_x',
      type: 'Session',
      recorded_at: 1,
      started_at: 1000,
      ended_at: null,
      detected_by: 'idle',
      title: null,
    };
    store.sessions.set(session.id, session);

    const openEdge: IntervalEdge = {
      id: 'e_in_session_a',
      kind: 'interval',
      type: 'in_session',
      from_id: 'visit_a',
      to_id: session.id,
      recorded_at: 1,
      valid_from: 1000,
      valid_to: null,
    };
    store.inSessionEdgesForSession.set(session.id, [openEdge]);

    const batch = await transformSessionEnded(
      makeEvent({
        id: 'sess_end',
        type: 'session_ended',
        timestamp: 2000,
      }),
      makeContext(store, state),
    );

    const closedSession = (batch.nodes ?? [])[0] as SessionNode;
    expect(closedSession.ended_at).toBe(2000);

    const clippedEdge = (batch.edges ?? [])[0] as IntervalEdge;
    expect(clippedEdge.valid_to).toBe(2000);

    expect(state.currentSession).toBeNull();
  });
});

// ============================================================================
// tag_applied / tag_removed
// ============================================================================

describe('transformTagApplied', () => {
  it('creates a Tag node when new and emits a tagged_with edge from the current session', async () => {
    const store = emptyStore();
    const state = emptyState();
    state.currentSession = 'session_x';

    const batch = await transformTagApplied(
      makeEvent({
        id: 'tag_a',
        type: 'tag_applied',
        timestamp: 1500,
        metadata: { slug: 'research', label: 'Research' },
      }),
      makeContext(store, state),
    );

    const tag = (batch.nodes ?? []).find((n): n is TagNode => n.type === 'Tag');
    expect(tag!.id).toBe(tagNodeId('research'));
    expect(tag!.slug).toBe('research');
    expect(tag!.label).toBe('Research');

    const edge = (batch.edges ?? []).find((e) => e.type === 'tagged_with');
    expect(edge!.from_id).toBe('session_x');
    expect(edge!.to_id).toBe(tagNodeId('research'));
    expect(edge!.kind).toBe('point');
  });

  it('does not re-create an existing Tag but still emits the tagged_with edge', async () => {
    const store = emptyStore();
    const state = emptyState();
    state.currentSession = 'session_x';

    store.tags.set('research', {
      id: tagNodeId('research'),
      type: 'Tag',
      recorded_at: 1,
      slug: 'research',
      label: 'Research',
      created_at: 1,
    });

    const batch = await transformTagApplied(
      makeEvent({
        id: 'tag_b',
        type: 'tag_applied',
        timestamp: 1500,
        metadata: { slug: 'research' },
      }),
      makeContext(store, state),
    );

    expect(batch.nodes ?? []).toHaveLength(0);
    expect((batch.edges ?? []).some((e) => e.type === 'tagged_with')).toBe(true);
  });
});

describe('transformTagRemoved', () => {
  it('emits an empty batch and logs an intent warning (edge-deletion is deferred)', async () => {
    const store = emptyStore();
    const state = emptyState();

    const batch = await transformTagRemoved(
      makeEvent({
        id: 'tag_r',
        type: 'tag_removed',
        timestamp: 3000,
        metadata: { slug: 'research', sessionNodeId: 'session_x' },
      }),
      makeContext(store, state),
    );

    expect(batch).toEqual({});
    expect(store.warnings.some((w) => w.message.includes('tag_removed not yet materialized'))).toBe(true);
  });
});

// ============================================================================
// Search-engine detection helper
// ============================================================================

describe('detectSearchEngine', () => {
  it.each([
    ['https://www.google.com/search?q=hello', 'google', 'hello'],
    ['https://www.bing.com/search?q=hello%20world', 'bing', 'hello world'],
    // URLSearchParams.get decodes `+` to a space per the WHATWG URL spec.
    ['https://duckduckgo.com/?q=temporal+graph', 'ddg', 'temporal graph'],
    ['https://www.youtube.com/results?search_query=jazz', 'youtube', 'jazz'],
  ])('recognises %s as engine=%s', (url, engine, query) => {
    const hit = detectSearchEngine(url);
    expect(hit).not.toBeNull();
    expect(hit!.engine).toBe(engine);
    expect(hit!.queryText).toBe(query);
  });

  it('rejects non-search google URLs', () => {
    expect(detectSearchEngine('https://google.com/maps?q=hi')).toBeNull();
    expect(detectSearchEngine('https://www.google.com/search')).toBeNull();
  });

  it('produces the same SearchQuery id for the same (engine, query) pair', () => {
    const a = searchQueryNodeId('google', 'temporal graph');
    const b = searchQueryNodeId('google', 'TEMPORAL GRAPH');
    // lowercased, trimmed hash — same query text collapses to same id.
    expect(a).toBe(b);
  });
});
