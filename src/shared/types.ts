/**
 * Shared TypeScript types for the TabKiller extension
 */

// Core domain types
export interface BrowsingSession {
  id: string;
  tag: string;
  createdAt: number;
  updatedAt: number;
  tabs: TabInfo[];
  windowIds: number[];
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  purpose?: string;
  notes?: string;
  isPrivate: boolean;
  totalTime: number;
  pageCount: number;
  domain: string[];
}

export interface TabInfo {
  id: number;
  url: string;
  title: string;
  favicon?: string;
  windowId: number;
  createdAt: number;
  lastAccessed: number;
  timeSpent: number;
  scrollPosition: number;
  formData?: Record<string, string>;
}

export interface NavigationEvent {
  tabId: number;
  url: string;
  referrer?: string;
  timestamp: number;
  transitionType: NavigationTransition;
}

export type NavigationTransition = 
  | 'link'
  | 'typed' 
  | 'bookmark'
  | 'auto_bookmark'
  | 'auto_subframe'
  | 'manual_subframe'
  | 'generated'
  | 'start_page'
  | 'form_submit'
  | 'reload'
  | 'keyword'
  | 'keyword_generated';

// Storage types
export interface StoredData {
  sessions: BrowsingSession[];
  settings: ExtensionSettings;
  metadata: StorageMetadata;
}

export interface StorageMetadata {
  version: string;
  lastSync: number;
  syncEnabled: boolean;
  encryptionEnabled: boolean;
}

export interface ExtensionSettings {
  autoCapture: boolean;
  captureInterval: number;
  maxSessions: number;
  defaultTag: string;
  syncEnabled: boolean;
  encryptionEnabled: boolean;
  excludedDomains: string[];
  includedDomains: string[];
  privacyMode: PrivacyMode;
}

export type PrivacyMode = 'strict' | 'moderate' | 'minimal';

// Message passing types
export interface Message {
  type: MessageType;
  payload?: unknown;
  requestId?: string;
}

export type MessageType =
  // Session management
  | 'create-session'
  | 'update-session' 
  | 'delete-session'
  | 'get-sessions'
  | 'get-current-session'
  // Tab management
  | 'capture-tabs'
  | 'restore-session'
  | 'close-session-tabs'
  // Settings
  | 'get-settings'
  | 'update-settings'
  // Sync
  | 'sync-data'
  | 'export-data'
  | 'import-data'
  // Navigation tracking
  | 'track-navigation'
  | 'get-navigation-history'
  // Status
  | 'get-status'
  | 'ping'
  // Database operations
  | 'get-dashboard-data'
  | 'search-history'
  | 'get-browsing-patterns'
  | 'get-database-status'
  // Content script specific
  | 'capture-page'
  | 'get-form-data'  
  | 'get-scroll-position'
  // Event tracking specific
  | 'event-batch'
  | 'session-boundary'
  | 'analytics-update'
  | 'privacy-filter'
  | 'track-interaction';

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  requestId?: string;
}

// Content script types
export interface PageCapture {
  url: string;
  title: string;
  html?: string;
  mhtml?: string;
  screenshot?: string;
  metadata: PageMetadata;
  capturedAt: number;
}

export interface PageMetadata {
  description?: string;
  keywords?: string[];
  author?: string;
  language?: string;
  charset?: string;
  viewportSize: { width: number; height: number };
  scrollPosition: { x: number; y: number };
  forms: FormData[];
  links: LinkInfo[];
}

export interface FormData {
  id?: string;
  name?: string;
  action?: string;
  method?: string;
  fields: FormField[];
}

export interface FormField {
  name: string;
  type: string;
  value: string;
  required: boolean;
}

export interface LinkInfo {
  href: string;
  text: string;
  title?: string;
  rel?: string;
}

// Background script types
export interface BackgroundState {
  currentSession?: BrowsingSession;
  activeTabs: Map<number, TabInfo>;
  settings: ExtensionSettings;
  syncStatus: SyncStatus;
}

export interface SyncStatus {
  enabled: boolean;
  lastSync: number;
  inProgress: boolean;
  errors: string[];
  totalSynced: number;
}

// Enhanced Error types
export interface ExtensionError {
  code: string;
  message: string;
  details?: unknown;
  timestamp: number;
  component: 'background' | 'content' | 'popup' | 'sync' | 'tracking' | 'analytics' | 'storage';
  eventId?: string;
  sessionId?: string;
}

// Storage and Batching types
export interface EventBatch {
  id: string;
  events: BrowsingEvent[];
  createdAt: number;
  size: number;
  compressed: boolean;
}

export interface LocalEventStore {
  batches: EventBatch[];
  pendingEvents: BrowsingEvent[];
  lastFlush: number;
  totalEvents: number;
  storageUsed: number;
}

export interface EventFilter {
  types?: EventType[];
  dateRange?: { start: number; end: number };
  sessionIds?: string[];
  domains?: string[];
  tabIds?: number[];
  windowIds?: number[];
  limit?: number;
  offset?: number;
}

export interface AnalyticsQuery {
  sessionId?: string;
  dateRange: { start: number; end: number };
  metrics: ('time' | 'productivity' | 'patterns' | 'domains' | 'activity')[];
  groupBy?: 'session' | 'day' | 'hour' | 'domain';
}

export class TabKillerError extends Error {
  constructor(
    public code: string,
    message: string,
    public component: ExtensionError['component'],
    public details?: unknown
  ) {
    super(message);
    this.name = 'TabKillerError';
  }
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = 
  Pick<T, Exclude<keyof T, Keys>> & 
  { [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>> }[Keys];

// Enhanced Event Tracking Types
export type EventType = 
  | 'tab_created'
  | 'tab_updated'
  | 'tab_removed'
  | 'tab_activated'
  | 'tab_moved'
  | 'tab_pinned'
  | 'tab_unpinned'
  | 'tab_muted'
  | 'tab_unmuted'
  | 'window_created'
  | 'window_removed'
  | 'window_focus_changed'
  | 'window_state_changed'
  | 'navigation_started'
  | 'navigation_completed'
  | 'navigation_committed'
  | 'navigation_error'
  | 'page_loaded'
  | 'page_unloaded'
  | 'form_interaction'
  | 'scroll_event'
  | 'click_event'
  | 'session_started'
  | 'session_ended'
  | 'idle_start'
  | 'idle_end';

export interface BrowsingEvent {
  id: string;
  timestamp: number;
  type: EventType;
  tabId?: number;
  windowId?: number;
  url?: string;
  title?: string;
  sessionId: string;
  userId?: string;
  metadata: EventMetadata;
}

export interface EventMetadata {
  [key: string]: any;
  // Navigation specific
  referrer?: string;
  transitionType?: NavigationTransition;
  
  // Tab specific
  parentTabId?: number;
  openerTabId?: number;
  index?: number;
  pinned?: boolean;
  muted?: boolean;
  
  // Window specific
  windowType?: 'normal' | 'popup' | 'panel' | 'app' | 'devtools';
  windowState?: 'normal' | 'minimized' | 'maximized' | 'fullscreen';
  
  // Session specific
  sessionBoundary?: 'user_initiated' | 'idle_timeout' | 'navigation_gap' | 'domain_change';
  
  // Performance metrics
  loadTime?: number;
  renderTime?: number;
  
  // Privacy
  isIncognito?: boolean;
  sensitiveDataFiltered?: boolean;
}

export interface TabEvent {
  type: 'created' | 'updated' | 'removed' | 'activated' | 'moved' | 'state_changed';
  tabId: number;
  windowId: number;
  timestamp: number;
  data?: Partial<TabInfo>;
  relationships?: TabRelationships;
}

export interface TabRelationships {
  parentTabId?: number;
  openerTabId?: number;
  childTabIds: number[];
  groupId?: number;
  relatedTabs: number[];
}

export interface WindowEvent {
  type: 'created' | 'removed' | 'focus_changed' | 'state_changed';
  windowId: number;
  timestamp: number;
  windowType?: 'normal' | 'popup' | 'panel' | 'app' | 'devtools';
  state?: 'normal' | 'minimized' | 'maximized' | 'fullscreen';
  bounds?: WindowBounds;
}

export interface WindowBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SessionBoundary {
  id: string;
  type: 'start' | 'end';
  reason: 'user_initiated' | 'idle_timeout' | 'navigation_gap' | 'domain_change' | 'window_closed';
  timestamp: number;
  sessionId: string;
  metadata: {
    idleDuration?: number;
    navigationGap?: number;
    domainFrom?: string;
    domainTo?: string;
    tabsInvolved?: number[];
    windowsInvolved?: number[];
  };
}

export interface NavigationPattern {
  id: string;
  sequence: NavigationStep[];
  patternType: 'linear' | 'cyclical' | 'branching' | 'random';
  frequency: number;
  lastSeen: number;
  confidence: number;
}

export interface NavigationStep {
  url: string;
  title: string;
  domain: string;
  timestamp: number;
  timeSpent: number;
  transitionType: NavigationTransition;
  tabId: number;
}

export interface ProductivityMetrics {
  sessionId: string;
  totalTime: number;
  activeTime: number;
  idleTime: number;
  tabSwitches: number;
  windowSwitches: number;
  uniqueDomains: string[];
  pageCount: number;
  scrollEvents: number;
  clickEvents: number;
  formInteractions: number;
  deepWorkPeriods: TimeRange[];
  distractionPeriods: TimeRange[];
  focusScore: number; // 0-100
}

export interface TimeRange {
  start: number;
  end: number;
  duration: number;
}

export interface IdleEvent {
  type: 'idle_start' | 'idle_end';
  timestamp: number;
  duration?: number;
  reason: 'user_inactive' | 'system_locked' | 'browser_minimized';
  sessionId: string;
  activeTabId?: number;
}

// API response types
export type ApiResponse<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
  code?: string;
};

// Configuration types
export interface BrowserConfig {
  manifestVersion: number;
  backgroundType: 'service-worker' | 'scripts';
  actionAPI: 'action' | 'browserAction';
  storageQuota: number;
  maxBadgeText: number;
}

// Tracking Configuration
export interface TrackingConfig {
  enableTabTracking: boolean;
  enableWindowTracking: boolean;
  enableNavigationTracking: boolean;
  enableSessionTracking: boolean;
  enableFormTracking: boolean;
  enableScrollTracking: boolean;
  enableClickTracking: boolean;
  
  // Privacy settings
  privacyMode: PrivacyMode;
  excludeIncognito: boolean;
  excludeDomains: string[];
  includeDomains: string[];
  sensitiveFieldFilters: string[];
  
  // Performance settings
  batchSize: number;
  batchInterval: number;
  maxEventsInMemory: number;
  storageCleanupInterval: number;
  
  // Session settings
  idleThreshold: number;
  sessionGapThreshold: number;
  domainChangeSessionBoundary: boolean;
  
  // Analytics settings
  enableProductivityMetrics: boolean;
  deepWorkThreshold: number;
  distractionThreshold: number;
}

export interface TrackerState {
  isActive: boolean;
  currentSessionId?: string;
  lastEventTime: number;
  eventCount: number;
  batchCount: number;
  lastFlush: number;
  activeTabs: Set<number>;
  activeWindows: Set<number>;
  idleState: boolean;
  lastIdleTime?: number;
}

// UI-specific types for enhanced interface components

export interface UITheme {
  name: string;
  isDark: boolean;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  borderRadius: string;
  shadows: {
    sm: string;
    md: string;
    lg: string;
  };
}

export interface SessionTag {
  id: string;
  name: string;
  color?: string;
  description?: string;
  createdAt: number;
  usageCount: number;
  parent?: string;
  children?: string[];
}

export interface TagHierarchy {
  tag: SessionTag;
  level: number;
  path: string[];
  hasChildren: boolean;
}

export interface SessionFilter {
  tags?: string[];
  dateRange?: { start: number; end: number };
  domains?: string[];
  searchQuery?: string;
  tabCount?: { min: number; max: number };
  duration?: { min: number; max: number };
  sortBy?: 'createdAt' | 'updatedAt' | 'tabCount' | 'duration' | 'tag';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface HistoryTimelineItem {
  id: string;
  type: 'session' | 'navigation' | 'tab_event' | 'boundary';
  timestamp: number;
  title: string;
  description?: string;
  icon?: string;
  metadata: {
    sessionId?: string;
    tabId?: number;
    url?: string;
    domain?: string;
    duration?: number;
    tabCount?: number;
    tags?: string[];
  };
}

export interface TimelineGroup {
  date: string;
  items: HistoryTimelineItem[];
  stats: {
    totalSessions: number;
    totalTabs: number;
    totalTime: number;
    uniqueDomains: number;
  };
}

export interface SearchResult {
  type: 'session' | 'page' | 'tab' | 'event';
  id: string;
  title: string;
  description: string;
  url?: string;
  timestamp: number;
  relevanceScore: number;
  metadata: {
    sessionId?: string;
    sessionTag?: string;
    domain?: string;
    tabId?: number;
    context?: string;
    highlights?: string[];
  };
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'html' | 'pdf';
  includeContent: boolean;
  includeTabs: boolean;
  includeSessions: boolean;
  includeHistory: boolean;
  dateRange?: { start: number; end: number };
  sessionIds?: string[];
  compressed: boolean;
  encrypted: boolean;
}

export interface ImportOptions {
  format: 'json' | 'csv' | 'html';
  mergeStrategy: 'replace' | 'merge' | 'skip_existing';
  validateData: boolean;
  createBackup: boolean;
}

export interface UISettings {
  theme: 'light' | 'dark' | 'auto';
  compactMode: boolean;
  showPreviewPanels: boolean;
  animationsEnabled: boolean;
  showTooltips: boolean;
  defaultView: 'sessions' | 'timeline' | 'analytics';
  itemsPerPage: number;
  autoRefreshInterval: number;
  shortcuts: Record<string, string>;
}

export interface OptionsPageSection {
  id: string;
  title: string;
  icon?: string;
  component: string;
  visible: boolean;
  order: number;
}

export interface NotificationSettings {
  enabled: boolean;
  types: {
    sessionReminders: boolean;
    syncStatus: boolean;
    storageWarnings: boolean;
    errorAlerts: boolean;
  };
  frequency: 'immediate' | 'batched' | 'daily';
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
}

export interface PopupState {
  currentSession?: BrowsingSession;
  recentSessions: BrowsingSession[];
  stats: {
    activeTabs: number;
    totalSessions: number;
    todaysPages: number;
    storageUsed: number;
  };
  syncStatus: {
    enabled: boolean;
    lastSync: number;
    inProgress: boolean;
    error?: string;
  };
  quickActions: QuickAction[];
}

export interface QuickAction {
  id: string;
  title: string;
  icon: string;
  description: string;
  enabled: boolean;
  shortcut?: string;
  action: () => void;
}

export interface SessionAnalytics {
  sessionId: string;
  totalTime: number;
  activeTime: number;
  tabSwitches: number;
  uniqueDomains: string[];
  topDomains: Array<{ domain: string; time: number; percentage: number }>;
  productivityScore: number;
  focusPeriods: TimeRange[];
  distractionEvents: number;
  patterns: NavigationPattern[];
}

export interface BrowsingInsights {
  timeRange: { start: number; end: number };
  totalTime: number;
  sessionsCount: number;
  tabsCount: number;
  pagesVisited: number;
  uniqueDomains: number;
  averageSessionDuration: number;
  peakActivityHours: number[];
  topDomains: Array<{ domain: string; time: number; visits: number }>;
  productivityTrends: Array<{ date: string; score: number }>;
  sessionDistribution: Array<{ tag: string; count: number; time: number }>;
}

export interface DataVisualizationConfig {
  type: 'timeline' | 'heatmap' | 'graph' | 'chart' | 'stats';
  title: string;
  data: any;
  options: {
    interactive: boolean;
    showLabels: boolean;
    showTooltips: boolean;
    colorScheme: string[];
    dimensions: { width: number; height: number };
  };
}

export interface AccessibilityOptions {
  highContrast: boolean;
  reducedMotion: boolean;
  screenReaderSupport: boolean;
  keyboardNavigation: boolean;
  fontSize: 'small' | 'medium' | 'large' | 'extra-large';
  focusIndicators: boolean;
}

export interface ComponentState {
  loading: boolean;
  error?: string;
  lastUpdated?: number;
  retryCount: number;
  isVisible: boolean;
}

export interface Modal {
  id: string;
  type: 'session' | 'settings' | 'export' | 'import' | 'confirm' | 'info';
  title: string;
  content: string | React.ComponentType;
  size: 'small' | 'medium' | 'large' | 'fullscreen';
  closable: boolean;
  actions: ModalAction[];
}

export interface ModalAction {
  id: string;
  label: string;
  type: 'primary' | 'secondary' | 'danger';
  action: () => void | Promise<void>;
  disabled?: boolean;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration: number;
  persistent: boolean;
  actions?: ToastAction[];
}

export interface ToastAction {
  label: string;
  action: () => void;
}

export interface ContextMenuOption {
  id: string;
  label: string;
  icon?: string;
  action: () => void;
  disabled?: boolean;
  separator?: boolean;
}

export interface KeyboardShortcut {
  id: string;
  combination: string[];
  description: string;
  action: () => void;
  context: 'global' | 'popup' | 'options' | 'timeline';
  enabled: boolean;
}