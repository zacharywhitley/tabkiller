/**
 * Sidebar Types
 * TypeScript definitions for the TabKiller sidebar system
 */

import { Session, SessionStats } from '../../../contexts/types';

// =============================================================================
// SIDEBAR CONFIGURATION
// =============================================================================

export interface SidebarConfig {
  /** Default width of the sidebar when expanded */
  defaultWidth: number;
  /** Minimum width of the sidebar when expanded */
  minWidth: number;
  /** Maximum width of the sidebar when expanded */
  maxWidth: number;
  /** Whether the sidebar should be resizable */
  resizable: boolean;
  /** Animation duration in milliseconds */
  animationDuration: number;
  /** Breakpoints for responsive behavior */
  breakpoints: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
  /** Whether to auto-collapse on mobile */
  autoCollapseMobile: boolean;
  /** Persistence key for localStorage */
  persistenceKey: string;
}

// =============================================================================
// SIDEBAR STATE
// =============================================================================

export interface SidebarState {
  /** Whether the sidebar is currently open */
  isOpen: boolean;
  /** Whether the sidebar is currently collapsed */
  isCollapsed: boolean;
  /** Current width of the sidebar in pixels */
  width: number;
  /** Current screen size category */
  screenSize: 'mobile' | 'tablet' | 'desktop';
  /** Whether the sidebar is being dragged for resize */
  isResizing: boolean;
  /** Whether the sidebar is currently animating */
  isAnimating: boolean;
  /** Whether sidebar should be overlay on mobile */
  isOverlay: boolean;
  /** Last update timestamp */
  lastUpdated: number;
}

// =============================================================================
// SIDEBAR CONTENT
// =============================================================================

export interface SidebarSection {
  /** Unique identifier for the section */
  id: string;
  /** Display title for the section */
  title: string;
  /** Icon to display with the section */
  icon?: string;
  /** Whether the section is collapsible */
  collapsible: boolean;
  /** Whether the section is currently collapsed */
  collapsed: boolean;
  /** Order in which to display the section */
  order: number;
  /** Whether the section is visible */
  visible: boolean;
}

export interface SidebarQuickAction {
  /** Unique identifier for the action */
  id: string;
  /** Display label for the action */
  label: string;
  /** Icon to display with the action */
  icon: string;
  /** Keyboard shortcut for the action */
  shortcut?: string;
  /** Function to execute when action is triggered */
  action: () => void | Promise<void>;
  /** Whether the action is currently disabled */
  disabled?: boolean;
  /** Whether the action is currently loading */
  loading?: boolean;
  /** Order in which to display the action */
  order: number;
}

// =============================================================================
// SESSION DISPLAY
// =============================================================================

export interface SessionDisplayItem {
  /** The session being displayed */
  session: Session;
  /** Whether this session is currently selected */
  selected: boolean;
  /** Whether this session is currently highlighted */
  highlighted: boolean;
  /** Additional display metadata */
  displayMeta: {
    /** Formatted duration string */
    formattedDuration: string;
    /** Formatted page count */
    formattedPageCount: string;
    /** Domain summary */
    domainSummary: string;
    /** Tag colors for display */
    tagColors: string[];
  };
}

export interface SessionListConfig {
  /** Maximum number of sessions to display */
  maxItems: number;
  /** Whether to show session previews */
  showPreviews: boolean;
  /** Whether to show session statistics */
  showStats: boolean;
  /** Grouping strategy for sessions */
  groupBy: 'none' | 'date' | 'tag' | 'domain';
  /** Sorting strategy for sessions */
  sortBy: 'recent' | 'duration' | 'pageCount' | 'alphabetical';
  /** Sort order */
  sortOrder: 'asc' | 'desc';
}

// =============================================================================
// RESPONSIVE BEHAVIOR
// =============================================================================

export interface ResponsiveConfig {
  /** Screen size at which sidebar becomes overlay */
  overlayThreshold: number;
  /** Screen size at which sidebar auto-collapses */
  autoCollapseThreshold: number;
  /** Touch gesture sensitivity */
  touchSensitivity: number;
  /** Whether to enable swipe gestures */
  enableSwipeGestures: boolean;
}

export interface TouchGesture {
  /** Type of gesture */
  type: 'swipe' | 'tap' | 'pinch';
  /** Direction of gesture */
  direction?: 'left' | 'right' | 'up' | 'down';
  /** Starting position */
  startPosition: { x: number; y: number };
  /** Current position */
  currentPosition: { x: number; y: number };
  /** Velocity of gesture */
  velocity: number;
  /** Distance traveled */
  distance: number;
  /** Whether gesture is complete */
  completed: boolean;
}

// =============================================================================
// ANIMATION SYSTEM
// =============================================================================

export interface AnimationConfig {
  /** Duration of expand/collapse animation */
  expandDuration: number;
  /** Duration of resize animation */
  resizeDuration: number;
  /** Easing function for animations */
  easing: string;
  /** Whether to respect user's reduced motion preference */
  respectReducedMotion: boolean;
  /** Custom animation presets */
  presets: {
    fast: number;
    normal: number;
    slow: number;
  };
}

export interface AnimationState {
  /** Whether any animation is currently running */
  isAnimating: boolean;
  /** Type of animation currently running */
  animationType: 'expand' | 'collapse' | 'resize' | 'slide' | null;
  /** Start time of current animation */
  startTime: number;
  /** Duration of current animation */
  duration: number;
  /** Progress of current animation (0-1) */
  progress: number;
}

// =============================================================================
// ACCESSIBILITY
// =============================================================================

export interface AccessibilityConfig {
  /** Whether to announce state changes to screen readers */
  announceStateChanges: boolean;
  /** Custom ARIA labels */
  ariaLabels: {
    sidebar: string;
    toggleButton: string;
    resizeHandle: string;
    closeButton: string;
  };
  /** Focus management settings */
  focusManagement: {
    /** Whether to trap focus within sidebar when open */
    trapFocus: boolean;
    /** Whether to restore focus when sidebar closes */
    restoreFocus: boolean;
    /** Element to focus when sidebar opens */
    initialFocus?: string;
  };
}

// =============================================================================
// HOOKS INTERFACES
// =============================================================================

export interface UseSidebarReturn {
  /** Current sidebar state */
  state: SidebarState;
  /** Actions for controlling the sidebar */
  actions: {
    toggle: () => void;
    open: () => void;
    close: () => void;
    collapse: () => void;
    expand: () => void;
    setWidth: (width: number) => void;
    resetWidth: () => void;
  };
  /** Configuration settings */
  config: SidebarConfig;
  /** Responsive utilities */
  responsive: {
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
    shouldOverlay: boolean;
    shouldAutoCollapse: boolean;
  };
  /** Animation utilities */
  animation: {
    isAnimating: boolean;
    progress: number;
    duration: number;
  };
}

export interface UseSessionDisplayReturn {
  /** Formatted session display items */
  sessions: SessionDisplayItem[];
  /** Current display configuration */
  config: SessionListConfig;
  /** Actions for managing session display */
  actions: {
    selectSession: (sessionId: string) => void;
    highlightSession: (sessionId: string | null) => void;
    updateConfig: (config: Partial<SessionListConfig>) => void;
    refreshSessions: () => void;
  };
  /** Display statistics */
  stats: {
    totalSessions: number;
    visibleSessions: number;
    filteredSessions: number;
  };
}

// =============================================================================
// COMPONENT PROPS
// =============================================================================

export interface SidebarProps {
  /** Custom className for the sidebar container */
  className?: string;
  /** Custom configuration overrides */
  config?: Partial<SidebarConfig>;
  /** Sections to display in the sidebar */
  sections?: SidebarSection[];
  /** Quick actions to display */
  quickActions?: SidebarQuickAction[];
  /** Whether to show session display */
  showSessions?: boolean;
  /** Custom session display configuration */
  sessionConfig?: Partial<SessionListConfig>;
  /** Event handlers */
  onToggle?: (isOpen: boolean) => void;
  onResize?: (width: number) => void;
  onSectionToggle?: (sectionId: string, collapsed: boolean) => void;
  /** Children to render inside the sidebar */
  children?: React.ReactNode;
}

export interface SidebarHeaderProps {
  /** Whether to show the close button */
  showCloseButton?: boolean;
  /** Custom title */
  title?: string;
  /** Custom actions to display in header */
  actions?: SidebarQuickAction[];
  /** Event handlers */
  onClose?: () => void;
}

export interface SidebarContentProps {
  /** Sections to display */
  sections: SidebarSection[];
  /** Current session to highlight */
  currentSession?: Session | null;
  /** Session statistics to display */
  sessionStats?: SessionStats;
  /** Event handlers */
  onSectionToggle?: (sectionId: string, collapsed: boolean) => void;
}

export interface SidebarFooterProps {
  /** Quick actions to display */
  quickActions: SidebarQuickAction[];
  /** Whether to show expanded action labels */
  showLabels?: boolean;
  /** Maximum number of actions to display */
  maxActions?: number;
}

// =============================================================================
// EXPORT TYPES
// =============================================================================

export type {
  SidebarConfig,
  SidebarState,
  SidebarSection,
  SidebarQuickAction,
  SessionDisplayItem,
  SessionListConfig,
  ResponsiveConfig,
  TouchGesture,
  AnimationConfig,
  AnimationState,
  AccessibilityConfig,
  UseSidebarReturn,
  UseSessionDisplayReturn,
  SidebarProps,
  SidebarHeaderProps,
  SidebarContentProps,
  SidebarFooterProps
};