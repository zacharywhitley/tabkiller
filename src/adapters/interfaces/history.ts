/**
 * Cross-browser history API interface
 * Provides consistent browsing history functionality across all browsers
 */

import { EventHandler, AdapterResult, BaseBrowserAdapter } from './base';

/**
 * Browsing history item
 */
export interface HistoryItem {
  id: string;
  url: string;
  title?: string;
  lastVisitTime: number;
  visitCount: number;
  typedCount?: number;
}

/**
 * Visit item details
 */
export interface VisitItem {
  id: string;
  visitId: string;
  visitTime: number;
  referringVisitId?: string;
  transition: TransitionType;
  isLocal?: boolean;
}

/**
 * Transition types for navigation
 */
export type TransitionType = 
  | 'link'           // User clicked a link
  | 'typed'          // User typed the URL
  | 'auto_bookmark'  // User clicked a bookmark
  | 'auto_subframe'  // Subframe navigation
  | 'manual_subframe'// Manual subframe navigation
  | 'generated'      // Generated (like from a keyword search)
  | 'start_page'     // Start page
  | 'form_submit'    // Form submission
  | 'reload'         // Page reload
  | 'keyword'        // Keyword generated
  | 'keyword_generated'  // Generated from keyword
  | 'auto_toplevel'  // Auto navigation to top level
  | 'unknown';       // Unknown transition

/**
 * History search query
 */
export interface HistoryQuery {
  text?: string;          // Text to search for in URL and title
  startTime?: number;     // Limit results to after this time (milliseconds since epoch)
  endTime?: number;       // Limit results to before this time (milliseconds since epoch)
  maxResults?: number;    // Maximum number of results (default 100)
}

/**
 * URL details for adding to history
 */
export interface AddUrlDetails {
  url: string;
  title?: string;
  visitTime?: number;
  transition?: TransitionType;
}

/**
 * History deletion range
 */
export interface DeletionRange {
  startTime: number;      // Start time (milliseconds since epoch)
  endTime: number;        // End time (milliseconds since epoch)
}

/**
 * History events
 */
export interface HistoryVisitedEvent {
  historyItem: HistoryItem;
}

export interface HistoryRemovedEvent {
  allHistory: boolean;
  urls?: string[];
}

/**
 * Cross-browser history adapter interface
 */
export interface HistoryAdapter extends BaseBrowserAdapter {
  // Search operations
  search(query: HistoryQuery): Promise<AdapterResult<HistoryItem[]>>;
  getVisits(url: string): Promise<AdapterResult<VisitItem[]>>;
  
  // URL operations
  addUrl(details: AddUrlDetails): Promise<AdapterResult<void>>;
  deleteUrl(url: string): Promise<AdapterResult<void>>;
  deleteRange(range: DeletionRange): Promise<AdapterResult<void>>;
  deleteAll(): Promise<AdapterResult<void>>;
  
  // Advanced search
  searchByTitle(title: string, options?: Omit<HistoryQuery, 'text'>): Promise<AdapterResult<HistoryItem[]>>;
  searchByUrl(urlPattern: string, options?: Omit<HistoryQuery, 'text'>): Promise<AdapterResult<HistoryItem[]>>;
  searchByTimeRange(startTime: number, endTime: number, options?: Omit<HistoryQuery, 'startTime' | 'endTime'>): Promise<AdapterResult<HistoryItem[]>>;
  
  // Statistics and analysis
  getMostVisited(options?: { 
    maxResults?: number; 
    timeRange?: DeletionRange;
    includeTitles?: boolean;
  }): Promise<AdapterResult<HistoryItem[]>>;
  
  getRecentlyVisited(options?: { 
    maxResults?: number; 
    hoursBack?: number;
    includeTitles?: boolean;
  }): Promise<AdapterResult<HistoryItem[]>>;
  
  getDomainStatistics(options?: { 
    timeRange?: DeletionRange;
    minVisits?: number;
  }): Promise<AdapterResult<Array<{
    domain: string;
    visitCount: number;
    lastVisit: number;
    urls: string[];
  }>>>;
  
  // Visit patterns
  getVisitsByDay(days: number): Promise<AdapterResult<Array<{
    date: string;
    visits: VisitItem[];
    count: number;
  }>>>;
  
  getVisitsByHour(date: string): Promise<AdapterResult<Array<{
    hour: number;
    visits: VisitItem[];
    count: number;
  }>>>;
  
  // URL utilities
  isUrlInHistory(url: string): Promise<AdapterResult<boolean>>;
  getUrlDetails(url: string): Promise<AdapterResult<HistoryItem | null>>;
  
  // Batch operations
  addMultipleUrls(urls: AddUrlDetails[]): Promise<AdapterResult<{ 
    successful: number; 
    failed: Array<{ url: string; error: Error }>;
  }>>;
  
  deleteMultipleUrls(urls: string[]): Promise<AdapterResult<{ 
    successful: number; 
    failed: Array<{ url: string; error: Error }>;
  }>>;
  
  // Export/import
  exportHistory(options?: {
    format?: 'json' | 'csv';
    timeRange?: DeletionRange;
    includeVisits?: boolean;
  }): Promise<AdapterResult<string>>;
  
  importHistory(data: string, options?: {
    format?: 'json' | 'csv';
    overwrite?: boolean;
    preserveTimestamps?: boolean;
  }): Promise<AdapterResult<{
    imported: number;
    skipped: number;
    errors: Array<{ item: any; error: Error }>;
  }>>;
  
  // Events
  onVisited?: EventHandler<HistoryVisitedEvent>;
  onVisitRemoved?: EventHandler<HistoryRemovedEvent>;
  
  // Browser-specific capabilities
  supportsHistoryAdd(): boolean;
  supportsHistoryDelete(): boolean;
  supportsVisitDetails(): boolean;
  supportsTransitionTypes(): boolean;
  getMaxHistoryItems(): number | null;
  getMaxSearchResults(): number | null;
}

/**
 * History search utilities
 */
export interface HistorySearchUtils {
  // Advanced search
  fuzzySearch(query: string, items: HistoryItem[]): HistoryItem[];
  searchByDomain(domain: string, items: HistoryItem[]): HistoryItem[];
  searchByTimePattern(pattern: 'morning' | 'afternoon' | 'evening' | 'night', items: HistoryItem[]): HistoryItem[];
  
  // Filtering
  filterByVisitCount(items: HistoryItem[], minCount: number): HistoryItem[];
  filterByRecency(items: HistoryItem[], hoursBack: number): HistoryItem[];
  filterByPattern(items: HistoryItem[], pattern: RegExp): HistoryItem[];
  
  // Sorting
  sortByRelevance(query: string, items: HistoryItem[]): HistoryItem[];
  sortByVisitCount(items: HistoryItem[], descending?: boolean): HistoryItem[];
  sortByLastVisit(items: HistoryItem[], descending?: boolean): HistoryItem[];
  sortByTitle(items: HistoryItem[]): HistoryItem[];
  
  // Grouping
  groupByDomain(items: HistoryItem[]): Record<string, HistoryItem[]>;
  groupByDate(items: HistoryItem[]): Record<string, HistoryItem[]>;
  groupByFrequency(items: HistoryItem[]): { frequent: HistoryItem[]; moderate: HistoryItem[]; rare: HistoryItem[] };
  
  // Analysis
  extractDomain(url: string): string;
  calculateRelevanceScore(query: string, item: HistoryItem): number;
  findSimilarUrls(url: string, items: HistoryItem[]): HistoryItem[];
  detectBrowsingPatterns(items: HistoryItem[]): {
    peakHours: number[];
    favoriteDomains: string[];
    averageSessionLength: number;
    browsingTrends: Array<{ period: string; change: number }>;
  };
}

/**
 * History privacy utilities
 */
export interface HistoryPrivacyUtils {
  // Anonymization
  anonymizeHistory(items: HistoryItem[]): HistoryItem[];
  removePersonalData(items: HistoryItem[]): HistoryItem[];
  
  // Filtering sensitive content
  filterSensitiveUrls(items: HistoryItem[], patterns?: RegExp[]): HistoryItem[];
  detectSensitiveContent(item: HistoryItem): boolean;
  
  // Safe export
  createPrivacySafeExport(items: HistoryItem[], options?: {
    excludePersonalData?: boolean;
    hashUrls?: boolean;
    generalizeTimestamps?: boolean;
  }): any;
}