/**
 * Cross-browser tabs API interface
 * Provides consistent tabs functionality across all browsers
 */

import { EventHandler, AdapterResult, BaseBrowserAdapter } from './base';

/**
 * Unified tab information interface
 */
export interface TabInfo {
  id: number;
  windowId: number;
  index: number;
  url?: string;
  title?: string;
  favIconUrl?: string;
  active: boolean;
  pinned: boolean;
  highlighted: boolean;
  incognito: boolean;
  selected: boolean;  // For Firefox compatibility
  status?: 'loading' | 'complete';
  width?: number;
  height?: number;
  sessionId?: string;
  openerTabId?: number;
  audible?: boolean;
  autoDiscardable?: boolean;
  discarded?: boolean;
  groupId?: number;
  mutedInfo?: {
    muted: boolean;
    reason?: 'user' | 'capture' | 'extension';
    extensionId?: string;
  };
  pendingUrl?: string;
}

/**
 * Tab creation options
 */
export interface TabCreateOptions {
  windowId?: number;
  index?: number;
  url?: string;
  active?: boolean;
  pinned?: boolean;
  openerTabId?: number;
}

/**
 * Tab update options
 */
export interface TabUpdateOptions {
  url?: string;
  active?: boolean;
  pinned?: boolean;
  muted?: boolean;
  highlighted?: boolean;
  autoDiscardable?: boolean;
}

/**
 * Tab query options
 */
export interface TabQueryOptions {
  active?: boolean;
  pinned?: boolean;
  audible?: boolean;
  muted?: boolean;
  highlighted?: boolean;
  discarded?: boolean;
  autoDiscardable?: boolean;
  currentWindow?: boolean;
  lastFocusedWindow?: boolean;
  status?: 'loading' | 'complete';
  title?: string;
  url?: string | string[];
  windowId?: number;
  windowType?: 'normal' | 'popup' | 'panel' | 'app' | 'devtools';
  index?: number;
  groupId?: number;
}

/**
 * Tab move options
 */
export interface TabMoveOptions {
  windowId?: number;
  index: number;
}

/**
 * Tab duplicate options
 */
export interface TabDuplicateOptions {
  index?: number;
  active?: boolean;
}

/**
 * Tab events
 */
export interface TabCreatedEvent {
  tab: TabInfo;
}

export interface TabUpdatedEvent {
  tabId: number;
  changeInfo: Partial<TabInfo>;
  tab: TabInfo;
}

export interface TabRemovedEvent {
  tabId: number;
  removeInfo: {
    windowId: number;
    isWindowClosing: boolean;
  };
}

export interface TabActivatedEvent {
  tabId: number;
  windowId: number;
  previousTabId?: number;
}

export interface TabMovedEvent {
  tabId: number;
  moveInfo: {
    windowId: number;
    fromIndex: number;
    toIndex: number;
  };
}

export interface TabReplacedEvent {
  addedTabId: number;
  removedTabId: number;
}

export interface TabAttachedEvent {
  tabId: number;
  attachInfo: {
    newWindowId: number;
    newPosition: number;
  };
}

export interface TabDetachedEvent {
  tabId: number;
  detachInfo: {
    oldWindowId: number;
    oldPosition: number;
  };
}

/**
 * Cross-browser tabs adapter interface
 */
export interface TabsAdapter extends BaseBrowserAdapter {
  // Core tab operations
  query(queryInfo: TabQueryOptions): Promise<AdapterResult<TabInfo[]>>;
  get(tabId: number): Promise<AdapterResult<TabInfo>>;
  getCurrent(): Promise<AdapterResult<TabInfo>>;
  create(createProperties: TabCreateOptions): Promise<AdapterResult<TabInfo>>;
  update(tabId: number, updateProperties: TabUpdateOptions): Promise<AdapterResult<TabInfo>>;
  remove(tabIds: number | number[]): Promise<AdapterResult<void>>;
  
  // Advanced tab operations
  move(tabIds: number | number[], moveProperties: TabMoveOptions): Promise<AdapterResult<TabInfo | TabInfo[]>>;
  duplicate(tabId: number, duplicateProperties?: TabDuplicateOptions): Promise<AdapterResult<TabInfo>>;
  reload(tabId?: number, reloadProperties?: { bypassCache?: boolean }): Promise<AdapterResult<void>>;
  discard(tabIds: number | number[]): Promise<AdapterResult<void>>;
  group?(tabIds: number | number[], groupOptions?: { groupId?: number }): Promise<AdapterResult<number>>;
  ungroup?(tabIds: number | number[]): Promise<AdapterResult<void>>;
  
  // Tab state queries
  getAllInWindow(windowId?: number): Promise<AdapterResult<TabInfo[]>>;
  getActive(windowId?: number): Promise<AdapterResult<TabInfo[]>>;
  getHighlighted(windowId?: number): Promise<AdapterResult<TabInfo[]>>;
  
  // Content script injection (if supported)
  executeScript?(tabId: number, details: {
    code?: string;
    file?: string;
    allFrames?: boolean;
    frameId?: number;
    matchAboutBlank?: boolean;
  }): Promise<AdapterResult<any[]>>;
  
  insertCSS?(tabId: number, details: {
    code?: string;
    file?: string;
    allFrames?: boolean;
    frameId?: number;
    matchAboutBlank?: boolean;
  }): Promise<AdapterResult<void>>;
  
  removeCSS?(tabId: number, details: {
    code?: string;
    file?: string;
    allFrames?: boolean;
    frameId?: number;
    matchAboutBlank?: boolean;
  }): Promise<AdapterResult<void>>;
  
  // Messaging
  sendMessage<T = any, R = any>(tabId: number, message: T): Promise<AdapterResult<R>>;
  connect(tabId: number, connectInfo?: { name?: string; frameId?: number }): Promise<AdapterResult<any>>;
  
  // Events
  onCreated: EventHandler<TabCreatedEvent>;
  onUpdated: EventHandler<TabUpdatedEvent>;
  onRemoved: EventHandler<TabRemovedEvent>;
  onActivated: EventHandler<TabActivatedEvent>;
  onMoved: EventHandler<TabMovedEvent>;
  onReplaced: EventHandler<TabReplacedEvent>;
  onAttached?: EventHandler<TabAttachedEvent>;
  onDetached?: EventHandler<TabDetachedEvent>;
  
  // Browser-specific feature detection
  supportsTabGroups(): boolean;
  supportsTabDiscard(): boolean;
  supportsScriptInjection(): boolean;
  supportsTabAudio(): boolean;
  getMaxTabsPerWindow(): number | null;
}