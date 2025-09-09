/**
 * Conflict Detector Tests
 * Tests for keyboard shortcut conflict detection
 */

import { ConflictDetector } from '../conflict-detector';
import { shortcutUtils } from '../utils';
import { ShortcutCommand, KeyCombination, ShortcutConfig } from '../types';

describe('ConflictDetector', () => {
  let detector: ConflictDetector;
  let config: ShortcutConfig;

  beforeEach(() => {
    config = {
      detectConflicts: true,
      debug: false
    };
    detector = new ConflictDetector(config, shortcutUtils);
  });

  describe('validateShortcut', () => {
    it('should validate a simple shortcut', () => {
      const shortcut: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl']
      };
      
      const result = detector.validateShortcut(shortcut);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid key combinations', () => {
      const shortcut: KeyCombination = {
        key: '',
        modifiers: ['ctrl']
      };
      
      const result = detector.validateShortcut(shortcut);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect duplicate extension commands', () => {
      const shortcut: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl']
      };

      const existingCommands: ShortcutCommand[] = [
        {
          id: 'existing-command',
          name: 'Existing Command',
          description: 'Test command',
          category: 'test',
          defaultShortcut: shortcut,
          handler: () => {},
          enabled: true,
          visible: true
        }
      ];

      const result = detector.validateShortcut(shortcut, 'new-command', existingCommands);
      expect(result.valid).toBe(false);
      expect(result.conflicts.some(c => c.type === 'duplicate_extension')).toBe(true);
    });

    it('should not detect conflicts with same command', () => {
      const shortcut: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl']
      };

      const existingCommands: ShortcutCommand[] = [
        {
          id: 'test-command',
          name: 'Test Command',
          description: 'Test command',
          category: 'test',
          defaultShortcut: shortcut,
          handler: () => {},
          enabled: true,
          visible: true
        }
      ];

      const result = detector.validateShortcut(shortcut, 'test-command', existingCommands);
      expect(result.conflicts.some(c => c.type === 'duplicate_extension')).toBe(false);
    });

    it('should detect browser reserved shortcuts', () => {
      // Common browser shortcut
      const shortcut: KeyCombination = {
        key: 'l',
        modifiers: ['ctrl']
      };

      const result = detector.validateShortcut(shortcut);
      expect(result.conflicts.some(c => c.type === 'browser_reserved')).toBe(true);
    });

    it('should detect accessibility conflicts', () => {
      const shortcut: KeyCombination = {
        key: 'Tab',
        modifiers: []
      };

      const result = detector.validateShortcut(shortcut);
      expect(result.conflicts.some(c => c.type === 'accessibility_conflict')).toBe(true);
    });

    it('should detect invalid combinations with too many modifiers', () => {
      const shortcut: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl', 'alt', 'shift', 'meta']
      };

      const result = detector.validateShortcut(shortcut);
      expect(result.conflicts.some(c => c.type === 'invalid_combination')).toBe(true);
    });

    it('should detect conflicting modifiers', () => {
      const shortcut: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl', 'meta']
      };

      const result = detector.validateShortcut(shortcut);
      expect(result.conflicts.some(c => c.type === 'invalid_combination')).toBe(true);
    });
  });

  describe('detectAllConflicts', () => {
    it('should return empty array for valid shortcut', () => {
      const shortcut: KeyCombination = {
        key: 'Z',
        modifiers: ['ctrl', 'shift']
      };

      const conflicts = detector.detectAllConflicts(shortcut);
      expect(conflicts).toHaveLength(0);
    });

    it('should detect multiple conflict types', () => {
      const shortcut: KeyCombination = {
        key: 'Tab',
        modifiers: []
      };

      const conflicts = detector.detectAllConflicts(shortcut);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts.some(c => c.type === 'accessibility_conflict')).toBe(true);
    });

    it('should exclude specified command from duplicate detection', () => {
      const shortcut: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl']
      };

      const existingCommands: ShortcutCommand[] = [
        {
          id: 'test-command',
          name: 'Test Command',
          description: 'Test command',
          category: 'test',
          defaultShortcut: shortcut,
          handler: () => {},
          enabled: true,
          visible: true
        }
      ];

      const conflicts = detector.detectAllConflicts(shortcut, 'test-command', existingCommands);
      expect(conflicts.some(c => c.type === 'duplicate_extension')).toBe(false);
    });
  });

  describe('generateAlternatives', () => {
    it('should generate alternative shortcuts', () => {
      const shortcut: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl']
      };

      const alternatives = detector.generateAlternatives(shortcut);
      expect(Array.isArray(alternatives)).toBe(true);
      expect(alternatives.length).toBeGreaterThan(0);
      expect(alternatives.length).toBeLessThanOrEqual(5);
    });

    it('should generate different alternatives from original', () => {
      const shortcut: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl']
      };

      const alternatives = detector.generateAlternatives(shortcut);
      
      for (const alternative of alternatives) {
        expect(shortcutUtils.compareCombinations(shortcut, alternative)).toBe(false);
      }
    });

    it('should generate valid alternatives', () => {
      const shortcut: KeyCombination = {
        key: 'A',
        modifiers: ['ctrl']
      };

      const alternatives = detector.generateAlternatives(shortcut);
      
      for (const alternative of alternatives) {
        expect(shortcutUtils.isValidCombination(alternative)).toBe(true);
      }
    });
  });

  describe('configuration', () => {
    it('should respect detectConflicts setting', () => {
      const disabledConfig: ShortcutConfig = {
        detectConflicts: false
      };
      const disabledDetector = new ConflictDetector(disabledConfig, shortcutUtils);

      const shortcut: KeyCombination = {
        key: 'l',
        modifiers: ['ctrl']
      };

      const result = disabledDetector.validateShortcut(shortcut);
      // Should be valid even though it's a browser reserved shortcut
      expect(result.valid).toBe(true);
    });
  });

  describe('platform-specific detection', () => {
    it('should handle different platforms gracefully', () => {
      const shortcut: KeyCombination = {
        key: 'A',
        modifiers: ['meta'] // Cmd on Mac, Win key on others
      };

      const result = detector.validateShortcut(shortcut);
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
    });
  });

  describe('severity levels', () => {
    it('should assign appropriate severity levels', () => {
      const shortcut: KeyCombination = {
        key: 'Tab',
        modifiers: []
      };

      const conflicts = detector.detectAllConflicts(shortcut);
      
      for (const conflict of conflicts) {
        expect(['error', 'warning', 'info']).toContain(conflict.severity);
      }
    });

    it('should provide suggestions for conflicts', () => {
      const shortcut: KeyCombination = {
        key: 'Tab',
        modifiers: []
      };

      const conflicts = detector.detectAllConflicts(shortcut);
      
      for (const conflict of conflicts) {
        expect(typeof conflict.suggestion).toBe('string');
        expect(conflict.suggestion.length).toBeGreaterThan(0);
      }
    });
  });
});