/**
 * Comprehensive test suite for TabKiller cryptographic operations
 * Tests Web Crypto API integration, key management, and security features
 */

import { 
  WebCryptoEncryptionService,
  DigitalSignatureService,
  SecureKeyStorage,
  KeyManager,
  CryptographyService
} from '../crypto';
import {
  SecurityMiddleware,
  SecurityAuditor,
  runSecurityAudit
} from '../security';
import {
  CryptoError,
  CryptoErrorType,
  EncryptionAlgorithm,
  SignatureAlgorithm
} from '../crypto/types';
import { 
  isWebCryptoSupported,
  generateRandomBytes,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  constantTimeCompare
} from '../crypto/utils';

// Mock chrome storage for testing
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    }
  }
} as any;

describe('Cryptographic Utilities', () => {
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
  });

  test('should detect Web Crypto API support', () => {
    expect(isWebCryptoSupported()).toBe(true);
  });

  test('should generate secure random bytes', () => {
    const bytes = generateRandomBytes(32);
    expect(bytes).toHaveLength(32);
    expect(bytes instanceof Uint8Array).toBe(true);
  });

  test('should convert between ArrayBuffer and base64', () => {
    const testData = new TextEncoder().encode('Hello, World!');
    const base64 = arrayBufferToBase64(testData.buffer);
    const decoded = base64ToArrayBuffer(base64);
    const decodedText = new TextDecoder().decode(decoded);
    
    expect(decodedText).toBe('Hello, World!');
  });

  test('should perform constant-time comparison', () => {
    const data1 = new Uint8Array([1, 2, 3, 4]).buffer;
    const data2 = new Uint8Array([1, 2, 3, 4]).buffer;
    const data3 = new Uint8Array([1, 2, 3, 5]).buffer;
    
    expect(constantTimeCompare(data1, data2)).toBe(true);
    expect(constantTimeCompare(data1, data3)).toBe(false);
  });
});

describe('WebCryptoEncryptionService', () => {
  let encryptionService: WebCryptoEncryptionService;

  beforeEach(() => {
    encryptionService = new WebCryptoEncryptionService();
  });

  test('should encrypt and decrypt data successfully', async () => {
    const testData = 'This is sensitive test data';
    const key = await encryptionService.generateKey();
    
    const encrypted = await encryptionService.encrypt(testData, key);
    expect(encrypted.algorithm).toBe(EncryptionAlgorithm.AES_GCM);
    expect(encrypted.data).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.salt).toBeTruthy();
    
    const decrypted = await encryptionService.decrypt(encrypted, key);
    const decryptedText = new TextDecoder().decode(decrypted);
    
    expect(decryptedText).toBe(testData);
  });

  test('should derive consistent keys from password', async () => {
    const password = 'test-password-123';
    const salt = generateRandomBytes(32);
    
    const key1 = await encryptionService.deriveKey(password, salt);
    const key2 = await encryptionService.deriveKey(password, salt);
    
    // Keys should be consistent with same password and salt
    expect(key1.salt).toEqual(key2.salt);
    expect(key1.iterations).toBe(key2.iterations);
  });

  test('should fail to decrypt with wrong key', async () => {
    const testData = 'Sensitive data';
    const key1 = await encryptionService.generateKey();
    const key2 = await encryptionService.generateKey();
    
    const encrypted = await encryptionService.encrypt(testData, key1);
    
    await expect(encryptionService.decrypt(encrypted, key2))
      .rejects.toThrow(CryptoError);
  });

  test('should detect tampering in encrypted data', async () => {
    const testData = 'Sensitive data';
    const key = await encryptionService.generateKey();
    
    const encrypted = await encryptionService.encrypt(testData, key);
    
    // Tamper with the data
    const tamperedData = { ...encrypted };
    tamperedData.data = tamperedData.data.slice(0, -1) + 'X';
    
    await expect(encryptionService.decrypt(tamperedData, key))
      .rejects.toThrow(CryptoError);
  });

  test('should handle string encryption/decryption', async () => {
    const testData = 'String encryption test';
    const key = await encryptionService.generateKey();
    
    const encryptedString = await encryptionService.encryptString(testData, key);
    expect(typeof encryptedString).toBe('string');
    
    const decrypted = await encryptionService.decryptString(encryptedString, key);
    expect(decrypted).toBe(testData);
  });

  test('should handle batch encryption/decryption', async () => {
    const items = [
      { id: '1', data: 'First item' },
      { id: '2', data: 'Second item' },
      { id: '3', data: 'Third item' }
    ];
    const key = await encryptionService.generateKey();
    
    const encrypted = await encryptionService.encryptBatch(items, key);
    expect(encrypted).toHaveLength(3);
    
    const decrypted = await encryptionService.decryptBatch(encrypted, key);
    expect(decrypted).toHaveLength(3);
    expect(decrypted[0].data).toBe('First item');
    expect(decrypted[1].data).toBe('Second item');
    expect(decrypted[2].data).toBe('Third item');
  });

  test('should rotate keys successfully', async () => {
    const testData = 'Data for key rotation test';
    const oldKey = await encryptionService.generateKey();
    const newKey = await encryptionService.generateKey();
    
    const encrypted = await encryptionService.encrypt(testData, oldKey);
    const rotated = await encryptionService.rotateKey(encrypted, oldKey, newKey);
    
    // Should be able to decrypt with new key
    const decrypted = await encryptionService.decrypt(rotated, newKey);
    const decryptedText = new TextDecoder().decode(decrypted);
    expect(decryptedText).toBe(testData);
    
    // Should not be able to decrypt rotated data with old key
    await expect(encryptionService.decrypt(rotated, oldKey))
      .rejects.toThrow(CryptoError);
  });
});

describe('DigitalSignatureService', () => {
  let signatureService: DigitalSignatureService;

  beforeEach(() => {
    signatureService = new DigitalSignatureService();
  });

  test('should generate key pairs', async () => {
    const keyPair = await signatureService.generateKeyPair();
    expect(keyPair.privateKey).toBeTruthy();
    expect(keyPair.publicKey).toBeTruthy();
    expect(keyPair.privateKey.type).toBe('private');
    expect(keyPair.publicKey.type).toBe('public');
  });

  test('should sign and verify data successfully', async () => {
    const testData = 'Data to be signed';
    const keyPair = await signatureService.generateKeyPair();
    
    const signature = await signatureService.sign(testData, keyPair.privateKey);
    expect(signature.signature).toBeTruthy();
    expect(signature.publicKey).toBeTruthy();
    expect(signature.algorithm).toBeTruthy();
    
    const isValid = await signatureService.verify(testData, signature, keyPair.publicKey);
    expect(isValid).toBe(true);
  });

  test('should fail verification with tampered data', async () => {
    const testData = 'Original data';
    const tamperedData = 'Tampered data';
    const keyPair = await signatureService.generateKeyPair();
    
    const signature = await signatureService.sign(testData, keyPair.privateKey);
    const isValid = await signatureService.verify(tamperedData, signature, keyPair.publicKey);
    
    expect(isValid).toBe(false);
  });

  test('should handle JSON data signing', async () => {
    const testData = { message: 'Hello', timestamp: Date.now() };
    const keyPair = await signatureService.generateKeyPair();
    
    const signature = await signatureService.signJSON(testData, keyPair.privateKey);
    const isValid = await signatureService.verifyJSON(testData, signature, keyPair.publicKey);
    
    expect(isValid).toBe(true);
  });

  test('should handle batch signing and verification', async () => {
    const items = [
      { id: '1', data: 'First message' },
      { id: '2', data: 'Second message' }
    ];
    const keyPair = await signatureService.generateKeyPair();
    
    const signatures = await signatureService.signBatch(items, keyPair.privateKey);
    expect(signatures).toHaveLength(2);
    
    const verifications = await signatureService.verifyBatch(
      signatures.map((sig, i) => ({ id: sig.id, data: items[i].data, signature: sig.signature })),
      keyPair.publicKey
    );
    
    expect(verifications.every(v => v.isValid)).toBe(true);
  });

  test('should validate signature structure', () => {
    const validSignature = {
      signature: 'base64-signature',
      algorithm: SignatureAlgorithm.ED25519,
      publicKey: 'base64-public-key',
      timestamp: Date.now()
    };
    
    const invalidSignature = {
      signature: 'base64-signature',
      // Missing required fields
    };
    
    expect(signatureService.validateSignature(validSignature as any)).toBe(true);
    expect(signatureService.validateSignature(invalidSignature as any)).toBe(false);
  });
});

describe('SecureKeyStorage', () => {
  let keyStorage: SecureKeyStorage;
  const mockGet = jest.fn();
  const mockSet = jest.fn();
  const mockRemove = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock chrome storage
    (global as any).chrome = {
      storage: {
        local: {
          get: mockGet,
          set: mockSet,
          remove: mockRemove
        }
      }
    };
    
    keyStorage = new SecureKeyStorage();
    await keyStorage.initialize('test-master-password');
  });

  test('should store and retrieve keys', async () => {
    const testKey = generateRandomBytes(32);
    const keyId = 'test-key-1';
    
    mockSet.mockResolvedValue(undefined);
    mockGet.mockResolvedValue({
      [`key_${keyId}`]: {
        encryptedKey: { /* mocked encrypted data */ },
        metadata: { keyId, keyType: 'test', created: Date.now() },
        integrityHash: 'mock-hash'
      }
    });
    
    await keyStorage.storeKey(keyId, testKey.buffer, { keyType: 'test' });
    expect(mockSet).toHaveBeenCalled();
    
    // Mock the retrieval
    mockGet.mockResolvedValue({
      [`key_${keyId}`]: {
        encryptedKey: {
          data: arrayBufferToBase64(testKey.buffer),
          iv: 'mock-iv',
          salt: 'mock-salt',
          algorithm: EncryptionAlgorithm.AES_GCM,
          kdf: 'PBKDF2',
          iterations: 100000,
          version: '1.0.0',
          timestamp: Date.now()
        },
        metadata: { keyId, keyType: 'test', created: Date.now(), lastUsed: Date.now(), version: 1 },
        integrityHash: await keyStorage['createIntegrityHash'](testKey.buffer, { keyId, keyType: 'test', created: Date.now(), lastUsed: Date.now(), version: 1 })
      }
    });
    
    const retrieved = await keyStorage.retrieveKey(keyId);
    expect(retrieved).toBeTruthy();
  });

  test('should list stored keys', async () => {
    mockGet.mockResolvedValue({
      key_index: {
        'key1': { keyId: 'key1', keyType: 'test', created: Date.now() },
        'key2': { keyId: 'key2', keyType: 'test', created: Date.now() }
      }
    });
    
    const keys = await keyStorage.listKeys();
    expect(keys).toEqual(['key1', 'key2']);
  });

  test('should delete keys', async () => {
    const keyId = 'test-key-to-delete';
    mockRemove.mockResolvedValue(undefined);
    mockGet.mockResolvedValue({ key_index: {} });
    mockSet.mockResolvedValue(undefined);
    
    const deleted = await keyStorage.deleteKey(keyId);
    expect(deleted).toBe(true);
    expect(mockRemove).toHaveBeenCalledWith(`key_${keyId}`);
  });

  test('should clear all keys', async () => {
    mockGet.mockResolvedValue({
      key_index: {
        'key1': { keyId: 'key1' },
        'key2': { keyId: 'key2' }
      }
    });
    mockRemove.mockResolvedValue(undefined);
    mockSet.mockResolvedValue(undefined);
    
    await keyStorage.clearAll();
    expect(mockRemove).toHaveBeenCalledTimes(2);
    expect(mockSet).toHaveBeenCalledWith({ key_index: {} });
  });
});

describe('CryptographyService', () => {
  let cryptoService: CryptographyService;

  beforeEach(async () => {
    cryptoService = new CryptographyService();
    await cryptoService.initialize('test-master-password');
  });

  test('should initialize successfully', () => {
    expect(cryptoService.isInitialized()).toBe(true);
  });

  test('should provide access to sub-services', () => {
    expect(cryptoService.getEncryptionService()).toBeTruthy();
    expect(cryptoService.getSignatureService()).toBeTruthy();
    expect(cryptoService.getKeyStorage()).toBeTruthy();
    expect(cryptoService.getKeyManager()).toBeTruthy();
    expect(cryptoService.getPerformanceMonitor()).toBeTruthy();
  });

  test('should encrypt and sign data', async () => {
    const testData = 'Test data for encryption and signing';
    const encryptionKey = await cryptoService.getEncryptionService().generateKey();
    const signingKeyPair = await cryptoService.getSignatureService().generateKeyPair();
    
    const result = await cryptoService.encryptAndSign(testData, encryptionKey, signingKeyPair.privateKey);
    
    expect(result.encrypted).toBeTruthy();
    expect(result.signature).toBeTruthy();
  });

  test('should verify and decrypt data', async () => {
    const testData = 'Test data for verification and decryption';
    const encryptionKey = await cryptoService.getEncryptionService().generateKey();
    const signingKeyPair = await cryptoService.getSignatureService().generateKeyPair();
    
    const { encrypted, signature } = await cryptoService.encryptAndSign(testData, encryptionKey, signingKeyPair.privateKey);
    const decrypted = await cryptoService.verifyAndDecrypt(encrypted, signature, encryptionKey, signingKeyPair.publicKey);
    
    expect(decrypted).toBe(testData);
  });

  test('should generate complete key sets', async () => {
    const keySetId = 'test-keyset-1';
    const password = 'test-password-123';
    
    const keySet = await cryptoService.generateKeySet(keySetId, password);
    
    expect(keySet.encryptionKey).toBeTruthy();
    expect(keySet.signingKeyPair.privateKey).toBeTruthy();
    expect(keySet.signingKeyPair.publicKey).toBeTruthy();
    expect(keySet.derivedKey).toBeTruthy();
  });

  test('should get security status', () => {
    const status = cryptoService.getSecurityStatus();
    
    expect(status.initialized).toBe(true);
    expect(status.webCryptoSupported).toBe(true);
    expect(status.performanceMetrics).toBeTruthy();
    expect(status.storageStats).toBeTruthy();
    expect(status.memoryStats).toBeTruthy();
  });

  test('should cleanup resources', async () => {
    await cryptoService.cleanup();
    expect(cryptoService.isInitialized()).toBe(false);
  });
});

describe('SecurityMiddleware', () => {
  let securityMiddleware: SecurityMiddleware;

  beforeEach(async () => {
    const { SecurityMiddleware } = await import('../security/middleware');
    securityMiddleware = new SecurityMiddleware();
    await securityMiddleware.initialize('test-master-password');
  });

  test('should initialize successfully', () => {
    expect(securityMiddleware.getSecurityStatus().initialized).toBe(true);
  });

  test('should create security contexts', () => {
    const context = securityMiddleware.createSecurityContext('test-request', {
      origin: 'https://example.com',
      userId: 'user123'
    });
    
    expect(context.requestType).toBe('test-request');
    expect(context.origin).toBe('https://example.com');
    expect(context.userId).toBe('user123');
    expect(context.requestId).toBeTruthy();
    expect(context.timestamp).toBeTruthy();
  });

  test('should validate origins', () => {
    const context = securityMiddleware.createSecurityContext('test');
    
    expect(securityMiddleware.validateOrigin('', context)).toBe(true); // Empty origin allowed
    expect(securityMiddleware.validateOrigin('https://example.com', context)).toBe(true); // Any origin allowed by default
  });

  test('should get audit entries', () => {
    const entries = securityMiddleware.getAuditEntries();
    expect(Array.isArray(entries)).toBe(true);
  });
});

describe('SecurityAuditor', () => {
  let cryptoService: CryptographyService;

  beforeEach(async () => {
    cryptoService = new CryptographyService();
    await cryptoService.initialize('test-master-password');
  });

  test('should run complete security audit', async () => {
    const report = await runSecurityAudit(cryptoService);
    
    expect(report.timestamp).toBeTruthy();
    expect(report.overallStatus).toMatch(/^(pass|fail|warning)$/);
    expect(Array.isArray(report.testResults)).toBe(true);
    expect(Array.isArray(report.vulnerabilities)).toBe(true);
    expect(report.performanceMetrics).toBeTruthy();
    expect(report.summary.totalTests).toBeGreaterThan(0);
  });

  test('should detect cryptographic capabilities', async () => {
    const report = await runSecurityAudit(cryptoService);
    
    // Should have basic crypto tests
    const cryptoTests = report.testResults.filter(t => t.category === 'crypto');
    expect(cryptoTests.length).toBeGreaterThan(0);
    
    // Should have performance tests
    const perfTests = report.testResults.filter(t => t.category === 'performance');
    expect(perfTests.length).toBeGreaterThan(0);
  });

  test('should measure performance within acceptable thresholds', async () => {
    const report = await runSecurityAudit(cryptoService, {
      enablePerformanceTesting: true,
      performanceIterations: 10, // Reduce for faster tests
      testDataSize: 100 // Smaller test data
    });
    
    const perfTests = report.testResults.filter(t => t.category === 'performance');
    const failedPerfTests = perfTests.filter(t => t.status === 'fail');
    
    // Most performance tests should pass or at least not fail completely
    expect(failedPerfTests.length).toBeLessThan(perfTests.length);
  });
});

describe('Integration Tests', () => {
  test('should handle complete encryption workflow', async () => {
    const cryptoService = new CryptographyService();
    await cryptoService.initialize('integration-test-password');
    
    // Generate keys
    const keySet = await cryptoService.generateKeySet('integration-test', 'user-password');
    
    // Test data
    const sensitiveData = {
      url: 'https://sensitive-site.com/private-page',
      formData: { username: 'user', password: 'secret' },
      timestamp: Date.now()
    };
    
    // Secure for storage
    const secured = await cryptoService.secureForStorage(sensitiveData, 'integration-test');
    
    expect(secured.secured).toBeTruthy();
    expect(secured.signature).toBeTruthy();
    expect(secured.metadata).toBeTruthy();
    
    // Restore from storage
    const restored = await cryptoService.restoreFromStorage(
      secured.secured,
      secured.signature,
      secured.metadata
    );
    
    expect(restored).toEqual(sensitiveData);
  });

  test('should handle error conditions gracefully', async () => {
    const cryptoService = new CryptographyService();
    
    // Should fail when not initialized
    await expect(cryptoService.encryptAndSign('data', {} as any, {} as any))
      .rejects.toThrow();
    
    // Initialize and test with invalid keys
    await cryptoService.initialize('test-password');
    const validKey = await cryptoService.getEncryptionService().generateKey();
    
    // Should handle invalid signature verification gracefully
    const encrypted = await cryptoService.getEncryptionService().encrypt('data', validKey);
    const invalidSignature = {
      signature: 'invalid',
      algorithm: SignatureAlgorithm.ED25519,
      publicKey: 'invalid',
      timestamp: Date.now()
    };
    
    await expect(cryptoService.verifyAndDecrypt(encrypted, invalidSignature as any, validKey))
      .rejects.toThrow();
  });
});

describe('Error Handling', () => {
  test('should throw appropriate crypto errors', async () => {
    const encryptionService = new WebCryptoEncryptionService();
    
    // Test with invalid encrypted data
    const invalidData = {
      data: 'invalid',
      iv: 'invalid',
      salt: 'invalid',
      algorithm: EncryptionAlgorithm.AES_GCM,
      kdf: 'PBKDF2',
      iterations: 100000,
      version: '1.0.0',
      timestamp: Date.now()
    };
    
    const key = await encryptionService.generateKey();
    
    await expect(encryptionService.decrypt(invalidData, key))
      .rejects.toThrow(CryptoError);
  });

  test('should handle missing crypto API gracefully', () => {
    // Temporarily disable crypto API
    const originalCrypto = global.crypto;
    delete (global as any).crypto;
    
    expect(isWebCryptoSupported()).toBe(false);
    
    // Restore crypto API
    (global as any).crypto = originalCrypto;
  });
});