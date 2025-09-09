/**
 * Configuration Management for Session Detection
 * Centralized configuration system with validation, presets, and adaptive settings
 */

import {
  TrackingConfig,
  PrivacyMode
} from '../../shared/types';

import { DetectionConfig } from './SessionDetectionEngine';

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

export interface DetectionConfigPreset {
  id: string;
  name: string;
  description: string;
  config: DetectionConfig;
  targetScenario: string;
  recommendedFor: string[];
}

export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

export interface AdaptiveConfigSettings {
  enableAutoAdjustment: boolean;
  adjustmentSensitivity: number; // 0-1, how quickly to adapt
  monitoringWindow: number; // Time window for analyzing performance
  minimumSamples: number; // Minimum detections before adjusting
  adjustmentLimits: {
    maxThresholdChange: number;
    minBoundaryThreshold: number;
    maxBoundaryThreshold: number;
    minIdleThreshold: number;
    maxIdleThreshold: number;
  };
}

export interface ConfigurationProfile {
  id: string;
  name: string;
  description: string;
  userId?: string;
  config: DetectionConfig;
  adaptiveSettings: AdaptiveConfigSettings;
  performance: {
    accuracy: number;
    precision: number;
    recall: number;
    falsePositives: number;
    falseNegatives: number;
  };
  createdAt: number;
  lastModified: number;
  usageCount: number;
}

export interface ConfigAnalytics {
  totalConfigurations: number;
  activeProfile: string;
  performanceHistory: Array<{
    timestamp: number;
    accuracy: number;
    adjustments: Record<string, number>;
  }>;
  adaptiveAdjustments: Record<string, number[]>; // parameter -> adjustment history
  userFeedback: Array<{
    timestamp: number;
    rating: number; // 1-5
    comment?: string;
    configSnapshot: Partial<DetectionConfig>;
  }>;
}

// =============================================================================
// CONFIGURATION MANAGER
// =============================================================================

export class DetectionConfigManager {
  private profiles: Map<string, ConfigurationProfile> = new Map();
  private activeProfileId: string = 'default';
  private presets: Map<string, DetectionConfigPreset> = new Map();
  private analytics: ConfigAnalytics;
  private adaptiveMode: boolean = false;

  constructor() {
    this.initializePresets();
    this.initializeDefaultProfile();
    this.analytics = this.createEmptyAnalytics();
  }

  /**
   * Get current active configuration
   */
  getActiveConfig(): DetectionConfig {
    const profile = this.profiles.get(this.activeProfileId);
    return profile?.config || this.getDefaultConfig();
  }

  /**
   * Get configuration profile by ID
   */
  getProfile(profileId: string): ConfigurationProfile | null {
    return this.profiles.get(profileId) || null;
  }

  /**
   * Create new configuration profile
   */
  createProfile(
    name: string,
    description: string,
    config: Partial<DetectionConfig>,
    adaptiveSettings?: Partial<AdaptiveConfigSettings>
  ): string {
    const profileId = `profile_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = Date.now();

    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const fullAdaptiveSettings = { 
      ...this.getDefaultAdaptiveSettings(), 
      ...adaptiveSettings 
    };

    const profile: ConfigurationProfile = {
      id: profileId,
      name,
      description,
      config: fullConfig,
      adaptiveSettings: fullAdaptiveSettings,
      performance: {
        accuracy: 0.5,
        precision: 0.5,
        recall: 0.5,
        falsePositives: 0,
        falseNegatives: 0
      },
      createdAt: now,
      lastModified: now,
      usageCount: 0
    };

    this.profiles.set(profileId, profile);
    this.analytics.totalConfigurations++;

    return profileId;
  }

  /**
   * Update configuration profile
   */
  updateProfile(
    profileId: string,
    updates: {
      name?: string;
      description?: string;
      config?: Partial<DetectionConfig>;
      adaptiveSettings?: Partial<AdaptiveConfigSettings>;
    }
  ): boolean {
    const profile = this.profiles.get(profileId);
    if (!profile) return false;

    if (updates.name) profile.name = updates.name;
    if (updates.description) profile.description = updates.description;
    if (updates.config) {
      profile.config = { ...profile.config, ...updates.config };
    }
    if (updates.adaptiveSettings) {
      profile.adaptiveSettings = { ...profile.adaptiveSettings, ...updates.adaptiveSettings };
    }

    profile.lastModified = Date.now();
    return true;
  }

  /**
   * Switch to different configuration profile
   */
  switchProfile(profileId: string): boolean {
    if (!this.profiles.has(profileId)) return false;

    this.activeProfileId = profileId;
    this.analytics.activeProfile = profileId;
    
    const profile = this.profiles.get(profileId)!;
    profile.usageCount++;

    return true;
  }

  /**
   * Validate configuration settings
   */
  validateConfig(config: Partial<DetectionConfig>): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Validate threshold values
    if (config.idleThreshold !== undefined) {
      if (config.idleThreshold < 30000) { // 30 seconds minimum
        errors.push('Idle threshold must be at least 30 seconds');
      } else if (config.idleThreshold < 300000) { // 5 minutes warning
        warnings.push('Idle threshold below 5 minutes may cause frequent interruptions');
      } else if (config.idleThreshold > 3600000) { // 1 hour warning
        warnings.push('Idle threshold above 1 hour may miss natural session boundaries');
      }
    }

    if (config.sessionGapThreshold !== undefined) {
      if (config.sessionGapThreshold < 10000) { // 10 seconds minimum
        errors.push('Session gap threshold must be at least 10 seconds');
      } else if (config.sessionGapThreshold > config.idleThreshold!) {
        warnings.push('Session gap threshold should typically be less than idle threshold');
      }
    }

    // Validate learning parameters
    if (config.learningEnabled && config.adaptiveThresholds) {
      if (config.adaptationRate !== undefined) {
        if (config.adaptationRate < 0 || config.adaptationRate > 1) {
          errors.push('Adaptation rate must be between 0 and 1');
        } else if (config.adaptationRate > 0.3) {
          warnings.push('High adaptation rate may cause unstable behavior');
        }
      }

      if (config.patternConfidenceThreshold !== undefined) {
        if (config.patternConfidenceThreshold < 0.1 || config.patternConfidenceThreshold > 0.9) {
          warnings.push('Pattern confidence threshold should typically be between 0.1 and 0.9');
        }
      }
    }

    // Validate weight parameters
    const weights = [
      config.navigationPatternWeight,
      config.timeOfDayWeight,
      config.userBehaviorWeight
    ].filter(w => w !== undefined) as number[];

    if (weights.length > 0) {
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      if (totalWeight > 3) {
        warnings.push('Combined weights are unusually high, consider normalizing');
      }
    }

    // Performance recommendations
    if (config.batchSize !== undefined && config.batchSize > 1000) {
      recommendations.push('Consider reducing batch size for better memory usage');
    }

    if (config.maxEventsInMemory !== undefined && config.maxEventsInMemory > 50000) {
      recommendations.push('High event memory limit may impact performance on low-end devices');
    }

    // Privacy recommendations
    if (config.privacyMode === 'minimal') {
      recommendations.push('Consider using moderate privacy mode for better data protection');
    }

    if (config.excludeIncognito === false) {
      recommendations.push('Tracking incognito sessions may violate user privacy expectations');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      recommendations
    };
  }

  /**
   * Apply adaptive adjustments to configuration
   */
  async applyAdaptiveAdjustments(
    performance: {
      accuracy: number;
      falsePositives: number;
      falseNegatives: number;
      recentBoundaries: number;
    }
  ): Promise<void> {
    if (!this.adaptiveMode) return;

    const profile = this.profiles.get(this.activeProfileId);
    if (!profile?.adaptiveSettings.enableAutoAdjustment) return;

    const { adaptiveSettings } = profile;
    const sensitivity = adaptiveSettings.adjustmentSensitivity;
    const limits = adaptiveSettings.adjustmentLimits;

    // Calculate adjustments based on performance
    const adjustments: Partial<DetectionConfig> = {};

    // Adjust boundary threshold based on false positives/negatives
    if (performance.falsePositives > performance.falseNegatives) {
      // Too many false positives - increase threshold
      const currentThreshold = profile.config.patternConfidenceThreshold || 0.7;
      const increase = Math.min(0.05 * sensitivity, limits.maxThresholdChange);
      adjustments.patternConfidenceThreshold = Math.min(
        currentThreshold + increase,
        limits.maxBoundaryThreshold
      );
    } else if (performance.falseNegatives > performance.falsePositives) {
      // Too many false negatives - decrease threshold
      const currentThreshold = profile.config.patternConfidenceThreshold || 0.7;
      const decrease = Math.min(0.05 * sensitivity, limits.maxThresholdChange);
      adjustments.patternConfidenceThreshold = Math.max(
        currentThreshold - decrease,
        limits.minBoundaryThreshold
      );
    }

    // Adjust idle threshold based on session frequency
    if (performance.recentBoundaries > 10) {
      // Too many boundaries - increase idle threshold
      const currentIdle = profile.config.idleThreshold;
      const increase = Math.min(30000 * sensitivity, 300000); // Max 5 minute increase
      adjustments.idleThreshold = Math.min(
        currentIdle + increase,
        limits.maxIdleThreshold
      );
    } else if (performance.recentBoundaries < 2) {
      // Too few boundaries - decrease idle threshold
      const currentIdle = profile.config.idleThreshold;
      const decrease = Math.min(30000 * sensitivity, 300000); // Max 5 minute decrease
      adjustments.idleThreshold = Math.max(
        currentIdle - decrease,
        limits.minIdleThreshold
      );
    }

    // Apply adjustments if any were calculated
    if (Object.keys(adjustments).length > 0) {
      this.updateProfile(this.activeProfileId, { config: adjustments });
      
      // Record adjustments in analytics
      this.recordAdaptiveAdjustments(adjustments);
    }
  }

  /**
   * Get recommended configuration based on usage patterns
   */
  getRecommendedConfig(userPatterns: {
    avgSessionDuration: number;
    primaryUsageHours: number[];
    domainCategories: string[];
    activityLevel: 'low' | 'medium' | 'high';
    deviceType: 'mobile' | 'tablet' | 'desktop';
  }): DetectionConfig {
    let baseConfig = this.getDefaultConfig();

    // Adjust based on session duration patterns
    if (userPatterns.avgSessionDuration > 4 * 60 * 60 * 1000) { // 4+ hours
      baseConfig.idleThreshold = 1800000; // 30 minutes
      baseConfig.sessionGapThreshold = 600000; // 10 minutes
    } else if (userPatterns.avgSessionDuration < 30 * 60 * 1000) { // < 30 minutes
      baseConfig.idleThreshold = 300000; // 5 minutes
      baseConfig.sessionGapThreshold = 60000; // 1 minute
    }

    // Adjust based on activity level
    if (userPatterns.activityLevel === 'high') {
      baseConfig.batchSize = 200;
      baseConfig.navigationPatternWeight = 1.2;
      baseConfig.userBehaviorWeight = 1.1;
    } else if (userPatterns.activityLevel === 'low') {
      baseConfig.batchSize = 50;
      baseConfig.idleGracePeriod = 120000; // 2 minutes
    }

    // Adjust based on device type
    if (userPatterns.deviceType === 'mobile') {
      baseConfig.batchSize = Math.min(baseConfig.batchSize, 100);
      baseConfig.maxEventsInMemory = Math.min(baseConfig.maxEventsInMemory, 5000);
      baseConfig.adaptiveThresholds = true; // Mobile users benefit from adaptation
    }

    // Adjust based on primary domains
    if (userPatterns.domainCategories.includes('work')) {
      baseConfig.timeOfDayWeight = 1.2;
      baseConfig.domainChangeSessionBoundary = true;
    }

    if (userPatterns.domainCategories.includes('social')) {
      baseConfig.navigationPatternWeight = 0.8; // Social browsing is more random
      baseConfig.contextualAnalysis = true;
    }

    return baseConfig;
  }

  /**
   * Export configuration as JSON
   */
  exportConfig(profileId?: string): string {
    const targetProfileId = profileId || this.activeProfileId;
    const profile = this.profiles.get(targetProfileId);
    
    if (!profile) {
      throw new Error(`Profile ${targetProfileId} not found`);
    }

    return JSON.stringify({
      profile: {
        id: profile.id,
        name: profile.name,
        description: profile.description,
        config: profile.config,
        adaptiveSettings: profile.adaptiveSettings
      },
      exportedAt: Date.now(),
      version: '1.0'
    }, null, 2);
  }

  /**
   * Import configuration from JSON
   */
  importConfig(configJson: string): string {
    try {
      const importData = JSON.parse(configJson);
      
      if (!importData.profile || !importData.profile.config) {
        throw new Error('Invalid configuration format');
      }

      const { profile } = importData;
      const profileId = this.createProfile(
        profile.name || 'Imported Configuration',
        profile.description || 'Imported from JSON',
        profile.config,
        profile.adaptiveSettings
      );

      return profileId;
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error}`);
    }
  }

  // =============================================================================
  // PRESET MANAGEMENT
  // =============================================================================

  /**
   * Get available configuration presets
   */
  getPresets(): DetectionConfigPreset[] {
    return Array.from(this.presets.values());
  }

  /**
   * Apply preset configuration
   */
  applyPreset(presetId: string): boolean {
    const preset = this.presets.get(presetId);
    if (!preset) return false;

    const profileId = this.createProfile(
      `${preset.name} (Applied)`,
      `Applied from preset: ${preset.description}`,
      preset.config
    );

    return this.switchProfile(profileId);
  }

  // =============================================================================
  // ANALYTICS AND PERFORMANCE TRACKING
  // =============================================================================

  /**
   * Record performance metrics
   */
  recordPerformance(metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    falsePositives: number;
    falseNegatives: number;
  }): void {
    const profile = this.profiles.get(this.activeProfileId);
    if (profile) {
      profile.performance = metrics;
    }

    this.analytics.performanceHistory.push({
      timestamp: Date.now(),
      accuracy: metrics.accuracy,
      adjustments: {}
    });

    // Keep only last 100 performance records
    if (this.analytics.performanceHistory.length > 100) {
      this.analytics.performanceHistory = this.analytics.performanceHistory.slice(-50);
    }
  }

  /**
   * Record user feedback on configuration
   */
  recordUserFeedback(rating: number, comment?: string): void {
    const profile = this.profiles.get(this.activeProfileId);
    if (!profile) return;

    this.analytics.userFeedback.push({
      timestamp: Date.now(),
      rating,
      comment,
      configSnapshot: {
        idleThreshold: profile.config.idleThreshold,
        sessionGapThreshold: profile.config.sessionGapThreshold,
        patternConfidenceThreshold: profile.config.patternConfidenceThreshold
      }
    });
  }

  /**
   * Get configuration analytics
   */
  getAnalytics(): ConfigAnalytics {
    return { ...this.analytics };
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private initializePresets(): void {
    // Conservative preset - fewer boundaries, higher thresholds
    this.presets.set('conservative', {
      id: 'conservative',
      name: 'Conservative',
      description: 'Fewer session boundaries, suitable for focused work sessions',
      targetScenario: 'Deep work and long sessions',
      recommendedFor: ['researchers', 'developers', 'writers'],
      config: {
        ...this.getDefaultConfig(),
        idleThreshold: 1800000, // 30 minutes
        sessionGapThreshold: 900000, // 15 minutes
        patternConfidenceThreshold: 0.8,
        domainChangeSessionBoundary: false,
        learningEnabled: false,
        adaptiveThresholds: false
      }
    });

    // Aggressive preset - more boundaries, lower thresholds
    this.presets.set('aggressive', {
      id: 'aggressive',
      name: 'Aggressive',
      description: 'More session boundaries, suitable for task switching',
      targetScenario: 'Multitasking and quick task switching',
      recommendedFor: ['project managers', 'customer support', 'researchers'],
      config: {
        ...this.getDefaultConfig(),
        idleThreshold: 180000, // 3 minutes
        sessionGapThreshold: 120000, // 2 minutes
        patternConfidenceThreshold: 0.5,
        domainChangeSessionBoundary: true,
        contextualAnalysis: true,
        navigationPatternWeight: 1.2,
        userBehaviorWeight: 1.1
      }
    });

    // Balanced preset - default balanced settings
    this.presets.set('balanced', {
      id: 'balanced',
      name: 'Balanced',
      description: 'Balanced approach suitable for most users',
      targetScenario: 'General browsing and mixed usage',
      recommendedFor: ['general users', 'students', 'casual browsing'],
      config: this.getDefaultConfig()
    });

    // Learning preset - adaptive with machine learning
    this.presets.set('learning', {
      id: 'learning',
      name: 'Adaptive Learning',
      description: 'Uses machine learning to adapt to your patterns',
      targetScenario: 'Personalized detection based on usage patterns',
      recommendedFor: ['power users', 'varied usage patterns'],
      config: {
        ...this.getDefaultConfig(),
        learningEnabled: true,
        adaptiveThresholds: true,
        contextualAnalysis: true,
        adaptationRate: 0.1,
        patternDecayRate: 0.05,
        minimumPatternLength: 5,
        learningWindowSize: 100
      }
    });

    // Privacy-focused preset
    this.presets.set('privacy', {
      id: 'privacy',
      name: 'Privacy Focused',
      description: 'Minimal data collection with strong privacy protection',
      targetScenario: 'Privacy-conscious users',
      recommendedFor: ['privacy advocates', 'sensitive work'],
      config: {
        ...this.getDefaultConfig(),
        privacyMode: 'strict',
        excludeIncognito: true,
        learningEnabled: false,
        enableProductivityMetrics: false,
        batchSize: 20,
        maxEventsInMemory: 1000,
        sensitiveFieldFilters: ['password', 'ssn', 'credit', 'token', 'key']
      }
    });
  }

  private initializeDefaultProfile(): void {
    const defaultProfile: ConfigurationProfile = {
      id: 'default',
      name: 'Default Configuration',
      description: 'Standard balanced configuration',
      config: this.getDefaultConfig(),
      adaptiveSettings: this.getDefaultAdaptiveSettings(),
      performance: {
        accuracy: 0.5,
        precision: 0.5,
        recall: 0.5,
        falsePositives: 0,
        falseNegatives: 0
      },
      createdAt: Date.now(),
      lastModified: Date.now(),
      usageCount: 0
    };

    this.profiles.set('default', defaultProfile);
  }

  private getDefaultConfig(): DetectionConfig {
    return {
      // Base tracking config
      enableTabTracking: true,
      enableWindowTracking: true,
      enableNavigationTracking: true,
      enableSessionTracking: true,
      enableFormTracking: true,
      enableScrollTracking: true,
      enableClickTracking: true,

      // Privacy settings
      privacyMode: 'moderate',
      excludeIncognito: true,
      excludeDomains: [],
      includeDomains: [],
      sensitiveFieldFilters: ['password', 'ssn', 'credit-card'],

      // Performance settings
      batchSize: 100,
      batchInterval: 30000, // 30 seconds
      maxEventsInMemory: 10000,
      storageCleanupInterval: 86400000, // 24 hours

      // Session settings
      idleThreshold: 600000, // 10 minutes
      sessionGapThreshold: 300000, // 5 minutes
      domainChangeSessionBoundary: true,

      // Analytics settings
      enableProductivityMetrics: true,
      deepWorkThreshold: 1200000, // 20 minutes
      distractionThreshold: 30000, // 30 seconds

      // Enhanced detection parameters
      learningEnabled: true,
      adaptiveThresholds: true,
      contextualAnalysis: true,

      // Advanced thresholds
      idleGracePeriod: 60000, // 1 minute
      domainSimilarityThreshold: 0.3,
      navigationPatternWeight: 1.0,
      timeOfDayWeight: 1.0,
      userBehaviorWeight: 1.0,

      // Prediction parameters
      minimumPatternLength: 3,
      patternConfidenceThreshold: 0.7,
      boundaryPredictionLookahead: 60000, // 1 minute

      // Learning parameters
      learningWindowSize: 50,
      adaptationRate: 0.05,
      patternDecayRate: 0.02
    };
  }

  private getDefaultAdaptiveSettings(): AdaptiveConfigSettings {
    return {
      enableAutoAdjustment: false,
      adjustmentSensitivity: 0.5,
      monitoringWindow: 3600000, // 1 hour
      minimumSamples: 10,
      adjustmentLimits: {
        maxThresholdChange: 0.1,
        minBoundaryThreshold: 0.3,
        maxBoundaryThreshold: 0.9,
        minIdleThreshold: 60000, // 1 minute
        maxIdleThreshold: 3600000 // 1 hour
      }
    };
  }

  private createEmptyAnalytics(): ConfigAnalytics {
    return {
      totalConfigurations: 1, // Default profile
      activeProfile: 'default',
      performanceHistory: [],
      adaptiveAdjustments: {},
      userFeedback: []
    };
  }

  private recordAdaptiveAdjustments(adjustments: Partial<DetectionConfig>): void {
    for (const [parameter, value] of Object.entries(adjustments)) {
      if (!this.analytics.adaptiveAdjustments[parameter]) {
        this.analytics.adaptiveAdjustments[parameter] = [];
      }
      this.analytics.adaptiveAdjustments[parameter].push(value as number);
      
      // Keep only last 50 adjustments per parameter
      if (this.analytics.adaptiveAdjustments[parameter].length > 50) {
        this.analytics.adaptiveAdjustments[parameter] = 
          this.analytics.adaptiveAdjustments[parameter].slice(-25);
      }
    }
  }

  // =============================================================================
  // PUBLIC API
  // =============================================================================

  /**
   * Get all available profiles
   */
  getAllProfiles(): ConfigurationProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Delete configuration profile
   */
  deleteProfile(profileId: string): boolean {
    if (profileId === 'default') return false; // Can't delete default
    if (profileId === this.activeProfileId) {
      this.switchProfile('default'); // Switch to default before deleting
    }
    
    return this.profiles.delete(profileId);
  }

  /**
   * Enable/disable adaptive mode
   */
  setAdaptiveMode(enabled: boolean): void {
    this.adaptiveMode = enabled;
    
    const profile = this.profiles.get(this.activeProfileId);
    if (profile) {
      profile.adaptiveSettings.enableAutoAdjustment = enabled;
    }
  }

  /**
   * Get current adaptive mode status
   */
  isAdaptiveModeEnabled(): boolean {
    return this.adaptiveMode;
  }

  /**
   * Reset all configurations to defaults
   */
  resetToDefaults(): void {
    this.profiles.clear();
    this.presets.clear();
    this.analytics = this.createEmptyAnalytics();
    this.adaptiveMode = false;
    
    this.initializePresets();
    this.initializeDefaultProfile();
    this.activeProfileId = 'default';
  }
}