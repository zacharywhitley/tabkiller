/**
 * Enhanced Session Detection Engine
 * Advanced intelligent session boundary detection with configurable parameters
 * and machine learning-inspired pattern recognition
 */

import {
  BrowsingEvent,
  SessionBoundary,
  TrackingConfig,
  EventType,
  ProductivityMetrics,
  TimeRange
} from '../../shared/types';

// =============================================================================
// DETECTION TYPES
// =============================================================================

export interface DetectionConfig extends TrackingConfig {
  // Enhanced detection parameters
  learningEnabled: boolean;
  adaptiveThresholds: boolean;
  contextualAnalysis: boolean;
  
  // Advanced thresholds
  idleGracePeriod: number; // Grace period before considering truly idle
  domainSimilarityThreshold: number; // 0-1 for domain relationship detection
  navigationPatternWeight: number; // Weight for navigation pattern analysis
  timeOfDayWeight: number; // Weight for time-based patterns
  userBehaviorWeight: number; // Weight for learned user behavior
  
  // Prediction parameters
  minimumPatternLength: number; // Minimum events for pattern recognition
  patternConfidenceThreshold: number; // Minimum confidence for pattern-based predictions
  boundaryPredictionLookahead: number; // How far ahead to predict boundaries (ms)
  
  // Learning parameters
  learningWindowSize: number; // Number of sessions to learn from
  adaptationRate: number; // How quickly to adapt to new patterns (0-1)
  patternDecayRate: number; // How quickly old patterns lose relevance
}

export interface DetectionSignal {
  type: 'temporal' | 'spatial' | 'behavioral' | 'contextual' | 'learned';
  subtype: string;
  strength: number; // 0-1
  confidence: number; // 0-1
  timestamp: number;
  metadata: Record<string, any>;
}

export interface BehaviorPattern {
  id: string;
  type: 'idle' | 'domain_switch' | 'navigation_burst' | 'tab_clustering' | 'time_based';
  pattern: any[];
  frequency: number;
  lastSeen: number;
  confidence: number;
  userSpecific: boolean;
}

export interface DetectionContext {
  // Temporal context
  currentTime: number;
  timeOfDay: number; // 0-23 hours
  dayOfWeek: number; // 0-6
  isWorkingHours: boolean;
  
  // Activity context
  recentEvents: BrowsingEvent[];
  eventVelocity: number; // Events per minute
  currentSession: {
    duration: number;
    tabCount: number;
    windowCount: number;
    domainCount: number;
    lastActivity: number;
  };
  
  // Spatial context
  activeDomains: Set<string>;
  domainCategories: Map<string, string>;
  domainRelationships: Map<string, string[]>;
  
  // Behavioral context
  userPatterns: BehaviorPattern[];
  historicalBoundaries: SessionBoundary[];
  adaptiveThresholds: Map<string, number>;
}

// =============================================================================
// ENHANCED SESSION DETECTION ENGINE
// =============================================================================

export class SessionDetectionEngine {
  private config: DetectionConfig;
  private context: DetectionContext;
  private patterns: Map<string, BehaviorPattern> = new Map();
  private signalHistory: DetectionSignal[] = [];
  private lastDetection: number = 0;

  constructor(config: DetectionConfig) {
    this.config = config;
    this.context = this.initializeContext();
  }

  /**
   * Main detection method - analyzes events and determines session boundaries
   */
  async detectSessionBoundary(event: BrowsingEvent): Promise<SessionBoundary | null> {
    // Update detection context
    this.updateContext(event);

    // Generate detection signals
    const signals = await this.generateDetectionSignals(event);
    
    // Store signals for analysis
    this.signalHistory.push(...signals);
    this.pruneSignalHistory();

    // Analyze signals for boundary detection
    const boundary = await this.analyzeSignalsForBoundary(signals, event);

    // Update patterns if learning is enabled
    if (this.config.learningEnabled) {
      await this.updatePatterns(event, signals, boundary);
    }

    // Update adaptive thresholds
    if (this.config.adaptiveThresholds) {
      this.updateAdaptiveThresholds(signals, boundary);
    }

    this.lastDetection = Date.now();
    return boundary;
  }

  /**
   * Generate detection signals from multiple analysis methods
   */
  private async generateDetectionSignals(event: BrowsingEvent): Promise<DetectionSignal[]> {
    const signals: DetectionSignal[] = [];

    // Temporal signals
    signals.push(...await this.generateTemporalSignals(event));
    
    // Spatial signals (domain/URL based)
    signals.push(...await this.generateSpatialSignals(event));
    
    // Behavioral signals (user patterns)
    signals.push(...await this.generateBehavioralSignals(event));
    
    // Contextual signals (time of day, work patterns)
    signals.push(...await this.generateContextualSignals(event));
    
    // Learned signals (from historical data)
    if (this.config.learningEnabled) {
      signals.push(...await this.generateLearnedSignals(event));
    }

    return signals;
  }

  /**
   * Temporal signals - time gaps, idle periods, activity bursts
   */
  private async generateTemporalSignals(event: BrowsingEvent): Promise<DetectionSignal[]> {
    const signals: DetectionSignal[] = [];
    const now = event.timestamp;
    const timeSinceLastActivity = now - this.context.currentSession.lastActivity;

    // Extended idle detection with grace period
    if (timeSinceLastActivity > this.config.idleThreshold) {
      const idleStrength = Math.min(
        (timeSinceLastActivity - this.config.idleGracePeriod) / this.config.idleThreshold,
        1
      );
      
      if (idleStrength > 0) {
        signals.push({
          type: 'temporal',
          subtype: 'extended_idle',
          strength: idleStrength,
          confidence: 0.9,
          timestamp: now,
          metadata: {
            idleDuration: timeSinceLastActivity,
            threshold: this.config.idleThreshold,
            graceExceeded: timeSinceLastActivity > this.config.idleGracePeriod
          }
        });
      }
    }

    // Activity burst after quiet period
    const quietPeriod = this.calculateQuietPeriodBefore(now);
    if (quietPeriod > this.config.idleThreshold * 0.5) {
      const recentEventCount = this.context.recentEvents
        .filter(e => now - e.timestamp < 60000) // Last minute
        .length;

      if (recentEventCount > 3) { // Burst of activity
        signals.push({
          type: 'temporal',
          subtype: 'activity_burst',
          strength: Math.min(recentEventCount / 10, 1),
          confidence: 0.7,
          timestamp: now,
          metadata: {
            quietPeriod,
            burstEventCount: recentEventCount
          }
        });
      }
    }

    // Navigation gap pattern
    const navigationGap = this.calculateNavigationGap(event);
    if (navigationGap > this.config.sessionGapThreshold) {
      const gapStrength = Math.min(navigationGap / (this.config.sessionGapThreshold * 2), 1);
      
      signals.push({
        type: 'temporal',
        subtype: 'navigation_gap',
        strength: gapStrength,
        confidence: 0.8,
        timestamp: now,
        metadata: {
          gap: navigationGap,
          threshold: this.config.sessionGapThreshold
        }
      });
    }

    return signals;
  }

  /**
   * Spatial signals - domain changes, URL patterns, site relationships
   */
  private async generateSpatialSignals(event: BrowsingEvent): Promise<DetectionSignal[]> {
    const signals: DetectionSignal[] = [];
    
    if (!event.url) return signals;

    const currentDomain = this.extractDomain(event.url);
    if (!currentDomain) return signals;

    // Significant domain change
    const domainChangeSignal = await this.analyzeDomainChange(currentDomain, event.timestamp);
    if (domainChangeSignal) {
      signals.push(domainChangeSignal);
    }

    // Domain category transition
    const categorySignal = await this.analyzeCategoryTransition(currentDomain, event.timestamp);
    if (categorySignal) {
      signals.push(categorySignal);
    }

    // URL pattern analysis
    const urlPatternSignal = await this.analyzeUrlPattern(event.url, event.timestamp);
    if (urlPatternSignal) {
      signals.push(urlPatternSignal);
    }

    return signals;
  }

  /**
   * Behavioral signals - tab patterns, window management, user habits
   */
  private async generateBehavioralSignals(event: BrowsingEvent): Promise<DetectionSignal[]> {
    const signals: DetectionSignal[] = [];

    // Tab clustering behavior
    if (event.type === 'tab_created' || event.type === 'tab_activated') {
      const clusteringSignal = await this.analyzeTabClustering(event);
      if (clusteringSignal) {
        signals.push(clusteringSignal);
      }
    }

    // Window management patterns
    if (event.type.includes('window_')) {
      const windowSignal = await this.analyzeWindowBehavior(event);
      if (windowSignal) {
        signals.push(windowSignal);
      }
    }

    // Navigation velocity changes
    const velocitySignal = await this.analyzeNavigationVelocity(event);
    if (velocitySignal) {
      signals.push(velocitySignal);
    }

    return signals;
  }

  /**
   * Contextual signals - time of day, work patterns, environmental context
   */
  private async generateContextualSignals(event: BrowsingEvent): Promise<DetectionSignal[]> {
    const signals: DetectionSignal[] = [];
    const now = new Date(event.timestamp);
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    // Work hour transitions
    const workTransitions = [9, 12, 17, 22]; // 9 AM, noon, 5 PM, 10 PM
    if (workTransitions.includes(hour)) {
      signals.push({
        type: 'contextual',
        subtype: 'work_transition',
        strength: 0.6,
        confidence: 0.5,
        timestamp: event.timestamp,
        metadata: {
          hour,
          transitionType: this.getWorkTransitionType(hour),
          isWeekday: dayOfWeek >= 1 && dayOfWeek <= 5
        }
      });
    }

    // Long session duration
    if (this.context.currentSession.duration > 8 * 60 * 60 * 1000) { // 8+ hours
      const durationStrength = Math.min(
        this.context.currentSession.duration / (12 * 60 * 60 * 1000),
        1
      );

      signals.push({
        type: 'contextual',
        subtype: 'long_session',
        strength: durationStrength,
        confidence: 0.7,
        timestamp: event.timestamp,
        metadata: {
          sessionDuration: this.context.currentSession.duration,
          maxRecommendedDuration: 8 * 60 * 60 * 1000
        }
      });
    }

    return signals;
  }

  /**
   * Learned signals - patterns from historical user behavior
   */
  private async generateLearnedSignals(event: BrowsingEvent): Promise<DetectionSignal[]> {
    const signals: DetectionSignal[] = [];

    // Check against learned patterns
    for (const pattern of this.patterns.values()) {
      const matchStrength = await this.calculatePatternMatch(event, pattern);
      
      if (matchStrength > this.config.patternConfidenceThreshold) {
        signals.push({
          type: 'learned',
          subtype: pattern.type,
          strength: matchStrength,
          confidence: pattern.confidence,
          timestamp: event.timestamp,
          metadata: {
            patternId: pattern.id,
            patternFrequency: pattern.frequency,
            lastSeen: pattern.lastSeen
          }
        });
      }
    }

    return signals;
  }

  /**
   * Analyze signals to determine if a session boundary should be created
   */
  private async analyzeSignalsForBoundary(
    signals: DetectionSignal[],
    event: BrowsingEvent
  ): Promise<SessionBoundary | null> {
    if (signals.length === 0) return null;

    // Calculate weighted signal strength
    const weightedStrength = this.calculateWeightedSignalStrength(signals);
    
    // Get adaptive threshold or use default
    const threshold = this.config.adaptiveThresholds
      ? this.context.adaptiveThresholds.get('boundary_threshold') || 0.7
      : 0.7;

    if (weightedStrength < threshold) return null;

    // Determine primary reason for boundary
    const primarySignal = signals.reduce((max, signal) => 
      (signal.strength * signal.confidence) > (max.strength * max.confidence) ? signal : max
    );

    // Create session boundary
    return this.createSessionBoundary(primarySignal, signals, event);
  }

  /**
   * Calculate weighted signal strength considering configuration weights
   */
  private calculateWeightedSignalStrength(signals: DetectionSignal[]): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const signal of signals) {
      let weight = 1;
      
      // Apply configuration weights
      switch (signal.type) {
        case 'temporal':
          weight = this.config.navigationPatternWeight;
          break;
        case 'spatial':
          weight = 1; // Default weight for spatial signals
          break;
        case 'behavioral':
          weight = this.config.userBehaviorWeight;
          break;
        case 'contextual':
          weight = this.config.timeOfDayWeight;
          break;
        case 'learned':
          weight = this.config.userBehaviorWeight * 1.2; // Boost learned patterns
          break;
      }

      const signalValue = signal.strength * signal.confidence;
      weightedSum += signalValue * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Create session boundary from signal analysis
   */
  private createSessionBoundary(
    primarySignal: DetectionSignal,
    allSignals: DetectionSignal[],
    event: BrowsingEvent
  ): SessionBoundary {
    let reason: SessionBoundary['reason'];
    
    switch (primarySignal.subtype) {
      case 'extended_idle':
        reason = 'idle_timeout';
        break;
      case 'domain_change':
      case 'category_transition':
        reason = 'domain_change';
        break;
      case 'navigation_gap':
        reason = 'navigation_gap';
        break;
      case 'window_closing':
        reason = 'window_closed';
        break;
      default:
        reason = 'user_initiated';
    }

    return {
      id: `boundary_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      type: 'end',
      reason,
      timestamp: event.timestamp,
      sessionId: '', // Will be set by SessionTracker
      metadata: {
        primarySignal: primarySignal.subtype,
        signalStrength: primarySignal.strength,
        signalConfidence: primarySignal.confidence,
        totalSignals: allSignals.length,
        allSignalTypes: allSignals.map(s => s.subtype),
        weightedStrength: this.calculateWeightedSignalStrength(allSignals),
        detectionEngine: 'enhanced',
        ...primarySignal.metadata
      }
    };
  }

  // =============================================================================
  // ANALYSIS METHODS
  // =============================================================================

  private async analyzeDomainChange(domain: string, timestamp: number): Promise<DetectionSignal | null> {
    const currentDomains = this.context.activeDomains;
    
    if (currentDomains.size === 0) {
      currentDomains.add(domain);
      return null; // First domain
    }

    // Check domain similarity
    const similarity = this.calculateDomainSimilarity(domain, currentDomains);
    
    if (similarity < this.config.domainSimilarityThreshold) {
      const strength = 1 - similarity; // Inverse relationship
      
      return {
        type: 'spatial',
        subtype: 'domain_change',
        strength,
        confidence: 0.8,
        timestamp,
        metadata: {
          newDomain: domain,
          previousDomains: Array.from(currentDomains),
          similarity
        }
      };
    }

    return null;
  }

  private async analyzeCategoryTransition(domain: string, timestamp: number): Promise<DetectionSignal | null> {
    const newCategory = this.getDomainCategory(domain);
    const currentCategories = new Set(
      Array.from(this.context.activeDomains).map(d => this.getDomainCategory(d))
    );

    if (currentCategories.size > 0 && !currentCategories.has(newCategory)) {
      return {
        type: 'spatial',
        subtype: 'category_transition',
        strength: 0.7,
        confidence: 0.6,
        timestamp,
        metadata: {
          newCategory,
          previousCategories: Array.from(currentCategories)
        }
      };
    }

    return null;
  }

  private async analyzeUrlPattern(url: string, timestamp: number): Promise<DetectionSignal | null> {
    // Analyze URL structure for patterns that suggest new sessions
    // e.g., switching from specific pages to general pages, login pages, etc.
    
    const urlFeatures = this.extractUrlFeatures(url);
    
    if (urlFeatures.isLoginPage || urlFeatures.isHomePage) {
      return {
        type: 'spatial',
        subtype: 'url_pattern',
        strength: 0.5,
        confidence: 0.4,
        timestamp,
        metadata: {
          urlFeatures,
          url: url.substring(0, 100) // Truncate for privacy
        }
      };
    }

    return null;
  }

  private async analyzeTabClustering(event: BrowsingEvent): Promise<DetectionSignal | null> {
    // Analyze if tabs are being created/activated in clusters
    const recentTabEvents = this.context.recentEvents
      .filter(e => e.type.includes('tab_') && event.timestamp - e.timestamp < 30000)
      .length;

    if (recentTabEvents > 5) { // Tab burst
      return {
        type: 'behavioral',
        subtype: 'tab_clustering',
        strength: Math.min(recentTabEvents / 10, 1),
        confidence: 0.6,
        timestamp: event.timestamp,
        metadata: {
          recentTabEvents,
          windowTime: 30000
        }
      };
    }

    return null;
  }

  private async analyzeWindowBehavior(event: BrowsingEvent): Promise<DetectionSignal | null> {
    if (event.type === 'window_removed' && this.context.currentSession.windowCount <= 2) {
      return {
        type: 'behavioral',
        subtype: 'window_closing',
        strength: this.context.currentSession.windowCount === 1 ? 0.9 : 0.6,
        confidence: 0.8,
        timestamp: event.timestamp,
        metadata: {
          remainingWindows: this.context.currentSession.windowCount - 1
        }
      };
    }

    return null;
  }

  private async analyzeNavigationVelocity(event: BrowsingEvent): Promise<DetectionSignal | null> {
    const currentVelocity = this.context.eventVelocity;
    const recentVelocity = this.calculateRecentVelocity();
    
    const velocityChange = Math.abs(currentVelocity - recentVelocity);
    
    if (velocityChange > 5) { // Significant velocity change
      return {
        type: 'behavioral',
        subtype: 'velocity_change',
        strength: Math.min(velocityChange / 20, 1),
        confidence: 0.5,
        timestamp: event.timestamp,
        metadata: {
          currentVelocity,
          recentVelocity,
          velocityChange
        }
      };
    }

    return null;
  }

  // =============================================================================
  // PATTERN LEARNING
  // =============================================================================

  private async updatePatterns(
    event: BrowsingEvent, 
    signals: DetectionSignal[], 
    boundary: SessionBoundary | null
  ): Promise<void> {
    // Learn from boundary creation
    if (boundary) {
      await this.learnFromBoundary(boundary, signals);
    }

    // Learn from signal patterns
    await this.learnFromSignals(event, signals);

    // Decay old patterns
    this.decayPatterns();
  }

  private async learnFromBoundary(boundary: SessionBoundary, signals: DetectionSignal[]): Promise<void> {
    // Create or update pattern for boundary creation
    const patternId = `boundary_${boundary.reason}`;
    const existingPattern = this.patterns.get(patternId);

    if (existingPattern) {
      existingPattern.frequency += 1;
      existingPattern.lastSeen = boundary.timestamp;
      existingPattern.confidence = Math.min(existingPattern.confidence + this.config.adaptationRate, 1);
    } else {
      this.patterns.set(patternId, {
        id: patternId,
        type: 'domain_switch', // This would be determined by the boundary reason
        pattern: signals.map(s => ({ type: s.type, subtype: s.subtype, strength: s.strength })),
        frequency: 1,
        lastSeen: boundary.timestamp,
        confidence: 0.5,
        userSpecific: true
      });
    }
  }

  private async learnFromSignals(event: BrowsingEvent, signals: DetectionSignal[]): Promise<void> {
    // Learn signal patterns that commonly occur together
    if (signals.length >= 2) {
      const patternKey = signals.map(s => s.subtype).sort().join('_');
      const patternId = `signal_pattern_${patternKey}`;
      
      const existingPattern = this.patterns.get(patternId);
      if (existingPattern) {
        existingPattern.frequency += 1;
        existingPattern.lastSeen = event.timestamp;
      } else if (signals.length <= 5) { // Don't create overly complex patterns
        this.patterns.set(patternId, {
          id: patternId,
          type: 'navigation_burst',
          pattern: signals.map(s => s.subtype),
          frequency: 1,
          lastSeen: event.timestamp,
          confidence: 0.3, // Start with low confidence
          userSpecific: true
        });
      }
    }
  }

  private decayPatterns(): void {
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    for (const [key, pattern] of this.patterns.entries()) {
      const age = now - pattern.lastSeen;
      
      // Remove very old patterns
      if (age > maxAge) {
        this.patterns.delete(key);
        continue;
      }

      // Decay confidence over time
      const decayFactor = 1 - (age / maxAge) * this.config.patternDecayRate;
      pattern.confidence *= Math.max(decayFactor, 0.1); // Minimum confidence 0.1
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private initializeContext(): DetectionContext {
    const now = Date.now();
    return {
      currentTime: now,
      timeOfDay: new Date(now).getHours(),
      dayOfWeek: new Date(now).getDay(),
      isWorkingHours: this.isWorkingHours(now),
      recentEvents: [],
      eventVelocity: 0,
      currentSession: {
        duration: 0,
        tabCount: 0,
        windowCount: 1,
        domainCount: 0,
        lastActivity: now
      },
      activeDomains: new Set(),
      domainCategories: new Map(),
      domainRelationships: new Map(),
      userPatterns: [],
      historicalBoundaries: [],
      adaptiveThresholds: new Map([
        ['boundary_threshold', 0.7],
        ['idle_threshold', 300000],
        ['domain_similarity_threshold', 0.3]
      ])
    };
  }

  private updateContext(event: BrowsingEvent): void {
    const now = event.timestamp;
    this.context.currentTime = now;
    this.context.timeOfDay = new Date(now).getHours();
    this.context.dayOfWeek = new Date(now).getDay();
    this.context.isWorkingHours = this.isWorkingHours(now);

    // Update recent events
    this.context.recentEvents.push(event);
    if (this.context.recentEvents.length > 50) {
      this.context.recentEvents = this.context.recentEvents.slice(-25);
    }

    // Update event velocity
    this.context.eventVelocity = this.calculateEventVelocity();

    // Update session context
    this.context.currentSession.lastActivity = now;
    this.context.currentSession.duration = now - (this.context.recentEvents[0]?.timestamp || now);

    // Update domains
    if (event.url) {
      const domain = this.extractDomain(event.url);
      if (domain) {
        this.context.activeDomains.add(domain);
        this.context.domainCategories.set(domain, this.getDomainCategory(domain));
        this.context.currentSession.domainCount = this.context.activeDomains.size;
      }
    }

    // Clean up old domains
    if (this.context.activeDomains.size > 15) {
      const recentDomains = new Set(
        this.context.recentEvents
          .slice(-20)
          .map(e => e.url ? this.extractDomain(e.url) : null)
          .filter(Boolean) as string[]
      );
      this.context.activeDomains = recentDomains;
    }
  }

  private updateAdaptiveThresholds(signals: DetectionSignal[], boundary: SessionBoundary | null): void {
    // Adjust thresholds based on detection accuracy
    const adjustmentRate = this.config.adaptationRate * 0.1; // Smaller adjustments

    if (boundary) {
      // Boundary was created - check if it seems appropriate
      const signalStrength = this.calculateWeightedSignalStrength(signals);
      const currentThreshold = this.context.adaptiveThresholds.get('boundary_threshold') || 0.7;
      
      if (signalStrength > currentThreshold * 1.5) {
        // Strong signal, could lower threshold slightly
        this.context.adaptiveThresholds.set(
          'boundary_threshold', 
          Math.max(currentThreshold - adjustmentRate, 0.5)
        );
      }
    } else if (signals.length > 0) {
      // No boundary created but signals present - might need to lower threshold
      const maxSignalStrength = Math.max(...signals.map(s => s.strength * s.confidence));
      const currentThreshold = this.context.adaptiveThresholds.get('boundary_threshold') || 0.7;
      
      if (maxSignalStrength > currentThreshold * 0.8) {
        // Close to threshold, might raise it slightly
        this.context.adaptiveThresholds.set(
          'boundary_threshold',
          Math.min(currentThreshold + adjustmentRate * 0.5, 0.9)
        );
      }
    }
  }

  private pruneSignalHistory(): void {
    const maxAge = 60 * 60 * 1000; // 1 hour
    const now = Date.now();
    
    this.signalHistory = this.signalHistory.filter(
      signal => now - signal.timestamp < maxAge
    );
    
    // Keep only last 200 signals
    if (this.signalHistory.length > 200) {
      this.signalHistory = this.signalHistory.slice(-100);
    }
  }

  private calculateEventVelocity(): number {
    const timeWindow = 5 * 60 * 1000; // 5 minutes
    const now = this.context.currentTime;
    
    const recentEvents = this.context.recentEvents.filter(
      e => now - e.timestamp < timeWindow
    ).length;
    
    return (recentEvents / timeWindow) * 60 * 1000; // Events per minute
  }

  private calculateRecentVelocity(): number {
    const timeWindow = 10 * 60 * 1000; // 10 minutes
    const now = this.context.currentTime;
    
    const olderEvents = this.context.recentEvents.filter(
      e => now - e.timestamp >= timeWindow && now - e.timestamp < timeWindow * 2
    ).length;
    
    return (olderEvents / timeWindow) * 60 * 1000; // Events per minute
  }

  private calculateQuietPeriodBefore(timestamp: number): number {
    const recentEvents = this.context.recentEvents
      .filter(e => e.timestamp < timestamp)
      .slice(-10);

    return recentEvents.length > 0 
      ? timestamp - recentEvents[recentEvents.length - 1].timestamp 
      : 0;
  }

  private calculateNavigationGap(event: BrowsingEvent): number {
    const navigationEvents = this.context.recentEvents
      .filter(e => this.isNavigationEvent(e.type))
      .slice(-2);

    if (navigationEvents.length < 2) return 0;

    return event.timestamp - navigationEvents[navigationEvents.length - 2].timestamp;
  }

  private calculateDomainSimilarity(domain: string, existingDomains: Set<string>): number {
    let maxSimilarity = 0;

    for (const existingDomain of existingDomains) {
      const similarity = this.calculatePairwiseDomainSimilarity(domain, existingDomain);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    return maxSimilarity;
  }

  private calculatePairwiseDomainSimilarity(domain1: string, domain2: string): number {
    // Same domain
    if (domain1 === domain2) return 1.0;

    // Same root domain
    if (this.hasSameRootDomain(domain1, domain2)) return 0.8;

    // Same category
    const cat1 = this.getDomainCategory(domain1);
    const cat2 = this.getDomainCategory(domain2);
    if (cat1 === cat2 && cat1 !== 'other') return 0.5;

    // Different domains
    return 0.0;
  }

  private hasSameRootDomain(domain1: string, domain2: string): boolean {
    const parts1 = domain1.split('.');
    const parts2 = domain2.split('.');
    
    if (parts1.length >= 2 && parts2.length >= 2) {
      const root1 = parts1.slice(-2).join('.');
      const root2 = parts2.slice(-2).join('.');
      return root1 === root2;
    }
    
    return false;
  }

  private async calculatePatternMatch(event: BrowsingEvent, pattern: BehaviorPattern): Promise<number> {
    // Simplified pattern matching - in real implementation this would be more sophisticated
    const eventFeatures = this.extractEventFeatures(event);
    
    // Check if event matches pattern type
    if (pattern.type === 'domain_switch' && event.url) {
      const domain = this.extractDomain(event.url);
      const category = domain ? this.getDomainCategory(domain) : 'other';
      
      // Check if this domain switch matches historical patterns
      return pattern.pattern.includes(category) ? pattern.confidence : 0;
    }

    return 0; // No match
  }

  private extractEventFeatures(event: BrowsingEvent): Record<string, any> {
    return {
      type: event.type,
      hasUrl: !!event.url,
      domain: event.url ? this.extractDomain(event.url) : null,
      timeOfDay: new Date(event.timestamp).getHours(),
      dayOfWeek: new Date(event.timestamp).getDay()
    };
  }

  private extractUrlFeatures(url: string): { isLoginPage: boolean; isHomePage: boolean; pathDepth: number } {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname.toLowerCase();
      
      return {
        isLoginPage: path.includes('login') || path.includes('signin') || path.includes('auth'),
        isHomePage: path === '/' || path === '',
        pathDepth: path.split('/').length - 1
      };
    } catch {
      return { isLoginPage: false, isHomePage: false, pathDepth: 0 };
    }
  }

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  private getDomainCategory(domain: string): string {
    const categories = {
      work: ['gmail.com', 'docs.google.com', 'slack.com', 'teams.microsoft.com', 'github.com', 'gitlab.com', 'bitbucket.org'],
      social: ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'reddit.com', 'discord.com'],
      shopping: ['amazon.com', 'ebay.com', 'shopify.com', 'etsy.com', 'alibaba.com'],
      news: ['cnn.com', 'bbc.com', 'reuters.com', 'news.google.com', 'nytimes.com'],
      entertainment: ['youtube.com', 'netflix.com', 'spotify.com', 'twitch.tv', 'hulu.com'],
      search: ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com'],
      reference: ['wikipedia.org', 'stackoverflow.com', 'mdn.mozilla.org', 'w3schools.com']
    };

    for (const [category, domains] of Object.entries(categories)) {
      if (domains.some(d => domain.includes(d) || d.includes(domain))) {
        return category;
      }
    }

    return 'other';
  }

  private isNavigationEvent(eventType: EventType): boolean {
    return [
      'navigation_started',
      'navigation_completed',
      'navigation_committed',
      'page_loaded'
    ].includes(eventType);
  }

  private isWorkingHours(timestamp: number): boolean {
    const date = new Date(timestamp);
    const hour = date.getHours();
    const day = date.getDay();
    
    return day >= 1 && day <= 5 && hour >= 9 && hour <= 17; // Monday-Friday, 9 AM - 5 PM
  }

  private getWorkTransitionType(hour: number): string {
    switch (hour) {
      case 9: return 'work_start';
      case 12: return 'lunch_break';
      case 17: return 'work_end';
      case 22: return 'evening_wind_down';
      default: return 'other';
    }
  }

  // =============================================================================
  // PUBLIC API
  // =============================================================================

  /**
   * Update detection configuration
   */
  updateConfig(newConfig: Partial<DetectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get detection statistics
   */
  getDetectionStats() {
    return {
      signalHistory: this.signalHistory.length,
      patternsLearned: this.patterns.size,
      activeDomains: this.context.activeDomains.size,
      recentEvents: this.context.recentEvents.length,
      eventVelocity: this.context.eventVelocity,
      adaptiveThresholds: Object.fromEntries(this.context.adaptiveThresholds),
      lastDetection: this.lastDetection
    };
  }

  /**
   * Get learned patterns
   */
  getLearnedPatterns(): BehaviorPattern[] {
    return Array.from(this.patterns.values())
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Reset detection state
   */
  reset(): void {
    this.context = this.initializeContext();
    this.signalHistory = [];
    this.lastDetection = 0;
    // Keep learned patterns but reset their frequencies
    for (const pattern of this.patterns.values()) {
      pattern.frequency = Math.max(1, Math.floor(pattern.frequency * 0.5));
    }
  }

  /**
   * Export detection data for analysis
   */
  exportDetectionData() {
    return {
      config: this.config,
      context: {
        ...this.context,
        recentEvents: this.context.recentEvents.slice(-10), // Only recent events
        activeDomains: Array.from(this.context.activeDomains),
        domainCategories: Object.fromEntries(this.context.domainCategories),
        adaptiveThresholds: Object.fromEntries(this.context.adaptiveThresholds)
      },
      patterns: this.getLearnedPatterns(),
      recentSignals: this.signalHistory.slice(-20),
      stats: this.getDetectionStats()
    };
  }
}