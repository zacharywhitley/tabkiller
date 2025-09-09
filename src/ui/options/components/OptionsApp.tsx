import React from 'react';
import { App } from '../../common/components';
import { ExtensionRouter, NavigationProvider, Navigation, NavigationControls } from '../../../router';

/**
 * Main Options Application Component
 * Renders the TabKiller options/settings interface with routing support
 */
export const OptionsApp: React.FC = () => {
  return (
    <App context="options">
      <ExtensionRouter context="options">
        <NavigationProvider context="options">
          <div className="tk-options">
            <header className="tk-options__header">
              <NavigationControls showRefresh={false} />
              <h1 className="tk-options__title">TabKiller Settings</h1>
              <p className="tk-options__description">
                Configure your TabKiller extension settings and preferences
              </p>
            </header>

            <main className="tk-options__content">
              <nav className="tk-options__nav">
                <Navigation vertical={true} />
              </nav>

              <div className="tk-options__panels">
                {/* Router content will be rendered here */}
              </div>
            </main>
          </div>
        </NavigationProvider>
      </ExtensionRouter>
    </App>
  );
};

export default OptionsApp;