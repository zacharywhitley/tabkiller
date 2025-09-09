/**
 * Timeline Search, Filtering, and Navigation Module
 * Complete search and navigation system for timeline visualization
 */

// Components
export { SearchBar } from './components/SearchBar';
export { AdvancedFilterPanel } from './components/AdvancedFilterPanel';
export { TimelineNavigationControls } from './components/TimelineNavigationControls';

// Hooks
export { 
  useTimelineSearch, 
  useSearchSuggestions, 
  useRecentSearches 
} from './hooks/useTimelineSearch';

export { 
  useTimelineNavigation, 
  useTimelineScrubbing, 
  useBookmarkManager, 
  useTimelinePerformance 
} from './hooks/useTimelineNavigation';

// Utilities
export { 
  SearchIndexBuilder, 
  FastSearchEngine, 
  searchIndexBuilder 
} from './utils/SearchIndexBuilder';

export { 
  AdvancedFilterEngine, 
  advancedFilterEngine 
} from './utils/AdvancedFilterEngine';

export { 
  TimelineNavigationController, 
  createNavigationController 
} from './utils/TimelineNavigationController';

// Types
export type {
  // Search types
  SearchIndex,
  SearchQuery,
  BooleanQuery,
  SearchOptions,
  SearchResult,
  SearchResultGroup,
  SearchFacet,
  FacetValue,
  SearchUIState,
  SearchUIConfig,
  FilterOptions,
  UseTimelineSearch,
  
  // Filter types
  AdvancedTimelineFilter,
  TagFilter,
  MetadataFilter,
  TimeFilter,
  ContentFilter,
  RelationshipFilter,
  PerformanceFilter,
  
  // Navigation types
  TimelineNavigation,
  TimelineZoomLevel,
  TimelineViewMode,
  NavigationTarget,
  NavigationHistoryEntry,
  NavigationBookmark,
  TimeRange,
  
  // Controls types
  TimelineControls,
  ScrubbingControls,
  ZoomControls,
  PlaybackControls,
  ViewModeControls,
  QuickNavigationControls,
  UseTimelineNavigation,
  
  // Performance types
  SearchPerformanceMetrics,
  SearchCache,
  CachedSearchResult,
  SearchCacheConfig,
  CacheStatistics,
  
  // Event types
  SearchEvent,
  SearchEventType,
  
  // Hook types
  UseSearchIndex
} from './types';

// Constants and configurations
export const SEARCH_CONSTANTS = {
  // Search configuration
  DEFAULT_DEBOUNCE_DELAY: 300,
  DEFAULT_MAX_RESULTS: 1000,
  DEFAULT_FUZZY_THRESHOLD: 0.8,
  MAX_SUGGESTIONS: 10,
  MAX_RECENT_SEARCHES: 20,
  
  // Performance thresholds
  FAST_SEARCH_THRESHOLD_MS: 200,
  INDEX_BUILD_BATCH_SIZE: 100,
  SEARCH_CACHE_SIZE: 100,
  SEARCH_CACHE_TTL: 300000, // 5 minutes
  
  // UI constants
  MIN_QUERY_LENGTH: 2,
  SUGGESTION_DELAY: 150,
  PREVIEW_DEBOUNCE: 100,
  
  // Navigation constants
  SCRUB_SENSITIVITY: 1.0,
  PLAYBACK_DEFAULT_SPEED: 1.0,
  AVAILABLE_PLAYBACK_SPEEDS: [0.25, 0.5, 1.0, 2.0, 4.0],
  BOOKMARK_COLORS: [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', 
    '#22c55e', '#10b981', '#06b6d4', '#3b82f6',
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef'
  ],
  
  // Keyboard shortcuts
  KEYBOARD_SHORTCUTS: {
    SEARCH_FOCUS: ['cmd+f', 'ctrl+f'],
    CLEAR_SEARCH: ['escape'],
    NEXT_RESULT: ['cmd+g', 'ctrl+g'],
    PREV_RESULT: ['cmd+shift+g', 'ctrl+shift+g'],
    TOGGLE_FILTERS: ['cmd+shift+f', 'ctrl+shift+f'],
    ZOOM_IN: ['cmd+plus', 'ctrl+plus'],
    ZOOM_OUT: ['cmd+minus', 'ctrl+minus'],
    ZOOM_FIT: ['cmd+0', 'ctrl+0'],
    PLAY_PAUSE: ['space'],
    STEP_FORWARD: ['right'],
    STEP_BACKWARD: ['left'],
    JUMP_TODAY: ['cmd+t', 'ctrl+t'],
    CREATE_BOOKMARK: ['cmd+b', 'ctrl+b']
  }
} as const;

export const SEARCH_DEFAULT_CONFIG = {
  // Search options
  searchOptions: {
    caseSensitive: false,
    stemming: true,
    fuzzyThreshold: SEARCH_CONSTANTS.DEFAULT_FUZZY_THRESHOLD,
    maxResults: SEARCH_CONSTANTS.DEFAULT_MAX_RESULTS,
    highlight: true,
    rankingAlgorithm: 'hybrid' as const
  },
  
  // UI configuration
  uiConfig: {
    showAdvancedFilters: false,
    showSuggestions: true,
    showRecentSearches: true,
    realTimeSearch: true,
    debounceDelay: SEARCH_CONSTANTS.DEFAULT_DEBOUNCE_DELAY,
    maxSuggestions: SEARCH_CONSTANTS.MAX_SUGGESTIONS,
    maxRecentSearches: SEARCH_CONSTANTS.MAX_RECENT_SEARCHES
  },
  
  // Navigation configuration
  navigationConfig: {
    enableAutoSave: true,
    enableKeyboardNavigation: true,
    storageKey: 'timeline-navigation',
    showPlaybackControls: true,
    showBookmarks: true,
    showViewModeSelector: true
  },
  
  // Performance configuration
  performanceConfig: {
    enableIndexing: true,
    enableCaching: true,
    cacheSize: SEARCH_CONSTANTS.SEARCH_CACHE_SIZE,
    cacheTTL: SEARCH_CONSTANTS.SEARCH_CACHE_TTL,
    indexBatchSize: SEARCH_CONSTANTS.INDEX_BUILD_BATCH_SIZE,
    enablePerformanceMonitoring: true
  }
} as const;

// Utility functions
export const SearchUtils = {
  /**
   * Create a search configuration with overrides
   */
  createSearchConfig: (overrides?: Partial<typeof SEARCH_DEFAULT_CONFIG>) => ({
    ...SEARCH_DEFAULT_CONFIG,
    ...overrides
  }),
  
  /**
   * Format search time for display
   */
  formatSearchTime: (timeMs: number): string => {
    if (timeMs < 1) return '<1ms';
    if (timeMs < 1000) return `${timeMs.toFixed(0)}ms`;
    return `${(timeMs / 1000).toFixed(1)}s`;
  },
  
  /**
   * Format result count for display
   */
  formatResultCount: (count: number): string => {
    if (count < 1000) return count.toString();
    if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
    return `${(count / 1000000).toFixed(1)}M`;
  },
  
  /**
   * Check if search is considered fast
   */
  isFastSearch: (timeMs: number): boolean => {
    return timeMs < SEARCH_CONSTANTS.FAST_SEARCH_THRESHOLD_MS;
  },
  
  /**
   * Generate search cache key
   */
  generateCacheKey: (query: string, filters: any): string => {
    return `search:${query}:${JSON.stringify(filters)}`;
  },
  
  /**
   * Validate search query
   */
  validateQuery: (query: string): { valid: boolean; error?: string } => {
    if (!query || typeof query !== 'string') {
      return { valid: false, error: 'Query must be a non-empty string' };
    }
    
    if (query.length < SEARCH_CONSTANTS.MIN_QUERY_LENGTH) {
      return { 
        valid: false, 
        error: `Query must be at least ${SEARCH_CONSTANTS.MIN_QUERY_LENGTH} characters long` 
      };
    }
    
    return { valid: true };
  },
  
  /**
   * Parse search syntax
   */
  parseSearchSyntax: (query: string): {
    text?: string;
    phrases?: string[];
    domains?: string[];
    tags?: string[];
    boolean?: { and?: string[]; or?: string[]; not?: string[] };
  } => {
    const result: any = {};
    let remainingQuery = query;

    // Extract quoted phrases
    const phraseMatches = query.match(/"([^"]+)"/g);
    if (phraseMatches) {
      result.phrases = phraseMatches.map(match => match.slice(1, -1));
      remainingQuery = remainingQuery.replace(/"([^"]+)"/g, '');
    }

    // Extract domain filters
    const domainMatches = remainingQuery.match(/domain:(\S+)/g);
    if (domainMatches) {
      result.domains = domainMatches.map(match => match.replace('domain:', ''));
      remainingQuery = remainingQuery.replace(/domain:(\S+)/g, '');
    }

    // Extract tag filters
    const tagMatches = remainingQuery.match(/tag:(\S+)/g);
    if (tagMatches) {
      result.tags = tagMatches.map(match => match.replace('tag:', ''));
      remainingQuery = remainingQuery.replace(/tag:(\S+)/g, '');
    }

    // Parse boolean operators
    if (remainingQuery.includes(' AND ') || remainingQuery.includes(' OR ') || remainingQuery.includes(' NOT ')) {
      const booleanQuery: any = {};
      
      if (remainingQuery.includes(' AND ')) {
        booleanQuery.and = remainingQuery.split(' AND ').map(t => t.trim()).filter(Boolean);
      } else if (remainingQuery.includes(' OR ')) {
        booleanQuery.or = remainingQuery.split(' OR ').map(t => t.trim()).filter(Boolean);
      }
      
      if (remainingQuery.includes(' NOT ')) {
        const notParts = remainingQuery.split(' NOT ');
        booleanQuery.not = notParts.slice(1).map(t => t.trim()).filter(Boolean);
        remainingQuery = notParts[0].trim();
      }
      
      result.boolean = booleanQuery;
    } else {
      // Regular text search
      const text = remainingQuery.trim();
      if (text) {
        result.text = text;
      }
    }

    return result;
  }
};

// Export version information
export const SEARCH_MODULE_VERSION = '1.0.0';

/**
 * Main search and navigation system factory
 */
export const createTimelineSearchSystem = (
  items: any[],
  config: Partial<typeof SEARCH_DEFAULT_CONFIG> = {}
) => {
  const finalConfig = SearchUtils.createSearchConfig(config);
  
  return {
    config: finalConfig,
    utils: SearchUtils,
    constants: SEARCH_CONSTANTS,
    version: SEARCH_MODULE_VERSION
  };
};

// Default export for convenience
export default {
  SearchBar,
  AdvancedFilterPanel,
  TimelineNavigationControls,
  useTimelineSearch,
  useTimelineNavigation,
  SearchUtils,
  SEARCH_CONSTANTS,
  createTimelineSearchSystem
};