/**
 * Browse History Page
 * Interface for browsing through recorded history
 */

import React, { useState } from 'react';
import { Breadcrumb } from '../../../router';

export const BrowseHistory: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');

  return (
    <div className="tk-history-page tk-browse-history">
      <header className="tk-history-page__header">
        <Breadcrumb />
        <h1 className="tk-history-page__title">Browse History</h1>
        <p className="tk-history-page__description">
          Browse through your recorded browsing history
        </p>
      </header>

      <main className="tk-history-page__content">
        <div className="tk-history-filters">
          <div className="tk-filter-group">
            <input
              type="text"
              className="tk-search-input"
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="tk-filter-group">
            <select 
              className="tk-filter-select"
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
            </select>
          </div>
        </div>

        <div className="tk-history-list">
          <div className="tk-empty-state">
            <h2>No history found</h2>
            <p>Start browsing to see your history here, or enable tracking in settings.</p>
          </div>
        </div>
      </main>
    </div>
  );
};