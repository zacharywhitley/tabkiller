/**
 * Context Menu Types and Interfaces
 * Provides type definitions for the cross-browser context menu system
 */

import { BrowserType } from '../../browser';

/**
 * Context menu item types supported across browsers
 */
export type MenuItemType = 'normal' | 'checkbox' | 'radio' | 'separator';

/**
 * Contexts where context menu items can appear
 */
export type MenuContext = 
  | 'all'
  | 'page'
  | 'frame' 
  | 'selection'
  | 'link'
  | 'editable'
  | 'image'
  | 'video'
  | 'audio'
  | 'launcher'
  | 'browser_action'
  | 'page_action'
  | 'action'; // Manifest V3

/**
 * Menu item click event information
 */
export interface MenuClickInfo {
  menuItemId: string | number;
  parentMenuItemId?: string | number;
  mediaType?: string;
  linkUrl?: string;
  srcUrl?: string;
  pageUrl?: string;
  frameUrl?: string;
  frameId?: number;
  selectionText?: string;
  editable: boolean;
  wasChecked?: boolean;
  checked?: boolean;
}

/**
 * Tab information for context menu events
 */
export interface MenuTab {
  id?: number;
  index: number;
  windowId: number;
  highlighted: boolean;
  active: boolean;
  pinned: boolean;
  audible?: boolean;
  discarded?: boolean;
  autoDiscardable?: boolean;
  mutedInfo?: {
    muted: boolean;
    reason?: string;
    extensionId?: string;
  };
  url?: string;
  pendingUrl?: string;
  title?: string;
  favIconUrl?: string;
  status?: string;
  incognito: boolean;
  width?: number;
  height?: number;
  sessionId?: string;
}

/**
 * Menu item definition interface
 */
export interface MenuItemDefinition {
  id: string;
  type?: MenuItemType;
  title?: string;
  contexts?: MenuContext[];
  onclick?: (info: MenuClickInfo, tab?: MenuTab) => void | Promise<void>;
  parentId?: string;
  documentUrlPatterns?: string[];
  targetUrlPatterns?: string[];
  enabled?: boolean;
  visible?: boolean;
  checked?: boolean;
  icons?: {
    16?: string;
    32?: string;
  };
}

/**
 * Context menu configuration
 */
export interface ContextMenuConfig {
  debug?: boolean;
  enableLogging?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  performance?: {
    enableTiming?: boolean;
    maxCreationTime?: number; // milliseconds
  };
}

/**
 * Browser-specific context menu capabilities
 */
export interface ContextMenuCapabilities {
  supportsContextMenus: boolean;
  supportsIcons: boolean;
  supportsSubmenus: boolean;
  supportsRadioGroups: boolean;
  supportsCheckboxes: boolean;
  supportedContexts: MenuContext[];
  maxMenuItems: number;
  maxNestingLevel: number;
}

/**
 * Context menu operation result
 */
export interface MenuOperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: Error;
  browserType: BrowserType;
  timing?: {
    operation: string;
    duration: number;
    timestamp: number;
  };
}

/**
 * Context menu registration options
 */
export interface MenuRegistrationOptions {
  replace?: boolean; // Replace existing menu items
  validate?: boolean; // Validate menu structure before registration
  skipUnsupported?: boolean; // Skip unsupported menu items instead of failing
}

/**
 * Context menu error types
 */
export type ContextMenuErrorType = 
  | 'UNSUPPORTED_BROWSER'
  | 'PERMISSION_DENIED'
  | 'INVALID_MENU_ITEM'
  | 'REGISTRATION_FAILED'
  | 'API_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

/**
 * Context menu error class
 */
export class ContextMenuError extends Error {
  public readonly type: ContextMenuErrorType;
  public readonly browserType: BrowserType;
  public readonly menuItemId?: string;

  constructor(
    type: ContextMenuErrorType,
    message: string,
    browserType: BrowserType,
    menuItemId?: string,
    cause?: Error
  ) {
    super(message);
    this.name = 'ContextMenuError';
    this.type = type;
    this.browserType = browserType;
    this.menuItemId = menuItemId;
    this.cause = cause;
  }
}

/**
 * Menu item validation result
 */
export interface MenuItemValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Context menu event handlers
 */
export interface ContextMenuEventHandlers {
  onMenuClick?: (info: MenuClickInfo, tab?: MenuTab) => void | Promise<void>;
  onMenuCreated?: (menuItemId: string) => void;
  onMenuRemoved?: (menuItemId: string) => void;
  onError?: (error: ContextMenuError) => void;
}

/**
 * Context menu manager interface
 */
export interface ContextMenuManager {
  /**
   * Initialize the context menu system
   */
  initialize(config?: ContextMenuConfig): Promise<MenuOperationResult>;

  /**
   * Register a single menu item
   */
  registerMenuItem(item: MenuItemDefinition, options?: MenuRegistrationOptions): Promise<MenuOperationResult<string>>;

  /**
   * Register multiple menu items
   */
  registerMenuItems(items: MenuItemDefinition[], options?: MenuRegistrationOptions): Promise<MenuOperationResult<string[]>>;

  /**
   * Remove a menu item by ID
   */
  removeMenuItem(id: string): Promise<MenuOperationResult>;

  /**
   * Remove multiple menu items by IDs
   */
  removeMenuItems(ids: string[]): Promise<MenuOperationResult>;

  /**
   * Remove all menu items
   */
  removeAllMenuItems(): Promise<MenuOperationResult>;

  /**
   * Update a menu item
   */
  updateMenuItem(id: string, properties: Partial<MenuItemDefinition>): Promise<MenuOperationResult>;

  /**
   * Get browser capabilities for context menus
   */
  getCapabilities(): ContextMenuCapabilities;

  /**
   * Check if context menus are supported
   */
  isSupported(): boolean;

  /**
   * Validate a menu item definition
   */
  validateMenuItem(item: MenuItemDefinition): MenuItemValidationResult;

  /**
   * Set event handlers
   */
  setEventHandlers(handlers: ContextMenuEventHandlers): void;

  /**
   * Get current menu items
   */
  getMenuItems(): MenuItemDefinition[];

  /**
   * Clean up resources
   */
  destroy(): Promise<void>;
}