/**
 * Session Detection Integration - Bridge between Stream A and Stream B
 * Integrates tab lifecycle tracking with session boundary detection
 */

import { IntegratedSessionDetection } from '../detection';
import { IntegratedTabLifecycleTracking } from './index';
import {
  BrowsingEvent,
  TabEvent,
  SessionBoundary,
  TrackingConfig
} from '../../shared/types';

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface SessionDetectionBridge {
  sessionDetection: IntegratedSessionDetection;
  tabTracking: IntegratedTabLifecycleTracking;
  isConnected: boolean;
  sessionBoundaryCount: number;
  lastBoundaryTime: number;
}

export interface IntegrationConfig {
  enableRealTimeBoundaryDetection: boolean;
  enableSessionContextEnrichment: boolean;
  enableTabGroupingBySession: boolean;
  boundaryNotificationDelay?: number;
  sessionMetricsEnabled?: boolean;
  enableBidirectionalSync?: boolean;
}

export interface SessionContext {
  sessionId: string;
  startTime: number;
  endTime?: number;
  tabIds: number[];
  boundaryReason: string;
  confidence: number;
  metadata: {
    domains: string[];
    navigationCount: number;
    totalFocusTime: number;
    userInitiated: boolean;
    behaviorPattern?: string;
  };
}

export interface BoundaryNotification {
  boundaryId: string;
  timestamp: number;
  sessionContext: SessionContext;
  previousSession?: SessionContext;
  transitionType: 'automatic' | 'user_initiated' | 'time_based' | 'context_switch';
  confidence: number;
}

// =============================================================================
// SESSION DETECTION INTEGRATION
// =============================================================================

export class SessionDetectionIntegration {
  private sessionDetection: IntegratedSessionDetection;
  private tabTracking: IntegratedTabLifecycleTracking;
  private config: IntegrationConfig;
  
  private isInitialized: boolean = false;
  private sessionContexts = new Map<string, SessionContext>();
  private activeSessions = new Set<string>();
  private boundaryQueue: BoundaryNotification[] = [];
  
  private boundaryHandlers: Array<(boundary: BoundaryNotification) => void> = [];
  private sessionContextHandlers: Array<(context: SessionContext) => void> = [];
  
  private integrationMetrics = {
    boundariesDetected: 0,
    sessionsCreated: 0,
    tabsGroupedBySession: 0,
    averageSessionDuration: 0,
    contextEnrichments: 0,
    syncEvents: 0
  };

  constructor(
    sessionDetection: IntegratedSessionDetection,
    tabTracking: IntegratedTabLifecycleTracking,
    config: IntegrationConfig
  ) {
    this.sessionDetection = sessionDetection;
    this.tabTracking = tabTracking;
    this.config = {
      boundaryNotificationDelay: 1000, // 1 second
      sessionMetricsEnabled: true,
      enableBidirectionalSync: true,
      ...config
    };
  }

  /**
   * Initialize integration between session detection and tab tracking
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Initializing Session Detection Integration...');

      // Set up event bridging from tab tracking to session detection
      this.setupTabTrackingBridge();

      // Set up session boundary notifications
      this.setupBoundaryNotifications();

      // Set up bidirectional synchronization if enabled
      if (this.config.enableBidirectionalSync) {
        this.setupBidirectionalSync();
      }

      this.isInitialized = true;
      console.log('Session Detection Integration initialized successfully');

    } catch (error) {
      console.error('Failed to initialize Session Detection Integration:', error);
      throw error;
    }
  }

  /**
   * Set up bridge from tab tracking to session detection
   */
  private setupTabTrackingBridge(): void {
    // Override the tab tracking event handler to also send events to session detection
    const originalHandler = this.tabTracking['eventHandler'] || (() => Promise.resolve());
    
    this.tabTracking['eventHandler'] = async (event: BrowsingEvent) => {
      try {
        // Process through original handler
        await originalHandler(event);

        // Convert and send to session detection
        if (this.config.enableRealTimeBoundaryDetection) {
          const sessionBoundary = await this.sessionDetection.processEvent(event);
          
          if (sessionBoundary) {
            await this.handleSessionBoundary(sessionBoundary, event);
          }
        }

        // Enrich event with session context if enabled
        if (this.config.enableSessionContextEnrichment) {
          await this.enrichEventWithSessionContext(event);
        }

      } catch (error) {
        console.error('Error in tab tracking bridge:', error);
      }
    };
  }

  /**
   * Set up session boundary notifications
   */
  private setupBoundaryNotifications(): void {
    // Set up delayed boundary processing to avoid rapid-fire notifications
    setInterval(this.processBoundaryQueue.bind(this), this.config.boundaryNotificationDelay!);
  }

  /**
   * Set up bidirectional synchronization
   */
  private setupBidirectionalSync(): void {
    // Listen for session detection events and update tab tracking accordingly
    // This would require extending the session detection system to emit events
    // For now, we'll set up a polling mechanism

    setInterval(async () => {
      try {
        await this.syncSessionStateWithTabTracking();
      } catch (error) {
        console.error('Error in bidirectional sync:', error);
      }
    }, 5000); // 5 seconds
  }

  /**
   * Handle session boundary detection
   */
  private async handleSessionBoundary(boundary: SessionBoundary, triggerEvent: BrowsingEvent): Promise<void> {
    try {
      // Create session context
      const sessionContext = await this.createSessionContext(boundary, triggerEvent);
      
      // Store session context
      this.sessionContexts.set(boundary.sessionId, sessionContext);
      
      if (boundary.type === 'session_start') {
        this.activeSessions.add(boundary.sessionId);
      } else if (boundary.type === 'session_end') {
        this.activeSessions.delete(boundary.sessionId);
        sessionContext.endTime = Date.now();
      }

      // Create boundary notification
      const notification: BoundaryNotification = {
        boundaryId: `boundary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        sessionContext,
        transitionType: this.determineTransitionType(boundary, triggerEvent),
        confidence: boundary.confidence
      };

      // Add to queue for delayed processing
      this.boundaryQueue.push(notification);

      // Update metrics
      this.integrationMetrics.boundariesDetected++;
      if (boundary.type === 'session_start') {
        this.integrationMetrics.sessionsCreated++;
      }

      // Group tabs by session if enabled
      if (this.config.enableTabGroupingBySession) {
        await this.groupTabsBySession(boundary.sessionId);
      }

    } catch (error) {
      console.error('Error handling session boundary:', error);
    }
  }

  /**
   * Create session context from boundary and trigger event
   */
  private async createSessionContext(boundary: SessionBoundary, triggerEvent: BrowsingEvent): Promise<SessionContext> {
    // Get current tab states from tab tracking
    const tabStates = this.tabTracking.getActiveTabStates();
    const relevantTabIds: number[] = [];
    const domains = new Set<string>();
    let totalFocusTime = 0;
    let navigationCount = 0;

    // Collect information from active tabs
    for (const [tabId, tabState] of tabStates) {
      if (this.isTabRelevantToSession(tabState, boundary)) {
        relevantTabIds.push(tabId);
        
        // Extract domain
        try {
          const url = new URL(tabState.info.url);
          domains.add(url.hostname);
        } catch {}

        // Aggregate metrics
        if (tabState.lifecycle) {
          totalFocusTime += tabState.lifecycle.totalFocusTime || 0;
        }
        if (tabState.navigation) {
          navigationCount += tabState.navigation.navigationCount || 0;
        }
      }
    }

    // Determine if session was user-initiated
    const userInitiated = this.wasSessionUserInitiated(boundary, triggerEvent);

    const sessionContext: SessionContext = {
      sessionId: boundary.sessionId,
      startTime: boundary.timestamp,
      tabIds: relevantTabIds,
      boundaryReason: boundary.reason,
      confidence: boundary.confidence,
      metadata: {
        domains: Array.from(domains),
        navigationCount,
        totalFocusTime,
        userInitiated,
        behaviorPattern: boundary.metadata?.behaviorPattern
      }
    };

    return sessionContext;
  }

  /**
   * Determine if a tab is relevant to a session
   */
  private isTabRelevantToSession(tabState: any, boundary: SessionBoundary): boolean {
    // Check if tab was active during the boundary detection timeframe
    const boundaryWindow = 60000; // 1 minute
    const tabLastActivity = tabState.lifecycle?.lastActivity || 0;
    
    return Math.abs(tabLastActivity - boundary.timestamp) < boundaryWindow;
  }

  /**
   * Determine if session was user-initiated
   */
  private wasSessionUserInitiated(boundary: SessionBoundary, triggerEvent: BrowsingEvent): boolean {
    // Check trigger event type and metadata
    if (triggerEvent.type === 'tab_created' && triggerEvent.metadata?.userGesture) {
      return true;
    }
    
    if (triggerEvent.type === 'navigation_completed' && 
        triggerEvent.metadata?.transitionType === 'typed') {
      return true;
    }

    // Check boundary metadata
    return boundary.metadata?.userInitiated === true;
  }

  /**
   * Determine transition type for boundary notification
   */
  private determineTransitionType(boundary: SessionBoundary, triggerEvent: BrowsingEvent): BoundaryNotification['transitionType'] {
    if (boundary.metadata?.userInitiated) {
      return 'user_initiated';
    }
    
    if (boundary.reason.includes('time_gap')) {
      return 'time_based';
    }
    
    if (boundary.reason.includes('context_switch') || boundary.reason.includes('domain_change')) {
      return 'context_switch';
    }
    
    return 'automatic';
  }

  /**
   * Group tabs by session
   */
  private async groupTabsBySession(sessionId: string): Promise<void> {
    try {
      const sessionContext = this.sessionContexts.get(sessionId);
      if (!sessionContext) return;

      // Update tab tracking with session information
      for (const tabId of sessionContext.tabIds) {
        const tabState = this.tabTracking.getTabState?.(tabId);
        if (tabState) {
          // Add session ID to tab metadata
          if (!tabState.metadata) {
            tabState.metadata = {};
          }
          tabState.metadata.sessionId = sessionId;
          tabState.metadata.sessionStartTime = sessionContext.startTime;
          
          this.integrationMetrics.tabsGroupedBySession++;
        }
      }

    } catch (error) {
      console.error('Error grouping tabs by session:', error);
    }
  }

  /**
   * Enrich event with session context
   */
  private async enrichEventWithSessionContext(event: BrowsingEvent): Promise<void> {
    try {
      // Find relevant session context
      const relevantSession = this.findRelevantSession(event);
      
      if (relevantSession) {
        if (!event.metadata) {
          event.metadata = {};
        }
        
        event.metadata.sessionContext = {
          sessionId: relevantSession.sessionId,
          sessionStartTime: relevantSession.startTime,
          sessionDomains: relevantSession.metadata.domains,
          behaviorPattern: relevantSession.metadata.behaviorPattern
        };
        
        this.integrationMetrics.contextEnrichments++;
      }

    } catch (error) {
      console.error('Error enriching event with session context:', error);
    }
  }

  /**
   * Find relevant session for an event
   */
  private findRelevantSession(event: BrowsingEvent): SessionContext | null {
    if (!event.tabId) return null;

    // Check active sessions for one that includes this tab
    for (const sessionId of this.activeSessions) {
      const sessionContext = this.sessionContexts.get(sessionId);
      if (sessionContext && sessionContext.tabIds.includes(event.tabId)) {
        return sessionContext;
      }
    }

    return null;
  }

  /**
   * Process boundary notification queue
   */
  private async processBoundaryQueue(): Promise<void> {
    if (this.boundaryQueue.length === 0) return;

    try {
      const notifications = [...this.boundaryQueue];
      this.boundaryQueue = [];

      // Process notifications in chronological order
      notifications.sort((a, b) => a.timestamp - b.timestamp);

      for (const notification of notifications) {
        // Notify boundary handlers
        for (const handler of this.boundaryHandlers) {
          try {
            handler(notification);
          } catch (error) {
            console.error('Error in boundary handler:', error);
          }
        }

        // Notify session context handlers
        for (const handler of this.sessionContextHandlers) {
          try {
            handler(notification.sessionContext);
          } catch (error) {
            console.error('Error in session context handler:', error);
          }
        }
      }

    } catch (error) {
      console.error('Error processing boundary queue:', error);
    }
  }

  /**
   * Sync session state with tab tracking
   */
  private async syncSessionStateWithTabTracking(): Promise<void> {
    try {
      // Get session detection stats
      const sessionStats = this.sessionDetection.getDetectionStats();
      
      // Update session durations
      for (const [sessionId, context] of this.sessionContexts) {
        if (!context.endTime && this.activeSessions.has(sessionId)) {
          // Update ongoing session metrics
          const duration = Date.now() - context.startTime;
          
          // Update average session duration
          const totalSessions = this.integrationMetrics.sessionsCreated;
          if (totalSessions > 0) {
            const currentAvg = this.integrationMetrics.averageSessionDuration;
            this.integrationMetrics.averageSessionDuration = 
              ((currentAvg * (totalSessions - 1)) + duration) / totalSessions;
          }
        }
      }

      this.integrationMetrics.syncEvents++;

    } catch (error) {
      console.error('Error in session state sync:', error);
    }
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  /**
   * Register boundary notification handler
   */
  onSessionBoundary(handler: (boundary: BoundaryNotification) => void): void {
    this.boundaryHandlers.push(handler);
  }

  /**
   * Register session context handler
   */
  onSessionContext(handler: (context: SessionContext) => void): void {
    this.sessionContextHandlers.push(handler);
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): SessionContext[] {
    return Array.from(this.activeSessions)
      .map(sessionId => this.sessionContexts.get(sessionId))
      .filter(context => context !== undefined) as SessionContext[];
  }

  /**
   * Get session context by ID
   */
  getSessionContext(sessionId: string): SessionContext | undefined {
    return this.sessionContexts.get(sessionId);
  }

  /**
   * Get session contexts for a specific tab
   */
  getSessionContextsForTab(tabId: number): SessionContext[] {
    return Array.from(this.sessionContexts.values())
      .filter(context => context.tabIds.includes(tabId));
  }

  /**
   * Get integration metrics
   */
  getIntegrationMetrics(): typeof this.integrationMetrics {
    return { ...this.integrationMetrics };
  }

  /**
   * Force session boundary detection for current state
   */
  async forceBoundaryDetection(): Promise<void> {
    try {
      // Get current tab states
      const tabStates = this.tabTracking.getActiveTabStates();
      
      // Create synthetic browsing event to trigger detection
      for (const [tabId, tabState] of tabStates) {
        if (tabState.lifecycle?.isActive) {
          const syntheticEvent: BrowsingEvent = {
            type: 'tab_activated',
            timestamp: Date.now(),
            tabId,
            windowId: tabState.info.windowId,
            url: tabState.info.url,
            title: tabState.info.title,
            metadata: {
              forcedDetection: true,
              synthetic: true
            }
          };

          await this.sessionDetection.processEvent(syntheticEvent);
        }
      }

    } catch (error) {
      console.error('Error forcing boundary detection:', error);
    }
  }

  /**
   * Update integration configuration
   */
  updateConfig(updates: Partial<IntegrationConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Export integration state
   */
  exportIntegrationState(): any {
    return {
      sessionContexts: Array.from(this.sessionContexts.entries()),
      activeSessions: Array.from(this.activeSessions),
      metrics: this.integrationMetrics,
      configuration: this.config,
      isInitialized: this.isInitialized,
      exportedAt: Date.now()
    };
  }

  /**
   * Reset integration state
   */
  async reset(): Promise<void> {
    try {
      console.log('Resetting Session Detection Integration...');

      this.sessionContexts.clear();
      this.activeSessions.clear();
      this.boundaryQueue = [];

      this.integrationMetrics = {
        boundariesDetected: 0,
        sessionsCreated: 0,
        tabsGroupedBySession: 0,
        averageSessionDuration: 0,
        contextEnrichments: 0,
        syncEvents: 0
      };

      console.log('Session Detection Integration reset complete');
    } catch (error) {
      console.error('Error resetting Session Detection Integration:', error);
    }
  }

  /**
   * Shutdown integration
   */
  async shutdown(): Promise<void> {
    try {
      console.log('Shutting down Session Detection Integration...');

      // Process remaining boundary notifications
      if (this.boundaryQueue.length > 0) {
        await this.processBoundaryQueue();
      }

      // Clear handlers
      this.boundaryHandlers = [];
      this.sessionContextHandlers = [];

      this.isInitialized = false;
      console.log('Session Detection Integration shutdown complete');

    } catch (error) {
      console.error('Error shutting down Session Detection Integration:', error);
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create and initialize session detection integration
 */
export async function createSessionDetectionIntegration(
  sessionDetection: IntegratedSessionDetection,
  tabTracking: IntegratedTabLifecycleTracking,
  config: IntegrationConfig
): Promise<SessionDetectionIntegration> {
  const integration = new SessionDetectionIntegration(sessionDetection, tabTracking, config);
  await integration.initialize();
  return integration;
}