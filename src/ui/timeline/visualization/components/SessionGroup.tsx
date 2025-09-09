/**
 * Session Group Component
 * Collapsible session container with metadata display and drill-down functionality
 */

import React, { useState, useCallback, useMemo } from 'react';
import { 
  TimelineSession, 
  TimelineVisualizationItem,
  TimelineViewMode, 
  TimelineZoomLevel 
} from '../types/timeline';
import { TimelineItem } from './TimelineItem';
import { SessionMetadataPanel } from './SessionMetadataPanel';
import { SessionBranchingView } from './SessionBranchingView';
import { formatTimestamp } from '../utils/timelineUtils';
import './SessionGroup.css';

interface SessionGroupProps {
  /** Session data */
  session: TimelineSession;
  /** Whether session is expanded */
  expanded: boolean;
  /** Toggle expansion handler */
  onToggle: (expanded: boolean) => void;
  /** Session selection handler */
  onSelect: () => void;
  /** Item selection handler */
  onItemSelect: (item: TimelineVisualizationItem) => void;
  /** Custom item renderer */
  renderCustomItem?: (item: TimelineVisualizationItem) => React.ReactNode;
  /** Custom session header renderer */
  renderSessionHeader?: (session: TimelineSession) => React.ReactNode;
  /** Show branching visualization */
  showBranching: boolean;
  /** Current view mode */
  viewMode: TimelineViewMode;
  /** Current zoom level */
  zoomLevel: TimelineZoomLevel;
  /** Whether session is selected */
  selected: boolean;
  /** Accessibility enabled */
  accessibilityEnabled: boolean;
}

export const SessionGroup: React.FC<SessionGroupProps> = ({
  session,
  expanded,
  onToggle,
  onSelect,
  onItemSelect,
  renderCustomItem,
  renderSessionHeader,
  showBranching,
  viewMode,
  zoomLevel,
  selected,
  accessibilityEnabled
}) => {
  const [showMetadataPanel, setShowMetadataPanel] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Handle session header click
  const handleSessionClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    onSelect();
  }, [onSelect]);

  // Handle session toggle
  const handleToggle = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    onToggle(!expanded);
  }, [expanded, onToggle]);

  // Handle item selection within session
  const handleItemSelect = useCallback((item: TimelineVisualizationItem) => {
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(item.id)) {
        newSet.delete(item.id);
      } else {
        newSet.add(item.id);
      }
      return newSet;
    });
    onItemSelect(item);
  }, [onItemSelect]);

  // Handle keyboard interactions
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        onSelect();
        break;
      case 'ArrowRight':
        if (!expanded) {
          event.preventDefault();
          onToggle(true);
        }
        break;
      case 'ArrowLeft':
        if (expanded) {
          event.preventDefault();
          onToggle(false);
        }
        break;
    }
  }, [onSelect, onToggle, expanded]);

  // Memoized session statistics
  const sessionStats = useMemo(() => {
    const { stats } = session;
    const duration = stats.totalTime;
    const formattedDuration = duration > 0 ? 
      `${Math.round(duration / 1000 / 60)}m` : 
      'Unknown';

    return {
      duration: formattedDuration,
      tabCount: stats.tabCount,
      pageCount: stats.pageCount,
      domains: stats.uniqueDomains.slice(0, 3),
      productivity: stats.productivityScore
    };
  }, [session.stats]);

  // Memoized session visual style
  const sessionStyle = useMemo(() => ({
    '--session-color': session.visual.color,
    '--session-lane': session.visual.laneIndex,
    borderLeftColor: session.visual.color
  }), [session.visual]);

  // Memoized aria label
  const ariaLabel = useMemo(() => {
    let label = `Session: ${session.tag}`;
    label += `, created ${formatTimestamp(session.metadata.createdAt, 'hours')}`;
    label += `, ${sessionStats.pageCount} pages`;
    label += `, ${sessionStats.duration}`;
    if (expanded) {
      label += ', expanded';
    } else {
      label += ', collapsed';
    }
    if (selected) {
      label += ', selected';
    }
    return label;
  }, [session, sessionStats, expanded, selected]);

  return (
    <div 
      className={`session-group ${expanded ? 'expanded' : 'collapsed'} ${selected ? 'selected' : ''}`}
      style={sessionStyle as React.CSSProperties}
      data-session-id={session.id}
    >
      {/* Session Header */}
      <div 
        className="session-header"
        onClick={handleSessionClick}
        onKeyDown={handleKeyDown}
        tabIndex={accessibilityEnabled ? 0 : undefined}
        role={accessibilityEnabled ? 'button' : undefined}
        aria-label={accessibilityEnabled ? ariaLabel : undefined}
        aria-expanded={accessibilityEnabled ? expanded : undefined}
        aria-selected={accessibilityEnabled ? selected : undefined}
      >
        {/* Custom header renderer */}
        {renderSessionHeader ? renderSessionHeader(session) : (
          <>
            {/* Toggle Button */}
            <button
              className="session-toggle"
              onClick={handleToggle}
              aria-label={expanded ? 'Collapse session' : 'Expand session'}
              tabIndex={-1}
            >
              <span className={`toggle-icon ${expanded ? 'expanded' : 'collapsed'}`}>
                {expanded ? '▼' : '▶'}
              </span>
            </button>

            {/* Session Icon */}
            <div className="session-icon">
              <span>{session.visual.icon}</span>
            </div>

            {/* Session Info */}
            <div className="session-info">
              <div className="session-title">
                <h2>{session.tag}</h2>
                {session.metadata.isPrivate && (
                  <span className="privacy-indicator" title="Private session">🔒</span>
                )}
              </div>
              
              <div className="session-metadata">
                <span className="session-time">
                  {formatTimestamp(session.metadata.createdAt, zoomLevel)}
                </span>
                <span className="session-stats">
                  📄 {sessionStats.pageCount} • 
                  ⏱️ {sessionStats.duration} • 
                  🌐 {sessionStats.domains.length} domains
                </span>
              </div>

              {session.metadata.purpose && (
                <div className="session-purpose">
                  {session.metadata.purpose}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="session-actions">
              <button
                className="metadata-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMetadataPanel(!showMetadataPanel);
                }}
                title="Show session details"
                aria-label="Show session metadata panel"
              >
                ℹ️
              </button>
              
              <span className="productivity-score">
                <span 
                  className={`score ${sessionStats.productivity >= 70 ? 'high' : sessionStats.productivity >= 40 ? 'medium' : 'low'}`}
                  title={`Productivity score: ${sessionStats.productivity}/100`}
                >
                  {sessionStats.productivity}
                </span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Session Content */}
      {expanded && (
        <div className="session-content">
          {/* Session Metadata Panel */}
          {showMetadataPanel && (
            <SessionMetadataPanel
              session={session}
              onClose={() => setShowMetadataPanel(false)}
              accessibilityEnabled={accessibilityEnabled}
            />
          )}

          {/* Branching Visualization */}
          {showBranching && viewMode === 'branches' && session.visual.branches.length > 1 && (
            <SessionBranchingView
              session={session}
              onItemSelect={handleItemSelect}
              selectedItemIds={selectedItemIds}
              accessibilityEnabled={accessibilityEnabled}
            />
          )}

          {/* Session Items */}
          <div className={`session-items ${viewMode}`}>
            {session.items.map((item, index) => (
              <div 
                key={item.id} 
                className="session-item-wrapper"
                data-index={index}
              >
                <TimelineItem
                  item={item}
                  viewMode={viewMode}
                  zoomLevel={zoomLevel}
                  showConnections={showBranching && viewMode === 'branches'}
                  selected={selectedItemIds.has(item.id)}
                  focused={false}
                  onSelect={() => handleItemSelect(item)}
                  onFocus={() => {}}
                  renderCustom={renderCustomItem}
                  accessibilityEnabled={accessibilityEnabled}
                />
                
                {/* Item Connection to Session */}
                {viewMode === 'sessions' && (
                  <div 
                    className="session-connection-line"
                    style={{ 
                      backgroundColor: session.visual.color,
                      opacity: 0.3 
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Session Summary when Collapsed */}
          {!expanded && session.grouping.collapsedSummary && (
            <div className="session-summary">
              <div className="summary-description">
                {session.grouping.collapsedSummary.description}
              </div>
              <div className="summary-preview">
                {session.grouping.collapsedSummary.previewItems.map((previewItem, index) => (
                  <div key={index} className="preview-item">
                    <span className="preview-icon">{previewItem.styling.icon}</span>
                    <span className="preview-title">{previewItem.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Session Footer with Additional Stats */}
      {expanded && (
        <div className="session-footer">
          <div className="session-detailed-stats">
            <div className="stat-item">
              <span className="stat-label">Domains:</span>
              <div className="stat-value domains-list">
                {sessionStats.domains.map((domain, index) => (
                  <span key={index} className="domain-tag">{domain}</span>
                ))}
                {session.stats.uniqueDomains.length > 3 && (
                  <span className="domain-more">+{session.stats.uniqueDomains.length - 3}</span>
                )}
              </div>
            </div>
            
            <div className="stat-item">
              <span className="stat-label">Windows:</span>
              <span className="stat-value">{session.stats.windowCount}</span>
            </div>
            
            <div className="stat-item">
              <span className="stat-label">Navigation Events:</span>
              <span className="stat-value">{session.stats.navigationEvents}</span>
            </div>
          </div>

          {/* Session Tags */}
          {session.metadata.tags.length > 0 && (
            <div className="session-tags">
              {session.metadata.tags.map((tag, index) => (
                <span key={index} className="session-tag">
                  #{tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selection indicator */}
      {selected && (
        <div className="selection-indicator" aria-hidden="true" />
      )}
    </div>
  );
};

export default SessionGroup;