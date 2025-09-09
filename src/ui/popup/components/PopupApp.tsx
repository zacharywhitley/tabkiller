import React from 'react';
import { App } from '../../common/components';
import { ExtensionRouter, NavigationProvider, CompactNavigation } from '../../../router';

/**
 * Main Popup Application Component
 * Renders the TabKiller popup interface with routing support
 */
export const PopupApp: React.FC = () => {
  return (
    <App context="popup">
      <ExtensionRouter context="popup">
        <NavigationProvider context="popup">
          <div className="tk-popup">
            <CompactNavigation className="tk-popup__navigation" />
            {/* Router content will be rendered here */}
          </div>
        </NavigationProvider>
      </ExtensionRouter>
    </App>
  );
};

export default PopupApp;