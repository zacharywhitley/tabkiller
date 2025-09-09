/**
 * Context Menu Core Module
 * Main entry point for the context menu system with cross-browser compatibility
 */

// Core interfaces and types
export * from './types';

// API wrapper for cross-browser context menu operations
export { ContextMenuAPIWrapper } from './api-wrapper';

// High-level menu management
export { 
  ContextMenuManagerImpl, 
  createContextMenuManager 
} from './menu-manager';

// Browser compatibility handling
export { 
  ContextMenuBrowserAdapter, 
  createContextMenuBrowserAdapter 
} from './browser-adapter';

// Error handling and recovery
export { 
  ContextMenuErrorHandler, 
  createContextMenuErrorHandler 
} from './error-handler';

// Permission management
export { 
  ContextMenuPermissionManager,
  createContextMenuPermissionManager,
  hasContextMenuPermissions,
  requestContextMenuPermissions 
} from './permission-manager';

// Convenience factory functions
import { ContextMenuConfig, ContextMenuManager } from './types';
import { createContextMenuManager } from './menu-manager';
import { createContextMenuPermissionManager } from './permission-manager';
import { createContextMenuErrorHandler } from './error-handler';
import { createContextMenuBrowserAdapter } from './browser-adapter';

/**
 * Create a fully configured context menu system
 */
export async function createContextMenuSystem(config?: ContextMenuConfig): Promise<{
  manager: ContextMenuManager;
  permissionManager: any;
  errorHandler: any;
  browserAdapter: any;
}> {
  const manager = createContextMenuManager(config);
  const permissionManager = createContextMenuPermissionManager(config);
  const errorHandler = createContextMenuErrorHandler(config);
  const browserAdapter = createContextMenuBrowserAdapter();

  // Initialize the system
  await manager.initialize(config);
  await permissionManager.initialize();

  return {
    manager,
    permissionManager,
    errorHandler,
    browserAdapter
  };
}

/**
 * Quick setup for basic context menu functionality
 */
export async function setupContextMenu(config?: ContextMenuConfig): Promise<ContextMenuManager> {
  const manager = createContextMenuManager(config);
  await manager.initialize(config);
  return manager;
}