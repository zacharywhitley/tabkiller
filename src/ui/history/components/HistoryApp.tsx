import React from 'react';
import { App } from '../../common/components';
import { ExtensionRouter, NavigationProvider, Navigation, NavigationControls, Breadcrumb } from '../../../router';

/**
 * Main History Application Component
 * Renders the TabKiller history interface with routing support
 */
export const HistoryApp: React.FC = () => {
  return (
    <App context="history">
      <ExtensionRouter context="history">
        <NavigationProvider context="history">
          <div className="tk-history">
            <header className="tk-history__header">
              <div className="tk-history__header-controls">
                <NavigationControls />
                <Breadcrumb />
              </div>
              <h1 className="tk-history__title">TabKiller History</h1>
              <p className="tk-history__description">
                Explore your browsing history, sessions, and analytics
              </p>
            </header>

            <main className="tk-history__content">
              <nav className="tk-history__nav">
                <Navigation vertical={true} />
              </nav>

              <div className="tk-history__panels">
                {/* Router content will be rendered here */}
              </div>
            </main>
          </div>
        </NavigationProvider>
      </ExtensionRouter>
    </App>
  );
};

export default HistoryApp;