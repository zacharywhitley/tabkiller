import React, { StrictMode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { AppContextProvider, useContextsInitialized } from '../../../contexts';

interface AppProps {
  children: React.ReactNode;
  context: 'popup' | 'options' | 'history';
  enableStrictMode?: boolean;
}

/**
 * Loading component shown while contexts are initializing
 */
const AppLoading: React.FC = () => (
  <div className="tk-app-loading">
    <div className="tk-loading-spinner"></div>
    <span>Initializing TabKiller...</span>
  </div>
);

/**
 * App content wrapper that ensures contexts are initialized
 */
const AppContent: React.FC<{ children: React.ReactNode; context: string }> = ({ 
  children, 
  context 
}) => {
  const contextsInitialized = useContextsInitialized();

  if (!contextsInitialized) {
    return <AppLoading />;
  }

  return (
    <div className={`tk-app tk-app--${context}`} data-context={context}>
      {children}
    </div>
  );
};

/**
 * Base App component that wraps all extension UI contexts
 * Provides error boundaries, StrictMode, context providers, and context-specific configuration
 */
export const App: React.FC<AppProps> = ({ 
  children, 
  context, 
  enableStrictMode = true 
}) => {
  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    console.error(`Error in ${context} context:`, error, errorInfo);
    
    // Send error reports to background script
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ 
        type: 'error-report', 
        payload: { context, error: error.message, stack: error.stack, timestamp: Date.now() } 
      }).catch(err => {
        console.error('Failed to send error report:', err);
      });
    }
  };

  const renderApp = () => (
    <ErrorBoundary onError={handleError}>
      <AppContextProvider>
        <AppContent context={context}>
          {children}
        </AppContent>
      </AppContextProvider>
    </ErrorBoundary>
  );

  if (enableStrictMode && process.env.NODE_ENV === 'development') {
    return (
      <StrictMode>
        {renderApp()}
      </StrictMode>
    );
  }

  return renderApp();
};

export default App;