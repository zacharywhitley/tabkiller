/**
 * Secure key storage and management system for TabKiller
 * Provides encrypted key storage using browser extension secure storage APIs
 */

import {
  KeyStorage,
  EncryptedData,
  CryptoError,
  CryptoErrorType,
  SecureBuffer
} from './types';
import {
  generateRandomBytes,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  stringToArrayBuffer,
  arrayBufferToString,
  deriveKeyPBKDF2,
  constantTimeCompare,
  MemoryUtils,
  SecureBufferImpl,
  AutoCleanup
} from './utils';
import { WebCryptoEncryptionService } from './encryption';

/**
 * Key storage configuration
 */
export interface KeyStorageConfig {
  /** Storage area to use (local, sync, managed) */
  storageArea: 'local' | 'sync' | 'managed';
  /** Master password for key encryption */
  masterPassword?: string;
  /** PBKDF2 iterations for key encryption */
  keyDerivationIterations: number;
  /** Enable automatic key rotation */
  enableKeyRotation: boolean;
  /** Key rotation interval in milliseconds */
  keyRotationInterval: number;
  /** Maximum number of keys to store */
  maxKeys: number;
}

/**
 * Default key storage configuration
 */
export const DEFAULT_KEY_STORAGE_CONFIG: KeyStorageConfig = {
  storageArea: 'local',
  keyDerivationIterations: 100000,
  enableKeyRotation: false,
  keyRotationInterval: 30 * 24 * 60 * 60 * 1000, // 30 days
  maxKeys: 100
};

/**
 * Stored key metadata
 */
interface StoredKeyMetadata {
  /** Key identifier */
  keyId: string;
  /** Key type/purpose */
  keyType: string;
  /** Creation timestamp */
  created: number;
  /** Last used timestamp */
  lastUsed: number;
  /** Expiration timestamp */
  expires?: number;
  /** Key version for rotation */
  version: number;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Encrypted key storage entry
 */
interface StoredKeyEntry {
  /** Encrypted key data */
  encryptedKey: EncryptedData;
  /** Key metadata */
  metadata: StoredKeyMetadata;
  /** Integrity hash */
  integrityHash: string;
}

/**
 * Key storage implementation using browser extension storage
 */
export class SecureKeyStorage implements KeyStorage {
  private config: KeyStorageConfig;
  private encryptionService: WebCryptoEncryptionService;
  private storageKeyCache = new Map<string, CryptoKey>();
  private initialized = false;
  private masterKey?: CryptoKey;

  constructor(config: Partial<KeyStorageConfig> = {}) {
    this.config = { ...DEFAULT_KEY_STORAGE_CONFIG, ...config };
    this.encryptionService = new WebCryptoEncryptionService();
  }

  /**
   * Initialize the key storage with master password
   */
  async initialize(masterPassword?: string): Promise<void> {
    try {
      const password = masterPassword || this.config.masterPassword;
      if (!password) {
        throw new CryptoError(
          CryptoErrorType.INVALID_KEY,
          'Master password is required for key storage initialization'
        );
      }

      // Derive master key for storage encryption
      const salt = await this.getOrCreateStorageSalt();
      const derivedKey = await this.encryptionService.deriveKey(password, salt);
      this.masterKey = derivedKey.key;

      this.initialized = true;

      // Setup automatic cleanup
      this.scheduleCleanup();
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.STORAGE_ERROR,
        'Failed to initialize key storage',
        error as Error
      );
    }
  }

  /**
   * Store a key securely
   */
  async storeKey(keyId: string, keyData: ArrayBuffer, metadata?: any): Promise<void> {
    this.ensureInitialized();

    const cleanup = new AutoCleanup();
    
    try {
      cleanup.addBuffer(keyData);

      // Check storage limits
      await this.enforceStorageLimits();

      // Create key metadata
      const keyMetadata: StoredKeyMetadata = {
        keyId,
        keyType: metadata?.keyType || 'unknown',
        created: Date.now(),
        lastUsed: Date.now(),
        version: 1,
        metadata: metadata || {}
      };

      // Encrypt the key data
      const encryptedKey = await this.encryptionService.encrypt(keyData, this.masterKey!);

      // Create integrity hash
      const integrityHash = await this.createIntegrityHash(keyData, keyMetadata);

      // Create storage entry
      const entry: StoredKeyEntry = {
        encryptedKey,
        metadata: keyMetadata,
        integrityHash
      };

      // Store in browser extension storage
      await this.storeToExtensionStorage(`key_${keyId}`, entry);

      // Update index
      await this.updateKeyIndex(keyId, keyMetadata);
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.STORAGE_ERROR,
        `Failed to store key: ${keyId}`,
        error as Error
      );
    } finally {
      cleanup.cleanup();
    }
  }

  /**
   * Retrieve a key
   */
  async retrieveKey(keyId: string): Promise<ArrayBuffer | null> {
    this.ensureInitialized();

    try {
      // Get from extension storage
      const entry = await this.getFromExtensionStorage<StoredKeyEntry>(`key_${keyId}`);
      
      if (!entry) {
        return null;
      }

      // Decrypt key data
      const decryptedBuffer = await this.encryptionService.decrypt(
        entry.encryptedKey, 
        this.masterKey!
      );

      // Verify integrity
      const isValid = await this.verifyIntegrityHash(
        decryptedBuffer, 
        entry.metadata, 
        entry.integrityHash
      );

      if (!isValid) {
        throw new CryptoError(
          CryptoErrorType.STORAGE_ERROR,
          `Key integrity verification failed: ${keyId}`
        );
      }

      // Update last used timestamp
      entry.metadata.lastUsed = Date.now();
      await this.storeToExtensionStorage(`key_${keyId}`, entry);

      return decryptedBuffer;
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.STORAGE_ERROR,
        `Failed to retrieve key: ${keyId}`,
        error as Error
      );
    }
  }

  /**
   * Delete a key
   */
  async deleteKey(keyId: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      // Remove from extension storage
      await this.removeFromExtensionStorage(`key_${keyId}`);
      
      // Remove from index
      await this.removeFromKeyIndex(keyId);
      
      // Clear from cache
      this.storageKeyCache.delete(keyId);

      return true;
    } catch (error) {
      console.warn(`Failed to delete key ${keyId}:`, error);
      return false;
    }
  }

  /**
   * List stored key IDs
   */
  async listKeys(): Promise<string[]> {
    this.ensureInitialized();

    try {
      const index = await this.getKeyIndex();
      return Object.keys(index);
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.STORAGE_ERROR,
        'Failed to list keys',
        error as Error
      );
    }
  }

  /**
   * Clear all stored keys
   */
  async clearAll(): Promise<void> {
    this.ensureInitialized();

    try {
      const keyIds = await this.listKeys();
      
      // Delete all keys
      for (const keyId of keyIds) {
        await this.deleteKey(keyId);
      }

      // Clear index
      await this.clearKeyIndex();
      
      // Clear cache
      this.storageKeyCache.clear();
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.STORAGE_ERROR,
        'Failed to clear all keys',
        error as Error
      );
    }
  }

  /**
   * Get key metadata
   */
  async getKeyMetadata(keyId: string): Promise<StoredKeyMetadata | null> {
    this.ensureInitialized();

    try {
      const entry = await this.getFromExtensionStorage<StoredKeyEntry>(`key_${keyId}`);
      return entry?.metadata || null;
    } catch (error) {
      console.warn(`Failed to get metadata for key ${keyId}:`, error);
      return null;
    }
  }

  /**
   * Update key metadata
   */
  async updateKeyMetadata(keyId: string, metadata: Partial<StoredKeyMetadata>): Promise<void> {
    this.ensureInitialized();

    try {
      const entry = await this.getFromExtensionStorage<StoredKeyEntry>(`key_${keyId}`);
      
      if (!entry) {
        throw new CryptoError(
          CryptoErrorType.STORAGE_ERROR,
          `Key not found: ${keyId}`
        );
      }

      // Update metadata
      entry.metadata = { ...entry.metadata, ...metadata };
      
      // Store updated entry
      await this.storeToExtensionStorage(`key_${keyId}`, entry);
      
      // Update index
      await this.updateKeyIndex(keyId, entry.metadata);
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.STORAGE_ERROR,
        `Failed to update metadata for key: ${keyId}`,
        error as Error
      );
    }
  }

  /**
   * Export keys for backup (encrypted)
   */
  async exportKeys(exportPassword: string): Promise<string> {
    this.ensureInitialized();

    const cleanup = new AutoCleanup();

    try {
      const keyIds = await this.listKeys();
      const exportData: Record<string, any> = {};

      for (const keyId of keyIds) {
        const entry = await this.getFromExtensionStorage<StoredKeyEntry>(`key_${keyId}`);
        if (entry) {
          exportData[keyId] = entry;
        }
      }

      // Encrypt export data with export password
      const exportKey = await this.encryptionService.deriveKey(
        exportPassword,
        generateRandomBytes(32)
      );
      cleanup.addSecureBuffer(new SecureBufferImpl(exportPassword));

      const encryptedExport = await this.encryptionService.encrypt(
        JSON.stringify(exportData),
        exportKey.key
      );

      return JSON.stringify({
        version: '1.0.0',
        timestamp: Date.now(),
        data: encryptedExport
      });
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.STORAGE_ERROR,
        'Failed to export keys',
        error as Error
      );
    } finally {
      cleanup.cleanup();
    }
  }

  /**
   * Import keys from backup
   */
  async importKeys(exportData: string, exportPassword: string): Promise<number> {
    this.ensureInitialized();

    const cleanup = new AutoCleanup();

    try {
      const parsed = JSON.parse(exportData);
      cleanup.addSecureBuffer(new SecureBufferImpl(exportPassword));

      // Decrypt export data
      const exportKey = await this.encryptionService.deriveKey(
        exportPassword,
        base64ToArrayBuffer(parsed.data.salt)
      );

      const decryptedData = await this.encryptionService.decrypt(
        parsed.data,
        exportKey.key
      );

      const keyData = JSON.parse(arrayBufferToString(decryptedData));
      let importedCount = 0;

      // Import each key
      for (const [keyId, entry] of Object.entries(keyData)) {
        try {
          await this.storeToExtensionStorage(`key_${keyId}`, entry);
          await this.updateKeyIndex(keyId, (entry as StoredKeyEntry).metadata);
          importedCount++;
        } catch (error) {
          console.warn(`Failed to import key ${keyId}:`, error);
        }
      }

      return importedCount;
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.STORAGE_ERROR,
        'Failed to import keys',
        error as Error
      );
    } finally {
      cleanup.cleanup();
    }
  }

  /**
   * Rotate storage encryption key
   */
  async rotateStorageKey(newMasterPassword: string): Promise<void> {
    this.ensureInitialized();

    try {
      // Get all stored keys
      const keyIds = await this.listKeys();
      const keyData = new Map<string, ArrayBuffer>();

      // Decrypt all keys with current master key
      for (const keyId of keyIds) {
        const data = await this.retrieveKey(keyId);
        if (data) {
          keyData.set(keyId, data);
        }
      }

      // Derive new master key
      const salt = generateRandomBytes(32);
      const newDerivedKey = await this.encryptionService.deriveKey(newMasterPassword, salt);
      
      // Update master key
      this.masterKey = newDerivedKey.key;

      // Re-encrypt all keys with new master key
      for (const [keyId, data] of keyData) {
        const metadata = await this.getKeyMetadata(keyId);
        if (metadata) {
          metadata.version += 1;
          await this.storeKey(keyId, data, metadata);
        }
      }

      // Update storage salt
      await this.storeToExtensionStorage('storage_salt', arrayBufferToBase64(salt));
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.STORAGE_ERROR,
        'Failed to rotate storage key',
        error as Error
      );
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    keyCount: number;
    totalSize: number;
    oldestKey: number;
    newestKey: number;
  }> {
    this.ensureInitialized();

    try {
      const index = await this.getKeyIndex();
      const keyIds = Object.keys(index);

      let totalSize = 0;
      let oldestKey = Date.now();
      let newestKey = 0;

      for (const keyId of keyIds) {
        const entry = await this.getFromExtensionStorage<StoredKeyEntry>(`key_${keyId}`);
        if (entry) {
          const entrySize = JSON.stringify(entry).length;
          totalSize += entrySize;
          
          if (entry.metadata.created < oldestKey) {
            oldestKey = entry.metadata.created;
          }
          
          if (entry.metadata.created > newestKey) {
            newestKey = entry.metadata.created;
          }
        }
      }

      return {
        keyCount: keyIds.length,
        totalSize,
        oldestKey: keyIds.length > 0 ? oldestKey : 0,
        newestKey: keyIds.length > 0 ? newestKey : 0
      };
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.STORAGE_ERROR,
        'Failed to get storage stats',
        error as Error
      );
    }
  }

  // Private helper methods

  private ensureInitialized(): void {
    if (!this.initialized || !this.masterKey) {
      throw new CryptoError(
        CryptoErrorType.STORAGE_ERROR,
        'Key storage not initialized'
      );
    }
  }

  private async getOrCreateStorageSalt(): Promise<Uint8Array> {
    try {
      const stored = await this.getFromExtensionStorage<string>('storage_salt');
      
      if (stored) {
        return new Uint8Array(base64ToArrayBuffer(stored));
      }

      // Generate new salt
      const salt = generateRandomBytes(32);
      await this.storeToExtensionStorage('storage_salt', arrayBufferToBase64(salt));
      return salt;
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.STORAGE_ERROR,
        'Failed to get or create storage salt',
        error as Error
      );
    }
  }

  private async createIntegrityHash(
    keyData: ArrayBuffer, 
    metadata: StoredKeyMetadata
  ): Promise<string> {
    const combined = JSON.stringify(metadata) + arrayBufferToBase64(keyData);
    const hash = await crypto.subtle.digest('SHA-256', stringToArrayBuffer(combined));
    return arrayBufferToBase64(hash);
  }

  private async verifyIntegrityHash(
    keyData: ArrayBuffer, 
    metadata: StoredKeyMetadata, 
    expectedHash: string
  ): Promise<boolean> {
    const actualHash = await this.createIntegrityHash(keyData, metadata);
    const expectedBuffer = base64ToArrayBuffer(expectedHash);
    const actualBuffer = base64ToArrayBuffer(actualHash);
    return constantTimeCompare(expectedBuffer, actualBuffer);
  }

  private async storeToExtensionStorage(key: string, value: any): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage[this.config.storageArea].set({ [key]: value });
    } else {
      // Fallback to localStorage for testing
      localStorage.setItem(key, JSON.stringify(value));
    }
  }

  private async getFromExtensionStorage<T>(key: string): Promise<T | null> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage[this.config.storageArea].get(key);
      return result[key] || null;
    } else {
      // Fallback to localStorage for testing
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    }
  }

  private async removeFromExtensionStorage(key: string): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage[this.config.storageArea].remove(key);
    } else {
      // Fallback to localStorage for testing
      localStorage.removeItem(key);
    }
  }

  private async getKeyIndex(): Promise<Record<string, StoredKeyMetadata>> {
    const index = await this.getFromExtensionStorage<Record<string, StoredKeyMetadata>>('key_index');
    return index || {};
  }

  private async updateKeyIndex(keyId: string, metadata: StoredKeyMetadata): Promise<void> {
    const index = await this.getKeyIndex();
    index[keyId] = metadata;
    await this.storeToExtensionStorage('key_index', index);
  }

  private async removeFromKeyIndex(keyId: string): Promise<void> {
    const index = await this.getKeyIndex();
    delete index[keyId];
    await this.storeToExtensionStorage('key_index', index);
  }

  private async clearKeyIndex(): Promise<void> {
    await this.storeToExtensionStorage('key_index', {});
  }

  private async enforceStorageLimits(): Promise<void> {
    const stats = await this.getStorageStats();
    
    if (stats.keyCount >= this.config.maxKeys) {
      // Remove oldest keys to make room
      const index = await this.getKeyIndex();
      const keyIds = Object.keys(index).sort((a, b) => 
        index[a].lastUsed - index[b].lastUsed
      );

      const toRemove = keyIds.slice(0, Math.floor(this.config.maxKeys * 0.1));
      
      for (const keyId of toRemove) {
        await this.deleteKey(keyId);
      }
    }
  }

  private scheduleCleanup(): void {
    // Schedule periodic cleanup of expired keys
    setInterval(() => {
      this.cleanupExpiredKeys().catch(error => {
        console.warn('Key cleanup failed:', error);
      });
    }, 60 * 60 * 1000); // Every hour
  }

  private async cleanupExpiredKeys(): Promise<void> {
    try {
      const index = await this.getKeyIndex();
      const now = Date.now();

      for (const [keyId, metadata] of Object.entries(index)) {
        if (metadata.expires && metadata.expires < now) {
          await this.deleteKey(keyId);
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup expired keys:', error);
    }
  }
}

/**
 * Key management utilities
 */
export class KeyManager {
  private keyStorage: SecureKeyStorage;
  private keyCache = new Map<string, { key: CryptoKey; expires: number }>();

  constructor(keyStorage: SecureKeyStorage) {
    this.keyStorage = keyStorage;
  }

  /**
   * Generate and store a new encryption key
   */
  async generateAndStoreKey(
    keyId: string, 
    keyType: string,
    metadata?: Record<string, any>
  ): Promise<CryptoKey> {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true, // Extractable for storage
      ['encrypt', 'decrypt']
    );

    const keyData = await crypto.subtle.exportKey('raw', key);
    
    await this.keyStorage.storeKey(keyId, keyData, {
      keyType,
      ...metadata
    });

    return key;
  }

  /**
   * Retrieve and import a stored key
   */
  async retrieveKey(keyId: string): Promise<CryptoKey | null> {
    // Check cache first
    const cached = this.keyCache.get(keyId);
    if (cached && cached.expires > Date.now()) {
      return cached.key;
    }

    // Retrieve from storage
    const keyData = await this.keyStorage.retrieveKey(keyId);
    if (!keyData) {
      return null;
    }

    // Import key
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    // Cache for future use
    this.keyCache.set(keyId, {
      key,
      expires: Date.now() + 300000 // 5 minutes
    });

    return key;
  }

  /**
   * Rotate a stored key
   */
  async rotateKey(keyId: string): Promise<CryptoKey> {
    const metadata = await this.keyStorage.getKeyMetadata(keyId);
    if (!metadata) {
      throw new CryptoError(
        CryptoErrorType.STORAGE_ERROR,
        `Key not found: ${keyId}`
      );
    }

    // Generate new key
    const newKey = await this.generateAndStoreKey(
      keyId,
      metadata.keyType,
      { ...metadata.metadata, rotated: Date.now() }
    );

    // Clear cache
    this.keyCache.delete(keyId);

    return newKey;
  }

  /**
   * Clear key cache
   */
  clearCache(): void {
    this.keyCache.clear();
  }
}