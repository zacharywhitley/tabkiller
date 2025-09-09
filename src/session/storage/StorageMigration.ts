/**
 * Storage Migration and Versioning System
 * Handles schema updates, data migrations, and version compatibility
 */

import {
  DATABASE_NAME,
  DATABASE_VERSION,
  STORE_NAMES,
  INDEX_NAMES,
  DatabaseMetadata,
  generateMigrationInstructions
} from './schema';

import { DataIntegrityValidator } from './DataIntegrityValidator';
import { calculateSecureHash } from '../utils/dataUtils';

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface MigrationConfig {
  enableBackups: boolean;
  validateAfterMigration: boolean;
  maxRetries: number;
  rollbackOnFailure: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

export interface MigrationStep {
  version: number;
  description: string;
  execute: (db: IDBDatabase, transaction: IDBTransaction) => Promise<void>;
  rollback?: (db: IDBDatabase, transaction: IDBTransaction) => Promise<void>;
  validate?: (db: IDBDatabase) => Promise<boolean>;
}

export interface MigrationResult {
  success: boolean;
  fromVersion: number;
  toVersion: number;
  stepsExecuted: number;
  errors: string[];
  warnings: string[];
  executionTime: number;
  backupCreated?: string;
}

export interface VersionInfo {
  current: number;
  latest: number;
  isUpToDate: boolean;
  migrationRequired: boolean;
  migrationSteps: string[];
}

// =============================================================================
// STORAGE MIGRATION MANAGER
// =============================================================================

export class StorageMigration {
  private config: MigrationConfig;
  private validator: DataIntegrityValidator;
  private migrations: Map<number, MigrationStep> = new Map();

  constructor(config: Partial<MigrationConfig> = {}) {
    this.config = {
      enableBackups: true,
      validateAfterMigration: true,
      maxRetries: 3,
      rollbackOnFailure: true,
      logLevel: 'info',
      ...config
    };

    this.validator = new DataIntegrityValidator({
      enableChecks: true,
      enableBackups: this.config.enableBackups
    });

    this.initializeMigrations();
  }

  // =============================================================================
  // MIGRATION SETUP
  // =============================================================================

  /**
   * Initialize migration steps
   */
  private initializeMigrations(): void {
    // Migration from version 0 to 1 (initial schema)
    this.migrations.set(1, {
      version: 1,
      description: 'Create initial database schema with sessions, tabs, navigation events, and boundaries',
      execute: this.migrateToV1.bind(this),
      validate: this.validateV1Schema.bind(this)
    });

    // Future migrations would be added here
    // this.migrations.set(2, {
    //   version: 2,
    //   description: 'Add new indexes for performance optimization',
    //   execute: this.migrateToV2.bind(this),
    //   rollback: this.rollbackFromV2.bind(this),
    //   validate: this.validateV2Schema.bind(this)
    // });
  }

  // =============================================================================
  // MIGRATION EXECUTION
  // =============================================================================

  /**
   * Perform database migration
   */
  async performMigration(
    db: IDBDatabase, 
    oldVersion: number, 
    newVersion: number
  ): Promise<MigrationResult> {
    const startTime = performance.now();
    this.log('info', `Starting migration from version ${oldVersion} to ${newVersion}`);

    const result: MigrationResult = {
      success: false,
      fromVersion: oldVersion,
      toVersion: newVersion,
      stepsExecuted: 0,
      errors: [],
      warnings: [],
      executionTime: 0
    };

    try {
      // Create backup if enabled
      if (this.config.enableBackups && oldVersion > 0) {
        result.backupCreated = await this.createPreMigrationBackup(db);
        this.log('info', `Created pre-migration backup: ${result.backupCreated}`);
      }

      // Execute migration steps
      const stepsToExecute = this.getMigrationSteps(oldVersion, newVersion);
      
      for (const step of stepsToExecute) {
        try {
          await this.executeMigrationStep(db, step);
          result.stepsExecuted++;
          this.log('info', `Completed migration step ${step.version}: ${step.description}`);
        } catch (error) {
          const errorMessage = `Migration step ${step.version} failed: ${error instanceof Error ? error.message : String(error)}`;
          result.errors.push(errorMessage);
          this.log('error', errorMessage);

          if (this.config.rollbackOnFailure && step.rollback) {
            try {
              await step.rollback(db, db.transaction([], 'readwrite'));
              this.log('info', `Rolled back migration step ${step.version}`);
            } catch (rollbackError) {
              const rollbackMessage = `Rollback failed for step ${step.version}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`;
              result.errors.push(rollbackMessage);
              this.log('error', rollbackMessage);
            }
          }
          break;
        }
      }

      // Validate migration if enabled
      if (this.config.validateAfterMigration && result.errors.length === 0) {
        const validationResult = await this.validateMigration(db, newVersion);
        if (!validationResult.isValid) {
          result.errors.push(...validationResult.errors);
          result.warnings.push(...validationResult.warnings);
        }
      }

      // Update metadata
      if (result.errors.length === 0) {
        await this.updateDatabaseMetadata(db, newVersion);
        result.success = true;
        this.log('info', `Migration completed successfully in ${result.stepsExecuted} steps`);
      }

    } catch (error) {
      const errorMessage = `Migration failed: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMessage);
      this.log('error', errorMessage);
    }

    result.executionTime = performance.now() - startTime;
    return result;
  }

  /**
   * Get migration steps between versions
   */
  private getMigrationSteps(fromVersion: number, toVersion: number): MigrationStep[] {
    const steps: MigrationStep[] = [];
    
    for (let version = fromVersion + 1; version <= toVersion; version++) {
      const step = this.migrations.get(version);
      if (step) {
        steps.push(step);
      } else {
        throw new Error(`Migration step not found for version ${version}`);
      }
    }
    
    return steps;
  }

  /**
   * Execute a single migration step
   */
  private async executeMigrationStep(db: IDBDatabase, step: MigrationStep): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create a transaction for the migration step
      const transaction = db.transaction(Object.values(STORE_NAMES), 'readwrite');
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(new Error('Transaction aborted'));

      // Execute the migration step
      step.execute(db, transaction).catch(reject);
    });
  }

  // =============================================================================
  // SPECIFIC MIGRATIONS
  // =============================================================================

  /**
   * Migration to version 1 - Initial schema
   */
  private async migrateToV1(db: IDBDatabase, transaction: IDBTransaction): Promise<void> {
    // Create sessions store
    if (!db.objectStoreNames.contains(STORE_NAMES.SESSIONS)) {
      const sessionsStore = db.createObjectStore(STORE_NAMES.SESSIONS, { keyPath: 'id' });
      
      // Create indexes
      sessionsStore.createIndex(INDEX_NAMES.SESSION_BY_TAG, 'tag', { unique: false });
      sessionsStore.createIndex(INDEX_NAMES.SESSION_BY_CREATED_AT, 'createdAt', { unique: false });
      sessionsStore.createIndex(INDEX_NAMES.SESSION_BY_UPDATED_AT, 'updatedAt', { unique: false });
      sessionsStore.createIndex(INDEX_NAMES.SESSION_BY_DOMAIN, 'domains', { unique: false, multiEntry: true });
    }

    // Create tabs store
    if (!db.objectStoreNames.contains(STORE_NAMES.TABS)) {
      const tabsStore = db.createObjectStore(STORE_NAMES.TABS, { keyPath: 'id' });
      
      // Create indexes
      tabsStore.createIndex(INDEX_NAMES.TAB_BY_SESSION_ID, 'sessionId', { unique: false });
      tabsStore.createIndex(INDEX_NAMES.TAB_BY_WINDOW_ID, 'windowId', { unique: false });
      tabsStore.createIndex(INDEX_NAMES.TAB_BY_URL, 'url', { unique: false });
      tabsStore.createIndex(INDEX_NAMES.TAB_BY_DOMAIN, 'domain', { unique: false });
      tabsStore.createIndex(INDEX_NAMES.TAB_BY_CREATED_AT, 'createdAt', { unique: false });
    }

    // Create navigation events store
    if (!db.objectStoreNames.contains(STORE_NAMES.NAVIGATION_EVENTS)) {
      const navStore = db.createObjectStore(STORE_NAMES.NAVIGATION_EVENTS, { 
        keyPath: ['tabId', 'timestamp'] 
      });
      
      // Create indexes
      navStore.createIndex(INDEX_NAMES.NAV_BY_TAB_ID, 'tabId', { unique: false });
      navStore.createIndex(INDEX_NAMES.NAV_BY_SESSION_ID, 'sessionId', { unique: false });
      navStore.createIndex(INDEX_NAMES.NAV_BY_TIMESTAMP, 'timestamp', { unique: false });
      navStore.createIndex(INDEX_NAMES.NAV_BY_URL, 'url', { unique: false });
      navStore.createIndex(INDEX_NAMES.NAV_BY_DOMAIN, 'domain', { unique: false });
    }

    // Create session boundaries store
    if (!db.objectStoreNames.contains(STORE_NAMES.SESSION_BOUNDARIES)) {
      const boundariesStore = db.createObjectStore(STORE_NAMES.SESSION_BOUNDARIES, { keyPath: 'id' });
      
      // Create indexes
      boundariesStore.createIndex(INDEX_NAMES.BOUNDARY_BY_SESSION_ID, 'sessionId', { unique: false });
      boundariesStore.createIndex(INDEX_NAMES.BOUNDARY_BY_TIMESTAMP, 'timestamp', { unique: false });
      boundariesStore.createIndex(INDEX_NAMES.BOUNDARY_BY_REASON, 'reason', { unique: false });
    }

    // Create metadata store
    if (!db.objectStoreNames.contains(STORE_NAMES.METADATA)) {
      db.createObjectStore(STORE_NAMES.METADATA, { keyPath: 'version' });
    }
  }

  /**
   * Validate version 1 schema
   */
  private async validateV1Schema(db: IDBDatabase): Promise<boolean> {
    try {
      // Check that all required stores exist
      const requiredStores = Object.values(STORE_NAMES);
      for (const storeName of requiredStores) {
        if (!db.objectStoreNames.contains(storeName)) {
          this.log('error', `Required store missing: ${storeName}`);
          return false;
        }
      }

      // Check that required indexes exist
      const transaction = db.transaction(Object.values(STORE_NAMES), 'readonly');
      
      // Validate sessions store indexes
      const sessionsStore = transaction.objectStore(STORE_NAMES.SESSIONS);
      const requiredSessionIndexes = [
        INDEX_NAMES.SESSION_BY_TAG,
        INDEX_NAMES.SESSION_BY_CREATED_AT,
        INDEX_NAMES.SESSION_BY_UPDATED_AT,
        INDEX_NAMES.SESSION_BY_DOMAIN
      ];
      
      for (const indexName of requiredSessionIndexes) {
        if (!sessionsStore.indexNames.contains(indexName)) {
          this.log('error', `Required index missing: ${indexName} in ${STORE_NAMES.SESSIONS}`);
          return false;
        }
      }

      // Similar validation for other stores...
      
      this.log('info', 'Version 1 schema validation passed');
      return true;
    } catch (error) {
      this.log('error', `Schema validation failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  // =============================================================================
  // BACKUP AND RESTORE
  // =============================================================================

  /**
   * Create backup before migration
   */
  private async createPreMigrationBackup(db: IDBDatabase): Promise<string> {
    // In a production implementation, this would export all data
    // For now, just return a backup ID
    const backupId = `migration_backup_${Date.now()}`;
    
    try {
      // Export all data
      const exportData = await this.exportAllData(db);
      
      // Store backup (in production, this would go to persistent storage)
      localStorage.setItem(`backup_${backupId}`, JSON.stringify(exportData));
      
      this.log('info', `Created migration backup: ${backupId}`);
      return backupId;
    } catch (error) {
      this.log('error', `Failed to create backup: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Export all data for backup
   */
  private async exportAllData(db: IDBDatabase): Promise<any> {
    const data: any = {
      metadata: {
        version: DATABASE_VERSION,
        exportedAt: Date.now(),
        databaseName: DATABASE_NAME
      }
    };

    const transaction = db.transaction(Object.values(STORE_NAMES), 'readonly');

    // Export each store
    for (const storeName of Object.values(STORE_NAMES)) {
      data[storeName] = await this.exportStore(transaction.objectStore(storeName));
    }

    return data;
  }

  /**
   * Export single store data
   */
  private async exportStore(store: IDBObjectStore): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // =============================================================================
  // VALIDATION
  // =============================================================================

  /**
   * Validate migration result
   */
  private async validateMigration(db: IDBDatabase, targetVersion: number): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check database version
      if (db.version !== targetVersion) {
        errors.push(`Database version mismatch: expected ${targetVersion}, got ${db.version}`);
      }

      // Check schema based on target version
      switch (targetVersion) {
        case 1:
          const v1Valid = await this.validateV1Schema(db);
          if (!v1Valid) {
            errors.push('Version 1 schema validation failed');
          }
          break;
        
        // Add validation for future versions
      }

      // Perform data integrity checks
      if (this.config.validateAfterMigration) {
        const integrityResult = await this.validateDataIntegrity(db);
        errors.push(...integrityResult.errors);
        warnings.push(...integrityResult.warnings);
      }

    } catch (error) {
      errors.push(`Migration validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate data integrity after migration
   */
  private async validateDataIntegrity(db: IDBDatabase): Promise<{
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check for orphaned records
      const orphanResult = await this.checkForOrphanedRecords(db);
      errors.push(...orphanResult.errors);
      warnings.push(...orphanResult.warnings);

      // Check data consistency
      const consistencyResult = await this.checkDataConsistency(db);
      errors.push(...consistencyResult.errors);
      warnings.push(...consistencyResult.warnings);

    } catch (error) {
      errors.push(`Data integrity validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { errors, warnings };
  }

  /**
   * Check for orphaned records
   */
  private async checkForOrphanedRecords(db: IDBDatabase): Promise<{
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const transaction = db.transaction([STORE_NAMES.SESSIONS, STORE_NAMES.TABS], 'readonly');
      
      // Get all sessions and tabs
      const sessionsStore = transaction.objectStore(STORE_NAMES.SESSIONS);
      const tabsStore = transaction.objectStore(STORE_NAMES.TABS);
      
      const sessions = await this.getAllFromStore(sessionsStore);
      const tabs = await this.getAllFromStore(tabsStore);
      
      const sessionIds = new Set(sessions.map((s: any) => s.id));
      
      // Check for orphaned tabs
      for (const tab of tabs) {
        if (!sessionIds.has((tab as any).sessionId)) {
          warnings.push(`Orphaned tab found: ${(tab as any).id} references non-existent session ${(tab as any).sessionId}`);
        }
      }

    } catch (error) {
      errors.push(`Failed to check for orphaned records: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { errors, warnings };
  }

  /**
   * Check data consistency
   */
  private async checkDataConsistency(db: IDBDatabase): Promise<{
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // This would implement comprehensive data consistency checks
    // For now, just return empty results
    
    return { errors, warnings };
  }

  /**
   * Get all records from a store
   */
  private async getAllFromStore(store: IDBObjectStore): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // =============================================================================
  // METADATA MANAGEMENT
  // =============================================================================

  /**
   * Update database metadata after migration
   */
  private async updateDatabaseMetadata(db: IDBDatabase, newVersion: number): Promise<void> {
    const transaction = db.transaction([STORE_NAMES.METADATA], 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.METADATA);

    const metadata: DatabaseMetadata = {
      version: newVersion,
      createdAt: Date.now(),
      lastModified: Date.now(),
      totalSessions: 0,
      totalTabs: 0,
      totalNavigationEvents: 0,
      storageSize: 0,
      integrityCheck: {
        lastCheck: Date.now(),
        isValid: true,
        errors: []
      }
    };

    return new Promise((resolve, reject) => {
      const request = store.put(metadata);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // =============================================================================
  // VERSION INFORMATION
  // =============================================================================

  /**
   * Get version information
   */
  async getVersionInfo(): Promise<VersionInfo> {
    try {
      // Open database to check current version
      const db = await this.openDatabaseForVersionCheck();
      const currentVersion = db.version;
      db.close();

      const migrationSteps = generateMigrationInstructions(currentVersion, DATABASE_VERSION);

      return {
        current: currentVersion,
        latest: DATABASE_VERSION,
        isUpToDate: currentVersion === DATABASE_VERSION,
        migrationRequired: currentVersion < DATABASE_VERSION,
        migrationSteps
      };
    } catch (error) {
      this.log('error', `Failed to get version info: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        current: 0,
        latest: DATABASE_VERSION,
        isUpToDate: false,
        migrationRequired: true,
        migrationSteps: []
      };
    }
  }

  /**
   * Open database just to check version
   */
  private openDatabaseForVersionCheck(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        // Don't perform upgrade, just get the version
        request.result.close();
        reject(new Error('Database upgrade needed'));
      };
    });
  }

  // =============================================================================
  // UTILITIES
  // =============================================================================

  /**
   * Logging utility
   */
  private log(level: 'error' | 'warn' | 'info' | 'debug', message: string): void {
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    const configLevels = { error: 0, warn: 1, info: 2, debug: 3 };
    
    if (levels[level] <= configLevels[this.config.logLevel]) {
      console[level](`[StorageMigration] ${message}`);
    }
  }

  /**
   * Check if migration is needed
   */
  async isMigrationNeeded(): Promise<boolean> {
    const versionInfo = await this.getVersionInfo();
    return versionInfo.migrationRequired;
  }

  /**
   * Get available migration steps
   */
  getAvailableMigrations(): Array<{ version: number; description: string }> {
    return Array.from(this.migrations.values()).map(step => ({
      version: step.version,
      description: step.description
    }));
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MigrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}