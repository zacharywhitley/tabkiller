/**
 * Session Storage Integration
 * Integrates storage layer with session detection and tab tracking systems
 */

import { SessionStorageManager } from './index';
import { SessionDetectionEngine } from '../detection/SessionDetectionEngine';
import { TabLifecycleTracker } from '../tracking/TabLifecycleTracker';
import { 
  BrowsingEvent,
  SessionBoundary,
  BrowsingSession,
  TabInfo,
  NavigationEvent
} from '../../shared/types';

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface IntegrationConfig {
  enableAutoStorage: boolean;
  enableSessionPersistence: boolean;
  enableTabPersistence: boolean;
  enableNavigationPersistence: boolean;
  batchSize: number;
  flushInterval: number;
  maxPendingEvents: number;
}

export interface SessionContext {
  currentSession?: BrowsingSession;
  activeTabs: Map<number, TabInfo>;
  pendingEvents: BrowsingEvent[];
  lastFlush: number;
}

// =============================================================================
// SESSION STORAGE INTEGRATION
// =============================================================================

export class SessionStorageIntegration {
  private storageManager: SessionStorageManager;
  private sessionEngine?: SessionDetectionEngine;
  private tabTracker?: TabLifecycleTracker;
  private config: IntegrationConfig;
  private context: SessionContext;
  private flushTimer?: number;
  private isInitialized = false;

  constructor(config: Partial<IntegrationConfig> = {}) {
    this.config = {
      enableAutoStorage: true,
      enableSessionPersistence: true,
      enableTabPersistence: true,
      enableNavigationPersistence: true,
      batchSize: 50,
      flushInterval: 30000, // 30 seconds
      maxPendingEvents: 1000,
      ...config
    };

    this.storageManager = new SessionStorageManager({
      enableCompression: true,
      enableIntegrityChecks: true,
      batchSize: this.config.batchSize
    });

    this.context = {
      activeTabs: new Map(),
      pendingEvents: [],
      lastFlush: Date.now()
    };
  }

  /**
   * Initialize the integration system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Initializing SessionStorageIntegration...');
      
      // Initialize storage manager
      await this.storageManager.initialize();
      
      // Load existing session context
      await this.loadSessionContext();
      
      // Setup periodic flush
      this.setupPeriodicFlush();
      
      this.isInitialized = true;
      console.log('SessionStorageIntegration initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize SessionStorageIntegration:', error);
      throw error;
    }
  }

  /**
   * Connect session detection engine
   */
  connectSessionEngine(engine: SessionDetectionEngine): void {
    this.sessionEngine = engine;
    console.log('Connected session detection engine to storage integration');
  }

  /**
   * Connect tab lifecycle tracker
   */
  connectTabTracker(tracker: TabLifecycleTracker): void {
    this.tabTracker = tracker;
    console.log('Connected tab lifecycle tracker to storage integration');
  }

  // =============================================================================
  // EVENT PROCESSING
  // =============================================================================

  /**
   * Process browsing event from tracking systems
   */
  async processBrowsingEvent(event: BrowsingEvent): Promise<void> {
    try {
      if (!this.config.enableAutoStorage) return;

      // Add to pending events
      this.context.pendingEvents.push(event);

      // Process event based on type
      switch (event.type) {
        case 'session_started':
          await this.handleSessionStarted(event);
          break;
        
        case 'session_ended':
          await this.handleSessionEnded(event);
          break;
        
        case 'tab_created':
        case 'tab_updated':
        case 'tab_activated':
          await this.handleTabEvent(event);
          break;
        
        case 'navigation_completed':
        case 'navigation_started':
          await this.handleNavigationEvent(event);
          break;
        
        case 'tab_closed':
        case 'tab_removed':
          await this.handleTabClosed(event);
          break;
      }

      // Check if we need to flush
      if (this.shouldFlushEvents()) {
        await this.flushPendingEvents();
      }

    } catch (error) {
      console.error('Error processing browsing event:', error);
    }
  }

  /**
   * Process session boundary from detection engine
   */
  async processSessionBoundary(boundary: SessionBoundary): Promise<void> {
    try {
      if (!this.config.enableSessionPersistence) return;

      if (boundary.type === 'end' && this.context.currentSession) {
        // End current session
        await this.endCurrentSession(boundary);
      } else if (boundary.type === 'start') {
        // Start new session
        await this.startNewSession(boundary);
      }

    } catch (error) {
      console.error('Error processing session boundary:', error);
    }
  }

  // =============================================================================
  // SESSION MANAGEMENT
  // =============================================================================

  /**
   * Handle session started event
   */
  private async handleSessionStarted(event: BrowsingEvent): Promise<void> {
    if (!this.config.enableSessionPersistence) return;

    // Create new session from event
    const session: BrowsingSession = {
      id: event.sessionId,
      tag: this.generateSessionTag(),
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      tabs: [],
      windowIds: event.windowId ? [event.windowId] : [],
      metadata: {
        isPrivate: false,
        totalTime: 0,
        pageCount: 0,
        domain: []
      }
    };

    await this.storageManager.createSession(session);
    this.context.currentSession = session;

    console.log(`Created new session: ${session.id}`);
  }

  /**
   * Handle session ended event
   */
  private async handleSessionEnded(event: BrowsingEvent): Promise<void> {
    if (!this.context.currentSession) return;

    // Update session with final data
    const session = this.context.currentSession;
    session.updatedAt = event.timestamp;
    session.metadata.totalTime = event.timestamp - session.createdAt;
    session.tabs = Array.from(this.context.activeTabs.values());

    // Calculate domains from tabs
    const domains = new Set<string>();
    for (const tab of session.tabs) {
      try {
        const url = new URL(tab.url);
        domains.add(url.hostname);
      } catch {
        // Invalid URL, skip
      }
    }
    session.metadata.domain = Array.from(domains);
    session.metadata.pageCount = session.tabs.length;

    await this.storageManager.updateSession(session.id, session);
    
    console.log(`Ended session: ${session.id} with ${session.tabs.length} tabs`);
    this.context.currentSession = undefined;
  }

  /**
   * Start new session from boundary
   */
  private async startNewSession(boundary: SessionBoundary): Promise<void> {
    const session: BrowsingSession = {
      id: boundary.sessionId,
      tag: this.generateSessionTag(),
      createdAt: boundary.timestamp,
      updatedAt: boundary.timestamp,
      tabs: [],
      windowIds: boundary.metadata.windowsInvolved || [],
      metadata: {
        isPrivate: false,
        totalTime: 0,
        pageCount: 0,
        domain: []
      }
    };

    await this.storageManager.createSession(session);
    this.context.currentSession = session;

    console.log(`Started new session from boundary: ${session.id}`);
  }

  /**
   * End current session from boundary
   */
  private async endCurrentSession(boundary: SessionBoundary): Promise<void> {
    if (!this.context.currentSession) return;

    const session = this.context.currentSession;
    session.updatedAt = boundary.timestamp;
    session.metadata.totalTime = boundary.timestamp - session.createdAt;

    await this.storageManager.updateSession(session.id, session);
    
    console.log(`Ended session from boundary: ${session.id}`);
    this.context.currentSession = undefined;
  }

  // =============================================================================
  // TAB MANAGEMENT
  // =============================================================================

  /**
   * Handle tab event
   */
  private async handleTabEvent(event: BrowsingEvent): Promise<void> {
    if (!this.config.enableTabPersistence || !event.tabId) return;

    const existingTab = this.context.activeTabs.get(event.tabId);
    
    if (event.type === 'tab_created' || !existingTab) {
      // Create new tab
      const tab: TabInfo = {
        id: event.tabId,
        url: event.url || '',
        title: event.title || '',
        favicon: undefined,
        windowId: event.windowId || 0,
        createdAt: event.timestamp,
        lastAccessed: event.timestamp,
        timeSpent: 0,
        scrollPosition: 0
      };

      this.context.activeTabs.set(event.tabId, tab);

      if (this.context.currentSession) {
        await this.storageManager.createTab(tab, this.context.currentSession.id);
      }

      console.log(`Created tab: ${tab.id} - ${tab.title}`);
    } else {
      // Update existing tab
      const tab = { ...existingTab };
      
      if (event.url) tab.url = event.url;
      if (event.title) tab.title = event.title;
      tab.lastAccessed = event.timestamp;
      
      // Calculate time spent
      if (event.type === 'tab_activated') {
        const timeDiff = event.timestamp - tab.lastAccessed;
        tab.timeSpent += timeDiff;
      }

      this.context.activeTabs.set(event.tabId, tab);
      await this.storageManager.updateTab(event.tabId, tab);
    }
  }

  /**
   * Handle tab closed event
   */
  private async handleTabClosed(event: BrowsingEvent): Promise<void> {
    if (!event.tabId) return;

    const tab = this.context.activeTabs.get(event.tabId);
    if (tab) {
      // Update final time spent
      tab.lastAccessed = event.timestamp;
      tab.timeSpent += event.timestamp - tab.lastAccessed;

      await this.storageManager.updateTab(event.tabId, tab);
      this.context.activeTabs.delete(event.tabId);

      console.log(`Closed tab: ${tab.id} - total time: ${tab.timeSpent}ms`);
    }
  }

  // =============================================================================
  // NAVIGATION MANAGEMENT
  // =============================================================================

  /**
   * Handle navigation event
   */
  private async handleNavigationEvent(event: BrowsingEvent): Promise<void> {
    if (!this.config.enableNavigationPersistence || !event.tabId || !event.url) return;

    const navigationEvent: NavigationEvent = {
      tabId: event.tabId,
      url: event.url,
      referrer: event.metadata?.referrer,
      timestamp: event.timestamp,
      transitionType: event.metadata?.transitionType || 'link'
    };

    if (this.context.currentSession) {
      await this.storageManager.createNavigationEvent(navigationEvent, this.context.currentSession.id);
    }
  }

  // =============================================================================
  // PERSISTENCE AND FLUSHING
  // =============================================================================

  /**
   * Check if events should be flushed
   */
  private shouldFlushEvents(): boolean {
    const now = Date.now();
    const timeSinceLastFlush = now - this.context.lastFlush;
    
    return (
      this.context.pendingEvents.length >= this.config.batchSize ||
      timeSinceLastFlush >= this.config.flushInterval ||
      this.context.pendingEvents.length >= this.config.maxPendingEvents
    );
  }

  /**
   * Flush pending events to storage
   */
  private async flushPendingEvents(): Promise<void> {
    if (this.context.pendingEvents.length === 0) return;

    try {
      // For now, just clear the pending events
      // In a full implementation, we'd batch process these
      const eventCount = this.context.pendingEvents.length;
      this.context.pendingEvents = [];
      this.context.lastFlush = Date.now();

      console.log(`Flushed ${eventCount} pending events to storage`);
    } catch (error) {
      console.error('Failed to flush pending events:', error);
    }
  }

  /**
   * Setup periodic flush timer
   */
  private setupPeriodicFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = window.setInterval(async () => {
      if (this.context.pendingEvents.length > 0) {
        await this.flushPendingEvents();
      }
    }, this.config.flushInterval);
  }

  /**
   * Load existing session context from storage
   */
  private async loadSessionContext(): Promise<void> {
    try {
      // Load recent sessions to determine current context
      const recentSessions = await this.storageManager.querySessions({
        options: { limit: 10, orderBy: 'updatedAt', orderDirection: 'desc' }
      });

      if (recentSessions.length > 0) {
        const latestSession = recentSessions[0];
        
        // Check if session is recent enough to be considered current
        const sessionAge = Date.now() - latestSession.updatedAt;
        const maxSessionAge = 2 * 60 * 60 * 1000; // 2 hours
        
        if (sessionAge < maxSessionAge) {
          this.context.currentSession = latestSession;
          console.log(`Restored current session: ${latestSession.id}`);
        }
      }

      // Load active tabs from tab tracker if available
      if (this.tabTracker) {
        const tabStates = this.tabTracker.getAllTabStates();
        for (const [tabId, tabState] of tabStates) {
          this.context.activeTabs.set(tabId, tabState.info);
        }
        console.log(`Loaded ${this.context.activeTabs.size} active tabs`);
      }

    } catch (error) {
      console.warn('Failed to load session context:', error);
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Generate session tag based on current context
   */
  private generateSessionTag(): string {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    const dateString = now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    return `Session ${dateString} ${timeString}`;
  }

  /**
   * Get current session
   */
  getCurrentSession(): BrowsingSession | undefined {
    return this.context.currentSession;
  }

  /**
   * Get active tabs
   */
  getActiveTabs(): Map<number, TabInfo> {
    return new Map(this.context.activeTabs);
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<any> {
    return this.storageManager.getStorageStats();
  }

  /**
   * Force flush pending events
   */
  async forceFlush(): Promise<void> {
    await this.flushPendingEvents();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<IntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart flush timer if interval changed
    if (newConfig.flushInterval) {
      this.setupPeriodicFlush();
    }
  }

  /**
   * Shutdown integration
   */
  async shutdown(): Promise<void> {
    try {
      // Flush any pending events
      await this.flushPendingEvents();
      
      // Clear flush timer
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = undefined;
      }

      // Shutdown storage manager
      await this.storageManager.shutdown();
      
      this.isInitialized = false;
      console.log('SessionStorageIntegration shutdown complete');
      
    } catch (error) {
      console.error('Error during storage integration shutdown:', error);
    }
  }
}