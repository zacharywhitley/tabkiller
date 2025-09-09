/**
 * General Settings Page
 * Basic extension configuration options
 */

import React from 'react';
import { Breadcrumb } from '../../../router';

export const GeneralSettings: React.FC = () => {
  return (
    <div className="tk-options-page tk-general-settings">
      <header className="tk-options-page__header">
        <Breadcrumb />
        <h1 className="tk-options-page__title">General Settings</h1>
        <p className="tk-options-page__description">
          Basic extension behavior and preferences
        </p>
      </header>

      <main className="tk-options-page__content">
        <div className="tk-settings-section">
          <h2 className="tk-settings-section__title">Extension Behavior</h2>
          <div className="tk-settings-field">
            <label className="tk-settings-label">
              <input type="checkbox" className="tk-settings-checkbox" />
              <span className="tk-settings-checkbox-custom"></span>
              Enable TabKiller on startup
            </label>
            <p className="tk-settings-help">Automatically start tracking when browser opens</p>
          </div>
          
          <div className="tk-settings-field">
            <label className="tk-settings-label">
              <input type="checkbox" className="tk-settings-checkbox" />
              <span className="tk-settings-checkbox-custom"></span>
              Show popup notifications
            </label>
            <p className="tk-settings-help">Display notifications for important events</p>
          </div>

          <div className="tk-settings-field">
            <label className="tk-settings-label">
              <input type="checkbox" className="tk-settings-checkbox" />
              <span className="tk-settings-checkbox-custom"></span>
              Show badge on extension icon
            </label>
            <p className="tk-settings-help">Display session count on the extension icon</p>
          </div>
        </div>

        <div className="tk-settings-section">
          <h2 className="tk-settings-section__title">Interface</h2>
          <div className="tk-settings-field">
            <label className="tk-settings-label">
              Theme
            </label>
            <select className="tk-settings-select">
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <p className="tk-settings-help">Choose your preferred interface theme</p>
          </div>

          <div className="tk-settings-field">
            <label className="tk-settings-label">
              Popup size
            </label>
            <select className="tk-settings-select">
              <option value="compact">Compact</option>
              <option value="normal">Normal</option>
              <option value="large">Large</option>
            </select>
            <p className="tk-settings-help">Size of the popup interface</p>
          </div>
        </div>

        <div className="tk-settings-actions">
          <button className="tk-button tk-button--primary">
            Save Changes
          </button>
          <button className="tk-button tk-button--secondary">
            Reset to Defaults
          </button>
        </div>
      </main>
    </div>
  );
};