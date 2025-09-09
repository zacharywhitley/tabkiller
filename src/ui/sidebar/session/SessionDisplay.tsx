/**
 * Session Display Component
 * Displays session information in the sidebar
 */

import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { Session } from '../../../contexts/types';
import { SessionListConfig } from '../types';
import styles from './SessionDisplay.module.css';

interface SessionDisplayProps {
  session?: Session | null;
  sessions?: Session[];
  config?: Partial<SessionListConfig>;
  variant?: 'current' | 'list';
  maxItems?: number;
  className?: string;
}

export const SessionDisplay = forwardRef<HTMLDivElement, SessionDisplayProps>(({
  session,
  sessions,
  config,
  variant = 'current',
  maxItems = 5,
  className,
  ...props
}, ref) => {
  
  const displayClasses = clsx(
    styles.display,
    styles[`display--${variant}`],
    className
  );

  // Current session display
  if (variant === 'current') {
    if (!session) {
      return (
        <div ref={ref} className={displayClasses} {...props}>
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📭</span>
            <p className={styles.emptyText}>No active session</p>
          </div>
        </div>
      );
    }

    return (
      <div ref={ref} className={displayClasses} {...props}>
        <div className={styles.sessionInfo}>
          <div className={styles.sessionTitle}>
            {session.name || 'Current Session'}
          </div>
          <div className={styles.sessionMeta}>
            <span className={styles.tabCount}>{session.tabs.length} tabs</span>
            <span className={styles.duration}>
              {formatDuration(Date.now() - session.startTime)}
            </span>
          </div>
          {session.tags.length > 0 && (
            <div className={styles.tags}>
              {session.tags.slice(0, 3).map(tag => (
                <span 
                  key={tag.id} 
                  className={styles.tag}
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Sessions list display
  if (variant === 'list') {
    const displaySessions = sessions?.slice(0, maxItems) || [];
    
    if (displaySessions.length === 0) {
      return (
        <div ref={ref} className={displayClasses} {...props}>
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📝</span>
            <p className={styles.emptyText}>No recent sessions</p>
          </div>
        </div>
      );
    }

    return (
      <div ref={ref} className={displayClasses} {...props}>
        <div className={styles.sessionsList}>
          {displaySessions.map(sessionItem => (
            <div key={sessionItem.id} className={styles.sessionItem}>
              <div className={styles.sessionName}>
                {sessionItem.name || 'Unnamed Session'}
              </div>
              <div className={styles.sessionSummary}>
                {sessionItem.tabs.length} tabs
                {sessionItem.duration && (
                  <span> • {formatDuration(sessionItem.duration)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
});

// Helper function to format duration
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

SessionDisplay.displayName = 'SessionDisplay';