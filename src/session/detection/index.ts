/**
 * Session Detection Integration Layer
 * Main integration point for enhanced session detection with existing infrastructure
 */

export * from './SessionDetectionEngine';
export * from './BehaviorAnalyzer';
export * from './BoundaryPredictor';
export * from './DetectionConfig';
export * from './DetectionAnalytics';

import {
  SessionDetectionEngine,
  DetectionConfig,
  DetectionSignal
} from './SessionDetectionEngine';

import { BehaviorAnalyzer } from './BehaviorAnalyzer';
import { BoundaryPredictor } from './BoundaryPredictor';
import { DetectionConfigManager } from './DetectionConfig';
import { DetectionAnalytics } from './DetectionAnalytics';

import {
  BrowsingEvent,
  SessionBoundary,
  TrackingConfig
} from '../../shared/types';

// =============================================================================
// INTEGRATED SESSION DETECTION SYSTEM
// =============================================================================

export class IntegratedSessionDetection {
  private detectionEngine: SessionDetectionEngine;
  private behaviorAnalyzer: BehaviorAnalyzer;
  private boundaryPredictor: BoundaryPredictor;
  private configManager: DetectionConfigManager;
  private analytics: DetectionAnalytics;

  private isInitialized: boolean = false;
  private eventQueue: BrowsingEvent[] = [];
  private processingQueue: boolean = false;

  constructor(initialConfig?: Partial<DetectionConfig>) {
    this.configManager = new DetectionConfigManager();
    
    if (initialConfig) {
      const profileId = this.configManager.createProfile(
        'Initial Configuration',
        'Configuration provided during initialization',
        initialConfig
      );
      this.configManager.switchProfile(profileId);
    }

    const config = this.configManager.getActiveConfig();
    
    this.detectionEngine = new SessionDetectionEngine(config);
    this.behaviorAnalyzer = new BehaviorAnalyzer();
    this.boundaryPredictor = new BoundaryPredictor(config, this.behaviorAnalyzer);
    this.analytics = new DetectionAnalytics();
  }

  /**
   * Initialize the detection system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Initializing Enhanced Session Detection System...');
      
      // Validate configuration
      const config = this.configManager.getActiveConfig();
      const validation = this.configManager.validateConfig(config);
      
      if (!validation.isValid) {
        console.warn('Configuration validation failed:', validation.errors);
        // Use default configuration as fallback
        this.configManager.switchProfile('default');
      }

      if (validation.warnings.length > 0) {
        console.warn('Configuration warnings:', validation.warnings);
      }

      // Process any queued events
      if (this.eventQueue.length > 0) {
        console.log(`Processing ${this.eventQueue.length} queued events...`);
        await this.processQueuedEvents();
      }

      this.isInitialized = true;
      console.log('Enhanced Session Detection System initialized successfully');

    } catch (error) {
      console.error('Failed to initialize session detection system:', error);
      throw error;
    }
  }

  /**
   * Process a browsing event for session boundary detection
   */
  async processEvent(event: BrowsingEvent): Promise<SessionBoundary | null> {
    if (!this.isInitialized) {
      // Queue events until initialization is complete
      this.eventQueue.push(event);
      return null;
    }

    try {
      const startTime = performance.now();

      // Add event to behavior analyzer
      this.behaviorAnalyzer.addEvent(event);

      // Get recent events for context
      const recentEvents = this.getRecentEvents(50); // Last 50 events

      // Detect boundary using enhanced engine
      const boundary = await this.detectionEngine.detectSessionBoundary(event);

      // Generate prediction for future boundaries
      const signals = await this.extractSignalsFromEvent(event, recentEvents);
      const prediction = await this.boundaryPredictor.predictBoundary(event, recentEvents, signals);

      const processingTime = performance.now() - startTime;

      // Record analytics
      if (boundary) {
        this.analytics.recordDetection(boundary, signals, processingTime, prediction);
      }

      // Train predictor with outcome
      if (prediction) {
        await this.boundaryPredictor.trainWithOutcome(prediction, boundary);
      }

      return boundary;

    } catch (error) {
      console.error('Error processing event for session detection:', error);
      return null;
    }
  }

  /**
   * Record user feedback on boundary detection
   */
  async recordUserFeedback(
    boundaryId: string,
    rating: 'correct' | 'incorrect' | 'unnecessary' | 'missed',
    confidence: number,
    comment?: string
  ): Promise<void> {
    try {
      // Get context for feedback
      const context = {
        sessionDuration: 0, // Would calculate from actual session data
        domainContext: this.getCurrentDomainContext(),
        timeOfDay: new Date().getHours()
      };

      this.analytics.recordUserFeedback(boundaryId, rating, confidence, context, comment);

      // Use feedback for adaptive configuration adjustments
      const config = this.configManager.getActiveConfig();
      if (config.adaptiveThresholds && config.learningEnabled) {
        await this.adaptConfigurationFromFeedback(rating, confidence);
      }

    } catch (error) {
      console.error('Error recording user feedback:', error);
    }
  }

  /**
   * Get detection performance report
   */
  getPerformanceReport(timeRange?: { start: number; end: number }) {
    return this.analytics.generatePerformanceReport(
      timeRange?.start,
      timeRange?.end
    );
  }

  /**
   * Get real-time detection metrics
   */
  getRealTimeMetrics() {
    return this.analytics.getRealTimeMetrics();
  }

  /**
   * Get detection statistics
   */
  getDetectionStats() {
    return {
      engine: this.detectionEngine.getDetectionStats(),
      behavior: this.behaviorAnalyzer.getCurrentMetrics(),
      predictor: this.boundaryPredictor.getModelStats(),
      analytics: this.analytics.getSummaryStats(),
      configuration: {
        activeProfile: this.configManager.getActiveConfig(),
        totalProfiles: this.configManager.getAllProfiles().length,
        adaptiveModeEnabled: this.configManager.isAdaptiveModeEnabled()
      }
    };
  }

  /**
   * Update detection configuration
   */
  async updateConfiguration(updates: Partial<DetectionConfig>): Promise<boolean> {
    try {
      // Validate new configuration
      const validation = this.configManager.validateConfig(updates);
      
      if (!validation.isValid) {
        console.error('Configuration update failed validation:', validation.errors);
        return false;
      }

      // Update active profile
      const activeProfileId = this.configManager.getActiveConfig().toString(); // This would need proper profile ID access
      const success = this.configManager.updateProfile('default', { config: updates });

      if (success) {
        // Apply updates to components
        const newConfig = this.configManager.getActiveConfig();
        this.detectionEngine.updateConfig(newConfig);
        
        // Record configuration change
        this.analytics.recordConfigurationChange(updates);
        
        console.log('Configuration updated successfully');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error updating configuration:', error);
      return false;
    }
  }

  /**
   * Switch to a different configuration profile
   */
  async switchConfigurationProfile(profileId: string): Promise<boolean> {
    try {
      const success = this.configManager.switchProfile(profileId);
      
      if (success) {
        const newConfig = this.configManager.getActiveConfig();
        this.detectionEngine.updateConfig(newConfig);
        console.log(`Switched to configuration profile: ${profileId}`);
      }

      return success;
    } catch (error) {
      console.error('Error switching configuration profile:', error);
      return false;
    }
  }

  /**
   * Enable or disable adaptive mode
   */
  setAdaptiveMode(enabled: boolean): void {
    this.configManager.setAdaptiveMode(enabled);
    console.log(`Adaptive mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Export detection system state
   */
  exportState() {
    return {
      configuration: this.configManager.exportConfig(),
      analytics: this.analytics.exportAnalyticsData(),
      behaviorAnalysis: this.behaviorAnalyzer.exportAnalysisData(),
      predictionModels: this.boundaryPredictor.exportPredictorState(),
      detectionEngine: this.detectionEngine.exportDetectionData(),
      systemInfo: {
        initialized: this.isInitialized,
        queuedEvents: this.eventQueue.length,
        exportedAt: Date.now()
      }
    };
  }

  /**
   * Reset all detection components
   */
  async reset(): Promise<void> {
    try {
      console.log('Resetting session detection system...');
      
      this.detectionEngine.reset();
      this.behaviorAnalyzer.clearHistory();
      this.boundaryPredictor.reset();
      this.analytics.reset();
      
      this.eventQueue = [];
      this.processingQueue = false;
      
      console.log('Session detection system reset complete');
    } catch (error) {
      console.error('Error resetting session detection system:', error);
    }
  }

  /**
   * Shutdown the detection system
   */
  async shutdown(): Promise<void> {
    try {
      console.log('Shutting down session detection system...');
      
      // Process any remaining queued events
      if (this.eventQueue.length > 0) {
        await this.processQueuedEvents();
      }

      this.isInitialized = false;
      console.log('Session detection system shutdown complete');
    } catch (error) {
      console.error('Error shutting down session detection system:', error);
    }
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private async processQueuedEvents(): Promise<void> {
    if (this.processingQueue || this.eventQueue.length === 0) return;

    this.processingQueue = true;
    
    try {
      const events = [...this.eventQueue];
      this.eventQueue = [];

      for (const event of events) {
        await this.processEvent(event);
      }
    } catch (error) {
      console.error('Error processing queued events:', error);
    } finally {
      this.processingQueue = false;
    }
  }

  private getRecentEvents(limit: number): BrowsingEvent[] {
    // This would typically come from the event store
    // For now, we'll return an empty array as a placeholder
    return [];
  }

  private async extractSignalsFromEvent(
    event: BrowsingEvent,
    recentEvents: BrowsingEvent[]
  ): Promise<DetectionSignal[]> {
    // This method would extract signals for prediction
    // The actual implementation would analyze the event and context
    return [];
  }

  private getCurrentDomainContext(): string[] {
    // Extract current domain context from recent events
    // This is a simplified implementation
    return [];
  }

  private async adaptConfigurationFromFeedback(
    rating: 'correct' | 'incorrect' | 'unnecessary' | 'missed',
    confidence: number
  ): Promise<void> {
    // Adapt configuration based on user feedback
    const config = this.configManager.getActiveConfig();
    const updates: Partial<DetectionConfig> = {};

    if (rating === 'unnecessary' && confidence > 0.8) {
      // Too many false positives, increase threshold
      updates.patternConfidenceThreshold = Math.min(
        (config.patternConfidenceThreshold || 0.7) + 0.05,
        0.9
      );
    } else if (rating === 'missed' && confidence > 0.8) {
      // Missing boundaries, decrease threshold
      updates.patternConfidenceThreshold = Math.max(
        (config.patternConfidenceThreshold || 0.7) - 0.05,
        0.3
      );
    }

    if (Object.keys(updates).length > 0) {
      await this.updateConfiguration(updates);
    }
  }

  // =============================================================================
  // BACKWARD COMPATIBILITY
  // =============================================================================

  /**
   * Legacy method for compatibility with existing SessionTracker
   */
  async shouldCreateBoundary(event: BrowsingEvent): Promise<SessionBoundary | null> {
    return this.processEvent(event);
  }

  /**
   * Get legacy-compatible detection stats
   */
  getLegacyStats() {
    const stats = this.getDetectionStats();
    return {
      recentEvents: stats.behavior?.averageSessionDuration || 0,
      currentDomains: 0, // Would be calculated from actual data
      navigationGaps: 0,
      domainTransitions: 0,
      sessionSignals: 0,
      windowCount: 0,
      tabCount: 0
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create and initialize an integrated session detection system
 */
export async function createSessionDetection(
  config?: Partial<DetectionConfig>
): Promise<IntegratedSessionDetection> {
  const detection = new IntegratedSessionDetection(config);
  await detection.initialize();
  return detection;
}

// =============================================================================
// CONFIGURATION PRESETS
// =============================================================================

export const DETECTION_PRESETS = {
  CONSERVATIVE: {
    idleThreshold: 1800000, // 30 minutes
    sessionGapThreshold: 900000, // 15 minutes
    patternConfidenceThreshold: 0.8,
    learningEnabled: false,
    adaptiveThresholds: false
  },
  
  BALANCED: {
    idleThreshold: 600000, // 10 minutes
    sessionGapThreshold: 300000, // 5 minutes
    patternConfidenceThreshold: 0.7,
    learningEnabled: true,
    adaptiveThresholds: true
  },
  
  AGGRESSIVE: {
    idleThreshold: 180000, // 3 minutes
    sessionGapThreshold: 120000, // 2 minutes
    patternConfidenceThreshold: 0.5,
    learningEnabled: true,
    adaptiveThresholds: true,
    contextualAnalysis: true
  },
  
  LEARNING: {
    idleThreshold: 600000, // 10 minutes
    sessionGapThreshold: 300000, // 5 minutes
    patternConfidenceThreshold: 0.6,
    learningEnabled: true,
    adaptiveThresholds: true,
    contextualAnalysis: true,
    adaptationRate: 0.1,
    minimumPatternLength: 5
  }
} as const;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Validate detection configuration
 */
export function validateDetectionConfig(config: Partial<DetectionConfig>): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const manager = new DetectionConfigManager();
  return manager.validateConfig(config);
}

/**
 * Get recommended configuration for user patterns
 */
export function getRecommendedConfig(userPatterns: {
  avgSessionDuration: number;
  primaryUsageHours: number[];
  domainCategories: string[];
  activityLevel: 'low' | 'medium' | 'high';
  deviceType: 'mobile' | 'tablet' | 'desktop';
}): DetectionConfig {
  const manager = new DetectionConfigManager();
  return manager.getRecommendedConfig(userPatterns);
}

/**
 * Create configuration profile from preset
 */
export function createConfigFromPreset(
  presetName: keyof typeof DETECTION_PRESETS,
  customizations?: Partial<DetectionConfig>
): DetectionConfig {
  const manager = new DetectionConfigManager();
  const preset = DETECTION_PRESETS[presetName];
  const defaultConfig = manager.getActiveConfig();
  
  return {
    ...defaultConfig,
    ...preset,
    ...customizations
  };
}