/**
 * Session Branching View Component
 * Detailed branching visualization within a single session
 */

import React, { useMemo, useCallback } from 'react';
import { TimelineSession, TimelineVisualizationItem } from '../types/timeline';
import './SessionBranchingView.css';

interface SessionBranchingViewProps {
  /** Session data */
  session: TimelineSession;
  /** Item selection handler */
  onItemSelect: (item: TimelineVisualizationItem) => void;
  /** Selected item IDs */
  selectedItemIds: Set<string>;
  /** Accessibility enabled */
  accessibilityEnabled: boolean;
}

export const SessionBranchingView: React.FC<SessionBranchingViewProps> = ({
  session,
  onItemSelect,
  selectedItemIds,
  accessibilityEnabled
}) => {
  // Calculate branch layout
  const branchLayout = useMemo(() => {
    const branches = session.visual.branches;
    const items = session.items;
    
    // Create lanes for each branch
    const lanes = branches.map((branch, index) => ({
      ...branch,
      laneIndex: index,
      items: items.filter(item => branch.itemIds.includes(item.id))
        .sort((a, b) => a.timestamp - b.timestamp)
    }));

    // Calculate connections between branches
    const connections: Array<{
      fromLane: number;
      toLane: number;
      fromItem: string;
      toItem: string;
      type: 'split' | 'merge' | 'related';
    }> = [];

    // Find branch points and merges
    lanes.forEach((lane, laneIndex) => {
      lane.items.forEach((item, itemIndex) => {
        // Check for items that might have spawned other tabs
        if (item.relationships.childIds.length > 0) {
          item.relationships.childIds.forEach(childId => {
            const childItem = items.find(i => i.id === childId);
            if (childItem) {
              const childLane = lanes.findIndex(l => l.itemIds.includes(childId));
              if (childLane !== -1 && childLane !== laneIndex) {
                connections.push({
                  fromLane: laneIndex,
                  toLane: childLane,
                  fromItem: item.id,
                  toItem: childId,
                  type: 'split'
                });
              }
            }
          });
        }

        // Check for related items (same domain, close in time)
        if (item.relationships.siblingIds.length > 0) {
          item.relationships.siblingIds.forEach(siblingId => {
            const siblingItem = items.find(i => i.id === siblingId);
            if (siblingItem) {
              const siblingLane = lanes.findIndex(l => l.itemIds.includes(siblingId));
              if (siblingLane !== -1 && siblingLane !== laneIndex) {
                // Only add if not already connected
                const existingConnection = connections.find(c => 
                  (c.fromItem === item.id && c.toItem === siblingId) ||
                  (c.fromItem === siblingId && c.toItem === item.id)
                );
                
                if (!existingConnection && Math.abs(siblingItem.timestamp - item.timestamp) < 30000) {
                  connections.push({
                    fromLane: laneIndex,
                    toLane: siblingLane,
                    fromItem: item.id,
                    toItem: siblingId,
                    type: 'related'
                  });
                }
              }
            }
          });
        }
      });
    });

    return { lanes, connections };
  }, [session]);

  // Handle item click
  const handleItemClick = useCallback((item: TimelineVisualizationItem) => {
    onItemSelect(item);
  }, [onItemSelect]);

  // Render connection line
  const renderConnection = useCallback((connection: any, index: number) => {
    const { fromLane, toLane, type } = connection;
    const laneWidth = 120;
    const x1 = fromLane * laneWidth + 60;
    const x2 = toLane * laneWidth + 60;
    
    const strokeColor = type === 'split' ? '#3b82f6' : type === 'merge' ? '#10b981' : '#6b7280';
    const strokeWidth = type === 'related' ? 1 : 2;
    const strokeDasharray = type === 'related' ? '3,3' : undefined;

    return (
      <line
        key={index}
        x1={x1}
        y1={20}
        x2={x2}
        y2={20}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        opacity={0.7}
        className={`branch-connection ${type}`}
      />
    );
  }, []);

  // Format time for display
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div 
      className="session-branching-view"
      role={accessibilityEnabled ? 'region' : undefined}
      aria-label={accessibilityEnabled ? `Branching view for session ${session.tag}` : undefined}
    >
      {/* Branch Overview */}
      <div className="branch-overview">
        <h4>Session Branching ({branchLayout.lanes.length} branches)</h4>
        <div className="branch-stats">
          <span className="stat-item">
            {branchLayout.connections.filter(c => c.type === 'split').length} splits
          </span>
          <span className="stat-item">
            {branchLayout.connections.filter(c => c.type === 'merge').length} merges
          </span>
          <span className="stat-item">
            {branchLayout.connections.filter(c => c.type === 'related').length} relationships
          </span>
        </div>
      </div>

      {/* Connection Lines SVG */}
      <div className="connections-container">
        <svg
          width="100%"
          height="40"
          className="connections-svg"
          style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}
        >
          {branchLayout.connections.map(renderConnection)}
        </svg>
      </div>

      {/* Branch Lanes */}
      <div className="branch-lanes" style={{ position: 'relative', paddingTop: '40px' }}>
        {branchLayout.lanes.map((lane, laneIndex) => (
          <div 
            key={lane.id}
            className="branch-lane"
            style={{ 
              left: `${laneIndex * 120}px`,
              borderLeftColor: session.visual.color 
            }}
          >
            {/* Lane Header */}
            <div className="lane-header">
              <div className="lane-title">
                <span className="lane-icon">
                  {lane.type === 'new_tab' ? '📄' : 
                   lane.type === 'new_window' ? '🪟' : 
                   lane.type === 'domain_change' ? '🌐' : '📁'}
                </span>
                <span className="lane-name">
                  {lane.type === 'new_tab' ? `Tab ${laneIndex + 1}` : 
                   lane.type === 'new_window' ? `Window ${laneIndex + 1}` : 
                   `Branch ${laneIndex + 1}`}
                </span>
              </div>
              <div className="lane-stats">
                {lane.items.length} items
              </div>
            </div>

            {/* Lane Timeline */}
            <div className="lane-timeline">
              {lane.items.map((item, itemIndex) => (
                <div
                  key={item.id}
                  className={`lane-item ${selectedItemIds.has(item.id) ? 'selected' : ''}`}
                  onClick={() => handleItemClick(item)}
                  tabIndex={accessibilityEnabled ? 0 : undefined}
                  role={accessibilityEnabled ? 'button' : undefined}
                  aria-label={accessibilityEnabled ? 
                    `${item.title} at ${formatTime(item.timestamp)}` : undefined
                  }
                >
                  {/* Item Connection Line */}
                  {itemIndex > 0 && (
                    <div className="item-connection" />
                  )}

                  {/* Item Node */}
                  <div 
                    className="item-node"
                    style={{ backgroundColor: item.styling.color }}
                  >
                    <span className="item-icon">{item.styling.icon}</span>
                  </div>

                  {/* Item Info */}
                  <div className="item-info">
                    <div className="item-title">{item.title}</div>
                    <div className="item-metadata">
                      <span className="item-time">{formatTime(item.timestamp)}</span>
                      {item.metadata.domain && (
                        <span className="item-domain">{item.metadata.domain}</span>
                      )}
                    </div>
                  </div>

                  {/* Relationship Indicators */}
                  {item.relationships.parentIds.length > 0 && (
                    <div 
                      className="relationship-indicator incoming"
                      title={`${item.relationships.parentIds.length} incoming connections`}
                    >
                      ←{item.relationships.parentIds.length}
                    </div>
                  )}
                  
                  {item.relationships.childIds.length > 0 && (
                    <div 
                      className="relationship-indicator outgoing"
                      title={`${item.relationships.childIds.length} outgoing connections`}
                    >
                      {item.relationships.childIds.length}→
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Lane Footer */}
            <div className="lane-footer">
              <div className="lane-duration">
                {lane.endTimestamp && lane.startTimestamp && (
                  <>
                    Duration: {Math.round((lane.endTimestamp - lane.startTimestamp) / 1000 / 60)}m
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Branch Legend */}
      <div className="branch-legend">
        <div className="legend-title">Connection Types:</div>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-line split" />
            <span>Tab/Window Split</span>
          </div>
          <div className="legend-item">
            <div className="legend-line merge" />
            <span>Tab/Window Merge</span>
          </div>
          <div className="legend-item">
            <div className="legend-line related" />
            <span>Related Content</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionBranchingView;