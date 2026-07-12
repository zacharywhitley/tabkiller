/**
 * Background service worker for TabKiller extension
 * Handles tab tracking, session management, and cross-browser compatibility
 */

// Surface any error that escapes handlers below so it isn't lost in the
// service worker's short lifetime.
self.addEventListener('error', (ev) => {
  console.error('service-worker: uncaught error:', ev.message, ev.error);
});
self.addEventListener('unhandledrejection', (ev) => {
  console.error('service-worker: unhandled rejection:', ev.reason);
});

import {
  getBrowserAPI,
  detectBrowser,
  isManifestV3,
  tabs as tabsAPI,
  storage,
  messaging,
  history
} from '../utils/cross-browser';
import {
  BrowsingSession,
  BrowsingEvent,
  TabInfo,
  NavigationEvent,
  Message,
  MessageResponse,
  BackgroundState,
  ExtensionSettings,
  TabEvent,
  WindowEvent,
  TabKillerError,
  TrackingConfig
} from '../shared/types';
import { LocalEventStore } from '../storage/LocalEventStore';
import { FocusEmitter, FocusTransition } from '../session/tracking/FocusEmitter';
import { SessionEmitter } from '../session/tracking/SessionEmitter';
import { GraphStore } from '../database/graph/store';
import { GraphIngest, GRAPH_INGEST_ALARM_NAME } from '../database/graph/ingest';
import { SessionStorageEngine } from '../session/storage/SessionStorageEngine';
import { Shipper } from './shipping/Shipper';

function generateEventId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// LocalEventStore only reads `batchSize` from TrackingConfig at write time.
// The other fields exist for the older tracking layer; we supply defaults so
// the type is satisfied without pretending we use them.
const OUTBOX_TRACKING_CONFIG: TrackingConfig = {
  enableTabTracking: true,
  enableWindowTracking: true,
  enableNavigationTracking: true,
  enableSessionTracking: true,
  enableFormTracking: false,
  enableScrollTracking: false,
  enableClickTracking: false,
  privacyMode: 'moderate',
  excludeIncognito: false,
  excludeDomains: [],
  includeDomains: [],
  sensitiveFieldFilters: [],
  batchSize: 100,
  batchInterval: 30000,
  maxEventsInMemory: 1000,
  storageCleanupInterval: 3600000,
  idleThreshold: 300000,
  sessionGapThreshold: 900000,
  domainChangeSessionBoundary: false,
  enableProductivityMetrics: false,
  deepWorkThreshold: 0,
  distractionThreshold: 0
};

class BackgroundService {
  private state: BackgroundState;
  private browser = getBrowserAPI();
  private currentBrowser = detectBrowser();

  // Outbox: write-ahead log of capture events. The graph ingest pipeline
  // (see graphIngest below) drains these into the graph store; here we
  // only append and kick a debounced drain.
  private outbox: LocalEventStore;

  // Most recent committed navigation event id per browser tab. Used to
  // resolve durable Visit ids for opener chains and focus transitions.
  private latestVisitByTab: Map<number, string> = new Map();

  private focusEmitter: FocusEmitter;

  // Session emission. Owned by the SW so `session_started` /
  // `session_ended` land in the outbox alongside the other capture
  // events — the graph transformer already has fanouts for both.
  private sessionEmitter: SessionEmitter;

  // Graph ingest pipeline. Lazily wired in initialize() because it needs
  // a live IndexedDB connection from SessionStorageEngine.
  private sessionStorageEngine: SessionStorageEngine;
  private graphIngest?: GraphIngest;

  // Optional external log shipper — pilot for the extension-as-thin-
  // client architecture. When settings.shipTo is set, every event
  // written to the outbox is also POSTed to the configured server.
  private shipper?: Shipper;

  constructor() {
    this.state = {
      activeTabs: new Map(),
      settings: this.getDefaultSettings(),
      syncStatus: {
        enabled: false,
        lastSync: 0,
        inProgress: false,
        errors: [],
        totalSynced: 0
      }
    };

    this.outbox = new LocalEventStore(OUTBOX_TRACKING_CONFIG);
    this.sessionStorageEngine = new SessionStorageEngine();
    this.focusEmitter = new FocusEmitter({
      resolveVisitForTab: (tabId) => this.latestVisitByTab.get(tabId) ?? null
    });
    this.sessionEmitter = new SessionEmitter({
      outbox: this.outbox,
      onEmit: () => this.graphIngest?.drainSoon()
    });
  }

  /**
   * Initialize the background service
   */
  async initialize(): Promise<void> {
    try {
      console.log(`TabKiller initializing on ${this.currentBrowser}...`);

      // Load settings and state
      await this.loadSettings();
      await this.loadState();

      // Bring the outbox online before any capture handlers fire.
      await this.outbox.initialize();

      // Optional shipping: if a shipTo URL is configured, monkey-patch
      // outbox.storeEvent so every stored event also POSTs to the
      // server. Fire-and-forget; local capture is unaffected. Pilot
      // for the extension-as-thin-client architecture.
      if (this.state.settings.shipTo) {
        this.shipper = new Shipper(this.state.settings.shipTo);
        const originalStoreEvent = this.outbox.storeEvent.bind(this.outbox);
        this.outbox.storeEvent = async (event: BrowsingEvent) => {
          await originalStoreEvent(event);
          this.shipper!.enqueue(event);
        };
        console.log('TabKiller shipping enabled →', this.state.settings.shipTo);
      }

      // Open the fresh session BEFORE anything else can push events into
      // the outbox. `session_started` must precede the first
      // `navigation_committed` so the graph transformer emits `in_session`
      // edges for every visit captured this session.
      await this.sessionEmitter.start('session_restore');

      // Bring the graph ingest pipeline online: open the shared IndexedDB
      // via SessionStorageEngine, hand its connection to a GraphStore,
      // and hand that to the ingest. Failures here degrade to "old paths
      // only" — the outbox keeps accumulating and can drain on next boot.
      try {
        await this.sessionStorageEngine.initialize();
        const graph = new GraphStore(this.sessionStorageEngine.getDatabase());
        this.graphIngest = new GraphIngest({ outbox: this.outbox, graph });
        await this.graphIngest.initialize();
      } catch (error) {
        console.warn('Graph ingest initialization failed:', error);
      }

      // Set up event listeners
      this.setupEventListeners();

      // Initialize current tabs
      await this.initializeCurrentTabs();

      // Reconcile graph state against the browser's actual state.
      // Tab/window close events that fired while the SW was down are lost,
      // leaving Tab/Window nodes forever in the "open" state and blowing up
      // the "open tabs" count in the dashboard. Fix that by asking the
      // browser what's actually open and closing anything the graph still
      // thinks is open that the browser no longer has.
      await this.reconcileOpenTabsAndWindows();

      console.log('TabKiller background service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize TabKiller background service:', error);
      throw new TabKillerError(
        'INIT_FAILED',
        'Failed to initialize background service',
        'background',
        error
      );
    }
  }

  /**
   * Set up all event listeners for tabs, windows, and messaging
   */
  private setupEventListeners(): void {
    // Tab events
    tabsAPI.onCreated.addListener(this.handleTabCreated.bind(this));
    tabsAPI.onUpdated.addListener(this.handleTabUpdated.bind(this));
    tabsAPI.onRemoved.addListener(this.handleTabRemoved.bind(this));
    tabsAPI.onActivated.addListener(this.handleTabActivated.bind(this));

    // Window events
    this.browser.windows.onCreated.addListener(this.handleWindowCreated.bind(this));
    this.browser.windows.onRemoved.addListener(this.handleWindowRemoved.bind(this));
    this.browser.windows.onFocusChanged.addListener(this.handleWindowFocusChanged.bind(this));

    // History events
    if (history.onVisited) {
      history.onVisited.addListener(this.handleHistoryVisited.bind(this));
    }

    // webNavigation events (source of ground-truth transitionType).
    // Filter to http/https so chrome:// and about: navigations don't spam the
    // outbox. addListener throws if the API is unavailable (e.g. Safari
    // without the permission granted) — degrade to a warning.
    if (this.browser.webNavigation && this.browser.webNavigation.onCommitted) {
      try {
        this.browser.webNavigation.onCommitted.addListener(
          this.handleWebNavigationCommitted.bind(this),
          { url: [{ schemes: ['http', 'https'] }] }
        );
      } catch (error) {
        console.warn('webNavigation.onCommitted registration failed:', error);
      }
    } else {
      console.warn('webNavigation API unavailable; transitionType capture disabled');
    }

    // Focus transitions unified from tabs.onActivated + windows.onFocusChanged.
    this.focusEmitter.onFocusTransition(this.handleFocusTransition.bind(this));
    this.focusEmitter.start();

    // Message passing
    messaging.onMessage.addListener(this.handleMessage.bind(this));

    // Extension lifecycle events
    this.browser.runtime.onStartup.addListener(this.handleStartup.bind(this));
    this.browser.runtime.onInstalled.addListener(this.handleInstalled.bind(this));

    // Graph-ingest alarm. Fires every 30s so drain runs even when hot
    // writes are absent (e.g. the SW slept, then woke up with a stale
    // outbox). The alarms API is optional in some environments — degrade
    // to drainSoon-only if the API is unavailable.
    if (this.browser.alarms) {
      try {
        this.browser.alarms.create(GRAPH_INGEST_ALARM_NAME, { periodInMinutes: 0.5 });
        this.browser.alarms.onAlarm.addListener((alarm) => {
          if (alarm.name === GRAPH_INGEST_ALARM_NAME) {
            void this.graphIngest?.runAlarm();
          }
        });
      } catch (error) {
        console.warn('graph-ingest alarm registration failed:', error);
      }
    } else {
      console.warn('chrome.alarms unavailable; graph ingest will only run on drainSoon()');
    }

    // Context menu (if supported)
    if (this.browser.contextMenus) {
      this.setupContextMenus();
    }
  }

  /**
   * Handle tab creation
   */
  private async handleTabCreated(tab: chrome.tabs.Tab): Promise<void> {
    try {
      const tabInfo: TabInfo = {
        id: tab.id!,
        url: tab.url || '',
        title: tab.title || '',
        favicon: tab.favIconUrl,
        windowId: tab.windowId,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        timeSpent: 0,
        scrollPosition: 0
      };

      this.state.activeTabs.set(tab.id!, tabInfo);

      // Resolve opener → parent visit id. If the opener has no committed
      // navigation yet, emit without an opener; do not block.
      const openerTabId = tab.openerTabId;
      const openerVisitId = openerTabId !== undefined
        ? this.latestVisitByTab.get(openerTabId) ?? null
        : null;

      const outboxEvent: BrowsingEvent = {
        id: generateEventId('tabc'),
        timestamp: Date.now(),
        type: 'tab_created',
        tabId: tab.id!,
        windowId: tab.windowId,
        url: tab.url || undefined,
        title: tab.title || undefined,
        sessionId: '',
        metadata: {
          openerTabId,
          openerVisitId: openerVisitId ?? undefined,
          incognito: tab.incognito ?? false
        }
      };
      await this.sessionEmitter.noteActivity(outboxEvent.timestamp);
      await this.outbox.storeEvent(outboxEvent);
      this.graphIngest?.drainSoon();

      const event: TabEvent = {
        type: 'created',
        tabId: tab.id!,
        windowId: tab.windowId,
        timestamp: Date.now(),
        data: tabInfo
      };

      await this.processTabEvent(event);
    } catch (error) {
      console.error('Error handling tab created:', error);
    }
  }

  /**
   * Handle webNavigation.onCommitted. This is the ground-truth source of
   * `transitionType` — tabs.onUpdated does not surface it. The event id
   * becomes the durable Visit id used by the focus emitter and opener
   * chain resolution.
   */
  private async handleWebNavigationCommitted(
    details: chrome.webNavigation.WebNavigationTransitionCallbackDetails
  ): Promise<void> {
    // Ignore sub-frame navigations; they are not user-visible visits.
    if (details.frameId !== 0) return;

    // Read the tab's current title at commit time. It is often stale or
    // empty for SPAs because the DOM hasn't resolved yet — the follow-up
    // `tabs.onUpdated{title}` event handles late arrivals — but for
    // static pages the title is already present here and we want it on
    // the Page node from the first write.
    let commitTitle: string | undefined;
    try {
      const tab = await this.browser.tabs.get(details.tabId);
      if (tab && typeof tab.title === 'string' && tab.title.length > 0) {
        commitTitle = tab.title;
      }
    } catch {
      // Tab may already be closed or unavailable — proceed without a title.
    }

    const eventId = generateEventId('visit');
    const event: BrowsingEvent = {
      id: eventId,
      timestamp: details.timeStamp,
      type: 'navigation_committed',
      tabId: details.tabId,
      url: details.url,
      title: commitTitle,
      sessionId: '',
      metadata: {
        transitionType: details.transitionType as any,
        transitionQualifiers: details.transitionQualifiers,
        frameId: details.frameId
      }
    };

    try {
      await this.sessionEmitter.noteActivity(event.timestamp);
      await this.outbox.storeEvent(event);
    } catch (error) {
      console.warn('Failed to append webNavigation event to outbox:', error);
      return;
    }
    this.graphIngest?.drainSoon();

    // Update the tab → visit index; this is what the focus emitter and
    // opener-chain resolver read from.
    this.latestVisitByTab.set(details.tabId, eventId);

    // If this tab is currently focused, re-emit a focus transition so the
    // focus interval closes on the old visit and opens on the new one.
    await this.focusEmitter.notifyVisitChange(details.tabId, eventId);
  }

  /**
   * Forward normalized focus transitions from the FocusEmitter into the
   * outbox. T4 ingests these into `focus_intervals` on the current Visit.
   */
  private async handleFocusTransition(transition: FocusTransition): Promise<void> {
    const event: BrowsingEvent = {
      id: generateEventId('focus'),
      timestamp: transition.at,
      type: 'focus_transition',
      tabId: transition.focused_tab_id ?? undefined,
      sessionId: '',
      metadata: {
        focused_visit: transition.focused_visit,
        browserTabId: transition.focused_tab_id
      }
    };

    try {
      await this.sessionEmitter.noteActivity(event.timestamp);
      await this.outbox.storeEvent(event);
    } catch (error) {
      console.warn('Failed to append focus transition to outbox:', error);
      return;
    }
    this.graphIngest?.drainSoon();
  }

  /**
   * Handle tab updates
   */
  private async handleTabUpdated(
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab
  ): Promise<void> {
    try {
      const existingTab = this.state.activeTabs.get(tabId);

      if (!existingTab) {
        // Tab wasn't tracked yet, create it
        await this.handleTabCreated(tab);
        return;
      }

      // Update tab information
      const updatedTab: TabInfo = {
        ...existingTab,
        url: tab.url || existingTab.url,
        title: tab.title || existingTab.title,
        favicon: tab.favIconUrl || existingTab.favicon,
        lastAccessed: Date.now()
      };

      this.state.activeTabs.set(tabId, updatedTab);

      // Late-title propagation: SPAs frequently commit navigation with an
      // empty/stale <title> then set the real one after the DOM resolves.
      // Emit a `tab_updated` outbox event carrying the new title + the
      // tab's current URL so the transformer can rewrite the Page node
      // in place. The title check is against what the DOM now reports,
      // not against changeInfo.title alone — that field is only set on
      // the specific update, and we still want to catch a stale-title
      // Page node when the update carries only a URL.
      const nextTitle = changeInfo.title ?? tab.title;
      const nextUrl = changeInfo.url ?? tab.url;
      if (
        nextTitle &&
        nextUrl &&
        nextTitle !== existingTab.title
      ) {
        const titleEvent: BrowsingEvent = {
          id: generateEventId('tabu'),
          timestamp: Date.now(),
          type: 'tab_updated',
          tabId,
          windowId: tab.windowId,
          url: nextUrl,
          title: nextTitle,
          sessionId: '',
          metadata: {}
        };
        try {
          await this.outbox.storeEvent(titleEvent);
          this.graphIngest?.drainSoon();
        } catch (error) {
          console.warn('Failed to append tab_updated title event to outbox:', error);
        }
      }

      // Track navigation if URL changed
      if (changeInfo.url) {
        const navigationEvent: NavigationEvent = {
          tabId,
          url: changeInfo.url,
          referrer: existingTab.url,
          timestamp: Date.now(),
          transitionType: 'link' // Default, could be enhanced with actual transition detection
        };

        await this.trackNavigation(navigationEvent);
      }

      const event: TabEvent = {
        type: 'updated',
        tabId,
        windowId: tab.windowId,
        timestamp: Date.now(),
        data: changeInfo
      };

      await this.processTabEvent(event);
    } catch (error) {
      console.error('Error handling tab updated:', error);
    }
  }

  /**
   * Handle tab removal
   */
  private async handleTabRemoved(tabId: number, removeInfo: chrome.tabs.TabRemoveInfo): Promise<void> {
    try {
      const tabInfo = this.state.activeTabs.get(tabId);

      if (tabInfo) {
        // Calculate final time spent
        tabInfo.timeSpent += Date.now() - tabInfo.lastAccessed;

        // Save tab data before removal
        await this.saveTabData(tabInfo);

        // Remove from active tabs
        this.state.activeTabs.delete(tabId);
      }

      // Drop the visit index entry — the tab is gone; keeping it would leak
      // memory and could resurrect a stale visit id if the browser reuses
      // the tab id.
      this.latestVisitByTab.delete(tabId);

      const event: TabEvent = {
        type: 'removed',
        tabId,
        windowId: removeInfo.windowId,
        timestamp: Date.now()
      };

      // Emit tab_removed to the outbox so the graph transformer sets
      // Tab.closed_at. Without this, tabs never close in the graph and
      // "open tab" counts climb without bound.
      const outboxEvent: BrowsingEvent = {
        id: generateEventId('tabr'),
        timestamp: event.timestamp,
        type: 'tab_removed',
        tabId,
        windowId: removeInfo.windowId,
        sessionId: '',
        metadata: {
          isWindowClosing: removeInfo.isWindowClosing ?? false,
        },
      };
      await this.sessionEmitter.noteActivity(outboxEvent.timestamp);
      await this.outbox.storeEvent(outboxEvent);
      this.graphIngest?.drainSoon();

      await this.processTabEvent(event);
    } catch (error) {
      console.error('Error handling tab removed:', error);
    }
  }

  /**
   * Handle tab activation
   */
  private async handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
    try {
      const now = Date.now();
      
      // Update previous active tab's time
      for (const [tabId, tabInfo] of this.state.activeTabs) {
        if (tabId === activeInfo.tabId) {
          tabInfo.lastAccessed = now;
        } else {
          // Add time to inactive tabs
          tabInfo.timeSpent += now - tabInfo.lastAccessed;
        }
      }

      const event: TabEvent = {
        type: 'activated',
        tabId: activeInfo.tabId,
        windowId: activeInfo.windowId,
        timestamp: now
      };

      await this.processTabEvent(event);
    } catch (error) {
      console.error('Error handling tab activated:', error);
    }
  }

  /**
   * Handle window events
   */
  private async handleWindowCreated(window: chrome.windows.Window): Promise<void> {
    const event: WindowEvent = {
      type: 'created',
      windowId: window.id!,
      timestamp: Date.now()
    };
    
    await this.processWindowEvent(event);
  }

  private async handleWindowRemoved(windowId: number): Promise<void> {
    const event: WindowEvent = {
      type: 'removed',
      windowId,
      timestamp: Date.now()
    };

    // Emit window_removed to the outbox so the graph transformer sets
    // Window.closed_at and closes any still-open child tabs. Without this
    // Windows never close and "open window" counts climb indefinitely.
    const outboxEvent: BrowsingEvent = {
      id: generateEventId('winr'),
      timestamp: event.timestamp,
      type: 'window_removed',
      windowId,
      sessionId: '',
      metadata: {},
    };
    await this.sessionEmitter.noteActivity(outboxEvent.timestamp);
    await this.outbox.storeEvent(outboxEvent);
    this.graphIngest?.drainSoon();

    await this.processWindowEvent(event);
  }

  private async handleWindowFocusChanged(windowId: number): Promise<void> {
    if (windowId === this.browser.windows.WINDOW_ID_NONE) return;
    
    const event: WindowEvent = {
      type: 'focus_changed',
      windowId,
      timestamp: Date.now()
    };
    
    await this.processWindowEvent(event);
  }

  /**
   * Handle navigation events
   */
  private async handleHistoryVisited(item: chrome.history.HistoryItem): Promise<void> {
    // This will be expanded for more detailed navigation tracking
    console.log('History visited:', item.url);
  }

  /**
   * Handle runtime messages
   */
  private async handleMessage(
    message: Message,
    sender: chrome.runtime.MessageSender
  ): Promise<MessageResponse> {
    try {
      switch (message.type) {
        case 'get-status':
          return { success: true, data: this.getStatus() };
          
        case 'get-settings':
          return { success: true, data: this.state.settings };
          
        case 'update-settings':
          await this.updateSettings(message.payload as Partial<ExtensionSettings>);
          return { success: true, data: this.state.settings };
          
        case 'create-session':
          const session = await this.createSession(message.payload as { tag: string });
          return { success: true, data: session };
          
        case 'get-current-session':
          return { success: true, data: this.state.currentSession };
          
        case 'capture-tabs':
          const capturedTabs = await this.captureCurrentTabs();
          return { success: true, data: capturedTabs };
          
        case 'ping':
          return { success: true, data: 'pong' };

        case 'apply-tag':
          return { success: true, data: await this.applyTagFromMessage(message.payload) };

        case 'remove-tag':
          return { success: true, data: await this.removeTagFromMessage(message.payload) };

        case 'get-current-session-id':
          return {
            success: true,
            data: this.currentSessionNodeId()
          };

        default:
          throw new TabKillerError(
            'UNKNOWN_MESSAGE',
            `Unknown message type: ${message.type}`,
            'background'
          );
      }
    } catch (error) {
      console.error('Error handling message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: message.requestId
      };
    }
  }

  /**
   * Extension lifecycle handlers
   */
  private async handleStartup(): Promise<void> {
    console.log('TabKiller extension started');
    await this.initialize();
  }

  private async handleInstalled(details: chrome.runtime.InstalledDetails): Promise<void> {
    console.log('TabKiller extension installed:', details.reason);
    
    if (details.reason === 'install') {
      // First installation
      await this.performFirstTimeSetup();
    } else if (details.reason === 'update') {
      // Extension updated
      await this.performUpdateMigration(details.previousVersion);
    }
  }

  /**
   * Core functionality methods
   */
  private async initializeCurrentTabs(): Promise<void> {
    const tabs = await tabsAPI.getAll();

    for (const tab of tabs) {
      if (tab.id) {
        await this.handleTabCreated(tab);
      }
    }
  }

  /**
   * Ghost-state cleanup. Any Tab or Window node in the graph with
   * closed_at == null but no matching entry in the actual browser is a
   * close event we missed while the SW was down; emit a synthetic
   * tab_removed / window_removed to close them out. Runs once per SW
   * startup after the graph is fully initialized.
   */
  private async reconcileOpenTabsAndWindows(): Promise<void> {
    if (!this.graphIngest) return;
    try {
      const [liveTabs, liveWindows] = await Promise.all([
        this.browser.tabs.query({}),
        this.browser.windows.getAll(),
      ]);
      const liveTabIds = new Set(liveTabs.map((t) => t.id).filter((id): id is number => id !== undefined));
      const liveWindowIds = new Set(liveWindows.map((w) => w.id).filter((id): id is number => id !== undefined));

      const graph = new GraphStore(this.sessionStorageEngine.getDatabase());
      const now = Date.now();
      let ghostTabs = 0;
      let dupTabs = 0;
      let ghostWindows = 0;
      let dupWindows = 0;

      // Group open Tab nodes by browser_tab_id and by liveness. For each
      // browser_tab_id we want at most one open Tab node in the graph;
      // extras are duplicates from before the tab_created idempotency fix
      // and should be closed. Tabs whose browser_tab_id isn't live at all
      // are ghosts and get closed regardless.
      const openTabsByBid = new Map<number, import('../database/graph/types').TabNode[]>();
      const openGhostTabs: import('../database/graph/types').TabNode[] = [];
      for (const tab of await graph.nodesOfType<import('../database/graph/types').TabNode>('Tab')) {
        if (tab.closed_at != null) continue;
        if (!liveTabIds.has(tab.browser_tab_id)) {
          openGhostTabs.push(tab);
          continue;
        }
        const bucket = openTabsByBid.get(tab.browser_tab_id);
        if (bucket) bucket.push(tab);
        else openTabsByBid.set(tab.browser_tab_id, [tab]);
      }

      const closeTabById = async (nodeId: string): Promise<void> => {
        // Directly overwrite the Tab node's closed_at via a batch write —
        // going through the outbox works too but requires the browser
        // event shape, and here we already have the graph node in hand.
        const store = new GraphStore(this.sessionStorageEngine.getDatabase());
        const tab = await store.getNode<import('../database/graph/types').TabNode>(nodeId);
        if (!tab || tab.closed_at != null) return;
        await store.writeBatch({ nodes: [{ ...tab, recorded_at: now, closed_at: now }] });
      };

      for (const tab of openGhostTabs) {
        await closeTabById(tab.id);
        ghostTabs++;
      }
      for (const [, dupBucket] of openTabsByBid) {
        if (dupBucket.length <= 1) continue;
        // Keep the most-recently-opened one; close the rest.
        dupBucket.sort((a, b) => b.opened_at - a.opened_at);
        for (let i = 1; i < dupBucket.length; i++) {
          await closeTabById(dupBucket[i].id);
          dupTabs++;
        }
      }

      const openWindowsByBid = new Map<number, import('../database/graph/types').WindowNode[]>();
      const openGhostWindows: import('../database/graph/types').WindowNode[] = [];
      for (const win of await graph.nodesOfType<import('../database/graph/types').WindowNode>('Window')) {
        if (win.closed_at != null) continue;
        if (!liveWindowIds.has(win.browser_window_id)) {
          openGhostWindows.push(win);
          continue;
        }
        const bucket = openWindowsByBid.get(win.browser_window_id);
        if (bucket) bucket.push(win);
        else openWindowsByBid.set(win.browser_window_id, [win]);
      }

      const closeWindowById = async (nodeId: string): Promise<void> => {
        const store = new GraphStore(this.sessionStorageEngine.getDatabase());
        const win = await store.getNode<import('../database/graph/types').WindowNode>(nodeId);
        if (!win || win.closed_at != null) return;
        await store.writeBatch({ nodes: [{ ...win, recorded_at: now, closed_at: now }] });
      };

      for (const win of openGhostWindows) {
        await closeWindowById(win.id);
        ghostWindows++;
      }
      for (const [, dupBucket] of openWindowsByBid) {
        if (dupBucket.length <= 1) continue;
        dupBucket.sort((a, b) => b.opened_at - a.opened_at);
        for (let i = 1; i < dupBucket.length; i++) {
          await closeWindowById(dupBucket[i].id);
          dupWindows++;
        }
      }

      if (ghostTabs > 0 || dupTabs > 0 || ghostWindows > 0 || dupWindows > 0) {
        console.log(
          `TabKiller reconcile: closed ${ghostTabs} ghost + ${dupTabs} duplicate tab(s), ` +
            `${ghostWindows} ghost + ${dupWindows} duplicate window(s)`,
        );
      }
    } catch (error) {
      console.warn('Ghost reconciliation failed:', error);
    }
  }

  private async createSession(options: { tag: string }): Promise<BrowsingSession> {
    const session: BrowsingSession = {
      id: this.generateId(),
      tag: options.tag,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tabs: Array.from(this.state.activeTabs.values()),
      windowIds: [...new Set(Array.from(this.state.activeTabs.values()).map(t => t.windowId))],
      metadata: {
        isPrivate: false,
        totalTime: 0,
        pageCount: this.state.activeTabs.size,
        domain: [...new Set(Array.from(this.state.activeTabs.values())
          .map(t => new URL(t.url || 'about:blank').hostname)
          .filter(Boolean))]
      }
    };

    this.state.currentSession = session;
    await this.saveSession(session);

    return session;
  }

  private async captureCurrentTabs(): Promise<TabInfo[]> {
    return Array.from(this.state.activeTabs.values());
  }

  /**
   * The session_node id (`session_<eventId>`) for the currently open
   * session. Exposed so the debug-tag form can target the running
   * session without the developer looking it up by hand.
   */
  private currentSessionNodeId(): string | null {
    const eventId = this.sessionEmitter.currentSessionEventId();
    return eventId ? `session_${eventId}` : null;
  }

  /**
   * Append a `tag_applied` outbox event. Used by the developer debug
   * form: caller supplies a `slug`, optional `label`, and either an
   * explicit `sessionNodeId` (from the debug UI where the developer
   * picked one out of the graph) or falls through to the currently
   * open session. Fails fast when neither is available so the debug
   * form surfaces the misuse.
   */
  private async applyTagFromMessage(payload: unknown): Promise<{ eventId: string; sessionNodeId: string; slug: string }> {
    const p = (payload ?? {}) as { slug?: string; label?: string; sessionNodeId?: string };
    const slug = typeof p.slug === 'string' ? p.slug.trim() : '';
    if (!slug) throw new TabKillerError('BAD_REQUEST', 'apply-tag: slug is required', 'background');

    const sessionNodeId = p.sessionNodeId?.trim() || this.currentSessionNodeId();
    if (!sessionNodeId) {
      throw new TabKillerError(
        'BAD_REQUEST',
        'apply-tag: no sessionNodeId supplied and no session is currently open',
        'background'
      );
    }

    const eventId = generateEventId('tagapp');
    const event: BrowsingEvent = {
      id: eventId,
      timestamp: Date.now(),
      type: 'tag_applied',
      sessionId: '',
      metadata: {
        slug,
        label: p.label,
        sessionNodeId
      }
    };
    await this.outbox.storeEvent(event);
    this.graphIngest?.drainSoon();
    return { eventId, sessionNodeId, slug };
  }

  /**
   * Append a `tag_removed` outbox event. Same target-resolution logic
   * as `applyTagFromMessage`.
   */
  private async removeTagFromMessage(payload: unknown): Promise<{ eventId: string; sessionNodeId: string; slug: string }> {
    const p = (payload ?? {}) as { slug?: string; sessionNodeId?: string };
    const slug = typeof p.slug === 'string' ? p.slug.trim() : '';
    if (!slug) throw new TabKillerError('BAD_REQUEST', 'remove-tag: slug is required', 'background');

    const sessionNodeId = p.sessionNodeId?.trim() || this.currentSessionNodeId();
    if (!sessionNodeId) {
      throw new TabKillerError(
        'BAD_REQUEST',
        'remove-tag: no sessionNodeId supplied and no session is currently open',
        'background'
      );
    }

    const eventId = generateEventId('tagrem');
    const event: BrowsingEvent = {
      id: eventId,
      timestamp: Date.now(),
      type: 'tag_removed',
      sessionId: '',
      metadata: {
        slug,
        sessionNodeId
      }
    };
    await this.outbox.storeEvent(event);
    this.graphIngest?.drainSoon();
    return { eventId, sessionNodeId, slug };
  }

  /**
   * Data persistence methods
   */
  private async loadSettings(): Promise<void> {
    const stored = await storage.get<{ settings?: ExtensionSettings }>('settings');
    if (stored.settings) {
      this.state.settings = { ...this.getDefaultSettings(), ...stored.settings };
    }
  }

  private async saveSettings(): Promise<void> {
    await storage.set({ settings: this.state.settings });
  }

  private async updateSettings(updates: Partial<ExtensionSettings>): Promise<void> {
    this.state.settings = { ...this.state.settings, ...updates };
    await this.saveSettings();
  }

  private async loadState(): Promise<void> {
    // Load persisted state if needed
    const stored = await storage.get<{ currentSession?: BrowsingSession }>('currentSession');
    if (stored.currentSession) {
      this.state.currentSession = stored.currentSession;
    }
  }

  private async saveSession(session: BrowsingSession): Promise<void> {
    await storage.set({ [`session_${session.id}`]: session });
    if (this.state.currentSession?.id === session.id) {
      await storage.set({ currentSession: session });
    }
  }

  private async saveTabData(tabInfo: TabInfo): Promise<void> {
    // This will be expanded for full data persistence
    console.log('Saving tab data:', tabInfo);
  }

  /**
   * Event processing
   */
  private async processTabEvent(event: TabEvent): Promise<void> {
    // Process tab events for session management
    if (this.state.currentSession) {
      this.state.currentSession.updatedAt = event.timestamp;
      await this.saveSession(this.state.currentSession);
    }
  }

  private async processWindowEvent(event: WindowEvent): Promise<void> {
    // Process window events
    console.log('Window event:', event);
  }

  private async trackNavigation(event: NavigationEvent): Promise<void> {
    // Track navigation for browsing history
    console.log('Navigation event:', event);
  }

  /**
   * Context menus setup
   */
  private setupContextMenus(): void {
    this.browser.contextMenus?.create({
      id: 'create-session',
      title: 'Create TabKiller Session',
      contexts: ['page']
    });

    this.browser.contextMenus?.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'create-session') {
        // Handle context menu click
        console.log('Create session from context menu');
      }
    });
  }

  /**
   * Utility methods
   */
  private getDefaultSettings(): ExtensionSettings {
    return {
      autoCapture: true,
      captureInterval: 30000, // 30 seconds
      maxSessions: 100,
      defaultTag: 'browsing',
      syncEnabled: false,
      encryptionEnabled: true,
      excludedDomains: ['chrome://', 'moz-extension://', 'about:'],
      includedDomains: [],
      privacyMode: 'moderate'
    };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  private getStatus() {
    return {
      browser: this.currentBrowser,
      manifestVersion: isManifestV3() ? 3 : 2,
      activeTabs: this.state.activeTabs.size,
      currentSession: this.state.currentSession?.id || null,
      settings: this.state.settings,
      syncStatus: this.state.syncStatus
    };
  }

  private async performFirstTimeSetup(): Promise<void> {
    // First time setup logic
    console.log('Performing first time setup');
    await this.saveSettings();
  }

  private async performUpdateMigration(previousVersion?: string): Promise<void> {
    // Migration logic for updates
    console.log('Performing update migration from:', previousVersion);
  }
}

// Initialize the background service
const backgroundService = new BackgroundService();

if (isManifestV3()) {
  backgroundService.initialize().catch(console.error);
} else {
  backgroundService.initialize().catch(console.error);
}