/**
 * Encryption layer for sensitive browsing data
 * Provides client-side encryption/decryption for URLs, content, and personal data
 */

import CryptoJS from 'crypto-js';
import { TabKillerError } from '../shared/types';
import { storage } from '../utils/cross-browser';

/**
 * Encryption configuration
 */
export interface EncryptionConfig {
  algorithm: string;
  keyDerivationIterations: number;
  saltLength: number;
  ivLength: number;
}

/**
 * Encrypted data format
 */
export interface EncryptedData {
  data: string;
  salt: string;
  iv: string;
  algorithm: string;
  keyDerivation: string;
  iterations: number;
  timestamp: number;
}

/**
 * Fields that should be encrypted in different node types
 */
export const ENCRYPTED_FIELDS = {
  Page: ['url', 'title', 'html', 'mhtml', 'screenshot', 'forms'],
  Session: ['purpose', 'notes'],
  Tag: [], // Tags are generally not sensitive
  Domain: [], // Domain info is generally public
  User: ['userAgent', 'screenResolution'],
  Device: ['userAgent', 'name'],
  FormField: ['value']
};

/**
 * Encryption service for browsing data
 */
export class EncryptionService {
  private config: EncryptionConfig;
  private masterKey: string | null = null;
  private keyCache: Map<string, string> = new Map();

  constructor(config?: Partial<EncryptionConfig>) {
    this.config = {
      algorithm: 'AES',
      keyDerivationIterations: 100000,
      saltLength: 32,
      ivLength: 16,
      ...config
    };
  }

  /**
   * Initialize encryption with master password
   */
  async initialize(masterPassword?: string): Promise<void> {
    try {
      if (masterPassword) {
        this.masterKey = await this.deriveMasterKey(masterPassword);
      } else {
        // Try to load from secure storage
        const stored = await this.loadMasterKey();
        if (stored) {
          this.masterKey = stored;
        } else {
          // Generate new master key
          this.masterKey = await this.generateMasterKey();
          await this.saveMasterKey(this.masterKey);
        }
      }
    } catch (error) {
      throw new TabKillerError(
        'ENCRYPTION_INIT_FAILED',
        'Failed to initialize encryption service',
        'background',
        error
      );
    }
  }

  /**
   * Check if encryption is initialized
   */
  isInitialized(): boolean {
    return this.masterKey !== null;
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(data: string, context?: string): EncryptedData {
    if (!this.isInitialized()) {
      throw new TabKillerError(
        'ENCRYPTION_NOT_INITIALIZED',
        'Encryption service not initialized',
        'background'
      );
    }

    try {
      // Generate random salt and IV
      const salt = CryptoJS.lib.WordArray.random(this.config.saltLength);
      const iv = CryptoJS.lib.WordArray.random(this.config.ivLength);

      // Derive encryption key from master key and salt
      const derivedKey = CryptoJS.PBKDF2(this.masterKey!, salt, {
        keySize: 256 / 32,
        iterations: this.config.keyDerivationIterations
      });

      // Encrypt data
      const encrypted = CryptoJS.AES.encrypt(data, derivedKey, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });

      return {
        data: encrypted.toString(),
        salt: salt.toString(CryptoJS.enc.Hex),
        iv: iv.toString(CryptoJS.enc.Hex),
        algorithm: this.config.algorithm,
        keyDerivation: 'PBKDF2',
        iterations: this.config.keyDerivationIterations,
        timestamp: Date.now()
      };
    } catch (error) {
      throw new TabKillerError(
        'ENCRYPTION_FAILED',
        'Failed to encrypt data',
        'background',
        { error, context }
      );
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData: EncryptedData): string {
    if (!this.isInitialized()) {
      throw new TabKillerError(
        'ENCRYPTION_NOT_INITIALIZED',
        'Encryption service not initialized',
        'background'
      );
    }

    try {
      // Parse salt and IV
      const salt = CryptoJS.enc.Hex.parse(encryptedData.salt);
      const iv = CryptoJS.enc.Hex.parse(encryptedData.iv);

      // Derive the same key used for encryption
      const derivedKey = CryptoJS.PBKDF2(this.masterKey!, salt, {
        keySize: 256 / 32,
        iterations: encryptedData.iterations
      });

      // Decrypt data
      const decrypted = CryptoJS.AES.decrypt(encryptedData.data, derivedKey, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });

      const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
      
      if (!decryptedString) {
        throw new Error('Decryption resulted in empty string');
      }

      return decryptedString;
    } catch (error) {
      throw new TabKillerError(
        'DECRYPTION_FAILED',
        'Failed to decrypt data',
        'background',
        { error, algorithm: encryptedData.algorithm }
      );
    }
  }

  /**
   * Encrypt object properties based on field configuration
   */
  encryptNodeProperties(nodeType: string, properties: Record<string, any>): Record<string, any> {
    if (!this.isInitialized()) {
      return properties;
    }

    const fieldsToEncrypt = ENCRYPTED_FIELDS[nodeType as keyof typeof ENCRYPTED_FIELDS] || [];
    const encrypted = { ...properties };

    for (const field of fieldsToEncrypt) {
      if (field in properties && properties[field] !== null && properties[field] !== undefined) {
        try {
          const value = typeof properties[field] === 'object' 
            ? JSON.stringify(properties[field])
            : String(properties[field]);
          
          encrypted[field] = this.encrypt(value, `${nodeType}.${field}`);
        } catch (error) {
          console.warn(`Failed to encrypt field ${field} for ${nodeType}:`, error);
          // Keep original value if encryption fails
        }
      }
    }

    return encrypted;
  }

  /**
   * Decrypt object properties
   */
  decryptNodeProperties(nodeType: string, properties: Record<string, any>): Record<string, any> {
    if (!this.isInitialized()) {
      return properties;
    }

    const fieldsToDecrypt = ENCRYPTED_FIELDS[nodeType as keyof typeof ENCRYPTED_FIELDS] || [];
    const decrypted = { ...properties };

    for (const field of fieldsToDecrypt) {
      if (field in properties && this.isEncryptedData(properties[field])) {
        try {
          const decryptedValue = this.decrypt(properties[field] as EncryptedData);
          
          // Try to parse as JSON if it looks like an object
          try {
            decrypted[field] = JSON.parse(decryptedValue);
          } catch {
            decrypted[field] = decryptedValue;
          }
        } catch (error) {
          console.warn(`Failed to decrypt field ${field} for ${nodeType}:`, error);
          // Keep encrypted value if decryption fails
        }
      }
    }

    return decrypted;
  }

  /**
   * Create searchable encrypted index
   */
  createSearchableIndex(data: string): string[] {
    if (!this.isInitialized()) {
      return [];
    }

    // Create searchable tokens from data
    const tokens = this.tokenize(data);
    const encryptedTokens: string[] = [];

    // Encrypt each token individually for searchability
    for (const token of tokens) {
      try {
        const encrypted = this.encrypt(token, 'search_index');
        encryptedTokens.push(encrypted.data); // Only store the encrypted data part
      } catch (error) {
        console.warn('Failed to encrypt search token:', token, error);
      }
    }

    return encryptedTokens;
  }

  /**
   * Search encrypted indexes
   */
  searchEncryptedIndex(searchTerm: string, encryptedTokens: string[]): boolean {
    if (!this.isInitialized()) {
      return false;
    }

    const searchTokens = this.tokenize(searchTerm);
    
    for (const searchToken of searchTokens) {
      try {
        const encryptedSearchToken = this.encrypt(searchToken, 'search_index');
        if (encryptedTokens.includes(encryptedSearchToken.data)) {
          return true;
        }
      } catch (error) {
        console.warn('Failed to encrypt search token:', searchToken, error);
      }
    }

    return false;
  }

  /**
   * Generate backup encryption key
   */
  async generateBackupKey(): Promise<string> {
    if (!this.isInitialized()) {
      throw new TabKillerError(
        'ENCRYPTION_NOT_INITIALIZED',
        'Cannot generate backup key - encryption not initialized',
        'background'
      );
    }

    // Create backup key from master key
    const backupSalt = CryptoJS.lib.WordArray.random(32);
    const backupKey = CryptoJS.PBKDF2(this.masterKey!, backupSalt, {
      keySize: 512 / 32,
      iterations: this.config.keyDerivationIterations * 2
    });

    return backupKey.toString(CryptoJS.enc.Base64);
  }

  /**
   * Encrypt data for backup/export
   */
  encryptForBackup(data: string): EncryptedData {
    return this.encrypt(data, 'backup');
  }

  /**
   * Change master password
   */
  async changeMasterPassword(oldPassword: string, newPassword: string): Promise<void> {
    // Verify old password
    const oldKey = await this.deriveMasterKey(oldPassword);
    if (oldKey !== this.masterKey) {
      throw new TabKillerError(
        'INVALID_PASSWORD',
        'Old password is incorrect',
        'background'
      );
    }

    // Set new master key
    this.masterKey = await this.deriveMasterKey(newPassword);
    await this.saveMasterKey(this.masterKey);
    
    // Clear key cache to force re-derivation
    this.keyCache.clear();
  }

  /**
   * Export encryption configuration
   */
  exportConfig(): EncryptionConfig {
    return { ...this.config };
  }

  // Private helper methods
  private async generateMasterKey(): Promise<string> {
    // Generate cryptographically strong random key
    const randomKey = CryptoJS.lib.WordArray.random(256 / 8);
    return randomKey.toString(CryptoJS.enc.Base64);
  }

  private async deriveMasterKey(password: string): Promise<string> {
    // Use device-specific salt for key derivation
    const deviceSalt = await this.getDeviceSalt();
    const key = CryptoJS.PBKDF2(password, deviceSalt, {
      keySize: 256 / 32,
      iterations: this.config.keyDerivationIterations
    });
    return key.toString(CryptoJS.enc.Base64);
  }

  private async getDeviceSalt(): Promise<string> {
    const stored = await storage.get<{ deviceSalt?: string }>('deviceSalt');
    if (stored.deviceSalt) {
      return stored.deviceSalt;
    }

    // Generate new device salt
    const salt = CryptoJS.lib.WordArray.random(32);
    const saltString = salt.toString(CryptoJS.enc.Base64);
    await storage.set({ deviceSalt: saltString });
    return saltString;
  }

  private async loadMasterKey(): Promise<string | null> {
    try {
      const stored = await storage.get<{ encryptionKey?: EncryptedData }>('encryptionKey');
      if (stored.encryptionKey) {
        // For security, we don't store the master key directly
        // Instead, we derive it from stored device fingerprint
        const deviceFingerprint = await this.getDeviceFingerprint();
        return await this.deriveMasterKey(deviceFingerprint);
      }
      return null;
    } catch (error) {
      console.warn('Failed to load master key:', error);
      return null;
    }
  }

  private async saveMasterKey(key: string): Promise<void> {
    // We don't actually save the key directly for security
    // Instead, we save an indicator that it was initialized
    await storage.set({ 
      encryptionInitialized: true,
      encryptionTimestamp: Date.now()
    });
  }

  private async getDeviceFingerprint(): Promise<string> {
    // Create a consistent device fingerprint
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx!.textBaseline = 'top';
    ctx!.font = '14px Arial';
    ctx!.fillText('TabKiller encryption fingerprint', 2, 2);
    
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      canvas.toDataURL()
    ].join('|');

    // Hash the fingerprint
    const hashed = CryptoJS.SHA256(fingerprint);
    return hashed.toString(CryptoJS.enc.Base64);
  }

  private isEncryptedData(value: any): value is EncryptedData {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof value.data === 'string' &&
      typeof value.salt === 'string' &&
      typeof value.iv === 'string' &&
      typeof value.algorithm === 'string'
    );
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2) // Only index words longer than 2 chars
      .slice(0, 50); // Limit tokens to prevent index bloat
  }
}

/**
 * Encryption middleware for repositories
 */
export class EncryptionMiddleware {
  private encryption: EncryptionService;

  constructor(encryption: EncryptionService) {
    this.encryption = encryption;
  }

  /**
   * Encrypt node before storage
   */
  beforeCreate(nodeType: string, properties: Record<string, any>): Record<string, any> {
    return this.encryption.encryptNodeProperties(nodeType, properties);
  }

  /**
   * Decrypt node after retrieval
   */
  afterRead(nodeType: string, properties: Record<string, any>): Record<string, any> {
    return this.encryption.decryptNodeProperties(nodeType, properties);
  }

  /**
   * Handle encryption for updates
   */
  beforeUpdate(nodeType: string, properties: Record<string, any>): Record<string, any> {
    return this.encryption.encryptNodeProperties(nodeType, properties);
  }
}

/**
 * Global encryption instance
 */
let globalEncryption: EncryptionService | null = null;

/**
 * Get or create global encryption service
 */
export function getEncryptionService(config?: Partial<EncryptionConfig>): EncryptionService {
  if (!globalEncryption) {
    globalEncryption = new EncryptionService(config);
  }
  return globalEncryption;
}

/**
 * Initialize global encryption with password
 */
export async function initializeEncryption(masterPassword?: string): Promise<EncryptionService> {
  const encryption = getEncryptionService();
  await encryption.initialize(masterPassword);
  return encryption;
}

/**
 * Utility functions for common encryption tasks
 */
export const EncryptionUtils = {
  /**
   * Encrypt URL for storage
   */
  encryptUrl(url: string, encryption: EncryptionService): EncryptedData {
    return encryption.encrypt(url, 'url');
  },

  /**
   * Encrypt HTML content
   */
  encryptHtmlContent(html: string, encryption: EncryptionService): EncryptedData {
    return encryption.encrypt(html, 'html_content');
  },

  /**
   * Encrypt form data
   */
  encryptFormData(formData: Record<string, string>, encryption: EncryptionService): Record<string, EncryptedData> {
    const encrypted: Record<string, EncryptedData> = {};
    for (const [key, value] of Object.entries(formData)) {
      encrypted[key] = encryption.encrypt(value, `form_data.${key}`);
    }
    return encrypted;
  },

  /**
   * Check if encryption is recommended for a URL
   */
  shouldEncryptUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      
      // Don't encrypt public/well-known URLs
      const publicDomains = [
        'google.com',
        'wikipedia.org',
        'github.com',
        'stackoverflow.com'
      ];
      
      return !publicDomains.some(domain => parsedUrl.hostname.includes(domain));
    } catch {
      return true; // Encrypt if URL parsing fails
    }
  }
};