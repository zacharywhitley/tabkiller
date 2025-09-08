/**
 * Base interfaces for the cross-browser adapter system
 * These interfaces define the contract that all browser adapters must implement
 */

export type BrowserType = 'chrome' | 'firefox' | 'safari' | 'edge' | 'unknown';

/**
 * Browser capability flags
 */
export interface BrowserCapabilities {
  manifestVersion: 2 | 3;
  supportsServiceWorker: boolean;
  supportsDeclarativeNetRequest: boolean;
  supportsWebRequest: boolean;
  supportsStorageSession: boolean;
  supportsActionAPI: boolean;
  supportsBrowserAction: boolean;
  supportsContextMenus: boolean;
  supportsNotifications: boolean;
  supportsPermissions: boolean;
  supportsAlarms: boolean;
  supportsIdle: boolean;
  supportsPower: boolean;
  storageQuotaBytes: number | null;
  maxBadgeTextLength: number | null;
}

/**
 * Browser configuration that varies by browser
 */
export interface BrowserConfig {
  type: BrowserType;
  name: string;
  version: string;
  capabilities: BrowserCapabilities;
  actionAPIName: 'action' | 'browserAction';
  backgroundType: 'service-worker' | 'scripts';
  manifestPath: string;
  buildTarget: string;
}

/**
 * Error that occurs when a feature is not supported in the current browser
 */
export class UnsupportedFeatureError extends Error {
  constructor(
    public readonly feature: string,
    public readonly browser: BrowserType,
    public readonly reason?: string
  ) {
    const message = reason 
      ? `Feature '${feature}' is not supported in ${browser}: ${reason}`
      : `Feature '${feature}' is not supported in ${browser}`;
    super(message);
    this.name = 'UnsupportedFeatureError';
  }
}

/**
 * Error that occurs during browser adaptation
 */
export class BrowserAdapterError extends Error {
  constructor(
    message: string,
    public readonly browser: BrowserType,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'BrowserAdapterError';
    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}

/**
 * Base interface for all browser adapters
 */
export interface BaseBrowserAdapter {
  readonly config: BrowserConfig;
  isFeatureSupported(feature: string): boolean;
  wrapWithFallback<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
    feature: string
  ): Promise<T>;
}

/**
 * Generic event handler interface
 */
export interface EventHandler<T> {
  addListener(callback: (details: T) => void): void;
  removeListener(callback: (details: T) => void): void;
  hasListener(callback: (details: T) => void): boolean;
}

/**
 * Promise-based event handler with async support
 */
export interface AsyncEventHandler<T, R = void> {
  addListener(callback: (details: T) => Promise<R> | R): void;
  removeListener(callback: (details: T) => Promise<R> | R): void;
  hasListener(callback: (details: T) => Promise<R> | R): boolean;
}

/**
 * Result wrapper for operations that may fail gracefully
 */
export type AdapterResult<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: BrowserAdapterError;
  fallbackData?: T;
};

/**
 * Utility type for making properties optional for graceful degradation
 */
export type GracefulDegradation<T> = {
  [K in keyof T]: T[K] | undefined;
};