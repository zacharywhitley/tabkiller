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
  // Content script specific
  | 'capture-page'
  | 'get-form-data'  
  | 'get-scroll-position';

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

// Error types
export interface ExtensionError {
  code: string;
  message: string;
  details?: unknown;
  timestamp: number;
  component: 'background' | 'content' | 'popup' | 'sync';
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

// Event types
export interface TabEvent {
  type: 'created' | 'updated' | 'removed' | 'activated';
  tabId: number;
  windowId: number;
  timestamp: number;
  data?: Partial<TabInfo>;
}

export interface WindowEvent {
  type: 'created' | 'removed' | 'focus_changed';
  windowId: number;
  timestamp: number;
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