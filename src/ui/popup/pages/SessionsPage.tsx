/**
 * Popup Sessions Page
 * Quick session management interface
 */

import React from 'react';
import { useSessionContext } from '../../../contexts';
import { RouteLink } from '../../../router';

export const SessionsPage: React.FC = () => {
  const { state: sessionState } = useSessionContext();

  return (
    <div className="tk-popup-page tk-popup-sessions">
      <header className="tk-popup-page__header">
        <div className="tk-popup-page__nav">
          <RouteLink to="/" className="tk-popup-page__back">← Back</RouteLink>
        </div>
        <h1 className="tk-popup-page__title">Sessions</h1>
      </header>

      <main className="tk-popup-page__content">
        <div className="tk-session-list">
          {sessionState.recentSessions.length > 0 ? (
            sessionState.recentSessions.map(session => (
              <div key={session.id} className="tk-session-item tk-session-item--detailed">
                <div className="tk-session-item__header">
                  <h3 className="tk-session-item__title">{session.name}</h3>
                  <span className="tk-session-item__date">
                    {new Date(session.startTime).toLocaleDateString()}
                  </span>
                </div>
                <div className="tk-session-item__stats">
                  <span>{session.tabs.length} tabs</span>
                  <span>{session.tags.length} tags</span>
                  {session.duration && (
                    <span>{Math.round(session.duration / 60000)} min</span>
                  )}
                </div>
                <div className="tk-session-item__actions">
                  <button className="tk-button tk-button--small">Restore</button>
                  <button className="tk-button tk-button--small tk-button--outline">View</button>
                </div>
              </div>
            ))
          ) : (
            <div className="tk-empty-state">
              <p>No sessions found</p>
              <RouteLink to="/" className="tk-button">Create New Session</RouteLink>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};