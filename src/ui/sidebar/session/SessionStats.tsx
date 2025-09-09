/**
 * Session Stats Component
 * Displays session statistics in the sidebar
 */

import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { Session, SessionStats as SessionStatsType } from '../../../contexts/types';
import styles from './SessionStats.module.css';

interface SessionStatsProps {
  stats: SessionStatsType;
  currentSession?: Session | null;
  className?: string;
}

export const SessionStats = forwardRef<HTMLDivElement, SessionStatsProps>(({
  stats,
  currentSession,
  className,
  ...props
}, ref) => {
  
  const statsClasses = clsx(styles.stats, className);

  const formatDuration = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div ref={ref} className={statsClasses} {...props}>
      <div className={styles.grid}>
        <div className={styles.statItem}>
          <div className={styles.statValue}>{stats.totalSessions}</div>
          <div className={styles.statLabel}>Total Sessions</div>
        </div>
        
        <div className={styles.statItem}>
          <div className={styles.statValue}>{stats.activeSessions}</div>
          <div className={styles.statLabel}>Active</div>
        </div>
        
        <div className={styles.statItem}>
          <div className={styles.statValue}>{stats.todaysPages}</div>
          <div className={styles.statLabel}>Today's Pages</div>
        </div>
        
        <div className={styles.statItem}>
          <div className={styles.statValue}>{stats.totalPages}</div>
          <div className={styles.statLabel}>Total Pages</div>
        </div>
        
        {stats.averageSessionDuration > 0 && (
          <div className={styles.statItem}>
            <div className={styles.statValue}>
              {formatDuration(stats.averageSessionDuration)}
            </div>
            <div className={styles.statLabel}>Avg Duration</div>
          </div>
        )}
        
        {currentSession && (
          <div className={styles.statItem}>
            <div className={styles.statValue}>{currentSession.tabs.length}</div>
            <div className={styles.statLabel}>Current Tabs</div>
          </div>
        )}
      </div>
    </div>
  );
});

SessionStats.displayName = 'SessionStats';