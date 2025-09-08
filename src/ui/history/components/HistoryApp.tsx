import React from 'react';
import { App } from '../../common/components';

/**
 * Main History Application Component
 * Renders the TabKiller browsing history interface with search and visualization
 */
export const HistoryApp: React.FC = () => {
  return (
    <App context="history">
      <div className="tk-history">
        <header className="tk-history__header">
          <h1 className="tk-history__title">TabKiller History</h1>
          <p className="tk-history__description">
            Explore your browsing history, sessions, and patterns
          </p>
        </header>

        <div className="tk-history__toolbar">
          <div className="tk-history__search">
            <input 
              type="search" 
              className="tk-history__search-input"
              placeholder="Search your browsing history..."
            />
            <button className="tk-history__search-button">Search</button>
          </div>
          
          <div className="tk-history__filters">
            <select className="tk-history__filter-select">
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
            
            <select className="tk-history__filter-select">
              <option value="all">All Types</option>
              <option value="pages">Pages</option>
              <option value="sessions">Sessions</option>
              <option value="tags">Tagged</option>
            </select>
          </div>
          
          <div className="tk-history__view-toggle">
            <button className="tk-history__view-button tk-history__view-button--active">
              Timeline
            </button>
            <button className="tk-history__view-button">
              Graph
            </button>
            <button className="tk-history__view-button">
              Sessions
            </button>
          </div>
        </div>

        <main className="tk-history__content">
          <div className="tk-history__sidebar">
            <div className="tk-history__stats">
              <h3 className="tk-history__stats-title">Statistics</h3>
              <div className="tk-history__stat-item">
                <span className="tk-history__stat-label">Total Pages</span>
                <span className="tk-history__stat-value">1,234</span>
              </div>
              <div className="tk-history__stat-item">
                <span className="tk-history__stat-label">Sessions</span>
                <span className="tk-history__stat-value">56</span>
              </div>
              <div className="tk-history__stat-item">
                <span className="tk-history__stat-label">Domains</span>
                <span className="tk-history__stat-value">89</span>
              </div>
              <div className="tk-history__stat-item">
                <span className="tk-history__stat-label">Tags</span>
                <span className="tk-history__stat-value">23</span>
              </div>
            </div>

            <div className="tk-history__tags">
              <h3 className="tk-history__tags-title">Popular Tags</h3>
              <div className="tk-history__tag-cloud">
                <span className="tk-history__tag">research</span>
                <span className="tk-history__tag">work</span>
                <span className="tk-history__tag">learning</span>
                <span className="tk-history__tag">news</span>
                <span className="tk-history__tag">development</span>
              </div>
            </div>

            <div className="tk-history__domains">
              <h3 className="tk-history__domains-title">Top Domains</h3>
              <div className="tk-history__domain-list">
                <div className="tk-history__domain-item">
                  <span className="tk-history__domain-name">github.com</span>
                  <span className="tk-history__domain-count">234</span>
                </div>
                <div className="tk-history__domain-item">
                  <span className="tk-history__domain-name">stackoverflow.com</span>
                  <span className="tk-history__domain-count">156</span>
                </div>
                <div className="tk-history__domain-item">
                  <span className="tk-history__domain-name">docs.google.com</span>
                  <span className="tk-history__domain-count">89</span>
                </div>
              </div>
            </div>
          </div>

          <div className="tk-history__main">
            <div className="tk-history__timeline">
              <h3 className="tk-history__timeline-title">Browsing Timeline</h3>
              
              <div className="tk-history__timeline-content">
                <div className="tk-history__timeline-item">
                  <div className="tk-history__timeline-date">Today</div>
                  <div className="tk-history__timeline-entries">
                    <div className="tk-history__entry">
                      <div className="tk-history__entry-time">14:30</div>
                      <div className="tk-history__entry-content">
                        <div className="tk-history__entry-title">React Documentation</div>
                        <div className="tk-history__entry-url">https://react.dev/learn</div>
                        <div className="tk-history__entry-tags">
                          <span className="tk-history__entry-tag">learning</span>
                          <span className="tk-history__entry-tag">development</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="tk-history__entry">
                      <div className="tk-history__entry-time">13:45</div>
                      <div className="tk-history__entry-content">
                        <div className="tk-history__entry-title">TypeScript Handbook</div>
                        <div className="tk-history__entry-url">https://typescriptlang.org/docs/</div>
                        <div className="tk-history__entry-tags">
                          <span className="tk-history__entry-tag">learning</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="tk-history__timeline-item">
                  <div className="tk-history__timeline-date">Yesterday</div>
                  <div className="tk-history__timeline-entries">
                    <div className="tk-history__entry">
                      <div className="tk-history__entry-time">16:20</div>
                      <div className="tk-history__entry-content">
                        <div className="tk-history__entry-title">GitHub Repository</div>
                        <div className="tk-history__entry-url">https://github.com/user/project</div>
                        <div className="tk-history__entry-tags">
                          <span className="tk-history__entry-tag">work</span>
                          <span className="tk-history__entry-tag">development</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        <footer className="tk-history__footer">
          <div className="tk-history__footer-actions">
            <button className="tk-history__button tk-history__button--secondary">
              Export History
            </button>
            <button className="tk-history__button tk-history__button--primary">
              Analyze Patterns
            </button>
          </div>
        </footer>
      </div>
    </App>
  );
};

export default HistoryApp;