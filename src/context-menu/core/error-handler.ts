/**
 * Context Menu Error Handler
 * Provides comprehensive error handling, logging, and recovery mechanisms
 * for context menu operations with graceful degradation
 */

import { getBrowserAdapter, getCurrentBrowserType, BrowserType } from '../../browser';
import {
  ContextMenuError,
  ContextMenuErrorType,
  MenuOperationResult,
  MenuItemDefinition,
  ContextMenuConfig
} from './types';

/**
 * Error recovery strategy
 */
interface ErrorRecoveryStrategy {
  shouldRetry: boolean;
  maxRetries: number;
  retryDelay: number;
  fallbackAction?: 'ignore' | 'simplify' | 'disable';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Error statistics for monitoring
 */
interface ErrorStatistics {
  totalErrors: number;
  errorsByType: Record<ContextMenuErrorType, number>;
  errorsByBrowser: Record<BrowserType, number>;
  lastErrorTime?: number;
  recoveryAttempts: number;
  successfulRecoveries: number;
}

/**
 * Context Menu Error Handler
 */
export class ContextMenuErrorHandler {
  private config: ContextMenuConfig;
  private browserType: BrowserType;
  private statistics: ErrorStatistics;
  private errorLog: Array<{
    error: ContextMenuError;
    timestamp: number;
    recovered: boolean;
    strategy?: ErrorRecoveryStrategy;
  }> = [];

  constructor(config: ContextMenuConfig = {}) {
    this.config = config;
    this.browserType = getCurrentBrowserType();
    this.statistics = this.initializeStatistics();
  }

  /**
   * Handle a context menu error with appropriate recovery strategy
   */
  async handleError(
    error: ContextMenuError,
    operation: string,
    context?: any
  ): Promise<MenuOperationResult> {
    const timestamp = Date.now();
    const strategy = this.getRecoveryStrategy(error);

    // Update statistics
    this.updateStatistics(error);

    // Log the error
    this.logError(error, operation, strategy, context);

    // Add to error log
    this.errorLog.push({
      error,
      timestamp,
      recovered: false,
      strategy
    });

    // Attempt recovery if strategy allows
    if (strategy.shouldRetry) {
      return await this.attemptRecovery(error, operation, strategy, context);
    }

    // Return error result without recovery
    return {
      success: false,
      error,
      browserType: this.browserType,
      timing: {
        operation: `error_${operation}`,
        duration: 0,
        timestamp
      }
    };
  }

  /**
   * Handle permission-related errors
   */
  async handlePermissionError(
    operation: string,
    requiredPermission: string
  ): Promise<MenuOperationResult> {
    const error = new ContextMenuError(
      'PERMISSION_DENIED',
      `Permission '${requiredPermission}' is required for ${operation}`,
      this.browserType
    );

    // Try to request permission if possible
    if (await this.canRequestPermissions()) {
      try {
        const granted = await this.requestPermission(requiredPermission);
        if (granted) {
          return {
            success: true,
            browserType: this.browserType,
            timing: {
              operation: 'permission_recovery',
              duration: 0,
              timestamp: Date.now()
            }
          };
        }
      } catch (permissionError) {
        // Log permission request failure
        if (this.config.enableLogging) {
          console.warn(`[ContextMenuErrorHandler] Permission request failed:`, permissionError);
        }
      }
    }

    return await this.handleError(error, operation);
  }

  /**
   * Handle unsupported browser gracefully
   */
  createUnsupportedBrowserFallback(operation: string): MenuOperationResult {
    const error = new ContextMenuError(
      'UNSUPPORTED_BROWSER',
      `Context menus are not supported in ${this.browserType}`,
      this.browserType
    );

    if (this.config.enableLogging) {
      console.info(`[ContextMenuErrorHandler] Graceful degradation: ${operation} not available in ${this.browserType}`);
    }

    return {
      success: false,
      error,
      browserType: this.browserType,
      timing: {
        operation: 'graceful_degradation',
        duration: 0,
        timestamp: Date.now()
      }
    };
  }

  /**
   * Validate and sanitize menu item with error handling
   */
  sanitizeMenuItem(item: MenuItemDefinition): {
    item: MenuItemDefinition;
    warnings: string[];
    errors: string[];
  } {
    const sanitized = { ...item };
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // Sanitize ID
      if (!sanitized.id || typeof sanitized.id !== 'string') {
        errors.push('Menu item ID must be a non-empty string');
        sanitized.id = `menu_item_${Date.now()}`;
      }

      // Sanitize title
      if (sanitized.title) {
        const originalTitle = sanitized.title;
        sanitized.title = this.sanitizeString(sanitized.title, 300);
        
        if (sanitized.title !== originalTitle) {
          warnings.push(`Title truncated from ${originalTitle.length} to ${sanitized.title.length} characters`);
        }
      }

      // Sanitize contexts
      if (sanitized.contexts) {
        const validContexts = ['all', 'page', 'frame', 'selection', 'link', 'editable', 'image', 'video', 'audio', 'action', 'browser_action'];
        const originalLength = sanitized.contexts.length;
        sanitized.contexts = sanitized.contexts.filter(context => validContexts.includes(context));
        
        if (sanitized.contexts.length !== originalLength) {
          warnings.push(`Some contexts were removed as invalid`);
        }
        
        if (sanitized.contexts.length === 0) {
          sanitized.contexts = ['all'];
          warnings.push(`No valid contexts found, defaulted to 'all'`);
        }
      }

      // Sanitize URL patterns
      if (sanitized.documentUrlPatterns) {
        sanitized.documentUrlPatterns = this.sanitizeUrlPatterns(sanitized.documentUrlPatterns);
      }
      
      if (sanitized.targetUrlPatterns) {
        sanitized.targetUrlPatterns = this.sanitizeUrlPatterns(sanitized.targetUrlPatterns);
      }

      return { item: sanitized, warnings, errors };
    } catch (sanitizeError) {
      errors.push(`Error sanitizing menu item: ${sanitizeError.message}`);
      return { item: sanitized, warnings, errors };
    }
  }

  /**
   * Get error statistics
   */
  getStatistics(): ErrorStatistics {
    return { ...this.statistics };
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 10): Array<{
    error: ContextMenuError;
    timestamp: number;
    recovered: boolean;
  }> {
    return this.errorLog
      .slice(-limit)
      .map(({ error, timestamp, recovered }) => ({ error, timestamp, recovered }));
  }

  /**
   * Clear error statistics and log
   */
  clearErrorHistory(): void {
    this.statistics = this.initializeStatistics();
    this.errorLog = [];
  }

  /**
   * Get recovery strategy based on error type and browser
   */
  private getRecoveryStrategy(error: ContextMenuError): ErrorRecoveryStrategy {
    const baseStrategy: ErrorRecoveryStrategy = {
      shouldRetry: false,
      maxRetries: 0,
      retryDelay: 0,
      logLevel: 'error'
    };

    switch (error.type) {
      case 'PERMISSION_DENIED':
        return {
          ...baseStrategy,
          shouldRetry: true,
          maxRetries: 1,
          retryDelay: 0,
          fallbackAction: 'disable',
          logLevel: 'warn'
        };

      case 'API_ERROR':
      case 'TIMEOUT':
        return {
          ...baseStrategy,
          shouldRetry: true,
          maxRetries: this.config.maxRetries || 3,
          retryDelay: this.config.retryDelay || 100,
          fallbackAction: 'simplify',
          logLevel: 'warn'
        };

      case 'INVALID_MENU_ITEM':
        return {
          ...baseStrategy,
          shouldRetry: false,
          maxRetries: 0,
          retryDelay: 0,
          fallbackAction: 'simplify',
          logLevel: 'warn'
        };

      case 'UNSUPPORTED_BROWSER':
        return {
          ...baseStrategy,
          shouldRetry: false,
          maxRetries: 0,
          retryDelay: 0,
          fallbackAction: 'ignore',
          logLevel: 'info'
        };

      case 'REGISTRATION_FAILED':
        return {
          ...baseStrategy,
          shouldRetry: true,
          maxRetries: 2,
          retryDelay: 50,
          fallbackAction: 'simplify',
          logLevel: 'warn'
        };

      default:
        return {
          ...baseStrategy,
          shouldRetry: true,
          maxRetries: 1,
          retryDelay: 100,
          fallbackAction: 'disable',
          logLevel: 'error'
        };
    }
  }

  /**
   * Attempt error recovery
   */
  private async attemptRecovery(
    error: ContextMenuError,
    operation: string,
    strategy: ErrorRecoveryStrategy,
    context?: any
  ): Promise<MenuOperationResult> {
    this.statistics.recoveryAttempts++;

    try {
      // Wait before retry if specified
      if (strategy.retryDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, strategy.retryDelay));
      }

      // Apply fallback action if specified
      switch (strategy.fallbackAction) {
        case 'simplify':
          if (context?.menuItem) {
            const { item } = this.sanitizeMenuItem(context.menuItem);
            context.menuItem = this.simplifyMenuItem(item);
          }
          break;

        case 'ignore':
          this.statistics.successfulRecoveries++;
          return {
            success: true,
            browserType: this.browserType,
            timing: {
              operation: 'recovery_ignore',
              duration: 0,
              timestamp: Date.now()
            }
          };

        case 'disable':
          if (this.config.enableLogging) {
            console.info(`[ContextMenuErrorHandler] Feature disabled due to error: ${error.message}`);
          }
          break;
      }

      // Mark as recovered
      const lastLog = this.errorLog[this.errorLog.length - 1];
      if (lastLog) {
        lastLog.recovered = true;
      }

      this.statistics.successfulRecoveries++;

      return {
        success: true,
        browserType: this.browserType,
        timing: {
          operation: 'recovery_success',
          duration: 0,
          timestamp: Date.now()
        }
      };
    } catch (recoveryError) {
      if (this.config.enableLogging) {
        console.error(`[ContextMenuErrorHandler] Recovery failed:`, recoveryError);
      }

      return {
        success: false,
        error: new ContextMenuError(
          'UNKNOWN',
          `Recovery failed: ${recoveryError.message}`,
          this.browserType
        ),
        browserType: this.browserType,
        timing: {
          operation: 'recovery_failed',
          duration: 0,
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * Check if we can request permissions
   */
  private async canRequestPermissions(): Promise<boolean> {
    try {
      return !!(window as any).browser?.permissions?.request || 
             !!(window as any).chrome?.permissions?.request;
    } catch {
      return false;
    }
  }

  /**
   * Request a specific permission
   */
  private async requestPermission(permission: string): Promise<boolean> {
    try {
      const browser = (window as any).browser || (window as any).chrome;
      if (browser?.permissions?.request) {
        return await browser.permissions.request({ permissions: [permission] });
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Simplify menu item for fallback
   */
  private simplifyMenuItem(item: MenuItemDefinition): MenuItemDefinition {
    return {
      id: item.id,
      title: item.title,
      type: 'normal',
      contexts: ['all'],
      enabled: true,
      visible: true,
      onclick: item.onclick
    };
  }

  /**
   * Sanitize a string value
   */
  private sanitizeString(value: string, maxLength: number): string {
    if (typeof value !== 'string') {
      return String(value).substring(0, maxLength);
    }

    // Remove potentially problematic characters
    const sanitized = value
      .replace(/[<>]/g, '') // Remove HTML-like brackets
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .trim();

    return sanitized.length > maxLength ? 
      sanitized.substring(0, maxLength - 3) + '...' : 
      sanitized;
  }

  /**
   * Sanitize URL patterns
   */
  private sanitizeUrlPatterns(patterns: string[]): string[] {
    return patterns.filter(pattern => {
      try {
        // Basic URL pattern validation
        return pattern.includes('*') || /^https?:\/\//.test(pattern);
      } catch {
        return false;
      }
    });
  }

  /**
   * Log error with appropriate level
   */
  private logError(
    error: ContextMenuError,
    operation: string,
    strategy: ErrorRecoveryStrategy,
    context?: any
  ): void {
    if (!this.config.enableLogging) return;

    const logMessage = `[ContextMenuErrorHandler] ${operation} failed: ${error.message}`;
    const logData = {
      error: error.type,
      browser: error.browserType,
      strategy,
      context: context ? Object.keys(context) : undefined
    };

    switch (strategy.logLevel) {
      case 'debug':
        console.debug(logMessage, logData);
        break;
      case 'info':
        console.info(logMessage, logData);
        break;
      case 'warn':
        console.warn(logMessage, logData);
        break;
      case 'error':
        console.error(logMessage, logData);
        break;
    }
  }

  /**
   * Initialize error statistics
   */
  private initializeStatistics(): ErrorStatistics {
    return {
      totalErrors: 0,
      errorsByType: {
        'UNSUPPORTED_BROWSER': 0,
        'PERMISSION_DENIED': 0,
        'INVALID_MENU_ITEM': 0,
        'REGISTRATION_FAILED': 0,
        'API_ERROR': 0,
        'TIMEOUT': 0,
        'UNKNOWN': 0
      },
      errorsByBrowser: {
        'chrome': 0,
        'firefox': 0,
        'safari': 0,
        'edge': 0,
        'unknown': 0
      },
      recoveryAttempts: 0,
      successfulRecoveries: 0
    };
  }

  /**
   * Update error statistics
   */
  private updateStatistics(error: ContextMenuError): void {
    this.statistics.totalErrors++;
    this.statistics.errorsByType[error.type]++;
    this.statistics.errorsByBrowser[error.browserType]++;
    this.statistics.lastErrorTime = Date.now();
  }
}

/**
 * Create a context menu error handler
 */
export function createContextMenuErrorHandler(config?: ContextMenuConfig): ContextMenuErrorHandler {
  return new ContextMenuErrorHandler(config);
}