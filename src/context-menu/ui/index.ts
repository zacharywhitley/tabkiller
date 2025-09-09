/**
 * Context Menu UI Integration
 * Exports for menu organization, UI components, and integration layer
 */

// Core types and interfaces
export * from './types';

// Menu organization and management
export * from './menu-organizer';
export * from './context-evaluator';

// React UI components
export * from './components';

// Internationalization
export * from './i18n';

// Default configurations
export * from './defaults';

// Integration layer
export * from './integration';

// Default exports for convenience
export { createMenuOrganizer } from './menu-organizer';
export { createMenuContextEvaluator } from './context-evaluator';
export { createMenuSystemIntegration, getGlobalMenuIntegration } from './integration';
export { i18nManager as default } from './i18n';