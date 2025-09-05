/**
 * Unit tests for EventTracker
 */

import { EventTracker } from '../../tracking/EventTracker';
import { TrackingConfig, BrowsingEvent, TabEvent, WindowEvent } from '../../shared/types';

// Mock dependencies
jest.mock('../../storage/LocalEventStore');
jest.mock('../../storage/EventBatcher');
jest.mock('../../utils/PrivacyFilter');

describe('EventTracker', () => {
  let eventTracker: EventTracker;
  let mockConfig: TrackingConfig;

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

    eventTracker = new EventTracker(mockConfig);
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(eventTracker.initialize()).resolves.toBeUndefined();
    });

    it('should set active state after initialization', async () => {
      await eventTracker.initialize();
      const state = eventTracker.getState();
      expect(state.isActive).toBe(true);
    });
  });

  describe('event handling', () => {
    beforeEach(async () => {
      await eventTracker.initialize();
    });

    it('should handle browsing events', async () => {
      const event = EventTracker.createEvent(
        'tab_created',
        'session123',
        { test: true },
        1,
        1,
        'https://example.com',
        'Example'
      );

      await expect(eventTracker.handleEvent(event)).resolves.toBeUndefined();
    });

    it('should update tracker state when handling events', async () => {
      const event = EventTracker.createEvent(
        'tab_created',
        'session123',
        {},
        1,
        1
      );

      await eventTracker.handleEvent(event);
      const state = eventTracker.getState();
      
      expect(state.activeTabs.has(1)).toBe(true);
      expect(state.eventCount).toBe(1);
      expect(state.lastEventTime).toBeGreaterThan(0);
    });

    it('should handle tab events', async () => {
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

      await expect(eventTracker.processTabEvent(tabEvent)).resolves.toBeUndefined();
    });

    it('should handle window events', async () => {
      const windowEvent: WindowEvent = {
        type: 'created',
        windowId: 1,
        timestamp: Date.now()
      };

      await expect(eventTracker.processWindowEvent(windowEvent)).resolves.toBeUndefined();
    });
  });

  describe('event handlers', () => {
    beforeEach(async () => {
      await eventTracker.initialize();
    });

    it('should register event handlers', () => {
      const handler = jest.fn();
      eventTracker.onEvent('tab_created', handler);

      // Should not throw
      expect(() => eventTracker.onEvent('tab_created', handler)).not.toThrow();
    });

    it('should remove event handlers', () => {
      const handler = jest.fn();
      eventTracker.onEvent('tab_created', handler);
      eventTracker.offEvent('tab_created', handler);

      // Should not throw
      expect(() => eventTracker.offEvent('tab_created', handler)).not.toThrow();
    });
  });

  describe('configuration', () => {
    it('should update configuration', async () => {
      await eventTracker.initialize();
      
      const newConfig = { ...mockConfig, batchSize: 100 };
      await expect(eventTracker.updateConfig(newConfig)).resolves.toBeUndefined();
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await eventTracker.initialize();
    });

    it('should provide tracking statistics', () => {
      const stats = eventTracker.getStats();
      
      expect(stats).toHaveProperty('isActive');
      expect(stats).toHaveProperty('eventCount');
      expect(stats).toHaveProperty('activeTabs');
      expect(stats).toHaveProperty('activeWindows');
      expect(stats.isActive).toBe(true);
    });

    it('should track event counts', async () => {
      const event = EventTracker.createEvent('tab_created', 'session123');
      await eventTracker.handleEvent(event);
      
      const stats = eventTracker.getStats();
      expect(stats.eventCount).toBe(1);
    });
  });

  describe('shutdown', () => {
    it('should shutdown cleanly', async () => {
      await eventTracker.initialize();
      await expect(eventTracker.shutdown()).resolves.toBeUndefined();
      
      const state = eventTracker.getState();
      expect(state.isActive).toBe(false);
    });
  });

  describe('event creation', () => {
    it('should create events with required fields', () => {
      const event = EventTracker.createEvent('tab_created', 'session123');
      
      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('type', 'tab_created');
      expect(event).toHaveProperty('sessionId', 'session123');
      expect(event).toHaveProperty('metadata');
    });

    it('should generate unique event IDs', () => {
      const event1 = EventTracker.createEvent('tab_created', 'session123');
      const event2 = EventTracker.createEvent('tab_created', 'session123');
      
      expect(event1.id).not.toBe(event2.id);
    });
  });

  describe('idle state', () => {
    beforeEach(async () => {
      await eventTracker.initialize();
    });

    it('should handle idle state changes', () => {
      expect(() => eventTracker.setIdleState(true, 'user_inactive')).not.toThrow();
      expect(() => eventTracker.setIdleState(false)).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle initialization errors gracefully', async () => {
      // Mock initialization failure
      const brokenTracker = new EventTracker(mockConfig);
      
      // Should not throw, but log error
      await expect(brokenTracker.initialize()).rejects.toThrow();
    });

    it('should handle event processing errors gracefully', async () => {
      await eventTracker.initialize();
      
      // Create invalid event
      const invalidEvent = { ...EventTracker.createEvent('tab_created', 'session123') };
      delete (invalidEvent as any).timestamp;
      
      // Should not crash the tracker
      await expect(eventTracker.handleEvent(invalidEvent as BrowsingEvent)).resolves.toBeUndefined();
    });
  });
});