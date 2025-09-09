/**
 * Sidebar Module Exports
 * Main entry point for the TabKiller sidebar system
 */

// Core components
export { default as Sidebar } from './core/Sidebar';
export { default as SidebarHeader } from './core/SidebarHeader';
export { default as SidebarContent } from './core/SidebarContent';
export { default as SidebarFooter } from './core/SidebarFooter';
export { default as SidebarSection } from './core/SidebarSection';
export { default as SidebarBackdrop } from './core/SidebarBackdrop';
export { default as SidebarResizeHandle } from './core/SidebarResizeHandle';

// Session components
export { SessionDisplay } from './session/SessionDisplay';
export { SessionStats } from './session/SessionStats';

// Hooks
export { useSidebar } from './hooks/useSidebar';

// Types
export type {
  SidebarProps,
  SidebarHeaderProps,
  SidebarContentProps,
  SidebarFooterProps,
  SidebarConfig,
  SidebarState,
  SidebarSection,
  SidebarQuickAction,
  SessionDisplayItem,
  SessionListConfig,
  UseSidebarReturn,
  AnimationConfig,
  AnimationState,
  ResponsiveConfig,
  AccessibilityConfig
} from './types';

// Constants
export {
  DEFAULT_SIDEBAR_CONFIG,
  DEFAULT_ANIMATION_CONFIG,
  DEFAULT_RESPONSIVE_CONFIG,
  DEFAULT_ACCESSIBILITY_CONFIG,
  DEFAULT_SECTIONS,
  DEFAULT_QUICK_ACTIONS,
  KEYBOARD_SHORTCUTS,
  EVENTS,
  CSS_VARIABLES,
  MEDIA_QUERIES
} from './utils/constants';