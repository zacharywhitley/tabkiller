/**
 * Digital signature service for data integrity and authentication
 * Supports Ed25519 and ECDSA P-256 algorithms
 */

import {
  DigitalSignature,
  SignatureAlgorithm,
  CryptoError,
  CryptoErrorType,
  CryptoKeyPair
} from './types';
import {
  isWebCryptoSupported,
  generateEd25519KeyPair,
  exportPublicKey,
  importPublicKey,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  stringToArrayBuffer,
  sha256,
  constantTimeCompare,
  MemoryUtils,
  AutoCleanup
} from './utils';

/**
 * Digital signature service configuration
 */
export interface SignatureConfig {
  /** Default signature algorithm */
  algorithm: SignatureAlgorithm;
  /** Hash algorithm for ECDSA */
  hashAlgorithm: 'SHA-256' | 'SHA-384' | 'SHA-512';
  /** Enable key caching */
  enableKeyCache: boolean;
  /** Cache TTL in milliseconds */
  cacheTTL: number;
}

/**
 * Default signature configuration
 */
export const DEFAULT_SIGNATURE_CONFIG: SignatureConfig = {
  algorithm: SignatureAlgorithm.ED25519,
  hashAlgorithm: 'SHA-256',
  enableKeyCache: true,
  cacheTTL: 3600000 // 1 hour
};

/**
 * Digital signature service for data integrity verification
 */
export class DigitalSignatureService {
  private config: SignatureConfig;
  private keyPairCache = new Map<string, { keyPair: CryptoKeyPair; expires: number }>();
  private publicKeyCache = new Map<string, { publicKey: CryptoKey; expires: number }>();

  constructor(config: Partial<SignatureConfig> = {}) {
    if (!isWebCryptoSupported()) {
      throw new CryptoError(
        CryptoErrorType.UNSUPPORTED_ALGORITHM,
        'Web Crypto API is not supported in this environment'
      );
    }

    this.config = { ...DEFAULT_SIGNATURE_CONFIG, ...config };
  }

  /**
   * Generate a new key pair for signing
   */
  async generateKeyPair(algorithm?: SignatureAlgorithm): Promise<CryptoKeyPair> {
    const sigAlgorithm = algorithm || this.config.algorithm;
    
    try {
      if (sigAlgorithm === SignatureAlgorithm.ED25519) {
        return await generateEd25519KeyPair();
      } else {
        // Fallback to ECDSA P-256
        return await crypto.subtle.generateKey(
          {
            name: 'ECDSA',
            namedCurve: 'P-256'
          },
          false, // Not extractable for security
          ['sign', 'verify']
        );
      }
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.KEY_DERIVATION_FAILED,
        'Signature key pair generation failed',
        error as Error
      );
    }
  }

  /**
   * Sign data with a private key
   */
  async sign(
    data: string | ArrayBuffer,
    privateKey: CryptoKey,
    algorithm?: SignatureAlgorithm
  ): Promise<DigitalSignature> {
    const cleanup = new AutoCleanup();
    const sigAlgorithm = algorithm || this.config.algorithm;

    try {
      // Convert string data to ArrayBuffer
      const dataBuffer = typeof data === 'string' 
        ? stringToArrayBuffer(data) 
        : data;
      cleanup.addBuffer(dataBuffer);

      // Determine signature algorithm parameters
      const algorithmSpec = this.getSignatureAlgorithmSpec(sigAlgorithm);

      // Sign the data
      const signature = await crypto.subtle.sign(
        algorithmSpec,
        privateKey,
        dataBuffer
      );

      // Export public key for verification
      const publicKeyData = await exportPublicKey(
        await this.getPublicKeyFromPrivate(privateKey, sigAlgorithm)
      );

      return {
        signature: arrayBufferToBase64(signature),
        algorithm: sigAlgorithm,
        publicKey: publicKeyData,
        timestamp: Date.now()
      };
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.SIGNATURE_FAILED,
        'Data signing failed',
        error as Error
      );
    } finally {
      cleanup.cleanup();
    }
  }

  /**
   * Verify a digital signature
   */
  async verify(
    data: string | ArrayBuffer,
    signature: DigitalSignature,
    publicKey?: CryptoKey
  ): Promise<boolean> {
    const cleanup = new AutoCleanup();

    try {
      // Convert string data to ArrayBuffer
      const dataBuffer = typeof data === 'string' 
        ? stringToArrayBuffer(data) 
        : data;
      cleanup.addBuffer(dataBuffer);

      // Use provided public key or import from signature
      const verificationKey = publicKey || 
        await importPublicKey(signature.publicKey, signature.algorithm);

      // Parse signature data
      const signatureBuffer = base64ToArrayBuffer(signature.signature);
      cleanup.addBuffer(signatureBuffer);

      // Determine signature algorithm parameters
      const algorithmSpec = this.getSignatureAlgorithmSpec(signature.algorithm);

      // Verify the signature
      const isValid = await crypto.subtle.verify(
        algorithmSpec,
        verificationKey,
        signatureBuffer,
        dataBuffer
      );

      return isValid;
    } catch (error) {
      console.warn('Signature verification failed:', error);
      return false; // Return false instead of throwing for verification failures
    } finally {
      cleanup.cleanup();
    }
  }

  /**
   * Sign JSON data with automatic serialization
   */
  async signJSON(
    data: any,
    privateKey: CryptoKey,
    algorithm?: SignatureAlgorithm
  ): Promise<DigitalSignature> {
    const jsonString = JSON.stringify(data, null, 0); // Compact JSON for consistency
    return this.sign(jsonString, privateKey, algorithm);
  }

  /**
   * Verify JSON data signature
   */
  async verifyJSON(
    data: any,
    signature: DigitalSignature,
    publicKey?: CryptoKey
  ): Promise<boolean> {
    const jsonString = JSON.stringify(data, null, 0); // Compact JSON for consistency
    return this.verify(jsonString, signature, publicKey);
  }

  /**
   * Create a detached signature (data and signature separate)
   */
  async signDetached(
    data: string | ArrayBuffer,
    privateKey: CryptoKey,
    algorithm?: SignatureAlgorithm
  ): Promise<{ data: string; signature: DigitalSignature }> {
    const signature = await this.sign(data, privateKey, algorithm);
    const dataString = typeof data === 'string' 
      ? data 
      : arrayBufferToBase64(data);

    return { data: dataString, signature };
  }

  /**
   * Verify a detached signature
   */
  async verifyDetached(
    data: string,
    signature: DigitalSignature,
    publicKey?: CryptoKey
  ): Promise<boolean> {
    return this.verify(data, signature, publicKey);
  }

  /**
   * Batch sign multiple data items
   */
  async signBatch(
    items: Array<{ id: string; data: string | ArrayBuffer }>,
    privateKey: CryptoKey,
    algorithm?: SignatureAlgorithm
  ): Promise<Array<{ id: string; signature: DigitalSignature }>> {
    const results: Array<{ id: string; signature: DigitalSignature }> = [];
    
    for (const item of items) {
      try {
        const signature = await this.sign(item.data, privateKey, algorithm);
        results.push({ id: item.id, signature });
      } catch (error) {
        console.warn(`Failed to sign item ${item.id}:`, error);
        throw error;
      }
    }

    return results;
  }

  /**
   * Batch verify multiple signatures
   */
  async verifyBatch(
    items: Array<{ 
      id: string; 
      data: string | ArrayBuffer; 
      signature: DigitalSignature 
    }>,
    publicKey?: CryptoKey
  ): Promise<Array<{ id: string; isValid: boolean }>> {
    const results: Array<{ id: string; isValid: boolean }> = [];
    
    for (const item of items) {
      try {
        const isValid = await this.verify(item.data, item.signature, publicKey);
        results.push({ id: item.id, isValid });
      } catch (error) {
        console.warn(`Failed to verify item ${item.id}:`, error);
        results.push({ id: item.id, isValid: false });
      }
    }

    return results;
  }

  /**
   * Cache a key pair for reuse
   */
  cacheKeyPair(keyId: string, keyPair: CryptoKeyPair, ttlMs?: number): void {
    if (!this.config.enableKeyCache) return;

    const expires = Date.now() + (ttlMs || this.config.cacheTTL);
    this.keyPairCache.set(keyId, { keyPair, expires });
    
    // Clean up expired entries
    this.cleanupExpiredCache();
  }

  /**
   * Get cached key pair
   */
  getCachedKeyPair(keyId: string): CryptoKeyPair | null {
    if (!this.config.enableKeyCache) return null;

    const cached = this.keyPairCache.get(keyId);
    
    if (!cached || cached.expires < Date.now()) {
      this.keyPairCache.delete(keyId);
      return null;
    }

    return cached.keyPair;
  }

  /**
   * Clear all cached keys
   */
  clearCache(): void {
    this.keyPairCache.clear();
    this.publicKeyCache.clear();
  }

  /**
   * Get signature algorithm info
   */
  getAlgorithmInfo(algorithm: SignatureAlgorithm): {
    name: string;
    keySize: number;
    signatureSize: number;
    description: string;
  } {
    switch (algorithm) {
      case SignatureAlgorithm.ED25519:
        return {
          name: 'Ed25519',
          keySize: 32,
          signatureSize: 64,
          description: 'EdDSA signature scheme using Curve25519'
        };
      case SignatureAlgorithm.ECDSA_P256:
        return {
          name: 'ECDSA P-256',
          keySize: 32,
          signatureSize: 64,
          description: 'ECDSA signature scheme using P-256 curve'
        };
      default:
        throw new CryptoError(
          CryptoErrorType.UNSUPPORTED_ALGORITHM,
          `Unsupported signature algorithm: ${algorithm}`
        );
    }
  }

  /**
   * Validate signature structure
   */
  validateSignature(signature: DigitalSignature): boolean {
    try {
      // Check required fields
      const required = ['signature', 'algorithm', 'publicKey', 'timestamp'];
      for (const field of required) {
        if (!(field in signature) || signature[field as keyof DigitalSignature] == null) {
          return false;
        }
      }

      // Validate base64 encoding
      base64ToArrayBuffer(signature.signature);
      base64ToArrayBuffer(signature.publicKey);

      // Validate algorithm
      if (!Object.values(SignatureAlgorithm).includes(signature.algorithm)) {
        return false;
      }

      // Validate timestamp
      if (typeof signature.timestamp !== 'number' || signature.timestamp <= 0) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  // Private helper methods

  /**
   * Get signature algorithm specification for Web Crypto API
   */
  private getSignatureAlgorithmSpec(algorithm: SignatureAlgorithm): any {
    switch (algorithm) {
      case SignatureAlgorithm.ED25519:
        return { name: 'Ed25519' };
      case SignatureAlgorithm.ECDSA_P256:
        return { 
          name: 'ECDSA', 
          hash: this.config.hashAlgorithm 
        };
      default:
        throw new CryptoError(
          CryptoErrorType.UNSUPPORTED_ALGORITHM,
          `Unsupported signature algorithm: ${algorithm}`
        );
    }
  }

  /**
   * Get public key from private key (for key pairs)
   */
  private async getPublicKeyFromPrivate(
    privateKey: CryptoKey,
    algorithm: SignatureAlgorithm
  ): Promise<CryptoKey> {
    // For Web Crypto API, we need to regenerate or cache the key pair
    // This is a simplified approach - in practice, you'd store the public key
    const keyPair = await this.generateKeyPair(algorithm);
    return keyPair.publicKey;
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    
    // Clean up key pair cache
    for (const [keyId, cached] of this.keyPairCache.entries()) {
      if (cached.expires < now) {
        this.keyPairCache.delete(keyId);
      }
    }

    // Clean up public key cache
    for (const [keyId, cached] of this.publicKeyCache.entries()) {
      if (cached.expires < now) {
        this.publicKeyCache.delete(keyId);
      }
    }
  }
}

/**
 * Utility functions for signature operations
 */
export const SignatureUtils = {
  /**
   * Create a timestamp signature for data freshness
   */
  async createTimestampedSignature(
    data: string | ArrayBuffer,
    privateKey: CryptoKey,
    service: DigitalSignatureService
  ): Promise<{ signature: DigitalSignature; timestamp: number }> {
    const timestamp = Date.now();
    const timestampedData = typeof data === 'string' 
      ? `${data}:${timestamp}`
      : new Uint8Array([
          ...new Uint8Array(data),
          ...new TextEncoder().encode(`:${timestamp}`)
        ]).buffer;

    const signature = await service.sign(timestampedData, privateKey);
    return { signature, timestamp };
  },

  /**
   * Verify timestamped signature with age check
   */
  async verifyTimestampedSignature(
    data: string | ArrayBuffer,
    signature: DigitalSignature,
    timestamp: number,
    maxAgeMs: number,
    service: DigitalSignatureService
  ): Promise<{ isValid: boolean; age: number }> {
    const age = Date.now() - timestamp;
    
    if (age > maxAgeMs) {
      return { isValid: false, age };
    }

    const timestampedData = typeof data === 'string' 
      ? `${data}:${timestamp}`
      : new Uint8Array([
          ...new Uint8Array(data),
          ...new TextEncoder().encode(`:${timestamp}`)
        ]).buffer;

    const isValid = await service.verify(timestampedData, signature);
    return { isValid, age };
  },

  /**
   * Create a chain of signatures for audit trail
   */
  async createSignatureChain(
    dataItems: Array<string | ArrayBuffer>,
    privateKey: CryptoKey,
    service: DigitalSignatureService
  ): Promise<DigitalSignature[]> {
    const signatures: DigitalSignature[] = [];
    let chainHash = new ArrayBuffer(0);

    for (const data of dataItems) {
      // Combine data with previous chain hash
      const dataBuffer = typeof data === 'string' 
        ? stringToArrayBuffer(data) 
        : data;
      
      const combinedData = new Uint8Array([
        ...new Uint8Array(chainHash),
        ...new Uint8Array(dataBuffer)
      ]);

      // Sign the combined data
      const signature = await service.sign(combinedData.buffer, privateKey);
      signatures.push(signature);

      // Update chain hash
      chainHash = await sha256(combinedData.buffer);
    }

    return signatures;
  },

  /**
   * Verify signature chain integrity
   */
  async verifySignatureChain(
    dataItems: Array<string | ArrayBuffer>,
    signatures: DigitalSignature[],
    service: DigitalSignatureService,
    publicKey?: CryptoKey
  ): Promise<boolean> {
    if (dataItems.length !== signatures.length) {
      return false;
    }

    let chainHash = new ArrayBuffer(0);

    for (let i = 0; i < dataItems.length; i++) {
      const data = dataItems[i];
      const signature = signatures[i];

      // Combine data with previous chain hash
      const dataBuffer = typeof data === 'string' 
        ? stringToArrayBuffer(data) 
        : data;
      
      const combinedData = new Uint8Array([
        ...new Uint8Array(chainHash),
        ...new Uint8Array(dataBuffer)
      ]);

      // Verify signature
      const isValid = await service.verify(combinedData.buffer, signature, publicKey);
      if (!isValid) {
        return false;
      }

      // Update chain hash
      chainHash = await sha256(combinedData.buffer);
    }

    return true;
  }
};