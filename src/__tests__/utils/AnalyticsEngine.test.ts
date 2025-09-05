/**
 * Unit tests for AnalyticsEngine
 */

import { AnalyticsEngine } from '../../utils/AnalyticsEngine';
import { TrackingConfig, BrowsingEvent, AnalyticsQuery } from '../../shared/types';

describe('AnalyticsEngine', () => {
  let analyticsEngine: AnalyticsEngine;
  let mockConfig: TrackingConfig;
  let sampleEvents: BrowsingEvent[];

  beforeEach(() => {
    mockConfig = {
      enableTabTracking: true,
      enableWindowTracking: true,
      enableNavigationTracking: true,
      enableSessionTracking: true,
      enableFormTracking: true,
      enableScrollTracking: true,
      enableClickTracking: true,
      privacyMode: 'moderate',
      excludeIncognito: true,
      excludeDomains: [],
      includeDomains: [],
      sensitiveFieldFilters: [],
      batchSize: 50,
      batchInterval: 30000,
      maxEventsInMemory: 1000,
      storageCleanupInterval: 3600000,
      idleThreshold: 300000,
      sessionGapThreshold: 600000,
      domainChangeSessionBoundary: false,
      enableProductivityMetrics: true,
      deepWorkThreshold: 900000,
      distractionThreshold: 30000
    };

    analyticsEngine = new AnalyticsEngine(mockConfig);

    // Create sample events for testing
    const baseTime = Date.now() - 3600000; // 1 hour ago
    sampleEvents = [
      {
        id: 'evt1',
        timestamp: baseTime,
        type: 'tab_created',
        sessionId: 'session1',
        url: 'https://github.com',
        title: 'GitHub',
        metadata: { domain: 'github.com' }
      },
      {
        id: 'evt2',
        timestamp: baseTime + 60000,
        type: 'navigation_completed',
        sessionId: 'session1',
        url: 'https://github.com/user/repo',
        title: 'Repository',
        metadata: { domain: 'github.com', timeSpent: 120000 }
      },
      {
        id: 'evt3',
        timestamp: baseTime + 300000,
        type: 'scroll_event',
        sessionId: 'session1',
        url: 'https://github.com/user/repo',
        title: 'Repository',
        metadata: { scrollEvents: 5 }
      },
      {
        id: 'evt4',
        timestamp: baseTime + 600000,
        type: 'tab_created',
        sessionId: 'session1',
        url: 'https://stackoverflow.com',
        title: 'Stack Overflow',
        metadata: { domain: 'stackoverflow.com' }
      },
      {
        id: 'evt5',
        timestamp: baseTime + 900000,
        type: 'click_event',
        sessionId: 'session1',
        url: 'https://stackoverflow.com/questions/123',
        title: 'Question',
        metadata: { clickEvents: 3 }
      }
    ];
  });

  describe('event processing', () => {
    it('should process events without errors', async () => {
      await expect(analyticsEngine.processEvents(sampleEvents)).resolves.toBeUndefined();
    });

    it('should handle empty event arrays', async () => {
      await expect(analyticsEngine.processEvents([])).resolves.toBeUndefined();
    });

    it('should clear previous analysis when processing new events', async () => {
      await analyticsEngine.processEvents(sampleEvents);
      const stats1 = analyticsEngine.getAnalyticsStats();
      
      await analyticsEngine.processEvents([]);
      const stats2 = analyticsEngine.getAnalyticsStats();
      
      expect(stats2.timeBlocks).toBe(0);
      expect(stats2.domains).toBe(0);
    });
  });

  describe('time block analysis', () => {
    beforeEach(async () => {
      await analyticsEngine.processEvents(sampleEvents);
    });

    it('should create time blocks from events', () => {
      const stats = analyticsEngine.getAnalyticsStats();
      expect(stats.timeBlocks).toBeGreaterThan(0);
    });

    it('should classify time blocks correctly', async () => {
      // Create events that should result in focused time blocks
      const focusedEvents: BrowsingEvent[] = [
        {
          id: 'focus1',
          timestamp: Date.now(),
          type: 'tab_created',
          sessionId: 'session2',
          url: 'https://docs.google.com',
          title: 'Document',
          metadata: { domain: 'docs.google.com' }
        }
      ];
      
      // Add many events on the same domain to simulate focus
      for (let i = 0; i < 20; i++) {
        focusedEvents.push({
          id: `focus${i + 2}`,
          timestamp: Date.now() + i * 30000,
          type: 'scroll_event',
          sessionId: 'session2',
          url: 'https://docs.google.com/document/123',
          title: 'Document',
          metadata: { domain: 'docs.google.com' }
        });
      }

      await analyticsEngine.processEvents(focusedEvents);
      const stats = analyticsEngine.getAnalyticsStats();
      
      expect(stats.focusedBlocks).toBeGreaterThan(0);
    });
  });

  describe('domain analysis', () => {
    beforeEach(async () => {
      await analyticsEngine.processEvents(sampleEvents);
    });

    it('should analyze domain usage patterns', () => {
      const stats = analyticsEngine.getAnalyticsStats();
      expect(stats.domains).toBeGreaterThan(0);
    });

    it('should categorize domains correctly', async () => {
      const query: AnalyticsQuery = {
        dateRange: { start: 0, end: Date.now() },
        metrics: ['domains']
      };

      const results = await analyticsEngine.queryAnalytics(query);
      expect(results.domains).toBeDefined();
      expect(results.domains.totalDomains).toBeGreaterThan(0);
    });

    it('should calculate domain focus scores', async () => {
      const query: AnalyticsQuery = {
        dateRange: { start: 0, end: Date.now() },
        metrics: ['domains']
      };

      const results = await analyticsEngine.queryAnalytics(query);
      expect(results.domains.topDomains).toBeInstanceOf(Array);
      
      if (results.domains.topDomains.length > 0) {
        const topDomain = results.domains.topDomains[0];
        expect(topDomain).toHaveProperty('focusScore');
        expect(typeof topDomain.focusScore).toBe('number');
      }
    });
  });

  describe('pattern detection', () => {
    beforeEach(async () => {
      await analyticsEngine.processEvents(sampleEvents);
    });

    it('should detect activity patterns', () => {
      const stats = analyticsEngine.getAnalyticsStats();
      expect(stats.patterns).toBeDefined();
    });

    it('should identify different pattern types', async () => {
      // Create events that simulate multitasking pattern
      const multitaskingEvents: BrowsingEvent[] = [];
      const domains = ['github.com', 'stackoverflow.com', 'docs.google.com', 'reddit.com'];
      
      for (let i = 0; i < 40; i++) {
        multitaskingEvents.push({
          id: `multi${i}`,
          timestamp: Date.now() + i * 5000,
          type: 'tab_activated',
          sessionId: 'session3',
          url: `https://${domains[i % domains.length]}/page${i}`,
          title: `Page ${i}`,
          metadata: { domain: domains[i % domains.length] }
        });
      }

      await analyticsEngine.processEvents(multitaskingEvents);
      const stats = analyticsEngine.getAnalyticsStats();
      expect(stats.patterns).toBeGreaterThan(0);
    });
  });

  describe('productivity metrics', () => {
    beforeEach(async () => {
      await analyticsEngine.processEvents(sampleEvents);
    });

    it('should calculate productivity metrics', async () => {
      const query: AnalyticsQuery = {
        sessionId: 'session1',
        dateRange: { start: 0, end: Date.now() },
        metrics: ['productivity']
      };

      const results = await analyticsEngine.queryAnalytics(query);
      expect(results.productivity).toBeDefined();
      expect(results.productivity.focusScore).toBeDefined();
      expect(typeof results.productivity.focusScore).toBe('number');
      expect(results.productivity.focusScore).toBeGreaterThanOrEqual(0);
      expect(results.productivity.focusScore).toBeLessThanOrEqual(100);
    });

    it('should provide productivity recommendations', async () => {
      const query: AnalyticsQuery = {
        sessionId: 'session1',
        dateRange: { start: 0, end: Date.now() },
        metrics: ['productivity']
      };

      const results = await analyticsEngine.queryAnalytics(query);
      expect(results.productivity.recommendations).toBeInstanceOf(Array);
    });

    it('should calculate deep work and distraction periods', async () => {
      // Create events with long focused periods
      const deepWorkEvents: BrowsingEvent[] = [];
      const startTime = Date.now();
      
      // 30-minute focus session
      for (let i = 0; i < 30; i++) {
        deepWorkEvents.push({
          id: `deep${i}`,
          timestamp: startTime + i * 60000, // Every minute
          type: 'scroll_event',
          sessionId: 'session_deep',
          url: 'https://docs.google.com/document/123',
          title: 'Important Document',
          metadata: { domain: 'docs.google.com' }
        });
      }

      await analyticsEngine.processEvents(deepWorkEvents);
      const query: AnalyticsQuery = {
        sessionId: 'session_deep',
        dateRange: { start: startTime, end: startTime + 1800000 },
        metrics: ['productivity']
      };

      const results = await analyticsEngine.queryAnalytics(query);
      expect(results.productivity.deepWorkPeriods).toBeGreaterThan(0);
    });
  });

  describe('time analytics', () => {
    beforeEach(async () => {
      await analyticsEngine.processEvents(sampleEvents);
    });

    it('should provide time analytics', async () => {
      const query: AnalyticsQuery = {
        dateRange: { start: 0, end: Date.now() },
        metrics: ['time']
      };

      const results = await analyticsEngine.queryAnalytics(query);
      expect(results.time).toBeDefined();
      expect(results.time.totalTime).toBeGreaterThanOrEqual(0);
      expect(results.time.activeTime).toBeGreaterThanOrEqual(0);
      expect(results.time.blockCount).toBeGreaterThanOrEqual(0);
    });

    it('should calculate time distributions correctly', async () => {
      const query: AnalyticsQuery = {
        dateRange: { start: 0, end: Date.now() },
        metrics: ['time']
      };

      const results = await analyticsEngine.queryAnalytics(query);
      
      // Active time should not exceed total time
      expect(results.time.activeTime).toBeLessThanOrEqual(results.time.totalTime);
      
      // Focused time should not exceed active time
      if (results.time.focusedTime !== undefined) {
        expect(results.time.focusedTime).toBeLessThanOrEqual(results.time.activeTime);
      }
    });
  });

  describe('activity analytics', () => {
    beforeEach(async () => {
      await analyticsEngine.processEvents(sampleEvents);
    });

    it('should provide activity analytics', async () => {
      const query: AnalyticsQuery = {
        dateRange: { start: 0, end: Date.now() },
        metrics: ['activity']
      };

      const results = await analyticsEngine.queryAnalytics(query);
      expect(results.activity).toBeDefined();
      expect(results.activity.totalBlocks).toBeGreaterThanOrEqual(0);
      expect(results.activity.blockTypes).toBeDefined();
    });

    it('should calculate hourly activity patterns', async () => {
      const query: AnalyticsQuery = {
        dateRange: { start: 0, end: Date.now() },
        metrics: ['activity']
      };

      const results = await analyticsEngine.queryAnalytics(query);
      expect(results.activity.hourlyActivity).toBeDefined();
      expect(typeof results.activity.hourlyActivity).toBe('object');
    });
  });

  describe('configuration updates', () => {
    it('should update configuration', () => {
      const newConfig = { ...mockConfig, deepWorkThreshold: 1800000 };
      expect(() => analyticsEngine.updateConfig(newConfig)).not.toThrow();
    });
  });

  describe('statistics', () => {
    it('should provide analytics statistics', () => {
      const stats = analyticsEngine.getAnalyticsStats();
      
      expect(stats).toHaveProperty('timeBlocks');
      expect(stats).toHaveProperty('domains');
      expect(stats).toHaveProperty('patterns');
      expect(stats).toHaveProperty('cachedMetrics');
      expect(typeof stats.timeBlocks).toBe('number');
      expect(typeof stats.domains).toBe('number');
    });
  });

  describe('data clearing', () => {
    it('should clear analytics data', async () => {
      await analyticsEngine.processEvents(sampleEvents);
      let stats = analyticsEngine.getAnalyticsStats();
      expect(stats.timeBlocks).toBeGreaterThan(0);

      analyticsEngine.clearAnalytics();
      stats = analyticsEngine.getAnalyticsStats();
      expect(stats.timeBlocks).toBe(0);
      expect(stats.domains).toBe(0);
    });
  });

  describe('query validation', () => {
    beforeEach(async () => {
      await analyticsEngine.processEvents(sampleEvents);
    });

    it('should handle invalid queries gracefully', async () => {
      const invalidQuery = {
        dateRange: { start: Date.now(), end: 0 }, // Invalid range
        metrics: ['invalid_metric' as any]
      };

      const results = await analyticsEngine.queryAnalytics(invalidQuery);
      expect(results).toBeDefined();
    });

    it('should handle queries with no matching data', async () => {
      const emptyQuery: AnalyticsQuery = {
        dateRange: { start: Date.now() + 3600000, end: Date.now() + 7200000 }, // Future range
        metrics: ['time']
      };

      const results = await analyticsEngine.queryAnalytics(emptyQuery);
      expect(results.time.totalTime).toBe(0);
    });
  });

  describe('focus score calculation', () => {
    it('should calculate focus scores within valid range', async () => {
      await analyticsEngine.processEvents(sampleEvents);
      
      const query: AnalyticsQuery = {
        sessionId: 'session1',
        dateRange: { start: 0, end: Date.now() },
        metrics: ['productivity']
      };

      const results = await analyticsEngine.queryAnalytics(query);
      const focusScore = results.productivity.focusScore;
      
      expect(focusScore).toBeGreaterThanOrEqual(0);
      expect(focusScore).toBeLessThanOrEqual(100);
      expect(typeof focusScore).toBe('number');
      expect(Number.isFinite(focusScore)).toBe(true);
    });

    it('should handle edge cases in focus score calculation', async () => {
      // Test with minimal events
      const minimalEvents: BrowsingEvent[] = [
        {
          id: 'min1',
          timestamp: Date.now(),
          type: 'tab_created',
          sessionId: 'minimal',
          url: 'https://example.com',
          title: 'Example',
          metadata: {}
        }
      ];

      await analyticsEngine.processEvents(minimalEvents);
      
      const query: AnalyticsQuery = {
        sessionId: 'minimal',
        dateRange: { start: 0, end: Date.now() },
        metrics: ['productivity']
      };

      const results = await analyticsEngine.queryAnalytics(query);
      expect(Number.isFinite(results.productivity.focusScore)).toBe(true);
    });
  });
});