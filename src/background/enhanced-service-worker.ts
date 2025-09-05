/**
 * Enhanced background service worker for TabKiller extension
 * Integrates comprehensive event tracking, analytics, and privacy filtering
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
import { EventTracker } from '../tracking/EventTracker';
import { PrivacyFilter } from '../utils/PrivacyFilter';
import { SessionDetector } from '../utils/SessionDetector';
import { AnalyticsEngine } from '../utils/AnalyticsEngine';
import { initializeDatabaseIntegration, getDatabaseIntegration } from '../database/integration';

class EnhancedBackgroundService {
  private state: BackgroundState;
  private browser = getBrowserAPI();
  private currentBrowser = detectBrowser();
  
  // Enhanced tracking system
  private eventTracker?: EventTracker;
  private privacyFilter?: PrivacyFilter;
  private sessionDetector?: SessionDetector;
  private analyticsEngine?: AnalyticsEngine;

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
  }

  /**
   * Initialize the enhanced background service
   */
  async initialize(): Promise<void> {
    try {
      console.log(`TabKiller initializing on ${this.currentBrowser}...`);
      
      // Load settings and state
      await this.loadSettings();
      await this.loadState();

      // Initialize database integration
      try {
        await initializeDatabaseIntegration(this.state.settings);
        console.log('Database integration initialized');
      } catch (error) {
        console.warn('Database integration failed:', error);
        // Continue without database if it fails
      }
      
      // Initialize enhanced tracking system
      await this.initializeTrackingSystem();
      
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
   * Initialize the enhanced tracking system
   */
  private async initializeTrackingSystem(): Promise<void> {
    try {
      const trackingConfig = this.getDefaultTrackingConfig();
      
      // Initialize components
      this.eventTracker = new EventTracker(trackingConfig);
      this.privacyFilter = new PrivacyFilter(trackingConfig);
      this.sessionDetector = new SessionDetector(trackingConfig);
      this.analyticsEngine = new AnalyticsEngine(trackingConfig);
      
      // Initialize tracking system
      await this.eventTracker.initialize();
      
      console.log('Enhanced tracking system initialized');
    } catch (error) {
      console.error('Failed to initialize tracking system:', error);
      // Continue without enhanced tracking
    }
  }

  /**
   * Get default tracking configuration
   */
  private getDefaultTrackingConfig(): TrackingConfig {
    return {
      enableTabTracking: true,
      enableWindowTracking: true,
      enableNavigationTracking: true,
      enableSessionTracking: true,
      enableFormTracking: this.state.settings.privacyMode !== 'strict',
      enableScrollTracking: true,
      enableClickTracking: true,
      
      // Privacy settings
      privacyMode: this.state.settings.privacyMode,
      excludeIncognito: true,
      excludeDomains: this.state.settings.excludedDomains,
      includeDomains: this.state.settings.includedDomains,
      sensitiveFieldFilters: ['password', 'ssn', 'credit'],
      
      // Performance settings
      batchSize: 50,
      batchInterval: 30000, // 30 seconds
      maxEventsInMemory: 1000,
      storageCleanupInterval: 3600000, // 1 hour
      
      // Session settings
      idleThreshold: 300000, // 5 minutes
      sessionGapThreshold: 600000, // 10 minutes
      domainChangeSessionBoundary: false,
      
      // Analytics settings
      enableProductivityMetrics: true,
      deepWorkThreshold: 900000, // 15 minutes
      distractionThreshold: 30000 // 30 seconds
    };
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

    // Message passing
    messaging.onMessage.addListener(this.handleMessage.bind(this));

    // Extension lifecycle events
    this.browser.runtime.onStartup.addListener(this.handleStartup.bind(this));
    this.browser.runtime.onInstalled.addListener(this.handleInstalled.bind(this));

    // Context menu (if supported)
    if (this.browser.contextMenus) {
      this.setupContextMenus();
    }
  }

  /**
   * Handle tab creation with enhanced tracking
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
      
      const event: TabEvent = {
        type: 'created',
        tabId: tab.id!,
        windowId: tab.windowId,
        timestamp: Date.now(),
        data: tabInfo
      };

      await this.processTabEvent(event);
      
      // Enhanced tracking
      if (this.eventTracker) {
        await this.eventTracker.processTabEvent(event);
      }
    } catch (error) {
      console.error('Error handling tab created:', error);
    }
  }

  /**
   * Handle tab updates with enhanced tracking
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
        
        // Enhanced navigation tracking
        if (this.eventTracker) {
          await this.eventTracker.processNavigationEvent(navigationEvent);
        }
      }

      const event: TabEvent = {
        type: 'updated',
        tabId,
        windowId: tab.windowId,
        timestamp: Date.now(),
        data: changeInfo
      };

      await this.processTabEvent(event);
      
      // Enhanced tracking
      if (this.eventTracker) {
        await this.eventTracker.processTabEvent(event);
      }
    } catch (error) {
      console.error('Error handling tab updated:', error);
    }
  }

  /**
   * Handle tab removal with enhanced tracking
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

      const event: TabEvent = {
        type: 'removed',
        tabId,
        windowId: removeInfo.windowId,
        timestamp: Date.now()
      };

      await this.processTabEvent(event);
      
      // Enhanced tracking
      if (this.eventTracker) {
        await this.eventTracker.processTabEvent(event);
      }
    } catch (error) {
      console.error('Error handling tab removed:', error);
    }
  }

  /**
   * Handle tab activation with enhanced tracking
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
      
      // Enhanced tracking
      if (this.eventTracker) {
        await this.eventTracker.processTabEvent(event);
      }
    } catch (error) {
      console.error('Error handling tab activated:', error);
    }
  }

  /**
   * Handle window events with enhanced tracking
   */
  private async handleWindowCreated(window: chrome.windows.Window): Promise<void> {
    const event: WindowEvent = {
      type: 'created',
      windowId: window.id!,
      timestamp: Date.now(),
      windowType: this.mapWindowType(window.type),
      state: this.mapWindowState(window.state),
      bounds: {
        left: window.left || 0,
        top: window.top || 0,
        width: window.width || 0,
        height: window.height || 0
      }
    };
    
    await this.processWindowEvent(event);
    
    // Enhanced tracking
    if (this.eventTracker) {
      await this.eventTracker.processWindowEvent(event);
    }
  }

  private async handleWindowRemoved(windowId: number): Promise<void> {
    const event: WindowEvent = {
      type: 'removed',
      windowId,
      timestamp: Date.now()
    };
    
    await this.processWindowEvent(event);
    
    // Enhanced tracking
    if (this.eventTracker) {
      await this.eventTracker.processWindowEvent(event);
    }
  }

  private async handleWindowFocusChanged(windowId: number): Promise<void> {
    if (windowId === this.browser.windows.WINDOW_ID_NONE) return;
    
    const event: WindowEvent = {
      type: 'focus_changed',
      windowId,
      timestamp: Date.now()
    };
    
    await this.processWindowEvent(event);
    
    // Enhanced tracking
    if (this.eventTracker) {
      await this.eventTracker.processWindowEvent(event);
    }
  }

  /**
   * Handle navigation events
   */
  private async handleHistoryVisited(item: chrome.history.HistoryItem): Promise<void> {
    // Enhanced navigation tracking
    console.log('History visited:', item.url);
  }

  /**
   * Handle runtime messages with enhanced capabilities
   */
  private async handleMessage(
    message: Message,
    sender: chrome.runtime.MessageSender
  ): Promise<MessageResponse> {
    try {
      switch (message.type) {
        case 'get-status':
          return { success: true, data: await this.getStatus() };
          
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
          
        // Enhanced analytics and tracking
        case 'analytics-update':
          if (this.analyticsEngine) {
            const events = await this.eventTracker?.queryEvents(message.payload?.filter || {}) || [];
            await this.analyticsEngine.processEvents(events);
            return { success: true, data: 'analytics_updated' };
          }
          return { success: false, error: 'Analytics engine not initialized' };
          
        case 'track-interaction':
          if (this.eventTracker && message.payload) {
            const { type, tabId, data } = message.payload;
            if (type === 'scroll' || type === 'click' || type === 'form') {
              // Forward to appropriate tracker
              // This would typically be handled by content script events
            }
          }
          return { success: true };
          
        case 'event-batch':
          if (this.eventTracker && message.payload?.events) {
            for (const event of message.payload.events) {
              await this.eventTracker.handleEvent(event);
            }
            return { success: true, data: 'events_processed' };
          }
          return { success: false, error: 'Event tracker not initialized' };
          
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
    
    // Update tracking system if needed
    if (this.eventTracker && (updates.privacyMode || updates.excludedDomains || updates.includeDomains)) {
      const newTrackingConfig = this.getDefaultTrackingConfig();
      await this.eventTracker.updateConfig(newTrackingConfig);
    }
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
    // Enhanced tab data saving with database integration
    try {
      const dbIntegration = getDatabaseIntegration();
      if (dbIntegration) {
        await dbIntegration.repositories.tabs.create({
          tabId: tabInfo.id,
          url: tabInfo.url,
          title: tabInfo.title,
          timeSpent: tabInfo.timeSpent,
          scrollPosition: tabInfo.scrollPosition,
          sessionId: this.state.currentSession?.id || 'unknown',
          createdAt: new Date(tabInfo.createdAt),
          updatedAt: new Date(tabInfo.lastAccessed)
        });
      }
    } catch (error) {
      console.warn('Failed to save tab data to database:', error);
    }
    
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

  private async getStatus() {
    const trackingStats = this.eventTracker ? this.eventTracker.getStats() : null;
    const privacyStats = this.privacyFilter ? this.privacyFilter.getPrivacyStats() : null;
    const analyticsStats = this.analyticsEngine ? this.analyticsEngine.getAnalyticsStats() : null;
    
    return {
      browser: this.currentBrowser,
      manifestVersion: isManifestV3() ? 3 : 2,
      activeTabs: this.state.activeTabs.size,
      currentSession: this.state.currentSession?.id || null,
      settings: this.state.settings,
      syncStatus: this.state.syncStatus,
      tracking: trackingStats,
      privacy: privacyStats,
      analytics: analyticsStats
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

  /**
   * Map Chrome window type to our type
   */
  private mapWindowType(chromeType: string | undefined): 'normal' | 'popup' | 'panel' | 'app' | 'devtools' {
    switch (chromeType) {
      case 'popup': return 'popup';
      case 'panel': return 'panel';
      case 'app': return 'app';
      case 'devtools': return 'devtools';
      default: return 'normal';
    }
  }
  
  /**
   * Map Chrome window state to our state
   */
  private mapWindowState(chromeState: string | undefined): 'normal' | 'minimized' | 'maximized' | 'fullscreen' {
    switch (chromeState) {
      case 'minimized': return 'minimized';
      case 'maximized': return 'maximized';
      case 'fullscreen': return 'fullscreen';
      default: return 'normal';
    }
  }
}

// Initialize the enhanced background service
const enhancedBackgroundService = new EnhancedBackgroundService();

// Start initialization when the script loads
if (isManifestV3()) {
  // Manifest V3 - service worker
  enhancedBackgroundService.initialize().catch(console.error);
} else {
  // Manifest V2 - background script
  enhancedBackgroundService.initialize().catch(console.error);
}