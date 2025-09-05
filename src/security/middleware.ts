/**
 * Security middleware for TabKiller extension background processes
 * Provides encryption, signature verification, and security policy enforcement
 */

import { CryptographyService, getCryptographyService } from '../crypto';
import {
  EncryptedData,
  DigitalSignature,
  CryptoError,
  CryptoErrorType,
  SecurityAuditEntry
} from '../crypto/types';
import { TabKillerError } from '../shared/types';

/**
 * Security policy configuration
 */
export interface SecurityPolicyConfig {
  /** Require encryption for sensitive data */
  requireEncryption: boolean;
  /** Require signatures for data integrity */
  requireSignatures: boolean;
  /** Maximum data age in milliseconds */
  maxDataAge: number;
  /** Allowed origins for cross-origin requests */
  allowedOrigins: string[];
  /** Enable audit logging */
  enableAuditLogging: boolean;
  /** Rate limiting configuration */
  rateLimiting: {
    enabled: boolean;
    maxRequests: number;
    windowMs: number;
  };
}

/**
 * Default security policy
 */
export const DEFAULT_SECURITY_POLICY: SecurityPolicyConfig = {
  requireEncryption: true,
  requireSignatures: true,
  maxDataAge: 24 * 60 * 60 * 1000, // 24 hours
  allowedOrigins: [],
  enableAuditLogging: true,
  rateLimiting: {
    enabled: true,
    maxRequests: 100,
    windowMs: 60 * 1000 // 1 minute
  }
};

/**
 * Request context for security operations
 */
export interface SecurityContext {
  /** Request ID for tracking */
  requestId: string;
  /** Origin of the request */
  origin?: string;
  /** User/session ID */
  userId?: string;
  /** Timestamp of the request */
  timestamp: number;
  /** Request type/category */
  requestType: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Security audit logger
 */
class SecurityAuditLogger {
  private entries: SecurityAuditEntry[] = [];
  private maxEntries = 1000;

  /**
   * Log a security event
   */
  log(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details: Record<string, any>,
    context?: string
  ): void {
    const entry: SecurityAuditEntry = {
      timestamp: Date.now(),
      event,
      severity,
      details,
      context
    };

    this.entries.push(entry);

    // Keep only recent entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Log critical events to console
    if (severity === 'critical') {
      console.error('Critical security event:', entry);
    }
  }

  /**
   * Get recent audit entries
   */
  getEntries(
    limit?: number,
    severity?: 'low' | 'medium' | 'high' | 'critical'
  ): SecurityAuditEntry[] {
    let filtered = this.entries;

    if (severity) {
      filtered = filtered.filter(entry => entry.severity === severity);
    }

    if (limit) {
      filtered = filtered.slice(-limit);
    }

    return filtered;
  }

  /**
   * Clear audit log
   */
  clear(): void {
    this.entries = [];
  }
}

/**
 * Rate limiter for security operations
 */
class RateLimiter {
  private requests = new Map<string, { count: number; resetTime: number }>();

  /**
   * Check if request is allowed
   */
  isAllowed(
    identifier: string,
    maxRequests: number,
    windowMs: number
  ): boolean {
    const now = Date.now();
    const existing = this.requests.get(identifier);

    if (!existing || now >= existing.resetTime) {
      this.requests.set(identifier, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (existing.count >= maxRequests) {
      return false;
    }

    existing.count++;
    return true;
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now();
    
    for (const [key, value] of this.requests.entries()) {
      if (now >= value.resetTime) {
        this.requests.delete(key);
      }
    }
  }
}

/**
 * Security middleware for extension operations
 */
export class SecurityMiddleware {
  private cryptoService: CryptographyService;
  private policy: SecurityPolicyConfig;
  private auditLogger: SecurityAuditLogger;
  private rateLimiter: RateLimiter;
  private initialized = false;

  constructor(policy?: Partial<SecurityPolicyConfig>) {
    this.policy = { ...DEFAULT_SECURITY_POLICY, ...policy };
    this.cryptoService = getCryptographyService();
    this.auditLogger = new SecurityAuditLogger();
    this.rateLimiter = new RateLimiter();

    // Schedule cleanup
    setInterval(() => {
      this.rateLimiter.cleanup();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Initialize the security middleware
   */
  async initialize(masterPassword?: string): Promise<void> {
    try {
      await this.cryptoService.initialize(masterPassword);
      this.initialized = true;

      this.auditLogger.log(
        'SECURITY_MIDDLEWARE_INITIALIZED',
        'low',
        { timestamp: Date.now() }
      );
    } catch (error) {
      throw new TabKillerError(
        'SECURITY_INIT_FAILED',
        'Failed to initialize security middleware',
        'background',
        error
      );
    }
  }

  /**
   * Secure outbound data (encrypt and sign)
   */
  async secureOutbound(
    data: any,
    context: SecurityContext,
    keySetId?: string
  ): Promise<{
    secured: EncryptedData;
    signature?: DigitalSignature;
    metadata: Record<string, any>;
  }> {
    this.ensureInitialized();

    try {
      // Check rate limiting
      if (this.policy.rateLimiting.enabled) {
        const identifier = context.userId || context.origin || 'anonymous';
        
        if (!this.rateLimiter.isAllowed(
          identifier,
          this.policy.rateLimiting.maxRequests,
          this.policy.rateLimiting.windowMs
        )) {
          throw new CryptoError(
            CryptoErrorType.STORAGE_ERROR,
            'Rate limit exceeded'
          );
        }
      }

      // Generate encryption key if needed
      const effectiveKeySetId = keySetId || context.requestId;
      
      // Get or generate encryption key
      let encryptionKey = await this.cryptoService.getKeyManager().retrieveKey(
        `${effectiveKeySetId}_encryption`
      );

      if (!encryptionKey) {
        encryptionKey = await this.cryptoService.getKeyManager().generateAndStoreKey(
          `${effectiveKeySetId}_encryption`,
          'data_encryption',
          { context: context.requestType }
        );
      }

      // Encrypt data
      const encrypted = await this.cryptoService.getEncryptionService().encrypt(
        JSON.stringify(data),
        encryptionKey
      );

      let signature: DigitalSignature | undefined;

      // Sign if required
      if (this.policy.requireSignatures) {
        const signingKeyPair = await this.cryptoService.getSignatureService().generateKeyPair();
        signature = await this.cryptoService.getSignatureService().sign(
          JSON.stringify(encrypted),
          signingKeyPair.privateKey
        );
      }

      // Create metadata
      const metadata = {
        keySetId: effectiveKeySetId,
        requestId: context.requestId,
        timestamp: context.timestamp,
        origin: context.origin,
        requestType: context.requestType,
        encrypted: true,
        signed: !!signature
      };

      // Log security event
      if (this.policy.enableAuditLogging) {
        this.auditLogger.log(
          'DATA_SECURED',
          'low',
          {
            requestId: context.requestId,
            dataSize: JSON.stringify(data).length,
            encrypted: true,
            signed: !!signature
          },
          context.requestType
        );
      }

      return { secured: encrypted, signature, metadata };
    } catch (error) {
      // Log security failure
      this.auditLogger.log(
        'DATA_SECURING_FAILED',
        'high',
        {
          requestId: context.requestId,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        context.requestType
      );

      throw error;
    }
  }

  /**
   * Verify and decrypt inbound data
   */
  async verifyInbound(
    secured: EncryptedData,
    signature: DigitalSignature | undefined,
    metadata: Record<string, any>,
    context: SecurityContext
  ): Promise<any> {
    this.ensureInitialized();

    try {
      // Validate data age
      const dataAge = Date.now() - (metadata.timestamp || 0);
      if (dataAge > this.policy.maxDataAge) {
        throw new CryptoError(
          CryptoErrorType.INVALID_DATA,
          'Data too old to process'
        );
      }

      // Verify signature if present and required
      if (this.policy.requireSignatures) {
        if (!signature) {
          throw new CryptoError(
            CryptoErrorType.VERIFICATION_FAILED,
            'Signature required but not provided'
          );
        }

        const isValid = await this.cryptoService.getSignatureService().verify(
          JSON.stringify(secured),
          signature
        );

        if (!isValid) {
          throw new CryptoError(
            CryptoErrorType.VERIFICATION_FAILED,
            'Signature verification failed'
          );
        }
      }

      // Get decryption key
      const encryptionKey = await this.cryptoService.getKeyManager().retrieveKey(
        `${metadata.keySetId}_encryption`
      );

      if (!encryptionKey) {
        throw new CryptoError(
          CryptoErrorType.INVALID_KEY,
          `Decryption key not found: ${metadata.keySetId}`
        );
      }

      // Decrypt data
      const decrypted = await this.cryptoService.getEncryptionService().decrypt(
        secured,
        encryptionKey
      );

      const data = JSON.parse(new TextDecoder().decode(decrypted));

      // Log successful verification
      if (this.policy.enableAuditLogging) {
        this.auditLogger.log(
          'DATA_VERIFIED',
          'low',
          {
            requestId: context.requestId,
            keySetId: metadata.keySetId,
            signed: !!signature,
            dataAge
          },
          context.requestType
        );
      }

      return data;
    } catch (error) {
      // Log security failure
      this.auditLogger.log(
        'DATA_VERIFICATION_FAILED',
        'high',
        {
          requestId: context.requestId,
          keySetId: metadata.keySetId,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        context.requestType
      );

      throw error;
    }
  }

  /**
   * Validate request origin
   */
  validateOrigin(origin: string, context: SecurityContext): boolean {
    // Allow empty origin (extension internal requests)
    if (!origin) {
      return true;
    }

    // Check allowed origins
    if (this.policy.allowedOrigins.length > 0) {
      const isAllowed = this.policy.allowedOrigins.some(allowed => {
        return origin === allowed || origin.endsWith(`.${allowed}`);
      });

      if (!isAllowed) {
        this.auditLogger.log(
          'ORIGIN_VALIDATION_FAILED',
          'medium',
          {
            requestId: context.requestId,
            origin,
            allowedOrigins: this.policy.allowedOrigins
          },
          context.requestType
        );

        return false;
      }
    }

    return true;
  }

  /**
   * Create security context for a request
   */
  createSecurityContext(
    requestType: string,
    options: {
      origin?: string;
      userId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): SecurityContext {
    return {
      requestId: crypto.randomUUID(),
      origin: options.origin,
      userId: options.userId,
      timestamp: Date.now(),
      requestType,
      metadata: options.metadata
    };
  }

  /**
   * Get security audit entries
   */
  getAuditEntries(
    limit?: number,
    severity?: 'low' | 'medium' | 'high' | 'critical'
  ): SecurityAuditEntry[] {
    return this.auditLogger.getEntries(limit, severity);
  }

  /**
   * Clear security audit log
   */
  clearAuditLog(): void {
    this.auditLogger.clear();
  }

  /**
   * Update security policy
   */
  updatePolicy(newPolicy: Partial<SecurityPolicyConfig>): void {
    this.policy = { ...this.policy, ...newPolicy };

    this.auditLogger.log(
      'SECURITY_POLICY_UPDATED',
      'medium',
      { updatedFields: Object.keys(newPolicy) }
    );
  }

  /**
   * Get current security policy
   */
  getPolicy(): SecurityPolicyConfig {
    return { ...this.policy };
  }

  /**
   * Get security status
   */
  getSecurityStatus(): {
    initialized: boolean;
    policy: SecurityPolicyConfig;
    auditEntryCount: number;
    cryptoServiceStatus: any;
  } {
    return {
      initialized: this.initialized,
      policy: this.policy,
      auditEntryCount: this.auditLogger.getEntries().length,
      cryptoServiceStatus: this.cryptoService.getSecurityStatus()
    };
  }

  /**
   * Emergency security reset
   */
  async emergencyReset(): Promise<void> {
    this.auditLogger.log(
      'EMERGENCY_SECURITY_RESET',
      'critical',
      { timestamp: Date.now() }
    );

    await this.cryptoService.reset();
    this.auditLogger.clear();
    this.initialized = false;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new TabKillerError(
        'SECURITY_NOT_INITIALIZED',
        'Security middleware not initialized',
        'background'
      );
    }
  }
}

/**
 * Message handler with security middleware
 */
export class SecureMessageHandler {
  private securityMiddleware: SecurityMiddleware;

  constructor(securityMiddleware: SecurityMiddleware) {
    this.securityMiddleware = securityMiddleware;
  }

  /**
   * Handle secure message from content script or popup
   */
  async handleSecureMessage(
    message: {
      type: string;
      data?: any;
      secured?: EncryptedData;
      signature?: DigitalSignature;
      metadata?: Record<string, any>;
    },
    sender: chrome.runtime.MessageSender
  ): Promise<any> {
    const context = this.securityMiddleware.createSecurityContext(
      message.type,
      {
        origin: sender.origin || sender.url,
        userId: sender.tab?.id?.toString()
      }
    );

    // Validate origin
    if (sender.origin && !this.securityMiddleware.validateOrigin(sender.origin, context)) {
      throw new TabKillerError(
        'INVALID_ORIGIN',
        `Request from unauthorized origin: ${sender.origin}`,
        'background'
      );
    }

    let data = message.data;

    // If data is secured, verify and decrypt it
    if (message.secured && message.metadata) {
      data = await this.securityMiddleware.verifyInbound(
        message.secured,
        message.signature,
        message.metadata,
        context
      );
    }

    // Process the message based on type
    const response = await this.processMessage(message.type, data, context);

    // Secure response if needed
    if (response && typeof response === 'object') {
      return await this.securityMiddleware.secureOutbound(response, context);
    }

    return response;
  }

  private async processMessage(
    messageType: string,
    data: any,
    context: SecurityContext
  ): Promise<any> {
    // This would be implemented based on specific message types
    // For now, just echo back the data for testing
    return {
      type: `${messageType}_response`,
      data,
      context: {
        requestId: context.requestId,
        timestamp: context.timestamp
      }
    };
  }
}

/**
 * Create and initialize security middleware
 */
export async function createSecurityMiddleware(
  masterPassword?: string,
  policy?: Partial<SecurityPolicyConfig>
): Promise<SecurityMiddleware> {
  const middleware = new SecurityMiddleware(policy);
  await middleware.initialize(masterPassword);
  return middleware;
}