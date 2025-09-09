/**
 * Timeline Item Component
 * Individual timeline item with git-style visualization and interaction
 */

import React, { useCallback, useMemo } from 'react';
import { 
  TimelineVisualizationItem, 
  TimelineViewMode, 
  TimelineZoomLevel 
} from '../types/timeline';
import { formatTimestamp } from '../utils/timelineUtils';
import { ConnectionLines } from './ConnectionLines';
import './TimelineItem.css';

interface TimelineItemProps {
  /** Timeline item data */
  item: TimelineVisualizationItem;
  /** Current view mode */
  viewMode: TimelineViewMode;
  /** Current zoom level */
  zoomLevel: TimelineZoomLevel;
  /** Show connection lines */
  showConnections: boolean;
  /** Whether item is selected */
  selected: boolean;
  /** Whether item is focused */
  focused: boolean;
  /** Selection handler */
  onSelect: () => void;
  /** Focus handler */
  onFocus: () => void;
  /** Custom renderer */
  renderCustom?: (item: TimelineVisualizationItem) => React.ReactNode;
  /** Accessibility enabled */
  accessibilityEnabled: boolean;
}

export const TimelineItem: React.FC<TimelineItemProps> = ({
  item,
  viewMode,
  zoomLevel,
  showConnections,
  selected,
  focused,
  onSelect,
  onFocus,
  renderCustom,
  accessibilityEnabled
}) => {
  // Use custom renderer if provided
  if (renderCustom) {
    return (
      <div className="timeline-item-wrapper">
        {renderCustom(item)}
      </div>
    );
  }

  // Memoized styling calculations
  const itemStyle = useMemo(() => ({
    '--item-color': item.styling.color,
    '--item-opacity': item.styling.opacity,
    left: viewMode === 'branches' ? `${item.position.laneIndex * 60 + 20}px` : '20px',
    transform: `scale(${item.styling.size === 'large' ? 1.2 : item.styling.size === 'small' ? 0.8 : 1})`
  }), [item.styling, item.position, viewMode]);

  // Format item metadata for display
  const formattedTime = useMemo(() => 
    formatTimestamp(item.timestamp, zoomLevel), 
    [item.timestamp, zoomLevel]
  );

  const domainDisplay = useMemo(() => {
    const domain = item.metadata.domain;
    if (!domain) return '';
    
    // Shorten domain for display
    const parts = domain.split('.');
    if (parts.length > 2) {
      return `${parts[0]}.${parts[parts.length - 1]}`;
    }
    return domain;
  }, [item.metadata.domain]);

  // Handle click interactions
  const handleClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    onSelect();
    
    if (accessibilityEnabled) {
      onFocus();
    }
  }, [onSelect, onFocus, accessibilityEnabled]);

  // Handle keyboard interactions
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  }, [onSelect]);

  // Generate aria label for accessibility
  const ariaLabel = useMemo(() => {
    let label = `${item.type} item: ${item.title}`;
    if (item.metadata.domain) {
      label += ` from ${item.metadata.domain}`;
    }
    label += ` at ${formattedTime}`;
    if (item.sessionContext) {
      label += ` in session ${item.sessionContext.session.tag}`;
    }
    if (selected) {
      label += ', selected';
    }
    return label;
  }, [item, formattedTime, selected]);

  // Connection line props
  const connectionProps = useMemo(() => ({
    item,
    viewMode,
    showConnections,
    laneWidth: 60
  }), [item, viewMode, showConnections]);

  return (
    <div 
      className={`timeline-item ${item.type} ${selected ? 'selected' : ''} ${focused ? 'focused' : ''}`}
      style={itemStyle as React.CSSProperties}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={accessibilityEnabled ? 0 : undefined}
      role={accessibilityEnabled ? 'button' : undefined}
      aria-label={accessibilityEnabled ? ariaLabel : undefined}
      aria-selected={accessibilityEnabled ? selected : undefined}
      data-item-id={item.id}
      data-session-id={item.sessionContext?.sessionId}
    >
      {/* Connection Lines */}
      {showConnections && viewMode === 'branches' && (
        <ConnectionLines {...connectionProps} />
      )}

      {/* Item Icon */}
      <div className="timeline-item-icon">
        <span className="item-icon">{item.styling.icon}</span>
        {item.position.isBranchPoint && (
          <span className="branch-indicator" aria-hidden="true">⋈</span>
        )}
        {item.position.isMergePoint && (
          <span className="merge-indicator" aria-hidden="true">⋉</span>
        )}
      </div>

      {/* Item Content */}
      <div className="timeline-item-content">
        {/* Header */}
        <div className="timeline-item-header">
          <h3 className="timeline-item-title">
            {item.title}
          </h3>
          <span className="timeline-item-time">
            {formattedTime}
          </span>
        </div>

        {/* Metadata */}
        <div className="timeline-item-metadata">
          {domainDisplay && (
            <span className="timeline-item-domain">
              🌐 {domainDisplay}
            </span>
          )}
          
          {item.metadata.tabCount && item.metadata.tabCount > 1 && (
            <span className="timeline-item-tabs">
              📄 {item.metadata.tabCount} tabs
            </span>
          )}
          
          {item.metadata.duration && (
            <span className="timeline-item-duration">
              ⏱️ {Math.round(item.metadata.duration / 1000 / 60)}m
            </span>
          )}
          
          {item.sessionContext && (
            <span className="timeline-item-session">
              📁 {item.sessionContext.session.tag}
            </span>
          )}
        </div>

        {/* Description */}
        {item.description && (
          <div className="timeline-item-description">
            {item.description}
          </div>
        )}

        {/* Tags */}
        {item.metadata.tags && item.metadata.tags.length > 0 && (
          <div className="timeline-item-tags">
            {item.metadata.tags.slice(0, 3).map((tag, index) => (
              <span key={index} className="timeline-item-tag">
                #{tag}
              </span>
            ))}
            {item.metadata.tags.length > 3 && (
              <span className="timeline-item-tag-more">
                +{item.metadata.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Relationship Indicators */}
      {item.relationships.parentIds.length > 0 && (
        <div 
          className="relationship-indicator parent"
          title={`Has ${item.relationships.parentIds.length} parent(s)`}
          aria-label={`${item.relationships.parentIds.length} parent items`}
        >
          ↑{item.relationships.parentIds.length}
        </div>
      )}
      
      {item.relationships.childIds.length > 0 && (
        <div 
          className="relationship-indicator child"
          title={`Has ${item.relationships.childIds.length} child(ren)`}
          aria-label={`${item.relationships.childIds.length} child items`}
        >
          ↓{item.relationships.childIds.length}
        </div>
      )}

      {/* Session Position Indicator */}
      {item.sessionContext && viewMode === 'sessions' && (
        <div className="session-position-indicator">
          <div 
            className="position-bar"
            style={{
              width: `${(item.sessionContext.positionInSession / 
                (item.sessionContext.session.items.length - 1)) * 100}%`
            }}
          />
        </div>
      )}

      {/* Focus indicator for accessibility */}
      {accessibilityEnabled && focused && (
        <div className="focus-indicator" aria-hidden="true" />
      )}
    </div>
  );
};

export default TimelineItem;