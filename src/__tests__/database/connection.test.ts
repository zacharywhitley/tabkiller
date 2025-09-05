/**
 * Tests for database connection manager
 */

import { DatabaseConnection } from '../../database/connection';

// Mock levelgraph module
jest.mock('levelgraph', () => {
  return jest.fn(() => ({
    on: jest.fn(),
    get: jest.fn((query, callback) => {
      callback(null, []);
    }),
    put: jest.fn((triples, callback) => {
      callback(null);
    }),
    del: jest.fn((query, callback) => {
      callback(null);
    }),
    close: jest.fn((callback) => {
      callback(null);
    }),
    getStream: jest.fn(() => ({
      on: jest.fn(),
      pipe: jest.fn()
    }))
  }));
});

// Mock browser detection
jest.mock('../../utils/cross-browser', () => ({
  detectBrowser: () => 'chrome',
  getBrowserConfig: () => ({
    storageQuota: 5242880,
    manifestVersion: 3
  })
}));

describe('DatabaseConnection', () => {
  let connection: DatabaseConnection;

  beforeEach(() => {
    connection = new DatabaseConnection({
      name: 'test-db'
    });
  });

  afterEach(async () => {
    if (connection.isConnected()) {
      await connection.close();
    }
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await connection.initialize();
      expect(connection.isConnected()).toBe(true);
    });

    it('should throw error if initialization fails', async () => {
      // Mock levelgraph to throw error
      const mockLevelgraph = require('levelgraph');
      mockLevelgraph.mockImplementation(() => {
        throw new Error('Database init failed');
      });

      await expect(connection.initialize()).rejects.toThrow('Failed to initialize database connection');
    });

    it('should not initialize twice', async () => {
      await connection.initialize();
      await connection.initialize(); // Should not throw
      expect(connection.isConnected()).toBe(true);
    });
  });

  describe('database operations', () => {
    beforeEach(async () => {
      await connection.initialize();
    });

    it('should get database instance when connected', () => {
      const db = connection.getDatabase();
      expect(db).toBeDefined();
    });

    it('should throw error when getting database if not connected', async () => {
      await connection.close();
      expect(() => connection.getDatabase()).toThrow('Database not initialized');
    });

    it('should perform health check', async () => {
      const isHealthy = await connection.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return connection status', async () => {
      const status = await connection.getStatus();
      expect(status).toEqual({
        connected: true,
        browser: 'chrome',
        config: expect.objectContaining({
          name: 'test-db'
        }),
        stats: expect.any(Object)
      });
    });
  });

  describe('backup and restore', () => {
    beforeEach(async () => {
      await connection.initialize();
    });

    it('should create backup', async () => {
      const backup = await connection.backup();
      const parsed = JSON.parse(backup);
      
      expect(parsed).toEqual({
        version: '1.0',
        timestamp: expect.any(Number),
        browser: 'chrome',
        tripleCount: 0,
        data: []
      });
    });

    it('should restore from backup', async () => {
      const backupData = JSON.stringify({
        version: '1.0',
        timestamp: Date.now(),
        browser: 'chrome',
        tripleCount: 2,
        data: [
          { subject: 'test1', predicate: 'type', object: 'Page' },
          { subject: 'test1', predicate: 'url', object: 'https://example.com' }
        ]
      });

      await expect(connection.restore(backupData)).resolves.not.toThrow();
    });

    it('should throw error for invalid backup format', async () => {
      const invalidBackup = 'invalid json';
      await expect(connection.restore(invalidBackup)).rejects.toThrow('Failed to restore database from backup');
    });
  });

  describe('connection lifecycle', () => {
    it('should close connection successfully', async () => {
      await connection.initialize();
      expect(connection.isConnected()).toBe(true);

      await connection.close();
      expect(connection.isConnected()).toBe(false);
    });

    it('should handle close when not connected', async () => {
      await expect(connection.close()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await connection.initialize();
    });

    it('should handle database errors gracefully', async () => {
      // Mock database to throw error
      const db = connection.getDatabase();
      const originalGet = db.get;
      db.get = jest.fn((query, callback) => {
        callback(new Error('Database error'));
      });

      const isHealthy = await connection.healthCheck();
      expect(isHealthy).toBe(false);

      // Restore original method
      db.get = originalGet;
    });
  });
});