import React, { StrictMode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface AppProps {
  children: React.ReactNode;
  context: 'popup' | 'options' | 'history';
  enableStrictMode?: boolean;
}

/**
 * Base App component that wraps all extension UI contexts
 * Provides error boundaries, StrictMode, and context-specific configuration
 */
export const App: React.FC<AppProps> = ({ 
  children, 
  context, 
  enableStrictMode = true 
}) => {
  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    console.error(`Error in ${context} context:`, error, errorInfo);
    
    // Could send error reports to background script
    // messaging.sendMessage({ 
    //   type: 'error-report', 
    //   payload: { context, error: error.message, stack: error.stack } 
    // });
  };

  const renderApp = () => (
    <ErrorBoundary onError={handleError}>
      <div className={`tk-app tk-app--${context}`} data-context={context}>
        {children}
      </div>
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