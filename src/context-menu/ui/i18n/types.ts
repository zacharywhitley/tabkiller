/**
 * Internationalization Types for Context Menu
 * Provides type definitions for multi-language support in context menus
 */

/**
 * Supported locales
 */
export type SupportedLocale = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'zh' | 'ko' | 'ru';

/**
 * Locale display information
 */
export interface LocaleInfo {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  completed: number; // Percentage of translation completion
}

/**
 * Translation keys for context menu items
 */
export interface ContextMenuTranslations {
  // Menu groups
  groups: {
    navigation: string;
    tabs: string;
    sessions: string;
    bookmarks: string;
    settings: string;
    tools: string;
    help: string;
    custom: string;
  };

  // Menu items
  items: {
    // Navigation items
    'open-popup': string;
    'show-history': string;
    'show-sessions': string;
    'show-bookmarks': string;

    // Tab management
    'capture-tabs': string;
    'save-tab': string;
    'close-tab': string;
    'restore-tab': string;
    'duplicate-tab': string;
    'pin-tab': string;
    'unpin-tab': string;
    'move-tab-to-window': string;

    // Session management
    'start-session': string;
    'end-session': string;
    'save-session': string;
    'restore-session': string;
    'tag-session': string;
    'export-session': string;

    // Bookmarks
    'bookmark-page': string;
    'bookmark-tabs': string;
    'organize-bookmarks': string;
    'import-bookmarks': string;

    // Settings
    'open-settings': string;
    'general-settings': string;
    'privacy-settings': string;
    'ui-settings': string;
    'storage-settings': string;
    'keyboard-shortcuts': string;

    // Tools
    'search-history': string;
    'export-data': string;
    'import-data': string;
    'clean-storage': string;
    'backup-data': string;

    // Help
    'user-guide': string;
    'keyboard-help': string;
    'report-issue': string;
    'about': string;
  };

  // Descriptions for menu items
  descriptions: {
    'open-popup': string;
    'show-history': string;
    'show-sessions': string;
    'capture-tabs': string;
    'start-session': string;
    'end-session': string;
    'bookmark-page': string;
    'open-settings': string;
    'search-history': string;
    'user-guide': string;
  };

  // Keyboard shortcuts display
  shortcuts: {
    ctrl: string;
    alt: string;
    shift: string;
    meta: string;
    cmd: string;
    enter: string;
    escape: string;
    space: string;
    tab: string;
    backspace: string;
    delete: string;
    'arrow-up': string;
    'arrow-down': string;
    'arrow-left': string;
    'arrow-right': string;
  };

  // Context-aware labels
  contextual: {
    // Based on selection
    'with-selection': string;
    'without-selection': string;
    
    // Based on page type
    'on-web-page': string;
    'on-extension-page': string;
    'on-local-file': string;
    'on-internal-page': string;

    // Based on media
    'with-image': string;
    'with-video': string;
    'with-audio': string;
    'with-link': string;
  };

  // Error messages
  errors: {
    'menu-creation-failed': string;
    'permission-denied': string;
    'feature-unavailable': string;
    'context-not-supported': string;
  };

  // Success messages
  success: {
    'menu-created': string;
    'settings-updated': string;
    'shortcut-registered': string;
    'customization-saved': string;
  };
}

/**
 * Translation namespace structure
 */
export interface TranslationNamespace {
  menu: ContextMenuTranslations;
}

/**
 * Translation file structure
 */
export interface TranslationData {
  locale: SupportedLocale;
  version: string;
  lastUpdated: string;
  translations: TranslationNamespace;
}

/**
 * Pluralization rules for different locales
 */
export interface PluralRules {
  zero?: (n: number) => boolean;
  one?: (n: number) => boolean;
  two?: (n: number) => boolean;
  few?: (n: number) => boolean;
  many?: (n: number) => boolean;
  other: (n: number) => boolean;
}

/**
 * Interpolation context for dynamic translations
 */
export interface InterpolationContext {
  count?: number;
  name?: string;
  shortcut?: string;
  context?: string;
  [key: string]: any;
}

/**
 * Translation function type
 */
export type TranslationFunction = (
  key: string,
  context?: InterpolationContext,
  fallback?: string
) => string;

/**
 * Namespace accessor type
 */
export type NamespaceAccessor<T> = {
  [K in keyof T]: T[K] extends object 
    ? NamespaceAccessor<T[K]> & (() => string)
    : () => string;
};

/**
 * I18n configuration
 */
export interface I18nConfig {
  defaultLocale: SupportedLocale;
  fallbackLocale: SupportedLocale;
  enableFallback: boolean;
  enableInterpolation: boolean;
  enablePluralization: boolean;
  enableRTL: boolean;
  cacheTranslations: boolean;
  loadMissingKeys: boolean;
  debug: boolean;
}

/**
 * I18n context information
 */
export interface I18nContext {
  currentLocale: SupportedLocale;
  direction: 'ltr' | 'rtl';
  availableLocales: LocaleInfo[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Translation loading status
 */
export interface TranslationLoadStatus {
  locale: SupportedLocale;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  timestamp: number;
}

/**
 * I18n manager interface
 */
export interface I18nManager {
  /**
   * Initialize the i18n system
   */
  initialize(config?: Partial<I18nConfig>): Promise<void>;

  /**
   * Change current locale
   */
  changeLocale(locale: SupportedLocale): Promise<void>;

  /**
   * Get current locale
   */
  getCurrentLocale(): SupportedLocale;

  /**
   * Get translation function
   */
  t: TranslationFunction;

  /**
   * Get namespace accessor
   */
  n<T extends keyof TranslationNamespace>(namespace: T): NamespaceAccessor<TranslationNamespace[T]>;

  /**
   * Check if key exists
   */
  exists(key: string): boolean;

  /**
   * Add custom translations
   */
  addTranslations(locale: SupportedLocale, namespace: string, translations: any): void;

  /**
   * Get available locales
   */
  getAvailableLocales(): LocaleInfo[];

  /**
   * Get loading status
   */
  getLoadingStatus(): TranslationLoadStatus[];

  /**
   * Preload locale translations
   */
  preloadLocale(locale: SupportedLocale): Promise<void>;

  /**
   * Clear translation cache
   */
  clearCache(): void;

  /**
   * Get context information
   */
  getContext(): I18nContext;

  /**
   * Clean up resources
   */
  destroy(): void;
}