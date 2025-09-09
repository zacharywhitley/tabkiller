/**
 * Timeline Virtual Scroll Component
 * High-performance timeline visualization with virtual scrolling
 */

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { TimelineVirtualScrollProps, TimelineScrollEvent, TimelineFilterEvent } from './types';
import { VirtualScrolling } from './VirtualScrolling';
import { TimelineDataManager, sessionToTimelineItems } from './TimelineDataStructures';
import { usePerformanceMonitoring } from './hooks/usePerformanceMonitoring';
import { useMemoryManager } from './hooks/useMemoryManager';
import { HistoryTimelineItem } from '../../../shared/types';

// =============================================================================
// TIMELINE VIRTUAL SCROLL COMPONENT
// =============================================================================

export const TimelineVirtualScroll: React.FC<TimelineVirtualScrollProps> = ({
  data,
  height,
  width = '100%',
  itemHeight = 60,
  filter,
  sort,
  enablePerformanceMonitoring = true,
  enableMemoryManagement = true,
  selectionMode = 'single',
  selectedItems = [],
  onItemSelect,
  onItemsSelect,
  onScroll,
  onFilter,
  renderItem,
  loading = false,
  error = null
}) => {
  // Data manager for efficient operations
  const dataManagerRef = useRef<TimelineDataManager | null>(null);
  const [filteredData, setFilteredData] = useState(data);

  // Performance monitoring
  const { 
    metrics, 
    startMonitoring, 
    stopMonitoring,
    recordFrame 
  } = usePerformanceMonitoring();

  // Memory management
  const { 
    cleanup,
    isMemoryLimitReached,
    trackItem,
    untrackItem
  } = useMemoryManager({
    maxItems: Math.min(data.totalCount, 10000),
    maxMemoryMB: 100
  });

  // Initialize data manager
  useEffect(() => {
    dataManagerRef.current = new TimelineDataManager(data.items);
    
    // Apply initial filter and sort
    if (filter) {
      dataManagerRef.current.applyFilter(filter);
    }
    if (sort) {
      dataManagerRef.current.applySort(sort);
    }
    
    setFilteredData(dataManagerRef.current.getTimelineData());
  }, [data.items]);

  // Apply filter changes
  useEffect(() => {
    if (!dataManagerRef.current || !filter) return;

    const startTime = performance.now();
    dataManagerRef.current.applyFilter(filter);
    const newData = dataManagerRef.current.getTimelineData();
    const filterTime = performance.now() - startTime;
    
    setFilteredData(newData);
    
    onFilter?.({
      filter,
      resultCount: newData.totalCount,
      filterTime,
      timestamp: Date.now()
    });
  }, [filter, onFilter]);

  // Apply sort changes
  useEffect(() => {
    if (!dataManagerRef.current || !sort) return;
    
    dataManagerRef.current.applySort(sort);
    setFilteredData(dataManagerRef.current.getTimelineData());
  }, [sort]);

  // Performance monitoring lifecycle
  useEffect(() => {
    if (enablePerformanceMonitoring) {
      startMonitoring();
    }
    
    return () => {
      if (enablePerformanceMonitoring) {
        stopMonitoring();
      }
    };
  }, [enablePerformanceMonitoring, startMonitoring, stopMonitoring]);

  // Memory cleanup when limits reached
  useEffect(() => {
    if (enableMemoryManagement && isMemoryLimitReached()) {
      cleanup();
    }
  }, [enableMemoryManagement, isMemoryLimitReached, cleanup, filteredData]);

  // Handle scroll events with performance tracking
  const handleScroll = useCallback((scrollTop: number) => {
    recordFrame();
    
    const scrollEvent: TimelineScrollEvent = {
      scrollTop,
      direction: scrollTop > (handleScroll as any).lastScrollTop ? 'down' : 'up',
      velocity: 0, // Could be calculated based on time delta
      isUserScrolling: true,
      timestamp: performance.now()
    };
    
    (handleScroll as any).lastScrollTop = scrollTop;
    onScroll?.(scrollEvent);
  }, [onScroll, recordFrame]);

  // Handle item selection
  const handleItemClick = useCallback((item: HistoryTimelineItem, index: number) => {
    if (selectionMode === 'none') return;

    if (selectionMode === 'single') {
      onItemSelect?.(item);
    } else {
      // Handle multiple selection logic
      const isSelected = selectedItems.includes(item.id);
      let newSelectedItems: string[];
      
      if (isSelected) {
        newSelectedItems = selectedItems.filter(id => id !== item.id);
      } else {
        newSelectedItems = [...selectedItems, item.id];
      }
      
      const selectedItemObjects = newSelectedItems
        .map(id => dataManagerRef.current?.getItemById(id))
        .filter((item): item is HistoryTimelineItem => item !== null);
      
      onItemsSelect?.(selectedItemObjects);
    }
  }, [selectionMode, selectedItems, onItemSelect, onItemsSelect]);

  // Default item renderer
  const defaultRenderItem = useCallback((item: HistoryTimelineItem, index: number) => {
    const isSelected = selectedItems.includes(item.id);
    
    return (
      <TimelineItemRenderer
        item={item}
        index={index}
        selected={isSelected}
        onClick={() => handleItemClick(item, index)}
        onMount={enableMemoryManagement ? trackItem : undefined}
        onUnmount={enableMemoryManagement ? untrackItem : undefined}
      />
    );
  }, [selectedItems, handleItemClick, enableMemoryManagement, trackItem, untrackItem]);

  // Virtual scrolling render function
  const virtualRenderItem = useCallback(({ index, style, isVisible }) => {
    const item = filteredData.items[index];
    if (!item) return null;

    const itemRenderer = renderItem || defaultRenderItem;
    
    return (
      <div style={style}>
        {itemRenderer(item, index)}
      </div>
    );
  }, [filteredData.items, renderItem, defaultRenderItem]);

  // Loading state
  if (loading) {
    return (
      <div 
        style={{ 
          height, 
          width, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}
      >
        <div>Loading timeline...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div 
        style={{ 
          height, 
          width, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: 'red'
        }}
      >
        <div>Error: {error}</div>
      </div>
    );
  }

  // Empty state
  if (filteredData.totalCount === 0) {
    return (
      <div 
        style={{ 
          height, 
          width, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}
      >
        <div>No timeline items found</div>
      </div>
    );
  }

  return (
    <div className="timeline-virtual-scroll">
      <VirtualScrolling
        itemCount={filteredData.totalCount}
        itemHeight={itemHeight}
        containerHeight={height}
        containerWidth={width}
        renderItem={virtualRenderItem}
        onScroll={handleScroll}
        overscan={10} // Increased overscan for smoother scrolling
      />
      
      {/* Performance metrics overlay for development */}
      {process.env.NODE_ENV === 'development' && enablePerformanceMonitoring && (
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '11px',
          fontFamily: 'monospace',
          zIndex: 1000
        }}>
          <div>Items: {filteredData.totalCount}</div>
          <div>FPS: {metrics.fps}</div>
          <div>Memory: {metrics.memoryUsage.toFixed(1)}MB</div>
          <div>Frame: {metrics.averageFrameTime.toFixed(1)}ms</div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// TIMELINE ITEM RENDERER
// =============================================================================

interface TimelineItemRendererProps {
  item: HistoryTimelineItem;
  index: number;
  selected: boolean;
  onClick: () => void;
  onMount?: (item: object) => void;
  onUnmount?: (item: object) => void;
}

const TimelineItemRenderer: React.FC<TimelineItemRendererProps> = ({
  item,
  index,
  selected,
  onClick,
  onMount,
  onUnmount
}) => {
  // Track memory usage
  useEffect(() => {
    onMount?.(item);
    return () => onUnmount?.(item);
  }, [item, onMount, onUnmount]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getItemIcon = (type: HistoryTimelineItem['type']) => {
    switch (type) {
      case 'session': return '🔄';
      case 'navigation': return '🌐';
      case 'tab_event': return '📄';
      case 'boundary': return '🚧';
      default: return '•';
    }
  };

  return (
    <div
      className={`timeline-item ${selected ? 'selected' : ''}`}
      onClick={onClick}
      style={{
        padding: '8px 16px',
        borderBottom: '1px solid #eee',
        cursor: 'pointer',
        backgroundColor: selected ? '#e3f2fd' : 'white',
        display: 'flex',
        alignItems: 'center',
        minHeight: '60px'
      }}
    >
      <div style={{ marginRight: '12px', fontSize: '16px' }}>
        {getItemIcon(item.type)}
      </div>
      
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ 
          fontWeight: 500, 
          marginBottom: '4px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {item.title}
        </div>
        
        {item.description && (
          <div style={{ 
            color: '#666', 
            fontSize: '13px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {item.description}
          </div>
        )}
        
        <div style={{ 
          color: '#999', 
          fontSize: '11px',
          marginTop: '4px'
        }}>
          {formatTime(item.timestamp)}
          {item.metadata.domain && ` • ${item.metadata.domain}`}
          {item.metadata.sessionId && ` • Session ${item.metadata.sessionId.slice(0, 8)}`}
        </div>
      </div>
      
      <div style={{ 
        color: '#999', 
        fontSize: '11px',
        textAlign: 'right'
      }}>
        #{index}
      </div>
    </div>
  );
};

export default TimelineVirtualScroll;