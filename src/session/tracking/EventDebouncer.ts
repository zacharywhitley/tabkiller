/**
 * Event Debouncer - Performance optimization for high-frequency events
 * Prevents event flooding and optimizes processing through intelligent debouncing
 */

import { TabEvent } from '../../shared/types';

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface DebouncedEvent {
  originalEvent: TabEvent;
  firstSeen: number;
  lastSeen: number;
  count: number;
  merged?: boolean;
}

export interface EventDebouncerConfig {
  timeout: number;
  maxQueueSize: number;
  enableEventMerging?: boolean;
  enablePriorityProcessing?: boolean;
  adaptiveTimeout?: boolean;
  compressionEnabled?: boolean;
}

export interface EventBatch {
  events: DebouncedEvent[];
  totalEvents: number;
  timespan: number;
  processed: boolean;
  batchId: string;
}

export interface DebouncerMetrics {
  eventsReceived: number;
  eventsDebounced: number;
  batchesProcessed: number;
  averageBatchSize: number;
  compressionRatio: number;
  processingTimesSaved: number;
  currentQueueSize: number;
  adaptiveTimeoutChanges: number;
}

export type EventPriority = 'low' | 'medium' | 'high' | 'critical';

// =============================================================================
// EVENT DEBOUNCER
// =============================================================================

export class EventDebouncer {
  private config: EventDebouncerConfig;
  private eventQueue = new Map<string, DebouncedEvent>();
  private processingTimers = new Map<string, number>();
  private eventHandlers: Array<(events: TabEvent[]) => Promise<void>> = [];
  
  private isInitialized: boolean = false;
  private metrics: DebouncerMetrics;
  private adaptiveTimeout: number;
  private lastBatchTime = Date.now();
  private performanceHistory: number[] = [];

  constructor(config: EventDebouncerConfig) {
    this.config = {
      enableEventMerging: true,
      enablePriorityProcessing: true,
      adaptiveTimeout: true,
      compressionEnabled: true,
      ...config
    };

    this.adaptiveTimeout = this.config.timeout;

    // Initialize metrics
    this.metrics = {
      eventsReceived: 0,
      eventsDebounced: 0,
      batchesProcessed: 0,
      averageBatchSize: 0,
      compressionRatio: 0,
      processingTimesSaved: 0,
      currentQueueSize: 0,
      adaptiveTimeoutChanges: 0
    };
  }

  /**
   * Initialize event debouncer
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Initializing EventDebouncer...');

      // Set up cleanup interval
      setInterval(this.performCleanup.bind(this), 60000); // 1 minute

      this.isInitialized = true;
      console.log('EventDebouncer initialized successfully');

    } catch (error) {
      console.error('Failed to initialize EventDebouncer:', error);
      throw error;
    }
  }

  /**
   * Debounce a tab event
   */
  async debounceEvent(tabEvent: TabEvent): Promise<boolean> {
    if (!this.isInitialized) {
      console.warn('EventDebouncer not initialized, processing event immediately');
      return true;
    }

    try {
      this.metrics.eventsReceived++;
      
      // Check queue size limit
      if (this.eventQueue.size >= this.config.maxQueueSize) {
        console.warn('Event queue full, forcing batch processing');
        await this.processBatch();
      }

      // Create event key for deduplication
      const eventKey = this.createEventKey(tabEvent);
      const now = Date.now();
      
      // Get existing debounced event or create new one
      let debouncedEvent = this.eventQueue.get(eventKey);
      
      if (debouncedEvent) {
        // Update existing event
        debouncedEvent.lastSeen = now;
        debouncedEvent.count++;
        
        // Merge events if enabled
        if (this.config.enableEventMerging) {
          debouncedEvent = this.mergeEvents(debouncedEvent, tabEvent);
        }
        
        this.metrics.eventsDebounced++;
      } else {
        // Create new debounced event
        debouncedEvent = {
          originalEvent: tabEvent,
          firstSeen: now,
          lastSeen: now,
          count: 1,
          merged: false
        };
        
        this.eventQueue.set(eventKey, debouncedEvent);
      }

      // Set or reset debounce timer
      const priority = this.getEventPriority(tabEvent);
      const timeout = this.calculateTimeout(priority, debouncedEvent.count);
      
      this.setDebouncTimer(eventKey, timeout);

      // Update metrics
      this.metrics.currentQueueSize = this.eventQueue.size;

      // Return false to indicate event was queued (not processed immediately)
      return false;

    } catch (error) {
      console.error('Error debouncing event:', error);
      // Process immediately on error
      return true;
    }
  }

  /**
   * Create unique key for event deduplication
   */
  private createEventKey(tabEvent: TabEvent): string {
    // Create key based on tab ID and event type
    // For similar events (like tab updates), use the same key to enable debouncing
    const baseKey = `${tabEvent.tabId}_${tabEvent.type}`;
    
    // Add additional specificity for certain event types
    switch (tabEvent.type) {
      case 'updated':
        // Group URL changes together, but separate from other updates
        if (tabEvent.data?.url) {
          return `${baseKey}_url`;
        } else if (tabEvent.data?.title) {
          return `${baseKey}_title`;
        }
        return baseKey;
        
      case 'activated':
        // Window changes should be separate
        return `${baseKey}_${tabEvent.windowId}`;
        
      default:
        return baseKey;
    }
  }

  /**
   * Merge similar events to reduce processing load
   */
  private mergeEvents(existingEvent: DebouncedEvent, newEvent: TabEvent): DebouncedEvent {
    if (!this.config.enableEventMerging) {
      return existingEvent;
    }

    // Merge event data based on event type
    switch (newEvent.type) {
      case 'updated':
        // Merge tab update data
        const existingData = existingEvent.originalEvent.data || {};
        const newData = newEvent.data || {};
        
        existingEvent.originalEvent.data = {
          ...existingData,
          ...newData,
          // Keep the most recent timestamp
          timestamp: Math.max(existingData.timestamp || 0, newData.timestamp || 0)
        };
        existingEvent.merged = true;
        break;
        
      case 'activated':
        // For activation events, keep the most recent one
        existingEvent.originalEvent = newEvent;
        break;
        
      default:
        // For other events, keep the first one
        break;
    }

    return existingEvent;
  }

  /**
   * Get event priority for processing order
   */
  private getEventPriority(tabEvent: TabEvent): EventPriority {
    switch (tabEvent.type) {
      case 'created':
      case 'removed':
        return 'high';
      case 'activated':
        return 'medium';
      case 'updated':
        // URL changes are higher priority than title changes
        if (tabEvent.data?.url) {
          return 'medium';
        }
        return 'low';
      default:
        return 'low';
    }
  }

  /**
   * Calculate timeout based on priority and frequency
   */
  private calculateTimeout(priority: EventPriority, eventCount: number): number {
    let baseTimeout = this.adaptiveTimeout;

    // Adjust timeout based on priority
    switch (priority) {
      case 'critical':
        baseTimeout *= 0.1;
        break;
      case 'high':
        baseTimeout *= 0.5;
        break;
      case 'medium':
        baseTimeout *= 1.0;
        break;
      case 'low':
        baseTimeout *= 2.0;
        break;
    }

    // Reduce timeout for frequently updated events (to prevent indefinite delay)
    if (eventCount > 5) {
      baseTimeout *= Math.max(0.2, 1 / Math.log(eventCount));
    }

    return Math.max(baseTimeout, 50); // Minimum 50ms
  }

  /**
   * Set debounce timer for an event
   */
  private setDebouncTimer(eventKey: string, timeout: number): void {
    // Clear existing timer
    const existingTimer = this.processingTimers.get(eventKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = window.setTimeout(() => {
      this.processEvent(eventKey);
    }, timeout);

    this.processingTimers.set(eventKey, timer);
  }

  /**
   * Process a specific debounced event
   */
  private async processEvent(eventKey: string): Promise<void> {
    try {
      const debouncedEvent = this.eventQueue.get(eventKey);
      if (!debouncedEvent) return;

      // Remove from queue and timer
      this.eventQueue.delete(eventKey);
      this.processingTimers.delete(eventKey);

      // Process through handlers
      for (const handler of this.eventHandlers) {
        try {
          await handler([debouncedEvent.originalEvent]);
        } catch (error) {
          console.error('Error in debounced event handler:', error);
        }
      }

      // Update metrics
      this.updateProcessingMetrics([debouncedEvent]);

    } catch (error) {
      console.error('Error processing debounced event:', error);
    }
  }

  /**
   * Process all queued events as a batch
   */
  private async processBatch(): Promise<void> {
    if (this.eventQueue.size === 0) return;

    try {
      const events = Array.from(this.eventQueue.values());
      const eventKeys = Array.from(this.eventQueue.keys());

      // Clear queue and timers
      this.eventQueue.clear();
      for (const timer of this.processingTimers.values()) {
        clearTimeout(timer);
      }
      this.processingTimers.clear();

      // Sort events by priority and timestamp
      events.sort((a, b) => {
        const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
        const aPriority = this.getEventPriority(a.originalEvent);
        const bPriority = this.getEventPriority(b.originalEvent);
        
        const priorityDiff = priorityOrder[aPriority] - priorityOrder[bPriority];
        return priorityDiff !== 0 ? priorityDiff : a.firstSeen - b.firstSeen;
      });

      // Process through handlers
      const tabEvents = events.map(e => e.originalEvent);
      for (const handler of this.eventHandlers) {
        try {
          await handler(tabEvents);
        } catch (error) {
          console.error('Error in batch event handler:', error);
        }
      }

      // Update metrics
      this.updateProcessingMetrics(events);
      this.lastBatchTime = Date.now();

      console.log(`Processed batch of ${events.length} debounced events`);

    } catch (error) {
      console.error('Error processing event batch:', error);
    }
  }

  /**
   * Update processing metrics
   */
  private updateProcessingMetrics(events: DebouncedEvent[]): void {
    this.metrics.batchesProcessed++;
    
    const totalEvents = events.reduce((sum, e) => sum + e.count, 0);
    const processedEvents = events.length;
    
    // Update average batch size
    const totalBatches = this.metrics.batchesProcessed;
    const currentAvg = this.metrics.averageBatchSize;
    this.metrics.averageBatchSize = ((currentAvg * (totalBatches - 1)) + processedEvents) / totalBatches;
    
    // Update compression ratio
    if (totalEvents > 0) {
      const compressionRatio = 1 - (processedEvents / totalEvents);
      this.metrics.compressionRatio = 
        ((this.metrics.compressionRatio * (totalBatches - 1)) + compressionRatio) / totalBatches;
    }

    // Estimate processing time saved
    const savedProcessing = totalEvents - processedEvents;
    this.metrics.processingTimesSaved += savedProcessing;

    // Update queue size
    this.metrics.currentQueueSize = this.eventQueue.size;

    // Update performance history for adaptive timeout
    if (this.config.adaptiveTimeout) {
      this.performanceHistory.push(processedEvents);
      if (this.performanceHistory.length > 20) {
        this.performanceHistory = this.performanceHistory.slice(-10);
      }
      this.adaptTimeout();
    }
  }

  /**
   * Adapt timeout based on performance history
   */
  private adaptTimeout(): void {
    if (this.performanceHistory.length < 5) return;

    const recentAvg = this.performanceHistory.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const previousTimeout = this.adaptiveTimeout;

    if (recentAvg > 10) {
      // High event volume, increase timeout to batch more
      this.adaptiveTimeout = Math.min(this.adaptiveTimeout * 1.2, this.config.timeout * 3);
    } else if (recentAvg < 3) {
      // Low event volume, decrease timeout for faster processing
      this.adaptiveTimeout = Math.max(this.adaptiveTimeout * 0.8, this.config.timeout * 0.5);
    }

    if (Math.abs(this.adaptiveTimeout - previousTimeout) > 10) {
      this.metrics.adaptiveTimeoutChanges++;
      console.log(`Adapted debounce timeout: ${previousTimeout}ms -> ${this.adaptiveTimeout}ms`);
    }
  }

  /**
   * Perform cleanup of stale events
   */
  private performCleanup(): void {
    try {
      const now = Date.now();
      const maxAge = 300000; // 5 minutes
      let cleanedCount = 0;

      // Remove stale events
      for (const [eventKey, debouncedEvent] of this.eventQueue) {
        if (now - debouncedEvent.lastSeen > maxAge) {
          this.eventQueue.delete(eventKey);
          
          // Clear associated timer
          const timer = this.processingTimers.get(eventKey);
          if (timer) {
            clearTimeout(timer);
            this.processingTimers.delete(eventKey);
          }
          
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} stale debounced events`);
        this.metrics.currentQueueSize = this.eventQueue.size;
      }

    } catch (error) {
      console.error('Error during debouncer cleanup:', error);
    }
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  /**
   * Register event handler for debounced events
   */
  onDebouncedEvent(handler: (events: TabEvent[]) => Promise<void>): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Force processing of all queued events
   */
  async flush(): Promise<void> {
    await this.processBatch();
  }

  /**
   * Update debounce timeout
   */
  updateTimeout(timeout: number): void {
    this.config.timeout = Math.max(timeout, 10); // Minimum 10ms
    if (!this.config.adaptiveTimeout) {
      this.adaptiveTimeout = this.config.timeout;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): DebouncerMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): {
    queueSize: number;
    maxQueueSize: number;
    utilizationPercentage: number;
    oldestEventAge: number;
    pendingTimers: number;
  } {
    let oldestAge = 0;
    const now = Date.now();
    
    for (const event of this.eventQueue.values()) {
      const age = now - event.firstSeen;
      oldestAge = Math.max(oldestAge, age);
    }

    return {
      queueSize: this.eventQueue.size,
      maxQueueSize: this.config.maxQueueSize,
      utilizationPercentage: (this.eventQueue.size / this.config.maxQueueSize) * 100,
      oldestEventAge: oldestAge,
      pendingTimers: this.processingTimers.size
    };
  }

  /**
   * Enable/disable event merging
   */
  setEventMergingEnabled(enabled: boolean): void {
    this.config.enableEventMerging = enabled;
  }

  /**
   * Enable/disable adaptive timeout
   */
  setAdaptiveTimeoutEnabled(enabled: boolean): void {
    this.config.adaptiveTimeout = enabled;
    if (!enabled) {
      this.adaptiveTimeout = this.config.timeout;
    }
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      eventsReceived: 0,
      eventsDebounced: 0,
      batchesProcessed: 0,
      averageBatchSize: 0,
      compressionRatio: 0,
      processingTimesSaved: 0,
      currentQueueSize: this.eventQueue.size,
      adaptiveTimeoutChanges: 0
    };
    
    this.performanceHistory = [];
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Process any remaining events
    if (this.eventQueue.size > 0) {
      await this.processBatch();
    }

    // Clear all timers
    for (const timer of this.processingTimers.values()) {
      clearTimeout(timer);
    }
    this.processingTimers.clear();
  }

  /**
   * Reset debouncer state
   */
  async reset(): Promise<void> {
    try {
      console.log('Resetting EventDebouncer...');

      // Clean up first
      await this.cleanup();

      // Clear queue and metrics
      this.eventQueue.clear();
      this.resetMetrics();

      console.log('EventDebouncer reset complete');
    } catch (error) {
      console.error('Error resetting EventDebouncer:', error);
    }
  }

  /**
   * Shutdown debouncer
   */
  async shutdown(): Promise<void> {
    try {
      console.log('Shutting down EventDebouncer...');

      // Clean up all resources
      await this.cleanup();

      // Clear handlers
      this.eventHandlers = [];

      this.isInitialized = false;
      console.log('EventDebouncer shutdown complete');

    } catch (error) {
      console.error('Error shutting down EventDebouncer:', error);
    }
  }
}