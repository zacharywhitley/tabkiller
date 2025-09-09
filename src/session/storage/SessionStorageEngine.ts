/**
 * Session Storage Engine - IndexedDB-based storage for session management
 * Provides high-performance, schema-based storage for sessions, tabs, and navigation events
 */

import {
  DATABASE_NAME,
  DATABASE_VERSION,
  STORE_NAMES,
  INDEX_NAMES,
  StoredSession,
  StoredTab,
  StoredNavigationEvent,
  StoredSessionBoundary,
  DatabaseMetadata,
  createStoreConfig,
  validateObject
} from './schema';

import {
  BrowsingSession,
  TabInfo,
  NavigationEvent,
  SessionBoundary
} from '../../shared/types';

import { SessionDataSerializer } from './SessionDataSerializer';
import { DataIntegrityValidator } from './DataIntegrityValidator';

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface StorageConfig {
  enableCompression: boolean;
  enableIntegrityChecks: boolean;
  maxSessionAge: number; // milliseconds
  maxStorageSize: number; // bytes
  batchSize: number;
  indexingEnabled: boolean;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  includeDeleted?: boolean;
}

export interface SessionQuery {
  tags?: string[];
  dateRange?: { start: number; end: number };
  domains?: string[];
  searchText?: string;
  options?: QueryOptions;
}

export interface TabQuery {
  sessionIds?: string[];
  windowIds?: number[];
  domains?: string[];
  dateRange?: { start: number; end: number };
  options?: QueryOptions;
}

export interface NavigationQuery {
  sessionIds?: string[];
  tabIds?: number[];
  domains?: string[];
  dateRange?: { start: number; end: number };
  options?: QueryOptions;
}

export interface StorageStats {
  sessions: number;
  tabs: number;
  navigationEvents: number;
  boundaries: number;
  storageSize: number;
  oldestRecord: number;
  newestRecord: number;
  integrityStatus: boolean;
}

// =============================================================================
// SESSION STORAGE ENGINE
// =============================================================================

export class SessionStorageEngine {
  private db?: IDBDatabase;
  private config: StorageConfig;
  private serializer: SessionDataSerializer;
  private validator: DataIntegrityValidator;
  private isInitialized = false;
  private initPromise?: Promise<void>;

  constructor(config: Partial<StorageConfig> = {}) {
    this.config = {
      enableCompression: true,
      enableIntegrityChecks: true,
      maxSessionAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      maxStorageSize: 100 * 1024 * 1024, // 100MB
      batchSize: 50,
      indexingEnabled: true,
      ...config
    };

    this.serializer = new SessionDataSerializer({
      enableCompression: this.config.enableCompression
    });

    this.validator = new DataIntegrityValidator({
      enableChecks: this.config.enableIntegrityChecks
    });
  }

  /**
   * Initialize the storage engine
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.performInitialization();
    return this.initPromise;
  }

  private async performInitialization(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Initializing SessionStorageEngine...');
      
      this.db = await this.openDatabase();
      await this.initializeMetadata();
      await this.performMaintenanceTasks();
      
      this.isInitialized = true;
      console.log('SessionStorageEngine initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize SessionStorageEngine:', error);
      throw error;
    }
  }

  /**
   * Open IndexedDB database with schema setup
   */
  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.setupSchema(db, event.oldVersion, event.newVersion || DATABASE_VERSION);
      };
    });
  }

  /**
   * Setup database schema during upgrade
   */
  private setupSchema(db: IDBDatabase, oldVersion: number, newVersion: number): void {
    console.log(`Upgrading database schema from ${oldVersion} to ${newVersion}`);

    // Create object stores if they don't exist
    for (const storeName of Object.values(STORE_NAMES)) {
      if (!db.objectStoreNames.contains(storeName)) {
        const storeConfig = createStoreConfig(storeName);
        const store = db.createObjectStore(storeName, storeConfig.options);

        // Create indexes
        for (const indexConfig of storeConfig.indexes) {
          store.createIndex(indexConfig.name, indexConfig.keyPath, indexConfig.options);
        }

        console.log(`Created object store: ${storeName} with ${storeConfig.indexes.length} indexes`);
      }
    }
  }

  /**
   * Initialize metadata if not exists
   */
  private async initializeMetadata(): Promise<void> {
    const transaction = this.db!.transaction([STORE_NAMES.METADATA], 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.METADATA);
    
    const existingMetadata = await this.getFromStore<DatabaseMetadata>(store, DATABASE_VERSION);
    
    if (!existingMetadata) {
      const initialMetadata: DatabaseMetadata = {
        version: DATABASE_VERSION,
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

      await this.putInStore(store, initialMetadata);
      console.log('Initialized database metadata');
    }
  }

  /**
   * Perform maintenance tasks on startup
   */
  private async performMaintenanceTasks(): Promise<void> {
    try {
      // Clean up old data
      await this.cleanupOldData();
      
      // Update storage statistics
      await this.updateStorageStats();
      
      // Run integrity checks if enabled
      if (this.config.enableIntegrityChecks) {
        await this.runIntegrityCheck();
      }
      
    } catch (error) {
      console.warn('Maintenance tasks failed:', error);
    }
  }

  // =============================================================================
  // SESSION OPERATIONS
  // =============================================================================

  /**
   * Create a new session
   */
  async createSession(session: BrowsingSession): Promise<StoredSession> {
    await this.ensureInitialized();
    
    const storedSession = await this.serializer.serializeSession(session);
    
    if (!validateObject(STORE_NAMES.SESSIONS, storedSession)) {
      throw new Error('Invalid session object');
    }

    const transaction = this.db!.transaction([STORE_NAMES.SESSIONS, STORE_NAMES.METADATA], 'readwrite');
    
    try {
      // Store session
      const sessionStore = transaction.objectStore(STORE_NAMES.SESSIONS);
      await this.putInStore(sessionStore, storedSession);
      
      // Update metadata
      await this.incrementMetadataCounter('totalSessions');
      
      console.log(`Created session: ${storedSession.id}`);
      return storedSession;
      
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<StoredSession | null> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([STORE_NAMES.SESSIONS], 'readonly');
    const store = transaction.objectStore(STORE_NAMES.SESSIONS);
    
    const session = await this.getFromStore<StoredSession>(store, sessionId);
    return session || null;
  }

  /**
   * Update existing session
   */
  async updateSession(sessionId: string, updates: Partial<BrowsingSession>): Promise<StoredSession> {
    await this.ensureInitialized();
    
    const existingSession = await this.getSession(sessionId);
    if (!existingSession) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const updatedSession = {
      ...existingSession,
      ...updates,
      updatedAt: Date.now(),
      lastModified: Date.now()
    };

    const storedSession = await this.serializer.serializeSession(updatedSession);
    
    const transaction = this.db!.transaction([STORE_NAMES.SESSIONS], 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.SESSIONS);
    
    await this.putInStore(store, storedSession);
    
    console.log(`Updated session: ${sessionId}`);
    return storedSession;
  }

  /**
   * Delete session and related data
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([
      STORE_NAMES.SESSIONS,
      STORE_NAMES.TABS,
      STORE_NAMES.NAVIGATION_EVENTS,
      STORE_NAMES.SESSION_BOUNDARIES,
      STORE_NAMES.METADATA
    ], 'readwrite');

    try {
      // Delete session
      const sessionStore = transaction.objectStore(STORE_NAMES.SESSIONS);
      await this.deleteFromStore(sessionStore, sessionId);

      // Delete related tabs
      const tabStore = transaction.objectStore(STORE_NAMES.TABS);
      const tabIndex = tabStore.index(INDEX_NAMES.TAB_BY_SESSION_ID);
      await this.deleteByIndex(tabIndex, sessionId);

      // Delete related navigation events
      const navStore = transaction.objectStore(STORE_NAMES.NAVIGATION_EVENTS);
      const navIndex = navStore.index(INDEX_NAMES.NAV_BY_SESSION_ID);
      await this.deleteByIndex(navIndex, sessionId);

      // Delete related boundaries
      const boundaryStore = transaction.objectStore(STORE_NAMES.SESSION_BOUNDARIES);
      const boundaryIndex = boundaryStore.index(INDEX_NAMES.BOUNDARY_BY_SESSION_ID);
      await this.deleteByIndex(boundaryIndex, sessionId);

      // Update metadata
      await this.decrementMetadataCounter('totalSessions');
      
      console.log(`Deleted session and related data: ${sessionId}`);
      
    } catch (error) {
      console.error('Failed to delete session:', error);
      throw error;
    }
  }

  /**
   * Query sessions with filtering
   */
  async querySessions(query: SessionQuery = {}): Promise<StoredSession[]> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([STORE_NAMES.SESSIONS], 'readonly');
    const store = transaction.objectStore(STORE_NAMES.SESSIONS);
    
    let cursor: IDBRequest<IDBCursorWithValue | null>;
    const results: StoredSession[] = [];
    const { limit = 100, offset = 0 } = query.options || {};
    let processedCount = 0;
    let skippedCount = 0;

    // Determine optimal index to use
    if (query.dateRange) {
      const index = store.index(INDEX_NAMES.SESSION_BY_CREATED_AT);
      const range = IDBKeyRange.bound(query.dateRange.start, query.dateRange.end);
      cursor = index.openCursor(range, 'prev'); // newest first
    } else if (query.tags && query.tags.length === 1) {
      const index = store.index(INDEX_NAMES.SESSION_BY_TAG);
      cursor = index.openCursor(IDBKeyRange.only(query.tags[0]), 'prev');
    } else {
      const index = store.index(INDEX_NAMES.SESSION_BY_UPDATED_AT);
      cursor = index.openCursor(null, 'prev'); // newest first
    }

    return new Promise((resolve, reject) => {
      cursor.onsuccess = () => {
        const result = cursor.result;
        
        if (!result || results.length >= limit) {
          resolve(results);
          return;
        }

        const session = result.value as StoredSession;
        
        // Apply filters
        if (this.matchesSessionQuery(session, query)) {
          if (skippedCount >= offset) {
            results.push(session);
          } else {
            skippedCount++;
          }
        }

        processedCount++;
        
        // Prevent infinite loops
        if (processedCount > 10000) {
          console.warn('Query processed too many records, stopping');
          resolve(results);
          return;
        }

        result.continue();
      };

      cursor.onerror = () => {
        reject(new Error('Failed to query sessions'));
      };
    });
  }

  // =============================================================================
  // TAB OPERATIONS
  // =============================================================================

  /**
   * Create a new tab record
   */
  async createTab(tab: TabInfo, sessionId: string): Promise<StoredTab> {
    await this.ensureInitialized();
    
    const storedTab = await this.serializer.serializeTab(tab, sessionId);
    
    if (!validateObject(STORE_NAMES.TABS, storedTab)) {
      throw new Error('Invalid tab object');
    }

    const transaction = this.db!.transaction([STORE_NAMES.TABS, STORE_NAMES.METADATA], 'readwrite');
    
    try {
      const tabStore = transaction.objectStore(STORE_NAMES.TABS);
      await this.putInStore(tabStore, storedTab);
      
      await this.incrementMetadataCounter('totalTabs');
      
      return storedTab;
      
    } catch (error) {
      console.error('Failed to create tab:', error);
      throw error;
    }
  }

  /**
   * Get tab by ID
   */
  async getTab(tabId: number): Promise<StoredTab | null> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([STORE_NAMES.TABS], 'readonly');
    const store = transaction.objectStore(STORE_NAMES.TABS);
    
    const tab = await this.getFromStore<StoredTab>(store, tabId);
    return tab || null;
  }

  /**
   * Update existing tab
   */
  async updateTab(tabId: number, updates: Partial<TabInfo>): Promise<StoredTab> {
    await this.ensureInitialized();
    
    const existingTab = await this.getTab(tabId);
    if (!existingTab) {
      throw new Error(`Tab not found: ${tabId}`);
    }

    const updatedTab = {
      ...existingTab,
      ...updates,
      lastAccessed: Date.now(),
      lastModified: Date.now()
    };

    const transaction = this.db!.transaction([STORE_NAMES.TABS], 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.TABS);
    
    await this.putInStore(store, updatedTab);
    
    return updatedTab;
  }

  /**
   * Delete tab and related navigation events
   */
  async deleteTab(tabId: number): Promise<void> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([
      STORE_NAMES.TABS,
      STORE_NAMES.NAVIGATION_EVENTS,
      STORE_NAMES.METADATA
    ], 'readwrite');

    try {
      // Delete tab
      const tabStore = transaction.objectStore(STORE_NAMES.TABS);
      await this.deleteFromStore(tabStore, tabId);

      // Delete related navigation events
      const navStore = transaction.objectStore(STORE_NAMES.NAVIGATION_EVENTS);
      const navIndex = navStore.index(INDEX_NAMES.NAV_BY_TAB_ID);
      await this.deleteByIndex(navIndex, tabId);

      await this.decrementMetadataCounter('totalTabs');
      
    } catch (error) {
      console.error('Failed to delete tab:', error);
      throw error;
    }
  }

  /**
   * Query tabs with filtering
   */
  async queryTabs(query: TabQuery = {}): Promise<StoredTab[]> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([STORE_NAMES.TABS], 'readonly');
    const store = transaction.objectStore(STORE_NAMES.TABS);
    
    const results: StoredTab[] = [];
    const { limit = 100, offset = 0 } = query.options || {};
    let processedCount = 0;

    // Use index if available
    let cursor: IDBRequest<IDBCursorWithValue | null>;
    
    if (query.sessionIds && query.sessionIds.length === 1) {
      const index = store.index(INDEX_NAMES.TAB_BY_SESSION_ID);
      cursor = index.openCursor(IDBKeyRange.only(query.sessionIds[0]));
    } else if (query.windowIds && query.windowIds.length === 1) {
      const index = store.index(INDEX_NAMES.TAB_BY_WINDOW_ID);
      cursor = index.openCursor(IDBKeyRange.only(query.windowIds[0]));
    } else {
      cursor = store.openCursor();
    }

    return new Promise((resolve, reject) => {
      cursor.onsuccess = () => {
        const result = cursor.result;
        
        if (!result || results.length >= limit) {
          resolve(results);
          return;
        }

        const tab = result.value as StoredTab;
        
        if (this.matchesTabQuery(tab, query)) {
          if (processedCount >= offset) {
            results.push(tab);
          }
        }

        processedCount++;
        result.continue();
      };

      cursor.onerror = () => {
        reject(new Error('Failed to query tabs'));
      };
    });
  }

  // =============================================================================
  // NAVIGATION EVENT OPERATIONS
  // =============================================================================

  /**
   * Create navigation event
   */
  async createNavigationEvent(event: NavigationEvent, sessionId: string): Promise<StoredNavigationEvent> {
    await this.ensureInitialized();
    
    const storedEvent = await this.serializer.serializeNavigationEvent(event, sessionId);
    
    const transaction = this.db!.transaction([STORE_NAMES.NAVIGATION_EVENTS, STORE_NAMES.METADATA], 'readwrite');
    
    try {
      const eventStore = transaction.objectStore(STORE_NAMES.NAVIGATION_EVENTS);
      await this.putInStore(eventStore, storedEvent);
      
      await this.incrementMetadataCounter('totalNavigationEvents');
      
      return storedEvent;
      
    } catch (error) {
      console.error('Failed to create navigation event:', error);
      throw error;
    }
  }

  /**
   * Query navigation events
   */
  async queryNavigationEvents(query: NavigationQuery = {}): Promise<StoredNavigationEvent[]> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([STORE_NAMES.NAVIGATION_EVENTS], 'readonly');
    const store = transaction.objectStore(STORE_NAMES.NAVIGATION_EVENTS);
    
    const results: StoredNavigationEvent[] = [];
    const { limit = 100 } = query.options || {};

    let cursor: IDBRequest<IDBCursorWithValue | null>;
    
    if (query.tabIds && query.tabIds.length === 1) {
      const index = store.index(INDEX_NAMES.NAV_BY_TAB_ID);
      cursor = index.openCursor(IDBKeyRange.only(query.tabIds[0]));
    } else if (query.sessionIds && query.sessionIds.length === 1) {
      const index = store.index(INDEX_NAMES.NAV_BY_SESSION_ID);
      cursor = index.openCursor(IDBKeyRange.only(query.sessionIds[0]));
    } else if (query.dateRange) {
      const index = store.index(INDEX_NAMES.NAV_BY_TIMESTAMP);
      const range = IDBKeyRange.bound(query.dateRange.start, query.dateRange.end);
      cursor = index.openCursor(range, 'prev');
    } else {
      cursor = store.openCursor();
    }

    return new Promise((resolve, reject) => {
      cursor.onsuccess = () => {
        const result = cursor.result;
        
        if (!result || results.length >= limit) {
          resolve(results);
          return;
        }

        const event = result.value as StoredNavigationEvent;
        
        if (this.matchesNavigationQuery(event, query)) {
          results.push(event);
        }

        result.continue();
      };

      cursor.onerror = () => {
        reject(new Error('Failed to query navigation events'));
      };
    });
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Generic IndexedDB operations
   */
  private async getFromStore<T>(store: IDBObjectStore, key: any): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async putInStore<T>(store: IDBObjectStore, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = store.put(value);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteFromStore(store: IDBObjectStore, key: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteByIndex(index: IDBIndex, key: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const deleteRequests: Promise<void>[] = [];
      
      const cursor = index.openCursor(IDBKeyRange.only(key));
      cursor.onsuccess = () => {
        const result = cursor.result;
        if (result) {
          deleteRequests.push(new Promise((resolveDelete, rejectDelete) => {
            const deleteRequest = result.delete();
            deleteRequest.onsuccess = () => resolveDelete();
            deleteRequest.onerror = () => rejectDelete(deleteRequest.error);
          }));
          result.continue();
        } else {
          Promise.all(deleteRequests).then(() => resolve()).catch(reject);
        }
      };
      cursor.onerror = () => reject(cursor.error);
    });
  }

  /**
   * Query matching functions
   */
  private matchesSessionQuery(session: StoredSession, query: SessionQuery): boolean {
    if (query.tags && query.tags.length > 0) {
      if (!query.tags.includes(session.tag)) {
        return false;
      }
    }

    if (query.dateRange) {
      if (session.createdAt < query.dateRange.start || session.createdAt > query.dateRange.end) {
        return false;
      }
    }

    if (query.domains && query.domains.length > 0) {
      const hasMatchingDomain = query.domains.some(domain =>
        session.domains.some(sessionDomain => sessionDomain.includes(domain))
      );
      if (!hasMatchingDomain) {
        return false;
      }
    }

    if (query.searchText) {
      const searchLower = query.searchText.toLowerCase();
      const matchesTag = session.tag.toLowerCase().includes(searchLower);
      const matchesMetadata = session.metadata.purpose?.toLowerCase().includes(searchLower) ||
                             session.metadata.notes?.toLowerCase().includes(searchLower);
      
      if (!matchesTag && !matchesMetadata) {
        return false;
      }
    }

    return true;
  }

  private matchesTabQuery(tab: StoredTab, query: TabQuery): boolean {
    if (query.sessionIds && !query.sessionIds.includes(tab.sessionId)) {
      return false;
    }

    if (query.windowIds && !query.windowIds.includes(tab.windowId)) {
      return false;
    }

    if (query.domains && !query.domains.some(domain => tab.domain.includes(domain))) {
      return false;
    }

    if (query.dateRange) {
      if (tab.createdAt < query.dateRange.start || tab.createdAt > query.dateRange.end) {
        return false;
      }
    }

    return true;
  }

  private matchesNavigationQuery(event: StoredNavigationEvent, query: NavigationQuery): boolean {
    if (query.sessionIds && !query.sessionIds.includes(event.sessionId)) {
      return false;
    }

    if (query.tabIds && !query.tabIds.includes(event.tabId)) {
      return false;
    }

    if (query.domains && !query.domains.some(domain => event.domain.includes(domain))) {
      return false;
    }

    if (query.dateRange) {
      if (event.timestamp < query.dateRange.start || event.timestamp > query.dateRange.end) {
        return false;
      }
    }

    return true;
  }

  /**
   * Metadata operations
   */
  private async incrementMetadataCounter(field: keyof DatabaseMetadata): Promise<void> {
    const transaction = this.db!.transaction([STORE_NAMES.METADATA], 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.METADATA);
    
    const metadata = await this.getFromStore<DatabaseMetadata>(store, DATABASE_VERSION);
    if (metadata && typeof metadata[field] === 'number') {
      (metadata[field] as number)++;
      metadata.lastModified = Date.now();
      await this.putInStore(store, metadata);
    }
  }

  private async decrementMetadataCounter(field: keyof DatabaseMetadata): Promise<void> {
    const transaction = this.db!.transaction([STORE_NAMES.METADATA], 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.METADATA);
    
    const metadata = await this.getFromStore<DatabaseMetadata>(store, DATABASE_VERSION);
    if (metadata && typeof metadata[field] === 'number') {
      (metadata[field] as number) = Math.max(0, (metadata[field] as number) - 1);
      metadata.lastModified = Date.now();
      await this.putInStore(store, metadata);
    }
  }

  /**
   * Maintenance operations
   */
  private async cleanupOldData(): Promise<void> {
    const cutoffTime = Date.now() - this.config.maxSessionAge;
    
    const oldSessions = await this.querySessions({
      dateRange: { start: 0, end: cutoffTime },
      options: { limit: 1000 }
    });

    for (const session of oldSessions) {
      await this.deleteSession(session.id);
    }

    if (oldSessions.length > 0) {
      console.log(`Cleaned up ${oldSessions.length} old sessions`);
    }
  }

  private async updateStorageStats(): Promise<void> {
    // This would calculate actual storage usage
    // For now, just update the timestamp
    const transaction = this.db!.transaction([STORE_NAMES.METADATA], 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.METADATA);
    
    const metadata = await this.getFromStore<DatabaseMetadata>(store, DATABASE_VERSION);
    if (metadata) {
      metadata.lastModified = Date.now();
      await this.putInStore(store, metadata);
    }
  }

  private async runIntegrityCheck(): Promise<void> {
    if (!this.config.enableIntegrityChecks) return;
    
    try {
      // Run basic integrity checks
      const errors: string[] = [];
      
      // Check for orphaned tabs
      const allTabs = await this.queryTabs({ options: { limit: 10000 } });
      for (const tab of allTabs) {
        const session = await this.getSession(tab.sessionId);
        if (!session) {
          errors.push(`Orphaned tab: ${tab.id} references non-existent session: ${tab.sessionId}`);
        }
      }

      // Update metadata with integrity check results
      const transaction = this.db!.transaction([STORE_NAMES.METADATA], 'readwrite');
      const store = transaction.objectStore(STORE_NAMES.METADATA);
      
      const metadata = await this.getFromStore<DatabaseMetadata>(store, DATABASE_VERSION);
      if (metadata) {
        metadata.integrityCheck = {
          lastCheck: Date.now(),
          isValid: errors.length === 0,
          errors
        };
        await this.putInStore(store, metadata);
      }

      if (errors.length > 0) {
        console.warn(`Integrity check found ${errors.length} issues:`, errors);
      }

    } catch (error) {
      console.error('Integrity check failed:', error);
    }
  }

  /**
   * Ensure initialization
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  // =============================================================================
  // PUBLIC API
  // =============================================================================

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    await this.ensureInitialized();
    
    const metadata = await this.getFromStore<DatabaseMetadata>(
      this.db!.transaction([STORE_NAMES.METADATA], 'readonly').objectStore(STORE_NAMES.METADATA),
      DATABASE_VERSION
    );

    return {
      sessions: metadata?.totalSessions || 0,
      tabs: metadata?.totalTabs || 0,
      navigationEvents: metadata?.totalNavigationEvents || 0,
      boundaries: 0, // TODO: Implement boundary counting
      storageSize: metadata?.storageSize || 0,
      oldestRecord: 0, // TODO: Calculate from data
      newestRecord: Date.now(),
      integrityStatus: metadata?.integrityCheck.isValid || false
    };
  }

  /**
   * Shutdown storage engine
   */
  async shutdown(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
    
    this.isInitialized = false;
    this.initPromise = undefined;
    
    console.log('SessionStorageEngine shutdown complete');
  }

  /**
   * Clear all data
   */
  async clearAllData(): Promise<void> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction(Object.values(STORE_NAMES), 'readwrite');
    
    for (const storeName of Object.values(STORE_NAMES)) {
      const store = transaction.objectStore(storeName);
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    await this.initializeMetadata();
    console.log('All data cleared');
  }
}