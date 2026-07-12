/**
 * Jest test setup file
 * Global test configuration and mocks
 */

import 'jest';

// Mock webextension-polyfill
jest.mock('webextension-polyfill', () => ({
  runtime: {
    getManifest: jest.fn(() => ({
      manifest_version: 3,
      name: 'TabKiller',
      version: '0.1.0'
    })),
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    },
    onStartup: {
      addListener: jest.fn()
    },
    onInstalled: {
      addListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    sendMessage: jest.fn(),
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onCreated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onActivated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  // In-memory storage.local mock — real Promise semantics so await
  // chains resolve. Bare jest.fn()s used to return undefined
  // synchronously, breaking every module that awaited storage.
  storage: (() => {
    const store = new Map<string, unknown>();
    return {
      local: {
        get: jest.fn(async (key: string | string[] | Record<string, unknown> | null) => {
          if (key == null) return Object.fromEntries(store);
          if (typeof key === 'string') return { [key]: store.get(key) };
          if (Array.isArray(key)) {
            const out: Record<string, unknown> = {};
            for (const k of key) out[k] = store.get(k);
            return out;
          }
          const out: Record<string, unknown> = {};
          for (const [k, defaultVal] of Object.entries(key as Record<string, unknown>)) {
            out[k] = store.has(k) ? store.get(k) : defaultVal;
          }
          return out;
        }),
        set: jest.fn(async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) store.set(k, v);
        }),
        remove: jest.fn(async (keys: string | string[]) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) store.delete(k);
        }),
        clear: jest.fn(async () => { store.clear(); }),
      },
    };
  })(),
  windows: {
    WINDOW_ID_NONE: -1,
    onCreated: {
      addListener: jest.fn()
    },
    onRemoved: {
      addListener: jest.fn()
    },
    onFocusChanged: {
      addListener: jest.fn()
    }
  },
  history: {
    search: jest.fn(),
    getVisits: jest.fn(),
    onVisited: {
      addListener: jest.fn()
    }
  },
  bookmarks: {
    search: jest.fn(),
    create: jest.fn(),
    remove: jest.fn(),
    onCreated: {
      addListener: jest.fn()
    },
    onRemoved: {
      addListener: jest.fn()
    }
  },
  contextMenus: {
    create: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    }
  }
}));

// Mock global chrome API
(global as any).chrome = {
  runtime: {
    getManifest: jest.fn(() => ({
      manifest_version: 3,
      name: 'TabKiller',
      version: '0.1.0'
    })),
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    },
    onStartup: {
      addListener: jest.fn()
    },
    onInstalled: {
      addListener: jest.fn()
    },
    getURL: jest.fn(path => `chrome-extension://test-id/${path}`)
  },
  tabs: {
    query: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    sendMessage: jest.fn(),
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onCreated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onActivated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  // In-memory storage.local mock — real Promise semantics so await
  // chains resolve. Bare jest.fn()s used to return undefined
  // synchronously, breaking every module that awaited storage.
  storage: (() => {
    const store = new Map<string, unknown>();
    return {
      local: {
        get: jest.fn(async (key: string | string[] | Record<string, unknown> | null) => {
          if (key == null) return Object.fromEntries(store);
          if (typeof key === 'string') return { [key]: store.get(key) };
          if (Array.isArray(key)) {
            const out: Record<string, unknown> = {};
            for (const k of key) out[k] = store.get(k);
            return out;
          }
          const out: Record<string, unknown> = {};
          for (const [k, defaultVal] of Object.entries(key as Record<string, unknown>)) {
            out[k] = store.has(k) ? store.get(k) : defaultVal;
          }
          return out;
        }),
        set: jest.fn(async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) store.set(k, v);
        }),
        remove: jest.fn(async (keys: string | string[]) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) store.delete(k);
        }),
        clear: jest.fn(async () => { store.clear(); }),
      },
    };
  })(),
  windows: {
    WINDOW_ID_NONE: -1,
    onCreated: {
      addListener: jest.fn()
    },
    onRemoved: {
      addListener: jest.fn()
    },
    onFocusChanged: {
      addListener: jest.fn()
    }
  },
  history: {
    search: jest.fn(),
    getVisits: jest.fn(),
    onVisited: {
      addListener: jest.fn()
    }
  },
  bookmarks: {
    search: jest.fn(),
    create: jest.fn(),
    remove: jest.fn(),
    onCreated: {
      addListener: jest.fn()
    },
    onRemoved: {
      addListener: jest.fn()
    }
  },
  contextMenus: {
    create: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    }
  }
};

// Mock DOM APIs that might be missing in jsdom
Object.defineProperty(window, 'chrome', {
  value: (global as any).chrome,
  writable: true
});

// Mock console methods for cleaner test output
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
  
  // Suppress console.warn during tests unless specifically testing error handling
  console.warn = jest.fn();
});

afterEach(() => {
  // Restore console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Global test utilities
(global as any).testUtils = {
  // Helper to create mock tab data
  createMockTab: (overrides = {}) => ({
    id: 1,
    url: 'https://example.com',
    title: 'Example Page',
    windowId: 1,
    active: true,
    pinned: false,
    ...overrides
  }),
  
  // Helper to create mock session data
  createMockSession: (overrides = {}) => ({
    id: 'session-123',
    tag: 'test-session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tabs: [],
    windowIds: [1],
    metadata: {
      isPrivate: false,
      totalTime: 0,
      pageCount: 0,
      domain: []
    },
    ...overrides
  }),
  
  // Helper to create mock browser API responses
  mockBrowserAPI: {
    tabs: {
      query: (tabs = []) => {
        (chrome.tabs.query as jest.Mock).mockResolvedValue(tabs);
      },
      create: (tab = {}) => {
        (chrome.tabs.create as jest.Mock).mockResolvedValue({ id: 1, ...tab });
      }
    },
    storage: {
      get: (data = {}) => {
        (chrome.storage.local.get as jest.Mock).mockResolvedValue(data);
      },
      set: () => {
        (chrome.storage.local.set as jest.Mock).mockResolvedValue(undefined);
      }
    }
  }
};

// jsdom URL is set via jest.config.js `testEnvironmentOptions.url`.
// Do not assign to window.location here — jsdom 26 makes the slot
// non-configurable, and assigning to `.href` triggers real navigation.

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn()
}));

// Mock MutationObserver
global.MutationObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn()
}));

// jsdom 26 doesn't expose crypto.subtle (Web Crypto API), so every
// isWebCryptoSupported() check returns false and all of src/crypto/**
// throws. Node ships webcrypto as node:crypto.webcrypto — install it
// globally for the test environment.
{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
  const subtleCrypto = nodeCrypto.webcrypto as unknown as Crypto;
  Object.defineProperty(globalThis, 'crypto', {
    value: subtleCrypto,
    configurable: true,
  });
}

// TextEncoder / TextDecoder are Node built-ins but not attached to
// globalThis in jsdom. Wire them up for tests that convert between
// binary buffers and strings.
if (typeof (globalThis as { TextEncoder?: unknown }).TextEncoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const util = require('node:util') as typeof import('node:util');
  (globalThis as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = util.TextEncoder;
  (globalThis as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = util.TextDecoder;
}