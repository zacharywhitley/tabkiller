/**
 * Shortcut Manager
 * Main manager for keyboard shortcuts, commands, and customization
 */

import { browser } from 'webextension-polyfill';
import { getBrowserType, BrowserType } from '../../browser';
import {
  ShortcutManager,
  ShortcutCommand,
  ShortcutConfig,
  ShortcutOperationResult,
  ShortcutRegistrationOptions,
  ShortcutEventHandlers,
  ShortcutCapabilities,
  ShortcutValidationResult,
  ShortcutConflict,
  ShortcutPreferences,
  ShortcutCustomization,
  KeyCombination,
  ShortcutError,
  ShortcutErrorType,
  KeyModifier
} from './types';
import { CommandRegistry, createCommandRegistry } from './command-registry';
import { ConflictDetector, createConflictDetector } from './conflict-detector';
import { shortcutUtils } from './utils';

/**
 * Default extension commands for TabKiller
 */
const DEFAULT_COMMANDS: ShortcutCommand[] = [
  {
    id: 'quick-search',
    name: 'Quick Search',
    description: 'Open quick search for tabs and history',
    category: 'search',
    defaultShortcut: { key: 'k', modifiers: ['ctrl'] },
    platformShortcuts: {
      mac: { key: 'k', modifiers: ['cmd'] }
    },
    handler: async (command, tab, context) => {
      // Will be implemented by the UI integration
      console.log('Quick search triggered', { command, tab, context });
    },
    enabled: true,
    visible: true,
    contexts: ['all']
  },
  {
    id: 'save-session',
    name: 'Save Session',
    description: 'Save current browsing session',
    category: 'sessions',
    defaultShortcut: { key: 's', modifiers: ['ctrl', 'shift'] },
    platformShortcuts: {
      mac: { key: 's', modifiers: ['cmd', 'shift'] }
    },
    handler: async (command, tab, context) => {
      console.log('Save session triggered', { command, tab, context });
    },
    enabled: true,
    visible: true,
    contexts: ['all']
  },
  {
    id: 'close-duplicate-tabs',
    name: 'Close Duplicate Tabs',
    description: 'Close duplicate tabs in current window',
    category: 'tabs',
    defaultShortcut: { key: 'd', modifiers: ['ctrl', 'shift'] },
    platformShortcuts: {
      mac: { key: 'd', modifiers: ['cmd', 'shift'] }
    },
    handler: async (command, tab, context) => {
      console.log('Close duplicate tabs triggered', { command, tab, context });
    },
    enabled: true,
    visible: true,
    contexts: ['all']
  },
  {
    id: 'open-settings',
    name: 'Open Settings',
    description: 'Open TabKiller settings',
    category: 'settings',
    defaultShortcut: { key: 'comma', modifiers: ['ctrl'] },
    platformShortcuts: {
      mac: { key: 'comma', modifiers: ['cmd'] }
    },
    handler: async (command, tab, context) => {
      if (browser.runtime?.openOptionsPage) {
        await browser.runtime.openOptionsPage();
      }
    },
    enabled: true,
    visible: true,
    contexts: ['all']
  },
  {
    id: 'toggle-extension',
    name: 'Toggle Extension',
    description: 'Enable/disable TabKiller extension',
    category: 'general',
    defaultShortcut: { key: 't', modifiers: ['ctrl', 'shift'] },
    platformShortcuts: {
      mac: { key: 't', modifiers: ['cmd', 'shift'] }
    },
    handler: async (command, tab, context) => {
      console.log('Toggle extension triggered', { command, tab, context });
    },
    enabled: true,
    visible: true,
    contexts: ['all']
  }
];

/**
 * Shortcut manager implementation
 */
export class ShortcutManagerImpl implements ShortcutManager {
  private commandRegistry: CommandRegistry;
  private conflictDetector: ConflictDetector;
  private browserType: BrowserType;
  private config: ShortcutConfig;
  private initialized = false;
  private preferences: ShortcutPreferences;

  constructor(config: ShortcutConfig = {}) {
    this.browserType = getBrowserType();
    this.config = {
      enabled: true,
      debug: false,
      enableLogging: false,
      validateOnRegistration: true,
      detectConflicts: true,
      allowCustomShortcuts: true,
      maxCustomShortcuts: 20,
      reservedShortcuts: [],
      ...config
    };

    this.commandRegistry = createCommandRegistry();
    this.conflictDetector = createConflictDetector(this.config, shortcutUtils);
    
    this.preferences = {
      customizations: {},
      globalSettings: {
        enabled: true,
        showInContextMenu: true,
        enableConflictDetection: true,
        allowOverrides: false
      },
      version: 1
    };
  }

  /**
   * Initialize the shortcut system
   */
  async initialize(config?: ShortcutConfig): Promise<ShortcutOperationResult> {
    const startTime = performance.now();

    try {
      if (this.initialized) {
        return {
          success: true,
          browserType: this.browserType,
          timing: {
            operation: 'initialize',
            duration: performance.now() - startTime,
            timestamp: Date.now()
          }
        };
      }

      // Update config if provided
      if (config) {
        this.config = { ...this.config, ...config };
      }

      // Initialize command registry
      const registryResult = await this.commandRegistry.initialize();
      if (!registryResult.success) {
        throw registryResult.error || new Error('Failed to initialize command registry');
      }

      // Load user preferences
      await this.loadPreferences();

      // Register default commands
      const commandsResult = await this.registerCommands(DEFAULT_COMMANDS, {
        validate: this.config.validateOnRegistration,
        skipConflicts: true
      });

      if (!commandsResult.success && this.config.debug) {
        console.warn('Some default commands failed to register:', commandsResult.error);
      }

      this.initialized = true;

      return {
        success: true,
        browserType: this.browserType,
        timing: {
          operation: 'initialize',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };

    } catch (error) {
      const shortcutError = error instanceof ShortcutError 
        ? error 
        : new ShortcutError(
            'API_ERROR',
            `Failed to initialize shortcut manager: ${error instanceof Error ? error.message : String(error)}`,
            this.browserType,
            undefined,
            undefined,
            undefined,
            error instanceof Error ? error : undefined
          );

      return {
        success: false,
        error: shortcutError,
        browserType: this.browserType,
        timing: {
          operation: 'initialize',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * Register a single shortcut command
   */
  async registerCommand(
    command: ShortcutCommand, 
    options: ShortcutRegistrationOptions = {}
  ): Promise<ShortcutOperationResult<string>> {
    const startTime = performance.now();

    try {
      if (!this.initialized) {
        throw new ShortcutError(
          'API_ERROR',
          'Shortcut manager not initialized',
          this.browserType,
          command.id
        );
      }

      // Apply user customizations
      const effectiveCommand = this.applyCustomizations(command);

      // Validate command if requested
      if (options.validate !== false) {
        const validation = this.validateShortcut(
          effectiveCommand.defaultShortcut || { key: '', modifiers: [] },
          effectiveCommand.id
        );

        if (!validation.valid && !options.skipConflicts) {
          throw new ShortcutError(
            'VALIDATION_FAILED',
            `Command validation failed: ${validation.errors.join(', ')}`,
            this.browserType,
            command.id,
            effectiveCommand.defaultShortcut,
            validation.conflicts
          );
        }
      }

      // Register with command registry
      return await this.commandRegistry.registerCommand(effectiveCommand, options);

    } catch (error) {
      const shortcutError = error instanceof ShortcutError 
        ? error 
        : new ShortcutError(
            'REGISTRATION_FAILED',
            `Failed to register command '${command.id}': ${error instanceof Error ? error.message : String(error)}`,
            this.browserType,
            command.id,
            undefined,
            undefined,
            error instanceof Error ? error : undefined
          );

      return {
        success: false,
        error: shortcutError,
        browserType: this.browserType,
        timing: {
          operation: 'registerCommand',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * Register multiple shortcut commands
   */
  async registerCommands(
    commands: ShortcutCommand[], 
    options: ShortcutRegistrationOptions = {}
  ): Promise<ShortcutOperationResult<string[]>> {
    return await this.commandRegistry.registerCommands(commands, options);
  }

  /**
   * Unregister a command by ID
   */
  async unregisterCommand(commandId: string): Promise<ShortcutOperationResult> {
    return await this.commandRegistry.unregisterCommand(commandId);
  }

  /**
   * Update a command's shortcut
   */
  async updateCommandShortcut(commandId: string, shortcut: KeyCombination): Promise<ShortcutOperationResult> {
    const startTime = performance.now();

    try {
      // Validate new shortcut
      const validation = this.validateShortcut(shortcut, commandId);
      if (!validation.valid) {
        throw new ShortcutError(
          'VALIDATION_FAILED',
          `Shortcut validation failed: ${validation.errors.join(', ')}`,
          this.browserType,
          commandId,
          shortcut,
          validation.conflicts
        );
      }

      // Update command registry
      const result = await this.commandRegistry.updateCommandShortcut(commandId, shortcut);
      if (!result.success) {
        return result;
      }

      // Save customization
      const customization: ShortcutCustomization = {
        commandId,
        customShortcut: shortcut,
        enabled: true,
        userModified: true,
        timestamp: Date.now()
      };

      this.preferences.customizations[commandId] = customization;
      await this.savePreferences(this.preferences);

      return {
        success: true,
        browserType: this.browserType,
        timing: {
          operation: 'updateCommandShortcut',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };

    } catch (error) {
      const shortcutError = error instanceof ShortcutError 
        ? error 
        : new ShortcutError(
            'API_ERROR',
            `Failed to update command shortcut '${commandId}': ${error instanceof Error ? error.message : String(error)}`,
            this.browserType,
            commandId,
            shortcut,
            undefined,
            error instanceof Error ? error : undefined
          );

      return {
        success: false,
        error: shortcutError,
        browserType: this.browserType,
        timing: {
          operation: 'updateCommandShortcut',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * Get all registered commands
   */
  getCommands(): ShortcutCommand[] {
    return this.commandRegistry.getCommands();
  }

  /**
   * Get a command by ID
   */
  getCommand(commandId: string): ShortcutCommand | undefined {
    return this.commandRegistry.getCommand(commandId);
  }

  /**
   * Validate a shortcut combination
   */
  validateShortcut(shortcut: KeyCombination, commandId?: string): ShortcutValidationResult {
    const existingCommands = this.getCommands();
    return this.conflictDetector.validateShortcut(shortcut, commandId, existingCommands);
  }

  /**
   * Detect conflicts for a shortcut
   */
  detectConflicts(shortcut: KeyCombination, excludeCommandId?: string): ShortcutConflict[] {
    const existingCommands = this.getCommands();
    return this.conflictDetector.detectAllConflicts(shortcut, excludeCommandId, existingCommands);
  }

  /**
   * Get browser capabilities for shortcuts
   */
  getCapabilities(): ShortcutCapabilities {
    const platformModifiers = shortcutUtils.getPlatformModifiers();
    
    return {
      supportsCommands: this.commandRegistry.isSupported(),
      supportsGlobalShortcuts: true,
      supportsCustomization: this.config.allowCustomShortcuts || false,
      maxCommands: this.config.maxCustomShortcuts || 20,
      supportedModifiers: platformModifiers,
      supportedKeys: this.getSupportedKeys(),
      reservedShortcuts: this.config.reservedShortcuts || [],
      platformLimitations: this.getPlatformLimitations()
    };
  }

  /**
   * Check if shortcuts are supported
   */
  isSupported(): boolean {
    return this.commandRegistry.isSupported();
  }

  /**
   * Set event handlers
   */
  setEventHandlers(handlers: ShortcutEventHandlers): void {
    this.commandRegistry.setEventHandlers(handlers);
  }

  /**
   * Load user preferences
   */
  async loadPreferences(): Promise<ShortcutPreferences> {
    try {
      if (browser.storage?.local) {
        const result = await browser.storage.local.get('shortcutPreferences');
        if (result.shortcutPreferences) {
          this.preferences = { ...this.preferences, ...result.shortcutPreferences };
        }
      }
    } catch (error) {
      if (this.config.debug) {
        console.warn('Failed to load shortcut preferences:', error);
      }
    }

    return this.preferences;
  }

  /**
   * Save user preferences
   */
  async savePreferences(preferences: ShortcutPreferences): Promise<void> {
    try {
      this.preferences = preferences;
      if (browser.storage?.local) {
        await browser.storage.local.set({ shortcutPreferences: preferences });
      }
    } catch (error) {
      if (this.config.debug) {
        console.warn('Failed to save shortcut preferences:', error);
      }
      throw new ShortcutError(
        'API_ERROR',
        `Failed to save preferences: ${error instanceof Error ? error.message : String(error)}`,
        this.browserType,
        undefined,
        undefined,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Reset shortcuts to defaults
   */
  async resetToDefaults(): Promise<ShortcutOperationResult> {
    const startTime = performance.now();

    try {
      // Clear customizations
      this.preferences.customizations = {};
      await this.savePreferences(this.preferences);

      // Re-register default commands
      for (const command of DEFAULT_COMMANDS) {
        await this.commandRegistry.updateCommandShortcut(
          command.id, 
          command.defaultShortcut || { key: '', modifiers: [] }
        );
      }

      return {
        success: true,
        browserType: this.browserType,
        timing: {
          operation: 'resetToDefaults',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };

    } catch (error) {
      const shortcutError = error instanceof ShortcutError 
        ? error 
        : new ShortcutError(
            'API_ERROR',
            `Failed to reset to defaults: ${error instanceof Error ? error.message : String(error)}`,
            this.browserType,
            undefined,
            undefined,
            undefined,
            error instanceof Error ? error : undefined
          );

      return {
        success: false,
        error: shortcutError,
        browserType: this.browserType,
        timing: {
          operation: 'resetToDefaults',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    await this.commandRegistry.destroy();
    this.initialized = false;
  }

  /**
   * Apply user customizations to a command
   */
  private applyCustomizations(command: ShortcutCommand): ShortcutCommand {
    const customization = this.preferences.customizations[command.id];
    if (!customization || !customization.enabled) {
      return command;
    }

    return {
      ...command,
      defaultShortcut: customization.customShortcut || command.defaultShortcut,
      enabled: customization.enabled
    };
  }

  /**
   * Get supported keys for this platform
   */
  private getSupportedKeys(): string[] {
    return [
      // Letters
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
      // Numbers
      ...'0123456789'.split(''),
      // Function keys
      ...'F1,F2,F3,F4,F5,F6,F7,F8,F9,F10,F11,F12'.split(','),
      // Special keys
      'Enter', 'Space', 'Tab', 'Escape', 'Delete', 'Backspace',
      'Insert', 'Home', 'End', 'PageUp', 'PageDown',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Up', 'Down', 'Left', 'Right'
    ];
  }

  /**
   * Get platform-specific limitations
   */
  private getPlatformLimitations(): string[] {
    const limitations: string[] = [];

    switch (this.browserType) {
      case 'firefox':
        limitations.push('Limited support for global shortcuts');
        break;
      case 'safari':
        limitations.push('No support for global shortcuts');
        break;
    }

    return limitations;
  }
}

/**
 * Create a new shortcut manager instance
 */
export function createShortcutManager(config?: ShortcutConfig): ShortcutManager {
  return new ShortcutManagerImpl(config);
}