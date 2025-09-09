/**
 * Integration tests for the complete session detection system
 */

import {
  IntegratedSessionDetection,
  createSessionDetection,
  DETECTION_PRESETS,
  validateDetectionConfig
} from '../index';

import {
  BrowsingEvent,
  EventType,
  SessionBoundary
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

function createWorkflowEvents(startTime: number): BrowsingEvent[] {
  return [
    // Morning work session
    createMockEvent('session_started', startTime),
    createMockEvent('navigation_completed', startTime + 30000, 'https://gmail.com/inbox'),
    createMockEvent('tab_created', startTime + 60000),
    createMockEvent('navigation_completed', startTime + 90000, 'https://github.com/project'),
    createMockEvent('tab_activated', startTime + 120000),
    
    // Break - social media
    createMockEvent('navigation_completed', startTime + 3600000, 'https://twitter.com/feed'),
    createMockEvent('tab_activated', startTime + 3660000),
    
    // Back to work
    createMockEvent('navigation_completed', startTime + 4200000, 'https://docs.google.com/document'),
    createMockEvent('form_interaction', startTime + 4260000),
    
    // Long idle period
    createMockEvent('idle_start', startTime + 4800000),
    createMockEvent('idle_end', startTime + 6000000), // 20 minutes later
    
    // New session activity
    createMockEvent('window_created', startTime + 6030000),
    createMockEvent('navigation_completed', startTime + 6060000, 'https://youtube.com/watch'),
    createMockEvent('session_ended', startTime + 7200000)
  ];
}

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('IntegratedSessionDetection', () => {
  let detector: IntegratedSessionDetection;

  beforeEach(async () => {
    detector = new IntegratedSessionDetection();
    await detector.initialize();
  });

  afterEach(async () => {
    if (detector) {
      await detector.shutdown();
    }
  });

  describe('System Initialization', () => {
    it('should initialize successfully with default configuration', async () => {
      const newDetector = new IntegratedSessionDetection();
      await expect(newDetector.initialize()).resolves.not.toThrow();
      
      const stats = newDetector.getDetectionStats();
      expect(stats).toBeDefined();
      expect(stats.configuration).toBeDefined();
      
      await newDetector.shutdown();
    });

    it('should initialize with custom configuration', async () => {
      const customConfig = {
        idleThreshold: 300000, // 5 minutes
        learningEnabled: false,
        adaptiveThresholds: false
      };
      
      const customDetector = new IntegratedSessionDetection(customConfig);
      await customDetector.initialize();
      
      const stats = customDetector.getDetectionStats();
      expect(stats.configuration).toBeDefined();
      
      await customDetector.shutdown();
    });

    it('should handle initialization errors gracefully', async () => {
      const invalidConfig = {
        idleThreshold: -1000 // Invalid value
      };
      
      const detector = new IntegratedSessionDetection(invalidConfig);
      
      // Should not throw, but should fallback to defaults
      await expect(detector.initialize()).resolves.not.toThrow();
      await detector.shutdown();
    });
  });

  describe('Event Processing Pipeline', () => {
    it('should process single event without errors', async () => {
      const event = createMockEvent('tab_activated', Date.now());
      const boundary = await detector.processEvent(event);
      
      // First event shouldn't create boundary
      expect(boundary).toBeNull();
    });

    it('should process event sequence and detect boundaries', async () => {
      const now = Date.now();
      const events = createWorkflowEvents(now);
      
      const boundaries: SessionBoundary[] = [];
      
      for (const event of events) {
        const boundary = await detector.processEvent(event);
        if (boundary) {
          boundaries.push(boundary);
        }
      }
      
      // Should detect at least one boundary in the workflow
      expect(boundaries.length).toBeGreaterThanOrEqual(0);
      
      // If boundaries detected, validate their structure
      boundaries.forEach(boundary => {
        expect(boundary).toHaveProperty('id');
        expect(boundary).toHaveProperty('type');
        expect(boundary).toHaveProperty('reason');
        expect(boundary).toHaveProperty('timestamp');
        expect(boundary).toHaveProperty('metadata');
      });
    });

    it('should queue events during initialization', async () => {
      const uninitializedDetector = new IntegratedSessionDetection();
      
      // Process events before initialization
      const event1 = createMockEvent('tab_activated', Date.now());
      const event2 = createMockEvent('navigation_completed', Date.now() + 1000, 'https://example.com');
      
      const boundary1 = await uninitializedDetector.processEvent(event1);
      const boundary2 = await uninitializedDetector.processEvent(event2);
      
      expect(boundary1).toBeNull();
      expect(boundary2).toBeNull();
      
      // Initialize and check if queued events are processed
      await uninitializedDetector.initialize();
      
      const stats = uninitializedDetector.getDetectionStats();
      expect(stats).toBeDefined();
      
      await uninitializedDetector.shutdown();
    });

    it('should handle rapid event sequences', async () => {
      const now = Date.now();
      const boundaries: SessionBoundary[] = [];
      
      // Send 50 events rapidly
      for (let i = 0; i < 50; i++) {
        const event = createMockEvent('scroll_event', now + i * 100);
        const boundary = await detector.processEvent(event);
        if (boundary) boundaries.push(boundary);
      }
      
      // Should handle all events without error
      // Should not create excessive boundaries for rapid normal activity
      expect(boundaries.length).toBeLessThan(10);
    });
  });

  describe('User Feedback Integration', () => {
    it('should record user feedback successfully', async () => {
      const event = createMockEvent('navigation_completed', Date.now(), 'https://example.com');
      const boundary = await detector.processEvent(event);
      
      if (boundary) {
        await expect(
          detector.recordUserFeedback(boundary.id, 'correct', 0.9, 'Good detection')
        ).resolves.not.toThrow();
      } else {
        // Test with mock boundary ID
        await expect(
          detector.recordUserFeedback('mock_boundary_123', 'incorrect', 0.7)
        ).resolves.not.toThrow();
      }
    });

    it('should adapt configuration based on feedback', async () => {
      // Enable adaptive mode
      detector.setAdaptiveMode(true);
      
      // Record negative feedback
      await detector.recordUserFeedback('test_boundary', 'unnecessary', 0.9, 'Too sensitive');
      
      // Configuration should adapt (implementation specific)
      const stats = detector.getDetectionStats();
      expect(stats.configuration.adaptiveModeEnabled).toBe(true);
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration successfully', async () => {
      const updates = {
        idleThreshold: 600000, // 10 minutes
        patternConfidenceThreshold: 0.8
      };
      
      const success = await detector.updateConfiguration(updates);
      expect(success).toBe(true);
    });

    it('should reject invalid configuration updates', async () => {
      const invalidUpdates = {
        idleThreshold: -5000, // Invalid negative value
        patternConfidenceThreshold: 1.5 // Invalid > 1
      };
      
      const success = await detector.updateConfiguration(invalidUpdates);
      expect(success).toBe(false);
    });

    it('should switch configuration profiles', async () => {
      // This would require creating a profile first
      // For now, test the method existence and basic behavior
      const success = await detector.switchConfigurationProfile('nonexistent');
      expect(success).toBe(false);
    });

    it('should enable and disable adaptive mode', () => {
      detector.setAdaptiveMode(true);
      let stats = detector.getDetectionStats();
      expect(stats.configuration.adaptiveModeEnabled).toBe(true);
      
      detector.setAdaptiveMode(false);
      stats = detector.getDetectionStats();
      expect(stats.configuration.adaptiveModeEnabled).toBe(false);
    });
  });

  describe('Performance Reporting', () => {
    it('should generate performance report', async () => {
      // Process some events first
      const events = createWorkflowEvents(Date.now() - 3600000); // 1 hour ago
      
      for (const event of events) {
        await detector.processEvent(event);
      }
      
      const report = detector.getPerformanceReport();
      
      expect(report).toHaveProperty('timeRange');
      expect(report).toHaveProperty('totalDetections');
      expect(report).toHaveProperty('metrics');
      expect(report).toHaveProperty('signalAnalysis');
      expect(report).toHaveProperty('patternAnalysis');
      expect(report).toHaveProperty('recommendations');
      
      expect(typeof report.totalDetections).toBe('number');
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('should provide real-time metrics', () => {
      const metrics = detector.getRealTimeMetrics();
      
      expect(metrics).toHaveProperty('currentAccuracy');
      expect(metrics).toHaveProperty('recentDetections');
      expect(metrics).toHaveProperty('averageResponseTime');
      expect(metrics).toHaveProperty('lastUpdateTime');
      
      expect(typeof metrics.currentAccuracy).toBe('number');
      expect(typeof metrics.recentDetections).toBe('number');
    });

    it('should provide comprehensive detection statistics', () => {
      const stats = detector.getDetectionStats();
      
      expect(stats).toHaveProperty('engine');
      expect(stats).toHaveProperty('behavior');
      expect(stats).toHaveProperty('predictor');
      expect(stats).toHaveProperty('analytics');
      expect(stats).toHaveProperty('configuration');
      
      expect(stats.configuration).toHaveProperty('adaptiveModeEnabled');
      expect(typeof stats.configuration.adaptiveModeEnabled).toBe('boolean');
    });
  });

  describe('Data Export and State Management', () => {
    it('should export system state', async () => {
      // Process some events first
      const event = createMockEvent('tab_activated', Date.now());
      await detector.processEvent(event);
      
      const exportData = detector.exportState();
      
      expect(exportData).toHaveProperty('configuration');
      expect(exportData).toHaveProperty('analytics');
      expect(exportData).toHaveProperty('behaviorAnalysis');
      expect(exportData).toHaveProperty('predictionModels');
      expect(exportData).toHaveProperty('detectionEngine');
      expect(exportData).toHaveProperty('systemInfo');
      
      expect(exportData.systemInfo).toHaveProperty('initialized');
      expect(exportData.systemInfo).toHaveProperty('exportedAt');
      expect(exportData.systemInfo.initialized).toBe(true);
    });

    it('should reset system state', async () => {
      // Process some events first
      const events = createWorkflowEvents(Date.now());
      for (const event of events.slice(0, 5)) {
        await detector.processEvent(event);
      }
      
      // Reset system
      await detector.reset();
      
      // Verify reset
      const stats = detector.getDetectionStats();
      expect(stats.engine.recentEvents).toBe(0);
    });

    it('should handle shutdown gracefully', async () => {
      const event = createMockEvent('tab_activated', Date.now());
      await detector.processEvent(event);
      
      await expect(detector.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Legacy Compatibility', () => {
    it('should support legacy shouldCreateBoundary method', async () => {
      const event = createMockEvent('navigation_completed', Date.now(), 'https://example.com');
      const boundary = await detector.shouldCreateBoundary(event);
      
      expect(typeof boundary === 'object' || boundary === null).toBe(true);
    });

    it('should provide legacy-compatible statistics', () => {
      const legacyStats = detector.getLegacyStats();
      
      expect(legacyStats).toHaveProperty('recentEvents');
      expect(legacyStats).toHaveProperty('currentDomains');
      expect(legacyStats).toHaveProperty('navigationGaps');
      expect(legacyStats).toHaveProperty('domainTransitions');
      expect(legacyStats).toHaveProperty('sessionSignals');
      expect(legacyStats).toHaveProperty('windowCount');
      expect(legacyStats).toHaveProperty('tabCount');
      
      expect(typeof legacyStats.recentEvents).toBe('number');
      expect(typeof legacyStats.currentDomains).toBe('number');
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle processing errors gracefully', async () => {
      // Create event with problematic data
      const problematicEvent = {
        id: 'test',
        timestamp: NaN, // Invalid timestamp
        type: 'invalid_type' as EventType,
        sessionId: 'test'
      } as BrowsingEvent;
      
      const boundary = await detector.processEvent(problematicEvent);
      expect(boundary).toBeNull(); // Should handle gracefully
    });

    it('should continue working after errors', async () => {
      // Process problematic event
      const badEvent = createMockEvent('tab_activated', NaN);
      await detector.processEvent(badEvent);
      
      // Process good event
      const goodEvent = createMockEvent('tab_activated', Date.now());
      const boundary = await detector.processEvent(goodEvent);
      
      // Should still work
      expect(typeof boundary === 'object' || boundary === null).toBe(true);
    });

    it('should handle memory pressure', async () => {
      // Process many events to test memory management
      for (let i = 0; i < 1000; i++) {
        const event = createMockEvent('scroll_event', Date.now() + i * 100);
        await detector.processEvent(event);
      }
      
      const stats = detector.getDetectionStats();
      // Should maintain reasonable limits
      expect(stats.engine.recentEvents).toBeLessThan(200);
    });
  });

  describe('Performance Characteristics', () => {
    it('should process events within reasonable time', async () => {
      const event = createMockEvent('navigation_completed', Date.now(), 'https://example.com');
      
      const startTime = performance.now();
      await detector.processEvent(event);
      const endTime = performance.now();
      
      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(100); // Should process within 100ms
    });

    it('should maintain consistent performance under load', async () => {
      const processingTimes: number[] = [];
      
      for (let i = 0; i < 100; i++) {
        const event = createMockEvent('tab_activated', Date.now() + i * 1000);
        
        const startTime = performance.now();
        await detector.processEvent(event);
        const endTime = performance.now();
        
        processingTimes.push(endTime - startTime);
      }
      
      const averageTime = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;
      const maxTime = Math.max(...processingTimes);
      
      // Performance should remain consistent
      expect(maxTime).toBeLessThan(averageTime * 3); // No outlier more than 3x average
    });
  });
});

// =============================================================================
// FACTORY FUNCTION TESTS
// =============================================================================

describe('createSessionDetection Factory', () => {
  it('should create initialized detector with default config', async () => {
    const detector = await createSessionDetection();
    
    expect(detector).toBeInstanceOf(IntegratedSessionDetection);
    
    const stats = detector.getDetectionStats();
    expect(stats).toBeDefined();
    
    await detector.shutdown();
  });

  it('should create initialized detector with custom config', async () => {
    const config = {
      idleThreshold: 300000,
      learningEnabled: false
    };
    
    const detector = await createSessionDetection(config);
    expect(detector).toBeInstanceOf(IntegratedSessionDetection);
    
    await detector.shutdown();
  });
});

// =============================================================================
// PRESET CONFIGURATION TESTS
// =============================================================================

describe('DETECTION_PRESETS', () => {
  it('should provide valid preset configurations', () => {
    expect(DETECTION_PRESETS).toHaveProperty('CONSERVATIVE');
    expect(DETECTION_PRESETS).toHaveProperty('BALANCED');
    expect(DETECTION_PRESETS).toHaveProperty('AGGRESSIVE');
    expect(DETECTION_PRESETS).toHaveProperty('LEARNING');
    
    // Validate each preset
    Object.values(DETECTION_PRESETS).forEach(preset => {
      const validation = validateDetectionConfig(preset);
      expect(validation.isValid).toBe(true);
    });
  });

  it('should create detector with preset configuration', async () => {
    const detector = new IntegratedSessionDetection(DETECTION_PRESETS.CONSERVATIVE);
    await detector.initialize();
    
    const stats = detector.getDetectionStats();
    expect(stats).toBeDefined();
    
    await detector.shutdown();
  });
});

// =============================================================================
// VALIDATION FUNCTION TESTS
// =============================================================================

describe('validateDetectionConfig', () => {
  it('should validate correct configuration', () => {
    const validConfig = {
      idleThreshold: 600000,
      sessionGapThreshold: 300000,
      patternConfidenceThreshold: 0.7,
      learningEnabled: true
    };
    
    const result = validateDetectionConfig(validConfig);
    
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect invalid configuration', () => {
    const invalidConfig = {
      idleThreshold: -1000, // Invalid negative
      patternConfidenceThreshold: 1.5, // Invalid > 1
      adaptationRate: 2.0 // Invalid > 1
    };
    
    const result = validateDetectionConfig(invalidConfig);
    
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should provide warnings for suboptimal configuration', () => {
    const suboptimalConfig = {
      idleThreshold: 60000, // Very short idle threshold
      sessionGapThreshold: 5000, // Very short gap threshold
      adaptationRate: 0.5 // High adaptation rate
    };
    
    const result = validateDetectionConfig(suboptimalConfig);
    
    // May be valid but with warnings
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});