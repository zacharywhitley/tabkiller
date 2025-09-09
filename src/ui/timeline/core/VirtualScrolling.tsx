/**
 * High-Performance Virtual Scrolling Component
 * Optimized for handling 100k+ items with smooth 60fps scrolling
 */

import React, { 
  useCallback, 
  useEffect, 
  useRef, 
  useState, 
  useMemo,
  memo 
} from 'react';
import { 
  VirtualScrollingProps, 
  VirtualScrollingState, 
  VirtualItem, 
  VirtualItemRenderParams 
} from './types';
import { usePerformanceMonitoring } from './hooks/usePerformanceMonitoring';
import { useMemoryManager } from './hooks/useMemoryManager';

// =============================================================================
// VIRTUAL SCROLLING COMPONENT
// =============================================================================

export const VirtualScrolling = memo<VirtualScrollingProps>(({
  itemCount,
  itemHeight,
  containerHeight,
  containerWidth = '100%',
  renderItem,
  overscan = 5,
  onScroll,
  scrollToIndex,
  horizontal = false,
  className = ''
}) => {
  // Refs for DOM elements
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollElementRef = useRef<HTMLDivElement>(null);
  
  // Performance monitoring
  const { 
    metrics, 
    startMonitoring, 
    stopMonitoring, 
    recordFrame 
  } = usePerformanceMonitoring();
  
  // Memory management
  const { 
    isMemoryLimitReached, 
    cleanup 
  } = useMemoryManager({
    maxItems: Math.min(itemCount, 10000),
    maxMemoryMB: 100
  });

  // State
  const [state, setState] = useState<VirtualScrollingState>({
    scrollTop: 0,
    scrollLeft: 0,
    startIndex: 0,
    endIndex: 0,
    visibleItems: [],
    isScrolling: false,
    lastScrollTime: 0
  });

  // Calculate visible range
  const calculateVisibleRange = useCallback((scrollTop: number): [number, number] => {
    const start = Math.floor(scrollTop / itemHeight);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    
    const startIndex = Math.max(0, start - overscan);
    const endIndex = Math.min(itemCount - 1, start + visibleCount + overscan);
    
    return [startIndex, endIndex];
  }, [itemHeight, containerHeight, itemCount, overscan]);

  // Generate visible items
  const generateVisibleItems = useCallback((
    startIndex: number, 
    endIndex: number
  ): VirtualItem[] => {
    const items: VirtualItem[] = [];
    
    for (let i = startIndex; i <= endIndex; i++) {
      items.push({
        index: i,
        top: i * itemHeight,
        left: 0,
        height: itemHeight,
        width: typeof containerWidth === 'number' ? containerWidth : 0,
        isVisible: true
      });
    }
    
    return items;
  }, [itemHeight, containerWidth]);

  // Handle scroll with performance optimization
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = event.currentTarget.scrollTop;
    const scrollLeft = event.currentTarget.scrollLeft;
    const now = performance.now();
    
    // Record frame for performance monitoring
    recordFrame();
    
    // Throttle scroll updates for performance
    if (now - state.lastScrollTime < 16) { // ~60fps
      return;
    }
    
    const [startIndex, endIndex] = calculateVisibleRange(scrollTop);
    const visibleItems = generateVisibleItems(startIndex, endIndex);
    
    setState(prevState => ({
      ...prevState,
      scrollTop,
      scrollLeft,
      startIndex,
      endIndex,
      visibleItems,
      isScrolling: true,
      lastScrollTime: now
    }));
    
    onScroll?.(scrollTop);
    
    // Clear scrolling flag after a delay
    setTimeout(() => {
      setState(prevState => ({
        ...prevState,
        isScrolling: false
      }));
    }, 150);
  }, [calculateVisibleRange, generateVisibleItems, onScroll, recordFrame, state.lastScrollTime]);

  // Scroll to specific index
  const scrollToIndexImpl = useCallback((index: number) => {
    if (!scrollElementRef.current) return;
    
    const scrollTop = Math.max(0, index * itemHeight);
    scrollElementRef.current.scrollTop = scrollTop;
  }, [itemHeight]);

  // Effect for scrollToIndex prop
  useEffect(() => {
    if (typeof scrollToIndex === 'number' && scrollToIndex >= 0) {
      scrollToIndexImpl(scrollToIndex);
    }
  }, [scrollToIndex, scrollToIndexImpl]);

  // Initialize visible items
  useEffect(() => {
    const [startIndex, endIndex] = calculateVisibleRange(0);
    const visibleItems = generateVisibleItems(startIndex, endIndex);
    
    setState(prevState => ({
      ...prevState,
      startIndex,
      endIndex,
      visibleItems
    }));
  }, [calculateVisibleRange, generateVisibleItems]);

  // Performance monitoring lifecycle
  useEffect(() => {
    startMonitoring();
    return () => stopMonitoring();
  }, [startMonitoring, stopMonitoring]);

  // Memory cleanup
  useEffect(() => {
    if (isMemoryLimitReached()) {
      cleanup();
    }
  }, [state.visibleItems, isMemoryLimitReached, cleanup]);

  // Total dimensions
  const totalHeight = itemCount * itemHeight;
  const totalWidth = typeof containerWidth === 'number' ? containerWidth : '100%';

  // Container styles
  const containerStyle: React.CSSProperties = {
    height: containerHeight,
    width: containerWidth,
    overflow: 'auto',
    position: 'relative'
  };

  // Content styles for creating scroll space
  const contentStyle: React.CSSProperties = {
    height: totalHeight,
    width: totalWidth,
    position: 'relative'
  };

  return (
    <div 
      ref={containerRef}
      className={`virtual-scrolling ${className}`}
      style={containerStyle}
    >
      <div 
        ref={scrollElementRef}
        style={{
          height: '100%',
          width: '100%',
          overflow: 'auto'
        }}
        onScroll={handleScroll}
      >
        <div style={contentStyle}>
          {state.visibleItems.map((item) => (
            <VirtualItem
              key={item.index}
              item={item}
              renderItem={renderItem}
            />
          ))}
        </div>
      </div>
      
      {/* Performance overlay in development */}
      {process.env.NODE_ENV === 'development' && (
        <PerformanceOverlay metrics={metrics} />
      )}
    </div>
  );
});

VirtualScrolling.displayName = 'VirtualScrolling';

// =============================================================================
// VIRTUAL ITEM COMPONENT
// =============================================================================

interface VirtualItemProps {
  item: VirtualItem;
  renderItem: (params: VirtualItemRenderParams) => React.ReactNode;
}

const VirtualItem = memo<VirtualItemProps>(({ item, renderItem }) => {
  const style: React.CSSProperties = {
    position: 'absolute',
    top: item.top,
    left: item.left,
    height: item.height,
    width: item.width || '100%'
  };

  const renderParams: VirtualItemRenderParams = {
    index: item.index,
    style,
    isVisible: item.isVisible,
    data: item.data
  };

  return (
    <div style={style}>
      {renderItem(renderParams)}
    </div>
  );
});

VirtualItem.displayName = 'VirtualItem';

// =============================================================================
// PERFORMANCE OVERLAY (DEVELOPMENT ONLY)
// =============================================================================

interface PerformanceOverlayProps {
  metrics: {
    fps: number;
    averageFrameTime: number;
    memoryUsage: number;
    renderedItems: number;
    totalItems: number;
  };
}

const PerformanceOverlay: React.FC<PerformanceOverlayProps> = ({ metrics }) => (
  <div 
    style={{
      position: 'absolute',
      top: 10,
      right: 10,
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '8px 12px',
      borderRadius: '4px',
      fontSize: '12px',
      fontFamily: 'monospace',
      zIndex: 1000,
      minWidth: '200px'
    }}
  >
    <div>FPS: {metrics.fps.toFixed(1)}</div>
    <div>Frame Time: {metrics.averageFrameTime.toFixed(2)}ms</div>
    <div>Memory: {metrics.memoryUsage.toFixed(1)}MB</div>
    <div>Rendered: {metrics.renderedItems}/{metrics.totalItems}</div>
  </div>
);

export default VirtualScrolling;