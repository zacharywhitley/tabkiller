/**
 * Detection Analytics and Metrics Collection
 * Comprehensive analytics system for session detection performance monitoring
 */

import {
  BrowsingEvent,
  SessionBoundary,
  EventType
} from '../../shared/types';

import {
  DetectionSignal,
  BehaviorPattern,
  DetectionConfig
} from './SessionDetectionEngine';

import { BoundaryPrediction } from './BoundaryPredictor';

// =============================================================================
// ANALYTICS TYPES
// =============================================================================

export interface DetectionMetrics {
  // Accuracy metrics
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  
  // Boundary detection stats
  totalBoundariesDetected: number;
  correctBoundaries: number;
  falsePositives: number;
  falseNegatives: number;
  missedBoundaries: number;
  
  // Performance metrics
  averageDetectionTime: number;
  signalsPerBoundary: number;
  predictionAccuracy: number;
  
  // Quality metrics
  boundaryQualityScore: number;
  userSatisfactionScore: number;
  adaptationEffectiveness: number;
}

export interface DetectionPerformanceReport {
  timeRange: { start: number; end: number };
  totalDetections: number;
  metrics: DetectionMetrics;
  signalAnalysis: SignalAnalysis;
  patternAnalysis: PatternAnalysis;
  configurationImpact: ConfigurationImpact;
  recommendations: string[];
  trends: PerformanceTrend[];
}

export interface SignalAnalysis {
  signalTypeDistribution: Map<string, number>;
  averageSignalStrength: Map<string, number>;
  signalCorrelations: Map<string, Map<string, number>>;
  mostEffectiveSignals: Array<{
    type: string;
    subtype: string;
    successRate: number;
    averageStrength: number;
  }>;
  underperformingSignals: Array<{
    type: string;
    subtype: string;
    successRate: number;
    falsePositiveRate: number;
  }>;
}

export interface PatternAnalysis {
  learnedPatterns: number;
  patternEffectiveness: Map<string, number>;
  patternUsage: Map<string, number>;
  adaptationRate: number;
  mostValuablePatterns: BehaviorPattern[];
  obsoletePatterns: BehaviorPattern[];
}

export interface ConfigurationImpact {
  parameterEffectiveness: Map<string, number>;
  optimalValues: Map<string, number>;
  adaptiveAdjustments: Map<string, number[]>;
  configurationCorrelations: Map<string, number>;
}

export interface PerformanceTrend {
  metric: string;
  direction: 'improving' | 'declining' | 'stable';
  change: number;
  significance: number;
  timeframe: number;
}

export interface UserFeedback {
  timestamp: number;
  boundaryId: string;
  rating: 'correct' | 'incorrect' | 'unnecessary' | 'missed';
  confidence: number;
  comment?: string;
  context: {
    sessionDuration: number;
    domainContext: string[];
    timeOfDay: number;
  };
}

export interface RealTimeMetrics {
  currentAccuracy: number;
  recentDetections: number;
  averageResponseTime: number;
  memoryUsage: number;
  cpuUsage: number;
  signalQueueLength: number;
  lastUpdateTime: number;
}

// =============================================================================
// DETECTION ANALYTICS ENGINE
// =============================================================================

export class DetectionAnalytics {
  private detectionHistory: Array<{
    boundary: SessionBoundary;
    signals: DetectionSignal[];
    prediction?: BoundaryPrediction;
    timestamp: number;
    processingTime: number;
    correct?: boolean;
  }> = [];

  private userFeedback: UserFeedback[] = [];
  private performanceHistory: DetectionMetrics[] = [];
  private configHistory: Array<{ timestamp: number; config: Partial<DetectionConfig> }> = [];
  private realTimeMetrics: RealTimeMetrics;

  // Signal tracking
  private signalCounts: Map<string, number> = new Map();
  private signalSuccess: Map<string, number> = new Map();
  private signalStrengths: Map<string, number[]> = new Map();

  // Pattern tracking
  private patternUsage: Map<string, number> = new Map();
  private patternSuccess: Map<string, number> = new Map();

  // Performance tracking
  private detectionTimes: number[] = [];
  private lastAnalysisTime: number = 0;

  constructor() {
    this.realTimeMetrics = this.createEmptyRealTimeMetrics();
  }

  /**
   * Record a boundary detection event
   */
  recordDetection(
    boundary: SessionBoundary,
    signals: DetectionSignal[],
    processingTime: number,
    prediction?: BoundaryPrediction
  ): void {
    const detectionEvent = {
      boundary,
      signals,
      prediction,
      timestamp: Date.now(),
      processingTime
    };

    this.detectionHistory.push(detectionEvent);
    this.pruneDetectionHistory();

    // Update real-time metrics
    this.updateRealTimeMetrics(processingTime);

    // Track signal usage
    this.trackSignalUsage(signals);

    // Track detection times
    this.detectionTimes.push(processingTime);
    if (this.detectionTimes.length > 1000) {
      this.detectionTimes = this.detectionTimes.slice(-500);
    }
  }

  /**
   * Record user feedback on a boundary detection
   */
  recordUserFeedback(
    boundaryId: string,
    rating: UserFeedback['rating'],
    confidence: number,
    context: UserFeedback['context'],
    comment?: string
  ): void {
    const feedback: UserFeedback = {
      timestamp: Date.now(),
      boundaryId,
      rating,
      confidence,
      context,
      comment
    };

    this.userFeedback.push(feedback);
    this.pruneUserFeedback();

    // Update detection record with feedback
    const detection = this.detectionHistory.find(d => d.boundary.id === boundaryId);
    if (detection) {
      detection.correct = rating === 'correct';
      this.updateSignalSuccess(detection.signals, rating === 'correct');
    }
  }

  /**
   * Record configuration change
   */
  recordConfigurationChange(config: Partial<DetectionConfig>): void {
    this.configHistory.push({
      timestamp: Date.now(),
      config
    });

    if (this.configHistory.length > 100) {
      this.configHistory = this.configHistory.slice(-50);
    }
  }

  /**
   * Generate comprehensive performance report
   */
  generatePerformanceReport(
    startTime?: number,
    endTime?: number
  ): DetectionPerformanceReport {
    const now = Date.now();
    const timeRange = {
      start: startTime || now - 24 * 60 * 60 * 1000, // Last 24 hours
      end: endTime || now
    };

    // Filter detections in time range
    const relevantDetections = this.detectionHistory.filter(d =>
      d.timestamp >= timeRange.start && d.timestamp <= timeRange.end
    );

    const totalDetections = relevantDetections.length;

    // Calculate basic metrics
    const metrics = this.calculateMetrics(relevantDetections);

    // Analyze signals
    const signalAnalysis = this.analyzeSignals(relevantDetections);

    // Analyze patterns
    const patternAnalysis = this.analyzePatterns(relevantDetections);

    // Analyze configuration impact
    const configurationImpact = this.analyzeConfigurationImpact();

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      metrics,
      signalAnalysis,
      patternAnalysis,
      configurationImpact
    );

    // Calculate trends
    const trends = this.calculateTrends();

    return {
      timeRange,
      totalDetections,
      metrics,
      signalAnalysis,
      patternAnalysis,
      configurationImpact,
      recommendations,
      trends
    };
  }

  /**
   * Get real-time performance metrics
   */
  getRealTimeMetrics(): RealTimeMetrics {
    return { ...this.realTimeMetrics };
  }

  /**
   * Calculate detection accuracy over time window
   */
  calculateAccuracy(timeWindow: number = 3600000): number {
    const now = Date.now();
    const recentDetections = this.detectionHistory.filter(d =>
      d.timestamp >= now - timeWindow && d.correct !== undefined
    );

    if (recentDetections.length === 0) return 0.5; // Default neutral accuracy

    const correctDetections = recentDetections.filter(d => d.correct).length;
    return correctDetections / recentDetections.length;
  }

  /**
   * Get signal effectiveness ranking
   */
  getSignalEffectiveness(): Array<{
    type: string;
    subtype: string;
    successRate: number;
    usage: number;
    averageStrength: number;
  }> {
    const effectiveness = [];

    for (const [signalKey, count] of this.signalCounts.entries()) {
      const success = this.signalSuccess.get(signalKey) || 0;
      const strengths = this.signalStrengths.get(signalKey) || [];
      
      const [type, subtype] = signalKey.split(':');
      const successRate = count > 0 ? success / count : 0;
      const averageStrength = strengths.length > 0 
        ? strengths.reduce((sum, s) => sum + s, 0) / strengths.length 
        : 0;

      effectiveness.push({
        type,
        subtype,
        successRate,
        usage: count,
        averageStrength
      });
    }

    return effectiveness.sort((a, b) => b.successRate - a.successRate);
  }

  /**
   * Export analytics data
   */
  exportAnalyticsData(): {
    detectionHistory: any[];
    performanceMetrics: DetectionMetrics[];
    signalAnalysis: any;
    userFeedback: UserFeedback[];
    realTimeMetrics: RealTimeMetrics;
    summary: any;
  } {
    const recentDetections = this.detectionHistory.slice(-100);
    const recentMetrics = this.performanceHistory.slice(-10);
    
    return {
      detectionHistory: recentDetections.map(d => ({
        boundaryId: d.boundary.id,
        signalCount: d.signals.length,
        processingTime: d.processingTime,
        correct: d.correct,
        timestamp: d.timestamp
      })),
      performanceMetrics: recentMetrics,
      signalAnalysis: {
        signalCounts: Object.fromEntries(this.signalCounts),
        signalSuccess: Object.fromEntries(this.signalSuccess),
        effectiveness: this.getSignalEffectiveness()
      },
      userFeedback: this.userFeedback.slice(-50),
      realTimeMetrics: this.realTimeMetrics,
      summary: {
        totalDetections: this.detectionHistory.length,
        currentAccuracy: this.calculateAccuracy(),
        averageProcessingTime: this.detectionTimes.length > 0
          ? this.detectionTimes.reduce((sum, t) => sum + t, 0) / this.detectionTimes.length
          : 0
      }
    };
  }

  // =============================================================================
  // PRIVATE ANALYSIS METHODS
  // =============================================================================

  private calculateMetrics(detections: typeof this.detectionHistory): DetectionMetrics {
    if (detections.length === 0) {
      return this.createEmptyMetrics();
    }

    // Filter detections with feedback
    const withFeedback = detections.filter(d => d.correct !== undefined);
    const correctDetections = withFeedback.filter(d => d.correct).length;
    const totalWithFeedback = withFeedback.length;

    // Calculate basic accuracy metrics
    const accuracy = totalWithFeedback > 0 ? correctDetections / totalWithFeedback : 0.5;
    
    // Calculate precision and recall (simplified)
    const truePositives = correctDetections;
    const falsePositives = totalWithFeedback - correctDetections;
    const falseNegatives = this.estimateFalseNegatives(detections);
    
    const precision = truePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
    const recall = truePositives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
    const f1Score = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    // Performance metrics
    const averageDetectionTime = detections.length > 0
      ? detections.reduce((sum, d) => sum + d.processingTime, 0) / detections.length
      : 0;

    const signalsPerBoundary = detections.length > 0
      ? detections.reduce((sum, d) => sum + d.signals.length, 0) / detections.length
      : 0;

    // Prediction accuracy (if predictions are available)
    const withPredictions = detections.filter(d => d.prediction);
    const predictionAccuracy = withPredictions.length > 0
      ? withPredictions.filter(d => {
          const predicted = d.prediction!.probability > 0.5;
          return predicted === d.correct;
        }).length / withPredictions.length
      : 0;

    // Quality scores
    const boundaryQualityScore = this.calculateBoundaryQuality(detections);
    const userSatisfactionScore = this.calculateUserSatisfaction();
    const adaptationEffectiveness = this.calculateAdaptationEffectiveness();

    return {
      accuracy,
      precision,
      recall,
      f1Score,
      totalBoundariesDetected: detections.length,
      correctBoundaries: correctDetections,
      falsePositives,
      falseNegatives,
      missedBoundaries: falseNegatives,
      averageDetectionTime,
      signalsPerBoundary,
      predictionAccuracy,
      boundaryQualityScore,
      userSatisfactionScore,
      adaptationEffectiveness
    };
  }

  private analyzeSignals(detections: typeof this.detectionHistory): SignalAnalysis {
    const signalTypeDistribution = new Map<string, number>();
    const averageSignalStrength = new Map<string, number>();
    const signalCorrelations = new Map<string, Map<string, number>>();

    // Analyze signal distribution and strength
    for (const detection of detections) {
      for (const signal of detection.signals) {
        const key = `${signal.type}:${signal.subtype}`;
        
        // Count signal types
        signalTypeDistribution.set(key, (signalTypeDistribution.get(key) || 0) + 1);
        
        // Track signal strength
        if (!averageSignalStrength.has(key)) {
          averageSignalStrength.set(key, 0);
        }
        const currentAvg = averageSignalStrength.get(key)!;
        const count = signalTypeDistribution.get(key)!;
        averageSignalStrength.set(key, (currentAvg * (count - 1) + signal.strength) / count);
      }

      // Analyze signal correlations
      for (let i = 0; i < detection.signals.length - 1; i++) {
        for (let j = i + 1; j < detection.signals.length; j++) {
          const signal1 = `${detection.signals[i].type}:${detection.signals[i].subtype}`;
          const signal2 = `${detection.signals[j].type}:${detection.signals[j].subtype}`;
          
          if (!signalCorrelations.has(signal1)) {
            signalCorrelations.set(signal1, new Map());
          }
          const correlations = signalCorrelations.get(signal1)!;
          correlations.set(signal2, (correlations.get(signal2) || 0) + 1);
        }
      }
    }

    // Find most effective signals
    const mostEffectiveSignals = [];
    const underperformingSignals = [];

    for (const [signalKey, count] of signalTypeDistribution.entries()) {
      const [type, subtype] = signalKey.split(':');
      const success = this.signalSuccess.get(signalKey) || 0;
      const successRate = count > 0 ? success / count : 0;
      const falsePositiveRate = count > 0 ? (count - success) / count : 0;
      const avgStrength = averageSignalStrength.get(signalKey) || 0;

      if (successRate > 0.7 && count > 5) { // High success with sufficient samples
        mostEffectiveSignals.push({
          type,
          subtype,
          successRate,
          averageStrength: avgStrength
        });
      } else if (successRate < 0.3 && count > 5) { // Low success with sufficient samples
        underperformingSignals.push({
          type,
          subtype,
          successRate,
          falsePositiveRate
        });
      }
    }

    return {
      signalTypeDistribution,
      averageSignalStrength,
      signalCorrelations,
      mostEffectiveSignals: mostEffectiveSignals.sort((a, b) => b.successRate - a.successRate),
      underperformingSignals: underperformingSignals.sort((a, b) => a.successRate - b.successRate)
    };
  }

  private analyzePatterns(detections: typeof this.detectionHistory): PatternAnalysis {
    const learnedPatterns = this.patternUsage.size;
    const patternEffectiveness = new Map<string, number>();
    const patternUsage = new Map<string, number>();

    // Calculate pattern effectiveness
    for (const [patternId, usage] of this.patternUsage.entries()) {
      const success = this.patternSuccess.get(patternId) || 0;
      const effectiveness = usage > 0 ? success / usage : 0;
      patternEffectiveness.set(patternId, effectiveness);
      patternUsage.set(patternId, usage);
    }

    // Calculate adaptation rate
    const recentPatterns = Array.from(this.patternUsage.entries())
      .filter(([_, usage]) => usage > 0)
      .length;
    const adaptationRate = learnedPatterns > 0 ? recentPatterns / learnedPatterns : 0;

    // Identify most valuable and obsolete patterns
    const mostValuablePatterns: BehaviorPattern[] = [];
    const obsoletePatterns: BehaviorPattern[] = [];

    // This would be populated from actual pattern data in a real implementation
    // For now, we provide the structure

    return {
      learnedPatterns,
      patternEffectiveness,
      patternUsage,
      adaptationRate,
      mostValuablePatterns,
      obsoletePatterns
    };
  }

  private analyzeConfigurationImpact(): ConfigurationImpact {
    const parameterEffectiveness = new Map<string, number>();
    const optimalValues = new Map<string, number>();
    const adaptiveAdjustments = new Map<string, number[]>();
    const configurationCorrelations = new Map<string, number>();

    // Analyze configuration changes and their impact on performance
    for (let i = 1; i < this.configHistory.length; i++) {
      const prevConfig = this.configHistory[i - 1];
      const currentConfig = this.configHistory[i];
      
      // Calculate performance before and after config change
      const beforePerformance = this.calculateAccuracy(3600000); // 1 hour before
      // This would need more sophisticated analysis in a real implementation
      
      for (const [param, value] of Object.entries(currentConfig.config)) {
        if (prevConfig.config[param as keyof DetectionConfig] !== value) {
          // Parameter changed, track its effectiveness
          parameterEffectiveness.set(param, beforePerformance);
        }
      }
    }

    return {
      parameterEffectiveness,
      optimalValues,
      adaptiveAdjustments,
      configurationCorrelations
    };
  }

  private generateRecommendations(
    metrics: DetectionMetrics,
    signalAnalysis: SignalAnalysis,
    patternAnalysis: PatternAnalysis,
    configurationImpact: ConfigurationImpact
  ): string[] {
    const recommendations: string[] = [];

    // Accuracy recommendations
    if (metrics.accuracy < 0.7) {
      recommendations.push('Consider adjusting detection thresholds to improve accuracy');
    }

    if (metrics.falsePositives > metrics.falseNegatives * 2) {
      recommendations.push('Increase boundary threshold to reduce false positives');
    } else if (metrics.falseNegatives > metrics.falsePositives * 2) {
      recommendations.push('Decrease boundary threshold to reduce missed boundaries');
    }

    // Signal recommendations
    if (signalAnalysis.underperformingSignals.length > 0) {
      const worstSignal = signalAnalysis.underperformingSignals[0];
      recommendations.push(
        `Consider reducing weight for ${worstSignal.subtype} signals (${Math.round(worstSignal.successRate * 100)}% success rate)`
      );
    }

    if (signalAnalysis.mostEffectiveSignals.length > 0) {
      const bestSignal = signalAnalysis.mostEffectiveSignals[0];
      recommendations.push(
        `Consider increasing weight for ${bestSignal.subtype} signals (${Math.round(bestSignal.successRate * 100)}% success rate)`
      );
    }

    // Performance recommendations
    if (metrics.averageDetectionTime > 100) { // 100ms threshold
      recommendations.push('Consider optimizing signal processing for better performance');
    }

    if (metrics.signalsPerBoundary > 10) {
      recommendations.push('Consider pruning signal types to reduce noise');
    }

    // Pattern recommendations
    if (patternAnalysis.adaptationRate < 0.3) {
      recommendations.push('Enable adaptive learning to improve pattern recognition');
    }

    // User satisfaction recommendations
    if (metrics.userSatisfactionScore < 0.6) {
      recommendations.push('Review boundary detection logic based on user feedback');
    }

    return recommendations;
  }

  private calculateTrends(): PerformanceTrend[] {
    const trends: PerformanceTrend[] = [];
    
    if (this.performanceHistory.length < 2) return trends;

    // Calculate accuracy trend
    const recentAccuracy = this.performanceHistory.slice(-5).map(m => m.accuracy);
    const olderAccuracy = this.performanceHistory.slice(-10, -5).map(m => m.accuracy);
    
    if (recentAccuracy.length > 0 && olderAccuracy.length > 0) {
      const recentAvg = recentAccuracy.reduce((sum, a) => sum + a, 0) / recentAccuracy.length;
      const olderAvg = olderAccuracy.reduce((sum, a) => sum + a, 0) / olderAccuracy.length;
      const change = recentAvg - olderAvg;
      
      trends.push({
        metric: 'accuracy',
        direction: change > 0.05 ? 'improving' : change < -0.05 ? 'declining' : 'stable',
        change,
        significance: Math.abs(change),
        timeframe: 5
      });
    }

    return trends;
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private updateRealTimeMetrics(processingTime: number): void {
    this.realTimeMetrics.averageResponseTime = 
      (this.realTimeMetrics.averageResponseTime * 0.9) + (processingTime * 0.1);
    
    this.realTimeMetrics.recentDetections++;
    this.realTimeMetrics.currentAccuracy = this.calculateAccuracy(3600000); // Last hour
    this.realTimeMetrics.lastUpdateTime = Date.now();

    // Reset recent detections counter every hour
    if (Date.now() - this.realTimeMetrics.lastUpdateTime > 3600000) {
      this.realTimeMetrics.recentDetections = 0;
    }
  }

  private trackSignalUsage(signals: DetectionSignal[]): void {
    for (const signal of signals) {
      const key = `${signal.type}:${signal.subtype}`;
      this.signalCounts.set(key, (this.signalCounts.get(key) || 0) + 1);
      
      // Track signal strengths
      if (!this.signalStrengths.has(key)) {
        this.signalStrengths.set(key, []);
      }
      this.signalStrengths.get(key)!.push(signal.strength);
      
      // Keep only last 100 strength values
      if (this.signalStrengths.get(key)!.length > 100) {
        this.signalStrengths.set(key, this.signalStrengths.get(key)!.slice(-50));
      }
    }
  }

  private updateSignalSuccess(signals: DetectionSignal[], correct: boolean): void {
    for (const signal of signals) {
      const key = `${signal.type}:${signal.subtype}`;
      if (correct) {
        this.signalSuccess.set(key, (this.signalSuccess.get(key) || 0) + 1);
      }
    }
  }

  private estimateFalseNegatives(detections: typeof this.detectionHistory): number {
    // Simplified estimation - in reality this would require more sophisticated analysis
    const negativeFeedback = this.userFeedback.filter(f => f.rating === 'missed');
    return negativeFeedback.length;
  }

  private calculateBoundaryQuality(detections: typeof this.detectionHistory): number {
    // Calculate average quality based on signal strength and user feedback
    let totalQuality = 0;
    let count = 0;

    for (const detection of detections) {
      const avgSignalStrength = detection.signals.length > 0
        ? detection.signals.reduce((sum, s) => sum + s.strength, 0) / detection.signals.length
        : 0;
      
      const userRating = detection.correct !== undefined 
        ? (detection.correct ? 1 : 0)
        : 0.5;
      
      totalQuality += (avgSignalStrength + userRating) / 2;
      count++;
    }

    return count > 0 ? totalQuality / count : 0.5;
  }

  private calculateUserSatisfaction(): number {
    if (this.userFeedback.length === 0) return 0.5;

    const positiveRatings = this.userFeedback.filter(f => 
      f.rating === 'correct' || (f.confidence > 0.7 && f.rating !== 'incorrect')
    ).length;

    return positiveRatings / this.userFeedback.length;
  }

  private calculateAdaptationEffectiveness(): number {
    // Measure how well adaptive adjustments improve performance
    if (this.configHistory.length < 2) return 0.5;

    // Compare performance before and after recent config changes
    const recentChanges = this.configHistory.slice(-5);
    let improvementCount = 0;
    let totalChanges = 0;

    for (let i = 1; i < recentChanges.length; i++) {
      const beforeAccuracy = this.calculateAccuracy(3600000);
      // This would need more sophisticated before/after analysis
      totalChanges++;
    }

    return totalChanges > 0 ? improvementCount / totalChanges : 0.5;
  }

  private createEmptyMetrics(): DetectionMetrics {
    return {
      accuracy: 0.5,
      precision: 0,
      recall: 0,
      f1Score: 0,
      totalBoundariesDetected: 0,
      correctBoundaries: 0,
      falsePositives: 0,
      falseNegatives: 0,
      missedBoundaries: 0,
      averageDetectionTime: 0,
      signalsPerBoundary: 0,
      predictionAccuracy: 0,
      boundaryQualityScore: 0.5,
      userSatisfactionScore: 0.5,
      adaptationEffectiveness: 0.5
    };
  }

  private createEmptyRealTimeMetrics(): RealTimeMetrics {
    return {
      currentAccuracy: 0.5,
      recentDetections: 0,
      averageResponseTime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      signalQueueLength: 0,
      lastUpdateTime: Date.now()
    };
  }

  private pruneDetectionHistory(): void {
    if (this.detectionHistory.length > 5000) {
      this.detectionHistory = this.detectionHistory.slice(-2500);
    }
  }

  private pruneUserFeedback(): void {
    if (this.userFeedback.length > 1000) {
      this.userFeedback = this.userFeedback.slice(-500);
    }
  }

  // =============================================================================
  // PUBLIC API
  // =============================================================================

  /**
   * Reset all analytics data
   */
  reset(): void {
    this.detectionHistory = [];
    this.userFeedback = [];
    this.performanceHistory = [];
    this.configHistory = [];
    this.signalCounts.clear();
    this.signalSuccess.clear();
    this.signalStrengths.clear();
    this.patternUsage.clear();
    this.patternSuccess.clear();
    this.detectionTimes = [];
    this.realTimeMetrics = this.createEmptyRealTimeMetrics();
    this.lastAnalysisTime = 0;
  }

  /**
   * Get summary statistics
   */
  getSummaryStats() {
    return {
      totalDetections: this.detectionHistory.length,
      totalFeedback: this.userFeedback.length,
      currentAccuracy: this.calculateAccuracy(),
      averageProcessingTime: this.detectionTimes.length > 0
        ? this.detectionTimes.reduce((sum, t) => sum + t, 0) / this.detectionTimes.length
        : 0,
      signalTypes: this.signalCounts.size,
      configurationChanges: this.configHistory.length,
      uptime: Date.now() - this.realTimeMetrics.lastUpdateTime
    };
  }

  /**
   * Get detection history for a specific time range
   */
  getDetectionHistory(startTime?: number, endTime?: number) {
    const now = Date.now();
    const start = startTime || now - 24 * 60 * 60 * 1000;
    const end = endTime || now;

    return this.detectionHistory.filter(d =>
      d.timestamp >= start && d.timestamp <= end
    );
  }
}