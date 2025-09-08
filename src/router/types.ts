/**
 * Router Types for TabKiller Extension
 * Defines routing interfaces and types for extension navigation
 */

export type ExtensionContext = 'popup' | 'options' | 'history';

export interface RouteConfig {
  path: string;
  component: React.ComponentType;
  title?: string;
  description?: string;
  requiresAuth?: boolean;
  showInNavigation?: boolean;
  icon?: string;
}

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon?: string;
  description?: string;
  external?: boolean;
  disabled?: boolean;
}

export interface BreadcrumbItem {
  label: string;
  path?: string;
  active?: boolean;
}

export interface RouterState {
  currentPath: string;
  context: ExtensionContext;
  canGoBack: boolean;
  canGoForward: boolean;
  breadcrumbs: BreadcrumbItem[];
}

export interface ExtensionRouterConfig {
  context: ExtensionContext;
  basePath: string;
  routes: RouteConfig[];
  defaultRoute?: string;
  fallbackRoute?: string;
  enableDeepLinking?: boolean;
  enableBreadcrumbs?: boolean;
}

export interface NavigationContextValue {
  navigate: (path: string, options?: NavigationOptions) => void;
  goBack: () => void;
  goForward: () => void;
  refresh: () => void;
  getCurrentRoute: () => RouteConfig | undefined;
  getBreadcrumbs: () => BreadcrumbItem[];
  isRouteActive: (path: string) => boolean;
  getNavigationItems: () => NavigationItem[];
}

export interface NavigationOptions {
  replace?: boolean;
  state?: any;
  external?: boolean;
}

export interface RouteParams {
  [key: string]: string | undefined;
}

export interface RouteMatch {
  path: string;
  params: RouteParams;
  query: URLSearchParams;
}