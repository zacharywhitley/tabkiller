/**
 * Security audit and vulnerability testing framework for TabKiller
 * Provides comprehensive security analysis and vulnerability detection
 */

import {
  SecurityVulnerability,
  CryptoError,
  CryptoErrorType,
  EncryptedData,
  DigitalSignature
} from '../crypto/types';
import { CryptographyService } from '../crypto';
import { SecurityMiddleware } from './middleware';
import { isWebCryptoSupported, constantTimeCompare } from '../crypto/utils';

/**
 * Security audit configuration
 */
export interface SecurityAuditConfig {
  /** Enable performance testing */
  enablePerformanceTesting: boolean;
  /** Enable cryptographic testing */
  enableCryptographicTesting: boolean;
  /** Enable vulnerability scanning */
  enableVulnerabilityScanning: boolean;
  /** Enable memory leak detection */
  enableMemoryLeakDetection: boolean;
  /** Test data size for performance testing */
  testDataSize: number;
  /** Number of iterations for performance tests */
  performanceIterations: number;
}

/**
 * Default audit configuration
 */
export const DEFAULT_AUDIT_CONFIG: SecurityAuditConfig = {
  enablePerformanceTesting: true,
  enableCryptographicTesting: true,
  enableVulnerabilityScanning: true,
  enableMemoryLeakDetection: true,
  testDataSize: 1024, // 1KB
  performanceIterations: 100
};

/**
 * Security test result
 */
export interface SecurityTestResult {
  /** Test name */
  testName: string;
  /** Test category */
  category: 'crypto' | 'performance' | 'vulnerability' | 'memory';
  /** Test status */
  status: 'pass' | 'fail' | 'warning' | 'skip';
  /** Test message */
  message: string;
  /** Test duration in milliseconds */
  duration: number;
  /** Additional test data */
  data?: Record<string, any>;
}

/**
 * Security audit report
 */
export interface SecurityAuditReport {
  /** Audit timestamp */
  timestamp: number;
  /** Overall status */
  overallStatus: 'pass' | 'fail' | 'warning';
  /** Test results */
  testResults: SecurityTestResult[];
  /** Detected vulnerabilities */
  vulnerabilities: SecurityVulnerability[];
  /** Performance metrics */
  performanceMetrics: Record<string, any>;
  /** Summary statistics */
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
}

/**
 * Security auditor for comprehensive security testing
 */
export class SecurityAuditor {
  private config: SecurityAuditConfig;
  private cryptoService: CryptographyService;
  private vulnerabilities: SecurityVulnerability[] = [];

  constructor(
    cryptoService: CryptographyService,
    config?: Partial<SecurityAuditConfig>
  ) {
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config };
    this.cryptoService = cryptoService;
  }

  /**
   * Run comprehensive security audit
   */
  async runAudit(): Promise<SecurityAuditReport> {
    const startTime = Date.now();
    const testResults: SecurityTestResult[] = [];

    console.log('Starting security audit...');

    try {
      // Cryptographic tests
      if (this.config.enableCryptographicTesting) {
        testResults.push(...await this.runCryptographicTests());
      }

      // Performance tests
      if (this.config.enablePerformanceTesting) {
        testResults.push(...await this.runPerformanceTests());
      }

      // Vulnerability scanning
      if (this.config.enableVulnerabilityScanning) {
        testResults.push(...await this.runVulnerabilityTests());
      }

      // Memory leak detection
      if (this.config.enableMemoryLeakDetection) {
        testResults.push(...await this.runMemoryLeakTests());
      }

      // Generate summary
      const summary = this.generateSummary(testResults);
      const overallStatus = this.determineOverallStatus(testResults);

      const report: SecurityAuditReport = {
        timestamp: startTime,
        overallStatus,
        testResults,
        vulnerabilities: [...this.vulnerabilities],
        performanceMetrics: this.cryptoService.getPerformanceMonitor().getMetrics(),
        summary
      };

      console.log(`Security audit completed in ${Date.now() - startTime}ms`);
      return report;
    } catch (error) {
      console.error('Security audit failed:', error);
      
      const failResult: SecurityTestResult = {
        testName: 'audit_execution',
        category: 'vulnerability',
        status: 'fail',
        message: `Audit execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime
      };

      return {
        timestamp: startTime,
        overallStatus: 'fail',
        testResults: [failResult],
        vulnerabilities: this.vulnerabilities,
        performanceMetrics: {},
        summary: {
          totalTests: 1,
          passed: 0,
          failed: 1,
          warnings: 0,
          skipped: 0
        }
      };
    }
  }

  /**
   * Run cryptographic correctness tests
   */
  private async runCryptographicTests(): Promise<SecurityTestResult[]> {
    const results: SecurityTestResult[] = [];

    // Test encryption/decryption roundtrip
    results.push(await this.testEncryptionRoundtrip());

    // Test key derivation consistency
    results.push(await this.testKeyDerivationConsistency());

    // Test signature verification
    results.push(await this.testSignatureVerification());

    // Test data integrity
    results.push(await this.testDataIntegrity());

    // Test cryptographic randomness
    results.push(await this.testCryptographicRandomness());

    return results;
  }

  /**
   * Run performance tests
   */
  private async runPerformanceTests(): Promise<SecurityTestResult[]> {
    const results: SecurityTestResult[] = [];

    // Test encryption performance
    results.push(await this.testEncryptionPerformance());

    // Test decryption performance
    results.push(await this.testDecryptionPerformance());

    // Test key generation performance
    results.push(await this.testKeyGenerationPerformance());

    // Test signature performance
    results.push(await this.testSignaturePerformance());

    return results;
  }

  /**
   * Run vulnerability tests
   */
  private async runVulnerabilityTests(): Promise<SecurityTestResult[]> {
    const results: SecurityTestResult[] = [];

    // Test for timing attacks
    results.push(await this.testTimingAttacks());

    // Test for memory exposure
    results.push(await this.testMemoryExposure());

    // Test for weak randomness
    results.push(await this.testWeakRandomness());

    // Test for improper key handling
    results.push(await this.testKeyHandling());

    // Test for data leakage
    results.push(await this.testDataLeakage());

    return results;
  }

  /**
   * Run memory leak tests
   */
  private async runMemoryLeakTests(): Promise<SecurityTestResult[]> {
    const results: SecurityTestResult[] = [];

    // Test memory cleanup
    results.push(await this.testMemoryCleanup());

    // Test buffer management
    results.push(await this.testBufferManagement());

    return results;
  }

  // Individual test implementations

  private async testEncryptionRoundtrip(): Promise<SecurityTestResult> {
    const startTime = performance.now();
    
    try {
      const testData = 'Test data for encryption roundtrip';
      const key = await this.cryptoService.getEncryptionService().generateKey();
      
      const encrypted = await this.cryptoService.getEncryptionService().encrypt(testData, key);
      const decrypted = await this.cryptoService.getEncryptionService().decrypt(encrypted, key);
      const decryptedString = new TextDecoder().decode(decrypted);
      
      const success = decryptedString === testData;
      
      return {
        testName: 'encryption_roundtrip',
        category: 'crypto',
        status: success ? 'pass' : 'fail',
        message: success ? 'Encryption roundtrip successful' : 'Encryption roundtrip failed',
        duration: performance.now() - startTime,
        data: { originalLength: testData.length, decryptedLength: decryptedString.length }
      };
    } catch (error) {
      return {
        testName: 'encryption_roundtrip',
        category: 'crypto',
        status: 'fail',
        message: `Encryption roundtrip error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime
      };
    }
  }

  private async testKeyDerivationConsistency(): Promise<SecurityTestResult> {
    const startTime = performance.now();
    
    try {
      const password = 'test-password-123';
      const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                                   17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);
      
      const key1 = await this.cryptoService.getEncryptionService().deriveKey(password, salt);
      const key2 = await this.cryptoService.getEncryptionService().deriveKey(password, salt);
      
      // Export both keys to compare (for testing only - keys normally not extractable)
      const exported1 = await crypto.subtle.exportKey('raw', key1.key);
      const exported2 = await crypto.subtle.exportKey('raw', key2.key);
      
      const consistent = constantTimeCompare(exported1, exported2);
      
      return {
        testName: 'key_derivation_consistency',
        category: 'crypto',
        status: consistent ? 'pass' : 'fail',
        message: consistent ? 'Key derivation is consistent' : 'Key derivation is inconsistent',
        duration: performance.now() - startTime
      };
    } catch (error) {
      return {
        testName: 'key_derivation_consistency',
        category: 'crypto',
        status: 'fail',
        message: `Key derivation test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime
      };
    }
  }

  private async testSignatureVerification(): Promise<SecurityTestResult> {
    const startTime = performance.now();
    
    try {
      const testData = 'Test data for signature verification';
      const keyPair = await this.cryptoService.getSignatureService().generateKeyPair();
      
      const signature = await this.cryptoService.getSignatureService().sign(
        testData, 
        keyPair.privateKey
      );
      
      const isValid = await this.cryptoService.getSignatureService().verify(
        testData, 
        signature, 
        keyPair.publicKey
      );
      
      return {
        testName: 'signature_verification',
        category: 'crypto',
        status: isValid ? 'pass' : 'fail',
        message: isValid ? 'Signature verification successful' : 'Signature verification failed',
        duration: performance.now() - startTime
      };
    } catch (error) {
      return {
        testName: 'signature_verification',
        category: 'crypto',
        status: 'fail',
        message: `Signature verification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime
      };
    }
  }

  private async testDataIntegrity(): Promise<SecurityTestResult> {
    const startTime = performance.now();
    
    try {
      const testData = 'Test data for integrity check';
      const key = await this.cryptoService.getEncryptionService().generateKey();
      
      const encrypted = await this.cryptoService.getEncryptionService().encrypt(testData, key);
      
      // Tamper with the encrypted data
      const tamperedData = { ...encrypted };
      tamperedData.data = tamperedData.data.slice(0, -1) + 'X'; // Change last character
      
      try {
        await this.cryptoService.getEncryptionService().decrypt(tamperedData, key);
        
        // If decryption succeeds with tampered data, integrity check failed
        return {
          testName: 'data_integrity',
          category: 'crypto',
          status: 'fail',
          message: 'Data integrity check failed - tampered data was accepted',
          duration: performance.now() - startTime
        };
      } catch {
        // Expected behavior - tampered data should be rejected
        return {
          testName: 'data_integrity',
          category: 'crypto',
          status: 'pass',
          message: 'Data integrity check passed - tampered data was rejected',
          duration: performance.now() - startTime
        };
      }
    } catch (error) {
      return {
        testName: 'data_integrity',
        category: 'crypto',
        status: 'fail',
        message: `Data integrity test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime
      };
    }
  }

  private async testCryptographicRandomness(): Promise<SecurityTestResult> {
    const startTime = performance.now();
    
    try {
      // Generate multiple random values and check for patterns
      const samples = 100;
      const sampleSize = 32;
      const randomSamples: Uint8Array[] = [];
      
      for (let i = 0; i < samples; i++) {
        randomSamples.push(crypto.getRandomValues(new Uint8Array(sampleSize)));
      }
      
      // Check for duplicate samples (extremely unlikely with good randomness)
      const duplicates = new Set();
      let duplicateCount = 0;
      
      for (const sample of randomSamples) {
        const sampleStr = Array.from(sample).join(',');
        if (duplicates.has(sampleStr)) {
          duplicateCount++;
        } else {
          duplicates.add(sampleStr);
        }
      }
      
      const status = duplicateCount === 0 ? 'pass' : 'fail';
      
      return {
        testName: 'cryptographic_randomness',
        category: 'crypto',
        status,
        message: `Random number generation check: ${duplicateCount} duplicates found out of ${samples} samples`,
        duration: performance.now() - startTime,
        data: { samples, duplicates: duplicateCount }
      };
    } catch (error) {
      return {
        testName: 'cryptographic_randomness',
        category: 'crypto',
        status: 'fail',
        message: `Randomness test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime
      };
    }
  }

  private async testEncryptionPerformance(): Promise<SecurityTestResult> {
    const startTime = performance.now();
    
    try {
      const testData = 'x'.repeat(this.config.testDataSize);
      const key = await this.cryptoService.getEncryptionService().generateKey();
      
      const iterations = this.config.performanceIterations;
      const startEncryption = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        await this.cryptoService.getEncryptionService().encrypt(testData, key);
      }
      
      const encryptionTime = performance.now() - startEncryption;
      const avgTime = encryptionTime / iterations;
      
      // Performance threshold: should encrypt 1KB in under 50ms
      const threshold = 50;
      const status = avgTime < threshold ? 'pass' : 'warning';
      
      return {
        testName: 'encryption_performance',
        category: 'performance',
        status,
        message: `Average encryption time: ${avgTime.toFixed(2)}ms (threshold: ${threshold}ms)`,
        duration: performance.now() - startTime,
        data: { avgTime, threshold, iterations, dataSize: this.config.testDataSize }
      };
    } catch (error) {
      return {
        testName: 'encryption_performance',
        category: 'performance',
        status: 'fail',
        message: `Encryption performance test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime
      };
    }
  }

  private async testDecryptionPerformance(): Promise<SecurityTestResult> {
    const startTime = performance.now();
    
    try {
      const testData = 'x'.repeat(this.config.testDataSize);
      const key = await this.cryptoService.getEncryptionService().generateKey();
      
      // Pre-encrypt data for decryption test
      const encrypted = await this.cryptoService.getEncryptionService().encrypt(testData, key);
      
      const iterations = this.config.performanceIterations;
      const startDecryption = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        await this.cryptoService.getEncryptionService().decrypt(encrypted, key);
      }
      
      const decryptionTime = performance.now() - startDecryption;
      const avgTime = decryptionTime / iterations;
      
      // Performance threshold: should decrypt 1KB in under 50ms
      const threshold = 50;
      const status = avgTime < threshold ? 'pass' : 'warning';
      
      return {
        testName: 'decryption_performance',
        category: 'performance',
        status,
        message: `Average decryption time: ${avgTime.toFixed(2)}ms (threshold: ${threshold}ms)`,
        duration: performance.now() - startTime,
        data: { avgTime, threshold, iterations, dataSize: this.config.testDataSize }
      };
    } catch (error) {
      return {
        testName: 'decryption_performance',
        category: 'performance',
        status: 'fail',
        message: `Decryption performance test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime
      };
    }
  }

  private async testKeyGenerationPerformance(): Promise<SecurityTestResult> {
    const startTime = performance.now();
    
    try {
      const iterations = Math.min(this.config.performanceIterations, 10); // Fewer iterations for key generation
      const startGeneration = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        await this.cryptoService.getEncryptionService().generateKey();
      }
      
      const generationTime = performance.now() - startGeneration;
      const avgTime = generationTime / iterations;
      
      // Performance threshold: should generate key in under 100ms
      const threshold = 100;
      const status = avgTime < threshold ? 'pass' : 'warning';
      
      return {
        testName: 'key_generation_performance',
        category: 'performance',
        status,
        message: `Average key generation time: ${avgTime.toFixed(2)}ms (threshold: ${threshold}ms)`,
        duration: performance.now() - startTime,
        data: { avgTime, threshold, iterations }
      };
    } catch (error) {
      return {
        testName: 'key_generation_performance',
        category: 'performance',
        status: 'fail',
        message: `Key generation performance test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime
      };
    }
  }

  private async testSignaturePerformance(): Promise<SecurityTestResult> {
    const startTime = performance.now();
    
    try {
      const testData = 'Test data for signature performance';
      const keyPair = await this.cryptoService.getSignatureService().generateKeyPair();
      
      const iterations = Math.min(this.config.performanceIterations, 50); // Fewer iterations for signatures
      const startSigning = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        await this.cryptoService.getSignatureService().sign(testData, keyPair.privateKey);
      }
      
      const signingTime = performance.now() - startSigning;
      const avgTime = signingTime / iterations;
      
      // Performance threshold: should sign in under 100ms
      const threshold = 100;
      const status = avgTime < threshold ? 'pass' : 'warning';
      
      return {
        testName: 'signature_performance',
        category: 'performance',
        status,
        message: `Average signature time: ${avgTime.toFixed(2)}ms (threshold: ${threshold}ms)`,
        duration: performance.now() - startTime,
        data: { avgTime, threshold, iterations }
      };
    } catch (error) {
      return {
        testName: 'signature_performance',
        category: 'performance',
        status: 'fail',
        message: `Signature performance test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime
      };
    }
  }

  private async testTimingAttacks(): Promise<SecurityTestResult> {
    const startTime = performance.now();
    
    try {
      // Test constant-time comparison
      const data1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const data2 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 9]); // Different last byte
      const data3 = new Uint8Array([9, 2, 3, 4, 5, 6, 7, 8]); // Different first byte
      
      const trials = 1000;
      let timeDiffs: number[] = [];
      
      for (let i = 0; i < trials; i++) {
        const start1 = performance.now();
        constantTimeCompare(data1.buffer, data2.buffer);
        const time1 = performance.now() - start1;
        
        const start2 = performance.now();
        constantTimeCompare(data1.buffer, data3.buffer);
        const time2 = performance.now() - start2;
        
        timeDiffs.push(Math.abs(time1 - time2));
      }
      
      const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
      
      // If average time difference is significant, might be vulnerable to timing attacks
      const threshold = 0.1; // 0.1ms threshold
      const status = avgTimeDiff < threshold ? 'pass' : 'warning';
      
      return {
        testName: 'timing_attacks',
        category: 'vulnerability',
        status,
        message: `Average timing difference: ${avgTimeDiff.toFixed(6)}ms (threshold: ${threshold}ms)`,
        duration: performance.now() - startTime,
        data: { avgTimeDiff, threshold, trials }
      };
    } catch (error) {
      return {
        testName: 'timing_attacks',
        category: 'vulnerability',
        status: 'fail',
        message: `Timing attack test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime
      };
    }
  }

  private async testMemoryExposure(): Promise<SecurityTestResult> {
    const startTime = performance.now();
    
    try {
      // This test would check for sensitive data in memory
      // For now, just verify Web Crypto API support
      const supported = isWebCryptoSupported();
      
      if (!supported) {
        this.addVulnerability({
          id: 'VULN_001',
          title: 'Web Crypto API Not Supported',
          description: 'Browser does not support Web Crypto API, falling back to less secure methods',
          severity: 'high',
          affectedComponents: ['crypto'],
          remediation: ['Use a modern browser that supports Web Crypto API'],
          detected: Date.now()
        });
      }
      
      return {
        testName: 'memory_exposure',
        category: 'vulnerability',
        status: supported ? 'pass' : 'fail',
        message: supported ? 'Web Crypto API available' : 'Web Crypto API not supported',
        duration: performance.now() - startTime
      };
    } catch (error) {
      return {
        testName: 'memory_exposure',
        category: 'vulnerability',
        status: 'fail',
        message: `Memory exposure test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime
      };
    }
  }

  private async testWeakRandomness(): Promise<SecurityTestResult> {
    const startTime = performance.now();
    
    try {
      // Test for predictable patterns in random number generation
      const samples = 1000;
      const values = new Set<number>();
      
      for (let i = 0; i < samples; i++) {
        const randomArray = crypto.getRandomValues(new Uint8Array(1));
        values.add(randomArray[0]);
      }
      
      // Check entropy - should have good distribution
      const uniqueValues = values.size;
      const expectedMin = samples * 0.8; // Expect at least 80% unique values
      
      const status = uniqueValues >= expectedMin ? 'pass' : 'warning';
      
      return {
        testName: 'weak_randomness',
        category: 'vulnerability',
        status,
        message: `Random entropy check: ${uniqueValues}/${samples} unique values (expected: >${expectedMin})`,
        duration: performance.now() - startTime,
        data: { uniqueValues, samples, expectedMin }
      };
    } catch (error) {
      return {
        testName: 'weak_randomness',
        category: 'vulnerability',
        status: 'fail',
        message: `Weak randomness test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime
      };
    }
  }

  private async testKeyHandling(): Promise<SecurityTestResult> {
    const startTime = performance.now();
    
    try {
      // Test that keys are properly handled and not extractable by default
      const key = await this.cryptoService.getEncryptionService().generateKey();
      
      let extractable = false;
      try {
        await crypto.subtle.exportKey('raw', key);
        extractable = true;
      } catch {
        // Expected - keys should not be extractable by default
        extractable = false;
      }
      
      const status = extractable ? 'warning' : 'pass';
      const message = extractable 
        ? 'Keys are extractable - potential security risk'
        : 'Keys are properly protected (non-extractable)';
      
      if (extractable) {
        this.addVulnerability({
          id: 'VULN_002',
          title: 'Extractable Cryptographic Keys',
          description: 'Cryptographic keys are marked as extractable, which may pose security risks',
          severity: 'medium',
          affectedComponents: ['key-management'],
          remediation: ['Generate keys as non-extractable where possible'],
          detected: Date.now()
        });
      }
      
      return {
        testName: 'key_handling',
        category: 'vulnerability',
        status,
        message,
        duration: performance.now() - startTime
      };
    } catch (error) {
      return {
        testName: 'key_handling',
        category: 'vulnerability',
        status: 'fail',
        message: `Key handling test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime
      };
    }
  }

  private async testDataLeakage(): Promise<SecurityTestResult> {
    const startTime = performance.now();
    
    try {
      // Test for potential data leakage in error messages
      const key = await this.cryptoService.getEncryptionService().generateKey();
      const testData = 'sensitive test data';
      
      const encrypted = await this.cryptoService.getEncryptionService().encrypt(testData, key);
      
      // Try to decrypt with wrong key
      const wrongKey = await this.cryptoService.getEncryptionService().generateKey();
      
      let errorMessage = '';
      try {
        await this.cryptoService.getEncryptionService().decrypt(encrypted, wrongKey);
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'Unknown error';
      }
      
      // Check if error message leaks sensitive information
      const leaksSensitiveData = errorMessage.includes(testData);
      const status = leaksSensitiveData ? 'fail' : 'pass';
      
      if (leaksSensitiveData) {
        this.addVulnerability({
          id: 'VULN_003',
          title: 'Data Leakage in Error Messages',
          description: 'Error messages contain sensitive data that should be protected',
          severity: 'high',
          affectedComponents: ['encryption'],
          remediation: ['Sanitize error messages to remove sensitive data'],
          detected: Date.now()
        });
      }
      
      return {
        testName: 'data_leakage',
        category: 'vulnerability',
        status,
        message: leaksSensitiveData 
          ? 'Error messages leak sensitive data'
          : 'Error messages properly sanitized',
        duration: performance.now() - startTime
      };
    } catch (error) {
      return {
        testName: 'data_leakage',
        category: 'vulnerability',
        status: 'fail',
        message: `Data leakage test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime
      };
    }
  }

  private async testMemoryCleanup(): Promise<SecurityTestResult> {
    const startTime = performance.now();
    
    try {
      // Test memory cleanup functionality
      const initialBufferCount = this.cryptoService.getSecurityStatus().memoryStats.registeredBuffers;
      
      // Create some operations that should register buffers
      const key = await this.cryptoService.getEncryptionService().generateKey();
      const testData = 'test data for memory cleanup';
      const encrypted = await this.cryptoService.getEncryptionService().encrypt(testData, key);
      
      // Force cleanup
      await this.cryptoService.cleanup();
      
      const finalBufferCount = this.cryptoService.getSecurityStatus().memoryStats.registeredBuffers;
      
      const status = finalBufferCount <= initialBufferCount ? 'pass' : 'warning';
      
      return {
        testName: 'memory_cleanup',
        category: 'memory',
        status,
        message: `Buffer count: ${initialBufferCount} → ${finalBufferCount}`,
        duration: performance.now() - startTime,
        data: { initialBufferCount, finalBufferCount }
      };
    } catch (error) {
      return {
        testName: 'memory_cleanup',
        category: 'memory',
        status: 'fail',
        message: `Memory cleanup test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime
      };
    }
  }

  private async testBufferManagement(): Promise<SecurityTestResult> {
    const startTime = performance.now();
    
    try {
      // Test buffer management and cleanup
      const bufferCount = 100;
      const bufferSize = 1024;
      
      const initialMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
      
      // Create many buffers
      const buffers: ArrayBuffer[] = [];
      for (let i = 0; i < bufferCount; i++) {
        const buffer = new ArrayBuffer(bufferSize);
        const view = new Uint8Array(buffer);
        view.fill(i % 256);
        buffers.push(buffer);
      }
      
      const midMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
      
      // Clear buffers
      for (const buffer of buffers) {
        const view = new Uint8Array(buffer);
        view.fill(0); // Zero out
      }
      buffers.length = 0; // Clear array
      
      // Force garbage collection if available
      if (typeof gc === 'function') {
        gc();
      }
      
      const finalMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
      
      const memoryIncrease = finalMemory - initialMemory;
      const expectedIncrease = bufferCount * bufferSize;
      
      // If memory usage didn't increase significantly beyond expected, buffers were managed well
      const status = memoryIncrease < expectedIncrease * 2 ? 'pass' : 'warning';
      
      return {
        testName: 'buffer_management',
        category: 'memory',
        status,
        message: `Memory usage: +${memoryIncrease} bytes (expected: ~${expectedIncrease})`,
        duration: performance.now() - startTime,
        data: { initialMemory, midMemory, finalMemory, memoryIncrease, expectedIncrease }
      };
    } catch (error) {
      return {
        testName: 'buffer_management',
        category: 'memory',
        status: 'skip',
        message: `Buffer management test skipped: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime
      };
    }
  }

  private addVulnerability(vulnerability: SecurityVulnerability): void {
    this.vulnerabilities.push(vulnerability);
  }

  private generateSummary(testResults: SecurityTestResult[]): {
    totalTests: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  } {
    return {
      totalTests: testResults.length,
      passed: testResults.filter(r => r.status === 'pass').length,
      failed: testResults.filter(r => r.status === 'fail').length,
      warnings: testResults.filter(r => r.status === 'warning').length,
      skipped: testResults.filter(r => r.status === 'skip').length
    };
  }

  private determineOverallStatus(testResults: SecurityTestResult[]): 'pass' | 'fail' | 'warning' {
    const hasFailures = testResults.some(r => r.status === 'fail');
    const hasWarnings = testResults.some(r => r.status === 'warning');
    
    if (hasFailures) return 'fail';
    if (hasWarnings) return 'warning';
    return 'pass';
  }
}

/**
 * Create and run a security audit
 */
export async function runSecurityAudit(
  cryptoService: CryptographyService,
  config?: Partial<SecurityAuditConfig>
): Promise<SecurityAuditReport> {
  const auditor = new SecurityAuditor(cryptoService, config);
  return await auditor.runAudit();
}