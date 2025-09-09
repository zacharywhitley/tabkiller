/**
 * Navigation History Tracker - Full lifecycle capture of tab navigation
 * Tracks complete browsing paths, referrer chains, and session context
 */

import {
  BrowsingEvent,
  TabEvent,
  NavigationEvent,
  TabInfo
} from '../../shared/types';

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface NavigationEntry {
  id: string;
  tabId: number;
  windowId: number;
  url: string;
  title: string;
  favicon?: string;
  timestamp: number;
  transitionType: NavigationTransitionType;
  referrer?: string;
  loadTime?: number;
  sessionId?: string;
  
  // Navigation context
  navigationIndex: number;
  isMainFrame: boolean;
  isReload: boolean;
  isBackForward: boolean;
  
  // Page metadata
  pageSize?: number;
  httpStatusCode?: number;
  contentType?: string;
  language?: string;
  
  // User interaction context
  userGesture: boolean;
  scrollDepth?: number;
  timeOnPage?: number;
  
  // Performance metrics
  performanceMetrics?: {
    domContentLoaded?: number;
    loadComplete?: number;
    firstContentfulPaint?: number;
    largestContentfulPaint?: number;
    cumulativeLayoutShift?: number;
  };
}

export type NavigationTransitionType = 
  | 'link'
  | 'typed'
  | 'auto_bookmark'
  | 'auto_subframe'
  | 'manual_subframe'
  | 'generated'
  | 'auto_toplevel'
  | 'form_submit'
  | 'reload'
  | 'keyword'
  | 'keyword_generated'
  | 'back_forward'
  | 'redirect'
  | 'unknown';

export interface NavigationChain {
  chainId: string;
  tabId: number;
  entries: NavigationEntry[];
  startTime: number;
  endTime?: number;
  totalTime?: number;
  sessionBoundary?: boolean;
}

export interface NavigationPattern {
  pattern: string;
  frequency: number;
  lastSeen: number;
  domains: string[];
  avgTimeSpent: number;
  sessionCount: number;
}

export interface NavigationHistoryConfig {
  maxEntries: number;
  trackFullLifecycle: boolean;
  enablePerformanceTracking?: boolean;
  enablePatternDetection?: boolean;
  retentionPeriod?: number;
  compressionEnabled?: boolean;
  syncEnabled?: boolean;
}

// =============================================================================
// NAVIGATION HISTORY TRACKER
// =============================================================================

export class NavigationHistoryTracker {
  private config: NavigationHistoryConfig;
  private entries = new Map<string, NavigationEntry>();
  private tabNavigations = new Map<number, NavigationEntry[]>();
  private navigationChains = new Map<string, NavigationChain>();
  private patterns = new Map<string, NavigationPattern>();
  
  private isInitialized: boolean = false;
  private cleanupTimer?: number;
  private lastCleanup = Date.now();

  constructor(config: NavigationHistoryConfig) {
    this.config = {
      enablePerformanceTracking: true,
      enablePatternDetection: true,
      retentionPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
      compressionEnabled: true,
      syncEnabled: true,
      ...config
    };
  }

  /**
   * Initialize navigation history tracking
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Initializing NavigationHistoryTracker...');

      // Load existing history if available
      await this.loadExistingHistory();

      // Set up cleanup timer
      this.cleanupTimer = window.setInterval(
        this.performCleanup.bind(this),
        60000 // 1 minute
      );

      this.isInitialized = true;
      console.log('NavigationHistoryTracker initialized successfully');

    } catch (error) {
      console.error('Failed to initialize NavigationHistoryTracker:', error);
      throw error;
    }
  }

  /**
   * Process tab events for navigation tracking
   */
  async processTabEvent(tabEvent: TabEvent): Promise<void> {
    try {
      switch (tabEvent.type) {
        case 'created':
          await this.handleTabCreated(tabEvent);
          break;
        case 'updated':
          await this.handleTabUpdated(tabEvent);
          break;
        case 'removed':
          await this.handleTabRemoved(tabEvent);
          break;
        case 'activated':
          await this.handleTabActivated(tabEvent);
          break;
      }
    } catch (error) {
      console.error('Error processing tab event for navigation history:', error);
    }
  }

  /**
   * Record browsing events directly
   */
  async recordBrowsingEvent(event: BrowsingEvent): Promise<void> {
    try {
      switch (event.type) {
        case 'navigation_completed':
          await this.recordNavigation(event);
          break;
        case 'page_loaded':
          await this.updatePageLoadMetrics(event);
          break;
        case 'user_interaction':
          await this.recordInteraction(event);
          break;
        case 'tab_closed':
          await this.finalizeTabHistory(event);
          break;
      }
    } catch (error) {
      console.error('Error recording browsing event:', error);
    }
  }

  /**
   * Handle tab creation
   */
  private async handleTabCreated(tabEvent: TabEvent): Promise<void> {
    const tabId = tabEvent.tabId;
    
    if (!this.tabNavigations.has(tabId)) {
      this.tabNavigations.set(tabId, []);
    }

    // If the tab has an initial URL, record it as the first navigation
    if (tabEvent.data?.url && tabEvent.data.url !== 'about:blank') {
      await this.createNavigationEntry(tabEvent, 'auto_toplevel');
    }
  }

  /**
   * Handle tab updates (mainly URL changes)
   */
  private async handleTabUpdated(tabEvent: TabEvent): Promise<void> {
    const changeInfo = tabEvent.data;
    
    // Only process URL changes
    if (!changeInfo?.url) return;

    // Determine transition type
    let transitionType: NavigationTransitionType = 'link';
    
    if (changeInfo.url.startsWith('chrome://') || changeInfo.url.startsWith('about:')) {
      transitionType = 'auto_toplevel';
    }

    await this.createNavigationEntry(tabEvent, transitionType, changeInfo);
  }

  /**
   * Handle tab removal
   */
  private async handleTabRemoved(tabEvent: TabEvent): Promise<void> {
    const tabId = tabEvent.tabId;
    const tabNavigations = this.tabNavigations.get(tabId);

    if (tabNavigations && tabNavigations.length > 0) {
      // Finalize the last navigation entry
      const lastEntry = tabNavigations[tabNavigations.length - 1];
      if (lastEntry) {
        lastEntry.timeOnPage = Date.now() - lastEntry.timestamp;
        
        // Mark the navigation chain as complete
        await this.finalizeNavigationChain(tabId);
      }
    }

    // Keep the navigation history but mark it as closed
    // Don't remove immediately to allow for analysis
  }

  /**
   * Handle tab activation
   */
  private async handleTabActivated(tabEvent: TabEvent): Promise<void> {
    const tabId = tabEvent.tabId;
    const tabNavigations = this.tabNavigations.get(tabId);

    if (tabNavigations && tabNavigations.length > 0) {
      const lastEntry = tabNavigations[tabNavigations.length - 1];
      if (lastEntry && !lastEntry.timeOnPage) {
        // Update time on previous page if switching from another tab
        const timeSinceNavigation = Date.now() - lastEntry.timestamp;
        if (timeSinceNavigation < 60000) { // Only if less than 1 minute
          lastEntry.timeOnPage = timeSinceNavigation;
        }
      }
    }
  }

  /**
   * Create a new navigation entry
   */
  private async createNavigationEntry(
    tabEvent: TabEvent,
    transitionType: NavigationTransitionType,
    changeInfo?: any
  ): Promise<NavigationEntry> {
    const now = Date.now();
    const entryId = `${tabEvent.tabId}_${now}_${Math.random().toString(36).substr(2, 9)}`;

    // Get previous navigation for context
    const tabNavigations = this.tabNavigations.get(tabEvent.tabId) || [];
    const previousEntry = tabNavigations[tabNavigations.length - 1];

    // Finalize previous entry's time on page
    if (previousEntry && !previousEntry.timeOnPage) {
      previousEntry.timeOnPage = now - previousEntry.timestamp;
    }

    // Determine if this is a reload
    const isReload = previousEntry && 
      previousEntry.url === (changeInfo?.url || tabEvent.data?.url);

    // Create navigation entry
    const entry: NavigationEntry = {
      id: entryId,
      tabId: tabEvent.tabId,
      windowId: tabEvent.windowId,
      url: changeInfo?.url || tabEvent.data?.url || '',
      title: changeInfo?.title || tabEvent.data?.title || '',
      favicon: changeInfo?.favIconUrl || tabEvent.data?.favicon,
      timestamp: now,
      transitionType,
      referrer: previousEntry?.url,
      navigationIndex: tabNavigations.length,
      isMainFrame: true,
      isReload,
      isBackForward: transitionType === 'back_forward',
      userGesture: transitionType === 'link' || transitionType === 'typed',
      sessionId: this.getCurrentSessionId()
    };

    // Add performance tracking if enabled
    if (this.config.enablePerformanceTracking && changeInfo?.status === 'loading') {
      entry.performanceMetrics = {
        domContentLoaded: undefined,
        loadComplete: undefined
      };
    }

    // Store the entry
    this.entries.set(entryId, entry);
    tabNavigations.push(entry);
    this.tabNavigations.set(tabEvent.tabId, tabNavigations);

    // Update navigation chain
    await this.updateNavigationChain(tabEvent.tabId, entry);

    // Detect patterns if enabled
    if (this.config.enablePatternDetection) {
      await this.updateNavigationPatterns(entry);
    }

    // Trigger cleanup if needed
    if (this.entries.size > this.config.maxEntries) {
      await this.performCleanup();
    }

    return entry;
  }

  /**
   * Record a navigation event
   */
  private async recordNavigation(event: BrowsingEvent): Promise<void> {
    const tabId = event.tabId;
    if (!tabId) return;

    const tabNavigations = this.tabNavigations.get(tabId) || [];
    const lastEntry = tabNavigations[tabNavigations.length - 1];

    if (lastEntry && lastEntry.url === event.url) {
      // Update existing entry with additional metadata
      if (event.metadata?.loadTime) {
        lastEntry.loadTime = event.metadata.loadTime;
      }
      if (event.metadata?.performanceMetrics) {
        lastEntry.performanceMetrics = {
          ...lastEntry.performanceMetrics,
          ...event.metadata.performanceMetrics
        };
      }
    } else {
      // Create new entry if URL doesn't match
      const tabEvent: TabEvent = {
        type: 'updated',
        tabId,
        windowId: event.windowId || 0,
        timestamp: event.timestamp,
        data: {
          url: event.url,
          title: event.title
        }
      };

      await this.createNavigationEntry(tabEvent, 'link');
    }
  }

  /**
   * Update page load metrics
   */
  private async updatePageLoadMetrics(event: BrowsingEvent): Promise<void> {
    const tabId = event.tabId;
    if (!tabId) return;

    const tabNavigations = this.tabNavigations.get(tabId);
    if (!tabNavigations) return;

    const lastEntry = tabNavigations[tabNavigations.length - 1];
    if (lastEntry && lastEntry.url === event.url) {
      // Update load metrics
      if (event.metadata?.loadTime) {
        lastEntry.loadTime = event.metadata.loadTime;
      }
      
      if (event.metadata?.performanceMetrics) {
        lastEntry.performanceMetrics = {
          ...lastEntry.performanceMetrics,
          ...event.metadata.performanceMetrics
        };
      }

      // Update page metadata
      if (event.metadata?.pageSize) {
        lastEntry.pageSize = event.metadata.pageSize;
      }
      if (event.metadata?.httpStatusCode) {
        lastEntry.httpStatusCode = event.metadata.httpStatusCode;
      }
      if (event.metadata?.contentType) {
        lastEntry.contentType = event.metadata.contentType;
      }
    }
  }

  /**
   * Record user interactions
   */
  private async recordInteraction(event: BrowsingEvent): Promise<void> {
    const tabId = event.tabId;
    if (!tabId) return;

    const tabNavigations = this.tabNavigations.get(tabId);
    if (!tabNavigations) return;

    const lastEntry = tabNavigations[tabNavigations.length - 1];
    if (lastEntry && lastEntry.url === event.url) {
      // Update scroll depth if it's a scroll event
      if (event.metadata?.interactionType === 'scroll' && event.metadata?.scrollPosition) {
        const scrollY = event.metadata.scrollPosition.y;
        const pageHeight = event.metadata.scrollPosition.height || 1;
        lastEntry.scrollDepth = Math.max(
          lastEntry.scrollDepth || 0,
          (scrollY / pageHeight) * 100
        );
      }
    }
  }

  /**
   * Finalize tab history when tab is closed
   */
  private async finalizeTabHistory(event: BrowsingEvent): Promise<void> {
    const tabId = event.tabId;
    if (!tabId) return;

    const tabNavigations = this.tabNavigations.get(tabId);
    if (!tabNavigations) return;

    // Finalize the last entry
    const lastEntry = tabNavigations[tabNavigations.length - 1];
    if (lastEntry) {
      if (!lastEntry.timeOnPage) {
        lastEntry.timeOnPage = Date.now() - lastEntry.timestamp;
      }

      // Add final metrics from event
      if (event.metadata?.totalTime) {
        lastEntry.timeOnPage = event.metadata.totalTime;
      }
      if (event.metadata?.interactionSummary) {
        // Add interaction summary to metadata
        lastEntry.scrollDepth = event.metadata.interactionSummary.scrollEvents > 0 ? 
          lastEntry.scrollDepth || 50 : 0;
      }
    }

    // Finalize navigation chain
    await this.finalizeNavigationChain(tabId);
  }

  /**
   * Update navigation chain for a tab
   */
  private async updateNavigationChain(tabId: number, entry: NavigationEntry): Promise<void> {
    const chainId = `chain_${tabId}_${entry.sessionId}`;
    let chain = this.navigationChains.get(chainId);

    if (!chain) {
      // Create new chain
      chain = {
        chainId,
        tabId,
        entries: [],
        startTime: entry.timestamp
      };
      this.navigationChains.set(chainId, chain);
    }

    // Add entry to chain
    chain.entries.push(entry);
    chain.endTime = entry.timestamp;
    chain.totalTime = chain.endTime - chain.startTime;
  }

  /**
   * Finalize navigation chain
   */
  private async finalizeNavigationChain(tabId: number): Promise<void> {
    // Find and finalize all chains for this tab
    for (const [chainId, chain] of this.navigationChains) {
      if (chain.tabId === tabId && !chain.sessionBoundary) {
        chain.endTime = Date.now();
        chain.totalTime = chain.endTime - chain.startTime;
        chain.sessionBoundary = true;
      }
    }
  }

  /**
   * Update navigation patterns
   */
  private async updateNavigationPatterns(entry: NavigationEntry): Promise<void> {
    try {
      const url = new URL(entry.url);
      const domain = url.hostname;
      
      // Create pattern key (could be enhanced with more sophisticated pattern detection)
      const patternKey = domain;

      let pattern = this.patterns.get(patternKey);
      if (!pattern) {
        pattern = {
          pattern: patternKey,
          frequency: 0,
          lastSeen: 0,
          domains: [],
          avgTimeSpent: 0,
          sessionCount: 0
        };
        this.patterns.set(patternKey, pattern);
      }

      // Update pattern
      pattern.frequency++;
      pattern.lastSeen = entry.timestamp;
      
      if (!pattern.domains.includes(domain)) {
        pattern.domains.push(domain);
      }

      // Update average time spent (if we have time data)
      if (entry.timeOnPage) {
        const totalTime = pattern.avgTimeSpent * (pattern.frequency - 1) + entry.timeOnPage;
        pattern.avgTimeSpent = totalTime / pattern.frequency;
      }

    } catch (error) {
      // Invalid URL, skip pattern update
    }
  }

  /**
   * Load existing history (placeholder)
   */
  private async loadExistingHistory(): Promise<void> {
    // In a real implementation, this would load from storage
    // For now, this is a placeholder
  }

  /**
   * Process sync updates from other contexts
   */
  async processSyncUpdate(update: any): Promise<void> {
    try {
      if (update.type === 'navigation_entry') {
        const entry = update.entry as NavigationEntry;
        this.entries.set(entry.id, entry);
        
        // Add to tab navigations
        const tabNavigations = this.tabNavigations.get(entry.tabId) || [];
        tabNavigations.push(entry);
        this.tabNavigations.set(entry.tabId, tabNavigations);
      }
      
    } catch (error) {
      console.error('Error processing sync update:', error);
    }
  }

  /**
   * Perform cleanup of old entries
   */
  private async performCleanup(): Promise<void> {
    try {
      const now = Date.now();
      const cutoffTime = now - this.config.retentionPeriod!;
      let cleanedCount = 0;

      // Clean old entries
      for (const [entryId, entry] of this.entries) {
        if (entry.timestamp < cutoffTime) {
          this.entries.delete(entryId);
          cleanedCount++;
        }
      }

      // Clean old tab navigations
      for (const [tabId, navigations] of this.tabNavigations) {
        const filteredNavigations = navigations.filter(nav => nav.timestamp >= cutoffTime);
        if (filteredNavigations.length === 0) {
          this.tabNavigations.delete(tabId);
        } else {
          this.tabNavigations.set(tabId, filteredNavigations);
        }
      }

      // Clean old chains
      for (const [chainId, chain] of this.navigationChains) {
        if (chain.startTime < cutoffTime) {
          this.navigationChains.delete(chainId);
        }
      }

      // Clean old patterns (keep frequently used ones)
      for (const [patternKey, pattern] of this.patterns) {
        if (pattern.lastSeen < cutoffTime && pattern.frequency < 5) {
          this.patterns.delete(patternKey);
        }
      }

      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} old navigation entries`);
      }

      this.lastCleanup = now;

    } catch (error) {
      console.error('Error during navigation history cleanup:', error);
    }
  }

  /**
   * Get current session ID (would integrate with session detection)
   */
  private getCurrentSessionId(): string {
    // This would typically come from the session detection system
    return 'session_' + Date.now();
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  /**
   * Get navigation history for a tab
   */
  getHistory(tabId?: number): NavigationEntry[] {
    if (tabId) {
      return this.tabNavigations.get(tabId) || [];
    }
    
    // Return all entries sorted by timestamp
    return Array.from(this.entries.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get navigation chains
   */
  getNavigationChains(tabId?: number): NavigationChain[] {
    if (tabId) {
      return Array.from(this.navigationChains.values()).filter(chain => chain.tabId === tabId);
    }
    
    return Array.from(this.navigationChains.values());
  }

  /**
   * Get navigation patterns
   */
  getNavigationPatterns(): NavigationPattern[] {
    return Array.from(this.patterns.values())
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Search navigation history
   */
  searchHistory(query: string): NavigationEntry[] {
    const lowerQuery = query.toLowerCase();
    
    return Array.from(this.entries.values())
      .filter(entry => 
        entry.url.toLowerCase().includes(lowerQuery) ||
        entry.title.toLowerCase().includes(lowerQuery)
      )
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100); // Limit results
  }

  /**
   * Get history statistics
   */
  getHistoryStats(): any {
    const totalEntries = this.entries.size;
    const totalTabs = this.tabNavigations.size;
    const totalChains = this.navigationChains.size;
    const totalPatterns = this.patterns.size;
    
    const domains = new Set<string>();
    let totalTimeSpent = 0;
    let totalLoadTime = 0;
    let entriesWithLoadTime = 0;

    for (const entry of this.entries.values()) {
      try {
        const url = new URL(entry.url);
        domains.add(url.hostname);
      } catch {}

      if (entry.timeOnPage) {
        totalTimeSpent += entry.timeOnPage;
      }
      if (entry.loadTime) {
        totalLoadTime += entry.loadTime;
        entriesWithLoadTime++;
      }
    }

    return {
      totalEntries,
      totalTabs,
      totalChains,
      totalPatterns,
      uniqueDomains: domains.size,
      totalTimeSpent,
      averageLoadTime: entriesWithLoadTime > 0 ? totalLoadTime / entriesWithLoadTime : 0,
      oldestEntry: Math.min(...Array.from(this.entries.values()).map(e => e.timestamp)),
      newestEntry: Math.max(...Array.from(this.entries.values()).map(e => e.timestamp))
    };
  }

  /**
   * Update max entries limit
   */
  async updateMaxEntries(maxEntries: number): Promise<void> {
    this.config.maxEntries = maxEntries;
    
    // Trigger cleanup if we're over the new limit
    if (this.entries.size > maxEntries) {
      await this.performCleanup();
    }
  }

  /**
   * Export navigation history
   */
  exportHistory(): any {
    return {
      entries: Array.from(this.entries.values()),
      tabNavigations: Array.from(this.tabNavigations.entries()),
      navigationChains: Array.from(this.navigationChains.values()),
      patterns: Array.from(this.patterns.values()),
      configuration: this.config,
      statistics: this.getHistoryStats(),
      exportedAt: Date.now()
    };
  }

  /**
   * Force cleanup
   */
  async cleanup(): Promise<void> {
    await this.performCleanup();
  }

  /**
   * Reset navigation history
   */
  async reset(): Promise<void> {
    try {
      console.log('Resetting NavigationHistoryTracker...');
      
      this.entries.clear();
      this.tabNavigations.clear();
      this.navigationChains.clear();
      this.patterns.clear();
      
      console.log('NavigationHistoryTracker reset complete');
    } catch (error) {
      console.error('Error resetting NavigationHistoryTracker:', error);
    }
  }

  /**
   * Shutdown navigation history tracker
   */
  async shutdown(): Promise<void> {
    try {
      console.log('Shutting down NavigationHistoryTracker...');
      
      // Clear cleanup timer
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = undefined;
      }

      // Perform final cleanup
      await this.performCleanup();

      this.isInitialized = false;
      console.log('NavigationHistoryTracker shutdown complete');
      
    } catch (error) {
      console.error('Error shutting down NavigationHistoryTracker:', error);
    }
  }
}