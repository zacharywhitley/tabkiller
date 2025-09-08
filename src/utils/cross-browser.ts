import browser from 'webextension-polyfill';
import { 
  initializeBrowserAdapter, 
  getBrowserAdapter, 
  isBrowserAdapterInitialized,
  BrowserType,
  getCurrentBrowserType
} from '../browser';

/**
 * Cross-browser compatibility utilities for WebExtensions
 * Handles differences between Chrome Manifest V3, Firefox, and Safari
 * 
 * @deprecated Use the new browser adapter system from '../browser' for enhanced functionality
 */

export type Browser = 'chrome' | 'firefox' | 'safari' | 'edge' | 'unknown';

/**
 * Detect the current browser environment
 * @deprecated Use getCurrentBrowserType() from '../browser' for enhanced detection
 */
export function detectBrowser(): Browser {
  // Use the new detection system if available
  try {
    return getCurrentBrowserType();
  } catch {
    // Fallback to legacy detection
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
      const manifest = chrome.runtime.getManifest();
      if (manifest.manifest_version === 3) {
        return 'chrome';
      }
    }
    
    if (typeof browser !== 'undefined' && browser.runtime) {
      return 'firefox';
    }
    
    if (typeof (globalThis as any).safari !== 'undefined') {
      return 'safari';
    }
    
    // Check for Edge
    if (navigator.userAgent.includes('Edg/')) {
      return 'edge';
    }
    
    return 'unknown';
  }
}

/**
 * Get the browser API object with proper typing
 */
export function getBrowserAPI() {
  return browser;
}

/**
 * Check if the current environment supports Manifest V3 features
 */
export function isManifestV3(): boolean {
  return detectBrowser() === 'chrome' && chrome.runtime.getManifest().manifest_version === 3;
}

/**
 * Cross-browser storage interface
 */
export const storage = {
  async get<T>(key: string | string[]): Promise<T> {
    const result = await browser.storage.local.get(key);
    return result as T;
  },
  
  async set(data: Record<string, unknown>): Promise<void> {
    await browser.storage.local.set(data);
  },
  
  async remove(key: string | string[]): Promise<void> {
    await browser.storage.local.remove(key);
  },
  
  async clear(): Promise<void> {
    await browser.storage.local.clear();
  }
};

/**
 * Cross-browser tabs API wrapper
 */
export const tabs = {
  async getCurrent(): Promise<browser.Tabs.Tab | undefined> {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  },
  
  async getAll(): Promise<browser.Tabs.Tab[]> {
    return browser.tabs.query({});
  },
  
  async create(options: browser.Tabs.CreateCreatePropertiesType): Promise<browser.Tabs.Tab> {
    return browser.tabs.create(options);
  },
  
  async update(tabId: number, options: browser.Tabs.UpdateUpdatePropertiesType): Promise<browser.Tabs.Tab> {
    return browser.tabs.update(tabId, options);
  },
  
  async remove(tabIds: number | number[]): Promise<void> {
    await browser.tabs.remove(tabIds);
  },
  
  onUpdated: browser.tabs.onUpdated,
  onCreated: browser.tabs.onCreated,
  onRemoved: browser.tabs.onRemoved,
  onActivated: browser.tabs.onActivated
};

/**
 * Cross-browser messaging utilities
 */
export const messaging = {
  async sendMessage<T = unknown>(message: unknown): Promise<T> {
    return browser.runtime.sendMessage(message) as Promise<T>;
  },
  
  async sendTabMessage<T = unknown>(tabId: number, message: unknown): Promise<T> {
    return browser.tabs.sendMessage(tabId, message) as Promise<T>;
  },
  
  onMessage: browser.runtime.onMessage
};

/**
 * Cross-browser history API wrapper
 */
export const history = {
  async search(query: browser.History.SearchQueryType): Promise<browser.History.HistoryItem[]> {
    return browser.history.search(query);
  },
  
  async getVisits(url: string): Promise<browser.History.VisitItem[]> {
    return browser.history.getVisits({ url });
  },
  
  onVisited: browser.history.onVisited
};

/**
 * Cross-browser bookmarks API wrapper
 */
export const bookmarks = {
  async search(query: string): Promise<browser.Bookmarks.BookmarkTreeNode[]> {
    return browser.bookmarks.search(query);
  },
  
  async create(bookmark: browser.Bookmarks.CreateDetails): Promise<browser.Bookmarks.BookmarkTreeNode> {
    return browser.bookmarks.create(bookmark);
  },
  
  async remove(id: string): Promise<void> {
    await browser.bookmarks.remove(id);
  },
  
  onCreated: browser.bookmarks.onCreated,
  onRemoved: browser.bookmarks.onRemoved
};

/**
 * Error types for cross-browser compatibility issues
 */
export class BrowserCompatibilityError extends Error {
  constructor(feature: string, browser: Browser) {
    super(`Feature '${feature}' is not supported in ${browser}`);
    this.name = 'BrowserCompatibilityError';
  }
}

/**
 * Check if a feature is supported in the current browser
 */
export function isFeatureSupported(feature: string): boolean {
  const currentBrowser = detectBrowser();
  
  const featureSupport: Record<string, Browser[]> = {
    'service-worker': ['chrome', 'edge'],
    'background-scripts': ['firefox'],
    'declarative-net-request': ['chrome', 'edge'],
    'web-request': ['firefox'],
    'storage-session': ['chrome', 'edge']
  };
  
  return featureSupport[feature]?.includes(currentBrowser) ?? false;
}

/**
 * Get browser-specific configuration
 */
export function getBrowserConfig() {
  const currentBrowser = detectBrowser();
  
  const configs = {
    chrome: {
      manifestVersion: 3,
      backgroundType: 'service-worker',
      actionAPI: 'action',
      storageQuota: 5242880, // 5MB
      maxBadgeText: 4
    },
    firefox: {
      manifestVersion: 2,
      backgroundType: 'scripts',
      actionAPI: 'browserAction',
      storageQuota: Infinity,
      maxBadgeText: Infinity
    },
    safari: {
      manifestVersion: 2,
      backgroundType: 'scripts',
      actionAPI: 'browserAction',
      storageQuota: 1048576, // 1MB
      maxBadgeText: 4
    },
    edge: {
      manifestVersion: 3,
      backgroundType: 'service-worker',
      actionAPI: 'action',
      storageQuota: 5242880, // 5MB
      maxBadgeText: 4
    },
    unknown: {
      manifestVersion: 2,
      backgroundType: 'scripts',
      actionAPI: 'browserAction',
      storageQuota: 1048576,
      maxBadgeText: 4
    }
  };
  
  return configs[currentBrowser];
}