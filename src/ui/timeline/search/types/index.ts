/**
 * Search, Filtering, and Navigation Types for Timeline
 * Comprehensive type definitions for the search and filtering system
 */

import { HistoryTimelineItem, TimelineGroup, SessionTag } from '../../../../shared/types';
import { TimelineFilter, TimelineSort } from '../../core/types';

// =============================================================================
// SEARCH INDEX TYPES
// =============================================================================

export interface SearchIndex {
  /** Inverted index for text search */
  textIndex: Map<string, Set<number>>;
  /** Domain-based index */
  domainIndex: Map<string, Set<number>>;
  /** Session ID index */
  sessionIndex: Map<string, Set<number>>;
  /** Tag-based index */
  tagIndex: Map<string, Set<number>>;
  /** Date range buckets for efficient date filtering */
  dateIndex: Map<string, Set<number>>;
  /** Combined metadata index */
  metadataIndex: Map<string, Set<number>>;
  /** Full-text search tokens */
  tokenIndex: Map<string, TokenInfo>;
  /** Last update timestamp */
  lastUpdated: number;
}

export interface TokenInfo {
  /** Token string */
  token: string;
  /** Document frequency */
  frequency: number;
  /** Item indices containing this token */
  itemIndices: Set<number>;
  /** Position data for highlighting */
  positions: Map<number, number[]>;
}

export interface SearchIndexBuilder {
  /** Build index from timeline items */
  buildIndex(items: HistoryTimelineItem[]): Promise<SearchIndex>;
  /** Update index incrementally */
  updateIndex(index: SearchIndex, items: HistoryTimelineItem[]): Promise<SearchIndex>;
  /** Remove items from index */
  removeFromIndex(index: SearchIndex, itemIds: string[]): Promise<SearchIndex>;
  /** Clear and rebuild entire index */
  rebuildIndex(items: HistoryTimelineItem[]): Promise<SearchIndex>;
}

// =============================================================================
// SEARCH QUERY TYPES
// =============================================================================

export interface SearchQuery {
  /** Text search terms */
  text?: string;
  /** Exact phrase search */
  phrase?: string;
  /** Boolean search operators (AND, OR, NOT) */
  boolean?: BooleanQuery;
  /** Wildcard pattern */
  wildcard?: string;
  /** Regular expression */
  regex?: string;
  /** Search in specific fields */
  fields?: SearchField[];
}

export interface BooleanQuery {
  /** AND terms */
  and?: string[];
  /** OR terms */  
  or?: string[];
  /** NOT terms */
  not?: string[];
}

export type SearchField = 'title' | 'description' | 'url' | 'domain' | 'tags' | 'metadata' | 'all';

export interface SearchOptions {
  /** Case sensitive search */
  caseSensitive?: boolean;
  /** Include stemming */
  stemming?: boolean;
  /** Fuzzy matching tolerance (0-1) */
  fuzzyThreshold?: number;
  /** Maximum results to return */
  maxResults?: number;
  /** Highlight matches */
  highlight?: boolean;
  /** Search result ranking algorithm */
  rankingAlgorithm?: 'relevance' | 'date' | 'frequency' | 'hybrid';
}

// =============================================================================
// ADVANCED FILTERING TYPES
// =============================================================================

export interface AdvancedTimelineFilter extends TimelineFilter {
  /** Complex text search */
  searchQuery?: SearchQuery;
  /** Tag filtering with hierarchy support */
  tagFilter?: TagFilter;
  /** Metadata field filters */
  metadataFilters?: MetadataFilter[];
  /** Time-based filters */
  timeFilters?: TimeFilter;
  /** Content-based filters */
  contentFilters?: ContentFilter;
  /** Relationship filters */
  relationshipFilters?: RelationshipFilter;
  /** Performance filters for large datasets */
  performanceHints?: PerformanceFilter;
}

export interface TagFilter {
  /** Include tags */
  include?: string[];
  /** Exclude tags */
  exclude?: string[];
  /** Require all tags (AND) or any tags (OR) */
  operator?: 'and' | 'or';
  /** Include tag hierarchy (parent/child tags) */
  includeHierarchy?: boolean;
  /** Tag matching mode */
  matchMode?: 'exact' | 'partial' | 'fuzzy';
}

export interface MetadataFilter {
  /** Field to filter on */
  field: string;
  /** Comparison operator */
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'notIn';
  /** Value to compare against */
  value: any;
  /** Case sensitive comparison */
  caseSensitive?: boolean;
}

export interface TimeFilter {
  /** Time of day filters */
  timeOfDay?: {
    start: string; // HH:MM format
    end: string;   // HH:MM format
  };
  /** Day of week filters */
  daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
  /** Relative time periods */
  relativePeriod?: 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear';
  /** Duration-based filters */
  sessionDuration?: {
    min?: number;
    max?: number;
  };
  /** Activity period filters */
  activityPeriods?: TimeRange[];
}

export interface TimeRange {
  start: number;
  end: number;
  label?: string;
}

export interface ContentFilter {
  /** Minimum text length */
  minContentLength?: number;
  /** Maximum text length */
  maxContentLength?: number;
  /** Content type filters */
  contentTypes?: string[];
  /** Language filters */
  languages?: string[];
  /** Has specific elements */
  hasElements?: ('images' | 'videos' | 'forms' | 'links')[];
}

export interface RelationshipFilter {
  /** Filter by parent-child relationships */
  parentChild?: boolean;
  /** Filter by tab group relationships */
  tabGroup?: boolean;
  /** Filter by session flow relationships */
  sessionFlow?: boolean;
  /** Filter by domain relationships */
  domainRelated?: boolean;
}

export interface PerformanceFilter {
  /** Use indexed search only */
  indexedOnly?: boolean;
  /** Maximum search time (ms) */
  maxSearchTime?: number;
  /** Use incremental filtering */
  incremental?: boolean;
  /** Cache results */
  cacheResults?: boolean;
}

// =============================================================================
// SEARCH RESULTS TYPES
// =============================================================================

export interface SearchResult {
  /** Matching items */
  items: HistoryTimelineItem[];
  /** Total match count (may be larger than items.length due to pagination) */
  totalCount: number;
  /** Search performance metrics */
  searchTime: number;
  /** Applied filter */
  appliedFilter: AdvancedTimelineFilter;
  /** Result groupings */
  groups?: SearchResultGroup[];
  /** Search suggestions */
  suggestions?: string[];
  /** Faceted results */
  facets?: SearchFacet[];
  /** Highlights for matching text */
  highlights?: Map<string, string[]>;
  /** Next page token for pagination */
  nextPageToken?: string;
}

export interface SearchResultGroup {
  /** Group key */
  key: string;
  /** Group label */
  label: string;
  /** Items in this group */
  items: HistoryTimelineItem[];
  /** Group metadata */
  metadata?: Record<string, any>;
}

export interface SearchFacet {
  /** Facet field name */
  field: string;
  /** Facet display label */
  label: string;
  /** Facet values and counts */
  values: FacetValue[];
  /** Facet type */
  type: 'terms' | 'range' | 'date' | 'numeric';
}

export interface FacetValue {
  /** Facet value */
  value: any;
  /** Display label */
  label: string;
  /** Count of items with this value */
  count: number;
  /** Whether this value is currently selected */
  selected: boolean;
}

// =============================================================================
// NAVIGATION TYPES
// =============================================================================

export interface TimelineNavigation {
  /** Current view mode */
  viewMode: TimelineViewMode;
  /** Current zoom level */
  zoomLevel: TimelineZoomLevel;
  /** Current time range */
  timeRange: TimeRange;
  /** Current scroll position */
  scrollPosition: number;
  /** Current item index */
  currentIndex?: number;
  /** Navigation history */
  history: NavigationHistoryEntry[];
  /** Bookmarked positions */
  bookmarks: NavigationBookmark[];
}

export type TimelineViewMode = 
  | 'timeline'      // Linear timeline view
  | 'sessions'      // Session-grouped view
  | 'branching'     // Git-style branching view
  | 'calendar'      // Calendar-based view
  | 'heatmap'       // Activity heatmap view
  | 'analytics';    // Analytics dashboard view

export type TimelineZoomLevel = 
  | 'minutes'       // Minute-level detail
  | 'hours'         // Hour-level grouping
  | 'days'          // Day-level grouping
  | 'weeks'         // Week-level grouping
  | 'months'        // Month-level grouping
  | 'years';        // Year-level grouping

export interface NavigationHistoryEntry {
  /** Entry ID */
  id: string;
  /** Timestamp when navigated */
  timestamp: number;
  /** Navigation target */
  target: NavigationTarget;
  /** Applied filters at time of navigation */
  filters?: AdvancedTimelineFilter;
  /** Zoom level at time of navigation */
  zoomLevel: TimelineZoomLevel;
  /** Scroll position */
  scrollPosition: number;
}

export interface NavigationTarget {
  /** Target type */
  type: 'item' | 'date' | 'session' | 'bookmark';
  /** Target identifier */
  id: string;
  /** Display label */
  label: string;
  /** Optional metadata */
  metadata?: Record<string, any>;
}

export interface NavigationBookmark {
  /** Bookmark ID */
  id: string;
  /** Bookmark label */
  label: string;
  /** Creation timestamp */
  createdAt: number;
  /** Target information */
  target: NavigationTarget;
  /** Filters active when bookmark was created */
  filters?: AdvancedTimelineFilter;
  /** Visual marker color */
  color?: string;
  /** User notes */
  notes?: string;
}

// =============================================================================
// TIMELINE CONTROLS TYPES
// =============================================================================

export interface TimelineControls {
  /** Scrubbing/seeking controls */
  scrubbing: ScrubbingControls;
  /** Zoom controls */
  zoom: ZoomControls;
  /** Playback controls */
  playback: PlaybackControls;
  /** View mode controls */
  viewMode: ViewModeControls;
  /** Quick navigation */
  quickNav: QuickNavigationControls;
}

export interface ScrubbingControls {
  /** Enable scrubbing */
  enabled: boolean;
  /** Scrub sensitivity */
  sensitivity: number;
  /** Show scrub preview */
  showPreview: boolean;
  /** Snap to items when scrubbing */
  snapToItems: boolean;
  /** Current scrub position */
  position: number;
  /** Scrub preview data */
  preview?: ScrubbingPreview;
}

export interface ScrubbingPreview {
  /** Preview timestamp */
  timestamp: number;
  /** Preview items */
  items: HistoryTimelineItem[];
  /** Preview position in timeline */
  position: number;
}

export interface ZoomControls {
  /** Current zoom level */
  currentLevel: TimelineZoomLevel;
  /** Available zoom levels */
  availableLevels: TimelineZoomLevel[];
  /** Zoom in action */
  zoomIn: () => void;
  /** Zoom out action */
  zoomOut: () => void;
  /** Set specific zoom level */
  setZoomLevel: (level: TimelineZoomLevel) => void;
  /** Zoom to fit all data */
  zoomToFit: () => void;
  /** Zoom to selection */
  zoomToSelection: () => void;
}

export interface PlaybackControls {
  /** Playback state */
  isPlaying: boolean;
  /** Playback speed */
  speed: number;
  /** Available speeds */
  availableSpeeds: number[];
  /** Play/pause */
  togglePlayback: () => void;
  /** Stop playback */
  stop: () => void;
  /** Set playback speed */
  setSpeed: (speed: number) => void;
  /** Step forward */
  stepForward: () => void;
  /** Step backward */
  stepBackward: () => void;
}

export interface ViewModeControls {
  /** Current view mode */
  currentMode: TimelineViewMode;
  /** Available view modes */
  availableModes: TimelineViewMode[];
  /** Set view mode */
  setViewMode: (mode: TimelineViewMode) => void;
  /** Toggle between timeline and sessions view */
  toggleTimelineSessions: () => void;
}

export interface QuickNavigationControls {
  /** Jump to today */
  jumpToToday: () => void;
  /** Jump to specific date */
  jumpToDate: (date: Date) => void;
  /** Jump to specific item */
  jumpToItem: (itemId: string) => void;
  /** Jump to session start */
  jumpToSessionStart: (sessionId: string) => void;
  /** Jump to session end */
  jumpToSessionEnd: (sessionId: string) => void;
  /** Navigate to previous session */
  previousSession: () => void;
  /** Navigate to next session */
  nextSession: () => void;
  /** Navigate to previous day */
  previousDay: () => void;
  /** Navigate to next day */
  nextDay: () => void;
}

// =============================================================================
// UI COMPONENT TYPES
// =============================================================================

export interface SearchUIState {
  /** Current search query */
  query: string;
  /** Search results */
  results: SearchResult | null;
  /** Search in progress */
  isSearching: boolean;
  /** Search error */
  error: string | null;
  /** Applied filters */
  activeFilters: AdvancedTimelineFilter;
  /** Available filter options */
  filterOptions: FilterOptions;
  /** Search suggestions */
  suggestions: string[];
  /** Recent searches */
  recentSearches: string[];
}

export interface FilterOptions {
  /** Available domains */
  domains: string[];
  /** Available tags */
  tags: SessionTag[];
  /** Available session IDs */
  sessionIds: string[];
  /** Available item types */
  itemTypes: HistoryTimelineItem['type'][];
  /** Date range bounds */
  dateRange: {
    min: number;
    max: number;
  };
}

export interface SearchUIConfig {
  /** Show advanced filters */
  showAdvancedFilters: boolean;
  /** Show search suggestions */
  showSuggestions: boolean;
  /** Show recent searches */
  showRecentSearches: boolean;
  /** Enable real-time search */
  realTimeSearch: boolean;
  /** Search debounce delay */
  debounceDelay: number;
  /** Maximum suggestions to show */
  maxSuggestions: number;
  /** Maximum recent searches to keep */
  maxRecentSearches: number;
}

// =============================================================================
// PERFORMANCE TYPES
// =============================================================================

export interface SearchPerformanceMetrics {
  /** Index build time */
  indexBuildTime: number;
  /** Index size in bytes */
  indexSize: number;
  /** Average search time */
  averageSearchTime: number;
  /** Cache hit rate */
  cacheHitRate: number;
  /** Memory usage */
  memoryUsage: number;
  /** Number of indexed items */
  indexedItems: number;
  /** Last performance measurement */
  lastMeasurement: number;
}

export interface SearchCache {
  /** Cached search results */
  results: Map<string, CachedSearchResult>;
  /** Cache configuration */
  config: SearchCacheConfig;
  /** Cache statistics */
  stats: CacheStatistics;
}

export interface CachedSearchResult {
  /** Cache key */
  key: string;
  /** Search results */
  result: SearchResult;
  /** Cache timestamp */
  timestamp: number;
  /** Access count */
  accessCount: number;
  /** Last access time */
  lastAccessed: number;
}

export interface SearchCacheConfig {
  /** Maximum cache size */
  maxSize: number;
  /** Cache TTL in milliseconds */
  ttl: number;
  /** Cache eviction policy */
  evictionPolicy: 'lru' | 'lfu' | 'ttl';
  /** Enable cache compression */
  compression: boolean;
}

export interface CacheStatistics {
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Current cache size */
  currentSize: number;
  /** Total evictions */
  evictions: number;
  /** Cache memory usage */
  memoryUsage: number;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

export interface SearchEvent {
  /** Event type */
  type: SearchEventType;
  /** Event timestamp */
  timestamp: number;
  /** Event data */
  data: any;
  /** Performance metrics */
  metrics?: {
    duration: number;
    itemsProcessed: number;
    memoryUsed: number;
  };
}

export type SearchEventType =
  | 'search_started'
  | 'search_completed'
  | 'search_cancelled'
  | 'filter_applied'
  | 'filter_removed'
  | 'index_built'
  | 'index_updated'
  | 'navigation_changed'
  | 'zoom_changed'
  | 'bookmark_created'
  | 'bookmark_removed';

// =============================================================================
// HOOK TYPES
// =============================================================================

export interface UseTimelineSearch {
  /** Current search state */
  searchState: SearchUIState;
  /** Search function */
  search: (query: string, filters?: AdvancedTimelineFilter) => Promise<void>;
  /** Clear search */
  clearSearch: () => void;
  /** Apply filter */
  applyFilter: (filter: AdvancedTimelineFilter) => void;
  /** Remove filter */
  removeFilter: (filterKey: string) => void;
  /** Clear all filters */
  clearFilters: () => void;
  /** Search performance metrics */
  performanceMetrics: SearchPerformanceMetrics;
}

export interface UseTimelineNavigation {
  /** Current navigation state */
  navigation: TimelineNavigation;
  /** Navigation controls */
  controls: TimelineControls;
  /** Navigate to item */
  navigateToItem: (itemId: string) => void;
  /** Navigate to date */
  navigateToDate: (date: Date) => void;
  /** Set zoom level */
  setZoomLevel: (level: TimelineZoomLevel) => void;
  /** Set view mode */
  setViewMode: (mode: TimelineViewMode) => void;
  /** Create bookmark */
  createBookmark: (label: string, notes?: string) => void;
  /** Remove bookmark */
  removeBookmark: (bookmarkId: string) => void;
  /** Navigation history */
  goBack: () => void;
  /** Navigation forward */
  goForward: () => void;
}

export interface UseSearchIndex {
  /** Current search index */
  index: SearchIndex | null;
  /** Index building in progress */
  isBuilding: boolean;
  /** Build error */
  error: string | null;
  /** Build index */
  buildIndex: (items: HistoryTimelineItem[]) => Promise<void>;
  /** Update index */
  updateIndex: (items: HistoryTimelineItem[]) => Promise<void>;
  /** Clear index */
  clearIndex: () => void;
  /** Index statistics */
  statistics: {
    itemCount: number;
    tokenCount: number;
    indexSize: number;
    lastUpdated: number;
  };
}