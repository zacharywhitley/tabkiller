/**
 * Context Menu Manager
 * Provides a high-level interface for managing context menu items with validation,
 * error handling, and cross-browser compatibility
 */

import { ContextMenuAPIWrapper } from './api-wrapper';
import {
  ContextMenuManager,
  MenuItemDefinition,
  MenuClickInfo,
  MenuTab,
  ContextMenuConfig,
  ContextMenuCapabilities,
  MenuOperationResult,
  MenuRegistrationOptions,
  MenuItemValidationResult,
  ContextMenuEventHandlers,
  ContextMenuError,
  MenuContext,
  MenuItemType
} from './types';

/**
 * Default configuration for the context menu manager
 */
const DEFAULT_CONFIG: Required<ContextMenuConfig> = {
  debug: false,
  enableLogging: true,
  maxRetries: 3,
  retryDelay: 100,
  performance: {
    enableTiming: true,
    maxCreationTime: 1 // 1ms max creation time per requirements
  }
};

/**
 * Context Menu Manager Implementation
 */
export class ContextMenuManagerImpl implements ContextMenuManager {
  private apiWrapper: ContextMenuAPIWrapper;
  private config: Required<ContextMenuConfig>;
  private menuItems: Map<string, MenuItemDefinition> = new Map();
  private eventHandlers: ContextMenuEventHandlers = {};
  private initialized = false;

  constructor(config?: ContextMenuConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.apiWrapper = new ContextMenuAPIWrapper(this.config.debug);
  }

  /**
   * Initialize the context menu manager
   */
  async initialize(config?: ContextMenuConfig): Promise<MenuOperationResult> {
    const startTime = performance.now();

    if (config) {
      this.config = { ...this.config, ...config };
    }

    try {
      const result = await this.apiWrapper.initialize();
      
      if (!result.success) {
        return result;
      }

      // Set up click handler
      this.apiWrapper.setClickListener(this.handleMenuClick.bind(this));

      this.initialized = true;

      if (this.config.enableLogging) {
        console.log('[ContextMenuManager] Initialized successfully', {
          capabilities: this.apiWrapper.getCapabilities(),
          config: this.config
        });
      }

      return {
        success: true,
        browserType: result.browserType,
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
          new ContextMenuError('API_ERROR', error.message, this.apiWrapper.getCapabilities().supportsContextMenus ? 'chrome' : 'unknown'),
        browserType: this.apiWrapper.getCapabilities().supportsContextMenus ? 'chrome' : 'unknown',
        timing: {
          operation: 'initialize',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * Register a single menu item
   */
  async registerMenuItem(
    item: MenuItemDefinition, 
    options: MenuRegistrationOptions = {}
  ): Promise<MenuOperationResult<string>> {
    const startTime = performance.now();

    if (!this.initialized) {
      throw new Error('Context menu manager not initialized');
    }

    // Validate the menu item
    if (options.validate !== false) {
      const validation = this.validateMenuItem(item);
      if (!validation.valid) {
        return {
          success: false,
          error: new ContextMenuError(
            'INVALID_MENU_ITEM',
            `Menu item validation failed: ${validation.errors.join(', ')}`,
            this.apiWrapper.getCapabilities().supportsContextMenus ? 'chrome' : 'unknown',
            item.id
          ),
          browserType: this.apiWrapper.getCapabilities().supportsContextMenus ? 'chrome' : 'unknown',
          timing: {
            operation: 'registerMenuItem',
            duration: performance.now() - startTime,
            timestamp: Date.now()
          }
        };
      }
    }

    // Check if item already exists
    if (this.menuItems.has(item.id) && !options.replace) {
      return {
        success: false,
        error: new ContextMenuError(
          'INVALID_MENU_ITEM',
          `Menu item with ID '${item.id}' already exists`,
          this.apiWrapper.getCapabilities().supportsContextMenus ? 'chrome' : 'unknown',
          item.id
        ),
        browserType: this.apiWrapper.getCapabilities().supportsContextMenus ? 'chrome' : 'unknown',
        timing: {
          operation: 'registerMenuItem',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    }

    try {
      // Remove existing item if replacing
      if (this.menuItems.has(item.id) && options.replace) {
        await this.apiWrapper.removeMenuItem(item.id);
      }

      // Performance timing check
      const creationStart = performance.now();
      const result = await this.apiWrapper.createMenuItem(item);
      const creationTime = performance.now() - creationStart;

      if (this.config.performance.enableTiming && 
          creationTime > this.config.performance.maxCreationTime) {
        console.warn(`[ContextMenuManager] Menu creation took ${creationTime.toFixed(2)}ms, exceeding limit of ${this.config.performance.maxCreationTime}ms`);
      }

      if (result.success) {
        this.menuItems.set(item.id, { ...item });
        
        if (this.config.enableLogging) {
          console.log(`[ContextMenuManager] Menu item registered: ${item.id}`, { item, creationTime: creationTime.toFixed(2) });
        }

        // Notify handlers
        this.eventHandlers.onMenuCreated?.(item.id);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof ContextMenuError ? error : 
          new ContextMenuError('REGISTRATION_FAILED', error.message, this.apiWrapper.getCapabilities().supportsContextMenus ? 'chrome' : 'unknown', item.id),
        browserType: this.apiWrapper.getCapabilities().supportsContextMenus ? 'chrome' : 'unknown',
        timing: {
          operation: 'registerMenuItem',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * Register multiple menu items
   */
  async registerMenuItems(
    items: MenuItemDefinition[], 
    options: MenuRegistrationOptions = {}
  ): Promise<MenuOperationResult<string[]>> {
    const startTime = performance.now();
    const registeredIds: string[] = [];
    const errors: ContextMenuError[] = [];

    for (const item of items) {
      try {
        const result = await this.registerMenuItem(item, options);
        
        if (result.success && result.data) {
          registeredIds.push(result.data);
        } else if (result.error) {
          if (options.skipUnsupported && 
              result.error instanceof ContextMenuError && 
              result.error.type === 'UNSUPPORTED_BROWSER') {
            continue; // Skip unsupported items
          }
          errors.push(result.error as ContextMenuError);
        }
      } catch (error) {
        errors.push(
          error instanceof ContextMenuError ? error : 
          new ContextMenuError('REGISTRATION_FAILED', error.message, this.apiWrapper.getCapabilities().supportsContextMenus ? 'chrome' : 'unknown', item.id)
        );
      }
    }

    const success = errors.length === 0;
    
    return {
      success,
      data: registeredIds,
      error: errors.length > 0 ? errors[0] : undefined, // Return first error
      browserType: this.apiWrapper.getCapabilities().supportsContextMenus ? 'chrome' : 'unknown',
      timing: {
        operation: 'registerMenuItems',
        duration: performance.now() - startTime,
        timestamp: Date.now()
      }
    };
  }

  /**
   * Remove a menu item by ID
   */
  async removeMenuItem(id: string): Promise<MenuOperationResult> {
    if (!this.initialized) {
      throw new Error('Context menu manager not initialized');
    }

    if (!this.menuItems.has(id)) {
      return {
        success: false,
        error: new ContextMenuError(
          'INVALID_MENU_ITEM',
          `Menu item with ID '${id}' not found`,
          this.apiWrapper.getCapabilities().supportsContextMenus ? 'chrome' : 'unknown',
          id
        ),
        browserType: this.apiWrapper.getCapabilities().supportsContextMenus ? 'chrome' : 'unknown'
      };
    }

    const result = await this.apiWrapper.removeMenuItem(id);
    
    if (result.success) {
      this.menuItems.delete(id);
      this.eventHandlers.onMenuRemoved?.(id);
      
      if (this.config.enableLogging) {
        console.log(`[ContextMenuManager] Menu item removed: ${id}`);
      }
    }

    return result;
  }

  /**
   * Remove multiple menu items by IDs
   */
  async removeMenuItems(ids: string[]): Promise<MenuOperationResult> {
    const errors: ContextMenuError[] = [];

    for (const id of ids) {
      const result = await this.removeMenuItem(id);
      if (!result.success && result.error) {
        errors.push(result.error as ContextMenuError);
      }
    }

    return {
      success: errors.length === 0,
      error: errors.length > 0 ? errors[0] : undefined,
      browserType: this.apiWrapper.getCapabilities().supportsContextMenus ? 'chrome' : 'unknown'
    };
  }

  /**
   * Remove all menu items
   */
  async removeAllMenuItems(): Promise<MenuOperationResult> {
    if (!this.initialized) {
      throw new Error('Context menu manager not initialized');
    }

    const result = await this.apiWrapper.removeAllMenuItems();
    
    if (result.success) {
      // Notify handlers for all removed items
      for (const id of this.menuItems.keys()) {
        this.eventHandlers.onMenuRemoved?.(id);
      }
      
      this.menuItems.clear();
      
      if (this.config.enableLogging) {
        console.log('[ContextMenuManager] All menu items removed');
      }
    }

    return result;
  }

  /**
   * Update a menu item
   */
  async updateMenuItem(id: string, properties: Partial<MenuItemDefinition>): Promise<MenuOperationResult> {
    if (!this.initialized) {
      throw new Error('Context menu manager not initialized');
    }

    if (!this.menuItems.has(id)) {
      return {
        success: false,
        error: new ContextMenuError(
          'INVALID_MENU_ITEM',
          `Menu item with ID '${id}' not found`,
          this.apiWrapper.getCapabilities().supportsContextMenus ? 'chrome' : 'unknown',
          id
        ),
        browserType: this.apiWrapper.getCapabilities().supportsContextMenus ? 'chrome' : 'unknown'
      };
    }

    const result = await this.apiWrapper.updateMenuItem(id, properties);
    
    if (result.success) {
      // Update our stored definition
      const current = this.menuItems.get(id)!;
      this.menuItems.set(id, { ...current, ...properties });
      
      if (this.config.enableLogging) {
        console.log(`[ContextMenuManager] Menu item updated: ${id}`, properties);
      }
    }

    return result;
  }

  /**
   * Get browser capabilities for context menus
   */
  getCapabilities(): ContextMenuCapabilities {
    return this.apiWrapper.getCapabilities();
  }

  /**
   * Check if context menus are supported
   */
  isSupported(): boolean {
    return this.apiWrapper.isSupported();
  }

  /**
   * Validate a menu item definition
   */
  validateMenuItem(item: MenuItemDefinition): MenuItemValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!item.id) {
      errors.push('Menu item ID is required');
    }

    if (!item.title && item.type !== 'separator') {
      errors.push('Menu item title is required for non-separator items');
    }

    // ID validation
    if (item.id && typeof item.id !== 'string') {
      errors.push('Menu item ID must be a string');
    }

    // Type validation
    if (item.type && !['normal', 'checkbox', 'radio', 'separator'].includes(item.type)) {
      errors.push(`Invalid menu item type: ${item.type}`);
    }

    // Context validation
    const capabilities = this.getCapabilities();
    if (item.contexts) {
      const unsupportedContexts = item.contexts.filter(context => 
        !capabilities.supportedContexts.includes(context)
      );
      
      if (unsupportedContexts.length > 0) {
        if (this.config.debug) {
          warnings.push(`Unsupported contexts will be ignored: ${unsupportedContexts.join(', ')}`);
        }
      }
    }

    // Feature support warnings
    if (item.icons && !capabilities.supportsIcons) {
      warnings.push('Icons are not supported in this browser');
    }

    if (item.parentId && !capabilities.supportsSubmenus) {
      warnings.push('Submenus are not supported in this browser');
    }

    if ((item.type === 'radio' || item.type === 'checkbox') && !capabilities.supportsCheckboxes) {
      warnings.push(`${item.type} type is not supported in this browser`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Set event handlers
   */
  setEventHandlers(handlers: ContextMenuEventHandlers): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  /**
   * Get current menu items
   */
  getMenuItems(): MenuItemDefinition[] {
    return Array.from(this.menuItems.values());
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    if (this.initialized) {
      await this.apiWrapper.destroy();
      this.menuItems.clear();
      this.eventHandlers = {};
      this.initialized = false;
      
      if (this.config.enableLogging) {
        console.log('[ContextMenuManager] Destroyed successfully');
      }
    }
  }

  /**
   * Handle menu item clicks
   */
  private async handleMenuClick(info: MenuClickInfo, tab?: MenuTab): Promise<void> {
    try {
      const menuItemId = String(info.menuItemId);
      const menuItem = this.menuItems.get(menuItemId);

      if (menuItem?.onclick) {
        await menuItem.onclick(info, tab);
      }

      // Also call global handler
      if (this.eventHandlers.onMenuClick) {
        await this.eventHandlers.onMenuClick(info, tab);
      }

      if (this.config.enableLogging) {
        console.log('[ContextMenuManager] Menu click handled:', { menuItemId, info, tab });
      }
    } catch (error) {
      const contextMenuError = new ContextMenuError(
        'API_ERROR',
        `Error handling menu click: ${error.message}`,
        this.apiWrapper.getCapabilities().supportsContextMenus ? 'chrome' : 'unknown',
        String(info.menuItemId)
      );

      if (this.eventHandlers.onError) {
        this.eventHandlers.onError(contextMenuError);
      } else {
        console.error('[ContextMenuManager] Unhandled menu click error:', contextMenuError);
      }
    }
  }
}

/**
 * Create a new context menu manager instance
 */
export function createContextMenuManager(config?: ContextMenuConfig): ContextMenuManager {
  return new ContextMenuManagerImpl(config);
}