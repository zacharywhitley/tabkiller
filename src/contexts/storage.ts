import { storage } from '../utils/cross-browser';
import { StoragePersistence, StorageError, StorageKey } from './types';

/**
 * Storage keys used across the application
 */
export const STORAGE_KEYS: StorageKey = {
  TABS: 'tabkiller:tabs',
  SESSIONS: 'tabkiller:sessions',
  SETTINGS: 'tabkiller:settings',
  UI_STATE: 'tabkiller:ui_state',
  SESSION_TAGS: 'tabkiller:session_tags',
  RECENT_TABS: 'tabkiller:recent_tabs',
  CLOSED_TABS: 'tabkiller:closed_tabs'
} as const;

/**
 * Default storage implementation using the cross-browser adapter
 */
class CrossBrowserStoragePersistence implements StoragePersistence {
  async get<T>(key: string): Promise<T | null> {
    try {
      const result = await storage.get(key);
      return result[key] ?? null;
    } catch (error) {
      throw new StorageError('get', key, error as Error);
    }
  }

  async set(key: string, data: any): Promise<void> {
    try {
      await storage.set({ [key]: data });
    } catch (error) {
      throw new StorageError('set', key, error as Error);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await storage.remove(key);
    } catch (error) {
      throw new StorageError('remove', key, error as Error);
    }
  }

  async clear(): Promise<void> {
    try {
      await storage.clear();
    } catch (error) {
      throw new StorageError('clear', undefined, error as Error);
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const result = await storage.get(key);
      return key in result;
    } catch (error) {
      throw new StorageError('has', key, error as Error);
    }
  }

  async keys(): Promise<string[]> {
    try {
      // Unfortunately, browser storage API doesn't provide a keys() method
      // We'll need to maintain a keys registry or use a different approach
      const allData = await storage.get(null);
      return Object.keys(allData || {});
    } catch (error) {
      throw new StorageError('keys', undefined, error as Error);
    }
  }

  async size(): Promise<number> {
    try {
      const keys = await this.keys();
      return keys.length;
    } catch (error) {
      throw new StorageError('size', undefined, error as Error);
    }
  }
}

/**
 * In-memory storage implementation for testing and fallback
 */
class MemoryStoragePersistence implements StoragePersistence {
  private data = new Map<string, any>();

  async get<T>(key: string): Promise<T | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, data: any): Promise<void> {
    this.data.set(key, data);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  async has(key: string): Promise<boolean> {
    return this.data.has(key);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.data.keys());
  }

  async size(): Promise<number> {
    return this.data.size;
  }
}

/**
 * Storage persistence implementation with compression and encryption support
 */
class EnhancedStoragePersistence implements StoragePersistence {
  private baseStorage: StoragePersistence;
  private compressionEnabled: boolean;
  private encryptionEnabled: boolean;

  constructor(
    baseStorage: StoragePersistence,
    options: {
      compressionEnabled?: boolean;
      encryptionEnabled?: boolean;
    } = {}
  ) {
    this.baseStorage = baseStorage;
    this.compressionEnabled = options.compressionEnabled ?? false;
    this.encryptionEnabled = options.encryptionEnabled ?? false;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      let data = await this.baseStorage.get<any>(key);
      
      if (data === null) {
        return null;
      }

      // Decompress if needed
      if (this.compressionEnabled && data.__compressed) {
        data = await this.decompress(data.data);
      }

      // Decrypt if needed
      if (this.encryptionEnabled && data.__encrypted) {
        data = await this.decrypt(data.data);
      }

      return data;
    } catch (error) {
      throw new StorageError('get', key, error as Error);
    }
  }

  async set(key: string, data: any): Promise<void> {
    try {
      let processedData = data;

      // Encrypt if needed
      if (this.encryptionEnabled) {
        processedData = {
          __encrypted: true,
          data: await this.encrypt(processedData)
        };
      }

      // Compress if needed
      if (this.compressionEnabled) {
        processedData = {
          __compressed: true,
          data: await this.compress(processedData)
        };
      }

      await this.baseStorage.set(key, processedData);
    } catch (error) {
      throw new StorageError('set', key, error as Error);
    }
  }

  async remove(key: string): Promise<void> {
    return this.baseStorage.remove(key);
  }

  async clear(): Promise<void> {
    return this.baseStorage.clear();
  }

  async has(key: string): Promise<boolean> {
    return this.baseStorage.has(key);
  }

  async keys(): Promise<string[]> {
    return this.baseStorage.keys();
  }

  async size(): Promise<number> {
    return this.baseStorage.size();
  }

  private async compress(data: any): Promise<string> {
    // Simple JSON compression - in a real implementation, you might use
    // a proper compression library like pako or lz-string
    return JSON.stringify(data);
  }

  private async decompress(data: string): Promise<any> {
    return JSON.parse(data);
  }

  private async encrypt(data: any): Promise<string> {
    // Placeholder for encryption - in a real implementation, you would
    // use the crypto utilities from the existing codebase
    return btoa(JSON.stringify(data));
  }

  private async decrypt(data: string): Promise<any> {
    // Placeholder for decryption
    return JSON.parse(atob(data));
  }
}

/**
 * Storage manager that provides a unified interface for all storage operations
 */
export class StorageManager {
  private storage: StoragePersistence;
  private static instance: StorageManager | null = null;

  constructor(
    storage?: StoragePersistence,
    options: {
      compressionEnabled?: boolean;
      encryptionEnabled?: boolean;
    } = {}
  ) {
    const baseStorage = storage || new CrossBrowserStoragePersistence();
    
    if (options.compressionEnabled || options.encryptionEnabled) {
      this.storage = new EnhancedStoragePersistence(baseStorage, options);
    } else {
      this.storage = baseStorage;
    }
  }

  static getInstance(
    storage?: StoragePersistence,
    options?: {
      compressionEnabled?: boolean;
      encryptionEnabled?: boolean;
    }
  ): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager(storage, options);
    }
    return StorageManager.instance;
  }

  // Storage operations with type safety
  async getTabs(): Promise<any> {
    return this.storage.get(STORAGE_KEYS.TABS);
  }

  async setTabs(tabs: any): Promise<void> {
    return this.storage.set(STORAGE_KEYS.TABS, tabs);
  }

  async getSessions(): Promise<any> {
    return this.storage.get(STORAGE_KEYS.SESSIONS);
  }

  async setSessions(sessions: any): Promise<void> {
    return this.storage.set(STORAGE_KEYS.SESSIONS, sessions);
  }

  async getSettings(): Promise<any> {
    return this.storage.get(STORAGE_KEYS.SETTINGS);
  }

  async setSettings(settings: any): Promise<void> {
    return this.storage.set(STORAGE_KEYS.SETTINGS, settings);
  }

  async getUIState(): Promise<any> {
    return this.storage.get(STORAGE_KEYS.UI_STATE);
  }

  async setUIState(uiState: any): Promise<void> {
    return this.storage.set(STORAGE_KEYS.UI_STATE, uiState);
  }

  async getSessionTags(): Promise<any> {
    return this.storage.get(STORAGE_KEYS.SESSION_TAGS);
  }

  async setSessionTags(tags: any): Promise<void> {
    return this.storage.set(STORAGE_KEYS.SESSION_TAGS, tags);
  }

  async getRecentTabs(): Promise<any> {
    return this.storage.get(STORAGE_KEYS.RECENT_TABS);
  }

  async setRecentTabs(tabs: any): Promise<void> {
    return this.storage.set(STORAGE_KEYS.RECENT_TABS, tabs);
  }

  async getClosedTabs(): Promise<any> {
    return this.storage.get(STORAGE_KEYS.CLOSED_TABS);
  }

  async setClosedTabs(tabs: any): Promise<void> {
    return this.storage.set(STORAGE_KEYS.CLOSED_TABS, tabs);
  }

  // Generic storage operations
  async get<T>(key: string): Promise<T | null> {
    return this.storage.get<T>(key);
  }

  async set(key: string, data: any): Promise<void> {
    return this.storage.set(key, data);
  }

  async remove(key: string): Promise<void> {
    return this.storage.remove(key);
  }

  async clear(): Promise<void> {
    return this.storage.clear();
  }

  async has(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  async keys(): Promise<string[]> {
    return this.storage.keys();
  }

  async size(): Promise<number> {
    return this.storage.size();
  }

  // Bulk operations
  async getMultiple(keys: string[]): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    
    await Promise.all(
      keys.map(async (key) => {
        results[key] = await this.storage.get(key);
      })
    );

    return results;
  }

  async setMultiple(data: Record<string, any>): Promise<void> {
    await Promise.all(
      Object.entries(data).map(([key, value]) => 
        this.storage.set(key, value)
      )
    );
  }

  async removeMultiple(keys: string[]): Promise<void> {
    await Promise.all(
      keys.map(key => this.storage.remove(key))
    );
  }

  // Utility methods
  async backup(): Promise<Record<string, any>> {
    const keys = await this.keys();
    return this.getMultiple(keys);
  }

  async restore(data: Record<string, any>): Promise<void> {
    await this.clear();
    await this.setMultiple(data);
  }

  // Create a memory-based storage for testing
  static createMemoryStorage(): StorageManager {
    return new StorageManager(new MemoryStoragePersistence());
  }
}

// Export default storage manager instance
export const storageManager = StorageManager.getInstance();