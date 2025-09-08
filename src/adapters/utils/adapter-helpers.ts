/**
 * Utility functions for the adapter system
 * Provides common functionality for error handling, caching, and feature detection
 */

import { 
  AdapterResult, 
  BrowserAdapterError, 
  UnsupportedFeatureError, 
  BrowserType 
} from '../interfaces/base';

/**
 * Wrapper for operations that may fail gracefully
 */
export async function wrapWithFallback<T>(
  operation: () => Promise<T>,
  fallback: () => Promise<T>,
  feature: string,
  browserType: BrowserType
): Promise<AdapterResult<T>> {
  try {
    const result = await operation();
    return { success: true, data: result };
  } catch (error) {
    console.warn(`Feature '${feature}' failed in ${browserType}, attempting fallback:`, error);
    
    try {
      const fallbackResult = await fallback();
      return { 
        success: false, 
        error: new BrowserAdapterError(
          `Primary operation failed, fallback succeeded`,
          browserType,
          error instanceof Error ? error : new Error(String(error))
        ),
        fallbackData: fallbackResult 
      };
    } catch (fallbackError) {
      return { 
        success: false, 
        error: new BrowserAdapterError(
          `Both primary operation and fallback failed for feature '${feature}'`,
          browserType,
          fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError))
        )
      };
    }
  }
}

/**
 * Wrapper for operations that should throw on unsupported features
 */
export async function wrapWithUnsupportedError<T>(
  operation: () => Promise<T>,
  feature: string,
  browserType: BrowserType,
  isSupported: boolean
): Promise<AdapterResult<T>> {
  if (!isSupported) {
    return {
      success: false,
      error: new UnsupportedFeatureError(feature, browserType)
    };
  }

  try {
    const result = await operation();
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: new BrowserAdapterError(
        `Operation failed for feature '${feature}'`,
        browserType,
        error instanceof Error ? error : new Error(String(error))
      )
    };
  }
}

/**
 * Simple cache for adapter results
 */
export class AdapterCache<T> {
  private cache = new Map<string, { data: T; timestamp: number; ttl: number }>();

  constructor(private defaultTtl: number = 5000) {}

  set(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTtl
    });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    // Clean expired entries first
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
    return this.cache.size;
  }
}

/**
 * Retry mechanism for unstable operations
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000,
  backoffMultiplier: number = 2
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxAttempts) {
        break;
      }
      
      // Wait before retrying with exponential backoff
      await new Promise(resolve => 
        setTimeout(resolve, delay * Math.pow(backoffMultiplier, attempt - 1))
      );
    }
  }
  
  throw new Error(`Operation failed after ${maxAttempts} attempts: ${lastError!.message}`);
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | null = null;
  let lastExecTime = 0;
  
  return (...args: Parameters<T>) => {
    const currentTime = Date.now();
    
    if (currentTime - lastExecTime > delay) {
      lastExecTime = currentTime;
      func.apply(null, args);
    } else if (timeoutId === null) {
      timeoutId = window.setTimeout(() => {
        lastExecTime = Date.now();
        func.apply(null, args);
        timeoutId = null;
      }, delay - (currentTime - lastExecTime));
    }
  };
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = window.setTimeout(() => {
      func.apply(null, args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Event listener manager for cleanup
 */
export class EventListenerManager {
  private listeners: Array<{
    target: any;
    event: string;
    handler: (...args: any[]) => void;
    options?: AddEventListenerOptions;
  }> = [];

  add<T>(
    target: { addListener: (handler: (details: T) => void) => void },
    handler: (details: T) => void
  ): void;
  add(
    target: EventTarget,
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions
  ): void;
  add(target: any, eventOrHandler: string | Function, handler?: any, options?: AddEventListenerOptions): void {
    if (typeof eventOrHandler === 'string') {
      // Standard EventTarget
      const event = eventOrHandler;
      target.addEventListener(event, handler, options);
      this.listeners.push({ target, event, handler, options });
    } else {
      // WebExtension event
      const eventHandler = eventOrHandler;
      target.addListener(eventHandler);
      this.listeners.push({ target, event: 'addListener', handler: eventHandler });
    }
  }

  remove<T>(
    target: { removeListener: (handler: (details: T) => void) => void },
    handler: (details: T) => void
  ): void;
  remove(
    target: EventTarget,
    event: string,
    handler: EventListener
  ): void;
  remove(target: any, eventOrHandler: string | Function, handler?: any): void {
    if (typeof eventOrHandler === 'string') {
      // Standard EventTarget
      const event = eventOrHandler;
      target.removeEventListener(event, handler);
      this.listeners = this.listeners.filter(
        l => l.target !== target || l.event !== event || l.handler !== handler
      );
    } else {
      // WebExtension event
      const eventHandler = eventOrHandler;
      target.removeListener(eventHandler);
      this.listeners = this.listeners.filter(
        l => l.target !== target || l.handler !== eventHandler
      );
    }
  }

  removeAll(): void {
    for (const { target, event, handler } of this.listeners) {
      try {
        if (event === 'addListener') {
          target.removeListener(handler);
        } else {
          target.removeEventListener(event, handler);
        }
      } catch (error) {
        console.warn('Error removing event listener:', error);
      }
    }
    this.listeners.length = 0;
  }

  getListenerCount(): number {
    return this.listeners.length;
  }
}

/**
 * Generic batch processor for operations
 */
export async function processBatch<TInput, TOutput>(
  items: TInput[],
  processor: (item: TInput) => Promise<TOutput>,
  options: {
    batchSize?: number;
    concurrency?: number;
    continueOnError?: boolean;
  } = {}
): Promise<Array<{ success: boolean; result?: TOutput; error?: Error; input: TInput }>> {
  const { batchSize = 10, concurrency = 5, continueOnError = true } = options;
  const results: Array<{ success: boolean; result?: TOutput; error?: Error; input: TInput }> = [];

  // Process in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    // Process batch with limited concurrency
    const batchPromises = batch.map(async (item) => {
      try {
        const result = await processor(item);
        return { success: true, result, input: item };
      } catch (error) {
        const errorResult = {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          input: item
        };
        
        if (!continueOnError) {
          throw errorResult;
        }
        
        return errorResult;
      }
    });

    // Limit concurrency within the batch
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Measure execution time of operations
 */
export async function measureTime<T>(
  operation: () => Promise<T>,
  label?: string
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  
  try {
    const result = await operation();
    const duration = performance.now() - start;
    
    if (label) {
      console.debug(`${label} completed in ${duration.toFixed(2)}ms`);
    }
    
    return { result, duration };
  } catch (error) {
    const duration = performance.now() - start;
    
    if (label) {
      console.debug(`${label} failed after ${duration.toFixed(2)}ms:`, error);
    }
    
    throw error;
  }
}

/**
 * Deep clone utility for objects
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const cloned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }

  return obj;
}

/**
 * Safe JSON parsing with fallback
 */
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}

/**
 * Generate unique identifiers
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}-${timestamp}-${randomPart}` : `${timestamp}-${randomPart}`;
}

/**
 * Type guard for checking if a value is defined
 */
export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

/**
 * Create a promise that resolves after a delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}