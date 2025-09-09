/**
 * Context Menu Internationalization
 * Exports for multi-language support in context menus
 */

export * from './types';
export * from './i18n-manager';
export { enTranslations } from './locales/en';

// Default export for convenience
export { i18nManager as default } from './i18n-manager';