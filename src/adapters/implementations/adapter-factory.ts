/**
 * Browser adapter factory
 * Creates appropriate browser adapters based on the detected browser
 */

import browser from 'webextension-polyfill';
import { 
  BrowserType, 
  BrowserConfig,
  AdapterResult,
  BrowserAdapterError
} from '../interfaces/base';
import { 
  CrossBrowserAdapter,
  BrowserAdapterFactory,
  TabsAdapter,
  StorageAdapter,
  MessagingAdapter,
  HistoryAdapter,
  WindowsAdapter,
  AdapterSystemConfig
} from '../interfaces';
import { BrowserDetector } from '../utils/browser-detection';
import { ChromeTabsAdapter } from './chrome-adapter';

/**
 * Universal cross-browser adapter implementation
 */
export class UniversalBrowserAdapter implements CrossBrowserAdapter {
  public readonly config: BrowserConfig;
  public readonly browserType: BrowserType;
  
  public readonly tabs: TabsAdapter;
  public readonly storage: StorageAdapter;
  public readonly messaging: MessagingAdapter;
  public readonly windows: WindowsAdapter;
  public readonly history?: HistoryAdapter;
  
  private detector: BrowserDetector;
  private systemConfig: AdapterSystemConfig;

  constructor(
    detector: BrowserDetector,
    systemConfig: AdapterSystemConfig = {}
  ) {
    this.detector = detector;
    this.systemConfig = {
      debug: false,
      logLevel: 'warn',
      enableGracefulDegradation: true,
      enableRetryMechanism: true,
      enableCaching: true,
      cacheTimeout: 5000,
      retryAttempts: 3,
      retryDelay: 1000,
      throwOnUnsupportedFeature: false,
      fallbackToPolyfill: true,
      ...systemConfig
    };

    this.config = detector.getBrowserConfig();
    this.browserType = this.config.type;

    // Initialize adapters based on browser type
    this.tabs = this.createTabsAdapter();
    this.storage = this.createStorageAdapter();
    this.messaging = this.createMessagingAdapter();
    this.windows = this.createWindowsAdapter();
    
    // Optional adapters
    if (this.isApiSupported('history')) {
      this.history = this.createHistoryAdapter();
    }

    if (this.systemConfig.debug) {
      console.log('[BrowserAdapter] Initialized for', this.browserType, this.config);
    }
  }

  // API support detection
  isApiSupported(api: string): boolean {
    const supportMap: Record<string, boolean> = {
      'tabs': true, // Always supported
      'storage': true, // Always supported
      'messaging': true, // Always supported
      'windows': true, // Always supported
      'history': this.config.capabilities.manifestVersion >= 2,
      'bookmarks': typeof browser.bookmarks !== 'undefined',
      'permissions': this.config.capabilities.supportsPermissions,
      'notifications': this.config.capabilities.supportsNotifications,
      'contextMenus': this.config.capabilities.supportsContextMenus,
      'alarms': this.config.capabilities.supportsAlarms
    };

    return supportMap[api] ?? false;
  }

  getUnsupportedApis(): string[] {
    const allApis = ['tabs', 'storage', 'messaging', 'windows', 'history', 'bookmarks', 'permissions', 'notifications', 'contextMenus', 'alarms'];
    return allApis.filter(api => !this.isApiSupported(api));
  }

  getSupportedApis(): string[] {
    const allApis = ['tabs', 'storage', 'messaging', 'windows', 'history', 'bookmarks', 'permissions', 'notifications', 'contextMenus', 'alarms'];
    return allApis.filter(api => this.isApiSupported(api));
  }

  // Feature detection
  supportsManifestV3(): boolean {
    return this.config.capabilities.manifestVersion === 3;
  }

  supportsServiceWorker(): boolean {
    return this.config.capabilities.supportsServiceWorker;
  }

  supportsBackgroundScripts(): boolean {
    return this.config.capabilities.manifestVersion === 2;
  }

  // Error handling
  getLastError(): Error | null {
    try {
      return browser.runtime.lastError ? new Error(browser.runtime.lastError.message) : null;
    } catch {
      return null;
    }
  }

  handleError(error: Error, context?: string): void {
    if (this.systemConfig.debug) {
      console.error(`[BrowserAdapter${context ? ` - ${context}` : ''}]`, error);
    }
    
    // Could implement error reporting here
  }

  // Lifecycle
  async initialize(): Promise<void> {
    if (this.systemConfig.debug) {
      console.log('[BrowserAdapter] Initializing...');
    }
    
    // Perform any initialization tasks
    try {
      // Test basic browser API access
      await browser.runtime.getManifest();
      
      if (this.systemConfig.debug) {
        console.log('[BrowserAdapter] Initialization complete');
      }
    } catch (error) {
      throw new BrowserAdapterError(
        'Failed to initialize browser adapter',
        this.browserType,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async destroy(): Promise<void> {
    if (this.systemConfig.debug) {
      console.log('[BrowserAdapter] Destroying...');
    }
    
    // Clean up any resources
    // Note: Individual adapters should handle their own cleanup
  }

  // Runtime information
  getManifest(): chrome.runtime.Manifest {
    return browser.runtime.getManifest() as chrome.runtime.Manifest;
  }

  getId(): string {
    return browser.runtime.id || 'unknown';
  }

  getVersion(): string {
    return this.getManifest().version || '0.0.0';
  }

  // Development utilities
  isDevelopment(): boolean {
    return !('update_url' in this.getManifest());
  }

  enableDebugMode(enabled: boolean): void {
    this.systemConfig.debug = enabled;
  }

  getDebugInfo() {
    return {
      browserType: this.browserType,
      manifestVersion: this.config.capabilities.manifestVersion,
      supportedApis: this.getSupportedApis(),
      config: this.config
    };
  }

  // Private adapter creation methods
  private createTabsAdapter(): TabsAdapter {
    switch (this.browserType) {
      case 'chrome':
      case 'edge':
        return new ChromeTabsAdapter(this.config);
      case 'firefox':
        // Would create FirefoxTabsAdapter
        return new ChromeTabsAdapter(this.config); // Fallback for now
      case 'safari':
        // Would create SafariTabsAdapter
        return new ChromeTabsAdapter(this.config); // Fallback for now
      default:
        return new ChromeTabsAdapter(this.config); // Default fallback
    }
  }

  private createStorageAdapter(): StorageAdapter {
    // For now, return a basic implementation
    // Would implement browser-specific storage adapters
    return {} as StorageAdapter;
  }

  private createMessagingAdapter(): MessagingAdapter {
    // For now, return a basic implementation
    return {} as MessagingAdapter;
  }

  private createWindowsAdapter(): WindowsAdapter {
    // For now, return a basic implementation
    return {} as WindowsAdapter;
  }

  private createHistoryAdapter(): HistoryAdapter {
    // For now, return a basic implementation
    return {} as HistoryAdapter;
  }
}

/**
 * Browser adapter factory implementation
 */
export class BrowserAdapterFactoryImpl implements BrowserAdapterFactory {
  private static instance: BrowserAdapterFactoryImpl | null = null;
  private detector: BrowserDetector;

  private constructor() {
    this.detector = BrowserDetector.getInstance();
  }

  static getInstance(): BrowserAdapterFactoryImpl {
    if (!BrowserAdapterFactoryImpl.instance) {
      BrowserAdapterFactoryImpl.instance = new BrowserAdapterFactoryImpl();
    }
    return BrowserAdapterFactoryImpl.instance;
  }

  async create(browserType?: BrowserType, config?: AdapterSystemConfig): Promise<CrossBrowserAdapter> {
    // Clear cache if browser type is specified (for testing)
    if (browserType) {
      this.detector.clearCache();
    }

    const adapter = new UniversalBrowserAdapter(this.detector, config);
    await adapter.initialize();
    
    return adapter;
  }

  detectBrowser(): BrowserType {
    return this.detector.detectBrowser().type;
  }

  isSupported(browserType: BrowserType): boolean {
    return ['chrome', 'firefox', 'safari', 'edge'].includes(browserType);
  }

  getSupportedBrowsers(): BrowserType[] {
    return ['chrome', 'firefox', 'safari', 'edge'];
  }
}

// Convenience functions
export const createBrowserAdapter = async (
  config?: AdapterSystemConfig
): Promise<CrossBrowserAdapter> => {
  return BrowserAdapterFactoryImpl.getInstance().create(undefined, config);
};

export const detectCurrentBrowser = (): BrowserType => {
  return BrowserAdapterFactoryImpl.getInstance().detectBrowser();
};

export const isBrowserSupported = (browserType: BrowserType): boolean => {
  return BrowserAdapterFactoryImpl.getInstance().isSupported(browserType);
};