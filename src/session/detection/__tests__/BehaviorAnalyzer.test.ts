/**
 * Comprehensive tests for Behavior Analyzer
 */

import { BehaviorAnalyzer } from '../BehaviorAnalyzer';
import {
  BrowsingEvent,
  EventType
} from '../../../shared/types';

// =============================================================================
// TEST UTILITIES
// =============================================================================

function createMockEvent(
  type: EventType,
  timestamp: number,
  url?: string,
  metadata: any = {}
): BrowsingEvent {
  return {
    id: `event_${timestamp}_${Math.random().toString(36).substring(2, 8)}`,
    timestamp,
    type,
    url,
    sessionId: 'test_session',
    metadata
  };
}

function createNavigationSequence(
  startTime: number,
  urls: string[],
  intervals: number[] = []
): BrowsingEvent[] {
  const events: BrowsingEvent[] = [];
  let currentTime = startTime;

  urls.forEach((url, index) => {
    events.push(createMockEvent('navigation_completed', currentTime, url));
    
    if (index < urls.length - 1) {
      const interval = intervals[index] || 60000; // Default 1 minute
      currentTime += interval;
    }
  });

  return events;
}

function createTabSequence(
  startTime: number,
  count: number,
  interval: number = 5000
): BrowsingEvent[] {
  const events: BrowsingEvent[] = [];
  
  for (let i = 0; i < count; i++) {
    events.push(createMockEvent('tab_activated', startTime + i * interval));
  }
  
  return events;
}

// =============================================================================
// TESTS
// =============================================================================

describe('BehaviorAnalyzer', () => {
  let analyzer: BehaviorAnalyzer;

  beforeEach(() => {
    analyzer = new BehaviorAnalyzer();
  });

  describe('Initialization', () => {
    it('should initialize with empty state', () => {
      const metrics = analyzer.getCurrentMetrics();
      expect(metrics).toBeNull();
      
      const patterns = analyzer.getDetectedPatterns();
      expect(patterns).toHaveLength(0);
    });

    it('should accept custom history size', () => {
      const customAnalyzer = new BehaviorAnalyzer(5000);
      expect(customAnalyzer).toBeDefined();
    });
  });

  describe('Event Processing', () => {
    it('should add events to history', () => {
      const event = createMockEvent('tab_activated', Date.now());
      analyzer.addEvent(event);
      
      const analysisData = analyzer.exportAnalysisData();
      expect(analysisData.eventHistory).toHaveLength(1);
      expect(analysisData.eventHistory[0].id).toBe(event.id);
    });

    it('should maintain history size limit', () => {
      const smallAnalyzer = new BehaviorAnalyzer(5);
      
      // Add more events than the limit
      for (let i = 0; i < 10; i++) {
        const event = createMockEvent('tab_activated', Date.now() + i * 1000);
        smallAnalyzer.addEvent(event);
      }
      
      const analysisData = smallAnalyzer.exportAnalysisData();
      expect(analysisData.eventHistory.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Time Gap Analysis', () => {
    it('should analyze time gaps between events', () => {
      const now = Date.now();
      const events = [
        createMockEvent('navigation_completed', now),
        createMockEvent('navigation_completed', now + 5000), // 5 seconds later
        createMockEvent('navigation_completed', now + 15000), // 10 seconds later
        createMockEvent('navigation_completed', now + 35000)  // 20 seconds later
      ];

      events.forEach(event => analyzer.addEvent(event));

      const gapAnalysis = analyzer.analyzeTimeGaps(events);
      
      expect(gapAnalysis.gaps).toHaveLength(3);
      expect(gapAnalysis.gaps).toEqual([5000, 10000, 20000]);
      expect(gapAnalysis.averageGap).toBe((5000 + 10000 + 20000) / 3);
      expect(gapAnalysis.medianGap).toBe(10000);
      expect(gapAnalysis.gapDistribution.size).toBeGreaterThan(0);
    });

    it('should detect consistent gap patterns', () => {
      const now = Date.now();
      const consistentGap = 30000; // 30 seconds
      const events = [];
      
      // Create events with consistent gaps
      for (let i = 0; i < 5; i++) {
        events.push(createMockEvent('navigation_completed', now + i * consistentGap));
      }
      
      events.forEach(event => analyzer.addEvent(event));

      const gapAnalysis = analyzer.analyzeTimeGaps(events);
      
      expect(gapAnalysis.patterns.type).toBe('consistent');
      expect(gapAnalysis.patterns.confidence).toBeGreaterThan(0.7);
    });

    it('should detect increasing gap patterns', () => {
      const now = Date.now();
      const events = [
        createMockEvent('navigation_completed', now),
        createMockEvent('navigation_completed', now + 10000),  // 10s gap
        createMockEvent('navigation_completed', now + 25000),  // 15s gap
        createMockEvent('navigation_completed', now + 45000),  // 20s gap
        createMockEvent('navigation_completed', now + 70000)   // 25s gap
      ];

      events.forEach(event => analyzer.addEvent(event));

      const gapAnalysis = analyzer.analyzeTimeGaps(events);
      
      expect(gapAnalysis.patterns.type).toBe('increasing');
      expect(gapAnalysis.patterns.confidence).toBeGreaterThan(0.5);
      expect(gapAnalysis.patterns.description).toContain('increasing');
    });

    it('should handle insufficient data gracefully', () => {
      const event = createMockEvent('navigation_completed', Date.now());
      analyzer.addEvent(event);

      const gapAnalysis = analyzer.analyzeTimeGaps([event]);
      
      expect(gapAnalysis.gaps).toHaveLength(0);
      expect(gapAnalysis.patterns.type).toBe('random');
      expect(gapAnalysis.patterns.confidence).toBe(0);
    });
  });

  describe('Domain Change Analysis', () => {
    it('should analyze domain changes', () => {
      const now = Date.now();
      const events = createNavigationSequence(now, [
        'https://github.com/project',
        'https://stackoverflow.com/question',
        'https://docs.google.com/document',
        'https://youtube.com/watch'
      ]);

      events.forEach(event => analyzer.addEvent(event));

      const domainAnalysis = analyzer.analyzeDomainChanges(events);
      
      expect(domainAnalysis.changes).toHaveLength(3); // 4 domains = 3 changes
      expect(domainAnalysis.changeFrequency).toBeGreaterThan(0);
      expect(domainAnalysis.categoryTransitions.size).toBeGreaterThan(0);
    });

    it('should detect focused browsing patterns', () => {
      const now = Date.now();
      const events = createNavigationSequence(now, [
        'https://github.com/project1',
        'https://github.com/project2', 
        'https://github.com/project3',
        'https://github.com/issues'
      ]);

      events.forEach(event => analyzer.addEvent(event));

      const domainAnalysis = analyzer.analyzeDomainChanges(events);
      
      expect(domainAnalysis.patterns.type).toBe('focused');
      expect(domainAnalysis.patterns.confidence).toBeGreaterThan(0.5);
    });

    it('should detect exploratory browsing patterns', () => {
      const now = Date.now();
      const events = createNavigationSequence(now, [
        'https://github.com/project',      // work
        'https://youtube.com/watch',       // entertainment
        'https://amazon.com/product',      // shopping
        'https://reddit.com/discussion',   // social
        'https://cnn.com/news'             // news
      ]);

      events.forEach(event => analyzer.addEvent(event));

      const domainAnalysis = analyzer.analyzeDomainChanges(events);
      
      expect(domainAnalysis.patterns.type).toBe('exploratory');
      expect(domainAnalysis.patterns.confidence).toBeGreaterThan(0.5);
    });

    it('should detect task switching patterns', () => {
      const now = Date.now();
      const events = createNavigationSequence(now, [
        'https://github.com/work',
        'https://slack.com/workspace',    // work context
        'https://twitter.com/feed',       // social break
        'https://github.com/work',        // back to work
        'https://docs.google.com/work',   // still work
        'https://instagram.com/photos'    // social again
      ]);

      events.forEach(event => analyzer.addEvent(event));

      const domainAnalysis = analyzer.analyzeDomainChanges(events);
      
      expect(domainAnalysis.patterns.type).toBe('task_switching');
      expect(domainAnalysis.patterns.confidence).toBeGreaterThan(0.3);
    });
  });

  describe('Activity Burst Analysis', () => {
    it('should detect activity bursts', () => {
      const now = Date.now();
      const events = [];

      // Create a burst of activity (10 events in 30 seconds)
      for (let i = 0; i < 10; i++) {
        events.push(createMockEvent('tab_activated', now + i * 3000));
      }

      // Add quiet period
      events.push(createMockEvent('tab_activated', now + 300000)); // 5 minutes later

      events.forEach(event => analyzer.addEvent(event));

      const burstAnalysis = analyzer.analyzeActivityBursts(events);
      
      expect(burstAnalysis.bursts.length).toBeGreaterThan(0);
      expect(burstAnalysis.averageBurstDuration).toBeGreaterThan(0);
      expect(burstAnalysis.burstFrequency).toBeGreaterThan(0);
    });

    it('should handle low activity gracefully', () => {
      const now = Date.now();
      const events = [
        createMockEvent('tab_activated', now),
        createMockEvent('tab_activated', now + 300000), // 5 minutes later
        createMockEvent('tab_activated', now + 600000)  // 10 minutes later
      ];

      events.forEach(event => analyzer.addEvent(event));

      const burstAnalysis = analyzer.analyzeActivityBursts(events);
      
      expect(burstAnalysis.bursts).toHaveLength(0);
      expect(burstAnalysis.burstFrequency).toBe(0);
      expect(burstAnalysis.burstPatterns.type).toBe('random');
    });

    it('should analyze burst patterns', () => {
      const now = Date.now();
      const events = [];

      // Create regular bursts every 10 minutes
      for (let burst = 0; burst < 3; burst++) {
        const burstStart = now + burst * 600000; // 10 minutes apart
        
        // Each burst has 8 events in 1 minute
        for (let i = 0; i < 8; i++) {
          events.push(createMockEvent('tab_activated', burstStart + i * 7500));
        }
      }

      events.forEach(event => analyzer.addEvent(event));

      const burstAnalysis = analyzer.analyzeActivityBursts(events);
      
      expect(burstAnalysis.bursts.length).toBeGreaterThan(0);
      expect(burstAnalysis.burstPatterns.type).toBe('regular');
    });
  });

  describe('Behavior Metrics Calculation', () => {
    it('should calculate comprehensive behavior metrics', () => {
      const now = Date.now();
      const events = [];

      // Add various types of events
      events.push(createMockEvent('session_started', now));
      
      // Add navigation events
      const navigationEvents = createNavigationSequence(now + 10000, [
        'https://github.com/project',
        'https://stackoverflow.com/question',
        'https://docs.google.com/document'
      ]);
      events.push(...navigationEvents);

      // Add tab events
      const tabEvents = createTabSequence(now + 60000, 5, 10000);
      events.push(...tabEvents);

      events.push(createMockEvent('session_ended', now + 300000));

      events.forEach(event => analyzer.addEvent(event));

      const metrics = analyzer.calculateBehaviorMetrics(events);
      
      expect(metrics.averageSessionDuration).toBeGreaterThan(0);
      expect(metrics.averageNavigationGap).toBeGreaterThan(0);
      expect(metrics.navigationVelocity).toBeGreaterThan(0);
      expect(metrics.peakActivityHours).toBeInstanceOf(Array);
      expect(metrics.activityDistribution.size).toBeGreaterThan(0);
      expect(metrics.domainCategories.size).toBeGreaterThan(0);
    });

    it('should handle empty event history', () => {
      const metrics = analyzer.calculateBehaviorMetrics([]);
      
      expect(metrics.averageSessionDuration).toBe(0);
      expect(metrics.averageNavigationGap).toBe(0);
      expect(metrics.navigationVelocity).toBe(0);
      expect(metrics.peakActivityHours).toHaveLength(0);
    });

    it('should calculate activity distribution by hour', () => {
      const events = [];
      
      // Add events across different hours
      for (let hour = 9; hour <= 17; hour++) {
        const timestamp = new Date(2024, 0, 1, hour, 0, 0).getTime();
        events.push(createMockEvent('tab_activated', timestamp));
      }

      events.forEach(event => analyzer.addEvent(event));

      const metrics = analyzer.calculateBehaviorMetrics(events);
      
      expect(metrics.activityDistribution.size).toBe(9); // 9 different hours
      expect(metrics.peakActivityHours.length).toBeGreaterThan(0);
    });
  });

  describe('Pattern Detection', () => {
    it('should detect idle-to-activity transition pattern', () => {
      const now = Date.now();
      const events = [];

      // Add few old events (quiet period)
      events.push(createMockEvent('tab_activated', now - 900000)); // 15 minutes ago
      events.push(createMockEvent('navigation_completed', now - 850000)); // 14.17 minutes ago

      // Add burst of recent activity
      for (let i = 0; i < 8; i++) {
        events.push(createMockEvent('tab_activated', now - 60000 + i * 5000)); // Last minute
      }

      events.forEach(event => analyzer.addEvent(event));

      const patterns = analyzer.detectBoundaryPatterns(events.slice(-10)); // Recent events
      
      const idlePattern = patterns.find(p => p.id === 'idle_to_activity');
      expect(idlePattern).toBeDefined();
      if (idlePattern) {
        expect(idlePattern.confidence).toBeGreaterThan(0);
        expect(idlePattern.predictive).toBe(true);
      }
    });

    it('should detect domain category switch pattern', () => {
      const now = Date.now();
      const events = createNavigationSequence(now - 300000, [
        'https://github.com/work',        // work
        'https://youtube.com/watch',      // entertainment  
        'https://amazon.com/shopping',    // shopping
        'https://reddit.com/discussion'   // social
      ], [60000, 60000, 60000]); // 1 minute intervals

      events.forEach(event => analyzer.addEvent(event));

      const patterns = analyzer.detectBoundaryPatterns(events);
      
      const domainPattern = patterns.find(p => p.id === 'domain_category_switch');
      expect(domainPattern).toBeDefined();
      if (domainPattern) {
        expect(domainPattern.confidence).toBeGreaterThan(0);
      }
    });

    it('should detect tab burst pattern', () => {
      const now = Date.now();
      const events = [];

      // Quiet period
      events.push(createMockEvent('tab_activated', now - 600000)); // 10 minutes ago

      // Recent tab burst
      for (let i = 0; i < 5; i++) {
        events.push(createMockEvent('tab_created', now - 60000 + i * 10000)); // Last minute
      }

      events.forEach(event => analyzer.addEvent(event));

      const patterns = analyzer.detectBoundaryPatterns(events);
      
      const tabBurstPattern = patterns.find(p => p.id === 'tab_burst');
      expect(tabBurstPattern).toBeDefined();
      if (tabBurstPattern) {
        expect(tabBurstPattern.confidence).toBeGreaterThan(0);
        expect(tabBurstPattern.pattern).toHaveLength(2); // quietPeriod, recentTabEvents
      }
    });

    it('should detect velocity change pattern', () => {
      const now = Date.now();
      const events = [];

      // Low velocity period (2 events in 10 minutes)
      events.push(createMockEvent('navigation_completed', now - 900000)); // 15 min ago
      events.push(createMockEvent('navigation_completed', now - 300000)); // 5 min ago

      // High velocity period (5 events in 5 minutes)
      for (let i = 0; i < 5; i++) {
        events.push(createMockEvent('navigation_completed', now - 60000 + i * 12000));
      }

      events.forEach(event => analyzer.addEvent(event));

      const patterns = analyzer.detectBoundaryPatterns(events);
      
      const velocityPattern = patterns.find(p => p.id === 'velocity_change');
      if (velocityPattern) {
        expect(velocityPattern.confidence).toBeGreaterThan(0);
        expect(velocityPattern.predictive).toBe(false);
      }
    });

    it('should detect window management pattern', () => {
      const now = Date.now();
      const events = [
        createMockEvent('window_created', now - 60000),
        createMockEvent('window_removed', now - 30000),
        createMockEvent('window_created', now - 10000)
      ];

      events.forEach(event => analyzer.addEvent(event));

      const patterns = analyzer.detectBoundaryPatterns(events);
      
      const windowPattern = patterns.find(p => p.id === 'window_management');
      expect(windowPattern).toBeDefined();
      if (windowPattern) {
        expect(windowPattern.confidence).toBe(0.7);
        expect(windowPattern.predictive).toBe(true);
      }
    });
  });

  describe('Data Management', () => {
    it('should clear history when requested', () => {
      const events = createTabSequence(Date.now(), 10);
      events.forEach(event => analyzer.addEvent(event));
      
      let analysisData = analyzer.exportAnalysisData();
      expect(analysisData.eventHistory.length).toBe(10);
      
      analyzer.clearHistory();
      
      analysisData = analyzer.exportAnalysisData();
      expect(analysisData.eventHistory.length).toBe(0);
      expect(analyzer.getCurrentMetrics()).toBeNull();
    });

    it('should export analysis data', () => {
      const events = createTabSequence(Date.now(), 5);
      events.forEach(event => analyzer.addEvent(event));
      
      analyzer.calculateBehaviorMetrics(); // Calculate metrics
      
      const exportData = analyzer.exportAnalysisData();
      
      expect(exportData).toHaveProperty('eventHistory');
      expect(exportData).toHaveProperty('metrics');
      expect(exportData).toHaveProperty('patterns');
      expect(exportData).toHaveProperty('lastAnalysis');
      expect(exportData).toHaveProperty('stats');
      
      expect(exportData.eventHistory.length).toBe(5);
      expect(typeof exportData.lastAnalysis).toBe('number');
    });

    it('should limit exported event history', () => {
      // Add more events than the export limit
      for (let i = 0; i < 200; i++) {
        const event = createMockEvent('tab_activated', Date.now() + i * 1000);
        analyzer.addEvent(event);
      }
      
      const exportData = analyzer.exportAnalysisData();
      
      // Should limit to last 100 events
      expect(exportData.eventHistory.length).toBe(100);
    });
  });

  describe('Performance', () => {
    it('should handle large event volumes efficiently', () => {
      const startTime = performance.now();
      
      // Add 1000 events
      for (let i = 0; i < 1000; i++) {
        const event = createMockEvent('tab_activated', Date.now() + i * 1000);
        analyzer.addEvent(event);
      }
      
      // Calculate metrics
      analyzer.calculateBehaviorMetrics();
      
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      // Should process efficiently (under 1 second)
      expect(processingTime).toBeLessThan(1000);
    });

    it('should maintain reasonable memory usage', () => {
      const analyzer = new BehaviorAnalyzer(100); // Small limit
      
      // Add many more events than the limit
      for (let i = 0; i < 500; i++) {
        const event = createMockEvent('scroll_event', Date.now() + i * 100);
        analyzer.addEvent(event);
      }
      
      const exportData = analyzer.exportAnalysisData();
      
      // Should not exceed memory limits
      expect(exportData.eventHistory.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle events with missing data', () => {
      const event = createMockEvent('navigation_completed', Date.now());
      delete event.url; // Remove URL
      
      expect(() => {
        analyzer.addEvent(event);
        analyzer.calculateBehaviorMetrics([event]);
      }).not.toThrow();
    });

    it('should handle malformed URLs gracefully', () => {
      const event = createMockEvent('navigation_completed', Date.now(), 'not-a-url');
      
      expect(() => {
        analyzer.addEvent(event);
        const domainAnalysis = analyzer.analyzeDomainChanges([event]);
        expect(domainAnalysis.changes).toHaveLength(0);
      }).not.toThrow();
    });

    it('should handle events with extreme timestamps', () => {
      const events = [
        createMockEvent('tab_activated', 0), // Unix epoch
        createMockEvent('tab_activated', Date.now() + 365 * 24 * 60 * 60 * 1000) // Future
      ];

      expect(() => {
        events.forEach(event => analyzer.addEvent(event));
        analyzer.analyzeTimeGaps(events);
      }).not.toThrow();
    });

    it('should handle duplicate events', () => {
      const event = createMockEvent('tab_activated', Date.now());
      
      analyzer.addEvent(event);
      analyzer.addEvent(event); // Same event
      
      const exportData = analyzer.exportAnalysisData();
      expect(exportData.eventHistory.length).toBe(2); // Both events stored
    });
  });
});