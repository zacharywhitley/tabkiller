/**
 * Tests for TabLifecycleTracker
 * Comprehensive test coverage for real-time tab event monitoring
 */

import { TabLifecycleTracker } from '../TabLifecycleTracker';
import { BrowsingEvent, TabEvent, TabLifecycleConfig } from '../../../shared/types';

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
    query: jest.fn(),
    get: jest.fn()
  },
  windows: {
    onFocusChanged: { addListener: jest.fn(), removeListener: jest.fn() },
    WINDOW_ID_NONE: -1
  }
};

// Mock cross-browser utility
jest.mock('../../../utils/cross-browser', () => ({
  getBrowserAPI: () => mockBrowserAPI
}));

describe('TabLifecycleTracker', () => {
  let tracker: TabLifecycleTracker;
  let mockEventHandler: jest.MockedFunction<(event: BrowsingEvent) => Promise<void>>;
  let config: TabLifecycleConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockEventHandler = jest.fn().mockResolvedValue(undefined);
    
    config = {
      enableTabTracking: true,
      enableInteractionTracking: true,
      enablePerformanceTracking: true,
      enableRelationshipDetection: true,
      trackDiscardedTabs: true,
      maxConcurrentTabs: 100,
      cleanupInterval: 60000
    };

    tracker = new TabLifecycleTracker(config, mockEventHandler);
  });

  afterEach(async () => {
    if (tracker) {
      await tracker.shutdown();
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully with default configuration', async () => {
      mockBrowserAPI.tabs.query.mockResolvedValue([
        { id: 1, url: 'https://example.com', title: 'Example', windowId: 1, active: true }
      ]);

      await tracker.initialize();

      expect(mockBrowserAPI.tabs.query).toHaveBeenCalled();
      expect(mockBrowserAPI.tabs.onCreated.addListener).toHaveBeenCalled();
      expect(mockBrowserAPI.tabs.onUpdated.addListener).toHaveBeenCalled();
      expect(mockBrowserAPI.tabs.onRemoved.addListener).toHaveBeenCalled();
      expect(mockBrowserAPI.tabs.onActivated.addListener).toHaveBeenCalled();
    });

    it('should load existing tabs on initialization', async () => {
      const existingTabs = [
        { id: 1, url: 'https://example.com', title: 'Example 1', windowId: 1, active: false },
        { id: 2, url: 'https://test.com', title: 'Test', windowId: 1, active: true }
      ];

      mockBrowserAPI.tabs.query.mockResolvedValue(existingTabs);

      await tracker.initialize();

      const tabStates = tracker.getAllTabStates();
      expect(tabStates.size).toBe(2);
      expect(tabStates.get(1)?.info.url).toBe('https://example.com');
      expect(tabStates.get(2)?.info.url).toBe('https://test.com');
    });

    it('should handle initialization errors gracefully', async () => {
      mockBrowserAPI.tabs.query.mockRejectedValue(new Error('Permission denied'));

      await expect(tracker.initialize()).rejects.toThrow('Permission denied');
    });
  });

  describe('Tab Creation Tracking', () => {
    beforeEach(async () => {
      mockBrowserAPI.tabs.query.mockResolvedValue([]);
      await tracker.initialize();
    });

    it('should track tab creation events', async () => {
      const mockTab = {
        id: 1,
        url: 'https://example.com',
        title: 'Example',
        windowId: 1,
        active: false,
        openerTabId: undefined
      };

      // Simulate tab creation
      const [createdHandler] = mockBrowserAPI.tabs.onCreated.addListener.mock.calls[0];
      await createdHandler(mockTab);

      // Verify tab state was created
      const tabState = tracker.getTabState(1);
      expect(tabState).toBeDefined();
      expect(tabState?.info.url).toBe('https://example.com');
      expect(tabState?.info.title).toBe('Example');
      expect(tabState?.lifecycle.sessionStart).toBeGreaterThan(0);

      // Verify event was emitted
      expect(mockEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tab_created',
          tabId: 1,
          url: 'https://example.com',
          title: 'Example'
        })
      );
    });

    it('should detect tab relationships on creation', async () => {
      const parentTab = {
        id: 1,
        url: 'https://parent.com',
        title: 'Parent',
        windowId: 1,
        active: false
      };

      const childTab = {
        id: 2,
        url: 'https://child.com',
        title: 'Child',
        windowId: 1,
        active: false,
        openerTabId: 1
      };

      // Create parent tab first
      const [createdHandler] = mockBrowserAPI.tabs.onCreated.addListener.mock.calls[0];
      await createdHandler(parentTab);
      await createdHandler(childTab);

      // Verify relationships
      const childState = tracker.getTabState(2);
      const parentState = tracker.getTabState(1);

      expect(childState?.relationships.openerTabId).toBe(1);
      expect(parentState?.relationships.childTabIds).toContain(2);
    });
  });

  describe('Tab Update Tracking', () => {
    beforeEach(async () => {
      mockBrowserAPI.tabs.query.mockResolvedValue([]);
      await tracker.initialize();

      // Create initial tab
      const mockTab = { id: 1, url: 'https://initial.com', title: 'Initial', windowId: 1 };
      const [createdHandler] = mockBrowserAPI.tabs.onCreated.addListener.mock.calls[0];
      await createdHandler(mockTab);
    });

    it('should track URL changes as navigation events', async () => {
      const changeInfo = { url: 'https://updated.com' };
      const updatedTab = { id: 1, url: 'https://updated.com', title: 'Updated', windowId: 1 };

      const [updatedHandler] = mockBrowserAPI.tabs.onUpdated.addListener.mock.calls[0];
      await updatedHandler(1, changeInfo, updatedTab);

      const tabState = tracker.getTabState(1);
      expect(tabState?.info.url).toBe('https://updated.com');
      expect(tabState?.navigation.navigationCount).toBe(1);

      // Should emit navigation event
      expect(mockEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'navigation_completed',
          tabId: 1,
          url: 'https://updated.com'
        })
      );
    });

    it('should track loading status changes', async () => {
      const loadingChange = { status: 'loading' };
      const completeChange = { status: 'complete' };
      const tab = { id: 1, url: 'https://example.com', title: 'Example', windowId: 1 };

      const [updatedHandler] = mockBrowserAPI.tabs.onUpdated.addListener.mock.calls[0];
      
      await updatedHandler(1, loadingChange, tab);
      await updatedHandler(1, completeChange, tab);

      const tabState = tracker.getTabState(1);
      expect(tabState?.performance.loadTime).toBeGreaterThan(0);

      // Should emit page loaded event
      expect(mockEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'page_loaded',
          tabId: 1
        })
      );
    });

    it('should handle discarded state changes', async () => {
      const discardChange = { discarded: true };
      const tab = { id: 1, url: 'https://example.com', title: 'Example', windowId: 1 };

      const [updatedHandler] = mockBrowserAPI.tabs.onUpdated.addListener.mock.calls[0];
      await updatedHandler(1, discardChange, tab);

      const tabState = tracker.getTabState(1);
      expect(tabState?.lifecycle.wasDiscarded).toBe(true);

      expect(mockEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tab_discarded',
          tabId: 1
        })
      );
    });
  });

  describe('Tab Activation Tracking', () => {
    beforeEach(async () => {
      mockBrowserAPI.tabs.query.mockResolvedValue([]);
      await tracker.initialize();

      // Create initial tabs
      const mockTabs = [
        { id: 1, url: 'https://tab1.com', title: 'Tab 1', windowId: 1 },
        { id: 2, url: 'https://tab2.com', title: 'Tab 2', windowId: 1 }
      ];

      const [createdHandler] = mockBrowserAPI.tabs.onCreated.addListener.mock.calls[0];
      for (const tab of mockTabs) {
        await createdHandler(tab);
      }
    });

    it('should track tab activation and focus time', async () => {
      const activeInfo = { tabId: 2, windowId: 1 };

      const [activatedHandler] = mockBrowserAPI.tabs.onActivated.addListener.mock.calls[0];
      await activatedHandler(activeInfo);

      const activeTab = tracker.getActiveTab();
      expect(activeTab.tabId).toBe(2);
      expect(activeTab.windowId).toBe(1);

      const tabState = tracker.getTabState(2);
      expect(tabState?.lifecycle.isActive).toBe(true);

      expect(mockEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tab_activated',
          tabId: 2
        })
      );
    });

    it('should calculate focus time correctly when switching tabs', async () => {
      // Activate first tab
      const [activatedHandler] = mockBrowserAPI.tabs.onActivated.addListener.mock.calls[0];
      await activatedHandler({ tabId: 1, windowId: 1 });

      // Wait a bit then switch to second tab
      await new Promise(resolve => setTimeout(resolve, 10));
      await activatedHandler({ tabId: 2, windowId: 1 });

      const tab1State = tracker.getTabState(1);
      expect(tab1State?.lifecycle.totalFocusTime).toBeGreaterThan(0);
      expect(tab1State?.lifecycle.isActive).toBe(false);

      const tab2State = tracker.getTabState(2);
      expect(tab2State?.lifecycle.isActive).toBe(true);
    });
  });

  describe('Tab Removal Tracking', () => {
    beforeEach(async () => {
      mockBrowserAPI.tabs.query.mockResolvedValue([]);
      await tracker.initialize();

      // Create and activate a tab
      const mockTab = { id: 1, url: 'https://example.com', title: 'Example', windowId: 1 };
      const [createdHandler] = mockBrowserAPI.tabs.onCreated.addListener.mock.calls[0];
      await createdHandler(mockTab);

      const [activatedHandler] = mockBrowserAPI.tabs.onActivated.addListener.mock.calls[0];
      await activatedHandler({ tabId: 1, windowId: 1 });
    });

    it('should track tab closure and calculate final metrics', async () => {
      const removeInfo = { windowId: 1, isWindowClosing: false };

      // Wait a bit for focus time
      await new Promise(resolve => setTimeout(resolve, 10));

      const [removedHandler] = mockBrowserAPI.tabs.onRemoved.addListener.mock.calls[0];
      await removedHandler(1, removeInfo);

      // Tab should be removed from tracking
      const tabState = tracker.getTabState(1);
      expect(tabState).toBeUndefined();

      // Should emit closure event with metrics
      expect(mockEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tab_closed',
          tabId: 1,
          metadata: expect.objectContaining({
            totalTime: expect.any(Number),
            finalFocusTime: expect.any(Number)
          })
        })
      );
    });

    it('should clean up tab relationships on removal', async () => {
      // Create child tab
      const childTab = { id: 2, url: 'https://child.com', title: 'Child', windowId: 1, openerTabId: 1 };
      const [createdHandler] = mockBrowserAPI.tabs.onCreated.addListener.mock.calls[0];
      await createdHandler(childTab);

      // Remove parent tab
      const [removedHandler] = mockBrowserAPI.tabs.onRemoved.addListener.mock.calls[0];
      await removedHandler(1, { windowId: 1, isWindowClosing: false });

      // Child tab should have relationships cleaned up
      const childState = tracker.getTabState(2);
      expect(childState?.relationships.openerTabId).toBeUndefined();
    });
  });

  describe('Interaction Tracking', () => {
    beforeEach(async () => {
      mockBrowserAPI.tabs.query.mockResolvedValue([]);
      await tracker.initialize();

      const mockTab = { id: 1, url: 'https://example.com', title: 'Example', windowId: 1 };
      const [createdHandler] = mockBrowserAPI.tabs.onCreated.addListener.mock.calls[0];
      await createdHandler(mockTab);
    });

    it('should record scroll interactions', async () => {
      const scrollEvent: TabEvent = {
        type: 'interaction',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: {
          interactionType: 'scroll',
          scrollPosition: { x: 0, y: 500 }
        }
      };

      await tracker.processEvent(scrollEvent);

      const tabState = tracker.getTabState(1);
      expect(tabState?.interactions.scrollEvents).toBe(1);
      expect(tabState?.info.scrollPosition).toBe(500);

      expect(mockEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'user_interaction',
          tabId: 1,
          metadata: expect.objectContaining({
            interactionType: 'scroll'
          })
        })
      );
    });

    it('should record click interactions', async () => {
      const clickEvent: TabEvent = {
        type: 'interaction',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: {
          interactionType: 'click',
          target: 'button'
        }
      };

      await tracker.processEvent(clickEvent);

      const tabState = tracker.getTabState(1);
      expect(tabState?.interactions.clickEvents).toBe(1);
    });

    it('should record form interactions', async () => {
      const formEvent: TabEvent = {
        type: 'interaction',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: {
          interactionType: 'form',
          formType: 'submit'
        }
      };

      await tracker.processEvent(formEvent);

      const tabState = tracker.getTabState(1);
      expect(tabState?.interactions.formInteractions).toBe(1);
    });
  });

  describe('Performance Tracking', () => {
    beforeEach(async () => {
      mockBrowserAPI.tabs.query.mockResolvedValue([]);
      await tracker.initialize();

      const mockTab = { id: 1, url: 'https://example.com', title: 'Example', windowId: 1 };
      const [createdHandler] = mockBrowserAPI.tabs.onCreated.addListener.mock.calls[0];
      await createdHandler(mockTab);
    });

    it('should record performance metrics', async () => {
      const performanceEvent: TabEvent = {
        type: 'performance',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: {
          loadTime: 1500,
          renderTime: 800,
          memoryUsage: 50 * 1024 * 1024 // 50MB
        }
      };

      await tracker.processEvent(performanceEvent);

      const tabState = tracker.getTabState(1);
      expect(tabState?.performance.loadTime).toBe(1500);
      expect(tabState?.performance.renderTime).toBe(800);
      expect(tabState?.performance.memoryUsage).toBe(50 * 1024 * 1024);

      expect(mockEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'performance_update',
          tabId: 1
        })
      );
    });
  });

  describe('Memory Management', () => {
    beforeEach(async () => {
      mockBrowserAPI.tabs.query.mockResolvedValue([]);
      config.maxConcurrentTabs = 2;
      tracker = new TabLifecycleTracker(config, mockEventHandler);
      await tracker.initialize();
    });

    it('should perform cleanup when tab limit is reached', async () => {
      // Create tabs up to limit
      const mockTabs = [
        { id: 1, url: 'https://tab1.com', title: 'Tab 1', windowId: 1 },
        { id: 2, url: 'https://tab2.com', title: 'Tab 2', windowId: 1 },
        { id: 3, url: 'https://tab3.com', title: 'Tab 3', windowId: 1 }
      ];

      const [createdHandler] = mockBrowserAPI.tabs.onCreated.addListener.mock.calls[0];
      for (const tab of mockTabs) {
        await createdHandler(tab);
      }

      // Mock tab.get to simulate tabs not existing
      mockBrowserAPI.tabs.get.mockImplementation((tabId: number) => {
        if (tabId === 1) {
          throw new Error('Tab not found');
        }
        return Promise.resolve({ id: tabId });
      });

      // Force cleanup
      await tracker.forceCleanup();

      // Should clean up orphaned tabs
      const allStates = tracker.getAllTabStates();
      expect(allStates.size).toBeLessThan(3);
    });

    it('should optimize memory usage', async () => {
      // Create tab with lots of activity
      const mockTab = { id: 1, url: 'https://example.com', title: 'Example', windowId: 1 };
      const [createdHandler] = mockBrowserAPI.tabs.onCreated.addListener.mock.calls[0];
      await createdHandler(mockTab);

      const tabState = tracker.getTabState(1);
      if (tabState) {
        // Simulate high activity count
        tabState.lifecycle.activityCount = 20000;
        tabState.interactions.scrollEvents = 15000;
      }

      await tracker.optimizeMemory();

      // Should have optimized the statistics
      const optimizedState = tracker.getTabState(1);
      expect(optimizedState?.lifecycle.activityCount).toBeLessThan(20000);
    });
  });

  describe('Configuration Updates', () => {
    beforeEach(async () => {
      mockBrowserAPI.tabs.query.mockResolvedValue([]);
      await tracker.initialize();
    });

    it('should update configuration correctly', async () => {
      const newConfig = {
        enableInteractionTracking: false,
        maxConcurrentTabs: 50
      };

      await tracker.updateConfig(newConfig);

      // Should have merged the configuration
      expect(tracker['config'].enableInteractionTracking).toBe(false);
      expect(tracker['config'].maxConcurrentTabs).toBe(50);
      expect(tracker['config'].enablePerformanceTracking).toBe(true); // Should keep original
    });
  });

  describe('State Export and Reset', () => {
    beforeEach(async () => {
      mockBrowserAPI.tabs.query.mockResolvedValue([]);
      await tracker.initialize();

      // Create some tabs for testing
      const mockTabs = [
        { id: 1, url: 'https://tab1.com', title: 'Tab 1', windowId: 1 },
        { id: 2, url: 'https://tab2.com', title: 'Tab 2', windowId: 1 }
      ];

      const [createdHandler] = mockBrowserAPI.tabs.onCreated.addListener.mock.calls[0];
      for (const tab of mockTabs) {
        await createdHandler(tab);
      }
    });

    it('should export state correctly', () => {
      const exportedState = tracker.exportState();

      expect(exportedState).toHaveProperty('tabStates');
      expect(exportedState).toHaveProperty('activeTabId');
      expect(exportedState).toHaveProperty('configuration');
      expect(exportedState).toHaveProperty('metrics');
      expect(exportedState).toHaveProperty('exportedAt');

      expect(exportedState.tabStates).toHaveLength(2);
      expect(exportedState.metrics.trackedTabs).toBe(2);
    });

    it('should reset state correctly', async () => {
      mockBrowserAPI.tabs.query.mockResolvedValue([
        { id: 3, url: 'https://new-tab.com', title: 'New Tab', windowId: 1 }
      ]);

      await tracker.reset();

      const allStates = tracker.getAllTabStates();
      expect(allStates.size).toBe(1);
      expect(allStates.get(3)?.info.url).toBe('https://new-tab.com');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      mockBrowserAPI.tabs.query.mockResolvedValue([]);
      await tracker.initialize();
    });

    it('should handle event processing errors gracefully', async () => {
      // Make event handler throw
      mockEventHandler.mockRejectedValue(new Error('Handler error'));

      const mockTab = { id: 1, url: 'https://example.com', title: 'Example', windowId: 1 };
      const [createdHandler] = mockBrowserAPI.tabs.onCreated.addListener.mock.calls[0];

      // Should not throw
      await expect(createdHandler(mockTab)).resolves.toBeUndefined();

      // Tab should still be tracked
      const tabState = tracker.getTabState(1);
      expect(tabState).toBeDefined();
    });

    it('should handle browser API errors', async () => {
      // Make tabs.get throw
      mockBrowserAPI.tabs.get.mockRejectedValue(new Error('API error'));

      // Should not throw during cleanup
      await expect(tracker.forceCleanup()).resolves.toBeUndefined();
    });
  });
});