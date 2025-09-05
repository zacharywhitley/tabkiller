/**
 * Cryptographic types and interfaces for TabKiller security layer
 */

/**
 * Supported encryption algorithms
 */
export enum EncryptionAlgorithm {
  AES_GCM = 'AES-GCM',
  AES_CBC = 'AES-CBC'
}

/**
 * Supported key derivation functions
 */
export enum KeyDerivationFunction {
  PBKDF2 = 'PBKDF2'
}

/**
 * Supported signature algorithms
 */
export enum SignatureAlgorithm {
  ED25519 = 'Ed25519',
  ECDSA_P256 = 'ECDSA-P256'
}

/**
 * Encrypted data container
 */
export interface EncryptedData {
  /** Encrypted data as base64 string */
  data: string;
  /** Initialization vector as base64 string */
  iv: string;
  /** Salt used for key derivation as base64 string */
  salt: string;
  /** Authentication tag for AES-GCM (base64) */
  authTag?: string;
  /** Encryption algorithm used */
  algorithm: EncryptionAlgorithm;
  /** Key derivation function used */
  kdf: KeyDerivationFunction;
  /** Number of KDF iterations */
  iterations: number;
  /** Version for backward compatibility */
  version: string;
  /** Timestamp when encrypted */
  timestamp: number;
}

/**
 * Digital signature container
 */
export interface DigitalSignature {
  /** Signature as base64 string */
  signature: string;
  /** Algorithm used for signing */
  algorithm: SignatureAlgorithm;
  /** Public key used for verification (base64) */
  publicKey: string;
  /** Timestamp when signed */
  timestamp: number;
}

/**
 * Key pair for asymmetric cryptography
 */
export interface CryptoKeyPair {
  /** Private key for signing/decryption */
  privateKey: CryptoKey;
  /** Public key for verification/encryption */
  publicKey: CryptoKey;
}

/**
 * Derived key information
 */
export interface DerivedKey {
  /** The derived cryptographic key */
  key: CryptoKey;
  /** Salt used for derivation */
  salt: Uint8Array;
  /** Number of iterations used */
  iterations: number;
  /** Algorithm used for derivation */
  algorithm: string;
}

/**
 * Encryption configuration
 */
export interface EncryptionConfig {
  /** Default encryption algorithm */
  algorithm: EncryptionAlgorithm;
  /** Key size in bits */
  keySize: number;
  /** IV/nonce length in bytes */
  ivLength: number;
  /** Salt length in bytes */
  saltLength: number;
  /** PBKDF2 iterations */
  keyDerivationIterations: number;
  /** Version for compatibility */
  version: string;
}

/**
 * Security configuration
 */
export interface SecurityConfig extends EncryptionConfig {
  /** Enable digital signatures */
  enableSignatures: boolean;
  /** Signature algorithm */
  signatureAlgorithm: SignatureAlgorithm;
  /** Enable memory clearing */
  enableMemoryClearing: boolean;
  /** Session timeout in milliseconds */
  sessionTimeout: number;
  /** Maximum key cache size */
  maxKeyCacheSize: number;
}

/**
 * Secure memory container for sensitive data
 */
export interface SecureBuffer {
  /** Buffer containing sensitive data */
  buffer: ArrayBuffer;
  /** Clear the buffer securely */
  clear(): void;
  /** Get a copy of the data */
  copy(): ArrayBuffer;
  /** Get the size of the buffer */
  size(): number;
}

/**
 * Key storage interface
 */
export interface KeyStorage {
  /** Store a key securely */
  storeKey(keyId: string, keyData: ArrayBuffer, metadata?: any): Promise<void>;
  /** Retrieve a key */
  retrieveKey(keyId: string): Promise<ArrayBuffer | null>;
  /** Delete a key */
  deleteKey(keyId: string): Promise<boolean>;
  /** List stored key IDs */
  listKeys(): Promise<string[]>;
  /** Clear all stored keys */
  clearAll(): Promise<void>;
}

/**
 * Audit log entry
 */
export interface SecurityAuditEntry {
  /** Timestamp of the event */
  timestamp: number;
  /** Type of security event */
  event: string;
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Event details */
  details: Record<string, any>;
  /** User context if available */
  context?: string;
}

/**
 * Security vulnerability
 */
export interface SecurityVulnerability {
  /** Vulnerability ID */
  id: string;
  /** Vulnerability title */
  title: string;
  /** Description of the vulnerability */
  description: string;
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Affected components */
  affectedComponents: string[];
  /** Remediation steps */
  remediation: string[];
  /** Detection timestamp */
  detected: number;
}

/**
 * Error types for cryptographic operations
 */
export enum CryptoErrorType {
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  KEY_DERIVATION_FAILED = 'KEY_DERIVATION_FAILED',
  SIGNATURE_FAILED = 'SIGNATURE_FAILED',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  INVALID_KEY = 'INVALID_KEY',
  INVALID_DATA = 'INVALID_DATA',
  UNSUPPORTED_ALGORITHM = 'UNSUPPORTED_ALGORITHM',
  MEMORY_ERROR = 'MEMORY_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR'
}

/**
 * Cryptographic operation error
 */
export class CryptoError extends Error {
  constructor(
    public readonly type: CryptoErrorType,
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'CryptoError';
  }
}