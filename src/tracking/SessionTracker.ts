/**
 * Intelligent session boundary detection and management
 * Detects session start/end based on user behavior, idle time, and navigation patterns
 */

import {
  BrowsingEvent,
  BrowsingSession,
  SessionBoundary,
  IdleEvent,
  TrackingConfig,
  EventType,
  EventMetadata,
  ProductivityMetrics,
  TimeRange
} from '../shared/types';
import { EventTracker } from './EventTracker';

interface SessionState {
  id: string;
  startTime: number;
  lastActivity: number;
  isActive: boolean;
  tabIds: Set<number>;
  windowIds: Set<number>;
  domains: Set<string>;
  eventCount: number;
  idleTime: number;
  activeTime: number;
  lastIdleStart?: number;
  tags: string[];
  metadata: SessionMetadata;
}

interface SessionMetadata {
  createdBy: 'user' | 'automatic';
  endReason?: 'user_initiated' | 'idle_timeout' | 'navigation_gap' | 'domain_change' | 'window_closed';
  parentSessionId?: string;
  childSessionIds: string[];
  purpose?: string;
  notes?: string;
}

interface IdleState {
  isIdle: boolean;
  idleStart?: number;
  idleDuration: number;
  reason?: string;
}

export class SessionTracker {
  private config: TrackingConfig;
  private eventHandler: (event: BrowsingEvent) => Promise<void>;
  
  // Session management
  private currentSession?: SessionState;
  private sessionHistory = new Map<string, SessionState>();
  private pendingSessions = new Map<string, SessionState>();
  
  // Idle tracking
  private idleState: IdleState = { isIdle: false, idleDuration: 0 };
  private idleTimer?: NodeJS.Timeout;
  private activityTimer?: NodeJS.Timeout;
  
  // Session detection
  private lastActivityTime = Date.now();
  private lastDomain?: string;
  private navigationGaps: number[] = [];
  private maxNavigationGap = 300000; // 5 minutes

  constructor(config: TrackingConfig, eventHandler: (event: BrowsingEvent) => Promise<void>) {
    this.config = config;
    this.eventHandler = eventHandler;
  }

  /**
   * Initialize session tracking
   */
  async initialize(): Promise<void> {
    console.log('Initializing SessionTracker...');
    
    // Load existing session state
    await this.loadSessionState();
    
    // Start automatic session if none exists
    if (!this.currentSession) {
      await this.startAutomaticSession();
    }
    
    // Set up idle detection
    this.setupIdleDetection();
    
    console.log('SessionTracker initialized');
  }

  /**
   * Shutdown session tracking
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down SessionTracker...');
    
    // End current session
    if (this.currentSession) {
      await this.endSession('user_initiated');
    }
    
    // Save session state
    await this.saveSessionState();
    
    // Clean up timers
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.activityTimer) clearTimeout(this.activityTimer);
    
    console.log('SessionTracker shutdown complete');
  }

  /**
   * Process session boundary events
   */
  async processBoundary(boundary: SessionBoundary): Promise<void> {
    if (!this.config.enableSessionTracking) {
      return;
    }

    if (boundary.type === 'start') {
      await this.handleSessionStart(boundary);
    } else {
      await this.handleSessionEnd(boundary);
    }
  }

  /**
   * Handle session start boundary
   */
  private async handleSessionStart(boundary: SessionBoundary): Promise<void> {
    // End current session if exists
    if (this.currentSession) {
      await this.endSession(boundary.reason);
    }

    // Start new session
    const session: SessionState = {
      id: boundary.sessionId,
      startTime: boundary.timestamp,
      lastActivity: boundary.timestamp,
      isActive: true,
      tabIds: new Set(boundary.metadata.tabsInvolved || []),
      windowIds: new Set(boundary.metadata.windowsInvolved || []),
      domains: new Set(),
      eventCount: 0,
      idleTime: 0,
      activeTime: 0,
      tags: [],
      metadata: {
        createdBy: 'automatic',
        childSessionIds: []
      }
    };

    this.currentSession = session;
    this.sessionHistory.set(session.id, session);

    // Emit session start event
    const event = EventTracker.createEvent(
      'session_started',
      session.id,
      {
        sessionBoundary: boundary,
        reason: boundary.reason,
        automaticDetection: true
      }
    );

    await this.eventHandler(event);
  }

  /**
   * Handle session end boundary
   */
  private async handleSessionEnd(boundary: SessionBoundary): Promise<void> {
    if (!this.currentSession || this.currentSession.id !== boundary.sessionId) {
      return;
    }

    await this.endSession(boundary.reason);
  }

  /**
   * Start a new browsing session
   */
  async startSession(tag?: string, purpose?: string, parentSessionId?: string): Promise<string> {
    // End current session if exists
    if (this.currentSession) {
      await this.endSession('user_initiated');
    }

    const sessionId = this.generateSessionId();
    const now = Date.now();

    const session: SessionState = {
      id: sessionId,
      startTime: now,
      lastActivity: now,
      isActive: true,
      tabIds: new Set(),
      windowIds: new Set(),
      domains: new Set(),
      eventCount: 0,
      idleTime: 0,
      activeTime: 0,
      tags: tag ? [tag] : [],
      metadata: {
        createdBy: 'user',
        purpose,
        parentSessionId,
        childSessionIds: []
      }
    };

    // Link to parent session if provided
    if (parentSessionId) {
      const parentSession = this.sessionHistory.get(parentSessionId);
      if (parentSession) {
        parentSession.metadata.childSessionIds.push(sessionId);
      }
    }

    this.currentSession = session;
    this.sessionHistory.set(sessionId, session);

    // Reset idle state
    this.idleState = { isIdle: false, idleDuration: 0 };

    // Emit session start event
    const event = EventTracker.createEvent(
      'session_started',
      sessionId,
      {
        userInitiated: true,
        tag,
        purpose,
        parentSessionId
      }
    );

    await this.eventHandler(event);

    return sessionId;
  }

  /**
   * End the current browsing session
   */
  async endSession(reason: SessionMetadata['endReason'] = 'user_initiated'): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    const now = Date.now();
    const session = this.currentSession;

    // Calculate final metrics
    session.activeTime += now - session.lastActivity;
    session.metadata.endReason = reason;
    session.isActive = false;

    // Calculate productivity metrics
    const productivity = await this.calculateProductivityMetrics(session);

    // Emit session end event
    const event = EventTracker.createEvent(
      'session_ended',
      session.id,
      {
        reason,
        duration: now - session.startTime,
        activeTime: session.activeTime,
        idleTime: session.idleTime,
        eventCount: session.eventCount,
        tabCount: session.tabIds.size,
        windowCount: session.windowIds.size,
        domainCount: session.domains.size,
        productivity
      }
    );

    await this.eventHandler(event);

    // Move to history and clear current
    this.sessionHistory.set(session.id, session);
    this.currentSession = undefined;

    // Start automatic session if configured
    if (this.config.enableSessionTracking && reason !== 'user_initiated') {
      setTimeout(() => this.startAutomaticSession(), 1000);
    }
  }

  /**
   * Update session with activity
   */
  async updateSessionActivity(tabId?: number, windowId?: number, domain?: string, url?: string): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    const now = Date.now();
    const session = this.currentSession;

    // Update last activity
    const timeSinceLastActivity = now - session.lastActivity;
    session.activeTime += Math.min(timeSinceLastActivity, 300000); // Cap at 5 minutes
    session.lastActivity = now;
    session.eventCount++;

    // Track tab and window associations
    if (tabId) session.tabIds.add(tabId);
    if (windowId) session.windowIds.add(windowId);
    if (domain) session.domains.add(domain);

    // Check for session boundary conditions
    await this.checkSessionBoundaries(domain, now);

    // Reset idle state if was idle
    if (this.idleState.isIdle) {
      await this.endIdle(now);
    }

    // Update activity tracking
    this.lastActivityTime = now;
    this.resetIdleTimer();
  }

  /**
   * Set idle state
   */
  setIdleState(isIdle: boolean, reason?: string): void {
    const now = Date.now();

    if (isIdle && !this.idleState.isIdle) {
      this.startIdle(now, reason);
    } else if (!isIdle && this.idleState.isIdle) {
      this.endIdle(now);
    }
  }

  /**
   * Start idle state
   */
  private async startIdle(timestamp: number, reason?: string): Promise<void> {
    this.idleState = {
      isIdle: true,
      idleStart: timestamp,
      idleDuration: 0,
      reason
    };

    if (this.currentSession) {
      this.currentSession.lastIdleStart = timestamp;
    }

    // Emit idle start event
    if (this.currentSession) {
      const event = EventTracker.createEvent(
        'idle_start',
        this.currentSession.id,
        { reason, timestamp }
      );
      await this.eventHandler(event);
    }

    // Check if idle timeout should end session
    if (this.config.idleThreshold > 0) {
      setTimeout(async () => {
        if (this.idleState.isIdle && (Date.now() - timestamp) > this.config.idleThreshold) {
          await this.endSession('idle_timeout');
        }
      }, this.config.idleThreshold);
    }
  }

  /**
   * End idle state
   */
  private async endIdle(timestamp: number): Promise<void> {
    if (!this.idleState.isIdle || !this.idleState.idleStart) {
      return;
    }

    const idleDuration = timestamp - this.idleState.idleStart;
    
    if (this.currentSession) {
      this.currentSession.idleTime += idleDuration;
    }

    // Emit idle end event
    if (this.currentSession) {
      const event = EventTracker.createEvent(
        'idle_end',
        this.currentSession.id,
        { 
          duration: idleDuration,
          reason: this.idleState.reason 
        }
      );
      await this.eventHandler(event);
    }

    this.idleState = { isIdle: false, idleDuration: 0 };
  }

  /**
   * Check for session boundary conditions
   */
  private async checkSessionBoundaries(domain?: string, timestamp?: number): Promise<void> {
    if (!this.currentSession || !timestamp) {
      return;
    }

    const timeSinceLastActivity = timestamp - this.lastActivityTime;
    
    // Navigation gap detection
    if (timeSinceLastActivity > this.config.sessionGapThreshold) {
      this.navigationGaps.push(timeSinceLastActivity);
      
      // Keep only recent gaps
      this.navigationGaps = this.navigationGaps.slice(-10);
      
      // If consistently large gaps, consider ending session
      const avgGap = this.navigationGaps.reduce((sum, gap) => sum + gap, 0) / this.navigationGaps.length;
      if (avgGap > this.config.sessionGapThreshold * 1.5) {
        await this.createSessionBoundary('navigation_gap', timestamp);
      }
    }

    // Domain change detection
    if (domain && this.lastDomain && this.config.domainChangeSessionBoundary) {
      if (domain !== this.lastDomain && !this.areRelatedDomains(domain, this.lastDomain)) {
        // Significant domain change might indicate new session
        const domainChangeScore = this.calculateDomainChangeScore(domain, this.lastDomain);
        if (domainChangeScore > 0.7) {
          await this.createSessionBoundary('domain_change', timestamp, {
            domainFrom: this.lastDomain,
            domainTo: domain
          });
        }
      }
    }

    this.lastDomain = domain;
  }

  /**
   * Create session boundary event
   */
  private async createSessionBoundary(
    reason: SessionBoundary['reason'], 
    timestamp: number, 
    additionalMetadata?: any
  ): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    const boundary: SessionBoundary = {
      id: `boundary_${Date.now()}`,
      type: 'end',
      reason,
      timestamp,
      sessionId: this.currentSession.id,
      metadata: {
        ...additionalMetadata,
        tabsInvolved: Array.from(this.currentSession.tabIds),
        windowsInvolved: Array.from(this.currentSession.windowIds)
      }
    };

    await this.processBoundary(boundary);

    // Create start boundary for new session
    const newSessionId = this.generateSessionId();
    const startBoundary: SessionBoundary = {
      id: `boundary_${Date.now() + 1}`,
      type: 'start',
      reason,
      timestamp: timestamp + 1,
      sessionId: newSessionId,
      metadata: additionalMetadata || {}
    };

    await this.processBoundary(startBoundary);
  }

  /**
   * Calculate productivity metrics for a session
   */
  private async calculateProductivityMetrics(session: SessionState): Promise<ProductivityMetrics> {
    const totalTime = Date.now() - session.startTime;
    const activeRatio = session.activeTime / totalTime;
    
    // Basic focus score calculation
    const focusScore = Math.min(
      (activeRatio * 100) * // Active time ratio
      (1 - (session.idleTime / totalTime)) * // Idle time penalty
      Math.min(session.domains.size / 5, 1), // Domain focus bonus (up to 5 domains)
      100
    );

    const metrics: ProductivityMetrics = {
      sessionId: session.id,
      totalTime,
      activeTime: session.activeTime,
      idleTime: session.idleTime,
      tabSwitches: session.eventCount, // Approximate
      windowSwitches: 0, // Would need to track this
      uniqueDomains: Array.from(session.domains),
      pageCount: session.tabIds.size,
      scrollEvents: 0, // Would need to aggregate from events
      clickEvents: 0, // Would need to aggregate from events
      formInteractions: 0, // Would need to aggregate from events
      deepWorkPeriods: [], // Would need to analyze time periods
      distractionPeriods: [], // Would need to analyze interruptions
      focusScore: Math.max(0, Math.min(100, focusScore))
    };

    return metrics;
  }

  /**
   * Setup idle detection timers
   */
  private setupIdleDetection(): void {
    this.resetIdleTimer();
  }

  /**
   * Reset idle timer
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    if (this.config.idleThreshold > 0) {
      this.idleTimer = setTimeout(() => {
        this.setIdleState(true, 'user_inactive');
      }, this.config.idleThreshold);
    }
  }

  /**
   * Start automatic session
   */
  private async startAutomaticSession(): Promise<void> {
    await this.startSession('automatic', 'Auto-detected browsing session');
  }

  /**
   * Utility methods
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private areRelatedDomains(domain1: string, domain2: string): boolean {
    // Check if domains are related (subdomains, common TLD, etc.)
    const parts1 = domain1.split('.');
    const parts2 = domain2.split('.');
    
    // Same root domain
    if (parts1.length >= 2 && parts2.length >= 2) {
      const root1 = parts1.slice(-2).join('.');
      const root2 = parts2.slice(-2).join('.');
      return root1 === root2;
    }
    
    return false;
  }

  private calculateDomainChangeScore(newDomain: string, oldDomain: string): number {
    // Calculate how significant the domain change is
    if (this.areRelatedDomains(newDomain, oldDomain)) {
      return 0.2; // Related domains = low significance
    }
    
    // Check domain categories (could be expanded)
    const socialDomains = ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com'];
    const workDomains = ['gmail.com', 'docs.google.com', 'slack.com', 'github.com'];
    
    const isOldSocial = socialDomains.some(d => oldDomain.includes(d));
    const isNewSocial = socialDomains.some(d => newDomain.includes(d));
    const isOldWork = workDomains.some(d => oldDomain.includes(d));
    const isNewWork = workDomains.some(d => newDomain.includes(d));
    
    if ((isOldSocial && isNewWork) || (isOldWork && isNewSocial)) {
      return 0.8; // Context switch between work and social
    }
    
    return 0.5; // Default moderate significance
  }

  /**
   * Get current session
   */
  getCurrentSession(): SessionState | undefined {
    return this.currentSession;
  }

  /**
   * Get session history
   */
  getSessionHistory(): Map<string, SessionState> {
    return new Map(this.sessionHistory);
  }

  /**
   * Get session statistics
   */
  getSessionStats() {
    return {
      currentSessionId: this.currentSession?.id,
      isIdle: this.idleState.isIdle,
      totalSessions: this.sessionHistory.size,
      currentSessionDuration: this.currentSession 
        ? Date.now() - this.currentSession.startTime 
        : 0,
      currentSessionActivity: this.currentSession?.eventCount || 0
    };
  }

  /**
   * Add tag to current session
   */
  async addSessionTag(tag: string): Promise<void> {
    if (this.currentSession && !this.currentSession.tags.includes(tag)) {
      this.currentSession.tags.push(tag);
    }
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: TrackingConfig): Promise<void> {
    this.config = newConfig;
    
    // Update idle detection
    this.resetIdleTimer();
  }

  /**
   * Load session state from storage (implementation placeholder)
   */
  private async loadSessionState(): Promise<void> {
    // Implementation would load from storage
  }

  /**
   * Save session state to storage (implementation placeholder)
   */
  private async saveSessionState(): Promise<void> {
    // Implementation would save to storage
  }
}