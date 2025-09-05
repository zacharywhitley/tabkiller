/**
 * Unit tests for PrivacyFilter
 */

import { PrivacyFilter } from '../../utils/PrivacyFilter';
import { TrackingConfig, BrowsingEvent } from '../../shared/types';

describe('PrivacyFilter', () => {
  let privacyFilter: PrivacyFilter;
  let mockConfig: TrackingConfig;

  beforeEach(() => {
    mockConfig = {
      enableTabTracking: true,
      enableWindowTracking: true,
      enableNavigationTracking: true,
      enableSessionTracking: true,
      enableFormTracking: true,
      enableScrollTracking: true,
      enableClickTracking: true,
      privacyMode: 'moderate',
      excludeIncognito: true,
      excludeDomains: ['blocked-site.com'],
      includeDomains: [],
      sensitiveFieldFilters: ['password', 'ssn'],
      batchSize: 50,
      batchInterval: 30000,
      maxEventsInMemory: 1000,
      storageCleanupInterval: 3600000,
      idleThreshold: 300000,
      sessionGapThreshold: 600000,
      domainChangeSessionBoundary: false,
      enableProductivityMetrics: true,
      deepWorkThreshold: 900000,
      distractionThreshold: 30000
    };

    privacyFilter = new PrivacyFilter(mockConfig);
  });

  describe('event filtering', () => {
    it('should allow safe events', async () => {
      const safeEvent: BrowsingEvent = {
        id: 'test1',
        timestamp: Date.now(),
        type: 'tab_created',
        sessionId: 'session1',
        url: 'https://example.com',
        title: 'Example Page',
        metadata: {}
      };

      const result = await privacyFilter.filter(safeEvent);
      expect(result).not.toBeNull();
      expect(result?.url).toBe('https://example.com');
    });

    it('should block events from excluded domains', async () => {
      const blockedEvent: BrowsingEvent = {
        id: 'test2',
        timestamp: Date.now(),
        type: 'tab_created',
        sessionId: 'session1',
        url: 'https://blocked-site.com/page',
        title: 'Blocked Page',
        metadata: {}
      };

      const result = await privacyFilter.filter(blockedEvent);
      expect(result).toBeNull();
    });

    it('should block incognito events when configured', async () => {
      const incognitoEvent: BrowsingEvent = {
        id: 'test3',
        timestamp: Date.now(),
        type: 'tab_created',
        sessionId: 'session1',
        url: 'https://example.com',
        title: 'Example Page',
        metadata: { isIncognito: true }
      };

      const result = await privacyFilter.filter(incognitoEvent);
      expect(result).toBeNull();
    });

    it('should allow incognito events when configured to allow them', async () => {
      const allowIncognitoConfig = { ...mockConfig, excludeIncognito: false };
      const permissiveFilter = new PrivacyFilter(allowIncognitoConfig);

      const incognitoEvent: BrowsingEvent = {
        id: 'test4',
        timestamp: Date.now(),
        type: 'tab_created',
        sessionId: 'session1',
        url: 'https://example.com',
        title: 'Example Page',
        metadata: { isIncognito: true }
      };

      const result = await permissiveFilter.filter(incognitoEvent);
      expect(result).not.toBeNull();
    });
  });

  describe('URL sanitization', () => {
    it('should sanitize URLs in strict mode', async () => {
      const strictConfig = { ...mockConfig, privacyMode: 'strict' as const };
      const strictFilter = new PrivacyFilter(strictConfig);

      const eventWithParams: BrowsingEvent = {
        id: 'test5',
        timestamp: Date.now(),
        type: 'navigation_completed',
        sessionId: 'session1',
        url: 'https://example.com/page?search=private&token=secret123',
        title: 'Search Results',
        metadata: {}
      };

      const result = await strictFilter.filter(eventWithParams);
      expect(result?.url).toBe('https://example.com/page');
    });

    it('should partially sanitize URLs in moderate mode', async () => {
      const eventWithParams: BrowsingEvent = {
        id: 'test6',
        timestamp: Date.now(),
        type: 'navigation_completed',
        sessionId: 'session1',
        url: 'https://example.com/page?search=cats&token=secret123&utm_source=google',
        title: 'Search Results',
        metadata: {}
      };

      const result = await privacyFilter.filter(eventWithParams);
      expect(result?.url).toContain('search=cats');
      expect(result?.url).not.toContain('token=secret123');
      expect(result?.url).not.toContain('utm_source=google');
    });

    it('should minimally sanitize URLs in minimal mode', async () => {
      const minimalConfig = { ...mockConfig, privacyMode: 'minimal' as const };
      const minimalFilter = new PrivacyFilter(minimalConfig);

      const eventWithParams: BrowsingEvent = {
        id: 'test7',
        timestamp: Date.now(),
        type: 'navigation_completed',
        sessionId: 'session1',
        url: 'https://example.com/page?search=cats&password=secret123',
        title: 'Search Results',
        metadata: {}
      };

      const result = await minimalFilter.filter(eventWithParams);
      expect(result?.url).toContain('search=cats');
      expect(result?.url).not.toContain('password=secret123');
    });
  });

  describe('title sanitization', () => {
    it('should sanitize sensitive titles', async () => {
      const sensitiveEvent: BrowsingEvent = {
        id: 'test8',
        timestamp: Date.now(),
        type: 'navigation_completed',
        sessionId: 'session1',
        url: 'https://example.com',
        title: 'Login to your account with password: secret123',
        metadata: {}
      };

      const result = await privacyFilter.filter(sensitiveEvent);
      expect(result?.title).toContain('[REDACTED]');
      expect(result?.title).not.toContain('secret123');
    });

    it('should preserve safe titles', async () => {
      const safeEvent: BrowsingEvent = {
        id: 'test9',
        timestamp: Date.now(),
        type: 'navigation_completed',
        sessionId: 'session1',
        url: 'https://example.com',
        title: 'Welcome to Example.com - Your trusted partner',
        metadata: {}
      };

      const result = await privacyFilter.filter(safeEvent);
      expect(result?.title).toBe('Welcome to Example.com - Your trusted partner');
    });
  });

  describe('metadata sanitization', () => {
    it('should remove form data in strict mode', async () => {
      const strictConfig = { ...mockConfig, privacyMode: 'strict' as const };
      const strictFilter = new PrivacyFilter(strictConfig);

      const eventWithFormData: BrowsingEvent = {
        id: 'test10',
        timestamp: Date.now(),
        type: 'form_interaction',
        sessionId: 'session1',
        url: 'https://example.com',
        title: 'Form Page',
        metadata: {
          formData: [
            { name: 'username', type: 'text', value: 'john', required: true },
            { name: 'password', type: 'password', value: 'secret', required: true }
          ]
        }
      };

      const result = await strictFilter.filter(eventWithFormData);
      expect(result?.metadata.formData).toBeUndefined();
    });

    it('should filter sensitive form fields in moderate mode', async () => {
      const eventWithFormData: BrowsingEvent = {
        id: 'test11',
        timestamp: Date.now(),
        type: 'form_interaction',
        sessionId: 'session1',
        url: 'https://example.com',
        title: 'Form Page',
        metadata: {
          formData: [
            { name: 'username', type: 'text', value: 'john', required: true },
            { name: 'password', type: 'password', value: 'secret', required: true },
            { name: 'email', type: 'email', value: 'john@example.com', required: false }
          ]
        }
      };

      const result = await privacyFilter.filter(eventWithFormData);
      expect(Array.isArray(result?.metadata.formData)).toBe(true);
      
      const formFields = result?.metadata.formData as any[];
      expect(formFields.length).toBeLessThan(3); // Some fields should be filtered
      expect(formFields.some((f: any) => f.name === 'username')).toBe(true);
      expect(formFields.some((f: any) => f.name === 'password')).toBe(false);
    });
  });

  describe('sensitive URL detection', () => {
    it('should block sensitive URLs', async () => {
      const sensitiveUrls = [
        'https://example.com/login',
        'https://example.com/signin',
        'https://example.com/password-reset',
        'https://example.com/payment',
        'https://example.com/checkout',
        'https://example.com/admin'
      ];

      for (const url of sensitiveUrls) {
        const sensitiveEvent: BrowsingEvent = {
          id: `test_${Date.now()}`,
          timestamp: Date.now(),
          type: 'navigation_completed',
          sessionId: 'session1',
          url,
          title: 'Sensitive Page',
          metadata: {}
        };

        const result = await privacyFilter.filter(sensitiveEvent);
        expect(result).toBeNull();
      }
    });

    it('should allow non-sensitive URLs', async () => {
      const safeUrls = [
        'https://example.com',
        'https://example.com/about',
        'https://example.com/products',
        'https://example.com/blog/post-123'
      ];

      for (const url of safeUrls) {
        const safeEvent: BrowsingEvent = {
          id: `test_${Date.now()}`,
          timestamp: Date.now(),
          type: 'navigation_completed',
          sessionId: 'session1',
          url,
          title: 'Safe Page',
          metadata: {}
        };

        const result = await privacyFilter.filter(safeEvent);
        expect(result).not.toBeNull();
      }
    });
  });

  describe('domain filtering', () => {
    it('should respect include domains when specified', async () => {
      const includeConfig = { 
        ...mockConfig, 
        includeDomains: ['allowed.com'],
        excludeDomains: []
      };
      const includeFilter = new PrivacyFilter(includeConfig);

      const allowedEvent: BrowsingEvent = {
        id: 'test12',
        timestamp: Date.now(),
        type: 'tab_created',
        sessionId: 'session1',
        url: 'https://allowed.com/page',
        title: 'Allowed Page',
        metadata: {}
      };

      const blockedEvent: BrowsingEvent = {
        id: 'test13',
        timestamp: Date.now(),
        type: 'tab_created',
        sessionId: 'session1',
        url: 'https://other.com/page',
        title: 'Other Page',
        metadata: {}
      };

      expect(await includeFilter.filter(allowedEvent)).not.toBeNull();
      expect(await includeFilter.filter(blockedEvent)).toBeNull();
    });
  });

  describe('configuration updates', () => {
    it('should update configuration', async () => {
      const newConfig = { ...mockConfig, privacyMode: 'strict' as const };
      await expect(privacyFilter.updateConfig(newConfig)).resolves.toBeUndefined();
    });
  });

  describe('privacy statistics', () => {
    it('should provide privacy statistics', () => {
      const stats = privacyFilter.getPrivacyStats();
      
      expect(stats).toHaveProperty('privacyMode');
      expect(stats).toHaveProperty('excludedDomains');
      expect(stats).toHaveProperty('includedDomains');
      expect(stats.privacyMode).toBe('moderate');
    });
  });

  describe('URL testing', () => {
    it('should test URL filtering without processing', () => {
      const safeUrl = 'https://example.com';
      const blockedUrl = 'https://blocked-site.com';
      const sensitiveUrl = 'https://example.com/login';

      expect(privacyFilter.testUrl(safeUrl).allowed).toBe(true);
      expect(privacyFilter.testUrl(blockedUrl).allowed).toBe(false);
      expect(privacyFilter.testUrl(sensitiveUrl).allowed).toBe(false);
    });
  });

  describe('configuration validation', () => {
    it('should validate configuration', () => {
      const validation = privacyFilter.validateConfig();
      expect(validation).toHaveProperty('valid');
      expect(validation).toHaveProperty('issues');
      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should detect conflicting configuration', () => {
      const conflictingConfig = {
        ...mockConfig,
        excludeDomains: ['example.com'],
        includeDomains: ['example.com']
      };
      const conflictingFilter = new PrivacyFilter(conflictingConfig);
      
      const validation = conflictingFilter.validateConfig();
      expect(validation.valid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
    });
  });
});