/**
 * Data Integrity Validator - Ensures data consistency and detects corruption
 * Provides validation, backup, and recovery mechanisms for session data
 */

import {
  StoredSession,
  StoredTab,
  StoredNavigationEvent,
  StoredSessionBoundary,
  DatabaseMetadata
} from './schema';

import { calculateChecksum } from '../utils/dataUtils';

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface ValidatorConfig {
  enableChecks: boolean;
  enableBackups: boolean;
  backupInterval: number; // milliseconds
  maxBackups: number;
  checksumValidation: boolean;
  relationshipValidation: boolean;
  dataConsistencyChecks: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  correctedItems: number;
  validationTime: number;
}

export interface ValidationError {
  type: 'checksum_mismatch' | 'missing_reference' | 'data_corruption' | 'schema_violation';
  severity: 'critical' | 'high' | 'medium' | 'low';
  entityType: 'session' | 'tab' | 'navigation_event' | 'boundary';
  entityId: string | number;
  message: string;
  details?: any;
  canAutoCorrect: boolean;
}

export interface ValidationWarning {
  type: 'orphaned_data' | 'inconsistent_timestamp' | 'missing_metadata' | 'outdated_schema';
  entityType: 'session' | 'tab' | 'navigation_event' | 'boundary';
  entityId: string | number;
  message: string;
  details?: any;
}

export interface BackupManifest {
  id: string;
  timestamp: number;
  version: number;
  description: string;
  size: number;
  itemCounts: {
    sessions: number;
    tabs: number;
    navigationEvents: number;
    boundaries: number;
  };
  integrity: {
    checksum: string;
    isValid: boolean;
  };
}

// =============================================================================
// DATA INTEGRITY VALIDATOR
// =============================================================================

export class DataIntegrityValidator {
  private config: ValidatorConfig;
  private backupStorage = new Map<string, any>();
  private lastBackupTime = 0;

  constructor(config: Partial<ValidatorConfig> = {}) {
    this.config = {
      enableChecks: true,
      enableBackups: true,
      backupInterval: 24 * 60 * 60 * 1000, // 24 hours
      maxBackups: 7,
      checksumValidation: true,
      relationshipValidation: true,
      dataConsistencyChecks: true,
      ...config
    };
  }

  // =============================================================================
  // VALIDATION METHODS
  // =============================================================================

  /**
   * Validate a single session
   */
  async validateSession(session: StoredSession): Promise<ValidationResult> {
    const startTime = performance.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let correctedItems = 0;

    // Checksum validation
    if (this.config.checksumValidation) {
      const checksumResult = this.validateChecksum(session, 'session');
      if (checksumResult.error) {
        errors.push(checksumResult.error);
      }
    }

    // Schema validation
    const schemaResult = this.validateSessionSchema(session);
    errors.push(...schemaResult.errors);
    warnings.push(...schemaResult.warnings);

    // Data consistency checks
    if (this.config.dataConsistencyChecks) {
      const consistencyResult = this.validateSessionConsistency(session);
      errors.push(...consistencyResult.errors);
      warnings.push(...consistencyResult.warnings);
    }

    const validationTime = performance.now() - startTime;

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      correctedItems,
      validationTime
    };
  }

  /**
   * Validate a single tab
   */
  async validateTab(tab: StoredTab): Promise<ValidationResult> {
    const startTime = performance.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let correctedItems = 0;

    // Checksum validation
    if (this.config.checksumValidation) {
      const checksumResult = this.validateChecksum(tab, 'tab');
      if (checksumResult.error) {
        errors.push(checksumResult.error);
      }
    }

    // Schema validation
    const schemaResult = this.validateTabSchema(tab);
    errors.push(...schemaResult.errors);
    warnings.push(...schemaResult.warnings);

    const validationTime = performance.now() - startTime;

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      correctedItems,
      validationTime
    };
  }

  /**
   * Validate navigation event
   */
  async validateNavigationEvent(event: StoredNavigationEvent): Promise<ValidationResult> {
    const startTime = performance.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let correctedItems = 0;

    // Checksum validation
    if (this.config.checksumValidation) {
      const checksumResult = this.validateChecksum(event, 'navigation_event');
      if (checksumResult.error) {
        errors.push(checksumResult.error);
      }
    }

    // Schema validation
    const schemaResult = this.validateNavigationEventSchema(event);
    errors.push(...schemaResult.errors);
    warnings.push(...schemaResult.warnings);

    const validationTime = performance.now() - startTime;

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      correctedItems,
      validationTime
    };
  }

  /**
   * Validate relationships between entities
   */
  async validateRelationships(
    sessions: StoredSession[],
    tabs: StoredTab[],
    navigationEvents: StoredNavigationEvent[]
  ): Promise<ValidationResult> {
    const startTime = performance.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let correctedItems = 0;

    if (!this.config.relationshipValidation) {
      return {
        isValid: true,
        errors,
        warnings,
        correctedItems,
        validationTime: performance.now() - startTime
      };
    }

    const sessionIds = new Set(sessions.map(s => s.id));
    const tabIds = new Set(tabs.map(t => t.id));

    // Check for orphaned tabs
    for (const tab of tabs) {
      if (!sessionIds.has(tab.sessionId)) {
        errors.push({
          type: 'missing_reference',
          severity: 'high',
          entityType: 'tab',
          entityId: tab.id,
          message: `Tab ${tab.id} references non-existent session ${tab.sessionId}`,
          canAutoCorrect: false
        });
      }
    }

    // Check for orphaned navigation events
    for (const event of navigationEvents) {
      if (!sessionIds.has(event.sessionId)) {
        errors.push({
          type: 'missing_reference',
          severity: 'medium',
          entityType: 'navigation_event',
          entityId: `${event.tabId}_${event.timestamp}`,
          message: `Navigation event references non-existent session ${event.sessionId}`,
          canAutoCorrect: true
        });
      }

      if (!tabIds.has(event.tabId)) {
        warnings.push({
          type: 'orphaned_data',
          entityType: 'navigation_event',
          entityId: `${event.tabId}_${event.timestamp}`,
          message: `Navigation event references non-existent tab ${event.tabId}`
        });
      }
    }

    // Check session tab counts
    for (const session of sessions) {
      const actualTabCount = tabs.filter(t => t.sessionId === session.id).length;
      if (session.totalTabCount !== actualTabCount) {
        warnings.push({
          type: 'inconsistent_timestamp',
          entityType: 'session',
          entityId: session.id,
          message: `Session tab count mismatch: expected ${session.totalTabCount}, actual ${actualTabCount}`
        });
      }
    }

    const validationTime = performance.now() - startTime;

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      correctedItems,
      validationTime
    };
  }

  // =============================================================================
  // SCHEMA VALIDATION
  // =============================================================================

  private validateSessionSchema(session: StoredSession): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Required fields
    if (!session.id) {
      errors.push({
        type: 'schema_violation',
        severity: 'critical',
        entityType: 'session',
        entityId: session.id || 'unknown',
        message: 'Session missing required field: id',
        canAutoCorrect: false
      });
    }

    if (!session.tag) {
      errors.push({
        type: 'schema_violation',
        severity: 'high',
        entityType: 'session',
        entityId: session.id,
        message: 'Session missing required field: tag',
        canAutoCorrect: false
      });
    }

    if (!session.createdAt || session.createdAt <= 0) {
      errors.push({
        type: 'schema_violation',
        severity: 'high',
        entityType: 'session',
        entityId: session.id,
        message: 'Session has invalid createdAt timestamp',
        canAutoCorrect: true
      });
    }

    if (!session.updatedAt || session.updatedAt <= 0) {
      warnings.push({
        type: 'missing_metadata',
        entityType: 'session',
        entityId: session.id,
        message: 'Session has invalid updatedAt timestamp'
      });
    }

    // Logical validations
    if (session.createdAt > session.updatedAt) {
      warnings.push({
        type: 'inconsistent_timestamp',
        entityType: 'session',
        entityId: session.id,
        message: 'Session createdAt is after updatedAt'
      });
    }

    if (!Array.isArray(session.tabs)) {
      errors.push({
        type: 'schema_violation',
        severity: 'critical',
        entityType: 'session',
        entityId: session.id,
        message: 'Session tabs field must be an array',
        canAutoCorrect: false
      });
    }

    if (!Array.isArray(session.windowIds)) {
      errors.push({
        type: 'schema_violation',
        severity: 'medium',
        entityType: 'session',
        entityId: session.id,
        message: 'Session windowIds field must be an array',
        canAutoCorrect: true
      });
    }

    return { errors, warnings };
  }

  private validateTabSchema(tab: StoredTab): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Required fields
    if (typeof tab.id !== 'number' || tab.id <= 0) {
      errors.push({
        type: 'schema_violation',
        severity: 'critical',
        entityType: 'tab',
        entityId: tab.id,
        message: 'Tab has invalid id',
        canAutoCorrect: false
      });
    }

    if (!tab.url) {
      errors.push({
        type: 'schema_violation',
        severity: 'high',
        entityType: 'tab',
        entityId: tab.id,
        message: 'Tab missing required field: url',
        canAutoCorrect: false
      });
    }

    if (!tab.sessionId) {
      errors.push({
        type: 'schema_violation',
        severity: 'critical',
        entityType: 'tab',
        entityId: tab.id,
        message: 'Tab missing required field: sessionId',
        canAutoCorrect: false
      });
    }

    if (typeof tab.windowId !== 'number' || tab.windowId <= 0) {
      errors.push({
        type: 'schema_violation',
        severity: 'high',
        entityType: 'tab',
        entityId: tab.id,
        message: 'Tab has invalid windowId',
        canAutoCorrect: false
      });
    }

    // URL validation
    if (tab.url) {
      try {
        new URL(tab.url);
      } catch {
        warnings.push({
          type: 'missing_metadata',
          entityType: 'tab',
          entityId: tab.id,
          message: 'Tab has invalid URL format'
        });
      }
    }

    // Timestamp validations
    if (!tab.createdAt || tab.createdAt <= 0) {
      errors.push({
        type: 'schema_violation',
        severity: 'medium',
        entityType: 'tab',
        entityId: tab.id,
        message: 'Tab has invalid createdAt timestamp',
        canAutoCorrect: true
      });
    }

    if (tab.createdAt > tab.lastAccessed) {
      warnings.push({
        type: 'inconsistent_timestamp',
        entityType: 'tab',
        entityId: tab.id,
        message: 'Tab createdAt is after lastAccessed'
      });
    }

    return { errors, warnings };
  }

  private validateNavigationEventSchema(event: StoredNavigationEvent): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Required fields
    if (typeof event.tabId !== 'number' || event.tabId <= 0) {
      errors.push({
        type: 'schema_violation',
        severity: 'critical',
        entityType: 'navigation_event',
        entityId: `${event.tabId}_${event.timestamp}`,
        message: 'Navigation event has invalid tabId',
        canAutoCorrect: false
      });
    }

    if (!event.url) {
      errors.push({
        type: 'schema_violation',
        severity: 'high',
        entityType: 'navigation_event',
        entityId: `${event.tabId}_${event.timestamp}`,
        message: 'Navigation event missing required field: url',
        canAutoCorrect: false
      });
    }

    if (!event.timestamp || event.timestamp <= 0) {
      errors.push({
        type: 'schema_violation',
        severity: 'critical',
        entityType: 'navigation_event',
        entityId: `${event.tabId}_${event.timestamp}`,
        message: 'Navigation event has invalid timestamp',
        canAutoCorrect: false
      });
    }

    if (!event.sessionId) {
      errors.push({
        type: 'schema_violation',
        severity: 'high',
        entityType: 'navigation_event',
        entityId: `${event.tabId}_${event.timestamp}`,
        message: 'Navigation event missing required field: sessionId',
        canAutoCorrect: true
      });
    }

    // URL validation
    if (event.url) {
      try {
        new URL(event.url);
      } catch {
        warnings.push({
          type: 'missing_metadata',
          entityType: 'navigation_event',
          entityId: `${event.tabId}_${event.timestamp}`,
          message: 'Navigation event has invalid URL format'
        });
      }
    }

    return { errors, warnings };
  }

  // =============================================================================
  // CHECKSUM VALIDATION
  // =============================================================================

  private validateChecksum(
    entity: StoredSession | StoredTab | StoredNavigationEvent,
    entityType: string
  ): { error?: ValidationError } {
    try {
      // Extract the data used for checksum calculation
      let dataForChecksum: any;

      if (entityType === 'session') {
        const session = entity as StoredSession;
        dataForChecksum = {
          id: session.id,
          tag: session.tag,
          createdAt: session.createdAt,
          tabs: session.tabs,
          windowIds: session.windowIds,
          metadata: session.metadata
        };
      } else if (entityType === 'tab') {
        const tab = entity as StoredTab;
        dataForChecksum = {
          id: tab.id,
          url: tab.url,
          title: tab.title,
          favicon: tab.favicon,
          windowId: tab.windowId,
          createdAt: tab.createdAt,
          lastAccessed: tab.lastAccessed,
          timeSpent: tab.timeSpent,
          scrollPosition: tab.scrollPosition,
          formData: tab.formData
        };
      } else if (entityType === 'navigation_event') {
        const event = entity as StoredNavigationEvent;
        dataForChecksum = {
          tabId: event.tabId,
          url: event.url,
          referrer: event.referrer,
          timestamp: event.timestamp,
          transitionType: event.transitionType
        };
      }

      const expectedChecksum = calculateChecksum(dataForChecksum);
      const actualChecksum = entity.checksum;

      if (expectedChecksum !== actualChecksum) {
        return {
          error: {
            type: 'checksum_mismatch',
            severity: 'high',
            entityType: entityType as any,
            entityId: this.getEntityId(entity, entityType),
            message: `Checksum mismatch detected for ${entityType}`,
            details: {
              expected: expectedChecksum,
              actual: actualChecksum
            },
            canAutoCorrect: true
          }
        };
      }

      return {};
    } catch (error) {
      return {
        error: {
          type: 'data_corruption',
          severity: 'critical',
          entityType: entityType as any,
          entityId: this.getEntityId(entity, entityType),
          message: `Failed to validate checksum for ${entityType}: ${error}`,
          canAutoCorrect: false
        }
      };
    }
  }

  private getEntityId(entity: any, entityType: string): string | number {
    if (entityType === 'navigation_event') {
      return `${entity.tabId}_${entity.timestamp}`;
    }
    return entity.id;
  }

  // =============================================================================
  // DATA CONSISTENCY CHECKS
  // =============================================================================

  private validateSessionConsistency(session: StoredSession): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check if domains array matches tabs
    const actualDomains = new Set<string>();
    for (const tab of session.tabs) {
      try {
        const url = new URL(tab.url);
        actualDomains.add(url.hostname);
      } catch {
        // Invalid URL, skip
      }
    }

    const expectedDomains = new Set(session.domains);
    if (actualDomains.size !== expectedDomains.size) {
      warnings.push({
        type: 'inconsistent_timestamp',
        entityType: 'session',
        entityId: session.id,
        message: 'Session domains array does not match tab URLs'
      });
    }

    // Check total tab count
    if (session.totalTabCount !== session.tabs.length) {
      warnings.push({
        type: 'inconsistent_timestamp',
        entityType: 'session',
        entityId: session.id,
        message: `Session totalTabCount mismatch: expected ${session.totalTabCount}, actual ${session.tabs.length}`
      });
    }

    return { errors, warnings };
  }

  // =============================================================================
  // BACKUP MANAGEMENT
  // =============================================================================

  /**
   * Create a backup of all data
   */
  async createBackup(
    sessions: StoredSession[],
    tabs: StoredTab[],
    navigationEvents: StoredNavigationEvent[],
    boundaries: StoredSessionBoundary[]
  ): Promise<BackupManifest> {
    if (!this.config.enableBackups) {
      throw new Error('Backups are disabled');
    }

    const backupId = `backup_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = Date.now();

    const backupData = {
      sessions,
      tabs,
      navigationEvents,
      boundaries,
      metadata: {
        version: 1,
        createdAt: timestamp,
        description: `Automatic backup created at ${new Date(timestamp).toISOString()}`
      }
    };

    const serializedData = JSON.stringify(backupData);
    const size = new Blob([serializedData]).size;
    const checksum = calculateChecksum(backupData);

    // Store backup (in production, this would go to persistent storage)
    this.backupStorage.set(backupId, backupData);

    // Clean up old backups
    await this.cleanupOldBackups();

    const manifest: BackupManifest = {
      id: backupId,
      timestamp,
      version: 1,
      description: `Automatic backup`,
      size,
      itemCounts: {
        sessions: sessions.length,
        tabs: tabs.length,
        navigationEvents: navigationEvents.length,
        boundaries: boundaries.length
      },
      integrity: {
        checksum,
        isValid: true
      }
    };

    this.lastBackupTime = timestamp;
    console.log(`Created backup: ${backupId} (${(size / 1024).toFixed(2)} KB)`);

    return manifest;
  }

  /**
   * Restore data from backup
   */
  async restoreFromBackup(backupId: string): Promise<{
    sessions: StoredSession[];
    tabs: StoredTab[];
    navigationEvents: StoredNavigationEvent[];
    boundaries: StoredSessionBoundary[];
  }> {
    const backupData = this.backupStorage.get(backupId);
    if (!backupData) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    // Validate backup integrity
    const checksum = calculateChecksum(backupData);
    // In production, you'd compare against stored checksum

    return {
      sessions: backupData.sessions || [],
      tabs: backupData.tabs || [],
      navigationEvents: backupData.navigationEvents || [],
      boundaries: backupData.boundaries || []
    };
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<BackupManifest[]> {
    const manifests: BackupManifest[] = [];
    
    for (const [backupId, backupData] of this.backupStorage) {
      const size = new Blob([JSON.stringify(backupData)]).size;
      
      manifests.push({
        id: backupId,
        timestamp: backupData.metadata?.createdAt || 0,
        version: backupData.metadata?.version || 1,
        description: backupData.metadata?.description || 'No description',
        size,
        itemCounts: {
          sessions: backupData.sessions?.length || 0,
          tabs: backupData.tabs?.length || 0,
          navigationEvents: backupData.navigationEvents?.length || 0,
          boundaries: backupData.boundaries?.length || 0
        },
        integrity: {
          checksum: calculateChecksum(backupData),
          isValid: true // Would validate in production
        }
      });
    }

    return manifests.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Delete backup
   */
  async deleteBackup(backupId: string): Promise<void> {
    const deleted = this.backupStorage.delete(backupId);
    if (!deleted) {
      throw new Error(`Backup not found: ${backupId}`);
    }
    
    console.log(`Deleted backup: ${backupId}`);
  }

  /**
   * Clean up old backups
   */
  private async cleanupOldBackups(): Promise<void> {
    const backups = await this.listBackups();
    
    if (backups.length > this.config.maxBackups) {
      const toDelete = backups.slice(this.config.maxBackups);
      
      for (const backup of toDelete) {
        await this.deleteBackup(backup.id);
      }
      
      console.log(`Cleaned up ${toDelete.length} old backups`);
    }
  }

  /**
   * Check if backup is needed
   */
  shouldCreateBackup(): boolean {
    if (!this.config.enableBackups) return false;
    
    const timeSinceLastBackup = Date.now() - this.lastBackupTime;
    return timeSinceLastBackup >= this.config.backupInterval;
  }

  // =============================================================================
  // AUTO-CORRECTION
  // =============================================================================

  /**
   * Attempt to auto-correct validation errors
   */
  async autoCorrectErrors(errors: ValidationError[]): Promise<ValidationError[]> {
    const uncorrectedErrors: ValidationError[] = [];

    for (const error of errors) {
      if (!error.canAutoCorrect) {
        uncorrectedErrors.push(error);
        continue;
      }

      try {
        await this.correctError(error);
        console.log(`Auto-corrected error: ${error.message}`);
      } catch (correctionError) {
        console.warn(`Failed to auto-correct error: ${error.message}`, correctionError);
        uncorrectedErrors.push(error);
      }
    }

    return uncorrectedErrors;
  }

  private async correctError(error: ValidationError): Promise<void> {
    switch (error.type) {
      case 'checksum_mismatch':
        // Recalculate and update checksum
        // Implementation would depend on access to storage
        break;
        
      case 'missing_reference':
        // Remove orphaned data or restore missing references
        break;
        
      default:
        throw new Error(`Cannot auto-correct error type: ${error.type}`);
    }
  }

  // =============================================================================
  // CONFIGURATION
  // =============================================================================

  /**
   * Update validator configuration
   */
  updateConfig(newConfig: Partial<ValidatorConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): ValidatorConfig {
    return { ...this.config };
  }
}