/**
 * Enhanced tab lifecycle tracking with session context
 * Monitors tab creation, updates, activation, and relationships
 */

import {
  BrowsingEvent,
  TabEvent,
  TabInfo,
  TabRelationships,
  TrackingConfig,
  EventType,
  EventMetadata
} from '../shared/types';
import { EventTracker } from './EventTracker';

interface TabState {
  info: TabInfo;
  relationships: TabRelationships;
  sessionStart: number;
  lastActivity: number;
  activityCount: number;
  focusTime: number;
  scrollEvents: number;
  clickEvents: number;
  formInteractions: number;
}

export class TabTracker {
  private config: TrackingConfig;
  private eventHandler: (event: BrowsingEvent) => Promise<void>;
  private tabStates = new Map<number, TabState>();
  private tabGroups = new Map<number, Set<number>>();
  private activeTabId?: number;
  private lastActiveTime = Date.now();

  constructor(config: TrackingConfig, eventHandler: (event: BrowsingEvent) => Promise<void>) {
    this.config = config;
    this.eventHandler = eventHandler;
  }

  /**
   * Initialize tab tracking
   */
  async initialize(): Promise<void> {
    console.log('Initializing TabTracker...');
    
    // Load existing tab states if available
    await this.loadTabStates();
    
    console.log('TabTracker initialized');
  }

  /**
   * Shutdown tab tracking
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down TabTracker...');
    
    // Save tab states
    await this.saveTabStates();
    
    // Clean up resources
    this.tabStates.clear();
    this.tabGroups.clear();
    
    console.log('TabTracker shutdown complete');
  }

  /**
   * Process tab events from browser API
   */
  async processEvent(tabEvent: TabEvent): Promise<void> {
    if (!this.config.enableTabTracking) {
      return;
    }

    const now = Date.now();
    const sessionId = this.getCurrentSessionId();

    switch (tabEvent.type) {
      case 'created':
        await this.handleTabCreated(tabEvent, sessionId, now);
        break;
      case 'updated':
        await this.handleTabUpdated(tabEvent, sessionId, now);
        break;
      case 'removed':
        await this.handleTabRemoved(tabEvent, sessionId, now);
        break;
      case 'activated':
        await this.handleTabActivated(tabEvent, sessionId, now);
        break;
      case 'moved':
        await this.handleTabMoved(tabEvent, sessionId, now);
        break;
      case 'state_changed':
        await this.handleTabStateChanged(tabEvent, sessionId, now);
        break;
    }

    await this.updateTabMetrics(tabEvent.tabId, now);
  }

  /**
   * Handle tab creation
   */
  private async handleTabCreated(tabEvent: TabEvent, sessionId: string, timestamp: number): Promise<void> {
    const tabData = tabEvent.data as TabInfo;
    
    // Create tab state
    const tabState: TabState = {
      info: {
        id: tabEvent.tabId,
        url: tabData?.url || '',
        title: tabData?.title || '',
        favicon: tabData?.favicon,
        windowId: tabEvent.windowId,
        createdAt: timestamp,
        lastAccessed: timestamp,
        timeSpent: 0,
        scrollPosition: 0
      },
      relationships: {
        childTabIds: [],
        relatedTabs: []
      },
      sessionStart: timestamp,
      lastActivity: timestamp,
      activityCount: 0,
      focusTime: 0,
      scrollEvents: 0,
      clickEvents: 0,
      formInteractions: 0
    };

    // Detect parent-child relationships
    await this.detectTabRelationships(tabState, tabEvent);

    this.tabStates.set(tabEvent.tabId, tabState);

    // Emit tracking event
    const event = EventTracker.createEvent(
      'tab_created',
      sessionId,
      this.createTabEventMetadata(tabState, { createdFrom: tabEvent.data }),
      tabEvent.tabId,
      tabEvent.windowId,
      tabState.info.url,
      tabState.info.title
    );

    await this.eventHandler(event);
  }

  /**
   * Handle tab updates
   */
  private async handleTabUpdated(tabEvent: TabEvent, sessionId: string, timestamp: number): Promise<void> {
    const tabState = this.tabStates.get(tabEvent.tabId);
    if (!tabState) {
      // Tab not tracked yet, treat as creation
      await this.handleTabCreated(tabEvent, sessionId, timestamp);
      return;
    }

    const changeInfo = tabEvent.data;
    const hasUrlChange = changeInfo?.url && changeInfo.url !== tabState.info.url;
    const hasTitleChange = changeInfo?.title && changeInfo.title !== tabState.info.title;

    // Update tab info
    if (changeInfo?.url) tabState.info.url = changeInfo.url;
    if (changeInfo?.title) tabState.info.title = changeInfo.title;
    if (changeInfo?.favicon) tabState.info.favicon = changeInfo.favicon;

    tabState.info.lastAccessed = timestamp;
    tabState.lastActivity = timestamp;
    tabState.activityCount++;

    // Emit appropriate events
    if (hasUrlChange) {
      const navigationEvent = EventTracker.createEvent(
        'navigation_completed',
        sessionId,
        this.createTabEventMetadata(tabState, {
          previousUrl: tabState.info.url,
          newUrl: changeInfo.url,
          urlChange: true
        }),
        tabEvent.tabId,
        tabEvent.windowId,
        changeInfo.url,
        changeInfo.title || tabState.info.title
      );
      await this.eventHandler(navigationEvent);
    }

    if (hasTitleChange || !hasUrlChange) {
      const updateEvent = EventTracker.createEvent(
        'tab_updated',
        sessionId,
        this.createTabEventMetadata(tabState, changeInfo),
        tabEvent.tabId,
        tabEvent.windowId,
        tabState.info.url,
        tabState.info.title
      );
      await this.eventHandler(updateEvent);
    }
  }

  /**
   * Handle tab removal
   */
  private async handleTabRemoved(tabEvent: TabEvent, sessionId: string, timestamp: number): Promise<void> {
    const tabState = this.tabStates.get(tabEvent.tabId);
    if (!tabState) {
      return;
    }

    // Calculate final metrics
    const totalTime = timestamp - tabState.sessionStart;
    const focusTime = tabState.focusTime;
    if (this.activeTabId === tabEvent.tabId) {
      focusTime + (timestamp - this.lastActiveTime);
    }

    // Update relationships - remove this tab from parent/child relationships
    await this.cleanupTabRelationships(tabEvent.tabId);

    const event = EventTracker.createEvent(
      'tab_removed',
      sessionId,
      this.createTabEventMetadata(tabState, {
        totalTime,
        finalFocusTime: focusTime,
        activityCount: tabState.activityCount,
        scrollEvents: tabState.scrollEvents,
        clickEvents: tabState.clickEvents,
        formInteractions: tabState.formInteractions
      }),
      tabEvent.tabId,
      tabEvent.windowId,
      tabState.info.url,
      tabState.info.title
    );

    await this.eventHandler(event);

    // Clean up tab state
    this.tabStates.delete(tabEvent.tabId);
    if (this.activeTabId === tabEvent.tabId) {
      this.activeTabId = undefined;
    }
  }

  /**
   * Handle tab activation
   */
  private async handleTabActivated(tabEvent: TabEvent, sessionId: string, timestamp: number): Promise<void> {
    // Update previous active tab's focus time
    if (this.activeTabId && this.activeTabId !== tabEvent.tabId) {
      const prevTabState = this.tabStates.get(this.activeTabId);
      if (prevTabState) {
        prevTabState.focusTime += timestamp - this.lastActiveTime;
      }
    }

    // Update current active tab
    this.activeTabId = tabEvent.tabId;
    this.lastActiveTime = timestamp;

    const tabState = this.tabStates.get(tabEvent.tabId);
    if (tabState) {
      tabState.lastActivity = timestamp;
      tabState.info.lastAccessed = timestamp;
      tabState.activityCount++;
    }

    const event = EventTracker.createEvent(
      'tab_activated',
      sessionId,
      this.createTabEventMetadata(tabState, { switchedFrom: this.activeTabId }),
      tabEvent.tabId,
      tabEvent.windowId,
      tabState?.info.url,
      tabState?.info.title
    );

    await this.eventHandler(event);
  }

  /**
   * Handle tab moved (reordered)
   */
  private async handleTabMoved(tabEvent: TabEvent, sessionId: string, timestamp: number): Promise<void> {
    const tabState = this.tabStates.get(tabEvent.tabId);
    if (!tabState) {
      return;
    }

    tabState.lastActivity = timestamp;
    tabState.activityCount++;

    const event = EventTracker.createEvent(
      'tab_moved',
      sessionId,
      this.createTabEventMetadata(tabState, { 
        newIndex: tabEvent.data?.index,
        previousIndex: tabState.info.id 
      }),
      tabEvent.tabId,
      tabEvent.windowId,
      tabState.info.url,
      tabState.info.title
    );

    await this.eventHandler(event);
  }

  /**
   * Handle tab state changes (pinned, muted, etc.)
   */
  private async handleTabStateChanged(tabEvent: TabEvent, sessionId: string, timestamp: number): Promise<void> {
    const tabState = this.tabStates.get(tabEvent.tabId);
    if (!tabState) {
      return;
    }

    const stateChange = tabEvent.data;
    let eventType: EventType = 'tab_updated';

    if (stateChange?.pinned !== undefined) {
      eventType = stateChange.pinned ? 'tab_pinned' : 'tab_unpinned';
    } else if (stateChange?.muted !== undefined) {
      eventType = stateChange.muted ? 'tab_muted' : 'tab_unmuted';
    }

    tabState.lastActivity = timestamp;
    tabState.activityCount++;

    const event = EventTracker.createEvent(
      eventType,
      sessionId,
      this.createTabEventMetadata(tabState, stateChange),
      tabEvent.tabId,
      tabEvent.windowId,
      tabState.info.url,
      tabState.info.title
    );

    await this.eventHandler(event);
  }

  /**
   * Record interaction events (scroll, click, form) from content scripts
   */
  async recordInteraction(type: 'scroll' | 'click' | 'form', tabId: number, data?: any): Promise<void> {
    const tabState = this.tabStates.get(tabId);
    if (!tabState) {
      return;
    }

    const now = Date.now();
    tabState.lastActivity = now;
    tabState.activityCount++;

    switch (type) {
      case 'scroll':
        tabState.scrollEvents++;
        if (data?.scrollPosition) {
          tabState.info.scrollPosition = data.scrollPosition.y;
        }
        break;
      case 'click':
        tabState.clickEvents++;
        break;
      case 'form':
        tabState.formInteractions++;
        break;
    }

    // Don't emit individual interaction events to reduce noise
    // These metrics are included in other events
  }

  /**
   * Detect relationships between tabs (parent-child, duplicated from, etc.)
   */
  private async detectTabRelationships(tabState: TabState, tabEvent: TabEvent): Promise<void> {
    const openerTabId = tabEvent.data?.openerTabId;
    const parentTabId = tabEvent.data?.parentTabId;

    if (openerTabId) {
      tabState.relationships.openerTabId = openerTabId;
      
      // Add this tab as child to opener
      const openerState = this.tabStates.get(openerTabId);
      if (openerState) {
        openerState.relationships.childTabIds.push(tabState.info.id);
      }
    }

    if (parentTabId && parentTabId !== openerTabId) {
      tabState.relationships.parentTabId = parentTabId;
      
      // Add this tab as child to parent
      const parentState = this.tabStates.get(parentTabId);
      if (parentState) {
        parentState.relationships.childTabIds.push(tabState.info.id);
      }
    }

    // Detect related tabs (same domain, similar URLs)
    await this.detectRelatedTabs(tabState);
  }

  /**
   * Detect tabs that might be related (same site, similar content)
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
            tabState.relationships.relatedTabs.push(tabId);
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
      tabState.relationships.childTabIds = tabState.relationships.childTabIds.filter(id => id !== closedTabId);
      
      // Remove from related lists
      tabState.relationships.relatedTabs = tabState.relationships.relatedTabs.filter(id => id !== closedTabId);
      
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
   * Update tab activity metrics
   */
  private async updateTabMetrics(tabId: number, timestamp: number): Promise<void> {
    const tabState = this.tabStates.get(tabId);
    if (!tabState) return;

    // Update time spent if this is the active tab
    if (this.activeTabId === tabId) {
      const timeDelta = timestamp - this.lastActiveTime;
      tabState.focusTime += timeDelta;
      tabState.info.timeSpent += timeDelta;
      this.lastActiveTime = timestamp;
    }
  }

  /**
   * Create metadata for tab events
   */
  private createTabEventMetadata(tabState: TabState | undefined, additionalData?: any): EventMetadata {
    const metadata: EventMetadata = {
      ...additionalData
    };

    if (tabState) {
      metadata.relationships = tabState.relationships;
      metadata.sessionStartTime = tabState.sessionStart;
      metadata.activityCount = tabState.activityCount;
      metadata.focusTime = tabState.focusTime;
      metadata.scrollEvents = tabState.scrollEvents;
      metadata.clickEvents = tabState.clickEvents;
      metadata.formInteractions = tabState.formInteractions;
    }

    return metadata;
  }

  /**
   * Get current session ID (would be provided by SessionTracker)
   */
  private getCurrentSessionId(): string {
    // This would typically come from the SessionTracker
    // For now, return a placeholder
    return 'session_' + Date.now();
  }

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
   * Update configuration
   */
  async updateConfig(newConfig: TrackingConfig): Promise<void> {
    this.config = newConfig;
  }

  /**
   * Load tab states from storage (implementation placeholder)
   */
  private async loadTabStates(): Promise<void> {
    // Implementation would load from storage
    // For now, this is a placeholder
  }

  /**
   * Save tab states to storage (implementation placeholder)
   */
  private async saveTabStates(): Promise<void> {
    // Implementation would save to storage
    // For now, this is a placeholder
  }
}