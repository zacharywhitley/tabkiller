/**
 * Performance monitoring and metrics collection system
 * Tracks startup time, query performance, memory usage, and CPU utilization
 */

export interface PerformanceMetrics {
  startupTime: number;
  queryResponseTimes: number[];
  memoryUsage: MemoryInfo;
  cpuUtilization: number;
  syncDuration: number;
  eventProcessingTimes: number[];
  backgroundTaskDuration: number[];
}

export interface PerformanceIssue {
  type: 'memory' | 'query' | 'cpu' | 'startup' | 'sync';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  metrics: Partial<PerformanceMetrics>;
  recommendations?: string[];
}

export interface OptimizedQuery {
  originalQuery: string;
  optimizedQuery: string;
  estimatedImprovement: number;
  indexSuggestions: string[];
}

/**
 * Core performance monitoring class
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private startTime: number;
  private queryTimes: Map<string, number> = new Map();
  private eventProcessingStarts: Map<string, number> = new Map();
  private backgroundTaskStarts: Map<string, number> = new Map();
  private memoryCheckInterval?: ReturnType<typeof setInterval>;
  private cpuCheckInterval?: ReturnType<typeof setInterval>;
  private issues: PerformanceIssue[] = [];

  // Performance benchmarks from requirements
  private readonly BENCHMARKS = {
    MAX_STARTUP_TIME: 100, // ms
    MAX_QUERY_TIME: 50, // ms
    MAX_MEMORY_USAGE: 50 * 1024 * 1024, // 50MB
    MAX_CPU_UTILIZATION: 5, // 5%
    MAX_SYNC_DURATION: 5000 // 5 seconds
  };

  constructor() {
    this.startTime = Date.now();
    this.metrics = {
      startupTime: 0,
      queryResponseTimes: [],
      memoryUsage: this.getMemoryInfo(),
      cpuUtilization: 0,
      syncDuration: 0,
      eventProcessingTimes: [],
      backgroundTaskDuration: []
    };

    this.startBackgroundMonitoring();
  }

  /**
   * Initialize performance monitoring
   */
  async initialize(): Promise<void> {
    const initStartTime = performance.now();
    
    try {
      // Record startup time
      this.metrics.startupTime = Date.now() - this.startTime;
      
      // Check if startup time meets benchmark
      if (this.metrics.startupTime > this.BENCHMARKS.MAX_STARTUP_TIME) {
        this.reportIssue({
          type: 'startup',
          severity: 'high',
          message: `Startup time ${this.metrics.startupTime}ms exceeds benchmark of ${this.BENCHMARKS.MAX_STARTUP_TIME}ms`,
          timestamp: Date.now(),
          metrics: { startupTime: this.metrics.startupTime },
          recommendations: [
            'Consider lazy loading of non-critical components',
            'Optimize database initialization',
            'Reduce blocking operations during startup'
          ]
        });
      }

      console.log(`PerformanceMonitor initialized in ${performance.now() - initStartTime}ms`);
    } catch (error) {
      console.error('Failed to initialize PerformanceMonitor:', error);
    }
  }

  /**
   * Start timing a query operation
   */
  startQuery(queryId: string): void {
    this.queryTimes.set(queryId, performance.now());
  }

  /**
   * End timing a query operation and record metrics
   */
  endQuery(queryId: string): number {
    const startTime = this.queryTimes.get(queryId);
    if (!startTime) return 0;

    const duration = performance.now() - startTime;
    this.queryTimes.delete(queryId);
    this.metrics.queryResponseTimes.push(duration);

    // Keep only recent 1000 query times for memory efficiency
    if (this.metrics.queryResponseTimes.length > 1000) {
      this.metrics.queryResponseTimes = this.metrics.queryResponseTimes.slice(-500);
    }

    // Check if query time meets benchmark
    if (duration > this.BENCHMARKS.MAX_QUERY_TIME) {
      this.reportIssue({
        type: 'query',
        severity: duration > this.BENCHMARKS.MAX_QUERY_TIME * 2 ? 'high' : 'medium',
        message: `Query ${queryId} took ${duration.toFixed(2)}ms, exceeds benchmark of ${this.BENCHMARKS.MAX_QUERY_TIME}ms`,
        timestamp: Date.now(),
        metrics: { queryResponseTimes: [duration] },
        recommendations: [
          'Add appropriate database indexes',
          'Consider query result caching',
          'Optimize query structure',
          'Implement query batching'
        ]
      });
    }

    return duration;
  }

  /**
   * Start timing an event processing operation
   */
  startEventProcessing(eventId: string): void {
    this.eventProcessingStarts.set(eventId, performance.now());
  }

  /**
   * End timing an event processing operation
   */
  endEventProcessing(eventId: string): number {
    const startTime = this.eventProcessingStarts.get(eventId);
    if (!startTime) return 0;

    const duration = performance.now() - startTime;
    this.eventProcessingStarts.delete(eventId);
    this.metrics.eventProcessingTimes.push(duration);

    // Keep only recent 500 event processing times
    if (this.metrics.eventProcessingTimes.length > 500) {
      this.metrics.eventProcessingTimes = this.metrics.eventProcessingTimes.slice(-250);
    }

    return duration;
  }

  /**
   * Start timing a background task
   */
  startBackgroundTask(taskId: string): void {
    this.backgroundTaskStarts.set(taskId, performance.now());
  }

  /**
   * End timing a background task
   */
  endBackgroundTask(taskId: string): number {
    const startTime = this.backgroundTaskStarts.get(taskId);
    if (!startTime) return 0;

    const duration = performance.now() - startTime;
    this.backgroundTaskStarts.delete(taskId);
    this.metrics.backgroundTaskDuration.push(duration);

    // Keep only recent 200 background task times
    if (this.metrics.backgroundTaskDuration.length > 200) {
      this.metrics.backgroundTaskDuration = this.metrics.backgroundTaskDuration.slice(-100);
    }

    return duration;
  }

  /**
   * Record sync operation duration
   */
  recordSyncDuration(duration: number): void {
    this.metrics.syncDuration = duration;

    if (duration > this.BENCHMARKS.MAX_SYNC_DURATION) {
      this.reportIssue({
        type: 'sync',
        severity: 'medium',
        message: `Sync duration ${duration}ms exceeds benchmark of ${this.BENCHMARKS.MAX_SYNC_DURATION}ms`,
        timestamp: Date.now(),
        metrics: { syncDuration: duration },
        recommendations: [
          'Implement incremental sync',
          'Optimize data serialization',
          'Use compression for sync data',
          'Batch sync operations'
        ]
      });
    }
  }

  /**
   * Collect current performance metrics
   */
  collectMetrics(): PerformanceMetrics {
    this.metrics.memoryUsage = this.getMemoryInfo();
    return { ...this.metrics };
  }

  /**
   * Identify performance bottlenecks
   */
  identifyBottlenecks(): PerformanceIssue[] {
    const currentIssues: PerformanceIssue[] = [...this.issues];
    
    // Check current memory usage
    const memoryUsage = this.getMemoryUsage();
    if (memoryUsage > this.BENCHMARKS.MAX_MEMORY_USAGE) {
      currentIssues.push({
        type: 'memory',
        severity: memoryUsage > this.BENCHMARKS.MAX_MEMORY_USAGE * 1.5 ? 'high' : 'medium',
        message: `Memory usage ${(memoryUsage / 1024 / 1024).toFixed(1)}MB exceeds benchmark of ${this.BENCHMARKS.MAX_MEMORY_USAGE / 1024 / 1024}MB`,
        timestamp: Date.now(),
        metrics: { memoryUsage: this.metrics.memoryUsage },
        recommendations: [
          'Implement proper event listener cleanup',
          'Use WeakMap/WeakSet for temporary references',
          'Clear unused caches',
          'Optimize large object storage'
        ]
      });
    }

    // Check query performance trends
    const recentQueries = this.metrics.queryResponseTimes.slice(-100);
    if (recentQueries.length > 0) {
      const avgQueryTime = recentQueries.reduce((a, b) => a + b, 0) / recentQueries.length;
      const slowQueryCount = recentQueries.filter(time => time > this.BENCHMARKS.MAX_QUERY_TIME).length;
      
      if (slowQueryCount > recentQueries.length * 0.1) { // More than 10% of queries are slow
        currentIssues.push({
          type: 'query',
          severity: 'medium',
          message: `${((slowQueryCount / recentQueries.length) * 100).toFixed(1)}% of recent queries exceed performance benchmark`,
          timestamp: Date.now(),
          metrics: { queryResponseTimes: recentQueries },
          recommendations: [
            'Review and optimize slow queries',
            'Implement query result caching',
            'Add database indexes',
            'Consider query result pagination'
          ]
        });
      }
    }

    return currentIssues;
  }

  /**
   * Optimize queries based on performance data
   */
  optimizeQueries(queries: string[]): OptimizedQuery[] {
    // This is a simplified implementation
    // Real implementation would analyze actual query patterns
    return queries.map(query => ({
      originalQuery: query,
      optimizedQuery: this.optimizeQuery(query),
      estimatedImprovement: 20, // Percentage improvement estimate
      indexSuggestions: this.suggestIndexes(query)
    }));
  }

  /**
   * Get performance summary for dashboard
   */
  getPerformanceSummary(): {
    status: 'good' | 'warning' | 'critical';
    metrics: PerformanceMetrics;
    issues: PerformanceIssue[];
    recommendations: string[];
  } {
    const metrics = this.collectMetrics();
    const issues = this.identifyBottlenecks();
    
    let status: 'good' | 'warning' | 'critical' = 'good';
    if (issues.some(issue => issue.severity === 'critical')) {
      status = 'critical';
    } else if (issues.some(issue => issue.severity === 'high' || issue.severity === 'medium')) {
      status = 'warning';
    }

    const recommendations = issues.reduce((acc: string[], issue) => {
      if (issue.recommendations) {
        acc.push(...issue.recommendations);
      }
      return acc;
    }, []);

    return {
      status,
      metrics,
      issues: issues.slice(0, 10), // Return only top 10 issues
      recommendations: [...new Set(recommendations)].slice(0, 5) // Remove duplicates, top 5
    };
  }

  /**
   * Start background monitoring
   */
  private startBackgroundMonitoring(): void {
    // Monitor memory usage every 30 seconds
    this.memoryCheckInterval = setInterval(() => {
      this.metrics.memoryUsage = this.getMemoryInfo();
    }, 30000);

    // Simulate CPU monitoring (actual implementation would use platform-specific APIs)
    this.cpuCheckInterval = setInterval(() => {
      this.metrics.cpuUtilization = this.estimateCPUUtilization();
    }, 10000);
  }

  /**
   * Stop background monitoring
   */
  stopMonitoring(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
    }
    if (this.cpuCheckInterval) {
      clearInterval(this.cpuCheckInterval);
    }
  }

  /**
   * Get memory information
   */
  private getMemoryInfo(): MemoryInfo {
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      };
    }
    
    // Fallback for environments without performance.memory
    return {
      usedJSHeapSize: 0,
      totalJSHeapSize: 0,
      jsHeapSizeLimit: 0
    };
  }

  /**
   * Get current memory usage in bytes
   */
  private getMemoryUsage(): number {
    const memInfo = this.getMemoryInfo();
    return memInfo.usedJSHeapSize || 0;
  }

  /**
   * Estimate CPU utilization (simplified implementation)
   */
  private estimateCPUUtilization(): number {
    // This is a simplified estimation
    // Real implementation would need platform-specific CPU monitoring
    const recentEventTimes = this.metrics.eventProcessingTimes.slice(-50);
    const recentTaskTimes = this.metrics.backgroundTaskDuration.slice(-20);
    
    if (recentEventTimes.length === 0 && recentTaskTimes.length === 0) {
      return 0;
    }

    const avgEventTime = recentEventTimes.length > 0 
      ? recentEventTimes.reduce((a, b) => a + b, 0) / recentEventTimes.length 
      : 0;
    
    const avgTaskTime = recentTaskTimes.length > 0
      ? recentTaskTimes.reduce((a, b) => a + b, 0) / recentTaskTimes.length
      : 0;

    // Rough estimation based on processing times
    return Math.min(((avgEventTime + avgTaskTime) / 100) * 5, 10);
  }

  /**
   * Report a performance issue
   */
  private reportIssue(issue: PerformanceIssue): void {
    this.issues.push(issue);
    
    // Keep only recent 100 issues
    if (this.issues.length > 100) {
      this.issues = this.issues.slice(-50);
    }

    // Log critical issues immediately
    if (issue.severity === 'critical') {
      console.error('Performance Critical Issue:', issue);
    } else if (issue.severity === 'high') {
      console.warn('Performance Issue:', issue);
    }
  }

  /**
   * Optimize a single query (simplified implementation)
   */
  private optimizeQuery(query: string): string {
    // This is a basic optimization - real implementation would be more sophisticated
    let optimized = query;
    
    // Add common optimizations
    if (query.includes('SELECT') && !query.includes('LIMIT')) {
      optimized += ' LIMIT 100';
    }
    
    return optimized;
  }

  /**
   * Suggest indexes for a query
   */
  private suggestIndexes(query: string): string[] {
    const suggestions: string[] = [];
    
    // Basic index suggestions based on query patterns
    if (query.includes('WHERE')) {
      suggestions.push('Consider adding indexes on WHERE clause columns');
    }
    
    if (query.includes('ORDER BY')) {
      suggestions.push('Consider adding indexes on ORDER BY columns');
    }
    
    if (query.includes('JOIN')) {
      suggestions.push('Consider adding indexes on JOIN columns');
    }

    return suggestions;
  }
}

/**
 * Global performance monitor instance
 */
export const performanceMonitor = new PerformanceMonitor();

/**
 * Performance monitoring decorators and utilities
 */
export function monitorQuery(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;
  
  descriptor.value = async function (...args: any[]) {
    const queryId = `${target.constructor.name}.${propertyName}`;
    performanceMonitor.startQuery(queryId);
    
    try {
      const result = await method.apply(this, args);
      performanceMonitor.endQuery(queryId);
      return result;
    } catch (error) {
      performanceMonitor.endQuery(queryId);
      throw error;
    }
  };
}

export function monitorEvent(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;
  
  descriptor.value = async function (...args: any[]) {
    const eventId = `${target.constructor.name}.${propertyName}`;
    performanceMonitor.startEventProcessing(eventId);
    
    try {
      const result = await method.apply(this, args);
      performanceMonitor.endEventProcessing(eventId);
      return result;
    } catch (error) {
      performanceMonitor.endEventProcessing(eventId);
      throw error;
    }
  };
}