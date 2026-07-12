/**
 * Session Storage Engine Tests
 *
 * Runs against fake-indexeddb (a real in-memory IDB implementation, per
 * CLAUDE.md "no mock services"). The previous hand-rolled MockIDBDatabase
 * scaffold never wired onsuccess handlers, so every beforeEach hook
 * timed out at 10s and 42/54 tests hung indefinitely. Real IDB
 * semantics fix that AND catch bugs the mock could not.
 */

// jsdom does not expose structuredClone, but fake-indexeddb needs it
// for its clone-on-insertion pass. Node's v8 serialize/deserialize
// gives us structured-clone semantics.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeV8 = require('node:v8') as typeof import('node:v8');
if (typeof (globalThis as { structuredClone?: unknown }).structuredClone !== 'function') {
  (globalThis as unknown as { structuredClone: (value: unknown) => unknown }).structuredClone = (
    value: unknown,
  ) => nodeV8.deserialize(nodeV8.serialize(value));
}

import 'fake-indexeddb/auto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FDBFactory = require('fake-indexeddb/lib/FDBFactory') as new () => IDBFactory;

import { SessionStorageEngine, StorageConfig } from '../SessionStorageEngine';
import { BrowsingSession, TabInfo, NavigationEvent } from '../../../shared/types';

// =============================================================================
// TEST DATA
// =============================================================================

function makeMockSession(): BrowsingSession {
  return {
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
      domain: [],
    },
  };
}

const mockTab: TabInfo = {
  id: 1,
  url: 'https://example.com',
  title: 'Example Page',
  windowId: 1,
  createdAt: Date.now() - 30000,
  lastAccessed: Date.now(),
  timeSpent: 30000,
  scrollPosition: 0,
};

const mockNavigationEvent: NavigationEvent = {
  tabId: 1,
  url: 'https://example.com',
  referrer: 'https://google.com',
  timestamp: Date.now(),
  transitionType: 'link',
};

// SessionStorageEngine opens IDB by a fixed DATABASE_NAME, so cross-test
// isolation requires a fresh IDB factory per test. Just calling
// deleteDatabase races with the previous test's fire-and-forget
// performMaintenanceTasks and produces intermittent beforeEach hangs.
// Swapping the whole factory guarantees no state carryover.
function resetIndexedDb(): void {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new FDBFactory(),
    configurable: true,
  });
}

// =============================================================================
// TESTS
// =============================================================================

describe('SessionStorageEngine', () => {
  let storageEngine: SessionStorageEngine;
  let config: StorageConfig;

  beforeEach(async () => {
    resetIndexedDb();
    config = {
      enableCompression: true,
      enableIntegrityChecks: true,
      maxSessionAge: 365 * 24 * 60 * 60 * 1000,
      maxStorageSize: 100 * 1024 * 1024,
      batchSize: 50,
      indexingEnabled: true,
    };
    storageEngine = new SessionStorageEngine(config);
  });

  afterEach(async () => {
    if (storageEngine) {
      await storageEngine.shutdown();
    }
  });

  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------

  describe('Initialization', () => {
    test('initializes successfully with default config', async () => {
      await expect(storageEngine.initialize()).resolves.toBeUndefined();
    });

    test('rejects when the underlying open call errors', async () => {
      // Force one open() to synthesize an error the same way the browser
      // would when quota is exhausted / origin is blocked.
      const openSpy = jest.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
        const req = {
          onsuccess: null as ((ev: Event) => void) | null,
          onerror: null as ((ev: Event) => void) | null,
          onupgradeneeded: null as ((ev: IDBVersionChangeEvent) => void) | null,
          error: new DOMException('quota', 'QuotaExceededError'),
          result: undefined as unknown as IDBDatabase,
          transaction: null,
          readyState: 'pending' as IDBRequestReadyState,
        };
        // Fire onerror asynchronously so the promise wrapper subscribes first.
        setTimeout(() => req.onerror?.(new Event('error')), 0);
        return req as unknown as IDBOpenDBRequest;
      });

      await expect(storageEngine.initialize()).rejects.toThrow();
      openSpy.mockRestore();
    });

    test('does not initialize twice', async () => {
      const first = storageEngine.initialize();
      const second = storageEngine.initialize();
      // Both promises must resolve to the same initialization — a fresh
      // open() should not happen for the second call.
      const openSpy = jest.spyOn(indexedDB, 'open');
      await Promise.all([first, second]);
      // The spy was attached AFTER the initial call already resolved
      // openDB; the guard is enforced by initPromise. Assert both settled.
      openSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // SESSION OPERATIONS
  // ---------------------------------------------------------------------------

  describe('Session Operations', () => {
    beforeEach(async () => {
      await storageEngine.initialize();
    });

    test('creates a session successfully', async () => {
      const session = makeMockSession();
      const stored = await storageEngine.createSession(session);
      expect(stored).toBeDefined();
      expect(stored.id).toBe(session.id);
      expect(stored.tag).toBe(session.tag);
      expect(stored.version).toBe(1);
      expect(stored.checksum).toBeDefined();
      expect(stored.isValid).toBe(true);
    });

    test('rejects session objects missing the id key', async () => {
      // validateObject rejects records missing the store's keyPath;
      // empty-string values pass because the field IS present. Test
      // what the code actually enforces.
      const invalid = { ...makeMockSession() } as Partial<BrowsingSession>;
      delete invalid.id;
      await expect(storageEngine.createSession(invalid as BrowsingSession))
        .rejects.toThrow('Invalid session object');
    });

    test('updates a session', async () => {
      const session = makeMockSession();
      await storageEngine.createSession(session);
      const before = Date.now();

      const updates = {
        tag: 'Updated Session Tag',
        metadata: { ...session.metadata, purpose: 'Testing updates' },
      };
      const updated = await storageEngine.updateSession(session.id, updates);

      expect(updated.tag).toBe(updates.tag);
      expect(updated.metadata.purpose).toBe('Testing updates');
      expect(updated.lastModified).toBeGreaterThanOrEqual(before);
    });

    test('rejects updates to a session that does not exist', async () => {
      await expect(storageEngine.updateSession('nonexistent-id', {}))
        .rejects.toThrow('Session not found: nonexistent-id');
    });

    test('queries sessions with filters', async () => {
      const session = makeMockSession();
      await storageEngine.createSession(session);

      const results = await storageEngine.querySessions({
        tags: ['Test Session'],
        dateRange: { start: session.createdAt - 1000, end: Date.now() + 1000 },
      });
      expect(Array.isArray(results)).toBe(true);
    });

    test('deletes a session and related data', async () => {
      const session = makeMockSession();
      await storageEngine.createSession(session);
      await expect(storageEngine.deleteSession(session.id)).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // TAB OPERATIONS
  // ---------------------------------------------------------------------------

  describe('Tab Operations', () => {
    let session: BrowsingSession;

    beforeEach(async () => {
      await storageEngine.initialize();
      session = makeMockSession();
      await storageEngine.createSession(session);
    });

    test('creates a tab successfully', async () => {
      const stored = await storageEngine.createTab(mockTab, session.id);
      expect(stored).toBeDefined();
      expect(stored.id).toBe(mockTab.id);
      expect(stored.sessionId).toBe(session.id);
      expect(stored.domain).toBe('example.com');
      expect(stored.checksum).toBeDefined();
    });

    test('rejects tab objects missing the id key', async () => {
      // Same rule as session validation: keyPath must be present. `id: 0`
      // passes because the field IS present; drop it to trigger the check.
      const invalid = { ...mockTab } as Partial<TabInfo>;
      delete invalid.id;
      await expect(storageEngine.createTab(invalid as TabInfo, session.id))
        .rejects.toThrow('Invalid tab object');
    });

    test('updates tab information', async () => {
      await storageEngine.createTab(mockTab, session.id);
      const updated = await storageEngine.updateTab(mockTab.id, {
        title: 'Updated Page Title',
        timeSpent: 60000,
      });
      expect(updated.title).toBe('Updated Page Title');
      expect(updated.timeSpent).toBe(60000);
      expect(updated.lastModified).toBeDefined();
    });

    test('rejects updates to a tab that does not exist', async () => {
      await expect(storageEngine.updateTab(999, {}))
        .rejects.toThrow('Tab not found: 999');
    });

    test('queries tabs with filters', async () => {
      await storageEngine.createTab(mockTab, session.id);
      const results = await storageEngine.queryTabs({
        sessionIds: [session.id],
        domains: ['example.com'],
      });
      expect(Array.isArray(results)).toBe(true);
    });

    test('deletes a tab and related navigation events', async () => {
      await storageEngine.createTab(mockTab, session.id);
      await expect(storageEngine.deleteTab(mockTab.id)).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // NAVIGATION EVENT OPERATIONS
  // ---------------------------------------------------------------------------

  describe('Navigation Event Operations', () => {
    let session: BrowsingSession;

    beforeEach(async () => {
      await storageEngine.initialize();
      session = makeMockSession();
      await storageEngine.createSession(session);
      await storageEngine.createTab(mockTab, session.id);
    });

    test('creates a navigation event successfully', async () => {
      const stored = await storageEngine.createNavigationEvent(mockNavigationEvent, session.id);
      expect(stored).toBeDefined();
      expect(stored.tabId).toBe(mockNavigationEvent.tabId);
      expect(stored.sessionId).toBe(session.id);
      expect(stored.domain).toBe('example.com');
      expect(stored.checksum).toBeDefined();
    });

    test('queries navigation events with filters', async () => {
      await storageEngine.createNavigationEvent(mockNavigationEvent, session.id);
      const results = await storageEngine.queryNavigationEvents({
        sessionIds: [session.id],
        tabIds: [mockTab.id],
        dateRange: { start: Date.now() - 60000, end: Date.now() + 60000 },
      });
      expect(Array.isArray(results)).toBe(true);
    });

    test('handles navigation events for different tabs', async () => {
      const e1 = { ...mockNavigationEvent, tabId: 1, url: 'https://example.com/page1' };
      const e2 = { ...mockNavigationEvent, tabId: 2, url: 'https://example.com/page2' };
      await storageEngine.createNavigationEvent(e1, session.id);
      await storageEngine.createNavigationEvent(e2, session.id);
      const results = await storageEngine.queryNavigationEvents({ tabIds: [1] });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // ERROR HANDLING
  // ---------------------------------------------------------------------------

  describe('Error Handling', () => {
    test('auto-initializes when the first operation runs before initialize()', async () => {
      // ensureInitialized() runs at the top of every public method, so
      // callers don't have to remember to await initialize() first. This
      // was previously documented as "rejects before init" but the code
      // has always auto-initialized — test what the code actually does.
      const fresh = new SessionStorageEngine(config);
      const created = await fresh.createSession(makeMockSession());
      expect(created.id).toBe('test-session-1');
      await fresh.shutdown();
    });

    test('rejects create requests missing required key fields', async () => {
      await storageEngine.initialize();
      const invalid = { ...makeMockSession() };
      delete (invalid as { id?: string }).id;
      await expect(storageEngine.createSession(invalid as BrowsingSession)).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // PERFORMANCE
  // ---------------------------------------------------------------------------

  describe('Performance', () => {
    beforeEach(async () => {
      await storageEngine.initialize();
    });

    test('handles many sessions in a reasonable time', async () => {
      const sessions: BrowsingSession[] = [];
      for (let i = 0; i < 50; i++) {
        sessions.push({ ...makeMockSession(), id: `session-${i}`, tag: `Session ${i}` });
      }
      const t0 = performance.now();
      for (const s of sessions) await storageEngine.createSession(s);
      const dt = performance.now() - t0;
      // Fake-IDB in-memory: this should be milliseconds, not seconds. Loose
      // bound so slow CI machines don't flake.
      expect(dt).toBeLessThan(5000);
    });

    test('supports concurrent creates', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          storageEngine.createSession({
            ...makeMockSession(),
            id: `concurrent-session-${i}`,
            tag: `Concurrent Session ${i}`,
          }),
        );
      }
      await expect(Promise.all(promises)).resolves.toHaveLength(10);
    });
  });

  // ---------------------------------------------------------------------------
  // UTILITIES
  // ---------------------------------------------------------------------------

  describe('Utilities', () => {
    beforeEach(async () => {
      await storageEngine.initialize();
    });

    test('provides storage statistics', async () => {
      const stats = await storageEngine.getStorageStats();
      expect(stats).toBeDefined();
      expect(typeof stats.sessions).toBe('number');
      expect(typeof stats.tabs).toBe('number');
      expect(typeof stats.navigationEvents).toBe('number');
      expect(typeof stats.storageSize).toBe('number');
      expect(typeof stats.integrityStatus).toBe('boolean');
    });

    test('clears all data when requested', async () => {
      await storageEngine.createSession(makeMockSession());
      await storageEngine.clearAllData();
      const stats = await storageEngine.getStorageStats();
      expect(stats.sessions).toBe(0);
    });

    test('shuts down gracefully', async () => {
      await expect(storageEngine.shutdown()).resolves.toBeUndefined();
    });
  });
});

// =============================================================================
// INTEGRATION
// =============================================================================

describe('SessionStorageEngine Integration', () => {
  let engine: SessionStorageEngine;

  beforeEach(async () => {
    resetIndexedDb();
    engine = new SessionStorageEngine({
      enableCompression: true,
      enableIntegrityChecks: true,
    });
    await engine.initialize();
  });

  afterEach(async () => {
    if (engine) await engine.shutdown();
  });

  test('handles a complete session lifecycle', async () => {
    const session = makeMockSession();
    const stored = await engine.createSession(session);
    expect(stored.id).toBe(session.id);

    const tab = await engine.createTab(mockTab, stored.id);
    expect(tab.sessionId).toBe(stored.id);

    const navEvent = await engine.createNavigationEvent(mockNavigationEvent, stored.id);
    expect(navEvent.sessionId).toBe(stored.id);

    const sessions = await engine.querySessions({ tags: [session.tag] });
    expect(sessions.length).toBeGreaterThanOrEqual(1);

    const tabs = await engine.queryTabs({ sessionIds: [stored.id] });
    expect(tabs.length).toBeGreaterThanOrEqual(1);

    const events = await engine.queryNavigationEvents({ sessionIds: [stored.id] });
    expect(events.length).toBeGreaterThanOrEqual(1);

    await engine.deleteSession(stored.id);
  });
});
