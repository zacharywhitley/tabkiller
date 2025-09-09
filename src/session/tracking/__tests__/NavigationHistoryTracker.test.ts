/**
 * Tests for NavigationHistoryTracker
 * Comprehensive test coverage for navigation history tracking with full lifecycle capture
 */

import { NavigationHistoryTracker, NavigationHistoryConfig } from '../NavigationHistoryTracker';
import { TabEvent, BrowsingEvent } from '../../../shared/types';

describe('NavigationHistoryTracker', () => {
  let tracker: NavigationHistoryTracker;
  let config: NavigationHistoryConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    config = {
      maxEntries: 1000,
      trackFullLifecycle: true,
      enablePerformanceTracking: true,
      enablePatternDetection: true,
      retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
      compressionEnabled: true,
      syncEnabled: true
    };

    tracker = new NavigationHistoryTracker(config);
  });

  afterEach(async () => {
    if (tracker) {
      await tracker.shutdown();
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully with default configuration', async () => {
      await tracker.initialize();

      const stats = tracker.getHistoryStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.totalChains).toBe(0);
    });

    it('should handle initialization errors gracefully', async () => {
      // Mock a failed initialization scenario
      const originalSetInterval = global.setInterval;
      global.setInterval = jest.fn().mockImplementation(() => {
        throw new Error('Timer error');
      });

      await expect(tracker.initialize()).rejects.toThrow('Timer error');

      global.setInterval = originalSetInterval;
    });
  });

  describe('Tab Event Processing', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should process tab creation events', async () => {
      const tabEvent: TabEvent = {
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: {
          url: 'https://example.com',
          title: 'Example Page'
        }
      };

      await tracker.processTabEvent(tabEvent);

      const history = tracker.getHistory(1);
      expect(history).toHaveLength(1);
      expect(history[0].url).toBe('https://example.com');
      expect(history[0].title).toBe('Example Page');
      expect(history[0].transitionType).toBe('auto_toplevel');
    });

    it('should process tab update events with URL changes', async () => {
      // First create a tab
      const createEvent: TabEvent = {
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: { url: 'https://initial.com', title: 'Initial' }
      };
      await tracker.processTabEvent(createEvent);

      // Then update it with a new URL
      const updateEvent: TabEvent = {
        type: 'updated',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now() + 1000,
        data: {
          url: 'https://updated.com',
          title: 'Updated Page'
        }
      };

      await tracker.processTabEvent(updateEvent);

      const history = tracker.getHistory(1);
      expect(history).toHaveLength(2);
      expect(history[0].url).toBe('https://initial.com');
      expect(history[1].url).toBe('https://updated.com');
      expect(history[1].referrer).toBe('https://initial.com');
      expect(history[0].timeOnPage).toBeGreaterThan(0);
    });

    it('should detect reload navigation', async () => {
      // Create initial navigation
      const createEvent: TabEvent = {
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: { url: 'https://example.com', title: 'Example' }
      };
      await tracker.processTabEvent(createEvent);

      // Reload the same URL
      const reloadEvent: TabEvent = {
        type: 'updated',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now() + 1000,
        data: {
          url: 'https://example.com',
          title: 'Example'
        }
      };

      await tracker.processTabEvent(reloadEvent);

      const history = tracker.getHistory(1);
      expect(history).toHaveLength(2);
      expect(history[1].isReload).toBe(true);
      expect(history[1].transitionType).toBe('link');
    });

    it('should handle tab removal and finalize history', async () => {
      // Create and navigate
      await tracker.processTabEvent({
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: { url: 'https://example.com', title: 'Example' }
      });

      // Wait and remove
      await new Promise(resolve => setTimeout(resolve, 10));
      await tracker.processTabEvent({
        type: 'removed',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now() + 1000
      });

      const history = tracker.getHistory(1);
      expect(history).toHaveLength(1);
      expect(history[0].timeOnPage).toBeGreaterThan(0);

      // Navigation chain should be finalized
      const chains = tracker.getNavigationChains(1);
      expect(chains).toHaveLength(1);
      expect(chains[0].sessionBoundary).toBe(true);
    });

    it('should handle tab activation timing', async () => {
      // Create two tabs
      await tracker.processTabEvent({
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: { url: 'https://tab1.com', title: 'Tab 1' }
      });

      await tracker.processTabEvent({
        type: 'created',
        tabId: 2,
        windowId: 1,
        timestamp: Date.now() + 100,
        data: { url: 'https://tab2.com', title: 'Tab 2' }
      });

      // Activate tab 2 after some time
      await new Promise(resolve => setTimeout(resolve, 10));
      await tracker.processTabEvent({
        type: 'activated',
        tabId: 2,
        windowId: 1,
        timestamp: Date.now() + 200
      });

      const tab1History = tracker.getHistory(1);
      expect(tab1History[0].timeOnPage).toBeDefined();
    });
  });

  describe('Browsing Event Recording', () => {
    beforeEach(async () => {
      await tracker.initialize();

      // Create initial tab
      await tracker.processTabEvent({
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: { url: 'https://example.com', title: 'Example' }
      });
    });

    it('should record navigation events with performance metrics', async () => {
      const navigationEvent: BrowsingEvent = {
        type: 'navigation_completed',
        timestamp: Date.now(),
        tabId: 1,
        windowId: 1,
        url: 'https://example.com',
        title: 'Example Page',
        metadata: {
          loadTime: 1500,
          performanceMetrics: {
            domContentLoaded: 800,
            loadComplete: 1500,
            firstContentfulPaint: 600
          }
        }
      };

      await tracker.recordBrowsingEvent(navigationEvent);

      const history = tracker.getHistory(1);
      expect(history[0].loadTime).toBe(1500);
      expect(history[0].performanceMetrics?.domContentLoaded).toBe(800);
      expect(history[0].performanceMetrics?.firstContentfulPaint).toBe(600);
    });

    it('should record page load metrics', async () => {
      const pageLoadEvent: BrowsingEvent = {
        type: 'page_loaded',
        timestamp: Date.now(),
        tabId: 1,
        url: 'https://example.com',
        title: 'Example Page',
        metadata: {
          loadTime: 2000,
          pageSize: 500000,
          httpStatusCode: 200,
          contentType: 'text/html'
        }
      };

      await tracker.recordBrowsingEvent(pageLoadEvent);

      const history = tracker.getHistory(1);
      expect(history[0].loadTime).toBe(2000);
      expect(history[0].pageSize).toBe(500000);
      expect(history[0].httpStatusCode).toBe(200);
      expect(history[0].contentType).toBe('text/html');
    });

    it('should record user interactions and scroll depth', async () => {
      const scrollEvent: BrowsingEvent = {
        type: 'user_interaction',
        timestamp: Date.now(),
        tabId: 1,
        url: 'https://example.com',
        metadata: {
          interactionType: 'scroll',
          scrollPosition: { x: 0, y: 800, height: 2000 }
        }
      };

      await tracker.recordBrowsingEvent(scrollEvent);

      const history = tracker.getHistory(1);
      expect(history[0].scrollDepth).toBe(40); // 800/2000 * 100
    });

    it('should finalize tab history on closure', async () => {
      const closureEvent: BrowsingEvent = {
        type: 'tab_closed',
        timestamp: Date.now() + 5000,
        tabId: 1,
        metadata: {
          totalTime: 5000,
          interactionSummary: {
            scrollEvents: 10,
            clickEvents: 5,
            formInteractions: 2
          }
        }
      };

      await tracker.recordBrowsingEvent(closureEvent);

      const history = tracker.getHistory(1);
      expect(history[0].timeOnPage).toBe(5000);
      expect(history[0].scrollDepth).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Navigation Chains', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should create and manage navigation chains', async () => {
      const tabId = 1;
      const sessionId = 'session_123';

      // Create multiple navigation entries
      const urls = [
        'https://start.com',
        'https://middle.com',
        'https://end.com'
      ];

      for (let i = 0; i < urls.length; i++) {
        await tracker.processTabEvent({
          type: i === 0 ? 'created' : 'updated',
          tabId,
          windowId: 1,
          timestamp: Date.now() + (i * 1000),
          data: { url: urls[i], title: `Page ${i + 1}` }
        });
      }

      const chains = tracker.getNavigationChains(tabId);
      expect(chains).toHaveLength(1);
      expect(chains[0].entries).toHaveLength(3);
      expect(chains[0].startTime).toBeLessThan(chains[0].endTime!);
      expect(chains[0].totalTime).toBeGreaterThan(0);
    });

    it('should finalize navigation chains', async () => {
      await tracker.processTabEvent({
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: { url: 'https://example.com', title: 'Example' }
      });

      await tracker.processTabEvent({
        type: 'removed',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now() + 1000
      });

      const chains = tracker.getNavigationChains(1);
      expect(chains[0].sessionBoundary).toBe(true);
      expect(chains[0].endTime).toBeDefined();
    });
  });

  describe('Navigation Patterns', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should detect and track navigation patterns', async () => {
      // Create multiple navigations to the same domain
      const events = [
        { url: 'https://example.com/page1', title: 'Page 1' },
        { url: 'https://example.com/page2', title: 'Page 2' },
        { url: 'https://test.com/page1', title: 'Test 1' },
        { url: 'https://example.com/page3', title: 'Page 3' }
      ];

      for (let i = 0; i < events.length; i++) {
        await tracker.processTabEvent({
          type: i === 0 ? 'created' : 'updated',
          tabId: 1,
          windowId: 1,
          timestamp: Date.now() + (i * 1000),
          data: events[i]
        });
      }

      const patterns = tracker.getNavigationPatterns();
      expect(patterns.length).toBeGreaterThan(0);
      
      const examplePattern = patterns.find(p => p.pattern === 'example.com');
      expect(examplePattern).toBeDefined();
      expect(examplePattern?.frequency).toBe(3);
      expect(examplePattern?.domains).toContain('example.com');
    });

    it('should update pattern statistics', async () => {
      // Create navigation with time on page
      await tracker.processTabEvent({
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: { url: 'https://example.com', title: 'Example' }
      });

      // Simulate time passage and finalization
      await new Promise(resolve => setTimeout(resolve, 10));
      await tracker.processTabEvent({
        type: 'updated',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now() + 1000,
        data: { url: 'https://other.com', title: 'Other' }
      });

      const patterns = tracker.getNavigationPatterns();
      const examplePattern = patterns.find(p => p.pattern === 'example.com');
      expect(examplePattern?.avgTimeSpent).toBeGreaterThan(0);
    });
  });

  describe('Search and Query', () => {
    beforeEach(async () => {
      await tracker.initialize();

      // Create test data
      const testData = [
        { url: 'https://github.com/user/repo', title: 'GitHub Repository' },
        { url: 'https://stackoverflow.com/questions/123', title: 'Stack Overflow Question' },
        { url: 'https://example.com/test', title: 'Test Example Page' },
        { url: 'https://docs.example.com/guide', title: 'Documentation Guide' }
      ];

      for (let i = 0; i < testData.length; i++) {
        await tracker.processTabEvent({
          type: i === 0 ? 'created' : 'updated',
          tabId: 1,
          windowId: 1,
          timestamp: Date.now() + (i * 1000),
          data: testData[i]
        });
      }
    });

    it('should search history by URL', async () => {
      const results = tracker.searchHistory('github');
      expect(results).toHaveLength(1);
      expect(results[0].url).toContain('github.com');
    });

    it('should search history by title', async () => {
      const results = tracker.searchHistory('stack overflow');
      expect(results).toHaveLength(1);
      expect(results[0].title).toContain('Stack Overflow');
    });

    it('should search history case insensitively', async () => {
      const results = tracker.searchHistory('DOCUMENTATION');
      expect(results).toHaveLength(1);
      expect(results[0].title).toContain('Documentation');
    });

    it('should limit search results', async () => {
      // The default limit should be 100, but we only have 4 entries
      const results = tracker.searchHistory('example');
      expect(results.length).toBeLessThanOrEqual(100);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Statistics and Metrics', () => {
    beforeEach(async () => {
      await tracker.initialize();

      // Create comprehensive test data
      const testNavigations = [
        { tabId: 1, url: 'https://example.com', title: 'Example 1' },
        { tabId: 1, url: 'https://example.com/page2', title: 'Example 2' },
        { tabId: 2, url: 'https://test.com', title: 'Test 1' },
        { tabId: 2, url: 'https://github.com', title: 'GitHub' }
      ];

      for (let i = 0; i < testNavigations.length; i++) {
        const nav = testNavigations[i];
        await tracker.processTabEvent({
          type: 'created',
          tabId: nav.tabId,
          windowId: 1,
          timestamp: Date.now() + (i * 1000),
          data: { url: nav.url, title: nav.title }
        });
      }
    });

    it('should provide accurate history statistics', () => {
      const stats = tracker.getHistoryStats();
      
      expect(stats.totalEntries).toBe(4);
      expect(stats.totalTabs).toBe(2);
      expect(stats.uniqueDomains).toBe(3);
      expect(stats.totalChains).toBeGreaterThan(0);
      expect(stats.oldestEntry).toBeGreaterThan(0);
      expect(stats.newestEntry).toBeGreaterThan(stats.oldestEntry);
    });

    it('should calculate load time averages', async () => {
      // Add performance data to some entries
      await tracker.recordBrowsingEvent({
        type: 'page_loaded',
        timestamp: Date.now(),
        tabId: 1,
        url: 'https://example.com',
        metadata: { loadTime: 1000 }
      });

      await tracker.recordBrowsingEvent({
        type: 'page_loaded',
        timestamp: Date.now(),
        tabId: 2,
        url: 'https://test.com',
        metadata: { loadTime: 2000 }
      });

      const stats = tracker.getHistoryStats();
      expect(stats.averageLoadTime).toBe(1500); // (1000 + 2000) / 2
    });
  });

  describe('Data Management', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should update max entries limit', async () => {
      await tracker.updateMaxEntries(500);

      // Create more entries than the new limit
      for (let i = 0; i < 600; i++) {
        await tracker.processTabEvent({
          type: 'created',
          tabId: i + 1,
          windowId: 1,
          timestamp: Date.now() + i,
          data: { url: `https://example.com/page${i}`, title: `Page ${i}` }
        });
      }

      // Should trigger cleanup
      const history = tracker.getHistory();
      expect(history.length).toBeLessThanOrEqual(500);
    });

    it('should handle sync updates', async () => {
      const syncUpdate = {
        type: 'navigation_entry',
        entry: {
          id: 'sync_entry_1',
          tabId: 99,
          windowId: 1,
          url: 'https://synced.com',
          title: 'Synced Page',
          timestamp: Date.now(),
          transitionType: 'link',
          navigationIndex: 0,
          isMainFrame: true,
          isReload: false,
          isBackForward: false,
          userGesture: true
        }
      };

      await tracker.processSyncUpdate(syncUpdate);

      const history = tracker.getHistory(99);
      expect(history).toHaveLength(1);
      expect(history[0].url).toBe('https://synced.com');
      expect(history[0].title).toBe('Synced Page');
    });

    it('should perform cleanup of old entries', async () => {
      // Create entries with old timestamps
      const oldTimestamp = Date.now() - (48 * 60 * 60 * 1000); // 48 hours ago

      await tracker.processTabEvent({
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: oldTimestamp,
        data: { url: 'https://old.com', title: 'Old Page' }
      });

      // Force cleanup
      await tracker.cleanup();

      // Old entries should be cleaned up based on retention period
      const stats = tracker.getHistoryStats();
      // With 24 hour retention, 48 hour old entry should be cleaned
      expect(stats.totalEntries).toBe(0);
    });
  });

  describe('Export and Import', () => {
    beforeEach(async () => {
      await tracker.initialize();

      // Create test data
      await tracker.processTabEvent({
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: { url: 'https://example.com', title: 'Example' }
      });
    });

    it('should export navigation history', () => {
      const exported = tracker.exportHistory();

      expect(exported).toHaveProperty('entries');
      expect(exported).toHaveProperty('tabNavigations');
      expect(exported).toHaveProperty('navigationChains');
      expect(exported).toHaveProperty('patterns');
      expect(exported).toHaveProperty('configuration');
      expect(exported).toHaveProperty('statistics');
      expect(exported).toHaveProperty('exportedAt');

      expect(exported.entries).toHaveLength(1);
      expect(exported.entries[0].url).toBe('https://example.com');
    });

    it('should include comprehensive statistics in export', () => {
      const exported = tracker.exportHistory();
      const stats = exported.statistics;

      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('totalTabs');
      expect(stats).toHaveProperty('uniqueDomains');
      expect(stats.totalEntries).toBe(1);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should handle invalid URLs gracefully', async () => {
      const invalidUrlEvent: TabEvent = {
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: { url: 'not-a-valid-url', title: 'Invalid' }
      };

      // Should not throw
      await expect(tracker.processTabEvent(invalidUrlEvent)).resolves.toBeUndefined();

      const history = tracker.getHistory(1);
      expect(history).toHaveLength(1);
      expect(history[0].url).toBe('not-a-valid-url');
    });

    it('should handle missing tab data', async () => {
      const missingDataEvent: TabEvent = {
        type: 'updated',
        tabId: 999, // Non-existent tab
        windowId: 1,
        timestamp: Date.now(),
        data: { url: 'https://example.com' }
      };

      // Should not throw
      await expect(tracker.processTabEvent(missingDataEvent)).resolves.toBeUndefined();
    });

    it('should handle browsing events for non-existent tabs', async () => {
      const event: BrowsingEvent = {
        type: 'navigation_completed',
        timestamp: Date.now(),
        tabId: 999, // Non-existent tab
        url: 'https://example.com'
      };

      // Should not throw
      await expect(tracker.recordBrowsingEvent(event)).resolves.toBeUndefined();
    });
  });

  describe('Reset and Shutdown', () => {
    beforeEach(async () => {
      await tracker.initialize();

      // Create test data
      await tracker.processTabEvent({
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: { url: 'https://example.com', title: 'Example' }
      });
    });

    it('should reset state correctly', async () => {
      expect(tracker.getHistory()).toHaveLength(1);

      await tracker.reset();

      expect(tracker.getHistory()).toHaveLength(0);
      expect(tracker.getNavigationChains()).toHaveLength(0);
      expect(tracker.getNavigationPatterns()).toHaveLength(0);
    });

    it('should shutdown cleanly', async () => {
      const cleanupSpy = jest.spyOn(tracker, 'cleanup');

      await tracker.shutdown();

      expect(cleanupSpy).toHaveBeenCalled();

      // Should not throw on subsequent operations
      const stats = tracker.getHistoryStats();
      expect(stats).toBeDefined();
    });
  });
});