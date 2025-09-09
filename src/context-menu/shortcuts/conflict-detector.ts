/**
 * Conflict Detector
 * Detects and resolves keyboard shortcut conflicts
 */

import { getBrowserType, BrowserType } from '../../browser';
import {
  KeyCombination,
  ShortcutConflict,
  ConflictType,
  ShortcutValidationResult,
  ShortcutCommand,
  ShortcutConfig,
  ShortcutUtils
} from './types';

/**
 * Platform-specific reserved shortcuts
 */
const RESERVED_SHORTCUTS: Record<string, KeyCombination[]> = {
  windows: [
    { key: 'Tab', modifiers: ['alt'] },
    { key: 'F4', modifiers: ['alt'] },
    { key: 'l', modifiers: ['ctrl'] },
    { key: 'n', modifiers: ['ctrl'] },
    { key: 't', modifiers: ['ctrl'] },
    { key: 'w', modifiers: ['ctrl'] },
    { key: 'r', modifiers: ['ctrl'] },
    { key: 'F5', modifiers: [] },
    { key: 'F12', modifiers: [] }
  ],
  mac: [
    { key: 'Tab', modifiers: ['cmd'] },
    { key: 'q', modifiers: ['cmd'] },
    { key: 'w', modifiers: ['cmd'] },
    { key: 'n', modifiers: ['cmd'] },
    { key: 't', modifiers: ['cmd'] },
    { key: 'r', modifiers: ['cmd'] },
    { key: 'l', modifiers: ['cmd'] },
    { key: 'Space', modifiers: ['cmd'] },
    { key: 'F5', modifiers: [] }
  ],
  linux: [
    { key: 'Tab', modifiers: ['alt'] },
    { key: 'F4', modifiers: ['alt'] },
    { key: 'l', modifiers: ['ctrl'] },
    { key: 'n', modifiers: ['ctrl'] },
    { key: 't', modifiers: ['ctrl'] },
    { key: 'w', modifiers: ['ctrl'] },
    { key: 'r', modifiers: ['ctrl'] },
    { key: 'F5', modifiers: [] },
    { key: 'F12', modifiers: [] }
  ]
};

/**
 * Browser-specific reserved shortcuts
 */
const BROWSER_SHORTCUTS: Record<BrowserType, KeyCombination[]> = {
  chrome: [
    { key: 'j', modifiers: ['ctrl', 'shift'] },
    { key: 'i', modifiers: ['ctrl', 'shift'] },
    { key: 'c', modifiers: ['ctrl', 'shift'] },
    { key: 'Delete', modifiers: ['ctrl', 'shift'] },
    { key: 'n', modifiers: ['ctrl', 'shift'] },
    { key: 't', modifiers: ['ctrl', 'shift'] }
  ],
  firefox: [
    { key: 'j', modifiers: ['ctrl', 'shift'] },
    { key: 'k', modifiers: ['ctrl', 'shift'] },
    { key: 'i', modifiers: ['ctrl', 'shift'] },
    { key: 'c', modifiers: ['ctrl', 'shift'] },
    { key: 'e', modifiers: ['ctrl', 'shift'] }
  ],
  safari: [
    { key: 'i', modifiers: ['cmd', 'alt'] },
    { key: 'c', modifiers: ['cmd', 'alt'] },
    { key: 'j', modifiers: ['cmd', 'alt'] },
    { key: 'r', modifiers: ['cmd', 'alt'] }
  ],
  edge: [
    { key: 'j', modifiers: ['ctrl', 'shift'] },
    { key: 'i', modifiers: ['ctrl', 'shift'] },
    { key: 'c', modifiers: ['ctrl', 'shift'] },
    { key: 'Delete', modifiers: ['ctrl', 'shift'] }
  ],
  unknown: []
};

/**
 * Accessibility-related shortcuts that should be avoided
 */
const ACCESSIBILITY_SHORTCUTS: KeyCombination[] = [
  { key: 'Tab', modifiers: [] },
  { key: 'Tab', modifiers: ['shift'] },
  { key: 'Enter', modifiers: [] },
  { key: 'Space', modifiers: [] },
  { key: 'Escape', modifiers: [] },
  { key: 'F6', modifiers: [] },
  { key: 'F1', modifiers: [] },
  { key: 'F10', modifiers: [] }
];

/**
 * Conflict detector implementation
 */
export class ConflictDetector {
  private browserType: BrowserType;
  private platform: string;
  private config: ShortcutConfig;
  private utils: ShortcutUtils;

  constructor(config: ShortcutConfig = {}, utils: ShortcutUtils) {
    this.browserType = getBrowserType();
    this.platform = this.getPlatform();
    this.config = config;
    this.utils = utils;
  }

  /**
   * Validate a shortcut combination
   */
  validateShortcut(
    shortcut: KeyCombination, 
    commandId?: string,
    existingCommands: ShortcutCommand[] = []
  ): ShortcutValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts: ShortcutConflict[] = [];

    // Basic validation
    if (!this.isValidCombination(shortcut)) {
      errors.push('Invalid key combination');
    }

    // Detect various types of conflicts
    if (this.config.detectConflicts !== false) {
      conflicts.push(...this.detectAllConflicts(shortcut, commandId, existingCommands));
    }

    // Convert conflicts to errors/warnings
    conflicts.forEach(conflict => {
      if (conflict.severity === 'error') {
        errors.push(conflict.suggestion || `Conflict detected: ${conflict.type}`);
      } else if (conflict.severity === 'warning') {
        warnings.push(conflict.suggestion || `Potential conflict: ${conflict.type}`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      conflicts
    };
  }

  /**
   * Detect all types of conflicts for a shortcut
   */
  detectAllConflicts(
    shortcut: KeyCombination,
    excludeCommandId?: string,
    existingCommands: ShortcutCommand[] = []
  ): ShortcutConflict[] {
    const conflicts: ShortcutConflict[] = [];

    // Check for duplicate extension commands
    const duplicateConflict = this.detectDuplicateCommands(shortcut, excludeCommandId, existingCommands);
    if (duplicateConflict) {
      conflicts.push(duplicateConflict);
    }

    // Check for browser reserved shortcuts
    const browserConflict = this.detectBrowserConflicts(shortcut);
    if (browserConflict) {
      conflicts.push(browserConflict);
    }

    // Check for platform reserved shortcuts
    const platformConflict = this.detectPlatformConflicts(shortcut);
    if (platformConflict) {
      conflicts.push(platformConflict);
    }

    // Check for accessibility conflicts
    const accessibilityConflict = this.detectAccessibilityConflicts(shortcut);
    if (accessibilityConflict) {
      conflicts.push(accessibilityConflict);
    }

    // Check for invalid combinations
    const invalidConflict = this.detectInvalidCombinations(shortcut);
    if (invalidConflict) {
      conflicts.push(invalidConflict);
    }

    return conflicts;
  }

  /**
   * Detect conflicts with existing extension commands
   */
  private detectDuplicateCommands(
    shortcut: KeyCombination,
    excludeCommandId?: string,
    existingCommands: ShortcutCommand[] = []
  ): ShortcutConflict | null {
    for (const command of existingCommands) {
      if (command.id === excludeCommandId) {
        continue;
      }

      const commandShortcut = this.getEffectiveShortcut(command);
      if (commandShortcut && this.utils.compareCombinations(shortcut, commandShortcut)) {
        return {
          type: 'duplicate_extension',
          conflictingShortcut: shortcut,
          existingCommand: command.id,
          severity: 'error',
          suggestion: `Shortcut already used by command '${command.name}'`
        };
      }
    }

    return null;
  }

  /**
   * Detect conflicts with browser shortcuts
   */
  private detectBrowserConflicts(shortcut: KeyCombination): ShortcutConflict | null {
    const browserShortcuts = BROWSER_SHORTCUTS[this.browserType] || [];

    for (const browserShortcut of browserShortcuts) {
      if (this.utils.compareCombinations(shortcut, browserShortcut)) {
        return {
          type: 'browser_reserved',
          conflictingShortcut: shortcut,
          browserCommand: this.utils.formatShortcutString(browserShortcut),
          severity: 'warning',
          suggestion: `This shortcut may conflict with browser functionality`
        };
      }
    }

    return null;
  }

  /**
   * Detect conflicts with platform shortcuts
   */
  private detectPlatformConflicts(shortcut: KeyCombination): ShortcutConflict | null {
    const platformShortcuts = RESERVED_SHORTCUTS[this.platform] || [];

    for (const platformShortcut of platformShortcuts) {
      if (this.utils.compareCombinations(shortcut, platformShortcut)) {
        return {
          type: 'platform_reserved',
          conflictingShortcut: shortcut,
          severity: 'warning',
          suggestion: `This shortcut may conflict with ${this.platform} system shortcuts`
        };
      }
    }

    return null;
  }

  /**
   * Detect accessibility conflicts
   */
  private detectAccessibilityConflicts(shortcut: KeyCombination): ShortcutConflict | null {
    for (const accessibilityShortcut of ACCESSIBILITY_SHORTCUTS) {
      if (this.utils.compareCombinations(shortcut, accessibilityShortcut)) {
        return {
          type: 'accessibility_conflict',
          conflictingShortcut: shortcut,
          severity: 'warning',
          suggestion: 'This shortcut may interfere with accessibility features'
        };
      }
    }

    return null;
  }

  /**
   * Detect invalid key combinations
   */
  private detectInvalidCombinations(shortcut: KeyCombination): ShortcutConflict | null {
    // Check for invalid modifier combinations
    if (shortcut.modifiers.length === 0 && this.isSpecialKey(shortcut.key)) {
      return {
        type: 'invalid_combination',
        conflictingShortcut: shortcut,
        severity: 'error',
        suggestion: 'Special keys should be combined with modifiers'
      };
    }

    // Check for too many modifiers
    if (shortcut.modifiers.length > 3) {
      return {
        type: 'invalid_combination',
        conflictingShortcut: shortcut,
        severity: 'warning',
        suggestion: 'Too many modifiers may make the shortcut difficult to use'
      };
    }

    // Check for conflicting modifiers
    if (this.hasConflictingModifiers(shortcut.modifiers)) {
      return {
        type: 'invalid_combination',
        conflictingShortcut: shortcut,
        severity: 'error',
        suggestion: 'Conflicting modifiers detected'
      };
    }

    return null;
  }

  /**
   * Get effective shortcut for a command (considering platform overrides)
   */
  private getEffectiveShortcut(command: ShortcutCommand): KeyCombination | undefined {
    // Check platform-specific shortcuts first
    if (command.platformShortcuts) {
      switch (this.platform) {
        case 'mac':
          if (command.platformShortcuts.mac) {
            return command.platformShortcuts.mac;
          }
          break;
        case 'windows':
          if (command.platformShortcuts.windows) {
            return command.platformShortcuts.windows;
          }
          break;
        case 'linux':
          if (command.platformShortcuts.linux) {
            return command.platformShortcuts.linux;
          }
          break;
      }
    }

    return command.defaultShortcut;
  }

  /**
   * Check if key combination is valid
   */
  private isValidCombination(combination: KeyCombination): boolean {
    if (!combination.key) {
      return false;
    }

    // Check if key is valid
    if (!this.isValidKey(combination.key)) {
      return false;
    }

    // Check if modifiers are valid
    for (const modifier of combination.modifiers) {
      if (!this.isValidModifier(modifier)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if key is valid
   */
  private isValidKey(key: string): boolean {
    const validKeys = /^[a-zA-Z0-9]$|^F[1-9]|F1[0-2]$|^(Enter|Space|Tab|Escape|Delete|Backspace|Insert|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/;
    return validKeys.test(key);
  }

  /**
   * Check if modifier is valid
   */
  private isValidModifier(modifier: string): boolean {
    const validModifiers = ['ctrl', 'alt', 'shift', 'meta', 'cmd'];
    return validModifiers.includes(modifier);
  }

  /**
   * Check if key is a special key
   */
  private isSpecialKey(key: string): boolean {
    const specialKeys = ['Enter', 'Space', 'Tab', 'Escape', 'Delete', 'Backspace', 'Insert', 'Home', 'End', 'PageUp', 'PageDown'];
    return specialKeys.includes(key) || /^Arrow/.test(key) || /^F\d+$/.test(key);
  }

  /**
   * Check for conflicting modifiers
   */
  private hasConflictingModifiers(modifiers: string[]): boolean {
    // Check for both ctrl and cmd/meta
    const hasCtrl = modifiers.includes('ctrl');
    const hasCmd = modifiers.includes('cmd') || modifiers.includes('meta');
    
    if (hasCtrl && hasCmd) {
      return true;
    }

    // Check for duplicate modifiers
    const uniqueModifiers = new Set(modifiers);
    return uniqueModifiers.size !== modifiers.length;
  }

  /**
   * Get current platform
   */
  private getPlatform(): string {
    if (typeof navigator !== 'undefined') {
      const platform = navigator.platform.toLowerCase();
      if (platform.includes('mac')) {
        return 'mac';
      } else if (platform.includes('win')) {
        return 'windows';
      } else if (platform.includes('linux')) {
        return 'linux';
      }
    }

    // Fallback detection
    if (typeof process !== 'undefined') {
      switch (process.platform) {
        case 'darwin': return 'mac';
        case 'win32': return 'windows';
        case 'linux': return 'linux';
        default: return 'unknown';
      }
    }

    return 'unknown';
  }

  /**
   * Generate alternative shortcut suggestions
   */
  generateAlternatives(originalShortcut: KeyCombination): KeyCombination[] {
    const alternatives: KeyCombination[] = [];

    // Try different modifier combinations
    const alternativeModifiers = [
      ['ctrl', 'shift'],
      ['alt', 'shift'],
      ['ctrl', 'alt'],
      ['ctrl', 'shift', 'alt']
    ];

    for (const modifiers of alternativeModifiers) {
      const alternative = { ...originalShortcut, modifiers };
      if (this.isValidCombination(alternative)) {
        alternatives.push(alternative);
      }
    }

    // Try similar keys
    const similarKeys = this.getSimilarKeys(originalShortcut.key);
    for (const key of similarKeys) {
      const alternative = { ...originalShortcut, key };
      if (this.isValidCombination(alternative)) {
        alternatives.push(alternative);
      }
    }

    return alternatives.slice(0, 5); // Limit to 5 suggestions
  }

  /**
   * Get similar keys for suggestions
   */
  private getSimilarKeys(key: string): string[] {
    const keyGroups: Record<string, string[]> = {
      'a': ['s', 'd', 'q', 'w'],
      's': ['a', 'd', 'w', 'e'],
      'd': ['s', 'f', 'e', 'r'],
      'f': ['d', 'g', 'r', 't'],
      'j': ['h', 'k', 'u', 'i'],
      'k': ['j', 'l', 'i', 'o'],
      'l': ['k', 'o', 'p'],
      'n': ['b', 'm', 'h', 'j'],
      'm': ['n', 'j', 'k'],
    };

    return keyGroups[key.toLowerCase()] || [];
  }
}

/**
 * Create a new conflict detector instance
 */
export function createConflictDetector(config?: ShortcutConfig, utils?: ShortcutUtils): ConflictDetector {
  if (!utils) {
    throw new Error('ShortcutUtils is required for ConflictDetector');
  }
  return new ConflictDetector(config, utils);
}