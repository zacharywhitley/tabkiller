/**
 * Binary Search Utilities for Timeline Navigation
 * Optimized for fast position lookup in large datasets
 */

import { 
  BinarySearchParams, 
  BinarySearchResult, 
  TimelineBinarySearch 
} from './types';
import { HistoryTimelineItem } from '../../../shared/types';

// =============================================================================
// GENERIC BINARY SEARCH
// =============================================================================

/**
 * Generic binary search implementation
 * O(log n) time complexity for sorted arrays
 */
export function binarySearch<T>(params: BinarySearchParams): BinarySearchResult {
  const { array, target, compareFn, returnInsertionPoint = false } = params;
  
  let left = 0;
  let right = array.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const comparison = compareFn(array[mid], target);
    
    if (comparison === 0) {
      return { index: mid, found: true };
    } else if (comparison < 0) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  // Item not found
  const result: BinarySearchResult = { index: -1, found: false };
  
  if (returnInsertionPoint) {
    result.insertionPoint = left;
  }
  
  return result;
}

/**
 * Find the leftmost occurrence of a value
 * Useful for range queries
 */
export function binarySearchLeftmost<T>(
  array: T[], 
  target: T, 
  compareFn: (a: T, b: T) => number
): number {
  let left = 0;
  let right = array.length - 1;
  let result = -1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const comparison = compareFn(array[mid], target);
    
    if (comparison >= 0) {
      if (comparison === 0) {
        result = mid;
      }
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  
  return result;
}

/**
 * Find the rightmost occurrence of a value
 * Useful for range queries
 */
export function binarySearchRightmost<T>(
  array: T[], 
  target: T, 
  compareFn: (a: T, b: T) => number
): number {
  let left = 0;
  let right = array.length - 1;
  let result = -1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const comparison = compareFn(array[mid], target);
    
    if (comparison <= 0) {
      if (comparison === 0) {
        result = mid;
      }
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  return result;
}

// =============================================================================
// TIMELINE-SPECIFIC BINARY SEARCH
// =============================================================================

export class TimelineBinarySearchImpl implements TimelineBinarySearch {
  private items: HistoryTimelineItem[];
  private indexMap: Map<string, number>;

  constructor(items: HistoryTimelineItem[]) {
    // Sort items by timestamp for binary search
    this.items = [...items].sort((a, b) => a.timestamp - b.timestamp);
    
    // Build ID to index mapping
    this.indexMap = new Map();
    this.items.forEach((item, index) => {
      this.indexMap.set(item.id, index);
    });
  }

  /**
   * Find item by timestamp using binary search
   * O(log n) time complexity
   */
  findByTimestamp(timestamp: number): BinarySearchResult {
    return binarySearch({
      array: this.items,
      target: { timestamp } as HistoryTimelineItem,
      compareFn: (a, b) => a.timestamp - b.timestamp,
      returnInsertionPoint: true
    });
  }

  /**
   * Find all items in a date range
   * Returns indices of items within the range
   */
  findInDateRange(start: number, end: number): number[] {
    const startIndex = binarySearchLeftmost(
      this.items,
      { timestamp: start } as HistoryTimelineItem,
      (a, b) => a.timestamp - b.timestamp
    );

    if (startIndex === -1) {
      return [];
    }

    const endIndex = binarySearchRightmost(
      this.items,
      { timestamp: end } as HistoryTimelineItem,
      (a, b) => a.timestamp - b.timestamp
    );

    if (endIndex === -1) {
      return [];
    }

    const indices: number[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      indices.push(i);
    }

    return indices;
  }

  /**
   * Find item by ID using hash map lookup
   * O(1) time complexity
   */
  findById(id: string): BinarySearchResult {
    const index = this.indexMap.get(id);
    
    if (index !== undefined) {
      return { index, found: true };
    }
    
    return { index: -1, found: false };
  }

  /**
   * Find insertion point for a new item
   * Maintains sorted order by timestamp
   */
  findInsertionPoint(item: HistoryTimelineItem): number {
    const result = binarySearch({
      array: this.items,
      target: item,
      compareFn: (a, b) => a.timestamp - b.timestamp,
      returnInsertionPoint: true
    });

    return result.insertionPoint ?? this.items.length;
  }

  /**
   * Get items in a specific range by indices
   */
  getItemsInRange(startIndex: number, endIndex: number): HistoryTimelineItem[] {
    const safeStart = Math.max(0, startIndex);
    const safeEnd = Math.min(this.items.length - 1, endIndex);
    
    return this.items.slice(safeStart, safeEnd + 1);
  }

  /**
   * Update the search index when items change
   */
  updateItems(items: HistoryTimelineItem[]): void {
    this.items = [...items].sort((a, b) => a.timestamp - b.timestamp);
    
    this.indexMap.clear();
    this.items.forEach((item, index) => {
      this.indexMap.set(item.id, index);
    });
  }

  /**
   * Get total number of items
   */
  getItemCount(): number {
    return this.items.length;
  }

  /**
   * Get item at specific index
   */
  getItemAtIndex(index: number): HistoryTimelineItem | null {
    if (index >= 0 && index < this.items.length) {
      return this.items[index];
    }
    return null;
  }
}

// =============================================================================
// POSITION LOOKUP UTILITIES
// =============================================================================

/**
 * Calculate scroll position for a specific timestamp
 */
export function calculateScrollPositionForTimestamp(
  timestamp: number,
  items: HistoryTimelineItem[],
  itemHeight: number
): number {
  const search = new TimelineBinarySearchImpl(items);
  const result = search.findByTimestamp(timestamp);
  
  if (result.found) {
    return result.index * itemHeight;
  } else if (result.insertionPoint !== undefined) {
    return result.insertionPoint * itemHeight;
  }
  
  return 0;
}

/**
 * Calculate visible range for a scroll position
 */
export function calculateVisibleRangeForPosition(
  scrollTop: number,
  containerHeight: number,
  itemHeight: number,
  totalItems: number,
  overscan = 5
): { startIndex: number; endIndex: number; visibleCount: number } {
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const endIndex = Math.min(totalItems - 1, startIndex + visibleCount + (overscan * 2));
  
  return {
    startIndex,
    endIndex,
    visibleCount: endIndex - startIndex + 1
  };
}

/**
 * Find nearest item to a specific position
 */
export function findNearestItemToPosition(
  scrollTop: number,
  itemHeight: number
): { index: number; offset: number } {
  const index = Math.floor(scrollTop / itemHeight);
  const offset = scrollTop % itemHeight;
  
  return { index, offset };
}

// =============================================================================
// PERFORMANCE OPTIMIZED SEARCH
// =============================================================================

/**
 * Cached binary search for repeated queries
 */
export class CachedTimelineSearch {
  private search: TimelineBinarySearchImpl;
  private cache: Map<string, BinarySearchResult>;
  private maxCacheSize: number;

  constructor(items: HistoryTimelineItem[], maxCacheSize = 1000) {
    this.search = new TimelineBinarySearchImpl(items);
    this.cache = new Map();
    this.maxCacheSize = maxCacheSize;
  }

  findByTimestamp(timestamp: number): BinarySearchResult {
    const key = `timestamp:${timestamp}`;
    
    let result = this.cache.get(key);
    if (!result) {
      result = this.search.findByTimestamp(timestamp);
      this.setCachedResult(key, result);
    }
    
    return result;
  }

  findById(id: string): BinarySearchResult {
    const key = `id:${id}`;
    
    let result = this.cache.get(key);
    if (!result) {
      result = this.search.findById(id);
      this.setCachedResult(key, result);
    }
    
    return result;
  }

  findInDateRange(start: number, end: number): number[] {
    return this.search.findInDateRange(start, end);
  }

  private setCachedResult(key: string, result: BinarySearchResult): void {
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entries (simple LRU)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, result);
  }

  clearCache(): void {
    this.cache.clear();
  }

  updateItems(items: HistoryTimelineItem[]): void {
    this.search.updateItems(items);
    this.clearCache();
  }
}