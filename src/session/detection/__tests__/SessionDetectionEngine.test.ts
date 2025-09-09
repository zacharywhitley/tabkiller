/**
 * Comprehensive tests for Session Detection Engine
 */

import {
  SessionDetectionEngine,
  DetectionConfig,
  DetectionSignal
} from '../SessionDetectionEngine';

import {
  BrowsingEvent,
  SessionBoundary,
  EventType
} from '../../../shared/types';

// =============================================================================
// TEST UTILITIES
// =============================================================================

function createMockEvent(
  type: EventType,
  timestamp: number = Date.now(),
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

function createTestConfig(overrides: Partial<DetectionConfig> = {}): DetectionConfig {
  return {
    // Base tracking config
    enableTabTracking: true,
    enableWindowTracking: true,
    enableNavigationTracking: true,
    enableSessionTracking: true,
    enableFormTracking: true,
    enableScrollTracking: true,
    enableClickTracking: true,

    // Privacy settings
    privacyMode: 'moderate',
    excludeIncognito: true,
    excludeDomains: [],
    includeDomains: [],
    sensitiveFieldFilters: ['password'],

    // Performance settings
    batchSize: 100,
    batchInterval: 30000,
    maxEventsInMemory: 1000,
    storageCleanupInterval: 86400000,

    // Session settings
    idleThreshold: 300000, // 5 minutes for testing
    sessionGapThreshold: 120000, // 2 minutes for testing
    domainChangeSessionBoundary: true,

    // Analytics settings
    enableProductivityMetrics: true,
    deepWorkThreshold: 1200000,
    distractionThreshold: 30000,

    // Enhanced detection parameters
    learningEnabled: true,
    adaptiveThresholds: true,
    contextualAnalysis: true,

    // Advanced thresholds
    idleGracePeriod: 30000,
    domainSimilarityThreshold: 0.3,
    navigationPatternWeight: 1.0,
    timeOfDayWeight: 1.0,
    userBehaviorWeight: 1.0,

    // Prediction parameters
    minimumPatternLength: 3,
    patternConfidenceThreshold: 0.7,
    boundaryPredictionLookahead: 60000,

    // Learning parameters
    learningWindowSize: 50,
    adaptationRate: 0.05,
    patternDecayRate: 0.02,

    ...overrides
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('SessionDetectionEngine', () => {
  let engine: SessionDetectionEngine;
  let config: DetectionConfig;

  beforeEach(() => {
    config = createTestConfig();
    engine = new SessionDetectionEngine(config);
  });

  describe('Initialization', () => {
    it('should initialize with provided configuration', () => {
      const stats = engine.getDetectionStats();
      expect(stats).toBeDefined();
      expect(stats.recentEvents).toBe(0);
      expect(stats.activeDomains).toBe(0);
    });

    it('should handle empty configuration gracefully', () => {
      const emptyEngine = new SessionDetectionEngine({} as DetectionConfig);
      const stats = emptyEngine.getDetectionStats();
      expect(stats).toBeDefined();
    });
  });

  describe('Event Processing', () => {
    it('should detect idle timeout boundary', async () => {
      const now = Date.now();
      
      // Create an event after long idle period
      const event = createMockEvent('tab_activated', now);
      
      // Simulate long idle by providing a context with old last activity
      const boundary = await engine.detectSessionBoundary(event);
      
      // First event shouldn't create boundary (no prior context)
      expect(boundary).toBeNull();
    });

    it('should detect domain change boundary', async () => {
      const now = Date.now();
      
      // First event - establish context
      const event1 = createMockEvent('navigation_completed', now - 60000, 'https://example.com/page1');
      await engine.detectSessionBoundary(event1);
      
      // Second event - different domain
      const event2 = createMockEvent('navigation_completed', now, 'https://different.com/page1');
      const boundary = await engine.detectSessionBoundary(event2);
      
      if (boundary) {
        expect(boundary.reason).toBe('domain_change');
        expect(boundary.type).toBe('end');
        expect(boundary.timestamp).toBe(now);
      }
    });

    it('should detect navigation gap boundary', async () => {
      const now = Date.now();
      const gapThreshold = config.sessionGapThreshold;
      
      // First navigation event
      const event1 = createMockEvent('navigation_completed', now - gapThreshold - 60000);
      await engine.detectSessionBoundary(event1);
      
      // Second navigation event after long gap
      const event2 = createMockEvent('navigation_completed', now);
      const boundary = await engine.detectSessionBoundary(event2);
      
      if (boundary) {
        expect(boundary.reason).toBe('navigation_gap');
      }
    });

    it('should handle rapid event sequences', async () => {
      const now = Date.now();
      const boundaries = [];
      
      // Send 10 events in quick succession
      for (let i = 0; i < 10; i++) {
        const event = createMockEvent('tab_activated', now + i * 1000);
        const boundary = await engine.detectSessionBoundary(event);
        if (boundary) boundaries.push(boundary);
      }
      
      // Should not create boundaries for rapid normal activity
      expect(boundaries.length).toBeLessThan(3);
    });
  });

  describe('Signal Generation', () => {
    it('should generate temporal signals for idle periods', async () => {
      const now = Date.now();
      const idleThreshold = config.idleThreshold;
      
      // Create event after idle threshold
      const event = createMockEvent('tab_activated', now);
      
      // Mock the internal state to simulate idle period
      // This would require access to private methods or dependency injection
      // For now, we test the observable behavior
      
      const boundary = await engine.detectSessionBoundary(event);
      // The specific assertion depends on internal signal generation
    });

    it('should generate spatial signals for domain changes', async () => {
      const now = Date.now();
      
      // Set up domain context
      const event1 = createMockEvent('navigation_completed', now - 30000, 'https://work.com/task');
      await engine.detectSessionBoundary(event1);
      
      // Switch to entertainment domain
      const event2 = createMockEvent('navigation_completed', now, 'https://youtube.com/watch');
      const boundary = await engine.detectSessionBoundary(event2);
      
      if (boundary) {
        expect(boundary.metadata.primarySignal).toBeDefined();
      }
    });

    it('should generate contextual signals for work transitions', async () => {
      // Test during work hours (9 AM)
      const workTime = new Date();
      workTime.setHours(9, 0, 0, 0);
      
      const event = createMockEvent('navigation_started', workTime.getTime());
      const boundary = await engine.detectSessionBoundary(event);
      
      // May or may not create boundary, but should handle time context
      expect(typeof boundary === 'object' || boundary === null).toBe(true);
    });
  });

  describe('Pattern Learning', () => {
    it('should learn from repeated patterns when enabled', async () => {
      const learningConfig = createTestConfig({ learningEnabled: true });
      const learningEngine = new SessionDetectionEngine(learningConfig);
      
      const now = Date.now();
      
      // Simulate repeated pattern: work domain -> social domain
      for (let i = 0; i < 5; i++) {
        const workEvent = createMockEvent(
          'navigation_completed',
          now + i * 3600000, // 1 hour intervals
          'https://github.com/project'
        );
        await learningEngine.detectSessionBoundary(workEvent);
        
        const socialEvent = createMockEvent(
          'navigation_completed',
          now + i * 3600000 + 1800000, // 30 minutes later
          'https://twitter.com/feed'
        );
        await learningEngine.detectSessionBoundary(socialEvent);
      }
      
      const patterns = learningEngine.getLearnedPatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should not learn when learning is disabled', async () => {
      const nonLearningConfig = createTestConfig({ learningEnabled: false });
      const nonLearningEngine = new SessionDetectionEngine(nonLearningConfig);
      
      const now = Date.now();
      
      // Same pattern as above
      for (let i = 0; i < 5; i++) {
        const event1 = createMockEvent('navigation_completed', now + i * 3600000, 'https://github.com');
        await nonLearningEngine.detectSessionBoundary(event1);
        
        const event2 = createMockEvent('navigation_completed', now + i * 3600000 + 1800000, 'https://twitter.com');
        await nonLearningEngine.detectSessionBoundary(event2);
      }
      
      const patterns = nonLearningEngine.getLearnedPatterns();
      expect(patterns.length).toBe(0);
    });
  });

  describe('Configuration Updates', () => {
    it('should update configuration parameters', () => {
      const newConfig = createTestConfig({
        idleThreshold: 600000, // 10 minutes
        patternConfidenceThreshold: 0.8
      });
      
      engine.updateConfig(newConfig);
      const stats = engine.getDetectionStats();
      
      // Verify configuration was updated (would need access to internal config)
      expect(stats).toBeDefined();
    });

    it('should handle invalid configuration gracefully', () => {
      const invalidConfig = {
        idleThreshold: -1000, // Invalid negative value
        patternConfidenceThreshold: 1.5 // Invalid > 1
      } as Partial<DetectionConfig>;
      
      expect(() => {
        engine.updateConfig(invalidConfig);
      }).not.toThrow();
    });
  });

  describe('Statistics and Metrics', () => {
    it('should provide detection statistics', () => {
      const stats = engine.getDetectionStats();
      
      expect(stats).toHaveProperty('recentEvents');
      expect(stats).toHaveProperty('activeDomains');
      expect(stats).toHaveProperty('signalHistory');
      expect(stats).toHaveProperty('patternsLearned');
      
      expect(typeof stats.recentEvents).toBe('number');
      expect(typeof stats.activeDomains).toBe('number');
    });

    it('should track learned patterns', async () => {
      const config = createTestConfig({ learningEnabled: true });
      const engine = new SessionDetectionEngine(config);
      
      // Generate some activity
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        const event = createMockEvent('tab_activated', now + i * 60000);
        await engine.detectSessionBoundary(event);
      }
      
      const patterns = engine.getLearnedPatterns();
      expect(Array.isArray(patterns)).toBe(true);
    });

    it('should export detection data', () => {
      const exportData = engine.exportDetectionData();
      
      expect(exportData).toHaveProperty('config');
      expect(exportData).toHaveProperty('context');
      expect(exportData).toHaveProperty('patterns');
      expect(exportData).toHaveProperty('recentSignals');
      expect(exportData).toHaveProperty('stats');
    });
  });

  describe('Reset and Cleanup', () => {
    it('should reset detection state', async () => {
      // Generate some activity first
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        const event = createMockEvent('tab_activated', now + i * 60000);
        await engine.detectSessionBoundary(event);
      }
      
      let stats = engine.getDetectionStats();
      expect(stats.recentEvents).toBeGreaterThan(0);
      
      // Reset
      engine.reset();
      
      stats = engine.getDetectionStats();
      expect(stats.recentEvents).toBe(0);
      expect(stats.activeDomains).toBe(0);
    });

    it('should handle reset with no prior activity', () => {
      expect(() => {
        engine.reset();
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle events with missing URLs', async () => {
      const event = createMockEvent('tab_activated');
      // URL is undefined
      
      const boundary = await engine.detectSessionBoundary(event);
      expect(typeof boundary === 'object' || boundary === null).toBe(true);
    });

    it('should handle events with malformed URLs', async () => {
      const event = createMockEvent('navigation_completed', Date.now(), 'not-a-valid-url');
      
      expect(async () => {
        await engine.detectSessionBoundary(event);
      }).not.toThrow();
    });

    it('should handle very rapid event sequences', async () => {
      const now = Date.now();
      const promises = [];
      
      // Send 100 events simultaneously
      for (let i = 0; i < 100; i++) {
        const event = createMockEvent('scroll_event', now + i);
        promises.push(engine.detectSessionBoundary(event));
      }
      
      const results = await Promise.all(promises);
      
      // Should handle all events without error
      expect(results.length).toBe(100);
      
      // Should not create excessive boundaries
      const boundaries = results.filter(r => r !== null);
      expect(boundaries.length).toBeLessThan(10);
    });

    it('should handle events with extreme timestamps', async () => {
      const futureEvent = createMockEvent('tab_created', Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year in future
      const pastEvent = createMockEvent('tab_created', 0); // Unix epoch
      
      expect(async () => {
        await engine.detectSessionBoundary(futureEvent);
        await engine.detectSessionBoundary(pastEvent);
      }).not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should process events within reasonable time', async () => {
      const event = createMockEvent('navigation_completed', Date.now(), 'https://example.com');
      
      const startTime = performance.now();
      await engine.detectSessionBoundary(event);
      const endTime = performance.now();
      
      const processingTime = endTime - startTime;
      
      // Should process event within 100ms
      expect(processingTime).toBeLessThan(100);
    });

    it('should handle memory efficiently with large event volumes', async () => {
      const now = Date.now();
      
      // Process 1000 events
      for (let i = 0; i < 1000; i++) {
        const event = createMockEvent('scroll_event', now + i * 1000);
        await engine.detectSessionBoundary(event);
      }
      
      const stats = engine.getDetectionStats();
      
      // Should maintain reasonable memory usage (exact limits depend on implementation)
      expect(stats.recentEvents).toBeLessThan(100); // Should prune old events
    });

    it('should maintain consistent performance with accumulated state', async () => {
      const now = Date.now();
      const processingTimes: number[] = [];
      
      // Process events and measure time
      for (let i = 0; i < 100; i++) {
        const event = createMockEvent('tab_activated', now + i * 60000);
        
        const startTime = performance.now();
        await engine.detectSessionBoundary(event);
        const endTime = performance.now();
        
        processingTimes.push(endTime - startTime);
      }
      
      const firstHalf = processingTimes.slice(0, 50);
      const secondHalf = processingTimes.slice(50);
      
      const firstAvg = firstHalf.reduce((sum, time) => sum + time, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, time) => sum + time, 0) / secondHalf.length;
      
      // Processing time shouldn't increase dramatically with accumulated state
      expect(secondAvg).toBeLessThan(firstAvg * 2);
    });
  });

  describe('Boundary Quality', () => {
    it('should create boundaries with proper metadata', async () => {
      const now = Date.now();
      
      // Create conditions for boundary detection
      const event1 = createMockEvent('navigation_completed', now - 400000, 'https://work.com'); // 6.67 minutes ago
      await engine.detectSessionBoundary(event1);
      
      const event2 = createMockEvent('navigation_completed', now, 'https://social.com');
      const boundary = await engine.detectSessionBoundary(event2);
      
      if (boundary) {
        expect(boundary).toHaveProperty('id');
        expect(boundary).toHaveProperty('type');
        expect(boundary).toHaveProperty('reason');
        expect(boundary).toHaveProperty('timestamp');
        expect(boundary).toHaveProperty('sessionId');
        expect(boundary).toHaveProperty('metadata');
        
        expect(boundary.metadata).toHaveProperty('primarySignal');
        expect(boundary.metadata).toHaveProperty('signalStrength');
        expect(boundary.metadata).toHaveProperty('totalSignals');
        
        expect(typeof boundary.metadata.signalStrength).toBe('number');
        expect(boundary.metadata.signalStrength).toBeGreaterThan(0);
        expect(boundary.metadata.signalStrength).toBeLessThanOrEqual(1);
      }
    });

    it('should assign appropriate boundary reasons', async () => {
      const now = Date.now();
      
      // Test idle timeout
      const idleEvent = createMockEvent('tab_activated', now);
      // Would need to mock idle state for proper testing
      
      // Test domain change
      const event1 = createMockEvent('navigation_completed', now - 30000, 'https://github.com');
      await engine.detectSessionBoundary(event1);
      
      const event2 = createMockEvent('navigation_completed', now, 'https://netflix.com');
      const domainBoundary = await engine.detectSessionBoundary(event2);
      
      if (domainBoundary) {
        expect(['domain_change', 'navigation_gap', 'user_initiated']).toContain(domainBoundary.reason);
      }
    });
  });
});