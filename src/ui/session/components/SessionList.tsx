import React, { useState, useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import { Session } from '../../../contexts/types';
import { SessionListProps, SessionSortOptions } from '../types';
import { useSessionSelection } from '../hooks';
import SessionCard from './SessionCard';
import Button from '../../components/foundation/Button/Button';
import styles from './SessionList.module.css';

/**
 * SessionList Component
 * Displays a list of sessions with selection, sorting, and bulk actions
 */
export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  selectedSessionIds,
  onSelectSession,
  onSelectMultiple,
  onOpenSession,
  onEditSession,
  onDeleteSession,
  onMergeSessions,
  sortOptions,
  onSort,
  loading = false,
  emptyMessage = 'No sessions found',
  showBulkActions = true
}) => {
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'compact'>('list');

  // Convert selectedSessionIds array to Set for performance
  const selectedIdsSet = useMemo(() => new Set(selectedSessionIds), [selectedSessionIds]);

  // Selection state
  const hasSelection = selectedSessionIds.length > 0;
  const selectedCount = selectedSessionIds.length;
  const isAllSelected = sessions.length > 0 && selectedSessionIds.length === sessions.length;

  // Handle individual session selection
  const handleSessionSelect = useCallback((sessionId: string, index: number, event?: React.MouseEvent) => {
    if (event && (event.ctrlKey || event.metaKey)) {
      // Ctrl/Cmd + Click: Toggle selection
      onSelectSession(sessionId);
      setLastSelectedIndex(index);
    } else if (event && event.shiftKey && lastSelectedIndex >= 0) {
      // Shift + Click: Select range
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const rangeIds = sessions.slice(start, end + 1).map(s => s.id);
      onSelectMultiple(rangeIds);
    } else {
      // Regular click: Single selection
      onSelectSession(sessionId);
      setLastSelectedIndex(index);
    }
  }, [onSelectSession, onSelectMultiple, sessions, lastSelectedIndex]);

  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (isAllSelected) {
      onSelectMultiple([]);
    } else {
      onSelectMultiple(sessions.map(s => s.id));
    }
  }, [isAllSelected, onSelectMultiple, sessions]);

  // Handle sort change
  const handleSortChange = useCallback((field: SessionSortOptions['field']) => {
    const newOrder = sortOptions.field === field && sortOptions.order === 'asc' ? 'desc' : 'asc';
    onSort({ field, order: newOrder });
  }, [sortOptions, onSort]);

  // Handle bulk merge
  const handleBulkMerge = useCallback(() => {
    if (onMergeSessions && hasSelection) {
      const selectedSessions = sessions.filter(s => selectedIdsSet.has(s.id));
      onMergeSessions(selectedSessions);
    }
  }, [onMergeSessions, hasSelection, sessions, selectedIdsSet]);

  // Loading state
  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Loading sessions...</p>
      </div>
    );
  }

  // Empty state
  if (sessions.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <path
              d="M8 12H40V36C40 38.2091 38.2091 40 36 40H12C9.79086 40 8 38.2091 8 36V12Z"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            <path
              d="M16 8V12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M32 8V12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M8 20H40"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </div>
        <p className={styles.emptyMessage}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={styles.sessionList}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {showBulkActions && (
            <div className={styles.bulkSelection}>
              <label className={styles.selectAllLabel}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                  className={styles.selectAllCheckbox}
                />
                <span className={styles.selectionCount}>
                  {hasSelection ? `${selectedCount} selected` : `${sessions.length} sessions`}
                </span>
              </label>
            </div>
          )}
        </div>

        <div className={styles.headerRight}>
          {/* View Mode Toggle */}
          <div className={styles.viewModeToggle}>
            <Button
              variant={viewMode === 'list' ? 'primary' : 'outline'}
              size="small"
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M2 8H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M2 12H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </Button>
            
            <Button
              variant={viewMode === 'grid' ? 'primary' : 'outline'}
              size="small"
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5" height="5" stroke="currentColor" strokeWidth="2" fill="none"/>
                <rect x="9" y="2" width="5" height="5" stroke="currentColor" strokeWidth="2" fill="none"/>
                <rect x="2" y="9" width="5" height="5" stroke="currentColor" strokeWidth="2" fill="none"/>
                <rect x="9" y="9" width="5" height="5" stroke="currentColor" strokeWidth="2" fill="none"/>
              </svg>
            </Button>
            
            <Button
              variant={viewMode === 'compact' ? 'primary' : 'outline'}
              size="small"
              onClick={() => setViewMode('compact')}
              title="Compact view"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 3H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M2 6H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M2 9H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M2 12H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </Button>
          </div>

          {/* Sort Controls */}
          <div className={styles.sortControls}>
            <select
              value={sortOptions.field}
              onChange={(e) => handleSortChange(e.target.value as SessionSortOptions['field'])}
              className={styles.sortSelect}
            >
              <option value="startTime">Start Time</option>
              <option value="name">Name</option>
              <option value="endTime">End Time</option>
              <option value="duration">Duration</option>
              <option value="tabCount">Tab Count</option>
              <option value="lastAccessed">Last Accessed</option>
            </select>
            
            <Button
              variant="outline"
              size="small"
              onClick={() => onSort({ ...sortOptions, order: sortOptions.order === 'asc' ? 'desc' : 'asc' })}
              title={`Sort ${sortOptions.order === 'asc' ? 'descending' : 'ascending'}`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className={clsx(styles.sortIcon, {
                  [styles.sortIconDesc]: sortOptions.order === 'desc'
                })}
              >
                <path
                  d="M4 6L8 2L12 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M4 10L8 14L12 10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {showBulkActions && hasSelection && (
        <div className={styles.bulkActions}>
          <div className={styles.bulkActionsContent}>
            <span className={styles.bulkActionsLabel}>
              {selectedCount} session{selectedCount !== 1 ? 's' : ''} selected
            </span>
            
            <div className={styles.bulkActionsButtons}>
              {onMergeSessions && selectedCount > 1 && (
                <Button
                  variant="outline"
                  size="small"
                  onClick={handleBulkMerge}
                >
                  Merge Sessions
                </Button>
              )}
              
              <Button
                variant="outline"
                size="small"
                onClick={() => onSelectMultiple([])}
              >
                Clear Selection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sessions Grid */}
      <div className={clsx(
        styles.sessionsGrid,
        styles[`sessionsGrid--${viewMode}`]
      )}>
        {sessions.map((session, index) => (
          <SessionCard
            key={session.id}
            session={session}
            selected={selectedIdsSet.has(session.id)}
            onSelect={(sessionId) => handleSessionSelect(sessionId, index)}
            onOpen={onOpenSession}
            onEdit={onEditSession}
            onDelete={onDeleteSession}
            compact={viewMode === 'compact'}
            showTabs={viewMode === 'list'}
          />
        ))}
      </div>
    </div>
  );
};

export default SessionList;