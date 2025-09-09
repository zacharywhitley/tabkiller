/**
 * Keyboard Shortcuts Module
 * Main entry point for the keyboard shortcuts and commands system
 */

// Core types and interfaces
export * from './types';

// Utility functions
export { shortcutUtils, createShortcutUtils } from './utils';

// Command registration
export { CommandRegistry, createCommandRegistry } from './command-registry';

// Conflict detection
export { ConflictDetector, createConflictDetector } from './conflict-detector';

// Main shortcut manager
export { 
  ShortcutManagerImpl, 
  createShortcutManager 
} from './shortcut-manager';

// Convenience factory functions
import { ShortcutConfig, ShortcutManager } from './types';
import { createShortcutManager } from './shortcut-manager';

/**
 * Create a fully configured keyboard shortcuts system
 */
export async function createShortcutSystem(config?: ShortcutConfig): Promise<{
  manager: ShortcutManager;
  isSupported: boolean;
}> {
  const manager = createShortcutManager(config);
  
  // Initialize the system
  const result = await manager.initialize(config);
  const isSupported = manager.isSupported();

  if (!result.success && config?.debug) {
    console.warn('Shortcut system initialization failed:', result.error);
  }

  return {
    manager,
    isSupported
  };
}

/**
 * Quick setup for basic shortcut functionality
 */
export async function setupShortcuts(config?: ShortcutConfig): Promise<ShortcutManager> {
  const manager = createShortcutManager(config);
  await manager.initialize(config);
  return manager;
}