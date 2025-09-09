/**
 * Command Registry
 * Manages registration and execution of keyboard shortcuts with chrome.commands API
 */

import { browser } from 'webextension-polyfill';
import { getBrowserType, BrowserType } from '../../browser';
import {
  ShortcutCommand,
  ShortcutOperationResult,
  ShortcutRegistrationOptions,
  ShortcutEventHandlers,
  ShortcutError,
  ShortcutErrorType,
  ShortcutExecutionContext,
  KeyCombination
} from './types';

/**
 * Command registry implementation for managing keyboard shortcuts
 */
export class CommandRegistry {
  private commands = new Map<string, ShortcutCommand>();
  private handlers: ShortcutEventHandlers = {};
  private browserType: BrowserType;
  private initialized = false;
  private commandListener?: (command: string, tab?: chrome.tabs.Tab) => void;

  constructor() {
    this.browserType = getBrowserType();
  }

  /**
   * Initialize the command registry
   */
  async initialize(): Promise<ShortcutOperationResult> {
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

      // Check if commands API is supported
      if (!this.isSupported()) {
        throw new ShortcutError(
          'UNSUPPORTED_BROWSER',
          `Commands API not supported in ${this.browserType}`,
          this.browserType
        );
      }

      // Set up command listener
      this.commandListener = (command: string, tab?: chrome.tabs.Tab) => {
        this.handleCommandTriggered(command, tab);
      };

      if (browser.commands?.onCommand) {
        browser.commands.onCommand.addListener(this.commandListener);
      }

      // Set up command change listener
      if (browser.commands?.onChanged) {
        browser.commands.onChanged.addListener((changeInfo) => {
          this.handleCommandChanged(changeInfo);
        });
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
            `Failed to initialize command registry: ${error instanceof Error ? error.message : String(error)}`,
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
   * Register a single command
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
          'Command registry not initialized',
          this.browserType,
          command.id
        );
      }

      // Check for existing command
      if (this.commands.has(command.id) && !options.replace) {
        throw new ShortcutError(
          'REGISTRATION_FAILED',
          `Command '${command.id}' already exists`,
          this.browserType,
          command.id
        );
      }

      // Validate command if requested
      if (options.validate !== false) {
        const validation = this.validateCommand(command);
        if (!validation.valid) {
          throw new ShortcutError(
            'VALIDATION_FAILED',
            `Command validation failed: ${validation.errors.join(', ')}`,
            this.browserType,
            command.id
          );
        }
      }

      // Store command
      this.commands.set(command.id, { ...command });

      // Notify handler
      if (this.handlers.onShortcutRegistered) {
        this.handlers.onShortcutRegistered(command.id);
      }

      return {
        success: true,
        data: command.id,
        browserType: this.browserType,
        timing: {
          operation: 'registerCommand',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };

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
   * Register multiple commands
   */
  async registerCommands(
    commands: ShortcutCommand[], 
    options: ShortcutRegistrationOptions = {}
  ): Promise<ShortcutOperationResult<string[]>> {
    const startTime = performance.now();
    const registeredIds: string[] = [];

    try {
      for (const command of commands) {
        const result = await this.registerCommand(command, options);
        if (result.success && result.data) {
          registeredIds.push(result.data);
        } else if (!options.skipConflicts) {
          // If we're not skipping conflicts, rollback already registered commands
          for (const id of registeredIds) {
            await this.unregisterCommand(id);
          }
          throw result.error || new ShortcutError(
            'REGISTRATION_FAILED',
            'Failed to register command batch',
            this.browserType
          );
        }
      }

      return {
        success: true,
        data: registeredIds,
        browserType: this.browserType,
        timing: {
          operation: 'registerCommands',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };

    } catch (error) {
      const shortcutError = error instanceof ShortcutError 
        ? error 
        : new ShortcutError(
            'REGISTRATION_FAILED',
            `Failed to register commands: ${error instanceof Error ? error.message : String(error)}`,
            this.browserType,
            undefined,
            undefined,
            undefined,
            error instanceof Error ? error : undefined
          );

      return {
        success: false,
        error: shortcutError,
        data: registeredIds,
        browserType: this.browserType,
        timing: {
          operation: 'registerCommands',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * Unregister a command
   */
  async unregisterCommand(commandId: string): Promise<ShortcutOperationResult> {
    const startTime = performance.now();

    try {
      if (!this.commands.has(commandId)) {
        throw new ShortcutError(
          'INVALID_SHORTCUT',
          `Command '${commandId}' not found`,
          this.browserType,
          commandId
        );
      }

      this.commands.delete(commandId);

      // Notify handler
      if (this.handlers.onShortcutUnregistered) {
        this.handlers.onShortcutUnregistered(commandId);
      }

      return {
        success: true,
        browserType: this.browserType,
        timing: {
          operation: 'unregisterCommand',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };

    } catch (error) {
      const shortcutError = error instanceof ShortcutError 
        ? error 
        : new ShortcutError(
            'API_ERROR',
            `Failed to unregister command '${commandId}': ${error instanceof Error ? error.message : String(error)}`,
            this.browserType,
            commandId,
            undefined,
            undefined,
            error instanceof Error ? error : undefined
          );

      return {
        success: false,
        error: shortcutError,
        browserType: this.browserType,
        timing: {
          operation: 'unregisterCommand',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * Update command shortcut
   */
  async updateCommandShortcut(
    commandId: string, 
    shortcut: KeyCombination
  ): Promise<ShortcutOperationResult> {
    const startTime = performance.now();

    try {
      const command = this.commands.get(commandId);
      if (!command) {
        throw new ShortcutError(
          'INVALID_SHORTCUT',
          `Command '${commandId}' not found`,
          this.browserType,
          commandId
        );
      }

      // Update shortcut using browser API if available
      if (browser.commands?.update) {
        const shortcutString = this.formatShortcutString(shortcut);
        await browser.commands.update({
          name: commandId,
          shortcut: shortcutString
        });
      }

      // Update local command
      command.defaultShortcut = shortcut;
      this.commands.set(commandId, command);

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
    return Array.from(this.commands.values());
  }

  /**
   * Get command by ID
   */
  getCommand(commandId: string): ShortcutCommand | undefined {
    return this.commands.get(commandId);
  }

  /**
   * Set event handlers
   */
  setEventHandlers(handlers: ShortcutEventHandlers): void {
    this.handlers = { ...handlers };
  }

  /**
   * Check if commands API is supported
   */
  isSupported(): boolean {
    return !!(browser.commands && browser.commands.onCommand);
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    if (this.commandListener && browser.commands?.onCommand) {
      browser.commands.onCommand.removeListener(this.commandListener);
    }

    this.commands.clear();
    this.handlers = {};
    this.initialized = false;
  }

  /**
   * Handle command triggered event
   */
  private async handleCommandTriggered(command: string, tab?: chrome.tabs.Tab): Promise<void> {
    try {
      const shortcutCommand = this.commands.get(command);
      if (!shortcutCommand) {
        if (this.handlers.onError) {
          this.handlers.onError(new ShortcutError(
            'INVALID_SHORTCUT',
            `Unknown command triggered: ${command}`,
            this.browserType,
            command
          ));
        }
        return;
      }

      if (!shortcutCommand.enabled) {
        return;
      }

      const context: ShortcutExecutionContext = {
        timestamp: Date.now(),
        source: 'keyboard',
        browserType: this.browserType,
        activeTab: tab,
        windowId: tab?.windowId
      };

      // Call handler
      if (this.handlers.onShortcutTriggered) {
        await this.handlers.onShortcutTriggered(command, tab, context);
      }

      // Call command handler
      await shortcutCommand.handler(command, tab, context);

    } catch (error) {
      if (this.handlers.onError) {
        this.handlers.onError(new ShortcutError(
          'API_ERROR',
          `Error handling command '${command}': ${error instanceof Error ? error.message : String(error)}`,
          this.browserType,
          command,
          undefined,
          undefined,
          error instanceof Error ? error : undefined
        ));
      }
    }
  }

  /**
   * Handle command changed event
   */
  private handleCommandChanged(changeInfo: any): void {
    try {
      const { name, newShortcut, oldShortcut } = changeInfo;
      
      if (this.handlers.onShortcutChanged) {
        const oldCombination = oldShortcut ? this.parseShortcutString(oldShortcut) : undefined;
        const newCombination = newShortcut ? this.parseShortcutString(newShortcut) : undefined;
        this.handlers.onShortcutChanged(name, oldCombination, newCombination);
      }

    } catch (error) {
      if (this.handlers.onError) {
        this.handlers.onError(new ShortcutError(
          'API_ERROR',
          `Error handling command change: ${error instanceof Error ? error.message : String(error)}`,
          this.browserType,
          undefined,
          undefined,
          undefined,
          error instanceof Error ? error : undefined
        ));
      }
    }
  }

  /**
   * Validate command definition
   */
  private validateCommand(command: ShortcutCommand): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!command.id) {
      errors.push('Command ID is required');
    }

    if (!command.name) {
      errors.push('Command name is required');
    }

    if (!command.handler) {
      errors.push('Command handler is required');
    }

    if (command.defaultShortcut && !this.isValidShortcut(command.defaultShortcut)) {
      errors.push('Invalid default shortcut combination');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if shortcut combination is valid
   */
  private isValidShortcut(shortcut: KeyCombination): boolean {
    if (!shortcut.key) {
      return false;
    }

    // Basic validation - can be extended
    const validKeys = /^[a-zA-Z0-9]$|^F[1-9]|F1[0-2]$|^(Enter|Space|Tab|Escape|Delete|Backspace|Insert|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/;
    return validKeys.test(shortcut.key);
  }

  /**
   * Format key combination to shortcut string
   */
  private formatShortcutString(combination: KeyCombination): string {
    const modifiers = combination.modifiers.map(mod => {
      switch (mod) {
        case 'ctrl': return 'Ctrl';
        case 'alt': return 'Alt';
        case 'shift': return 'Shift';
        case 'meta':
        case 'cmd': return 'Command';
        default: return mod;
      }
    });

    return [...modifiers, combination.key].join('+');
  }

  /**
   * Parse shortcut string to key combination
   */
  private parseShortcutString(shortcut: string): KeyCombination | null {
    const parts = shortcut.split('+').map(p => p.trim());
    if (parts.length === 0) {
      return null;
    }

    const key = parts[parts.length - 1];
    const modifiers = parts.slice(0, -1).map(mod => {
      switch (mod.toLowerCase()) {
        case 'ctrl':
        case 'control': return 'ctrl';
        case 'alt': return 'alt';
        case 'shift': return 'shift';
        case 'command':
        case 'cmd':
        case 'meta': return 'meta';
        default: return mod.toLowerCase() as any;
      }
    });

    return { key, modifiers };
  }
}

/**
 * Create a new command registry instance
 */
export function createCommandRegistry(): CommandRegistry {
  return new CommandRegistry();
}