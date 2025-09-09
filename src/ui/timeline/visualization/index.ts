/**
 * Timeline Visualization Module
 * Git-style timeline visualization with session grouping and virtual scrolling
 */

// Main Components
export { TimelineVisualization } from './components/TimelineVisualization';
export { TimelineItem } from './components/TimelineItem';
export { SessionGroup } from './components/SessionGroup';
export { SessionMetadataPanel } from './components/SessionMetadataPanel';
export { BranchingVisualization } from './components/BranchingVisualization';
export { SessionBranchingView } from './components/SessionBranchingView';
export { ConnectionLines } from './components/ConnectionLines';
export { TimelineControls } from './components/TimelineControls';

// Hooks
export { useTimelineSelection } from './hooks/useTimelineSelection';
export { useTimelineKeyboard } from './hooks/useTimelineKeyboard';

// Types
export type {
  // Core visualization types
  TimelineVisualizationProps,
  TimelineVisualizationData,
  TimelineVisualizationItem,
  
  // Position and layout types
  ItemPosition,
  ItemRelationships,
  ItemStyling,
  SessionContext,
  
  // Session grouping types
  TimelineSession,
  SessionMetadata,
  SessionVisual,
  SessionBranch,
  SessionMerge,
  SessionGrouping,
  SessionSummary,
  SessionStats,
  
  // Interaction types
  TimelineInteraction,
  TimelineInteractionType,
  TimelineSelectionState,
  SelectionMode,
  
  // Rendering types
  TimelineRenderConfig,
  AnimationConfig,
  TimelineColorScheme,
  
  // Zoom and view types
  TimelineZoomLevel,
  TimelineViewMode,
  TimeRange,
  
  // Connection types
  ConnectionType,
  
  // Accessibility types
  TimelineAccessibility,
  AccessibilityAnnouncement,
  KeyboardNavigationState,
  KeyboardShortcut,
  FocusManagement,
  
  // Timeline metadata
  TimelineMetadata
} from './types/timeline';

// Utilities
export {
  convertToTimelineSession,
  convertToVisualizationItem,
  detectItemRelationships,
  calculateItemPosition,
  generateSessionVisual,
  generateSessionSummary,
  getItemColor,
  getItemIcon,
  getItemSize,
  generateSessionColor,
  getSessionIcon,
  calculateSessionStats,
  calculateOptimalZoomLevel,
  formatTimestamp,
  calculateTimeBuckets
} from './utils/timelineUtils';

// Constants
export const TIMELINE_VISUALIZATION_CONSTANTS = {
  // Default dimensions
  DEFAULT_ITEM_HEIGHT: 60,
  DEFAULT_LANE_WIDTH: 60,
  DEFAULT_SESSION_HEADER_HEIGHT: 80,
  
  // Layout constants
  MAX_LANES: 8,
  MIN_ITEM_SPACING: 8,
  BRANCH_CURVE_RADIUS: 12,
  CONNECTION_LINE_WIDTH: 2,
  
  // Animation durations
  DEFAULT_ANIMATION_DURATION: 200,
  HOVER_ANIMATION_DURATION: 150,
  FOCUS_ANIMATION_DURATION: 300,
  
  // Selection limits
  MAX_SELECTION_COUNT: 100,
  MAX_BULK_OPERATIONS: 50,
  
  // Performance thresholds
  LARGE_DATASET_THRESHOLD: 1000,
  VIRTUAL_SCROLL_THRESHOLD: 500,
  
  // Accessibility
  KEYBOARD_NAVIGATION_DELAY: 100,
  SCREEN_READER_DEBOUNCE: 300,
  
  // Visual thresholds
  PRODUCTIVITY_HIGH_THRESHOLD: 70,
  PRODUCTIVITY_MEDIUM_THRESHOLD: 40,
  FOCUS_SCORE_THRESHOLD: 60,
  
  // Time calculations
  SESSION_GAP_THRESHOLD: 30 * 60 * 1000, // 30 minutes
  BRANCH_SPLIT_THRESHOLD: 5 * 1000, // 5 seconds
  RELATED_ITEM_TIME_THRESHOLD: 30 * 1000, // 30 seconds
  
  // Color palette
  SESSION_COLORS: [
    '#EF4444', '#F97316', '#F59E0B', '#84CC16', 
    '#22C55E', '#10B981', '#06B6D4', '#3B82F6',
    '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
    '#EC4899', '#F43F5E'
  ],
  
  CONNECTION_COLORS: {
    parent_child: '#3b82f6',
    tab_group: '#8b5cf6',
    window_group: '#06b6d4',
    session_flow: '#10b981',
    domain_related: '#f59e0b',
    content_related: '#ec4899',
    bookmark: '#ef4444',
    search_result: '#06b6d4',
    back_forward: '#6b7280'
  }
} as const;

// Default configurations
export const DEFAULT_TIMELINE_VISUALIZATION_CONFIG = {
  // Rendering configuration
  rendering: {
    itemHeight: TIMELINE_VISUALIZATION_CONSTANTS.DEFAULT_ITEM_HEIGHT,
    laneWidth: TIMELINE_VISUALIZATION_CONSTANTS.DEFAULT_LANE_WIDTH,
    itemSpacing: TIMELINE_VISUALIZATION_CONSTANTS.MIN_ITEM_SPACING,
    sessionHeaderHeight: TIMELINE_VISUALIZATION_CONSTANTS.DEFAULT_SESSION_HEADER_HEIGHT,
    maxLanes: TIMELINE_VISUALIZATION_CONSTANTS.MAX_LANES,
    animations: {
      enabled: true,
      duration: TIMELINE_VISUALIZATION_CONSTANTS.DEFAULT_ANIMATION_DURATION,
      easing: 'ease-out',
      stagger: 50
    },
    colorScheme: {
      sessionColors: TIMELINE_VISUALIZATION_CONSTANTS.SESSION_COLORS,
      itemTypeColors: {
        session: '#4F46E5',
        navigation: '#06B6D4',
        tab_event: '#8B5CF6',
        boundary: '#EF4444'
      },
      connectionColors: TIMELINE_VISUALIZATION_CONSTANTS.CONNECTION_COLORS,
      background: {
        primary: 'var(--bg-primary, #ffffff)',
        secondary: 'var(--bg-secondary, #f8fafc)',
        accent: 'var(--bg-accent, #f1f5f9)'
      },
      text: {
        primary: 'var(--text-primary, #0f172a)',
        secondary: 'var(--text-secondary, #475569)',
        muted: 'var(--text-muted, #94a3b8)'
      },
      states: {
        selected: 'var(--state-selected, #3b82f6)',
        hover: 'var(--state-hover, #e2e8f0)',
        active: 'var(--state-active, #1d4ed8)',
        disabled: 'var(--state-disabled, #cbd5e1)'
      }
    }
  },
  
  // Interaction configuration
  interaction: {
    selectionMode: 'multiple' as const,
    maxSelection: TIMELINE_VISUALIZATION_CONSTANTS.MAX_SELECTION_COUNT,
    enableKeyboardNavigation: true,
    enableAccessibility: true,
    focusManagement: {
      autoFocus: true,
      trapFocus: false,
      restoreFocus: true
    }
  },
  
  // View configuration
  view: {
    defaultZoomLevel: 'hours' as const,
    defaultViewMode: 'timeline' as const,
    enableSessionGrouping: true,
    showBranching: true,
    enableVirtualScrolling: true
  },
  
  // Performance configuration
  performance: {
    enablePerformanceMonitoring: true,
    enableMemoryManagement: true,
    virtualScrollThreshold: TIMELINE_VISUALIZATION_CONSTANTS.VIRTUAL_SCROLL_THRESHOLD,
    debounceTime: 150,
    throttleTime: 16
  }
} as const;

// Helper function to create timeline visualization with default config
export const createTimelineVisualization = (
  overrides?: Partial<typeof DEFAULT_TIMELINE_VISUALIZATION_CONFIG>
) => {
  return {
    ...DEFAULT_TIMELINE_VISUALIZATION_CONFIG,
    ...overrides
  };
};

// Version information
export const TIMELINE_VISUALIZATION_VERSION = '1.0.0';