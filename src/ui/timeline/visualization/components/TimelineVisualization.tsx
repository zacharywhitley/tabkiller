/**
 * Timeline Visualization Component
 * Git-style timeline visualization with session grouping and virtual scrolling
 */

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { TimelineVirtualScroll } from '../../core/TimelineVirtualScroll';
import { 
  TimelineVisualizationProps, 
  TimelineVisualizationItem, 
  TimelineSession,
  TimelineInteraction,
  TimelineSelectionState,
  TimelineRenderConfig
} from '../types/timeline';
import { 
  convertToTimelineSession, 
  convertToVisualizationItem,
  calculateOptimalZoomLevel 
} from '../utils/timelineUtils';
import { TimelineItem } from './TimelineItem';
import { SessionGroup } from './SessionGroup';
import { TimelineControls } from './TimelineControls';
import { BranchingVisualization } from './BranchingVisualization';
import { useTimelineSelection } from '../hooks/useTimelineSelection';
import { useTimelineKeyboard } from '../hooks/useTimelineKeyboard';
import './TimelineVisualization.css';

export const TimelineVisualization: React.FC<TimelineVisualizationProps> = ({
  data,
  height,
  width = 800,
  zoomLevel = 'hours',
  viewMode = 'timeline',
  enableSessionGrouping = true,
  showBranching = true,
  accessibilityEnabled = true,
  onItemSelect,
  onSessionSelect,
  onSessionToggle,
  onZoomChange,
  onTimeRangeChange,
  renderCustomItem,
  renderSessionHeader
}) => {
  // State management
  const [currentZoomLevel, setCurrentZoomLevel] = useState(zoomLevel);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  
  // Hooks for interaction management
  const {
    selectionState,
    selectItem,
    selectSession,
    clearSelection,
    isSelected
  } = useTimelineSelection();

  const {
    handleKeyDown,
    focusedItem,
    setFocusedItem
  } = useTimelineKeyboard({
    items: data.items,
    onItemSelect: selectItem,
    onSessionSelect: selectSession
  });

  // Memoized data processing
  const processedData = useMemo(() => {
    // Group items by session
    const sessionMap = new Map<string, TimelineVisualizationItem[]>();
    data.items.forEach(item => {
      const sessionId = item.metadata.sessionId || 'unknown';
      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, []);
      }
      sessionMap.get(sessionId)!.push(item);
    });

    // Convert to timeline sessions
    const sessions = data.sessions.map(session => {
      const sessionItems = sessionMap.get(session.id) || [];
      return {
        ...session,
        items: sessionItems.map(item => convertToVisualizationItem(item, sessionItems))
      };
    });

    // Sort sessions by creation time
    sessions.sort((a, b) => a.metadata.createdAt - b.metadata.createdAt);

    // Flatten items for virtual scrolling if not using session grouping
    const flatItems = enableSessionGrouping 
      ? []
      : data.items.map(item => convertToVisualizationItem(item, data.items));

    return {
      sessions,
      flatItems,
      totalItems: enableSessionGrouping 
        ? sessions.reduce((sum, session) => 
            sum + (expandedSessions.has(session.id) ? session.items.length : 1), 0
          )
        : flatItems.length
    };
  }, [data, enableSessionGrouping, expandedSessions]);

  // Virtual scroll item renderer
  const renderTimelineItem = useCallback((item: any, index: number) => {
    // Handle session grouping
    if (enableSessionGrouping && 'tag' in item) {
      const session = item as TimelineSession;
      const isExpanded = expandedSessions.has(session.id);
      
      return (
        <SessionGroup
          key={session.id}
          session={session}
          expanded={isExpanded}
          onToggle={(expanded) => {
            const newExpanded = new Set(expandedSessions);
            if (expanded) {
              newExpanded.add(session.id);
            } else {
              newExpanded.delete(session.id);
            }
            setExpandedSessions(newExpanded);
            onSessionToggle?.(session.id, expanded);
          }}
          onSelect={() => {
            selectSession(session.id);
            onSessionSelect?.(session);
          }}
          onItemSelect={(item) => {
            selectItem(item.id);
            onItemSelect?.(item);
          }}
          renderCustomItem={renderCustomItem}
          renderSessionHeader={renderSessionHeader}
          showBranching={showBranching}
          viewMode={viewMode}
          zoomLevel={currentZoomLevel}
          selected={isSelected('session', session.id)}
          accessibilityEnabled={accessibilityEnabled}
        />
      );
    }

    // Handle individual items
    const timelineItem = item as TimelineVisualizationItem;
    return (
      <TimelineItem
        key={timelineItem.id}
        item={timelineItem}
        viewMode={viewMode}
        zoomLevel={currentZoomLevel}
        showConnections={showBranching}
        selected={isSelected('item', timelineItem.id)}
        focused={focusedItem === timelineItem.id}
        onSelect={() => {
          selectItem(timelineItem.id);
          onItemSelect?.(timelineItem);
        }}
        onFocus={() => setFocusedItem(timelineItem.id)}
        renderCustom={renderCustomItem}
        accessibilityEnabled={accessibilityEnabled}
      />
    );
  }, [
    enableSessionGrouping,
    expandedSessions,
    viewMode,
    currentZoomLevel,
    showBranching,
    focusedItem,
    selectItem,
    selectSession,
    isSelected,
    onItemSelect,
    onSessionSelect,
    onSessionToggle,
    renderCustomItem,
    renderSessionHeader,
    accessibilityEnabled,
    setFocusedItem
  ]);

  // Handle zoom changes
  const handleZoomChange = useCallback((newZoomLevel: typeof zoomLevel) => {
    setCurrentZoomLevel(newZoomLevel);
    onZoomChange?.(newZoomLevel);
  }, [onZoomChange]);

  // Auto-optimize zoom level based on data range
  useEffect(() => {
    if (data.dateRange) {
      const optimalZoom = calculateOptimalZoomLevel(data.dateRange);
      if (optimalZoom !== currentZoomLevel) {
        setCurrentZoomLevel(optimalZoom);
      }
    }
  }, [data.dateRange, currentZoomLevel]);

  // Keyboard event handling
  useEffect(() => {
    if (accessibilityEnabled) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown, accessibilityEnabled]);

  // Render configuration
  const renderConfig: TimelineRenderConfig = {
    itemHeight: 60,
    laneWidth: 40,
    itemSpacing: 8,
    sessionHeaderHeight: 80,
    maxLanes: 8,
    animations: {
      enabled: true,
      duration: 200,
      easing: 'ease-out',
      stagger: 50
    },
    colorScheme: {
      sessionColors: [
        '#EF4444', '#F97316', '#F59E0B', '#84CC16', 
        '#22C55E', '#10B981', '#06B6D4', '#3B82F6',
        '#6366F1', '#8B5CF6', '#A855F7', '#D946EF'
      ],
      itemTypeColors: {
        session: '#4F46E5',
        navigation: '#06B6D4',
        tab_event: '#8B5CF6',
        boundary: '#EF4444'
      },
      connectionColors: {
        parent_child: '#6B7280',
        tab_group: '#8B5CF6',
        window_group: '#3B82F6',
        session_flow: '#10B981',
        domain_related: '#F59E0B',
        content_related: '#EC4899',
        bookmark: '#EF4444',
        search_result: '#06B6D4',
        back_forward: '#6B7280'
      },
      background: {
        primary: 'var(--bg-primary, #ffffff)',
        secondary: 'var(--bg-secondary, #f8fafc)',
        accent: 'var(--bg-accent, #f1f5f9)'
      },
      text: {
        primary: 'var(--text-primary, #0f172a)',
        secondary: 'var(--text-secondary, #475569)',
        muted: 'var(--text-muted, #94a3b8)'
      },
      states: {
        selected: 'var(--state-selected, #3b82f6)',
        hover: 'var(--state-hover, #e2e8f0)',
        active: 'var(--state-active, #1d4ed8)',
        disabled: 'var(--state-disabled, #cbd5e1)'
      }
    }
  };

  return (
    <div 
      className="timeline-visualization" 
      style={{ height, width }}
      role="application"
      aria-label="Browsing history timeline"
      tabIndex={accessibilityEnabled ? 0 : undefined}
    >
      {/* Timeline Controls */}
      <div className="timeline-controls">
        <TimelineControls
          zoomLevel={currentZoomLevel}
          viewMode={viewMode}
          dateRange={data.dateRange}
          onZoomChange={handleZoomChange}
          onTimeRangeChange={onTimeRangeChange}
          selectionCount={selectionState.selectedItems.size + selectionState.selectedSessions.size}
          onClearSelection={clearSelection}
          accessibilityEnabled={accessibilityEnabled}
        />
      </div>

      {/* Main Timeline Content */}
      <div className="timeline-content" style={{ height: height - 60 }}>
        {showBranching && viewMode === 'branches' && (
          <BranchingVisualization
            sessions={processedData.sessions}
            width={width}
            height={height - 60}
            config={renderConfig}
            onSessionSelect={selectSession}
            onItemSelect={selectItem}
          />
        )}
        
        <TimelineVirtualScroll
          data={{
            items: enableSessionGrouping 
              ? processedData.sessions.flatMap(session => {
                  if (expandedSessions.has(session.id)) {
                    return [session, ...session.items];
                  }
                  return [session];
                })
              : processedData.flatItems,
            groups: [],
            totalCount: processedData.totalItems,
            dateRange: data.dateRange,
            indexMap: new Map(),
            searchIndex: {
              textIndex: new Map(),
              domainIndex: new Map(),
              sessionIndex: new Map(),
              tagIndex: new Map(),
              dateRangeIndex: new Map()
            }
          }}
          height={height - 60}
          width={width}
          itemHeight={renderConfig.itemHeight}
          renderItem={renderTimelineItem}
          enablePerformanceMonitoring={true}
          enableMemoryManagement={true}
          loading={false}
        />
      </div>

      {/* Accessibility announcements */}
      {accessibilityEnabled && (
        <div 
          role="status" 
          aria-live="polite" 
          className="sr-only timeline-announcements"
        >
          {selectionState.selectedItems.size > 0 && 
            `${selectionState.selectedItems.size} items selected`
          }
          {selectionState.selectedSessions.size > 0 && 
            `${selectionState.selectedSessions.size} sessions selected`
          }
        </div>
      )}
    </div>
  );
};

export default TimelineVisualization;