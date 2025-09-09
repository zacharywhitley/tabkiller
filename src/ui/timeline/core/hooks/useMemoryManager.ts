/**
 * Memory Management Hook
 * Handles memory cleanup and optimization for timeline components
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MemoryManager } from '../types';
import { TimelineMemoryManager } from '../PerformanceOptimization';

// =============================================================================
// MEMORY MANAGER HOOK
// =============================================================================

interface UseMemoryManagerConfig {
  maxItems: number;
  maxMemoryMB: number;
  cleanupInterval?: number;
  enableAutoCleanup?: boolean;
}

interface UseMemoryManagerReturn {
  memoryUsage: number;
  itemCount: number;
  isMemoryLimitReached: () => boolean;
  cleanup: () => void;
  trackItem: (item: object) => void;
  untrackItem: (item: object) => void;
  forceGarbageCollection: () => void;
  getMemoryStats: () => {
    usage: number;
    limit: number;
    itemCount: number;
    utilizationPercentage: number;
  };
}

export function useMemoryManager(config: UseMemoryManagerConfig): UseMemoryManagerReturn {
  const {
    maxItems,
    maxMemoryMB,
    cleanupInterval = 30000, // 30 seconds
    enableAutoCleanup = true
  } = config;

  const managerRef = useRef<TimelineMemoryManager | null>(null);
  const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [memoryUsage, setMemoryUsage] = useState(0);
  const [itemCount, setItemCount] = useState(0);

  // Initialize memory manager
  useEffect(() => {
    managerRef.current = new TimelineMemoryManager(maxItems, maxMemoryMB);
    
    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, [maxItems, maxMemoryMB]);

  // Setup automatic cleanup
  useEffect(() => {
    if (!enableAutoCleanup) return;

    cleanupIntervalRef.current = setInterval(() => {
      if (managerRef.current) {
        managerRef.current.cleanup();
        updateMemoryStats();
      }
    }, cleanupInterval);

    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, [enableAutoCleanup, cleanupInterval]);

  const updateMemoryStats = useCallback(() => {
    if (managerRef.current) {
      setMemoryUsage(managerRef.current.currentUsage);
    }
  }, []);

  const isMemoryLimitReached = useCallback(() => {
    return managerRef.current ? managerRef.current.isMemoryLimitReached() : false;
  }, []);

  const cleanup = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.cleanup();
      updateMemoryStats();
    }
  }, [updateMemoryStats]);

  const trackItem = useCallback((item: object) => {
    if (managerRef.current) {
      managerRef.current.trackItem(item);
      setItemCount(prev => prev + 1);
      updateMemoryStats();
    }
  }, [updateMemoryStats]);

  const untrackItem = useCallback((item: object) => {
    if (managerRef.current) {
      managerRef.current.untrackItem(item);
      setItemCount(prev => Math.max(0, prev - 1));
      updateMemoryStats();
    }
  }, [updateMemoryStats]);

  const forceGarbageCollection = useCallback(() => {
    // Force garbage collection if available (Chrome DevTools)
    if (typeof (window as any).gc === 'function') {
      (window as any).gc();
    }
    
    // Manual cleanup
    cleanup();
  }, [cleanup]);

  const getMemoryStats = useCallback(() => {
    const usage = managerRef.current?.currentUsage ?? 0;
    const limit = managerRef.current?.maxMemoryMB ?? maxMemoryMB;
    
    return {
      usage,
      limit,
      itemCount,
      utilizationPercentage: limit > 0 ? (usage / limit) * 100 : 0
    };
  }, [maxMemoryMB, itemCount]);

  return {
    memoryUsage,
    itemCount,
    isMemoryLimitReached,
    cleanup,
    trackItem,
    untrackItem,
    forceGarbageCollection,
    getMemoryStats
  };
}

// =============================================================================
// MEMORY MONITORING HOOKS
// =============================================================================

/**
 * Hook for monitoring browser memory usage
 */
export function useBrowserMemoryMonitoring(interval = 5000) {
  const [memoryInfo, setMemoryInfo] = useState<{
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
    available: boolean;
  }>({
    usedJSHeapSize: 0,
    totalJSHeapSize: 0,
    jsHeapSizeLimit: 0,
    available: false
  });

  useEffect(() => {
    const updateMemoryInfo = () => {
      if ('memory' in performance && (performance as any).memory) {
        const memory = (performance as any).memory;
        setMemoryInfo({
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
          available: true
        });
      } else {
        setMemoryInfo(prev => ({ ...prev, available: false }));
      }
    };

    updateMemoryInfo();
    const intervalId = setInterval(updateMemoryInfo, interval);

    return () => clearInterval(intervalId);
  }, [interval]);

  return memoryInfo;
}

/**
 * Hook for object memory tracking
 */
export function useObjectMemoryTracking<T extends object>() {
  const trackedObjects = useRef(new WeakSet<T>());
  const memoryEstimates = useRef(new WeakMap<T, number>());

  const trackObject = useCallback((obj: T): number => {
    if (trackedObjects.current.has(obj)) {
      return memoryEstimates.current.get(obj) ?? 0;
    }

    // Estimate memory usage
    const estimate = estimateObjectSize(obj);
    trackedObjects.current.add(obj);
    memoryEstimates.current.set(obj, estimate);

    return estimate;
  }, []);

  const untrackObject = useCallback((obj: T) => {
    trackedObjects.current.delete(obj);
    memoryEstimates.current.delete(obj);
  }, []);

  const getObjectSize = useCallback((obj: T): number => {
    return memoryEstimates.current.get(obj) ?? 0;
  }, []);

  return {
    trackObject,
    untrackObject,
    getObjectSize
  };
}

/**
 * Hook for memory leak detection
 */
export function useMemoryLeakDetection(threshold = 100) {
  const objectCounts = useRef(new Map<string, number>());
  const [potentialLeaks, setPotentialLeaks] = useState<string[]>([]);

  const trackObjectType = useCallback((type: string) => {
    const currentCount = objectCounts.current.get(type) ?? 0;
    objectCounts.current.set(type, currentCount + 1);

    // Check for potential leaks
    if (currentCount > threshold) {
      setPotentialLeaks(prev => 
        prev.includes(type) ? prev : [...prev, type]
      );
    }
  }, [threshold]);

  const untrackObjectType = useCallback((type: string) => {
    const currentCount = objectCounts.current.get(type) ?? 0;
    if (currentCount > 0) {
      objectCounts.current.set(type, currentCount - 1);
    }

    // Remove from potential leaks if count drops
    if (currentCount <= threshold) {
      setPotentialLeaks(prev => prev.filter(leak => leak !== type));
    }
  }, [threshold]);

  const getObjectCounts = useCallback(() => {
    return new Map(objectCounts.current);
  }, []);

  const clearLeakDetection = useCallback(() => {
    objectCounts.current.clear();
    setPotentialLeaks([]);
  }, []);

  return {
    trackObjectType,
    untrackObjectType,
    potentialLeaks,
    getObjectCounts,
    clearLeakDetection
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Estimate memory usage of an object
 */
function estimateObjectSize(obj: any): number {
  const seen = new WeakSet();
  
  function calculateSize(value: any): number {
    if (value === null || value === undefined) {
      return 0;
    }
    
    if (typeof value === 'boolean') {
      return 4;
    }
    
    if (typeof value === 'number') {
      return 8;
    }
    
    if (typeof value === 'string') {
      return value.length * 2; // Assuming UTF-16
    }
    
    if (typeof value === 'object') {
      if (seen.has(value)) {
        return 0; // Avoid circular references
      }
      seen.add(value);
      
      let size = 0;
      
      if (Array.isArray(value)) {
        size += 24; // Array overhead
        for (const item of value) {
          size += calculateSize(item);
        }
      } else {
        size += 24; // Object overhead
        for (const key in value) {
          if (value.hasOwnProperty(key)) {
            size += key.length * 2; // Key string
            size += calculateSize(value[key]);
          }
        }
      }
      
      return size;
    }
    
    return 8; // Function, symbol, etc.
  }
  
  return calculateSize(obj);
}

/**
 * Check if memory pressure is high
 */
export function checkMemoryPressure(): boolean {
  if ('memory' in performance && (performance as any).memory) {
    const memory = (performance as any).memory;
    const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
    return usageRatio > 0.8; // Consider high if using more than 80% of heap
  }
  
  return false;
}

/**
 * Get memory usage in MB
 */
export function getMemoryUsageMB(): number {
  if ('memory' in performance && (performance as any).memory) {
    const memory = (performance as any).memory;
    return memory.usedJSHeapSize / (1024 * 1024);
  }
  
  return 0;
}