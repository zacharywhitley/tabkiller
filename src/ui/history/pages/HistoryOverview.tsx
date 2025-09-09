/**
 * History Overview Page
 * Main landing page for the history interface
 */

import React from 'react';
import { Navigation } from '../../../router';

export const HistoryOverview: React.FC = () => {
  return (
    <div className="tk-history-page tk-history-overview">
      <header className="tk-history-page__header">
        <h1 className="tk-history-page__title">Browsing History</h1>
        <p className="tk-history-page__description">
          Explore your browsing history, sessions, and analytics
        </p>
      </header>

      <main className="tk-history-page__content">
        <div className="tk-history-overview__navigation">
          <Navigation vertical={true} />
        </div>
        
        <div className="tk-history-overview__dashboard">
          <div className="tk-dashboard-stats">
            <div className="tk-stat-card">
              <h3>Total Pages Visited</h3>
              <div className="tk-stat-number">1,234</div>
            </div>
            <div className="tk-stat-card">
              <h3>Sessions Created</h3>
              <div className="tk-stat-number">56</div>
            </div>
            <div className="tk-stat-card">
              <h3>Hours Tracked</h3>
              <div className="tk-stat-number">123</div>
            </div>
          </div>

          <div className="tk-recent-activity">
            <h2>Recent Activity</h2>
            <p>Your browsing history will appear here once tracking is enabled.</p>
          </div>
        </div>
      </main>
    </div>
  );
};