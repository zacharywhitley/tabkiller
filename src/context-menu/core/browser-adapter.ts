/**
 * Context Menu Browser Adapter
 * Handles browser-specific differences and provides cross-browser compatibility
 * for context menu functionality
 */

import { getBrowserAdapter, getCurrentBrowserType, BrowserType } from '../../browser';
import {
  ContextMenuCapabilities,
  MenuContext,
  MenuItemType,
  MenuItemDefinition,
  ContextMenuError,
  MenuOperationResult
} from './types';

/**
 * Browser-specific context menu feature support
 */
interface BrowserFeatureSupport {
  contextMenus: boolean;
  icons: boolean;
  submenus: boolean;
  radioGroups: boolean;
  checkboxes: boolean;
  maxItems: number;
  maxNesting: number;
  supportedContexts: MenuContext[];
  supportedTypes: MenuItemType[];
}

/**
 * Context Menu Browser Compatibility Adapter
 */
export class ContextMenuBrowserAdapter {
  private browserType: BrowserType;
  private featureSupport: BrowserFeatureSupport;

  constructor() {
    this.browserType = getCurrentBrowserType();
    this.featureSupport = this.getBrowserFeatureSupport();
  }

  /**
   * Get browser capabilities for context menus
   */
  getCapabilities(): ContextMenuCapabilities {
    return {
      supportsContextMenus: this.featureSupport.contextMenus,
      supportsIcons: this.featureSupport.icons,
      supportsSubmenus: this.featureSupport.submenus,
      supportsRadioGroups: this.featureSupport.radioGroups,
      supportsCheckboxes: this.featureSupport.checkboxes,
      supportedContexts: [...this.featureSupport.supportedContexts],
      maxMenuItems: this.featureSupport.maxItems,
      maxNestingLevel: this.featureSupport.maxNesting
    };
  }

  /**
   * Adapt menu item definition for current browser
   */
  adaptMenuItemDefinition(item: MenuItemDefinition): MenuItemDefinition {
    const adapted: MenuItemDefinition = { ...item };

    // Filter unsupported contexts
    if (adapted.contexts) {
      adapted.contexts = adapted.contexts.filter(context =>
        this.featureSupport.supportedContexts.includes(context)
      );
      
      // Fallback to 'all' if no supported contexts remain
      if (adapted.contexts.length === 0) {
        adapted.contexts = ['all'];
      }
    }

    // Remove icons if not supported
    if (!this.featureSupport.icons) {
      delete adapted.icons;
    }

    // Remove parent ID if submenus not supported
    if (!this.featureSupport.submenus) {
      delete adapted.parentId;
    }

    // Adapt menu item type
    if (adapted.type && !this.featureSupport.supportedTypes.includes(adapted.type)) {
      // Convert unsupported types to 'normal'
      adapted.type = 'normal';
      
      // Remove checkbox-related properties
      if (!this.featureSupport.checkboxes) {
        delete adapted.checked;
      }
    }

    // Browser-specific adaptations
    this.applyBrowserSpecificAdaptations(adapted);

    return adapted;
  }

  /**
   * Check if a feature is supported in the current browser
   */
  isFeatureSupported(feature: keyof BrowserFeatureSupport): boolean {
    return this.featureSupport[feature] as boolean;
  }

  /**
   * Get browser-specific error handling strategy
   */
  getErrorHandlingStrategy(): {
    retryOnFailure: boolean;
    maxRetries: number;
    retryDelay: number;
    fallbackToNormal: boolean;
  } {
    switch (this.browserType) {
      case 'chrome':
      case 'edge':
        return {
          retryOnFailure: true,
          maxRetries: 2,
          retryDelay: 50,
          fallbackToNormal: true
        };

      case 'firefox':
        return {
          retryOnFailure: true,
          maxRetries: 3,
          retryDelay: 100,
          fallbackToNormal: false
        };

      case 'safari':
        return {
          retryOnFailure: false,
          maxRetries: 1,
          retryDelay: 0,
          fallbackToNormal: true
        };

      default:
        return {
          retryOnFailure: true,
          maxRetries: 1,
          retryDelay: 100,
          fallbackToNormal: true
        };
    }
  }

  /**
   * Get browser-specific performance optimization settings
   */
  getPerformanceSettings(): {
    batchOperations: boolean;
    deferCreation: boolean;
    maxConcurrentOperations: number;
  } {
    switch (this.browserType) {
      case 'chrome':
      case 'edge':
        return {
          batchOperations: false, // Chrome has issues with batched operations
          deferCreation: false,
          maxConcurrentOperations: 1
        };

      case 'firefox':
        return {
          batchOperations: true,
          deferCreation: true,
          maxConcurrentOperations: 3
        };

      case 'safari':
        return {
          batchOperations: false,
          deferCreation: false,
          maxConcurrentOperations: 1
        };

      default:
        return {
          batchOperations: false,
          deferCreation: false,
          maxConcurrentOperations: 1
        };
    }
  }

  /**
   * Validate menu item for current browser
   */
  validateMenuItemForBrowser(item: MenuItemDefinition): {
    valid: boolean;
    warnings: string[];
    adaptations: string[];
  } {
    const warnings: string[] = [];
    const adaptations: string[] = [];

    // Check basic support
    if (!this.featureSupport.contextMenus) {
      return {
        valid: false,
        warnings: ['Context menus are not supported in this browser'],
        adaptations: []
      };
    }

    // Check contexts
    if (item.contexts) {
      const unsupportedContexts = item.contexts.filter(context =>
        !this.featureSupport.supportedContexts.includes(context)
      );
      
      if (unsupportedContexts.length > 0) {
        warnings.push(`Unsupported contexts: ${unsupportedContexts.join(', ')}`);
        adaptations.push('Filtering unsupported contexts');
      }
    }

    // Check icons
    if (item.icons && !this.featureSupport.icons) {
      warnings.push('Icons are not supported in this browser');
      adaptations.push('Removing icons');
    }

    // Check submenus
    if (item.parentId && !this.featureSupport.submenus) {
      warnings.push('Submenus are not supported in this browser');
      adaptations.push('Removing parent ID');
    }

    // Check menu item type
    if (item.type && !this.featureSupport.supportedTypes.includes(item.type)) {
      warnings.push(`Menu type '${item.type}' is not supported in this browser`);
      adaptations.push(`Converting to 'normal' type`);
    }

    return {
      valid: true,
      warnings,
      adaptations
    };
  }

  /**
   * Get browser feature support configuration
   */
  private getBrowserFeatureSupport(): BrowserFeatureSupport {
    const baseSupport: BrowserFeatureSupport = {
      contextMenus: false,
      icons: false,
      submenus: false,
      radioGroups: false,
      checkboxes: false,
      maxItems: 0,
      maxNesting: 0,
      supportedContexts: [],
      supportedTypes: ['normal']
    };

    switch (this.browserType) {
      case 'chrome':
        return {
          ...baseSupport,
          contextMenus: true,
          icons: true,
          submenus: true,
          radioGroups: true,
          checkboxes: true,
          maxItems: 6,
          maxNesting: 1,
          supportedContexts: [
            'all', 'page', 'frame', 'selection', 'link', 'editable', 
            'image', 'video', 'audio', 'action'
          ],
          supportedTypes: ['normal', 'checkbox', 'radio', 'separator']
        };

      case 'edge':
        return {
          ...baseSupport,
          contextMenus: true,
          icons: true,
          submenus: true,
          radioGroups: true,
          checkboxes: true,
          maxItems: 6,
          maxNesting: 1,
          supportedContexts: [
            'all', 'page', 'frame', 'selection', 'link', 'editable', 
            'image', 'video', 'audio', 'action'
          ],
          supportedTypes: ['normal', 'checkbox', 'radio', 'separator']
        };

      case 'firefox':
        return {
          ...baseSupport,
          contextMenus: true,
          icons: true,
          submenus: true,
          radioGroups: true,
          checkboxes: true,
          maxItems: 100,
          maxNesting: 2,
          supportedContexts: [
            'all', 'page', 'frame', 'selection', 'link', 'editable', 
            'image', 'video', 'audio', 'browser_action'
          ],
          supportedTypes: ['normal', 'checkbox', 'radio', 'separator']
        };

      case 'safari':
        return {
          ...baseSupport,
          contextMenus: true,
          icons: false,
          submenus: false,
          radioGroups: false,
          checkboxes: true,
          maxItems: 10,
          maxNesting: 0,
          supportedContexts: ['all', 'page', 'selection', 'link', 'image'],
          supportedTypes: ['normal', 'checkbox', 'separator']
        };

      default:
        return {
          ...baseSupport,
          contextMenus: true,
          checkboxes: true,
          maxItems: 6,
          maxNesting: 0,
          supportedContexts: ['all', 'page', 'selection', 'link'],
          supportedTypes: ['normal', 'checkbox']
        };
    }
  }

  /**
   * Apply browser-specific adaptations to menu item
   */
  private applyBrowserSpecificAdaptations(item: MenuItemDefinition): void {
    switch (this.browserType) {
      case 'chrome':
      case 'edge':
        // Chrome/Edge specific adaptations
        this.adaptForChromium(item);
        break;

      case 'firefox':
        // Firefox specific adaptations
        this.adaptForFirefox(item);
        break;

      case 'safari':
        // Safari specific adaptations
        this.adaptForSafari(item);
        break;

      default:
        // Generic adaptations
        this.adaptForGeneric(item);
        break;
    }
  }

  /**
   * Chromium-based browser adaptations
   */
  private adaptForChromium(item: MenuItemDefinition): void {
    // Ensure action context is used instead of browser_action for Manifest V3
    if (item.contexts?.includes('browser_action' as MenuContext)) {
      const index = item.contexts.indexOf('browser_action' as MenuContext);
      item.contexts[index] = 'action';
    }

    // Limit title length
    if (item.title && item.title.length > 300) {
      item.title = item.title.substring(0, 297) + '...';
    }
  }

  /**
   * Firefox-specific adaptations
   */
  private adaptForFirefox(item: MenuItemDefinition): void {
    // Firefox uses browser_action instead of action
    if (item.contexts?.includes('action')) {
      const index = item.contexts.indexOf('action');
      item.contexts[index] = 'browser_action' as MenuContext;
    }

    // Firefox handles UTF-8 better, no need to limit title length as much
    if (item.title && item.title.length > 1000) {
      item.title = item.title.substring(0, 997) + '...';
    }
  }

  /**
   * Safari-specific adaptations
   */
  private adaptForSafari(item: MenuItemDefinition): void {
    // Safari has more limited context support
    if (item.contexts) {
      const safariContexts: MenuContext[] = ['all', 'page', 'selection', 'link', 'image'];
      item.contexts = item.contexts.filter(context => safariContexts.includes(context));
    }

    // Ensure title is not too long for Safari
    if (item.title && item.title.length > 100) {
      item.title = item.title.substring(0, 97) + '...';
    }
  }

  /**
   * Generic browser adaptations
   */
  private adaptForGeneric(item: MenuItemDefinition): void {
    // Conservative adaptations for unknown browsers
    if (item.contexts) {
      const basicContexts: MenuContext[] = ['all', 'page', 'selection', 'link'];
      item.contexts = item.contexts.filter(context => basicContexts.includes(context));
    }

    // Keep title short for compatibility
    if (item.title && item.title.length > 50) {
      item.title = item.title.substring(0, 47) + '...';
    }

    // Remove advanced features
    delete item.icons;
    delete item.parentId;
    
    if (item.type && !['normal', 'separator'].includes(item.type)) {
      item.type = 'normal';
    }
  }
}

/**
 * Create a context menu browser adapter
 */
export function createContextMenuBrowserAdapter(): ContextMenuBrowserAdapter {
  return new ContextMenuBrowserAdapter();
}