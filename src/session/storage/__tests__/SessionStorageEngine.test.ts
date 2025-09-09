/**
 * Session Storage Engine Tests
 * Comprehensive test suite for the core storage functionality
 */

import { SessionStorageEngine, StorageConfig } from '../SessionStorageEngine';
import { BrowsingSession, TabInfo, NavigationEvent } from '../../../shared/types';
import { DATABASE_NAME } from '../schema';

// =============================================================================
// TEST SETUP
// =============================================================================

// Mock IndexedDB for testing
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

// Mock IndexedDB globally
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
  id: 'test-session-1',
  tag: 'Test Session',
  createdAt: Date.now() - 60000,
  updatedAt: Date.now(),
  tabs: [],
  windowIds: [1],
  metadata: {
    isPrivate: false,
    totalTime: 60000,
    pageCount: 0,
    domain: []
  }
};

const mockTab: TabInfo = {
  id: 1,
  url: 'https://example.com',
  title: 'Example Page',
  windowId: 1,
  createdAt: Date.now() - 30000,
  lastAccessed: Date.now(),
  timeSpent: 30000,
  scrollPosition: 0
};

const mockNavigationEvent: NavigationEvent = {
  tabId: 1,
  url: 'https://example.com',
  referrer: 'https://google.com',
  timestamp: Date.now(),
  transitionType: 'link'
};

// =============================================================================
// TESTS
// =============================================================================

describe('SessionStorageEngine', () => {
  let storageEngine: SessionStorageEngine;
  let config: StorageConfig;

  beforeEach(() => {
    config = {
      enableCompression: true,
      enableIntegrityChecks: true,
      maxSessionAge: 365 * 24 * 60 * 60 * 1000,
      maxStorageSize: 100 * 1024 * 1024,
      batchSize: 50,
      indexingEnabled: true
    };

    storageEngine = new SessionStorageEngine(config);
    
    // Reset IndexedDB mock
    mockIndexedDB.open.mockClear();
  });

  afterEach(async () => {
    if (storageEngine) {
      await storageEngine.shutdown();
    }
  });

  // =============================================================================
  // INITIALIZATION TESTS
  // =============================================================================

  describe('Initialization', () => {
    test('should initialize successfully with default config', async () => {
      const engine = new SessionStorageEngine();
      
      // Mock successful database opening
      const mockRequest = {
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        result: new MockIDBDatabase()
      };
      
      mockIndexedDB.open.mockReturnValue(mockRequest);
      
      const initPromise = engine.initialize();
      
      // Simulate successful database opening
      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({ target: { result: new MockIDBDatabase() } });
        }
      }, 0);
      
      await expect(initPromise).resolves.toBeUndefined();
      
      await engine.shutdown();
    });

    test('should handle initialization errors gracefully', async () => {
      const mockRequest = {
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        error: new Error('Database open failed')
      };
      
      mockIndexedDB.open.mockReturnValue(mockRequest);
      
      const initPromise = storageEngine.initialize();
      
      // Simulate database error
      setTimeout(() => {
        if (mockRequest.onerror) {
          mockRequest.onerror({ target: { error: new Error('Database open failed') } });
        }
      }, 0);
      
      await expect(initPromise).rejects.toThrow('Database open failed');
    });

    test('should not initialize twice', async () => {
      const mockRequest = {
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        result: new MockIDBDatabase()
      };
      
      mockIndexedDB.open.mockReturnValue(mockRequest);
      
      const firstInit = storageEngine.initialize();
      
      // Simulate successful database opening
      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({ target: { result: new MockIDBDatabase() } });
        }
      }, 0);
      
      await firstInit;
      
      // Second initialization should return immediately
      const secondInit = await storageEngine.initialize();
      expect(secondInit).toBeUndefined();
      
      // IndexedDB.open should only be called once
      expect(mockIndexedDB.open).toHaveBeenCalledTimes(1);
    });
  });

  // =============================================================================
  // SESSION OPERATIONS TESTS
  // =============================================================================

  describe('Session Operations', () => {
    beforeEach(async () => {
      // Mock successful initialization
      const mockRequest = {
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        result: new MockIDBDatabase()
      };
      
      mockIndexedDB.open.mockReturnValue(mockRequest);
      
      const initPromise = storageEngine.initialize();
      
      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({ target: { result: new MockIDBDatabase() } });
        }
      }, 0);
      
      await initPromise;
    });

    test('should create a session successfully', async () => {
      // Mock the storage operations
      const mockStoredSession = await storageEngine.createSession(mockSession);
      
      expect(mockStoredSession).toBeDefined();
      expect(mockStoredSession.id).toBe(mockSession.id);
      expect(mockStoredSession.tag).toBe(mockSession.tag);
      expect(mockStoredSession.version).toBe(1);
      expect(mockStoredSession.checksum).toBeDefined();
      expect(mockStoredSession.isValid).toBe(true);
    });

    test('should validate session data before creating', async () => {
      const invalidSession = { ...mockSession, id: '' };
      
      await expect(storageEngine.createSession(invalidSession)).rejects.toThrow('Invalid session object');
    });

    test('should handle session updates correctly', async () => {
      // First create the session
      await storageEngine.createSession(mockSession);
      
      const updates = {
        tag: 'Updated Session Tag',
        metadata: {
          ...mockSession.metadata,
          purpose: 'Testing updates'
        }
      };
      
      const updatedSession = await storageEngine.updateSession(mockSession.id, updates);
      
      expect(updatedSession.tag).toBe(updates.tag);
      expect(updatedSession.metadata.purpose).toBe('Testing updates');
      expect(updatedSession.lastModified).toBeGreaterThan(mockSession.updatedAt);
    });

    test('should handle session not found for updates', async () => {
      await expect(storageEngine.updateSession('nonexistent-id', {}))
        .rejects.toThrow('Session not found: nonexistent-id');
    });

    test('should query sessions with filters', async () => {
      const query = {
        tags: ['Test Session'],
        dateRange: {
          start: Date.now() - 120000,
          end: Date.now()
        }
      };
      
      const results = await storageEngine.querySessions(query);
      expect(Array.isArray(results)).toBe(true);
    });

    test('should delete session and related data', async () => {
      await storageEngine.createSession(mockSession);
      
      // Should not throw
      await expect(storageEngine.deleteSession(mockSession.id)).resolves.toBeUndefined();
    });
  });

  // =============================================================================
  // TAB OPERATIONS TESTS
  // =============================================================================

  describe('Tab Operations', () => {
    beforeEach(async () => {
      // Initialize storage engine
      const mockRequest = {
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        result: new MockIDBDatabase()
      };
      
      mockIndexedDB.open.mockReturnValue(mockRequest);
      
      const initPromise = storageEngine.initialize();
      
      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({ target: { result: new MockIDBDatabase() } });
        }
      }, 0);
      
      await initPromise;
      
      // Create a session for tabs
      await storageEngine.createSession(mockSession);
    });

    test('should create a tab successfully', async () => {
      const storedTab = await storageEngine.createTab(mockTab, mockSession.id);
      
      expect(storedTab).toBeDefined();
      expect(storedTab.id).toBe(mockTab.id);
      expect(storedTab.sessionId).toBe(mockSession.id);
      expect(storedTab.domain).toBe('example.com');
      expect(storedTab.checksum).toBeDefined();
    });

    test('should validate tab data before creating', async () => {
      const invalidTab = { ...mockTab, id: 0 };
      
      await expect(storageEngine.createTab(invalidTab, mockSession.id))
        .rejects.toThrow('Invalid tab object');
    });

    test('should update tab information', async () => {
      await storageEngine.createTab(mockTab, mockSession.id);
      
      const updates = {
        title: 'Updated Page Title',
        timeSpent: 60000
      };
      
      const updatedTab = await storageEngine.updateTab(mockTab.id, updates);
      
      expect(updatedTab.title).toBe(updates.title);
      expect(updatedTab.timeSpent).toBe(updates.timeSpent);
      expect(updatedTab.lastModified).toBeDefined();
    });

    test('should handle tab not found for updates', async () => {
      await expect(storageEngine.updateTab(999, {}))
        .rejects.toThrow('Tab not found: 999');
    });

    test('should query tabs with filters', async () => {
      const query = {
        sessionIds: [mockSession.id],
        domains: ['example.com']
      };
      
      const results = await storageEngine.queryTabs(query);
      expect(Array.isArray(results)).toBe(true);
    });

    test('should delete tab and related navigation events', async () => {
      await storageEngine.createTab(mockTab, mockSession.id);
      
      await expect(storageEngine.deleteTab(mockTab.id)).resolves.toBeUndefined();
    });
  });

  // =============================================================================
  // NAVIGATION EVENT TESTS
  // =============================================================================

  describe('Navigation Event Operations', () => {
    beforeEach(async () => {
      // Initialize storage engine
      const mockRequest = {
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        result: new MockIDBDatabase()
      };
      
      mockIndexedDB.open.mockReturnValue(mockRequest);
      
      const initPromise = storageEngine.initialize();
      
      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({ target: { result: new MockIDBDatabase() } });
        }
      }, 0);
      
      await initPromise;
      
      // Create session and tab
      await storageEngine.createSession(mockSession);
      await storageEngine.createTab(mockTab, mockSession.id);
    });

    test('should create navigation event successfully', async () => {
      const storedEvent = await storageEngine.createNavigationEvent(mockNavigationEvent, mockSession.id);
      
      expect(storedEvent).toBeDefined();
      expect(storedEvent.tabId).toBe(mockNavigationEvent.tabId);
      expect(storedEvent.sessionId).toBe(mockSession.id);
      expect(storedEvent.domain).toBe('example.com');
      expect(storedEvent.checksum).toBeDefined();
    });

    test('should query navigation events with filters', async () => {
      const query = {
        sessionIds: [mockSession.id],
        tabIds: [mockTab.id],
        dateRange: {
          start: Date.now() - 60000,
          end: Date.now() + 60000
        }
      };
      
      const results = await storageEngine.queryNavigationEvents(query);
      expect(Array.isArray(results)).toBe(true);
    });

    test('should handle navigation events for different tabs', async () => {
      const event1 = { ...mockNavigationEvent, tabId: 1, url: 'https://example.com/page1' };
      const event2 = { ...mockNavigationEvent, tabId: 2, url: 'https://example.com/page2' };
      
      await storageEngine.createNavigationEvent(event1, mockSession.id);
      await storageEngine.createNavigationEvent(event2, mockSession.id);
      
      const tabResults = await storageEngine.queryNavigationEvents({
        tabIds: [1]
      });
      
      expect(Array.isArray(tabResults)).toBe(true);
    });
  });

  // =============================================================================
  // ERROR HANDLING TESTS
  // =============================================================================

  describe('Error Handling', () => {
    test('should handle database connection errors', async () => {
      const mockRequest = {
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        error: new Error('Connection failed')
      };
      
      mockIndexedDB.open.mockReturnValue(mockRequest);
      
      const initPromise = storageEngine.initialize();
      
      setTimeout(() => {
        if (mockRequest.onerror) {
          mockRequest.onerror({ target: { error: new Error('Connection failed') } });
        }
      }, 0);
      
      await expect(initPromise).rejects.toThrow();
    });

    test('should handle operation errors gracefully', async () => {
      // Test operations without initialization
      await expect(storageEngine.createSession(mockSession))
        .rejects.toThrow();
    });

    test('should validate required fields', () => {
      const invalidSession = { ...mockSession };
      delete (invalidSession as any).id;
      
      expect(() => storageEngine.createSession(invalidSession))
        .rejects.toThrow();
    });
  });

  // =============================================================================
  // PERFORMANCE TESTS
  // =============================================================================

  describe('Performance', () => {
    beforeEach(async () => {
      // Initialize storage engine
      const mockRequest = {
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        result: new MockIDBDatabase()
      };
      
      mockIndexedDB.open.mockReturnValue(mockRequest);
      
      const initPromise = storageEngine.initialize();
      
      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({ target: { result: new MockIDBDatabase() } });
        }
      }, 0);
      
      await initPromise;
    });

    test('should handle large numbers of sessions efficiently', async () => {
      const sessions: BrowsingSession[] = [];
      
      for (let i = 0; i < 100; i++) {
        sessions.push({
          ...mockSession,
          id: `session-${i}`,
          tag: `Session ${i}`
        });
      }
      
      const startTime = performance.now();
      
      for (const session of sessions) {
        await storageEngine.createSession(session);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (adjust based on your requirements)
      expect(duration).toBeLessThan(5000); // 5 seconds
    });

    test('should handle concurrent operations', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        const session = {
          ...mockSession,
          id: `concurrent-session-${i}`,
          tag: `Concurrent Session ${i}`
        };
        
        promises.push(storageEngine.createSession(session));
      }
      
      await expect(Promise.all(promises)).resolves.toHaveLength(10);
    });
  });

  // =============================================================================
  // UTILITY TESTS
  // =============================================================================

  describe('Utilities', () => {
    beforeEach(async () => {
      // Initialize storage engine
      const mockRequest = {
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        result: new MockIDBDatabase()
      };
      
      mockIndexedDB.open.mockReturnValue(mockRequest);
      
      const initPromise = storageEngine.initialize();
      
      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({ target: { result: new MockIDBDatabase() } });
        }
      }, 0);
      
      await initPromise;
    });

    test('should provide storage statistics', async () => {
      const stats = await storageEngine.getStorageStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats.sessions).toBe('number');
      expect(typeof stats.tabs).toBe('number');
      expect(typeof stats.navigationEvents).toBe('number');
      expect(typeof stats.storageSize).toBe('number');
      expect(typeof stats.integrityStatus).toBe('boolean');
    });

    test('should clear all data when requested', async () => {
      await storageEngine.createSession(mockSession);
      await storageEngine.clearAllData();
      
      const stats = await storageEngine.getStorageStats();
      expect(stats.sessions).toBe(0);
    });

    test('should shutdown gracefully', async () => {
      await expect(storageEngine.shutdown()).resolves.toBeUndefined();
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('SessionStorageEngine Integration', () => {
  let engine: SessionStorageEngine;

  beforeAll(async () => {
    engine = new SessionStorageEngine({
      enableCompression: true,
      enableIntegrityChecks: true
    });
  });

  afterAll(async () => {
    if (engine) {
      await engine.shutdown();
    }
  });

  test('should handle complete session lifecycle', async () => {
    // Mock initialization
    const mockRequest = {
      onsuccess: null as any,
      onerror: null as any,
      onupgradeneeded: null as any,
      result: new MockIDBDatabase()
    };
    
    mockIndexedDB.open.mockReturnValue(mockRequest);
    
    const initPromise = engine.initialize();
    
    setTimeout(() => {
      if (mockRequest.onsuccess) {
        mockRequest.onsuccess({ target: { result: new MockIDBDatabase() } });
      }
    }, 0);
    
    await initPromise;

    // Create session
    const session = await engine.createSession(mockSession);
    expect(session.id).toBe(mockSession.id);

    // Create tabs
    const tab = await engine.createTab(mockTab, session.id);
    expect(tab.sessionId).toBe(session.id);

    // Create navigation events
    const navEvent = await engine.createNavigationEvent(mockNavigationEvent, session.id);
    expect(navEvent.sessionId).toBe(session.id);

    // Query data
    const sessions = await engine.querySessions({ sessionIds: [session.id] });
    expect(sessions).toHaveLength(1);

    const tabs = await engine.queryTabs({ sessionIds: [session.id] });
    expect(tabs).toHaveLength(1);

    const events = await engine.queryNavigationEvents({ sessionIds: [session.id] });
    expect(events).toHaveLength(1);

    // Clean up
    await engine.deleteSession(session.id);
  });
});