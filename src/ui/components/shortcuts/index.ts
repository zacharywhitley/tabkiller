/**
 * Shortcuts Components
 * React components for keyboard shortcut management and customization
 */

export { default as ShortcutInput } from './ShortcutInput';
export { default as ShortcutManager } from './ShortcutManager';
export { default as ShortcutConflictDialog } from './ShortcutConflictDialog';

// Re-export types that components might need
export type {
  KeyCombination,
  ShortcutCommand,
  ShortcutConflict,
  ShortcutPreferences
} from '../../../context-menu/shortcuts/types';