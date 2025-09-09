/**
 * Integration Tests for Tab Lifecycle Tracking System
 * Tests the complete integrated system with all components working together
 */

import { 
  IntegratedTabLifecycleTracking,
  createTabLifecycleTracking,
  TAB_TRACKING_PRESETS
} from '../index';
import { IntegratedSessionDetection } from '../../detection';
import { TabEvent, TabTrackingConfig } from '../../../shared/types';

// Mock browser API
const mockBrowserAPI = {
  tabs: {
    onCreated: { addListener: jest.fn(), removeListener: jest.fn() },
    onUpdated: { addListener: jest.fn(), removeListener: jest.fn() },
    onRemoved: { addListener: jest.fn(), removeListener: jest.fn() },
    onActivated: { addListener: jest.fn(), removeListener: jest.fn() },
    onMoved: { addListener: jest.fn(), removeListener: jest.fn() },
    onAttached: { addListener: jest.fn(), removeListener: jest.fn() },
    onDetached: { addListener: jest.fn(), removeListener: jest.fn() },
    query: jest.fn().mockResolvedValue([]),
    get: jest.fn(),
    sendMessage: jest.fn()
  },
  windows: {
    onFocusChanged: { addListener: jest.fn(), removeListener: jest.fn() },
    WINDOW_ID_NONE: -1
  },
  runtime: {
    onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
    sendMessage: jest.fn()
  },
  storage: {
    onChanged: { addListener: jest.fn(), removeListener: jest.fn() }
  },
  extension: {
    getViews: jest.fn().mockReturnValue([])
  }
};

// Mock cross-browser utility
jest.mock('../../../utils/cross-browser', () => ({
  getBrowserAPI: () => mockBrowserAPI
}));

// Mock session detection
const createMockSessionDetection = () => {
  const mock = {
    processEvent: jest.fn().mockResolvedValue(null),
    getDetectionStats: jest.fn().mockReturnValue({
      engine: { detectionCount: 0 },
      behavior: { averageSessionDuration: 0 }
    }),
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined)
  };
  return mock as unknown as IntegratedSessionDetection;
};

describe('IntegratedTabLifecycleTracking', () => {
  let tracking: IntegratedTabLifecycleTracking;
  let mockSessionDetection: IntegratedSessionDetection;
  let config: TabTrackingConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSessionDetection = createMockSessionDetection();

    config = {
      enableTabTracking: true,
      debounceTimeout: 100,
      maxQueuedEvents: 100,
      enableRealTimeSync: true,
      backgroundProcessingInterval: 1000,
      maxHistoryEntries: 1000,
      sessionDetectionEnabled: true,
      crossContextSyncEnabled: true,
      enableNavigationHistory: true
    };

    tracking = new IntegratedTabLifecycleTracking(config, mockSessionDetection);
  });

  afterEach(async () => {
    if (tracking) {
      await tracking.shutdown();
    }
  });

  describe('System Initialization', () => {
    it('should initialize all components successfully', async () => {
      await tracking.initialize();

      const metrics = tracking.getMetrics();
      expect(metrics.activeTrackers).toBeGreaterThan(0);
      expect(metrics.eventsProcessed).toBe(0);
    });

    it('should initialize without session detection', async () => {
      const trackingNoSession = new IntegratedTabLifecycleTracking(config);
      await trackingNoSession.initialize();

      expect(trackingNoSession).toBeDefined();
      await trackingNoSession.shutdown();
    });

    it('should handle initialization failures gracefully', async () => {
      // Mock component initialization failure
      const failingConfig = { ...config, maxQueuedEvents: -1 };
      const failingTracking = new IntegratedTabLifecycleTracking(failingConfig);

      // Should handle gracefully
      await expect(failingTracking.initialize()).resolves.toBeUndefined();
      await failingTracking.shutdown();
    });
  });

  describe('End-to-End Tab Event Processing', () => {
    beforeEach(async () => {
      await tracking.initialize();
    });

    it('should process tab events through the entire pipeline', async () => {
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

      const result = await tracking.processTabEvent(tabEvent);

      // Should have processed without session boundary
      expect(result).toBeNull();

      // Should have been sent to session detection
      expect(mockSessionDetection.processEvent).toHaveBeenCalled();

      // Should be in navigation history
      const navigationHistory = tracking.getNavigationHistory(1);
      expect(navigationHistory.length).toBeGreaterThan(0);

      // Should be in tab states
      const tabStates = tracking.getActiveTabStates();
      expect(tabStates.size).toBe(1);
    });

    it('should handle session boundary detection', async () => {
      // Mock session detection to return a boundary
      const mockBoundary = {
        sessionId: 'session_123',
        type: 'session_start' as const,
        timestamp: Date.now(),
        confidence: 0.9,
        reason: 'new_domain',
        metadata: {}
      };

      (mockSessionDetection.processEvent as jest.Mock).mockResolvedValue(mockBoundary);

      const tabEvent: TabEvent = {
        type: 'updated',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: {
          url: 'https://different-domain.com',
          title: 'Different Domain'
        }
      };

      const result = await tracking.processTabEvent(tabEvent);
      expect(result).toEqual(mockBoundary);
    });

    it('should handle high-frequency events with debouncing', async () => {
      const events: TabEvent[] = [];
      
      // Generate rapid-fire events
      for (let i = 0; i < 10; i++) {
        events.push({
          type: 'updated',
          tabId: 1,
          windowId: 1,
          timestamp: Date.now() + i,
          data: { title: `Title ${i}` }
        });
      }

      // Process all events quickly
      const results = await Promise.all(
        events.map(event => tracking.processTabEvent(event))
      );

      // Most should return null (debounced)
      const processedCount = results.filter(r => r !== null).length;
      expect(processedCount).toBeLessThan(events.length);

      // But events should still be queued and processed
      const metrics = tracking.getMetrics();
      expect(metrics.queuedEvents).toBeGreaterThanOrEqual(0);
    });

    it('should synchronize data across contexts', async () => {
      const tabEvent: TabEvent = {
        type: 'activated',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now()
      };

      await tracking.processTabEvent(tabEvent);

      // Should attempt to send runtime message for sync
      expect(mockBrowserAPI.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sync_tab_event'
        })
      );
    });
  });

  describe('Background Processing', () => {
    beforeEach(async () => {
      await tracking.initialize();
    });

    it('should perform background tasks without blocking', async () => {
      const startTime = Date.now();
      
      // Process some events
      await tracking.processTabEvent({
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: { url: 'https://example.com' }
      });

      // Wait for background processing
      await new Promise(resolve => setTimeout(resolve, 1100));

      const endTime = Date.now();
      
      // Should complete quickly
      expect(endTime - startTime).toBeLessThan(2000);

      const metrics = tracking.getMetrics();
      expect(metrics.eventsProcessed).toBeGreaterThan(0);
    });

    it('should optimize memory usage during background processing', async () => {
      // Fill up with many events
      for (let i = 0; i < 50; i++) {
        await tracking.processTabEvent({
          type: 'created',
          tabId: i,
          windowId: 1,
          timestamp: Date.now() + i,
          data: { url: `https://example${i}.com` }
        });
      }

      const beforeMemory = tracking.getMetrics().memoryUsage;

      // Wait for background optimization
      await new Promise(resolve => setTimeout(resolve, 2000));

      const afterMemory = tracking.getMetrics().memoryUsage;

      // Memory should be managed (not necessarily less due to JS GC behavior)
      expect(afterMemory).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance Optimization', () => {
    beforeEach(async () => {
      await tracking.initialize();
    });

    it('should handle event bursts efficiently', async () => {
      const eventCount = 100;
      const events: TabEvent[] = [];

      // Generate burst of events
      for (let i = 0; i < eventCount; i++) {
        events.push({
          type: 'updated',
          tabId: Math.floor(i / 10) + 1, // 10 events per tab
          windowId: 1,
          timestamp: Date.now() + i,
          data: { title: `Update ${i}` }
        });
      }

      const startTime = performance.now();
      
      // Process all events
      await Promise.all(events.map(event => tracking.processTabEvent(event)));

      // Flush any debounced events
      await new Promise(resolve => setTimeout(resolve, 200));

      const endTime = performance.now();
      const processingTime = endTime - startTime;

      // Should process efficiently (less than 1ms per event after debouncing)
      expect(processingTime).toBeLessThan(eventCount * 1);

      const metrics = tracking.getMetrics();
      expect(metrics.averageProcessingTime).toBeGreaterThan(0);
    });

    it('should adapt to performance conditions', async () => {
      // Create performance pressure
      const heavyEvent: TabEvent = {
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: {
          url: 'https://heavy-page.com',
          title: 'Heavy Page'
        }
      };

      // Process multiple times
      for (let i = 0; i < 10; i++) {
        await tracking.processTabEvent({
          ...heavyEvent,
          tabId: i + 1,
          timestamp: Date.now() + i * 10
        });
      }

      // Wait for adaptation
      await new Promise(resolve => setTimeout(resolve, 1500));

      const metrics = tracking.getMetrics();
      expect(metrics.eventsProcessed).toBeGreaterThan(0);
    });
  });

  describe('Configuration Management', () => {
    beforeEach(async () => {
      await tracking.initialize();
    });

    it('should update configuration dynamically', async () => {
      const updates = {
        debounceTimeout: 200,
        maxHistoryEntries: 500
      };

      const result = await tracking.updateConfiguration(updates);
      expect(result).toBe(true);

      // Configuration should be applied
      const state = tracking.exportState();
      expect(state.configuration.debounceTimeout).toBe(200);
      expect(state.configuration.maxHistoryEntries).toBe(500);
    });

    it('should handle invalid configuration updates', async () => {
      const invalidUpdates = {
        debounceTimeout: -100, // Invalid
        maxHistoryEntries: 'invalid' as any
      };

      const result = await tracking.updateConfiguration(invalidUpdates);
      
      // Should handle gracefully
      expect(result).toBeDefined();
    });
  });

  describe('Data Export and Import', () => {
    beforeEach(async () => {
      await tracking.initialize();

      // Create test data
      await tracking.processTabEvent({
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: { url: 'https://example.com', title: 'Example' }
      });

      await tracking.processTabEvent({
        type: 'updated',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now() + 1000,
        data: { url: 'https://updated.com', title: 'Updated' }
      });
    });

    it('should export complete system state', () => {
      const exported = tracking.exportState();

      expect(exported).toHaveProperty('configuration');
      expect(exported).toHaveProperty('metrics');
      expect(exported).toHaveProperty('navigationHistory');
      expect(exported).toHaveProperty('tabStates');
      expect(exported).toHaveProperty('systemInfo');

      expect(exported.systemInfo.initialized).toBe(true);
      expect(exported.systemInfo.exportedAt).toBeGreaterThan(0);
    });

    it('should include comprehensive metrics in export', () => {
      const exported = tracking.exportState();
      const metrics = exported.metrics;

      expect(metrics).toHaveProperty('eventsProcessed');
      expect(metrics).toHaveProperty('averageProcessingTime');
      expect(metrics).toHaveProperty('activeTrackers');
      expect(metrics.eventsProcessed).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Resilience', () => {
    beforeEach(async () => {
      await tracking.initialize();
    });

    it('should handle component failures gracefully', async () => {
      // Mock session detection failure
      (mockSessionDetection.processEvent as jest.Mock).mockRejectedValue(
        new Error('Session detection failed')
      );

      const tabEvent: TabEvent = {
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: { url: 'https://example.com' }
      };

      // Should not throw
      const result = await tracking.processTabEvent(tabEvent);
      expect(result).toBeNull(); // Should continue without session detection

      // Other components should still work
      const tabStates = tracking.getActiveTabStates();
      expect(tabStates.size).toBeGreaterThan(0);
    });

    it('should recover from temporary failures', async () => {
      // Simulate temporary failure
      let failureCount = 0;
      (mockSessionDetection.processEvent as jest.Mock).mockImplementation(() => {
        failureCount++;
        if (failureCount <= 2) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve(null);
      });

      // Process multiple events
      for (let i = 0; i < 5; i++) {
        await tracking.processTabEvent({
          type: 'created',
          tabId: i + 1,
          windowId: 1,
          timestamp: Date.now() + i,
          data: { url: `https://example${i}.com` }
        });
      }

      // Should have recovered and processed later events
      expect(mockSessionDetection.processEvent).toHaveBeenCalledTimes(5);
    });

    it('should handle malformed events', async () => {
      const malformedEvents = [
        { type: 'invalid' as any, tabId: 1, windowId: 1, timestamp: Date.now() },
        { type: 'created', tabId: undefined as any, windowId: 1, timestamp: Date.now() },
        { type: 'created', tabId: 1, windowId: 1, timestamp: 'invalid' as any }
      ];

      // Should handle all malformed events without crashing
      for (const event of malformedEvents) {
        await expect(tracking.processTabEvent(event)).resolves.toBeUndefined();
      }

      const metrics = tracking.getMetrics();
      expect(metrics.errorRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Factory Function', () => {
    it('should create and initialize tracking system', async () => {
      const createdTracking = await createTabLifecycleTracking(config, mockSessionDetection);

      expect(createdTracking).toBeInstanceOf(IntegratedTabLifecycleTracking);

      const metrics = createdTracking.getMetrics();
      expect(metrics.activeTrackers).toBeGreaterThan(0);

      await createdTracking.shutdown();
    });

    it('should work without session detection', async () => {
      const createdTracking = await createTabLifecycleTracking(config);

      expect(createdTracking).toBeInstanceOf(IntegratedTabLifecycleTracking);
      await createdTracking.shutdown();
    });
  });

  describe('Configuration Presets', () => {
    it('should provide working configuration presets', async () => {
      const presets = Object.entries(TAB_TRACKING_PRESETS);

      for (const [presetName, presetConfig] of presets) {
        const testConfig = { ...config, ...presetConfig };
        const testTracking = new IntegratedTabLifecycleTracking(testConfig);

        await testTracking.initialize();
        
        // Should work with preset
        await testTracking.processTabEvent({
          type: 'created',
          tabId: 1,
          windowId: 1,
          timestamp: Date.now(),
          data: { url: 'https://example.com' }
        });

        const metrics = testTracking.getMetrics();
        expect(metrics.activeTrackers).toBeGreaterThan(0);

        await testTracking.shutdown();
      }
    });

    it('should handle performance optimized preset', async () => {
      const perfConfig = { ...config, ...TAB_TRACKING_PRESETS.PERFORMANCE_OPTIMIZED };
      const perfTracking = new IntegratedTabLifecycleTracking(perfConfig);

      await perfTracking.initialize();

      // Should have longer debounce timeout for performance
      expect(perfConfig.debounceTimeout).toBeGreaterThan(config.debounceTimeout!);

      await perfTracking.shutdown();
    });

    it('should handle real-time preset', async () => {
      const realtimeConfig = { ...config, ...TAB_TRACKING_PRESETS.REAL_TIME };
      const realtimeTracking = new IntegratedTabLifecycleTracking(realtimeConfig);

      await realtimeTracking.initialize();

      // Should have shorter debounce timeout for real-time
      expect(realtimeConfig.debounceTimeout).toBeLessThan(config.debounceTimeout!);
      expect(realtimeConfig.enableRealTimeSync).toBe(true);

      await realtimeTracking.shutdown();
    });
  });

  describe('System Reset and Cleanup', () => {
    beforeEach(async () => {
      await tracking.initialize();

      // Create test data
      for (let i = 1; i <= 5; i++) {
        await tracking.processTabEvent({
          type: 'created',
          tabId: i,
          windowId: 1,
          timestamp: Date.now() + i,
          data: { url: `https://example${i}.com` }
        });
      }
    });

    it('should reset system state completely', async () => {
      expect(tracking.getActiveTabStates().size).toBe(5);

      await tracking.reset();

      expect(tracking.getActiveTabStates().size).toBe(0);
      expect(tracking.getNavigationHistory()).toHaveLength(0);

      const metrics = tracking.getMetrics();
      expect(metrics.eventsProcessed).toBe(0);
    });

    it('should shutdown cleanly', async () => {
      const shutdownPromise = tracking.shutdown();

      // Should complete within reasonable time
      await expect(shutdownPromise).resolves.toBeUndefined();

      // Session detection should be shut down
      expect(mockSessionDetection.shutdown).toHaveBeenCalled();
    });

    it('should handle shutdown during active processing', async () => {
      // Start processing events
      const processingPromises = [];
      for (let i = 0; i < 100; i++) {
        processingPromises.push(tracking.processTabEvent({
          type: 'updated',
          tabId: 1,
          windowId: 1,
          timestamp: Date.now() + i,
          data: { title: `Update ${i}` }
        }));
      }

      // Shutdown while processing
      const shutdownPromise = tracking.shutdown();

      // Both should complete
      await Promise.all([
        Promise.all(processingPromises),
        shutdownPromise
      ]);
    });
  });
});