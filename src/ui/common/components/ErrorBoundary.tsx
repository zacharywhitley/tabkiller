import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * Error Boundary component for graceful error handling in React UI
 * Catches JavaScript errors anywhere in the child component tree and displays fallback UI
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="tk-error-boundary">
          <div className="tk-error-boundary__content">
            <h2 className="tk-error-boundary__title">Something went wrong</h2>
            <p className="tk-error-boundary__message">
              An unexpected error occurred in the TabKiller interface.
            </p>
            <details className="tk-error-boundary__details">
              <summary>Error details</summary>
              <pre className="tk-error-boundary__stack">
                {this.state.error && this.state.error.toString()}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </details>
            <div className="tk-error-boundary__actions">
              <button 
                className="tk-error-boundary__button tk-error-boundary__button--primary"
                onClick={() => window.location.reload()}
              >
                Reload Extension
              </button>
              <button 
                className="tk-error-boundary__button tk-error-boundary__button--secondary"
                onClick={() => this.setState({ hasError: false, error: undefined, errorInfo: undefined })}
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;