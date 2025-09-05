/**
 * Navigation pattern analysis and sequence recording
 * Monitors page navigation, analyzes browsing patterns, and detects user workflows
 */

import {
  BrowsingEvent,
  NavigationEvent,
  NavigationPattern,
  NavigationStep,
  NavigationTransition,
  TrackingConfig,
  EventType,
  EventMetadata
} from '../shared/types';
import { EventTracker } from './EventTracker';

interface NavigationState {
  currentUrl: string;
  previousUrl?: string;
  startTime: number;
  endTime?: number;
  timeSpent: number;
  scrollEvents: number;
  interactions: number;
  transitionType: NavigationTransition;
  referrer?: string;
  loadTime?: number;
  renderTime?: number;
}

interface NavigationSequence {
  id: string;
  sessionId: string;
  tabId: number;
  steps: NavigationStep[];
  startTime: number;
  endTime?: number;
  totalTime: number;
  pattern?: NavigationPattern;
}

interface DomainMetrics {
  domain: string;
  visitCount: number;
  totalTime: number;
  averageTime: number;
  lastVisit: number;
  commonPaths: Map<string, number>;
  entryPoints: Map<string, number>;
  exitPoints: Map<string, number>;
}

export class NavigationTracker {
  private config: TrackingConfig;
  private eventHandler: (event: BrowsingEvent) => Promise<void>;
  
  // Navigation state tracking
  private activeNavigations = new Map<number, NavigationState>();
  private navigationSequences = new Map<number, NavigationSequence>();
  private domainMetrics = new Map<string, DomainMetrics>();
  private detectedPatterns = new Map<string, NavigationPattern>();
  
  // Pattern detection
  private sequenceBuffer: NavigationStep[] = [];
  private maxSequenceLength = 20;
  private patternConfidenceThreshold = 0.7;

  constructor(config: TrackingConfig, eventHandler: (event: BrowsingEvent) => Promise<void>) {
    this.config = config;
    this.eventHandler = eventHandler;
  }

  /**
   * Initialize navigation tracking
   */
  async initialize(): Promise<void> {
    console.log('Initializing NavigationTracker...');
    
    // Load existing patterns and metrics
    await this.loadNavigationData();
    
    console.log('NavigationTracker initialized');
  }

  /**
   * Shutdown navigation tracking
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down NavigationTracker...');
    
    // Finalize active navigations
    await this.finalizeActiveNavigations();
    
    // Save navigation data
    await this.saveNavigationData();
    
    // Clean up resources
    this.activeNavigations.clear();
    this.navigationSequences.clear();
    this.sequenceBuffer = [];
    
    console.log('NavigationTracker shutdown complete');
  }

  /**
   * Process navigation events
   */
  async processEvent(navigationEvent: NavigationEvent): Promise<void> {
    if (!this.config.enableNavigationTracking) {
      return;
    }

    const sessionId = this.getCurrentSessionId();
    const now = Date.now();

    // Finalize previous navigation if exists
    await this.finalizeNavigation(navigationEvent.tabId, now);

    // Start new navigation tracking
    await this.startNavigation(navigationEvent, sessionId, now);

    // Analyze navigation patterns
    await this.analyzeNavigationPattern(navigationEvent, sessionId);

    // Update domain metrics
    await this.updateDomainMetrics(navigationEvent, now);
  }

  /**
   * Start tracking a new navigation
   */
  private async startNavigation(navigationEvent: NavigationEvent, sessionId: string, timestamp: number): Promise<void> {
    const url = navigationEvent.url;
    let domain = '';
    
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = 'unknown';
    }

    const navigationState: NavigationState = {
      currentUrl: url,
      previousUrl: navigationEvent.referrer,
      startTime: timestamp,
      timeSpent: 0,
      scrollEvents: 0,
      interactions: 0,
      transitionType: navigationEvent.transitionType,
      referrer: navigationEvent.referrer
    };

    this.activeNavigations.set(navigationEvent.tabId, navigationState);

    // Create navigation sequence if not exists
    if (!this.navigationSequences.has(navigationEvent.tabId)) {
      const sequence: NavigationSequence = {
        id: `nav_${navigationEvent.tabId}_${timestamp}`,
        sessionId,
        tabId: navigationEvent.tabId,
        steps: [],
        startTime: timestamp,
        totalTime: 0
      };
      this.navigationSequences.set(navigationEvent.tabId, sequence);
    }

    // Emit navigation event
    const event = EventTracker.createEvent(
      'navigation_started',
      sessionId,
      this.createNavigationEventMetadata(navigationState, { domain }),
      navigationEvent.tabId,
      undefined,
      url
    );

    await this.eventHandler(event);
  }

  /**
   * Finalize a completed navigation
   */
  private async finalizeNavigation(tabId: number, timestamp: number): Promise<void> {
    const navigationState = this.activeNavigations.get(tabId);
    if (!navigationState) {
      return;
    }

    // Calculate time spent
    navigationState.endTime = timestamp;
    navigationState.timeSpent = timestamp - navigationState.startTime;

    // Add to navigation sequence
    const sequence = this.navigationSequences.get(tabId);
    if (sequence) {
      const step: NavigationStep = {
        url: navigationState.currentUrl,
        title: '', // Would be populated from tab info
        domain: this.extractDomain(navigationState.currentUrl),
        timestamp: navigationState.startTime,
        timeSpent: navigationState.timeSpent,
        transitionType: navigationState.transitionType,
        tabId
      };
      
      sequence.steps.push(step);
      sequence.totalTime += navigationState.timeSpent;
      sequence.endTime = timestamp;

      // Add to sequence buffer for pattern detection
      this.addToSequenceBuffer(step);
    }

    // Emit completion event
    const sessionId = this.getCurrentSessionId();
    const event = EventTracker.createEvent(
      'navigation_completed',
      sessionId,
      this.createNavigationEventMetadata(navigationState, {
        timeSpent: navigationState.timeSpent,
        scrollEvents: navigationState.scrollEvents,
        interactions: navigationState.interactions,
        completed: true
      }),
      tabId,
      undefined,
      navigationState.currentUrl
    );

    await this.eventHandler(event);

    // Clean up
    this.activeNavigations.delete(tabId);
  }

  /**
   * Update navigation metrics (scroll, interaction events)
   */
  async updateNavigationMetrics(tabId: number, type: 'scroll' | 'interaction', data?: any): Promise<void> {
    const navigationState = this.activeNavigations.get(tabId);
    if (!navigationState) {
      return;
    }

    switch (type) {
      case 'scroll':
        navigationState.scrollEvents++;
        break;
      case 'interaction':
        navigationState.interactions++;
        break;
    }

    // Update time spent
    navigationState.timeSpent = Date.now() - navigationState.startTime;
  }

  /**
   * Record navigation performance metrics
   */
  async recordPerformanceMetrics(tabId: number, loadTime: number, renderTime?: number): Promise<void> {
    const navigationState = this.activeNavigations.get(tabId);
    if (navigationState) {
      navigationState.loadTime = loadTime;
      navigationState.renderTime = renderTime;
    }
  }

  /**
   * Analyze navigation patterns
   */
  private async analyzeNavigationPattern(navigationEvent: NavigationEvent, sessionId: string): Promise<void> {
    const sequence = this.navigationSequences.get(navigationEvent.tabId);
    if (!sequence || sequence.steps.length < 3) {
      return;
    }

    // Look for recurring patterns in the sequence
    const recentSteps = sequence.steps.slice(-10); // Analyze last 10 steps
    const patterns = this.detectPatterns(recentSteps);

    for (const pattern of patterns) {
      await this.updateOrCreatePattern(pattern, sessionId);
    }
  }

  /**
   * Detect navigation patterns in a sequence
   */
  private detectPatterns(steps: NavigationStep[]): NavigationPattern[] {
    const patterns: NavigationPattern[] = [];
    
    // Detect linear patterns (A -> B -> C)
    patterns.push(...this.detectLinearPatterns(steps));
    
    // Detect cyclical patterns (A -> B -> A)
    patterns.push(...this.detectCyclicalPatterns(steps));
    
    // Detect domain-based patterns
    patterns.push(...this.detectDomainPatterns(steps));

    return patterns;
  }

  /**
   * Detect linear navigation patterns
   */
  private detectLinearPatterns(steps: NavigationStep[]): NavigationPattern[] {
    const patterns: NavigationPattern[] = [];
    const minPatternLength = 3;
    const maxPatternLength = 5;

    for (let length = minPatternLength; length <= maxPatternLength && length <= steps.length; length++) {
      for (let i = 0; i <= steps.length - length; i++) {
        const sequence = steps.slice(i, i + length);
        const patternId = this.generatePatternId(sequence, 'linear');
        
        // Check if this exact sequence appears elsewhere
        const occurrences = this.countSequenceOccurrences(sequence, steps);
        if (occurrences >= 2) {
          patterns.push({
            id: patternId,
            sequence,
            patternType: 'linear',
            frequency: occurrences,
            lastSeen: sequence[sequence.length - 1].timestamp,
            confidence: this.calculatePatternConfidence(sequence, occurrences)
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Detect cyclical navigation patterns
   */
  private detectCyclicalPatterns(steps: NavigationStep[]): NavigationPattern[] {
    const patterns: NavigationPattern[] = [];
    const domainSequences: { [key: string]: NavigationStep[] } = {};

    // Group steps by domain
    for (const step of steps) {
      if (!domainSequences[step.domain]) {
        domainSequences[step.domain] = [];
      }
      domainSequences[step.domain].push(step);
    }

    // Look for back-and-forth patterns
    for (const [domain, domainSteps] of Object.entries(domainSequences)) {
      if (domainSteps.length >= 3) {
        // Check for A -> B -> A patterns
        const cycles = this.findCycles(domainSteps);
        for (const cycle of cycles) {
          const patternId = this.generatePatternId(cycle, 'cyclical');
          patterns.push({
            id: patternId,
            sequence: cycle,
            patternType: 'cyclical',
            frequency: 1, // Would need more sophisticated counting
            lastSeen: cycle[cycle.length - 1].timestamp,
            confidence: this.calculateCyclicalConfidence(cycle)
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Detect domain-based patterns
   */
  private detectDomainPatterns(steps: NavigationStep[]): NavigationPattern[] {
    const patterns: NavigationPattern[] = [];
    const domainSequence = steps.map(s => s.domain);
    
    // Find common domain transitions
    for (let i = 0; i < domainSequence.length - 1; i++) {
      const from = domainSequence[i];
      const to = domainSequence[i + 1];
      
      if (from !== to) {
        const transition = `${from}->${to}`;
        const occurrences = this.countDomainTransitions(transition, domainSequence);
        
        if (occurrences >= 3) {
          const patternSteps = steps.filter((s, idx) => 
            idx > 0 && 
            steps[idx - 1].domain === from && 
            s.domain === to
          ).slice(0, 2); // Representative steps

          if (patternSteps.length >= 2) {
            patterns.push({
              id: `domain_${transition}_${Date.now()}`,
              sequence: patternSteps,
              patternType: 'branching',
              frequency: occurrences,
              lastSeen: patternSteps[patternSteps.length - 1].timestamp,
              confidence: Math.min(occurrences / 10, 1.0)
            });
          }
        }
      }
    }

    return patterns;
  }

  /**
   * Update domain metrics
   */
  private async updateDomainMetrics(navigationEvent: NavigationEvent, timestamp: number): Promise<void> {
    const domain = this.extractDomain(navigationEvent.url);
    if (!domain) return;

    let metrics = this.domainMetrics.get(domain);
    if (!metrics) {
      metrics = {
        domain,
        visitCount: 0,
        totalTime: 0,
        averageTime: 0,
        lastVisit: timestamp,
        commonPaths: new Map(),
        entryPoints: new Map(),
        exitPoints: new Map()
      };
      this.domainMetrics.set(domain, metrics);
    }

    metrics.visitCount++;
    metrics.lastVisit = timestamp;

    // Update path tracking
    const path = this.extractPath(navigationEvent.url);
    const pathCount = metrics.commonPaths.get(path) || 0;
    metrics.commonPaths.set(path, pathCount + 1);

    // Update entry points (no referrer or different domain referrer)
    if (!navigationEvent.referrer || this.extractDomain(navigationEvent.referrer) !== domain) {
      const entryCount = metrics.entryPoints.get(path) || 0;
      metrics.entryPoints.set(path, entryCount + 1);
    }
  }

  /**
   * Add step to sequence buffer for pattern analysis
   */
  private addToSequenceBuffer(step: NavigationStep): void {
    this.sequenceBuffer.push(step);
    
    // Keep buffer size manageable
    if (this.sequenceBuffer.length > this.maxSequenceLength) {
      this.sequenceBuffer.shift();
    }
  }

  /**
   * Helper methods for pattern detection
   */
  private countSequenceOccurrences(pattern: NavigationStep[], steps: NavigationStep[]): number {
    let count = 0;
    for (let i = 0; i <= steps.length - pattern.length; i++) {
      if (this.sequencesMatch(pattern, steps.slice(i, i + pattern.length))) {
        count++;
      }
    }
    return count;
  }

  private countDomainTransitions(transition: string, domainSequence: string[]): number {
    let count = 0;
    const [from, to] = transition.split('->');
    
    for (let i = 0; i < domainSequence.length - 1; i++) {
      if (domainSequence[i] === from && domainSequence[i + 1] === to) {
        count++;
      }
    }
    return count;
  }

  private sequencesMatch(seq1: NavigationStep[], seq2: NavigationStep[]): boolean {
    if (seq1.length !== seq2.length) return false;
    
    for (let i = 0; i < seq1.length; i++) {
      if (seq1[i].domain !== seq2[i].domain || 
          Math.abs(seq1[i].timeSpent - seq2[i].timeSpent) > 30000) { // 30s tolerance
        return false;
      }
    }
    return true;
  }

  private findCycles(steps: NavigationStep[]): NavigationStep[][] {
    const cycles: NavigationStep[][] = [];
    
    for (let i = 0; i < steps.length - 2; i++) {
      for (let j = i + 2; j < steps.length; j++) {
        if (steps[i].domain === steps[j].domain) {
          const cycle = steps.slice(i, j + 1);
          if (cycle.length >= 3 && cycle.length <= 6) {
            cycles.push(cycle);
          }
        }
      }
    }
    
    return cycles;
  }

  private generatePatternId(sequence: NavigationStep[], type: string): string {
    const domains = sequence.map(s => s.domain).join('-');
    return `${type}_${domains}_${Date.now()}`;
  }

  private calculatePatternConfidence(sequence: NavigationStep[], frequency: number): number {
    const baseConfidence = Math.min(frequency / 5, 1.0);
    const lengthFactor = Math.min(sequence.length / 5, 1.0);
    return (baseConfidence + lengthFactor) / 2;
  }

  private calculateCyclicalConfidence(cycle: NavigationStep[]): number {
    const lengthPenalty = cycle.length > 6 ? 0.5 : 1.0;
    const timingConsistency = this.calculateTimingConsistency(cycle);
    return (0.7 + timingConsistency * 0.3) * lengthPenalty;
  }

  private calculateTimingConsistency(steps: NavigationStep[]): number {
    if (steps.length < 2) return 1.0;
    
    const times = steps.map(s => s.timeSpent);
    const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
    const variance = times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length;
    const standardDev = Math.sqrt(variance);
    
    // Lower variance = higher consistency
    return Math.max(0, 1 - (standardDev / avg));
  }

  /**
   * Update or create navigation pattern
   */
  private async updateOrCreatePattern(pattern: NavigationPattern, sessionId: string): Promise<void> {
    if (pattern.confidence < this.patternConfidenceThreshold) {
      return;
    }

    const existingPattern = this.detectedPatterns.get(pattern.id);
    if (existingPattern) {
      existingPattern.frequency += pattern.frequency;
      existingPattern.lastSeen = pattern.lastSeen;
      existingPattern.confidence = Math.min(existingPattern.confidence * 1.1, 1.0);
    } else {
      this.detectedPatterns.set(pattern.id, pattern);
    }

    // Emit pattern detection event
    const event = EventTracker.createEvent(
      'navigation_completed', // Could add specific pattern event type
      sessionId,
      {
        patternDetected: true,
        pattern: pattern,
        patternType: pattern.patternType,
        confidence: pattern.confidence
      }
    );

    await this.eventHandler(event);
  }

  /**
   * Utility methods
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  private extractPath(url: string): string {
    try {
      return new URL(url).pathname;
    } catch {
      return '/';
    }
  }

  private getCurrentSessionId(): string {
    // This would typically come from the SessionTracker
    return 'session_' + Date.now();
  }

  private createNavigationEventMetadata(state: NavigationState, additionalData?: any): EventMetadata {
    return {
      ...additionalData,
      transitionType: state.transitionType,
      referrer: state.referrer,
      timeSpent: state.timeSpent,
      scrollEvents: state.scrollEvents,
      interactions: state.interactions,
      loadTime: state.loadTime,
      renderTime: state.renderTime
    };
  }

  /**
   * Finalize all active navigations
   */
  private async finalizeActiveNavigations(): Promise<void> {
    const now = Date.now();
    const activeTabIds = Array.from(this.activeNavigations.keys());
    
    for (const tabId of activeTabIds) {
      await this.finalizeNavigation(tabId, now);
    }
  }

  /**
   * Get navigation statistics
   */
  getNavigationStats() {
    return {
      activeNavigations: this.activeNavigations.size,
      totalSequences: this.navigationSequences.size,
      detectedPatterns: this.detectedPatterns.size,
      trackedDomains: this.domainMetrics.size,
      sequenceBufferSize: this.sequenceBuffer.length
    };
  }

  /**
   * Get domain metrics
   */
  getDomainMetrics(): Map<string, DomainMetrics> {
    return new Map(this.domainMetrics);
  }

  /**
   * Get detected patterns
   */
  getDetectedPatterns(): Map<string, NavigationPattern> {
    return new Map(this.detectedPatterns);
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: TrackingConfig): Promise<void> {
    this.config = newConfig;
  }

  /**
   * Load navigation data from storage (implementation placeholder)
   */
  private async loadNavigationData(): Promise<void> {
    // Implementation would load from storage
  }

  /**
   * Save navigation data to storage (implementation placeholder)
   */
  private async saveNavigationData(): Promise<void> {
    // Implementation would save to storage
  }
}