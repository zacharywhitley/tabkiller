/**
 * Advanced Filter Engine
 * Multi-criteria filtering system with real-time results and performance optimization
 */

import { HistoryTimelineItem } from '../../../../shared/types';
import { 
  AdvancedTimelineFilter, 
  SearchQuery, 
  TagFilter, 
  MetadataFilter, 
  TimeFilter, 
  ContentFilter, 
  RelationshipFilter,
  SearchResult,
  SearchIndex,
  SearchOptions,
  BooleanQuery
} from '../types';
import { FastSearchEngine } from './SearchIndexBuilder';

/**
 * Advanced filtering engine with multi-criteria support
 */
export class AdvancedFilterEngine {
  private searchEngine: FastSearchEngine | null = null;

  constructor(private index?: SearchIndex) {
    if (index) {
      this.searchEngine = new FastSearchEngine(index);
    }
  }

  /**
   * Update the search index
   */
  updateIndex(index: SearchIndex): void {
    this.index = index;
    this.searchEngine = new FastSearchEngine(index);
  }

  /**
   * Apply advanced filters to timeline items
   */
  async applyFilter(
    items: HistoryTimelineItem[],
    filter: AdvancedTimelineFilter,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const startTime = performance.now();

    try {
      // If no filter criteria, return all items
      if (this.isEmptyFilter(filter)) {
        return {
          items: items.slice(0, options.maxResults || 1000),
          totalCount: items.length,
          searchTime: performance.now() - startTime,
          appliedFilter: filter,
          highlights: new Map()
        };
      }

      let filteredIndices: Set<number>;

      // Use index-based search if available and query contains text search
      if (this.searchEngine && filter.searchQuery?.text) {
        filteredIndices = await this.performIndexedSearch(filter.searchQuery, options);
      } else {
        // Fallback to linear filtering
        filteredIndices = new Set(items.map((_, index) => index));
      }

      // Apply additional filters
      filteredIndices = this.applyDateRangeFilter(items, filteredIndices, filter.dateRange);
      filteredIndices = this.applyDomainFilter(items, filteredIndices, filter.domains);
      filteredIndices = this.applySessionFilter(items, filteredIndices, filter.sessionIds);
      filteredIndices = this.applyItemTypeFilter(items, filteredIndices, filter.itemTypes);
      filteredIndices = this.applyTagFilter(items, filteredIndices, filter.tagFilter);
      filteredIndices = this.applyMetadataFilters(items, filteredIndices, filter.metadataFilters);
      filteredIndices = this.applyTimeFilters(items, filteredIndices, filter.timeFilters);
      filteredIndices = this.applyContentFilters(items, filteredIndices, filter.contentFilters);
      filteredIndices = this.applyRelationshipFilters(items, filteredIndices, filter.relationshipFilters);

      // Convert indices to items
      const filteredItems = Array.from(filteredIndices)
        .map(index => items[index])
        .filter(item => item !== undefined);

      // Apply sorting
      const sortedItems = this.applySorting(filteredItems, filter);

      // Apply pagination
      const maxResults = options.maxResults || 1000;
      const paginatedItems = sortedItems.slice(0, maxResults);

      // Generate highlights if text search was performed
      const highlights = options.highlight && filter.searchQuery?.text
        ? this.generateHighlights(paginatedItems, filter.searchQuery.text)
        : new Map<string, string[]>();

      const searchTime = performance.now() - startTime;

      return {
        items: paginatedItems,
        totalCount: filteredItems.length,
        searchTime,
        appliedFilter: filter,
        highlights
      };

    } catch (error) {
      console.error('Filter application failed:', error);
      
      return {
        items: [],
        totalCount: 0,
        searchTime: performance.now() - startTime,
        appliedFilter: filter,
        highlights: new Map()
      };
    }
  }

  /**
   * Perform indexed text search
   */
  private async performIndexedSearch(
    searchQuery: SearchQuery,
    options: SearchOptions
  ): Promise<Set<number>> {
    if (!this.searchEngine) {
      return new Set();
    }

    let results: Set<number>;

    if (searchQuery.boolean) {
      results = this.performBooleanSearch(searchQuery.boolean, options);
    } else if (searchQuery.phrase) {
      results = this.performPhraseSearch(searchQuery.phrase, options);
    } else if (searchQuery.wildcard) {
      results = this.performWildcardSearch(searchQuery.wildcard, options);
    } else if (searchQuery.regex) {
      results = this.performRegexSearch(searchQuery.regex, options);
    } else if (searchQuery.text) {
      results = this.searchEngine.search(searchQuery.text, {
        maxResults: options.maxResults,
        fuzzyThreshold: options.fuzzyThreshold
      });
    } else {
      results = new Set();
    }

    return results;
  }

  /**
   * Perform boolean search (AND, OR, NOT operations)
   */
  private performBooleanSearch(
    booleanQuery: BooleanQuery,
    options: SearchOptions
  ): Set<number> {
    if (!this.searchEngine) return new Set();

    let results = new Set<number>();

    // Handle AND terms
    if (booleanQuery.and && booleanQuery.and.length > 0) {
      let andResults = this.searchEngine.search(booleanQuery.and[0], options);
      
      for (let i = 1; i < booleanQuery.and.length; i++) {
        const termResults = this.searchEngine.search(booleanQuery.and[i], options);
        andResults = this.intersectSets(andResults, termResults);
      }
      
      results = andResults;
    }

    // Handle OR terms
    if (booleanQuery.or && booleanQuery.or.length > 0) {
      const orResults = new Set<number>();
      
      for (const orTerm of booleanQuery.or) {
        const termResults = this.searchEngine.search(orTerm, options);
        for (const result of termResults) {
          orResults.add(result);
        }
      }

      if (results.size === 0) {
        results = orResults;
      } else {
        results = this.intersectSets(results, orResults);
      }
    }

    // Handle NOT terms
    if (booleanQuery.not && booleanQuery.not.length > 0) {
      for (const notTerm of booleanQuery.not) {
        const notResults = this.searchEngine.search(notTerm, options);
        results = this.subtractSets(results, notResults);
      }
    }

    return results;
  }

  /**
   * Perform phrase search (exact phrase matching)
   */
  private performPhraseSearch(phrase: string, options: SearchOptions): Set<number> {
    // Simplified phrase search - would need more sophisticated implementation
    // for exact phrase matching with position information
    return this.searchEngine?.search(phrase, options) || new Set();
  }

  /**
   * Perform wildcard search
   */
  private performWildcardSearch(pattern: string, options: SearchOptions): Set<number> {
    if (!this.index) return new Set();

    const results = new Set<number>();
    const regex = this.wildcardToRegex(pattern);

    // Search through text index
    for (const [token, indices] of this.index.textIndex.entries()) {
      if (regex.test(token)) {
        for (const index of indices) {
          results.add(index);
        }
      }
    }

    return results;
  }

  /**
   * Perform regex search
   */
  private performRegexSearch(pattern: string, options: SearchOptions): Set<number> {
    if (!this.index) return new Set();

    try {
      const regex = new RegExp(pattern, options.caseSensitive ? 'g' : 'gi');
      const results = new Set<number>();

      // Search through text index
      for (const [token, indices] of this.index.textIndex.entries()) {
        if (regex.test(token)) {
          for (const index of indices) {
            results.add(index);
          }
        }
      }

      return results;
    } catch (error) {
      console.error('Invalid regex pattern:', pattern, error);
      return new Set();
    }
  }

  /**
   * Apply date range filter
   */
  private applyDateRangeFilter(
    items: HistoryTimelineItem[],
    indices: Set<number>,
    dateRange?: { start: number; end: number }
  ): Set<number> {
    if (!dateRange) return indices;

    const filtered = new Set<number>();

    for (const index of indices) {
      const item = items[index];
      if (item && item.timestamp >= dateRange.start && item.timestamp <= dateRange.end) {
        filtered.add(index);
      }
    }

    return filtered;
  }

  /**
   * Apply domain filter
   */
  private applyDomainFilter(
    items: HistoryTimelineItem[],
    indices: Set<number>,
    domains?: string[]
  ): Set<number> {
    if (!domains || domains.length === 0) return indices;

    const filtered = new Set<number>();
    const domainSet = new Set(domains.map(d => d.toLowerCase()));

    for (const index of indices) {
      const item = items[index];
      if (item && item.metadata.domain && domainSet.has(item.metadata.domain.toLowerCase())) {
        filtered.add(index);
      }
    }

    return filtered;
  }

  /**
   * Apply session filter
   */
  private applySessionFilter(
    items: HistoryTimelineItem[],
    indices: Set<number>,
    sessionIds?: string[]
  ): Set<number> {
    if (!sessionIds || sessionIds.length === 0) return indices;

    const filtered = new Set<number>();
    const sessionSet = new Set(sessionIds);

    for (const index of indices) {
      const item = items[index];
      if (item && item.metadata.sessionId && sessionSet.has(item.metadata.sessionId)) {
        filtered.add(index);
      }
    }

    return filtered;
  }

  /**
   * Apply item type filter
   */
  private applyItemTypeFilter(
    items: HistoryTimelineItem[],
    indices: Set<number>,
    itemTypes?: HistoryTimelineItem['type'][]
  ): Set<number> {
    if (!itemTypes || itemTypes.length === 0) return indices;

    const filtered = new Set<number>();
    const typeSet = new Set(itemTypes);

    for (const index of indices) {
      const item = items[index];
      if (item && typeSet.has(item.type)) {
        filtered.add(index);
      }
    }

    return filtered;
  }

  /**
   * Apply tag filter with hierarchy support
   */
  private applyTagFilter(
    items: HistoryTimelineItem[],
    indices: Set<number>,
    tagFilter?: TagFilter
  ): Set<number> {
    if (!tagFilter) return indices;

    const filtered = new Set<number>();

    for (const index of indices) {
      const item = items[index];
      if (!item || !item.metadata.tags) continue;

      const itemTags = new Set(item.metadata.tags);
      let matches = false;

      // Check include tags
      if (tagFilter.include && tagFilter.include.length > 0) {
        const includeMatches = tagFilter.include.filter(tag => 
          this.matchesTag(itemTags, tag, tagFilter.matchMode || 'exact')
        );

        if (tagFilter.operator === 'and') {
          matches = includeMatches.length === tagFilter.include.length;
        } else {
          matches = includeMatches.length > 0;
        }
      } else {
        matches = true;
      }

      // Check exclude tags
      if (matches && tagFilter.exclude && tagFilter.exclude.length > 0) {
        const excludeMatches = tagFilter.exclude.some(tag => 
          this.matchesTag(itemTags, tag, tagFilter.matchMode || 'exact')
        );

        if (excludeMatches) {
          matches = false;
        }
      }

      if (matches) {
        filtered.add(index);
      }
    }

    return filtered;
  }

  /**
   * Check if item tags match a filter tag
   */
  private matchesTag(itemTags: Set<string>, filterTag: string, matchMode: string): boolean {
    switch (matchMode) {
      case 'exact':
        return itemTags.has(filterTag);
      case 'partial':
        return Array.from(itemTags).some(tag => tag.toLowerCase().includes(filterTag.toLowerCase()));
      case 'fuzzy':
        return Array.from(itemTags).some(tag => this.calculateStringSimilarity(tag, filterTag) > 0.7);
      default:
        return itemTags.has(filterTag);
    }
  }

  /**
   * Apply metadata filters
   */
  private applyMetadataFilters(
    items: HistoryTimelineItem[],
    indices: Set<number>,
    metadataFilters?: MetadataFilter[]
  ): Set<number> {
    if (!metadataFilters || metadataFilters.length === 0) return indices;

    const filtered = new Set<number>();

    for (const index of indices) {
      const item = items[index];
      if (!item) continue;

      const matchesAllFilters = metadataFilters.every(filter => 
        this.matchesMetadataFilter(item, filter)
      );

      if (matchesAllFilters) {
        filtered.add(index);
      }
    }

    return filtered;
  }

  /**
   * Check if item matches a metadata filter
   */
  private matchesMetadataFilter(item: HistoryTimelineItem, filter: MetadataFilter): boolean {
    const value = this.getNestedValue(item.metadata, filter.field);
    if (value === undefined || value === null) return false;

    switch (filter.operator) {
      case 'equals':
        return filter.caseSensitive ? value === filter.value : 
          String(value).toLowerCase() === String(filter.value).toLowerCase();
      case 'contains':
        return filter.caseSensitive ? String(value).includes(String(filter.value)) :
          String(value).toLowerCase().includes(String(filter.value).toLowerCase());
      case 'startsWith':
        return filter.caseSensitive ? String(value).startsWith(String(filter.value)) :
          String(value).toLowerCase().startsWith(String(filter.value).toLowerCase());
      case 'endsWith':
        return filter.caseSensitive ? String(value).endsWith(String(filter.value)) :
          String(value).toLowerCase().endsWith(String(filter.value).toLowerCase());
      case 'gt':
        return Number(value) > Number(filter.value);
      case 'lt':
        return Number(value) < Number(filter.value);
      case 'gte':
        return Number(value) >= Number(filter.value);
      case 'lte':
        return Number(value) <= Number(filter.value);
      case 'in':
        return Array.isArray(filter.value) ? filter.value.includes(value) : false;
      case 'notIn':
        return Array.isArray(filter.value) ? !filter.value.includes(value) : true;
      default:
        return false;
    }
  }

  /**
   * Apply time-based filters
   */
  private applyTimeFilters(
    items: HistoryTimelineItem[],
    indices: Set<number>,
    timeFilters?: TimeFilter
  ): Set<number> {
    if (!timeFilters) return indices;

    const filtered = new Set<number>();

    for (const index of indices) {
      const item = items[index];
      if (!item) continue;

      let matches = true;

      // Check time of day
      if (matches && timeFilters.timeOfDay) {
        matches = this.matchesTimeOfDay(item.timestamp, timeFilters.timeOfDay);
      }

      // Check days of week
      if (matches && timeFilters.daysOfWeek) {
        matches = this.matchesDayOfWeek(item.timestamp, timeFilters.daysOfWeek);
      }

      // Check relative period
      if (matches && timeFilters.relativePeriod) {
        matches = this.matchesRelativePeriod(item.timestamp, timeFilters.relativePeriod);
      }

      // Check session duration
      if (matches && timeFilters.sessionDuration && item.metadata.duration) {
        matches = this.matchesDurationRange(item.metadata.duration, timeFilters.sessionDuration);
      }

      if (matches) {
        filtered.add(index);
      }
    }

    return filtered;
  }

  /**
   * Apply content filters
   */
  private applyContentFilters(
    items: HistoryTimelineItem[],
    indices: Set<number>,
    contentFilters?: ContentFilter
  ): Set<number> {
    if (!contentFilters) return indices;

    const filtered = new Set<number>();

    for (const index of indices) {
      const item = items[index];
      if (!item) continue;

      let matches = true;

      // Check content length
      if (matches && (contentFilters.minContentLength || contentFilters.maxContentLength)) {
        const contentLength = (item.title || '').length + (item.description || '').length;
        
        if (contentFilters.minContentLength && contentLength < contentFilters.minContentLength) {
          matches = false;
        }
        if (contentFilters.maxContentLength && contentLength > contentFilters.maxContentLength) {
          matches = false;
        }
      }

      if (matches) {
        filtered.add(index);
      }
    }

    return filtered;
  }

  /**
   * Apply relationship filters
   */
  private applyRelationshipFilters(
    items: HistoryTimelineItem[],
    indices: Set<number>,
    relationshipFilters?: RelationshipFilter
  ): Set<number> {
    if (!relationshipFilters) return indices;

    // Simplified relationship filtering
    // In a full implementation, this would analyze item relationships
    return indices;
  }

  /**
   * Apply sorting to filtered items
   */
  private applySorting(items: HistoryTimelineItem[], filter: AdvancedTimelineFilter): HistoryTimelineItem[] {
    if (!filter || !filter.field) {
      // Default sort by timestamp descending
      return items.sort((a, b) => b.timestamp - a.timestamp);
    }

    const { field, order } = filter;
    const multiplier = order === 'desc' ? -1 : 1;

    return items.sort((a, b) => {
      let aVal, bVal;

      switch (field) {
        case 'timestamp':
          aVal = a.timestamp;
          bVal = b.timestamp;
          break;
        case 'title':
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case 'domain':
          aVal = a.metadata.domain || '';
          bVal = b.metadata.domain || '';
          break;
        case 'sessionId':
          aVal = a.metadata.sessionId || '';
          bVal = b.metadata.sessionId || '';
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return -1 * multiplier;
      if (aVal > bVal) return 1 * multiplier;
      return 0;
    });
  }

  /**
   * Generate highlights for search results
   */
  private generateHighlights(items: HistoryTimelineItem[], query: string): Map<string, string[]> {
    const highlights = new Map<string, string[]>();
    const queryTokens = query.toLowerCase().split(/\s+/);

    for (const item of items) {
      const itemHighlights: string[] = [];
      const textToSearch = `${item.title} ${item.description || ''}`.toLowerCase();

      for (const token of queryTokens) {
        if (textToSearch.includes(token)) {
          // Simple highlighting - in production, would use more sophisticated matching
          const regex = new RegExp(`(${token})`, 'gi');
          const highlighted = item.title.replace(regex, '<mark>$1</mark>');
          if (highlighted !== item.title) {
            itemHighlights.push(highlighted);
          }
        }
      }

      if (itemHighlights.length > 0) {
        highlights.set(item.id, itemHighlights);
      }
    }

    return highlights;
  }

  // Utility methods

  /**
   * Check if filter is empty
   */
  private isEmptyFilter(filter: AdvancedTimelineFilter): boolean {
    return !filter.searchQuery?.text &&
           !filter.domains?.length &&
           !filter.sessionIds?.length &&
           !filter.tagFilter?.include?.length &&
           !filter.tagFilter?.exclude?.length &&
           !filter.dateRange &&
           !filter.itemTypes?.length &&
           !filter.metadataFilters?.length &&
           !filter.timeFilters &&
           !filter.contentFilters;
  }

  /**
   * Intersect two sets
   */
  private intersectSets<T>(set1: Set<T>, set2: Set<T>): Set<T> {
    const result = new Set<T>();
    const [smaller, larger] = set1.size <= set2.size ? [set1, set2] : [set2, set1];
    
    for (const item of smaller) {
      if (larger.has(item)) {
        result.add(item);
      }
    }
    
    return result;
  }

  /**
   * Subtract one set from another
   */
  private subtractSets<T>(set1: Set<T>, set2: Set<T>): Set<T> {
    const result = new Set<T>();
    
    for (const item of set1) {
      if (!set2.has(item)) {
        result.add(item);
      }
    }
    
    return result;
  }

  /**
   * Convert wildcard pattern to regex
   */
  private wildcardToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regex = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${regex}$`, 'i');
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Calculate string similarity
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    const set1 = new Set(str1.toLowerCase());
    const set2 = new Set(str2.toLowerCase());
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * Check if timestamp matches time of day filter
   */
  private matchesTimeOfDay(timestamp: number, timeOfDay: { start: string; end: string }): boolean {
    const date = new Date(timestamp);
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    return time >= timeOfDay.start && time <= timeOfDay.end;
  }

  /**
   * Check if timestamp matches day of week filter
   */
  private matchesDayOfWeek(timestamp: number, daysOfWeek: number[]): boolean {
    const date = new Date(timestamp);
    return daysOfWeek.includes(date.getDay());
  }

  /**
   * Check if timestamp matches relative period filter
   */
  private matchesRelativePeriod(timestamp: number, period: string): boolean {
    const now = new Date();
    const itemDate = new Date(timestamp);

    switch (period) {
      case 'today':
        return itemDate.toDateString() === now.toDateString();
      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return itemDate.toDateString() === yesterday.toDateString();
      case 'thisWeek':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        return itemDate >= weekStart;
      default:
        return false;
    }
  }

  /**
   * Check if duration matches range filter
   */
  private matchesDurationRange(duration: number, range: { min?: number; max?: number }): boolean {
    if (range.min !== undefined && duration < range.min) return false;
    if (range.max !== undefined && duration > range.max) return false;
    return true;
  }
}

// Export singleton instance
export const advancedFilterEngine = new AdvancedFilterEngine();