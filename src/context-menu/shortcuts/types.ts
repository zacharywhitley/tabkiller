/**
 * Keyboard Shortcuts Types and Interfaces
 * Provides type definitions for the cross-browser keyboard shortcuts system
 */

import { BrowserType } from '../../browser';

/**
 * Keyboard shortcut key combinations
 */
export interface KeyCombination {
  key: string;
  modifiers: KeyModifier[];
  code?: string; // Physical key code for better compatibility
}

/**
 * Supported keyboard modifiers
 */
export type KeyModifier = 'ctrl' | 'alt' | 'shift' | 'meta' | 'cmd';

/**
 * Platform-specific modifier mappings
 */
export interface PlatformModifiers {
  mac: KeyModifier[];
  windows: KeyModifier[];
  linux: KeyModifier[];
}

/**
 * Shortcut command definition
 */
export interface ShortcutCommand {
  id: string;
  name: string;
  description: string;
  category: ShortcutCategory;
  defaultShortcut?: KeyCombination;
  platformShortcuts?: {
    mac?: KeyCombination;
    windows?: KeyCombination;
    linux?: KeyCombination;
  };
  handler: ShortcutHandler;
  enabled: boolean;
  visible: boolean;
  contexts?: ShortcutContext[];
}

/**
 * Shortcut command categories for organization
 */
export type ShortcutCategory = 
  | 'navigation'
  | 'tabs'
  | 'windows'
  | 'bookmarks'
  | 'search'
  | 'settings'
  | 'general'
  | 'custom';

/**
 * Contexts where shortcuts are active
 */
export type ShortcutContext = 
  | 'all'
  | 'page'
  | 'popup'
  | 'options'
  | 'background'
  | 'content_script';

/**
 * Shortcut handler function
 */
export type ShortcutHandler = (
  command: string,
  tab?: chrome.tabs.Tab,
  context?: ShortcutExecutionContext
) => void | Promise<void>;

/**
 * Execution context information
 */
export interface ShortcutExecutionContext {
  timestamp: number;
  source: 'keyboard' | 'menu' | 'api';
  browserType: BrowserType;
  activeTab?: chrome.tabs.Tab;
  windowId?: number;
}

/**
 * Keyboard shortcut registration options
 */
export interface ShortcutRegistrationOptions {
  replace?: boolean; // Replace existing shortcuts
  validate?: boolean; // Validate shortcuts before registration
  skipConflicts?: boolean; // Skip conflicting shortcuts instead of failing
  detectConflicts?: boolean; // Check for conflicts with browser shortcuts
}

/**
 * Shortcut validation result
 */
export interface ShortcutValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  conflicts: ShortcutConflict[];
}

/**
 * Shortcut conflict information
 */
export interface ShortcutConflict {
  type: ConflictType;
  conflictingShortcut: KeyCombination;
  existingCommand?: string;
  browserCommand?: string;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
}

/**
 * Types of shortcut conflicts
 */
export type ConflictType = 
  | 'duplicate_extension'
  | 'browser_reserved'
  | 'platform_reserved'
  | 'invalid_combination'
  | 'accessibility_conflict';

/**
 * Keyboard shortcut configuration
 */
export interface ShortcutConfig {
  enabled?: boolean;
  debug?: boolean;
  enableLogging?: boolean;
  validateOnRegistration?: boolean;
  detectConflicts?: boolean;
  allowCustomShortcuts?: boolean;
  maxCustomShortcuts?: number;
  reservedShortcuts?: KeyCombination[];
  platformSettings?: {
    mac?: {
      useCommandKey?: boolean;
      allowFunctionKeys?: boolean;
    };
    windows?: {
      useControlKey?: boolean;
      allowAltModifier?: boolean;
    };
    linux?: {
      useControlKey?: boolean;
      allowSuperKey?: boolean;
    };
  };
}

/**
 * Browser-specific shortcut capabilities
 */
export interface ShortcutCapabilities {
  supportsCommands: boolean;
  supportsGlobalShortcuts: boolean;
  supportsCustomization: boolean;
  maxCommands: number;
  supportedModifiers: KeyModifier[];
  supportedKeys: string[];
  reservedShortcuts: KeyCombination[];
  platformLimitations: string[];
}

/**
 * Shortcut operation result
 */
export interface ShortcutOperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: Error;
  browserType: BrowserType;
  conflicts?: ShortcutConflict[];
  timing?: {
    operation: string;
    duration: number;
    timestamp: number;
  };
}

/**
 * Shortcut error types
 */
export type ShortcutErrorType = 
  | 'UNSUPPORTED_BROWSER'
  | 'INVALID_SHORTCUT'
  | 'REGISTRATION_FAILED'
  | 'CONFLICT_DETECTED'
  | 'PERMISSION_DENIED'
  | 'API_ERROR'
  | 'VALIDATION_FAILED'
  | 'UNKNOWN';

/**
 * Shortcut error class
 */
export class ShortcutError extends Error {
  public readonly type: ShortcutErrorType;
  public readonly browserType: BrowserType;
  public readonly commandId?: string;
  public readonly shortcut?: KeyCombination;
  public readonly conflicts?: ShortcutConflict[];

  constructor(
    type: ShortcutErrorType,
    message: string,
    browserType: BrowserType,
    commandId?: string,
    shortcut?: KeyCombination,
    conflicts?: ShortcutConflict[],
    cause?: Error
  ) {
    super(message);
    this.name = 'ShortcutError';
    this.type = type;
    this.browserType = browserType;
    this.commandId = commandId;
    this.shortcut = shortcut;
    this.conflicts = conflicts;
    this.cause = cause;
  }
}

/**
 * Shortcut event handlers
 */
export interface ShortcutEventHandlers {
  onShortcutTriggered?: (command: string, tab?: chrome.tabs.Tab, context?: ShortcutExecutionContext) => void | Promise<void>;
  onShortcutChanged?: (commandId: string, oldShortcut?: KeyCombination, newShortcut?: KeyCombination) => void;
  onShortcutRegistered?: (commandId: string) => void;
  onShortcutUnregistered?: (commandId: string) => void;
  onConflictDetected?: (conflict: ShortcutConflict) => void;
  onError?: (error: ShortcutError) => void;
}

/**
 * Shortcut customization settings
 */
export interface ShortcutCustomization {
  commandId: string;
  customShortcut?: KeyCombination;
  enabled: boolean;
  userModified: boolean;
  timestamp: number;
}

/**
 * User shortcut preferences
 */
export interface ShortcutPreferences {
  customizations: Record<string, ShortcutCustomization>;
  globalSettings: {
    enabled: boolean;
    showInContextMenu: boolean;
    enableConflictDetection: boolean;
    allowOverrides: boolean;
  };
  version: number;
}

/**
 * Shortcut manager interface
 */
export interface ShortcutManager {
  /**
   * Initialize the shortcut system
   */
  initialize(config?: ShortcutConfig): Promise<ShortcutOperationResult>;

  /**
   * Register a single shortcut command
   */
  registerCommand(command: ShortcutCommand, options?: ShortcutRegistrationOptions): Promise<ShortcutOperationResult<string>>;

  /**
   * Register multiple shortcut commands
   */
  registerCommands(commands: ShortcutCommand[], options?: ShortcutRegistrationOptions): Promise<ShortcutOperationResult<string[]>>;

  /**
   * Unregister a command by ID
   */
  unregisterCommand(commandId: string): Promise<ShortcutOperationResult>;

  /**
   * Update a command's shortcut
   */
  updateCommandShortcut(commandId: string, shortcut: KeyCombination): Promise<ShortcutOperationResult>;

  /**
   * Get all registered commands
   */
  getCommands(): ShortcutCommand[];

  /**
   * Get a command by ID
   */
  getCommand(commandId: string): ShortcutCommand | undefined;

  /**
   * Validate a shortcut combination
   */
  validateShortcut(shortcut: KeyCombination, commandId?: string): ShortcutValidationResult;

  /**
   * Detect conflicts for a shortcut
   */
  detectConflicts(shortcut: KeyCombination, excludeCommandId?: string): ShortcutConflict[];

  /**
   * Get browser capabilities for shortcuts
   */
  getCapabilities(): ShortcutCapabilities;

  /**
   * Check if shortcuts are supported
   */
  isSupported(): boolean;

  /**
   * Set event handlers
   */
  setEventHandlers(handlers: ShortcutEventHandlers): void;

  /**
   * Load user preferences
   */
  loadPreferences(): Promise<ShortcutPreferences>;

  /**
   * Save user preferences
   */
  savePreferences(preferences: ShortcutPreferences): Promise<void>;

  /**
   * Reset shortcuts to defaults
   */
  resetToDefaults(): Promise<ShortcutOperationResult>;

  /**
   * Clean up resources
   */
  destroy(): Promise<void>;
}

/**
 * Shortcut utility functions interface
 */
export interface ShortcutUtils {
  /**
   * Parse shortcut string to KeyCombination
   */
  parseShortcutString(shortcut: string): KeyCombination | null;

  /**
   * Format KeyCombination to string
   */
  formatShortcutString(combination: KeyCombination): string;

  /**
   * Check if key combination is valid
   */
  isValidCombination(combination: KeyCombination): boolean;

  /**
   * Get platform-specific modifiers
   */
  getPlatformModifiers(): KeyModifier[];

  /**
   * Normalize key combination for platform
   */
  normalizeCombination(combination: KeyCombination): KeyCombination;

  /**
   * Compare two key combinations
   */
  compareCombinations(a: KeyCombination, b: KeyCombination): boolean;
}