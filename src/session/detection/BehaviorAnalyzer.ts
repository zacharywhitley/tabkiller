/**
 * Behavior Analysis Utilities
 * Advanced analysis of user browsing patterns for session detection
 */

import {
  BrowsingEvent,
  EventType,
  NavigationTransition,
  TimeRange,
  ProductivityMetrics
} from '../../shared/types';

// =============================================================================
// BEHAVIOR ANALYSIS TYPES
// =============================================================================

export interface BehaviorMetrics {
  // Temporal patterns
  averageSessionDuration: number;
  averageIdleTime: number;
  peakActivityHours: number[];
  activityDistribution: Map<number, number>; // hour -> event count
  
  // Navigation patterns
  averageNavigationGap: number;
  navigationVelocity: number; // events per minute
  domainSwitchFrequency: number;
  backNavigationRatio: number;
  
  // Tab management patterns
  averageTabsPerSession: number;
  maxConcurrentTabs: number;
  tabCreationPatterns: Map<string, number>; // creation method -> count
  tabClosePatterns: Map<string, number>; // close reason -> count
  
  // Focus patterns
  averageFocusTime: number; // time spent on single tab
  distractionFrequency: number; // tab switches per minute
  deepWorkSessions: TimeRange[];
  multiTaskingSessions: TimeRange[];
  
  // Domain patterns
  domainCategories: Map<string, number>; // category -> time spent
  domainTransitions: Map<string, Map<string, number>>; // from -> to -> count
  domainAffinity: Map<string, number>; // domain -> affinity score
}

export interface BehaviorPattern {
  id: string;
  name: string;
  description: string;
  pattern: any[];
  confidence: number;
  frequency: number;
  lastSeen: number;
  predictive: boolean;
}

export interface TimeGapAnalysis {
  gaps: number[];
  averageGap: number;
  medianGap: number;
  gapDistribution: Map<string, number>; // gap range -> count
  patterns: {
    type: 'consistent' | 'increasing' | 'decreasing' | 'random';
    confidence: number;
    description: string;
  };
}

export interface DomainChangeAnalysis {
  changes: Array<{
    from: string;
    to: string;
    timestamp: number;
    category: string;
    significance: number;
  }>;
  changeFrequency: number;
  categoryTransitions: Map<string, Map<string, number>>;
  patterns: {
    type: 'focused' | 'exploratory' | 'task_switching' | 'random';
    confidence: number;
    description: string;
  };
}

export interface ActivityBurstAnalysis {
  bursts: Array<{
    start: number;
    end: number;
    eventCount: number;
    intensity: number;
    triggerEvent?: BrowsingEvent;
  }>;
  burstFrequency: number;
  averageBurstDuration: number;
  burstPatterns: {
    type: 'regular' | 'irregular' | 'task_driven' | 'random';
    confidence: number;
  };
}

// =============================================================================
// BEHAVIOR ANALYZER
// =============================================================================

export class BehaviorAnalyzer {
  private eventHistory: BrowsingEvent[] = [];
  private metrics: BehaviorMetrics | null = null;
  private patterns: Map<string, BehaviorPattern> = new Map();
  private lastAnalysis: number = 0;

  constructor(private maxHistorySize: number = 10000) {}

  /**
   * Add event to analysis history
   */
  addEvent(event: BrowsingEvent): void {
    this.eventHistory.push(event);
    
    // Keep history size manageable
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize * 0.8);
    }
  }

  /**
   * Analyze time gaps between events
   */
  analyzeTimeGaps(events: BrowsingEvent[] = this.eventHistory): TimeGapAnalysis {
    if (events.length < 2) {
      return {
        gaps: [],
        averageGap: 0,
        medianGap: 0,
        gapDistribution: new Map(),
        patterns: {
          type: 'random',
          confidence: 0,
          description: 'Insufficient data for analysis'
        }
      };
    }

    // Calculate gaps between consecutive events
    const gaps = [];
    for (let i = 1; i < events.length; i++) {
      const gap = events[i].timestamp - events[i - 1].timestamp;
      if (gap > 0) gaps.push(gap);
    }

    if (gaps.length === 0) {
      return {
        gaps: [],
        averageGap: 0,
        medianGap: 0,
        gapDistribution: new Map(),
        patterns: {
          type: 'random',
          confidence: 0,
          description: 'No valid gaps found'
        }
      };
    }

    // Calculate statistics
    const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];

    // Create gap distribution
    const gapDistribution = new Map<string, number>();
    const gapRanges = [
      { label: '0-1s', min: 0, max: 1000 },
      { label: '1-5s', min: 1000, max: 5000 },
      { label: '5-30s', min: 5000, max: 30000 },
      { label: '30s-5m', min: 30000, max: 300000 },
      { label: '5m-30m', min: 300000, max: 1800000 },
      { label: '30m+', min: 1800000, max: Infinity }
    ];

    for (const range of gapRanges) {
      const count = gaps.filter(gap => gap >= range.min && gap < range.max).length;
      if (count > 0) {
        gapDistribution.set(range.label, count);
      }
    }

    // Analyze patterns
    const patterns = this.analyzeGapPatterns(gaps);

    return {
      gaps,
      averageGap,
      medianGap,
      gapDistribution,
      patterns
    };
  }

  /**
   * Analyze domain change patterns
   */
  analyzeDomainChanges(events: BrowsingEvent[] = this.eventHistory): DomainChangeAnalysis {
    const changes = [];
    const categoryTransitions = new Map<string, Map<string, number>>();

    let previousDomain: string | null = null;
    let previousCategory: string | null = null;

    for (const event of events) {
      if (event.url) {
        const domain = this.extractDomain(event.url);
        const category = this.getDomainCategory(domain);

        if (previousDomain && domain !== previousDomain) {
          const significance = this.calculateDomainChangeSignificance(previousDomain, domain);
          
          changes.push({
            from: previousDomain,
            to: domain,
            timestamp: event.timestamp,
            category,
            significance
          });

          // Track category transitions
          if (previousCategory) {
            if (!categoryTransitions.has(previousCategory)) {
              categoryTransitions.set(previousCategory, new Map());
            }
            const transitions = categoryTransitions.get(previousCategory)!;
            transitions.set(category, (transitions.get(category) || 0) + 1);
          }
        }

        previousDomain = domain;
        previousCategory = category;
      }
    }

    // Calculate change frequency (changes per hour)
    const sessionDuration = events.length > 1 
      ? events[events.length - 1].timestamp - events[0].timestamp
      : 0;
    const changeFrequency = sessionDuration > 0 
      ? (changes.length / sessionDuration) * 3600000 // per hour
      : 0;

    // Analyze patterns
    const patterns = this.analyzeDomainChangePatterns(changes);

    return {
      changes,
      changeFrequency,
      categoryTransitions,
      patterns
    };
  }

  /**
   * Analyze activity bursts - periods of high event frequency
   */
  analyzeActivityBursts(events: BrowsingEvent[] = this.eventHistory): ActivityBurstAnalysis {
    if (events.length < 10) {
      return {
        bursts: [],
        burstFrequency: 0,
        averageBurstDuration: 0,
        burstPatterns: {
          type: 'random',
          confidence: 0
        }
      };
    }

    const bursts = [];
    const burstThreshold = 5; // minimum events per minute for a burst
    const windowSize = 60000; // 1 minute window
    const minBurstDuration = 30000; // 30 seconds minimum

    let currentBurst: {
      start: number;
      end: number;
      events: BrowsingEvent[];
      eventCount: number;
      intensity: number;
    } | null = null;

    // Sliding window analysis
    for (let i = 0; i < events.length; i++) {
      const windowStart = events[i].timestamp;
      const windowEnd = windowStart + windowSize;
      
      // Count events in window
      const windowEvents = events.filter(e => 
        e.timestamp >= windowStart && e.timestamp < windowEnd
      );

      const eventRate = windowEvents.length; // events per minute
      const intensity = eventRate / burstThreshold; // normalized intensity

      if (eventRate >= burstThreshold) {
        if (!currentBurst) {
          // Start new burst
          currentBurst = {
            start: windowStart,
            end: windowStart,
            events: [...windowEvents],
            eventCount: windowEvents.length,
            intensity
          };
        } else {
          // Extend current burst
          currentBurst.end = windowStart;
          currentBurst.eventCount += windowEvents.length;
          currentBurst.intensity = Math.max(currentBurst.intensity, intensity);
        }
      } else if (currentBurst && windowStart - currentBurst.end > windowSize) {
        // End current burst if gap is too large
        if (currentBurst.end - currentBurst.start >= minBurstDuration) {
          bursts.push({
            start: currentBurst.start,
            end: currentBurst.end,
            eventCount: currentBurst.eventCount,
            intensity: currentBurst.intensity,
            triggerEvent: currentBurst.events[0]
          });
        }
        currentBurst = null;
      }
    }

    // Don't forget the last burst
    if (currentBurst && currentBurst.end - currentBurst.start >= minBurstDuration) {
      bursts.push({
        start: currentBurst.start,
        end: currentBurst.end,
        eventCount: currentBurst.eventCount,
        intensity: currentBurst.intensity,
        triggerEvent: currentBurst.events[0]
      });
    }

    // Calculate statistics
    const totalDuration = events.length > 1 
      ? events[events.length - 1].timestamp - events[0].timestamp
      : 0;
    const burstFrequency = totalDuration > 0 
      ? (bursts.length / totalDuration) * 3600000 // bursts per hour
      : 0;
    const averageBurstDuration = bursts.length > 0
      ? bursts.reduce((sum, burst) => sum + (burst.end - burst.start), 0) / bursts.length
      : 0;

    // Analyze burst patterns
    const burstPatterns = this.analyzeBurstPatterns(bursts);

    return {
      bursts,
      burstFrequency,
      averageBurstDuration,
      burstPatterns
    };
  }

  /**
   * Calculate comprehensive behavior metrics
   */
  calculateBehaviorMetrics(events: BrowsingEvent[] = this.eventHistory): BehaviorMetrics {
    if (events.length === 0) {
      return this.createEmptyMetrics();
    }

    // Basic temporal analysis
    const sessionDuration = events.length > 1 
      ? events[events.length - 1].timestamp - events[0].timestamp
      : 0;
    
    // Activity distribution by hour
    const activityDistribution = new Map<number, number>();
    for (const event of events) {
      const hour = new Date(event.timestamp).getHours();
      activityDistribution.set(hour, (activityDistribution.get(hour) || 0) + 1);
    }

    // Find peak activity hours
    const peakActivityHours = Array.from(activityDistribution.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => hour);

    // Navigation analysis
    const navigationEvents = events.filter(e => this.isNavigationEvent(e.type));
    const timeGaps = this.analyzeTimeGaps(navigationEvents);
    const averageNavigationGap = timeGaps.averageGap;
    const navigationVelocity = navigationEvents.length > 0 && sessionDuration > 0
      ? (navigationEvents.length / sessionDuration) * 60000 // per minute
      : 0;

    // Domain analysis
    const domainChanges = this.analyzeDomainChanges(events);
    const domainSwitchFrequency = domainChanges.changeFrequency;

    // Tab analysis
    const tabEvents = events.filter(e => e.type.includes('tab_'));
    const tabCreateEvents = tabEvents.filter(e => e.type === 'tab_created');
    const tabActivateEvents = tabEvents.filter(e => e.type === 'tab_activated');
    
    const averageTabsPerSession = this.estimateAverageTabsPerSession(events);
    const maxConcurrentTabs = this.estimateMaxConcurrentTabs(events);

    // Focus patterns
    const focusAnalysis = this.analyzeFocusPatterns(events);
    
    // Create comprehensive metrics
    const metrics: BehaviorMetrics = {
      // Temporal patterns
      averageSessionDuration: sessionDuration,
      averageIdleTime: this.calculateAverageIdleTime(events),
      peakActivityHours,
      activityDistribution,
      
      // Navigation patterns
      averageNavigationGap,
      navigationVelocity,
      domainSwitchFrequency,
      backNavigationRatio: this.calculateBackNavigationRatio(events),
      
      // Tab management patterns
      averageTabsPerSession,
      maxConcurrentTabs,
      tabCreationPatterns: this.analyzeTabCreationPatterns(tabCreateEvents),
      tabClosePatterns: this.analyzeTabClosePatterns(events),
      
      // Focus patterns
      averageFocusTime: focusAnalysis.averageFocusTime,
      distractionFrequency: focusAnalysis.distractionFrequency,
      deepWorkSessions: focusAnalysis.deepWorkSessions,
      multiTaskingSessions: focusAnalysis.multiTaskingSessions,
      
      // Domain patterns
      domainCategories: this.calculateDomainCategoryTime(events),
      domainTransitions: domainChanges.categoryTransitions,
      domainAffinity: this.calculateDomainAffinity(events)
    };

    this.metrics = metrics;
    this.lastAnalysis = Date.now();
    return metrics;
  }

  /**
   * Detect behavioral patterns that could indicate session boundaries
   */
  detectBoundaryPatterns(recentEvents: BrowsingEvent[]): BehaviorPattern[] {
    const patterns: BehaviorPattern[] = [];

    // Pattern 1: Idle-to-activity transition
    const idlePattern = this.detectIdleToActivityPattern(recentEvents);
    if (idlePattern) patterns.push(idlePattern);

    // Pattern 2: Domain category switch
    const domainPattern = this.detectDomainCategorySwitchPattern(recentEvents);
    if (domainPattern) patterns.push(domainPattern);

    // Pattern 3: Tab burst after quiet period
    const tabBurstPattern = this.detectTabBurstPattern(recentEvents);
    if (tabBurstPattern) patterns.push(tabBurstPattern);

    // Pattern 4: Navigation velocity change
    const velocityPattern = this.detectVelocityChangePattern(recentEvents);
    if (velocityPattern) patterns.push(velocityPattern);

    // Pattern 5: Window management change
    const windowPattern = this.detectWindowManagementPattern(recentEvents);
    if (windowPattern) patterns.push(windowPattern);

    return patterns;
  }

  // =============================================================================
  // PRIVATE ANALYSIS METHODS
  // =============================================================================

  private analyzeGapPatterns(gaps: number[]): { 
    type: 'consistent' | 'increasing' | 'decreasing' | 'random';
    confidence: number;
    description: string;
  } {
    if (gaps.length < 3) {
      return {
        type: 'random',
        confidence: 0,
        description: 'Insufficient data for pattern analysis'
      };
    }

    // Check for consistent gaps (low variance)
    const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - mean, 2), 0) / gaps.length;
    const coefficient = Math.sqrt(variance) / mean;

    if (coefficient < 0.3) {
      return {
        type: 'consistent',
        confidence: Math.max(0, 1 - coefficient),
        description: `Consistent gaps averaging ${Math.round(mean / 1000)}s`
      };
    }

    // Check for increasing/decreasing trends
    let increasing = 0;
    let decreasing = 0;
    for (let i = 1; i < gaps.length; i++) {
      if (gaps[i] > gaps[i - 1]) increasing++;
      if (gaps[i] < gaps[i - 1]) decreasing++;
    }

    const totalComparisons = gaps.length - 1;
    const increasingRatio = increasing / totalComparisons;
    const decreasingRatio = decreasing / totalComparisons;

    if (increasingRatio > 0.7) {
      return {
        type: 'increasing',
        confidence: increasingRatio,
        description: 'Gaps are increasing over time (possible fatigue)'
      };
    }

    if (decreasingRatio > 0.7) {
      return {
        type: 'decreasing',
        confidence: decreasingRatio,
        description: 'Gaps are decreasing over time (increasing focus)'
      };
    }

    return {
      type: 'random',
      confidence: 0.5,
      description: 'No clear pattern in time gaps'
    };
  }

  private analyzeDomainChangePatterns(changes: Array<{
    from: string;
    to: string;
    timestamp: number;
    category: string;
    significance: number;
  }>): {
    type: 'focused' | 'exploratory' | 'task_switching' | 'random';
    confidence: number;
    description: string;
  } {
    if (changes.length < 3) {
      return {
        type: 'random',
        confidence: 0,
        description: 'Insufficient domain changes for analysis'
      };
    }

    // Analyze domain diversity
    const uniqueDomains = new Set(changes.map(c => c.from).concat(changes.map(c => c.to)));
    const domainDiversity = uniqueDomains.size / changes.length;

    // Analyze category changes
    const categoryChanges = changes.filter(c => {
      const fromCategory = this.getDomainCategory(c.from);
      const toCategory = this.getDomainCategory(c.to);
      return fromCategory !== toCategory;
    });

    const categoryChangeRatio = categoryChanges.length / changes.length;

    // Analyze return patterns (going back to previous domains)
    const domains = changes.map(c => c.to);
    let returns = 0;
    for (let i = 2; i < domains.length; i++) {
      if (domains.slice(0, i).includes(domains[i])) {
        returns++;
      }
    }
    const returnRatio = returns / changes.length;

    // Determine pattern type
    if (domainDiversity < 0.3 && categoryChangeRatio < 0.2) {
      return {
        type: 'focused',
        confidence: 1 - domainDiversity,
        description: 'Focused browsing within similar domains'
      };
    }

    if (categoryChangeRatio > 0.6 && returnRatio < 0.2) {
      return {
        type: 'exploratory',
        confidence: categoryChangeRatio,
        description: 'Exploratory browsing across different categories'
      };
    }

    if (categoryChangeRatio > 0.4 && returnRatio > 0.3) {
      return {
        type: 'task_switching',
        confidence: (categoryChangeRatio + returnRatio) / 2,
        description: 'Task switching with returns to previous contexts'
      };
    }

    return {
      type: 'random',
      confidence: 0.5,
      description: 'Mixed browsing pattern without clear structure'
    };
  }

  private analyzeBurstPatterns(bursts: Array<{
    start: number;
    end: number;
    eventCount: number;
    intensity: number;
  }>): {
    type: 'regular' | 'irregular' | 'task_driven' | 'random';
    confidence: number;
  } {
    if (bursts.length < 2) {
      return { type: 'random', confidence: 0 };
    }

    // Check regularity of intervals between bursts
    const intervals = [];
    for (let i = 1; i < bursts.length; i++) {
      intervals.push(bursts[i].start - bursts[i - 1].end);
    }

    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    const coefficient = Math.sqrt(variance) / avgInterval;

    if (coefficient < 0.4) {
      return {
        type: 'regular',
        confidence: 1 - coefficient,
      };
    }

    // Check if bursts correlate with specific triggers
    const intensityVariance = bursts.reduce((sum, burst) => {
      const avgIntensity = bursts.reduce((s, b) => s + b.intensity, 0) / bursts.length;
      return sum + Math.pow(burst.intensity - avgIntensity, 2);
    }, 0) / bursts.length;

    if (intensityVariance > 1) {
      return {
        type: 'task_driven',
        confidence: Math.min(intensityVariance / 2, 1)
      };
    }

    return {
      type: 'irregular',
      confidence: 0.6
    };
  }

  private analyzeFocusPatterns(events: BrowsingEvent[]): {
    averageFocusTime: number;
    distractionFrequency: number;
    deepWorkSessions: TimeRange[];
    multiTaskingSessions: TimeRange[];
  } {
    const tabActivations = events.filter(e => e.type === 'tab_activated');
    
    if (tabActivations.length < 2) {
      return {
        averageFocusTime: 0,
        distractionFrequency: 0,
        deepWorkSessions: [],
        multiTaskingSessions: []
      };
    }

    // Calculate focus times (time between tab activations)
    const focusTimes = [];
    for (let i = 1; i < tabActivations.length; i++) {
      const focusTime = tabActivations[i].timestamp - tabActivations[i - 1].timestamp;
      if (focusTime > 0 && focusTime < 30 * 60 * 1000) { // Cap at 30 minutes
        focusTimes.push(focusTime);
      }
    }

    const averageFocusTime = focusTimes.length > 0
      ? focusTimes.reduce((sum, time) => sum + time, 0) / focusTimes.length
      : 0;

    // Calculate distraction frequency (tab switches per minute)
    const sessionDuration = events.length > 1 
      ? events[events.length - 1].timestamp - events[0].timestamp
      : 0;
    const distractionFrequency = sessionDuration > 0
      ? (tabActivations.length / sessionDuration) * 60000
      : 0;

    // Identify deep work sessions (long focus periods)
    const deepWorkSessions: TimeRange[] = [];
    const multiTaskingSessions: TimeRange[] = [];
    
    for (let i = 1; i < tabActivations.length; i++) {
      const focusTime = tabActivations[i].timestamp - tabActivations[i - 1].timestamp;
      const start = tabActivations[i - 1].timestamp;
      const end = tabActivations[i].timestamp;

      if (focusTime > 20 * 60 * 1000) { // 20+ minutes = deep work
        deepWorkSessions.push({
          start,
          end,
          duration: focusTime
        });
      } else if (focusTime < 30000) { // Less than 30 seconds = multitasking
        // Look for clusters of quick switches
        let clusterStart = start;
        let clusterEnd = end;
        let j = i + 1;
        
        while (j < tabActivations.length) {
          const nextGap = tabActivations[j].timestamp - tabActivations[j - 1].timestamp;
          if (nextGap < 30000) {
            clusterEnd = tabActivations[j].timestamp;
            j++;
          } else {
            break;
          }
        }

        if (clusterEnd - clusterStart > 60000) { // Cluster lasts more than 1 minute
          multiTaskingSessions.push({
            start: clusterStart,
            end: clusterEnd,
            duration: clusterEnd - clusterStart
          });
        }
      }
    }

    return {
      averageFocusTime,
      distractionFrequency,
      deepWorkSessions,
      multiTaskingSessions
    };
  }

  // =============================================================================
  // PATTERN DETECTION METHODS
  // =============================================================================

  private detectIdleToActivityPattern(events: BrowsingEvent[]): BehaviorPattern | null {
    if (events.length < 5) return null;

    // Look for quiet period followed by activity burst
    const now = Date.now();
    const recentEvents = events.filter(e => now - e.timestamp < 10 * 60 * 1000); // Last 10 minutes
    
    if (recentEvents.length < 3) return null;

    const oldEvents = events.filter(e => 
      e.timestamp < recentEvents[0].timestamp - 5 * 60 * 1000 && // At least 5 minutes before
      e.timestamp > recentEvents[0].timestamp - 30 * 60 * 1000   // Within last 30 minutes
    );

    if (oldEvents.length > 2 && recentEvents.length > oldEvents.length * 2) {
      return {
        id: 'idle_to_activity',
        name: 'Idle to Activity Transition',
        description: 'Activity burst after quiet period',
        pattern: [oldEvents.length, recentEvents.length],
        confidence: Math.min((recentEvents.length / oldEvents.length) / 3, 1),
        frequency: 1,
        lastSeen: now,
        predictive: true
      };
    }

    return null;
  }

  private detectDomainCategorySwitchPattern(events: BrowsingEvent[]): BehaviorPattern | null {
    const recentUrls = events
      .filter(e => e.url && Date.now() - e.timestamp < 5 * 60 * 1000) // Last 5 minutes
      .map(e => e.url!)
      .slice(-5); // Last 5 URLs

    if (recentUrls.length < 2) return null;

    const categories = recentUrls.map(url => this.getDomainCategory(this.extractDomain(url)!));
    const uniqueCategories = new Set(categories);

    if (uniqueCategories.size >= 3) { // 3+ different categories in recent activity
      return {
        id: 'domain_category_switch',
        name: 'Domain Category Switch',
        description: 'Rapid switching between domain categories',
        pattern: Array.from(uniqueCategories),
        confidence: Math.min(uniqueCategories.size / 5, 1),
        frequency: 1,
        lastSeen: Date.now(),
        predictive: true
      };
    }

    return null;
  }

  private detectTabBurstPattern(events: BrowsingEvent[]): BehaviorPattern | null {
    const now = Date.now();
    const recentTabEvents = events.filter(e => 
      e.type === 'tab_created' && now - e.timestamp < 2 * 60 * 1000 // Last 2 minutes
    );

    if (recentTabEvents.length >= 3) {
      const quietPeriod = this.calculateQuietPeriodBefore(recentTabEvents[0].timestamp, events);
      
      if (quietPeriod > 5 * 60 * 1000) { // 5+ minutes of quiet before burst
        return {
          id: 'tab_burst',
          name: 'Tab Creation Burst',
          description: 'Multiple tabs created after quiet period',
          pattern: [quietPeriod, recentTabEvents.length],
          confidence: Math.min(recentTabEvents.length / 5, 1),
          frequency: 1,
          lastSeen: now,
          predictive: true
        };
      }
    }

    return null;
  }

  private detectVelocityChangePattern(events: BrowsingEvent[]): BehaviorPattern | null {
    if (events.length < 20) return null;

    const now = Date.now();
    const recentVelocity = this.calculateVelocity(events, now - 5 * 60 * 1000, now);
    const previousVelocity = this.calculateVelocity(events, now - 15 * 60 * 1000, now - 5 * 60 * 1000);

    if (previousVelocity > 0 && recentVelocity > 0) {
      const velocityRatio = recentVelocity / previousVelocity;
      
      if (velocityRatio > 2 || velocityRatio < 0.5) { // Significant change
        return {
          id: 'velocity_change',
          name: 'Navigation Velocity Change',
          description: velocityRatio > 2 ? 'Activity acceleration' : 'Activity deceleration',
          pattern: [previousVelocity, recentVelocity],
          confidence: Math.min(Math.abs(Math.log2(velocityRatio)) / 2, 1),
          frequency: 1,
          lastSeen: now,
          predictive: false
        };
      }
    }

    return null;
  }

  private detectWindowManagementPattern(events: BrowsingEvent[]): BehaviorPattern | null {
    const now = Date.now();
    const recentWindowEvents = events.filter(e => 
      e.type.includes('window_') && now - e.timestamp < 2 * 60 * 1000
    );

    if (recentWindowEvents.length >= 2) {
      const windowCreated = recentWindowEvents.some(e => e.type === 'window_created');
      const windowRemoved = recentWindowEvents.some(e => e.type === 'window_removed');

      if (windowCreated || windowRemoved) {
        return {
          id: 'window_management',
          name: 'Window Management Activity',
          description: 'Recent window creation or removal',
          pattern: recentWindowEvents.map(e => e.type),
          confidence: 0.7,
          frequency: 1,
          lastSeen: now,
          predictive: true
        };
      }
    }

    return null;
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private createEmptyMetrics(): BehaviorMetrics {
    return {
      averageSessionDuration: 0,
      averageIdleTime: 0,
      peakActivityHours: [],
      activityDistribution: new Map(),
      averageNavigationGap: 0,
      navigationVelocity: 0,
      domainSwitchFrequency: 0,
      backNavigationRatio: 0,
      averageTabsPerSession: 0,
      maxConcurrentTabs: 0,
      tabCreationPatterns: new Map(),
      tabClosePatterns: new Map(),
      averageFocusTime: 0,
      distractionFrequency: 0,
      deepWorkSessions: [],
      multiTaskingSessions: [],
      domainCategories: new Map(),
      domainTransitions: new Map(),
      domainAffinity: new Map()
    };
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  private getDomainCategory(domain: string): string {
    const categories = {
      work: ['gmail.com', 'docs.google.com', 'slack.com', 'teams.microsoft.com', 'github.com'],
      social: ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'reddit.com'],
      shopping: ['amazon.com', 'ebay.com', 'shopify.com', 'etsy.com'],
      news: ['cnn.com', 'bbc.com', 'reuters.com', 'news.google.com'],
      entertainment: ['youtube.com', 'netflix.com', 'spotify.com', 'twitch.tv'],
      search: ['google.com', 'bing.com', 'duckduckgo.com'],
      reference: ['wikipedia.org', 'stackoverflow.com', 'mdn.mozilla.org']
    };

    for (const [category, domains] of Object.entries(categories)) {
      if (domains.some(d => domain.includes(d))) {
        return category;
      }
    }

    return 'other';
  }

  private calculateDomainChangeSignificance(from: string, to: string): number {
    if (from === to) return 0;
    
    const fromCategory = this.getDomainCategory(from);
    const toCategory = this.getDomainCategory(to);
    
    if (fromCategory !== toCategory) return 0.8;
    if (this.hasSameRootDomain(from, to)) return 0.2;
    
    return 0.5;
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

  private isNavigationEvent(eventType: EventType): boolean {
    return [
      'navigation_started',
      'navigation_completed',
      'navigation_committed',
      'page_loaded'
    ].includes(eventType);
  }

  private calculateAverageIdleTime(events: BrowsingEvent[]): number {
    const idleEvents = events.filter(e => e.type === 'idle_start');
    if (idleEvents.length === 0) return 0;

    let totalIdleTime = 0;
    for (const idleEvent of idleEvents) {
      const idleEnd = events.find(e => 
        e.type === 'idle_end' && e.timestamp > idleEvent.timestamp
      );
      if (idleEnd) {
        totalIdleTime += idleEnd.timestamp - idleEvent.timestamp;
      }
    }

    return totalIdleTime / idleEvents.length;
  }

  private calculateBackNavigationRatio(events: BrowsingEvent[]): number {
    const navigationEvents = events.filter(e => this.isNavigationEvent(e.type));
    if (navigationEvents.length === 0) return 0;

    const backNavigations = navigationEvents.filter(e => 
      e.metadata?.transitionType === 'auto_bookmark' // Browser back button
    );

    return backNavigations.length / navigationEvents.length;
  }

  private estimateAverageTabsPerSession(events: BrowsingEvent[]): number {
    const tabCreateEvents = events.filter(e => e.type === 'tab_created');
    const sessionEvents = events.filter(e => e.type === 'session_started');
    
    return sessionEvents.length > 0 ? tabCreateEvents.length / sessionEvents.length : 0;
  }

  private estimateMaxConcurrentTabs(events: BrowsingEvent[]): number {
    let currentTabs = 0;
    let maxTabs = 0;

    for (const event of events) {
      if (event.type === 'tab_created') {
        currentTabs++;
        maxTabs = Math.max(maxTabs, currentTabs);
      } else if (event.type === 'tab_removed') {
        currentTabs = Math.max(0, currentTabs - 1);
      }
    }

    return maxTabs;
  }

  private analyzeTabCreationPatterns(tabEvents: BrowsingEvent[]): Map<string, number> {
    const patterns = new Map<string, number>();
    
    for (const event of tabEvents) {
      const method = event.metadata?.openerTabId ? 'link_click' : 'user_initiated';
      patterns.set(method, (patterns.get(method) || 0) + 1);
    }

    return patterns;
  }

  private analyzeTabClosePatterns(events: BrowsingEvent[]): Map<string, number> {
    const patterns = new Map<string, number>();
    const tabCloseEvents = events.filter(e => e.type === 'tab_removed');
    
    // This is simplified - in reality would analyze close reasons
    patterns.set('user_close', tabCloseEvents.length);
    
    return patterns;
  }

  private calculateDomainCategoryTime(events: BrowsingEvent[]): Map<string, number> {
    const categoryTime = new Map<string, number>();
    let lastTimestamp = 0;
    let lastCategory = '';

    for (const event of events) {
      if (event.url) {
        const domain = this.extractDomain(event.url);
        const category = this.getDomainCategory(domain);
        
        if (lastCategory && lastTimestamp) {
          const timeSpent = event.timestamp - lastTimestamp;
          categoryTime.set(lastCategory, (categoryTime.get(lastCategory) || 0) + timeSpent);
        }

        lastCategory = category;
        lastTimestamp = event.timestamp;
      }
    }

    return categoryTime;
  }

  private calculateDomainAffinity(events: BrowsingEvent[]): Map<string, number> {
    const domainTime = new Map<string, number>();
    const domainVisits = new Map<string, number>();

    for (const event of events) {
      if (event.url) {
        const domain = this.extractDomain(event.url);
        domainVisits.set(domain, (domainVisits.get(domain) || 0) + 1);
      }
    }

    // Calculate affinity based on frequency and recency
    const affinity = new Map<string, number>();
    const now = Date.now();

    for (const [domain, visits] of domainVisits.entries()) {
      const recentEvents = events.filter(e => 
        e.url && this.extractDomain(e.url) === domain && 
        now - e.timestamp < 24 * 60 * 60 * 1000 // Last 24 hours
      );

      const recencyScore = recentEvents.length / visits; // How recent the visits are
      const frequencyScore = Math.min(visits / 10, 1); // Normalized frequency
      
      affinity.set(domain, (recencyScore + frequencyScore) / 2);
    }

    return affinity;
  }

  private calculateQuietPeriodBefore(timestamp: number, events: BrowsingEvent[]): number {
    const earlierEvents = events
      .filter(e => e.timestamp < timestamp)
      .sort((a, b) => b.timestamp - a.timestamp);

    return earlierEvents.length > 0 
      ? timestamp - earlierEvents[0].timestamp 
      : 0;
  }

  private calculateVelocity(events: BrowsingEvent[], startTime: number, endTime: number): number {
    const windowEvents = events.filter(e => 
      e.timestamp >= startTime && e.timestamp < endTime
    );

    const duration = endTime - startTime;
    return duration > 0 ? (windowEvents.length / duration) * 60000 : 0; // Events per minute
  }

  // =============================================================================
  // PUBLIC API
  // =============================================================================

  /**
   * Get current behavior metrics
   */
  getCurrentMetrics(): BehaviorMetrics | null {
    return this.metrics;
  }

  /**
   * Get all detected patterns
   */
  getDetectedPatterns(): BehaviorPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Clear analysis history
   */
  clearHistory(): void {
    this.eventHistory = [];
    this.metrics = null;
    this.patterns.clear();
    this.lastAnalysis = 0;
  }

  /**
   * Export analysis data
   */
  exportAnalysisData() {
    return {
      eventHistory: this.eventHistory.slice(-100), // Last 100 events
      metrics: this.metrics,
      patterns: Array.from(this.patterns.values()),
      lastAnalysis: this.lastAnalysis,
      stats: {
        totalEvents: this.eventHistory.length,
        analysisAge: Date.now() - this.lastAnalysis
      }
    };
  }
}