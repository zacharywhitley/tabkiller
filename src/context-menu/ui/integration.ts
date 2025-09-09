/**
 * Menu System Integration Layer
 * Connects menu organization, settings, and React components
 */

import {
  MenuOrganizationManager,
  MenuOrganizationConfig,
  MenuRenderContext,
  MenuContextEvaluator,
  OrganizedMenuItem,
  MenuGroup
} from './types';
import { ShortcutManager } from '../shortcuts/types';
import { ContextMenuManager } from '../core/types';
import { createMenuOrganizer } from './menu-organizer';
import { createMenuContextEvaluator } from './context-evaluator';
import { i18nManager } from './i18n';
import {
  DEFAULT_MENU_ORGANIZATION_CONFIG,
  getDefaultConfigForContext,
  createMinimalMenuConfig,
  createPowerUserMenuConfig
} from './defaults';
import { MenuSettings } from '../../contexts/types';

/**
 * Configuration for the menu integration system
 */
export interface MenuIntegrationConfig {
  enableI18n?: boolean;
  enableContextEvaluation?: boolean;
  enableShortcutIntegration?: boolean;
  enableSettingsSync?: boolean;
  debugMode?: boolean;
  performanceMode?: boolean;
}

/**
 * Menu system integration result
 */
export interface MenuIntegrationResult {
  success: boolean;
  error?: string;
  menuItems: OrganizedMenuItem[];
  visibleItems: OrganizedMenuItem[];
  groups: MenuGroup[];
  context: MenuRenderContext;
}

/**
 * Main integration class that orchestrates all menu components
 */
export class MenuSystemIntegration {
  private organizer: MenuOrganizationManager;
  private contextEvaluator: MenuContextEvaluator;
  private contextMenuManager?: ContextMenuManager;
  private shortcutManager?: ShortcutManager;
  private config: MenuIntegrationConfig;
  private initialized = false;

  constructor(
    contextMenuManager?: ContextMenuManager,
    shortcutManager?: ShortcutManager,
    config: MenuIntegrationConfig = {}
  ) {
    this.contextMenuManager = contextMenuManager;
    this.shortcutManager = shortcutManager;
    this.config = {
      enableI18n: true,
      enableContextEvaluation: true,
      enableShortcutIntegration: true,
      enableSettingsSync: true,
      debugMode: false,
      performanceMode: false,
      ...config
    };

    this.organizer = createMenuOrganizer();
    this.contextEvaluator = createMenuContextEvaluator();
  }

  /**
   * Initialize the integration system
   */
  async initialize(): Promise<void> {
    try {
      // Initialize i18n system if enabled
      if (this.config.enableI18n) {
        await i18nManager.initialize({
          debug: this.config.debugMode
        });
      }

      // Initialize menu organizer with default config
      await this.organizer.initialize(DEFAULT_MENU_ORGANIZATION_CONFIG);

      this.initialized = true;

      if (this.config.debugMode) {
        console.log('MenuSystemIntegration initialized successfully');
      }
    } catch (error) {
      console.error('Failed to initialize MenuSystemIntegration:', error);
      throw error;
    }
  }

  /**
   * Update menu configuration from settings
   */
  async updateFromSettings(menuSettings: MenuSettings): Promise<void> {
    if (!this.initialized) {
      throw new Error('MenuSystemIntegration not initialized');
    }

    try {
      // Create updated configuration
      const currentConfig = await this.getCurrentConfig();
      
      const updatedConfig: MenuOrganizationConfig = {
        ...currentConfig,
        structure: {
          ...currentConfig.structure,
          maxDepth: menuSettings.maxDepth,
          maxItemsPerGroup: menuSettings.maxItemsPerGroup,
          enableSubmenus: menuSettings.enableSubmenus,
          showIcons: menuSettings.showIcons,
          showShortcuts: menuSettings.showShortcuts,
          compactMode: menuSettings.compactMode,
          groupSeparators: menuSettings.groupSeparators
        },
        customizations: menuSettings.menuCustomizations.map(customization => ({
          itemId: customization.itemId,
          hidden: customization.hidden,
          priority: customization.priority,
          groupId: customization.groupId,
          customName: customization.customName,
          customShortcut: customization.customShortcut ? {
            key: customization.customShortcut.split('+').pop() || '',
            modifiers: customization.customShortcut.split('+').slice(0, -1) as any[]
          } : undefined,
          userModified: customization.userModified,
          timestamp: customization.timestamp
        }))
      };

      // Apply the updated configuration
      await this.organizer.initialize(updatedConfig);

      if (this.config.debugMode) {
        console.log('Menu configuration updated from settings');
      }
    } catch (error) {
      console.error('Failed to update menu configuration from settings:', error);
      throw error;
    }
  }

  /**
   * Get current menu configuration
   */
  async getCurrentConfig(): Promise<MenuOrganizationConfig> {
    const groups = this.organizer.getGroups();
    const items = this.organizer.getItems();

    return {
      structure: DEFAULT_MENU_ORGANIZATION_CONFIG.structure,
      groups,
      items,
      customizations: [],
      i18nNamespace: 'menu'
    };
  }

  /**
   * Build menu for specific context
   */
  async buildMenuForContext(
    context: Partial<MenuRenderContext>,
    userSettings?: any
  ): Promise<MenuIntegrationResult> {
    if (!this.initialized) {
      throw new Error('MenuSystemIntegration not initialized');
    }

    try {
      // Create full render context
      const fullContext: MenuRenderContext = {
        browserType: 'chrome', // Would be detected
        pageUrl: '',
        selectionText: '',
        mediaType: '',
        tabCount: 1,
        userSettings: userSettings || {},
        capabilities: {},
        ...context
      };

      // Get menu structure
      const menuResult = await this.organizer.getMenuStructure(fullContext);

      // Filter items based on context evaluation if enabled
      let visibleItems = menuResult.items;
      if (this.config.enableContextEvaluation) {
        visibleItems = menuResult.items.filter(item => {
          const evaluation = this.contextEvaluator.evaluateItem(item, fullContext);
          return evaluation.visible && evaluation.enabled;
        });
      }

      // Apply translations if enabled
      if (this.config.enableI18n) {
        visibleItems = visibleItems.map(item => ({
          ...item,
          title: i18nManager.t(item.i18nKey, undefined, item.title || item.i18nKey),
          description: item.description ? 
            i18nManager.t(`${item.i18nKey}.description`, undefined, item.description) : 
            undefined
        }));
      }

      return {
        success: true,
        menuItems: menuResult.items,
        visibleItems,
        groups: menuResult.groups,
        context: fullContext
      };

    } catch (error) {
      console.error('Failed to build menu for context:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        menuItems: [],
        visibleItems: [],
        groups: [],
        context: context as MenuRenderContext
      };
    }
  }

  /**
   * Register menu items with the context menu system
   */
  async registerWithContextMenu(
    menuItems: OrganizedMenuItem[],
    context: MenuRenderContext
  ): Promise<void> {
    if (!this.contextMenuManager || !this.config.enableShortcutIntegration) {
      return;
    }

    try {
      // Convert organized menu items to context menu definitions
      const menuDefinitions = menuItems.map(item => ({
        id: item.id,
        type: item.type || 'normal',
        title: item.title || i18nManager.t(item.i18nKey, undefined, item.id),
        contexts: item.contexts || ['page'],
        enabled: item.enabled !== false,
        visible: item.visible !== false,
        parentId: item.parentId,
        icons: item.iconUrl ? { 16: item.iconUrl } : undefined,
        onclick: item.onclick
      }));

      // Register with context menu manager
      await this.contextMenuManager.registerMenuItems(menuDefinitions);

      if (this.config.debugMode) {
        console.log(`Registered ${menuDefinitions.length} menu items with context menu system`);
      }
    } catch (error) {
      console.error('Failed to register menu items with context menu:', error);
    }
  }

  /**
   * Register keyboard shortcuts
   */
  async registerShortcuts(menuItems: OrganizedMenuItem[]): Promise<void> {
    if (!this.shortcutManager || !this.config.enableShortcutIntegration) {
      return;
    }

    try {
      const shortcutCommands = menuItems
        .filter(item => item.shortcut)
        .map(item => ({
          id: item.id,
          name: item.title || i18nManager.t(item.i18nKey, undefined, item.id),
          description: item.description || '',
          category: item.category,
          defaultShortcut: item.shortcut,
          handler: item.onclick ? 
            async (commandId: string, tab?: chrome.tabs.Tab) => {
              if (item.onclick) {
                await item.onclick({ menuItemId: commandId }, tab);
              }
            } : 
            async () => {},
          enabled: item.enabled !== false,
          visible: item.visible !== false,
          contexts: ['all']
        }));

      await this.shortcutManager.registerCommands(shortcutCommands);

      if (this.config.debugMode) {
        console.log(`Registered ${shortcutCommands.length} keyboard shortcuts`);
      }
    } catch (error) {
      console.error('Failed to register keyboard shortcuts:', error);
    }
  }

  /**
   * Get menu configuration for specific user profile
   */
  getConfigForUserProfile(profile: 'minimal' | 'default' | 'power-user'): MenuOrganizationConfig {
    switch (profile) {
      case 'minimal':
        return createMinimalMenuConfig();
      case 'power-user':
        return createPowerUserMenuConfig();
      default:
        return DEFAULT_MENU_ORGANIZATION_CONFIG;
    }
  }

  /**
   * Get configuration for specific context
   */
  getConfigForContext(contextType: string): MenuOrganizationConfig {
    return getDefaultConfigForContext(contextType);
  }

  /**
   * Add custom menu item
   */
  async addCustomMenuItem(item: OrganizedMenuItem): Promise<void> {
    await this.organizer.addItem(item);
  }

  /**
   * Remove menu item
   */
  async removeMenuItem(itemId: string): Promise<void> {
    await this.organizer.removeItem(itemId);
  }

  /**
   * Add custom menu group
   */
  async addCustomMenuGroup(group: MenuGroup): Promise<void> {
    await this.organizer.addGroup(group);
  }

  /**
   * Remove menu group
   */
  async removeMenuGroup(groupId: string): Promise<void> {
    await this.organizer.removeGroup(groupId);
  }

  /**
   * Reset to default configuration
   */
  async resetToDefaults(): Promise<void> {
    await this.organizer.resetToDefaults();
  }

  /**
   * Export current configuration
   */
  async exportConfiguration(): Promise<MenuOrganizationConfig> {
    return this.getCurrentConfig();
  }

  /**
   * Import configuration
   */
  async importConfiguration(config: MenuOrganizationConfig): Promise<void> {
    await this.organizer.initialize(config);
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    await this.organizer.destroy();
    if (this.config.enableI18n) {
      i18nManager.destroy();
    }
    this.initialized = false;
  }

  /**
   * Check if system is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

/**
 * Create a new menu system integration instance
 */
export function createMenuSystemIntegration(
  contextMenuManager?: ContextMenuManager,
  shortcutManager?: ShortcutManager,
  config?: MenuIntegrationConfig
): MenuSystemIntegration {
  return new MenuSystemIntegration(contextMenuManager, shortcutManager, config);
}

/**
 * Global menu system integration instance
 */
let globalMenuIntegration: MenuSystemIntegration | null = null;

/**
 * Get or create global menu integration instance
 */
export function getGlobalMenuIntegration(
  contextMenuManager?: ContextMenuManager,
  shortcutManager?: ShortcutManager,
  config?: MenuIntegrationConfig
): MenuSystemIntegration {
  if (!globalMenuIntegration) {
    globalMenuIntegration = createMenuSystemIntegration(
      contextMenuManager,
      shortcutManager,
      config
    );
  }
  return globalMenuIntegration;
}

/**
 * Reset global menu integration instance
 */
export function resetGlobalMenuIntegration(): void {
  if (globalMenuIntegration) {
    globalMenuIntegration.destroy();
    globalMenuIntegration = null;
  }
}