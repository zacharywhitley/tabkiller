# TabKiller Security Architecture

This document outlines the comprehensive security architecture implemented in TabKiller for protecting user browsing data and ensuring privacy.

## Overview

TabKiller implements a multi-layered security approach using modern Web Crypto API standards with backward compatibility fallbacks. All sensitive browsing data is encrypted client-side before storage or transmission.

## Security Components

### 1. Cryptographic Foundation (`src/crypto/`)

#### Encryption Service (`encryption.ts`)
- **Algorithm**: AES-GCM 256-bit (authenticated encryption)
- **Key Derivation**: PBKDF2 with 100,000 iterations (configurable)
- **Initialization Vector**: 96-bit random IV per operation
- **Salt**: 256-bit random salt per key derivation
- **Performance**: Sub-50ms encryption for 1KB data

```typescript
// Usage Example
const service = new WebCryptoEncryptionService();
const key = await service.generateKey();
const encrypted = await service.encrypt("sensitive data", key);
const decrypted = await service.decrypt(encrypted, key);
```

#### Digital Signatures (`signatures.ts`)
- **Primary Algorithm**: Ed25519 (Edwards-curve Digital Signature Algorithm)
- **Fallback**: ECDSA P-256 for broader browser compatibility
- **Features**: Data integrity, authentication, non-repudiation
- **Support**: JSON signing, batch operations, signature chains

```typescript
// Usage Example  
const sigService = new DigitalSignatureService();
const keyPair = await sigService.generateKeyPair();
const signature = await sigService.sign("data", keyPair.privateKey);
const isValid = await sigService.verify("data", signature, keyPair.publicKey);
```

### 2. Key Management (`src/crypto/key-storage.ts`)

#### Secure Key Storage
- **Storage**: Browser extension secure storage APIs
- **Encryption**: Keys encrypted with master password-derived keys
- **Integrity**: HMAC verification for all stored keys
- **Lifecycle**: Automatic key rotation and expiration
- **Cross-device**: Export/import functionality for synchronization

#### Key Manager
- **Caching**: Session-based key caching with TTL
- **Generation**: Cryptographically secure key generation
- **Rotation**: Transparent key rotation with backward compatibility
- **Cleanup**: Automatic memory cleanup of sensitive data

### 3. Security Middleware (`src/security/middleware.ts`)

#### Request Security
- **Origin Validation**: Configurable allowed origins list
- **Rate Limiting**: Configurable request rate limits
- **Encryption Pipeline**: Automatic encrypt/decrypt for requests
- **Audit Logging**: Comprehensive security event logging

#### Security Policies
- **Encryption Required**: Enforce encryption for sensitive data
- **Signature Required**: Require digital signatures for integrity
- **Data Age Limits**: Configurable maximum data age
- **Memory Safety**: Automatic cleanup of sensitive memory

### 4. Security Auditing (`src/security/audit.ts`)

#### Vulnerability Detection
- **Timing Attacks**: Constant-time operation verification
- **Memory Leaks**: Sensitive data exposure detection
- **Cryptographic Correctness**: Algorithm implementation validation
- **Performance Monitoring**: Encryption/decryption performance tracking

#### Audit Framework
- **Automated Testing**: Comprehensive security test suite
- **Vulnerability Scanning**: Continuous security assessment
- **Performance Benchmarking**: Crypto operation performance monitoring
- **Compliance Reporting**: OWASP guideline compliance verification

## Data Protection

### Encrypted Data Fields

The following data types are automatically encrypted:

```typescript
const ENCRYPTED_FIELDS = {
  Page: ['url', 'title', 'html', 'mhtml', 'screenshot', 'forms'],
  Session: ['purpose', 'notes'], 
  User: ['userAgent', 'screenResolution'],
  Device: ['userAgent', 'name'],
  FormField: ['value']
};
```

### Encryption Format

```typescript
interface EncryptedData {
  data: string;        // Base64 encrypted content
  iv: string;          // Base64 initialization vector  
  salt: string;        // Base64 salt for key derivation
  authTag?: string;    // Base64 authentication tag (AES-GCM)
  algorithm: string;   // Encryption algorithm used
  kdf: string;         // Key derivation function
  iterations: number;  // PBKDF2 iterations
  version: string;     // Format version for compatibility
  timestamp: number;   // Encryption timestamp
}
```

## Security Guarantees

### Confidentiality
- All sensitive data encrypted with AES-GCM 256-bit
- Unique encryption key per user session
- Key derivation using PBKDF2 with high iteration count
- No plaintext storage of sensitive information

### Integrity  
- Authenticated encryption prevents tampering
- Digital signatures verify data authenticity
- HMAC integrity verification for stored keys
- Constant-time comparison prevents timing attacks

### Availability
- Graceful degradation with fallback mechanisms
- Performance optimized for <50ms operations
- Memory efficient with automatic cleanup
- Error handling with detailed audit logging

### Privacy
- Client-side encryption (zero-knowledge architecture)
- No sensitive data transmitted in plaintext
- User-controlled encryption keys
- Secure memory handling with explicit cleanup

## Browser Compatibility

### Web Crypto API Support
- **Chrome/Chromium 88+**: Full support
- **Firefox 91+**: Complete compatibility  
- **Safari 14+**: Web Crypto API with fallbacks
- **Edge**: Full feature support

### Fallback Strategy
```typescript
// Automatic detection and fallback
if (isWebCryptoSupported()) {
  // Use Web Crypto API (preferred)
  service = new WebCryptoEncryptionService();
} else {
  // Fallback to CryptoJS (legacy support)
  service = new LegacyCryptoService();
}
```

## Performance Specifications

### Encryption Performance
- **AES-GCM Encryption**: <50ms for 1KB data
- **Key Derivation**: ~80ms for 100k PBKDF2 iterations  
- **Digital Signatures**: <100ms signing time
- **Memory Overhead**: ~200 bytes per encrypted item

### Storage Efficiency  
- **Compression**: Automatic data compression before encryption
- **Batching**: Efficient batch operations for multiple items
- **Caching**: Smart key caching reduces derivation overhead
- **Cleanup**: Automatic memory cleanup prevents leaks

## Security Configuration

### Default Configuration
```typescript
const DEFAULT_CONFIG = {
  algorithm: EncryptionAlgorithm.AES_GCM,
  keySize: 32,           // 256 bits
  ivLength: 12,          // 96 bits for AES-GCM
  saltLength: 32,        // 256 bits  
  keyDerivationIterations: 100000, // OWASP minimum
  version: '1.0.0'
};
```

### Customizable Settings
- PBKDF2 iteration count (security vs performance)
- Key cache TTL (memory vs performance)
- Rate limiting thresholds  
- Audit logging verbosity
- Storage cleanup intervals

## Development Guidelines

### Security Best Practices
1. **Never log sensitive data** - Use sanitized logging
2. **Clear sensitive memory** - Explicit cleanup in finally blocks
3. **Validate all inputs** - Sanitize before encryption
4. **Use constant-time operations** - Prevent timing attacks
5. **Implement proper error handling** - Avoid information leakage

### Code Review Checklist
- [ ] Sensitive data encrypted before storage
- [ ] Key material properly protected
- [ ] Memory cleanup in error paths
- [ ] Input validation implemented
- [ ] Audit logging for security events
- [ ] Performance benchmarks met
- [ ] Browser compatibility verified
- [ ] Test coverage >95%

## Compliance and Standards

### Standards Compliance
- **OWASP**: Web Application Security Guidelines
- **Web Crypto API**: W3C Standard Implementation  
- **RFC 5246**: TLS/SSL Cryptographic Standards
- **FIPS 140-2**: Federal Information Processing Standards

### Privacy Compliance
- **GDPR**: Data protection by design and by default
- **CCPA**: California Consumer Privacy Act compliance
- **SOC 2**: Security controls for service organizations
- **ISO 27001**: Information security management

## Incident Response

### Security Incident Procedures
1. **Detection**: Automated vulnerability scanning
2. **Assessment**: Security audit and impact analysis  
3. **Containment**: Emergency security reset capabilities
4. **Recovery**: Key rotation and data re-encryption
5. **Learning**: Post-incident security improvements

### Emergency Controls
- **Emergency Reset**: `SecurityService.emergencyReset()`
- **Key Rotation**: Transparent key rotation with re-encryption
- **Audit Trail**: Complete security event logging
- **Isolation**: Disable compromised components

## Future Roadmap

### Planned Enhancements
- **Hardware Security**: WebAuthn integration for enhanced key protection
- **Advanced Auditing**: Real-time security monitoring and alerting  
- **Key Escrow**: Optional enterprise key recovery mechanisms
- **Quantum Readiness**: Post-quantum cryptography preparation

### Integration Points
- **SSB Protocol**: Secure peer-to-peer synchronization
- **Enterprise Features**: Advanced key management for organizations
- **Mobile Support**: React Native cryptographic integration
- **Cloud Backup**: Optional encrypted cloud key storage

---

For technical details, see the implementation in `src/crypto/` and `src/security/` directories.
For security questions or concerns, please review the audit framework in `src/security/audit.ts`.