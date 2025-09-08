/**
 * Test suite for the cross-browser adapter system
 */

import { 
  BrowserDetector,
  BrowserAdapterFactoryImpl,
  UniversalBrowserAdapter
} from '../implementations/adapter-factory';
import { 
  BrowserType,
  BrowserConfig,
  AdapterSystemConfig
} from '../interfaces/base';

// Mock webextension-polyfill
jest.mock('webextension-polyfill', () => ({
  runtime: {
    getManifest: jest.fn(() => ({
      manifest_version: 3,
      version: '1.0.0'
    })),
    id: 'test-extension-id',
    lastError: null,
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
      hasListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    duplicate: jest.fn(),
    reload: jest.fn(),
    move: jest.fn(),
    sendMessage: jest.fn(),
    connect: jest.fn(),
    onCreated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
      hasListener: jest.fn()
    },
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
      hasListener: jest.fn()
    },
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
      hasListener: jest.fn()
    },
    onActivated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
      hasListener: jest.fn()
    },
    onMoved: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
      hasListener: jest.fn()
    },
    onReplaced: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
      hasListener: jest.fn()
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
    get: jest.fn(),
    getAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn()
  }
}));

// Mock chrome global
(global as any).chrome = {
  runtime: {
    getManifest: jest.fn(() => ({
      manifest_version: 3,
      version: '1.0.0'
    })),
    id: 'test-extension-id',
    sendMessage: jest.fn()
  },
  tabs: {
    query: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    discard: jest.fn()
  },
  tabGroups: {
    group: jest.fn(),
    ungroup: jest.fn()
  },
  scripting: {
    executeScript: jest.fn(),
    insertCSS: jest.fn(),
    removeCSS: jest.fn()
  }
};

// Mock navigator
Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  },
  writable: true
});

describe('BrowserDetector', () => {
  let detector: BrowserDetector;

  beforeEach(() => {
    detector = BrowserDetector.getInstance();
    detector.clearCache(); // Clear cache before each test
  });

  test('should detect Chrome browser correctly', () => {
    const browserInfo = detector.detectBrowser();
    
    expect(browserInfo.type).toBe('chrome');
    expect(browserInfo.name).toBe('Google Chrome');
    expect(browserInfo.majorVersion).toBeGreaterThan(0);
    expect(browserInfo.userAgent).toContain('Chrome');
  });

  test('should get correct browser configuration', () => {
    const config = detector.getBrowserConfig();
    
    expect(config.type).toBe('chrome');
    expect(config.capabilities.manifestVersion).toBe(3);
    expect(config.capabilities.supportsServiceWorker).toBe(true);
    expect(config.capabilities.supportsDeclarativeNetRequest).toBe(true);
    expect(config.actionAPIName).toBe('action');
    expect(config.backgroundType).toBe('service-worker');
  });

  test('should get browser capabilities', () => {
    const capabilities = detector.getBrowserCapabilities();
    
    expect(capabilities.manifestVersion).toBe(3);
    expect(capabilities.supportsServiceWorker).toBe(true);
    expect(capabilities.supportsActionAPI).toBe(true);
    expect(capabilities.supportsBrowserAction).toBe(false);
    expect(capabilities.storageQuotaBytes).toBe(5242880); // 5MB
  });

  test('should get runtime environment', () => {
    const runtime = detector.getRuntimeEnvironment();
    
    expect(runtime.isExtension).toBe(true);
    expect(runtime.manifestVersion).toBe(3);
    expect(runtime.extensionId).toBe('test-extension-id');
  });

  test('should test feature support correctly', () => {
    expect(detector.testFeatureSupport('service-worker')).toBe(true);
    expect(detector.testFeatureSupport('storage-session')).toBe(true);
    expect(detector.testFeatureSupport('action-api')).toBe(true);
    expect(detector.testFeatureSupport('unknown-feature')).toBe(false);
  });

  test('should cache results', () => {
    const info1 = detector.detectBrowser();
    const info2 = detector.detectBrowser();
    
    expect(info1).toBe(info2); // Same object reference due to caching
  });

  test('should clear cache correctly', () => {
    const info1 = detector.detectBrowser();
    detector.clearCache();
    const info2 = detector.detectBrowser();
    
    expect(info1).not.toBe(info2); // Different object references after cache clear
    expect(info1).toEqual(info2); // But same content
  });
});

describe('BrowserAdapterFactory', () => {
  let factory: BrowserAdapterFactoryImpl;

  beforeEach(() => {
    factory = BrowserAdapterFactoryImpl.getInstance();
  });

  test('should detect browser type', () => {
    const browserType = factory.detectBrowser();
    expect(browserType).toBe('chrome');
  });

  test('should check if browser is supported', () => {
    expect(factory.isSupported('chrome')).toBe(true);
    expect(factory.isSupported('firefox')).toBe(true);
    expect(factory.isSupported('safari')).toBe(true);
    expect(factory.isSupported('edge')).toBe(true);
    expect(factory.isSupported('unknown' as BrowserType)).toBe(false);
  });

  test('should get supported browsers', () => {
    const supported = factory.getSupportedBrowsers();
    expect(supported).toContain('chrome');
    expect(supported).toContain('firefox');
    expect(supported).toContain('safari');
    expect(supported).toContain('edge');
  });

  test('should create browser adapter', async () => {
    const adapter = await factory.create();
    
    expect(adapter).toBeInstanceOf(UniversalBrowserAdapter);
    expect(adapter.config.type).toBe('chrome');
    expect(adapter.tabs).toBeDefined();
    expect(adapter.storage).toBeDefined();
    expect(adapter.messaging).toBeDefined();
    expect(adapter.windows).toBeDefined();
  });

  test('should create adapter with custom config', async () => {
    const config: AdapterSystemConfig = {
      debug: true,
      enableGracefulDegradation: false,
      retryAttempts: 5
    };
    
    const adapter = await factory.create(undefined, config);
    expect(adapter).toBeDefined();
  });
});

describe('UniversalBrowserAdapter', () => {
  let adapter: UniversalBrowserAdapter;
  let detector: BrowserDetector;

  beforeEach(async () => {
    detector = BrowserDetector.getInstance();
    detector.clearCache();
    
    adapter = new UniversalBrowserAdapter(detector, {
      debug: false,
      enableGracefulDegradation: true
    });
    
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.destroy();
  });

  test('should initialize correctly', () => {
    expect(adapter.browserType).toBe('chrome');
    expect(adapter.config.type).toBe('chrome');
    expect(adapter.tabs).toBeDefined();
    expect(adapter.storage).toBeDefined();
    expect(adapter.messaging).toBeDefined();
    expect(adapter.windows).toBeDefined();
  });

  test('should detect API support', () => {
    expect(adapter.isApiSupported('tabs')).toBe(true);
    expect(adapter.isApiSupported('storage')).toBe(true);
    expect(adapter.isApiSupported('messaging')).toBe(true);
    expect(adapter.isApiSupported('windows')).toBe(true);
    expect(adapter.isApiSupported('history')).toBe(true);
    expect(adapter.isApiSupported('unknown-api')).toBe(false);
  });

  test('should get supported APIs', () => {
    const supported = adapter.getSupportedApis();
    expect(supported).toContain('tabs');
    expect(supported).toContain('storage');
    expect(supported).toContain('messaging');
    expect(supported).toContain('windows');
  });

  test('should get unsupported APIs', () => {
    const unsupported = adapter.getUnsupportedApis();
    expect(unsupported.length).toBeGreaterThanOrEqual(0);
  });

  test('should support Manifest V3', () => {
    expect(adapter.supportsManifestV3()).toBe(true);
    expect(adapter.supportsServiceWorker()).toBe(true);
    expect(adapter.supportsBackgroundScripts()).toBe(false);
  });

  test('should get runtime information', () => {
    expect(adapter.getId()).toBe('test-extension-id');
    expect(adapter.getVersion()).toBe('1.0.0');
    expect(typeof adapter.isDevelopment()).toBe('boolean');
  });

  test('should get debug information', () => {
    const debugInfo = adapter.getDebugInfo();
    
    expect(debugInfo.browserType).toBe('chrome');
    expect(debugInfo.manifestVersion).toBe(3);
    expect(debugInfo.supportedApis).toBeInstanceOf(Array);
    expect(debugInfo.config).toBeDefined();
  });

  test('should handle last error', () => {
    const error = adapter.getLastError();
    expect(error).toBeNull(); // No error in mock
  });

  test('should enable debug mode', () => {
    adapter.enableDebugMode(true);
    expect(adapter.getDebugInfo().browserType).toBe('chrome');
    
    adapter.enableDebugMode(false);
    expect(adapter.getDebugInfo().browserType).toBe('chrome');
  });
});

describe('Chrome Tabs Adapter', () => {
  let adapter: UniversalBrowserAdapter;

  beforeEach(async () => {
    const detector = BrowserDetector.getInstance();
    detector.clearCache();
    
    adapter = new UniversalBrowserAdapter(detector);
    await adapter.initialize();
  });

  test('should query tabs', async () => {
    const mockTabs = [
      {
        id: 1,
        windowId: 1,
        index: 0,
        url: 'https://example.com',
        title: 'Example',
        active: true,
        pinned: false,
        highlighted: true,
        incognito: false,
        status: 'complete'
      }
    ];

    (require('webextension-polyfill').tabs.query as jest.Mock)
      .mockResolvedValue(mockTabs);

    const result = await adapter.tabs.query({ active: true });
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(1);
      expect(result.data[0].url).toBe('https://example.com');
    }
  });

  test('should get tab by ID', async () => {
    const mockTab = {
      id: 1,
      windowId: 1,
      index: 0,
      url: 'https://example.com',
      title: 'Example',
      active: true,
      pinned: false,
      highlighted: true,
      incognito: false,
      status: 'complete'
    };

    (require('webextension-polyfill').tabs.get as jest.Mock)
      .mockResolvedValue(mockTab);

    const result = await adapter.tabs.get(1);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(1);
      expect(result.data.url).toBe('https://example.com');
    }
  });

  test('should create tab', async () => {
    const mockTab = {
      id: 2,
      windowId: 1,
      index: 1,
      url: 'https://new-tab.com',
      title: 'New Tab',
      active: true,
      pinned: false,
      highlighted: true,
      incognito: false,
      status: 'loading'
    };

    (require('webextension-polyfill').tabs.create as jest.Mock)
      .mockResolvedValue(mockTab);

    const result = await adapter.tabs.create({ url: 'https://new-tab.com' });
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe('https://new-tab.com');
      expect(result.data.status).toBe('loading');
    }
  });

  test('should support tab groups in Chrome', () => {
    expect(adapter.tabs.supportsTabGroups()).toBe(true);
  });

  test('should support tab discard in Chrome', () => {
    expect(adapter.tabs.supportsTabDiscard()).toBe(true);
  });

  test('should support script injection in Chrome', () => {
    expect(adapter.tabs.supportsScriptInjection()).toBe(true);
  });
});

describe('Error Handling', () => {
  test('should handle unsupported feature errors', async () => {
    const detector = BrowserDetector.getInstance();
    detector.clearCache();
    
    // Mock Firefox-like environment
    (global as any).chrome = undefined;
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:91.0) Gecko/20100101 Firefox/91.0'
      },
      writable: true
    });
    
    const adapter = new UniversalBrowserAdapter(detector);
    await adapter.initialize();
    
    // Tab groups should not be supported in Firefox
    expect(adapter.tabs.supportsTabGroups()).toBe(false);
  });

  test('should handle adapter creation failures', async () => {
    // Mock broken environment
    const originalChrome = (global as any).chrome;
    (global as any).chrome = {
      runtime: {
        getManifest: jest.fn(() => {
          throw new Error('Access denied');
        })
      }
    };

    const factory = BrowserAdapterFactoryImpl.getInstance();
    
    try {
      await expect(factory.create()).rejects.toThrow();
    } finally {
      // Restore chrome global
      (global as any).chrome = originalChrome;
    }
  });
});