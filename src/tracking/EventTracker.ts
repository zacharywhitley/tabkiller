/**
 * Core event tracking coordinator for TabKiller extension
 * Manages all event tracking subsystems and coordinates data flow
 */

import {
  BrowsingEvent,
  EventType,
  EventMetadata,
  TrackingConfig,
  TrackerState,
  TabEvent,
  WindowEvent,
  NavigationEvent,
  SessionBoundary,
  ExtensionError
} from '../shared/types';
import { TabTracker } from './TabTracker';
import { WindowTracker } from './WindowTracker';
import { NavigationTracker } from './NavigationTracker';
import { SessionTracker } from './SessionTracker';
import { LocalEventStore } from '../storage/LocalEventStore';
import { EventBatcher } from '../storage/EventBatcher';
import { PrivacyFilter } from '../utils/PrivacyFilter';

export class EventTracker {
  private config: TrackingConfig;
  private state: TrackerState;
  private eventStore: LocalEventStore;
  private eventBatcher: EventBatcher;
  private privacyFilter: PrivacyFilter;
  
  // Sub-trackers
  private tabTracker: TabTracker;
  private windowTracker: WindowTracker;
  private navigationTracker: NavigationTracker;
  private sessionTracker: SessionTracker;

  // Event handlers
  private eventHandlers = new Map<EventType, ((event: BrowsingEvent) => Promise<void>)[]>();
  
  constructor(config: TrackingConfig) {
    this.config = config;
    this.state = {
      isActive: false,
      lastEventTime: 0,
      eventCount: 0,
      batchCount: 0,
      lastFlush: Date.now(),
      activeTabs: new Set(),
      activeWindows: new Set(),
      idleState: false
    };

    // Initialize storage and processing
    this.eventStore = new LocalEventStore(config);
    this.eventBatcher = new EventBatcher(config, this.eventStore);
    this.privacyFilter = new PrivacyFilter(config);

    // Initialize sub-trackers
    this.tabTracker = new TabTracker(config, this.handleEvent.bind(this));
    this.windowTracker = new WindowTracker(config, this.handleEvent.bind(this));
    this.navigationTracker = new NavigationTracker(config, this.handleEvent.bind(this));
    this.sessionTracker = new SessionTracker(config, this.handleEvent.bind(this));
  }

  /**
   * Initialize the event tracking system
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing EventTracker...');

      // Initialize storage
      await this.eventStore.initialize();
      await this.eventBatcher.initialize();

      // Initialize sub-trackers
      await this.tabTracker.initialize();
      await this.windowTracker.initialize();
      await this.navigationTracker.initialize();
      await this.sessionTracker.initialize();

      // Set up periodic tasks
      this.setupPeriodicTasks();

      this.state.isActive = true;
      console.log('EventTracker initialized successfully');
    } catch (error) {
      console.error('Failed to initialize EventTracker:', error);
      throw new Error(`EventTracker initialization failed: ${error}`);
    }
  }

  /**
   * Shutdown the event tracking system
   */
  async shutdown(): Promise<void> {
    try {
      console.log('Shutting down EventTracker...');
      
      this.state.isActive = false;

      // Flush any pending events
      await this.eventBatcher.flush();

      // Shutdown sub-trackers
      await this.tabTracker.shutdown();
      await this.windowTracker.shutdown();
      await this.navigationTracker.shutdown();
      await this.sessionTracker.shutdown();

      // Cleanup storage
      await this.eventStore.cleanup();

      console.log('EventTracker shutdown complete');
    } catch (error) {
      console.error('Error during EventTracker shutdown:', error);
      throw error;
    }
  }

  /**
   * Main event handling method - processes all browsing events
   */
  async handleEvent(event: BrowsingEvent): Promise<void> {
    if (!this.state.isActive) {
      return;
    }

    try {
      // Apply privacy filtering
      const filteredEvent = await this.privacyFilter.filter(event);
      if (!filteredEvent) {
        // Event was filtered out for privacy reasons
        return;
      }

      // Update tracker state
      this.updateTrackerState(filteredEvent);

      // Process event through registered handlers
      const handlers = this.eventHandlers.get(filteredEvent.type) || [];
      for (const handler of handlers) {
        try {
          await handler(filteredEvent);
        } catch (error) {
          console.error(`Event handler failed for ${filteredEvent.type}:`, error);
          // Continue processing other handlers
        }
      }

      // Store event
      await this.eventBatcher.addEvent(filteredEvent);

      // Update counters
      this.state.eventCount++;
      this.state.lastEventTime = filteredEvent.timestamp;

    } catch (error) {
      console.error('Error handling event:', error);
      this.handleError('EVENT_PROCESSING_FAILED', error, { eventType: event.type });
    }
  }

  /**
   * Register an event handler for specific event types
   */
  onEvent(eventType: EventType, handler: (event: BrowsingEvent) => Promise<void>): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
  }

  /**
   * Remove an event handler
   */
  offEvent(eventType: EventType, handler: (event: BrowsingEvent) => Promise<void>): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Get current tracker state
   */
  getState(): TrackerState {
    return { ...this.state };
  }

  /**
   * Get tracking statistics
   */
  getStats() {
    return {
      isActive: this.state.isActive,
      eventCount: this.state.eventCount,
      batchCount: this.state.batchCount,
      activeTabs: this.state.activeTabs.size,
      activeWindows: this.state.activeWindows.size,
      currentSessionId: this.state.currentSessionId,
      lastEventTime: this.state.lastEventTime,
      storageStats: this.eventStore.getStats(),
      batcherStats: this.eventBatcher.getStats()
    };
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: Partial<TrackingConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    // Update sub-components with new config
    await this.tabTracker.updateConfig(this.config);
    await this.windowTracker.updateConfig(this.config);
    await this.navigationTracker.updateConfig(this.config);
    await this.sessionTracker.updateConfig(this.config);
    await this.eventStore.updateConfig(this.config);
    await this.eventBatcher.updateConfig(this.config);
    await this.privacyFilter.updateConfig(this.config);
  }

  /**
   * Force flush of pending events
   */
  async flush(): Promise<void> {
    await this.eventBatcher.flush();
    this.state.lastFlush = Date.now();
  }

  /**
   * Process tab events from the browser API
   */
  async processTabEvent(tabEvent: TabEvent): Promise<void> {
    await this.tabTracker.processEvent(tabEvent);
  }

  /**
   * Process window events from the browser API
   */
  async processWindowEvent(windowEvent: WindowEvent): Promise<void> {
    await this.windowTracker.processEvent(windowEvent);
  }

  /**
   * Process navigation events
   */
  async processNavigationEvent(navigationEvent: NavigationEvent): Promise<void> {
    await this.navigationTracker.processEvent(navigationEvent);
  }

  /**
   * Process session boundary events
   */
  async processSessionBoundary(boundary: SessionBoundary): Promise<void> {
    await this.sessionTracker.processBoundary(boundary);
  }

  /**
   * Set idle state
   */
  setIdleState(isIdle: boolean, reason?: string): void {
    if (this.state.idleState !== isIdle) {
      this.state.idleState = isIdle;
      this.state.lastIdleTime = isIdle ? Date.now() : undefined;

      // Notify session tracker of idle state change
      this.sessionTracker.setIdleState(isIdle, reason);
    }
  }

  /**
   * Get events matching filter criteria
   */
  async queryEvents(filter: any): Promise<BrowsingEvent[]> {
    return this.eventStore.queryEvents(filter);
  }

  /**
   * Update tracker state based on processed event
   */
  private updateTrackerState(event: BrowsingEvent): void {
    // Update active tabs
    if (event.tabId) {
      if (event.type === 'tab_removed') {
        this.state.activeTabs.delete(event.tabId);
      } else {
        this.state.activeTabs.add(event.tabId);
      }
    }

    // Update active windows
    if (event.windowId) {
      if (event.type === 'window_removed') {
        this.state.activeWindows.delete(event.windowId);
      } else {
        this.state.activeWindows.add(event.windowId);
      }
    }

    // Update session ID if available
    if (event.sessionId && event.sessionId !== this.state.currentSessionId) {
      this.state.currentSessionId = event.sessionId;
    }
  }

  /**
   * Set up periodic maintenance tasks
   */
  private setupPeriodicTasks(): void {
    // Periodic flush
    setInterval(async () => {
      if (this.state.isActive) {
        try {
          await this.flush();
        } catch (error) {
          console.error('Periodic flush failed:', error);
        }
      }
    }, this.config.batchInterval);

    // Storage cleanup
    setInterval(async () => {
      if (this.state.isActive) {
        try {
          await this.eventStore.cleanup();
        } catch (error) {
          console.error('Storage cleanup failed:', error);
        }
      }
    }, this.config.storageCleanupInterval);
  }

  /**
   * Handle errors in the tracking system
   */
  private handleError(code: string, error: any, context?: any): void {
    const trackingError: ExtensionError = {
      code,
      message: error instanceof Error ? error.message : String(error),
      details: context,
      timestamp: Date.now(),
      component: 'tracking',
      sessionId: this.state.currentSessionId
    };

    console.error('Tracking error:', trackingError);
    
    // Could emit error event or store for later analysis
    this.onEvent('error' as EventType, async () => {
      // Error handling logic
    });
  }

  /**
   * Generate unique event ID
   */
  static generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Create base browsing event structure
   */
  static createEvent(
    type: EventType,
    sessionId: string,
    metadata: EventMetadata = {},
    tabId?: number,
    windowId?: number,
    url?: string,
    title?: string
  ): BrowsingEvent {
    return {
      id: EventTracker.generateEventId(),
      timestamp: Date.now(),
      type,
      sessionId,
      metadata,
      tabId,
      windowId,
      url,
      title
    };
  }
}