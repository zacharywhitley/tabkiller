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
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn()
    }
  },
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
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn()
    }
  },
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

// Setup jsdom environment  
delete (window as any).location;
(window as any).location = {
  href: 'https://example.com',
  origin: 'https://example.com',
  pathname: '/',
  search: '',
  hash: ''
};

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