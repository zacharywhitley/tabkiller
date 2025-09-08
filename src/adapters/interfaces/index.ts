/**
 * Main cross-browser adapter interface
 * Combines all browser API adapters into a unified interface
 */

export * from './base';
export * from './tabs';
export * from './storage';
export * from './messaging';
export * from './history';
export * from './windows';

import { 
  BaseBrowserAdapter, 
  BrowserConfig, 
  BrowserType, 
  AdapterResult,
  UnsupportedFeatureError,
  BrowserAdapterError 
} from './base';
import { TabsAdapter } from './tabs';
import { StorageAdapter } from './storage';
import { MessagingAdapter } from './messaging';
import { HistoryAdapter } from './history';
import { WindowsAdapter } from './windows';

/**
 * Additional browser APIs that may be available
 */
export interface BookmarksAdapter extends BaseBrowserAdapter {
  // Basic bookmark operations
  search(query: string): Promise<AdapterResult<BookmarkNode[]>>;
  get(idOrIdList: string | string[]): Promise<AdapterResult<BookmarkNode[]>>;
  getChildren(id: string): Promise<AdapterResult<BookmarkNode[]>>;
  getTree(): Promise<AdapterResult<BookmarkNode[]>>;
  getSubTree(id: string): Promise<AdapterResult<BookmarkNode[]>>;
  
  // Bookmark manipulation
  create(bookmark: {
    parentId?: string;
    index?: number;
    title?: string;
    url?: string;
  }): Promise<AdapterResult<BookmarkNode>>;
  
  update(id: string, changes: {
    title?: string;
    url?: string;
  }): Promise<AdapterResult<BookmarkNode>>;
  
  move(id: string, destination: {
    parentId?: string;
    index?: number;
  }): Promise<AdapterResult<BookmarkNode>>;
  
  remove(id: string): Promise<AdapterResult<void>>;
  removeTree(id: string): Promise<AdapterResult<void>>;
  
  // Events
  onCreated: any;
  onRemoved: any;
  onChanged: any;
  onMoved: any;
}

export interface BookmarkNode {
  id: string;
  parentId?: string;
  index?: number;
  url?: string;
  title: string;
  dateAdded?: number;
  dateGroupModified?: number;
  unmodifiable?: 'managed';
  children?: BookmarkNode[];
}

export interface PermissionsAdapter extends BaseBrowserAdapter {
  contains(permissions: chrome.permissions.Permissions): Promise<AdapterResult<boolean>>;
  getAll(): Promise<AdapterResult<chrome.permissions.Permissions>>;
  request(permissions: chrome.permissions.Permissions): Promise<AdapterResult<boolean>>;
  remove(permissions: chrome.permissions.Permissions): Promise<AdapterResult<boolean>>;
  
  // Events
  onAdded: any;
  onRemoved: any;
}

export interface NotificationsAdapter extends BaseBrowserAdapter {
  create(
    notificationId: string,
    options: chrome.notifications.NotificationOptions
  ): Promise<AdapterResult<string>>;
  
  update(
    notificationId: string,
    options: chrome.notifications.NotificationOptions
  ): Promise<AdapterResult<boolean>>;
  
  clear(notificationId: string): Promise<AdapterResult<boolean>>;
  getAll(): Promise<AdapterResult<Record<string, chrome.notifications.NotificationOptions>>>;
  getPermissionLevel(): Promise<AdapterResult<chrome.notifications.PermissionLevel>>;
  
  // Events
  onClosed: any;
  onClicked: any;
  onButtonClicked: any;
  onPermissionLevelChanged: any;
}

export interface ContextMenusAdapter extends BaseBrowserAdapter {
  create(createProperties: chrome.contextMenus.CreateProperties): Promise<AdapterResult<string | number>>;
  update(id: string | number, updateProperties: chrome.contextMenus.UpdateProperties): Promise<AdapterResult<void>>;
  remove(menuItemId: string | number): Promise<AdapterResult<void>>;
  removeAll(): Promise<AdapterResult<void>>;
  
  // Events
  onClicked: any;
}

export interface AlarmsAdapter extends BaseBrowserAdapter {
  create(name?: string, alarmInfo?: chrome.alarms.AlarmCreateInfo): Promise<AdapterResult<void>>;
  get(name?: string): Promise<AdapterResult<chrome.alarms.Alarm | undefined>>;
  getAll(): Promise<AdapterResult<chrome.alarms.Alarm[]>>;
  clear(name?: string): Promise<AdapterResult<boolean>>;
  clearAll(): Promise<AdapterResult<boolean>>;
  
  // Events
  onAlarm: any;
}

/**
 * Main cross-browser adapter interface
 * This is the primary interface that extensions will use
 */
export interface CrossBrowserAdapter {
  // Core configuration
  readonly config: BrowserConfig;
  readonly browserType: BrowserType;
  
  // Core API adapters (always available)
  readonly tabs: TabsAdapter;
  readonly storage: StorageAdapter;
  readonly messaging: MessagingAdapter;
  readonly windows: WindowsAdapter;
  
  // Optional API adapters (may not be available in all browsers)
  readonly history?: HistoryAdapter;
  readonly bookmarks?: BookmarksAdapter;
  readonly permissions?: PermissionsAdapter;
  readonly notifications?: NotificationsAdapter;
  readonly contextMenus?: ContextMenusAdapter;
  readonly alarms?: AlarmsAdapter;
  
  // Utility methods
  isApiSupported(api: string): boolean;
  getUnsupportedApis(): string[];
  getSupportedApis(): string[];
  
  // Feature detection
  supportsManifestV3(): boolean;
  supportsServiceWorker(): boolean;
  supportsBackgroundScripts(): boolean;
  
  // Error handling
  getLastError(): Error | null;
  handleError(error: Error, context?: string): void;
  
  // Lifecycle
  initialize(): Promise<void>;
  destroy(): Promise<void>;
  
  // Runtime information
  getManifest(): chrome.runtime.Manifest;
  getId(): string;
  getVersion(): string;
  
  // Development utilities
  isDevelopment(): boolean;
  enableDebugMode(enabled: boolean): void;
  getDebugInfo(): {
    browserType: BrowserType;
    manifestVersion: number;
    supportedApis: string[];
    config: BrowserConfig;
  };
}

/**
 * Factory function signature for creating browser adapters
 */
export interface BrowserAdapterFactory {
  create(browserType?: BrowserType): Promise<CrossBrowserAdapter>;
  detectBrowser(): BrowserType;
  isSupported(browserType: BrowserType): boolean;
  getSupportedBrowsers(): BrowserType[];
}

/**
 * Adapter registry for managing different browser implementations
 */
export interface AdapterRegistry {
  register(browserType: BrowserType, adapter: typeof CrossBrowserAdapter): void;
  unregister(browserType: BrowserType): void;
  get(browserType: BrowserType): typeof CrossBrowserAdapter | undefined;
  has(browserType: BrowserType): boolean;
  getSupportedTypes(): BrowserType[];
}

/**
 * Configuration options for the adapter system
 */
export interface AdapterSystemConfig {
  // Development options
  debug?: boolean;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  
  // Feature toggles
  enableGracefulDegradation?: boolean;
  enableRetryMechanism?: boolean;
  enableCaching?: boolean;
  
  // Performance options
  cacheTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  
  // Error handling
  throwOnUnsupportedFeature?: boolean;
  fallbackToPolyfill?: boolean;
  
  // Browser-specific overrides
  browserOverrides?: Partial<Record<BrowserType, {
    disabled?: string[]; // Disable specific APIs
    fallbacks?: Record<string, any>; // Provide fallback implementations
    config?: Partial<BrowserConfig>; // Override browser config
  }>>;
}