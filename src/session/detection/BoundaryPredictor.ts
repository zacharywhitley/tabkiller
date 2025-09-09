/**
 * Session Boundary Prediction Logic
 * Machine learning-inspired pattern recognition for predicting session boundaries
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

import { BehaviorAnalyzer } from './BehaviorAnalyzer';

// =============================================================================
// PREDICTION TYPES
// =============================================================================

export interface PredictionModel {
  id: string;
  type: 'temporal' | 'sequential' | 'ensemble';
  features: string[];
  weights: Map<string, number>;
  accuracy: number;
  lastTrained: number;
  predictions: number;
  correctPredictions: number;
}

export interface FeatureVector {
  // Temporal features
  timeSinceLastEvent: number;
  timeOfDay: number;
  dayOfWeek: number;
  sessionDuration: number;
  
  // Activity features
  eventVelocity: number;
  recentEventCount: number;
  idleTime: number;
  
  // Domain features
  domainChangeCount: number;
  categoryChangeCount: number;
  domainSimilarity: number;
  
  // Navigation features
  navigationGaps: number[];
  backNavigation: boolean;
  tabSwitches: number;
  
  // Behavioral features
  focusTime: number;
  burstActivity: boolean;
  windowChanges: number;
  
  // Contextual features
  isWorkingHours: boolean;
  workTransition: boolean;
  longSession: boolean;
}

export interface BoundaryPrediction {
  probability: number;
  confidence: number;
  reasoning: string[];
  predictedBoundary?: SessionBoundary;
  features: FeatureVector;
  modelUsed: string;
  timestamp: number;
}

export interface TrainingData {
  features: FeatureVector;
  label: boolean; // true if boundary was created
  actualBoundary?: SessionBoundary;
  timestamp: number;
}

// =============================================================================
// BOUNDARY PREDICTOR
// =============================================================================

export class BoundaryPredictor {
  private models: Map<string, PredictionModel> = new Map();
  private trainingData: TrainingData[] = [];
  private featureHistory: FeatureVector[] = [];
  private predictions: BoundaryPrediction[] = [];
  private config: DetectionConfig;
  private behaviorAnalyzer: BehaviorAnalyzer;

  constructor(config: DetectionConfig, behaviorAnalyzer: BehaviorAnalyzer) {
    this.config = config;
    this.behaviorAnalyzer = behaviorAnalyzer;
    this.initializeModels();
  }

  /**
   * Predict probability of session boundary given current context
   */
  async predictBoundary(
    event: BrowsingEvent,
    recentEvents: BrowsingEvent[],
    signals: DetectionSignal[]
  ): Promise<BoundaryPrediction> {
    // Extract features from current context
    const features = await this.extractFeatures(event, recentEvents, signals);
    
    // Store feature vector for learning
    this.featureHistory.push(features);
    this.pruneFeatureHistory();

    // Get predictions from all models
    const modelPredictions = new Map<string, number>();
    for (const [modelId, model] of this.models.entries()) {
      const probability = this.predictWithModel(model, features);
      modelPredictions.set(modelId, probability);
    }

    // Ensemble prediction (weighted average)
    const ensembleProbability = this.calculateEnsemblePrediction(modelPredictions);
    
    // Calculate confidence based on model agreement
    const confidence = this.calculatePredictionConfidence(modelPredictions);
    
    // Generate reasoning
    const reasoning = this.generateReasoning(features, modelPredictions, signals);
    
    // Create potential boundary if probability is high
    let predictedBoundary: SessionBoundary | undefined;
    if (ensembleProbability > this.config.patternConfidenceThreshold) {
      predictedBoundary = this.createPredictedBoundary(event, features, ensembleProbability);
    }

    const prediction: BoundaryPrediction = {
      probability: ensembleProbability,
      confidence,
      reasoning,
      predictedBoundary,
      features,
      modelUsed: 'ensemble',
      timestamp: event.timestamp
    };

    this.predictions.push(prediction);
    this.prunePredictions();

    return prediction;
  }

  /**
   * Train models with new boundary outcome
   */
  async trainWithOutcome(
    prediction: BoundaryPrediction,
    actualBoundary: SessionBoundary | null
  ): Promise<void> {
    if (!this.config.learningEnabled) return;

    const trainingPoint: TrainingData = {
      features: prediction.features,
      label: actualBoundary !== null,
      actualBoundary: actualBoundary || undefined,
      timestamp: prediction.timestamp
    };

    this.trainingData.push(trainingPoint);
    this.pruneTrainingData();

    // Update model accuracy
    this.updateModelAccuracy(prediction, actualBoundary !== null);

    // Retrain models periodically
    if (this.trainingData.length > 50 && this.trainingData.length % 10 === 0) {
      await this.retrainModels();
    }

    // Adapt feature weights based on outcome
    await this.adaptFeatureWeights(prediction, actualBoundary !== null);
  }

  /**
   * Extract feature vector from current context
   */
  private async extractFeatures(
    event: BrowsingEvent,
    recentEvents: BrowsingEvent[],
    signals: DetectionSignal[]
  ): Promise<FeatureVector> {
    const now = event.timestamp;
    const date = new Date(now);

    // Get the last event for time calculations
    const lastEvent = recentEvents.length > 0 ? recentEvents[recentEvents.length - 1] : null;
    const timeSinceLastEvent = lastEvent ? now - lastEvent.timestamp : 0;

    // Calculate session duration
    const sessionStart = recentEvents.length > 0 ? recentEvents[0].timestamp : now;
    const sessionDuration = now - sessionStart;

    // Analyze recent activity
    const recentWindow = 5 * 60 * 1000; // 5 minutes
    const recentEventCount = recentEvents.filter(e => now - e.timestamp < recentWindow).length;
    const eventVelocity = recentWindow > 0 ? (recentEventCount / recentWindow) * 60000 : 0;

    // Domain analysis
    const urlEvents = recentEvents.filter(e => e.url);
    const domains = urlEvents.map(e => this.extractDomain(e.url!)).filter(Boolean);
    const uniqueDomains = new Set(domains);
    const categories = domains.map(d => this.getDomainCategory(d));
    const uniqueCategories = new Set(categories);

    // Calculate domain changes in recent period
    const domainChangeCount = this.countDomainChanges(urlEvents, recentWindow);
    const categoryChangeCount = this.countCategoryChanges(urlEvents, recentWindow);
    const domainSimilarity = this.calculateCurrentDomainSimilarity(event.url, domains);

    // Navigation analysis
    const navigationEvents = recentEvents.filter(e => this.isNavigationEvent(e.type));
    const navigationGaps = this.calculateNavigationGaps(navigationEvents);
    const backNavigation = event.metadata?.transitionType === 'auto_bookmark';

    // Tab analysis
    const tabEvents = recentEvents.filter(e => e.type.includes('tab_'));
    const tabSwitches = tabEvents.filter(e => e.type === 'tab_activated').length;

    // Focus analysis
    const focusTime = this.calculateCurrentFocusTime(recentEvents);

    // Activity burst detection
    const burstActivity = this.detectBurstActivity(recentEvents, recentWindow);

    // Window analysis
    const windowEvents = recentEvents.filter(e => e.type.includes('window_'));
    const windowChanges = windowEvents.length;

    // Idle time calculation
    const idleEvents = recentEvents.filter(e => e.type === 'idle_start' || e.type === 'idle_end');
    const idleTime = this.calculateIdleTime(idleEvents);

    // Contextual features
    const hour = date.getHours();
    const dayOfWeek = date.getDay();
    const isWorkingHours = dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 9 && hour <= 17;
    const workTransitionHours = [9, 12, 17, 22];
    const workTransition = workTransitionHours.includes(hour);
    const longSession = sessionDuration > 8 * 60 * 60 * 1000; // 8+ hours

    return {
      // Temporal features
      timeSinceLastEvent,
      timeOfDay: hour,
      dayOfWeek,
      sessionDuration,
      
      // Activity features
      eventVelocity,
      recentEventCount,
      idleTime,
      
      // Domain features
      domainChangeCount,
      categoryChangeCount,
      domainSimilarity,
      
      // Navigation features
      navigationGaps,
      backNavigation,
      tabSwitches,
      
      // Behavioral features
      focusTime,
      burstActivity,
      windowChanges,
      
      // Contextual features
      isWorkingHours,
      workTransition,
      longSession
    };
  }

  /**
   * Initialize prediction models
   */
  private initializeModels(): void {
    // Temporal model - focuses on time-based patterns
    this.models.set('temporal', {
      id: 'temporal',
      type: 'temporal',
      features: [
        'timeSinceLastEvent',
        'timeOfDay',
        'sessionDuration',
        'idleTime',
        'isWorkingHours',
        'workTransition',
        'longSession'
      ],
      weights: new Map([
        ['timeSinceLastEvent', 0.25],
        ['timeOfDay', 0.15],
        ['sessionDuration', 0.20],
        ['idleTime', 0.15],
        ['isWorkingHours', 0.10],
        ['workTransition', 0.10],
        ['longSession', 0.05]
      ]),
      accuracy: 0.5,
      lastTrained: Date.now(),
      predictions: 0,
      correctPredictions: 0
    });

    // Sequential model - focuses on event sequences and navigation patterns
    this.models.set('sequential', {
      id: 'sequential',
      type: 'sequential',
      features: [
        'eventVelocity',
        'domainChangeCount',
        'categoryChangeCount',
        'tabSwitches',
        'backNavigation',
        'burstActivity',
        'focusTime'
      ],
      weights: new Map([
        ['eventVelocity', 0.20],
        ['domainChangeCount', 0.20],
        ['categoryChangeCount', 0.15],
        ['tabSwitches', 0.15],
        ['backNavigation', 0.10],
        ['burstActivity', 0.10],
        ['focusTime', 0.10]
      ]),
      accuracy: 0.5,
      lastTrained: Date.now(),
      predictions: 0,
      correctPredictions: 0
    });

    // Ensemble model - combines all features
    this.models.set('ensemble', {
      id: 'ensemble',
      type: 'ensemble',
      features: [
        'timeSinceLastEvent', 'sessionDuration', 'eventVelocity',
        'domainChangeCount', 'categoryChangeCount', 'idleTime',
        'tabSwitches', 'burstActivity', 'workTransition'
      ],
      weights: new Map([
        ['timeSinceLastEvent', 0.15],
        ['sessionDuration', 0.12],
        ['eventVelocity', 0.12],
        ['domainChangeCount', 0.12],
        ['categoryChangeCount', 0.10],
        ['idleTime', 0.10],
        ['tabSwitches', 0.10],
        ['burstActivity', 0.10],
        ['workTransition', 0.09]
      ]),
      accuracy: 0.5,
      lastTrained: Date.now(),
      predictions: 0,
      correctPredictions: 0
    });
  }

  /**
   * Predict with a specific model
   */
  private predictWithModel(model: PredictionModel, features: FeatureVector): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [featureName, weight] of model.weights.entries()) {
      const featureValue = this.getFeatureValue(features, featureName);
      const normalizedValue = this.normalizeFeatureValue(featureName, featureValue);
      
      weightedSum += normalizedValue * weight;
      totalWeight += weight;
    }

    // Apply sigmoid function for probability
    const rawScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const probability = this.sigmoid(rawScore);

    // Track model usage
    model.predictions++;

    return probability;
  }

  /**
   * Calculate ensemble prediction from multiple models
   */
  private calculateEnsemblePrediction(modelPredictions: Map<string, number>): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [modelId, prediction] of modelPredictions.entries()) {
      const model = this.models.get(modelId);
      if (model) {
        const weight = model.accuracy || 0.5; // Use accuracy as weight
        weightedSum += prediction * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Calculate prediction confidence based on model agreement
   */
  private calculatePredictionConfidence(modelPredictions: Map<string, number>): number {
    const predictions = Array.from(modelPredictions.values());
    if (predictions.length < 2) return 0.5;

    // Calculate variance in predictions
    const mean = predictions.reduce((sum, p) => sum + p, 0) / predictions.length;
    const variance = predictions.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / predictions.length;
    
    // Lower variance = higher confidence
    return Math.max(0, 1 - Math.sqrt(variance));
  }

  /**
   * Generate human-readable reasoning for prediction
   */
  private generateReasoning(
    features: FeatureVector,
    modelPredictions: Map<string, number>,
    signals: DetectionSignal[]
  ): string[] {
    const reasoning: string[] = [];

    // Time-based reasoning
    if (features.timeSinceLastEvent > 300000) { // 5+ minutes
      reasoning.push(`Long gap since last activity (${Math.round(features.timeSinceLastEvent / 60000)}min)`);
    }

    if (features.sessionDuration > 8 * 60 * 60 * 1000) { // 8+ hours
      reasoning.push('Extended session duration suggests natural break point');
    }

    if (features.workTransition) {
      reasoning.push(`Work transition hour (${features.timeOfDay}:00) detected`);
    }

    // Activity-based reasoning
    if (features.eventVelocity < 0.1) {
      reasoning.push('Low activity velocity indicates potential session end');
    }

    if (features.burstActivity) {
      reasoning.push('Activity burst after quiet period suggests new session');
    }

    // Domain-based reasoning
    if (features.domainChangeCount > 3) {
      reasoning.push('Multiple domain changes indicate context switching');
    }

    if (features.categoryChangeCount > 2) {
      reasoning.push('Category transitions suggest task switching');
    }

    // Behavioral reasoning
    if (features.focusTime < 30000 && features.tabSwitches > 5) {
      reasoning.push('High distraction pattern with frequent tab switching');
    }

    if (features.windowChanges > 0) {
      reasoning.push('Window management activity detected');
    }

    // Signal-based reasoning
    for (const signal of signals) {
      if (signal.strength > 0.7) {
        reasoning.push(`Strong ${signal.subtype} signal detected (${Math.round(signal.strength * 100)}%)`);
      }
    }

    // Model agreement reasoning
    const predictions = Array.from(modelPredictions.values());
    const avgPrediction = predictions.reduce((sum, p) => sum + p, 0) / predictions.length;
    if (avgPrediction > 0.8) {
      reasoning.push('High model agreement on boundary likelihood');
    } else if (avgPrediction < 0.3) {
      reasoning.push('Low probability of boundary based on patterns');
    }

    return reasoning.length > 0 ? reasoning : ['No significant boundary indicators detected'];
  }

  /**
   * Create predicted boundary from features and probability
   */
  private createPredictedBoundary(
    event: BrowsingEvent,
    features: FeatureVector,
    probability: number
  ): SessionBoundary {
    // Determine most likely reason
    let reason: SessionBoundary['reason'] = 'user_initiated';
    
    if (features.timeSinceLastEvent > this.config.idleThreshold) {
      reason = 'idle_timeout';
    } else if (features.domainChangeCount > 2) {
      reason = 'domain_change';
    } else if (features.navigationGaps.some(gap => gap > this.config.sessionGapThreshold)) {
      reason = 'navigation_gap';
    } else if (features.windowChanges > 0) {
      reason = 'window_closed';
    }

    return {
      id: `predicted_boundary_${Date.now()}`,
      type: 'end',
      reason,
      timestamp: event.timestamp + (this.config.boundaryPredictionLookahead || 60000),
      sessionId: '', // Will be set by caller
      metadata: {
        predicted: true,
        probability,
        confidence: this.calculatePredictionConfidence(new Map([['prediction', probability]])),
        features: {
          timeSinceLastEvent: features.timeSinceLastEvent,
          sessionDuration: features.sessionDuration,
          domainChangeCount: features.domainChangeCount,
          eventVelocity: features.eventVelocity
        }
      }
    };
  }

  /**
   * Update model accuracy based on prediction outcome
   */
  private updateModelAccuracy(prediction: BoundaryPrediction, actualOutcome: boolean): void {
    const predicted = prediction.probability > 0.5;
    const correct = predicted === actualOutcome;

    for (const model of this.models.values()) {
      if (correct) {
        model.correctPredictions++;
      }
      
      // Update accuracy with exponential moving average
      const newAccuracy = model.correctPredictions / model.predictions;
      model.accuracy = model.accuracy * 0.9 + newAccuracy * 0.1;
    }
  }

  /**
   * Retrain models with accumulated training data
   */
  private async retrainModels(): Promise<void> {
    for (const model of this.models.values()) {
      await this.retrainModel(model);
    }
  }

  /**
   * Retrain a specific model
   */
  private async retrainModel(model: PredictionModel): Promise<void> {
    if (this.trainingData.length < 10) return;

    // Simple weight adjustment based on feature importance
    const featureImportance = this.calculateFeatureImportance(model.features);
    
    for (const [featureName, importance] of featureImportance.entries()) {
      const currentWeight = model.weights.get(featureName) || 0;
      const newWeight = currentWeight * 0.8 + importance * 0.2; // Weighted average
      model.weights.set(featureName, Math.max(0.01, Math.min(1, newWeight)));
    }

    // Normalize weights
    const totalWeight = Array.from(model.weights.values()).reduce((sum, w) => sum + w, 0);
    if (totalWeight > 0) {
      for (const [featureName, weight] of model.weights.entries()) {
        model.weights.set(featureName, weight / totalWeight);
      }
    }

    model.lastTrained = Date.now();
  }

  /**
   * Calculate feature importance based on correlation with outcomes
   */
  private calculateFeatureImportance(features: string[]): Map<string, number> {
    const importance = new Map<string, number>();
    
    if (this.trainingData.length < 5) {
      // Not enough data, use equal importance
      const equalImportance = 1 / features.length;
      for (const feature of features) {
        importance.set(feature, equalImportance);
      }
      return importance;
    }

    for (const featureName of features) {
      let correlation = 0;
      let count = 0;

      // Calculate simple correlation between feature value and outcome
      for (const training of this.trainingData) {
        const featureValue = this.getFeatureValue(training.features, featureName);
        const normalizedValue = this.normalizeFeatureValue(featureName, featureValue);
        const outcome = training.label ? 1 : 0;
        
        correlation += normalizedValue * outcome;
        count++;
      }

      importance.set(featureName, count > 0 ? Math.abs(correlation / count) : 0);
    }

    return importance;
  }

  /**
   * Adapt feature weights based on prediction outcomes
   */
  private async adaptFeatureWeights(prediction: BoundaryPrediction, actualOutcome: boolean): Promise<void> {
    const predicted = prediction.probability > 0.5;
    const correct = predicted === actualOutcome;
    const adaptationRate = this.config.adaptationRate * 0.1; // Small adjustments

    if (!correct) {
      // Adjust weights based on which features led to incorrect prediction
      for (const model of this.models.values()) {
        for (const featureName of model.features) {
          const featureValue = this.getFeatureValue(prediction.features, featureName);
          const normalizedValue = this.normalizeFeatureValue(featureName, featureValue);
          const currentWeight = model.weights.get(featureName) || 0;

          // If feature value was high but prediction was wrong, reduce its weight
          if (normalizedValue > 0.7 && !correct) {
            const newWeight = Math.max(0.01, currentWeight - adaptationRate);
            model.weights.set(featureName, newWeight);
          }
        }
      }
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private getFeatureValue(features: FeatureVector, featureName: string): number {
    switch (featureName) {
      case 'timeSinceLastEvent': return features.timeSinceLastEvent;
      case 'timeOfDay': return features.timeOfDay;
      case 'dayOfWeek': return features.dayOfWeek;
      case 'sessionDuration': return features.sessionDuration;
      case 'eventVelocity': return features.eventVelocity;
      case 'recentEventCount': return features.recentEventCount;
      case 'idleTime': return features.idleTime;
      case 'domainChangeCount': return features.domainChangeCount;
      case 'categoryChangeCount': return features.categoryChangeCount;
      case 'domainSimilarity': return features.domainSimilarity;
      case 'backNavigation': return features.backNavigation ? 1 : 0;
      case 'tabSwitches': return features.tabSwitches;
      case 'focusTime': return features.focusTime;
      case 'burstActivity': return features.burstActivity ? 1 : 0;
      case 'windowChanges': return features.windowChanges;
      case 'isWorkingHours': return features.isWorkingHours ? 1 : 0;
      case 'workTransition': return features.workTransition ? 1 : 0;
      case 'longSession': return features.longSession ? 1 : 0;
      default: return 0;
    }
  }

  private normalizeFeatureValue(featureName: string, value: number): number {
    // Normalize different feature types to 0-1 range
    switch (featureName) {
      case 'timeSinceLastEvent':
        return Math.min(value / (30 * 60 * 1000), 1); // Normalize to 30 minutes max
      case 'timeOfDay':
        return value / 23; // 0-23 hours to 0-1
      case 'dayOfWeek':
        return value / 6; // 0-6 days to 0-1
      case 'sessionDuration':
        return Math.min(value / (12 * 60 * 60 * 1000), 1); // Normalize to 12 hours max
      case 'eventVelocity':
        return Math.min(value / 10, 1); // Normalize to 10 events/minute max
      case 'recentEventCount':
        return Math.min(value / 50, 1); // Normalize to 50 events max
      case 'idleTime':
        return Math.min(value / (60 * 60 * 1000), 1); // Normalize to 1 hour max
      case 'domainChangeCount':
      case 'categoryChangeCount':
        return Math.min(value / 10, 1); // Normalize to 10 changes max
      case 'domainSimilarity':
        return value; // Already 0-1
      case 'tabSwitches':
        return Math.min(value / 20, 1); // Normalize to 20 switches max
      case 'focusTime':
        return Math.min(value / (30 * 60 * 1000), 1); // Normalize to 30 minutes max
      case 'windowChanges':
        return Math.min(value / 5, 1); // Normalize to 5 changes max
      default:
        return Math.min(Math.max(value, 0), 1); // Clamp to 0-1
    }
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
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

  private countDomainChanges(events: BrowsingEvent[], timeWindow: number): number {
    const now = Date.now();
    const recentEvents = events.filter(e => now - e.timestamp < timeWindow);
    
    let changes = 0;
    let lastDomain = '';
    
    for (const event of recentEvents) {
      const domain = this.extractDomain(event.url!);
      if (lastDomain && domain !== lastDomain) {
        changes++;
      }
      lastDomain = domain;
    }
    
    return changes;
  }

  private countCategoryChanges(events: BrowsingEvent[], timeWindow: number): number {
    const now = Date.now();
    const recentEvents = events.filter(e => now - e.timestamp < timeWindow);
    
    let changes = 0;
    let lastCategory = '';
    
    for (const event of recentEvents) {
      const domain = this.extractDomain(event.url!);
      const category = this.getDomainCategory(domain);
      if (lastCategory && category !== lastCategory) {
        changes++;
      }
      lastCategory = category;
    }
    
    return changes;
  }

  private calculateCurrentDomainSimilarity(currentUrl: string | undefined, recentDomains: string[]): number {
    if (!currentUrl || recentDomains.length === 0) return 0;
    
    const currentDomain = this.extractDomain(currentUrl);
    const currentCategory = this.getDomainCategory(currentDomain);
    
    // Check for exact domain matches
    if (recentDomains.includes(currentDomain)) return 1.0;
    
    // Check for same-category matches
    const categoryMatches = recentDomains.filter(d => this.getDomainCategory(d) === currentCategory);
    if (categoryMatches.length > 0) return 0.6;
    
    // Check for same root domain
    const rootDomain = currentDomain.split('.').slice(-2).join('.');
    const rootMatches = recentDomains.filter(d => {
      const recentRoot = d.split('.').slice(-2).join('.');
      return recentRoot === rootDomain;
    });
    if (rootMatches.length > 0) return 0.8;
    
    return 0;
  }

  private isNavigationEvent(eventType: EventType): boolean {
    return [
      'navigation_started',
      'navigation_completed',
      'navigation_committed',
      'page_loaded'
    ].includes(eventType);
  }

  private calculateNavigationGaps(navigationEvents: BrowsingEvent[]): number[] {
    const gaps = [];
    for (let i = 1; i < navigationEvents.length; i++) {
      gaps.push(navigationEvents[i].timestamp - navigationEvents[i - 1].timestamp);
    }
    return gaps;
  }

  private calculateCurrentFocusTime(events: BrowsingEvent[]): number {
    const tabActivations = events.filter(e => e.type === 'tab_activated');
    if (tabActivations.length < 2) return 0;
    
    return tabActivations[tabActivations.length - 1].timestamp - tabActivations[tabActivations.length - 2].timestamp;
  }

  private detectBurstActivity(events: BrowsingEvent[], timeWindow: number): boolean {
    const now = Date.now();
    const recentEvents = events.filter(e => now - e.timestamp < timeWindow);
    const eventRate = (recentEvents.length / timeWindow) * 60000; // Events per minute
    
    return eventRate > 5; // More than 5 events per minute = burst
  }

  private calculateIdleTime(idleEvents: BrowsingEvent[]): number {
    let totalIdle = 0;
    let idleStart = 0;
    
    for (const event of idleEvents) {
      if (event.type === 'idle_start') {
        idleStart = event.timestamp;
      } else if (event.type === 'idle_end' && idleStart > 0) {
        totalIdle += event.timestamp - idleStart;
        idleStart = 0;
      }
    }
    
    return totalIdle;
  }

  private pruneFeatureHistory(): void {
    if (this.featureHistory.length > 1000) {
      this.featureHistory = this.featureHistory.slice(-500);
    }
  }

  private prunePredictions(): void {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();
    this.predictions = this.predictions.filter(p => now - p.timestamp < maxAge);
  }

  private pruneTrainingData(): void {
    if (this.trainingData.length > 500) {
      this.trainingData = this.trainingData.slice(-250);
    }
  }

  // =============================================================================
  // PUBLIC API
  // =============================================================================

  /**
   * Get model performance statistics
   */
  getModelStats() {
    const stats: Record<string, any> = {};
    
    for (const [modelId, model] of this.models.entries()) {
      stats[modelId] = {
        accuracy: model.accuracy,
        predictions: model.predictions,
        correctPredictions: model.correctPredictions,
        lastTrained: model.lastTrained,
        features: model.features.length
      };
    }
    
    return {
      models: stats,
      trainingDataSize: this.trainingData.length,
      featureHistorySize: this.featureHistory.length,
      recentPredictions: this.predictions.length
    };
  }

  /**
   * Get recent predictions for analysis
   */
  getRecentPredictions(limit: number = 10): BoundaryPrediction[] {
    return this.predictions.slice(-limit);
  }

  /**
   * Export predictor state for analysis or backup
   */
  exportPredictorState() {
    return {
      models: Object.fromEntries(
        Array.from(this.models.entries()).map(([id, model]) => [
          id,
          {
            ...model,
            weights: Object.fromEntries(model.weights)
          }
        ])
      ),
      trainingData: this.trainingData.slice(-100), // Last 100 training points
      recentPredictions: this.predictions.slice(-50), // Last 50 predictions
      stats: this.getModelStats()
    };
  }

  /**
   * Reset predictor state
   */
  reset(): void {
    this.trainingData = [];
    this.featureHistory = [];
    this.predictions = [];
    
    // Reset model stats but keep weights
    for (const model of this.models.values()) {
      model.predictions = 0;
      model.correctPredictions = 0;
      model.accuracy = 0.5;
    }
  }
}