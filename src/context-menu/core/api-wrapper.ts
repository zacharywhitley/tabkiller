/**
 * Cross-Browser Context Menu API Wrapper
 * Provides a unified interface for context menu APIs across different browsers
 */

import browser from 'webextension-polyfill';
import { getBrowserAdapter, getCurrentBrowserType, BrowserType } from '../../browser';
import {
  MenuItemDefinition,
  MenuClickInfo,
  MenuTab,
  ContextMenuCapabilities,
  MenuOperationResult,
  ContextMenuError,
  ContextMenuErrorType,
  MenuContext
} from './types';

/**
 * Browser-specific context menu API implementation
 */
export class ContextMenuAPIWrapper {
  private browserType: BrowserType;
  private capabilities: ContextMenuCapabilities;
  private initialized: boolean = false;
  private debug: boolean = false;

  constructor(debug = false) {
    this.browserType = getCurrentBrowserType();
    this.debug = debug;
    this.capabilities = this.detectCapabilities();
  }

  /**
   * Initialize the context menu API wrapper
   */
  async initialize(): Promise<MenuOperationResult> {
    const startTime = performance.now();
    
    try {
      if (!this.capabilities.supportsContextMenus) {
        throw new ContextMenuError(
          'UNSUPPORTED_BROWSER',
          `Context menus are not supported in ${this.browserType}`,
          this.browserType
        );
      }

      // Check permissions
      if (!await this.checkPermissions()) {
        throw new ContextMenuError(
          'PERMISSION_DENIED',
          'Context menu permissions are not granted',
          this.browserType
        );
      }

      this.initialized = true;
      
      if (this.debug) {
        console.log('[ContextMenuAPI] Initialized successfully', {
          browserType: this.browserType,
          capabilities: this.capabilities
        });
      }

      return {
        success: true,
        browserType: this.browserType,
        timing: {
          operation: 'initialize',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof ContextMenuError ? error : 
          new ContextMenuError('API_ERROR', error.message, this.browserType),
        browserType: this.browserType,
        timing: {
          operation: 'initialize',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * Create a context menu item
   */
  async createMenuItem(item: MenuItemDefinition): Promise<MenuOperationResult<string>> {
    const startTime = performance.now();
    
    if (!this.initialized) {
      return this.createErrorResult('API_ERROR', 'Context menu API not initialized', startTime);
    }

    try {
      const createProperties = this.convertToCreateProperties(item);
      
      // Use webextension-polyfill for cross-browser compatibility
      const menuItemId = await this.createMenuItemInternal(createProperties);
      
      if (this.debug) {
        console.log('[ContextMenuAPI] Menu item created:', { id: menuItemId, item });
      }

      return {
        success: true,
        data: String(menuItemId),
        browserType: this.browserType,
        timing: {
          operation: 'createMenuItem',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      return this.createErrorResult('REGISTRATION_FAILED', error.message, startTime, item.id);
    }
  }

  /**
   * Update a context menu item
   */
  async updateMenuItem(id: string, properties: Partial<MenuItemDefinition>): Promise<MenuOperationResult> {
    const startTime = performance.now();
    
    if (!this.initialized) {
      return this.createErrorResult('API_ERROR', 'Context menu API not initialized', startTime, id);
    }

    try {
      const updateProperties = this.convertToUpdateProperties(properties);
      await browser.contextMenus.update(id, updateProperties);
      
      if (this.debug) {
        console.log('[ContextMenuAPI] Menu item updated:', { id, properties });
      }

      return {
        success: true,
        browserType: this.browserType,
        timing: {
          operation: 'updateMenuItem',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      return this.createErrorResult('API_ERROR', error.message, startTime, id);
    }
  }

  /**
   * Remove a context menu item
   */
  async removeMenuItem(id: string): Promise<MenuOperationResult> {
    const startTime = performance.now();
    
    if (!this.initialized) {
      return this.createErrorResult('API_ERROR', 'Context menu API not initialized', startTime, id);
    }

    try {
      await browser.contextMenus.remove(id);
      
      if (this.debug) {
        console.log('[ContextMenuAPI] Menu item removed:', { id });
      }

      return {
        success: true,
        browserType: this.browserType,
        timing: {
          operation: 'removeMenuItem',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      return this.createErrorResult('API_ERROR', error.message, startTime, id);
    }
  }

  /**
   * Remove all context menu items
   */
  async removeAllMenuItems(): Promise<MenuOperationResult> {
    const startTime = performance.now();
    
    if (!this.initialized) {
      return this.createErrorResult('API_ERROR', 'Context menu API not initialized', startTime);
    }

    try {
      await browser.contextMenus.removeAll();
      
      if (this.debug) {
        console.log('[ContextMenuAPI] All menu items removed');
      }

      return {
        success: true,
        browserType: this.browserType,
        timing: {
          operation: 'removeAllMenuItems',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      return this.createErrorResult('API_ERROR', error.message, startTime);
    }
  }

  /**
   * Set up context menu click listener
   */
  setClickListener(callback: (info: MenuClickInfo, tab?: MenuTab) => void | Promise<void>): void {
    if (!this.initialized) {
      throw new ContextMenuError(
        'API_ERROR',
        'Context menu API not initialized',
        this.browserType
      );
    }

    browser.contextMenus.onClicked.addListener(async (info, tab) => {
      try {
        const clickInfo = this.convertClickInfo(info);
        const tabInfo = tab ? this.convertTabInfo(tab) : undefined;
        
        if (this.debug) {
          console.log('[ContextMenuAPI] Menu item clicked:', { info: clickInfo, tab: tabInfo });
        }

        await callback(clickInfo, tabInfo);
      } catch (error) {
        console.error('[ContextMenuAPI] Error in click handler:', error);
      }
    });
  }

  /**
   * Get browser capabilities
   */
  getCapabilities(): ContextMenuCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Check if context menus are supported
   */
  isSupported(): boolean {
    return this.capabilities.supportsContextMenus;
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    if (this.initialized) {
      try {
        await this.removeAllMenuItems();
        this.initialized = false;
        
        if (this.debug) {
          console.log('[ContextMenuAPI] Destroyed successfully');
        }
      } catch (error) {
        console.error('[ContextMenuAPI] Error during cleanup:', error);
      }
    }
  }

  /**
   * Detect browser capabilities for context menus
   */
  private detectCapabilities(): ContextMenuCapabilities {
    const baseCapabilities: ContextMenuCapabilities = {
      supportsContextMenus: false,
      supportsIcons: false,
      supportsSubmenus: false,
      supportsRadioGroups: false,
      supportsCheckboxes: false,
      supportedContexts: [],
      maxMenuItems: 0,
      maxNestingLevel: 0
    };

    try {
      // Check if contextMenus API is available
      if (!browser.contextMenus) {
        return baseCapabilities;
      }

      baseCapabilities.supportsContextMenus = true;

      // Browser-specific capabilities
      switch (this.browserType) {
        case 'chrome':
        case 'edge':
          return {
            ...baseCapabilities,
            supportsIcons: true,
            supportsSubmenus: true,
            supportsRadioGroups: true,
            supportsCheckboxes: true,
            supportedContexts: ['all', 'page', 'frame', 'selection', 'link', 'editable', 'image', 'video', 'audio', 'action'],
            maxMenuItems: 6, // Chrome limitation
            maxNestingLevel: 1
          };

        case 'firefox':
          return {
            ...baseCapabilities,
            supportsIcons: true,
            supportsSubmenus: true,
            supportsRadioGroups: true,
            supportsCheckboxes: true,
            supportedContexts: ['all', 'page', 'frame', 'selection', 'link', 'editable', 'image', 'video', 'audio', 'browser_action'],
            maxMenuItems: 100, // Firefox is more flexible
            maxNestingLevel: 2
          };

        case 'safari':
          return {
            ...baseCapabilities,
            supportsIcons: false,
            supportsSubmenus: false,
            supportsRadioGroups: false,
            supportsCheckboxes: true,
            supportedContexts: ['all', 'page', 'selection', 'link', 'image'],
            maxMenuItems: 10,
            maxNestingLevel: 0
          };

        default:
          return {
            ...baseCapabilities,
            supportsCheckboxes: true,
            supportedContexts: ['all', 'page', 'selection', 'link'],
            maxMenuItems: 6,
            maxNestingLevel: 0
          };
      }
    } catch (error) {
      if (this.debug) {
        console.warn('[ContextMenuAPI] Error detecting capabilities:', error);
      }
      return baseCapabilities;
    }
  }

  /**
   * Check if context menu permissions are granted
   */
  private async checkPermissions(): Promise<boolean> {
    try {
      if (browser.permissions) {
        return await browser.permissions.contains({ permissions: ['contextMenus'] });
      }
      // If permissions API not available, assume permissions are granted
      return true;
    } catch (error) {
      if (this.debug) {
        console.warn('[ContextMenuAPI] Error checking permissions:', error);
      }
      // On error, assume permissions are granted to avoid blocking
      return true;
    }
  }

  /**
   * Create a menu item using the native API
   */
  private async createMenuItemInternal(properties: any): Promise<string | number> {
    return new Promise((resolve, reject) => {
      const id = browser.contextMenus.create(properties, () => {
        const error = browser.runtime.lastError;
        if (error) {
          reject(new Error(error.message || 'Unknown error creating menu item'));
        } else {
          resolve(id);
        }
      });
    });
  }

  /**
   * Convert menu item definition to create properties
   */
  private convertToCreateProperties(item: MenuItemDefinition): any {
    const properties: any = {
      id: item.id,
      type: item.type || 'normal',
      title: item.title,
      contexts: item.contexts || ['all'],
      enabled: item.enabled !== false,
      visible: item.visible !== false
    };

    if (item.parentId) {
      properties.parentId = item.parentId;
    }

    if (item.checked !== undefined) {
      properties.checked = item.checked;
    }

    if (item.documentUrlPatterns) {
      properties.documentUrlPatterns = item.documentUrlPatterns;
    }

    if (item.targetUrlPatterns) {
      properties.targetUrlPatterns = item.targetUrlPatterns;
    }

    // Only add icons if supported
    if (this.capabilities.supportsIcons && item.icons) {
      properties.icons = item.icons;
    }

    return properties;
  }

  /**
   * Convert partial menu item definition to update properties
   */
  private convertToUpdateProperties(properties: Partial<MenuItemDefinition>): any {
    const updateProps: any = {};

    if (properties.type !== undefined) updateProps.type = properties.type;
    if (properties.title !== undefined) updateProps.title = properties.title;
    if (properties.contexts !== undefined) updateProps.contexts = properties.contexts;
    if (properties.enabled !== undefined) updateProps.enabled = properties.enabled;
    if (properties.visible !== undefined) updateProps.visible = properties.visible;
    if (properties.checked !== undefined) updateProps.checked = properties.checked;
    if (properties.parentId !== undefined) updateProps.parentId = properties.parentId;
    if (properties.documentUrlPatterns !== undefined) updateProps.documentUrlPatterns = properties.documentUrlPatterns;
    if (properties.targetUrlPatterns !== undefined) updateProps.targetUrlPatterns = properties.targetUrlPatterns;

    if (this.capabilities.supportsIcons && properties.icons !== undefined) {
      updateProps.icons = properties.icons;
    }

    return updateProps;
  }

  /**
   * Convert browser click info to our format
   */
  private convertClickInfo(info: any): MenuClickInfo {
    return {
      menuItemId: info.menuItemId,
      parentMenuItemId: info.parentMenuItemId,
      mediaType: info.mediaType,
      linkUrl: info.linkUrl,
      srcUrl: info.srcUrl,
      pageUrl: info.pageUrl,
      frameUrl: info.frameUrl,
      frameId: info.frameId,
      selectionText: info.selectionText,
      editable: info.editable || false,
      wasChecked: info.wasChecked,
      checked: info.checked
    };
  }

  /**
   * Convert browser tab info to our format
   */
  private convertTabInfo(tab: any): MenuTab {
    return {
      id: tab.id,
      index: tab.index,
      windowId: tab.windowId,
      highlighted: tab.highlighted,
      active: tab.active,
      pinned: tab.pinned,
      audible: tab.audible,
      discarded: tab.discarded,
      autoDiscardable: tab.autoDiscardable,
      mutedInfo: tab.mutedInfo,
      url: tab.url,
      pendingUrl: tab.pendingUrl,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      status: tab.status,
      incognito: tab.incognito,
      width: tab.width,
      height: tab.height,
      sessionId: tab.sessionId
    };
  }

  /**
   * Create a standardized error result
   */
  private createErrorResult(
    type: ContextMenuErrorType,
    message: string,
    startTime: number,
    menuItemId?: string
  ): MenuOperationResult {
    return {
      success: false,
      error: new ContextMenuError(type, message, this.browserType, menuItemId),
      browserType: this.browserType,
      timing: {
        operation: 'error',
        duration: performance.now() - startTime,
        timestamp: Date.now()
      }
    };
  }
}