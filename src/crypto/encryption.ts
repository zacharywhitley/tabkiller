/**
 * Advanced Web Crypto API-based encryption service for TabKiller
 * Provides AES-GCM encryption, PBKDF2 key derivation, and secure key management
 */

import {
  EncryptedData,
  EncryptionAlgorithm,
  KeyDerivationFunction,
  EncryptionConfig,
  DerivedKey,
  CryptoError,
  CryptoErrorType
} from './types';
import {
  isWebCryptoSupported,
  generateRandomBytes,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  stringToArrayBuffer,
  arrayBufferToString,
  constantTimeCompare,
  deriveKeyPBKDF2,
  generateAESKey,
  MemoryUtils,
  AutoCleanup
} from './utils';

/**
 * Default encryption configuration optimized for security and performance
 */
export const DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig = {
  algorithm: EncryptionAlgorithm.AES_GCM,
  keySize: 32, // 256 bits
  ivLength: 12, // 96 bits for AES-GCM
  saltLength: 32, // 256 bits
  keyDerivationIterations: 100000, // OWASP recommended minimum
  version: '1.0.0'
};

/**
 * Advanced encryption service using Web Crypto API
 */
export class WebCryptoEncryptionService {
  private config: EncryptionConfig;
  private keyCache = new Map<string, CryptoKey>();
  private sessionKeys = new Map<string, { key: CryptoKey; expires: number }>();

  constructor(config: Partial<EncryptionConfig> = {}) {
    if (!isWebCryptoSupported()) {
      throw new CryptoError(
        CryptoErrorType.UNSUPPORTED_ALGORITHM,
        'Web Crypto API is not supported in this environment'
      );
    }

    this.config = { ...DEFAULT_ENCRYPTION_CONFIG, ...config };
  }

  /**
   * Encrypt data using AES-GCM with authenticated encryption
   */
  async encrypt(data: string | ArrayBuffer, key: CryptoKey): Promise<EncryptedData> {
    const cleanup = new AutoCleanup();

    try {
      // Convert string data to ArrayBuffer
      const dataBuffer = typeof data === 'string' 
        ? stringToArrayBuffer(data) 
        : data;
      cleanup.addBuffer(dataBuffer);

      // Generate cryptographically secure IV
      const iv = generateRandomBytes(this.config.ivLength);
      cleanup.addBuffer(iv.buffer);

      // Generate salt for this encryption operation
      const salt = generateRandomBytes(this.config.saltLength);
      cleanup.addBuffer(salt.buffer);

      // Perform AES-GCM encryption
      const encrypted = await crypto.subtle.encrypt(
        {
          name: this.config.algorithm,
          iv: iv
        },
        key,
        dataBuffer
      );

      const encryptedData: EncryptedData = {
        data: arrayBufferToBase64(encrypted),
        iv: arrayBufferToBase64(iv),
        salt: arrayBufferToBase64(salt),
        algorithm: this.config.algorithm,
        kdf: KeyDerivationFunction.PBKDF2,
        iterations: this.config.keyDerivationIterations,
        version: this.config.version,
        timestamp: Date.now()
      };

      return encryptedData;
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.ENCRYPTION_FAILED,
        'AES-GCM encryption failed',
        error as Error
      );
    } finally {
      cleanup.cleanup();
    }
  }

  /**
   * Decrypt data using AES-GCM with authentication verification
   */
  async decrypt(encryptedData: EncryptedData, key: CryptoKey): Promise<ArrayBuffer> {
    const cleanup = new AutoCleanup();

    try {
      // Validate encrypted data format
      this.validateEncryptedData(encryptedData);

      // Parse IV and encrypted data
      const iv = base64ToArrayBuffer(encryptedData.iv);
      const data = base64ToArrayBuffer(encryptedData.data);
      cleanup.addBuffer(iv);
      cleanup.addBuffer(data);

      // Perform AES-GCM decryption with authentication
      const decrypted = await crypto.subtle.decrypt(
        {
          name: encryptedData.algorithm,
          iv: iv
        },
        key,
        data
      );

      return decrypted;
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.DECRYPTION_FAILED,
        'AES-GCM decryption failed - data may be corrupted or key invalid',
        error as Error
      );
    } finally {
      cleanup.cleanup();
    }
  }

  /**
   * Derive encryption key from password using PBKDF2
   */
  async deriveKey(password: string, salt?: Uint8Array): Promise<DerivedKey> {
    const cleanup = new AutoCleanup();

    try {
      // Generate salt if not provided
      const derivationSalt = salt || generateRandomBytes(this.config.saltLength);
      cleanup.addBuffer(derivationSalt.buffer);

      // Derive key using PBKDF2
      const key = await deriveKeyPBKDF2(
        password,
        derivationSalt,
        this.config.keyDerivationIterations,
        this.config.keySize
      );

      return {
        key,
        salt: derivationSalt,
        iterations: this.config.keyDerivationIterations,
        algorithm: 'PBKDF2'
      };
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.KEY_DERIVATION_FAILED,
        'PBKDF2 key derivation failed',
        error as Error
      );
    } finally {
      cleanup.cleanup();
    }
  }

  /**
   * Generate a new encryption key
   */
  async generateKey(): Promise<CryptoKey> {
    try {
      return await generateAESKey(this.config.keySize * 8 as 256);
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.KEY_DERIVATION_FAILED,
        'Encryption key generation failed',
        error as Error
      );
    }
  }

  /**
   * Encrypt string data and return as string
   */
  async encryptString(data: string, key: CryptoKey): Promise<string> {
    const encrypted = await this.encrypt(data, key);
    return JSON.stringify(encrypted);
  }

  /**
   * Decrypt string data from encrypted string format
   */
  async decryptString(encryptedString: string, key: CryptoKey): Promise<string> {
    try {
      const encryptedData: EncryptedData = JSON.parse(encryptedString);
      const decrypted = await this.decrypt(encryptedData, key);
      return arrayBufferToString(decrypted);
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.DECRYPTION_FAILED,
        'String decryption failed',
        error as Error
      );
    }
  }

  /**
   * Cache a key with expiration
   */
  cacheKey(keyId: string, key: CryptoKey, ttlMs: number = 3600000): void {
    this.sessionKeys.set(keyId, {
      key,
      expires: Date.now() + ttlMs
    });

    // Clean up expired keys
    this.cleanupExpiredKeys();
  }

  /**
   * Retrieve a cached key
   */
  getCachedKey(keyId: string): CryptoKey | null {
    const cached = this.sessionKeys.get(keyId);
    
    if (!cached || cached.expires < Date.now()) {
      this.sessionKeys.delete(keyId);
      return null;
    }

    return cached.key;
  }

  /**
   * Clear all cached keys
   */
  clearKeyCache(): void {
    this.sessionKeys.clear();
    this.keyCache.clear();
  }

  /**
   * Rotate encryption key (re-encrypt with new key)
   */
  async rotateKey(
    encryptedData: EncryptedData,
    oldKey: CryptoKey,
    newKey: CryptoKey
  ): Promise<EncryptedData> {
    try {
      // Decrypt with old key
      const plaintext = await this.decrypt(encryptedData, oldKey);
      
      // Encrypt with new key
      return await this.encrypt(plaintext, newKey);
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.ENCRYPTION_FAILED,
        'Key rotation failed',
        error as Error
      );
    }
  }

  /**
   * Batch encrypt multiple data items
   */
  async encryptBatch(
    items: Array<{ id: string; data: string }>,
    key: CryptoKey
  ): Promise<Array<{ id: string; encrypted: EncryptedData }>> {
    const results: Array<{ id: string; encrypted: EncryptedData }> = [];
    
    for (const item of items) {
      try {
        const encrypted = await this.encrypt(item.data, key);
        results.push({ id: item.id, encrypted });
      } catch (error) {
        console.warn(`Failed to encrypt item ${item.id}:`, error);
        throw error;
      }
    }

    return results;
  }

  /**
   * Batch decrypt multiple data items
   */
  async decryptBatch(
    items: Array<{ id: string; encrypted: EncryptedData }>,
    key: CryptoKey
  ): Promise<Array<{ id: string; data: string }>> {
    const results: Array<{ id: string; data: string }> = [];
    
    for (const item of items) {
      try {
        const decrypted = await this.decrypt(item.encrypted, key);
        const data = arrayBufferToString(decrypted);
        results.push({ id: item.id, data });
      } catch (error) {
        console.warn(`Failed to decrypt item ${item.id}:`, error);
        throw error;
      }
    }

    return results;
  }

  /**
   * Get encryption configuration
   */
  getConfig(): EncryptionConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (requires re-initialization)
   */
  updateConfig(newConfig: Partial<EncryptionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.clearKeyCache(); // Clear cache as config changed
  }

  // Private helper methods

  /**
   * Validate encrypted data structure
   */
  private validateEncryptedData(data: EncryptedData): void {
    const required = ['data', 'iv', 'salt', 'algorithm', 'kdf', 'iterations', 'version'];
    
    for (const field of required) {
      if (!(field in data) || data[field as keyof EncryptedData] == null) {
        throw new CryptoError(
          CryptoErrorType.INVALID_DATA,
          `Missing required field: ${field}`
        );
      }
    }

    // Validate algorithm compatibility
    if (data.algorithm !== this.config.algorithm) {
      throw new CryptoError(
        CryptoErrorType.UNSUPPORTED_ALGORITHM,
        `Unsupported algorithm: ${data.algorithm}`
      );
    }

    // Validate base64 encoding
    try {
      base64ToArrayBuffer(data.data);
      base64ToArrayBuffer(data.iv);
      base64ToArrayBuffer(data.salt);
    } catch {
      throw new CryptoError(
        CryptoErrorType.INVALID_DATA,
        'Invalid base64 encoding in encrypted data'
      );
    }
  }

  /**
   * Clean up expired cached keys
   */
  private cleanupExpiredKeys(): void {
    const now = Date.now();
    
    for (const [keyId, cached] of this.sessionKeys.entries()) {
      if (cached.expires < now) {
        this.sessionKeys.delete(keyId);
      }
    }
  }
}

/**
 * Performance monitoring for encryption operations
 */
export class EncryptionPerformanceMonitor {
  private metrics = new Map<string, { count: number; totalTime: number; maxTime: number }>();

  /**
   * Time an operation and record metrics
   */
  async timeOperation<T>(
    operationName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now();
    
    try {
      const result = await operation();
      this.recordMetric(operationName, performance.now() - startTime);
      return result;
    } catch (error) {
      this.recordMetric(`${operationName}_error`, performance.now() - startTime);
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): Record<string, { averageMs: number; count: number; maxMs: number }> {
    const result: Record<string, { averageMs: number; count: number; maxMs: number }> = {};
    
    for (const [name, metric] of this.metrics) {
      result[name] = {
        averageMs: metric.totalTime / metric.count,
        count: metric.count,
        maxMs: metric.maxTime
      };
    }

    return result;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics.clear();
  }

  private recordMetric(name: string, timeMs: number): void {
    const existing = this.metrics.get(name);
    
    if (existing) {
      existing.count++;
      existing.totalTime += timeMs;
      existing.maxTime = Math.max(existing.maxTime, timeMs);
    } else {
      this.metrics.set(name, {
        count: 1,
        totalTime: timeMs,
        maxTime: timeMs
      });
    }
  }
}

/**
 * Utility functions for common encryption tasks
 */
export const EncryptionUtils = {
  /**
   * Generate a human-readable backup phrase from key data
   */
  async generateBackupPhrase(keyData: ArrayBuffer): Promise<string> {
    // This is a simplified version - in production, you'd use BIP39 or similar
    const hash = await crypto.subtle.digest('SHA-256', keyData);
    const bytes = new Uint8Array(hash);
    
    // Convert to words (simplified - use proper word list in production)
    const words = [];
    for (let i = 0; i < bytes.length; i += 2) {
      const value = (bytes[i] << 8) | bytes[i + 1];
      words.push(`word${value % 2048}`);
    }
    
    return words.slice(0, 12).join(' ');
  },

  /**
   * Estimate encryption overhead for data
   */
  estimateEncryptionOverhead(dataSize: number): number {
    // Base64 encoding overhead + IV + salt + metadata
    return Math.ceil(dataSize * 1.33) + 44 + 44 + 200;
  },

  /**
   * Check if data appears to be encrypted
   */
  isEncryptedData(data: any): data is EncryptedData {
    return (
      typeof data === 'object' &&
      data !== null &&
      typeof data.data === 'string' &&
      typeof data.iv === 'string' &&
      typeof data.salt === 'string' &&
      typeof data.algorithm === 'string' &&
      typeof data.version === 'string'
    );
  },

  /**
   * Securely compare two encrypted data objects
   */
  secureCompareEncrypted(a: EncryptedData, b: EncryptedData): boolean {
    try {
      const aBuffer = base64ToArrayBuffer(a.data);
      const bBuffer = base64ToArrayBuffer(b.data);
      return constantTimeCompare(aBuffer, bBuffer);
    } catch {
      return false;
    }
  }
};