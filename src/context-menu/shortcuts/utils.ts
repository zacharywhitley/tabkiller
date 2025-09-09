/**
 * Shortcut Utilities
 * Utility functions for keyboard shortcut handling and manipulation
 */

import { getBrowserType } from '../../browser';
import {
  KeyCombination,
  KeyModifier,
  ShortcutUtils,
  PlatformModifiers
} from './types';

/**
 * Platform-specific modifier mappings
 */
const PLATFORM_MODIFIERS: Record<string, PlatformModifiers> = {
  mac: {
    mac: ['cmd', 'alt', 'shift', 'ctrl'],
    windows: ['ctrl', 'alt', 'shift'],
    linux: ['ctrl', 'alt', 'shift']
  },
  windows: {
    mac: ['cmd', 'alt', 'shift'],
    windows: ['ctrl', 'alt', 'shift'],
    linux: ['ctrl', 'alt', 'shift']
  },
  linux: {
    mac: ['cmd', 'alt', 'shift'],
    windows: ['ctrl', 'alt', 'shift'],
    linux: ['ctrl', 'alt', 'shift']
  }
};

/**
 * Key name mappings for normalization
 */
const KEY_MAPPINGS: Record<string, string> = {
  // Arrow keys
  'ArrowUp': 'Up',
  'ArrowDown': 'Down',
  'ArrowLeft': 'Left',
  'ArrowRight': 'Right',
  
  // Common variations
  'Control': 'Ctrl',
  'Command': 'Cmd',
  'Meta': 'Cmd',
  'Option': 'Alt',
  
  // Number pad
  'Numpad0': '0',
  'Numpad1': '1',
  'Numpad2': '2',
  'Numpad3': '3',
  'Numpad4': '4',
  'Numpad5': '5',
  'Numpad6': '6',
  'Numpad7': '7',
  'Numpad8': '8',
  'Numpad9': '9',
  
  // Special keys
  'Return': 'Enter',
  'Del': 'Delete',
  'Esc': 'Escape'
};

/**
 * Modifier name mappings
 */
const MODIFIER_MAPPINGS: Record<string, KeyModifier> = {
  'control': 'ctrl',
  'ctrl': 'ctrl',
  'alt': 'alt',
  'option': 'alt',
  'shift': 'shift',
  'meta': 'meta',
  'cmd': 'meta',
  'command': 'meta',
  'super': 'meta'
};

/**
 * Implementation of shortcut utilities
 */
export class ShortcutUtilsImpl implements ShortcutUtils {
  private platform: string;
  private browserType = getBrowserType();

  constructor() {
    this.platform = this.detectPlatform();
  }

  /**
   * Parse shortcut string to KeyCombination
   */
  parseShortcutString(shortcut: string): KeyCombination | null {
    if (!shortcut || typeof shortcut !== 'string') {
      return null;
    }

    try {
      // Split by + and clean up parts
      const parts = shortcut.split('+').map(part => part.trim());
      
      if (parts.length === 0) {
        return null;
      }

      // Last part is the key
      const rawKey = parts[parts.length - 1];
      const key = this.normalizeKey(rawKey);

      // Other parts are modifiers
      const modifiers: KeyModifier[] = [];
      for (let i = 0; i < parts.length - 1; i++) {
        const modifier = this.normalizeModifier(parts[i]);
        if (modifier && !modifiers.includes(modifier)) {
          modifiers.push(modifier);
        }
      }

      // Sort modifiers for consistency
      modifiers.sort();

      return { key, modifiers };

    } catch (error) {
      console.warn('Failed to parse shortcut string:', shortcut, error);
      return null;
    }
  }

  /**
   * Format KeyCombination to string
   */
  formatShortcutString(combination: KeyCombination): string {
    if (!combination || !combination.key) {
      return '';
    }

    try {
      // Get platform-appropriate modifier names
      const modifierNames = combination.modifiers.map(mod => 
        this.getDisplayModifierName(mod)
      );

      // Combine modifiers and key
      const parts = [...modifierNames, combination.key];
      return parts.join('+');

    } catch (error) {
      console.warn('Failed to format shortcut string:', combination, error);
      return '';
    }
  }

  /**
   * Check if key combination is valid
   */
  isValidCombination(combination: KeyCombination): boolean {
    if (!combination || !combination.key) {
      return false;
    }

    // Check key validity
    if (!this.isValidKey(combination.key)) {
      return false;
    }

    // Check modifier validity
    for (const modifier of combination.modifiers) {
      if (!this.isValidModifier(modifier)) {
        return false;
      }
    }

    // Check for duplicate modifiers
    const uniqueModifiers = new Set(combination.modifiers);
    if (uniqueModifiers.size !== combination.modifiers.length) {
      return false;
    }

    // Platform-specific validation
    return this.isPlatformValidCombination(combination);
  }

  /**
   * Get platform-specific modifiers
   */
  getPlatformModifiers(): KeyModifier[] {
    const platformModifiers = PLATFORM_MODIFIERS[this.platform];
    if (!platformModifiers) {
      return ['ctrl', 'alt', 'shift'];
    }

    switch (this.platform) {
      case 'mac':
        return platformModifiers.mac;
      case 'windows':
        return platformModifiers.windows;
      case 'linux':
        return platformModifiers.linux;
      default:
        return ['ctrl', 'alt', 'shift'];
    }
  }

  /**
   * Normalize key combination for platform
   */
  normalizeCombination(combination: KeyCombination): KeyCombination {
    const normalizedKey = this.normalizeKey(combination.key);
    const normalizedModifiers = combination.modifiers
      .map(mod => this.normalizeModifier(mod))
      .filter((mod): mod is KeyModifier => mod !== null)
      .filter((mod, index, array) => array.indexOf(mod) === index) // Remove duplicates
      .sort();

    // Platform-specific normalization
    const platformNormalizedModifiers = this.normalizePlatformModifiers(normalizedModifiers);

    return {
      key: normalizedKey,
      modifiers: platformNormalizedModifiers,
      code: combination.code
    };
  }

  /**
   * Compare two key combinations
   */
  compareCombinations(a: KeyCombination, b: KeyCombination): boolean {
    if (!a || !b) {
      return false;
    }

    // Normalize both combinations
    const normA = this.normalizeCombination(a);
    const normB = this.normalizeCombination(b);

    // Compare keys
    if (normA.key !== normB.key) {
      return false;
    }

    // Compare modifiers (order doesn't matter since we sort them)
    if (normA.modifiers.length !== normB.modifiers.length) {
      return false;
    }

    for (let i = 0; i < normA.modifiers.length; i++) {
      if (normA.modifiers[i] !== normB.modifiers[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Normalize key name
   */
  private normalizeKey(key: string): string {
    if (!key) {
      return '';
    }

    // Apply key mappings
    const mapped = KEY_MAPPINGS[key];
    if (mapped) {
      return mapped;
    }

    // Convert to proper case
    if (key.length === 1) {
      return key.toUpperCase();
    }

    // Handle function keys
    if (/^f\d+$/i.test(key)) {
      return key.toUpperCase();
    }

    // Handle special keys - proper case
    return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
  }

  /**
   * Normalize modifier name
   */
  private normalizeModifier(modifier: string): KeyModifier | null {
    if (!modifier) {
      return null;
    }

    const normalized = modifier.toLowerCase();
    return MODIFIER_MAPPINGS[normalized] || null;
  }

  /**
   * Get display name for modifier
   */
  private getDisplayModifierName(modifier: KeyModifier): string {
    switch (this.platform) {
      case 'mac':
        switch (modifier) {
          case 'ctrl': return 'Ctrl';
          case 'alt': return 'Option';
          case 'shift': return 'Shift';
          case 'meta': return 'Cmd';
          case 'cmd': return 'Cmd';
          default: return modifier;
        }
      
      case 'windows':
      case 'linux':
      default:
        switch (modifier) {
          case 'ctrl': return 'Ctrl';
          case 'alt': return 'Alt';
          case 'shift': return 'Shift';
          case 'meta': return 'Win';
          case 'cmd': return 'Win';
          default: return modifier;
        }
    }
  }

  /**
   * Check if key is valid
   */
  private isValidKey(key: string): boolean {
    if (!key) {
      return false;
    }

    // Single character keys
    if (/^[a-zA-Z0-9]$/.test(key)) {
      return true;
    }

    // Function keys
    if (/^F([1-9]|1[0-2])$/.test(key)) {
      return true;
    }

    // Special keys
    const specialKeys = [
      'Enter', 'Space', 'Tab', 'Escape', 'Delete', 'Backspace',
      'Insert', 'Home', 'End', 'PageUp', 'PageDown',
      'Up', 'Down', 'Left', 'Right',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
    ];

    return specialKeys.includes(key);
  }

  /**
   * Check if modifier is valid
   */
  private isValidModifier(modifier: KeyModifier): boolean {
    const validModifiers: KeyModifier[] = ['ctrl', 'alt', 'shift', 'meta', 'cmd'];
    return validModifiers.includes(modifier);
  }

  /**
   * Platform-specific combination validation
   */
  private isPlatformValidCombination(combination: KeyCombination): boolean {
    switch (this.platform) {
      case 'mac':
        // On Mac, prefer Cmd over Ctrl for most shortcuts
        if (combination.modifiers.includes('ctrl') && combination.modifiers.includes('meta')) {
          return false; // Don't allow both
        }
        break;

      case 'windows':
      case 'linux':
        // On Windows/Linux, Ctrl is more common than Win key
        if (combination.modifiers.includes('meta') && combination.modifiers.length === 1) {
          return false; // Win key alone with regular keys is usually reserved
        }
        break;
    }

    return true;
  }

  /**
   * Normalize modifiers for platform
   */
  private normalizePlatformModifiers(modifiers: KeyModifier[]): KeyModifier[] {
    // Convert platform-specific modifiers
    return modifiers.map(modifier => {
      if (this.platform === 'mac' && modifier === 'ctrl') {
        // On Mac, Ctrl is often used instead of Cmd in cross-platform shortcuts
        return 'meta';
      }
      
      if ((this.platform === 'windows' || this.platform === 'linux') && modifier === 'meta') {
        // On Windows/Linux, Meta is often used instead of Ctrl
        return 'ctrl';
      }

      return modifier;
    }).sort();
  }

  /**
   * Detect current platform
   */
  private detectPlatform(): string {
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
}

/**
 * Create shortcut utilities instance
 */
export function createShortcutUtils(): ShortcutUtils {
  return new ShortcutUtilsImpl();
}

/**
 * Singleton instance for convenience
 */
export const shortcutUtils = createShortcutUtils();