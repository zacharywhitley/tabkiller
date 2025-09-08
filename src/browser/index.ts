/**
 * Main browser adapter entry point
 * Provides a unified interface to the cross-browser adapter system
 */

export * from '../adapters/interfaces';
export * from '../adapters/utils/browser-detection';
export * from '../adapters/utils/adapter-helpers';
export * from '../adapters/implementations/adapter-factory';

import { 
  CrossBrowserAdapter,
  AdapterSystemConfig,
  BrowserType 
} from '../adapters/interfaces';
import { createBrowserAdapter, detectCurrentBrowser } from '../adapters/implementations/adapter-factory';

/**
 * Global browser adapter instance
 */
let globalAdapter: CrossBrowserAdapter | null = null;

/**
 * Initialize the browser adapter system
 * This should be called once at extension startup
 */
export async function initializeBrowserAdapter(config?: AdapterSystemConfig): Promise<CrossBrowserAdapter> {
  if (globalAdapter) {
    console.warn('[BrowserAdapter] Adapter already initialized, returning existing instance');
    return globalAdapter;
  }

  try {
    globalAdapter = await createBrowserAdapter(config);
    
    if (config?.debug) {
      console.log('[BrowserAdapter] Global adapter initialized:', globalAdapter.getDebugInfo());
    }
    
    return globalAdapter;
  } catch (error) {
    console.error('[BrowserAdapter] Failed to initialize:', error);
    throw error;
  }
}

/**
 * Get the current browser adapter instance
 * Throws an error if not initialized
 */
export function getBrowserAdapter(): CrossBrowserAdapter {
  if (!globalAdapter) {
    throw new Error('Browser adapter not initialized. Call initializeBrowserAdapter() first.');
  }
  return globalAdapter;
}

/**
 * Check if the browser adapter is initialized
 */
export function isBrowserAdapterInitialized(): boolean {
  return globalAdapter !== null;
}

/**
 * Destroy the current adapter instance
 * Useful for testing or cleanup
 */
export async function destroyBrowserAdapter(): Promise<void> {
  if (globalAdapter) {
    await globalAdapter.destroy();
    globalAdapter = null;
  }
}

/**
 * Get the current browser type without initializing the full adapter
 */
export function getCurrentBrowserType(): BrowserType {
  return detectCurrentBrowser();
}

/**
 * Quick access to common browser APIs through the global adapter
 */
export const browserAPI = {
  get tabs() {
    return getBrowserAdapter().tabs;
  },
  
  get storage() {
    return getBrowserAdapter().storage;
  },
  
  get messaging() {
    return getBrowserAdapter().messaging;
  },
  
  get windows() {
    return getBrowserAdapter().windows;
  },
  
  get history() {
    return getBrowserAdapter().history;
  },
  
  get config() {
    return getBrowserAdapter().config;
  }
};

/**
 * Convenience function to check if a feature is supported
 */
export function isFeatureSupported(feature: string): boolean {
  if (!globalAdapter) {
    console.warn('[BrowserAdapter] Adapter not initialized, feature support unknown');
    return false;
  }
  
  return globalAdapter.isApiSupported(feature);
}

/**
 * Development utilities
 */
export const dev = {
  /**
   * Get detailed information about the current browser adapter
   */
  getDebugInfo() {
    return globalAdapter?.getDebugInfo();
  },
  
  /**
   * Enable/disable debug mode
   */
  setDebugMode(enabled: boolean) {
    globalAdapter?.enableDebugMode(enabled);
  },
  
  /**
   * Test if adapter is in development mode
   */
  isDevelopment() {
    return globalAdapter?.isDevelopment() ?? false;
  },
  
  /**
   * Get last browser API error
   */
  getLastError() {
    return globalAdapter?.getLastError();
  }
};

// Legacy compatibility with existing cross-browser.ts
// Re-export key functions for backward compatibility
export { 
  detectBrowser as detectBrowserDetailed,
  getBrowserConfig,
  getBrowserCapabilities,
  detectBrowserType
} from '../adapters/utils/browser-detection';

// Export simplified versions for backward compatibility
export function detectBrowser(): BrowserType {
  return getCurrentBrowserType();
}

export function getBrowserAPI() {
  // This maintains compatibility with the existing code
  // while providing access to the enhanced adapter system
  return {
    // Legacy webextension-polyfill access
    ...require('webextension-polyfill'),
    
    // Enhanced adapter access (when available)
    get adapter() {
      return isBrowserAdapterInitialized() ? getBrowserAdapter() : null;
    }
  };
}

export function isManifestV3(): boolean {
  if (globalAdapter) {
    return globalAdapter.supportsManifestV3();
  }
  
  // Fallback detection
  try {
    const browser = require('webextension-polyfill');
    const manifest = browser.runtime.getManifest();
    return manifest.manifest_version === 3;
  } catch {
    return false;
  }
}

// Legacy storage, tabs, messaging, and history exports
// These maintain backward compatibility while using the new adapter system when available
export const storage = {
  async get<T>(key: string | string[]): Promise<T> {
    if (globalAdapter) {
      const result = await globalAdapter.storage.local.get(key);
      return result.success ? result.data : ({} as T);
    }
    
    // Fallback to webextension-polyfill
    const browser = require('webextension-polyfill');
    return await browser.storage.local.get(key) as T;
  },
  
  async set(data: Record<string, unknown>): Promise<void> {
    if (globalAdapter) {
      await globalAdapter.storage.local.set(data);
      return;
    }
    
    // Fallback
    const browser = require('webextension-polyfill');
    await browser.storage.local.set(data);
  },
  
  async remove(key: string | string[]): Promise<void> {
    if (globalAdapter) {
      await globalAdapter.storage.local.remove(key);
      return;
    }
    
    // Fallback
    const browser = require('webextension-polyfill');
    await browser.storage.local.remove(key);
  },
  
  async clear(): Promise<void> {
    if (globalAdapter) {
      await globalAdapter.storage.local.clear();
      return;
    }
    
    // Fallback
    const browser = require('webextension-polyfill');
    await browser.storage.local.clear();
  }
};

export const tabs = {
  async getCurrent() {
    if (globalAdapter) {
      const result = await globalAdapter.tabs.getCurrent();
      return result.success ? result.data : undefined;
    }
    
    // Fallback
    const browser = require('webextension-polyfill');
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  },
  
  async getAll() {
    if (globalAdapter) {
      const result = await globalAdapter.tabs.query({});
      return result.success ? result.data : [];
    }
    
    // Fallback
    const browser = require('webextension-polyfill');
    return await browser.tabs.query({});
  },
  
  async create(options: any) {
    if (globalAdapter) {
      const result = await globalAdapter.tabs.create(options);
      return result.success ? result.data : null;
    }
    
    // Fallback
    const browser = require('webextension-polyfill');
    return await browser.tabs.create(options);
  },
  
  async update(tabId: number, options: any) {
    if (globalAdapter) {
      const result = await globalAdapter.tabs.update(tabId, options);
      return result.success ? result.data : null;
    }
    
    // Fallback
    const browser = require('webextension-polyfill');
    return await browser.tabs.update(tabId, options);
  },
  
  async remove(tabIds: number | number[]): Promise<void> {
    if (globalAdapter) {
      await globalAdapter.tabs.remove(tabIds);
      return;
    }
    
    // Fallback
    const browser = require('webextension-polyfill');
    await browser.tabs.remove(tabIds);
  },
  
  // Event handlers - these reference the original browser API for now
  get onUpdated() {
    const browser = require('webextension-polyfill');
    return browser.tabs.onUpdated;
  },
  
  get onCreated() {
    const browser = require('webextension-polyfill');
    return browser.tabs.onCreated;
  },
  
  get onRemoved() {
    const browser = require('webextension-polyfill');
    return browser.tabs.onRemoved;
  },
  
  get onActivated() {
    const browser = require('webextension-polyfill');
    return browser.tabs.onActivated;
  }
};

export const messaging = {
  async sendMessage<T = unknown>(message: unknown): Promise<T> {
    if (globalAdapter) {
      const result = await globalAdapter.messaging.sendMessage(message);
      return result.success ? result.data : null;
    }
    
    // Fallback
    const browser = require('webextension-polyfill');
    return await browser.runtime.sendMessage(message) as T;
  },
  
  async sendTabMessage<T = unknown>(tabId: number, message: unknown): Promise<T> {
    if (globalAdapter) {
      const result = await globalAdapter.messaging.sendTabMessage(tabId, message);
      return result.success ? result.data : null;
    }
    
    // Fallback
    const browser = require('webextension-polyfill');
    return await browser.tabs.sendMessage(tabId, message) as T;
  },
  
  get onMessage() {
    const browser = require('webextension-polyfill');
    return browser.runtime.onMessage;
  }
};

export const history = {
  async search(query: any) {
    if (globalAdapter?.history) {
      const result = await globalAdapter.history.search(query);
      return result.success ? result.data : [];
    }
    
    // Fallback
    const browser = require('webextension-polyfill');
    return await browser.history.search(query);
  },
  
  async getVisits(url: string) {
    if (globalAdapter?.history) {
      const result = await globalAdapter.history.getVisits(url);
      return result.success ? result.data : [];
    }
    
    // Fallback
    const browser = require('webextension-polyfill');
    return await browser.history.getVisits({ url });
  },
  
  get onVisited() {
    const browser = require('webextension-polyfill');
    return browser.history?.onVisited;
  }
};

// Error classes re-export
export { 
  BrowserCompatibilityError,
  UnsupportedFeatureError,
  BrowserAdapterError 
} from '../adapters/interfaces/base';