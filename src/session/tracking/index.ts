/**
 * Stream B: Tab Lifecycle Tracking Integration
 * Real-time tab event monitoring, navigation history, and background processing
 * Integrates with Stream A's session detection system
 */

export * from './TabLifecycleTracker';
export * from './NavigationHistoryTracker';
export * from './BackgroundProcessor';
export * from './EventDebouncer';
export * from './CrossContextSync';
export * from './SessionDetectionIntegration';

import { TabLifecycleTracker } from './TabLifecycleTracker';
import { NavigationHistoryTracker } from './NavigationHistoryTracker';
import { BackgroundProcessor } from './BackgroundProcessor';
import { EventDebouncer } from './EventDebouncer';
import { CrossContextSync } from './CrossContextSync';
import { SessionDetectionIntegration } from './SessionDetectionIntegration';
import { IntegratedSessionDetection } from '../detection';

import {
  BrowsingEvent,
  TabEvent,
  SessionBoundary,
  TrackingConfig
} from '../../shared/types';

// =============================================================================
// INTEGRATED TAB LIFECYCLE TRACKING SYSTEM
// =============================================================================

export interface TabTrackingConfig extends TrackingConfig {
  // Event debouncing configuration
  debounceTimeout?: number;
  maxQueuedEvents?: number;
  enableRealTimeSync?: boolean;
  
  // Performance optimization
  maxHistoryEntries?: number;
  backgroundProcessingInterval?: number;
  enablePerformanceMonitoring?: boolean;
  
  // Integration settings
  sessionDetectionEnabled?: boolean;
  crossContextSyncEnabled?: boolean;
  enableNavigationHistory?: boolean;
}

export interface TabTrackingMetrics {
  eventsProcessed: number;
  averageProcessingTime: number;
  queuedEvents: number;
  activeTrackers: number;
  memoryUsage: number;
  syncLatency: number;
  errorRate: number;
}

/**
 * Integrated Tab Lifecycle Tracking System
 * Coordinates all Stream B components with Stream A's session detection
 */
export class IntegratedTabLifecycleTracking {
  private tabTracker: TabLifecycleTracker;
  private navigationTracker: NavigationHistoryTracker;
  private backgroundProcessor: BackgroundProcessor;
  private eventDebouncer: EventDebouncer;
  private crossContextSync: CrossContextSync;
  private sessionDetection?: IntegratedSessionDetection;
  private sessionIntegration?: SessionDetectionIntegration;

  private config: TabTrackingConfig;
  private isInitialized: boolean = false;
  private eventQueue: TabEvent[] = [];
  private metrics: TabTrackingMetrics;

  constructor(
    config: TabTrackingConfig,
    sessionDetection?: IntegratedSessionDetection
  ) {
    this.config = {
      // Default configuration values
      debounceTimeout: 100,
      maxQueuedEvents: 1000,
      enableRealTimeSync: true,
      maxHistoryEntries: 10000,
      backgroundProcessingInterval: 1000,
      enablePerformanceMonitoring: true,
      sessionDetectionEnabled: true,
      crossContextSyncEnabled: true,
      enableNavigationHistory: true,
      ...config
    };

    this.sessionDetection = sessionDetection;

    // Initialize metrics
    this.metrics = {
      eventsProcessed: 0,
      averageProcessingTime: 0,
      queuedEvents: 0,
      activeTrackers: 5,
      memoryUsage: 0,
      syncLatency: 0,
      errorRate: 0
    };

    // Initialize components
    this.initializeComponents();
  }

  /**
   * Initialize all tracking components
   */
  private initializeComponents(): void {
    // Event debouncer for high-frequency events
    this.eventDebouncer = new EventDebouncer({
      timeout: this.config.debounceTimeout!,
      maxQueueSize: this.config.maxQueuedEvents!
    });

    // Cross-context synchronization
    this.crossContextSync = new CrossContextSync({
      enabled: this.config.crossContextSyncEnabled!,
      realTimeSync: this.config.enableRealTimeSync!
    });

    // Background processor for continuous monitoring
    this.backgroundProcessor = new BackgroundProcessor({
      interval: this.config.backgroundProcessingInterval!,
      performanceMonitoring: this.config.enablePerformanceMonitoring!
    });

    // Tab lifecycle tracker
    this.tabTracker = new TabLifecycleTracker(
      this.config,
      this.handleTabLifecycleEvent.bind(this)
    );

    // Navigation history tracker
    this.navigationTracker = new NavigationHistoryTracker({
      maxEntries: this.config.maxHistoryEntries!,
      trackFullLifecycle: this.config.enableNavigationHistory!
    });
  }

  /**
   * Initialize the integrated tracking system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Initializing Integrated Tab Lifecycle Tracking System...');

      // Initialize components in order
      await this.eventDebouncer.initialize();
      await this.crossContextSync.initialize();
      await this.backgroundProcessor.initialize();
      await this.tabTracker.initialize();
      await this.navigationTracker.initialize();

      // Initialize session detection integration if session detection is available
      if (this.sessionDetection && this.config.sessionDetectionEnabled) {
        const { SessionDetectionIntegration } = await import('./SessionDetectionIntegration');
        this.sessionIntegration = new SessionDetectionIntegration(
          this.sessionDetection,
          this,
          {
            enableRealTimeBoundaryDetection: true,
            enableSessionContextEnrichment: true,
            enableTabGroupingBySession: true
          }
        );
        await this.sessionIntegration.initialize();
      }

      // Set up component event handlers
      this.setupEventHandlers();

      // Start background processing
      await this.backgroundProcessor.start(this.processBackgroundTasks.bind(this));

      // Process any queued events
      if (this.eventQueue.length > 0) {
        console.log(`Processing ${this.eventQueue.length} queued tab events...`);
        await this.processQueuedEvents();
      }

      this.isInitialized = true;
      console.log('Integrated Tab Lifecycle Tracking System initialized successfully');

    } catch (error) {
      console.error('Failed to initialize tab lifecycle tracking system:', error);
      throw error;
    }
  }

  /**
   * Set up event handlers between components
   */
  private setupEventHandlers(): void {
    // Event debouncer output handler
    this.eventDebouncer.onDebouncedEvent(this.processDebouncedEvent.bind(this));

    // Cross-context sync handlers
    this.crossContextSync.onIncomingSync(this.handleIncomingSyncData.bind(this));
    this.crossContextSync.onSyncError(this.handleSyncError.bind(this));

    // Background processor handlers
    this.backgroundProcessor.onPerformanceAlert(this.handlePerformanceAlert.bind(this));
    this.backgroundProcessor.onError(this.handleBackgroundError.bind(this));
  }

  /**
   * Process tab events through the integrated system
   */
  async processTabEvent(tabEvent: TabEvent): Promise<SessionBoundary | null> {
    if (!this.isInitialized) {
      // Queue events until initialization is complete
      this.eventQueue.push(tabEvent);
      this.metrics.queuedEvents = this.eventQueue.length;
      return null;
    }

    const startTime = performance.now();

    try {
      // Debounce high-frequency events
      const shouldProcess = await this.eventDebouncer.debounceEvent(tabEvent);
      if (!shouldProcess) {
        return null;
      }

      // Process through tab tracker
      await this.tabTracker.processEvent(tabEvent);

      // Update navigation history
      if (this.config.enableNavigationHistory) {
        await this.navigationTracker.processTabEvent(tabEvent);
      }

      // Sync across contexts if enabled
      if (this.config.crossContextSyncEnabled) {
        await this.crossContextSync.syncTabEvent(tabEvent);
      }

      // Check for session boundary with Stream A integration
      let sessionBoundary: SessionBoundary | null = null;
      if (this.sessionDetection && this.config.sessionDetectionEnabled) {
        const browsingEvent = this.convertTabEventToBrowsingEvent(tabEvent);
        sessionBoundary = await this.sessionDetection.processEvent(browsingEvent);
      }

      // Update metrics
      const processingTime = performance.now() - startTime;
      this.updateMetrics(processingTime);

      return sessionBoundary;

    } catch (error) {
      console.error('Error processing tab event:', error);
      this.metrics.errorRate++;
      return null;
    }
  }

  /**
   * Handle tab lifecycle events from TabLifecycleTracker
   */
  private async handleTabLifecycleEvent(event: BrowsingEvent): Promise<void> {
    try {
      // Forward to session detection if available
      if (this.sessionDetection && this.config.sessionDetectionEnabled) {
        await this.sessionDetection.processEvent(event);
      }

      // Update navigation history
      if (this.config.enableNavigationHistory) {
        await this.navigationTracker.recordBrowsingEvent(event);
      }

    } catch (error) {
      console.error('Error handling tab lifecycle event:', error);
    }
  }

  /**
   * Process debounced events
   */
  private async processDebouncedEvent(events: TabEvent[]): Promise<void> {
    for (const event of events) {
      await this.tabTracker.processEvent(event);
    }
  }

  /**
   * Handle incoming synchronization data
   */
  private async handleIncomingSyncData(data: any): Promise<void> {
    try {
      // Process synced tab events or state updates
      if (data.type === 'tab_event') {
        await this.tabTracker.processEvent(data.event);
      } else if (data.type === 'navigation_update') {
        await this.navigationTracker.processSyncUpdate(data.update);
      }
    } catch (error) {
      console.error('Error handling incoming sync data:', error);
    }
  }

  /**
   * Handle synchronization errors
   */
  private handleSyncError(error: Error): void {
    console.warn('Cross-context synchronization error:', error);
    this.metrics.errorRate++;
  }

  /**
   * Handle performance alerts
   */
  private handlePerformanceAlert(alert: { type: string; value: number; threshold: number }): void {
    console.warn('Performance alert:', alert);
    
    // Take corrective action based on alert type
    if (alert.type === 'high_memory_usage' && alert.value > alert.threshold) {
      this.triggerMemoryCleanup();
    } else if (alert.type === 'slow_processing' && alert.value > alert.threshold) {
      this.optimizeProcessing();
    }
  }

  /**
   * Handle background processing errors
   */
  private handleBackgroundError(error: Error): void {
    console.error('Background processing error:', error);
    this.metrics.errorRate++;
  }

  /**
   * Background task processing
   */
  private async processBackgroundTasks(): Promise<void> {
    try {
      // Clean up old navigation history entries
      await this.navigationTracker.cleanup();

      // Optimize memory usage
      await this.optimizeMemoryUsage();

      // Update metrics
      await this.updateSystemMetrics();

      // Sync data if needed
      if (this.config.crossContextSyncEnabled) {
        await this.crossContextSync.performPeriodicSync();
      }

    } catch (error) {
      console.error('Error in background task processing:', error);
    }
  }

  /**
   * Process queued events from initialization
   */
  private async processQueuedEvents(): Promise<void> {
    const events = [...this.eventQueue];
    this.eventQueue = [];
    this.metrics.queuedEvents = 0;

    for (const event of events) {
      await this.processTabEvent(event);
    }
  }

  /**
   * Convert tab event to browsing event for session detection
   */
  private convertTabEventToBrowsingEvent(tabEvent: TabEvent): BrowsingEvent {
    // This conversion allows tab events to be processed by session detection
    return {
      type: this.mapTabEventToBrowsingEventType(tabEvent.type),
      timestamp: tabEvent.timestamp,
      tabId: tabEvent.tabId,
      windowId: tabEvent.windowId,
      url: tabEvent.data?.url || '',
      title: tabEvent.data?.title || '',
      metadata: {
        tabEvent: true,
        originalType: tabEvent.type,
        ...tabEvent.data
      }
    };
  }

  /**
   * Map tab event types to browsing event types
   */
  private mapTabEventToBrowsingEventType(tabEventType: string): string {
    switch (tabEventType) {
      case 'created':
        return 'tab_created';
      case 'updated':
        return 'navigation_completed';
      case 'removed':
        return 'tab_closed';
      case 'activated':
        return 'tab_activated';
      default:
        return 'tab_updated';
    }
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(processingTime: number): void {
    this.metrics.eventsProcessed++;
    
    // Update rolling average processing time
    const totalTime = this.metrics.averageProcessingTime * (this.metrics.eventsProcessed - 1);
    this.metrics.averageProcessingTime = (totalTime + processingTime) / this.metrics.eventsProcessed;
  }

  /**
   * Update system metrics
   */
  private async updateSystemMetrics(): Promise<void> {
    // Update memory usage
    if ('memory' in performance) {
      this.metrics.memoryUsage = (performance as any).memory.usedJSHeapSize;
    }

    // Update sync latency
    this.metrics.syncLatency = await this.crossContextSync.getLastSyncLatency();

    // Update queue size
    this.metrics.queuedEvents = this.eventQueue.length;
  }

  /**
   * Trigger memory cleanup
   */
  private triggerMemoryCleanup(): void {
    console.log('Triggering memory cleanup...');
    
    // Clean up navigation history
    this.navigationTracker.cleanup();
    
    // Clear old debounced events
    this.eventDebouncer.cleanup();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Optimize processing performance
   */
  private optimizeProcessing(): void {
    console.log('Optimizing processing performance...');
    
    // Increase debounce timeout to reduce event frequency
    this.eventDebouncer.updateTimeout(this.config.debounceTimeout! * 1.5);
    
    // Reduce background processing frequency
    this.backgroundProcessor.updateInterval(this.config.backgroundProcessingInterval! * 1.2);
  }

  /**
   * Optimize memory usage
   */
  private async optimizeMemoryUsage(): Promise<void> {
    // Clean up old entries in trackers
    await this.navigationTracker.cleanup();
    
    // Optimize tab tracker state
    await this.tabTracker.optimizeMemory();
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  /**
   * Get current tracking metrics
   */
  getMetrics(): TabTrackingMetrics {
    return { ...this.metrics };
  }

  /**
   * Get navigation history
   */
  getNavigationHistory(tabId?: number): any[] {
    return this.navigationTracker.getHistory(tabId);
  }

  /**
   * Get active tab states
   */
  getActiveTabStates(): any {
    return this.tabTracker.getAllTabStates();
  }

  /**
   * Update tracking configuration
   */
  async updateConfiguration(updates: Partial<TabTrackingConfig>): Promise<boolean> {
    try {
      this.config = { ...this.config, ...updates };
      
      // Update component configurations
      if (updates.debounceTimeout) {
        this.eventDebouncer.updateTimeout(updates.debounceTimeout);
      }
      
      if (updates.backgroundProcessingInterval) {
        this.backgroundProcessor.updateInterval(updates.backgroundProcessingInterval);
      }
      
      if (updates.maxHistoryEntries) {
        await this.navigationTracker.updateMaxEntries(updates.maxHistoryEntries);
      }
      
      console.log('Tab tracking configuration updated successfully');
      return true;
    } catch (error) {
      console.error('Error updating tab tracking configuration:', error);
      return false;
    }
  }

  /**
   * Force synchronization across contexts
   */
  async forceSync(): Promise<void> {
    if (this.config.crossContextSyncEnabled) {
      await this.crossContextSync.forceSync();
    }
  }

  /**
   * Export tracking state
   */
  exportState(): any {
    return {
      configuration: this.config,
      metrics: this.metrics,
      navigationHistory: this.navigationTracker.exportHistory(),
      tabStates: this.tabTracker.exportState(),
      systemInfo: {
        initialized: this.isInitialized,
        queuedEvents: this.eventQueue.length,
        exportedAt: Date.now()
      }
    };
  }

  /**
   * Reset all tracking components
   */
  async reset(): Promise<void> {
    try {
      console.log('Resetting tab lifecycle tracking system...');
      
      await this.tabTracker.reset();
      await this.navigationTracker.reset();
      await this.eventDebouncer.reset();
      await this.crossContextSync.reset();
      
      this.eventQueue = [];
      this.metrics = {
        eventsProcessed: 0,
        averageProcessingTime: 0,
        queuedEvents: 0,
        activeTrackers: 5,
        memoryUsage: 0,
        syncLatency: 0,
        errorRate: 0
      };
      
      console.log('Tab lifecycle tracking system reset complete');
    } catch (error) {
      console.error('Error resetting tab lifecycle tracking system:', error);
    }
  }

  /**
   * Shutdown the tracking system
   */
  async shutdown(): Promise<void> {
    try {
      console.log('Shutting down tab lifecycle tracking system...');
      
      // Stop background processing
      await this.backgroundProcessor.stop();
      
      // Process any remaining queued events
      if (this.eventQueue.length > 0) {
        await this.processQueuedEvents();
      }
      
      // Shutdown components
      await this.tabTracker.shutdown();
      await this.navigationTracker.shutdown();
      await this.eventDebouncer.shutdown();
      await this.crossContextSync.shutdown();
      
      this.isInitialized = false;
      console.log('Tab lifecycle tracking system shutdown complete');
    } catch (error) {
      console.error('Error shutting down tab lifecycle tracking system:', error);
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create and initialize an integrated tab lifecycle tracking system
 */
export async function createTabLifecycleTracking(
  config: TabTrackingConfig,
  sessionDetection?: IntegratedSessionDetection
): Promise<IntegratedTabLifecycleTracking> {
  const tracking = new IntegratedTabLifecycleTracking(config, sessionDetection);
  await tracking.initialize();
  return tracking;
}

// =============================================================================
// CONFIGURATION PRESETS
// =============================================================================

export const TAB_TRACKING_PRESETS = {
  PERFORMANCE_OPTIMIZED: {
    debounceTimeout: 200,
    maxQueuedEvents: 500,
    backgroundProcessingInterval: 2000,
    enablePerformanceMonitoring: true,
    maxHistoryEntries: 5000
  },
  
  REAL_TIME: {
    debounceTimeout: 50,
    maxQueuedEvents: 2000,
    enableRealTimeSync: true,
    backgroundProcessingInterval: 500,
    enablePerformanceMonitoring: true,
    maxHistoryEntries: 15000
  },
  
  MEMORY_CONSERVATIVE: {
    debounceTimeout: 300,
    maxQueuedEvents: 200,
    backgroundProcessingInterval: 5000,
    maxHistoryEntries: 2000,
    enablePerformanceMonitoring: false
  },
  
  COMPREHENSIVE: {
    debounceTimeout: 100,
    maxQueuedEvents: 1000,
    enableRealTimeSync: true,
    enableNavigationHistory: true,
    crossContextSyncEnabled: true,
    sessionDetectionEnabled: true,
    backgroundProcessingInterval: 1000,
    maxHistoryEntries: 20000,
    enablePerformanceMonitoring: true
  }
} as const;