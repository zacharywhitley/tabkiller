/**
 * Background service worker for TabKiller extension
 * Handles tab tracking, session management, and cross-browser compatibility
 */

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
import { GraphStore } from '../database/graph/store';
import { GraphIngest, GRAPH_INGEST_ALARM_NAME } from '../database/graph/ingest';
import { SessionStorageEngine } from '../session/storage/SessionStorageEngine';

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

  // Graph ingest pipeline. Lazily wired in initialize() because it needs
  // a live IndexedDB connection from SessionStorageEngine.
  private sessionStorageEngine: SessionStorageEngine;
  private graphIngest?: GraphIngest;

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

    const eventId = generateEventId('visit');
    const event: BrowsingEvent = {
      id: eventId,
      timestamp: details.timeStamp,
      type: 'navigation_committed',
      tabId: details.tabId,
      url: details.url,
      sessionId: '',
      metadata: {
        transitionType: details.transitionType as any,
        transitionQualifiers: details.transitionQualifiers,
        frameId: details.frameId
      }
    };

    try {
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
      sessionId: '',
      metadata: {
        focused_visit: transition.focused_visit
      }
    };

    try {
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

// Start initialization when the script loads
if (isManifestV3()) {
  // Manifest V3 - service worker
  backgroundService.initialize().catch(console.error);
} else {
  // Manifest V2 - background script
  backgroundService.initialize().catch(console.error);
}