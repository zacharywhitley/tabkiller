/**
 * Default Menu Structure and Organization
 * Provides default configurations for context menu organization
 */

import {
  MenuGroup,
  OrganizedMenuItem,
  MenuOrganizationConfig,
  ContextRule,
  MenuStructureConfig
} from './types';
import { KeyCombination } from '../shortcuts/types';

/**
 * Default menu structure configuration
 */
export const DEFAULT_STRUCTURE_CONFIG: MenuStructureConfig = {
  maxDepth: 3,
  maxItemsPerGroup: 10,
  enableSubmenus: true,
  showIcons: true,
  showShortcuts: true,
  compactMode: false,
  groupSeparators: true
};

/**
 * Default menu groups
 */
export const DEFAULT_MENU_GROUPS: MenuGroup[] = [
  // Top-level groups
  {
    id: 'navigation',
    name: 'Navigation',
    description: 'Navigation and access to main features',
    priority: 1000,
    icon: '🧭',
    enabled: true,
    visible: true,
    contexts: ['page', 'selection', 'link']
  },
  {
    id: 'tabs',
    name: 'Tab Management',
    description: 'Tab-related actions and management',
    priority: 900,
    icon: '📑',
    enabled: true,
    visible: true,
    contexts: ['page', 'all']
  },
  {
    id: 'sessions',
    name: 'Session Management',
    description: 'Browsing session tracking and management',
    priority: 800,
    icon: '📊',
    enabled: true,
    visible: true,
    contexts: ['page', 'all']
  },
  {
    id: 'bookmarks',
    name: 'Bookmarks',
    description: 'Bookmark management and organization',
    priority: 700,
    icon: '🔖',
    enabled: true,
    visible: true,
    contexts: ['page', 'link']
  },
  {
    id: 'settings',
    name: 'Settings',
    description: 'Extension settings and configuration',
    priority: 600,
    icon: '⚙️',
    enabled: true,
    visible: true,
    contexts: ['all']
  },
  {
    id: 'tools',
    name: 'Tools',
    description: 'Additional tools and utilities',
    priority: 500,
    icon: '🔧',
    enabled: true,
    visible: true,
    contexts: ['all']
  },
  {
    id: 'help',
    name: 'Help',
    description: 'Help and documentation',
    priority: 100,
    icon: '❓',
    enabled: true,
    visible: true,
    contexts: ['all']
  },

  // Sub-groups
  {
    id: 'tab-actions',
    name: 'Tab Actions',
    description: 'Individual tab actions',
    priority: 950,
    enabled: true,
    visible: true,
    parentId: 'tabs',
    contexts: ['page']
  },
  {
    id: 'tab-organization',
    name: 'Tab Organization',
    description: 'Tab organization and grouping',
    priority: 940,
    enabled: true,
    visible: true,
    parentId: 'tabs',
    contexts: ['page']
  },
  {
    id: 'session-actions',
    name: 'Session Actions',
    description: 'Session control actions',
    priority: 850,
    enabled: true,
    visible: true,
    parentId: 'sessions',
    contexts: ['page']
  },
  {
    id: 'bookmark-actions',
    name: 'Bookmark Actions',
    description: 'Bookmark creation and management',
    priority: 750,
    enabled: true,
    visible: true,
    parentId: 'bookmarks',
    contexts: ['page', 'link']
  }
];

/**
 * Context rules for dynamic menu behavior
 */
export const COMMON_CONTEXT_RULES: Record<string, ContextRule[]> = {
  // Show only on web pages
  webPageOnly: [
    {
      type: 'page_type',
      condition: 'show_when',
      value: 'web',
      operator: 'equals'
    }
  ],

  // Show when text is selected
  withSelection: [
    {
      type: 'selection_exists',
      condition: 'show_when',
      operator: 'exists'
    }
  ],

  // Hide in extension pages
  hideInExtension: [
    {
      type: 'extension_context',
      condition: 'hide_when',
      operator: 'exists'
    }
  ],

  // Show only when feature is enabled
  sessionFeatureEnabled: [
    {
      type: 'user_setting',
      condition: 'show_when',
      value: 'features.sessions.enabled',
      operator: 'equals'
    }
  ],

  // Show when there are multiple tabs
  multipleTabs: [
    {
      type: 'tab_count',
      condition: 'show_when',
      value: 2,
      operator: 'equals'
    }
  ]
};

/**
 * Default keyboard shortcuts
 */
export const DEFAULT_SHORTCUTS: Record<string, KeyCombination> = {
  'open-popup': { key: 'k', modifiers: ['ctrl', 'shift'] },
  'show-history': { key: 'h', modifiers: ['ctrl', 'shift'] },
  'show-sessions': { key: 's', modifiers: ['ctrl', 'shift'] },
  'capture-tabs': { key: 'c', modifiers: ['ctrl', 'shift'] },
  'start-session': { key: 'n', modifiers: ['ctrl', 'shift'] },
  'end-session': { key: 'e', modifiers: ['ctrl', 'shift'] },
  'bookmark-page': { key: 'd', modifiers: ['ctrl', 'shift'] },
  'open-settings': { key: ',', modifiers: ['ctrl', 'shift'] },
  'search-history': { key: 'f', modifiers: ['ctrl', 'shift'] }
};

/**
 * Default menu items
 */
export const DEFAULT_MENU_ITEMS: OrganizedMenuItem[] = [
  // Navigation items
  {
    id: 'open-popup',
    i18nKey: 'menu.items.open-popup',
    title: 'Open TabKiller',
    groupId: 'navigation',
    category: 'navigation',
    priority: 1000,
    tags: ['popup', 'main', 'interface'],
    shortcut: DEFAULT_SHORTCUTS['open-popup'],
    enabled: true,
    visible: true,
    contexts: ['all']
  },
  {
    id: 'show-history',
    i18nKey: 'menu.items.show-history',
    title: 'Show History',
    groupId: 'navigation',
    category: 'navigation',
    priority: 990,
    tags: ['history', 'browse'],
    shortcut: DEFAULT_SHORTCUTS['show-history'],
    enabled: true,
    visible: true,
    contexts: ['all']
  },
  {
    id: 'show-sessions',
    i18nKey: 'menu.items.show-sessions',
    title: 'Show Sessions',
    groupId: 'navigation',
    category: 'navigation',
    priority: 980,
    tags: ['sessions', 'browse'],
    shortcut: DEFAULT_SHORTCUTS['show-sessions'],
    enabled: true,
    visible: true,
    contexts: ['all'],
    contextRules: COMMON_CONTEXT_RULES.sessionFeatureEnabled
  },
  {
    id: 'show-bookmarks',
    i18nKey: 'menu.items.show-bookmarks',
    title: 'Show Bookmarks',
    groupId: 'navigation',
    category: 'bookmarks',
    priority: 970,
    tags: ['bookmarks', 'browse'],
    enabled: true,
    visible: true,
    contexts: ['all']
  },

  // Tab management items
  {
    id: 'capture-tabs',
    i18nKey: 'menu.items.capture-tabs',
    title: 'Capture All Tabs',
    groupId: 'tab-actions',
    category: 'tabs',
    priority: 950,
    tags: ['capture', 'save', 'tabs'],
    shortcut: DEFAULT_SHORTCUTS['capture-tabs'],
    enabled: true,
    visible: true,
    contexts: ['page'],
    contextRules: [...COMMON_CONTEXT_RULES.webPageOnly, ...COMMON_CONTEXT_RULES.multipleTabs]
  },
  {
    id: 'save-tab',
    i18nKey: 'menu.items.save-tab',
    title: 'Save This Tab',
    groupId: 'tab-actions',
    category: 'tabs',
    priority: 940,
    tags: ['save', 'tab'],
    enabled: true,
    visible: true,
    contexts: ['page'],
    contextRules: COMMON_CONTEXT_RULES.webPageOnly
  },
  {
    id: 'close-tab',
    i18nKey: 'menu.items.close-tab',
    title: 'Close Tab',
    groupId: 'tab-actions',
    category: 'tabs',
    priority: 930,
    tags: ['close', 'tab'],
    enabled: true,
    visible: true,
    contexts: ['page']
  },
  {
    id: 'duplicate-tab',
    i18nKey: 'menu.items.duplicate-tab',
    title: 'Duplicate Tab',
    groupId: 'tab-actions',
    category: 'tabs',
    priority: 920,
    tags: ['duplicate', 'tab'],
    enabled: true,
    visible: true,
    contexts: ['page'],
    contextRules: COMMON_CONTEXT_RULES.webPageOnly
  },
  {
    id: 'pin-tab',
    i18nKey: 'menu.items.pin-tab',
    title: 'Pin Tab',
    groupId: 'tab-organization',
    category: 'tabs',
    priority: 910,
    tags: ['pin', 'organize'],
    enabled: true,
    visible: true,
    contexts: ['page']
  },
  {
    id: 'move-tab-to-window',
    i18nKey: 'menu.items.move-tab-to-window',
    title: 'Move to New Window',
    groupId: 'tab-organization',
    category: 'tabs',
    priority: 900,
    tags: ['move', 'window', 'organize'],
    enabled: true,
    visible: true,
    contexts: ['page']
  },

  // Session management items
  {
    id: 'start-session',
    i18nKey: 'menu.items.start-session',
    title: 'Start New Session',
    groupId: 'session-actions',
    category: 'sessions',
    priority: 850,
    tags: ['start', 'session', 'tracking'],
    shortcut: DEFAULT_SHORTCUTS['start-session'],
    enabled: true,
    visible: true,
    contexts: ['page'],
    contextRules: COMMON_CONTEXT_RULES.sessionFeatureEnabled
  },
  {
    id: 'end-session',
    i18nKey: 'menu.items.end-session',
    title: 'End Current Session',
    groupId: 'session-actions',
    category: 'sessions',
    priority: 840,
    tags: ['end', 'session', 'tracking'],
    shortcut: DEFAULT_SHORTCUTS['end-session'],
    enabled: true,
    visible: true,
    contexts: ['page'],
    contextRules: COMMON_CONTEXT_RULES.sessionFeatureEnabled
  },
  {
    id: 'tag-session',
    i18nKey: 'menu.items.tag-session',
    title: 'Tag Session',
    groupId: 'session-actions',
    category: 'sessions',
    priority: 830,
    tags: ['tag', 'session', 'organize'],
    enabled: true,
    visible: true,
    contexts: ['page'],
    contextRules: COMMON_CONTEXT_RULES.sessionFeatureEnabled
  },
  {
    id: 'save-session',
    i18nKey: 'menu.items.save-session',
    title: 'Save Session',
    groupId: 'session-actions',
    category: 'sessions',
    priority: 820,
    tags: ['save', 'session'],
    enabled: true,
    visible: true,
    contexts: ['page'],
    contextRules: COMMON_CONTEXT_RULES.sessionFeatureEnabled
  },

  // Bookmark items
  {
    id: 'bookmark-page',
    i18nKey: 'menu.items.bookmark-page',
    title: 'Bookmark This Page',
    groupId: 'bookmark-actions',
    category: 'bookmarks',
    priority: 750,
    tags: ['bookmark', 'save'],
    shortcut: DEFAULT_SHORTCUTS['bookmark-page'],
    enabled: true,
    visible: true,
    contexts: ['page'],
    contextRules: COMMON_CONTEXT_RULES.webPageOnly
  },
  {
    id: 'bookmark-tabs',
    i18nKey: 'menu.items.bookmark-tabs',
    title: 'Bookmark All Tabs',
    groupId: 'bookmark-actions',
    category: 'bookmarks',
    priority: 740,
    tags: ['bookmark', 'save', 'tabs'],
    enabled: true,
    visible: true,
    contexts: ['page'],
    contextRules: [...COMMON_CONTEXT_RULES.webPageOnly, ...COMMON_CONTEXT_RULES.multipleTabs]
  },
  {
    id: 'organize-bookmarks',
    i18nKey: 'menu.items.organize-bookmarks',
    title: 'Organize Bookmarks',
    groupId: 'bookmark-actions',
    category: 'bookmarks',
    priority: 730,
    tags: ['organize', 'bookmarks'],
    enabled: true,
    visible: true,
    contexts: ['all']
  },

  // Settings items
  {
    id: 'open-settings',
    i18nKey: 'menu.items.open-settings',
    title: 'Open Settings',
    groupId: 'settings',
    category: 'settings',
    priority: 600,
    tags: ['settings', 'configuration'],
    shortcut: DEFAULT_SHORTCUTS['open-settings'],
    enabled: true,
    visible: true,
    contexts: ['all']
  },
  {
    id: 'keyboard-shortcuts',
    i18nKey: 'menu.items.keyboard-shortcuts',
    title: 'Keyboard Shortcuts',
    groupId: 'settings',
    category: 'settings',
    priority: 590,
    tags: ['shortcuts', 'keyboard'],
    enabled: true,
    visible: true,
    contexts: ['all']
  },

  // Tools items
  {
    id: 'search-history',
    i18nKey: 'menu.items.search-history',
    title: 'Search History',
    groupId: 'tools',
    category: 'tools',
    priority: 500,
    tags: ['search', 'history'],
    shortcut: DEFAULT_SHORTCUTS['search-history'],
    enabled: true,
    visible: true,
    contexts: ['all']
  },
  {
    id: 'export-data',
    i18nKey: 'menu.items.export-data',
    title: 'Export Data',
    groupId: 'tools',
    category: 'tools',
    priority: 490,
    tags: ['export', 'data', 'backup'],
    enabled: true,
    visible: true,
    contexts: ['all']
  },
  {
    id: 'import-data',
    i18nKey: 'menu.items.import-data',
    title: 'Import Data',
    groupId: 'tools',
    category: 'tools',
    priority: 480,
    tags: ['import', 'data', 'restore'],
    enabled: true,
    visible: true,
    contexts: ['all']
  },
  {
    id: 'clean-storage',
    i18nKey: 'menu.items.clean-storage',
    title: 'Clean Storage',
    groupId: 'tools',
    category: 'tools',
    priority: 470,
    tags: ['clean', 'storage', 'maintenance'],
    enabled: true,
    visible: true,
    contexts: ['all']
  },

  // Help items
  {
    id: 'user-guide',
    i18nKey: 'menu.items.user-guide',
    title: 'User Guide',
    groupId: 'help',
    category: 'help',
    priority: 100,
    tags: ['help', 'guide', 'documentation'],
    enabled: true,
    visible: true,
    contexts: ['all']
  },
  {
    id: 'report-issue',
    i18nKey: 'menu.items.report-issue',
    title: 'Report Issue',
    groupId: 'help',
    category: 'help',
    priority: 90,
    tags: ['report', 'bug', 'issue'],
    enabled: true,
    visible: true,
    contexts: ['all']
  },
  {
    id: 'about',
    i18nKey: 'menu.items.about',
    title: 'About TabKiller',
    groupId: 'help',
    category: 'help',
    priority: 80,
    tags: ['about', 'info'],
    enabled: true,
    visible: true,
    contexts: ['all']
  }
];

/**
 * Default menu organization configuration
 */
export const DEFAULT_MENU_ORGANIZATION_CONFIG: MenuOrganizationConfig = {
  structure: DEFAULT_STRUCTURE_CONFIG,
  groups: DEFAULT_MENU_GROUPS,
  items: DEFAULT_MENU_ITEMS,
  customizations: [],
  i18nNamespace: 'menu'
};

/**
 * Context-specific menu configurations
 */
export const CONTEXT_SPECIFIC_CONFIGS: Record<string, Partial<MenuOrganizationConfig>> = {
  // Minimal config for extension pages
  extension: {
    structure: {
      ...DEFAULT_STRUCTURE_CONFIG,
      compactMode: true,
      maxItemsPerGroup: 5
    },
    items: DEFAULT_MENU_ITEMS.filter(item => 
      ['open-popup', 'show-history', 'open-settings', 'user-guide'].includes(item.id)
    )
  },

  // Selection-focused config
  selection: {
    items: DEFAULT_MENU_ITEMS.filter(item =>
      item.contextRules?.some(rule => rule.type === 'selection_exists') ||
      ['open-popup', 'search-history'].includes(item.id)
    )
  },

  // Link-focused config
  link: {
    items: DEFAULT_MENU_ITEMS.filter(item =>
      item.contexts?.includes('link') ||
      ['bookmark-page', 'open-popup'].includes(item.id)
    )
  }
};

/**
 * Get default configuration for a specific context
 */
export function getDefaultConfigForContext(context: string): MenuOrganizationConfig {
  const baseConfig = DEFAULT_MENU_ORGANIZATION_CONFIG;
  const contextConfig = CONTEXT_SPECIFIC_CONFIGS[context];

  if (!contextConfig) {
    return baseConfig;
  }

  return {
    structure: { ...baseConfig.structure, ...contextConfig.structure },
    groups: contextConfig.groups || baseConfig.groups,
    items: contextConfig.items || baseConfig.items,
    customizations: contextConfig.customizations || baseConfig.customizations,
    i18nNamespace: contextConfig.i18nNamespace || baseConfig.i18nNamespace
  };
}

/**
 * Create a minimal menu configuration
 */
export function createMinimalMenuConfig(): MenuOrganizationConfig {
  const essentialItems = DEFAULT_MENU_ITEMS.filter(item =>
    ['open-popup', 'capture-tabs', 'bookmark-page', 'open-settings'].includes(item.id)
  );

  const essentialGroups = DEFAULT_MENU_GROUPS.filter(group =>
    essentialItems.some(item => item.groupId === group.id)
  );

  return {
    structure: {
      ...DEFAULT_STRUCTURE_CONFIG,
      compactMode: true,
      maxItemsPerGroup: 5,
      enableSubmenus: false
    },
    groups: essentialGroups,
    items: essentialItems,
    customizations: [],
    i18nNamespace: 'menu'
  };
}

/**
 * Create a power user menu configuration
 */
export function createPowerUserMenuConfig(): MenuOrganizationConfig {
  return {
    structure: {
      ...DEFAULT_STRUCTURE_CONFIG,
      maxDepth: 4,
      maxItemsPerGroup: 15,
      showShortcuts: true,
      compactMode: false
    },
    groups: DEFAULT_MENU_GROUPS,
    items: DEFAULT_MENU_ITEMS,
    customizations: [],
    i18nNamespace: 'menu'
  };
}