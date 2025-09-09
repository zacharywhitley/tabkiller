/**
 * Session Storage Module Index
 * Main entry point for session storage functionality
 */

// Core storage engine
export { SessionStorageEngine } from './SessionStorageEngine';
export type {
  StorageConfig,
  QueryOptions,
  SessionQuery,
  TabQuery,
  NavigationQuery,
  StorageStats
} from './SessionStorageEngine';

// Schema definitions
export {
  DATABASE_NAME,
  DATABASE_VERSION,
  STORE_NAMES,
  INDEX_NAMES,
  createStoreConfig,
  getSchemaDefinition,
  validateObject
} from './schema';
export type {
  StoredSession,
  StoredTab,
  StoredNavigationEvent,
  StoredSessionBoundary,
  DatabaseMetadata,
  DatabaseSchema
} from './schema';

// Data serialization
export { SessionDataSerializer } from './SessionDataSerializer';
export type {
  SerializerConfig,
  CompressionStats
} from './SessionDataSerializer';

// Data integrity and validation
export { DataIntegrityValidator } from './DataIntegrityValidator';
export type {
  ValidatorConfig,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  BackupManifest
} from './DataIntegrityValidator';

// Export/Import functionality
export { DataExportImport } from './DataExportImport';
export type {
  ExportResult,
  ImportResult,
  ExportFilter
} from './DataExportImport';

// Migration and versioning
export { StorageMigration } from './StorageMigration';
export type {
  MigrationConfig,
  MigrationStep,
  MigrationResult,
  VersionInfo
} from './StorageMigration';

// Utilities
export * from '../utils/dataUtils';

// =============================================================================
// STORAGE MANAGER - HIGH-LEVEL API
// =============================================================================

import { SessionStorageEngine, StorageConfig } from './SessionStorageEngine';
import { DataIntegrityValidator } from './DataIntegrityValidator';
import { DataExportImport } from './DataExportImport';
import { StorageMigration } from './StorageMigration';
import { BrowsingSession, TabInfo, NavigationEvent, ExportOptions, ImportOptions } from '../../shared/types';

/**
 * High-level storage manager that combines all storage functionality
 */
export class SessionStorageManager {
  private engine: SessionStorageEngine;
  private validator: DataIntegrityValidator;
  private exportImport: DataExportImport;
  private migration: StorageMigration;
  private isInitialized = false;

  constructor(config: Partial<StorageConfig> = {}) {
    this.engine = new SessionStorageEngine(config);
    this.validator = new DataIntegrityValidator({
      enableChecks: config.enableIntegrityChecks !== false
    });
    this.exportImport = new DataExportImport();
    this.migration = new StorageMigration({
      enableBackups: config.enableIntegrityChecks !== false
    });
  }

  /**
   * Initialize the storage manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Initializing SessionStorageManager...');
      
      // Check if migration is needed
      const migrationNeeded = await this.migration.isMigrationNeeded();
      if (migrationNeeded) {
        console.log('Database migration required');
        // Migration will be handled during engine initialization
      }

      // Initialize the storage engine (this will handle migrations)
      await this.engine.initialize();
      
      this.isInitialized = true;
      console.log('SessionStorageManager initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize SessionStorageManager:', error);
      throw error;
    }
  }

  // =============================================================================
  // SESSION OPERATIONS
  // =============================================================================

  /**
   * Create a new session
   */
  async createSession(session: BrowsingSession): Promise<void> {
    await this.ensureInitialized();
    await this.engine.createSession(session);
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<BrowsingSession | null> {
    await this.ensureInitialized();
    const stored = await this.engine.getSession(sessionId);
    return stored ? await this.deserializeSession(stored) : null;
  }

  /**
   * Update session
   */
  async updateSession(sessionId: string, updates: Partial<BrowsingSession>): Promise<void> {
    await this.ensureInitialized();
    await this.engine.updateSession(sessionId, updates);
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.ensureInitialized();
    await this.engine.deleteSession(sessionId);
  }

  /**
   * Query sessions
   */
  async querySessions(query: any = {}): Promise<BrowsingSession[]> {
    await this.ensureInitialized();
    const storedSessions = await this.engine.querySessions(query);
    
    const sessions: BrowsingSession[] = [];
    for (const stored of storedSessions) {
      const session = await this.deserializeSession(stored);
      sessions.push(session);
    }
    
    return sessions;
  }

  // =============================================================================
  // TAB OPERATIONS
  // =============================================================================

  /**
   * Create tab
   */
  async createTab(tab: TabInfo, sessionId: string): Promise<void> {
    await this.ensureInitialized();
    await this.engine.createTab(tab, sessionId);
  }

  /**
   * Get tab by ID
   */
  async getTab(tabId: number): Promise<TabInfo | null> {
    await this.ensureInitialized();
    const stored = await this.engine.getTab(tabId);
    return stored ? await this.deserializeTab(stored) : null;
  }

  /**
   * Update tab
   */
  async updateTab(tabId: number, updates: Partial<TabInfo>): Promise<void> {
    await this.ensureInitialized();
    await this.engine.updateTab(tabId, updates);
  }

  /**
   * Delete tab
   */
  async deleteTab(tabId: number): Promise<void> {
    await this.ensureInitialized();
    await this.engine.deleteTab(tabId);
  }

  // =============================================================================
  // NAVIGATION EVENT OPERATIONS
  // =============================================================================

  /**
   * Create navigation event
   */
  async createNavigationEvent(event: NavigationEvent, sessionId: string): Promise<void> {
    await this.ensureInitialized();
    await this.engine.createNavigationEvent(event, sessionId);
  }

  /**
   * Query navigation events
   */
  async queryNavigationEvents(query: any = {}): Promise<NavigationEvent[]> {
    await this.ensureInitialized();
    const storedEvents = await this.engine.queryNavigationEvents(query);
    
    const events: NavigationEvent[] = [];
    for (const stored of storedEvents) {
      const event = await this.deserializeNavigationEvent(stored);
      events.push(event);
    }
    
    return events;
  }

  // =============================================================================
  // DATA MANAGEMENT
  // =============================================================================

  /**
   * Export data
   */
  async exportData(options: ExportOptions): Promise<any> {
    await this.ensureInitialized();
    
    // Get all data
    const sessions = await this.engine.querySessions({ options: { limit: 10000 } });
    const tabs = await this.engine.queryTabs({ options: { limit: 100000 } });
    const navigationEvents = await this.engine.queryNavigationEvents({ options: { limit: 1000000 } });
    const boundaries: any[] = []; // TODO: Implement boundary queries
    
    return this.exportImport.exportData(sessions, tabs, navigationEvents, boundaries, options);
  }

  /**
   * Import data
   */
  async importData(data: string | ArrayBuffer, options: ImportOptions): Promise<any> {
    await this.ensureInitialized();
    return this.exportImport.importData(data, options);
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<any> {
    await this.ensureInitialized();
    return this.engine.getStorageStats();
  }

  /**
   * Validate data integrity
   */
  async validateIntegrity(): Promise<any> {
    await this.ensureInitialized();
    
    // Get sample data for validation
    const sessions = await this.engine.querySessions({ options: { limit: 100 } });
    const tabs = await this.engine.queryTabs({ options: { limit: 1000 } });
    const navigationEvents = await this.engine.queryNavigationEvents({ options: { limit: 1000 } });
    
    return this.validator.validateRelationships(sessions, tabs, navigationEvents);
  }

  /**
   * Create backup
   */
  async createBackup(): Promise<any> {
    await this.ensureInitialized();
    
    const sessions = await this.engine.querySessions({ options: { limit: 10000 } });
    const tabs = await this.engine.queryTabs({ options: { limit: 100000 } });
    const navigationEvents = await this.engine.queryNavigationEvents({ options: { limit: 1000000 } });
    const boundaries: any[] = [];
    
    return this.validator.createBackup(sessions, tabs, navigationEvents, boundaries);
  }

  /**
   * Clear all data
   */
  async clearAllData(): Promise<void> {
    await this.ensureInitialized();
    await this.engine.clearAllData();
  }

  // =============================================================================
  // PRIVATE HELPERS
  // =============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private async deserializeSession(stored: any): Promise<BrowsingSession> {
    // Convert stored session back to domain model
    return {
      id: stored.id,
      tag: stored.tag,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      tabs: stored.tabs || [],
      windowIds: stored.windowIds || [],
      metadata: stored.metadata || {
        isPrivate: false,
        totalTime: 0,
        pageCount: 0,
        domain: []
      }
    };
  }

  private async deserializeTab(stored: any): Promise<TabInfo> {
    // Convert stored tab back to domain model
    return {
      id: stored.id,
      url: stored.url,
      title: stored.title,
      favicon: stored.favicon,
      windowId: stored.windowId,
      createdAt: stored.createdAt,
      lastAccessed: stored.lastAccessed,
      timeSpent: stored.timeSpent,
      scrollPosition: stored.scrollPosition,
      formData: stored.formData
    };
  }

  private async deserializeNavigationEvent(stored: any): Promise<NavigationEvent> {
    // Convert stored event back to domain model
    return {
      tabId: stored.tabId,
      url: stored.url,
      referrer: stored.referrer,
      timestamp: stored.timestamp,
      transitionType: stored.transitionType
    };
  }

  /**
   * Shutdown storage manager
   */
  async shutdown(): Promise<void> {
    if (this.engine) {
      await this.engine.shutdown();
    }
    this.isInitialized = false;
  }
}