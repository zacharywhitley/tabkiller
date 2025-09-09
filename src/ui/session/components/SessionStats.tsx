import React, { useMemo } from 'react';
import { clsx } from 'clsx';
import { Session } from '../../../contexts/types';
import { SessionStatsProps } from '../types';
import { formatSessionDuration, getSessionDomains, getMostUsedTags } from '../utils/sessionUtils';
import Card from '../../components/foundation/Card/Card';
import styles from './SessionStats.module.css';

/**
 * SessionStats Component
 * Displays comprehensive statistics about sessions
 */
export const SessionStats: React.FC<SessionStatsProps> = ({
  sessions,
  currentSession,
  showDetailed = false,
  timeRange = 'all'
}) => {
  const filteredSessions = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    let cutoffDate: Date;
    switch (timeRange) {
      case 'today':
        cutoffDate = startOfDay;
        break;
      case 'week':
        cutoffDate = startOfWeek;
        break;
      case 'month':
        cutoffDate = startOfMonth;
        break;
      case 'year':
        cutoffDate = startOfYear;
        break;
      default:
        return sessions;
    }

    return sessions.filter(session => session.startTime >= cutoffDate.getTime());
  }, [sessions, timeRange]);

  const stats = useMemo(() => {
    const totalSessions = filteredSessions.length;
    const activeSessions = filteredSessions.filter(s => s.isActive).length;
    const completedSessions = filteredSessions.filter(s => !s.isActive).length;

    const totalTabs = filteredSessions.reduce((sum, s) => sum + s.tabs.length, 0);
    const averageTabsPerSession = totalSessions > 0 ? Math.round(totalTabs / totalSessions) : 0;

    const sessionsWithDuration = filteredSessions.filter(s => s.duration);
    const totalDuration = sessionsWithDuration.reduce((sum, s) => sum + (s.duration || 0), 0);
    const averageDuration = sessionsWithDuration.length > 0 ? totalDuration / sessionsWithDuration.length : 0;

    const allDomains = new Set<string>();
    filteredSessions.forEach(session => {
      getSessionDomains(session).forEach(domain => allDomains.add(domain));
    });

    const longestSession = filteredSessions
      .filter(s => s.duration)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))[0];

    const mostTabsSession = filteredSessions
      .sort((a, b) => b.tabs.length - a.tabs.length)[0];

    return {
      totalSessions,
      activeSessions,
      completedSessions,
      totalTabs,
      averageTabsPerSession,
      totalDuration,
      averageDuration,
      uniqueDomains: allDomains.size,
      longestSession,
      mostTabsSession
    };
  }, [filteredSessions]);

  const mostUsedTags = useMemo(() => {
    return getMostUsedTags(filteredSessions, 5);
  }, [filteredSessions]);

  const timeRangeLabel = {
    today: 'Today',
    week: 'This Week',
    month: 'This Month',
    year: 'This Year',
    all: 'All Time'
  }[timeRange];

  if (filteredSessions.length === 0) {
    return (
      <Card className={styles.sessionStats}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path
                d="M8 12H40V36C40 38.2091 38.2091 40 36 40H12C9.79086 40 8 38.2091 8 36V12Z"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              />
              <path
                d="M8 20H40"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </div>
          <h3 className={styles.emptyTitle}>No Sessions Found</h3>
          <p className={styles.emptyMessage}>
            No sessions available for {timeRangeLabel.toLowerCase()}.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className={styles.sessionStats}>
      <Card className={styles.overviewCard}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Session Statistics</h3>
          <div className={styles.timeRangeLabel}>{timeRangeLabel}</div>
        </div>

        <div className={styles.statsGrid}>
          {/* Total Sessions */}
          <div className={styles.statItem}>
            <div className={styles.statValue}>{stats.totalSessions}</div>
            <div className={styles.statLabel}>Total Sessions</div>
            {stats.activeSessions > 0 && (
              <div className={styles.statSubtext}>
                {stats.activeSessions} active
              </div>
            )}
          </div>

          {/* Total Tabs */}
          <div className={styles.statItem}>
            <div className={styles.statValue}>{stats.totalTabs}</div>
            <div className={styles.statLabel}>Total Tabs</div>
            <div className={styles.statSubtext}>
              ~{stats.averageTabsPerSession} per session
            </div>
          </div>

          {/* Total Time */}
          <div className={styles.statItem}>
            <div className={styles.statValue}>
              {formatSessionDuration(stats.totalDuration)}
            </div>
            <div className={styles.statLabel}>Total Time</div>
            {stats.averageDuration > 0 && (
              <div className={styles.statSubtext}>
                ~{formatSessionDuration(stats.averageDuration)} avg
              </div>
            )}
          </div>

          {/* Unique Domains */}
          <div className={styles.statItem}>
            <div className={styles.statValue}>{stats.uniqueDomains}</div>
            <div className={styles.statLabel}>Unique Domains</div>
          </div>
        </div>
      </Card>

      {/* Current Session */}
      {currentSession && (
        <Card className={clsx(styles.currentSessionCard, styles.activeCard)}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Current Session</h3>
            <div className={styles.activeIndicator}>
              <span className={styles.activeIcon}>●</span>
              Active
            </div>
          </div>

          <div className={styles.currentSessionContent}>
            <div className={styles.sessionName}>{currentSession.name}</div>
            {currentSession.description && (
              <div className={styles.sessionDescription}>
                {currentSession.description}
              </div>
            )}

            <div className={styles.sessionMetrics}>
              <div className={styles.metric}>
                <span className={styles.metricValue}>{currentSession.tabs.length}</span>
                <span className={styles.metricLabel}>tabs</span>
              </div>
              
              <div className={styles.metric}>
                <span className={styles.metricValue}>
                  {getSessionDomains(currentSession).length}
                </span>
                <span className={styles.metricLabel}>domains</span>
              </div>
              
              <div className={styles.metric}>
                <span className={styles.metricValue}>
                  {formatSessionDuration(Date.now() - currentSession.startTime)}
                </span>
                <span className={styles.metricLabel}>elapsed</span>
              </div>
            </div>

            {currentSession.tags.length > 0 && (
              <div className={styles.sessionTags}>
                {currentSession.tags.map(tag => (
                  <span
                    key={tag.id}
                    className={styles.sessionTag}
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Detailed Stats */}
      {showDetailed && (
        <>
          {/* Records */}
          <Card className={styles.recordsCard}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Records</h3>
            </div>

            <div className={styles.recordsList}>
              {stats.longestSession && (
                <div className={styles.record}>
                  <div className={styles.recordLabel}>Longest Session</div>
                  <div className={styles.recordValue}>
                    <div className={styles.recordName}>{stats.longestSession.name}</div>
                    <div className={styles.recordMetric}>
                      {formatSessionDuration(stats.longestSession.duration || 0)}
                    </div>
                  </div>
                </div>
              )}

              {stats.mostTabsSession && (
                <div className={styles.record}>
                  <div className={styles.recordLabel}>Most Tabs</div>
                  <div className={styles.recordValue}>
                    <div className={styles.recordName}>{stats.mostTabsSession.name}</div>
                    <div className={styles.recordMetric}>
                      {stats.mostTabsSession.tabs.length} tabs
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Most Used Tags */}
          {mostUsedTags.length > 0 && (
            <Card className={styles.tagsCard}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Most Used Tags</h3>
              </div>

              <div className={styles.tagsList}>
                {mostUsedTags.map(({ tag, count }) => (
                  <div key={tag.id} className={styles.tagStat}>
                    <div className={styles.tagInfo}>
                      <span
                        className={styles.tagColor}
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className={styles.tagName}>{tag.name}</span>
                    </div>
                    <div className={styles.tagCount}>{count}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default SessionStats;