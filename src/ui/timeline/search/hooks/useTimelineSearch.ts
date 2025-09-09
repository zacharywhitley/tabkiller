/**
 * Timeline Search Hook
 * React hook for managing search state and operations with performance optimization
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { HistoryTimelineItem } from '../../../../shared/types';
import { 
  SearchUIState, 
  AdvancedTimelineFilter, 
  SearchResult, 
  SearchPerformanceMetrics,
  SearchIndex,
  SearchOptions,
  FilterOptions,
  UseTimelineSearch
} from '../types';
import { SearchIndexBuilder, FastSearchEngine } from '../utils/SearchIndexBuilder';
import { AdvancedFilterEngine } from '../utils/AdvancedFilterEngine';
import { debounce } from '../../core/PerformanceOptimization';

// Default search options
const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  caseSensitive: false,
  stemming: true,
  fuzzyThreshold: 0.8,
  maxResults: 1000,
  highlight: true,
  rankingAlgorithm: 'hybrid'
};

// Default search state
const DEFAULT_SEARCH_STATE: SearchUIState = {
  query: '',
  results: null,
  isSearching: false,
  error: null,
  activeFilters: {},
  filterOptions: {
    domains: [],
    tags: [],
    sessionIds: [],
    itemTypes: ['session', 'navigation', 'tab_event', 'boundary'],
    dateRange: { min: 0, max: Date.now() }
  },
  suggestions: [],
  recentSearches: []
};

/**
 * Custom hook for timeline search functionality
 */
export function useTimelineSearch(
  items: HistoryTimelineItem[],
  options: {
    debounceDelay?: number;
    maxRecentSearches?: number;
    enableRealTimeSearch?: boolean;
    searchOptions?: Partial<SearchOptions>;
  } = {}
): UseTimelineSearch {
  const {
    debounceDelay = 300,
    maxRecentSearches = 10,
    enableRealTimeSearch = true,
    searchOptions = {}
  } = options;

  // State management
  const [searchState, setSearchState] = useState<SearchUIState>(DEFAULT_SEARCH_STATE);
  const [searchIndex, setSearchIndex] = useState<SearchIndex | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<SearchPerformanceMetrics>({
    indexBuildTime: 0,
    indexSize: 0,
    averageSearchTime: 0,
    cacheHitRate: 0,
    memoryUsage: 0,
    indexedItems: 0,
    lastMeasurement: 0
  });

  // Refs for performance optimization
  const searchIndexBuilder = useRef(new SearchIndexBuilder());
  const filterEngine = useRef(new AdvancedFilterEngine());
  const searchTimes = useRef<number[]>([]);
  const lastQuery = useRef<string>('');

  // Memoized search options
  const finalSearchOptions = useMemo(() => ({
    ...DEFAULT_SEARCH_OPTIONS,
    ...searchOptions
  }), [searchOptions]);

  // Memoized filter options
  const filterOptions = useMemo(() => {
    if (items.length === 0) {
      return DEFAULT_SEARCH_STATE.filterOptions;
    }

    const domains = [...new Set(items
      .map(item => item.metadata.domain)
      .filter(domain => domain)
    )].sort();

    const sessionIds = [...new Set(items
      .map(item => item.metadata.sessionId)
      .filter(sessionId => sessionId)
    )].sort();

    const tags = [...new Set(items
      .flatMap(item => item.metadata.tags || [])
    )].map(tag => ({
      id: tag,
      name: tag,
      usageCount: items.filter(item => item.metadata.tags?.includes(tag)).length,
      createdAt: Date.now()
    })).sort((a, b) => b.usageCount - a.usageCount);

    const timestamps = items.map(item => item.timestamp);
    const dateRange = {
      min: Math.min(...timestamps),
      max: Math.max(...timestamps)
    };

    return {
      domains,
      tags,
      sessionIds,
      itemTypes: ['session', 'navigation', 'tab_event', 'boundary'] as const,
      dateRange
    };
  }, [items]);

  // Build search index when items change
  useEffect(() => {
    let isCancelled = false;

    const buildIndex = async () => {
      if (items.length === 0) {
        setSearchIndex(null);
        return;
      }

      setSearchState(prev => ({ ...prev, isSearching: true, error: null }));

      try {
        const startTime = performance.now();
        const index = await searchIndexBuilder.current.buildIndex(items);
        const buildTime = performance.now() - startTime;

        if (!isCancelled) {
          setSearchIndex(index);
          filterEngine.current.updateIndex(index);

          // Update performance metrics
          setPerformanceMetrics(prev => ({
            ...prev,
            indexBuildTime: buildTime,
            indexSize: calculateIndexSize(index),
            indexedItems: items.length,
            lastMeasurement: Date.now()
          }));

          setSearchState(prev => ({
            ...prev,
            isSearching: false,
            filterOptions
          }));
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to build search index:', error);
          setSearchState(prev => ({
            ...prev,
            isSearching: false,
            error: 'Failed to build search index'
          }));
        }
      }
    };

    buildIndex();

    return () => {
      isCancelled = true;
    };
  }, [items, filterOptions]);

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (query: string, filters: AdvancedTimelineFilter) => {
      if (!searchIndex) return;

      const startTime = performance.now();

      try {
        const searchQuery = query.trim() ? { text: query } : undefined;
        const advancedFilter = { ...filters, searchQuery };

        const result = await filterEngine.current.applyFilter(items, advancedFilter, finalSearchOptions);
        const searchTime = performance.now() - startTime;

        // Update search times for performance tracking
        searchTimes.current.push(searchTime);
        if (searchTimes.current.length > 20) {
          searchTimes.current.shift();
        }

        const averageSearchTime = searchTimes.current.reduce((sum, time) => sum + time, 0) / searchTimes.current.length;

        setPerformanceMetrics(prev => ({
          ...prev,
          averageSearchTime,
          lastMeasurement: Date.now()
        }));

        setSearchState(prev => ({
          ...prev,
          results: result,
          isSearching: false,
          error: null
        }));

        // Add to recent searches if it's a text query
        if (query.trim() && query !== lastQuery.current) {
          addToRecentSearches(query);
          lastQuery.current = query;
        }

      } catch (error) {
        console.error('Search failed:', error);
        setSearchState(prev => ({
          ...prev,
          isSearching: false,
          error: 'Search failed'
        }));
      }
    }, debounceDelay),
    [searchIndex, items, finalSearchOptions, debounceDelay]
  );

  // Search function
  const search = useCallback(async (
    query: string, 
    filters: AdvancedTimelineFilter = {}
  ): Promise<void> => {
    setSearchState(prev => ({
      ...prev,
      query,
      isSearching: true,
      error: null
    }));

    await debouncedSearch(query, filters);
  }, [debouncedSearch]);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchState(prev => ({
      ...prev,
      query: '',
      results: null,
      isSearching: false,
      error: null,
      activeFilters: {}
    }));
  }, []);

  // Apply filter
  const applyFilter = useCallback((filter: AdvancedTimelineFilter) => {
    const newFilters = { ...searchState.activeFilters, ...filter };
    
    setSearchState(prev => ({
      ...prev,
      activeFilters: newFilters
    }));

    if (enableRealTimeSearch) {
      search(searchState.query, newFilters);
    }
  }, [searchState.activeFilters, searchState.query, search, enableRealTimeSearch]);

  // Remove filter
  const removeFilter = useCallback((filterKey: string) => {
    const newFilters = { ...searchState.activeFilters };
    delete (newFilters as any)[filterKey];
    
    setSearchState(prev => ({
      ...prev,
      activeFilters: newFilters
    }));

    if (enableRealTimeSearch) {
      search(searchState.query, newFilters);
    }
  }, [searchState.activeFilters, searchState.query, search, enableRealTimeSearch]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchState(prev => ({
      ...prev,
      activeFilters: {}
    }));

    if (enableRealTimeSearch && searchState.query) {
      search(searchState.query, {});
    }
  }, [searchState.query, search, enableRealTimeSearch]);

  // Add to recent searches
  const addToRecentSearches = useCallback((query: string) => {
    setSearchState(prev => {
      const recentSearches = [query, ...prev.recentSearches.filter(q => q !== query)]
        .slice(0, maxRecentSearches);
      
      return {
        ...prev,
        recentSearches
      };
    });
  }, [maxRecentSearches]);

  // Generate search suggestions
  const generateSuggestions = useCallback((query: string): string[] => {
    if (!searchIndex || query.length < 2) return [];

    const suggestions = new Set<string>();
    const queryLower = query.toLowerCase();

    // Add domain suggestions
    for (const domain of filterOptions.domains) {
      if (domain.toLowerCase().includes(queryLower)) {
        suggestions.add(domain);
      }
    }

    // Add tag suggestions
    for (const tag of filterOptions.tags) {
      if (tag.name.toLowerCase().includes(queryLower)) {
        suggestions.add(tag.name);
      }
    }

    // Add token suggestions from search index
    for (const [token] of searchIndex.textIndex.entries()) {
      if (token.toLowerCase().startsWith(queryLower) && suggestions.size < 10) {
        suggestions.add(token);
      }
    }

    return Array.from(suggestions).slice(0, 8);
  }, [searchIndex, filterOptions]);

  // Update suggestions when query changes
  useEffect(() => {
    const suggestions = generateSuggestions(searchState.query);
    
    setSearchState(prev => ({
      ...prev,
      suggestions
    }));
  }, [searchState.query, generateSuggestions]);

  // Calculate index size
  const calculateIndexSize = (index: SearchIndex): number => {
    let size = 0;
    
    // Rough estimation of memory usage
    for (const [key, value] of index.textIndex.entries()) {
      size += key.length * 2 + value.size * 8; // Rough bytes estimation
    }
    
    for (const [key, value] of index.domainIndex.entries()) {
      size += key.length * 2 + value.size * 8;
    }
    
    // Add other indices...
    
    return size;
  };

  return {
    searchState: {
      ...searchState,
      filterOptions
    },
    search,
    clearSearch,
    applyFilter,
    removeFilter,
    clearFilters,
    performanceMetrics
  };
}

/**
 * Hook for search suggestions
 */
export function useSearchSuggestions(
  query: string,
  items: HistoryTimelineItem[],
  options: {
    maxSuggestions?: number;
    minQueryLength?: number;
  } = {}
): string[] {
  const { maxSuggestions = 8, minQueryLength = 2 } = options;
  
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (query.length < minQueryLength) {
      setSuggestions([]);
      return;
    }

    const generateSuggestions = () => {
      const suggestionSet = new Set<string>();
      const queryLower = query.toLowerCase();

      // Extract domains
      items.forEach(item => {
        if (item.metadata.domain && 
            item.metadata.domain.toLowerCase().includes(queryLower)) {
          suggestionSet.add(item.metadata.domain);
        }
      });

      // Extract tags
      items.forEach(item => {
        item.metadata.tags?.forEach(tag => {
          if (tag.toLowerCase().includes(queryLower)) {
            suggestionSet.add(tag);
          }
        });
      });

      // Extract title words
      items.forEach(item => {
        const words = item.title.toLowerCase().split(/\s+/);
        words.forEach(word => {
          if (word.includes(queryLower) && word.length > minQueryLength) {
            suggestionSet.add(word);
          }
        });
      });

      return Array.from(suggestionSet).slice(0, maxSuggestions);
    };

    const newSuggestions = generateSuggestions();
    setSuggestions(newSuggestions);
  }, [query, items, maxSuggestions, minQueryLength]);

  return suggestions;
}

/**
 * Hook for recent searches management
 */
export function useRecentSearches(maxSearches: number = 10) {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const addSearch = useCallback((query: string) => {
    if (!query.trim()) return;

    setRecentSearches(prev => {
      const filtered = prev.filter(search => search !== query);
      return [query, ...filtered].slice(0, maxSearches);
    });
  }, [maxSearches]);

  const removeSearch = useCallback((query: string) => {
    setRecentSearches(prev => prev.filter(search => search !== query));
  }, []);

  const clearSearches = useCallback(() => {
    setRecentSearches([]);
  }, []);

  return {
    recentSearches,
    addSearch,
    removeSearch,
    clearSearches
  };
}