/**
 * Database integration index
 * Main entry point for graph database functionality
 */

export * from './connection';
export * from './schema';
export * from './models';
export * from './queries';
export * from './repositories';
export * from './encryption';

import { DatabaseConnection, initializeDatabase } from './connection';
import { RepositoryManager } from './repositories';
import { BrowsingHistoryQueries, OptimizedQueries } from './queries';
import { EventToGraphTransformer, GraphToEventTransformer, GraphTransformFactory } from './models';
import { initializeEncryption, getEncryptionService } from './encryption';
import { TabKillerError } from '../shared/types';

/**
 * Main database service that coordinates all graph database operations
 */
export class TabKillerDatabase {
  private connection: DatabaseConnection | null = null;
  private repositories: RepositoryManager | null = null;
  private queries: BrowsingHistoryQueries | null = null;
  private optimizedQueries: OptimizedQueries | null = null;
  private transformFactory: GraphTransformFactory | null = null;
  private isInitialized = false;

  /**
   * Initialize the complete database system
   */
  async initialize(enableEncryption = true, masterPassword?: string): Promise<void> {
    try {
      console.log('Initializing TabKiller graph database...');

      // Initialize encryption if enabled
      if (enableEncryption) {
        await initializeEncryption(masterPassword);
        console.log('Encryption initialized');
      }

      // Initialize database connection
      this.connection = await initializeDatabase({
        name: 'tabkiller-graph',
        autoCompaction: true
      });

      // Initialize repositories
      this.repositories = new RepositoryManager(this.connection);

      // Initialize query services
      this.queries = new BrowsingHistoryQueries(this.connection);
      this.optimizedQueries = new OptimizedQueries(this.connection);

      // Initialize transform factory
      this.transformFactory = new GraphTransformFactory();

      this.isInitialized = true;
      console.log('TabKiller graph database initialized successfully');

    } catch (error) {
      console.error('Failed to initialize TabKiller database:', error);
      throw new TabKillerError(
        'DATABASE_INIT_FAILED',
        'Failed to initialize graph database system',
        'background',
        error
      );
    }
  }

  /**
   * Check if database is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.connection?.isConnected() === true;
  }

  /**
   * Get repository manager
   */
  getRepositories(): RepositoryManager {
    if (!this.repositories) {
      throw new TabKillerError(
        'DATABASE_NOT_INITIALIZED',
        'Database not initialized. Call initialize() first.',
        'background'
      );
    }
    return this.repositories;
  }

  /**
   * Get query service
   */
  getQueries(): BrowsingHistoryQueries {
    if (!this.queries) {
      throw new TabKillerError(
        'DATABASE_NOT_INITIALIZED',
        'Database not initialized. Call initialize() first.',
        'background'
      );
    }
    return this.queries;
  }

  /**
   * Get optimized query service
   */
  getOptimizedQueries(): OptimizedQueries {
    if (!this.optimizedQueries) {
      throw new TabKillerError(
        'DATABASE_NOT_INITIALIZED',
        'Database not initialized. Call initialize() first.',
        'background'
      );
    }
    return this.optimizedQueries;
  }

  /**
   * Get transform factory
   */
  getTransformFactory(): GraphTransformFactory {
    if (!this.transformFactory) {
      throw new TabKillerError(
        'DATABASE_NOT_INITIALIZED',
        'Database not initialized. Call initialize() first.',
        'background'
      );
    }
    return this.transformFactory;
  }

  /**
   * Get database connection
   */
  getConnection(): DatabaseConnection {
    if (!this.connection) {
      throw new TabKillerError(
        'DATABASE_NOT_INITIALIZED',
        'Database not initialized. Call initialize() first.',
        'background'
      );
    }
    return this.connection;
  }

  /**
   * Get database status
   */
  async getStatus(): Promise<{
    initialized: boolean;
    connected: boolean;
    encrypted: boolean;
    health: any;
    stats: any;
  }> {
    try {
      const connected = this.connection?.isConnected() || false;
      const encrypted = getEncryptionService().isInitialized();
      
      let health = null;
      let stats = null;

      if (this.repositories) {
        health = await this.repositories.getHealthStatus();
      }

      if (this.connection) {
        stats = await this.connection.getStatus();
      }

      return {
        initialized: this.isInitialized,
        connected,
        encrypted,
        health,
        stats
      };
    } catch (error) {
      return {
        initialized: false,
        connected: false,
        encrypted: false,
        health: { error: error instanceof Error ? error.message : 'Unknown error' },
        stats: null
      };
    }
  }

  /**
   * Backup database
   */
  async backup(): Promise<string> {
    if (!this.connection) {
      throw new TabKillerError(
        'DATABASE_NOT_INITIALIZED',
        'Cannot backup - database not initialized',
        'background'
      );
    }

    return this.connection.backup();
  }

  /**
   * Restore database
   */
  async restore(backupData: string): Promise<void> {
    if (!this.connection) {
      throw new TabKillerError(
        'DATABASE_NOT_INITIALIZED',
        'Cannot restore - database not initialized',
        'background'
      );
    }

    return this.connection.restore(backupData);
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }

    this.repositories = null;
    this.queries = null;
    this.optimizedQueries = null;
    this.transformFactory = null;
    this.isInitialized = false;

    console.log('TabKiller database closed');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.connection || !this.connection.isConnected()) {
        return false;
      }

      return await this.connection.healthCheck();
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}

/**
 * Global database instance
 */
let globalDatabase: TabKillerDatabase | null = null;

/**
 * Get or create global database instance
 */
export function getDatabase(): TabKillerDatabase {
  if (!globalDatabase) {
    globalDatabase = new TabKillerDatabase();
  }
  return globalDatabase;
}

/**
 * Initialize global database instance
 */
export async function initializeGlobalDatabase(
  enableEncryption = true,
  masterPassword?: string
): Promise<TabKillerDatabase> {
  const db = getDatabase();
  await db.initialize(enableEncryption, masterPassword);
  return db;
}

/**
 * Close global database instance
 */
export async function closeGlobalDatabase(): Promise<void> {
  if (globalDatabase) {
    await globalDatabase.close();
    globalDatabase = null;
  }
}