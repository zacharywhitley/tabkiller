import React from 'react';
import { App } from '../../common/components';

/**
 * Main Popup Application Component
 * Renders the TabKiller popup interface with session management and quick actions
 */
export const PopupApp: React.FC = () => {
  return (
    <App context="popup">
      <div className="tk-popup">
        <header className="tk-popup__header">
          <h1 className="tk-popup__title">TabKiller</h1>
          <div className="tk-popup__status" id="status-indicator">
            <span className="tk-popup__status-dot tk-popup__status-dot--active"></span>
            <span className="tk-popup__status-text">Active</span>
          </div>
        </header>

        <main className="tk-popup__content">
          {/* Search Section */}
          <section className="tk-popup__section tk-popup__section--search">
            <div className="tk-search-container" id="search-container">
              {/* Search component will be integrated here */}
              <div className="tk-search-placeholder">
                Search functionality will be integrated with React Context
              </div>
            </div>
          </section>

          {/* Current Session Section */}
          <section className="tk-popup__section">
            <h2 className="tk-popup__section-title">Current Session</h2>
            <div className="tk-session-info" id="current-session">
              <div className="tk-session-info__placeholder">
                No active session
              </div>
            </div>
            <div className="tk-popup__actions">
              <button className="tk-popup__button tk-popup__button--primary" id="create-session-btn">
                Start New Session
              </button>
              <button className="tk-popup__button tk-popup__button--secondary" id="save-session-btn" disabled>
                Save Session
              </button>
              <button className="tk-popup__button tk-popup__button--outline" id="tag-session-btn" disabled>
                Add Tags
              </button>
            </div>
          </section>

          {/* Quick Stats Section */}
          <section className="tk-popup__section">
            <h2 className="tk-popup__section-title">Quick Stats</h2>
            <div className="tk-stats-grid">
              <div className="tk-stat-item">
                <span className="tk-stat-item__label">Active Tabs</span>
                <span className="tk-stat-item__value" id="active-tabs-count">0</span>
              </div>
              <div className="tk-stat-item">
                <span className="tk-stat-item__label">Total Sessions</span>
                <span className="tk-stat-item__value" id="total-sessions-count">0</span>
              </div>
              <div className="tk-stat-item">
                <span className="tk-stat-item__label">Today's Pages</span>
                <span className="tk-stat-item__value" id="todays-pages-count">0</span>
              </div>
            </div>
          </section>

          {/* Quick Actions Section */}
          <section className="tk-popup__section">
            <h2 className="tk-popup__section-title">Quick Actions</h2>
            <div className="tk-popup__actions tk-popup__actions--grid">
              <button className="tk-popup__button tk-popup__button--outline" id="capture-tabs-btn">
                <span className="tk-popup__button-icon">📸</span>
                Capture Tabs
              </button>
              <button className="tk-popup__button tk-popup__button--outline" id="view-history-btn">
                <span className="tk-popup__button-icon">📚</span>
                View History
              </button>
              <button className="tk-popup__button tk-popup__button--outline" id="export-data-btn">
                <span className="tk-popup__button-icon">📤</span>
                Export Data
              </button>
              <button className="tk-popup__button tk-popup__button--outline" id="settings-btn">
                <span className="tk-popup__button-icon">⚙️</span>
                Settings
              </button>
            </div>
          </section>

          {/* Recent Sessions Section */}
          <section className="tk-popup__section">
            <h2 className="tk-popup__section-title">Recent Sessions</h2>
            <div className="tk-session-list" id="recent-sessions">
              <div className="tk-session-list__placeholder">
                No recent sessions
              </div>
            </div>
            <button className="tk-popup__button tk-popup__button--text" id="view-all-sessions-btn">
              View All Sessions
            </button>
          </section>
        </main>

        <footer className="tk-popup__footer">
          <div className="tk-popup__footer-info">
            <span className="tk-popup__version" id="version-info">v0.1.0</span>
            <span className="tk-popup__browser" id="browser-info">Chrome</span>
          </div>
        </footer>
      </div>
    </App>
  );
};

export default PopupApp;