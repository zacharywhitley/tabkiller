/**
 * Efficient Data Structures for Timeline Navigation
 * Optimized for fast lookups, filtering, and rendering
 */

import { 
  TimelineData, 
  SearchIndex, 
  TimelineFilter, 
  TimelineSort 
} from './types';
import { HistoryTimelineItem, TimelineGroup } from '../../../shared/types';
import { TimelineBinarySearchImpl } from './BinarySearch';
import { memoize } from './PerformanceOptimization';

// =============================================================================
// TIMELINE DATA MANAGER
// =============================================================================

export class TimelineDataManager {
  private rawItems: HistoryTimelineItem[];
  private sortedItems: HistoryTimelineItem[];
  private filteredItems: HistoryTimelineItem[];
  private groups: TimelineGroup[];
  private indexMap: Map<string, number>;
  private searchIndex: SearchIndex;
  private binarySearch: TimelineBinarySearchImpl;
  private currentFilter: TimelineFilter | null = null;
  private currentSort: TimelineSort;

  // Memoized functions for performance
  private memoizedGroupItems = memoize(this.groupItemsByDate.bind(this), 50);
  private memoizedBuildSearchIndex = memoize(this.buildSearchIndex.bind(this), 10);
  private memoizedFilterItems = memoize(this.filterItems.bind(this), 100);

  constructor(items: HistoryTimelineItem[] = []) {
    this.rawItems = items;
    this.sortedItems = [];
    this.filteredItems = [];
    this.groups = [];
    this.indexMap = new Map();
    this.searchIndex = this.createEmptySearchIndex();
    this.binarySearch = new TimelineBinarySearchImpl([]);
    this.currentSort = { field: 'timestamp', order: 'desc' };

    if (items.length > 0) {
      this.initialize();
    }
  }

  /**
   * Initialize data structures
   */
  private initialize(): void {
    this.sortItems();
    this.buildIndexMap();
    this.buildSearchIndex();
    this.updateBinarySearch();
    this.applyCurrentFilter();
  }

  /**
   * Update the dataset with new items
   */
  updateItems(items: HistoryTimelineItem[]): void {
    this.rawItems = items;
    this.initialize();
  }

  /**
   * Add new items to the dataset
   */
  addItems(items: HistoryTimelineItem[]): void {
    this.rawItems.push(...items);
    this.initialize();
  }

  /**
   * Remove items by IDs
   */
  removeItems(itemIds: string[]): void {
    const idSet = new Set(itemIds);
    this.rawItems = this.rawItems.filter(item => !idSet.has(item.id));
    this.initialize();
  }

  /**
   * Get current timeline data
   */
  getTimelineData(): TimelineData {
    return {
      items: this.filteredItems,
      groups: this.groups,
      totalCount: this.filteredItems.length,
      dateRange: this.getDateRange(),
      indexMap: this.indexMap,
      searchIndex: this.searchIndex
    };
  }

  /**
   * Apply filter to items
   */
  applyFilter(filter: TimelineFilter): void {
    this.currentFilter = filter;
    this.applyCurrentFilter();
  }

  /**
   * Apply sort to items
   */
  applySort(sort: TimelineSort): void {
    this.currentSort = sort;
    this.sortItems();
    this.updateBinarySearch();
    this.applyCurrentFilter();
  }

  /**
   * Search items by text query
   */
  searchItems(query: string): HistoryTimelineItem[] {
    if (!query.trim()) {
      return this.filteredItems;
    }

    const searchTerms = query.toLowerCase().split(/\s+/);
    const matchingIndices = new Set<number>();

    // Search in text index
    for (const term of searchTerms) {
      const indices = this.searchIndex.textIndex.get(term) || new Set();
      if (matchingIndices.size === 0) {
        indices.forEach(i => matchingIndices.add(i));
      } else {
        // Intersection for AND search
        const intersection = new Set();
        matchingIndices.forEach(i => {
          if (indices.has(i)) {
            intersection.add(i);
          }
        });
        matchingIndices.clear();
        intersection.forEach(i => matchingIndices.add(i));
      }
    }

    return Array.from(matchingIndices)
      .map(index => this.sortedItems[index])
      .filter(item => item !== undefined);
  }

  /**
   * Get item by ID
   */
  getItemById(id: string): HistoryTimelineItem | null {
    const index = this.indexMap.get(id);
    return index !== undefined ? this.sortedItems[index] : null;
  }

  /**
   * Get items in date range
   */
  getItemsInDateRange(start: number, end: number): HistoryTimelineItem[] {
    const indices = this.binarySearch.findInDateRange(start, end);
    return indices.map(index => this.sortedItems[index]).filter(item => item !== undefined);
  }

  /**
   * Get visible items for virtual scrolling
   */
  getVisibleItems(startIndex: number, endIndex: number): HistoryTimelineItem[] {
    const safeStart = Math.max(0, startIndex);
    const safeEnd = Math.min(this.filteredItems.length - 1, endIndex);
    
    return this.filteredItems.slice(safeStart, safeEnd + 1);
  }

  /**
   * Get statistics about the dataset
   */
  getStats(): {
    totalItems: number;
    filteredItems: number;
    dateRange: { start: number; end: number };
    domains: string[];
    sessionCount: number;
    itemTypes: Record<string, number>;
  } {
    const dateRange = this.getDateRange();
    const domains = Array.from(new Set(
      this.filteredItems
        .map(item => item.metadata.domain)
        .filter(domain => domain)
    ));

    const sessionIds = new Set(
      this.filteredItems
        .map(item => item.metadata.sessionId)
        .filter(sessionId => sessionId)
    );

    const itemTypes: Record<string, number> = {};
    this.filteredItems.forEach(item => {
      itemTypes[item.type] = (itemTypes[item.type] || 0) + 1;
    });

    return {
      totalItems: this.rawItems.length,
      filteredItems: this.filteredItems.length,
      dateRange,
      domains,
      sessionCount: sessionIds.size,
      itemTypes
    };
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private sortItems(): void {
    const { field, order } = this.currentSort;
    
    this.sortedItems = [...this.rawItems].sort((a, b) => {
      let comparison = 0;
      
      switch (field) {
        case 'timestamp':
          comparison = a.timestamp - b.timestamp;
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'domain':
          const aDomain = a.metadata.domain || '';
          const bDomain = b.metadata.domain || '';
          comparison = aDomain.localeCompare(bDomain);
          break;
        case 'sessionId':
          const aSession = a.metadata.sessionId || '';
          const bSession = b.metadata.sessionId || '';
          comparison = aSession.localeCompare(bSession);
          break;
        default:
          comparison = a.timestamp - b.timestamp;
      }
      
      return order === 'asc' ? comparison : -comparison;
    });
  }

  private buildIndexMap(): void {
    this.indexMap.clear();
    this.sortedItems.forEach((item, index) => {
      this.indexMap.set(item.id, index);
    });
  }

  private buildSearchIndex(): void {
    this.searchIndex = this.memoizedBuildSearchIndex(this.sortedItems);
  }

  private buildSearchIndexImpl(items: HistoryTimelineItem[]): SearchIndex {
    const textIndex = new Map<string, Set<number>>();
    const domainIndex = new Map<string, Set<number>>();
    const sessionIndex = new Map<string, Set<number>>();
    const tagIndex = new Map<string, Set<number>>();
    const dateRangeIndex = new Map<string, Set<number>>();

    items.forEach((item, index) => {
      // Text indexing
      const textTokens = this.tokenizeText(item.title + ' ' + (item.description || ''));
      textTokens.forEach(token => {
        if (!textIndex.has(token)) {
          textIndex.set(token, new Set());
        }
        textIndex.get(token)!.add(index);
      });

      // Domain indexing
      if (item.metadata.domain) {
        if (!domainIndex.has(item.metadata.domain)) {
          domainIndex.set(item.metadata.domain, new Set());
        }
        domainIndex.get(item.metadata.domain)!.add(index);
      }

      // Session indexing
      if (item.metadata.sessionId) {
        if (!sessionIndex.has(item.metadata.sessionId)) {
          sessionIndex.set(item.metadata.sessionId, new Set());
        }
        sessionIndex.get(item.metadata.sessionId)!.add(index);
      }

      // Tag indexing
      if (item.metadata.tags) {
        item.metadata.tags.forEach(tag => {
          if (!tagIndex.has(tag)) {
            tagIndex.set(tag, new Set());
          }
          tagIndex.get(tag)!.add(index);
        });
      }

      // Date range indexing (by day)
      const dateKey = new Date(item.timestamp).toDateString();
      if (!dateRangeIndex.has(dateKey)) {
        dateRangeIndex.set(dateKey, new Set());
      }
      dateRangeIndex.get(dateKey)!.add(index);
    });

    return {
      textIndex,
      domainIndex,
      sessionIndex,
      tagIndex,
      dateRangeIndex
    };
  }

  private updateBinarySearch(): void {
    this.binarySearch.updateItems(this.sortedItems);
  }

  private applyCurrentFilter(): void {
    if (!this.currentFilter) {
      this.filteredItems = this.sortedItems;
    } else {
      this.filteredItems = this.memoizedFilterItems(this.sortedItems, this.currentFilter);
    }
    
    this.groups = this.memoizedGroupItems(this.filteredItems);
  }

  private filterItems(items: HistoryTimelineItem[], filter: TimelineFilter): HistoryTimelineItem[] {
    return items.filter(item => {
      // Text search
      if (filter.searchQuery) {
        const searchText = (item.title + ' ' + (item.description || '')).toLowerCase();
        const queryTerms = filter.searchQuery.toLowerCase().split(/\s+/);
        if (!queryTerms.every(term => searchText.includes(term))) {
          return false;
        }
      }

      // Domain filter
      if (filter.domains && filter.domains.length > 0) {
        if (!item.metadata.domain || !filter.domains.includes(item.metadata.domain)) {
          return false;
        }
      }

      // Session filter
      if (filter.sessionIds && filter.sessionIds.length > 0) {
        if (!item.metadata.sessionId || !filter.sessionIds.includes(item.metadata.sessionId)) {
          return false;
        }
      }

      // Tag filter
      if (filter.tags && filter.tags.length > 0) {
        if (!item.metadata.tags || !filter.tags.some(tag => item.metadata.tags!.includes(tag))) {
          return false;
        }
      }

      // Date range filter
      if (filter.dateRange) {
        if (item.timestamp < filter.dateRange.start || item.timestamp > filter.dateRange.end) {
          return false;
        }
      }

      // Item type filter
      if (filter.itemTypes && filter.itemTypes.length > 0) {
        if (!filter.itemTypes.includes(item.type)) {
          return false;
        }
      }

      return true;
    });
  }

  private groupItemsByDate(items: HistoryTimelineItem[]): TimelineGroup[] {
    const groups = new Map<string, HistoryTimelineItem[]>();
    
    items.forEach(item => {
      const date = new Date(item.timestamp).toDateString();
      if (!groups.has(date)) {
        groups.set(date, []);
      }
      groups.get(date)!.push(item);
    });

    return Array.from(groups.entries())
      .map(([date, groupItems]) => ({
        date,
        items: groupItems,
        stats: {
          totalSessions: new Set(groupItems.map(item => item.metadata.sessionId)).size,
          totalTabs: groupItems.filter(item => item.type === 'tab_event').length,
          totalTime: groupItems.reduce((sum, item) => sum + (item.metadata.duration || 0), 0),
          uniqueDomains: new Set(groupItems.map(item => item.metadata.domain)).size
        }
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  private getDateRange(): { start: number; end: number } {
    if (this.filteredItems.length === 0) {
      return { start: 0, end: 0 };
    }

    const timestamps = this.filteredItems.map(item => item.timestamp);
    return {
      start: Math.min(...timestamps),
      end: Math.max(...timestamps)
    };
  }

  private tokenizeText(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2); // Ignore very short tokens
  }

  private createEmptySearchIndex(): SearchIndex {
    return {
      textIndex: new Map(),
      domainIndex: new Map(),
      sessionIndex: new Map(),
      tagIndex: new Map(),
      dateRangeIndex: new Map()
    };
  }
}

// =============================================================================
// TIMELINE DATA HOOK
// =============================================================================

export function createTimelineDataManager(items: HistoryTimelineItem[]): TimelineDataManager {
  return new TimelineDataManager(items);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Convert session data to timeline items
 */
export function sessionToTimelineItems(sessions: any[]): HistoryTimelineItem[] {
  const items: HistoryTimelineItem[] = [];

  sessions.forEach(session => {
    // Add session start item
    items.push({
      id: `session-start-${session.id}`,
      type: 'session',
      timestamp: session.startTime,
      title: `Session Started: ${session.name || 'Untitled'}`,
      description: session.description,
      icon: 'session-start',
      metadata: {
        sessionId: session.id,
        tabCount: session.tabs?.length || 0,
        duration: session.duration,
        tags: session.tags?.map((tag: any) => tag.name) || []
      }
    });

    // Add tab items
    if (session.tabs) {
      session.tabs.forEach((tab: any, index: number) => {
        items.push({
          id: `tab-${session.id}-${index}`,
          type: 'tab_event',
          timestamp: tab.timestamp || session.startTime,
          title: tab.title,
          description: tab.url,
          icon: 'tab',
          metadata: {
            sessionId: session.id,
            tabId: tab.id,
            url: tab.url,
            domain: extractDomain(tab.url),
            index
          }
        });
      });
    }

    // Add session end item if ended
    if (session.endTime) {
      items.push({
        id: `session-end-${session.id}`,
        type: 'session',
        timestamp: session.endTime,
        title: `Session Ended: ${session.name || 'Untitled'}`,
        description: `Duration: ${formatDuration(session.duration || 0)}`,
        icon: 'session-end',
        metadata: {
          sessionId: session.id,
          duration: session.duration,
          tabCount: session.tabs?.length || 0
        }
      });
    }
  });

  return items.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Format duration in milliseconds to human readable string
 */
function formatDuration(ms: number): string {
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
}