/**
 * Event batching system for efficient storage and processing
 * Handles event queuing, batching, and deferred persistence
 */

import {
  BrowsingEvent,
  EventBatch,
  TrackingConfig
} from '../shared/types';
import { LocalEventStore } from './LocalEventStore';

interface BatchingStats {
  totalEvents: number;
  pendingEvents: number;
  totalBatches: number;
  averageBatchSize: number;
  lastFlushTime: number;
  flushCount: number;
  droppedEvents: number;
  errorCount: number;
}

interface QueuedEvent {
  event: BrowsingEvent;
  queuedAt: number;
  priority: number;
  retryCount: number;
}

export class EventBatcher {
  private config: TrackingConfig;
  private eventStore: LocalEventStore;
  
  // Event queue
  private eventQueue: QueuedEvent[] = [];
  private maxQueueSize = 5000;
  private isProcessing = false;
  
  // Batching state
  private currentBatch: BrowsingEvent[] = [];
  private lastFlushTime = Date.now();
  private flushTimer?: NodeJS.Timeout;
  
  // Statistics
  private stats: BatchingStats = {
    totalEvents: 0,
    pendingEvents: 0,
    totalBatches: 0,
    averageBatchSize: 0,
    lastFlushTime: Date.now(),
    flushCount: 0,
    droppedEvents: 0,
    errorCount: 0
  };

  constructor(config: TrackingConfig, eventStore: LocalEventStore) {
    this.config = config;
    this.eventStore = eventStore;
    this.maxQueueSize = Math.max(1000, config.maxEventsInMemory || 5000);
  }

  /**
   * Initialize the event batcher
   */
  async initialize(): Promise<void> {
    console.log('Initializing EventBatcher...');
    
    // Start periodic flushing
    this.startPeriodicFlush();
    
    // Start queue processing
    this.startQueueProcessing();
    
    console.log('EventBatcher initialized');
  }

  /**
   * Add event to the batch queue
   */
  async addEvent(event: BrowsingEvent, priority: number = 1): Promise<void> {
    // Check queue capacity
    if (this.eventQueue.length >= this.maxQueueSize) {
      await this.handleQueueOverflow();
    }

    // Add to queue
    const queuedEvent: QueuedEvent = {
      event,
      queuedAt: Date.now(),
      priority,
      retryCount: 0
    };

    this.eventQueue.push(queuedEvent);
    this.stats.totalEvents++;
    this.stats.pendingEvents++;

    // Sort by priority (higher priority first)
    this.eventQueue.sort((a, b) => b.priority - a.priority);

    // Flush if batch is full
    if (this.currentBatch.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  /**
   * Add multiple events
   */
  async addEvents(events: BrowsingEvent[], priority: number = 1): Promise<void> {
    for (const event of events) {
      await this.addEvent(event, priority);
    }
  }

  /**
   * Force flush current batch
   */
  async flush(): Promise<void> {
    if (this.isProcessing) {
      return; // Avoid concurrent flushes
    }

    this.isProcessing = true;
    
    try {
      // Process queued events first
      await this.processQueue();
      
      // Flush current batch if not empty
      if (this.currentBatch.length > 0) {
        await this.flushBatch();
      }
      
      this.stats.lastFlushTime = Date.now();
      this.lastFlushTime = Date.now();
    } catch (error) {
      console.error('Error during flush:', error);
      this.stats.errorCount++;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process events from queue into current batch
   */
  private async processQueue(): Promise<void> {
    const batchSize = this.config.batchSize;
    const eventsToProcess = Math.min(
      this.eventQueue.length,
      batchSize - this.currentBatch.length
    );

    for (let i = 0; i < eventsToProcess; i++) {
      const queuedEvent = this.eventQueue.shift();
      if (queuedEvent) {
        try {
          await this.processQueuedEvent(queuedEvent);
        } catch (error) {
          console.error('Error processing queued event:', error);
          await this.handleEventError(queuedEvent, error);
        }
      }
    }
  }

  /**
   * Process a single queued event
   */
  private async processQueuedEvent(queuedEvent: QueuedEvent): Promise<void> {
    const { event } = queuedEvent;
    
    // Apply any pre-processing
    const processedEvent = await this.preprocessEvent(event);
    
    // Add to current batch
    this.currentBatch.push(processedEvent);
    this.stats.pendingEvents--;
    
    // Check for immediate flush conditions
    if (this.shouldFlushImmediately(processedEvent)) {
      await this.flushBatch();
    }
  }

  /**
   * Preprocess event before batching
   */
  private async preprocessEvent(event: BrowsingEvent): Promise<BrowsingEvent> {
    // Add batch metadata
    const processed = {
      ...event,
      metadata: {
        ...event.metadata,
        batchedAt: Date.now(),
        batchSequence: this.currentBatch.length
      }
    };

    return processed;
  }

  /**
   * Check if event should trigger immediate flush
   */
  private shouldFlushImmediately(event: BrowsingEvent): boolean {
    // Flush immediately for critical events
    const criticalEvents = [
      'session_ended',
      'window_removed',
      'navigation_error'
    ];

    return criticalEvents.includes(event.type);
  }

  /**
   * Flush current batch to storage
   */
  private async flushBatch(): Promise<void> {
    if (this.currentBatch.length === 0) {
      return;
    }

    try {
      // Create batch metadata
      const batchEvents = [...this.currentBatch];
      
      // Store events
      await this.eventStore.storeEvents(batchEvents);
      
      // Update statistics
      this.stats.totalBatches++;
      this.stats.flushCount++;
      this.updateAverageBatchSize(batchEvents.length);
      
      // Clear current batch
      this.currentBatch = [];
      
      console.log(`Flushed batch of ${batchEvents.length} events`);
    } catch (error) {
      console.error('Error flushing batch:', error);
      this.stats.errorCount++;
      
      // Return events to queue for retry
      await this.requeueEvents(this.currentBatch);
      this.currentBatch = [];
    }
  }

  /**
   * Handle queue overflow
   */
  private async handleQueueOverflow(): Promise<void> {
    console.warn('Event queue overflow, applying backpressure');
    
    // Strategy 1: Remove oldest low-priority events
    const lowPriorityEvents = this.eventQueue
      .filter(qe => qe.priority <= 1)
      .sort((a, b) => a.queuedAt - b.queuedAt);
    
    const eventsToRemove = Math.min(
      lowPriorityEvents.length,
      Math.floor(this.maxQueueSize * 0.2) // Remove 20% of low priority
    );

    for (let i = 0; i < eventsToRemove; i++) {
      const event = lowPriorityEvents[i];
      const index = this.eventQueue.indexOf(event);
      if (index > -1) {
        this.eventQueue.splice(index, 1);
        this.stats.droppedEvents++;
      }
    }

    // Strategy 2: Force flush if still too full
    if (this.eventQueue.length >= this.maxQueueSize * 0.9) {
      await this.flush();
    }

    // Strategy 3: Drop additional events if still critical
    if (this.eventQueue.length >= this.maxQueueSize * 0.95) {
      const additionalDrops = this.eventQueue.length - Math.floor(this.maxQueueSize * 0.8);
      this.eventQueue.splice(0, additionalDrops);
      this.stats.droppedEvents += additionalDrops;
    }
  }

  /**
   * Handle event processing errors
   */
  private async handleEventError(queuedEvent: QueuedEvent, error: any): Promise<void> {
    queuedEvent.retryCount++;
    
    if (queuedEvent.retryCount <= 3) {
      // Retry with exponential backoff
      const delay = Math.pow(2, queuedEvent.retryCount) * 1000;
      
      setTimeout(() => {
        this.eventQueue.unshift(queuedEvent);
      }, delay);
    } else {
      // Drop event after max retries
      console.error('Dropping event after max retries:', queuedEvent.event.id, error);
      this.stats.droppedEvents++;
    }
  }

  /**
   * Requeue events for retry
   */
  private async requeueEvents(events: BrowsingEvent[]): Promise<void> {
    for (const event of events.reverse()) {
      const queuedEvent: QueuedEvent = {
        event,
        queuedAt: Date.now(),
        priority: 2, // Higher priority for retry
        retryCount: 0
      };
      
      this.eventQueue.unshift(queuedEvent);
    }
  }

  /**
   * Start periodic flushing
   */
  private startPeriodicFlush(): void {
    const flushInterval = this.config.batchInterval;
    
    this.flushTimer = setInterval(async () => {
      try {
        const timeSinceLastFlush = Date.now() - this.lastFlushTime;
        
        // Flush if we have pending events and enough time has passed
        if ((this.currentBatch.length > 0 || this.eventQueue.length > 0) && 
            timeSinceLastFlush >= flushInterval) {
          await this.flush();
        }
      } catch (error) {
        console.error('Periodic flush error:', error);
      }
    }, Math.min(flushInterval, 30000)); // Max 30 second intervals
  }

  /**
   * Start queue processing
   */
  private startQueueProcessing(): void {
    // Process queue every few seconds
    setInterval(async () => {
      if (!this.isProcessing && this.eventQueue.length > 0) {
        try {
          await this.processQueue();
        } catch (error) {
          console.error('Queue processing error:', error);
        }
      }
    }, 5000); // Every 5 seconds
  }

  /**
   * Update average batch size statistic
   */
  private updateAverageBatchSize(batchSize: number): void {
    if (this.stats.totalBatches === 1) {
      this.stats.averageBatchSize = batchSize;
    } else {
      const totalSize = this.stats.averageBatchSize * (this.stats.totalBatches - 1) + batchSize;
      this.stats.averageBatchSize = totalSize / this.stats.totalBatches;
    }
  }

  /**
   * Get batching statistics
   */
  getStats(): BatchingStats {
    return {
      ...this.stats,
      pendingEvents: this.eventQueue.length + this.currentBatch.length
    };
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    const priorityDistribution = this.eventQueue.reduce((acc, qe) => {
      acc[qe.priority] = (acc[qe.priority] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const oldestEvent = this.eventQueue.length > 0 
      ? Math.min(...this.eventQueue.map(qe => qe.queuedAt))
      : null;

    return {
      queueLength: this.eventQueue.length,
      currentBatchSize: this.currentBatch.length,
      priorityDistribution,
      oldestEvent,
      isProcessing: this.isProcessing,
      averageWaitTime: this.calculateAverageWaitTime()
    };
  }

  /**
   * Calculate average wait time in queue
   */
  private calculateAverageWaitTime(): number {
    if (this.eventQueue.length === 0) return 0;
    
    const now = Date.now();
    const totalWaitTime = this.eventQueue.reduce((sum, qe) => {
      return sum + (now - qe.queuedAt);
    }, 0);
    
    return totalWaitTime / this.eventQueue.length;
  }

  /**
   * Shutdown the batcher
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down EventBatcher...');
    
    // Clear timers
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    // Final flush
    await this.flush();
    
    console.log('EventBatcher shutdown complete');
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: TrackingConfig): Promise<void> {
    this.config = newConfig;
    this.maxQueueSize = Math.max(1000, newConfig.maxEventsInMemory || 5000);
    
    // Restart periodic flush with new interval
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.startPeriodicFlush();
    }
  }

  /**
   * Pause event batching
   */
  pause(): void {
    this.isProcessing = true;
  }

  /**
   * Resume event batching
   */
  resume(): void {
    this.isProcessing = false;
  }

  /**
   * Clear all pending events
   */
  clear(): void {
    this.eventQueue = [];
    this.currentBatch = [];
    this.stats.pendingEvents = 0;
  }

  /**
   * Get events waiting in queue (for debugging)
   */
  getPendingEvents(): BrowsingEvent[] {
    return [
      ...this.eventQueue.map(qe => qe.event),
      ...this.currentBatch
    ];
  }

  /**
   * Force immediate processing of specific event type
   */
  async prioritizeEventType(eventType: string, priority: number = 10): Promise<void> {
    // Increase priority of matching events in queue
    for (const queuedEvent of this.eventQueue) {
      if (queuedEvent.event.type === eventType) {
        queuedEvent.priority = Math.max(queuedEvent.priority, priority);
      }
    }
    
    // Resort queue
    this.eventQueue.sort((a, b) => b.priority - a.priority);
    
    // Process immediately if not already processing
    if (!this.isProcessing) {
      await this.processQueue();
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const now = Date.now();
    const uptime = now - (this.stats.lastFlushTime - 60000); // Rough uptime estimate
    
    return {
      eventsPerSecond: uptime > 0 ? this.stats.totalEvents / (uptime / 1000) : 0,
      batchesPerMinute: uptime > 0 ? this.stats.totalBatches / (uptime / 60000) : 0,
      averageProcessingTime: this.calculateAverageWaitTime(),
      errorRate: this.stats.totalEvents > 0 ? this.stats.errorCount / this.stats.totalEvents : 0,
      dropRate: this.stats.totalEvents > 0 ? this.stats.droppedEvents / this.stats.totalEvents : 0,
      queueEfficiency: this.maxQueueSize > 0 ? (this.maxQueueSize - this.eventQueue.length) / this.maxQueueSize : 1
    };
  }
}