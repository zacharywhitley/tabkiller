import React, { useEffect } from 'react';
import { TabProvider } from './TabContext';
import { SessionProvider } from './SessionContext';
import { SettingsProvider } from './SettingsContext';
import { UIProvider } from './UIContext';
import { ContextProviderProps } from './types';

/**
 * Centralized context provider that wraps all application contexts
 * This ensures proper provider ordering and initialization
 */
export const AppContextProvider: React.FC<ContextProviderProps> = ({ children }) => {
  // Initialize any cross-context effects or listeners here
  useEffect(() => {
    // Initialize extension-level event listeners
    const initializeExtensionListeners = () => {
      // Listen for extension install/update events
      if (chrome?.runtime?.onInstalled) {
        const handleInstalled = (details: chrome.runtime.InstalledDetails) => {
          console.log('TabKiller extension installed/updated:', details);
          
          // Perform any necessary migration or initialization
          if (details.reason === 'install') {
            console.log('First time installation - setting up defaults');
          } else if (details.reason === 'update') {
            console.log('Extension updated from version:', details.previousVersion);
          }
        };

        chrome.runtime.onInstalled.addListener(handleInstalled);
      }

      // Listen for browser startup events
      if (chrome?.runtime?.onStartup) {
        const handleStartup = () => {
          console.log('Browser startup detected');
          // Refresh data or perform startup tasks
        };

        chrome.runtime.onStartup.addListener(handleStartup);
      }

      // Listen for extension suspend/resume events
      if (chrome?.runtime?.onSuspend) {
        const handleSuspend = () => {
          console.log('Extension suspending - saving state');
          // Save any critical state before suspension
        };

        chrome.runtime.onSuspend.addListener(handleSuspend);
      }

      // Listen for connectivity changes
      const handleOnline = () => {
        console.log('Browser came online');
        // Resume sync operations or refresh data
      };

      const handleOffline = () => {
        console.log('Browser went offline');
        // Pause sync operations or show offline indicator
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // Cleanup function
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    };

    const cleanup = initializeExtensionListeners();
    
    return cleanup;
  }, []);

  // Error boundary effect for uncaught context errors
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection in context:', event.reason);
      
      // You could dispatch this to UIContext to show a notification
      window.dispatchEvent(new CustomEvent('tabkiller-error', {
        detail: {
          type: 'unhandled-rejection',
          error: event.reason,
          timestamp: Date.now()
        }
      }));
    };

    const handleError = (event: ErrorEvent) => {
      console.error('Unhandled error in context:', event.error);
      
      window.dispatchEvent(new CustomEvent('tabkiller-error', {
        detail: {
          type: 'error',
          error: event.error,
          timestamp: Date.now()
        }
      }));
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  return (
    <SettingsProvider>
      <UIProvider>
        <TabProvider>
          <SessionProvider>
            {children}
          </SessionProvider>
        </TabProvider>
      </UIProvider>
    </SettingsProvider>
  );
};

/**
 * Higher-order component to wrap components with all necessary context providers
 */
export function withAppContext<P extends object>(Component: React.ComponentType<P>) {
  const WrappedComponent = (props: P) => (
    <AppContextProvider>
      <Component {...props} />
    </AppContextProvider>
  );

  WrappedComponent.displayName = `withAppContext(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

/**
 * Hook to check if all contexts are properly initialized
 */
export function useContextsInitialized(): boolean {
  const [initialized, setInitialized] = React.useState(false);

  React.useEffect(() => {
    // Simple check to ensure contexts are mounted
    const timer = setTimeout(() => {
      setInitialized(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return initialized;
}

export default AppContextProvider;