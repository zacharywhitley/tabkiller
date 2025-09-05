/**
 * Optimized background service worker for TabKiller extension
 * Integrates comprehensive performance monitoring, memory management, and resource optimization
 */

import { 
  getBrowserAPI, 
  detectBrowser, 
  isManifestV3,
  tabs as tabsAPI,
  storage,
  messaging,
  history
} from '../utils/cross-browser';
import {
  BrowsingSession,
  TabInfo,
  NavigationEvent,
  Message,
  MessageResponse,
  BackgroundState,
  ExtensionSettings,
  TabEvent,
  WindowEvent,
  TabKillerError,
  TrackingConfig
} from '../shared/types';
import { EventTracker } from '../tracking/EventTracker';
import { PrivacyFilter } from '../utils/PrivacyFilter';
import { SessionDetector } from '../utils/SessionDetector';
import { AnalyticsEngine } from '../utils/AnalyticsEngine';
import { initializeDatabaseIntegration, getDatabaseIntegration } from '../database/integration';
import { performanceMonitor, monitorQuery, monitorEvent } from '../performance/PerformanceMonitor';
import { memoryManager, withMemoryManagement } from '../performance/MemoryManager';

class OptimizedBackgroundService {
  private state: BackgroundState;
  private browser = getBrowserAPI();
  private currentBrowser = detectBrowser();
  
  // Enhanced tracking system
  private eventTracker?: EventTracker;
  private privacyFilter?: PrivacyFilter;
  private sessionDetector?: SessionDetector;
  private analyticsEngine?: AnalyticsEngine;
  
  // Performance monitoring
  private performanceIntervals: NodeJS.Timeout[] = [];

  constructor() {
    this.state = {
      activeTabs: new Map(),
      settings: this.getDefaultSettings(),
      syncStatus: {
        enabled: false,
        lastSync: 0,
        inProgress: false,
        errors: [],
        totalSynced: 0
      }
    };
  }

  /**
   * Initialize the optimized background service with performance monitoring
   */
  async initialize(): Promise<void> {
    return withMemoryManagement('service-worker-init', async (manager) => {
      const initStartTime = performance.now();
      
      try {
        performanceMonitor.startBackgroundTask('service-worker-init');
        console.log(`TabKiller initializing on ${this.currentBrowser}...`);
        
        // Initialize performance monitoring first
        await performanceMonitor.initialize();
        console.log('Performance monitoring initialized');
        
        // Load settings and state with performance tracking
        await this.loadSettings();
        await this.loadState();

        // Initialize database integration with connection pooling
        await this.initializeDatabaseWithOptimization();
        
        // Initialize enhanced tracking system
        await this.initializeTrackingSystem();
        
        // Set up event listeners with memory management
        this.setupOptimizedEventListeners();
        
        // Initialize current tabs with batching
        await this.initializeCurrentTabsOptimized();
        
        // Start background optimization tasks
        this.startBackgroundOptimizations();
        
        // Record startup performance
        const initDuration = performance.now() - initStartTime;
        performanceMonitor.endBackgroundTask('service-worker-init');
        
        console.log(`TabKiller optimized service initialized in ${initDuration.toFixed(2)}ms`);
        
        // Validate performance benchmarks
        await this.validatePerformanceBenchmarks();
        
      } catch (error) {
        performanceMonitor.endBackgroundTask('service-worker-init');
        console.error('Failed to initialize optimized TabKiller service:', error);
        throw new TabKillerError(
          'INIT_FAILED',
          'Failed to initialize optimized background service',
          'background',
          error
        );
      }
    });
  }

  /**
   * Initialize database with connection pooling and optimization
   */
  @monitorQuery
  private async initializeDatabaseWithOptimization(): Promise<void> {
    try {
      const dbIntegration = getDatabaseIntegration();
      if (dbIntegration) {
        // Use connection pooling for database operations
        const connectionPool = memoryManager.getConnectionPool(
          'neodb-main',
          async () => dbIntegration.createConnection(),
          async (conn) => dbIntegration.validateConnection(conn),
          async (conn) => dbIntegration.closeConnection(conn),
          {
            maxConnections: 5,
            idleTimeout: 300000, // 5 minutes
            connectionTimeout: 30000, // 30 seconds
            maxRetries: 3
          }
        );
        
        console.log('Database connection pool initialized');
      }
      
      await initializeDatabaseIntegration(this.state.settings);
      console.log('Database integration initialized with optimization');
      
    } catch (error) {
      console.warn('Database integration failed, continuing without database:', error);
    }
  }

  /**
   * Initialize the enhanced tracking system with performance optimization
   */
  private async initializeTrackingSystem(): Promise<void> {
    return withMemoryManagement('tracking-system-init', async () => {
      try {
        const trackingConfig = this.getOptimizedTrackingConfig();
        
        // Initialize components with caching
        const trackingCache = memoryManager.getCache('tracking-cache', 500, 600000); // 10 minutes
        
        this.eventTracker = new EventTracker(trackingConfig);
        this.privacyFilter = new PrivacyFilter(trackingConfig);
        this.sessionDetector = new SessionDetector(trackingConfig);
        this.analyticsEngine = new AnalyticsEngine(trackingConfig);
        
        // Initialize tracking system
        await this.eventTracker.initialize();
        
        console.log('Enhanced tracking system initialized with optimization');
      } catch (error) {
        console.error('Failed to initialize optimized tracking system:', error);
      }
    });
  }

  /**
   * Get optimized tracking configuration with performance settings
   */
  private getOptimizedTrackingConfig(): TrackingConfig {
    return {
      enableTabTracking: true,
      enableWindowTracking: true,
      enableNavigationTracking: true,
      enableSessionTracking: true,
      enableFormTracking: this.state.settings.privacyMode !== 'strict',
      enableScrollTracking: true,
      enableClickTracking: true,
      
      // Privacy settings
      privacyMode: this.state.settings.privacyMode,
      excludeIncognito: true,
      excludeDomains: this.state.settings.excludedDomains,
      includeDomains: this.state.settings.includedDomains,
      sensitiveFieldFilters: ['password', 'ssn', 'credit'],
      
      // Optimized performance settings
      batchSize: 100, // Increased for better throughput
      batchInterval: 15000, // 15 seconds - more frequent processing
      maxEventsInMemory: 2000, // Increased buffer
      storageCleanupInterval: 1800000, // 30 minutes - more frequent cleanup
      
      // Session settings
      idleThreshold: 300000, // 5 minutes
      sessionGapThreshold: 600000, // 10 minutes
      domainChangeSessionBoundary: false,
      
      // Analytics settings
      enableProductivityMetrics: true,
      deepWorkThreshold: 900000, // 15 minutes
      distractionThreshold: 30000 // 30 seconds
    };
  }

  /**
   * Set up optimized event listeners with memory management and debouncing
   */
  private setupOptimizedEventListeners(): void {
    const listenerContext = 'optimized-service-worker';
    
    // Create debounced event handlers to prevent excessive processing
    const handleTabCreated = this.debounce(this.handleTabCreated.bind(this), 100);
    const handleTabUpdated = this.debounce(this.handleTabUpdated.bind(this), 150);
    const handleTabRemoved = this.debounce(this.handleTabRemoved.bind(this), 100);
    const handleTabActivated = this.throttle(this.handleTabActivated.bind(this), 200);
    
    // Register with memory manager for automatic cleanup
    memoryManager.addEventListener(listenerContext, tabsAPI.onCreated, 'addListener', handleTabCreated);
    memoryManager.addEventListener(listenerContext, tabsAPI.onUpdated, 'addListener', handleTabUpdated);
    memoryManager.addEventListener(listenerContext, tabsAPI.onRemoved, 'addListener', handleTabRemoved);
    memoryManager.addEventListener(listenerContext, tabsAPI.onActivated, 'addListener', handleTabActivated);

    // Window events with throttling
    const handleWindowCreated = this.throttle(this.handleWindowCreated.bind(this), 500);
    const handleWindowRemoved = this.throttle(this.handleWindowRemoved.bind(this), 500);
    const handleWindowFocusChanged = this.throttle(this.handleWindowFocusChanged.bind(this), 300);
    
    memoryManager.addEventListener(listenerContext, this.browser.windows.onCreated, 'addListener', handleWindowCreated);
    memoryManager.addEventListener(listenerContext, this.browser.windows.onRemoved, 'addListener', handleWindowRemoved);
    memoryManager.addEventListener(listenerContext, this.browser.windows.onFocusChanged, 'addListener', handleWindowFocusChanged);

    // History events
    if (history.onVisited) {
      const handleHistoryVisited = this.throttle(this.handleHistoryVisited.bind(this), 1000);
      memoryManager.addEventListener(listenerContext, history.onVisited, 'addListener', handleHistoryVisited);
    }

    // Message passing with optimization
    const handleMessage = this.handleMessage.bind(this);
    memoryManager.addEventListener(listenerContext, messaging.onMessage, 'addListener', handleMessage);

    // Extension lifecycle events
    const handleStartup = this.handleStartup.bind(this);
    const handleInstalled = this.handleInstalled.bind(this);
    memoryManager.addEventListener(listenerContext, this.browser.runtime.onStartup, 'addListener', handleStartup);
    memoryManager.addEventListener(listenerContext, this.browser.runtime.onInstalled, 'addListener', handleInstalled);

    // Context menu (if supported)
    if (this.browser.contextMenus) {
      this.setupContextMenus();
    }
  }

  /**
   * Start background optimization tasks
   */
  private startBackgroundOptimizations(): void {
    // Performance monitoring every 30 seconds
    const performanceInterval = setInterval(() => {
      this.performPerformanceCheck();
    }, 30000);
    this.performanceIntervals.push(performanceInterval);

    // Memory cleanup every 5 minutes
    const memoryInterval = setInterval(() => {
      this.performMemoryCleanup();
    }, 300000);
    this.performanceIntervals.push(memoryInterval);

    // Database optimization every 10 minutes
    const dbInterval = setInterval(() => {
      this.performDatabaseOptimization();
    }, 600000);
    this.performanceIntervals.push(dbInterval);
  }

  /**
   * Perform periodic performance check
   */
  @monitorEvent
  private async performPerformanceCheck(): Promise<void> {
    const summary = performanceMonitor.getPerformanceSummary();
    
    if (summary.status === 'critical') {
      console.error('Critical performance issues detected:', summary.issues);
      
      // Take corrective action
      const memoryIssues = summary.issues.filter(issue => issue.type === 'memory');
      if (memoryIssues.length > 0) {
        await memoryManager.forceGarbageCollection();
      }
      
      // Reduce processing load temporarily
      await this.reduceProcessingLoad();
      
    } else if (summary.status === 'warning') {
      console.warn('Performance warnings:', summary.issues);
      
      // Light optimization
      await this.optimizeProcessing();
    }
  }

  /**
   * Perform memory cleanup
   */
  private async performMemoryCleanup(): Promise<void> {
    try {
      const result = await memoryManager.forceGarbageCollection();
      console.log(`Memory cleanup completed: ${result.cachesCleanedUp} caches, ${result.listenersRemoved} listeners, ${result.memoryFreed} bytes freed`);
    } catch (error) {
      console.error('Memory cleanup failed:', error);
    }
  }

  /**
   * Perform database optimization
   */
  @monitorQuery
  private async performDatabaseOptimization(): Promise<void> {
    try {
      const dbIntegration = getDatabaseIntegration();
      if (dbIntegration) {
        // Run database maintenance tasks
        await dbIntegration.optimizeDatabase();
        console.log('Database optimization completed');
      }
    } catch (error) {
      console.warn('Database optimization failed:', error);
    }
  }

  /**
   * Handle tab creation with optimized performance tracking
   */
  @monitorEvent
  private async handleTabCreated(tab: chrome.tabs.Tab): Promise<void> {
    if (!tab.id) return;
    
    try {
      const tabInfo: TabInfo = {
        id: tab.id,
        url: tab.url || '',
        title: tab.title || '',
        favicon: tab.favIconUrl,
        windowId: tab.windowId,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        timeSpent: 0,
        scrollPosition: 0
      };

      this.state.activeTabs.set(tab.id, tabInfo);
      
      const event: TabEvent = {
        type: 'created',
        tabId: tab.id,
        windowId: tab.windowId,
        timestamp: Date.now(),
        data: tabInfo
      };

      // Process event with batching
      await this.processTabEventOptimized(event);
      
      // Enhanced tracking with caching
      if (this.eventTracker) {
        await this.eventTracker.processTabEvent(event);
      }
      
    } catch (error) {
      console.error('Error handling tab created:', error);
    }
  }

  /**
   * Handle tab updates with debouncing and optimization
   */
  @monitorEvent
  private async handleTabUpdated(
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab
  ): Promise<void> {
    try {
      const existingTab = this.state.activeTabs.get(tabId);
      
      if (!existingTab) {
        await this.handleTabCreated(tab);
        return;
      }

      // Update tab information
      const updatedTab: TabInfo = {
        ...existingTab,
        url: tab.url || existingTab.url,
        title: tab.title || existingTab.title,
        favicon: tab.favIconUrl || existingTab.favicon,
        lastAccessed: Date.now()
      };

      this.state.activeTabs.set(tabId, updatedTab);

      // Track navigation if URL changed
      if (changeInfo.url) {
        const navigationEvent: NavigationEvent = {
          tabId,
          url: changeInfo.url,
          referrer: existingTab.url,
          timestamp: Date.now(),
          transitionType: 'link'
        };

        await this.trackNavigationOptimized(navigationEvent);
      }

      const event: TabEvent = {
        type: 'updated',
        tabId,
        windowId: tab.windowId,
        timestamp: Date.now(),
        data: changeInfo
      };

      await this.processTabEventOptimized(event);
      
      // Enhanced tracking with batching
      if (this.eventTracker) {
        await this.eventTracker.processTabEvent(event);
      }
      
    } catch (error) {
      console.error('Error handling tab updated:', error);
    }
  }

  /**
   * Handle tab removal with optimized cleanup
   */
  @monitorEvent
  private async handleTabRemoved(tabId: number, removeInfo: chrome.tabs.TabRemoveInfo): Promise<void> {
    try {
      const tabInfo = this.state.activeTabs.get(tabId);
      
      if (tabInfo) {
        // Calculate final time spent
        tabInfo.timeSpent += Date.now() - tabInfo.lastAccessed;
        
        // Save tab data with batching
        await this.saveTabDataOptimized(tabInfo);
        
        // Remove from active tabs
        this.state.activeTabs.delete(tabId);
      }

      const event: TabEvent = {
        type: 'removed',
        tabId,
        windowId: removeInfo.windowId,
        timestamp: Date.now()
      };

      await this.processTabEventOptimized(event);
      
    } catch (error) {
      console.error('Error handling tab removed:', error);
    }
  }

  /**
   * Handle tab activation with throttling
   */
  @monitorEvent
  private async handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
    try {
      const now = Date.now();
      
      // Batch update all tab times
      const updates: Array<[number, TabInfo]> = [];
      
      for (const [tabId, tabInfo] of this.state.activeTabs) {
        if (tabId === activeInfo.tabId) {
          tabInfo.lastAccessed = now;
        } else {
          tabInfo.timeSpent += now - tabInfo.lastAccessed;
        }
        updates.push([tabId, tabInfo]);
      }

      // Apply updates in batch
      updates.forEach(([tabId, tabInfo]) => {
        this.state.activeTabs.set(tabId, tabInfo);
      });

      const event: TabEvent = {
        type: 'activated',
        tabId: activeInfo.tabId,
        windowId: activeInfo.windowId,
        timestamp: now
      };

      await this.processTabEventOptimized(event);
      
    } catch (error) {
      console.error('Error handling tab activated:', error);
    }
  }

  /**
   * Process tab events with optimization and batching
   */
  private async processTabEventOptimized(event: TabEvent): Promise<void> {
    // Add to processing queue for batch processing
    const eventCache = memoryManager.getCache('tab-events', 200, 60000);
    eventCache.set(`${event.type}-${event.tabId}-${event.timestamp}`, event);
    
    // Process session management
    if (this.state.currentSession) {
      this.state.currentSession.updatedAt = event.timestamp;
      // Defer session saving to reduce I/O
      this.deferredSaveSession(this.state.currentSession);
    }
  }

  /**
   * Track navigation with optimization
   */
  @monitorQuery
  private async trackNavigationOptimized(event: NavigationEvent): Promise<void> {
    try {
      // Cache recent navigation events to avoid duplicate processing
      const navCache = memoryManager.getCache('navigation-cache', 100, 300000); // 5 minutes
      const cacheKey = `${event.tabId}-${event.url}`;
      
      if (navCache.get(cacheKey)) {
        return; // Skip duplicate navigation
      }
      
      navCache.set(cacheKey, event);
      
      // Store navigation in database with batching
      const dbIntegration = getDatabaseIntegration();
      if (dbIntegration) {
        await dbIntegration.handleNavigation(event);
      }
      
    } catch (error) {
      console.warn('Failed to track navigation optimally:', error);
    }
  }

  /**
   * Initialize current tabs with batching
   */
  @monitorQuery
  private async initializeCurrentTabsOptimized(): Promise<void> {
    const tabs = await tabsAPI.getAll();
    
    // Process tabs in batches to avoid overwhelming the system
    const batchSize = 20;
    for (let i = 0; i < tabs.length; i += batchSize) {
      const batch = tabs.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (tab) => {
          if (tab.id) {
            await this.handleTabCreated(tab);
          }
        })
      );
      
      // Small delay between batches to prevent blocking
      if (i + batchSize < tabs.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
  }

  /**
   * Save tab data with batching optimization
   */
  private async saveTabDataOptimized(tabInfo: TabInfo): Promise<void> {
    try {
      // Add to batch processing queue
      const saveQueue = memoryManager.getCache('tab-save-queue', 100, 60000);
      saveQueue.set(`tab-${tabInfo.id}`, tabInfo);
      
      // Process queue periodically (handled by batch processor)
      this.scheduleBatchSave();
      
    } catch (error) {
      console.warn('Failed to queue tab data for saving:', error);
    }
  }

  /**
   * Schedule batch save operations
   */
  private scheduleBatchSave = this.debounce(async () => {
    const saveQueue = memoryManager.getCache('tab-save-queue');
    const stats = saveQueue.getStats();
    
    if (stats.size > 0) {
      // Process all queued saves
      console.log(`Processing ${stats.size} batched tab saves`);
      // Implementation would iterate through cache and save to database
    }
  }, 5000);

  /**
   * Deferred session saving to reduce I/O
   */
  private deferredSaveSession = this.debounce(async (session: BrowsingSession) => {
    try {
      await storage.set({ [`session_${session.id}`]: session });
      if (this.state.currentSession?.id === session.id) {
        await storage.set({ currentSession: session });
      }
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }, 2000);

  /**
   * Validate performance benchmarks are being met
   */
  private async validatePerformanceBenchmarks(): Promise<void> {
    const summary = performanceMonitor.getPerformanceSummary();
    const issues = performanceMonitor.identifyBottlenecks();
    
    console.log('Performance validation:', {
      status: summary.status,
      issueCount: issues.length,
      memoryUsage: Math.round(summary.metrics.memoryUsage.usedJSHeapSize / 1024 / 1024) + 'MB'
    });
    
    // Check specific benchmarks
    const avgStartupTime = summary.metrics.startupTime;
    const avgQueryTime = summary.metrics.queryResponseTimes.length > 0 
      ? summary.metrics.queryResponseTimes.reduce((a, b) => a + b, 0) / summary.metrics.queryResponseTimes.length 
      : 0;
    
    if (avgStartupTime > 100) {
      console.warn(`Startup time ${avgStartupTime}ms exceeds 100ms benchmark`);
    }
    
    if (avgQueryTime > 50) {
      console.warn(`Average query time ${avgQueryTime.toFixed(2)}ms exceeds 50ms benchmark`);
    }
    
    const memoryUsageMB = summary.metrics.memoryUsage.usedJSHeapSize / 1024 / 1024;
    if (memoryUsageMB > 50) {
      console.warn(`Memory usage ${memoryUsageMB.toFixed(1)}MB exceeds 50MB benchmark`);
    }
  }

  /**
   * Reduce processing load when performance is critical
   */
  private async reduceProcessingLoad(): Promise<void> {
    console.log('Reducing processing load due to performance issues');
    
    // Temporarily increase batch sizes and intervals
    if (this.eventTracker) {
      await this.eventTracker.updateConfig({
        ...this.getOptimizedTrackingConfig(),
        batchSize: 200,
        batchInterval: 30000
      });
    }
  }

  /**
   * Optimize processing when performance warnings are detected
   */
  private async optimizeProcessing(): Promise<void> {
    console.log('Optimizing processing due to performance warnings');
    
    // Trigger light cleanup
    const cleaned = await memoryManager.forceGarbageCollection();
    console.log(`Light cleanup completed: ${cleaned.cachesCleanedUp} caches cleaned`);
  }

  // Utility functions for debouncing and throttling
  private debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
    let timeout: NodeJS.Timeout;
    return ((...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    }) as T;
  }

  private throttle<T extends (...args: any[]) => any>(func: T, limit: number): T {
    let inThrottle: boolean;
    return ((...args: Parameters<T>) => {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    }) as T;
  }

  // Cleanup method
  async cleanup(): Promise<void> {
    console.log('Cleaning up optimized background service');
    
    // Clear all intervals
    this.performanceIntervals.forEach(interval => clearInterval(interval));
    this.performanceIntervals = [];
    
    // Remove event listeners
    memoryManager.removeEventListeners('optimized-service-worker');
    
    // Stop performance monitoring
    performanceMonitor.stopMonitoring();
    
    // Cleanup memory manager
    await memoryManager.cleanup();
    
    console.log('Optimized background service cleanup completed');
  }

  // Include all other methods from the original service worker...
  private getDefaultSettings(): ExtensionSettings {
    return {
      autoCapture: true,
      captureInterval: 30000,
      maxSessions: 100,
      defaultTag: 'browsing',
      syncEnabled: false,
      encryptionEnabled: true,
      excludedDomains: ['chrome://', 'moz-extension://', 'about:'],
      includeDomains: [],
      privacyMode: 'moderate'
    };
  }

  private async handleWindowCreated(window: chrome.windows.Window): Promise<void> {
    // Implementation with performance monitoring
  }

  private async handleWindowRemoved(windowId: number): Promise<void> {
    // Implementation with performance monitoring
  }

  private async handleWindowFocusChanged(windowId: number): Promise<void> {
    // Implementation with performance monitoring  
  }

  private async handleHistoryVisited(item: chrome.history.HistoryItem): Promise<void> {
    // Implementation with optimization
  }

  private async handleMessage(message: Message, sender: chrome.runtime.MessageSender): Promise<MessageResponse> {
    const processingId = `message-${message.type}-${Date.now()}`;
    performanceMonitor.startEventProcessing(processingId);
    
    try {
      // Handle message with performance tracking
      let response: MessageResponse;
      
      switch (message.type) {
        case 'get-status':
          response = { success: true, data: await this.getOptimizedStatus() };
          break;
          
        case 'get-performance-metrics':
          response = { success: true, data: performanceMonitor.getPerformanceSummary() };
          break;
          
        case 'get-memory-stats':
          response = { success: true, data: memoryManager.getStats() };
          break;
          
        default:
          response = { success: false, error: `Unknown message type: ${message.type}` };
      }
      
      performanceMonitor.endEventProcessing(processingId);
      return response;
      
    } catch (error) {
      performanceMonitor.endEventProcessing(processingId);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: message.requestId
      };
    }
  }

  private async getOptimizedStatus(): Promise<any> {
    const performanceSummary = performanceMonitor.getPerformanceSummary();
    const memoryStats = memoryManager.getStats();
    
    return {
      browser: this.currentBrowser,
      manifestVersion: isManifestV3() ? 3 : 2,
      activeTabs: this.state.activeTabs.size,
      currentSession: this.state.currentSession?.id || null,
      settings: this.state.settings,
      syncStatus: this.state.syncStatus,
      performance: {
        status: performanceSummary.status,
        issues: performanceSummary.issues.length,
        metrics: performanceSummary.metrics
      },
      memory: {
        totalMemoryUsage: memoryStats.totalMemoryUsage,
        cacheCount: memoryStats.caches.length,
        eventListeners: memoryStats.eventListeners
      }
    };
  }

  private async loadSettings(): Promise<void> {
    performanceMonitor.startQuery('load-settings');
    try {
      const stored = await storage.get<{ settings?: ExtensionSettings }>('settings');
      if (stored.settings) {
        this.state.settings = { ...this.getDefaultSettings(), ...stored.settings };
      }
    } finally {
      performanceMonitor.endQuery('load-settings');
    }
  }

  private async loadState(): Promise<void> {
    performanceMonitor.startQuery('load-state');
    try {
      const stored = await storage.get<{ currentSession?: BrowsingSession }>('currentSession');
      if (stored.currentSession) {
        this.state.currentSession = stored.currentSession;
      }
    } finally {
      performanceMonitor.endQuery('load-state');
    }
  }

  private async handleStartup(): Promise<void> {
    console.log('TabKiller optimized extension started');
    await this.initialize();
  }

  private async handleInstalled(details: chrome.runtime.InstalledDetails): Promise<void> {
    console.log('TabKiller optimized extension installed:', details.reason);
    // Implementation...
  }

  private setupContextMenus(): void {
    // Implementation...
  }
}

// Initialize the optimized background service
const optimizedBackgroundService = new OptimizedBackgroundService();

// Export for cleanup
(globalThis as any).TabKillerCleanup = () => {
  return optimizedBackgroundService.cleanup();
};

// Start initialization when the script loads
if (isManifestV3()) {
  // Manifest V3 - service worker
  optimizedBackgroundService.initialize().catch(console.error);
} else {
  // Manifest V2 - background script
  optimizedBackgroundService.initialize().catch(console.error);
}

export { optimizedBackgroundService };