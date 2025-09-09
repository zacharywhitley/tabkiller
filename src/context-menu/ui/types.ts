/**
 * Menu Organization and UI Integration Types
 * Provides type definitions for hierarchical menu organization and UI integration
 */

import { MenuItemDefinition, MenuContext } from '../core/types';
import { KeyCombination } from '../shortcuts/types';

/**
 * Menu group definition for organizing related menu items
 */
export interface MenuGroup {
  id: string;
  name: string;
  description?: string;
  priority: number;
  icon?: string;
  enabled: boolean;
  visible: boolean;
  contexts?: MenuContext[];
  parentId?: string;
  children?: string[]; // IDs of child groups or items
}

/**
 * Enhanced menu item with organization metadata
 */
export interface OrganizedMenuItem extends MenuItemDefinition {
  groupId?: string;
  priority: number;
  category: MenuCategory;
  tags: string[];
  contextRules?: ContextRule[];
  shortcut?: KeyCombination;
  i18nKey: string;
  description?: string;
  iconUrl?: string;
}

/**
 * Menu categories for logical organization
 */
export type MenuCategory = 
  | 'navigation'
  | 'tabs'
  | 'sessions'
  | 'bookmarks'
  | 'settings'
  | 'tools'
  | 'help'
  | 'custom';

/**
 * Context rules for dynamic menu visibility
 */
export interface ContextRule {
  type: ContextRuleType;
  condition: ContextCondition;
  value?: any;
  operator?: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches' | 'exists';
}

/**
 * Types of context rules
 */
export type ContextRuleType = 
  | 'url'
  | 'domain'
  | 'tab_count'
  | 'selection_exists'
  | 'media_type'
  | 'page_type'
  | 'extension_context'
  | 'user_setting'
  | 'feature_enabled';

/**
 * Context conditions for rule evaluation
 */
export type ContextCondition = 
  | 'show_when'
  | 'hide_when'
  | 'enable_when'
  | 'disable_when';

/**
 * Menu structure configuration
 */
export interface MenuStructureConfig {
  maxDepth: number;
  maxItemsPerGroup: number;
  enableSubmenus: boolean;
  showIcons: boolean;
  showShortcuts: boolean;
  compactMode: boolean;
  groupSeparators: boolean;
}

/**
 * Menu visibility state
 */
export interface MenuVisibilityState {
  groupId: string;
  visible: boolean;
  enabled: boolean;
  reason?: string;
}

/**
 * Menu organization configuration
 */
export interface MenuOrganizationConfig {
  structure: MenuStructureConfig;
  groups: MenuGroup[];
  items: OrganizedMenuItem[];
  customizations: MenuCustomization[];
  i18nNamespace: string;
}

/**
 * User menu customization
 */
export interface MenuCustomization {
  itemId: string;
  hidden: boolean;
  priority?: number;
  groupId?: string;
  customName?: string;
  customShortcut?: KeyCombination;
  userModified: boolean;
  timestamp: number;
}

/**
 * Menu rendering context
 */
export interface MenuRenderContext {
  browserType: string;
  pageUrl?: string;
  selectionText?: string;
  mediaType?: string;
  tabCount: number;
  userSettings: any;
  capabilities: any;
}

/**
 * Menu action handler context
 */
export interface MenuActionContext {
  menuItem: OrganizedMenuItem;
  clickInfo: any;
  tab?: chrome.tabs.Tab;
  renderContext: MenuRenderContext;
  timestamp: number;
}

/**
 * Menu organization result
 */
export interface MenuOrganizationResult {
  groups: MenuGroup[];
  items: OrganizedMenuItem[];
  visibilityStates: MenuVisibilityState[];
  totalItems: number;
  hiddenItems: number;
  errors?: string[];
}

/**
 * Menu validation result
 */
export interface MenuValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  groupErrors: Record<string, string[]>;
  itemErrors: Record<string, string[]>;
}

/**
 * Menu organization error types
 */
export type MenuOrganizationErrorType = 
  | 'INVALID_STRUCTURE'
  | 'CIRCULAR_DEPENDENCY'
  | 'MISSING_GROUP'
  | 'INVALID_PRIORITY'
  | 'CONTEXT_RULE_ERROR'
  | 'I18N_KEY_MISSING'
  | 'UNKNOWN';

/**
 * Menu organization error class
 */
export class MenuOrganizationError extends Error {
  public readonly type: MenuOrganizationErrorType;
  public readonly itemId?: string;
  public readonly groupId?: string;

  constructor(
    type: MenuOrganizationErrorType,
    message: string,
    itemId?: string,
    groupId?: string,
    cause?: Error
  ) {
    super(message);
    this.name = 'MenuOrganizationError';
    this.type = type;
    this.itemId = itemId;
    this.groupId = groupId;
    this.cause = cause;
  }
}

/**
 * Menu organization manager interface
 */
export interface MenuOrganizationManager {
  /**
   * Initialize the menu organization system
   */
  initialize(config: MenuOrganizationConfig): Promise<MenuOrganizationResult>;

  /**
   * Add a menu group
   */
  addGroup(group: MenuGroup): Promise<MenuOrganizationResult>;

  /**
   * Remove a menu group
   */
  removeGroup(groupId: string): Promise<MenuOrganizationResult>;

  /**
   * Add a menu item to a group
   */
  addItem(item: OrganizedMenuItem): Promise<MenuOrganizationResult>;

  /**
   * Remove a menu item
   */
  removeItem(itemId: string): Promise<MenuOrganizationResult>;

  /**
   * Update menu item
   */
  updateItem(itemId: string, updates: Partial<OrganizedMenuItem>): Promise<MenuOrganizationResult>;

  /**
   * Get menu structure for rendering
   */
  getMenuStructure(context: MenuRenderContext): Promise<MenuOrganizationResult>;

  /**
   * Validate menu organization
   */
  validateOrganization(): MenuValidationResult;

  /**
   * Apply user customizations
   */
  applyCustomizations(customizations: MenuCustomization[]): Promise<MenuOrganizationResult>;

  /**
   * Reset to default organization
   */
  resetToDefaults(): Promise<MenuOrganizationResult>;

  /**
   * Get menu groups
   */
  getGroups(): MenuGroup[];

  /**
   * Get menu items
   */
  getItems(): OrganizedMenuItem[];

  /**
   * Clean up resources
   */
  destroy(): Promise<void>;
}

/**
 * Context evaluation result
 */
export interface ContextEvaluationResult {
  visible: boolean;
  enabled: boolean;
  matchedRules: ContextRule[];
  failedRules: ContextRule[];
}

/**
 * Menu context evaluator interface
 */
export interface MenuContextEvaluator {
  /**
   * Evaluate context rules for an item
   */
  evaluateItem(item: OrganizedMenuItem, context: MenuRenderContext): ContextEvaluationResult;

  /**
   * Evaluate context rules for a group
   */
  evaluateGroup(group: MenuGroup, context: MenuRenderContext): ContextEvaluationResult;

  /**
   * Check if a context rule matches
   */
  evaluateRule(rule: ContextRule, context: MenuRenderContext): boolean;

  /**
   * Add custom rule evaluator
   */
  addCustomEvaluator(type: string, evaluator: (rule: ContextRule, context: MenuRenderContext) => boolean): void;
}