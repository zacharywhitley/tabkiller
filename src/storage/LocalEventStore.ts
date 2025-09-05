/**
 * Local event storage with efficient batching and querying
 * Manages event persistence with compression and cleanup
 */

import {
  BrowsingEvent,
  EventBatch,
  LocalEventStore as ILocalEventStore,
  EventFilter,
  TrackingConfig
} from '../shared/types';
import { storage } from '../utils/cross-browser';

interface StorageStats {
  totalEvents: number;
  totalBatches: number;
  storageUsed: number;
  oldestEvent: number;
  newestEvent: number;
  compressionRatio: number;
}

export class LocalEventStore {
  private config: TrackingConfig;
  private store: ILocalEventStore;
  private storageKey = 'tabkiller_events';
  private indexKey = 'tabkiller_event_index';
  private statsKey = 'tabkiller_storage_stats';
  
  // Memory cache for recent events
  private memoryCache = new Map<string, BrowsingEvent>();
  private maxMemoryEvents = 1000;
  
  // Event index for efficient querying
  private eventIndex = new Map<string, {
    batchId: string;
    position: number;
    timestamp: number;
    sessionId: string;
    type: string;
    domain?: string;
  }>();

  constructor(config: TrackingConfig) {
    this.config = config;
    this.store = {
      batches: [],
      pendingEvents: [],
      lastFlush: Date.now(),
      totalEvents: 0,
      storageUsed: 0
    };
  }

  /**
   * Initialize the event store
   */
  async initialize(): Promise<void> {
    console.log('Initializing LocalEventStore...');
    
    try {
      // Load existing store
      await this.loadStore();
      
      // Load event index
      await this.loadEventIndex();
      
      // Setup periodic cleanup
      this.setupPeriodicCleanup();
      
      console.log('LocalEventStore initialized with', this.store.totalEvents, 'events');
    } catch (error) {
      console.error('Failed to initialize LocalEventStore:', error);
      throw error;
    }
  }

  /**
   * Store a single event
   */
  async storeEvent(event: BrowsingEvent): Promise<void> {
    // Add to pending events
    this.store.pendingEvents.push(event);
    this.store.totalEvents++;
    
    // Add to memory cache
    this.memoryCache.set(event.id, event);
    
    // Maintain cache size
    if (this.memoryCache.size > this.maxMemoryEvents) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }
    
    // Check if we should create a batch
    if (this.store.pendingEvents.length >= this.config.batchSize) {
      await this.createBatch();
    }
  }

  /**
   * Store multiple events
   */
  async storeEvents(events: BrowsingEvent[]): Promise<void> {
    for (const event of events) {
      await this.storeEvent(event);
    }
  }

  /**
   * Create a batch from pending events
   */
  async createBatch(): Promise<EventBatch | null> {
    if (this.store.pendingEvents.length === 0) {
      return null;
    }

    const batchId = this.generateBatchId();
    const events = [...this.store.pendingEvents];
    const rawSize = this.calculateEventSize(events);
    
    // Compress events
    const compressedEvents = await this.compressEvents(events);
    const compressedSize = this.calculateEventSize(compressedEvents);
    
    const batch: EventBatch = {
      id: batchId,
      events: compressedEvents,
      createdAt: Date.now(),
      size: compressedSize,
      compressed: compressedSize < rawSize
    };

    // Update index
    await this.updateEventIndex(batch);
    
    // Store batch
    this.store.batches.push(batch);
    this.store.pendingEvents = [];
    this.store.lastFlush = Date.now();
    this.store.storageUsed += compressedSize;
    
    // Persist to storage
    await this.persistBatch(batch);
    await this.saveStore();
    
    // Cleanup if needed
    await this.checkStorageLimits();
    
    return batch;
  }

  /**
   * Query events with filtering
   */
  async queryEvents(filter: EventFilter): Promise<BrowsingEvent[]> {
    const results: BrowsingEvent[] = [];
    const { limit = 100, offset = 0 } = filter;
    
    // First check memory cache for recent events
    const cacheResults = this.queryMemoryCache(filter);
    results.push(...cacheResults);
    
    // If we need more results, query stored batches
    if (results.length < limit + offset) {
      const storedResults = await this.queryStoredEvents(filter, limit + offset - results.length);
      results.push(...storedResults);
    }
    
    // Apply sorting by timestamp (descending)
    results.sort((a, b) => b.timestamp - a.timestamp);
    
    // Apply offset and limit
    return results.slice(offset, offset + limit);
  }

  /**
   * Query memory cache
   */
  private queryMemoryCache(filter: EventFilter): BrowsingEvent[] {
    const results: BrowsingEvent[] = [];
    
    for (const event of this.memoryCache.values()) {
      if (this.matchesFilter(event, filter)) {
        results.push(event);
      }
    }
    
    return results;
  }

  /**
   * Query stored events
   */
  private async queryStoredEvents(filter: EventFilter, maxResults: number): Promise<BrowsingEvent[]> {
    const results: BrowsingEvent[] = [];
    
    // Use index to find relevant batches
    const relevantBatches = this.findRelevantBatches(filter);
    
    for (const batchId of relevantBatches) {
      if (results.length >= maxResults) break;
      
      const batch = await this.loadBatch(batchId);
      if (batch) {
        const decompressedEvents = await this.decompressEvents(batch.events);
        
        for (const event of decompressedEvents) {
          if (results.length >= maxResults) break;
          
          if (this.matchesFilter(event, filter)) {
            results.push(event);
          }
        }
      }
    }
    
    return results;
  }

  /**
   * Find relevant batches using index
   */
  private findRelevantBatches(filter: EventFilter): string[] {
    const batchIds = new Set<string>();
    
    for (const indexEntry of this.eventIndex.values()) {
      // Check date range
      if (filter.dateRange) {
        if (indexEntry.timestamp < filter.dateRange.start || 
            indexEntry.timestamp > filter.dateRange.end) {
          continue;
        }
      }
      
      // Check event types
      if (filter.types && !filter.types.includes(indexEntry.type as any)) {
        continue;
      }
      
      // Check session IDs
      if (filter.sessionIds && !filter.sessionIds.includes(indexEntry.sessionId)) {
        continue;
      }
      
      // Check domains
      if (filter.domains && indexEntry.domain && 
          !filter.domains.some(domain => indexEntry.domain!.includes(domain))) {
        continue;
      }
      
      batchIds.add(indexEntry.batchId);
    }
    
    return Array.from(batchIds);
  }

  /**
   * Check if event matches filter criteria
   */
  private matchesFilter(event: BrowsingEvent, filter: EventFilter): boolean {
    // Date range check
    if (filter.dateRange) {
      if (event.timestamp < filter.dateRange.start || 
          event.timestamp > filter.dateRange.end) {
        return false;
      }
    }
    
    // Event type check
    if (filter.types && !filter.types.includes(event.type)) {
      return false;
    }
    
    // Session ID check
    if (filter.sessionIds && !filter.sessionIds.includes(event.sessionId)) {
      return false;
    }
    
    // Tab ID check
    if (filter.tabIds && (!event.tabId || !filter.tabIds.includes(event.tabId))) {
      return false;
    }
    
    // Window ID check
    if (filter.windowIds && (!event.windowId || !filter.windowIds.includes(event.windowId))) {
      return false;
    }
    
    // Domain check
    if (filter.domains && event.url) {
      const eventDomain = this.extractDomain(event.url);
      if (!eventDomain || !filter.domains.some(domain => eventDomain.includes(domain))) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Update event index when creating batch
   */
  private async updateEventIndex(batch: EventBatch): Promise<void> {
    for (let i = 0; i < batch.events.length; i++) {
      const event = batch.events[i];
      const domain = event.url ? this.extractDomain(event.url) : undefined;
      
      this.eventIndex.set(event.id, {
        batchId: batch.id,
        position: i,
        timestamp: event.timestamp,
        sessionId: event.sessionId,
        type: event.type,
        domain
      });
    }
    
    // Persist index
    await this.saveEventIndex();
  }

  /**
   * Compress events for storage efficiency
   */
  private async compressEvents(events: BrowsingEvent[]): Promise<BrowsingEvent[]> {
    if (!this.shouldCompress(events)) {
      return events;
    }

    // Simple compression: remove redundant data
    const compressed = events.map(event => ({
      ...event,
      // Remove large metadata that can be reconstructed
      metadata: this.compressMetadata(event.metadata),
      // Truncate very long URLs
      url: event.url && event.url.length > 500 ? event.url.substring(0, 500) + '...' : event.url,
      // Truncate very long titles
      title: event.title && event.title.length > 200 ? event.title.substring(0, 200) + '...' : event.title
    }));

    return compressed;
  }

  /**
   * Decompress events when loading
   */
  private async decompressEvents(events: BrowsingEvent[]): Promise<BrowsingEvent[]> {
    // For now, just return events as-is
    // In a real implementation, this would reverse the compression
    return events;
  }

  /**
   * Check if events should be compressed
   */
  private shouldCompress(events: BrowsingEvent[]): boolean {
    const totalSize = this.calculateEventSize(events);
    return totalSize > 50000; // Compress if batch is larger than 50KB
  }

  /**
   * Compress metadata
   */
  private compressMetadata(metadata: any): any {
    if (!metadata) return metadata;
    
    const compressed = { ...metadata };
    
    // Remove large arrays/objects that can be reconstructed
    delete compressed.fullFormData;
    delete compressed.completePageHTML;
    delete compressed.allLinks;
    
    // Keep only essential metadata
    const essential = ['domain', 'transitionType', 'timeSpent', 'scrollEvents', 'clickEvents'];
    const result: any = {};
    
    for (const key of essential) {
      if (compressed[key] !== undefined) {
        result[key] = compressed[key];
      }
    }
    
    return result;
  }

  /**
   * Calculate storage size of events
   */
  private calculateEventSize(events: BrowsingEvent[]): number {
    return JSON.stringify(events).length;
  }

  /**
   * Check storage limits and cleanup if needed
   */
  private async checkStorageLimits(): Promise<void> {
    const maxStorage = 50 * 1024 * 1024; // 50MB
    const maxAge = 90 * 24 * 60 * 60 * 1000; // 90 days
    
    if (this.store.storageUsed > maxStorage) {
      await this.cleanupBySize(maxStorage * 0.8); // Clean to 80% of limit
    }
    
    await this.cleanupByAge(maxAge);
  }

  /**
   * Cleanup old events by age
   */
  private async cleanupByAge(maxAge: number): Promise<void> {
    const cutoffTime = Date.now() - maxAge;
    const batchesToRemove: string[] = [];
    
    for (const batch of this.store.batches) {
      if (batch.createdAt < cutoffTime) {
        batchesToRemove.push(batch.id);
      }
    }
    
    for (const batchId of batchesToRemove) {
      await this.removeBatch(batchId);
    }
    
    if (batchesToRemove.length > 0) {
      console.log(`Cleaned up ${batchesToRemove.length} old batches`);
    }
  }

  /**
   * Cleanup events to reduce storage size
   */
  private async cleanupBySize(targetSize: number): Promise<void> {
    // Sort batches by age (oldest first)
    const sortedBatches = [...this.store.batches].sort((a, b) => a.createdAt - b.createdAt);
    
    let currentSize = this.store.storageUsed;
    const batchesToRemove: string[] = [];
    
    for (const batch of sortedBatches) {
      if (currentSize <= targetSize) break;
      
      batchesToRemove.push(batch.id);
      currentSize -= batch.size;
    }
    
    for (const batchId of batchesToRemove) {
      await this.removeBatch(batchId);
    }
    
    if (batchesToRemove.length > 0) {
      console.log(`Cleaned up ${batchesToRemove.length} batches to reduce storage size`);
    }
  }

  /**
   * Remove a batch from storage
   */
  private async removeBatch(batchId: string): Promise<void> {
    // Remove from memory
    this.store.batches = this.store.batches.filter(b => b.id !== batchId);
    
    // Remove from storage
    try {
      await storage.remove(`${this.storageKey}_batch_${batchId}`);
    } catch (error) {
      console.warn('Failed to remove batch from storage:', batchId, error);
    }
    
    // Remove from index
    const keysToRemove: string[] = [];
    for (const [eventId, indexEntry] of this.eventIndex) {
      if (indexEntry.batchId === batchId) {
        keysToRemove.push(eventId);
      }
    }
    
    for (const key of keysToRemove) {
      this.eventIndex.delete(key);
    }
    
    // Update storage stats
    await this.updateStorageStats();
  }

  /**
   * Load a specific batch
   */
  private async loadBatch(batchId: string): Promise<EventBatch | null> {
    try {
      const stored = await storage.get<{ batch?: EventBatch }>(`${this.storageKey}_batch_${batchId}`);
      return stored.batch || null;
    } catch (error) {
      console.warn('Failed to load batch:', batchId, error);
      return null;
    }
  }

  /**
   * Persist a batch to storage
   */
  private async persistBatch(batch: EventBatch): Promise<void> {
    try {
      await storage.set({
        [`${this.storageKey}_batch_${batch.id}`]: { batch }
      });
    } catch (error) {
      console.error('Failed to persist batch:', batch.id, error);
      throw error;
    }
  }

  /**
   * Load store from storage
   */
  private async loadStore(): Promise<void> {
    try {
      const stored = await storage.get<{ store?: ILocalEventStore }>(this.storageKey);
      if (stored.store) {
        this.store = { ...this.store, ...stored.store };
      }
    } catch (error) {
      console.warn('Failed to load store from storage:', error);
    }
  }

  /**
   * Save store to storage
   */
  private async saveStore(): Promise<void> {
    try {
      await storage.set({ [this.storageKey]: { store: this.store } });
    } catch (error) {
      console.error('Failed to save store to storage:', error);
    }
  }

  /**
   * Load event index from storage
   */
  private async loadEventIndex(): Promise<void> {
    try {
      const stored = await storage.get<{ index?: [string, any][] }>(this.indexKey);
      if (stored.index) {
        this.eventIndex = new Map(stored.index);
      }
    } catch (error) {
      console.warn('Failed to load event index:', error);
    }
  }

  /**
   * Save event index to storage
   */
  private async saveEventIndex(): Promise<void> {
    try {
      await storage.set({ 
        [this.indexKey]: { 
          index: Array.from(this.eventIndex.entries()) 
        } 
      });
    } catch (error) {
      console.error('Failed to save event index:', error);
    }
  }

  /**
   * Update storage statistics
   */
  private async updateStorageStats(): Promise<void> {
    const stats = await this.calculateStorageStats();
    this.store.storageUsed = stats.storageUsed;
    this.store.totalEvents = stats.totalEvents;
    
    try {
      await storage.set({ [this.statsKey]: stats });
    } catch (error) {
      console.error('Failed to save storage stats:', error);
    }
  }

  /**
   * Calculate current storage statistics
   */
  private async calculateStorageStats(): Promise<StorageStats> {
    let totalEvents = this.store.pendingEvents.length;
    let storageUsed = 0;
    let oldestEvent = Date.now();
    let newestEvent = 0;
    let totalCompressed = 0;
    let totalRaw = 0;

    for (const batch of this.store.batches) {
      totalEvents += batch.events.length;
      storageUsed += batch.size;
      
      if (batch.events.length > 0) {
        const batchOldest = Math.min(...batch.events.map(e => e.timestamp));
        const batchNewest = Math.max(...batch.events.map(e => e.timestamp));
        
        oldestEvent = Math.min(oldestEvent, batchOldest);
        newestEvent = Math.max(newestEvent, batchNewest);
      }
      
      if (batch.compressed) {
        totalCompressed += batch.size;
      }
      totalRaw += batch.size;
    }

    return {
      totalEvents,
      totalBatches: this.store.batches.length,
      storageUsed,
      oldestEvent,
      newestEvent,
      compressionRatio: totalRaw > 0 ? totalCompressed / totalRaw : 0
    };
  }

  /**
   * Setup periodic cleanup
   */
  private setupPeriodicCleanup(): void {
    // Cleanup every hour
    setInterval(async () => {
      try {
        await this.checkStorageLimits();
        await this.updateStorageStats();
      } catch (error) {
        console.error('Periodic cleanup failed:', error);
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Flush pending events to batch
   */
  async flush(): Promise<void> {
    await this.createBatch();
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    return this.calculateStorageStats();
  }

  /**
   * Clear all stored events
   */
  async clear(): Promise<void> {
    // Clear memory
    this.store.batches = [];
    this.store.pendingEvents = [];
    this.store.totalEvents = 0;
    this.store.storageUsed = 0;
    this.memoryCache.clear();
    this.eventIndex.clear();
    
    // Clear storage
    try {
      await storage.clear();
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.flush();
    await this.saveStore();
    await this.saveEventIndex();
    await this.updateStorageStats();
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: TrackingConfig): Promise<void> {
    this.config = newConfig;
    this.maxMemoryEvents = Math.max(500, newConfig.maxEventsInMemory || 1000);
  }

  /**
   * Utility methods
   */
  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }
}