/**
 * Connection Lines Component
 * Renders connection lines between timeline items for git-style visualization
 */

import React, { useMemo } from 'react';
import { 
  TimelineVisualizationItem, 
  TimelineViewMode,
  ConnectionType 
} from '../types/timeline';
import './ConnectionLines.css';

interface ConnectionLinesProps {
  /** Current item */
  item: TimelineVisualizationItem;
  /** View mode */
  viewMode: TimelineViewMode;
  /** Show connections */
  showConnections: boolean;
  /** Lane width for spacing */
  laneWidth: number;
}

export const ConnectionLines: React.FC<ConnectionLinesProps> = ({
  item,
  viewMode,
  showConnections,
  laneWidth
}) => {
  // Calculate connection paths
  const connectionPaths = useMemo(() => {
    if (!showConnections || viewMode !== 'branches') return [];

    const paths = [];
    const currentX = item.position.laneIndex * laneWidth;
    const currentY = 0; // Relative to item position

    // Parent connections (incoming)
    if (item.relationships.parentIds.length > 0) {
      // For simplicity, assume parents are in previous lanes or same lane above
      item.relationships.parentIds.forEach((parentId, index) => {
        const parentX = Math.max(0, currentX - laneWidth * (index + 1));
        const parentY = -60; // Above current item

        paths.push({
          id: `parent-${parentId}`,
          path: createConnectionPath(parentX, parentY, currentX, currentY, 'incoming'),
          type: item.relationships.connectionType,
          direction: 'incoming' as const
        });
      });
    }

    // Child connections (outgoing)
    if (item.relationships.childIds.length > 0) {
      item.relationships.childIds.forEach((childId, index) => {
        const childX = currentX + laneWidth * (index + 1);
        const childY = 60; // Below current item

        paths.push({
          id: `child-${childId}`,
          path: createConnectionPath(currentX, currentY, childX, childY, 'outgoing'),
          type: item.relationships.connectionType,
          direction: 'outgoing' as const
        });
      });
    }

    // Sibling connections (lateral)
    if (item.relationships.siblingIds.length > 0) {
      item.relationships.siblingIds.slice(0, 2).forEach((siblingId, index) => {
        const siblingX = currentX + laneWidth * (index % 2 === 0 ? -1 : 1);
        const siblingY = 0; // Same level

        paths.push({
          id: `sibling-${siblingId}`,
          path: createConnectionPath(currentX, currentY, siblingX, siblingY, 'lateral'),
          type: 'tab_group',
          direction: 'lateral' as const
        });
      });
    }

    return paths;
  }, [item, showConnections, viewMode, laneWidth]);

  // Create SVG path for connection
  const createConnectionPath = (
    fromX: number, 
    fromY: number, 
    toX: number, 
    toY: number, 
    direction: 'incoming' | 'outgoing' | 'lateral'
  ): string => {
    const deltaX = toX - fromX;
    const deltaY = toY - fromY;

    switch (direction) {
      case 'incoming':
        // Curved line coming from above/side
        const controlX1 = fromX + deltaX * 0.3;
        const controlY1 = fromY + deltaY * 0.1;
        const controlX2 = fromX + deltaX * 0.7;
        const controlY2 = fromY + deltaY * 0.9;
        return `M ${fromX} ${fromY} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${toX} ${toY}`;
      
      case 'outgoing':
        // Curved line going to below/side
        const outControlX1 = fromX + deltaX * 0.3;
        const outControlY1 = fromY + deltaY * 0.1;
        const outControlX2 = fromX + deltaX * 0.7;
        const outControlY2 = fromY + deltaY * 0.9;
        return `M ${fromX} ${fromY} C ${outControlX1} ${outControlY1}, ${outControlX2} ${outControlY2}, ${toX} ${toY}`;
      
      case 'lateral':
        // Gentle S-curve for lateral connections
        const midY = (fromY + toY) / 2;
        return `M ${fromX} ${fromY} C ${fromX + deltaX * 0.5} ${fromY}, ${fromX + deltaX * 0.5} ${toY}, ${toX} ${toY}`;
      
      default:
        return `M ${fromX} ${fromY} L ${toX} ${toY}`;
    }
  };

  // Get connection color based on type
  const getConnectionColor = (type: ConnectionType): string => {
    const colorMap: Record<ConnectionType, string> = {
      parent_child: '#3b82f6',
      tab_group: '#8b5cf6',
      window_group: '#06b6d4',
      session_flow: '#10b981',
      domain_related: '#f59e0b',
      content_related: '#ec4899',
      bookmark: '#ef4444',
      search_result: '#06b6d4',
      back_forward: '#6b7280'
    };
    
    return colorMap[type] || '#6b7280';
  };

  // Get connection opacity based on direction
  const getConnectionOpacity = (direction: 'incoming' | 'outgoing' | 'lateral'): number => {
    switch (direction) {
      case 'incoming': return 0.8;
      case 'outgoing': return 0.6;
      case 'lateral': return 0.4;
      default: return 0.6;
    }
  };

  // Get stroke width based on connection importance
  const getStrokeWidth = (type: ConnectionType, direction: 'incoming' | 'outgoing' | 'lateral'): number => {
    if (type === 'parent_child' || type === 'session_flow') return 2.5;
    if (direction === 'incoming') return 2;
    return 1.5;
  };

  if (!showConnections || connectionPaths.length === 0) return null;

  return (
    <div className="connection-lines">
      <svg
        className="connections-svg"
        width={laneWidth * 4} // Cover multiple lanes
        height={120} // Cover vertical space
        style={{
          position: 'absolute',
          top: -60,
          left: -laneWidth * 2,
          pointerEvents: 'none',
          zIndex: -1
        }}
        viewBox={`${-laneWidth * 2} -60 ${laneWidth * 4} 120`}
      >
        <defs>
          {/* Arrow markers for different connection types */}
          <marker
            id="arrow-incoming"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path
              d="M0,0 L0,8 L8,4 z"
              fill="#3b82f6"
            />
          </marker>
          
          <marker
            id="arrow-outgoing"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path
              d="M0,0 L0,8 L8,4 z"
              fill="#10b981"
            />
          </marker>

          <marker
            id="arrow-lateral"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path
              d="M0,0 L0,6 L6,3 z"
              fill="#8b5cf6"
            />
          </marker>
        </defs>

        {connectionPaths.map(({ id, path, type, direction }) => (
          <g key={id} className={`connection-group ${direction}`}>
            {/* Connection path */}
            <path
              d={path}
              stroke={getConnectionColor(type)}
              strokeWidth={getStrokeWidth(type, direction)}
              fill="none"
              opacity={getConnectionOpacity(direction)}
              className={`connection-path ${type} ${direction}`}
              markerEnd={`url(#arrow-${direction})`}
            />
            
            {/* Subtle glow effect for important connections */}
            {(type === 'parent_child' || type === 'session_flow') && (
              <path
                d={path}
                stroke={getConnectionColor(type)}
                strokeWidth={getStrokeWidth(type, direction) + 2}
                fill="none"
                opacity={0.2}
                className="connection-glow"
              />
            )}
          </g>
        ))}
      </svg>

      {/* Connection indicators */}
      <div className="connection-indicators">
        {item.relationships.parentIds.length > 0 && (
          <div 
            className="connection-indicator incoming"
            title={`${item.relationships.parentIds.length} incoming connections`}
          >
            ↓
          </div>
        )}
        
        {item.relationships.childIds.length > 0 && (
          <div 
            className="connection-indicator outgoing"
            title={`${item.relationships.childIds.length} outgoing connections`}
          >
            ↑
          </div>
        )}
        
        {item.relationships.siblingIds.length > 0 && (
          <div 
            className="connection-indicator lateral"
            title={`${item.relationships.siblingIds.length} related items`}
          >
            ↔
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectionLines;