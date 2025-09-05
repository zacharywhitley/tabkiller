/**
 * Memory management system with connection pooling and cache optimization
 * Implements LRU cache, connection pooling, and memory leak prevention
 */

export interface CacheEntry<T = any> {
  value: T;
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  ttl?: number;
}

export interface ConnectionPoolOptions {
  maxConnections: number;
  idleTimeout: number;
  connectionTimeout: number;
  maxRetries: number;
}

export interface MemoryManagerOptions {
  maxCacheSize: number;
  defaultTTL: number;
  gcInterval: number;
  memoryThreshold: number;
}

/**
 * LRU Cache with TTL support
 */
export class LRUCache<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize: number = 1000, defaultTTL: number = 300000) { // 5 minutes default
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return undefined;
    }

    // Update access information
    entry.lastAccessed = Date.now();
    entry.accessCount++;

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      value,
      timestamp: now,
      lastAccessed: now,
      accessCount: 1,
      ttl: ttl || this.defaultTTL
    };

    // Remove if exists
    this.cache.delete(key);

    // Add new entry
    this.cache.set(key, entry);

    // Evict if over capacity
    if (this.cache.size > this.maxSize) {
      this.evictLRU();
    }
  }

  /**
   * Delete from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    memoryUsage: number;
  } {
    const entries = Array.from(this.cache.values());
    const totalAccesses = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    const memoryUsage = this.estimateMemoryUsage();

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: totalAccesses > 0 ? (totalAccesses / this.cache.size) : 0,
      memoryUsage
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    let cleanedCount = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      cleanedCount++;
    });

    return cleanedCount;
  }

  /**
   * Check if entry has expired
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    if (!entry.ttl) return false;
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.cache.delete(firstKey);
    }
  }

  /**
   * Estimate memory usage (rough calculation)
   */
  private estimateMemoryUsage(): number {
    let size = 0;
    for (const [key, entry] of this.cache.entries()) {
      size += key.length * 2; // String characters are 2 bytes
      size += JSON.stringify(entry).length * 2; // Rough estimate
    }
    return size;
  }
}

/**
 * Connection Pool for database connections
 */
export class ConnectionPool<T> {
  private connections: T[] = [];
  private activeConnections: Set<T> = new Set();
  private options: ConnectionPoolOptions;
  private createConnection: () => Promise<T>;
  private validateConnection: (connection: T) => Promise<boolean>;
  private destroyConnection: (connection: T) => Promise<void>;

  constructor(
    createConnection: () => Promise<T>,
    validateConnection: (connection: T) => Promise<boolean>,
    destroyConnection: (connection: T) => Promise<void>,
    options: Partial<ConnectionPoolOptions> = {}
  ) {
    this.createConnection = createConnection;
    this.validateConnection = validateConnection;
    this.destroyConnection = destroyConnection;
    this.options = {
      maxConnections: 10,
      idleTimeout: 300000, // 5 minutes
      connectionTimeout: 30000, // 30 seconds
      maxRetries: 3,
      ...options
    };

    this.startIdleConnectionCleanup();
  }

  /**
   * Acquire a connection from the pool
   */
  async acquire(): Promise<T> {
    // Try to get an existing connection
    for (let i = 0; i < this.connections.length; i++) {
      const connection = this.connections[i];
      if (!this.activeConnections.has(connection)) {
        try {
          const isValid = await this.validateConnection(connection);
          if (isValid) {
            this.activeConnections.add(connection);
            return connection;
          } else {
            // Remove invalid connection
            this.connections.splice(i, 1);
            await this.destroyConnection(connection);
            i--;
          }
        } catch (error) {
          console.warn('Connection validation failed:', error);
          this.connections.splice(i, 1);
          i--;
        }
      }
    }

    // Create new connection if under limit
    if (this.connections.length < this.options.maxConnections) {
      try {
        const connection = await this.createConnection();
        this.connections.push(connection);
        this.activeConnections.add(connection);
        return connection;
      } catch (error) {
        throw new Error(`Failed to create connection: ${error}`);
      }
    }

    // Wait for a connection to be released
    return this.waitForConnection();
  }

  /**
   * Release a connection back to the pool
   */
  release(connection: T): void {
    this.activeConnections.delete(connection);
  }

  /**
   * Close all connections and clean up pool
   */
  async close(): Promise<void> {
    const connections = [...this.connections];
    this.connections = [];
    this.activeConnections.clear();

    await Promise.all(
      connections.map(connection => this.destroyConnection(connection))
    );
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    maxConnections: number;
  } {
    return {
      totalConnections: this.connections.length,
      activeConnections: this.activeConnections.size,
      idleConnections: this.connections.length - this.activeConnections.size,
      maxConnections: this.options.maxConnections
    };
  }

  /**
   * Wait for a connection to become available
   */
  private async waitForConnection(): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.options.connectionTimeout);

      const checkForConnection = () => {
        for (const connection of this.connections) {
          if (!this.activeConnections.has(connection)) {
            clearTimeout(timeout);
            this.activeConnections.add(connection);
            resolve(connection);
            return;
          }
        }

        // Check again after a short delay
        setTimeout(checkForConnection, 100);
      };

      checkForConnection();
    });
  }

  /**
   * Clean up idle connections periodically
   */
  private startIdleConnectionCleanup(): void {
    setInterval(async () => {
      const connectionsToRemove: T[] = [];

      for (const connection of this.connections) {
        if (!this.activeConnections.has(connection)) {
          try {
            const isValid = await this.validateConnection(connection);
            if (!isValid) {
              connectionsToRemove.push(connection);
            }
          } catch (error) {
            connectionsToRemove.push(connection);
          }
        }
      }

      for (const connection of connectionsToRemove) {
        const index = this.connections.indexOf(connection);
        if (index > -1) {
          this.connections.splice(index, 1);
          await this.destroyConnection(connection);
        }
      }
    }, this.options.idleTimeout);
  }
}

/**
 * Memory Manager coordinating all memory management features
 */
export class MemoryManager {
  private caches: Map<string, LRUCache> = new Map();
  private connectionPools: Map<string, ConnectionPool<any>> = new Map();
  private eventListeners: Map<string, Array<{ element: EventTarget; event: string; handler: EventListener }>> = new Map();
  private options: MemoryManagerOptions;
  private gcInterval?: ReturnType<typeof setInterval>;

  constructor(options: Partial<MemoryManagerOptions> = {}) {
    this.options = {
      maxCacheSize: 1000,
      defaultTTL: 300000, // 5 minutes
      gcInterval: 60000, // 1 minute
      memoryThreshold: 50 * 1024 * 1024, // 50MB
      ...options
    };

    this.startGarbageCollection();
  }

  /**
   * Create or get a cache
   */
  getCache<T>(name: string, maxSize?: number, defaultTTL?: number): LRUCache<T> {
    if (!this.caches.has(name)) {
      this.caches.set(
        name,
        new LRUCache<T>(
          maxSize || this.options.maxCacheSize,
          defaultTTL || this.options.defaultTTL
        )
      );
    }
    return this.caches.get(name)! as LRUCache<T>;
  }

  /**
   * Create or get a connection pool
   */
  getConnectionPool<T>(
    name: string,
    createConnection: () => Promise<T>,
    validateConnection: (connection: T) => Promise<boolean>,
    destroyConnection: (connection: T) => Promise<void>,
    options?: Partial<ConnectionPoolOptions>
  ): ConnectionPool<T> {
    if (!this.connectionPools.has(name)) {
      this.connectionPools.set(
        name,
        new ConnectionPool<T>(createConnection, validateConnection, destroyConnection, options)
      );
    }
    return this.connectionPools.get(name)! as ConnectionPool<T>;
  }

  /**
   * Register event listener for automatic cleanup
   */
  addEventListener(
    context: string,
    element: EventTarget,
    event: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void {
    element.addEventListener(event, handler, options);

    if (!this.eventListeners.has(context)) {
      this.eventListeners.set(context, []);
    }

    this.eventListeners.get(context)!.push({ element, event, handler });
  }

  /**
   * Remove all event listeners for a context
   */
  removeEventListeners(context: string): void {
    const listeners = this.eventListeners.get(context);
    if (!listeners) return;

    for (const { element, event, handler } of listeners) {
      element.removeEventListener(event, handler);
    }

    this.eventListeners.delete(context);
  }

  /**
   * Force garbage collection cycle
   */
  async forceGarbageCollection(): Promise<{
    cachesCleanedUp: number;
    listenersRemoved: number;
    memoryFreed: number;
  }> {
    let cachesCleanedUp = 0;
    let listenersRemoved = 0;
    let memoryFreed = 0;

    // Clean up caches
    for (const [name, cache] of this.caches.entries()) {
      const beforeSize = cache.getStats().memoryUsage;
      const cleaned = cache.cleanup();
      const afterSize = cache.getStats().memoryUsage;
      
      cachesCleanedUp += cleaned;
      memoryFreed += beforeSize - afterSize;
    }

    // Remove orphaned event listeners (simplified check)
    const currentMemory = this.getCurrentMemoryUsage();
    if (currentMemory > this.options.memoryThreshold) {
      // Remove oldest event listener contexts
      const contexts = Array.from(this.eventListeners.keys());
      const contextsToRemove = contexts.slice(0, Math.floor(contexts.length / 4));
      
      for (const context of contextsToRemove) {
        const listeners = this.eventListeners.get(context);
        if (listeners) {
          listenersRemoved += listeners.length;
          this.removeEventListeners(context);
        }
      }
    }

    // Trigger browser garbage collection if available
    if (typeof globalThis !== 'undefined' && 'gc' in globalThis) {
      try {
        (globalThis as any).gc();
      } catch (error) {
        // gc() might not be available
      }
    }

    return { cachesCleanedUp, listenersRemoved, memoryFreed };
  }

  /**
   * Get memory manager statistics
   */
  getStats(): {
    caches: Array<{ name: string; stats: any }>;
    connectionPools: Array<{ name: string; stats: any }>;
    eventListeners: number;
    totalMemoryUsage: number;
  } {
    const caches = Array.from(this.caches.entries()).map(([name, cache]) => ({
      name,
      stats: cache.getStats()
    }));

    const connectionPools = Array.from(this.connectionPools.entries()).map(([name, pool]) => ({
      name,
      stats: pool.getStats()
    }));

    const eventListenersCount = Array.from(this.eventListeners.values())
      .reduce((total, listeners) => total + listeners.length, 0);

    const totalMemoryUsage = caches.reduce(
      (total, { stats }) => total + stats.memoryUsage,
      0
    ) + this.getCurrentMemoryUsage();

    return {
      caches,
      connectionPools,
      eventListeners: eventListenersCount,
      totalMemoryUsage
    };
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    // Stop garbage collection
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }

    // Clear all caches
    for (const cache of this.caches.values()) {
      cache.clear();
    }
    this.caches.clear();

    // Close all connection pools
    for (const pool of this.connectionPools.values()) {
      await pool.close();
    }
    this.connectionPools.clear();

    // Remove all event listeners
    for (const context of this.eventListeners.keys()) {
      this.removeEventListeners(context);
    }
  }

  /**
   * Get current memory usage
   */
  private getCurrentMemoryUsage(): number {
    if (typeof performance !== 'undefined' && performance.memory) {
      return performance.memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * Start automatic garbage collection
   */
  private startGarbageCollection(): void {
    this.gcInterval = setInterval(async () => {
      const currentMemory = this.getCurrentMemoryUsage();
      
      // Only run GC if memory usage is above threshold
      if (currentMemory > this.options.memoryThreshold) {
        await this.forceGarbageCollection();
      } else {
        // Light cleanup - just expired cache entries
        for (const cache of this.caches.values()) {
          cache.cleanup();
        }
      }
    }, this.options.gcInterval);
  }
}

/**
 * Global memory manager instance
 */
export const memoryManager = new MemoryManager();

/**
 * Utility functions for memory management
 */
export function withMemoryManagement<T>(
  context: string,
  fn: (manager: MemoryManager) => Promise<T>
): Promise<T> {
  return fn(memoryManager).finally(() => {
    // Clean up context-specific resources
    memoryManager.removeEventListeners(context);
  });
}

/**
 * Decorator for automatic memory cleanup
 */
export function memoryManaged(context: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      try {
        return await method.apply(this, args);
      } finally {
        memoryManager.removeEventListeners(context);
      }
    };
  };
}