/**
 * Timeline Core Module
 * High-performance virtual scrolling and data structures for timeline visualization
 */

// Main components
export { VirtualScrolling } from './VirtualScrolling';
export { TimelineVirtualScroll } from './TimelineVirtualScroll';

// Data structures
export { 
  TimelineDataManager, 
  createTimelineDataManager,
  sessionToTimelineItems
} from './TimelineDataStructures';

// Binary search utilities
export {
  binarySearch,
  binarySearchLeftmost,
  binarySearchRightmost,
  TimelineBinarySearchImpl,
  CachedTimelineSearch,
  calculateScrollPositionForTimestamp,
  calculateVisibleRangeForPosition,
  findNearestItemToPosition
} from './BinarySearch';

// Performance optimization
export {
  LRUCache,
  memoize,
  memoizeMethod,
  LazyLoader,
  TimelineMemoryManager,
  debounce,
  throttle,
  requestAnimationFramePromise,
  DOMBatcher,
  domBatcher
} from './PerformanceOptimization';

// Hooks
export { 
  usePerformanceMonitoring,
  useRenderTime,
  useEffectTime,
  useScrollPerformance
} from './hooks/usePerformanceMonitoring';

export {
  useMemoryManager,
  useBrowserMemoryMonitoring,
  useObjectMemoryTracking,
  useMemoryLeakDetection,
  checkMemoryPressure,
  getMemoryUsageMB
} from './hooks/useMemoryManager';

// Types
export type {
  // Virtual scrolling types
  VirtualScrollingProps,
  VirtualScrollingState,
  VirtualItem,
  VirtualItemRenderParams,
  
  // Timeline data types
  TimelineData,
  SearchIndex,
  TimelineFilter,
  TimelineSort,
  
  // Performance types
  PerformanceMetrics,
  PerformanceMonitor,
  MemoryManager,
  
  // Binary search types
  BinarySearchParams,
  BinarySearchResult,
  TimelineBinarySearch,
  
  // Memoization types
  MemoizationCache,
  MemoizedFunction,
  
  // Lazy loading types
  LazyLoadingConfig,
  LazyLoadingState,
  
  // Event types
  TimelineScrollEvent,
  TimelineSelectionEvent,
  TimelineFilterEvent,
  
  // Component types
  TimelineVirtualScrollProps,
  
  // Hook types
  UseVirtualScrolling,
  UseTimelineData,
  UsePerformanceMonitoring
} from './types';

// Constants
export const TIMELINE_CONSTANTS = {
  DEFAULT_ITEM_HEIGHT: 60,
  DEFAULT_OVERSCAN: 5,
  DEFAULT_MEMORY_LIMIT_MB: 100,
  DEFAULT_MAX_ITEMS: 10000,
  DEFAULT_CACHE_SIZE: 100,
  MIN_FRAME_TIME_MS: 16.67, // 60fps
  SCROLL_THROTTLE_MS: 16,
  MEMORY_CHECK_INTERVAL_MS: 5000,
  PERFORMANCE_UPDATE_INTERVAL_MS: 100
} as const;

// Utilities
export const TimelineUtils = {
  formatDuration: (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  },
  
  extractDomain: (url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  },
  
  calculateItemHeight: (content: string): number => {
    // Estimate height based on content length
    const baseHeight = 60;
    const extraHeight = Math.floor(content.length / 100) * 20;
    return Math.min(baseHeight + extraHeight, 150);
  },
  
  generateItemId: (type: string, timestamp: number, index?: number): string => {
    return `${type}-${timestamp}-${index || 0}`;
  },
  
  isValidTimelineItem: (item: any): boolean => {
    return (
      item &&
      typeof item.id === 'string' &&
      typeof item.type === 'string' &&
      typeof item.timestamp === 'number' &&
      typeof item.title === 'string' &&
      item.metadata &&
      typeof item.metadata === 'object'
    );
  }
};

// Default configurations
export const DEFAULT_TIMELINE_CONFIG = {
  virtualScrolling: {
    itemHeight: TIMELINE_CONSTANTS.DEFAULT_ITEM_HEIGHT,
    overscan: TIMELINE_CONSTANTS.DEFAULT_OVERSCAN,
    horizontal: false
  },
  
  performance: {
    enableMonitoring: true,
    memoryLimitMB: TIMELINE_CONSTANTS.DEFAULT_MEMORY_LIMIT_MB,
    maxItems: TIMELINE_CONSTANTS.DEFAULT_MAX_ITEMS,
    cacheSize: TIMELINE_CONSTANTS.DEFAULT_CACHE_SIZE
  },
  
  filtering: {
    searchDebounceMs: 300,
    maxSearchResults: 1000,
    enableTextSearch: true,
    enableDomainFilter: true,
    enableSessionFilter: true,
    enableDateFilter: true
  },
  
  rendering: {
    enableLazyLoading: true,
    batchSize: 50,
    renderTimeout: 5,
    enableMemoization: true
  }
} as const;