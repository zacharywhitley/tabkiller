/**
 * Data Utilities for Session Storage
 * Common utility functions for data processing, validation, and manipulation
 */

// =============================================================================
// CHECKSUM AND HASHING
// =============================================================================

/**
 * Calculate simple checksum for data integrity validation
 */
export function calculateChecksum(data: any): string {
  // Convert data to consistent string representation
  const serialized = JSON.stringify(data, Object.keys(data).sort());
  
  // Simple hash function (in production, use a cryptographic hash)
  let hash = 0;
  for (let i = 0; i < serialized.length; i++) {
    const char = serialized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Generate secure hash using Web Crypto API (when available)
 */
export async function calculateSecureHash(data: any): Promise<string> {
  const serialized = JSON.stringify(data, Object.keys(data).sort());
  
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(serialized);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.warn('Web Crypto API failed, falling back to simple checksum:', error);
    }
  }
  
  // Fallback to simple checksum
  return calculateChecksum(data);
}

// =============================================================================
// URL AND DOMAIN UTILITIES
// =============================================================================

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

/**
 * Extract root domain from hostname
 */
export function extractRootDomain(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  return hostname;
}

/**
 * Normalize URL for consistent storage
 */
export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    
    // Remove fragment and common tracking parameters
    urlObj.hash = '';
    
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', '_ga', '_gl', 'mc_cid', 'mc_eid'
    ];
    
    for (const param of trackingParams) {
      urlObj.searchParams.delete(param);
    }
    
    // Sort search parameters for consistency
    const params = Array.from(urlObj.searchParams.entries()).sort();
    urlObj.search = new URLSearchParams(params).toString();
    
    return urlObj.toString();
  } catch {
    return url; // Return original if parsing fails
  }
}

/**
 * Check if URL is valid
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract URL protocol
 */
export function extractProtocol(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol.replace(':', '');
  } catch {
    return null;
  }
}

// =============================================================================
// TIMESTAMP UTILITIES
// =============================================================================

/**
 * Validate timestamp
 */
export function isValidTimestamp(timestamp: number): boolean {
  return typeof timestamp === 'number' && 
         timestamp > 0 && 
         timestamp <= Date.now() + (24 * 60 * 60 * 1000); // Not more than 24 hours in future
}

/**
 * Get timestamp range for a day
 */
export function getDayRange(date: Date): { start: number; end: number } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  
  return {
    start: start.getTime(),
    end: end.getTime()
  };
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number, format: 'relative' | 'absolute' = 'relative'): string {
  const date = new Date(timestamp);
  const now = new Date();
  
  if (format === 'absolute') {
    return date.toLocaleString();
  }
  
  // Relative formatting
  const diffMs = now.getTime() - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSeconds < 60) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  } else {
    return date.toLocaleDateString();
  }
}

// =============================================================================
// DATA SIZE UTILITIES
// =============================================================================

/**
 * Calculate data size in bytes
 */
export function calculateDataSize(data: any): number {
  return new Blob([JSON.stringify(data)]).size;
}

/**
 * Format bytes as human readable string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Estimate object memory usage
 */
export function estimateMemoryUsage(obj: any): number {
  const seen = new WeakSet();
  
  function sizeof(obj: any): number {
    if (obj === null || obj === undefined) return 0;
    if (typeof obj === 'boolean') return 4;
    if (typeof obj === 'number') return 8;
    if (typeof obj === 'string') return obj.length * 2;
    
    if (typeof obj === 'object') {
      if (seen.has(obj)) return 0;
      seen.add(obj);
      
      let size = 0;
      if (Array.isArray(obj)) {
        size += obj.length * 8; // Array overhead
        for (const item of obj) {
          size += sizeof(item);
        }
      } else {
        size += Object.keys(obj).length * 8; // Object overhead
        for (const [key, value] of Object.entries(obj)) {
          size += key.length * 2; // Key string
          size += sizeof(value);
        }
      }
      return size;
    }
    
    return 0;
  }
  
  return sizeof(obj);
}

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Validate required fields in object
 */
export function validateRequiredFields(obj: any, requiredFields: string[]): string[] {
  const missing: string[] = [];
  
  for (const field of requiredFields) {
    if (!(field in obj) || obj[field] === null || obj[field] === undefined) {
      missing.push(field);
    }
  }
  
  return missing;
}

/**
 * Deep clone object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }
  
  const cloned = {} as T;
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  
  return cloned;
}

/**
 * Compare objects for equality
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  
  if (typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    
    return true;
  }
  
  return false;
}

// =============================================================================
// SANITIZATION UTILITIES
// =============================================================================

/**
 * Sanitize string for safe storage
 */
export function sanitizeString(str: string, maxLength: number = 1000): string {
  if (typeof str !== 'string') return '';
  
  // Remove control characters and normalize whitespace
  let sanitized = str.replace(/[\x00-\x1F\x7F]/g, '')
                     .replace(/\s+/g, ' ')
                     .trim();
  
  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength - 3) + '...';
  }
  
  return sanitized;
}

/**
 * Sanitize object for storage
 */
export function sanitizeObject(obj: any, options: {
  maxStringLength?: number;
  removeUndefined?: boolean;
  removeNull?: boolean;
  maxDepth?: number;
} = {}): any {
  const {
    maxStringLength = 1000,
    removeUndefined = true,
    removeNull = false,
    maxDepth = 10
  } = options;
  
  function sanitize(value: any, depth: number): any {
    if (depth > maxDepth) {
      return '[Max depth exceeded]';
    }
    
    if (value === null) {
      return removeNull ? undefined : null;
    }
    
    if (value === undefined) {
      return removeUndefined ? undefined : null;
    }
    
    if (typeof value === 'string') {
      return sanitizeString(value, maxStringLength);
    }
    
    if (typeof value === 'number') {
      return isFinite(value) ? value : null;
    }
    
    if (typeof value === 'boolean') {
      return value;
    }
    
    if (value instanceof Date) {
      return value.getTime();
    }
    
    if (Array.isArray(value)) {
      return value.map(item => sanitize(item, depth + 1))
                  .filter(item => item !== undefined);
    }
    
    if (typeof value === 'object') {
      const sanitized: any = {};
      for (const [key, val] of Object.entries(value)) {
        const sanitizedValue = sanitize(val, depth + 1);
        if (sanitizedValue !== undefined) {
          sanitized[key] = sanitizedValue;
        }
      }
      return sanitized;
    }
    
    return null;
  }
  
  return sanitize(obj, 0);
}

// =============================================================================
// ARRAY UTILITIES
// =============================================================================

/**
 * Remove duplicates from array
 */
export function uniqueArray<T>(array: T[], keyFn?: (item: T) => any): T[] {
  if (!keyFn) {
    return [...new Set(array)];
  }
  
  const seen = new Set();
  return array.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Chunk array into smaller arrays
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Sort array by multiple criteria
 */
export function multiSort<T>(
  array: T[], 
  sortFunctions: Array<(a: T, b: T) => number>
): T[] {
  return [...array].sort((a, b) => {
    for (const sortFn of sortFunctions) {
      const result = sortFn(a, b);
      if (result !== 0) return result;
    }
    return 0;
  });
}

// =============================================================================
// PERFORMANCE UTILITIES
// =============================================================================

/**
 * Simple performance timer
 */
export class PerformanceTimer {
  private startTime: number;
  private marks: Map<string, number> = new Map();
  
  constructor() {
    this.startTime = performance.now();
  }
  
  mark(name: string): void {
    this.marks.set(name, performance.now());
  }
  
  measure(name: string): number {
    const markTime = this.marks.get(name);
    if (!markTime) {
      throw new Error(`Mark '${name}' not found`);
    }
    return markTime - this.startTime;
  }
  
  elapsed(): number {
    return performance.now() - this.startTime;
  }
  
  reset(): void {
    this.startTime = performance.now();
    this.marks.clear();
  }
}

/**
 * Throttle function execution
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T, 
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: number | undefined;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        lastCall = Date.now();
        func(...args);
      }, delay - (now - lastCall));
    }
  };
}

/**
 * Debounce function execution
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T, 
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | undefined;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => func(...args), delay);
  };
}

// =============================================================================
// ERROR UTILITIES
// =============================================================================

/**
 * Create descriptive error with context
 */
export function createContextualError(
  message: string, 
  context: Record<string, any>, 
  originalError?: Error
): Error {
  const error = new Error(message);
  (error as any).context = context;
  if (originalError) {
    (error as any).originalError = originalError;
    error.stack = originalError.stack;
  }
  return error;
}

/**
 * Safe error conversion
 */
export function safeErrorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object') {
    return JSON.stringify(error);
  }
  return String(error);
}

// =============================================================================
// RETRY UTILITIES
// =============================================================================

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}