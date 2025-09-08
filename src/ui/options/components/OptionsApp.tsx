import React from 'react';
import { App } from '../../common/components';

/**
 * Main Options Application Component
 * Renders the TabKiller options/settings interface
 */
export const OptionsApp: React.FC = () => {
  return (
    <App context="options">
      <div className="tk-options">
        <header className="tk-options__header">
          <h1 className="tk-options__title">TabKiller Settings</h1>
          <p className="tk-options__description">
            Configure your TabKiller extension settings and preferences
          </p>
        </header>

        <main className="tk-options__content">
          <nav className="tk-options__nav">
            <ul className="tk-options__nav-list">
              <li className="tk-options__nav-item tk-options__nav-item--active">
                <a href="#general" className="tk-options__nav-link">General</a>
              </li>
              <li className="tk-options__nav-item">
                <a href="#tracking" className="tk-options__nav-link">Tracking</a>
              </li>
              <li className="tk-options__nav-item">
                <a href="#sessions" className="tk-options__nav-link">Sessions</a>
              </li>
              <li className="tk-options__nav-item">
                <a href="#privacy" className="tk-options__nav-link">Privacy</a>
              </li>
              <li className="tk-options__nav-item">
                <a href="#sync" className="tk-options__nav-link">Sync</a>
              </li>
              <li className="tk-options__nav-item">
                <a href="#advanced" className="tk-options__nav-link">Advanced</a>
              </li>
            </ul>
          </nav>

          <div className="tk-options__panels">
            {/* General Settings */}
            <section id="general" className="tk-options__panel tk-options__panel--active">
              <h2 className="tk-options__panel-title">General Settings</h2>
              
              <div className="tk-options__section">
                <h3 className="tk-options__section-title">Extension Behavior</h3>
                <div className="tk-options__field">
                  <label className="tk-options__label">
                    <input type="checkbox" className="tk-options__checkbox" />
                    <span className="tk-options__checkbox-custom"></span>
                    Enable TabKiller on startup
                  </label>
                  <p className="tk-options__help">Automatically start tracking when browser opens</p>
                </div>
                
                <div className="tk-options__field">
                  <label className="tk-options__label">
                    <input type="checkbox" className="tk-options__checkbox" />
                    <span className="tk-options__checkbox-custom"></span>
                    Show popup notifications
                  </label>
                  <p className="tk-options__help">Display notifications for important events</p>
                </div>
              </div>
            </section>

            {/* Tracking Settings */}
            <section id="tracking" className="tk-options__panel">
              <h2 className="tk-options__panel-title">Tracking Settings</h2>
              
              <div className="tk-options__section">
                <h3 className="tk-options__section-title">Page Tracking</h3>
                <div className="tk-options__field">
                  <label className="tk-options__label">
                    <input type="checkbox" className="tk-options__checkbox" />
                    <span className="tk-options__checkbox-custom"></span>
                    Track browsing history
                  </label>
                  <p className="tk-options__help">Record pages visited for analysis and search</p>
                </div>
                
                <div className="tk-options__field">
                  <label className="tk-options__label">
                    <input type="checkbox" className="tk-options__checkbox" />
                    <span className="tk-options__checkbox-custom"></span>
                    Save page content with SingleFile
                  </label>
                  <p className="tk-options__help">Archive full page content for offline access</p>
                </div>
              </div>
            </section>

            {/* Session Settings */}
            <section id="sessions" className="tk-options__panel">
              <h2 className="tk-options__panel-title">Session Management</h2>
              
              <div className="tk-options__section">
                <h3 className="tk-options__section-title">Automatic Sessions</h3>
                <div className="tk-options__field">
                  <label className="tk-options__label">
                    <input type="checkbox" className="tk-options__checkbox" />
                    <span className="tk-options__checkbox-custom"></span>
                    Auto-create sessions
                  </label>
                  <p className="tk-options__help">Automatically create sessions based on browsing patterns</p>
                </div>
              </div>
            </section>

            {/* Privacy Settings */}
            <section id="privacy" className="tk-options__panel">
              <h2 className="tk-options__panel-title">Privacy & Security</h2>
              
              <div className="tk-options__section">
                <h3 className="tk-options__section-title">Data Encryption</h3>
                <div className="tk-options__field">
                  <label className="tk-options__label">
                    <input type="checkbox" className="tk-options__checkbox" checked readOnly />
                    <span className="tk-options__checkbox-custom"></span>
                    Encrypt all data
                  </label>
                  <p className="tk-options__help">All data is encrypted before storage (cannot be disabled)</p>
                </div>
              </div>
            </section>

            {/* Sync Settings */}
            <section id="sync" className="tk-options__panel">
              <h2 className="tk-options__panel-title">Synchronization</h2>
              
              <div className="tk-options__section">
                <h3 className="tk-options__section-title">SSB Sync</h3>
                <div className="tk-options__field">
                  <label className="tk-options__label">
                    <input type="checkbox" className="tk-options__checkbox" />
                    <span className="tk-options__checkbox-custom"></span>
                    Enable cross-device sync
                  </label>
                  <p className="tk-options__help">Synchronize data between browsers using Secure Scuttlebutt</p>
                </div>
              </div>
            </section>

            {/* Advanced Settings */}
            <section id="advanced" className="tk-options__panel">
              <h2 className="tk-options__panel-title">Advanced Settings</h2>
              
              <div className="tk-options__section">
                <h3 className="tk-options__section-title">Development</h3>
                <div className="tk-options__field">
                  <label className="tk-options__label">
                    <input type="checkbox" className="tk-options__checkbox" />
                    <span className="tk-options__checkbox-custom"></span>
                    Enable debug logging
                  </label>
                  <p className="tk-options__help">Log detailed information for troubleshooting</p>
                </div>
              </div>
            </section>
          </div>
        </main>

        <footer className="tk-options__footer">
          <div className="tk-options__actions">
            <button className="tk-options__button tk-options__button--primary">
              Save Settings
            </button>
            <button className="tk-options__button tk-options__button--secondary">
              Reset to Defaults
            </button>
          </div>
        </footer>
      </div>
    </App>
  );
};

export default OptionsApp;