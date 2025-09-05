/**
 * Analytics engine for time analytics and productivity metrics
 * Processes browsing events to generate insights and productivity scores
 */

import {
  BrowsingEvent,
  ProductivityMetrics,
  TimeRange,
  TrackingConfig,
  NavigationPattern,
  AnalyticsQuery
} from '../shared/types';

interface TimeBlock {
  start: number;
  end: number;
  duration: number;
  type: 'active' | 'idle' | 'focused' | 'distracted';
  events: BrowsingEvent[];
  domains: string[];
  tabSwitches: number;
  windowSwitches: number;
}

interface DomainAnalytics {
  domain: string;
  totalTime: number;
  visitCount: number;
  averageVisitDuration: number;
  focusScore: number;
  productivity: 'high' | 'medium' | 'low';
  category: string;
  peakHours: number[];
  patterns: NavigationPattern[];
}

interface ActivityPattern {
  type: 'focus_period' | 'multitasking' | 'browsing_spree' | 'research_mode';
  startTime: number;
  duration: number;
  confidence: number;
  characteristics: {
    domainCount: number;
    tabSwitchRate: number;
    averagePageTime: number;
    scrollActivity: number;
  };
}

export class AnalyticsEngine {
  private config: TrackingConfig;
  private timeBlocks: TimeBlock[] = [];
  private domainAnalytics = new Map<string, DomainAnalytics>();
  private activityPatterns: ActivityPattern[] = [];
  private cachedMetrics = new Map<string, any>();

  constructor(config: TrackingConfig) {
    this.config = config;
  }

  /**
   * Process events to generate analytics
   */
  async processEvents(events: BrowsingEvent[]): Promise<void> {
    // Clear existing analysis
    this.timeBlocks = [];
    this.domainAnalytics.clear();
    this.activityPatterns = [];
    this.cachedMetrics.clear();

    if (events.length === 0) return;

    // Sort events by timestamp
    const sortedEvents = events.sort((a, b) => a.timestamp - b.timestamp);

    // Create time blocks
    this.createTimeBlocks(sortedEvents);

    // Analyze domains
    await this.analyzeDomains(sortedEvents);

    // Detect activity patterns
    await this.detectActivityPatterns(sortedEvents);

    // Calculate productivity metrics
    await this.calculateProductivityMetrics(sortedEvents);
  }

  /**
   * Create time blocks for analysis
   */
  private createTimeBlocks(events: BrowsingEvent[]): void {
    if (events.length === 0) return;

    let currentBlock: Partial<TimeBlock> = {
      start: events[0].timestamp,
      events: [],
      domains: [],
      tabSwitches: 0,
      windowSwitches: 0
    };

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const nextEvent = events[i + 1];

      currentBlock.events!.push(event);

      // Track domain
      if (event.url) {
        const domain = this.extractDomain(event.url);
        if (domain && !currentBlock.domains!.includes(domain)) {
          currentBlock.domains!.push(domain);
        }
      }

      // Track switches
      if (event.type === 'tab_activated') {
        currentBlock.tabSwitches!++;
      } else if (event.type === 'window_focus_changed') {
        currentBlock.windowSwitches!++;
      }

      // Check if we should end this block
      const shouldEndBlock = !nextEvent || 
        (nextEvent.timestamp - event.timestamp > 300000) || // 5 minute gap
        (currentBlock.events!.length > 50); // Max events per block

      if (shouldEndBlock) {
        // Finalize current block
        currentBlock.end = event.timestamp;
        currentBlock.duration = currentBlock.end! - currentBlock.start!;
        currentBlock.type = this.classifyTimeBlock(currentBlock as TimeBlock);

        this.timeBlocks.push(currentBlock as TimeBlock);

        // Start new block
        if (nextEvent) {
          currentBlock = {
            start: nextEvent.timestamp,
            events: [],
            domains: [],
            tabSwitches: 0,
            windowSwitches: 0
          };
        }
      }
    }
  }

  /**
   * Classify time block type
   */
  private classifyTimeBlock(block: TimeBlock): TimeBlock['type'] {
    const duration = block.duration;
    const eventDensity = block.events.length / (duration / 60000); // Events per minute
    const domainDiversity = block.domains.length;
    const switchRate = (block.tabSwitches + block.windowSwitches) / (duration / 60000);

    // Idle: very low activity
    if (eventDensity < 0.1 || duration > 600000) { // > 10 minutes
      return 'idle';
    }

    // Focused: single domain, low switch rate, sustained activity
    if (domainDiversity <= 2 && switchRate < 2 && duration > 180000) { // > 3 minutes
      return 'focused';
    }

    // Distracted: many domains, high switch rate
    if (domainDiversity > 5 || switchRate > 5) {
      return 'distracted';
    }

    // Default to active
    return 'active';
  }

  /**
   * Analyze domain usage patterns
   */
  private async analyzeDomains(events: BrowsingEvent[]): Promise<void> {
    const domainEvents = new Map<string, BrowsingEvent[]>();

    // Group events by domain
    for (const event of events) {
      if (event.url) {
        const domain = this.extractDomain(event.url);
        if (domain) {
          if (!domainEvents.has(domain)) {
            domainEvents.set(domain, []);
          }
          domainEvents.get(domain)!.push(event);
        }
      }
    }

    // Analyze each domain
    for (const [domain, domainEventList] of domainEvents) {
      const analytics = await this.analyzeDomain(domain, domainEventList);
      this.domainAnalytics.set(domain, analytics);
    }
  }

  /**
   * Analyze individual domain
   */
  private async analyzeDomain(domain: string, events: BrowsingEvent[]): Promise<DomainAnalytics> {
    const visits = this.groupVisits(events);
    const totalTime = this.calculateTotalTime(events);
    const focusScore = this.calculateDomainFocusScore(events);
    const category = this.categorizeDomain(domain);
    const peakHours = this.findPeakHours(events);

    return {
      domain,
      totalTime,
      visitCount: visits.length,
      averageVisitDuration: visits.length > 0 ? totalTime / visits.length : 0,
      focusScore,
      productivity: this.classifyProductivity(focusScore, category),
      category,
      peakHours,
      patterns: [] // Would be populated by pattern detection
    };
  }

  /**
   * Group events into visits (continuous activity on domain)
   */
  private groupVisits(events: BrowsingEvent[]): BrowsingEvent[][] {
    if (events.length === 0) return [];

    const visits: BrowsingEvent[][] = [];
    let currentVisit: BrowsingEvent[] = [events[0]];

    for (let i = 1; i < events.length; i++) {
      const event = events[i];
      const prevEvent = events[i - 1];
      const gap = event.timestamp - prevEvent.timestamp;

      // If gap is > 10 minutes, start new visit
      if (gap > 600000) {
        visits.push(currentVisit);
        currentVisit = [event];
      } else {
        currentVisit.push(event);
      }
    }

    visits.push(currentVisit);
    return visits;
  }

  /**
   * Calculate total time spent
   */
  private calculateTotalTime(events: BrowsingEvent[]): number {
    if (events.length === 0) return 0;

    const visits = this.groupVisits(events);
    let totalTime = 0;

    for (const visit of visits) {
      if (visit.length > 1) {
        const visitStart = visit[0].timestamp;
        const visitEnd = visit[visit.length - 1].timestamp;
        totalTime += visitEnd - visitStart;
      } else {
        // Single event, estimate 30 seconds
        totalTime += 30000;
      }
    }

    return totalTime;
  }

  /**
   * Calculate focus score for domain
   */
  private calculateDomainFocusScore(events: BrowsingEvent[]): number {
    if (events.length === 0) return 0;

    let focusScore = 0;
    const focusedBlocks = this.timeBlocks.filter(block => 
      block.type === 'focused' && 
      block.domains.some(d => events.some(e => e.url?.includes(d)))
    );

    const totalFocusedTime = focusedBlocks.reduce((sum, block) => sum + block.duration, 0);
    const totalTime = this.calculateTotalTime(events);

    if (totalTime > 0) {
      focusScore = (totalFocusedTime / totalTime) * 100;
    }

    return Math.min(focusScore, 100);
  }

  /**
   * Categorize domain
   */
  private categorizeDomain(domain: string): string {
    const categories = {
      'work': ['gmail.com', 'docs.google.com', 'slack.com', 'teams.microsoft.com', 'github.com', 'stackoverflow.com'],
      'social': ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'reddit.com'],
      'entertainment': ['youtube.com', 'netflix.com', 'spotify.com', 'twitch.tv', 'tiktok.com'],
      'shopping': ['amazon.com', 'ebay.com', 'shopify.com', 'etsy.com', 'walmart.com'],
      'news': ['cnn.com', 'bbc.com', 'reuters.com', 'news.google.com', 'nytimes.com'],
      'education': ['coursera.org', 'edx.org', 'khanacademy.org', 'udemy.com', 'wikipedia.org']
    };

    for (const [category, domains] of Object.entries(categories)) {
      if (domains.some(d => domain.includes(d))) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Classify productivity level
   */
  private classifyProductivity(focusScore: number, category: string): 'high' | 'medium' | 'low' {
    const productiveCategories = ['work', 'education'];
    const neutralCategories = ['news', 'other'];
    
    if (productiveCategories.includes(category)) {
      if (focusScore > 70) return 'high';
      if (focusScore > 40) return 'medium';
      return 'low';
    } else if (neutralCategories.includes(category)) {
      if (focusScore > 80) return 'medium';
      return 'low';
    } else {
      // Entertainment, social, shopping
      return 'low';
    }
  }

  /**
   * Find peak usage hours for domain
   */
  private findPeakHours(events: BrowsingEvent[]): number[] {
    const hourCounts = new Array(24).fill(0);

    for (const event of events) {
      const hour = new Date(event.timestamp).getHours();
      hourCounts[hour]++;
    }

    // Find hours with above-average activity
    const average = hourCounts.reduce((sum, count) => sum + count, 0) / 24;
    const peakHours: number[] = [];

    for (let i = 0; i < 24; i++) {
      if (hourCounts[i] > average * 1.5) {
        peakHours.push(i);
      }
    }

    return peakHours;
  }

  /**
   * Detect activity patterns
   */
  private async detectActivityPatterns(events: BrowsingEvent[]): Promise<void> {
    // Analyze time blocks for patterns
    for (let i = 0; i < this.timeBlocks.length; i++) {
      const block = this.timeBlocks[i];
      const pattern = this.identifyActivityPattern(block, this.timeBlocks.slice(Math.max(0, i - 2), i + 3));
      
      if (pattern) {
        this.activityPatterns.push(pattern);
      }
    }
  }

  /**
   * Identify activity pattern from time block
   */
  private identifyActivityPattern(block: TimeBlock, context: TimeBlock[]): ActivityPattern | null {
    const characteristics = {
      domainCount: block.domains.length,
      tabSwitchRate: block.tabSwitches / (block.duration / 60000),
      averagePageTime: block.duration / Math.max(block.events.length, 1),
      scrollActivity: block.events.filter(e => e.type === 'scroll_event').length
    };

    // Focus period: single domain, long duration, low switch rate
    if (block.type === 'focused' && block.duration > this.config.deepWorkThreshold) {
      return {
        type: 'focus_period',
        startTime: block.start,
        duration: block.duration,
        confidence: 0.9,
        characteristics
      };
    }

    // Multitasking: multiple domains, high switch rate
    if (characteristics.domainCount >= 3 && characteristics.tabSwitchRate > 3) {
      return {
        type: 'multitasking',
        startTime: block.start,
        duration: block.duration,
        confidence: 0.8,
        characteristics
      };
    }

    // Browsing spree: rapid navigation, short page times
    if (characteristics.averagePageTime < 30000 && block.events.length > 10) {
      return {
        type: 'browsing_spree',
        startTime: block.start,
        duration: block.duration,
        confidence: 0.7,
        characteristics
      };
    }

    // Research mode: moderate domains, sustained activity, lots of scrolling
    if (characteristics.domainCount >= 2 && 
        characteristics.scrollActivity > 5 && 
        block.duration > 300000) {
      return {
        type: 'research_mode',
        startTime: block.start,
        duration: block.duration,
        confidence: 0.6,
        characteristics
      };
    }

    return null;
  }

  /**
   * Calculate comprehensive productivity metrics
   */
  private async calculateProductivityMetrics(events: BrowsingEvent[]): Promise<void> {
    const sessionId = events[0]?.sessionId || 'unknown';
    const totalTime = events.length > 0 ? 
      events[events.length - 1].timestamp - events[0].timestamp : 0;

    const focusedBlocks = this.timeBlocks.filter(b => b.type === 'focused');
    const distractedBlocks = this.timeBlocks.filter(b => b.type === 'distracted');
    const idleBlocks = this.timeBlocks.filter(b => b.type === 'idle');

    const activeTime = this.timeBlocks
      .filter(b => b.type === 'active' || b.type === 'focused')
      .reduce((sum, b) => sum + b.duration, 0);

    const idleTime = idleBlocks.reduce((sum, b) => sum + b.duration, 0);

    const uniqueDomains = Array.from(new Set(
      events.map(e => e.url ? this.extractDomain(e.url) : null).filter(Boolean)
    ));

    const tabSwitches = events.filter(e => e.type === 'tab_activated').length;
    const windowSwitches = events.filter(e => e.type === 'window_focus_changed').length;

    const deepWorkPeriods: TimeRange[] = focusedBlocks
      .filter(b => b.duration > this.config.deepWorkThreshold)
      .map(b => ({
        start: b.start,
        end: b.end,
        duration: b.duration
      }));

    const distractionPeriods: TimeRange[] = distractedBlocks
      .filter(b => b.duration > this.config.distractionThreshold)
      .map(b => ({
        start: b.start,
        end: b.end,
        duration: b.duration
      }));

    // Calculate focus score
    const focusScore = this.calculateOverallFocusScore(
      totalTime, activeTime, idleTime, uniqueDomains.length, 
      tabSwitches, deepWorkPeriods.length, distractionPeriods.length
    );

    const metrics: ProductivityMetrics = {
      sessionId,
      totalTime,
      activeTime,
      idleTime,
      tabSwitches,
      windowSwitches,
      uniqueDomains,
      pageCount: events.filter(e => e.type === 'page_loaded').length,
      scrollEvents: events.filter(e => e.type === 'scroll_event').length,
      clickEvents: events.filter(e => e.type === 'click_event').length,
      formInteractions: events.filter(e => e.type === 'form_interaction').length,
      deepWorkPeriods,
      distractionPeriods,
      focusScore
    };

    this.cachedMetrics.set(sessionId, metrics);
  }

  /**
   * Calculate overall focus score
   */
  private calculateOverallFocusScore(
    totalTime: number,
    activeTime: number,
    idleTime: number,
    domainCount: number,
    tabSwitches: number,
    deepWorkCount: number,
    distractionCount: number
  ): number {
    if (totalTime === 0) return 0;

    // Base score from active time ratio
    const activeRatio = activeTime / totalTime;
    let score = activeRatio * 40;

    // Bonus for focused work
    const deepWorkBonus = Math.min(deepWorkCount * 10, 30);
    score += deepWorkBonus;

    // Bonus for domain focus
    const domainFocusBonus = domainCount <= 3 ? 20 : Math.max(0, 20 - (domainCount - 3) * 2);
    score += domainFocusBonus;

    // Penalty for excessive switching
    const switchPenalty = Math.min(tabSwitches * 0.5, 15);
    score -= switchPenalty;

    // Penalty for distractions
    const distractionPenalty = distractionCount * 5;
    score -= distractionPenalty;

    // Bonus for sustained activity (low idle ratio)
    const idleRatio = idleTime / totalTime;
    const idleBonus = Math.max(0, (1 - idleRatio) * 10);
    score += idleBonus;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Query analytics data
   */
  async queryAnalytics(query: AnalyticsQuery): Promise<any> {
    const results: any = {};

    if (query.metrics.includes('time')) {
      results.time = this.getTimeAnalytics(query);
    }

    if (query.metrics.includes('productivity')) {
      results.productivity = this.getProductivityAnalytics(query);
    }

    if (query.metrics.includes('patterns')) {
      results.patterns = this.getPatternAnalytics(query);
    }

    if (query.metrics.includes('domains')) {
      results.domains = this.getDomainAnalytics(query);
    }

    if (query.metrics.includes('activity')) {
      results.activity = this.getActivityAnalytics(query);
    }

    return results;
  }

  /**
   * Get time-based analytics
   */
  private getTimeAnalytics(query: AnalyticsQuery) {
    const blocks = this.timeBlocks.filter(block => 
      block.start >= query.dateRange.start && 
      block.end <= query.dateRange.end
    );

    return {
      totalTime: blocks.reduce((sum, b) => sum + b.duration, 0),
      activeTime: blocks.filter(b => b.type === 'active' || b.type === 'focused')
        .reduce((sum, b) => sum + b.duration, 0),
      focusedTime: blocks.filter(b => b.type === 'focused')
        .reduce((sum, b) => sum + b.duration, 0),
      distractedTime: blocks.filter(b => b.type === 'distracted')
        .reduce((sum, b) => sum + b.duration, 0),
      idleTime: blocks.filter(b => b.type === 'idle')
        .reduce((sum, b) => sum + b.duration, 0),
      blockCount: blocks.length,
      averageBlockDuration: blocks.length > 0 
        ? blocks.reduce((sum, b) => sum + b.duration, 0) / blocks.length 
        : 0
    };
  }

  /**
   * Get productivity analytics
   */
  private getProductivityAnalytics(query: AnalyticsQuery) {
    const sessionMetrics = query.sessionId ? 
      this.cachedMetrics.get(query.sessionId) : 
      Array.from(this.cachedMetrics.values())[0];

    if (!sessionMetrics) return null;

    return {
      focusScore: sessionMetrics.focusScore,
      deepWorkPeriods: sessionMetrics.deepWorkPeriods.length,
      distractionPeriods: sessionMetrics.distractionPeriods.length,
      totalDeepWorkTime: sessionMetrics.deepWorkPeriods
        .reduce((sum, p) => sum + p.duration, 0),
      productivityTrend: this.calculateProductivityTrend(),
      recommendations: this.generateProductivityRecommendations(sessionMetrics)
    };
  }

  /**
   * Get pattern analytics
   */
  private getPatternAnalytics(query: AnalyticsQuery) {
    const patterns = this.activityPatterns.filter(pattern =>
      pattern.startTime >= query.dateRange.start &&
      pattern.startTime <= query.dateRange.end
    );

    const patternCounts = patterns.reduce((counts, pattern) => {
      counts[pattern.type] = (counts[pattern.type] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    return {
      totalPatterns: patterns.length,
      patternTypes: patternCounts,
      averageConfidence: patterns.length > 0 
        ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length 
        : 0,
      mostCommonPattern: Object.keys(patternCounts)
        .reduce((a, b) => patternCounts[a] > patternCounts[b] ? a : b, ''),
      patterns: patterns.slice(0, 10) // Return top 10 patterns
    };
  }

  /**
   * Get domain analytics
   */
  private getDomainAnalytics(query: AnalyticsQuery) {
    const domainAnalytics = Array.from(this.domainAnalytics.values());

    return {
      totalDomains: domainAnalytics.length,
      topDomains: domainAnalytics
        .sort((a, b) => b.totalTime - a.totalTime)
        .slice(0, 10),
      productivityByCategory: this.groupDomainsByCategory(domainAnalytics),
      focusLeaders: domainAnalytics
        .sort((a, b) => b.focusScore - a.focusScore)
        .slice(0, 5),
      timeDistribution: this.calculateDomainTimeDistribution(domainAnalytics)
    };
  }

  /**
   * Get activity analytics
   */
  private getActivityAnalytics(query: AnalyticsQuery) {
    const blocks = this.timeBlocks.filter(block => 
      block.start >= query.dateRange.start && 
      block.end <= query.dateRange.end
    );

    return {
      totalBlocks: blocks.length,
      blockTypes: blocks.reduce((counts, block) => {
        counts[block.type] = (counts[block.type] || 0) + 1;
        return counts;
      }, {} as Record<string, number>),
      averageTabSwitches: blocks.length > 0 
        ? blocks.reduce((sum, b) => sum + b.tabSwitches, 0) / blocks.length 
        : 0,
      averageWindowSwitches: blocks.length > 0 
        ? blocks.reduce((sum, b) => sum + b.windowSwitches, 0) / blocks.length 
        : 0,
      hourlyActivity: this.calculateHourlyActivity(blocks)
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

  private calculateProductivityTrend(): 'improving' | 'stable' | 'declining' {
    // Simplified trend calculation
    // In a real implementation, this would analyze historical data
    return 'stable';
  }

  private generateProductivityRecommendations(metrics: ProductivityMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.focusScore < 60) {
      recommendations.push('Consider reducing tab switching to improve focus');
    }

    if (metrics.deepWorkPeriods.length === 0) {
      recommendations.push('Try to establish longer periods of focused work');
    }

    if (metrics.distractionPeriods.length > 3) {
      recommendations.push('Identify and minimize sources of distraction');
    }

    if (metrics.uniqueDomains.length > 20) {
      recommendations.push('Consider focusing on fewer websites to improve productivity');
    }

    return recommendations;
  }

  private groupDomainsByCategory(domains: DomainAnalytics[]): Record<string, any> {
    const categories = domains.reduce((groups, domain) => {
      if (!groups[domain.category]) {
        groups[domain.category] = {
          domains: [],
          totalTime: 0,
          averageFocusScore: 0
        };
      }
      groups[domain.category].domains.push(domain);
      groups[domain.category].totalTime += domain.totalTime;
      return groups;
    }, {} as Record<string, any>);

    // Calculate average focus scores
    for (const category of Object.keys(categories)) {
      const categoryDomains = categories[category].domains;
      categories[category].averageFocusScore = categoryDomains.length > 0
        ? categoryDomains.reduce((sum: number, d: DomainAnalytics) => sum + d.focusScore, 0) / categoryDomains.length
        : 0;
    }

    return categories;
  }

  private calculateDomainTimeDistribution(domains: DomainAnalytics[]): Record<string, number> {
    const totalTime = domains.reduce((sum, d) => sum + d.totalTime, 0);
    const distribution: Record<string, number> = {};

    for (const domain of domains.slice(0, 10)) { // Top 10 domains
      distribution[domain.domain] = totalTime > 0 ? (domain.totalTime / totalTime) * 100 : 0;
    }

    return distribution;
  }

  private calculateHourlyActivity(blocks: TimeBlock[]): Record<number, number> {
    const hourlyActivity: Record<number, number> = {};
    
    for (let hour = 0; hour < 24; hour++) {
      hourlyActivity[hour] = 0;
    }

    for (const block of blocks) {
      const startHour = new Date(block.start).getHours();
      const endHour = new Date(block.end).getHours();
      
      if (startHour === endHour) {
        hourlyActivity[startHour] += block.duration;
      } else {
        // Block spans multiple hours, distribute proportionally
        const totalHours = endHour - startHour + 1;
        const timePerHour = block.duration / totalHours;
        
        for (let hour = startHour; hour <= endHour; hour++) {
          hourlyActivity[hour] += timePerHour;
        }
      }
    }

    return hourlyActivity;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: TrackingConfig): void {
    this.config = newConfig;
  }

  /**
   * Get analytics statistics
   */
  getAnalyticsStats() {
    return {
      timeBlocks: this.timeBlocks.length,
      domains: this.domainAnalytics.size,
      patterns: this.activityPatterns.length,
      cachedMetrics: this.cachedMetrics.size,
      focusedBlocks: this.timeBlocks.filter(b => b.type === 'focused').length,
      distractedBlocks: this.timeBlocks.filter(b => b.type === 'distracted').length
    };
  }

  /**
   * Clear analytics data
   */
  clearAnalytics(): void {
    this.timeBlocks = [];
    this.domainAnalytics.clear();
    this.activityPatterns = [];
    this.cachedMetrics.clear();
  }
}