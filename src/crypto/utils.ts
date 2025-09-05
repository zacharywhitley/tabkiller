/**
 * Core cryptographic utilities using Web Crypto API
 */

import { CryptoError, CryptoErrorType, SecureBuffer } from './types';

/**
 * Check if Web Crypto API is available
 */
export function isWebCryptoSupported(): boolean {
  return typeof crypto !== 'undefined' && 
         typeof crypto.subtle !== 'undefined';
}

/**
 * Generate cryptographically secure random bytes
 */
export function generateRandomBytes(length: number): Uint8Array {
  if (!isWebCryptoSupported()) {
    throw new CryptoError(
      CryptoErrorType.UNSUPPORTED_ALGORITHM,
      'Web Crypto API is not supported'
    );
  }

  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Generate a random UUID v4
 */
export function generateUUID(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  
  // Fallback implementation
  const bytes = generateRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant bits
  
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Convert ArrayBuffer to base64 string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    throw new CryptoError(
      CryptoErrorType.INVALID_DATA,
      'Invalid base64 string',
      error as Error
    );
  }
}

/**
 * Convert string to ArrayBuffer (UTF-8 encoding)
 */
export function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}

/**
 * Convert ArrayBuffer to string (UTF-8 decoding)
 */
export function arrayBufferToString(buffer: ArrayBuffer): string {
  try {
    const decoder = new TextDecoder();
    return decoder.decode(buffer);
  } catch (error) {
    throw new CryptoError(
      CryptoErrorType.INVALID_DATA,
      'Invalid UTF-8 data in buffer',
      error as Error
    );
  }
}

/**
 * Concatenate multiple ArrayBuffers
 */
export function concatenateArrayBuffers(...buffers: ArrayBuffer[]): ArrayBuffer {
  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const result = new Uint8Array(totalLength);
  
  let offset = 0;
  for (const buffer of buffers) {
    result.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  
  return result.buffer;
}

/**
 * Compare two ArrayBuffers in constant time
 */
export function constantTimeCompare(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  
  const aBytes = new Uint8Array(a);
  const bBytes = new Uint8Array(b);
  let result = 0;
  
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  
  return result === 0;
}

/**
 * Hash data using SHA-256
 */
export async function sha256(data: ArrayBuffer): Promise<ArrayBuffer> {
  if (!isWebCryptoSupported()) {
    throw new CryptoError(
      CryptoErrorType.UNSUPPORTED_ALGORITHM,
      'Web Crypto API is not supported'
    );
  }

  try {
    return await crypto.subtle.digest('SHA-256', data);
  } catch (error) {
    throw new CryptoError(
      CryptoErrorType.ENCRYPTION_FAILED,
      'SHA-256 hashing failed',
      error as Error
    );
  }
}

/**
 * Hash data using SHA-512
 */
export async function sha512(data: ArrayBuffer): Promise<ArrayBuffer> {
  if (!isWebCryptoSupported()) {
    throw new CryptoError(
      CryptoErrorType.UNSUPPORTED_ALGORITHM,
      'Web Crypto API is not supported'
    );
  }

  try {
    return await crypto.subtle.digest('SHA-512', data);
  } catch (error) {
    throw new CryptoError(
      CryptoErrorType.ENCRYPTION_FAILED,
      'SHA-512 hashing failed',
      error as Error
    );
  }
}

/**
 * Derive key using PBKDF2
 */
export async function deriveKeyPBKDF2(
  password: string | ArrayBuffer,
  salt: ArrayBuffer,
  iterations: number,
  keyLength: number,
  hash: 'SHA-256' | 'SHA-512' = 'SHA-256'
): Promise<CryptoKey> {
  if (!isWebCryptoSupported()) {
    throw new CryptoError(
      CryptoErrorType.UNSUPPORTED_ALGORITHM,
      'Web Crypto API is not supported'
    );
  }

  try {
    // Convert password to ArrayBuffer if needed
    const passwordBuffer = typeof password === 'string' 
      ? stringToArrayBuffer(password) 
      : password;

    // Import the password as a key
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // Derive the key
    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: hash
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: keyLength * 8
      },
      false,
      ['encrypt', 'decrypt']
    );
  } catch (error) {
    throw new CryptoError(
      CryptoErrorType.KEY_DERIVATION_FAILED,
      'PBKDF2 key derivation failed',
      error as Error
    );
  }
}

/**
 * Generate AES key
 */
export async function generateAESKey(length: 128 | 192 | 256 = 256): Promise<CryptoKey> {
  if (!isWebCryptoSupported()) {
    throw new CryptoError(
      CryptoErrorType.UNSUPPORTED_ALGORITHM,
      'Web Crypto API is not supported'
    );
  }

  try {
    return await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: length
      },
      false, // Not extractable for security
      ['encrypt', 'decrypt']
    );
  } catch (error) {
    throw new CryptoError(
      CryptoErrorType.KEY_DERIVATION_FAILED,
      'AES key generation failed',
      error as Error
    );
  }
}

/**
 * Generate Ed25519 key pair for signatures
 */
export async function generateEd25519KeyPair(): Promise<CryptoKeyPair> {
  if (!isWebCryptoSupported()) {
    throw new CryptoError(
      CryptoErrorType.UNSUPPORTED_ALGORITHM,
      'Web Crypto API is not supported'
    );
  }

  try {
    return await crypto.subtle.generateKey(
      {
        name: 'Ed25519'
      },
      false, // Not extractable for security
      ['sign', 'verify']
    );
  } catch (error) {
    // Fallback to ECDSA P-256 if Ed25519 is not supported
    try {
      return await crypto.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256'
        },
        false,
        ['sign', 'verify']
      );
    } catch (fallbackError) {
      throw new CryptoError(
        CryptoErrorType.KEY_DERIVATION_FAILED,
        'Signature key generation failed',
        fallbackError as Error
      );
    }
  }
}

/**
 * Export public key to base64
 */
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  try {
    const exported = await crypto.subtle.exportKey('spki', publicKey);
    return arrayBufferToBase64(exported);
  } catch (error) {
    throw new CryptoError(
      CryptoErrorType.INVALID_KEY,
      'Public key export failed',
      error as Error
    );
  }
}

/**
 * Import public key from base64
 */
export async function importPublicKey(
  keyData: string, 
  algorithm: 'Ed25519' | 'ECDSA'
): Promise<CryptoKey> {
  try {
    const keyBuffer = base64ToArrayBuffer(keyData);
    
    const algorithmSpec = algorithm === 'Ed25519' 
      ? { name: 'Ed25519' }
      : { name: 'ECDSA', namedCurve: 'P-256' };
    
    return await crypto.subtle.importKey(
      'spki',
      keyBuffer,
      algorithmSpec,
      false,
      ['verify']
    );
  } catch (error) {
    throw new CryptoError(
      CryptoErrorType.INVALID_KEY,
      'Public key import failed',
      error as Error
    );
  }
}

/**
 * Secure buffer implementation with explicit memory clearing
 */
export class SecureBufferImpl implements SecureBuffer {
  private _buffer: ArrayBuffer;
  private _cleared = false;

  constructor(data: ArrayBuffer | Uint8Array | string) {
    if (typeof data === 'string') {
      this._buffer = stringToArrayBuffer(data);
    } else if (data instanceof Uint8Array) {
      this._buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } else {
      this._buffer = data.slice(0);
    }
  }

  get buffer(): ArrayBuffer {
    if (this._cleared) {
      throw new CryptoError(
        CryptoErrorType.MEMORY_ERROR,
        'Buffer has been cleared'
      );
    }
    return this._buffer;
  }

  clear(): void {
    if (!this._cleared) {
      // Zero out the memory
      const view = new Uint8Array(this._buffer);
      view.fill(0);
      this._cleared = true;
    }
  }

  copy(): ArrayBuffer {
    if (this._cleared) {
      throw new CryptoError(
        CryptoErrorType.MEMORY_ERROR,
        'Buffer has been cleared'
      );
    }
    return this._buffer.slice(0);
  }

  size(): number {
    return this._buffer.byteLength;
  }
}

/**
 * Timing-safe string comparison
 */
export function timingSafeStringCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Memory clearing utilities
 */
export class MemoryUtils {
  private static clearableBuffers: Set<ArrayBuffer> = new Set();

  /**
   * Register a buffer for automatic clearing
   */
  static register(buffer: ArrayBuffer): void {
    this.clearableBuffers.add(buffer);
  }

  /**
   * Unregister a buffer
   */
  static unregister(buffer: ArrayBuffer): void {
    this.clearableBuffers.delete(buffer);
  }

  /**
   * Clear a specific buffer
   */
  static clear(buffer: ArrayBuffer): void {
    const view = new Uint8Array(buffer);
    view.fill(0);
    this.clearableBuffers.delete(buffer);
  }

  /**
   * Clear all registered buffers
   */
  static clearAll(): void {
    for (const buffer of this.clearableBuffers) {
      const view = new Uint8Array(buffer);
      view.fill(0);
    }
    this.clearableBuffers.clear();
  }

  /**
   * Get number of registered buffers
   */
  static getRegisteredCount(): number {
    return this.clearableBuffers.size;
  }
}

/**
 * Auto-cleanup utility for sensitive operations
 */
export class AutoCleanup {
  private cleanupTasks: (() => void)[] = [];

  /**
   * Add a cleanup task
   */
  add(task: () => void): void {
    this.cleanupTasks.push(task);
  }

  /**
   * Add a buffer to be cleared
   */
  addBuffer(buffer: ArrayBuffer): void {
    this.add(() => MemoryUtils.clear(buffer));
  }

  /**
   * Add a secure buffer to be cleared
   */
  addSecureBuffer(buffer: SecureBuffer): void {
    this.add(() => buffer.clear());
  }

  /**
   * Execute all cleanup tasks
   */
  cleanup(): void {
    for (const task of this.cleanupTasks) {
      try {
        task();
      } catch (error) {
        console.warn('Cleanup task failed:', error);
      }
    }
    this.cleanupTasks = [];
  }

  /**
   * Execute function with automatic cleanup
   */
  async withCleanup<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } finally {
      this.cleanup();
    }
  }
}