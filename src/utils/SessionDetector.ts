/**
 * Session boundary detection utilities
 * Analyzes browsing patterns to detect natural session boundaries
 */

import {
  BrowsingEvent,
  SessionBoundary,
  TrackingConfig,
  NavigationStep,
  EventType
} from '../shared/types';

interface SessionSignal {
  type: 'idle' | 'domain_change' | 'navigation_gap' | 'window_pattern' | 'time_based';
  strength: number; // 0-1
  timestamp: number;
  metadata: any;
}

interface SessionContext {
  recentEvents: BrowsingEvent[];
  currentDomains: Set<string>;
  lastActivity: number;
  windowCount: number;
  tabCount: number;
  navigationGaps: number[];
  domainTransitions: string[];
}

export class SessionDetector {
  private config: TrackingConfig;
  private context: SessionContext;
  private sessionSignals: SessionSignal[] = [];

  constructor(config: TrackingConfig) {
    this.config = config;
    this.context = {
      recentEvents: [],
      currentDomains: new Set(),
      lastActivity: Date.now(),
      windowCount: 0,
      tabCount: 0,
      navigationGaps: [],
      domainTransitions: []
    };
  }

  /**
   * Analyze an event for session boundary signals
   */
  analyzeEvent(event: BrowsingEvent): SessionSignal[] {
    this.updateContext(event);
    const signals: SessionSignal[] = [];

    // Detect different types of session signals
    signals.push(...this.detectIdleSignals(event));
    signals.push(...this.detectDomainChangeSignals(event));
    signals.push(...this.detectNavigationGapSignals(event));
    signals.push(...this.detectWindowPatternSignals(event));
    signals.push(...this.detectTimeBasedSignals(event));

    // Store signals for analysis
    this.sessionSignals.push(...signals);

    // Keep signal history manageable
    if (this.sessionSignals.length > 100) {
      this.sessionSignals = this.sessionSignals.slice(-50);
    }

    return signals;
  }

  /**
   * Determine if a session boundary should be created
   */
  shouldCreateBoundary(signals: SessionSignal[]): SessionBoundary | null {
    if (signals.length === 0) {
      return null;
    }

    // Calculate combined signal strength
    const totalStrength = signals.reduce((sum, signal) => sum + signal.strength, 0);
    const avgStrength = totalStrength / signals.length;

    // Threshold for creating boundary (configurable)
    const boundaryThreshold = 0.7;

    if (avgStrength >= boundaryThreshold) {
      // Determine the primary reason for boundary
      const primarySignal = signals.reduce((max, signal) => 
        signal.strength > max.strength ? signal : max
      );

      return this.createBoundary(primarySignal, signals);
    }

    return null;
  }

  /**
   * Detect idle-based session signals
   */
  private detectIdleSignals(event: BrowsingEvent): SessionSignal[] {
    const signals: SessionSignal[] = [];
    const timeSinceLastActivity = event.timestamp - this.context.lastActivity;

    // Long idle period
    if (timeSinceLastActivity > this.config.idleThreshold) {
      const idleStrength = Math.min(timeSinceLastActivity / (this.config.idleThreshold * 2), 1);
      
      signals.push({
        type: 'idle',
        strength: idleStrength,
        timestamp: event.timestamp,
        metadata: {
          idleDuration: timeSinceLastActivity,
          threshold: this.config.idleThreshold
        }
      });
    }

    // Sudden activity after long quiet period
    if (event.type === 'tab_activated' || event.type === 'navigation_started') {
      const quietPeriod = this.calculateQuietPeriodBefore(event.timestamp);
      if (quietPeriod > this.config.idleThreshold * 0.8) {
        signals.push({
          type: 'idle',
          strength: 0.6,
          timestamp: event.timestamp,
          metadata: {
            quietPeriod,
            resumedActivity: true
          }
        });
      }
    }

    return signals;
  }

  /**
   * Detect domain change signals
   */
  private detectDomainChangeSignals(event: BrowsingEvent): SessionSignal[] {
    const signals: SessionSignal[] = [];

    if (event.url && this.config.domainChangeSessionBoundary) {
      const newDomain = this.extractDomain(event.url);
      if (newDomain) {
        // Significant domain category change
        const domainChangeStrength = this.calculateDomainChangeStrength(newDomain);
        
        if (domainChangeStrength > 0.5) {
          signals.push({
            type: 'domain_change',
            strength: domainChangeStrength,
            timestamp: event.timestamp,
            metadata: {
              newDomain,
              previousDomains: Array.from(this.context.currentDomains),
              categoryChange: this.analyzeDomainCategoryChange(newDomain)
            }
          });
        }

        // Complete domain context switch (no shared domains)
        if (this.context.currentDomains.size > 0 && !this.hasRelatedDomains(newDomain)) {
          signals.push({
            type: 'domain_change',
            strength: 0.8,
            timestamp: event.timestamp,
            metadata: {
              contextSwitch: true,
              newDomain,
              previousDomainCount: this.context.currentDomains.size
            }
          });
        }
      }
    }

    return signals;
  }

  /**
   * Detect navigation gap signals
   */
  private detectNavigationGapSignals(event: BrowsingEvent): SessionSignal[] {
    const signals: SessionSignal[] = [];

    if (this.isNavigationEvent(event.type)) {
      const gap = this.calculateNavigationGap(event.timestamp);
      
      if (gap > this.config.sessionGapThreshold) {
        const gapStrength = Math.min(gap / (this.config.sessionGapThreshold * 3), 1);
        
        signals.push({
          type: 'navigation_gap',
          strength: gapStrength,
          timestamp: event.timestamp,
          metadata: {
            gap,
            threshold: this.config.sessionGapThreshold,
            previousNavigations: this.context.navigationGaps.slice(-5)
          }
        });
      }

      // Pattern of increasing gaps
      if (this.context.navigationGaps.length >= 3) {
        const recentGaps = this.context.navigationGaps.slice(-3);
        if (this.isIncreasingPattern(recentGaps)) {
          signals.push({
            type: 'navigation_gap',
            strength: 0.6,
            timestamp: event.timestamp,
            metadata: {
              pattern: 'increasing_gaps',
              gaps: recentGaps
            }
          });
        }
      }
    }

    return signals;
  }

  /**
   * Detect window pattern signals
   */
  private detectWindowPatternSignals(event: BrowsingEvent): SessionSignal[] {
    const signals: SessionSignal[] = [];

    // Window closing pattern
    if (event.type === 'window_removed') {
      const windowCloseStrength = this.calculateWindowCloseStrength();
      
      if (windowCloseStrength > 0.5) {
        signals.push({
          type: 'window_pattern',
          strength: windowCloseStrength,
          timestamp: event.timestamp,
          metadata: {
            pattern: 'window_closing',
            remainingWindows: this.context.windowCount - 1
          }
        });
      }
    }

    // New window after quiet period
    if (event.type === 'window_created') {
      const quietPeriod = this.calculateQuietPeriodBefore(event.timestamp);
      if (quietPeriod > 60000) { // 1 minute
        signals.push({
          type: 'window_pattern',
          strength: 0.5,
          timestamp: event.timestamp,
          metadata: {
            pattern: 'new_window_after_quiet',
            quietPeriod
          }
        });
      }
    }

    return signals;
  }

  /**
   * Detect time-based signals
   */
  private detectTimeBasedSignals(event: BrowsingEvent): SessionSignal[] {
    const signals: SessionSignal[] = [];
    const hour = new Date(event.timestamp).getHours();

    // Work hour transitions (9 AM, 5 PM, etc.)
    const workHourTransitions = [9, 12, 17, 22]; // 9 AM, noon, 5 PM, 10 PM
    const currentHour = new Date().getHours();
    const eventHour = new Date(event.timestamp).getHours();

    if (workHourTransitions.includes(eventHour) && 
        Math.abs(event.timestamp - Date.now()) < 300000) { // Within 5 minutes of transition
      
      signals.push({
        type: 'time_based',
        strength: 0.4,
        timestamp: event.timestamp,
        metadata: {
          hourTransition: eventHour,
          transitionType: this.getTransitionType(eventHour)
        }
      });
    }

    // Long session duration
    const sessionDuration = this.calculateCurrentSessionDuration(event.timestamp);
    if (sessionDuration > 8 * 60 * 60 * 1000) { // 8 hours
      const durationStrength = Math.min(sessionDuration / (12 * 60 * 60 * 1000), 0.8); // Cap at 12 hours
      
      signals.push({
        type: 'time_based',
        strength: durationStrength,
        timestamp: event.timestamp,
        metadata: {
          longSession: true,
          duration: sessionDuration
        }
      });
    }

    return signals;
  }

  /**
   * Update analysis context with new event
   */
  private updateContext(event: BrowsingEvent): void {
    // Add to recent events
    this.context.recentEvents.push(event);
    if (this.context.recentEvents.length > 50) {
      this.context.recentEvents.shift();
    }

    // Update domains
    if (event.url) {
      const domain = this.extractDomain(event.url);
      if (domain) {
        this.context.currentDomains.add(domain);
        this.context.domainTransitions.push(domain);
        
        // Keep domain transitions manageable
        if (this.context.domainTransitions.length > 20) {
          this.context.domainTransitions.shift();
        }
      }
    }

    // Update activity
    this.context.lastActivity = event.timestamp;

    // Update navigation gaps
    if (this.isNavigationEvent(event.type)) {
      const gap = this.calculateNavigationGap(event.timestamp);
      this.context.navigationGaps.push(gap);
      
      if (this.context.navigationGaps.length > 10) {
        this.context.navigationGaps.shift();
      }
    }

    // Update window/tab counts
    if (event.type === 'window_created') {
      this.context.windowCount++;
    } else if (event.type === 'window_removed') {
      this.context.windowCount = Math.max(0, this.context.windowCount - 1);
    }

    if (event.type === 'tab_created') {
      this.context.tabCount++;
    } else if (event.type === 'tab_removed') {
      this.context.tabCount = Math.max(0, this.context.tabCount - 1);
    }

    // Clean up old domains (keep active ones)
    if (this.context.currentDomains.size > 10) {
      const recentDomains = new Set(
        this.context.recentEvents
          .slice(-20)
          .map(e => e.url ? this.extractDomain(e.url) : null)
          .filter(Boolean)
      );
      this.context.currentDomains = recentDomains;
    }
  }

  /**
   * Create session boundary from signal
   */
  private createBoundary(primarySignal: SessionSignal, allSignals: SessionSignal[]): SessionBoundary {
    let reason: SessionBoundary['reason'];
    
    switch (primarySignal.type) {
      case 'idle':
        reason = 'idle_timeout';
        break;
      case 'domain_change':
        reason = 'domain_change';
        break;
      case 'navigation_gap':
        reason = 'navigation_gap';
        break;
      case 'window_pattern':
      case 'time_based':
        reason = 'user_initiated';
        break;
      default:
        reason = 'user_initiated';
    }

    return {
      id: `boundary_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      type: 'end',
      reason,
      timestamp: primarySignal.timestamp,
      sessionId: '', // Will be set by SessionTracker
      metadata: {
        primarySignal: primarySignal.type,
        signalStrength: primarySignal.strength,
        totalSignals: allSignals.length,
        allSignalTypes: allSignals.map(s => s.type),
        ...primarySignal.metadata
      }
    };
  }

  /**
   * Helper methods
   */
  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  private calculateDomainChangeStrength(newDomain: string): number {
    if (this.context.currentDomains.size === 0) {
      return 0.1; // First domain, low strength
    }

    // Check domain categories
    const newCategory = this.getDomainCategory(newDomain);
    const currentCategories = Array.from(this.context.currentDomains)
      .map(d => this.getDomainCategory(d));

    const categoryChange = !currentCategories.includes(newCategory);
    const contextSwitch = !this.hasRelatedDomains(newDomain);

    let strength = 0;
    if (contextSwitch) strength += 0.4;
    if (categoryChange) strength += 0.3;

    return Math.min(strength, 1);
  }

  private getDomainCategory(domain: string): string {
    const categories = {
      social: ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'reddit.com'],
      work: ['gmail.com', 'docs.google.com', 'slack.com', 'teams.microsoft.com', 'github.com'],
      shopping: ['amazon.com', 'ebay.com', 'shopify.com', 'etsy.com'],
      news: ['cnn.com', 'bbc.com', 'reuters.com', 'news.google.com'],
      entertainment: ['youtube.com', 'netflix.com', 'spotify.com', 'twitch.tv']
    };

    for (const [category, domains] of Object.entries(categories)) {
      if (domains.some(d => domain.includes(d))) {
        return category;
      }
    }

    return 'other';
  }

  private hasRelatedDomains(newDomain: string): boolean {
    return Array.from(this.context.currentDomains).some(existingDomain => {
      // Same root domain
      const newParts = newDomain.split('.');
      const existingParts = existingDomain.split('.');
      
      if (newParts.length >= 2 && existingParts.length >= 2) {
        const newRoot = newParts.slice(-2).join('.');
        const existingRoot = existingParts.slice(-2).join('.');
        return newRoot === existingRoot;
      }
      
      return false;
    });
  }

  private isNavigationEvent(eventType: EventType): boolean {
    return [
      'navigation_started',
      'navigation_completed',
      'navigation_committed',
      'page_loaded'
    ].includes(eventType);
  }

  private calculateNavigationGap(timestamp: number): number {
    const recentNavEvents = this.context.recentEvents
      .filter(e => this.isNavigationEvent(e.type))
      .slice(-2);

    if (recentNavEvents.length < 2) {
      return 0;
    }

    return timestamp - recentNavEvents[recentNavEvents.length - 2].timestamp;
  }

  private calculateQuietPeriodBefore(timestamp: number): number {
    const recentEvents = this.context.recentEvents
      .filter(e => e.timestamp < timestamp)
      .slice(-10);

    if (recentEvents.length === 0) {
      return 0;
    }

    return timestamp - recentEvents[recentEvents.length - 1].timestamp;
  }

  private isIncreasingPattern(values: number[]): boolean {
    if (values.length < 2) return false;
    
    for (let i = 1; i < values.length; i++) {
      if (values[i] <= values[i - 1]) {
        return false;
      }
    }
    
    return true;
  }

  private calculateWindowCloseStrength(): number {
    if (this.context.windowCount <= 1) {
      return 0.9; // Last window closing
    } else if (this.context.windowCount <= 2) {
      return 0.6; // Second to last window
    }
    
    return 0.3; // Multiple windows remaining
  }

  private getTransitionType(hour: number): string {
    if (hour === 9) return 'work_start';
    if (hour === 12) return 'lunch_break';
    if (hour === 17) return 'work_end';
    if (hour === 22) return 'evening_wind_down';
    return 'other';
  }

  private calculateCurrentSessionDuration(currentTime: number): number {
    if (this.context.recentEvents.length === 0) {
      return 0;
    }

    const firstEvent = this.context.recentEvents[0];
    return currentTime - firstEvent.timestamp;
  }

  /**
   * Get detection statistics
   */
  getDetectionStats() {
    return {
      recentEvents: this.context.recentEvents.length,
      currentDomains: this.context.currentDomains.size,
      navigationGaps: this.context.navigationGaps.length,
      domainTransitions: this.context.domainTransitions.length,
      sessionSignals: this.sessionSignals.length,
      windowCount: this.context.windowCount,
      tabCount: this.context.tabCount
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: TrackingConfig): void {
    this.config = newConfig;
  }

  /**
   * Reset detection context
   */
  reset(): void {
    this.context = {
      recentEvents: [],
      currentDomains: new Set(),
      lastActivity: Date.now(),
      windowCount: 0,
      tabCount: 0,
      navigationGaps: [],
      domainTransitions: []
    };
    this.sessionSignals = [];
  }
}