/**
 * Enhanced browser detection utilities
 * Provides comprehensive browser detection with version info and capability testing
 */

import { BrowserType, BrowserConfig, BrowserCapabilities } from '../interfaces/base';

/**
 * Detailed browser information
 */
export interface BrowserInfo {
  type: BrowserType;
  name: string;
  version: string;
  majorVersion: number;
  userAgent: string;
  vendor?: string;
  buildInfo?: {
    buildDate?: string;
    buildVersion?: string;
    chromiumVersion?: string;
  };
}

/**
 * Runtime environment information
 */
export interface RuntimeEnvironment {
  isExtension: boolean;
  isServiceWorker: boolean;
  isContentScript: boolean;
  isDevTools: boolean;
  isPopup: boolean;
  isOptions: boolean;
  isBackground: boolean;
  manifestVersion: 2 | 3;
  extensionId?: string;
}

/**
 * Enhanced browser detector class
 */
export class BrowserDetector {
  private static instance: BrowserDetector | null = null;
  private cachedInfo: BrowserInfo | null = null;
  private cachedConfig: BrowserConfig | null = null;
  private cachedCapabilities: BrowserCapabilities | null = null;

  private constructor() {}

  static getInstance(): BrowserDetector {
    if (!BrowserDetector.instance) {
      BrowserDetector.instance = new BrowserDetector();
    }
    return BrowserDetector.instance;
  }

  /**
   * Detect the current browser with detailed information
   */
  detectBrowser(): BrowserInfo {
    if (this.cachedInfo) {
      return this.cachedInfo;
    }

    const userAgent = navigator.userAgent;
    let browserInfo: BrowserInfo;

    // Chrome detection (including Chromium-based browsers)
    if (this.isChrome()) {
      const version = this.extractChromeVersion();
      browserInfo = {
        type: 'chrome',
        name: 'Google Chrome',
        version,
        majorVersion: parseInt(version.split('.')[0], 10),
        userAgent,
        vendor: navigator.vendor,
        buildInfo: this.getChromeBuildInfo()
      };
    }
    // Edge detection (Chromium-based Edge)
    else if (this.isEdge()) {
      const version = this.extractEdgeVersion();
      browserInfo = {
        type: 'edge',
        name: 'Microsoft Edge',
        version,
        majorVersion: parseInt(version.split('.')[0], 10),
        userAgent,
        vendor: navigator.vendor,
        buildInfo: this.getEdgeBuildInfo()
      };
    }
    // Firefox detection
    else if (this.isFirefox()) {
      const version = this.extractFirefoxVersion();
      browserInfo = {
        type: 'firefox',
        name: 'Mozilla Firefox',
        version,
        majorVersion: parseInt(version.split('.')[0], 10),
        userAgent,
        vendor: navigator.vendor
      };
    }
    // Safari detection
    else if (this.isSafari()) {
      const version = this.extractSafariVersion();
      browserInfo = {
        type: 'safari',
        name: 'Safari',
        version,
        majorVersion: parseInt(version.split('.')[0], 10),
        userAgent,
        vendor: navigator.vendor
      };
    }
    // Unknown browser
    else {
      browserInfo = {
        type: 'unknown',
        name: 'Unknown Browser',
        version: '0.0.0',
        majorVersion: 0,
        userAgent,
        vendor: navigator.vendor
      };
    }

    this.cachedInfo = browserInfo;
    return browserInfo;
  }

  /**
   * Get browser configuration based on detected browser
   */
  getBrowserConfig(): BrowserConfig {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    const browserInfo = this.detectBrowser();
    const capabilities = this.getBrowserCapabilities();

    const config: BrowserConfig = {
      type: browserInfo.type,
      name: browserInfo.name,
      version: browserInfo.version,
      capabilities,
      actionAPIName: capabilities.supportsActionAPI ? 'action' : 'browserAction',
      backgroundType: capabilities.supportsServiceWorker ? 'service-worker' : 'scripts',
      manifestPath: `/src/manifest/${browserInfo.type}.json`,
      buildTarget: browserInfo.type
    };

    this.cachedConfig = config;
    return config;
  }

  /**
   * Get detailed browser capabilities
   */
  getBrowserCapabilities(): BrowserCapabilities {
    if (this.cachedCapabilities) {
      return this.cachedCapabilities;
    }

    const browserInfo = this.detectBrowser();
    const manifest = this.getManifestInfo();

    let capabilities: BrowserCapabilities;

    switch (browserInfo.type) {
      case 'chrome':
        capabilities = this.getChromeCapabilities(browserInfo, manifest);
        break;
      case 'firefox':
        capabilities = this.getFirefoxCapabilities(browserInfo, manifest);
        break;
      case 'safari':
        capabilities = this.getSafariCapabilities(browserInfo, manifest);
        break;
      case 'edge':
        capabilities = this.getEdgeCapabilities(browserInfo, manifest);
        break;
      default:
        capabilities = this.getUnknownCapabilities();
    }

    this.cachedCapabilities = capabilities;
    return capabilities;
  }

  /**
   * Get runtime environment information
   */
  getRuntimeEnvironment(): RuntimeEnvironment {
    const manifest = this.getManifestInfo();

    return {
      isExtension: this.isExtensionEnvironment(),
      isServiceWorker: this.isServiceWorkerEnvironment(),
      isContentScript: this.isContentScriptEnvironment(),
      isDevTools: this.isDevToolsEnvironment(),
      isPopup: this.isPopupEnvironment(),
      isOptions: this.isOptionsEnvironment(),
      isBackground: this.isBackgroundEnvironment(),
      manifestVersion: manifest?.manifest_version as (2 | 3) || 2,
      extensionId: this.getExtensionId()
    };
  }

  /**
   * Test if a specific feature is supported
   */
  testFeatureSupport(feature: string): boolean {
    const tests: Record<string, () => boolean> = {
      'service-worker': () => 'serviceWorker' in navigator,
      'storage-session': () => this.testStorageSession(),
      'declarative-net-request': () => this.testDeclarativeNetRequest(),
      'web-request': () => this.testWebRequest(),
      'action-api': () => this.testActionAPI(),
      'browser-action': () => this.testBrowserAction(),
      'context-menus': () => this.testContextMenus(),
      'notifications': () => this.testNotifications(),
      'permissions': () => this.testPermissions(),
      'alarms': () => this.testAlarms(),
      'idle': () => this.testIdle(),
      'power': () => this.testPower(),
      'tab-groups': () => this.testTabGroups(),
      'tab-discard': () => this.testTabDiscard()
    };

    return tests[feature]?.() || false;
  }

  /**
   * Clear cached information (useful for testing)
   */
  clearCache(): void {
    this.cachedInfo = null;
    this.cachedConfig = null;
    this.cachedCapabilities = null;
  }

  // Private browser detection methods

  private isChrome(): boolean {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      const isEdge = this.isEdge();
      return !isEdge && /Chrome/.test(navigator.userAgent);
    }
    return false;
  }

  private isFirefox(): boolean {
    if (typeof browser !== 'undefined' && browser.runtime) {
      return /Firefox/.test(navigator.userAgent);
    }
    return false;
  }

  private isSafari(): boolean {
    return /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
  }

  private isEdge(): boolean {
    return /Edg\//.test(navigator.userAgent);
  }

  // Version extraction methods

  private extractChromeVersion(): string {
    const match = navigator.userAgent.match(/Chrome\/([0-9.]+)/);
    return match ? match[1] : '0.0.0';
  }

  private extractFirefoxVersion(): string {
    const match = navigator.userAgent.match(/Firefox\/([0-9.]+)/);
    return match ? match[1] : '0.0.0';
  }

  private extractSafariVersion(): string {
    const match = navigator.userAgent.match(/Version\/([0-9.]+)/);
    return match ? match[1] : '0.0.0';
  }

  private extractEdgeVersion(): string {
    const match = navigator.userAgent.match(/Edg\/([0-9.]+)/);
    return match ? match[1] : '0.0.0';
  }

  // Build information methods

  private getChromeBuildInfo() {
    try {
      return {
        chromiumVersion: this.extractChromeVersion()
      };
    } catch {
      return undefined;
    }
  }

  private getEdgeBuildInfo() {
    try {
      return {
        chromiumVersion: this.extractChromeVersion(),
        buildVersion: this.extractEdgeVersion()
      };
    } catch {
      return undefined;
    }
  }

  // Capability detection methods

  private getChromeCapabilities(browserInfo: BrowserInfo, manifest?: chrome.runtime.Manifest): BrowserCapabilities {
    const manifestVersion = manifest?.manifest_version || 3;
    const isV3 = manifestVersion === 3;
    const majorVersion = browserInfo.majorVersion;

    return {
      manifestVersion: manifestVersion as (2 | 3),
      supportsServiceWorker: isV3,
      supportsDeclarativeNetRequest: isV3 && majorVersion >= 88,
      supportsWebRequest: !isV3,
      supportsStorageSession: isV3 && majorVersion >= 102,
      supportsActionAPI: isV3,
      supportsBrowserAction: !isV3,
      supportsContextMenus: true,
      supportsNotifications: true,
      supportsPermissions: true,
      supportsAlarms: true,
      supportsIdle: true,
      supportsPower: false,
      storageQuotaBytes: 5242880, // 5MB
      maxBadgeTextLength: 4
    };
  }

  private getFirefoxCapabilities(browserInfo: BrowserInfo, manifest?: chrome.runtime.Manifest): BrowserCapabilities {
    const majorVersion = browserInfo.majorVersion;

    return {
      manifestVersion: 2,
      supportsServiceWorker: false,
      supportsDeclarativeNetRequest: false,
      supportsWebRequest: true,
      supportsStorageSession: false,
      supportsActionAPI: false,
      supportsBrowserAction: true,
      supportsContextMenus: true,
      supportsNotifications: true,
      supportsPermissions: true,
      supportsAlarms: true,
      supportsIdle: majorVersion >= 91,
      supportsPower: false,
      storageQuotaBytes: null, // Unlimited
      maxBadgeTextLength: null
    };
  }

  private getSafariCapabilities(browserInfo: BrowserInfo, manifest?: chrome.runtime.Manifest): BrowserCapabilities {
    return {
      manifestVersion: 2,
      supportsServiceWorker: false,
      supportsDeclarativeNetRequest: false,
      supportsWebRequest: true,
      supportsStorageSession: false,
      supportsActionAPI: false,
      supportsBrowserAction: true,
      supportsContextMenus: true,
      supportsNotifications: true,
      supportsPermissions: true,
      supportsAlarms: true,
      supportsIdle: false,
      supportsPower: false,
      storageQuotaBytes: 1048576, // 1MB
      maxBadgeTextLength: 4
    };
  }

  private getEdgeCapabilities(browserInfo: BrowserInfo, manifest?: chrome.runtime.Manifest): BrowserCapabilities {
    // Edge is Chromium-based, so capabilities are similar to Chrome
    return this.getChromeCapabilities(browserInfo, manifest);
  }

  private getUnknownCapabilities(): BrowserCapabilities {
    return {
      manifestVersion: 2,
      supportsServiceWorker: false,
      supportsDeclarativeNetRequest: false,
      supportsWebRequest: false,
      supportsStorageSession: false,
      supportsActionAPI: false,
      supportsBrowserAction: false,
      supportsContextMenus: false,
      supportsNotifications: false,
      supportsPermissions: false,
      supportsAlarms: false,
      supportsIdle: false,
      supportsPower: false,
      storageQuotaBytes: null,
      maxBadgeTextLength: null
    };
  }

  // Environment detection methods

  private isExtensionEnvironment(): boolean {
    return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
  }

  private isServiceWorkerEnvironment(): boolean {
    return typeof importScripts === 'function' && typeof window === 'undefined';
  }

  private isContentScriptEnvironment(): boolean {
    return typeof window !== 'undefined' && window === window.top && this.isExtensionEnvironment();
  }

  private isDevToolsEnvironment(): boolean {
    return typeof chrome !== 'undefined' && chrome.devtools !== undefined;
  }

  private isPopupEnvironment(): boolean {
    return typeof window !== 'undefined' && window.location.href.includes('popup');
  }

  private isOptionsEnvironment(): boolean {
    return typeof window !== 'undefined' && window.location.href.includes('options');
  }

  private isBackgroundEnvironment(): boolean {
    return this.isServiceWorkerEnvironment() || (typeof window !== 'undefined' && window === window.top && !this.isPopupEnvironment() && !this.isOptionsEnvironment());
  }

  private getExtensionId(): string | undefined {
    try {
      return chrome?.runtime?.id;
    } catch {
      return undefined;
    }
  }

  private getManifestInfo(): chrome.runtime.Manifest | undefined {
    try {
      return chrome?.runtime?.getManifest();
    } catch {
      return undefined;
    }
  }

  // Feature test methods

  private testStorageSession(): boolean {
    try {
      return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session !== undefined;
    } catch {
      return false;
    }
  }

  private testDeclarativeNetRequest(): boolean {
    try {
      return typeof chrome !== 'undefined' && chrome.declarativeNetRequest !== undefined;
    } catch {
      return false;
    }
  }

  private testWebRequest(): boolean {
    try {
      return typeof chrome !== 'undefined' && chrome.webRequest !== undefined;
    } catch {
      return false;
    }
  }

  private testActionAPI(): boolean {
    try {
      return typeof chrome !== 'undefined' && chrome.action !== undefined;
    } catch {
      return false;
    }
  }

  private testBrowserAction(): boolean {
    try {
      return typeof chrome !== 'undefined' && chrome.browserAction !== undefined;
    } catch {
      return false;
    }
  }

  private testContextMenus(): boolean {
    try {
      return typeof chrome !== 'undefined' && chrome.contextMenus !== undefined;
    } catch {
      return false;
    }
  }

  private testNotifications(): boolean {
    try {
      return typeof chrome !== 'undefined' && chrome.notifications !== undefined;
    } catch {
      return false;
    }
  }

  private testPermissions(): boolean {
    try {
      return typeof chrome !== 'undefined' && chrome.permissions !== undefined;
    } catch {
      return false;
    }
  }

  private testAlarms(): boolean {
    try {
      return typeof chrome !== 'undefined' && chrome.alarms !== undefined;
    } catch {
      return false;
    }
  }

  private testIdle(): boolean {
    try {
      return typeof chrome !== 'undefined' && chrome.idle !== undefined;
    } catch {
      return false;
    }
  }

  private testPower(): boolean {
    try {
      return typeof chrome !== 'undefined' && chrome.power !== undefined;
    } catch {
      return false;
    }
  }

  private testTabGroups(): boolean {
    try {
      return typeof chrome !== 'undefined' && chrome.tabGroups !== undefined;
    } catch {
      return false;
    }
  }

  private testTabDiscard(): boolean {
    try {
      return typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.discard === 'function';
    } catch {
      return false;
    }
  }
}

// Convenience functions for quick access
export const detectBrowser = (): BrowserInfo => BrowserDetector.getInstance().detectBrowser();
export const getBrowserConfig = (): BrowserConfig => BrowserDetector.getInstance().getBrowserConfig();
export const getBrowserCapabilities = (): BrowserCapabilities => BrowserDetector.getInstance().getBrowserCapabilities();
export const getRuntimeEnvironment = (): RuntimeEnvironment => BrowserDetector.getInstance().getRuntimeEnvironment();
export const testFeatureSupport = (feature: string): boolean => BrowserDetector.getInstance().testFeatureSupport(feature);

// Legacy compatibility with existing cross-browser.ts
export const detectBrowserType = (): BrowserType => detectBrowser().type;
export const isManifestV3 = (): boolean => getBrowserCapabilities().manifestVersion === 3;