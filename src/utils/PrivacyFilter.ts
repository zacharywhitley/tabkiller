/**
 * Privacy filtering and data sanitization utilities
 * Ensures sensitive data is not collected or stored
 */

import {
  BrowsingEvent,
  TrackingConfig,
  PrivacyMode,
  FormField,
  EventMetadata
} from '../shared/types';

interface PrivacyRules {
  excludeDomains: Set<string>;
  includeDomains: Set<string>;
  sensitiveUrlPatterns: RegExp[];
  sensitiveFieldNames: Set<string>;
  sensitiveFieldTypes: Set<string>;
  allowedEventTypes: Set<string>;
  dataRetentionDays: number;
}

interface FilterResult {
  allowed: boolean;
  filteredEvent?: BrowsingEvent;
  reason?: string;
}

export class PrivacyFilter {
  private config: TrackingConfig;
  private rules: PrivacyRules;

  constructor(config: TrackingConfig) {
    this.config = config;
    this.rules = this.buildPrivacyRules(config);
  }

  /**
   * Filter a browsing event according to privacy rules
   */
  async filter(event: BrowsingEvent): Promise<BrowsingEvent | null> {
    const result = await this.evaluateEvent(event);
    return result.allowed ? result.filteredEvent || event : null;
  }

  /**
   * Evaluate if an event should be allowed and apply filtering
   */
  private async evaluateEvent(event: BrowsingEvent): Promise<FilterResult> {
    // Check if event type is allowed
    if (!this.isEventTypeAllowed(event.type)) {
      return { allowed: false, reason: 'event_type_blocked' };
    }

    // Check domain filtering
    if (event.url) {
      const domainCheck = this.evaluateDomain(event.url);
      if (!domainCheck.allowed) {
        return domainCheck;
      }
    }

    // Check for sensitive URLs
    if (event.url && this.isSensitiveUrl(event.url)) {
      return { allowed: false, reason: 'sensitive_url' };
    }

    // Check for incognito mode
    if (event.metadata?.isIncognito && this.config.excludeIncognito) {
      return { allowed: false, reason: 'incognito_mode' };
    }

    // Apply privacy-specific filtering based on mode
    const filteredEvent = await this.applyPrivacyFiltering(event);
    
    return { allowed: true, filteredEvent };
  }

  /**
   * Apply privacy filtering based on configured privacy mode
   */
  private async applyPrivacyFiltering(event: BrowsingEvent): Promise<BrowsingEvent> {
    const filteredEvent = { ...event };

    switch (this.config.privacyMode) {
      case 'strict':
        return this.applyStrictFiltering(filteredEvent);
      case 'moderate':
        return this.applyModerateFiltering(filteredEvent);
      case 'minimal':
        return this.applyMinimalFiltering(filteredEvent);
      default:
        return filteredEvent;
    }
  }

  /**
   * Apply strict privacy filtering
   */
  private applyStrictFiltering(event: BrowsingEvent): BrowsingEvent {
    // Remove sensitive metadata
    event.metadata = this.sanitizeMetadata(event.metadata, 'strict');

    // Sanitize URLs - remove query parameters
    if (event.url) {
      event.url = this.sanitizeUrl(event.url, 'strict');
    }

    // Remove titles that might contain sensitive information
    if (event.title && this.isSensitiveTitle(event.title)) {
      event.title = this.sanitizeTitle(event.title);
    }

    // Mark as filtered
    event.metadata.sensitiveDataFiltered = true;

    return event;
  }

  /**
   * Apply moderate privacy filtering
   */
  private applyModerateFiltering(event: BrowsingEvent): BrowsingEvent {
    // Remove sensitive metadata
    event.metadata = this.sanitizeMetadata(event.metadata, 'moderate');

    // Sanitize URLs - remove sensitive query parameters only
    if (event.url) {
      event.url = this.sanitizeUrl(event.url, 'moderate');
    }

    // Sanitize titles with sensitive patterns
    if (event.title && this.containsSensitivePatterns(event.title)) {
      event.title = this.sanitizeTitle(event.title);
    }

    // Mark as filtered if any changes were made
    if (event.url !== event.url || event.title !== event.title) {
      event.metadata.sensitiveDataFiltered = true;
    }

    return event;
  }

  /**
   * Apply minimal privacy filtering
   */
  private applyMinimalFiltering(event: BrowsingEvent): BrowsingEvent {
    // Only remove obviously sensitive data
    event.metadata = this.sanitizeMetadata(event.metadata, 'minimal');

    // Only remove specific sensitive query parameters
    if (event.url) {
      const originalUrl = event.url;
      event.url = this.sanitizeUrl(event.url, 'minimal');
      
      if (event.url !== originalUrl) {
        event.metadata.sensitiveDataFiltered = true;
      }
    }

    return event;
  }

  /**
   * Sanitize URL based on privacy level
   */
  private sanitizeUrl(url: string, level: PrivacyMode): string {
    try {
      const urlObj = new URL(url);
      
      switch (level) {
        case 'strict':
          // Remove all query parameters and hash
          urlObj.search = '';
          urlObj.hash = '';
          break;
          
        case 'moderate':
          // Remove sensitive query parameters
          this.removeSensitiveQueryParams(urlObj, 'moderate');
          break;
          
        case 'minimal':
          // Remove only obviously sensitive parameters
          this.removeSensitiveQueryParams(urlObj, 'minimal');
          break;
      }
      
      return urlObj.toString();
    } catch {
      // If URL parsing fails, return original
      return url;
    }
  }

  /**
   * Remove sensitive query parameters
   */
  private removeSensitiveQueryParams(urlObj: URL, level: PrivacyMode): void {
    const params = urlObj.searchParams;
    const sensitiveParams = this.getSensitiveQueryParams(level);
    
    // Remove matching parameters
    for (const param of Array.from(params.keys())) {
      const paramLower = param.toLowerCase();
      
      if (sensitiveParams.some(sensitive => {
        if (typeof sensitive === 'string') {
          return paramLower.includes(sensitive);
        } else {
          return sensitive.test(param);
        }
      })) {
        params.delete(param);
      }
    }
  }

  /**
   * Get sensitive query parameter patterns by privacy level
   */
  private getSensitiveQueryParams(level: PrivacyMode): (string | RegExp)[] {
    const base = [
      'password', 'pwd', 'pass', 'token', 'auth', 'key', 'secret',
      'email', 'phone', 'ssn', 'credit', 'card', 'account',
      'session', 'sess', 'login', 'user'
    ];

    switch (level) {
      case 'strict':
        return [
          ...base,
          'q', 'query', 'search', 's', 'keyword', 'term',
          'id', 'user_id', 'uid', 'customer_id',
          'tracking', 'utm_', 'fbclid', 'gclid',
          /^utm_/, /^fb/, /^ga_/, /_id$/
        ];
        
      case 'moderate':
        return [
          ...base,
          'utm_source', 'utm_medium', 'utm_campaign',
          'fbclid', 'gclid', 'msclkid',
          /^utm_/, /^fb/
        ];
        
      case 'minimal':
        return base;
        
      default:
        return [];
    }
  }

  /**
   * Sanitize page title
   */
  private sanitizeTitle(title: string): string {
    // Remove common sensitive patterns
    const sensitivePatterns = [
      /\b[\w._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card numbers
      /\b\d{3}[\s-]?\d{2}[\s-]?\d{4}\b/g, // SSN patterns
      /\b(?:password|pwd|pass|token|key|secret)[\s:=]+\S+/gi, // Password-like strings
    ];

    let sanitized = title;
    for (const pattern of sensitivePatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    return sanitized;
  }

  /**
   * Check if title contains sensitive patterns
   */
  private isSensitiveTitle(title: string): boolean {
    const sensitiveWords = [
      'password', 'login', 'signin', 'sign in', 'auth', 'account',
      'payment', 'checkout', 'credit card', 'billing',
      'personal', 'private', 'confidential'
    ];

    const titleLower = title.toLowerCase();
    return sensitiveWords.some(word => titleLower.includes(word));
  }

  /**
   * Check if title contains sensitive patterns (more lenient)
   */
  private containsSensitivePatterns(title: string): boolean {
    // Email pattern
    if (/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(title)) return true;
    
    // Credit card pattern
    if (/\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/.test(title)) return true;
    
    // Common sensitive keywords
    const sensitiveKeywords = ['password', 'account', 'payment', 'private'];
    const titleLower = title.toLowerCase();
    
    return sensitiveKeywords.some(keyword => titleLower.includes(keyword));
  }

  /**
   * Sanitize event metadata
   */
  private sanitizeMetadata(metadata: EventMetadata, level: PrivacyMode): EventMetadata {
    const sanitized = { ...metadata };

    // Always remove form data in strict mode
    if (level === 'strict') {
      delete sanitized.formData;
      delete sanitized.formFields;
      delete sanitized.formValues;
    }

    // Remove sensitive form data in all modes
    if (sanitized.formData) {
      sanitized.formData = this.sanitizeFormData(sanitized.formData, level);
    }

    // Remove personal identifiers in strict mode
    if (level === 'strict') {
      delete sanitized.userAgent;
      delete sanitized.ipAddress;
      delete sanitized.geolocation;
    }

    return sanitized;
  }

  /**
   * Sanitize form data
   */
  private sanitizeFormData(formData: any, level: PrivacyMode): any {
    if (Array.isArray(formData)) {
      return formData.filter(field => !this.isSensitiveFormField(field));
    }
    
    if (typeof formData === 'object' && formData !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(formData)) {
        if (!this.isSensitiveFieldName(key)) {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }
    
    return formData;
  }

  /**
   * Check if form field is sensitive
   */
  private isSensitiveFormField(field: FormField): boolean {
    return this.isSensitiveFieldName(field.name) || 
           this.isSensitiveFieldType(field.type);
  }

  /**
   * Check if field name is sensitive
   */
  private isSensitiveFieldName(name: string): boolean {
    return this.rules.sensitiveFieldNames.has(name.toLowerCase());
  }

  /**
   * Check if field type is sensitive
   */
  private isSensitiveFieldType(type: string): boolean {
    return this.rules.sensitiveFieldTypes.has(type.toLowerCase());
  }

  /**
   * Check if URL is sensitive
   */
  private isSensitiveUrl(url: string): boolean {
    return this.rules.sensitiveUrlPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Check if event type is allowed
   */
  private isEventTypeAllowed(eventType: string): boolean {
    return this.rules.allowedEventTypes.size === 0 || 
           this.rules.allowedEventTypes.has(eventType);
  }

  /**
   * Evaluate domain against include/exclude rules
   */
  private evaluateDomain(url: string): FilterResult {
    try {
      const domain = new URL(url).hostname.toLowerCase();
      
      // Check exclude list first
      if (this.rules.excludeDomains.size > 0) {
        for (const excludeDomain of this.rules.excludeDomains) {
          if (domain === excludeDomain || domain.endsWith('.' + excludeDomain)) {
            return { allowed: false, reason: 'domain_excluded' };
          }
        }
      }
      
      // Check include list
      if (this.rules.includeDomains.size > 0) {
        let included = false;
        for (const includeDomain of this.rules.includeDomains) {
          if (domain === includeDomain || domain.endsWith('.' + includeDomain)) {
            included = true;
            break;
          }
        }
        if (!included) {
          return { allowed: false, reason: 'domain_not_included' };
        }
      }
      
      return { allowed: true };
    } catch {
      // Invalid URL
      return { allowed: false, reason: 'invalid_url' };
    }
  }

  /**
   * Build privacy rules from configuration
   */
  private buildPrivacyRules(config: TrackingConfig): PrivacyRules {
    return {
      excludeDomains: new Set(config.excludeDomains.map(d => d.toLowerCase())),
      includeDomains: new Set(config.includeDomains.map(d => d.toLowerCase())),
      sensitiveUrlPatterns: this.buildSensitiveUrlPatterns(),
      sensitiveFieldNames: new Set([
        'password', 'pwd', 'pass', 'passwd',
        'email', 'e-mail', 'mail',
        'phone', 'tel', 'telephone', 'mobile',
        'ssn', 'social', 'social_security',
        'credit', 'card', 'cc', 'cvv', 'cvc',
        'account', 'bank', 'routing',
        'token', 'auth', 'key', 'secret',
        'pin', 'otp', 'verification',
        ...config.sensitiveFieldFilters
      ].map(f => f.toLowerCase())),
      sensitiveFieldTypes: new Set([
        'password', 'email', 'tel', 'hidden'
      ]),
      allowedEventTypes: new Set(), // Empty = allow all
      dataRetentionDays: 365 // Default retention
    };
  }

  /**
   * Build regex patterns for sensitive URLs
   */
  private buildSensitiveUrlPatterns(): RegExp[] {
    return [
      /\/login\b/i,
      /\/signin\b/i,
      /\/signup\b/i,
      /\/register\b/i,
      /\/auth\b/i,
      /\/password\b/i,
      /\/reset\b/i,
      /\/forgot\b/i,
      /\/payment\b/i,
      /\/checkout\b/i,
      /\/billing\b/i,
      /\/account\b/i,
      /\/profile\b/i,
      /\/settings\b/i,
      /\/admin\b/i,
      /\/dashboard\b/i,
      /\/private\b/i,
      /\/secure\b/i
    ];
  }

  /**
   * Update privacy configuration
   */
  async updateConfig(newConfig: TrackingConfig): Promise<void> {
    this.config = newConfig;
    this.rules = this.buildPrivacyRules(newConfig);
  }

  /**
   * Get current privacy statistics
   */
  getPrivacyStats() {
    return {
      privacyMode: this.config.privacyMode,
      excludedDomains: this.rules.excludeDomains.size,
      includedDomains: this.rules.includeDomains.size,
      sensitiveFieldFilters: this.rules.sensitiveFieldNames.size,
      sensitiveUrlPatterns: this.rules.sensitiveUrlPatterns.length
    };
  }

  /**
   * Test if a URL would be filtered
   */
  testUrl(url: string): { allowed: boolean; reason?: string } {
    try {
      const mockEvent: BrowsingEvent = {
        id: 'test',
        timestamp: Date.now(),
        type: 'navigation_completed',
        sessionId: 'test',
        url,
        metadata: {}
      };
      
      const result = this.evaluateEvent(mockEvent);
      return { 
        allowed: result.allowed, 
        reason: result.reason 
      };
    } catch (error) {
      return { 
        allowed: false, 
        reason: 'evaluation_error' 
      };
    }
  }

  /**
   * Validate privacy configuration
   */
  validateConfig(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check for conflicting include/exclude domains
    for (const includeDomain of this.rules.includeDomains) {
      if (this.rules.excludeDomains.has(includeDomain)) {
        issues.push(`Domain "${includeDomain}" is both included and excluded`);
      }
    }
    
    // Check privacy mode compatibility
    if (this.config.privacyMode === 'strict' && this.config.enableFormTracking) {
      issues.push('Strict privacy mode conflicts with form tracking');
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }
}