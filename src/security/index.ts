/**
 * TabKiller Security Layer
 * Comprehensive security utilities and middleware for the browser extension
 */

// Security middleware
export * from './middleware';

// Security audit framework
export * from './audit';

// Re-export crypto functionality for convenience
export {
  CryptographyService,
  createCryptographyService,
  getCryptographyService,
  initializeCryptographyService
} from '../crypto';

// Security utilities and helpers
import { SecurityMiddleware, createSecurityMiddleware } from './middleware';
import { SecurityAuditor, runSecurityAudit } from './audit';
import { CryptographyService } from '../crypto';

/**
 * Main security service that orchestrates all security components
 */
export class SecurityService {
  private cryptoService: CryptographyService;
  private securityMiddleware: SecurityMiddleware;
  private initialized = false;

  constructor(
    cryptoService: CryptographyService,
    securityMiddleware: SecurityMiddleware
  ) {
    this.cryptoService = cryptoService;
    this.securityMiddleware = securityMiddleware;
  }

  /**
   * Initialize the security service
   */
  async initialize(masterPassword?: string): Promise<void> {
    if (!this.cryptoService.isInitialized()) {
      await this.cryptoService.initialize(masterPassword);
    }
    
    this.initialized = true;
  }

  /**
   * Get cryptography service
   */
  getCryptoService(): CryptographyService {
    return this.cryptoService;
  }

  /**
   * Get security middleware
   */
  getMiddleware(): SecurityMiddleware {
    return this.securityMiddleware;
  }

  /**
   * Run comprehensive security audit
   */
  async runSecurityAudit(): Promise<any> {
    this.ensureInitialized();
    return await runSecurityAudit(this.cryptoService);
  }

  /**
   * Get comprehensive security status
   */
  getSecurityStatus(): {
    initialized: boolean;
    cryptoService: any;
    middleware: any;
  } {
    return {
      initialized: this.initialized,
      cryptoService: this.cryptoService.getSecurityStatus(),
      middleware: this.securityMiddleware.getSecurityStatus()
    };
  }

  /**
   * Emergency security reset
   */
  async emergencyReset(): Promise<void> {
    await this.securityMiddleware.emergencyReset();
    await this.cryptoService.reset();
    this.initialized = false;
  }

  /**
   * Cleanup all security resources
   */
  async cleanup(): Promise<void> {
    await this.cryptoService.cleanup();
    this.initialized = false;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Security service not initialized');
    }
  }
}

/**
 * Create a complete security service with all components
 */
export async function createSecurityService(
  masterPassword?: string
): Promise<SecurityService> {
  const cryptoService = new CryptographyService();
  const securityMiddleware = await createSecurityMiddleware(masterPassword);
  
  const securityService = new SecurityService(cryptoService, securityMiddleware);
  await securityService.initialize(masterPassword);
  
  return securityService;
}

/**
 * Default security service instance
 */
let defaultSecurityService: SecurityService | null = null;

/**
 * Get or create the default security service
 */
export async function getSecurityService(
  masterPassword?: string
): Promise<SecurityService> {
  if (!defaultSecurityService) {
    defaultSecurityService = await createSecurityService(masterPassword);
  }
  return defaultSecurityService;
}