/**
 * Branching Visualization Component
 * Git-style branching and merging visualization for timeline sessions
 */

import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { 
  TimelineSession, 
  SessionBranch, 
  SessionMerge, 
  TimelineRenderConfig 
} from '../types/timeline';
import './BranchingVisualization.css';

interface BranchingVisualizationProps {
  /** Sessions to visualize */
  sessions: TimelineSession[];
  /** Container width */
  width: number;
  /** Container height */
  height: number;
  /** Rendering configuration */
  config: TimelineRenderConfig;
  /** Session selection handler */
  onSessionSelect: (sessionId: string) => void;
  /** Item selection handler */
  onItemSelect: (itemId: string) => void;
}

interface BranchNode {
  id: string;
  x: number;
  y: number;
  type: 'session_start' | 'session_end' | 'branch' | 'merge' | 'item';
  sessionId: string;
  branchId?: string;
  itemId?: string;
  timestamp: number;
}

interface BranchConnection {
  from: BranchNode;
  to: BranchNode;
  type: 'session_flow' | 'branch_split' | 'branch_merge' | 'item_flow';
  sessionId: string;
  color: string;
}

export const BranchingVisualization: React.FC<BranchingVisualizationProps> = ({
  sessions,
  width,
  height,
  config,
  onSessionSelect,
  onItemSelect
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasWidth = width - 40; // Account for margins
  const canvasHeight = height - 40;

  // Memoized branching data calculation
  const branchingData = useMemo(() => {
    const nodes: BranchNode[] = [];
    const connections: BranchConnection[] = [];
    
    // Calculate time range for positioning
    const allTimestamps = sessions.flatMap(session => 
      session.items.map(item => item.timestamp)
    );
    const minTime = Math.min(...allTimestamps);
    const maxTime = Math.max(...allTimestamps);
    const timeRange = maxTime - minTime || 1;

    // Lane assignment for sessions
    const laneAssignments = new Map<string, number>();
    let currentLane = 0;

    sessions.forEach(session => {
      laneAssignments.set(session.id, currentLane);
      
      // Process session branches
      session.visual.branches.forEach((branch, branchIndex) => {
        const branchLane = currentLane + branchIndex;
        
        // Create branch nodes
        const startNode: BranchNode = {
          id: `${session.id}-${branch.id}-start`,
          x: 20 + branchLane * config.laneWidth,
          y: ((branch.startTimestamp - minTime) / timeRange) * canvasHeight + 20,
          type: branchIndex === 0 ? 'session_start' : 'branch',
          sessionId: session.id,
          branchId: branch.id,
          timestamp: branch.startTimestamp
        };

        const endNode: BranchNode = {
          id: `${session.id}-${branch.id}-end`,
          x: 20 + branchLane * config.laneWidth,
          y: branch.endTimestamp ? 
            ((branch.endTimestamp - minTime) / timeRange) * canvasHeight + 20 : 
            canvasHeight - 20,
          type: branchIndex === 0 && !branch.endTimestamp ? 'session_end' : 'merge',
          sessionId: session.id,
          branchId: branch.id,
          timestamp: branch.endTimestamp || maxTime
        };

        nodes.push(startNode, endNode);

        // Create branch flow connection
        connections.push({
          from: startNode,
          to: endNode,
          type: 'session_flow',
          sessionId: session.id,
          color: session.visual.color
        });

        // Add item nodes along the branch
        const branchItems = session.items.filter(item => 
          branch.itemIds.includes(item.id)
        );

        branchItems.forEach(item => {
          const itemNode: BranchNode = {
            id: `${session.id}-${item.id}`,
            x: 20 + branchLane * config.laneWidth,
            y: ((item.timestamp - minTime) / timeRange) * canvasHeight + 20,
            type: 'item',
            sessionId: session.id,
            branchId: branch.id,
            itemId: item.id,
            timestamp: item.timestamp
          };

          nodes.push(itemNode);
        });
      });

      // Handle branch splits
      session.visual.branches.forEach((branch, index) => {
        if (index > 0) {
          // Find parent branch split point
          const parentBranch = session.visual.branches[0];
          const splitPoint = findBranchSplitPoint(branch, parentBranch, session.items);
          
          if (splitPoint) {
            const splitNode: BranchNode = {
              id: `${session.id}-split-${branch.id}`,
              x: 20,
              y: ((splitPoint.timestamp - minTime) / timeRange) * canvasHeight + 20,
              type: 'branch',
              sessionId: session.id,
              branchId: parentBranch.id,
              timestamp: splitPoint.timestamp
            };

            const branchStartNode = nodes.find(n => 
              n.id === `${session.id}-${branch.id}-start`
            );

            if (branchStartNode) {
              connections.push({
                from: splitNode,
                to: branchStartNode,
                type: 'branch_split',
                sessionId: session.id,
                color: session.visual.color
              });
            }
          }
        }
      });

      // Handle merges
      session.visual.merges.forEach(merge => {
        const mergeY = ((merge.timestamp - minTime) / timeRange) * canvasHeight + 20;
        
        merge.sourceBranches.forEach(sourceBranchId => {
          const sourceBranch = session.visual.branches.find(b => b.id === sourceBranchId);
          const targetBranch = session.visual.branches.find(b => b.id === merge.targetBranch);
          
          if (sourceBranch && targetBranch) {
            const sourceNode = nodes.find(n => 
              n.branchId === sourceBranchId && n.type === 'merge'
            );
            const targetNode = nodes.find(n => 
              n.branchId === merge.targetBranch
            );

            if (sourceNode && targetNode) {
              connections.push({
                from: sourceNode,
                to: targetNode,
                type: 'branch_merge',
                sessionId: session.id,
                color: session.visual.color
              });
            }
          }
        });
      });

      currentLane += Math.max(1, session.visual.branches.length);
    });

    return { nodes, connections };
  }, [sessions, canvasWidth, canvasHeight, config.laneWidth]);

  // Find branch split point based on timing and relationships
  const findBranchSplitPoint = (
    branch: SessionBranch, 
    parentBranch: SessionBranch, 
    allItems: any[]
  ) => {
    // Find the item that triggered this branch
    const branchItems = allItems.filter(item => branch.itemIds.includes(item.id));
    const parentItems = allItems.filter(item => parentBranch.itemIds.includes(item.id));

    if (branchItems.length === 0 || parentItems.length === 0) return null;

    // Find closest parent item in time
    const firstBranchItem = branchItems[0];
    const closestParentItem = parentItems
      .filter(item => item.timestamp <= firstBranchItem.timestamp)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    return closestParentItem || null;
  };

  // Handle node click
  const handleNodeClick = useCallback((node: BranchNode, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (node.type === 'session_start' || node.type === 'session_end') {
      onSessionSelect(node.sessionId);
    } else if (node.itemId) {
      onItemSelect(node.itemId);
    }
  }, [onSessionSelect, onItemSelect]);

  // Render connection path
  const renderConnection = useCallback((connection: BranchConnection, index: number) => {
    const { from, to, type, color } = connection;
    
    let pathData = '';
    const strokeWidth = type === 'session_flow' ? 3 : 2;
    const opacity = type === 'item_flow' ? 0.6 : 1;

    switch (type) {
      case 'session_flow':
        pathData = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
        break;
      case 'branch_split':
        const midX = (from.x + to.x) / 2;
        pathData = `M ${from.x} ${from.y} Q ${midX} ${from.y} ${to.x} ${to.y}`;
        break;
      case 'branch_merge':
        const mergeX = (from.x + to.x) / 2;
        pathData = `M ${from.x} ${from.y} Q ${mergeX} ${to.y} ${to.x} ${to.y}`;
        break;
      default:
        pathData = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }

    return (
      <path
        key={`connection-${index}`}
        d={pathData}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        opacity={opacity}
        className={`branch-connection ${type}`}
        markerEnd={type === 'branch_split' ? 'url(#arrowhead)' : undefined}
      />
    );
  }, []);

  // Render node
  const renderNode = useCallback((node: BranchNode, index: number) => {
    const session = sessions.find(s => s.id === node.sessionId);
    if (!session) return null;

    const nodeSize = getNodeSize(node.type);
    const nodeColor = session.visual.color;

    return (
      <g
        key={`node-${index}`}
        className={`branch-node ${node.type}`}
        onClick={(e) => handleNodeClick(node, e)}
        style={{ cursor: 'pointer' }}
      >
        <circle
          cx={node.x}
          cy={node.y}
          r={nodeSize}
          fill={nodeColor}
          stroke="#ffffff"
          strokeWidth={2}
          className="node-circle"
        />
        
        {node.type === 'branch' && (
          <text
            x={node.x}
            y={node.y + 1}
            textAnchor="middle"
            fontSize="8"
            fill="#ffffff"
            className="node-text"
          >
            ⋈
          </text>
        )}
        
        {node.type === 'merge' && (
          <text
            x={node.x}
            y={node.y + 1}
            textAnchor="middle"
            fontSize="8"
            fill="#ffffff"
            className="node-text"
          >
            ⋉
          </text>
        )}
        
        {node.itemId && (
          <circle
            cx={node.x}
            cy={node.y}
            r={nodeSize - 2}
            fill="none"
            stroke={nodeColor}
            strokeWidth={1}
            opacity={0.5}
          />
        )}
      </g>
    );
  }, [sessions, handleNodeClick]);

  // Get node size based on type
  const getNodeSize = (type: BranchNode['type']): number => {
    switch (type) {
      case 'session_start':
      case 'session_end':
        return 8;
      case 'branch':
      case 'merge':
        return 6;
      case 'item':
        return 3;
      default:
        return 4;
    }
  };

  return (
    <div className="branching-visualization" style={{ width, height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="branching-svg"
        role="img"
        aria-label="Session branching visualization"
      >
        {/* Definitions for arrowheads */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="currentColor"
            />
          </marker>
        </defs>

        {/* Grid lines for time reference */}
        <g className="grid-lines">
          {[0.25, 0.5, 0.75].map(fraction => (
            <line
              key={fraction}
              x1={20}
              y1={fraction * canvasHeight + 20}
              x2={canvasWidth + 20}
              y2={fraction * canvasHeight + 20}
              stroke="#e5e7eb"
              strokeWidth={1}
              opacity={0.3}
              strokeDasharray="2,2"
            />
          ))}
        </g>

        {/* Render connections first (behind nodes) */}
        <g className="connections">
          {branchingData.connections.map(renderConnection)}
        </g>

        {/* Render nodes */}
        <g className="nodes">
          {branchingData.nodes.map(renderNode)}
        </g>

        {/* Session labels */}
        <g className="session-labels">
          {sessions.map((session, index) => {
            const lane = sessions.indexOf(session);
            return (
              <text
                key={session.id}
                x={20 + lane * config.laneWidth}
                y={15}
                textAnchor="middle"
                fontSize="10"
                fill={session.visual.color}
                fontWeight="bold"
                className="session-label"
              >
                {session.tag}
              </text>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="branching-legend">
        <div className="legend-item">
          <div className="legend-symbol session-start" />
          <span>Session Start</span>
        </div>
        <div className="legend-item">
          <div className="legend-symbol branch-point" />
          <span>Branch Point</span>
        </div>
        <div className="legend-item">
          <div className="legend-symbol merge-point" />
          <span>Merge Point</span>
        </div>
        <div className="legend-item">
          <div className="legend-symbol item-point" />
          <span>Page Visit</span>
        </div>
      </div>
    </div>
  );
};

export default BranchingVisualization;