/**
 * Unit tests for TabTracker
 */

import { TabTracker } from '../../tracking/TabTracker';
import { TrackingConfig, TabEvent, BrowsingEvent } from '../../shared/types';

describe('TabTracker', () => {
  let tabTracker: TabTracker;
  let mockConfig: TrackingConfig;
  let eventHandler: jest.MockedFunction<(event: BrowsingEvent) => Promise<void>>;

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

    eventHandler = jest.fn().mockResolvedValue(undefined);
    tabTracker = new TabTracker(mockConfig, eventHandler);
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(tabTracker.initialize()).resolves.toBeUndefined();
    });
  });

  describe('tab event processing', () => {
    beforeEach(async () => {
      await tabTracker.initialize();
    });

    it('should process tab creation events', async () => {
      const tabEvent: TabEvent = {
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          windowId: 1,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          timeSpent: 0,
          scrollPosition: 0
        }
      };

      await tabTracker.processEvent(tabEvent);
      
      expect(eventHandler).toHaveBeenCalled();
      const tabState = tabTracker.getTabState(1);
      expect(tabState).toBeDefined();
      expect(tabState?.info.url).toBe('https://example.com');
    });

    it('should process tab updates', async () => {
      // First create a tab
      const createEvent: TabEvent = {
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          windowId: 1,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          timeSpent: 0,
          scrollPosition: 0
        }
      };
      await tabTracker.processEvent(createEvent);

      // Then update it
      const updateEvent: TabEvent = {
        type: 'updated',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: {
          url: 'https://example.com/new-page',
          title: 'New Page'
        }
      };

      await tabTracker.processEvent(updateEvent);

      const tabState = tabTracker.getTabState(1);
      expect(tabState?.info.url).toBe('https://example.com/new-page');
      expect(tabState?.info.title).toBe('New Page');
    });

    it('should process tab activation', async () => {
      const createEvent: TabEvent = {
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          windowId: 1,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          timeSpent: 0,
          scrollPosition: 0
        }
      };
      await tabTracker.processEvent(createEvent);

      const activateEvent: TabEvent = {
        type: 'activated',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now()
      };

      await tabTracker.processEvent(activateEvent);

      const tabState = tabTracker.getTabState(1);
      expect(tabState?.activityCount).toBeGreaterThan(0);
    });

    it('should process tab removal', async () => {
      const createEvent: TabEvent = {
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          windowId: 1,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          timeSpent: 0,
          scrollPosition: 0
        }
      };
      await tabTracker.processEvent(createEvent);

      const removeEvent: TabEvent = {
        type: 'removed',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now()
      };

      await tabTracker.processEvent(removeEvent);

      const tabState = tabTracker.getTabState(1);
      expect(tabState).toBeUndefined();
    });
  });

  describe('interaction tracking', () => {
    beforeEach(async () => {
      await tabTracker.initialize();

      // Create a tab first
      const createEvent: TabEvent = {
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          windowId: 1,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          timeSpent: 0,
          scrollPosition: 0
        }
      };
      await tabTracker.processEvent(createEvent);
    });

    it('should record scroll interactions', async () => {
      await tabTracker.recordInteraction('scroll', 1, { scrollPosition: { y: 100 } });

      const tabState = tabTracker.getTabState(1);
      expect(tabState?.scrollEvents).toBe(1);
      expect(tabState?.info.scrollPosition).toBe(100);
    });

    it('should record click interactions', async () => {
      await tabTracker.recordInteraction('click', 1);

      const tabState = tabTracker.getTabState(1);
      expect(tabState?.clickEvents).toBe(1);
    });

    it('should record form interactions', async () => {
      await tabTracker.recordInteraction('form', 1);

      const tabState = tabTracker.getTabState(1);
      expect(tabState?.formInteractions).toBe(1);
    });

    it('should update activity metrics on interactions', async () => {
      const initialActivity = tabTracker.getTabState(1)?.activityCount || 0;

      await tabTracker.recordInteraction('click', 1);

      const tabState = tabTracker.getTabState(1);
      expect(tabState?.activityCount).toBe(initialActivity + 1);
      expect(tabState?.lastActivity).toBeGreaterThan(0);
    });
  });

  describe('tab relationships', () => {
    beforeEach(async () => {
      await tabTracker.initialize();
    });

    it('should track parent-child relationships', async () => {
      // Create parent tab
      const parentEvent: TabEvent = {
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: {
          id: 1,
          url: 'https://example.com',
          title: 'Parent',
          windowId: 1,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          timeSpent: 0,
          scrollPosition: 0
        }
      };
      await tabTracker.processEvent(parentEvent);

      // Create child tab
      const childEvent: TabEvent = {
        type: 'created',
        tabId: 2,
        windowId: 1,
        timestamp: Date.now(),
        data: {
          id: 2,
          url: 'https://example.com/child',
          title: 'Child',
          windowId: 1,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          timeSpent: 0,
          scrollPosition: 0,
          parentTabId: 1
        }
      };
      await tabTracker.processEvent(childEvent);

      const childState = tabTracker.getTabState(2);
      expect(childState?.relationships.parentTabId).toBe(1);

      const parentState = tabTracker.getTabState(1);
      expect(parentState?.relationships.childTabIds).toContain(2);
    });
  });

  describe('configuration updates', () => {
    it('should update configuration', async () => {
      await tabTracker.initialize();
      
      const newConfig = { ...mockConfig, enableTabTracking: false };
      await expect(tabTracker.updateConfig(newConfig)).resolves.toBeUndefined();
    });
  });

  describe('state management', () => {
    beforeEach(async () => {
      await tabTracker.initialize();
    });

    it('should return all tab states', async () => {
      const createEvent: TabEvent = {
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
        data: {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          windowId: 1,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          timeSpent: 0,
          scrollPosition: 0
        }
      };
      await tabTracker.processEvent(createEvent);

      const allStates = tabTracker.getAllTabStates();
      expect(allStates.size).toBe(1);
      expect(allStates.has(1)).toBe(true);
    });

    it('should return undefined for non-existent tabs', () => {
      const tabState = tabTracker.getTabState(999);
      expect(tabState).toBeUndefined();
    });
  });

  describe('shutdown', () => {
    it('should shutdown cleanly', async () => {
      await tabTracker.initialize();
      await expect(tabTracker.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('disabled tracking', () => {
    it('should skip processing when tab tracking is disabled', async () => {
      const disabledConfig = { ...mockConfig, enableTabTracking: false };
      const disabledTracker = new TabTracker(disabledConfig, eventHandler);
      await disabledTracker.initialize();

      const tabEvent: TabEvent = {
        type: 'created',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now()
      };

      await disabledTracker.processEvent(tabEvent);
      expect(eventHandler).not.toHaveBeenCalled();
    });
  });
});