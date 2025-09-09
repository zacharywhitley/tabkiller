/**
 * Context Menu and Shortcuts Integration
 * Integrates keyboard shortcuts with context menu system
 */

import { 
  ContextMenuManager, 
  MenuItemDefinition, 
  ContextMenuConfig,
  MenuOperationResult
} from './core';
import { 
  ShortcutManager, 
  ShortcutCommand, 
  ShortcutConfig,
  ShortcutOperationResult,
  KeyCombination 
} from './shortcuts';
import { shortcutUtils } from './shortcuts/utils';

/**
 * Integration configuration
 */
export interface IntegrationConfig {
  contextMenu?: ContextMenuConfig;
  shortcuts?: ShortcutConfig;
  showShortcutsInMenu?: boolean;
  enableMenuShortcuts?: boolean;
  menuItemPrefix?: string;
}

/**
 * Integrated action definition
 */
export interface IntegratedAction {
  id: string;
  name: string;
  description: string;
  shortcut?: KeyCombination;
  category: string;
  handler: (context: ActionContext) => void | Promise<void>;
  menuItem?: Partial<MenuItemDefinition>;
  enabled?: boolean;
  showInMenu?: boolean;
  showInShortcuts?: boolean;
}

/**
 * Action execution context
 */
export interface ActionContext {
  source: 'menu' | 'shortcut' | 'api';
  menuInfo?: any;
  tab?: chrome.tabs.Tab;
  timestamp: number;
}

/**
 * Integration result
 */
export interface IntegrationResult {
  success: boolean;
  contextMenuSupported: boolean;
  shortcutsSupported: boolean;
  actionsRegistered: number;
  errors?: Error[];
}

/**
 * Context Menu and Shortcuts Integration Manager
 */
export class ContextMenuShortcutIntegration {
  private contextMenuManager: ContextMenuManager;
  private shortcutManager: ShortcutManager;
  private config: IntegrationConfig;
  private actions = new Map<string, IntegratedAction>();
  private initialized = false;

  constructor(
    contextMenuManager: ContextMenuManager,
    shortcutManager: ShortcutManager,
    config: IntegrationConfig = {}
  ) {
    this.contextMenuManager = contextMenuManager;
    this.shortcutManager = shortcutManager;
    this.config = {
      showShortcutsInMenu: true,
      enableMenuShortcuts: true,
      menuItemPrefix: 'tk-',
      ...config
    };
  }

  /**
   * Initialize the integration
   */
  async initialize(): Promise<IntegrationResult> {
    const errors: Error[] = [];
    let actionsRegistered = 0;

    try {
      // Initialize context menu manager
      const menuResult = await this.contextMenuManager.initialize(this.config.contextMenu);
      if (!menuResult.success && menuResult.error) {
        errors.push(menuResult.error);
      }

      // Initialize shortcuts manager
      const shortcutResult = await this.shortcutManager.initialize(this.config.shortcuts);
      if (!shortcutResult.success && shortcutResult.error) {
        errors.push(shortcutResult.error);
      }

      // Set up event handlers for integration
      this.setupEventHandlers();

      this.initialized = true;

      // Register any pending actions
      for (const action of this.actions.values()) {
        const result = await this.registerAction(action);
        if (result.success) {
          actionsRegistered++;
        }
      }

      return {
        success: errors.length === 0,
        contextMenuSupported: this.contextMenuManager.isSupported(),
        shortcutsSupported: this.shortcutManager.isSupported(),
        actionsRegistered,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
      
      return {
        success: false,
        contextMenuSupported: this.contextMenuManager.isSupported(),
        shortcutsSupported: this.shortcutManager.isSupported(),
        actionsRegistered,
        errors
      };
    }
  }

  /**
   * Register an integrated action
   */
  async registerAction(action: IntegratedAction): Promise<IntegrationResult> {
    const errors: Error[] = [];
    let actionsRegistered = 0;

    try {
      // Store action
      this.actions.set(action.id, action);

      if (!this.initialized) {
        // Will be registered during initialization
        return {
          success: true,
          contextMenuSupported: this.contextMenuManager.isSupported(),
          shortcutsSupported: this.shortcutManager.isSupported(),
          actionsRegistered: 1
        };
      }

      // Register shortcut if specified and enabled
      if (action.shortcut && 
          action.showInShortcuts !== false && 
          this.shortcutManager.isSupported()) {
        
        const shortcutCommand: ShortcutCommand = {
          id: action.id,
          name: action.name,
          description: action.description,
          category: action.category as any,
          defaultShortcut: action.shortcut,
          handler: async (command, tab, context) => {
            await this.executeAction(action.id, {
              source: 'shortcut',
              tab,
              timestamp: Date.now()
            });
          },
          enabled: action.enabled !== false,
          visible: true,
          contexts: ['all']
        };

        const shortcutResult = await this.shortcutManager.registerCommand(shortcutCommand);
        if (!shortcutResult.success && shortcutResult.error) {
          errors.push(shortcutResult.error);
        } else {
          actionsRegistered++;
        }
      }

      // Register context menu item if enabled
      if (action.showInMenu !== false && 
          this.contextMenuManager.isSupported()) {
        
        const menuId = `${this.config.menuItemPrefix}${action.id}`;
        const shortcutDisplay = action.shortcut && this.config.showShortcutsInMenu
          ? ` (${shortcutUtils.formatShortcutString(action.shortcut)})`
          : '';

        const menuItem: MenuItemDefinition = {
          id: menuId,
          title: `${action.name}${shortcutDisplay}`,
          contexts: ['all'],
          onclick: async (info, tab) => {
            await this.executeAction(action.id, {
              source: 'menu',
              menuInfo: info,
              tab,
              timestamp: Date.now()
            });
          },
          enabled: action.enabled !== false,
          visible: true,
          ...action.menuItem
        };

        const menuResult = await this.contextMenuManager.registerMenuItem(menuItem);
        if (!menuResult.success && menuResult.error) {
          errors.push(menuResult.error);
        } else if (actionsRegistered === 0) {
          actionsRegistered++; // Count action as registered if either menu or shortcut worked
        }
      }

      return {
        success: errors.length === 0,
        contextMenuSupported: this.contextMenuManager.isSupported(),
        shortcutsSupported: this.shortcutManager.isSupported(),
        actionsRegistered,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
      
      return {
        success: false,
        contextMenuSupported: this.contextMenuManager.isSupported(),
        shortcutsSupported: this.shortcutManager.isSupported(),
        actionsRegistered,
        errors
      };
    }
  }

  /**
   * Register multiple actions
   */
  async registerActions(actions: IntegratedAction[]): Promise<IntegrationResult> {
    const errors: Error[] = [];
    let totalActionsRegistered = 0;

    for (const action of actions) {
      const result = await this.registerAction(action);
      totalActionsRegistered += result.actionsRegistered;
      
      if (result.errors) {
        errors.push(...result.errors);
      }
    }

    return {
      success: errors.length === 0,
      contextMenuSupported: this.contextMenuManager.isSupported(),
      shortcutsSupported: this.shortcutManager.isSupported(),
      actionsRegistered: totalActionsRegistered,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Unregister an action
   */
  async unregisterAction(actionId: string): Promise<IntegrationResult> {
    const errors: Error[] = [];

    try {
      const action = this.actions.get(actionId);
      if (!action) {
        throw new Error(`Action '${actionId}' not found`);
      }

      // Remove shortcut
      if (this.shortcutManager.isSupported()) {
        const shortcutResult = await this.shortcutManager.unregisterCommand(actionId);
        if (!shortcutResult.success && shortcutResult.error) {
          errors.push(shortcutResult.error);
        }
      }

      // Remove menu item
      if (this.contextMenuManager.isSupported()) {
        const menuId = `${this.config.menuItemPrefix}${actionId}`;
        const menuResult = await this.contextMenuManager.removeMenuItem(menuId);
        if (!menuResult.success && menuResult.error) {
          errors.push(menuResult.error);
        }
      }

      // Remove from our registry
      this.actions.delete(actionId);

      return {
        success: errors.length === 0,
        contextMenuSupported: this.contextMenuManager.isSupported(),
        shortcutsSupported: this.shortcutManager.isSupported(),
        actionsRegistered: 0,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
      
      return {
        success: false,
        contextMenuSupported: this.contextMenuManager.isSupported(),
        shortcutsSupported: this.shortcutManager.isSupported(),
        actionsRegistered: 0,
        errors
      };
    }
  }

  /**
   * Update action shortcut
   */
  async updateActionShortcut(actionId: string, shortcut: KeyCombination): Promise<IntegrationResult> {
    const errors: Error[] = [];

    try {
      const action = this.actions.get(actionId);
      if (!action) {
        throw new Error(`Action '${actionId}' not found`);
      }

      // Update shortcut
      if (this.shortcutManager.isSupported()) {
        const shortcutResult = await this.shortcutManager.updateCommandShortcut(actionId, shortcut);
        if (!shortcutResult.success && shortcutResult.error) {
          errors.push(shortcutResult.error);
        }
      }

      // Update menu item title to show new shortcut
      if (this.contextMenuManager.isSupported() && this.config.showShortcutsInMenu) {
        const menuId = `${this.config.menuItemPrefix}${actionId}`;
        const shortcutDisplay = shortcutUtils.formatShortcutString(shortcut);
        const newTitle = `${action.name} (${shortcutDisplay})`;
        
        const menuResult = await this.contextMenuManager.updateMenuItem(menuId, { title: newTitle });
        if (!menuResult.success && menuResult.error) {
          errors.push(menuResult.error);
        }
      }

      // Update stored action
      action.shortcut = shortcut;
      this.actions.set(actionId, action);

      return {
        success: errors.length === 0,
        contextMenuSupported: this.contextMenuManager.isSupported(),
        shortcutsSupported: this.shortcutManager.isSupported(),
        actionsRegistered: 1,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
      
      return {
        success: false,
        contextMenuSupported: this.contextMenuManager.isSupported(),
        shortcutsSupported: this.shortcutManager.isSupported(),
        actionsRegistered: 0,
        errors
      };
    }
  }

  /**
   * Get all registered actions
   */
  getActions(): IntegratedAction[] {
    return Array.from(this.actions.values());
  }

  /**
   * Get action by ID
   */
  getAction(actionId: string): IntegratedAction | undefined {
    return this.actions.get(actionId);
  }

  /**
   * Check if integration is supported
   */
  isSupported(): { contextMenu: boolean; shortcuts: boolean } {
    return {
      contextMenu: this.contextMenuManager.isSupported(),
      shortcuts: this.shortcutManager.isSupported()
    };
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    await this.contextMenuManager.destroy();
    await this.shortcutManager.destroy();
    this.actions.clear();
    this.initialized = false;
  }

  /**
   * Execute an action
   */
  private async executeAction(actionId: string, context: ActionContext): Promise<void> {
    try {
      const action = this.actions.get(actionId);
      if (!action) {
        throw new Error(`Action '${actionId}' not found`);
      }

      if (!action.enabled) {
        return; // Action is disabled
      }

      await action.handler(context);

    } catch (error) {
      console.error(`[Integration] Error executing action '${actionId}':`, error);
      throw error;
    }
  }

  /**
   * Set up event handlers for integration
   */
  private setupEventHandlers(): void {
    // Context menu error handling
    this.contextMenuManager.setEventHandlers({
      onError: (error) => {
        console.error('[Integration] Context menu error:', error);
      }
    });

    // Shortcut error handling
    this.shortcutManager.setEventHandlers({
      onError: (error) => {
        console.error('[Integration] Shortcut error:', error);
      },
      onShortcutChanged: (commandId, oldShortcut, newShortcut) => {
        // Update menu item if shortcuts are shown in menu
        if (this.config.showShortcutsInMenu && newShortcut) {
          this.updateMenuItemShortcutDisplay(commandId, newShortcut);
        }
      }
    });
  }

  /**
   * Update menu item to show new shortcut display
   */
  private async updateMenuItemShortcutDisplay(commandId: string, shortcut: KeyCombination): Promise<void> {
    try {
      const action = this.actions.get(commandId);
      if (!action || !this.contextMenuManager.isSupported()) {
        return;
      }

      const menuId = `${this.config.menuItemPrefix}${commandId}`;
      const shortcutDisplay = shortcutUtils.formatShortcutString(shortcut);
      const newTitle = `${action.name} (${shortcutDisplay})`;

      await this.contextMenuManager.updateMenuItem(menuId, { title: newTitle });

    } catch (error) {
      console.warn('[Integration] Failed to update menu item shortcut display:', error);
    }
  }
}

/**
 * Create a new integration instance
 */
export function createContextMenuShortcutIntegration(
  contextMenuManager: ContextMenuManager,
  shortcutManager: ShortcutManager,
  config?: IntegrationConfig
): ContextMenuShortcutIntegration {
  return new ContextMenuShortcutIntegration(contextMenuManager, shortcutManager, config);
}