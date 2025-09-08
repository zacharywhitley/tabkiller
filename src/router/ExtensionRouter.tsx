/**
 * Extension Router Component
 * React Router wrapper optimized for browser extension contexts
 */

import React, { useMemo, useEffect, useState } from 'react';
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate
} from 'react-router-dom';
import { ExtensionRouterConfig, RouteConfig, ExtensionContext } from './types';
import { getRouterConfig } from './config';
import { useUIContext } from '../contexts';

interface ExtensionRouterProps {
  context: ExtensionContext;
  children?: React.ReactNode;
}

/**
 * Route Loading Fallback Component
 */
const RouteLoadingFallback: React.FC<{ 
  context: ExtensionContext; 
  title?: string;
}> = ({ context, title }) => (
  <div className={`tk-route-loading tk-route-loading--${context}`}>
    <div className="tk-loading-spinner"></div>
    <span>Loading {title || 'page'}...</span>
  </div>
);

/**
 * Route Error Boundary Component
 */
class RouteErrorBoundary extends React.Component<
  { context: ExtensionContext; title?: string; children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Route error in ${this.props.context} context:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={`tk-route-error tk-route-error--${this.props.context}`}>
          <h2>Failed to load page</h2>
          <p>There was an error loading {this.props.title || 'this page'}.</p>
          <button onClick={() => window.location.reload()}>Reload</button>
          {this.state.error && (
            <details className="tk-error-details">
              <summary>Error Details</summary>
              <pre>{this.state.error.message}</pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Route Title Manager
 * Updates document title and UI context when routes change
 */
const RouteTitleManager: React.FC<{
  config: ExtensionRouterConfig;
}> = ({ config }) => {
  const location = useLocation();
  const { actions: uiActions } = useUIContext();

  useEffect(() => {
    const currentRoute = config.routes.find(route => {
      // Simple path matching - could be enhanced with parameter matching
      return route.path === location.pathname || 
             (route.path === config.defaultRoute && location.pathname === '/');
    });

    if (currentRoute) {
      // Update document title for options and history pages
      if (config.context !== 'popup') {
        const title = `${currentRoute.title} - TabKiller`;
        document.title = title;
      }

      // Update UI context with current route info
      uiActions.setCurrentView(currentRoute.path);
      
      // Update breadcrumbs if enabled
      if (config.enableBreadcrumbs && currentRoute.title) {
        const breadcrumbs = [
          { label: 'TabKiller', path: '/' },
          { label: currentRoute.title, active: true }
        ];
        uiActions.setBreadcrumbs?.(breadcrumbs);
      }
    }
  }, [location.pathname, config, uiActions]);

  return null;
};

/**
 * Deep Link Handler
 * Manages extension-specific deep linking behavior
 */
const DeepLinkHandler: React.FC<{
  config: ExtensionRouterConfig;
}> = ({ config }) => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Handle deep linking if enabled
    if (config.enableDeepLinking) {
      // Check URL hash or parameters for initial route
      const hash = window.location.hash.substring(1);
      const targetPath = hash || config.defaultRoute;
      
      if (targetPath && targetPath !== location.pathname) {
        const routeExists = config.routes.some(route => route.path === targetPath);
        if (routeExists) {
          navigate(targetPath, { replace: true });
        }
      }
    }

    // Set up storage listener for cross-context navigation
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.navigationRequest) {
        const request = changes.navigationRequest.newValue;
        if (request && request.context === config.context) {
          navigate(request.path, { replace: request.replace });
          // Clear the request
          chrome.storage.local.remove('navigationRequest');
        }
      }
    };

    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChange);
      return () => {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      };
    }
  }, [config, navigate, location.pathname]);

  return null;
};

/**
 * Extension Router Component
 * Main router wrapper with extension-specific features
 */
export const ExtensionRouter: React.FC<ExtensionRouterProps> = ({
  context,
  children
}) => {
  const config = useMemo(() => getRouterConfig(context), [context]);

  const renderRoutes = () => {
    return (
      <Routes>
        {/* Default route redirect */}
        <Route 
          path="/" 
          element={
            config.defaultRoute && config.defaultRoute !== '/' ? 
            <Navigate to={config.defaultRoute} replace /> : 
            undefined
          } 
        />
        
        {/* Configured routes */}
        {config.routes.map((routeConfig) => (
          <Route
            key={routeConfig.path}
            path={routeConfig.path}
            element={
              <RouteErrorBoundary context={context} title={routeConfig.title}>
                <React.Suspense 
                  fallback={
                    <RouteLoadingFallback 
                      context={context} 
                      title={routeConfig.title} 
                    />
                  }
                >
                  <routeConfig.component />
                </React.Suspense>
              </RouteErrorBoundary>
            }
          />
        ))}
        
        {/* Fallback route */}
        {config.fallbackRoute && (
          <Route
            path="*"
            element={<Navigate to={config.fallbackRoute} replace />}
          />
        )}
      </Routes>
    );
  };

  return (
    <HashRouter>
      <div className={`tk-router tk-router--${context}`}>
        <RouteTitleManager config={config} />
        <DeepLinkHandler config={config} />
        
        {children}
        {renderRoutes()}
      </div>
    </HashRouter>
  );
};

/**
 * Higher-order component to wrap components with ExtensionRouter
 */
export function withExtensionRouter<P extends object>(
  Component: React.ComponentType<P>,
  context: ExtensionContext
) {
  const WrappedComponent = (props: P) => (
    <ExtensionRouter context={context}>
      <Component {...props} />
    </ExtensionRouter>
  );

  WrappedComponent.displayName = `withExtensionRouter(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

export default ExtensionRouter;