/**
 * Shortcut Utils Tests
 * Tests for keyboard shortcut utility functions
 */

import { ShortcutUtilsImpl } from '../utils';
import { KeyCombination } from '../types';

describe('ShortcutUtils', () => {
  let utils: ShortcutUtilsImpl;

  beforeEach(() => {
    utils = new ShortcutUtilsImpl();
  });

  describe('parseShortcutString', () => {
    it('should parse single key shortcuts', () => {
      const result = utils.parseShortcutString('A');
      expect(result).toEqual({
        key: 'A',
        modifiers: []
      });
    });

    it('should parse modifier + key combinations', () => {
      const result = utils.parseShortcutString('Ctrl+A');
      expect(result).toEqual({
        key: 'A',
        modifiers: ['ctrl']
      });
    });

    it('should parse multiple modifiers', () => {
      const result = utils.parseShortcutString('Ctrl+Shift+A');
      expect(result).toEqual({
        key: 'A',
        modifiers: ['ctrl', 'shift']
      });
    });

    it('should handle special keys', () => {
      const result = utils.parseShortcutString('Ctrl+Enter');
      expect(result).toEqual({
        key: 'Enter',
        modifiers: ['ctrl']
      });
    });

    it('should handle function keys', () => {
      const result = utils.parseShortcutString('F1');
      expect(result).toEqual({
        key: 'F1',
        modifiers: []
      });
    });

    it('should return null for invalid input', () => {
      expect(utils.parseShortcutString('')).toBeNull();
      expect(utils.parseShortcutString(null as any)).toBeNull();
      expect(utils.parseShortcutString(undefined as any)).toBeNull();
    });

    it('should normalize modifier names', () => {
      const result = utils.parseShortcutString('control+alt+a');
      expect(result).toEqual({
        key: 'A',
        modifiers: ['alt', 'ctrl'] // Should be sorted
      });
    });
  });

  describe('formatShortcutString', () => {
    it('should format single key shortcuts', () => {
      const combination: KeyCombination = {
        key: 'A',
        modifiers: []
      };
      const result = utils.formatShortcutString(combination);
      expect(result).toBe('A');
    });

    it('should format modifier + key combinations', () => {
      const combination: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl']
      };
      const result = utils.formatShortcutString(combination);
      expect(result).toBe('Ctrl+A');
    });

    it('should format multiple modifiers', () => {
      const combination: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl', 'shift']
      };
      const result = utils.formatShortcutString(combination);
      expect(result).toBe('Ctrl+Shift+A');
    });

    it('should return empty string for invalid input', () => {
      expect(utils.formatShortcutString(null as any)).toBe('');
      expect(utils.formatShortcutString({ key: '', modifiers: [] })).toBe('');
    });
  });

  describe('isValidCombination', () => {
    it('should validate single letter keys', () => {
      const combination: KeyCombination = {
        key: 'A',
        modifiers: []
      };
      expect(utils.isValidCombination(combination)).toBe(true);
    });

    it('should validate single number keys', () => {
      const combination: KeyCombination = {
        key: '1',
        modifiers: []
      };
      expect(utils.isValidCombination(combination)).toBe(true);
    });

    it('should validate function keys', () => {
      const combination: KeyCombination = {
        key: 'F1',
        modifiers: []
      };
      expect(utils.isValidCombination(combination)).toBe(true);
    });

    it('should validate special keys', () => {
      const combination: KeyCombination = {
        key: 'Enter',
        modifiers: []
      };
      expect(utils.isValidCombination(combination)).toBe(true);
    });

    it('should validate modifier combinations', () => {
      const combination: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl', 'shift']
      };
      expect(utils.isValidCombination(combination)).toBe(true);
    });

    it('should reject invalid keys', () => {
      const combination: KeyCombination = {
        key: '',
        modifiers: []
      };
      expect(utils.isValidCombination(combination)).toBe(false);
    });

    it('should reject invalid modifiers', () => {
      const combination: KeyCombination = {
        key: 'A',
        modifiers: ['invalid' as any]
      };
      expect(utils.isValidCombination(combination)).toBe(false);
    });

    it('should reject duplicate modifiers', () => {
      const combination: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl', 'ctrl']
      };
      expect(utils.isValidCombination(combination)).toBe(false);
    });

    it('should reject null/undefined input', () => {
      expect(utils.isValidCombination(null as any)).toBe(false);
      expect(utils.isValidCombination(undefined as any)).toBe(false);
    });
  });

  describe('getPlatformModifiers', () => {
    it('should return valid modifier arrays', () => {
      const modifiers = utils.getPlatformModifiers();
      expect(Array.isArray(modifiers)).toBe(true);
      expect(modifiers.length).toBeGreaterThan(0);
      
      // Should contain common modifiers
      expect(modifiers).toContain('ctrl');
      expect(modifiers).toContain('alt');
      expect(modifiers).toContain('shift');
    });
  });

  describe('normalizeCombination', () => {
    it('should normalize key to uppercase', () => {
      const combination: KeyCombination = {
        key: 'a',
        modifiers: []
      };
      const result = utils.normalizeCombination(combination);
      expect(result.key).toBe('A');
    });

    it('should sort modifiers', () => {
      const combination: KeyCombination = {
        key: 'A',
        modifiers: ['shift', 'ctrl']
      };
      const result = utils.normalizeCombination(combination);
      expect(result.modifiers).toEqual(['ctrl', 'shift']);
    });

    it('should remove duplicate modifiers', () => {
      const combination: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl', 'shift', 'ctrl']
      };
      const result = utils.normalizeCombination(combination);
      expect(result.modifiers).toEqual(['ctrl', 'shift']);
    });

    it('should normalize modifier names', () => {
      const combination: KeyCombination = {
        key: 'A',
        modifiers: ['control' as any]
      };
      const result = utils.normalizeCombination(combination);
      expect(result.modifiers).toContain('ctrl');
    });
  });

  describe('compareCombinations', () => {
    it('should return true for identical combinations', () => {
      const a: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl', 'shift']
      };
      const b: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl', 'shift']
      };
      expect(utils.compareCombinations(a, b)).toBe(true);
    });

    it('should return true for combinations with different modifier order', () => {
      const a: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl', 'shift']
      };
      const b: KeyCombination = {
        key: 'A',
        modifiers: ['shift', 'ctrl']
      };
      expect(utils.compareCombinations(a, b)).toBe(true);
    });

    it('should return false for different keys', () => {
      const a: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl']
      };
      const b: KeyCombination = {
        key: 'B',
        modifiers: ['ctrl']
      };
      expect(utils.compareCombinations(a, b)).toBe(false);
    });

    it('should return false for different modifiers', () => {
      const a: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl']
      };
      const b: KeyCombination = {
        key: 'A',
        modifiers: ['shift']
      };
      expect(utils.compareCombinations(a, b)).toBe(false);
    });

    it('should return false for null/undefined input', () => {
      const a: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl']
      };
      expect(utils.compareCombinations(a, null as any)).toBe(false);
      expect(utils.compareCombinations(null as any, a)).toBe(false);
      expect(utils.compareCombinations(null as any, null as any)).toBe(false);
    });

    it('should handle case normalization', () => {
      const a: KeyCombination = {
        key: 'a',
        modifiers: ['ctrl']
      };
      const b: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl']
      };
      expect(utils.compareCombinations(a, b)).toBe(true);
    });
  });
});