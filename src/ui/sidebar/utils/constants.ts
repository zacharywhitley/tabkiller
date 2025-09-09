/**
 * Sidebar Constants
 * Default configuration and constants for the TabKiller sidebar system
 */

import { SidebarConfig, AnimationConfig, ResponsiveConfig, AccessibilityConfig } from '../types';

// =============================================================================
// DEFAULT SIDEBAR CONFIGURATION
// =============================================================================

export const DEFAULT_SIDEBAR_CONFIG: SidebarConfig = {
  defaultWidth: 320,
  minWidth: 240,
  maxWidth: 480,
  resizable: true,
  animationDuration: 250,
  breakpoints: {
    mobile: 768,
    tablet: 1024,
    desktop: 1200
  },
  autoCollapseMobile: true,
  persistenceKey: 'tabkiller-sidebar'
};

// =============================================================================
// ANIMATION CONFIGURATION
// =============================================================================

export const DEFAULT_ANIMATION_CONFIG: AnimationConfig = {
  expandDuration: 250,
  resizeDuration: 150,
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)', // Material Design easing
  respectReducedMotion: true,
  presets: {
    fast: 150,
    normal: 250,
    slow: 350
  }
};

// =============================================================================
// RESPONSIVE CONFIGURATION
// =============================================================================

export const DEFAULT_RESPONSIVE_CONFIG: ResponsiveConfig = {
  overlayThreshold: 768, // Switch to overlay mode below tablet
  autoCollapseThreshold: 1024, // Auto-collapse below desktop
  touchSensitivity: 0.3, // 30% of screen width to trigger swipe
  enableSwipeGestures: true
};

// =============================================================================
// ACCESSIBILITY CONFIGURATION
// =============================================================================

export const DEFAULT_ACCESSIBILITY_CONFIG: AccessibilityConfig = {
  announceStateChanges: true,
  ariaLabels: {
    sidebar: 'TabKiller Sidebar',
    toggleButton: 'Toggle sidebar',
    resizeHandle: 'Resize sidebar',
    closeButton: 'Close sidebar'
  },
  focusManagement: {
    trapFocus: true,
    restoreFocus: true,
    initialFocus: undefined
  }
};

// =============================================================================
// CSS CUSTOM PROPERTIES
// =============================================================================

export const CSS_VARIABLES = {
  // Sidebar dimensions
  '--tk-sidebar-width': 'var(--tk-sidebar-width-default, 320px)',
  '--tk-sidebar-width-collapsed': 'var(--tk-sidebar-width-collapsed-default, 60px)',
  '--tk-sidebar-min-width': 'var(--tk-sidebar-min-width-default, 240px)',
  '--tk-sidebar-max-width': 'var(--tk-sidebar-max-width-default, 480px)',
  
  // Animation durations
  '--tk-sidebar-transition-duration': 'var(--tk-sidebar-transition-duration-default, 250ms)',
  '--tk-sidebar-transition-easing': 'var(--tk-sidebar-transition-easing-default, cubic-bezier(0.4, 0, 0.2, 1))',
  
  // Z-index layers
  '--tk-sidebar-z-index': 'var(--tk-sidebar-z-index-default, 1000)',
  '--tk-sidebar-overlay-z-index': 'var(--tk-sidebar-overlay-z-index-default, 999)',
  '--tk-sidebar-backdrop-z-index': 'var(--tk-sidebar-backdrop-z-index-default, 998)',
  
  // Colors and theming
  '--tk-sidebar-bg': 'var(--tk-bg-secondary)',
  '--tk-sidebar-border': 'var(--tk-border-color)',
  '--tk-sidebar-header-bg': 'var(--tk-bg-primary)',
  '--tk-sidebar-footer-bg': 'var(--tk-bg-tertiary)',
  
  // Shadows
  '--tk-sidebar-shadow': 'var(--tk-shadow-lg)',
  '--tk-sidebar-overlay-shadow': 'var(--tk-shadow-xl)',
  
  // Borders
  '--tk-sidebar-border-width': '1px',
  '--tk-sidebar-border-radius': 'var(--tk-border-radius)',
  
  // Spacing
  '--tk-sidebar-padding': 'var(--tk-spacing-md)',
  '--tk-sidebar-gap': 'var(--tk-spacing-sm)',
  
  // Typography
  '--tk-sidebar-font-size': 'var(--tk-font-size-sm)',
  '--tk-sidebar-line-height': 'var(--tk-line-height-normal)',
  
  // Interactive elements
  '--tk-sidebar-item-padding': 'var(--tk-spacing-sm) var(--tk-spacing-md)',
  '--tk-sidebar-item-border-radius': 'var(--tk-border-radius-sm)',
  '--tk-sidebar-item-hover-bg': 'var(--tk-bg-tertiary)',
  '--tk-sidebar-item-active-bg': 'var(--tk-accent-color)',
  '--tk-sidebar-item-active-color': '#ffffff'
} as const;

// =============================================================================
// BREAKPOINT QUERIES
// =============================================================================

export const MEDIA_QUERIES = {
  mobile: `(max-width: ${DEFAULT_SIDEBAR_CONFIG.breakpoints.mobile - 1}px)`,
  tablet: `(min-width: ${DEFAULT_SIDEBAR_CONFIG.breakpoints.mobile}px) and (max-width: ${DEFAULT_SIDEBAR_CONFIG.breakpoints.tablet - 1}px)`,
  desktop: `(min-width: ${DEFAULT_SIDEBAR_CONFIG.breakpoints.desktop}px)`,
  tabletAndAbove: `(min-width: ${DEFAULT_SIDEBAR_CONFIG.breakpoints.mobile}px)`,
  desktopAndAbove: `(min-width: ${DEFAULT_SIDEBAR_CONFIG.breakpoints.tablet}px)`,
  reducedMotion: '(prefers-reduced-motion: reduce)',
  highContrast: '(prefers-contrast: high)',
  darkMode: '(prefers-color-scheme: dark)'
} as const;

// =============================================================================
// KEYBOARD SHORTCUTS
// =============================================================================

export const KEYBOARD_SHORTCUTS = {
  TOGGLE_SIDEBAR: 'Ctrl+Shift+S',
  CLOSE_SIDEBAR: 'Escape',
  NAVIGATE_UP: 'ArrowUp',
  NAVIGATE_DOWN: 'ArrowDown',
  SELECT_ITEM: 'Enter',
  ACTIVATE_ITEM: 'Space'
} as const;

// =============================================================================
// SIDEBAR SECTIONS
// =============================================================================

export const DEFAULT_SECTIONS = [
  {
    id: 'current-session',
    title: 'Current Session',
    icon: '📊',
    collapsible: false,
    collapsed: false,
    order: 1,
    visible: true
  },
  {
    id: 'recent-sessions',
    title: 'Recent Sessions',
    icon: '🕒',
    collapsible: true,
    collapsed: false,
    order: 2,
    visible: true
  },
  {
    id: 'session-stats',
    title: 'Statistics',
    icon: '📈',
    collapsible: true,
    collapsed: true,
    order: 3,
    visible: true
  },
  {
    id: 'quick-actions',
    title: 'Quick Actions',
    icon: '⚡',
    collapsible: false,
    collapsed: false,
    order: 4,
    visible: true
  }
] as const;

// =============================================================================
// QUICK ACTIONS
// =============================================================================

export const DEFAULT_QUICK_ACTIONS = [
  {
    id: 'new-session',
    label: 'New Session',
    icon: '➕',
    shortcut: 'Ctrl+N',
    order: 1
  },
  {
    id: 'save-session',
    label: 'Save Session',
    icon: '💾',
    shortcut: 'Ctrl+S',
    order: 2
  },
  {
    id: 'export-session',
    label: 'Export',
    icon: '📤',
    shortcut: 'Ctrl+E',
    order: 3
  },
  {
    id: 'view-history',
    label: 'History',
    icon: '📚',
    shortcut: 'Ctrl+H',
    order: 4
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: '⚙️',
    shortcut: 'Ctrl+,',
    order: 5
  }
] as const;

// =============================================================================
// SESSION LIST CONFIGURATION
// =============================================================================

export const DEFAULT_SESSION_LIST_CONFIG = {
  maxItems: 10,
  showPreviews: true,
  showStats: true,
  groupBy: 'none' as const,
  sortBy: 'recent' as const,
  sortOrder: 'desc' as const
};

// =============================================================================
// PERFORMANCE CONSTANTS
// =============================================================================

export const PERFORMANCE = {
  // Debounce delays
  RESIZE_DEBOUNCE_MS: 16, // ~60fps
  SEARCH_DEBOUNCE_MS: 300,
  PERSIST_DEBOUNCE_MS: 1000,
  
  // Thresholds
  MAX_RENDER_TIME_MS: 5,
  VIRTUAL_SCROLL_THRESHOLD: 50,
  ANIMATION_FRAME_BUDGET_MS: 16,
  
  // Batch sizes
  SESSION_BATCH_SIZE: 20,
  UPDATE_BATCH_SIZE: 10
} as const;

// =============================================================================
// ERROR MESSAGES
// =============================================================================

export const ERROR_MESSAGES = {
  SIDEBAR_NOT_INITIALIZED: 'Sidebar not properly initialized',
  INVALID_WIDTH: 'Invalid sidebar width provided',
  RESIZE_FAILED: 'Failed to resize sidebar',
  PERSIST_FAILED: 'Failed to persist sidebar state',
  ANIMATION_FAILED: 'Sidebar animation failed to complete',
  TOUCH_GESTURE_FAILED: 'Touch gesture handling failed'
} as const;

// =============================================================================
// EVENT NAMES
// =============================================================================

export const EVENTS = {
  SIDEBAR_TOGGLE: 'sidebar:toggle',
  SIDEBAR_OPEN: 'sidebar:open',
  SIDEBAR_CLOSE: 'sidebar:close',
  SIDEBAR_RESIZE: 'sidebar:resize',
  SIDEBAR_SECTION_TOGGLE: 'sidebar:section:toggle',
  SIDEBAR_ACTION_TRIGGER: 'sidebar:action:trigger',
  SIDEBAR_STATE_CHANGE: 'sidebar:state:change'
} as const;

// =============================================================================
// STORAGE KEYS
// =============================================================================

export const STORAGE_KEYS = {
  SIDEBAR_STATE: 'tabkiller:sidebar:state',
  SIDEBAR_CONFIG: 'tabkiller:sidebar:config',
  SIDEBAR_SECTIONS: 'tabkiller:sidebar:sections',
  SIDEBAR_WIDTH: 'tabkiller:sidebar:width',
  SIDEBAR_COLLAPSED: 'tabkiller:sidebar:collapsed'
} as const;