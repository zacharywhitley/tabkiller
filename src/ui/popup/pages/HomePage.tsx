/**
 * Popup Home Page
 * Main popup interface content
 */

import React, { useCallback } from 'react';
import { 
  useTabContext, 
  useSessionContext, 
  useUIContext 
} from '../../../contexts';
import { useExtensionInfo } from '../../../hooks/useExtensionInfo';
import { useSessionManagement } from '../../../hooks/useSessionManagement';
import { ExternalLink } from '../../../router';
import { Button, Input, Card, Layout } from '../../components';

export const HomePage: React.FC = () => {
  const { state: tabState } = useTabContext();
  const { state: sessionState } = useSessionContext();
  const { state: uiState, actions: uiActions } = useUIContext();
  const extensionInfo = useExtensionInfo();
  const sessionManagement = useSessionManagement();

  const handleStartSession = useCallback(async () => {
    try {
      const sessionName = `Session ${new Date().toLocaleString()}`;
      await sessionManagement.createSession(sessionName);
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  }, [sessionManagement]);

  const handleSaveSession = useCallback(async () => {
    if (sessionState.currentSession) {
      try {
        await sessionManagement.addAllTabsToSession(sessionState.currentSession.id);
      } catch (error) {
        console.error('Failed to save session:', error);
      }
    }
  }, [sessionState.currentSession, sessionManagement]);

  return (
    <div className="tk-popup-page tk-popup-home">
      <header className="tk-popup__header">
        <h1 className="tk-popup__title">TabKiller</h1>
        <div className="tk-popup__status">
          <span className={`tk-popup__status-dot ${
            sessionState.currentSession ? 'tk-popup__status-dot--active' : 'tk-popup__status-dot--inactive'
          }`}></span>
          <span className="tk-popup__status-text">
            {sessionState.currentSession ? 'Session Active' : 'No Active Session'}
          </span>
        </div>
      </header>

      <main className="tk-popup__content">
        {/* Search Section */}
        <Layout direction="column" gap="sm" padding="none">
          <Input
            placeholder="Search tabs and sessions..."
            value={uiState.searchQuery}
            onChange={(e) => uiActions.setSearchQuery(e.target.value)}
            startIcon="🔍"
            fullWidth
          />
        </Layout>

        {/* Current Session Section */}
        <section className="tk-popup__section">
          <h2 className="tk-popup__section-title">Current Session</h2>
          <div className="tk-session-info">
            {sessionState.currentSession ? (
              <div className="tk-session-info__active">
                <h3>{sessionState.currentSession.name}</h3>
                <p>{sessionState.currentSession.tabs.length} tabs</p>
                <p>Started: {new Date(sessionState.currentSession.startTime).toLocaleTimeString()}</p>
              </div>
            ) : (
              <div className="tk-session-info__placeholder">
                No active session
              </div>
            )}
          </div>
          <Layout direction="row" gap="sm" justify="start" wrap>
            <Button 
              variant="primary"
              onClick={handleStartSession}
              disabled={!!sessionState.currentSession}
            >
              Start New Session
            </Button>
            <Button 
              variant="secondary" 
              onClick={handleSaveSession}
              disabled={!sessionState.currentSession}
            >
              Save Current Tabs
            </Button>
            <Button 
              variant="outline" 
              disabled={!sessionState.currentSession}
            >
              Add Tags
            </Button>
          </Layout>
        </section>

        {/* Quick Stats Section */}
        <Layout direction="column" gap="sm">
          <h2 className="tk-popup__section-title">Quick Stats</h2>
          <Card variant="outlined" padding="medium">
            <Layout direction="row" gap="lg" justify="between">
              <Layout direction="column" align="center" gap="xs">
                <span className="tk-stat-item__label">Active Tabs</span>
                <span className="tk-stat-item__value">{tabState.allTabs.length}</span>
              </Layout>
              <Layout direction="column" align="center" gap="xs">
                <span className="tk-stat-item__label">Total Sessions</span>
                <span className="tk-stat-item__value">{sessionState.sessionStats.totalSessions}</span>
              </Layout>
              <Layout direction="column" align="center" gap="xs">
                <span className="tk-stat-item__label">Today's Pages</span>
                <span className="tk-stat-item__value">{sessionState.sessionStats.todaysPages}</span>
              </Layout>
            </Layout>
          </Card>
        </Layout>

        {/* Quick Actions Section */}
        <section className="tk-popup__section">
          <h2 className="tk-popup__section-title">Quick Actions</h2>
          <div className="tk-popup__actions tk-popup__actions--grid">
            <button className="tk-popup__button tk-popup__button--outline">
              <span className="tk-popup__button-icon">📸</span>
              Capture Tabs
            </button>
            <ExternalLink 
              to="/history/browse"
              className="tk-popup__button tk-popup__button--outline"
              title="View browsing history"
            >
              <span className="tk-popup__button-icon">📚</span>
              View History
            </ExternalLink>
            <button className="tk-popup__button tk-popup__button--outline">
              <span className="tk-popup__button-icon">📤</span>
              Export Data
            </button>
            <ExternalLink 
              to="/options/general"
              className="tk-popup__button tk-popup__button--outline"
              title="Open settings"
            >
              <span className="tk-popup__button-icon">⚙️</span>
              Settings
            </ExternalLink>
          </div>
        </section>

        {/* Recent Sessions Section */}
        <section className="tk-popup__section">
          <h2 className="tk-popup__section-title">Recent Sessions</h2>
          <div className="tk-session-list">
            {sessionState.recentSessions.length > 0 ? (
              sessionState.recentSessions.slice(0, 3).map(session => (
                <div key={session.id} className="tk-session-item">
                  <h4>{session.name}</h4>
                  <p>{session.tabs.length} tabs • {session.tags.length} tags</p>
                  <small>{new Date(session.startTime).toLocaleDateString()}</small>
                </div>
              ))
            ) : (
              <div className="tk-session-list__placeholder">
                No recent sessions
              </div>
            )}
          </div>
          <ExternalLink 
            to="/history/sessions"
            className="tk-popup__button tk-popup__button--text"
            title="View all sessions"
          >
            View All Sessions
          </ExternalLink>
        </section>
      </main>

      <footer className="tk-popup__footer">
        <div className="tk-popup__footer-info">
          <span className="tk-popup__version">v{extensionInfo.version}</span>
          <span className="tk-popup__browser">{extensionInfo.browser}</span>
        </div>
      </footer>
    </div>
  );
};