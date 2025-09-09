/**
 * Internationalization Manager for Context Menu
 * Handles multi-language support and translation loading
 */

import {
  I18nManager,
  I18nConfig,
  I18nContext,
  SupportedLocale,
  LocaleInfo,
  TranslationData,
  TranslationNamespace,
  TranslationLoadStatus,
  TranslationFunction,
  NamespaceAccessor,
  InterpolationContext,
  PluralRules
} from './types';

// Import translations
import { enTranslations } from './locales/en';

/**
 * Supported locales information
 */
const SUPPORTED_LOCALES: Record<SupportedLocale, LocaleInfo> = {
  'en': { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', completed: 100 },
  'es': { code: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr', completed: 0 },
  'fr': { code: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr', completed: 0 },
  'de': { code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr', completed: 0 },
  'it': { code: 'it', name: 'Italian', nativeName: 'Italiano', direction: 'ltr', completed: 0 },
  'pt': { code: 'pt', name: 'Portuguese', nativeName: 'Português', direction: 'ltr', completed: 0 },
  'ja': { code: 'ja', name: 'Japanese', nativeName: '日本語', direction: 'ltr', completed: 0 },
  'zh': { code: 'zh', name: 'Chinese', nativeName: '中文', direction: 'ltr', completed: 0 },
  'ko': { code: 'ko', name: 'Korean', nativeName: '한국어', direction: 'ltr', completed: 0 },
  'ru': { code: 'ru', name: 'Russian', nativeName: 'Русский', direction: 'ltr', completed: 0 }
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG: I18nConfig = {
  defaultLocale: 'en',
  fallbackLocale: 'en',
  enableFallback: true,
  enableInterpolation: true,
  enablePluralization: true,
  enableRTL: false,
  cacheTranslations: true,
  loadMissingKeys: true,
  debug: false
};

/**
 * Pluralization rules for English (can be extended for other locales)
 */
const PLURAL_RULES: Record<SupportedLocale, PluralRules> = {
  'en': {
    one: (n: number) => n === 1,
    other: (n: number) => n !== 1
  },
  // Other locales would have their specific rules
  'es': { other: () => true },
  'fr': { other: () => true },
  'de': { other: () => true },
  'it': { other: () => true },
  'pt': { other: () => true },
  'ja': { other: () => true },
  'zh': { other: () => true },
  'ko': { other: () => true },
  'ru': { other: () => true }
};

/**
 * I18n manager implementation
 */
export class I18nManagerImpl implements I18nManager {
  private config: I18nConfig = DEFAULT_CONFIG;
  private currentLocale: SupportedLocale = 'en';
  private translations = new Map<SupportedLocale, TranslationNamespace>();
  private loadingStatus = new Map<SupportedLocale, TranslationLoadStatus>();
  private customTranslations = new Map<string, any>();
  private initialized = false;

  constructor() {
    this.initializeLoadingStatus();
    this.loadBuiltInTranslations();
  }

  /**
   * Initialize the i18n system
   */
  async initialize(config: Partial<I18nConfig> = {}): Promise<void> {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentLocale = this.config.defaultLocale;

    // Detect browser locale if not explicitly set
    const browserLocale = this.detectBrowserLocale();
    if (browserLocale && browserLocale !== this.config.defaultLocale) {
      try {
        await this.changeLocale(browserLocale);
      } catch (error) {
        if (this.config.debug) {
          console.warn(`Failed to load browser locale '${browserLocale}', using default`, error);
        }
      }
    }

    this.initialized = true;
  }

  /**
   * Change current locale
   */
  async changeLocale(locale: SupportedLocale): Promise<void> {
    if (!this.isLocaleSupported(locale)) {
      throw new Error(`Unsupported locale: ${locale}`);
    }

    // Load locale if not already loaded
    if (!this.translations.has(locale)) {
      await this.loadLocale(locale);
    }

    this.currentLocale = locale;
    
    // Update loading status
    const status = this.loadingStatus.get(locale);
    if (status) {
      status.timestamp = Date.now();
      this.loadingStatus.set(locale, status);
    }
  }

  /**
   * Get current locale
   */
  getCurrentLocale(): SupportedLocale {
    return this.currentLocale;
  }

  /**
   * Translation function
   */
  t: TranslationFunction = (key: string, context?: InterpolationContext, fallback?: string): string => {
    try {
      let translation = this.getTranslation(key, this.currentLocale);

      // Try fallback locale if translation not found and fallback is enabled
      if (!translation && this.config.enableFallback && this.currentLocale !== this.config.fallbackLocale) {
        translation = this.getTranslation(key, this.config.fallbackLocale);
      }

      // Use provided fallback or key as last resort
      if (!translation) {
        translation = fallback || key;
        
        if (this.config.loadMissingKeys && this.config.debug) {
          console.warn(`Missing translation for key: ${key} (locale: ${this.currentLocale})`);
        }
      }

      // Apply interpolation if enabled
      if (this.config.enableInterpolation && context) {
        translation = this.interpolate(translation, context);
      }

      // Apply pluralization if enabled and count is provided
      if (this.config.enablePluralization && context?.count !== undefined) {
        translation = this.pluralize(translation, context.count, this.currentLocale);
      }

      return translation;
    } catch (error) {
      if (this.config.debug) {
        console.error(`Translation error for key '${key}':`, error);
      }
      return fallback || key;
    }
  };

  /**
   * Get namespace accessor
   */
  n<T extends keyof TranslationNamespace>(namespace: T): NamespaceAccessor<TranslationNamespace[T]> {
    const createAccessor = (path: string[]): any => {
      const accessor = () => this.t(path.join('.'));
      
      return new Proxy(accessor, {
        get: (target, prop: string) => {
          if (typeof prop === 'string') {
            return createAccessor([...path, prop]);
          }
          return target[prop];
        }
      });
    };

    return createAccessor([namespace]);
  }

  /**
   * Check if key exists
   */
  exists(key: string): boolean {
    const translation = this.getTranslation(key, this.currentLocale);
    return translation !== null && translation !== undefined;
  }

  /**
   * Add custom translations
   */
  addTranslations(locale: SupportedLocale, namespace: string, translations: any): void {
    const customKey = `${locale}-${namespace}`;
    this.customTranslations.set(customKey, translations);
  }

  /**
   * Get available locales
   */
  getAvailableLocales(): LocaleInfo[] {
    return Object.values(SUPPORTED_LOCALES);
  }

  /**
   * Get loading status
   */
  getLoadingStatus(): TranslationLoadStatus[] {
    return Array.from(this.loadingStatus.values());
  }

  /**
   * Preload locale translations
   */
  async preloadLocale(locale: SupportedLocale): Promise<void> {
    if (this.translations.has(locale)) {
      return; // Already loaded
    }

    await this.loadLocale(locale);
  }

  /**
   * Clear translation cache
   */
  clearCache(): void {
    this.translations.clear();
    this.customTranslations.clear();
    this.loadBuiltInTranslations();
  }

  /**
   * Get context information
   */
  getContext(): I18nContext {
    const currentStatus = this.loadingStatus.get(this.currentLocale);
    
    return {
      currentLocale: this.currentLocale,
      direction: SUPPORTED_LOCALES[this.currentLocale]?.direction || 'ltr',
      availableLocales: this.getAvailableLocales(),
      isLoading: currentStatus?.loading || false,
      error: currentStatus?.error || null
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.translations.clear();
    this.loadingStatus.clear();
    this.customTranslations.clear();
    this.initialized = false;
  }

  // Private helper methods

  private initializeLoadingStatus(): void {
    Object.keys(SUPPORTED_LOCALES).forEach(locale => {
      this.loadingStatus.set(locale as SupportedLocale, {
        locale: locale as SupportedLocale,
        loaded: false,
        loading: false,
        error: null,
        timestamp: 0
      });
    });
  }

  private loadBuiltInTranslations(): void {
    // Load English translations (always available)
    this.translations.set('en', enTranslations.translations);
    const enStatus = this.loadingStatus.get('en');
    if (enStatus) {
      enStatus.loaded = true;
      enStatus.loading = false;
      enStatus.timestamp = Date.now();
      this.loadingStatus.set('en', enStatus);
    }
  }

  private async loadLocale(locale: SupportedLocale): Promise<void> {
    const status = this.loadingStatus.get(locale);
    if (!status) return;

    if (status.loading) return; // Already loading

    status.loading = true;
    status.error = null;
    this.loadingStatus.set(locale, { ...status });

    try {
      let translations: TranslationData;

      // For now, only English is built-in, others would be loaded dynamically
      switch (locale) {
        case 'en':
          translations = enTranslations;
          break;
        default:
          throw new Error(`Translations for locale '${locale}' not available yet`);
      }

      this.translations.set(locale, translations.translations);
      
      status.loaded = true;
      status.loading = false;
      status.timestamp = Date.now();
    } catch (error) {
      status.loaded = false;
      status.loading = false;
      status.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loadingStatus.set(locale, { ...status });
    }
  }

  private detectBrowserLocale(): SupportedLocale | null {
    if (typeof navigator === 'undefined') return null;

    const browserLocale = navigator.language || navigator.languages?.[0];
    if (!browserLocale) return null;

    // Extract primary language code
    const primaryLocale = browserLocale.split('-')[0] as SupportedLocale;
    
    return this.isLocaleSupported(primaryLocale) ? primaryLocale : null;
  }

  private isLocaleSupported(locale: string): locale is SupportedLocale {
    return locale in SUPPORTED_LOCALES;
  }

  private getTranslation(key: string, locale: SupportedLocale): string | null {
    const translations = this.translations.get(locale);
    if (!translations) return null;

    // Handle nested keys (e.g., "menu.items.open-popup")
    const keyParts = key.split('.');
    let current: any = translations;

    for (const part of keyParts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        // Check custom translations
        const customKey = `${locale}-${key}`;
        return this.customTranslations.get(customKey) || null;
      }
    }

    return typeof current === 'string' ? current : null;
  }

  private interpolate(text: string, context: InterpolationContext): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return context[key]?.toString() || match;
    });
  }

  private pluralize(text: string, count: number, locale: SupportedLocale): string {
    const rules = PLURAL_RULES[locale];
    if (!rules) return text;

    // Simple pluralization - in real implementation, this would be more sophisticated
    if (rules.one && rules.one(count)) {
      return text; // Singular form
    } else if (rules.other && rules.other(count)) {
      return text; // Plural form - would need different text variants
    }

    return text;
  }
}

/**
 * Create a new i18n manager instance
 */
export function createI18nManager(): I18nManager {
  return new I18nManagerImpl();
}

/**
 * Global i18n manager instance
 */
export const i18nManager = createI18nManager();