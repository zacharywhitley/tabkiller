/**
 * Navigation Context for Extension Router
 * Provides navigation state and actions throughout the app
 */

import React, { createContext, useContext, useCallback, useMemo, useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { 
  NavigationContextValue, 
  NavigationOptions, 
  RouteConfig, 
  BreadcrumbItem,
  NavigationItem,
  ExtensionContext,
  RouteMatch
} from './types';
import { getRouterConfig, getNavigationItems, EXTENSION_NAVIGATION } from './config';

interface NavigationProviderProps {
  context: ExtensionContext;
  children: React.ReactNode;
}

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined);

/**
 * Navigation Provider Component
 */
export const NavigationProvider: React.FC<NavigationProviderProps> = ({
  context,
  children
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [history, setHistory] = useState<string[]>([location.pathname]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const config = useMemo(() => getRouterConfig(context), [context]);
  const navigationItems = useMemo(() => getNavigationItems(context), [context]);

  // Update history tracking
  useEffect(() => {
    const currentPath = location.pathname;
    setHistory(prev => {
      const newHistory = [...prev];
      if (newHistory[newHistory.length - 1] !== currentPath) {
        newHistory.push(currentPath);
        setCurrentIndex(newHistory.length - 1);
      }
      return newHistory;
    });
  }, [location.pathname]);

  /**
   * Enhanced navigation function with extension-specific handling
   */
  const navigateHandler = useCallback((path: string, options: NavigationOptions = {}) => {
    if (options.external) {
      // Handle external navigation (cross-context)
      if (path.startsWith('/options')) {
        EXTENSION_NAVIGATION.openOptions(path.replace('/options/', ''));
      } else if (path.startsWith('/history')) {
        EXTENSION_NAVIGATION.openHistory(path.replace('/history/', ''));
      } else {
        // Regular external URL
        window.open(path, '_blank');
      }
      return;
    }

    // Internal navigation
    const navigateOptions: any = {};
    if (options.replace) navigateOptions.replace = true;
    if (options.state) navigateOptions.state = options.state;

    navigate(path, navigateOptions);
  }, [navigate]);

  /**
   * Go back in history
   */
  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      const previousPath = history[currentIndex - 1];
      setCurrentIndex(currentIndex - 1);
      navigate(previousPath, { replace: true });
    }
  }, [history, currentIndex, navigate]);

  /**
   * Go forward in history
   */
  const goForward = useCallback(() => {
    if (currentIndex < history.length - 1) {
      const nextPath = history[currentIndex + 1];
      setCurrentIndex(currentIndex + 1);
      navigate(nextPath, { replace: true });
    }
  }, [history, currentIndex, navigate]);

  /**
   * Refresh current page
   */
  const refresh = useCallback(() => {
    window.location.reload();
  }, []);

  /**
   * Get current route configuration
   */
  const getCurrentRoute = useCallback((): RouteConfig | undefined => {
    return config.routes.find(route => {
      // Simple path matching - could be enhanced with parameter matching
      return route.path === location.pathname ||
             (route.path === config.defaultRoute && location.pathname === '/');
    });
  }, [config.routes, config.defaultRoute, location.pathname]);

  /**
   * Generate breadcrumbs for current route
   */
  const getBreadcrumbs = useCallback((): BreadcrumbItem[] => {
    const currentRoute = getCurrentRoute();
    
    if (!config.enableBreadcrumbs || !currentRoute) {
      return [];
    }

    const breadcrumbs: BreadcrumbItem[] = [
      { label: 'Home', path: config.defaultRoute || '/' }
    ];

    // Add current route if not home
    if (currentRoute.path !== (config.defaultRoute || '/')) {
      breadcrumbs.push({
        label: currentRoute.title || currentRoute.path,
        active: true
      });
    } else {
      breadcrumbs[0].active = true;
    }

    return breadcrumbs;
  }, [getCurrentRoute, config.enableBreadcrumbs, config.defaultRoute]);

  /**
   * Check if route is currently active
   */
  const isRouteActive = useCallback((path: string): boolean => {
    return location.pathname === path ||
           (path === config.defaultRoute && location.pathname === '/');
  }, [location.pathname, config.defaultRoute]);

  /**
   * Get navigation items for current context
   */
  const getNavigationItemsHandler = useCallback((): NavigationItem[] => {
    return navigationItems;
  }, [navigationItems]);

  const contextValue: NavigationContextValue = useMemo(() => ({
    navigate: navigateHandler,
    goBack,
    goForward,
    refresh,
    getCurrentRoute,
    getBreadcrumbs,
    isRouteActive,
    getNavigationItems: getNavigationItemsHandler
  }), [
    navigateHandler,
    goBack,
    goForward,
    refresh,
    getCurrentRoute,
    getBreadcrumbs,
    isRouteActive,
    getNavigationItemsHandler
  ]);

  return (
    <NavigationContext.Provider value={contextValue}>
      {children}
    </NavigationContext.Provider>
  );
};

/**
 * Hook to use navigation context
 */
export const useNavigation = (): NavigationContextValue => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};

/**
 * Hook to get current route match with parameters
 */
export const useRouteMatch = (): RouteMatch => {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  return useMemo(() => ({
    path: location.pathname,
    params: {}, // Could be enhanced to parse route parameters
    query: searchParams
  }), [location.pathname, searchParams]);
};

/**
 * Hook to check if we can navigate back/forward
 */
export const useNavigationState = () => {
  const location = useLocation();
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    // Simple implementation - could be enhanced with proper history tracking
    setCanGoBack(window.history.length > 1);
    setCanGoForward(false); // Browser extension context typically doesn't support forward
  }, [location]);

  return { canGoBack, canGoForward };
};

export default NavigationProvider;