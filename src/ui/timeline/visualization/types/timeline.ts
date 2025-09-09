/**
 * Timeline Visualization Types
 * Type definitions for git-style timeline visualization with session grouping
 */

import { HistoryTimelineItem, TimelineGroup, BrowsingSession, SessionTag } from '../../../../shared/types';

// =============================================================================
// TIMELINE VISUALIZATION TYPES
// =============================================================================

export interface TimelineVisualizationProps {
  /** Timeline data from the core */
  data: TimelineVisualizationData;
  /** Container dimensions */
  height: number;
  width?: number;
  /** Zoom level configuration */
  zoomLevel: TimelineZoomLevel;
  /** View mode configuration */
  viewMode: TimelineViewMode;
  /** Session grouping enabled */
  enableSessionGrouping?: boolean;
  /** Show branching visualizations */
  showBranching?: boolean;
  /** Enable accessibility features */
  accessibilityEnabled?: boolean;
  /** Event handlers */
  onItemSelect?: (item: TimelineVisualizationItem) => void;
  onSessionSelect?: (session: TimelineSession) => void;
  onSessionToggle?: (sessionId: string, expanded: boolean) => void;
  onZoomChange?: (zoomLevel: TimelineZoomLevel) => void;
  onTimeRangeChange?: (range: TimeRange) => void;
  /** Custom renderers */
  renderCustomItem?: (item: TimelineVisualizationItem) => React.ReactNode;
  renderSessionHeader?: (session: TimelineSession) => React.ReactNode;
}

export interface TimelineVisualizationData {
  /** All timeline items */
  items: TimelineVisualizationItem[];
  /** Grouped sessions */
  sessions: TimelineSession[];
  /** Timeline metadata */
  metadata: TimelineMetadata;
  /** Date range of data */
  dateRange: TimeRange;
  /** Total count */
  totalCount: number;
}

export interface TimelineVisualizationItem extends HistoryTimelineItem {
  /** Visual position information */
  position: ItemPosition;
  /** Relationship information */
  relationships: ItemRelationships;
  /** Visual styling */
  styling: ItemStyling;
  /** Session context */
  sessionContext?: SessionContext;
}

export interface ItemPosition {
  /** X position for git-style lanes */
  laneIndex: number;
  /** Y position timestamp */
  timestamp: number;
  /** Visual depth for nesting */
  depth: number;
  /** Whether item is at branch point */
  isBranchPoint: boolean;
  /** Whether item is at merge point */
  isMergePoint: boolean;
}

export interface ItemRelationships {
  /** Parent items (referring pages/tabs) */
  parentIds: string[];
  /** Child items (opened from this item) */
  childIds: string[];
  /** Sibling items (same session/window) */
  siblingIds: string[];
  /** Related items (similar content/domain) */
  relatedIds: string[];
  /** Connection type for visualization */
  connectionType: ConnectionType;
}

export interface ItemStyling {
  /** Item color based on type/session */
  color: string;
  /** Icon to display */
  icon: string;
  /** Size variant */
  size: 'small' | 'medium' | 'large';
  /** Whether item is highlighted */
  highlighted: boolean;
  /** Whether item is selected */
  selected: boolean;
  /** Opacity for filtering */
  opacity: number;
}

export interface SessionContext {
  /** Session this item belongs to */
  sessionId: string;
  /** Session metadata */
  session: TimelineSession;
  /** Position within session */
  positionInSession: number;
  /** Whether session is expanded */
  sessionExpanded: boolean;
}

export type ConnectionType = 
  | 'parent_child'     // Direct navigation
  | 'tab_group'        // Same tab group
  | 'window_group'     // Same window
  | 'session_flow'     // Session continuation
  | 'domain_related'   // Same domain
  | 'content_related'  // Similar content
  | 'bookmark'         // Bookmarked link
  | 'search_result'    // Search result click
  | 'back_forward';    // Browser navigation

export type TimelineZoomLevel = 
  | 'minutes'    // Show individual page visits
  | 'hours'      // Group by hours, show sessions
  | 'days'       // Group by days, show session summaries
  | 'weeks'      // Group by weeks, show activity overview
  | 'months'     // Group by months, show trends
  | 'years';     // Group by years, show yearly stats

export type TimelineViewMode = 
  | 'timeline'   // Traditional chronological timeline
  | 'sessions'   // Session-focused view
  | 'branches'   // Git-style branching view
  | 'domains'    // Domain-focused clustering
  | 'activity';  // Activity-based grouping

export interface TimeRange {
  start: number;
  end: number;
}

// =============================================================================
// SESSION GROUPING TYPES
// =============================================================================

export interface TimelineSession {
  /** Session ID */
  id: string;
  /** Session tag/name */
  tag: string;
  /** Session metadata */
  metadata: SessionMetadata;
  /** Items in this session */
  items: TimelineVisualizationItem[];
  /** Visual representation */
  visual: SessionVisual;
  /** Grouping state */
  grouping: SessionGrouping;
  /** Statistics */
  stats: SessionStats;
}

export interface SessionMetadata {
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Session purpose/description */
  purpose?: string;
  /** Session notes */
  notes?: string;
  /** Privacy setting */
  isPrivate: boolean;
  /** Associated tags */
  tags: SessionTag[];
  /** Related sessions */
  relatedSessions: string[];
}

export interface SessionVisual {
  /** Session color for visualization */
  color: string;
  /** Session icon */
  icon: string;
  /** Lane assignment for git-style view */
  laneIndex: number;
  /** Branch information */
  branches: SessionBranch[];
  /** Merge points */
  merges: SessionMerge[];
}

export interface SessionBranch {
  /** Branch ID */
  id: string;
  /** Point where branch starts */
  startTimestamp: number;
  /** Point where branch ends */
  endTimestamp?: number;
  /** Lane index for this branch */
  laneIndex: number;
  /** Branch type */
  type: 'new_window' | 'new_tab' | 'domain_change' | 'manual_split';
  /** Items in this branch */
  itemIds: string[];
}

export interface SessionMerge {
  /** Merge point timestamp */
  timestamp: number;
  /** Branches being merged */
  sourceBranches: string[];
  /** Target branch */
  targetBranch: string;
  /** Merge type */
  type: 'window_close' | 'tab_merge' | 'session_merge' | 'manual_merge';
}

export interface SessionGrouping {
  /** Whether session is expanded */
  expanded: boolean;
  /** Whether session is collapsible */
  collapsible: boolean;
  /** Nested level for hierarchical sessions */
  level: number;
  /** Child sessions */
  childSessions: string[];
  /** Parent session */
  parentSession?: string;
  /** Summary when collapsed */
  collapsedSummary: SessionSummary;
}

export interface SessionSummary {
  /** Summary title */
  title: string;
  /** Summary description */
  description: string;
  /** Key statistics */
  keyStats: {
    tabCount: number;
    duration: number;
    pageCount: number;
    topDomains: string[];
  };
  /** Preview items (most important) */
  previewItems: TimelineVisualizationItem[];
}

export interface SessionStats {
  /** Total time spent */
  totalTime: number;
  /** Active time (not idle) */
  activeTime: number;
  /** Number of tabs */
  tabCount: number;
  /** Number of pages visited */
  pageCount: number;
  /** Unique domains */
  uniqueDomains: string[];
  /** Window count */
  windowCount: number;
  /** Navigation events */
  navigationEvents: number;
  /** Productivity score */
  productivityScore: number;
}

// =============================================================================
// TIMELINE INTERACTION TYPES
// =============================================================================

export interface TimelineInteraction {
  /** Interaction type */
  type: TimelineInteractionType;
  /** Target item/session */
  targetId: string;
  /** Interaction timestamp */
  timestamp: number;
  /** Additional data */
  data?: any;
}

export type TimelineInteractionType =
  | 'item_select'
  | 'item_hover'
  | 'item_double_click'
  | 'session_expand'
  | 'session_collapse'
  | 'session_select'
  | 'zoom_change'
  | 'time_range_change'
  | 'scroll'
  | 'branch_follow'
  | 'merge_explore';

export interface TimelineSelectionState {
  /** Selected items */
  selectedItems: Set<string>;
  /** Selected sessions */
  selectedSessions: Set<string>;
  /** Selection mode */
  mode: SelectionMode;
  /** Last selected timestamp */
  lastSelection: number;
}

export type SelectionMode = 
  | 'none'
  | 'single'
  | 'multiple'
  | 'range'
  | 'session'
  | 'branch';

// =============================================================================
// TIMELINE RENDERING TYPES
// =============================================================================

export interface TimelineRenderConfig {
  /** Item height in pixels */
  itemHeight: number;
  /** Lane width for git-style view */
  laneWidth: number;
  /** Spacing between items */
  itemSpacing: number;
  /** Session header height */
  sessionHeaderHeight: number;
  /** Maximum lanes for branching */
  maxLanes: number;
  /** Animation settings */
  animations: AnimationConfig;
  /** Color scheme */
  colorScheme: TimelineColorScheme;
}

export interface AnimationConfig {
  /** Enable animations */
  enabled: boolean;
  /** Animation duration */
  duration: number;
  /** Easing function */
  easing: string;
  /** Stagger delay for multiple items */
  stagger: number;
}

export interface TimelineColorScheme {
  /** Session colors */
  sessionColors: string[];
  /** Item type colors */
  itemTypeColors: Record<HistoryTimelineItem['type'], string>;
  /** Connection line colors */
  connectionColors: Record<ConnectionType, string>;
  /** Background colors */
  background: {
    primary: string;
    secondary: string;
    accent: string;
  };
  /** Text colors */
  text: {
    primary: string;
    secondary: string;
    muted: string;
  };
  /** State colors */
  states: {
    selected: string;
    hover: string;
    active: string;
    disabled: string;
  };
}

export interface TimelineMetadata {
  /** Total rendering time */
  renderTime: number;
  /** Number of visible items */
  visibleItems: number;
  /** Number of sessions */
  sessionCount: number;
  /** Memory usage estimate */
  memoryUsage: number;
  /** Last update timestamp */
  lastUpdate: number;
}

// =============================================================================
// ACCESSIBILITY TYPES
// =============================================================================

export interface TimelineAccessibility {
  /** Screen reader announcements */
  announcements: AccessibilityAnnouncement[];
  /** Keyboard navigation state */
  keyboardNavigation: KeyboardNavigationState;
  /** Focus management */
  focusManagement: FocusManagement;
  /** High contrast mode */
  highContrast: boolean;
  /** Reduced motion */
  reducedMotion: boolean;
}

export interface AccessibilityAnnouncement {
  /** Announcement text */
  text: string;
  /** Announcement type */
  type: 'polite' | 'assertive';
  /** Timestamp */
  timestamp: number;
  /** Whether announced */
  announced: boolean;
}

export interface KeyboardNavigationState {
  /** Currently focused item */
  focusedItem?: string;
  /** Navigation mode */
  mode: 'item' | 'session' | 'branch';
  /** Available shortcuts */
  shortcuts: KeyboardShortcut[];
}

export interface KeyboardShortcut {
  /** Key combination */
  keys: string[];
  /** Action description */
  description: string;
  /** Action handler */
  action: () => void;
  /** Context where available */
  context: string[];
}

export interface FocusManagement {
  /** Focus ring visible */
  focusVisible: boolean;
  /** Focus trap active */
  trapActive: boolean;
  /** Restore focus target */
  restoreTarget?: HTMLElement;
}