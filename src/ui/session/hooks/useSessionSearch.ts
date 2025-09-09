/**
 * useSessionSearch Hook
 * Custom hook for session search functionality
 */

import { useState, useCallback, useMemo } from 'react';
import { Session } from '../../../contexts/types';
import { SessionSearchQuery, SessionSortOptions, DEFAULT_SEARCH_QUERY, DEFAULT_SORT_OPTIONS } from '../types';
import { filterSessions, sortSessions } from '../utils/sessionUtils';

export interface UseSessionSearchOptions {
  initialQuery?: Partial<SessionSearchQuery>;
  initialSort?: Partial<SessionSortOptions>;
  debounceMs?: number;
}

export function useSessionSearch(
  sessions: Session[],
  options: UseSessionSearchOptions = {}
) {
  const {
    initialQuery = {},
    initialSort = {},
    debounceMs = 300
  } = options;

  const [query, setQuery] = useState<SessionSearchQuery>({
    ...DEFAULT_SEARCH_QUERY,
    ...initialQuery
  });

  const [sortOptions, setSortOptions] = useState<SessionSortOptions>({
    ...DEFAULT_SORT_OPTIONS,
    ...initialSort
  });

  const [isSearching, setIsSearching] = useState(false);

  // Filtered and sorted sessions
  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    
    const filtered = filterSessions(sessions, query);
    return sortSessions(filtered, sortOptions);
  }, [sessions, query, sortOptions]);

  // Update query with debouncing for text search
  const updateQuery = useCallback((updates: Partial<SessionSearchQuery>) => {
    setIsSearching(true);
    setQuery(prevQuery => ({ ...prevQuery, ...updates }));
    
    // If updating text, debounce the search
    if (updates.text !== undefined) {
      const timeoutId = setTimeout(() => {
        setIsSearching(false);
      }, debounceMs);

      return () => clearTimeout(timeoutId);
    } else {
      setIsSearching(false);
    }
  }, [debounceMs]);

  // Update sort options
  const updateSort = useCallback((updates: Partial<SessionSortOptions>) => {
    setSortOptions(prevSort => ({ ...prevSort, ...updates }));
  }, []);

  // Clear search query
  const clearSearch = useCallback(() => {
    setQuery(DEFAULT_SEARCH_QUERY);
    setIsSearching(false);
  }, []);

  // Check if search is active
  const hasActiveSearch = useMemo(() => {
    return (
      query.text.length > 0 ||
      query.tags.length > 0 ||
      query.domains.length > 0 ||
      query.dateRange !== undefined ||
      query.isActive !== undefined ||
      query.minTabs !== undefined ||
      query.maxTabs !== undefined ||
      query.minDuration !== undefined ||
      query.maxDuration !== undefined
    );
  }, [query]);

  // Search statistics
  const searchStats = useMemo(() => {
    const totalSessions = sessions.length;
    const filteredCount = filteredSessions.length;
    const filteredPercentage = totalSessions > 0 ? (filteredCount / totalSessions) * 100 : 0;

    return {
      total: totalSessions,
      filtered: filteredCount,
      percentage: Math.round(filteredPercentage),
      hidden: totalSessions - filteredCount
    };
  }, [sessions.length, filteredSessions.length]);

  // Quick search methods
  const searchByText = useCallback((text: string) => {
    updateQuery({ text });
  }, [updateQuery]);

  const searchByTag = useCallback((tagIds: string[]) => {
    updateQuery({ tags: tagIds });
  }, [updateQuery]);

  const searchByDomain = useCallback((domains: string[]) => {
    updateQuery({ domains });
  }, [updateQuery]);

  const searchByDateRange = useCallback((start: Date, end: Date) => {
    updateQuery({ dateRange: { start, end } });
  }, [updateQuery]);

  const searchActiveOnly = useCallback(() => {
    updateQuery({ isActive: true });
  }, [updateQuery]);

  const searchCompletedOnly = useCallback(() => {
    updateQuery({ isActive: false });
  }, [updateQuery]);

  return {
    // State
    query,
    sortOptions,
    filteredSessions,
    isSearching,
    hasActiveSearch,
    searchStats,

    // Actions
    updateQuery,
    updateSort,
    clearSearch,

    // Quick search methods
    searchByText,
    searchByTag,
    searchByDomain,
    searchByDateRange,
    searchActiveOnly,
    searchCompletedOnly
  };
}