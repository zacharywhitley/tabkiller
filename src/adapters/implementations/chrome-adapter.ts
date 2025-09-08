/**
 * Chrome-specific browser adapter implementation
 * Handles Chrome/Chromium-based browser features and Manifest V3 APIs
 */

import browser from 'webextension-polyfill';
import { 
  BrowserConfig,
  AdapterResult,
  UnsupportedFeatureError,
  BrowserAdapterError
} from '../interfaces/base';
import { 
  TabsAdapter, 
  TabInfo, 
  TabCreateOptions,
  TabUpdateOptions,
  TabQueryOptions 
} from '../interfaces/tabs';
import { StorageAdapter } from '../interfaces/storage';
import { MessagingAdapter } from '../interfaces/messaging';
import { HistoryAdapter } from '../interfaces/history';
import { WindowsAdapter } from '../interfaces/windows';
import { 
  wrapWithFallback, 
  wrapWithUnsupportedError,
  AdapterCache,
  EventListenerManager 
} from '../utils/adapter-helpers';
import { BrowserDetector } from '../utils/browser-detection';

/**
 * Chrome-specific tabs adapter
 */
class ChromeTabsAdapter implements TabsAdapter {
  private cache = new AdapterCache<any>(5000);
  private eventManager = new EventListenerManager();

  constructor(public readonly config: BrowserConfig) {}

  isFeatureSupported(feature: string): boolean {
    const supportMap: Record<string, boolean> = {
      'tab-groups': this.config.capabilities.manifestVersion === 3,
      'tab-discard': true,
      'script-injection': true,
      'tab-audio': true
    };
    return supportMap[feature] ?? false;
  }

  async wrapWithFallback<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
    feature: string
  ): Promise<T> {
    const result = await wrapWithFallback(operation, fallback, feature, this.config.type);
    if (result.success) {
      return result.data;
    } else if (result.fallbackData !== undefined) {
      return result.fallbackData;
    } else {
      throw result.error;
    }
  }

  async query(queryInfo: TabQueryOptions): Promise<AdapterResult<TabInfo[]>> {
    return wrapWithUnsupportedError(
      async () => {
        const tabs = await browser.tabs.query(queryInfo);
        return tabs.map(this.convertToTabInfo);
      },
      'tabs.query',
      this.config.type,
      true
    );
  }

  async get(tabId: number): Promise<AdapterResult<TabInfo>> {
    return wrapWithUnsupportedError(
      async () => {
        // Check cache first
        const cacheKey = `tab-${tabId}`;
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        const tab = await browser.tabs.get(tabId);
        const tabInfo = this.convertToTabInfo(tab);
        
        // Cache the result
        this.cache.set(cacheKey, tabInfo, 2000);
        return tabInfo;
      },
      'tabs.get',
      this.config.type,
      true
    );
  }

  async getCurrent(): Promise<AdapterResult<TabInfo>> {
    return wrapWithUnsupportedError(
      async () => {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) {
          throw new Error('No active tab found');
        }
        return this.convertToTabInfo(tabs[0]);
      },
      'tabs.getCurrent',
      this.config.type,
      true
    );
  }

  async create(createProperties: TabCreateOptions): Promise<AdapterResult<TabInfo>> {
    return wrapWithUnsupportedError(
      async () => {
        const tab = await browser.tabs.create(createProperties);
        return this.convertToTabInfo(tab);
      },
      'tabs.create',
      this.config.type,
      true
    );
  }

  async update(tabId: number, updateProperties: TabUpdateOptions): Promise<AdapterResult<TabInfo>> {
    return wrapWithUnsupportedError(
      async () => {
        const tab = await browser.tabs.update(tabId, updateProperties);
        
        // Invalidate cache
        this.cache.delete(`tab-${tabId}`);
        
        return this.convertToTabInfo(tab);
      },
      'tabs.update',
      this.config.type,
      true
    );
  }

  async remove(tabIds: number | number[]): Promise<AdapterResult<void>> {
    return wrapWithUnsupportedError(
      async () => {
        await browser.tabs.remove(tabIds);
        
        // Invalidate cache
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        ids.forEach(id => this.cache.delete(`tab-${id}`));
      },
      'tabs.remove',
      this.config.type,
      true
    );
  }

  async move(tabIds: number | number[], moveProperties: any): Promise<AdapterResult<TabInfo | TabInfo[]>> {
    return wrapWithUnsupportedError(
      async () => {
        const moved = await browser.tabs.move(tabIds, moveProperties);
        
        // Invalidate cache for moved tabs
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        ids.forEach(id => this.cache.delete(`tab-${id}`));
        
        if (Array.isArray(moved)) {
          return moved.map(this.convertToTabInfo);
        } else {
          return this.convertToTabInfo(moved);
        }
      },
      'tabs.move',
      this.config.type,
      true
    );
  }

  async duplicate(tabId: number, duplicateProperties?: any): Promise<AdapterResult<TabInfo>> {
    return wrapWithUnsupportedError(
      async () => {
        const tab = await browser.tabs.duplicate(tabId);
        return this.convertToTabInfo(tab);
      },
      'tabs.duplicate',
      this.config.type,
      true
    );
  }

  async reload(tabId?: number, reloadProperties?: { bypassCache?: boolean }): Promise<AdapterResult<void>> {
    return wrapWithUnsupportedError(
      async () => {
        await browser.tabs.reload(tabId, reloadProperties);
        
        // Invalidate cache
        if (tabId) {
          this.cache.delete(`tab-${tabId}`);
        }
      },
      'tabs.reload',
      this.config.type,
      true
    );
  }

  async discard(tabIds: number | number[]): Promise<AdapterResult<void>> {
    return wrapWithUnsupportedError(
      async () => {
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        
        // Chrome supports tab discarding
        for (const id of ids) {
          await (chrome.tabs as any).discard(id);
        }
        
        // Invalidate cache
        ids.forEach(id => this.cache.delete(`tab-${id}`));
      },
      'tabs.discard',
      this.config.type,
      this.supportsTabDiscard()
    );
  }

  async group(tabIds: number | number[], groupOptions?: { groupId?: number }): Promise<AdapterResult<number>> {
    return wrapWithUnsupportedError(
      async () => {
        // Chrome MV3 supports tab groups
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        const groupId = await (chrome.tabGroups as any).group({
          tabIds: ids,
          groupId: groupOptions?.groupId
        });
        
        // Invalidate cache for grouped tabs
        ids.forEach(id => this.cache.delete(`tab-${id}`));
        
        return groupId;
      },
      'tabs.group',
      this.config.type,
      this.supportsTabGroups()
    );
  }

  async ungroup(tabIds: number | number[]): Promise<AdapterResult<void>> {
    return wrapWithUnsupportedError(
      async () => {
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        await (chrome.tabGroups as any).ungroup(ids);
        
        // Invalidate cache
        ids.forEach(id => this.cache.delete(`tab-${id}`));
      },
      'tabs.ungroup',
      this.config.type,
      this.supportsTabGroups()
    );
  }

  async getAllInWindow(windowId?: number): Promise<AdapterResult<TabInfo[]>> {
    return this.query({ windowId: windowId });
  }

  async getActive(windowId?: number): Promise<AdapterResult<TabInfo[]>> {
    return this.query({ active: true, windowId: windowId });
  }

  async getHighlighted(windowId?: number): Promise<AdapterResult<TabInfo[]>> {
    return this.query({ highlighted: true, windowId: windowId });
  }

  async executeScript(tabId: number, details: any): Promise<AdapterResult<any[]>> {
    return wrapWithUnsupportedError(
      async () => {
        // Chrome MV3 uses chrome.scripting API
        if (this.config.capabilities.manifestVersion === 3) {
          const results = await chrome.scripting.executeScript({
            target: { tabId, allFrames: details.allFrames },
            func: details.code ? new Function(details.code) : undefined,
            files: details.file ? [details.file] : undefined
          });
          return results.map(result => result.result);
        } else {
          // Fallback to tabs.executeScript for MV2
          return await browser.tabs.executeScript(tabId, details);
        }
      },
      'tabs.executeScript',
      this.config.type,
      this.supportsScriptInjection()
    );
  }

  async insertCSS(tabId: number, details: any): Promise<AdapterResult<void>> {
    return wrapWithUnsupportedError(
      async () => {
        if (this.config.capabilities.manifestVersion === 3) {
          await chrome.scripting.insertCSS({
            target: { tabId, allFrames: details.allFrames },
            css: details.code,
            files: details.file ? [details.file] : undefined
          });
        } else {
          await browser.tabs.insertCSS(tabId, details);
        }
      },
      'tabs.insertCSS',
      this.config.type,
      this.supportsScriptInjection()
    );
  }

  async removeCSS(tabId: number, details: any): Promise<AdapterResult<void>> {
    return wrapWithUnsupportedError(
      async () => {
        if (this.config.capabilities.manifestVersion === 3) {
          await chrome.scripting.removeCSS({
            target: { tabId, allFrames: details.allFrames },
            css: details.code,
            files: details.file ? [details.file] : undefined
          });
        } else {
          await browser.tabs.removeCSS(tabId, details);
        }
      },
      'tabs.removeCSS',
      this.config.type,
      this.supportsScriptInjection()
    );
  }

  async sendMessage<T = any, R = any>(tabId: number, message: T): Promise<AdapterResult<R>> {
    return wrapWithUnsupportedError(
      async () => {
        return await browser.tabs.sendMessage(tabId, message) as R;
      },
      'tabs.sendMessage',
      this.config.type,
      true
    );
  }

  async connect(tabId: number, connectInfo?: { name?: string; frameId?: number }): Promise<AdapterResult<any>> {
    return wrapWithUnsupportedError(
      async () => {
        return browser.tabs.connect(tabId, connectInfo);
      },
      'tabs.connect',
      this.config.type,
      true
    );
  }

  // Event handlers
  onCreated = {
    addListener: (callback: (details: any) => void) => {
      const handler = (tab: browser.Tabs.Tab) => {
        callback({ tab: this.convertToTabInfo(tab) });
      };
      browser.tabs.onCreated.addListener(handler);
      this.eventManager.add(browser.tabs.onCreated, handler);
    },
    removeListener: (callback: (details: any) => void) => {
      this.eventManager.remove(browser.tabs.onCreated, callback);
    },
    hasListener: (callback: (details: any) => void) => {
      return browser.tabs.onCreated.hasListener(callback);
    }
  };

  onUpdated = {
    addListener: (callback: (details: any) => void) => {
      const handler = (tabId: number, changeInfo: any, tab: browser.Tabs.Tab) => {
        // Invalidate cache
        this.cache.delete(`tab-${tabId}`);
        
        callback({ 
          tabId, 
          changeInfo, 
          tab: this.convertToTabInfo(tab) 
        });
      };
      browser.tabs.onUpdated.addListener(handler);
      this.eventManager.add(browser.tabs.onUpdated, handler);
    },
    removeListener: (callback: (details: any) => void) => {
      this.eventManager.remove(browser.tabs.onUpdated, callback);
    },
    hasListener: (callback: (details: any) => void) => {
      return browser.tabs.onUpdated.hasListener(callback);
    }
  };

  onRemoved = {
    addListener: (callback: (details: any) => void) => {
      const handler = (tabId: number, removeInfo: any) => {
        // Invalidate cache
        this.cache.delete(`tab-${tabId}`);
        
        callback({ tabId, removeInfo });
      };
      browser.tabs.onRemoved.addListener(handler);
      this.eventManager.add(browser.tabs.onRemoved, handler);
    },
    removeListener: (callback: (details: any) => void) => {
      this.eventManager.remove(browser.tabs.onRemoved, callback);
    },
    hasListener: (callback: (details: any) => void) => {
      return browser.tabs.onRemoved.hasListener(callback);
    }
  };

  onActivated = {
    addListener: (callback: (details: any) => void) => {
      browser.tabs.onActivated.addListener(callback);
      this.eventManager.add(browser.tabs.onActivated, callback);
    },
    removeListener: (callback: (details: any) => void) => {
      this.eventManager.remove(browser.tabs.onActivated, callback);
    },
    hasListener: (callback: (details: any) => void) => {
      return browser.tabs.onActivated.hasListener(callback);
    }
  };

  onMoved = {
    addListener: (callback: (details: any) => void) => {
      const handler = (tabId: number, moveInfo: any) => {
        // Invalidate cache
        this.cache.delete(`tab-${tabId}`);
        
        callback({ tabId, moveInfo });
      };
      browser.tabs.onMoved.addListener(handler);
      this.eventManager.add(browser.tabs.onMoved, handler);
    },
    removeListener: (callback: (details: any) => void) => {
      this.eventManager.remove(browser.tabs.onMoved, callback);
    },
    hasListener: (callback: (details: any) => void) => {
      return browser.tabs.onMoved.hasListener(callback);
    }
  };

  onReplaced = {
    addListener: (callback: (details: any) => void) => {
      const handler = (addedTabId: number, removedTabId: number) => {
        // Invalidate cache
        this.cache.delete(`tab-${removedTabId}`);
        
        callback({ addedTabId, removedTabId });
      };
      browser.tabs.onReplaced.addListener(handler);
      this.eventManager.add(browser.tabs.onReplaced, handler);
    },
    removeListener: (callback: (details: any) => void) => {
      this.eventManager.remove(browser.tabs.onReplaced, callback);
    },
    hasListener: (callback: (details: any) => void) => {
      return browser.tabs.onReplaced.hasListener(callback);
    }
  };

  // Browser-specific capabilities
  supportsTabGroups(): boolean {
    return this.config.capabilities.manifestVersion === 3 && 
           typeof chrome !== 'undefined' && chrome.tabGroups !== undefined;
  }

  supportsTabDiscard(): boolean {
    return typeof chrome !== 'undefined' && 
           chrome.tabs && typeof (chrome.tabs as any).discard === 'function';
  }

  supportsScriptInjection(): boolean {
    return this.config.capabilities.manifestVersion === 3 ? 
           typeof chrome !== 'undefined' && chrome.scripting !== undefined :
           true; // MV2 supports tabs.executeScript
  }

  supportsTabAudio(): boolean {
    return true; // Chrome supports tab audio properties
  }

  getMaxTabsPerWindow(): number | null {
    return null; // Chrome doesn't have a hard limit
  }

  // Helper methods
  private convertToTabInfo(tab: browser.Tabs.Tab): TabInfo {
    return {
      id: tab.id!,
      windowId: tab.windowId!,
      index: tab.index,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      active: tab.active,
      pinned: tab.pinned,
      highlighted: tab.highlighted,
      incognito: tab.incognito,
      selected: tab.active, // Map active to selected for Firefox compatibility
      status: tab.status as 'loading' | 'complete',
      width: tab.width,
      height: tab.height,
      audible: tab.audible,
      autoDiscardable: (tab as any).autoDiscardable,
      discarded: (tab as any).discarded,
      groupId: (tab as any).groupId,
      mutedInfo: tab.mutedInfo ? {
        muted: tab.mutedInfo.muted,
        reason: tab.mutedInfo.reason as any,
        extensionId: tab.mutedInfo.extensionId
      } : undefined,
      pendingUrl: (tab as any).pendingUrl
    };
  }
}