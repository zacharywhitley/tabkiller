/**
 * Cross-browser windows API interface
 * Provides consistent window management functionality across all browsers
 */

import { EventHandler, AdapterResult, BaseBrowserAdapter } from './base';
import { TabInfo } from './tabs';

/**
 * Window types supported by browsers
 */
export type WindowType = 'normal' | 'popup' | 'panel' | 'app' | 'devtools';

/**
 * Window states
 */
export type WindowState = 'normal' | 'minimized' | 'maximized' | 'fullscreen' | 'locked-fullscreen';

/**
 * Window information
 */
export interface WindowInfo {
  id: number;
  type: WindowType;
  state: WindowState;
  focused: boolean;
  alwaysOnTop: boolean;
  incognito: boolean;
  tabs?: TabInfo[];
  
  // Dimensions and position
  left: number;
  top: number;
  width: number;
  height: number;
  
  // Additional properties
  sessionId?: string;
  title?: string;
}

/**
 * Window creation options
 */
export interface WindowCreateOptions {
  url?: string | string[];
  tabId?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  focused?: boolean;
  incognito?: boolean;
  type?: WindowType;
  state?: WindowState;
  setSelfAsOpener?: boolean;
}

/**
 * Window update options
 */
export interface WindowUpdateOptions {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  focused?: boolean;
  state?: WindowState;
  drawAttention?: boolean;
}

/**
 * Window query options
 */
export interface WindowQueryOptions {
  populate?: boolean;
  windowTypes?: WindowType[];
  focused?: boolean;
  incognito?: boolean;
  currentWindow?: boolean;
  lastFocusedWindow?: boolean;
}

/**
 * Window events
 */
export interface WindowCreatedEvent {
  window: WindowInfo;
}

export interface WindowRemovedEvent {
  windowId: number;
}

export interface WindowFocusChangedEvent {
  windowId: number;
}

export interface WindowBoundsChangedEvent {
  window: WindowInfo;
}

/**
 * Cross-browser windows adapter interface
 */
export interface WindowsAdapter extends BaseBrowserAdapter {
  // Core window operations
  get(windowId: number, queryInfo?: { populate?: boolean }): Promise<AdapterResult<WindowInfo>>;
  getCurrent(queryInfo?: { populate?: boolean }): Promise<AdapterResult<WindowInfo>>;
  getLastFocused(queryInfo?: { populate?: boolean }): Promise<AdapterResult<WindowInfo>>;
  getAll(queryInfo?: WindowQueryOptions): Promise<AdapterResult<WindowInfo[]>>;
  
  create(createData?: WindowCreateOptions): Promise<AdapterResult<WindowInfo>>;
  update(windowId: number, updateInfo: WindowUpdateOptions): Promise<AdapterResult<WindowInfo>>;
  remove(windowId: number): Promise<AdapterResult<void>>;
  
  // Window state management
  minimize(windowId: number): Promise<AdapterResult<WindowInfo>>;
  maximize(windowId: number): Promise<AdapterResult<WindowInfo>>;
  restore(windowId: number): Promise<AdapterResult<WindowInfo>>;
  focus(windowId: number): Promise<AdapterResult<WindowInfo>>;
  
  // Fullscreen operations
  enterFullscreen(windowId: number): Promise<AdapterResult<WindowInfo>>;
  exitFullscreen(windowId: number): Promise<AdapterResult<WindowInfo>>;
  toggleFullscreen(windowId: number): Promise<AdapterResult<WindowInfo>>;
  
  // Advanced window operations
  moveToDisplay(windowId: number, displayId?: number): Promise<AdapterResult<WindowInfo>>;
  centerWindow(windowId: number): Promise<AdapterResult<WindowInfo>>;
  
  // Window relationships
  getOpenerWindow(windowId: number): Promise<AdapterResult<WindowInfo | null>>;
  getChildWindows(windowId: number): Promise<AdapterResult<WindowInfo[]>>;
  setAlwaysOnTop(windowId: number, alwaysOnTop: boolean): Promise<AdapterResult<WindowInfo>>;
  
  // Batch operations
  closeAll(options?: {
    preserveIncognito?: boolean;
    preserveType?: WindowType;
    excludeWindowIds?: number[];
  }): Promise<AdapterResult<{
    closed: number[];
    failed: Array<{ windowId: number; error: Error }>;
  }>>;
  
  minimizeAll(excludeWindowIds?: number[]): Promise<AdapterResult<{
    minimized: number[];
    failed: Array<{ windowId: number; error: Error }>;
  }>>;
  
  restoreAll(excludeWindowIds?: number[]): Promise<AdapterResult<{
    restored: number[];
    failed: Array<{ windowId: number; error: Error }>;
  }>>;
  
  // Window arrangement
  arrangeWindows(arrangement: 'tile' | 'cascade' | 'stack', options?: {
    windowIds?: number[];
    excludeIncognito?: boolean;
    preserveFocused?: boolean;
  }): Promise<AdapterResult<{
    arranged: Array<{ windowId: number; bounds: { left: number; top: number; width: number; height: number } }>;
    failed: Array<{ windowId: number; error: Error }>;
  }>>;
  
  // Display information
  getDisplayInfo?(): Promise<AdapterResult<Array<{
    id: number;
    bounds: { left: number; top: number; width: number; height: number };
    workArea: { left: number; top: number; width: number; height: number };
    primary: boolean;
    scaleFactor: number;
  }>>>;
  
  // Window sessions
  saveWindowSession(windowId: number, name: string): Promise<AdapterResult<void>>;
  restoreWindowSession(name: string): Promise<AdapterResult<WindowInfo>>;
  listWindowSessions(): Promise<AdapterResult<Array<{
    name: string;
    created: number;
    tabCount: number;
    preview: { title: string; url: string }[];
  }>>>;
  deleteWindowSession(name: string): Promise<AdapterResult<void>>;
  
  // Events
  onCreated: EventHandler<WindowCreatedEvent>;
  onRemoved: EventHandler<WindowRemovedEvent>;
  onFocusChanged: EventHandler<WindowFocusChangedEvent>;
  onBoundsChanged?: EventHandler<WindowBoundsChangedEvent>;
  
  // Browser-specific capabilities
  supportsWindowTypes(type: WindowType): boolean;
  supportsWindowStates(state: WindowState): boolean;
  supportsAlwaysOnTop(): boolean;
  supportsMultipleDisplays(): boolean;
  supportsWindowSessions(): boolean;
  getMaxWindows(): number | null;
  getMinWindowSize(): { width: number; height: number } | null;
  getMaxWindowSize(): { width: number; height: number } | null;
}

/**
 * Window management utilities
 */
export interface WindowUtils {
  // Layout calculations
  calculateTileLayout(windows: WindowInfo[], displayBounds: { width: number; height: number }): Array<{
    windowId: number;
    bounds: { left: number; top: number; width: number; height: number };
  }>;
  
  calculateCascadeLayout(windows: WindowInfo[], displayBounds: { width: number; height: number }): Array<{
    windowId: number;
    bounds: { left: number; top: number; width: number; height: number };
  }>;
  
  // Window state utilities
  isWindowVisible(window: WindowInfo): boolean;
  isWindowOnscreen(window: WindowInfo, displayBounds: { width: number; height: number }): boolean;
  calculateWindowCenter(window: WindowInfo): { x: number; y: number };
  
  // Window filtering
  filterByType(windows: WindowInfo[], types: WindowType[]): WindowInfo[];
  filterByState(windows: WindowInfo[], states: WindowState[]): WindowInfo[];
  filterVisible(windows: WindowInfo[]): WindowInfo[];
  
  // Window sorting
  sortByZOrder(windows: WindowInfo[]): WindowInfo[];
  sortByLastActivity(windows: WindowInfo[]): WindowInfo[];
  sortBySize(windows: WindowInfo[], ascending?: boolean): WindowInfo[];
  
  // Focus management
  getFocusedWindow(windows: WindowInfo[]): WindowInfo | null;
  getLastActiveWindow(windows: WindowInfo[]): WindowInfo | null;
  
  // Window monitoring
  trackWindowActivity(windowId: number, callback: (activity: {
    type: 'focus' | 'blur' | 'move' | 'resize';
    timestamp: number;
    window: WindowInfo;
  }) => void): () => void; // Returns unsubscribe function
}

/**
 * Window session manager
 */
export interface WindowSessionManager {
  // Session operations
  createSession(windows: WindowInfo[], name: string, options?: {
    includeTabState?: boolean;
    includeWindowState?: boolean;
    description?: string;
  }): Promise<string>; // Returns session ID
  
  restoreSession(sessionId: string, options?: {
    newWindow?: boolean;
    mergeWithExisting?: boolean;
    preserveIncognito?: boolean;
  }): Promise<WindowInfo[]>;
  
  updateSession(sessionId: string, windows: WindowInfo[]): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  
  // Session management
  listSessions(): Promise<Array<{
    id: string;
    name: string;
    created: number;
    updated: number;
    windowCount: number;
    tabCount: number;
    description?: string;
  }>>;
  
  duplicateSession(sessionId: string, newName: string): Promise<string>;
  exportSession(sessionId: string): Promise<any>;
  importSession(sessionData: any, name: string): Promise<string>;
  
  // Auto-save functionality
  enableAutoSave(intervalMinutes: number): void;
  disableAutoSave(): void;
  createCheckpoint(name: string): Promise<string>;
  restoreFromCheckpoint(checkpointId: string): Promise<void>;
}