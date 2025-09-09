/**
 * Performance Optimization Utilities
 * Memoization, lazy loading, and memory management for timeline components
 */

import { 
  MemoizationCache, 
  MemoizedFunction, 
  LazyLoadingConfig,
  LazyLoadingState,
  MemoryManager
} from './types';

// =============================================================================
// MEMOIZATION UTILITIES
// =============================================================================

/**
 * LRU Cache implementation for memoization
 */
export class LRUCache<K, V> implements MemoizationCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;
  private accessOrder: K[];

  constructor(maxSize: number = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.accessOrder = [];
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    
    if (value !== undefined) {
      // Move to end (most recently used)
      this.moveToEnd(key);
    }
    
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this.moveToEnd(key);
    } else {
      if (this.cache.size >= this.maxSize) {
        this.evictLeastUsed();
      }
      
      this.cache.set(key, value);
      this.accessOrder.push(key);
    }
  }

  has(key: K): boolean {
    const exists = this.cache.has(key);
    if (exists) {
      this.moveToEnd(key);
    }
    return exists;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  size(): number {
    return this.cache.size;
  }

  evict(count: number = 1): void {
    for (let i = 0; i < count && this.accessOrder.length > 0; i++) {
      this.evictLeastUsed();
    }
  }

  private moveToEnd(key: K): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
      this.accessOrder.push(key);
    }
  }

  private evictLeastUsed(): void {
    const leastUsed = this.accessOrder.shift();
    if (leastUsed) {
      this.cache.delete(leastUsed);
    }
  }
}

/**
 * Create a memoized function with LRU cache
 */
export function memoize<Args extends any[], Return>(
  fn: (...args: Args) => Return,
  maxCacheSize: number = 100,
  keyGenerator?: (...args: Args) => string
): MemoizedFunction<Args, Return> {
  const cache = new LRUCache<string, Return>(maxCacheSize);
  
  const defaultKeyGenerator = (...args: Args): string => {
    return JSON.stringify(args);
  };
  
  const getKey = keyGenerator || defaultKeyGenerator;
  
  const memoizedFn = ((...args: Args): Return => {
    const key = getKey(...args);
    
    let result = cache.get(key);
    if (result === undefined) {
      result = fn(...args);
      cache.set(key, result);
    }
    
    return result;
  }) as MemoizedFunction<Args, Return>;
  
  memoizedFn.cache = cache;
  memoizedFn.clearCache = () => cache.clear();
  
  return memoizedFn;
}

/**
 * Memoization decorator for class methods
 */
export function memoizeMethod<T extends any[], R>(
  maxCacheSize: number = 100
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const cache = new LRUCache<string, R>(maxCacheSize);
    
    descriptor.value = function (...args: T): R {
      const key = JSON.stringify([this.constructor.name, propertyKey, args]);
      
      let result = cache.get(key);
      if (result === undefined) {
        result = originalMethod.apply(this, args);
        cache.set(key, result);
      }
      
      return result;
    };
    
    return descriptor;
  };
}

// =============================================================================
// LAZY LOADING UTILITIES
// =============================================================================

export class LazyLoader<T> {
  private config: LazyLoadingConfig;
  private state: LazyLoadingState;
  private dataProvider: (batchIndex: number) => Promise<T[]>;
  private loadedData: Map<number, T[]>;
  private loadPromises: Map<number, Promise<T[]>>;

  constructor(
    config: LazyLoadingConfig,
    dataProvider: (batchIndex: number) => Promise<T[]>
  ) {
    this.config = config;
    this.dataProvider = dataProvider;
    this.loadedData = new Map();
    this.loadPromises = new Map();
    
    this.state = {
      loadedBatches: new Set(),
      loadingBatches: new Set(),
      totalBatches: 0,
      currentBatch: 0,
      loadProgress: 0
    };
  }

  /**
   * Load a specific batch
   */
  async loadBatch(batchIndex: number): Promise<T[]> {
    // Return cached data if already loaded
    if (this.loadedData.has(batchIndex)) {
      return this.loadedData.get(batchIndex)!;
    }

    // Return existing promise if already loading
    if (this.loadPromises.has(batchIndex)) {
      return this.loadPromises.get(batchIndex)!;
    }

    // Start loading
    this.state.loadingBatches.add(batchIndex);
    
    const loadPromise = this.loadBatchData(batchIndex);
    this.loadPromises.set(batchIndex, loadPromise);

    try {
      const data = await loadPromise;
      this.loadedData.set(batchIndex, data);
      this.state.loadedBatches.add(batchIndex);
      
      // Clean up old batches if needed
      this.cleanupOldBatches();
      
      return data;
    } finally {
      this.state.loadingBatches.delete(batchIndex);
      this.loadPromises.delete(batchIndex);
      this.updateLoadProgress();
    }
  }

  /**
   * Load multiple batches
   */
  async loadBatches(batchIndices: number[]): Promise<T[][]> {
    const promises = batchIndices.map(index => this.loadBatch(index));
    return Promise.all(promises);
  }

  /**
   * Get items in a specific range
   */
  async getItemsInRange(startIndex: number, endIndex: number): Promise<T[]> {
    const startBatch = Math.floor(startIndex / this.config.batchSize);
    const endBatch = Math.floor(endIndex / this.config.batchSize);
    
    const batchIndices: number[] = [];
    for (let i = startBatch; i <= endBatch; i++) {
      batchIndices.push(i);
    }
    
    const batches = await this.loadBatches(batchIndices);
    const allItems = batches.flat();
    
    const rangeStart = startIndex % this.config.batchSize;
    const rangeEnd = rangeStart + (endIndex - startIndex) + 1;
    
    return allItems.slice(rangeStart, rangeEnd);
  }

  /**
   * Preload batches around current position
   */
  async preloadAroundBatch(currentBatch: number): Promise<void> {
    const preloadRange = 2; // Load 2 batches before and after
    const batchesToLoad: number[] = [];
    
    for (let i = -preloadRange; i <= preloadRange; i++) {
      const batchIndex = currentBatch + i;
      if (batchIndex >= 0 && batchIndex < this.state.totalBatches) {
        if (!this.state.loadedBatches.has(batchIndex) && 
            !this.state.loadingBatches.has(batchIndex)) {
          batchesToLoad.push(batchIndex);
        }
      }
    }
    
    // Load batches without waiting
    batchesToLoad.forEach(batchIndex => {
      this.loadBatch(batchIndex).catch(console.error);
    });
  }

  /**
   * Set total number of batches
   */
  setTotalBatches(total: number): void {
    this.state.totalBatches = total;
  }

  /**
   * Get current loading state
   */
  getState(): LazyLoadingState {
    return { ...this.state };
  }

  /**
   * Clear all loaded data
   */
  clear(): void {
    this.loadedData.clear();
    this.loadPromises.clear();
    this.state.loadedBatches.clear();
    this.state.loadingBatches.clear();
    this.state.loadProgress = 0;
  }

  private async loadBatchData(batchIndex: number): Promise<T[]> {
    // Add delay if configured
    if (this.config.loadDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.loadDelay));
    }
    
    return this.dataProvider(batchIndex);
  }

  private cleanupOldBatches(): void {
    const maxBatches = this.config.maxLoadedBatches;
    
    if (this.state.loadedBatches.size > maxBatches) {
      const batchArray = Array.from(this.state.loadedBatches);
      const batchesToRemove = batchArray.slice(0, -maxBatches);
      
      batchesToRemove.forEach(batchIndex => {
        this.loadedData.delete(batchIndex);
        this.state.loadedBatches.delete(batchIndex);
      });
    }
  }

  private updateLoadProgress(): void {
    if (this.state.totalBatches > 0) {
      this.state.loadProgress = this.state.loadedBatches.size / this.state.totalBatches;
    }
  }
}

// =============================================================================
// MEMORY MANAGEMENT
// =============================================================================

export class TimelineMemoryManager implements MemoryManager {
  public maxItems: number;
  public currentUsage: number;
  public maxMemoryMB: number;
  private items: WeakMap<object, number>;

  constructor(maxItems: number, maxMemoryMB: number) {
    this.maxItems = maxItems;
    this.maxMemoryMB = maxMemoryMB;
    this.currentUsage = 0;
    this.items = new WeakMap();
  }

  cleanup(): void {
    // Force garbage collection if available
    if (typeof (window as any).gc === 'function') {
      (window as any).gc();
    }
    
    // Update current usage
    this.updateMemoryUsage();
  }

  isMemoryLimitReached(): boolean {
    return this.currentUsage >= this.maxMemoryMB;
  }

  estimateItemMemory(item: any): number {
    // Rough estimation based on JSON string length
    try {
      const jsonString = JSON.stringify(item);
      // Assume 2 bytes per character (UTF-16) plus object overhead
      return (jsonString.length * 2 + 64) / (1024 * 1024); // Convert to MB
    } catch {
      return 0.001; // Default 1KB
    }
  }

  trackItem(item: object): void {
    const size = this.estimateItemMemory(item);
    this.items.set(item, size);
    this.currentUsage += size;
  }

  untrackItem(item: object): void {
    const size = this.items.get(item);
    if (size) {
      this.currentUsage -= size;
      this.items.delete(item);
    }
  }

  private updateMemoryUsage(): void {
    // Use Performance API if available
    if ('memory' in performance && (performance as any).memory) {
      const memInfo = (performance as any).memory;
      this.currentUsage = memInfo.usedJSHeapSize / (1024 * 1024); // Convert to MB
    }
  }
}

// =============================================================================
// PERFORMANCE UTILITIES
// =============================================================================

/**
 * Debounce utility for performance optimization
 */
export function debounce<T extends any[]>(
  func: (...args: T) => void,
  delay: number
): (...args: T) => void {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: T) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/**
 * Throttle utility for performance optimization
 */
export function throttle<T extends any[]>(
  func: (...args: T) => void,
  limit: number
): (...args: T) => void {
  let lastCall = 0;
  
  return (...args: T) => {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      func(...args);
    }
  };
}

/**
 * Request animation frame utility
 */
export function requestAnimationFramePromise(): Promise<number> {
  return new Promise(resolve => {
    requestAnimationFrame(resolve);
  });
}

/**
 * Batch DOM updates to minimize reflow
 */
export class DOMBatcher {
  private queue: (() => void)[] = [];
  private scheduled = false;

  add(fn: () => void): void {
    this.queue.push(fn);
    if (!this.scheduled) {
      this.scheduled = true;
      requestAnimationFrame(() => this.flush());
    }
  }

  private flush(): void {
    const tasks = this.queue.splice(0);
    tasks.forEach(task => task());
    this.scheduled = false;
  }
}

export const domBatcher = new DOMBatcher();