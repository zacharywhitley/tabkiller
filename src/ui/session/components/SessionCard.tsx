import React, { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { Session } from '../../../contexts/types';
import { SessionCardProps } from '../types';
import { getSessionStats, formatSessionDuration, formatSessionDate } from '../utils/sessionUtils';
import Button from '../../components/foundation/Button/Button';
import Card from '../../components/foundation/Card/Card';
import styles from './SessionCard.module.css';

/**
 * SessionCard Component
 * Displays individual session information in a card format
 */
export const SessionCard: React.FC<SessionCardProps> = ({
  session,
  selected = false,
  onSelect,
  onOpen,
  onEdit,
  onDelete,
  showTabs = false,
  compact = false
}) => {
  const [showAllTabs, setShowAllTabs] = useState(false);
  const stats = getSessionStats(session);

  const handleCardClick = useCallback((event: React.MouseEvent) => {
    // Don't trigger selection if clicking on action buttons
    if ((event.target as Element).closest(`.${styles.actions}`)) {
      return;
    }

    if (onSelect) {
      onSelect(session.id);
    }
  }, [onSelect, session.id]);

  const handleOpen = useCallback(() => {
    onOpen?.(session);
  }, [onOpen, session]);

  const handleEdit = useCallback(() => {
    onEdit?.(session);
  }, [onEdit, session]);

  const handleDelete = useCallback(() => {
    onDelete?.(session);
  }, [onDelete, session]);

  const displayTabs = showTabs && session.tabs.length > 0;
  const tabsToShow = showAllTabs ? session.tabs : session.tabs.slice(0, 5);
  const hasMoreTabs = session.tabs.length > 5;

  return (
    <Card
      className={clsx(
        styles.sessionCard,
        {
          [styles['sessionCard--selected']]: selected,
          [styles['sessionCard--compact']]: compact,
          [styles['sessionCard--active']]: session.isActive,
          [styles['sessionCard--clickable']]: onSelect
        }
      )}
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <h3 className={styles.title}>
            {session.name}
            {session.isActive && (
              <span className={styles.activeIndicator} title="Active session">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <circle cx="4" cy="4" r="3" fill="currentColor" />
                </svg>
              </span>
            )}
          </h3>
          {!compact && (
            <div className={styles.metadata}>
              <span className={styles.date}>
                {formatSessionDate(session.startTime, false)}
              </span>
              {session.duration && (
                <>
                  <span className={styles.separator}>•</span>
                  <span className={styles.duration}>
                    {formatSessionDuration(session.duration)}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        <div className={styles.actions}>
          {onOpen && (
            <Button
              variant="text"
              size="small"
              onClick={handleOpen}
              title="Open session"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8.5 3.5L13.5 8.5L8.5 13.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M13.5 8.5H2.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Button>
          )}
          
          {onEdit && (
            <Button
              variant="text"
              size="small"
              onClick={handleEdit}
              title="Edit session"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M11.5 2.5L13.5 4.5L5.5 12.5H3.5V10.5L11.5 2.5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Button>
          )}
          
          {onDelete && (
            <Button
              variant="text"
              size="small"
              onClick={handleDelete}
              title="Delete session"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6.5 2.5H9.5V3.5H6.5V2.5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M3.5 4.5H12.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M5.5 7.5V11.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M8.5 7.5V11.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M10.5 7.5V11.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M4.5 4.5V13.5H11.5V4.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Button>
          )}
        </div>
      </div>

      {/* Description */}
      {!compact && session.description && (
        <p className={styles.description}>{session.description}</p>
      )}

      {/* Tags */}
      {session.tags.length > 0 && (
        <div className={styles.tags}>
          {session.tags.map(tag => (
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

      {/* Stats */}
      {!compact && (
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats.tabCount}</span>
            <span className={styles.statLabel}>
              {stats.tabCount === 1 ? 'tab' : 'tabs'}
            </span>
          </div>
          
          {stats.domainCount > 0 && (
            <div className={styles.stat}>
              <span className={styles.statValue}>{stats.domainCount}</span>
              <span className={styles.statLabel}>
                {stats.domainCount === 1 ? 'domain' : 'domains'}
              </span>
            </div>
          )}
          
          {stats.windowCount > 1 && (
            <div className={styles.stat}>
              <span className={styles.statValue}>{stats.windowCount}</span>
              <span className={styles.statLabel}>windows</span>
            </div>
          )}
        </div>
      )}

      {/* Tabs List */}
      {displayTabs && (
        <div className={styles.tabs}>
          <h4 className={styles.tabsTitle}>
            Tabs ({session.tabs.length})
          </h4>
          
          <div className={styles.tabList}>
            {tabsToShow.map((tab, index) => (
              <div key={`${tab.url}-${tab.timestamp}`} className={styles.tab}>
                <div className={styles.tabMain}>
                  {tab.favIconUrl && (
                    <img
                      src={tab.favIconUrl}
                      alt=""
                      className={styles.tabIcon}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  
                  <div className={styles.tabInfo}>
                    <div className={styles.tabTitle}>{tab.title || 'Untitled'}</div>
                    <div className={styles.tabUrl}>{tab.url}</div>
                  </div>
                </div>
                
                <div className={styles.tabTime}>
                  {formatSessionDate(tab.timestamp, true)}
                </div>
              </div>
            ))}
          </div>
          
          {hasMoreTabs && !showAllTabs && (
            <Button
              variant="text"
              size="small"
              onClick={() => setShowAllTabs(true)}
              className={styles.showMoreButton}
            >
              Show {session.tabs.length - 5} more tabs
            </Button>
          )}
          
          {showAllTabs && hasMoreTabs && (
            <Button
              variant="text"
              size="small"
              onClick={() => setShowAllTabs(false)}
              className={styles.showMoreButton}
            >
              Show less
            </Button>
          )}
        </div>
      )}
    </Card>
  );
};

export default SessionCard;