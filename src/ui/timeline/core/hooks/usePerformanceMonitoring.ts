/**
 * Performance Monitoring Hook
 * Tracks FPS, frame times, memory usage, and scroll performance
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PerformanceMetrics, PerformanceMonitor, UsePerformanceMonitoring } from '../types';

// =============================================================================
// PERFORMANCE MONITOR IMPLEMENTATION
// =============================================================================

class TimelinePerformanceMonitor implements PerformanceMonitor {
  private isMonitoring = false;
  private frameCount = 0;
  private frameTimes: number[] = [];
  private lastFrameTime = 0;
  private scrollEvents = 0;
  private startTime = 0;
  private memoryUsage = 0;
  private animationFrameId: number | null = null;
  private memoryUpdateInterval: NodeJS.Timeout | null = null;

  start(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.startTime = performance.now();
    this.frameCount = 0;
    this.frameTimes = [];
    this.scrollEvents = 0;

    // Start frame monitoring
    this.startFrameMonitoring();

    // Start memory monitoring
    this.startMemoryMonitoring();
  }

  stop(): void {
    this.isMonitoring = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.memoryUpdateInterval) {
      clearInterval(this.memoryUpdateInterval);
      this.memoryUpdateInterval = null;
    }
  }

  getMetrics(): PerformanceMetrics {
    const now = performance.now();
    const totalTime = (now - this.startTime) / 1000; // Convert to seconds
    const fps = totalTime > 0 ? this.frameCount / totalTime : 0;
    
    const averageFrameTime = this.frameTimes.length > 0
      ? this.frameTimes.reduce((sum, time) => sum + time, 0) / this.frameTimes.length
      : 0;

    const scrollEventsPerSecond = totalTime > 0 ? this.scrollEvents / totalTime : 0;

    return {
      fps: Math.round(fps),
      averageFrameTime: parseFloat(averageFrameTime.toFixed(2)),
      memoryUsage: parseFloat(this.memoryUsage.toFixed(2)),
      renderedItems: 0, // Will be set by the component
      totalItems: 0, // Will be set by the component
      scrollEventsPerSecond: parseFloat(scrollEventsPerSecond.toFixed(2)),
      timestamp: now
    };
  }

  recordFrameTime(frameTime: number): void {
    if (!this.isMonitoring) return;

    this.frameTimes.push(frameTime);
    
    // Keep only the last 60 frame times for rolling average
    if (this.frameTimes.length > 60) {
      this.frameTimes.shift();
    }
  }

  updateMemoryUsage(usage: number): void {
    this.memoryUsage = usage;
  }

  recordScrollEvent(): void {
    if (this.isMonitoring) {
      this.scrollEvents++;
    }
  }

  private startFrameMonitoring(): void {
    const measureFrame = (currentTime: number) => {
      if (!this.isMonitoring) return;

      if (this.lastFrameTime > 0) {
        const frameTime = currentTime - this.lastFrameTime;
        this.recordFrameTime(frameTime);
      }

      this.lastFrameTime = currentTime;
      this.frameCount++;

      this.animationFrameId = requestAnimationFrame(measureFrame);
    };

    this.animationFrameId = requestAnimationFrame(measureFrame);
  }

  private startMemoryMonitoring(): void {
    const updateMemory = () => {
      if (!this.isMonitoring) return;

      // Use Performance Memory API if available
      if ('memory' in performance && (performance as any).memory) {
        const memInfo = (performance as any).memory;
        const usedMB = memInfo.usedJSHeapSize / (1024 * 1024);
        this.updateMemoryUsage(usedMB);
      }
    };

    // Update memory usage every second
    this.memoryUpdateInterval = setInterval(updateMemory, 1000);
    updateMemory(); // Initial measurement
  }
}

// =============================================================================
// PERFORMANCE MONITORING HOOK
// =============================================================================

export function usePerformanceMonitoring(): UsePerformanceMonitoring {
  const monitorRef = useRef<TimelinePerformanceMonitor | null>(null);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    averageFrameTime: 0,
    memoryUsage: 0,
    renderedItems: 0,
    totalItems: 0,
    scrollEventsPerSecond: 0,
    timestamp: 0
  });
  const [isMonitoring, setIsMonitoring] = useState(false);
  const metricsUpdateInterval = useRef<NodeJS.Timeout | null>(null);

  // Initialize monitor
  useEffect(() => {
    monitorRef.current = new TimelinePerformanceMonitor();
    return () => {
      if (monitorRef.current) {
        monitorRef.current.stop();
      }
    };
  }, []);

  const startMonitoring = useCallback(() => {
    if (!monitorRef.current || isMonitoring) return;

    monitorRef.current.start();
    setIsMonitoring(true);

    // Update metrics every 100ms for responsive UI
    metricsUpdateInterval.current = setInterval(() => {
      if (monitorRef.current) {
        setMetrics(monitorRef.current.getMetrics());
      }
    }, 100);
  }, [isMonitoring]);

  const stopMonitoring = useCallback(() => {
    if (!monitorRef.current || !isMonitoring) return;

    monitorRef.current.stop();
    setIsMonitoring(false);

    if (metricsUpdateInterval.current) {
      clearInterval(metricsUpdateInterval.current);
      metricsUpdateInterval.current = null;
    }
  }, [isMonitoring]);

  const recordFrame = useCallback(() => {
    if (monitorRef.current) {
      const currentTime = performance.now();
      // Frame time will be calculated in the next frame
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (metricsUpdateInterval.current) {
        clearInterval(metricsUpdateInterval.current);
      }
    };
  }, []);

  return {
    metrics,
    startMonitoring,
    stopMonitoring,
    recordFrame,
    isMonitoring
  };
}

// =============================================================================
// PERFORMANCE UTILITIES
// =============================================================================

/**
 * Hook for measuring component render time
 */
export function useRenderTime(componentName: string, enabled = false) {
  const renderStartTime = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    renderStartTime.current = performance.now();
  });

  useEffect(() => {
    if (!enabled) return;

    const renderTime = performance.now() - renderStartTime.current;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`${componentName} render time: ${renderTime.toFixed(2)}ms`);
    }
  });
}

/**
 * Hook for measuring effect execution time
 */
export function useEffectTime(effectName: string, deps: any[], enabled = false) {
  useEffect(() => {
    if (!enabled) return;

    const startTime = performance.now();
    
    return () => {
      const executionTime = performance.now() - startTime;
      if (process.env.NODE_ENV === 'development') {
        console.log(`${effectName} execution time: ${executionTime.toFixed(2)}ms`);
      }
    };
  }, deps);
}

/**
 * Hook for monitoring scroll performance
 */
export function useScrollPerformance() {
  const scrollMetrics = useRef({
    scrollEvents: 0,
    lastScrollTime: 0,
    scrollVelocity: 0,
    averageScrollTime: 0,
    scrollTimes: [] as number[]
  });

  const recordScrollEvent = useCallback((scrollTop: number) => {
    const now = performance.now();
    const metrics = scrollMetrics.current;
    
    if (metrics.lastScrollTime > 0) {
      const scrollTime = now - metrics.lastScrollTime;
      metrics.scrollTimes.push(scrollTime);
      
      // Keep only last 30 scroll times for rolling average
      if (metrics.scrollTimes.length > 30) {
        metrics.scrollTimes.shift();
      }
      
      // Calculate average scroll time
      metrics.averageScrollTime = metrics.scrollTimes.reduce((sum, time) => sum + time, 0) / metrics.scrollTimes.length;
    }
    
    metrics.scrollEvents++;
    metrics.lastScrollTime = now;
  }, []);

  const getScrollMetrics = useCallback(() => {
    return { ...scrollMetrics.current };
  }, []);

  const resetScrollMetrics = useCallback(() => {
    scrollMetrics.current = {
      scrollEvents: 0,
      lastScrollTime: 0,
      scrollVelocity: 0,
      averageScrollTime: 0,
      scrollTimes: []
    };
  }, []);

  return {
    recordScrollEvent,
    getScrollMetrics,
    resetScrollMetrics
  };
}