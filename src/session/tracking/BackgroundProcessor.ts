/**
 * Background Processor - Continuous monitoring without performance impact
 * Manages background tasks, performance monitoring, and resource optimization
 */

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface BackgroundTask {
  id: string;
  name: string;
  handler: () => Promise<void>;
  interval: number;
  priority: TaskPriority;
  lastRun: number;
  nextRun: number;
  runCount: number;
  errorCount: number;
  averageRunTime: number;
  enabled: boolean;
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface PerformanceAlert {
  type: PerformanceAlertType;
  value: number;
  threshold: number;
  timestamp: number;
  details?: any;
}

export type PerformanceAlertType = 
  | 'high_memory_usage'
  | 'slow_processing'
  | 'high_error_rate'
  | 'long_task_duration'
  | 'excessive_events'
  | 'resource_leak';

export interface BackgroundProcessorConfig {
  interval: number;
  performanceMonitoring: boolean;
  maxConcurrentTasks?: number;
  memoryThreshold?: number;
  processingTimeThreshold?: number;
  errorRateThreshold?: number;
  enableAdaptiveScheduling?: boolean;
  enableResourceOptimization?: boolean;
}

export interface PerformanceMetrics {
  memoryUsage: number;
  cpuUsage: number;
  taskQueueSize: number;
  averageTaskTime: number;
  errorRate: number;
  uptime: number;
  eventsProcessed: number;
  lastGC?: number;
}

export interface ResourceOptimizationStats {
  memoryOptimizations: number;
  taskOptimizations: number;
  scheduleOptimizations: number;
  resourceReclaims: number;
  performanceImprovements: number;
}

// =============================================================================
// BACKGROUND PROCESSOR
// =============================================================================

export class BackgroundProcessor {
  private config: BackgroundProcessorConfig;
  private tasks = new Map<string, BackgroundTask>();
  private runningTasks = new Set<string>();
  private isRunning: boolean = false;
  private isInitialized: boolean = false;
  
  private processingInterval?: number;
  private monitoringInterval?: number;
  private optimizationInterval?: number;
  
  private startTime = Date.now();
  private metrics: PerformanceMetrics;
  private optimizationStats: ResourceOptimizationStats;
  
  private alertHandlers: Array<(alert: PerformanceAlert) => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];
  
  private lastMemoryCheck = Date.now();
  private lastOptimization = Date.now();
  private performanceHistory: number[] = [];

  constructor(config: BackgroundProcessorConfig) {
    this.config = {
      maxConcurrentTasks: 5,
      memoryThreshold: 100 * 1024 * 1024, // 100MB
      processingTimeThreshold: 1000, // 1 second
      errorRateThreshold: 0.1, // 10%
      enableAdaptiveScheduling: true,
      enableResourceOptimization: true,
      ...config
    };

    // Initialize metrics
    this.metrics = {
      memoryUsage: 0,
      cpuUsage: 0,
      taskQueueSize: 0,
      averageTaskTime: 0,
      errorRate: 0,
      uptime: 0,
      eventsProcessed: 0
    };

    // Initialize optimization stats
    this.optimizationStats = {
      memoryOptimizations: 0,
      taskOptimizations: 0,
      scheduleOptimizations: 0,
      resourceReclaims: 0,
      performanceImprovements: 0
    };
  }

  /**
   * Initialize background processor
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Initializing BackgroundProcessor...');

      // Register default tasks
      this.registerDefaultTasks();

      // Update initial metrics
      await this.updateMetrics();

      this.isInitialized = true;
      console.log('BackgroundProcessor initialized successfully');

    } catch (error) {
      console.error('Failed to initialize BackgroundProcessor:', error);
      throw error;
    }
  }

  /**
   * Register default background tasks
   */
  private registerDefaultTasks(): void {
    // Performance monitoring task
    this.registerTask('performance_monitoring', {
      name: 'Performance Monitoring',
      handler: this.monitorPerformance.bind(this),
      interval: 5000, // 5 seconds
      priority: 'high',
      enabled: this.config.performanceMonitoring
    });

    // Memory optimization task
    this.registerTask('memory_optimization', {
      name: 'Memory Optimization',
      handler: this.optimizeMemory.bind(this),
      interval: 60000, // 1 minute
      priority: 'medium',
      enabled: this.config.enableResourceOptimization
    });

    // Task queue optimization
    this.registerTask('task_optimization', {
      name: 'Task Queue Optimization',
      handler: this.optimizeTaskSchedule.bind(this),
      interval: 30000, // 30 seconds
      priority: 'low',
      enabled: this.config.enableAdaptiveScheduling
    });

    // Resource leak detection
    this.registerTask('leak_detection', {
      name: 'Resource Leak Detection',
      handler: this.detectResourceLeaks.bind(this),
      interval: 120000, // 2 minutes
      priority: 'medium',
      enabled: this.config.enableResourceOptimization
    });

    // Metrics collection
    this.registerTask('metrics_collection', {
      name: 'Metrics Collection',
      handler: this.collectMetrics.bind(this),
      interval: 10000, // 10 seconds
      priority: 'high',
      enabled: true
    });
  }

  /**
   * Start background processing
   */
  async start(customTaskHandler?: () => Promise<void>): Promise<void> {
    if (this.isRunning) return;

    try {
      console.log('Starting BackgroundProcessor...');

      // Register custom task handler if provided
      if (customTaskHandler) {
        this.registerTask('custom_handler', {
          name: 'Custom Task Handler',
          handler: customTaskHandler,
          interval: this.config.interval,
          priority: 'medium',
          enabled: true
        });
      }

      this.isRunning = true;

      // Start main processing loop
      this.processingInterval = window.setInterval(
        this.processTaskQueue.bind(this),
        this.config.interval
      );

      console.log('BackgroundProcessor started successfully');

    } catch (error) {
      console.error('Failed to start BackgroundProcessor:', error);
      throw error;
    }
  }

  /**
   * Register a new background task
   */
  registerTask(taskId: string, options: {
    name: string;
    handler: () => Promise<void>;
    interval: number;
    priority: TaskPriority;
    enabled?: boolean;
  }): void {
    const now = Date.now();
    
    const task: BackgroundTask = {
      id: taskId,
      name: options.name,
      handler: options.handler,
      interval: options.interval,
      priority: options.priority,
      lastRun: 0,
      nextRun: now + options.interval,
      runCount: 0,
      errorCount: 0,
      averageRunTime: 0,
      enabled: options.enabled !== false
    };

    this.tasks.set(taskId, task);
    console.log(`Registered background task: ${options.name}`);
  }

  /**
   * Process task queue
   */
  private async processTaskQueue(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const now = Date.now();
      const tasksToRun: BackgroundTask[] = [];

      // Find tasks ready to run
      for (const task of this.tasks.values()) {
        if (task.enabled && task.nextRun <= now && !this.runningTasks.has(task.id)) {
          tasksToRun.push(task);
        }
      }

      // Sort by priority and next run time
      tasksToRun.sort((a, b) => {
        const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        return priorityDiff !== 0 ? priorityDiff : a.nextRun - b.nextRun;
      });

      // Run tasks (respecting concurrency limit)
      const availableSlots = Math.max(0, this.config.maxConcurrentTasks! - this.runningTasks.size);
      const tasksToExecute = tasksToRun.slice(0, availableSlots);

      for (const task of tasksToExecute) {
        this.executeTask(task).catch(error => {
          console.error(`Error executing task ${task.name}:`, error);
          this.notifyErrorHandlers(error);
        });
      }

      // Update queue size metric
      this.metrics.taskQueueSize = tasksToRun.length;

    } catch (error) {
      console.error('Error processing task queue:', error);
      this.notifyErrorHandlers(error as Error);
    }
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: BackgroundTask): Promise<void> {
    const startTime = performance.now();
    this.runningTasks.add(task.id);

    try {
      await task.handler();

      // Update task statistics
      const runTime = performance.now() - startTime;
      task.lastRun = Date.now();
      task.runCount++;
      
      // Update average run time
      const totalTime = task.averageRunTime * (task.runCount - 1) + runTime;
      task.averageRunTime = totalTime / task.runCount;

      // Schedule next run
      task.nextRun = task.lastRun + task.interval;

      // Adaptive scheduling based on performance
      if (this.config.enableAdaptiveScheduling) {
        this.adaptTaskSchedule(task, runTime);
      }

      // Check for performance alerts
      if (runTime > this.config.processingTimeThreshold!) {
        this.emitPerformanceAlert('long_task_duration', runTime, this.config.processingTimeThreshold!, {
          taskId: task.id,
          taskName: task.name
        });
      }

    } catch (error) {
      task.errorCount++;
      console.error(`Task ${task.name} failed:`, error);

      // Update error rate
      const errorRate = task.errorCount / Math.max(task.runCount, 1);
      if (errorRate > this.config.errorRateThreshold!) {
        this.emitPerformanceAlert('high_error_rate', errorRate, this.config.errorRateThreshold!, {
          taskId: task.id,
          taskName: task.name
        });
      }

      // Schedule retry with backoff
      const backoffMultiplier = Math.min(task.errorCount, 5);
      task.nextRun = Date.now() + (task.interval * backoffMultiplier);

    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  /**
   * Adapt task schedule based on performance
   */
  private adaptTaskSchedule(task: BackgroundTask, runTime: number): void {
    const targetRunTime = this.config.processingTimeThreshold! * 0.5;

    if (runTime > targetRunTime && task.interval < 300000) { // Max 5 minutes
      // Slow performance, increase interval
      task.interval = Math.min(task.interval * 1.2, 300000);
      this.optimizationStats.scheduleOptimizations++;
    } else if (runTime < targetRunTime * 0.5 && task.interval > 1000) { // Min 1 second
      // Fast performance, decrease interval
      task.interval = Math.max(task.interval * 0.9, 1000);
      this.optimizationStats.scheduleOptimizations++;
    }
  }

  /**
   * Monitor performance metrics
   */
  private async monitorPerformance(): Promise<void> {
    await this.updateMetrics();

    // Check memory usage
    if (this.metrics.memoryUsage > this.config.memoryThreshold!) {
      this.emitPerformanceAlert('high_memory_usage', this.metrics.memoryUsage, this.config.memoryThreshold!);
    }

    // Check processing time
    if (this.metrics.averageTaskTime > this.config.processingTimeThreshold!) {
      this.emitPerformanceAlert('slow_processing', this.metrics.averageTaskTime, this.config.processingTimeThreshold!);
    }

    // Check error rate
    if (this.metrics.errorRate > this.config.errorRateThreshold!) {
      this.emitPerformanceAlert('high_error_rate', this.metrics.errorRate, this.config.errorRateThreshold!);
    }

    // Update performance history
    this.performanceHistory.push(this.metrics.averageTaskTime);
    if (this.performanceHistory.length > 100) {
      this.performanceHistory = this.performanceHistory.slice(-50);
    }
  }

  /**
   * Update performance metrics
   */
  private async updateMetrics(): Promise<void> {
    try {
      // Update memory usage
      if ('memory' in performance) {
        this.metrics.memoryUsage = (performance as any).memory.usedJSHeapSize;
      }

      // Update uptime
      this.metrics.uptime = Date.now() - this.startTime;

      // Calculate average task time
      const tasks = Array.from(this.tasks.values());
      const totalTime = tasks.reduce((sum, task) => sum + task.averageRunTime, 0);
      const taskCount = tasks.filter(task => task.runCount > 0).length;
      this.metrics.averageTaskTime = taskCount > 0 ? totalTime / taskCount : 0;

      // Calculate error rate
      const totalRuns = tasks.reduce((sum, task) => sum + task.runCount, 0);
      const totalErrors = tasks.reduce((sum, task) => sum + task.errorCount, 0);
      this.metrics.errorRate = totalRuns > 0 ? totalErrors / totalRuns : 0;

      // Update CPU usage (approximation based on task performance)
      const recentAverage = this.performanceHistory.slice(-10).reduce((a, b) => a + b, 0) / 10;
      this.metrics.cpuUsage = Math.min(recentAverage / 100, 1); // Normalized to 0-1

    } catch (error) {
      console.warn('Error updating performance metrics:', error);
    }
  }

  /**
   * Optimize memory usage
   */
  private async optimizeMemory(): Promise<void> {
    try {
      const beforeMemory = this.metrics.memoryUsage;

      // Clear performance history if it's too large
      if (this.performanceHistory.length > 50) {
        this.performanceHistory = this.performanceHistory.slice(-25);
      }

      // Optimize task data structures
      for (const task of this.tasks.values()) {
        // Reset statistics for long-running tasks to prevent memory buildup
        if (task.runCount > 10000) {
          task.runCount = Math.floor(task.runCount * 0.8);
          task.errorCount = Math.floor(task.errorCount * 0.8);
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        this.metrics.lastGC = Date.now();
      }

      // Update metrics
      await this.updateMetrics();

      const memoryReclaimed = beforeMemory - this.metrics.memoryUsage;
      if (memoryReclaimed > 0) {
        this.optimizationStats.memoryOptimizations++;
        this.optimizationStats.resourceReclaims += memoryReclaimed;
      }

    } catch (error) {
      console.warn('Error optimizing memory:', error);
    }
  }

  /**
   * Optimize task schedule
   */
  private async optimizeTaskSchedule(): Promise<void> {
    try {
      const now = Date.now();
      let optimized = false;

      for (const task of this.tasks.values()) {
        // Disable tasks with consistently high error rates
        if (task.errorCount > 10 && task.errorCount / Math.max(task.runCount, 1) > 0.5) {
          task.enabled = false;
          optimized = true;
          console.warn(`Disabled task ${task.name} due to high error rate`);
        }

        // Adjust intervals for tasks based on their importance and performance
        if (task.priority === 'low' && task.averageRunTime > 500) {
          task.interval = Math.min(task.interval * 1.5, 300000);
          optimized = true;
        }

        // Re-enable disabled tasks after a cooling period
        if (!task.enabled && now - task.lastRun > 300000) { // 5 minutes
          task.enabled = true;
          task.errorCount = 0; // Reset error count
          optimized = true;
          console.log(`Re-enabled task ${task.name} after cooling period`);
        }
      }

      if (optimized) {
        this.optimizationStats.taskOptimizations++;
      }

    } catch (error) {
      console.warn('Error optimizing task schedule:', error);
    }
  }

  /**
   * Detect resource leaks
   */
  private async detectResourceLeaks(): Promise<void> {
    try {
      const now = Date.now();

      // Check for memory leaks
      if (this.performanceHistory.length > 20) {
        const recent = this.performanceHistory.slice(-10);
        const older = this.performanceHistory.slice(-20, -10);
        
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

        if (recentAvg > olderAvg * 1.5) {
          this.emitPerformanceAlert('resource_leak', recentAvg, olderAvg * 1.2, {
            type: 'performance_degradation'
          });
        }
      }

      // Check for stuck tasks
      for (const taskId of this.runningTasks) {
        const task = this.tasks.get(taskId);
        if (task && now - task.lastRun > task.interval * 5) {
          this.emitPerformanceAlert('resource_leak', now - task.lastRun, task.interval * 5, {
            type: 'stuck_task',
            taskId: task.id,
            taskName: task.name
          });
        }
      }

    } catch (error) {
      console.warn('Error detecting resource leaks:', error);
    }
  }

  /**
   * Collect metrics
   */
  private async collectMetrics(): Promise<void> {
    await this.updateMetrics();
    this.metrics.eventsProcessed++;
  }

  /**
   * Emit performance alert
   */
  private emitPerformanceAlert(
    type: PerformanceAlertType,
    value: number,
    threshold: number,
    details?: any
  ): void {
    const alert: PerformanceAlert = {
      type,
      value,
      threshold,
      timestamp: Date.now(),
      details
    };

    for (const handler of this.alertHandlers) {
      try {
        handler(alert);
      } catch (error) {
        console.error('Error in performance alert handler:', error);
      }
    }
  }

  /**
   * Notify error handlers
   */
  private notifyErrorHandlers(error: Error): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch (handlerError) {
        console.error('Error in error handler:', handlerError);
      }
    }
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  /**
   * Register performance alert handler
   */
  onPerformanceAlert(handler: (alert: PerformanceAlert) => void): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Register error handler
   */
  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats(): ResourceOptimizationStats {
    return { ...this.optimizationStats };
  }

  /**
   * Get task information
   */
  getTaskInfo(): Array<Omit<BackgroundTask, 'handler'>> {
    return Array.from(this.tasks.values()).map(task => {
      const { handler, ...taskInfo } = task;
      return taskInfo;
    });
  }

  /**
   * Enable/disable a task
   */
  setTaskEnabled(taskId: string, enabled: boolean): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.enabled = enabled;
    console.log(`Task ${task.name} ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * Update task interval
   */
  updateTaskInterval(taskId: string, interval: number): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.interval = Math.max(interval, 1000); // Minimum 1 second
    task.nextRun = Date.now() + task.interval;
    return true;
  }

  /**
   * Update processing interval
   */
  updateInterval(interval: number): void {
    this.config.interval = Math.max(interval, 100); // Minimum 100ms

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = window.setInterval(
        this.processTaskQueue.bind(this),
        this.config.interval
      );
    }
  }

  /**
   * Force task execution
   */
  async executeTaskNow(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || this.runningTasks.has(taskId)) return false;

    try {
      await this.executeTask(task);
      return true;
    } catch (error) {
      console.error(`Error executing task ${task.name}:`, error);
      return false;
    }
  }

  /**
   * Stop background processing
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      console.log('Stopping BackgroundProcessor...');

      this.isRunning = false;

      // Clear intervals
      if (this.processingInterval) {
        clearInterval(this.processingInterval);
        this.processingInterval = undefined;
      }

      // Wait for running tasks to complete (with timeout)
      const timeout = 10000; // 10 seconds
      const startTime = Date.now();

      while (this.runningTasks.size > 0 && Date.now() - startTime < timeout) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (this.runningTasks.size > 0) {
        console.warn(`${this.runningTasks.size} tasks still running after timeout`);
      }

      console.log('BackgroundProcessor stopped successfully');

    } catch (error) {
      console.error('Error stopping BackgroundProcessor:', error);
    }
  }

  /**
   * Shutdown background processor
   */
  async shutdown(): Promise<void> {
    try {
      console.log('Shutting down BackgroundProcessor...');

      await this.stop();

      // Clear all tasks
      this.tasks.clear();
      this.runningTasks.clear();

      // Clear handlers
      this.alertHandlers = [];
      this.errorHandlers = [];

      this.isInitialized = false;
      console.log('BackgroundProcessor shutdown complete');

    } catch (error) {
      console.error('Error shutting down BackgroundProcessor:', error);
    }
  }
}