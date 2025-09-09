/**
 * Context Menu Permission Manager
 * Handles permission checking, requesting, and management for context menu functionality
 * across different browsers with graceful degradation
 */

import browser from 'webextension-polyfill';
import { getBrowserAdapter, getCurrentBrowserType, BrowserType } from '../../browser';
import {
  ContextMenuError,
  MenuOperationResult,
  ContextMenuConfig
} from './types';

/**
 * Permission status types
 */
export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';

/**
 * Permission information
 */
export interface PermissionInfo {
  permission: string;
  status: PermissionStatus;
  required: boolean;
  description: string;
  canRequest: boolean;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  hasPermission: boolean;
  missingPermissions: string[];
  optionalPermissions: string[];
  canRequestMissing: boolean;
  browserSupport: boolean;
}

/**
 * Context Menu Permission Manager
 */
export class ContextMenuPermissionManager {
  private browserType: BrowserType;
  private config: ContextMenuConfig;
  private permissionCache: Map<string, { status: PermissionStatus; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 60000; // 1 minute cache

  constructor(config: ContextMenuConfig = {}) {
    this.browserType = getCurrentBrowserType();
    this.config = config;
  }

  /**
   * Check all required permissions for context menu functionality
   */
  async checkContextMenuPermissions(): Promise<PermissionCheckResult> {
    const requiredPermissions = this.getRequiredPermissions();
    const optionalPermissions = this.getOptionalPermissions();
    const allPermissions = [...requiredPermissions, ...optionalPermissions];

    const results = await Promise.all(
      allPermissions.map(async permission => ({
        permission,
        status: await this.checkPermission(permission),
        required: requiredPermissions.includes(permission)
      }))
    );

    const missingRequired = results
      .filter(r => r.required && r.status !== 'granted')
      .map(r => r.permission);

    const missingOptional = results
      .filter(r => !r.required && r.status !== 'granted')
      .map(r => r.permission);

    const canRequestMissing = await this.canRequestPermissions();
    const browserSupport = this.isBrowserSupported();

    return {
      hasPermission: missingRequired.length === 0,
      missingPermissions: missingRequired,
      optionalPermissions: missingOptional,
      canRequestMissing,
      browserSupport
    };
  }

  /**
   * Request missing permissions
   */
  async requestMissingPermissions(): Promise<MenuOperationResult<string[]>> {
    const startTime = performance.now();

    try {
      const check = await this.checkContextMenuPermissions();
      
      if (check.hasPermission) {
        return {
          success: true,
          data: [],
          browserType: this.browserType,
          timing: {
            operation: 'requestMissingPermissions',
            duration: performance.now() - startTime,
            timestamp: Date.now()
          }
        };
      }

      if (!check.canRequestMissing) {
        return {
          success: false,
          error: new ContextMenuError(
            'PERMISSION_DENIED',
            'Cannot request permissions in this browser context',
            this.browserType
          ),
          browserType: this.browserType,
          timing: {
            operation: 'requestMissingPermissions',
            duration: performance.now() - startTime,
            timestamp: Date.now()
          }
        };
      }

      const grantedPermissions: string[] = [];
      const failedPermissions: string[] = [];

      // Request permissions one by one for better error handling
      for (const permission of check.missingPermissions) {
        try {
          const granted = await this.requestPermission(permission);
          if (granted) {
            grantedPermissions.push(permission);
            // Update cache
            this.permissionCache.set(permission, {
              status: 'granted',
              timestamp: Date.now()
            });
          } else {
            failedPermissions.push(permission);
            this.permissionCache.set(permission, {
              status: 'denied',
              timestamp: Date.now()
            });
          }
        } catch (error) {
          failedPermissions.push(permission);
          if (this.config.enableLogging) {
            console.warn(`[PermissionManager] Failed to request permission '${permission}':`, error);
          }
        }
      }

      const allGranted = failedPermissions.length === 0;

      return {
        success: allGranted,
        data: grantedPermissions,
        error: allGranted ? undefined : new ContextMenuError(
          'PERMISSION_DENIED',
          `Failed to obtain permissions: ${failedPermissions.join(', ')}`,
          this.browserType
        ),
        browserType: this.browserType,
        timing: {
          operation: 'requestMissingPermissions',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: new ContextMenuError(
          'PERMISSION_DENIED',
          `Permission request failed: ${error.message}`,
          this.browserType
        ),
        browserType: this.browserType,
        timing: {
          operation: 'requestMissingPermissions',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * Get detailed information about all permissions
   */
  async getPermissionInfo(): Promise<PermissionInfo[]> {
    const requiredPermissions = this.getRequiredPermissions();
    const optionalPermissions = this.getOptionalPermissions();
    const allPermissions = [...requiredPermissions, ...optionalPermissions];

    const canRequest = await this.canRequestPermissions();

    return await Promise.all(
      allPermissions.map(async permission => {
        const status = await this.checkPermission(permission);
        return {
          permission,
          status,
          required: requiredPermissions.includes(permission),
          description: this.getPermissionDescription(permission),
          canRequest
        };
      })
    );
  }

  /**
   * Check if a specific permission is granted
   */
  async hasPermission(permission: string): Promise<boolean> {
    const status = await this.checkPermission(permission);
    return status === 'granted';
  }

  /**
   * Initialize permission manager and check initial permissions
   */
  async initialize(): Promise<MenuOperationResult<PermissionCheckResult>> {
    const startTime = performance.now();

    try {
      const result = await this.checkContextMenuPermissions();

      if (this.config.enableLogging) {
        console.log('[PermissionManager] Initialized', {
          browserType: this.browserType,
          hasPermission: result.hasPermission,
          missingRequired: result.missingPermissions,
          missingOptional: result.optionalPermissions
        });
      }

      return {
        success: true,
        data: result,
        browserType: this.browserType,
        timing: {
          operation: 'initialize',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: new ContextMenuError(
          'API_ERROR',
          `Permission manager initialization failed: ${error.message}`,
          this.browserType
        ),
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
   * Clear permission cache
   */
  clearCache(): void {
    this.permissionCache.clear();
    if (this.config.debug) {
      console.log('[PermissionManager] Permission cache cleared');
    }
  }

  /**
   * Get required permissions based on browser type
   */
  private getRequiredPermissions(): string[] {
    const basePermissions = ['contextMenus'];

    switch (this.browserType) {
      case 'chrome':
      case 'edge':
        return [...basePermissions, 'activeTab'];
      
      case 'firefox':
        return [...basePermissions, 'activeTab'];
      
      case 'safari':
        return [...basePermissions];
      
      default:
        return [...basePermissions];
    }
  }

  /**
   * Get optional permissions that enhance functionality
   */
  private getOptionalPermissions(): string[] {
    const baseOptional: string[] = [];

    switch (this.browserType) {
      case 'chrome':
      case 'edge':
        return [...baseOptional, 'tabs', 'storage'];
      
      case 'firefox':
        return [...baseOptional, 'tabs', 'storage'];
      
      case 'safari':
        return [...baseOptional, 'tabs'];
      
      default:
        return baseOptional;
    }
  }

  /**
   * Check a single permission status
   */
  private async checkPermission(permission: string): Promise<PermissionStatus> {
    // Check cache first
    const cached = this.permissionCache.get(permission);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.status;
    }

    try {
      // Try to use the permissions API if available
      if (browser.permissions && browser.permissions.contains) {
        const hasPermission = await browser.permissions.contains({ permissions: [permission] });
        const status: PermissionStatus = hasPermission ? 'granted' : 'denied';
        
        // Cache the result
        this.permissionCache.set(permission, {
          status,
          timestamp: Date.now()
        });
        
        return status;
      }

      // Fallback: assume granted if we can't check
      // This prevents blocking in environments where permissions API is not available
      const status: PermissionStatus = 'unknown';
      this.permissionCache.set(permission, {
        status,
        timestamp: Date.now()
      });
      
      return status;
    } catch (error) {
      if (this.config.debug) {
        console.warn(`[PermissionManager] Error checking permission '${permission}':`, error);
      }
      
      const status: PermissionStatus = 'unknown';
      this.permissionCache.set(permission, {
        status,
        timestamp: Date.now()
      });
      
      return status;
    }
  }

  /**
   * Request a specific permission
   */
  private async requestPermission(permission: string): Promise<boolean> {
    try {
      if (browser.permissions && browser.permissions.request) {
        return await browser.permissions.request({ permissions: [permission] });
      }
      return false;
    } catch (error) {
      if (this.config.debug) {
        console.warn(`[PermissionManager] Error requesting permission '${permission}':`, error);
      }
      return false;
    }
  }

  /**
   * Check if we can request permissions in the current context
   */
  private async canRequestPermissions(): Promise<boolean> {
    try {
      // Permissions can only be requested in response to user action in most browsers
      return !!(browser.permissions && browser.permissions.request);
    } catch {
      return false;
    }
  }

  /**
   * Check if the current browser supports context menus
   */
  private isBrowserSupported(): boolean {
    return ['chrome', 'firefox', 'edge', 'safari'].includes(this.browserType);
  }

  /**
   * Get human-readable description of a permission
   */
  private getPermissionDescription(permission: string): string {
    const descriptions: Record<string, string> = {
      'contextMenus': 'Required to create context menu items in the browser',
      'activeTab': 'Required to access information about the current tab',
      'tabs': 'Optional: Enables enhanced tab management features',
      'storage': 'Optional: Enables saving context menu preferences',
      'host_permissions': 'Optional: Enables context menu items on all websites'
    };

    return descriptions[permission] || `Permission: ${permission}`;
  }
}

/**
 * Create a context menu permission manager
 */
export function createContextMenuPermissionManager(config?: ContextMenuConfig): ContextMenuPermissionManager {
  return new ContextMenuPermissionManager(config);
}

/**
 * Quick permission check utility
 */
export async function hasContextMenuPermissions(): Promise<boolean> {
  try {
    const manager = createContextMenuPermissionManager();
    const result = await manager.checkContextMenuPermissions();
    return result.hasPermission;
  } catch {
    return false;
  }
}

/**
 * Request context menu permissions with user-friendly messaging
 */
export async function requestContextMenuPermissions(): Promise<boolean> {
  try {
    const manager = createContextMenuPermissionManager({ enableLogging: true });
    const result = await manager.requestMissingPermissions();
    return result.success;
  } catch {
    return false;
  }
}