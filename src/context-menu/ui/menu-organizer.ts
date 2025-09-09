/**
 * Menu Organization Manager
 * Manages hierarchical menu structure and organization
 */

import {
  MenuGroup,
  OrganizedMenuItem,
  MenuOrganizationConfig,
  MenuOrganizationResult,
  MenuValidationResult,
  MenuCustomization,
  MenuRenderContext,
  MenuOrganizationManager,
  MenuOrganizationError,
  MenuOrganizationErrorType,
  MenuVisibilityState
} from './types';

/**
 * Default menu structure configuration
 */
const DEFAULT_STRUCTURE_CONFIG = {
  maxDepth: 3,
  maxItemsPerGroup: 10,
  enableSubmenus: true,
  showIcons: true,
  showShortcuts: true,
  compactMode: false,
  groupSeparators: true
};

/**
 * Menu organization manager implementation
 */
export class MenuOrganizer implements MenuOrganizationManager {
  private config: MenuOrganizationConfig;
  private groups = new Map<string, MenuGroup>();
  private items = new Map<string, OrganizedMenuItem>();
  private customizations = new Map<string, MenuCustomization>();
  private initialized = false;

  constructor() {
    this.config = {
      structure: DEFAULT_STRUCTURE_CONFIG,
      groups: [],
      items: [],
      customizations: [],
      i18nNamespace: 'menu'
    };
  }

  /**
   * Initialize the menu organization system
   */
  async initialize(config: MenuOrganizationConfig): Promise<MenuOrganizationResult> {
    try {
      this.config = {
        ...this.config,
        ...config,
        structure: {
          ...DEFAULT_STRUCTURE_CONFIG,
          ...config.structure
        }
      };

      // Clear existing data
      this.groups.clear();
      this.items.clear();
      this.customizations.clear();

      // Load groups
      for (const group of this.config.groups) {
        this.groups.set(group.id, group);
      }

      // Load items
      for (const item of this.config.items) {
        this.items.set(item.id, item);
      }

      // Load customizations
      for (const customization of this.config.customizations) {
        this.customizations.set(customization.itemId, customization);
      }

      // Validate the organization
      const validation = this.validateOrganization();
      if (!validation.valid) {
        throw new MenuOrganizationError(
          'INVALID_STRUCTURE',
          `Menu organization validation failed: ${validation.errors.join(', ')}`
        );
      }

      this.initialized = true;

      return {
        groups: Array.from(this.groups.values()),
        items: Array.from(this.items.values()),
        visibilityStates: [],
        totalItems: this.items.size,
        hiddenItems: 0
      };

    } catch (error) {
      throw new MenuOrganizationError(
        'INVALID_STRUCTURE',
        `Failed to initialize menu organization: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Add a menu group
   */
  async addGroup(group: MenuGroup): Promise<MenuOrganizationResult> {
    try {
      // Validate group
      this.validateGroup(group);

      // Check for circular dependencies
      if (group.parentId && this.wouldCreateCircularDependency(group.id, group.parentId)) {
        throw new MenuOrganizationError(
          'CIRCULAR_DEPENDENCY',
          `Adding group '${group.id}' would create a circular dependency`,
          undefined,
          group.id
        );
      }

      // Add the group
      this.groups.set(group.id, group);

      return this.getMenuStructure({} as MenuRenderContext);

    } catch (error) {
      throw error instanceof MenuOrganizationError ? error : new MenuOrganizationError(
        'INVALID_STRUCTURE',
        `Failed to add group: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        group.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Remove a menu group
   */
  async removeGroup(groupId: string): Promise<MenuOrganizationResult> {
    try {
      const group = this.groups.get(groupId);
      if (!group) {
        throw new MenuOrganizationError('MISSING_GROUP', `Group '${groupId}' not found`, undefined, groupId);
      }

      // Check if group has children
      const hasChildren = Array.from(this.groups.values()).some(g => g.parentId === groupId) ||
                          Array.from(this.items.values()).some(i => i.groupId === groupId);

      if (hasChildren) {
        throw new MenuOrganizationError(
          'INVALID_STRUCTURE',
          `Cannot remove group '${groupId}' because it has children`,
          undefined,
          groupId
        );
      }

      this.groups.delete(groupId);

      return this.getMenuStructure({} as MenuRenderContext);

    } catch (error) {
      throw error instanceof MenuOrganizationError ? error : new MenuOrganizationError(
        'MISSING_GROUP',
        `Failed to remove group: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        groupId,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Add a menu item to a group
   */
  async addItem(item: OrganizedMenuItem): Promise<MenuOrganizationResult> {
    try {
      // Validate item
      this.validateItem(item);

      // Check if group exists (if specified)
      if (item.groupId && !this.groups.has(item.groupId)) {
        throw new MenuOrganizationError(
          'MISSING_GROUP',
          `Group '${item.groupId}' not found for item '${item.id}'`,
          item.id,
          item.groupId
        );
      }

      // Add the item
      this.items.set(item.id, item);

      return this.getMenuStructure({} as MenuRenderContext);

    } catch (error) {
      throw error instanceof MenuOrganizationError ? error : new MenuOrganizationError(
        'INVALID_STRUCTURE',
        `Failed to add item: ${error instanceof Error ? error.message : String(error)}`,
        item.id,
        item.groupId,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Remove a menu item
   */
  async removeItem(itemId: string): Promise<MenuOrganizationResult> {
    try {
      if (!this.items.has(itemId)) {
        throw new MenuOrganizationError('INVALID_STRUCTURE', `Item '${itemId}' not found`, itemId);
      }

      this.items.delete(itemId);
      this.customizations.delete(itemId);

      return this.getMenuStructure({} as MenuRenderContext);

    } catch (error) {
      throw error instanceof MenuOrganizationError ? error : new MenuOrganizationError(
        'INVALID_STRUCTURE',
        `Failed to remove item: ${error instanceof Error ? error.message : String(error)}`,
        itemId,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Update menu item
   */
  async updateItem(itemId: string, updates: Partial<OrganizedMenuItem>): Promise<MenuOrganizationResult> {
    try {
      const existingItem = this.items.get(itemId);
      if (!existingItem) {
        throw new MenuOrganizationError('INVALID_STRUCTURE', `Item '${itemId}' not found`, itemId);
      }

      const updatedItem = { ...existingItem, ...updates };
      this.validateItem(updatedItem);

      this.items.set(itemId, updatedItem);

      return this.getMenuStructure({} as MenuRenderContext);

    } catch (error) {
      throw error instanceof MenuOrganizationError ? error : new MenuOrganizationError(
        'INVALID_STRUCTURE',
        `Failed to update item: ${error instanceof Error ? error.message : String(error)}`,
        itemId,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get menu structure for rendering
   */
  async getMenuStructure(context: MenuRenderContext): Promise<MenuOrganizationResult> {
    try {
      const visibilityStates: MenuVisibilityState[] = [];
      const visibleGroups: MenuGroup[] = [];
      const visibleItems: OrganizedMenuItem[] = [];
      let hiddenItems = 0;

      // Process groups
      for (const group of this.groups.values()) {
        const visibility = this.evaluateGroupVisibility(group, context);
        visibilityStates.push({
          groupId: group.id,
          visible: visibility.visible,
          enabled: visibility.enabled,
          reason: visibility.reason
        });

        if (visibility.visible) {
          visibleGroups.push(group);
        }
      }

      // Process items
      for (const item of this.items.values()) {
        const visibility = this.evaluateItemVisibility(item, context);
        
        if (visibility.visible) {
          // Apply customizations
          const customizedItem = this.applyItemCustomizations(item);
          visibleItems.push(customizedItem);
        } else {
          hiddenItems++;
        }
      }

      // Sort groups and items by priority
      visibleGroups.sort((a, b) => b.priority - a.priority);
      visibleItems.sort((a, b) => b.priority - a.priority);

      return {
        groups: visibleGroups,
        items: visibleItems,
        visibilityStates,
        totalItems: this.items.size,
        hiddenItems
      };

    } catch (error) {
      throw new MenuOrganizationError(
        'CONTEXT_RULE_ERROR',
        `Failed to get menu structure: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Validate menu organization
   */
  validateOrganization(): MenuValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const groupErrors: Record<string, string[]> = {};
    const itemErrors: Record<string, string[]> = {};

    // Validate groups
    for (const group of this.groups.values()) {
      const groupValidationErrors: string[] = [];

      // Check for circular dependencies
      if (group.parentId && this.wouldCreateCircularDependency(group.id, group.parentId)) {
        groupValidationErrors.push('Circular dependency detected');
      }

      // Check if parent exists
      if (group.parentId && !this.groups.has(group.parentId)) {
        groupValidationErrors.push(`Parent group '${group.parentId}' not found`);
      }

      // Check priority
      if (group.priority < 0 || group.priority > 1000) {
        groupValidationErrors.push('Priority must be between 0 and 1000');
      }

      if (groupValidationErrors.length > 0) {
        groupErrors[group.id] = groupValidationErrors;
        errors.push(...groupValidationErrors.map(e => `Group '${group.id}': ${e}`));
      }
    }

    // Validate items
    for (const item of this.items.values()) {
      const itemValidationErrors: string[] = [];

      // Check if group exists
      if (item.groupId && !this.groups.has(item.groupId)) {
        itemValidationErrors.push(`Group '${item.groupId}' not found`);
      }

      // Check priority
      if (item.priority < 0 || item.priority > 1000) {
        itemValidationErrors.push('Priority must be between 0 and 1000');
      }

      // Check i18n key
      if (!item.i18nKey) {
        itemValidationErrors.push('i18n key is required');
      }

      if (itemValidationErrors.length > 0) {
        itemErrors[item.id] = itemValidationErrors;
        errors.push(...itemValidationErrors.map(e => `Item '${item.id}': ${e}`));
      }
    }

    // Check for orphaned items
    const orphanedItems = Array.from(this.items.values())
      .filter(item => item.groupId && !this.groups.has(item.groupId));

    if (orphanedItems.length > 0) {
      warnings.push(`${orphanedItems.length} items reference non-existent groups`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      groupErrors,
      itemErrors
    };
  }

  /**
   * Apply user customizations
   */
  async applyCustomizations(customizations: MenuCustomization[]): Promise<MenuOrganizationResult> {
    try {
      this.customizations.clear();

      for (const customization of customizations) {
        this.customizations.set(customization.itemId, customization);
      }

      return this.getMenuStructure({} as MenuRenderContext);

    } catch (error) {
      throw new MenuOrganizationError(
        'INVALID_STRUCTURE',
        `Failed to apply customizations: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Reset to default organization
   */
  async resetToDefaults(): Promise<MenuOrganizationResult> {
    try {
      this.customizations.clear();
      return this.getMenuStructure({} as MenuRenderContext);

    } catch (error) {
      throw new MenuOrganizationError(
        'INVALID_STRUCTURE',
        `Failed to reset to defaults: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get menu groups
   */
  getGroups(): MenuGroup[] {
    return Array.from(this.groups.values());
  }

  /**
   * Get menu items
   */
  getItems(): OrganizedMenuItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    this.groups.clear();
    this.items.clear();
    this.customizations.clear();
    this.initialized = false;
  }

  // Private helper methods

  private validateGroup(group: MenuGroup): void {
    if (!group.id) {
      throw new Error('Group ID is required');
    }

    if (!group.name) {
      throw new Error('Group name is required');
    }

    if (group.priority < 0 || group.priority > 1000) {
      throw new Error('Group priority must be between 0 and 1000');
    }

    if (group.parentId === group.id) {
      throw new Error('Group cannot be its own parent');
    }
  }

  private validateItem(item: OrganizedMenuItem): void {
    if (!item.id) {
      throw new Error('Item ID is required');
    }

    if (!item.i18nKey) {
      throw new Error('Item i18n key is required');
    }

    if (item.priority < 0 || item.priority > 1000) {
      throw new Error('Item priority must be between 0 and 1000');
    }
  }

  private wouldCreateCircularDependency(groupId: string, parentId: string): boolean {
    const visited = new Set<string>();
    let currentId: string | undefined = parentId;

    while (currentId && !visited.has(currentId)) {
      if (currentId === groupId) {
        return true;
      }

      visited.add(currentId);
      const group = this.groups.get(currentId);
      currentId = group?.parentId;
    }

    return false;
  }

  private evaluateGroupVisibility(group: MenuGroup, context: MenuRenderContext): { visible: boolean; enabled: boolean; reason?: string } {
    // Basic visibility check
    if (!group.visible) {
      return { visible: false, enabled: false, reason: 'Group is hidden' };
    }

    if (!group.enabled) {
      return { visible: true, enabled: false, reason: 'Group is disabled' };
    }

    // Context-based visibility (can be extended with context rules)
    return { visible: true, enabled: true };
  }

  private evaluateItemVisibility(item: OrganizedMenuItem, context: MenuRenderContext): { visible: boolean; enabled: boolean; reason?: string } {
    // Check if item is customized to be hidden
    const customization = this.customizations.get(item.id);
    if (customization?.hidden) {
      return { visible: false, enabled: false, reason: 'Hidden by user customization' };
    }

    // Basic visibility check
    if (item.visible === false) {
      return { visible: false, enabled: false, reason: 'Item is hidden' };
    }

    if (item.enabled === false) {
      return { visible: true, enabled: false, reason: 'Item is disabled' };
    }

    // Context rules evaluation (can be extended)
    if (item.contextRules) {
      for (const rule of item.contextRules) {
        const ruleResult = this.evaluateContextRule(rule, context);
        if (!ruleResult.visible) {
          return ruleResult;
        }
      }
    }

    return { visible: true, enabled: true };
  }

  private evaluateContextRule(rule: any, context: MenuRenderContext): { visible: boolean; enabled: boolean; reason?: string } {
    // Basic implementation - can be extended with specific rule logic
    return { visible: true, enabled: true };
  }

  private applyItemCustomizations(item: OrganizedMenuItem): OrganizedMenuItem {
    const customization = this.customizations.get(item.id);
    if (!customization) {
      return item;
    }

    return {
      ...item,
      priority: customization.priority ?? item.priority,
      groupId: customization.groupId ?? item.groupId,
      title: customization.customName ?? item.title,
      shortcut: customization.customShortcut ?? item.shortcut
    };
  }
}

/**
 * Create a new menu organizer instance
 */
export function createMenuOrganizer(): MenuOrganizationManager {
  return new MenuOrganizer();
}