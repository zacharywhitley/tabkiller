/**
 * Database connection manager for TabKiller extension
 * Uses LevelGraph as the embedded graph database for browser extension compatibility
 */

import levelgraph from 'levelgraph';
import { TabKillerError } from '../shared/types';
import { detectBrowser, getBrowserConfig } from '../utils/cross-browser';

export interface DatabaseConfig {
  name: string;
  path?: string;
  autoCompaction?: boolean;
  maxMemory?: number;
}

export interface ConnectionOptions {
  timeout?: number;
  maxConnections?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * Graph database connection manager
 * Handles initialization, connection pooling, and lifecycle management
 */
export class DatabaseConnection {
  private db: any = null;
  private config: DatabaseConfig;
  private options: ConnectionOptions;
  private isInitialized = false;
  private connectionPromise: Promise<any> | null = null;
  private readonly browser = detectBrowser();
  private readonly browserConfig = getBrowserConfig();

  constructor(config: DatabaseConfig, options: ConnectionOptions = {}) {
    this.config = {
      name: 'tabkiller-graph',
      autoCompaction: true,
      maxMemory: this.browserConfig.storageQuota,
      ...config
    };

    this.options = {
      timeout: 30000,
      maxConnections: 1, // Single connection for browser extension
      retryAttempts: 3,
      retryDelay: 1000,
      ...options
    };
  }

  /**
   * Initialize the database connection
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.createConnection();
    
    try {
      await this.connectionPromise;
      this.isInitialized = true;
      console.log(`TabKiller database initialized for ${this.browser}`);
    } catch (error) {
      this.connectionPromise = null;
      throw new TabKillerError(
        'DB_INIT_FAILED',
        'Failed to initialize database connection',
        'background',
        error
      );
    }
  }

  /**
   * Create the database connection with browser-specific configuration
   */
  private async createConnection(): Promise<any> {
    try {
      let dbOptions: any = {};

      if (this.browser === 'chrome' || this.browser === 'edge') {
        // Chrome/Edge with IndexedDB backend
        dbOptions = {
          db: require('level-browserify'),
          valueEncoding: 'json'
        };
      } else if (this.browser === 'firefox') {
        // Firefox with IndexedDB backend
        dbOptions = {
          db: require('level-browserify'),
          valueEncoding: 'json'
        };
      } else {
        // Fallback for other browsers
        dbOptions = {
          valueEncoding: 'json'
        };
      }

      // Create LevelGraph instance
      this.db = levelgraph(this.config.name, dbOptions);

      // Set up error handling
      this.db.on('error', this.handleDatabaseError.bind(this));

      // Wait for database to be ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Database initialization timeout'));
        }, this.options.timeout);

        this.db.get({}, (err: any, results: any) => {
          clearTimeout(timeout);
          if (err && err.type !== 'NotFoundError') {
            reject(err);
          } else {
            resolve(results);
          }
        });
      });

      return this.db;
    } catch (error) {
      throw new TabKillerError(
        'DB_CONNECTION_FAILED',
        'Failed to create database connection',
        'background',
        error
      );
    }
  }

  /**
   * Get the database instance
   */
  getDatabase(): any {
    if (!this.isInitialized || !this.db) {
      throw new TabKillerError(
        'DB_NOT_INITIALIZED',
        'Database not initialized. Call initialize() first.',
        'background'
      );
    }
    return this.db;
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      try {
        await new Promise<void>((resolve, reject) => {
          this.db.close((err: any) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
        
        this.db = null;
        this.isInitialized = false;
        this.connectionPromise = null;
        console.log('TabKiller database connection closed');
      } catch (error) {
        console.error('Error closing database connection:', error);
        throw new TabKillerError(
          'DB_CLOSE_FAILED',
          'Failed to close database connection',
          'background',
          error
        );
      }
    }
  }

  /**
   * Check if database is connected and ready
   */
  isConnected(): boolean {
    return this.isInitialized && this.db !== null;
  }

  /**
   * Get database statistics and status
   */
  async getStatus(): Promise<{
    connected: boolean;
    browser: string;
    config: DatabaseConfig;
    stats: any;
  }> {
    const stats = this.isConnected() 
      ? await this.getDatabaseStats()
      : null;

    return {
      connected: this.isConnected(),
      browser: this.browser,
      config: this.config,
      stats
    };
  }

  /**
   * Get database statistics
   */
  private async getDatabaseStats(): Promise<any> {
    if (!this.isConnected()) {
      return null;
    }

    try {
      // Get approximate count of triples
      const count = await new Promise((resolve, reject) => {
        let count = 0;
        const stream = this.db.getStream({});
        
        stream.on('data', () => {
          count++;
        });
        
        stream.on('end', () => {
          resolve(count);
        });
        
        stream.on('error', reject);
      });

      return {
        tripleCount: count,
        memoryUsage: process.memoryUsage?.() || null,
        timestamp: Date.now()
      };
    } catch (error) {
      console.warn('Could not retrieve database stats:', error);
      return {
        tripleCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle database errors
   */
  private handleDatabaseError(error: any): void {
    console.error('Database error:', error);
    
    // Emit custom error event that can be handled by the application
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('tabkiller-db-error', {
        detail: {
          error,
          timestamp: Date.now()
        }
      }));
    }
  }

  /**
   * Perform database health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected()) {
        return false;
      }

      // Simple read operation to test connection
      await new Promise((resolve, reject) => {
        this.db.get({ subject: 'health-check' }, (err: any, results: any) => {
          if (err && err.type !== 'NotFoundError') {
            reject(err);
          } else {
            resolve(results);
          }
        });
      });

      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  /**
   * Backup database to storage
   */
  async backup(): Promise<string> {
    if (!this.isConnected()) {
      throw new TabKillerError(
        'DB_NOT_CONNECTED',
        'Cannot backup - database not connected',
        'background'
      );
    }

    try {
      const triples: any[] = [];
      
      await new Promise((resolve, reject) => {
        const stream = this.db.getStream({});
        
        stream.on('data', (triple: any) => {
          triples.push(triple);
        });
        
        stream.on('end', () => {
          resolve(triples);
        });
        
        stream.on('error', reject);
      });

      const backup = {
        version: '1.0',
        timestamp: Date.now(),
        browser: this.browser,
        tripleCount: triples.length,
        data: triples
      };

      return JSON.stringify(backup, null, 2);
    } catch (error) {
      throw new TabKillerError(
        'DB_BACKUP_FAILED',
        'Failed to backup database',
        'background',
        error
      );
    }
  }

  /**
   * Restore database from backup
   */
  async restore(backupData: string): Promise<void> {
    if (!this.isConnected()) {
      throw new TabKillerError(
        'DB_NOT_CONNECTED',
        'Cannot restore - database not connected',
        'background'
      );
    }

    try {
      const backup = JSON.parse(backupData);
      
      if (!backup.data || !Array.isArray(backup.data)) {
        throw new Error('Invalid backup format');
      }

      // Clear existing data (optional - depends on restore strategy)
      await this.clearDatabase();

      // Restore triples in batches
      const batchSize = 1000;
      for (let i = 0; i < backup.data.length; i += batchSize) {
        const batch = backup.data.slice(i, i + batchSize);
        
        await new Promise<void>((resolve, reject) => {
          this.db.put(batch, (err: any) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }

      console.log(`Restored ${backup.data.length} triples from backup`);
    } catch (error) {
      throw new TabKillerError(
        'DB_RESTORE_FAILED',
        'Failed to restore database from backup',
        'background',
        error
      );
    }
  }

  /**
   * Clear all data from database
   */
  private async clearDatabase(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.db.del({}, (err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

/**
 * Singleton instance for the main database connection
 */
let databaseInstance: DatabaseConnection | null = null;

/**
 * Get or create the singleton database instance
 */
export function getDatabaseInstance(config?: DatabaseConfig): DatabaseConnection {
  if (!databaseInstance) {
    const defaultConfig: DatabaseConfig = {
      name: 'tabkiller-graph',
      autoCompaction: true
    };

    databaseInstance = new DatabaseConnection(config || defaultConfig);
  }

  return databaseInstance;
}

/**
 * Initialize the global database instance
 */
export async function initializeDatabase(config?: DatabaseConfig): Promise<DatabaseConnection> {
  const db = getDatabaseInstance(config);
  await db.initialize();
  return db;
}

/**
 * Close the global database instance
 */
export async function closeDatabase(): Promise<void> {
  if (databaseInstance) {
    await databaseInstance.close();
    databaseInstance = null;
  }
}