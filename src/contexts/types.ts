import { ReactNode } from 'react';
import browser from 'webextension-polyfill';

// =============================================================================
// BASE TYPES
// =============================================================================

export interface BaseState {
  isLoading: boolean;
  error: string | null;
  lastUpdated: number;
}

export interface BaseAction {
  type: string;
  payload?: any;
}

// =============================================================================
// TAB CONTEXT TYPES
// =============================================================================

export interface TabInfo {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
  active: boolean;
  windowId: number;
  index: number;
  pinned: boolean;
  audible: boolean;
  muted: boolean;
  highlighted: boolean;
  incognito: boolean;
  status: 'loading' | 'complete';
  lastAccessed: number;
}

export interface WindowInfo {
  id: number;
  type: 'normal' | 'popup' | 'panel' | 'app' | 'devtools';
  state: 'normal' | 'minimized' | 'maximized' | 'fullscreen' | 'docked';
  focused: boolean;
  alwaysOnTop: boolean;
  incognito: boolean;
  tabs: TabInfo[];
}

export interface TabState extends BaseState {
  currentTab: TabInfo | null;
  allTabs: TabInfo[];
  windows: WindowInfo[];
  activeTabIds: number[];
  recentTabs: TabInfo[];
  closedTabs: TabInfo[];
}

export type TabAction =
  | { type: 'SET_CURRENT_TAB'; payload: TabInfo }
  | { type: 'ADD_TAB'; payload: TabInfo }
  | { type: 'UPDATE_TAB'; payload: { tabId: number; updates: Partial<TabInfo> } }
  | { type: 'REMOVE_TAB'; payload: number }
  | { type: 'SET_ALL_TABS'; payload: TabInfo[] }
  | { type: 'SET_WINDOWS'; payload: WindowInfo[] }
  | { type: 'ADD_TO_RECENT'; payload: TabInfo }
  | { type: 'ADD_TO_CLOSED'; payload: TabInfo }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

// =============================================================================
// SESSION CONTEXT TYPES
// =============================================================================

export interface SessionTag {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface SessionTab {
  url: string;
  title: string;
  favIconUrl?: string;
  index: number;
  pinned: boolean;
  timestamp: number;
}

export interface Session {
  id: string;
  name: string;
  description?: string;
  tags: SessionTag[];
  tabs: SessionTab[];
  windowCount: number;
  startTime: number;
  endTime?: number;
  duration?: number;
  isActive: boolean;
  metadata: {
    totalPages: number;
    uniqueDomains: number;
    bookmarkedPages: number;
    averageTimePerPage: number;
  };
}

export interface SessionState extends BaseState {
  currentSession: Session | null;
  allSessions: Session[];
  recentSessions: Session[];
  sessionTags: SessionTag[];
  sessionStats: {
    totalSessions: number;
    activeSessions: number;
    todaysPages: number;
    totalPages: number;
    averageSessionDuration: number;
  };
}

export type SessionAction =
  | { type: 'START_SESSION'; payload: Omit<Session, 'id' | 'startTime' | 'isActive'> }
  | { type: 'END_SESSION'; payload: string }
  | { type: 'UPDATE_SESSION'; payload: { sessionId: string; updates: Partial<Session> } }
  | { type: 'ADD_TAB_TO_SESSION'; payload: { sessionId: string; tab: SessionTab } }
  | { type: 'REMOVE_TAB_FROM_SESSION'; payload: { sessionId: string; tabIndex: number } }
  | { type: 'ADD_TAG_TO_SESSION'; payload: { sessionId: string; tag: SessionTag } }
  | { type: 'REMOVE_TAG_FROM_SESSION'; payload: { sessionId: string; tagId: string } }
  | { type: 'CREATE_SESSION_TAG'; payload: Omit<SessionTag, 'id'> }
  | { type: 'DELETE_SESSION_TAG'; payload: string }
  | { type: 'SET_CURRENT_SESSION'; payload: Session | null }
  | { type: 'SET_ALL_SESSIONS'; payload: Session[] }
  | { type: 'SET_RECENT_SESSIONS'; payload: Session[] }
  | { type: 'UPDATE_SESSION_STATS'; payload: Partial<SessionState['sessionStats']> }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

// =============================================================================
// SETTINGS CONTEXT TYPES
// =============================================================================

export interface GeneralSettings {
  autoStartSessions: boolean;
  maxRecentTabs: number;
  maxClosedTabs: number;
  maxRecentSessions: number;
  enableNotifications: boolean;
  notificationDuration: number;
  enableAnalytics: boolean;
  enableBrowserSync: boolean;
}

export interface PrivacySettings {
  encryptData: boolean;
  excludeIncognito: boolean;
  excludeDomains: string[];
  retentionDays: number;
  clearDataOnUninstall: boolean;
  enableSSBSync: boolean;
  ssbIdentity?: string;
}

export interface MenuSettings {
  enableContextMenus: boolean;
  showIcons: boolean;
  showShortcuts: boolean;
  compactMode: boolean;
  enableSubmenus: boolean;
  groupSeparators: boolean;
  maxDepth: number;
  maxItemsPerGroup: number;
  customMenuItems: string[]; // IDs of custom menu items
  hiddenMenuItems: string[]; // IDs of hidden menu items
  menuCustomizations: Array<{
    itemId: string;
    hidden: boolean;
    priority?: number;
    groupId?: string;
    customName?: string;
    customShortcut?: string;
    userModified: boolean;
    timestamp: number;
  }>;
}

export interface UISettings {
  theme: 'light' | 'dark' | 'auto';
  compactMode: boolean;
  showFavicons: boolean;
  showTabCounts: boolean;
  defaultView: 'popup' | 'history' | 'sessions';
  animationsEnabled: boolean;
  keyboardShortcuts: Record<string, string>;
  menu: MenuSettings;
}

export interface StorageSettings {
  maxStorageSize: number;
  compressionLevel: number;
  enableBackup: boolean;
  backupInterval: number;
  maxBackups: number;
  storageLocation: 'local' | 'sync';
}

export interface Settings {
  general: GeneralSettings;
  privacy: PrivacySettings;
  ui: UISettings;
  storage: StorageSettings;
  version: string;
  lastModified: number;
}

export interface SettingsState extends BaseState {
  settings: Settings;
  hasUnsavedChanges: boolean;
  resetInProgress: boolean;
}

export type SettingsAction =
  | { type: 'UPDATE_GENERAL_SETTINGS'; payload: Partial<GeneralSettings> }
  | { type: 'UPDATE_PRIVACY_SETTINGS'; payload: Partial<PrivacySettings> }
  | { type: 'UPDATE_UI_SETTINGS'; payload: Partial<UISettings> }
  | { type: 'UPDATE_MENU_SETTINGS'; payload: Partial<MenuSettings> }
  | { type: 'UPDATE_STORAGE_SETTINGS'; payload: Partial<StorageSettings> }
  | { type: 'SAVE_SETTINGS'; payload?: void }
  | { type: 'RESET_SETTINGS'; payload?: void }
  | { type: 'RESTORE_DEFAULTS'; payload?: void }
  | { type: 'IMPORT_SETTINGS'; payload: Partial<Settings> }
  | { type: 'SET_UNSAVED_CHANGES'; payload: boolean }
  | { type: 'SET_RESET_IN_PROGRESS'; payload: boolean }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

// =============================================================================
// UI CONTEXT TYPES
// =============================================================================

export interface UIState extends BaseState {
  sidebarOpen: boolean;
  currentView: 'popup' | 'history' | 'sessions' | 'settings';
  currentModal: string | null;
  searchQuery: string;
  searchResults: any[];
  selectedItems: string[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  filterBy: Record<string, any>;
  pageSize: number;
  currentPage: number;
  notifications: Notification[];
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  autoClose: boolean;
  duration: number;
  timestamp: number;
  actions?: Array<{
    label: string;
    handler: () => void;
  }>;
}

export type UIAction =
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR_OPEN'; payload: boolean }
  | { type: 'SET_CURRENT_VIEW'; payload: UIState['currentView'] }
  | { type: 'OPEN_MODAL'; payload: string }
  | { type: 'CLOSE_MODAL' }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_SEARCH_RESULTS'; payload: any[] }
  | { type: 'SET_SELECTED_ITEMS'; payload: string[] }
  | { type: 'ADD_SELECTED_ITEM'; payload: string }
  | { type: 'REMOVE_SELECTED_ITEM'; payload: string }
  | { type: 'CLEAR_SELECTED_ITEMS' }
  | { type: 'SET_SORT'; payload: { sortBy: string; sortOrder: 'asc' | 'desc' } }
  | { type: 'SET_FILTER'; payload: { key: string; value: any } }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'SET_PAGE_SIZE'; payload: number }
  | { type: 'SET_CURRENT_PAGE'; payload: number }
  | { type: 'ADD_NOTIFICATION'; payload: Omit<Notification, 'id' | 'timestamp'> }
  | { type: 'REMOVE_NOTIFICATION'; payload: string }
  | { type: 'CLEAR_NOTIFICATIONS' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

// =============================================================================
// CONTEXT PROVIDER TYPES
// =============================================================================

export interface ContextProviderProps {
  children: ReactNode;
}

export interface TabContextValue {
  state: TabState;
  actions: {
    setCurrentTab: (tab: TabInfo) => void;
    addTab: (tab: TabInfo) => void;
    updateTab: (tabId: number, updates: Partial<TabInfo>) => void;
    removeTab: (tabId: number) => void;
    refreshTabs: () => Promise<void>;
    refreshWindows: () => Promise<void>;
    addToRecent: (tab: TabInfo) => void;
    addToClosed: (tab: TabInfo) => void;
    clearError: () => void;
  };
}

export interface SessionContextValue {
  state: SessionState;
  actions: {
    startSession: (session: Omit<Session, 'id' | 'startTime' | 'isActive'>) => void;
    endSession: (sessionId: string) => void;
    updateSession: (sessionId: string, updates: Partial<Session>) => void;
    addTabToSession: (sessionId: string, tab: SessionTab) => void;
    removeTabFromSession: (sessionId: string, tabIndex: number) => void;
    addTagToSession: (sessionId: string, tag: SessionTag) => void;
    removeTagFromSession: (sessionId: string, tagId: string) => void;
    createSessionTag: (tag: Omit<SessionTag, 'id'>) => void;
    deleteSessionTag: (tagId: string) => void;
    loadSessions: () => Promise<void>;
    updateSessionStats: () => Promise<void>;
    clearError: () => void;
  };
}

export interface SettingsContextValue {
  state: SettingsState;
  actions: {
    updateGeneralSettings: (updates: Partial<GeneralSettings>) => void;
    updatePrivacySettings: (updates: Partial<PrivacySettings>) => void;
    updateUISettings: (updates: Partial<UISettings>) => void;
    updateMenuSettings: (updates: Partial<MenuSettings>) => void;
    updateStorageSettings: (updates: Partial<StorageSettings>) => void;
    saveSettings: () => Promise<void>;
    resetSettings: () => Promise<void>;
    restoreDefaults: () => Promise<void>;
    importSettings: (settings: Partial<Settings>) => void;
    loadSettings: () => Promise<void>;
    clearError: () => void;
  };
}

export interface UIContextValue {
  state: UIState;
  actions: {
    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;
    setCurrentView: (view: UIState['currentView']) => void;
    openModal: (modal: string) => void;
    closeModal: () => void;
    setSearchQuery: (query: string) => void;
    setSearchResults: (results: any[]) => void;
    setSelectedItems: (items: string[]) => void;
    addSelectedItem: (item: string) => void;
    removeSelectedItem: (item: string) => void;
    clearSelectedItems: () => void;
    setSort: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
    setFilter: (key: string, value: any) => void;
    clearFilters: () => void;
    setPageSize: (size: number) => void;
    setCurrentPage: (page: number) => void;
    addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
    removeNotification: (id: string) => void;
    clearNotifications: () => void;
    clearError: () => void;
  };
}

// =============================================================================
// STORAGE TYPES
// =============================================================================

export interface StorageKey {
  TABS: 'tabkiller:tabs';
  SESSIONS: 'tabkiller:sessions';
  SETTINGS: 'tabkiller:settings';
  UI_STATE: 'tabkiller:ui_state';
  SESSION_TAGS: 'tabkiller:session_tags';
  RECENT_TABS: 'tabkiller:recent_tabs';
  CLOSED_TABS: 'tabkiller:closed_tabs';
}

export interface StorageData {
  [key: string]: any;
}

export interface StoragePersistence {
  get<T>(key: string): Promise<T | null>;
  set(key: string, data: any): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
  size(): Promise<number>;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export class ContextError extends Error {
  constructor(context: string, operation: string, originalError?: Error) {
    super(`Error in ${context} context during ${operation}: ${originalError?.message || 'Unknown error'}`);
    this.name = 'ContextError';
    this.cause = originalError;
  }
}

export class StorageError extends Error {
  constructor(operation: string, key?: string, originalError?: Error) {
    super(`Storage ${operation} failed${key ? ` for key '${key}'` : ''}: ${originalError?.message || 'Unknown error'}`);
    this.name = 'StorageError';
    this.cause = originalError;
  }
}