/**
 * Storage Integration Tests
 * Tests for the complete storage system integration
 */

import { SessionStorageManager } from '../index';
import { SessionStorageIntegration } from '../SessionStorageIntegration';
import { BrowsingSession, TabInfo, NavigationEvent, BrowsingEvent } from '../../../shared/types';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock IndexedDB
class MockIDBDatabase {
  version = 1;
  objectStoreNames = ['sessions', 'tabs', 'navigation_events', 'session_boundaries', 'metadata'];
  
  transaction() {
    return new MockIDBTransaction();
  }
  
  close() {}
}

class MockIDBTransaction {
  objectStore() {
    return new MockIDBObjectStore();
  }
}

class MockIDBObjectStore {
  indexNames = ['by_tag', 'by_created_at', 'by_updated_at', 'by_domain'];
  
  index() {
    return new MockIDBIndex();
  }
  
  get() {
    return { onsuccess: null, onerror: null, result: null };
  }
  
  put() {
    return { onsuccess: null, onerror: null };
  }
  
  delete() {
    return { onsuccess: null, onerror: null };
  }
  
  openCursor() {
    return { onsuccess: null, onerror: null };
  }
  
  createIndex() {}
}

class MockIDBIndex {
  openCursor() {
    return { onsuccess: null, onerror: null };
  }
}

const mockIndexedDB = {
  open: jest.fn().mockImplementation(() => ({
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: new MockIDBDatabase()
  }))
};

Object.defineProperty(global, 'indexedDB', { value: mockIndexedDB });
Object.defineProperty(global, 'IDBKeyRange', { value: {} });

// =============================================================================
// TEST DATA
// =============================================================================

const mockSession: BrowsingSession = {
  id: 'integration-test-session',
  tag: 'Integration Test Session',
  createdAt: Date.now() - 120000,
  updatedAt: Date.now() - 60000,
  tabs: [],
  windowIds: [1, 2],
  metadata: {
    isPrivate: false,
    totalTime: 120000,
    pageCount: 0,
    domain: ['example.com', 'github.com']
  }
};

const mockTab: TabInfo = {
  id: 101,
  url: 'https://example.com/test',
  title: 'Test Page',
  windowId: 1,
  createdAt: Date.now() - 90000,
  lastAccessed: Date.now() - 30000,
  timeSpent: 60000,
  scrollPosition: 150
};

const mockNavigationEvent: NavigationEvent = {
  tabId: 101,
  url: 'https://example.com/test',
  referrer: 'https://google.com/search',
  timestamp: Date.now() - 30000,
  transitionType: 'link'
};

const mockBrowsingEvent: BrowsingEvent = {
  id: 'event-1',
  type: 'tab_created',
  timestamp: Date.now(),
  tabId: 101,
  windowId: 1,
  url: 'https://example.com/test',
  title: 'Test Page',
  sessionId: 'integration-test-session',
  metadata: {}
};

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Storage System Integration', () => {
  let storageManager: SessionStorageManager;
  let storageIntegration: SessionStorageIntegration;

  beforeEach(() => {
    // Reset mocks
    mockIndexedDB.open.mockClear();
    
    storageManager = new SessionStorageManager({
      enableCompression: true,
      enableIntegrityChecks: true
    });

    storageIntegration = new SessionStorageIntegration({
      enableAutoStorage: true,
      enableSessionPersistence: true,
      enableTabPersistence: true,
      enableNavigationPersistence: true
    });
  });

  afterEach(async () => {
    if (storageManager) {
      await storageManager.shutdown();
    }
    if (storageIntegration) {
      await storageIntegration.shutdown();
    }
  });

  // =============================================================================
  // STORAGE MANAGER TESTS
  // =============================================================================

  describe('SessionStorageManager', () => {
    beforeEach(async () => {
      // Mock successful initialization
      const mockRequest = {
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        result: new MockIDBDatabase()
      };
      
      mockIndexedDB.open.mockReturnValue(mockRequest);
      
      const initPromise = storageManager.initialize();
      
      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({ target: { result: new MockIDBDatabase() } });
        }
      }, 0);
      
      await initPromise;
    });

    test('should manage complete session lifecycle', async () => {
      // Create session
      await storageManager.createSession(mockSession);
      
      // Create tab for session
      await storageManager.createTab(mockTab, mockSession.id);
      
      // Create navigation event
      await storageManager.createNavigationEvent(mockNavigationEvent, mockSession.id);
      
      // Query session
      const retrievedSession = await storageManager.getSession(mockSession.id);
      expect(retrievedSession).toBeDefined();
      expect(retrievedSession?.id).toBe(mockSession.id);
      
      // Query tab
      const retrievedTab = await storageManager.getTab(mockTab.id);
      expect(retrievedTab).toBeDefined();
      expect(retrievedTab?.id).toBe(mockTab.id);
      
      // Update session
      await storageManager.updateSession(mockSession.id, {
        tag: 'Updated Test Session'
      });
      
      // Update tab
      await storageManager.updateTab(mockTab.id, {
        timeSpent: 90000
      });
      
      // Get storage stats
      const stats = await storageManager.getStorageStats();
      expect(stats).toBeDefined();
      expect(typeof stats.sessions).toBe('number');
      
      // Validate integrity
      const integrityResult = await storageManager.validateIntegrity();
      expect(integrityResult).toBeDefined();
      
      // Create backup
      const backup = await storageManager.createBackup();
      expect(backup).toBeDefined();
      
      // Clean up
      await storageManager.deleteSession(mockSession.id);
    });

    test('should handle data export/import', async () => {
      // Create test data
      await storageManager.createSession(mockSession);
      await storageManager.createTab(mockTab, mockSession.id);
      
      // Export data
      const exportResult = await storageManager.exportData({
        format: 'json',
        includeContent: true,
        includeTabs: true,
        includeSessions: true,
        includeHistory: true,
        compressed: false,
        encrypted: false
      });
      
      expect(exportResult).toBeDefined();
      expect(exportResult.format).toBe('json');
      expect(exportResult.itemCounts.sessions).toBeGreaterThan(0);
      
      // Clear data
      await storageManager.clearAllData();
      
      // Import data
      const importResult = await storageManager.importData(exportResult.data, {
        format: 'json',
        mergeStrategy: 'replace',
        validateData: true,
        createBackup: false
      });
      
      expect(importResult.success).toBe(true);
      expect(importResult.imported.sessions).toBeGreaterThan(0);
    });

    test('should handle concurrent operations', async () => {
      const sessions = Array.from({ length: 5 }, (_, i) => ({
        ...mockSession,
        id: `concurrent-session-${i}`,
        tag: `Concurrent Session ${i}`
      }));

      // Create sessions concurrently
      const createPromises = sessions.map(session => 
        storageManager.createSession(session)
      );
      
      await expect(Promise.all(createPromises)).resolves.toHaveLength(5);
      
      // Query sessions concurrently
      const queryPromises = sessions.map(session => 
        storageManager.getSession(session.id)
      );
      
      const results = await Promise.all(queryPromises);
      expect(results.every(result => result !== null)).toBe(true);
      
      // Clean up
      const deletePromises = sessions.map(session => 
        storageManager.deleteSession(session.id)
      );
      
      await Promise.all(deletePromises);
    });

    test('should handle errors gracefully', async () => {
      // Test operations on non-existent data
      await expect(storageManager.getSession('non-existent'))
        .resolves.toBeNull();
      
      await expect(storageManager.getTab(999))
        .resolves.toBeNull();
      
      await expect(storageManager.updateSession('non-existent', {}))
        .rejects.toThrow();
      
      await expect(storageManager.updateTab(999, {}))
        .rejects.toThrow();
    });
  });

  // =============================================================================
  // STORAGE INTEGRATION TESTS
  // =============================================================================

  describe('SessionStorageIntegration', () => {
    beforeEach(async () => {
      // Mock successful initialization
      const mockRequest = {
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        result: new MockIDBDatabase()
      };
      
      mockIndexedDB.open.mockReturnValue(mockRequest);
      
      const initPromise = storageIntegration.initialize();
      
      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({ target: { result: new MockIDBDatabase() } });
        }
      }, 0);
      
      await initPromise;
    });

    test('should process browsing events', async () => {
      const sessionStartEvent: BrowsingEvent = {
        ...mockBrowsingEvent,
        type: 'session_started',
        id: 'session-start-event'
      };
      
      await storageIntegration.processBrowsingEvent(sessionStartEvent);
      
      const currentSession = storageIntegration.getCurrentSession();
      expect(currentSession).toBeDefined();
      expect(currentSession?.id).toBe(sessionStartEvent.sessionId);
    });

    test('should handle tab events', async () => {
      // Start a session first
      const sessionStartEvent: BrowsingEvent = {
        ...mockBrowsingEvent,
        type: 'session_started',
        id: 'session-start-event'
      };
      
      await storageIntegration.processBrowsingEvent(sessionStartEvent);
      
      // Process tab creation event
      const tabCreatedEvent: BrowsingEvent = {
        ...mockBrowsingEvent,
        type: 'tab_created',
        id: 'tab-created-event'
      };
      
      await storageIntegration.processBrowsingEvent(tabCreatedEvent);
      
      const activeTabs = storageIntegration.getActiveTabs();
      expect(activeTabs.size).toBeGreaterThan(0);
      expect(activeTabs.get(mockTab.id)).toBeDefined();
    });

    test('should handle navigation events', async () => {
      // Start session and create tab
      const sessionStartEvent: BrowsingEvent = {
        ...mockBrowsingEvent,
        type: 'session_started',
        id: 'session-start-event'
      };
      
      const tabCreatedEvent: BrowsingEvent = {
        ...mockBrowsingEvent,
        type: 'tab_created',
        id: 'tab-created-event'
      };
      
      const navigationEvent: BrowsingEvent = {
        ...mockBrowsingEvent,
        type: 'navigation_completed',
        id: 'navigation-event'
      };
      
      await storageIntegration.processBrowsingEvent(sessionStartEvent);
      await storageIntegration.processBrowsingEvent(tabCreatedEvent);
      await storageIntegration.processBrowsingEvent(navigationEvent);
      
      // Should have processed navigation event
      const stats = await storageIntegration.getStorageStats();
      expect(stats).toBeDefined();
    });

    test('should handle session end events', async () => {
      // Start a session
      const sessionStartEvent: BrowsingEvent = {
        ...mockBrowsingEvent,
        type: 'session_started',
        id: 'session-start-event'
      };
      
      await storageIntegration.processBrowsingEvent(sessionStartEvent);
      
      // End the session
      const sessionEndEvent: BrowsingEvent = {
        ...mockBrowsingEvent,
        type: 'session_ended',
        id: 'session-end-event'
      };
      
      await storageIntegration.processBrowsingEvent(sessionEndEvent);
      
      const currentSession = storageIntegration.getCurrentSession();
      expect(currentSession).toBeUndefined();
    });

    test('should handle tab closure events', async () => {
      // Start session and create tab
      const sessionStartEvent: BrowsingEvent = {
        ...mockBrowsingEvent,
        type: 'session_started',
        id: 'session-start-event'
      };
      
      const tabCreatedEvent: BrowsingEvent = {
        ...mockBrowsingEvent,
        type: 'tab_created',
        id: 'tab-created-event'
      };
      
      await storageIntegration.processBrowsingEvent(sessionStartEvent);
      await storageIntegration.processBrowsingEvent(tabCreatedEvent);
      
      const activeTabs = storageIntegration.getActiveTabs();
      expect(activeTabs.size).toBeGreaterThan(0);
      
      // Close the tab
      const tabClosedEvent: BrowsingEvent = {
        ...mockBrowsingEvent,
        type: 'tab_closed',
        id: 'tab-closed-event'
      };
      
      await storageIntegration.processBrowsingEvent(tabClosedEvent);
      
      const activeTabsAfterClose = storageIntegration.getActiveTabs();
      expect(activeTabsAfterClose.size).toBe(0);
    });

    test('should handle configuration updates', () => {
      const newConfig = {
        enableAutoStorage: false,
        batchSize: 100,
        flushInterval: 60000
      };
      
      storageIntegration.updateConfig(newConfig);
      
      // Should not throw and should update internal config
      expect(() => storageIntegration.updateConfig(newConfig)).not.toThrow();
    });

    test('should handle forced flush', async () => {
      // Process some events
      const events = Array.from({ length: 10 }, (_, i) => ({
        ...mockBrowsingEvent,
        id: `event-${i}`,
        type: 'navigation_completed' as const
      }));
      
      for (const event of events) {
        await storageIntegration.processBrowsingEvent(event);
      }
      
      // Force flush
      await expect(storageIntegration.forceFlush()).resolves.toBeUndefined();
    });

    test('should handle shutdown gracefully', async () => {
      await expect(storageIntegration.shutdown()).resolves.toBeUndefined();
    });
  });

  // =============================================================================
  // END-TO-END TESTS
  // =============================================================================

  describe('End-to-End Integration', () => {
    test('should handle complete browsing session workflow', async () => {
      // Initialize both systems
      const mockRequest = {
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        result: new MockIDBDatabase()
      };
      
      mockIndexedDB.open.mockReturnValue(mockRequest);
      
      const initPromises = [
        storageManager.initialize(),
        storageIntegration.initialize()
      ];
      
      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({ target: { result: new MockIDBDatabase() } });
        }
      }, 0);
      
      await Promise.all(initPromises);

      // 1. Start session
      const sessionStartEvent: BrowsingEvent = {
        id: 'e2e-session-start',
        type: 'session_started',
        timestamp: Date.now() - 300000,
        sessionId: 'e2e-test-session',
        metadata: {}
      };
      
      await storageIntegration.processBrowsingEvent(sessionStartEvent);

      // 2. Create multiple tabs
      const tabEvents = Array.from({ length: 3 }, (_, i) => ({
        id: `e2e-tab-${i}`,
        type: 'tab_created' as const,
        timestamp: Date.now() - 250000 + (i * 30000),
        tabId: 200 + i,
        windowId: 1,
        url: `https://example.com/page${i}`,
        title: `Page ${i}`,
        sessionId: 'e2e-test-session',
        metadata: {}
      }));

      for (const event of tabEvents) {
        await storageIntegration.processBrowsingEvent(event);
      }

      // 3. Navigate between pages
      const navigationEvents = Array.from({ length: 5 }, (_, i) => ({
        id: `e2e-nav-${i}`,
        type: 'navigation_completed' as const,
        timestamp: Date.now() - 200000 + (i * 20000),
        tabId: 200 + (i % 3),
        url: `https://example.com/page${i % 3}/section${i}`,
        title: `Page ${i % 3} Section ${i}`,
        sessionId: 'e2e-test-session',
        metadata: {
          referrer: i > 0 ? `https://example.com/page${(i - 1) % 3}` : undefined,
          transitionType: 'link'
        }
      }));

      for (const event of navigationEvents) {
        await storageIntegration.processBrowsingEvent(event);
      }

      // 4. Close some tabs
      const tabCloseEvents = [
        {
          id: 'e2e-tab-close-1',
          type: 'tab_closed' as const,
          timestamp: Date.now() - 100000,
          tabId: 201,
          sessionId: 'e2e-test-session',
          metadata: {}
        }
      ];

      for (const event of tabCloseEvents) {
        await storageIntegration.processBrowsingEvent(event);
      }

      // 5. End session
      const sessionEndEvent: BrowsingEvent = {
        id: 'e2e-session-end',
        type: 'session_ended',
        timestamp: Date.now(),
        sessionId: 'e2e-test-session',
        metadata: {}
      };

      await storageIntegration.processBrowsingEvent(sessionEndEvent);

      // 6. Force flush to ensure all data is persisted
      await storageIntegration.forceFlush();

      // 7. Verify data integrity
      const integrityResult = await storageManager.validateIntegrity();
      expect(integrityResult.isValid).toBe(true);

      // 8. Verify storage stats
      const stats = await storageManager.getStorageStats();
      expect(stats.sessions).toBeGreaterThan(0);

      // 9. Export all data
      const exportResult = await storageManager.exportData({
        format: 'json',
        includeContent: true,
        includeTabs: true,
        includeSessions: true,
        includeHistory: true,
        compressed: false,
        encrypted: false
      });

      expect(exportResult).toBeDefined();
      expect(exportResult.itemCounts.sessions).toBeGreaterThan(0);

      // 10. Create backup
      const backup = await storageManager.createBackup();
      expect(backup).toBeDefined();
    });

    test('should handle error recovery scenarios', async () => {
      // Initialize systems
      const mockRequest = {
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        result: new MockIDBDatabase()
      };
      
      mockIndexedDB.open.mockReturnValue(mockRequest);
      
      const initPromises = [
        storageManager.initialize(),
        storageIntegration.initialize()
      ];
      
      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({ target: { result: new MockIDBDatabase() } });
        }
      }, 0);
      
      await Promise.all(initPromises);

      // Process events with some invalid data
      const events: BrowsingEvent[] = [
        {
          id: 'valid-event-1',
          type: 'session_started',
          timestamp: Date.now(),
          sessionId: 'recovery-test-session',
          metadata: {}
        },
        {
          id: 'invalid-event-1',
          type: 'tab_created',
          timestamp: Date.now(),
          tabId: undefined as any, // Invalid tab ID
          sessionId: 'recovery-test-session',
          metadata: {}
        },
        {
          id: 'valid-event-2',
          type: 'navigation_completed',
          timestamp: Date.now(),
          tabId: 300,
          url: 'https://example.com',
          sessionId: 'recovery-test-session',
          metadata: {}
        }
      ];

      // Should handle invalid events gracefully
      for (const event of events) {
        await expect(storageIntegration.processBrowsingEvent(event))
          .resolves.toBeUndefined();
      }

      // System should still be functional
      const currentSession = storageIntegration.getCurrentSession();
      expect(currentSession).toBeDefined();

      // Should be able to continue processing valid events
      const validEvent: BrowsingEvent = {
        id: 'recovery-valid-event',
        type: 'session_ended',
        timestamp: Date.now(),
        sessionId: 'recovery-test-session',
        metadata: {}
      };

      await storageIntegration.processBrowsingEvent(validEvent);
    });
  });
});