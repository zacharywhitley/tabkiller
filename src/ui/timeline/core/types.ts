/**
 * Timeline Core Types
 * Type definitions for high-performance timeline virtual scrolling
 */

import { HistoryTimelineItem, TimelineGroup } from '../../../shared/types';

// =============================================================================
// VIRTUAL SCROLLING TYPES
// =============================================================================

export interface VirtualScrollingProps {
  /** Total number of items */
  itemCount: number;
  /** Height of each item in pixels */
  itemHeight: number;
  /** Height of the scrolling container */
  containerHeight: number;
  /** Width of the scrolling container */
  containerWidth?: number;
  /** Render function for each item */
  renderItem: (params: VirtualItemRenderParams) => React.ReactNode;
  /** Optional overscan for smoother scrolling */
  overscan?: number;
  /** Scroll position change handler */
  onScroll?: (scrollTop: number) => void;
  /** Scroll to specific item */
  scrollToIndex?: number;
  /** Enable horizontal scrolling */
  horizontal?: boolean;
  /** Custom class name */
  className?: string;
}

export interface VirtualItemRenderParams {
  /** Index of the item */
  index: number;
  /** CSS style for positioning the item */
  style: React.CSSProperties;
  /** Whether this item is currently visible */
  isVisible: boolean;
  /** Item data if provided */
  data?: any;
}

export interface VirtualScrollingState {
  /** Current scroll position */
  scrollTop: number;
  /** Current scroll position (horizontal) */
  scrollLeft: number;
  /** Index of the first visible item */
  startIndex: number;
  /** Index of the last visible item */
  endIndex: number;
  /** Currently visible items */
  visibleItems: VirtualItem[];
  /** Whether scrolling is in progress */
  isScrolling: boolean;
  /** Last scroll timestamp for performance */
  lastScrollTime: number;
}

export interface VirtualItem {
  /** Item index */
  index: number;
  /** Top position */
  top: number;
  /** Left position */
  left: number;
  /** Item height */
  height: number;
  /** Item width */
  width: number;
  /** Whether item is visible */
  isVisible: boolean;
  /** Item data */
  data?: any;
}

// =============================================================================
// TIMELINE DATA TYPES
// =============================================================================

export interface TimelineData {
  /** All timeline items */
  items: HistoryTimelineItem[];
  /** Grouped items by date */
  groups: TimelineGroup[];
  /** Total count of items */
  totalCount: number;
  /** Date range of the data */
  dateRange: {
    start: number;
    end: number;
  };
  /** Index mapping for fast lookups */
  indexMap: Map<string, number>;
  /** Search index for filtering */
  searchIndex: SearchIndex;
}

export interface SearchIndex {
  /** Text search index */
  textIndex: Map<string, Set<number>>;
  /** Domain search index */
  domainIndex: Map<string, Set<number>>;
  /** Session search index */
  sessionIndex: Map<string, Set<number>>;
  /** Tag search index */
  tagIndex: Map<string, Set<number>>;
  /** Date range buckets */
  dateRangeIndex: Map<string, Set<number>>;
}

export interface TimelineFilter {
  /** Text search query */
  searchQuery?: string;
  /** Domains to filter by */
  domains?: string[];
  /** Sessions to filter by */
  sessionIds?: string[];
  /** Tags to filter by */
  tags?: string[];
  /** Date range filter */
  dateRange?: {
    start: number;
    end: number;
  };
  /** Item types to include */
  itemTypes?: HistoryTimelineItem['type'][];
}

export interface TimelineSort {
  /** Field to sort by */
  field: 'timestamp' | 'title' | 'domain' | 'sessionId';
  /** Sort order */
  order: 'asc' | 'desc';
}

// =============================================================================
// PERFORMANCE TYPES
// =============================================================================

export interface PerformanceMetrics {
  /** Frames per second */
  fps: number;
  /** Average frame time in ms */
  averageFrameTime: number;
  /** Memory usage in MB */
  memoryUsage: number;
  /** Number of rendered items */
  renderedItems: number;
  /** Total items in dataset */
  totalItems: number;
  /** Scroll events per second */
  scrollEventsPerSecond: number;
  /** Last measurement timestamp */
  timestamp: number;
}

export interface PerformanceMonitor {
  /** Start monitoring */
  start(): void;
  /** Stop monitoring */
  stop(): void;
  /** Get current metrics */
  getMetrics(): PerformanceMetrics;
  /** Add frame time measurement */
  recordFrameTime(frameTime: number): void;
  /** Update memory usage */
  updateMemoryUsage(usage: number): void;
  /** Record scroll event */
  recordScrollEvent(): void;
}

export interface MemoryManager {
  /** Maximum number of items to keep in memory */
  maxItems: number;
  /** Current memory usage estimation */
  currentUsage: number;
  /** Maximum memory usage in MB */
  maxMemoryMB: number;
  /** Clean up unused items */
  cleanup(): void;
  /** Check if memory limit is reached */
  isMemoryLimitReached(): boolean;
  /** Estimate memory usage of an item */
  estimateItemMemory(item: any): number;
}

// =============================================================================
// BINARY SEARCH TYPES
// =============================================================================

export interface BinarySearchParams {
  /** Array to search */
  array: any[];
  /** Target value */
  target: any;
  /** Comparison function */
  compareFn: (a: any, b: any) => number;
  /** Return insertion point if not found */
  returnInsertionPoint?: boolean;
}

export interface BinarySearchResult {
  /** Index of found item or -1 if not found */
  index: number;
  /** Whether item was found */
  found: boolean;
  /** Insertion point if not found */
  insertionPoint?: number;
}

export interface TimelineBinarySearch {
  /** Find item by timestamp */
  findByTimestamp(timestamp: number): BinarySearchResult;
  /** Find items in date range */
  findInDateRange(start: number, end: number): number[];
  /** Find item by ID */
  findById(id: string): BinarySearchResult;
  /** Find insertion point for new item */
  findInsertionPoint(item: HistoryTimelineItem): number;
}

// =============================================================================
// MEMOIZATION TYPES
// =============================================================================

export interface MemoizationCache<K, V> {
  /** Get value from cache */
  get(key: K): V | undefined;
  /** Set value in cache */
  set(key: K, value: V): void;
  /** Check if key exists */
  has(key: K): boolean;
  /** Clear cache */
  clear(): void;
  /** Get cache size */
  size(): number;
  /** Remove least recently used items */
  evict(count?: number): void;
}

export interface MemoizedFunction<Args extends any[], Return> {
  /** Original function */
  (...args: Args): Return;
  /** Cache instance */
  cache: MemoizationCache<string, Return>;
  /** Clear cache */
  clearCache(): void;
}

// =============================================================================
// LAZY LOADING TYPES
// =============================================================================

export interface LazyLoadingConfig {
  /** Number of items to load per batch */
  batchSize: number;
  /** Threshold for triggering next load */
  loadThreshold: number;
  /** Maximum number of batches to keep loaded */
  maxLoadedBatches: number;
  /** Delay before loading next batch */
  loadDelay: number;
}

export interface LazyLoadingState {
  /** Currently loaded batches */
  loadedBatches: Set<number>;
  /** Items being loaded */
  loadingBatches: Set<number>;
  /** Total number of batches */
  totalBatches: number;
  /** Current batch index */
  currentBatch: number;
  /** Load progress */
  loadProgress: number;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

export interface TimelineScrollEvent {
  /** Scroll position */
  scrollTop: number;
  /** Scroll direction */
  direction: 'up' | 'down';
  /** Scroll velocity in pixels per second */
  velocity: number;
  /** Whether user is actively scrolling */
  isUserScrolling: boolean;
  /** Timestamp */
  timestamp: number;
}

export interface TimelineSelectionEvent {
  /** Selected item indices */
  selectedIndices: number[];
  /** Selected items */
  selectedItems: HistoryTimelineItem[];
  /** Selection type */
  type: 'single' | 'multiple' | 'range';
  /** Timestamp */
  timestamp: number;
}

export interface TimelineFilterEvent {
  /** Applied filter */
  filter: TimelineFilter;
  /** Resulting item count */
  resultCount: number;
  /** Filter application time */
  filterTime: number;
  /** Timestamp */
  timestamp: number;
}

// =============================================================================
// COMPONENT TYPES
// =============================================================================

export interface TimelineVirtualScrollProps {
  /** Timeline data */
  data: TimelineData;
  /** Container dimensions */
  height: number;
  width?: number;
  /** Item height */
  itemHeight: number;
  /** Filter configuration */
  filter?: TimelineFilter;
  /** Sort configuration */
  sort?: TimelineSort;
  /** Performance monitoring enabled */
  enablePerformanceMonitoring?: boolean;
  /** Memory management enabled */
  enableMemoryManagement?: boolean;
  /** Selection mode */
  selectionMode?: 'none' | 'single' | 'multiple';
  /** Selected items */
  selectedItems?: string[];
  /** Event handlers */
  onItemSelect?: (item: HistoryTimelineItem) => void;
  onItemsSelect?: (items: HistoryTimelineItem[]) => void;
  onScroll?: (event: TimelineScrollEvent) => void;
  onFilter?: (event: TimelineFilterEvent) => void;
  /** Custom item renderer */
  renderItem?: (item: HistoryTimelineItem, index: number) => React.ReactNode;
  /** Loading state */
  loading?: boolean;
  /** Error state */
  error?: string;
}

// =============================================================================
// HOOK TYPES
// =============================================================================

export interface UseVirtualScrolling {
  /** Virtual scrolling state */
  state: VirtualScrollingState;
  /** Scroll to specific index */
  scrollToIndex: (index: number) => void;
  /** Scroll to specific position */
  scrollToPosition: (position: number) => void;
  /** Handle scroll event */
  handleScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  /** Get visible items */
  getVisibleItems: () => VirtualItem[];
  /** Performance metrics */
  performanceMetrics: PerformanceMetrics | null;
}

export interface UseTimelineData {
  /** Timeline data */
  data: TimelineData | null;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: string | null;
  /** Refresh data */
  refresh: () => Promise<void>;
  /** Apply filter */
  applyFilter: (filter: TimelineFilter) => void;
  /** Apply sort */
  applySort: (sort: TimelineSort) => void;
  /** Search items */
  search: (query: string) => HistoryTimelineItem[];
  /** Get item by ID */
  getItemById: (id: string) => HistoryTimelineItem | null;
}

export interface UsePerformanceMonitoring {
  /** Performance metrics */
  metrics: PerformanceMetrics;
  /** Start monitoring */
  startMonitoring: () => void;
  /** Stop monitoring */
  stopMonitoring: () => void;
  /** Record frame */
  recordFrame: () => void;
  /** Is monitoring active */
  isMonitoring: boolean;
}