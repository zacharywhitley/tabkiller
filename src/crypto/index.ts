/**
 * TabKiller Cryptography Library
 * Comprehensive client-side encryption and security layer
 */

// Core types and interfaces
export * from './types';

// Utility functions
export * from './utils';

// Encryption services
export * from './encryption';

// Digital signature services
export * from './signatures';

// Key storage and management
export * from './key-storage';

// Main crypto service aggregator
import { WebCryptoEncryptionService, EncryptionPerformanceMonitor } from './encryption';
import { DigitalSignatureService } from './signatures';
import { SecureKeyStorage, KeyManager } from './key-storage';
import { 
  EncryptionConfig, 
  SecurityConfig, 
  CryptoError, 
  CryptoErrorType,
  EncryptedData,
  DigitalSignature
} from './types';
import { isWebCryptoSupported, MemoryUtils } from './utils';

/**
 * Main cryptography service that orchestrates all crypto operations
 */
export class CryptographyService {
  private encryption: WebCryptoEncryptionService;
  private signatures: DigitalSignatureService;
  private keyStorage: SecureKeyStorage;
  private keyManager: KeyManager;
  private performanceMonitor: EncryptionPerformanceMonitor;
  private initialized = false;

  constructor(config?: Partial<SecurityConfig>) {
    if (!isWebCryptoSupported()) {
      throw new CryptoError(
        CryptoErrorType.UNSUPPORTED_ALGORITHM,
        'Web Crypto API is not supported in this environment'
      );
    }

    this.encryption = new WebCryptoEncryptionService(config);
    this.signatures = new DigitalSignatureService(config);
    this.keyStorage = new SecureKeyStorage(config);
    this.keyManager = new KeyManager(this.keyStorage);
    this.performanceMonitor = new EncryptionPerformanceMonitor();
  }

  /**
   * Initialize the cryptography service
   */
  async initialize(masterPassword?: string): Promise<void> {
    try {
      await this.keyStorage.initialize(masterPassword);
      this.initialized = true;
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.STORAGE_ERROR,
        'Failed to initialize cryptography service',
        error as Error
      );
    }
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get encryption service
   */
  getEncryptionService(): WebCryptoEncryptionService {
    return this.encryption;
  }

  /**
   * Get signature service
   */
  getSignatureService(): DigitalSignatureService {
    return this.signatures;
  }

  /**
   * Get key storage
   */
  getKeyStorage(): SecureKeyStorage {
    return this.keyStorage;
  }

  /**
   * Get key manager
   */
  getKeyManager(): KeyManager {
    return this.keyManager;
  }

  /**
   * Get performance monitor
   */
  getPerformanceMonitor(): EncryptionPerformanceMonitor {
    return this.performanceMonitor;
  }

  /**
   * Encrypt and sign data in one operation
   */
  async encryptAndSign(
    data: string,
    encryptionKey: CryptoKey,
    signingKey: CryptoKey
  ): Promise<{ encrypted: EncryptedData; signature: DigitalSignature }> {
    this.ensureInitialized();

    return this.performanceMonitor.timeOperation('encryptAndSign', async () => {
      // First encrypt the data
      const encrypted = await this.encryption.encrypt(data, encryptionKey);
      
      // Then sign the encrypted data for integrity
      const signature = await this.signatures.sign(
        JSON.stringify(encrypted),
        signingKey
      );

      return { encrypted, signature };
    });
  }

  /**
   * Verify and decrypt data in one operation
   */
  async verifyAndDecrypt(
    encrypted: EncryptedData,
    signature: DigitalSignature,
    decryptionKey: CryptoKey,
    verificationKey?: CryptoKey
  ): Promise<string> {
    this.ensureInitialized();

    return this.performanceMonitor.timeOperation('verifyAndDecrypt', async () => {
      // First verify the signature
      const isValid = await this.signatures.verify(
        JSON.stringify(encrypted),
        signature,
        verificationKey
      );

      if (!isValid) {
        throw new CryptoError(
          CryptoErrorType.VERIFICATION_FAILED,
          'Signature verification failed - data may be tampered'
        );
      }

      // Then decrypt the data
      const decrypted = await this.encryption.decrypt(encrypted, decryptionKey);
      return new TextDecoder().decode(decrypted);
    });
  }

  /**
   * Generate a complete key set for a user/session
   */
  async generateKeySet(
    keySetId: string,
    password: string
  ): Promise<{
    encryptionKey: CryptoKey;
    signingKeyPair: CryptoKeyPair;
    derivedKey: CryptoKey;
  }> {
    this.ensureInitialized();

    return this.performanceMonitor.timeOperation('generateKeySet', async () => {
      // Derive master key from password
      const derivedKeyInfo = await this.encryption.deriveKey(password);
      
      // Generate encryption key
      const encryptionKey = await this.encryption.generateKey();
      
      // Generate signing key pair
      const signingKeyPair = await this.signatures.generateKeyPair();

      // Store keys securely
      await this.keyManager.generateAndStoreKey(
        `${keySetId}_encryption`,
        'encryption',
        { keySetId, purpose: 'data_encryption' }
      );

      // Cache derived key
      this.encryption.cacheKey(`${keySetId}_derived`, derivedKeyInfo.key);

      return {
        encryptionKey,
        signingKeyPair,
        derivedKey: derivedKeyInfo.key
      };
    });
  }

  /**
   * Secure data for storage (encrypt + sign + metadata)
   */
  async secureForStorage(
    data: any,
    keySetId: string
  ): Promise<{
    secured: EncryptedData;
    signature: DigitalSignature;
    metadata: Record<string, any>;
  }> {
    this.ensureInitialized();

    return this.performanceMonitor.timeOperation('secureForStorage', async () => {
      // Get keys for this key set
      const encryptionKey = await this.keyManager.retrieveKey(`${keySetId}_encryption`);
      if (!encryptionKey) {
        throw new CryptoError(
          CryptoErrorType.INVALID_KEY,
          `Encryption key not found for key set: ${keySetId}`
        );
      }

      // Serialize data
      const serialized = JSON.stringify(data);

      // Encrypt data
      const encrypted = await this.encryption.encrypt(serialized, encryptionKey);

      // Create signature key pair for integrity
      const signingKeyPair = await this.signatures.generateKeyPair();
      const signature = await this.signatures.sign(
        JSON.stringify(encrypted),
        signingKeyPair.privateKey
      );

      // Create metadata
      const metadata = {
        keySetId,
        dataType: typeof data,
        timestamp: Date.now(),
        version: '1.0.0'
      };

      return { secured: encrypted, signature, metadata };
    });
  }

  /**
   * Restore data from secure storage
   */
  async restoreFromStorage(
    secured: EncryptedData,
    signature: DigitalSignature,
    metadata: Record<string, any>
  ): Promise<any> {
    this.ensureInitialized();

    return this.performanceMonitor.timeOperation('restoreFromStorage', async () => {
      // Verify signature first
      const isValid = await this.signatures.verify(
        JSON.stringify(secured),
        signature
      );

      if (!isValid) {
        throw new CryptoError(
          CryptoErrorType.VERIFICATION_FAILED,
          'Data integrity check failed'
        );
      }

      // Get decryption key
      const encryptionKey = await this.keyManager.retrieveKey(
        `${metadata.keySetId}_encryption`
      );
      
      if (!encryptionKey) {
        throw new CryptoError(
          CryptoErrorType.INVALID_KEY,
          `Decryption key not found for key set: ${metadata.keySetId}`
        );
      }

      // Decrypt data
      const decrypted = await this.encryption.decrypt(secured, encryptionKey);
      const serialized = new TextDecoder().decode(decrypted);

      return JSON.parse(serialized);
    });
  }

  /**
   * Get comprehensive security status
   */
  getSecurityStatus(): {
    initialized: boolean;
    webCryptoSupported: boolean;
    performanceMetrics: Record<string, any>;
    storageStats: Promise<any>;
    memoryStats: { registeredBuffers: number };
  } {
    return {
      initialized: this.initialized,
      webCryptoSupported: isWebCryptoSupported(),
      performanceMetrics: this.performanceMonitor.getMetrics(),
      storageStats: this.keyStorage.getStorageStats(),
      memoryStats: {
        registeredBuffers: MemoryUtils.getRegisteredCount()
      }
    };
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    // Clear all caches
    this.encryption.clearKeyCache();
    this.signatures.clearCache();
    this.keyManager.clearCache();

    // Clear performance metrics
    this.performanceMonitor.resetMetrics();

    // Clear sensitive memory
    MemoryUtils.clearAll();

    this.initialized = false;
  }

  /**
   * Reset all cryptographic state (for testing or security incidents)
   */
  async reset(): Promise<void> {
    await this.cleanup();
    await this.keyStorage.clearAll();
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new CryptoError(
        CryptoErrorType.STORAGE_ERROR,
        'Cryptography service not initialized'
      );
    }
  }
}

/**
 * Create a new cryptography service instance
 */
export function createCryptographyService(
  config?: Partial<SecurityConfig>
): CryptographyService {
  return new CryptographyService(config);
}

/**
 * Default cryptography service instance
 */
let defaultCryptoService: CryptographyService | null = null;

/**
 * Get or create the default cryptography service
 */
export function getCryptographyService(
  config?: Partial<SecurityConfig>
): CryptographyService {
  if (!defaultCryptoService) {
    defaultCryptoService = new CryptographyService(config);
  }
  return defaultCryptoService;
}

/**
 * Initialize the default cryptography service
 */
export async function initializeCryptographyService(
  masterPassword?: string,
  config?: Partial<SecurityConfig>
): Promise<CryptographyService> {
  const service = getCryptographyService(config);
  await service.initialize(masterPassword);
  return service;
}