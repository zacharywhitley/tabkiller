/**
 * Popup Quick Actions Page
 * Quick actions and shortcuts interface
 */

import React from 'react';
import { ExternalLink, RouteLink } from '../../../router';

export const QuickActionsPage: React.FC = () => {
  return (
    <div className="tk-popup-page tk-popup-quick-actions">
      <header className="tk-popup-page__header">
        <div className="tk-popup-page__nav">
          <RouteLink to="/" className="tk-popup-page__back">← Back</RouteLink>
        </div>
        <h1 className="tk-popup-page__title">Quick Actions</h1>
      </header>

      <main className="tk-popup-page__content">
        <div className="tk-actions-grid">
          <div className="tk-action-group">
            <h2 className="tk-action-group__title">Tab Management</h2>
            <button className="tk-action-button">
              <span className="tk-action-button__icon">📸</span>
              <span className="tk-action-button__label">Capture All Tabs</span>
              <span className="tk-action-button__desc">Save current tab state</span>
            </button>
            <button className="tk-action-button">
              <span className="tk-action-button__icon">🔄</span>
              <span className="tk-action-button__label">Refresh All Tabs</span>
              <span className="tk-action-button__desc">Reload all open tabs</span>
            </button>
            <button className="tk-action-button">
              <span className="tk-action-button__icon">✖️</span>
              <span className="tk-action-button__label">Close Duplicates</span>
              <span className="tk-action-button__desc">Remove duplicate tabs</span>
            </button>
          </div>

          <div className="tk-action-group">
            <h2 className="tk-action-group__title">Data Management</h2>
            <button className="tk-action-button">
              <span className="tk-action-button__icon">📤</span>
              <span className="tk-action-button__label">Export Data</span>
              <span className="tk-action-button__desc">Export browsing data</span>
            </button>
            <button className="tk-action-button">
              <span className="tk-action-button__icon">📥</span>
              <span className="tk-action-button__label">Import Sessions</span>
              <span className="tk-action-button__desc">Import saved sessions</span>
            </button>
            <button className="tk-action-button">
              <span className="tk-action-button__icon">🧹</span>
              <span className="tk-action-button__label">Clean History</span>
              <span className="tk-action-button__desc">Clean old history data</span>
            </button>
          </div>

          <div className="tk-action-group">
            <h2 className="tk-action-group__title">Navigation</h2>
            <ExternalLink 
              to="/history/search"
              className="tk-action-button"
            >
              <span className="tk-action-button__icon">🔍</span>
              <span className="tk-action-button__label">Search History</span>
              <span className="tk-action-button__desc">Find pages in history</span>
            </ExternalLink>
            <ExternalLink 
              to="/history/analytics"
              className="tk-action-button"
            >
              <span className="tk-action-button__icon">📊</span>
              <span className="tk-action-button__label">View Analytics</span>
              <span className="tk-action-button__desc">Browse usage analytics</span>
            </ExternalLink>
            <ExternalLink 
              to="/options/general"
              className="tk-action-button"
            >
              <span className="tk-action-button__icon">⚙️</span>
              <span className="tk-action-button__label">Settings</span>
              <span className="tk-action-button__desc">Configure extension</span>
            </ExternalLink>
          </div>
        </div>
      </main>
    </div>
  );
};