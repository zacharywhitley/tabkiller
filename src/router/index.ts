/**
 * Router Module Index
 * Main exports for TabKiller extension routing system
 */

// Core router components
export { ExtensionRouter, withExtensionRouter } from './ExtensionRouter';
export { NavigationProvider, useNavigation, useRouteMatch, useNavigationState } from './NavigationContext';

// Navigation components
export {
  Navigation,
  Breadcrumb,
  NavigationControls,
  CompactNavigation,
  ExternalLink,
  RouteLink
} from './components';

// Configuration and types
export {
  getRouterConfig,
  getNavigationItems,
  EXTENSION_NAVIGATION,
  POPUP_ROUTES_CONFIG,
  OPTIONS_ROUTES_CONFIG,
  HISTORY_ROUTES_CONFIG
} from './config';

export type {
  ExtensionContext,
  RouteConfig,
  NavigationItem,
  BreadcrumbItem,
  RouterState,
  ExtensionRouterConfig,
  NavigationContextValue,
  NavigationOptions,
  RouteParams,
  RouteMatch
} from './types';