/**
 * Tab Lifecycle Tracker - Real-time tab event monitoring
 * Integrates with browser.tabs API for comprehensive lifecycle tracking
 */

import {
  BrowsingEvent,
  TabEvent,
  TabInfo,
  TabRelationships,
  TrackingConfig,
  EventType,
  EventMetadata
} from '../../shared/types';

import { EventTracker } from '../../tracking/EventTracker';
import { getBrowserAPI } from '../../utils/cross-browser';

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface TabState {
  info: TabInfo;
  relationships: TabRelationships;
  lifecycle: {
    sessionStart: number;
    lastActivity: number;
    activityCount: number;
    focusTime: number;
    totalFocusTime: number;
    isActive: boolean;
    wasDiscarded: boolean;
  };
  interactions: {
    scrollEvents: number;
    clickEvents: number;
    formInteractions: number;
    keyboardEvents: number;
    mouseEvents: number;
    lastInteractionTime: number;
  };
  performance: {
    loadTime?: number;
    renderTime?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
  navigation: {
    navigationCount: number;
    backForwardCount: number;
    reloadCount: number;
    historyLength: number;
  };
}

export interface TabEventHandler {
  (event: BrowsingEvent): Promise<void>;
}

export interface TabLifecycleConfig extends TrackingConfig {
  enableInteractionTracking?: boolean;
  enablePerformanceTracking?: boolean;
  enableRelationshipDetection?: boolean;
  trackDiscardedTabs?: boolean;
  maxConcurrentTabs?: number;
  cleanupInterval?: number;
}

// =============================================================================
// TAB LIFECYCLE TRACKER
// =============================================================================

export class TabLifecycleTracker {
  private config: TabLifecycleConfig;
  private eventHandler: TabEventHandler;
  private browser = getBrowserAPI();
  
  private tabStates = new Map<number, TabState>();
  private tabGroups = new Map<number, Set<number>>();
  private activeTabId?: number;
  private activeWindowId?: number;
  private lastActiveTime = Date.now();
  
  private isInitialized: boolean = false;
  private cleanupTimer?: number;
  
  // Event listeners storage for cleanup
  private eventListeners: Array<() => void> = [];

  constructor(config: TabLifecycleConfig, eventHandler: TabEventHandler) {
    this.config = {
      enableInteractionTracking: true,
      enablePerformanceTracking: true,
      enableRelationshipDetection: true,
      trackDiscardedTabs: true,
      maxConcurrentTabs: 1000,
      cleanupInterval: 300000, // 5 minutes
      ...config
    };
    this.eventHandler = eventHandler;
  }

  /**
   * Initialize tab lifecycle tracking
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Initializing TabLifecycleTracker...');

      // Load existing tab states
      await this.loadExistingTabs();

      // Set up browser API event listeners
      this.setupBrowserEventListeners();

      // Set up cleanup timer
      if (this.config.cleanupInterval) {
        this.cleanupTimer = window.setInterval(
          this.performCleanup.bind(this),
          this.config.cleanupInterval
        );
      }

      this.isInitialized = true;
      console.log('TabLifecycleTracker initialized successfully');

    } catch (error) {
      console.error('Failed to initialize TabLifecycleTracker:', error);
      throw error;
    }
  }

  /**
   * Set up browser API event listeners
   */
  private setupBrowserEventListeners(): void {
    try {
      // Tab creation listener
      const onCreatedListener = this.handleTabCreated.bind(this);
      this.browser.tabs.onCreated.addListener(onCreatedListener);
      this.eventListeners.push(() => this.browser.tabs.onCreated.removeListener(onCreatedListener));

      // Tab update listener
      const onUpdatedListener = this.handleTabUpdated.bind(this);
      this.browser.tabs.onUpdated.addListener(onUpdatedListener);
      this.eventListeners.push(() => this.browser.tabs.onUpdated.removeListener(onUpdatedListener));

      // Tab removal listener
      const onRemovedListener = this.handleTabRemoved.bind(this);
      this.browser.tabs.onRemoved.addListener(onRemovedListener);
      this.eventListeners.push(() => this.browser.tabs.onRemoved.removeListener(onRemovedListener));

      // Tab activation listener
      const onActivatedListener = this.handleTabActivated.bind(this);
      this.browser.tabs.onActivated.addListener(onActivatedListener);
      this.eventListeners.push(() => this.browser.tabs.onActivated.removeListener(onActivatedListener));

      // Tab moved listener
      if (this.browser.tabs.onMoved) {
        const onMovedListener = this.handleTabMoved.bind(this);
        this.browser.tabs.onMoved.addListener(onMovedListener);
        this.eventListeners.push(() => this.browser.tabs.onMoved.removeListener(onMovedListener));
      }

      // Tab attached/detached listeners (for window changes)
      if (this.browser.tabs.onAttached) {
        const onAttachedListener = this.handleTabAttached.bind(this);
        this.browser.tabs.onAttached.addListener(onAttachedListener);
        this.eventListeners.push(() => this.browser.tabs.onAttached.removeListener(onAttachedListener));
      }

      if (this.browser.tabs.onDetached) {
        const onDetachedListener = this.handleTabDetached.bind(this);
        this.browser.tabs.onDetached.addListener(onDetachedListener);
        this.eventListeners.push(() => this.browser.tabs.onDetached.removeListener(onDetachedListener));
      }

      // Window focus change listener
      const onWindowFocusListener = this.handleWindowFocusChanged.bind(this);
      this.browser.windows.onFocusChanged.addListener(onWindowFocusListener);
      this.eventListeners.push(() => this.browser.windows.onFocusChanged.removeListener(onWindowFocusListener));

    } catch (error) {
      console.error('Error setting up browser event listeners:', error);
      throw error;
    }
  }

  /**
   * Load existing tabs at initialization
   */
  private async loadExistingTabs(): Promise<void> {
    try {
      const tabs = await this.browser.tabs.query({});
      
      for (const tab of tabs) {
        if (tab.id !== undefined) {
          await this.createTabState(tab);
        }
      }

      // Detect current active tab
      const activeTabs = await this.browser.tabs.query({ active: true, currentWindow: true });
      if (activeTabs.length > 0 && activeTabs[0].id !== undefined) {
        this.activeTabId = activeTabs[0].id;
        this.activeWindowId = activeTabs[0].windowId;
        this.lastActiveTime = Date.now();
      }

      console.log(`Loaded ${tabs.length} existing tabs`);
    } catch (error) {
      console.error('Error loading existing tabs:', error);
    }
  }

  /**
   * Create tab state from browser tab
   */
  private async createTabState(tab: chrome.tabs.Tab): Promise<void> {
    if (tab.id === undefined) return;

    const now = Date.now();
    
    const tabState: TabState = {
      info: {
        id: tab.id,
        url: tab.url || '',
        title: tab.title || '',
        favicon: tab.favIconUrl,
        windowId: tab.windowId,
        createdAt: now,
        lastAccessed: now,
        timeSpent: 0,
        scrollPosition: 0
      },
      relationships: {
        childTabIds: [],
        relatedTabs: []
      },
      lifecycle: {
        sessionStart: now,
        lastActivity: now,
        activityCount: 0,
        focusTime: 0,
        totalFocusTime: 0,
        isActive: tab.active || false,
        wasDiscarded: tab.discarded || false
      },
      interactions: {
        scrollEvents: 0,
        clickEvents: 0,
        formInteractions: 0,
        keyboardEvents: 0,
        mouseEvents: 0,
        lastInteractionTime: 0
      },
      performance: {
        loadTime: undefined,
        renderTime: undefined,
        memoryUsage: undefined,
        cpuUsage: undefined
      },
      navigation: {
        navigationCount: 0,
        backForwardCount: 0,
        reloadCount: 0,
        historyLength: 0
      }
    };

    // Detect relationships if enabled
    if (this.config.enableRelationshipDetection) {
      await this.detectTabRelationships(tabState, tab);
    }

    this.tabStates.set(tab.id, tabState);
  }

  /**
   * Handle tab creation events from browser API
   */
  private async handleTabCreated(tab: chrome.tabs.Tab): Promise<void> {
    if (tab.id === undefined) return;

    try {
      await this.createTabState(tab);
      
      const tabState = this.tabStates.get(tab.id)!;
      
      // Create browsing event
      const event = this.createBrowsingEvent(
        'tab_created',
        tabState,
        { 
          openerTabId: tab.openerTabId,
          createdFrom: 'browser_api'
        }
      );

      await this.eventHandler(event);

    } catch (error) {
      console.error('Error handling tab created:', error);
    }
  }

  /**
   * Handle tab update events from browser API
   */
  private async handleTabUpdated(
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab
  ): Promise<void> {
    try {
      let tabState = this.tabStates.get(tabId);
      
      if (!tabState) {
        // Tab not tracked yet, create it
        await this.createTabState(tab);
        tabState = this.tabStates.get(tabId)!;
      }

      const now = Date.now();
      const previousUrl = tabState.info.url;
      const hasUrlChange = changeInfo.url && changeInfo.url !== previousUrl;
      
      // Update tab state
      if (changeInfo.url) {
        tabState.info.url = changeInfo.url;
        tabState.navigation.navigationCount++;
      }
      if (changeInfo.title) tabState.info.title = changeInfo.title;
      if (changeInfo.favIconUrl) tabState.info.favicon = changeInfo.favIconUrl;
      if (changeInfo.status) {
        if (changeInfo.status === 'loading') {
          tabState.performance.loadTime = now;
        } else if (changeInfo.status === 'complete' && tabState.performance.loadTime) {
          tabState.performance.loadTime = now - tabState.performance.loadTime;
        }
      }

      tabState.info.lastAccessed = now;
      tabState.lifecycle.lastActivity = now;
      tabState.lifecycle.activityCount++;

      // Handle URL change (navigation)
      if (hasUrlChange) {
        const navigationEvent = this.createBrowsingEvent(
          'navigation_completed',
          tabState,
          {
            previousUrl,
            newUrl: changeInfo.url,
            navigationCount: tabState.navigation.navigationCount,
            loadTime: tabState.performance.loadTime
          }
        );

        await this.eventHandler(navigationEvent);
      }

      // Handle status changes
      if (changeInfo.status === 'complete') {
        const loadCompleteEvent = this.createBrowsingEvent(
          'page_loaded',
          tabState,
          {
            loadTime: tabState.performance.loadTime,
            finalUrl: tabState.info.url
          }
        );

        await this.eventHandler(loadCompleteEvent);
      }

      // Handle discarded state changes
      if (changeInfo.discarded !== undefined) {
        tabState.lifecycle.wasDiscarded = changeInfo.discarded;
        
        const discardEvent = this.createBrowsingEvent(
          changeInfo.discarded ? 'tab_discarded' : 'tab_restored',
          tabState,
          { discarded: changeInfo.discarded }
        );

        await this.eventHandler(discardEvent);
      }

      // Handle pinned state changes
      if (changeInfo.pinned !== undefined) {
        const pinEvent = this.createBrowsingEvent(
          changeInfo.pinned ? 'tab_pinned' : 'tab_unpinned',
          tabState,
          { pinned: changeInfo.pinned }
        );

        await this.eventHandler(pinEvent);
      }

      // Handle muted state changes
      if (changeInfo.mutedInfo !== undefined) {
        const mutedEvent = this.createBrowsingEvent(
          changeInfo.mutedInfo.muted ? 'tab_muted' : 'tab_unmuted',
          tabState,
          { mutedInfo: changeInfo.mutedInfo }
        );

        await this.eventHandler(mutedEvent);
      }

    } catch (error) {
      console.error('Error handling tab updated:', error);
    }
  }

  /**
   * Handle tab removal events from browser API
   */
  private async handleTabRemoved(tabId: number, removeInfo: chrome.tabs.TabRemoveInfo): Promise<void> {
    try {
      const tabState = this.tabStates.get(tabId);
      if (!tabState) return;

      const now = Date.now();

      // Calculate final metrics
      const totalTime = now - tabState.lifecycle.sessionStart;
      let finalFocusTime = tabState.lifecycle.totalFocusTime;
      
      if (this.activeTabId === tabId) {
        finalFocusTime += now - this.lastActiveTime;
      }

      // Update final time spent
      tabState.info.timeSpent = totalTime;
      tabState.lifecycle.totalFocusTime = finalFocusTime;

      // Clean up relationships
      await this.cleanupTabRelationships(tabId);

      // Create removal event
      const event = this.createBrowsingEvent(
        'tab_closed',
        tabState,
        {
          totalTime,
          finalFocusTime,
          windowClosed: removeInfo.isWindowClosing,
          activityCount: tabState.lifecycle.activityCount,
          navigationCount: tabState.navigation.navigationCount,
          interactionSummary: {
            scrollEvents: tabState.interactions.scrollEvents,
            clickEvents: tabState.interactions.clickEvents,
            formInteractions: tabState.interactions.formInteractions,
            keyboardEvents: tabState.interactions.keyboardEvents,
            mouseEvents: tabState.interactions.mouseEvents
          }
        }
      );

      await this.eventHandler(event);

      // Clean up state
      this.tabStates.delete(tabId);
      if (this.activeTabId === tabId) {
        this.activeTabId = undefined;
      }

    } catch (error) {
      console.error('Error handling tab removed:', error);
    }
  }

  /**
   * Handle tab activation events from browser API
   */
  private async handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
    try {
      const now = Date.now();
      const newTabId = activeInfo.tabId;
      const newWindowId = activeInfo.windowId;

      // Update previous active tab's focus time
      if (this.activeTabId && this.activeTabId !== newTabId) {
        const prevTabState = this.tabStates.get(this.activeTabId);
        if (prevTabState) {
          const focusDuration = now - this.lastActiveTime;
          prevTabState.lifecycle.focusTime = focusDuration;
          prevTabState.lifecycle.totalFocusTime += focusDuration;
          prevTabState.lifecycle.isActive = false;
        }
      }

      // Update new active tab
      const newTabState = this.tabStates.get(newTabId);
      if (newTabState) {
        newTabState.lifecycle.isActive = true;
        newTabState.lifecycle.lastActivity = now;
        newTabState.info.lastAccessed = now;
        newTabState.lifecycle.activityCount++;
      }

      // Update tracking state
      this.activeTabId = newTabId;
      this.activeWindowId = newWindowId;
      this.lastActiveTime = now;

      // Create activation event
      if (newTabState) {
        const event = this.createBrowsingEvent(
          'tab_activated',
          newTabState,
          { 
            previousTabId: this.activeTabId,
            windowChanged: this.activeWindowId !== newWindowId
          }
        );

        await this.eventHandler(event);
      }

    } catch (error) {
      console.error('Error handling tab activated:', error);
    }
  }

  /**
   * Handle tab moved events from browser API
   */
  private async handleTabMoved(tabId: number, moveInfo: chrome.tabs.TabMoveInfo): Promise<void> {
    try {
      const tabState = this.tabStates.get(tabId);
      if (!tabState) return;

      const now = Date.now();
      tabState.lifecycle.lastActivity = now;
      tabState.lifecycle.activityCount++;

      const event = this.createBrowsingEvent(
        'tab_moved',
        tabState,
        {
          fromIndex: moveInfo.fromIndex,
          toIndex: moveInfo.toIndex,
          windowId: moveInfo.windowId
        }
      );

      await this.eventHandler(event);

    } catch (error) {
      console.error('Error handling tab moved:', error);
    }
  }

  /**
   * Handle tab attached events from browser API
   */
  private async handleTabAttached(tabId: number, attachInfo: chrome.tabs.TabAttachInfo): Promise<void> {
    try {
      const tabState = this.tabStates.get(tabId);
      if (!tabState) return;

      const now = Date.now();
      tabState.info.windowId = attachInfo.newWindowId;
      tabState.lifecycle.lastActivity = now;
      tabState.lifecycle.activityCount++;

      const event = this.createBrowsingEvent(
        'tab_attached',
        tabState,
        {
          newWindowId: attachInfo.newWindowId,
          newPosition: attachInfo.newPosition
        }
      );

      await this.eventHandler(event);

    } catch (error) {
      console.error('Error handling tab attached:', error);
    }
  }

  /**
   * Handle tab detached events from browser API
   */
  private async handleTabDetached(tabId: number, detachInfo: chrome.tabs.TabDetachInfo): Promise<void> {
    try {
      const tabState = this.tabStates.get(tabId);
      if (!tabState) return;

      const now = Date.now();
      tabState.lifecycle.lastActivity = now;
      tabState.lifecycle.activityCount++;

      const event = this.createBrowsingEvent(
        'tab_detached',
        tabState,
        {
          oldWindowId: detachInfo.oldWindowId,
          oldPosition: detachInfo.oldPosition
        }
      );

      await this.eventHandler(event);

    } catch (error) {
      console.error('Error handling tab detached:', error);
    }
  }

  /**
   * Handle window focus changes from browser API
   */
  private async handleWindowFocusChanged(windowId: number): Promise<void> {
    try {
      if (windowId === this.browser.windows.WINDOW_ID_NONE) {
        // Browser lost focus
        if (this.activeTabId) {
          const tabState = this.tabStates.get(this.activeTabId);
          if (tabState) {
            const focusDuration = Date.now() - this.lastActiveTime;
            tabState.lifecycle.totalFocusTime += focusDuration;
            tabState.lifecycle.isActive = false;
          }
        }
        return;
      }

      // Window gained focus - find active tab in that window
      const tabs = await this.browser.tabs.query({ active: true, windowId });
      if (tabs.length > 0 && tabs[0].id !== undefined) {
        const tabId = tabs[0].id;
        const tabState = this.tabStates.get(tabId);
        
        if (tabState) {
          tabState.lifecycle.isActive = true;
          tabState.lifecycle.lastActivity = Date.now();
          this.activeTabId = tabId;
          this.activeWindowId = windowId;
          this.lastActiveTime = Date.now();
        }
      }

    } catch (error) {
      console.error('Error handling window focus changed:', error);
    }
  }

  /**
   * Process external tab events (for integration with other components)
   */
  async processEvent(tabEvent: TabEvent): Promise<void> {
    try {
      const tabState = this.tabStates.get(tabEvent.tabId);
      if (!tabState) {
        console.warn(`Tab state not found for tab ${tabEvent.tabId}`);
        return;
      }

      const now = Date.now();
      tabState.lifecycle.lastActivity = now;
      tabState.lifecycle.activityCount++;

      // Process different event types
      switch (tabEvent.type) {
        case 'interaction':
          await this.handleInteractionEvent(tabState, tabEvent);
          break;
        case 'performance':
          await this.handlePerformanceEvent(tabState, tabEvent);
          break;
        case 'navigation':
          await this.handleNavigationEvent(tabState, tabEvent);
          break;
        default:
          // Generic event processing
          const event = this.createBrowsingEvent(
            tabEvent.type as EventType,
            tabState,
            tabEvent.data
          );
          await this.eventHandler(event);
      }

    } catch (error) {
      console.error('Error processing tab event:', error);
    }
  }

  /**
   * Handle interaction events (scroll, click, keyboard, etc.)
   */
  private async handleInteractionEvent(tabState: TabState, tabEvent: TabEvent): Promise<void> {
    if (!this.config.enableInteractionTracking) return;

    const interactionType = tabEvent.data?.interactionType;
    const now = Date.now();

    tabState.interactions.lastInteractionTime = now;

    switch (interactionType) {
      case 'scroll':
        tabState.interactions.scrollEvents++;
        if (tabEvent.data?.scrollPosition) {
          tabState.info.scrollPosition = tabEvent.data.scrollPosition.y;
        }
        break;
      case 'click':
        tabState.interactions.clickEvents++;
        break;
      case 'keyboard':
        tabState.interactions.keyboardEvents++;
        break;
      case 'mouse':
        tabState.interactions.mouseEvents++;
        break;
      case 'form':
        tabState.interactions.formInteractions++;
        break;
    }

    // Create interaction event
    const event = this.createBrowsingEvent(
      'user_interaction',
      tabState,
      {
        interactionType,
        ...tabEvent.data
      }
    );

    await this.eventHandler(event);
  }

  /**
   * Handle performance events
   */
  private async handlePerformanceEvent(tabState: TabState, tabEvent: TabEvent): Promise<void> {
    if (!this.config.enablePerformanceTracking) return;

    const performanceData = tabEvent.data;
    if (performanceData?.loadTime) {
      tabState.performance.loadTime = performanceData.loadTime;
    }
    if (performanceData?.renderTime) {
      tabState.performance.renderTime = performanceData.renderTime;
    }
    if (performanceData?.memoryUsage) {
      tabState.performance.memoryUsage = performanceData.memoryUsage;
    }
    if (performanceData?.cpuUsage) {
      tabState.performance.cpuUsage = performanceData.cpuUsage;
    }

    // Create performance event
    const event = this.createBrowsingEvent(
      'performance_update',
      tabState,
      performanceData
    );

    await this.eventHandler(event);
  }

  /**
   * Handle navigation events
   */
  private async handleNavigationEvent(tabState: TabState, tabEvent: TabEvent): Promise<void> {
    const navigationType = tabEvent.data?.navigationType;

    switch (navigationType) {
      case 'back':
      case 'forward':
        tabState.navigation.backForwardCount++;
        break;
      case 'reload':
        tabState.navigation.reloadCount++;
        break;
    }

    if (tabEvent.data?.historyLength) {
      tabState.navigation.historyLength = tabEvent.data.historyLength;
    }

    // Create navigation event
    const event = this.createBrowsingEvent(
      'navigation_event',
      tabState,
      tabEvent.data
    );

    await this.eventHandler(event);
  }

  /**
   * Detect tab relationships (parent-child, related tabs)
   */
  private async detectTabRelationships(tabState: TabState, tab: chrome.tabs.Tab): Promise<void> {
    try {
      // Set opener relationship
      if (tab.openerTabId) {
        tabState.relationships.openerTabId = tab.openerTabId;
        
        // Add this tab as child to opener
        const openerState = this.tabStates.get(tab.openerTabId);
        if (openerState) {
          openerState.relationships.childTabIds.push(tabState.info.id);
        }
      }

      // Detect related tabs (same domain, similar URLs)
      await this.detectRelatedTabs(tabState);

    } catch (error) {
      console.error('Error detecting tab relationships:', error);
    }
  }

  /**
   * Detect tabs that might be related
   */
  private async detectRelatedTabs(tabState: TabState): Promise<void> {
    if (!tabState.info.url) return;

    try {
      const url = new URL(tabState.info.url);
      const domain = url.hostname;

      for (const [tabId, otherState] of this.tabStates) {
        if (tabId === tabState.info.id || !otherState.info.url) continue;

        try {
          const otherUrl = new URL(otherState.info.url);
          
          // Same domain = related
          if (otherUrl.hostname === domain) {
            if (!tabState.relationships.relatedTabs.includes(tabId)) {
              tabState.relationships.relatedTabs.push(tabId);
            }
            if (!otherState.relationships.relatedTabs.includes(tabState.info.id)) {
              otherState.relationships.relatedTabs.push(tabState.info.id);
            }
          }
        } catch {
          // Invalid URL, skip
        }
      }
    } catch {
      // Invalid URL, skip relationship detection
    }
  }

  /**
   * Clean up relationships when a tab is closed
   */
  private async cleanupTabRelationships(closedTabId: number): Promise<void> {
    for (const [tabId, tabState] of this.tabStates) {
      if (tabId === closedTabId) continue;

      // Remove from child lists
      tabState.relationships.childTabIds = tabState.relationships.childTabIds.filter(
        id => id !== closedTabId
      );
      
      // Remove from related lists
      tabState.relationships.relatedTabs = tabState.relationships.relatedTabs.filter(
        id => id !== closedTabId
      );
      
      // Clear parent references
      if (tabState.relationships.parentTabId === closedTabId) {
        tabState.relationships.parentTabId = undefined;
      }
      if (tabState.relationships.openerTabId === closedTabId) {
        tabState.relationships.openerTabId = undefined;
      }
    }
  }

  /**
   * Create browsing event from tab state
   */
  private createBrowsingEvent(
    type: EventType,
    tabState: TabState,
    additionalData?: any
  ): BrowsingEvent {
    return {
      type,
      timestamp: Date.now(),
      tabId: tabState.info.id,
      windowId: tabState.info.windowId,
      url: tabState.info.url,
      title: tabState.info.title,
      metadata: {
        tabInfo: tabState.info,
        lifecycle: tabState.lifecycle,
        interactions: tabState.interactions,
        performance: tabState.performance,
        navigation: tabState.navigation,
        relationships: tabState.relationships,
        ...additionalData
      }
    };
  }

  /**
   * Perform periodic cleanup
   */
  private async performCleanup(): Promise<void> {
    try {
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      // Clean up old inactive tabs
      for (const [tabId, tabState] of this.tabStates) {
        if (now - tabState.lifecycle.lastActivity > maxAge) {
          // Verify tab still exists
          try {
            await this.browser.tabs.get(tabId);
          } catch {
            // Tab doesn't exist, remove from tracking
            this.tabStates.delete(tabId);
            console.log(`Cleaned up orphaned tab state: ${tabId}`);
          }
        }
      }

      // Limit concurrent tabs if configured
      if (this.config.maxConcurrentTabs && this.tabStates.size > this.config.maxConcurrentTabs) {
        const sortedTabs = Array.from(this.tabStates.entries())
          .sort(([,a], [,b]) => a.lifecycle.lastActivity - b.lifecycle.lastActivity);
        
        const toRemove = sortedTabs.slice(0, this.tabStates.size - this.config.maxConcurrentTabs);
        for (const [tabId] of toRemove) {
          this.tabStates.delete(tabId);
        }

        console.log(`Cleaned up ${toRemove.length} old tab states`);
      }

    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  /**
   * Get tab state for a specific tab
   */
  getTabState(tabId: number): TabState | undefined {
    return this.tabStates.get(tabId);
  }

  /**
   * Get all active tab states
   */
  getAllTabStates(): Map<number, TabState> {
    return new Map(this.tabStates);
  }

  /**
   * Get current active tab
   */
  getActiveTab(): { tabId?: number; windowId?: number } {
    return {
      tabId: this.activeTabId,
      windowId: this.activeWindowId
    };
  }

  /**
   * Get tabs by window
   */
  getTabsByWindow(windowId: number): TabState[] {
    return Array.from(this.tabStates.values())
      .filter(state => state.info.windowId === windowId);
  }

  /**
   * Get related tabs for a specific tab
   */
  getRelatedTabs(tabId: number): TabState[] {
    const tabState = this.tabStates.get(tabId);
    if (!tabState) return [];

    return tabState.relationships.relatedTabs
      .map(id => this.tabStates.get(id))
      .filter(state => state !== undefined) as TabState[];
  }

  /**
   * Get child tabs for a specific tab
   */
  getChildTabs(tabId: number): TabState[] {
    const tabState = this.tabStates.get(tabId);
    if (!tabState) return [];

    return tabState.relationships.childTabIds
      .map(id => this.tabStates.get(id))
      .filter(state => state !== undefined) as TabState[];
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: Partial<TabLifecycleConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    // Restart cleanup timer if interval changed
    if (newConfig.cleanupInterval && this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = setInterval(
        this.performCleanup.bind(this),
        newConfig.cleanupInterval
      );
    }
  }

  /**
   * Force cleanup
   */
  async forceCleanup(): Promise<void> {
    await this.performCleanup();
  }

  /**
   * Optimize memory usage
   */
  async optimizeMemory(): Promise<void> {
    // Trigger cleanup and garbage collection
    await this.performCleanup();
    
    // Clear unused relationships
    for (const [tabId, tabState] of this.tabStates) {
      // Clean up broken relationships
      tabState.relationships.relatedTabs = tabState.relationships.relatedTabs.filter(
        id => this.tabStates.has(id)
      );
      tabState.relationships.childTabIds = tabState.relationships.childTabIds.filter(
        id => this.tabStates.has(id)
      );
    }
  }

  /**
   * Export tracker state
   */
  exportState(): any {
    return {
      tabStates: Array.from(this.tabStates.entries()),
      activeTabId: this.activeTabId,
      activeWindowId: this.activeWindowId,
      lastActiveTime: this.lastActiveTime,
      configuration: this.config,
      metrics: {
        trackedTabs: this.tabStates.size,
        totalEvents: Array.from(this.tabStates.values())
          .reduce((sum, state) => sum + state.lifecycle.activityCount, 0)
      },
      exportedAt: Date.now()
    };
  }

  /**
   * Reset tracker state
   */
  async reset(): Promise<void> {
    try {
      console.log('Resetting TabLifecycleTracker...');
      
      this.tabStates.clear();
      this.tabGroups.clear();
      this.activeTabId = undefined;
      this.activeWindowId = undefined;
      this.lastActiveTime = Date.now();
      
      // Reload existing tabs
      await this.loadExistingTabs();
      
      console.log('TabLifecycleTracker reset complete');
    } catch (error) {
      console.error('Error resetting TabLifecycleTracker:', error);
    }
  }

  /**
   * Shutdown tracker
   */
  async shutdown(): Promise<void> {
    try {
      console.log('Shutting down TabLifecycleTracker...');
      
      // Clear cleanup timer
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = undefined;
      }

      // Remove all event listeners
      for (const removeListener of this.eventListeners) {
        try {
          removeListener();
        } catch (error) {
          console.warn('Error removing event listener:', error);
        }
      }
      this.eventListeners = [];

      // Save final state (if needed)
      // await this.saveState();

      this.isInitialized = false;
      console.log('TabLifecycleTracker shutdown complete');
      
    } catch (error) {
      console.error('Error shutting down TabLifecycleTracker:', error);
    }
  }
}