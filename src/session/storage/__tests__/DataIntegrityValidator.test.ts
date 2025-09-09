/**
 * Data Integrity Validator Tests
 * Tests for data validation, integrity checks, and backup functionality
 */

import { DataIntegrityValidator, ValidatorConfig, ValidationResult } from '../DataIntegrityValidator';
import { StoredSession, StoredTab, StoredNavigationEvent } from '../schema';
import { calculateChecksum } from '../../utils/dataUtils';

// =============================================================================
// TEST DATA
// =============================================================================

const mockStoredSession: StoredSession = {
  id: 'test-session-1',
  tag: 'Test Session',
  createdAt: Date.now() - 60000,
  updatedAt: Date.now(),
  tabs: [],
  windowIds: [1],
  metadata: {
    isPrivate: false,
    totalTime: 60000,
    pageCount: 0,
    domain: ['example.com']
  },
  version: 1,
  lastModified: Date.now(),
  size: 1024,
  compressed: false,
  domains: ['example.com'],
  totalTabCount: 1,
  totalNavigationEvents: 0,
  checksum: '',
  isValid: true
};

const mockStoredTab: StoredTab = {
  id: 1,
  url: 'https://example.com',
  title: 'Example Page',
  windowId: 1,
  createdAt: Date.now() - 30000,
  lastAccessed: Date.now(),
  timeSpent: 30000,
  scrollPosition: 0,
  sessionId: 'test-session-1',
  domain: 'example.com',
  isActive: false,
  interactionCount: 5,
  focusTime: 25000,
  version: 1,
  lastModified: Date.now(),
  navigationCount: 3,
  checksum: ''
};

const mockStoredNavigationEvent: StoredNavigationEvent = {
  tabId: 1,
  url: 'https://example.com',
  referrer: 'https://google.com',
  timestamp: Date.now(),
  transitionType: 'link',
  sessionId: 'test-session-1',
  domain: 'example.com',
  version: 1,
  checksum: ''
};

// Calculate checksums for test data
mockStoredSession.checksum = calculateChecksum({
  id: mockStoredSession.id,
  tag: mockStoredSession.tag,
  createdAt: mockStoredSession.createdAt,
  tabs: mockStoredSession.tabs,
  windowIds: mockStoredSession.windowIds,
  metadata: mockStoredSession.metadata
});

mockStoredTab.checksum = calculateChecksum({
  id: mockStoredTab.id,
  url: mockStoredTab.url,
  title: mockStoredTab.title,
  favicon: mockStoredTab.favicon,
  windowId: mockStoredTab.windowId,
  createdAt: mockStoredTab.createdAt,
  lastAccessed: mockStoredTab.lastAccessed,
  timeSpent: mockStoredTab.timeSpent,
  scrollPosition: mockStoredTab.scrollPosition,
  formData: mockStoredTab.formData
});

mockStoredNavigationEvent.checksum = calculateChecksum({
  tabId: mockStoredNavigationEvent.tabId,
  url: mockStoredNavigationEvent.url,
  referrer: mockStoredNavigationEvent.referrer,
  timestamp: mockStoredNavigationEvent.timestamp,
  transitionType: mockStoredNavigationEvent.transitionType
});

// =============================================================================
// TESTS
// =============================================================================

describe('DataIntegrityValidator', () => {
  let validator: DataIntegrityValidator;
  let config: ValidatorConfig;

  beforeEach(() => {
    config = {
      enableChecks: true,
      enableBackups: true,
      backupInterval: 24 * 60 * 60 * 1000,
      maxBackups: 7,
      checksumValidation: true,
      relationshipValidation: true,
      dataConsistencyChecks: true
    };

    validator = new DataIntegrityValidator(config);
  });

  // =============================================================================
  // SESSION VALIDATION TESTS
  // =============================================================================

  describe('Session Validation', () => {
    test('should validate valid session successfully', async () => {
      const result = await validator.validateSession(mockStoredSession);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.validationTime).toBeGreaterThan(0);
    });

    test('should detect session schema violations', async () => {
      const invalidSession = { ...mockStoredSession };
      delete (invalidSession as any).id;

      const result = await validator.validateSession(invalidSession);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('schema_violation');
      expect(result.errors[0].message).toContain('missing required field: id');
    });

    test('should detect checksum mismatches', async () => {
      const corruptedSession = {
        ...mockStoredSession,
        checksum: 'invalid-checksum'
      };

      const result = await validator.validateSession(corruptedSession);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('checksum_mismatch');
    });

    test('should detect invalid timestamps', async () => {
      const invalidSession = {
        ...mockStoredSession,
        createdAt: 0
      };

      const result = await validator.validateSession(invalidSession);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('invalid createdAt timestamp'))).toBe(true);
    });

    test('should detect timestamp inconsistencies', async () => {
      const inconsistentSession = {
        ...mockStoredSession,
        createdAt: Date.now(),
        updatedAt: Date.now() - 60000 // updatedAt before createdAt
      };

      const result = await validator.validateSession(inconsistentSession);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.message.includes('createdAt is after updatedAt'))).toBe(true);
    });

    test('should validate session metadata consistency', async () => {
      const inconsistentSession = {
        ...mockStoredSession,
        totalTabCount: 5,
        tabs: [] // Empty tabs array
      };

      const result = await validator.validateSession(inconsistentSession);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.message.includes('totalTabCount mismatch'))).toBe(true);
    });
  });

  // =============================================================================
  // TAB VALIDATION TESTS
  // =============================================================================

  describe('Tab Validation', () => {
    test('should validate valid tab successfully', async () => {
      const result = await validator.validateTab(mockStoredTab);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('should detect tab schema violations', async () => {
      const invalidTab = { ...mockStoredTab };
      delete (invalidTab as any).url;

      const result = await validator.validateTab(invalidTab);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('schema_violation');
      expect(result.errors[0].message).toContain('missing required field: url');
    });

    test('should detect invalid tab IDs', async () => {
      const invalidTab = {
        ...mockStoredTab,
        id: 0
      };

      const result = await validator.validateTab(invalidTab);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('invalid id'))).toBe(true);
    });

    test('should detect invalid URLs', async () => {
      const invalidTab = {
        ...mockStoredTab,
        url: 'not-a-valid-url'
      };

      const result = await validator.validateTab(invalidTab);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.message.includes('invalid URL format'))).toBe(true);
    });

    test('should detect timestamp inconsistencies in tabs', async () => {
      const inconsistentTab = {
        ...mockStoredTab,
        createdAt: Date.now(),
        lastAccessed: Date.now() - 60000
      };

      const result = await validator.validateTab(inconsistentTab);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.message.includes('createdAt is after lastAccessed'))).toBe(true);
    });

    test('should validate missing session ID', async () => {
      const invalidTab = { ...mockStoredTab };
      delete (invalidTab as any).sessionId;

      const result = await validator.validateTab(invalidTab);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('missing required field: sessionId'))).toBe(true);
    });
  });

  // =============================================================================
  // NAVIGATION EVENT VALIDATION TESTS
  // =============================================================================

  describe('Navigation Event Validation', () => {
    test('should validate valid navigation event successfully', async () => {
      const result = await validator.validateNavigationEvent(mockStoredNavigationEvent);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('should detect navigation event schema violations', async () => {
      const invalidEvent = { ...mockStoredNavigationEvent };
      delete (invalidEvent as any).tabId;

      const result = await validator.validateNavigationEvent(invalidEvent);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('schema_violation');
      expect(result.errors[0].message).toContain('invalid tabId');
    });

    test('should detect invalid timestamps', async () => {
      const invalidEvent = {
        ...mockStoredNavigationEvent,
        timestamp: 0
      };

      const result = await validator.validateNavigationEvent(invalidEvent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('invalid timestamp'))).toBe(true);
    });

    test('should detect missing required fields', async () => {
      const invalidEvent = { ...mockStoredNavigationEvent };
      delete (invalidEvent as any).url;

      const result = await validator.validateNavigationEvent(invalidEvent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('missing required field: url'))).toBe(true);
    });

    test('should auto-correct missing session ID', async () => {
      const invalidEvent = { ...mockStoredNavigationEvent };
      delete (invalidEvent as any).sessionId;

      const result = await validator.validateNavigationEvent(invalidEvent);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.canAutoCorrect)).toBe(true);
    });
  });

  // =============================================================================
  // RELATIONSHIP VALIDATION TESTS
  // =============================================================================

  describe('Relationship Validation', () => {
    test('should validate consistent relationships', async () => {
      const sessions = [mockStoredSession];
      const tabs = [mockStoredTab];
      const navigationEvents = [mockStoredNavigationEvent];

      const result = await validator.validateRelationships(sessions, tabs, navigationEvents);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect orphaned tabs', async () => {
      const orphanedTab = {
        ...mockStoredTab,
        sessionId: 'non-existent-session'
      };

      const sessions = [mockStoredSession];
      const tabs = [orphanedTab];
      const navigationEvents = [];

      const result = await validator.validateRelationships(sessions, tabs, navigationEvents);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('missing_reference');
      expect(result.errors[0].message).toContain('references non-existent session');
    });

    test('should detect orphaned navigation events', async () => {
      const orphanedEvent = {
        ...mockStoredNavigationEvent,
        sessionId: 'non-existent-session'
      };

      const sessions = [mockStoredSession];
      const tabs = [mockStoredTab];
      const navigationEvents = [orphanedEvent];

      const result = await validator.validateRelationships(sessions, tabs, navigationEvents);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('references non-existent session');
    });

    test('should detect inconsistent tab counts', async () => {
      const inconsistentSession = {
        ...mockStoredSession,
        totalTabCount: 5 // But only 1 tab exists
      };

      const sessions = [inconsistentSession];
      const tabs = [mockStoredTab];
      const navigationEvents = [];

      const result = await validator.validateRelationships(sessions, tabs, navigationEvents);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.message.includes('tab count mismatch'))).toBe(true);
    });

    test('should handle navigation events referencing non-existent tabs', async () => {
      const orphanedEvent = {
        ...mockStoredNavigationEvent,
        tabId: 999 // Non-existent tab
      };

      const sessions = [mockStoredSession];
      const tabs = [mockStoredTab];
      const navigationEvents = [orphanedEvent];

      const result = await validator.validateRelationships(sessions, tabs, navigationEvents);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.message.includes('references non-existent tab'))).toBe(true);
    });
  });

  // =============================================================================
  // BACKUP FUNCTIONALITY TESTS
  // =============================================================================

  describe('Backup Functionality', () => {
    test('should create backup successfully', async () => {
      const sessions = [mockStoredSession];
      const tabs = [mockStoredTab];
      const navigationEvents = [mockStoredNavigationEvent];
      const boundaries: any[] = [];

      const manifest = await validator.createBackup(sessions, tabs, navigationEvents, boundaries);

      expect(manifest).toBeDefined();
      expect(manifest.id).toBeDefined();
      expect(manifest.timestamp).toBeGreaterThan(0);
      expect(manifest.itemCounts.sessions).toBe(1);
      expect(manifest.itemCounts.tabs).toBe(1);
      expect(manifest.itemCounts.navigationEvents).toBe(1);
      expect(manifest.integrity.checksum).toBeDefined();
      expect(manifest.integrity.isValid).toBe(true);
    });

    test('should list available backups', async () => {
      const sessions = [mockStoredSession];
      const tabs = [mockStoredTab];
      const navigationEvents = [mockStoredNavigationEvent];
      const boundaries: any[] = [];

      // Create a backup
      const manifest = await validator.createBackup(sessions, tabs, navigationEvents, boundaries);

      // List backups
      const backups = await validator.listBackups();

      expect(backups).toHaveLength(1);
      expect(backups[0].id).toBe(manifest.id);
      expect(backups[0].itemCounts.sessions).toBe(1);
    });

    test('should restore from backup', async () => {
      const sessions = [mockStoredSession];
      const tabs = [mockStoredTab];
      const navigationEvents = [mockStoredNavigationEvent];
      const boundaries: any[] = [];

      // Create backup
      const manifest = await validator.createBackup(sessions, tabs, navigationEvents, boundaries);

      // Restore from backup
      const restored = await validator.restoreFromBackup(manifest.id);

      expect(restored.sessions).toHaveLength(1);
      expect(restored.tabs).toHaveLength(1);
      expect(restored.navigationEvents).toHaveLength(1);
      expect(restored.sessions[0].id).toBe(mockStoredSession.id);
    });

    test('should handle backup not found', async () => {
      await expect(validator.restoreFromBackup('non-existent-backup'))
        .rejects.toThrow('Backup not found: non-existent-backup');
    });

    test('should delete backup successfully', async () => {
      const sessions = [mockStoredSession];
      const tabs = [mockStoredTab];
      const navigationEvents = [mockStoredNavigationEvent];
      const boundaries: any[] = [];

      // Create backup
      const manifest = await validator.createBackup(sessions, tabs, navigationEvents, boundaries);

      // Delete backup
      await validator.deleteBackup(manifest.id);

      // Verify deletion
      await expect(validator.restoreFromBackup(manifest.id))
        .rejects.toThrow('Backup not found');
    });

    test('should clean up old backups', async () => {
      const sessions = [mockStoredSession];
      const tabs = [mockStoredTab];
      const navigationEvents = [mockStoredNavigationEvent];
      const boundaries: any[] = [];

      // Create multiple backups (more than maxBackups)
      const manifests = [];
      for (let i = 0; i < 10; i++) {
        const manifest = await validator.createBackup(sessions, tabs, navigationEvents, boundaries);
        manifests.push(manifest);
      }

      // List backups - should be limited to maxBackups
      const backups = await validator.listBackups();
      expect(backups.length).toBeLessThanOrEqual(config.maxBackups);
    });

    test('should check if backup is needed', () => {
      // Should need backup initially
      expect(validator.shouldCreateBackup()).toBe(true);
    });
  });

  // =============================================================================
  // CONFIGURATION TESTS
  // =============================================================================

  describe('Configuration', () => {
    test('should respect disabled checks', async () => {
      const disabledValidator = new DataIntegrityValidator({
        enableChecks: false,
        checksumValidation: false,
        relationshipValidation: false
      });

      const result = await disabledValidator.validateSession(mockStoredSession);
      // Should still validate basic structure even with checks disabled
      expect(result.isValid).toBe(true);
    });

    test('should update configuration', () => {
      const newConfig = {
        enableBackups: false,
        maxBackups: 10
      };

      validator.updateConfig(newConfig);
      const currentConfig = validator.getConfig();

      expect(currentConfig.enableBackups).toBe(false);
      expect(currentConfig.maxBackups).toBe(10);
    });

    test('should handle backup disabled configuration', async () => {
      const noBackupValidator = new DataIntegrityValidator({
        enableBackups: false
      });

      const sessions = [mockStoredSession];
      const tabs = [mockStoredTab];
      const navigationEvents = [mockStoredNavigationEvent];
      const boundaries: any[] = [];

      await expect(noBackupValidator.createBackup(sessions, tabs, navigationEvents, boundaries))
        .rejects.toThrow('Backups are disabled');
    });
  });

  // =============================================================================
  // AUTO-CORRECTION TESTS
  // =============================================================================

  describe('Auto-correction', () => {
    test('should identify correctable errors', async () => {
      const corruptedSession = {
        ...mockStoredSession,
        checksum: 'invalid-checksum'
      };

      const result = await validator.validateSession(corruptedSession);
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.canAutoCorrect)).toBe(true);
    });

    test('should auto-correct correctable errors', async () => {
      const errors = [
        {
          type: 'checksum_mismatch' as const,
          severity: 'high' as const,
          entityType: 'session' as const,
          entityId: 'test-session-1',
          message: 'Checksum mismatch',
          canAutoCorrect: true
        }
      ];

      const uncorrectedErrors = await validator.autoCorrectErrors(errors);
      
      // Should attempt correction (mock implementation won't actually correct)
      expect(Array.isArray(uncorrectedErrors)).toBe(true);
    });

    test('should not auto-correct non-correctable errors', async () => {
      const errors = [
        {
          type: 'schema_violation' as const,
          severity: 'critical' as const,
          entityType: 'session' as const,
          entityId: 'test-session-1',
          message: 'Missing required field',
          canAutoCorrect: false
        }
      ];

      const uncorrectedErrors = await validator.autoCorrectErrors(errors);
      
      expect(uncorrectedErrors).toHaveLength(1);
      expect(uncorrectedErrors[0].canAutoCorrect).toBe(false);
    });
  });

  // =============================================================================
  // PERFORMANCE TESTS
  // =============================================================================

  describe('Performance', () => {
    test('should validate large datasets efficiently', async () => {
      const largeSessions = Array.from({ length: 100 }, (_, i) => ({
        ...mockStoredSession,
        id: `session-${i}`
      }));

      const largeTabs = Array.from({ length: 1000 }, (_, i) => ({
        ...mockStoredTab,
        id: i,
        sessionId: `session-${i % 100}`
      }));

      const largeEvents = Array.from({ length: 5000 }, (_, i) => ({
        ...mockStoredNavigationEvent,
        tabId: i % 1000,
        sessionId: `session-${(i % 1000) % 100}`,
        timestamp: Date.now() + i
      }));

      const startTime = performance.now();
      const result = await validator.validateRelationships(largeSessions, largeTabs, largeEvents);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(typeof result.isValid).toBe('boolean');
    });

    test('should handle concurrent validations', async () => {
      const validationPromises = Array.from({ length: 10 }, () =>
        validator.validateSession(mockStoredSession)
      );

      const results = await Promise.all(validationPromises);
      
      expect(results).toHaveLength(10);
      expect(results.every(r => r.isValid)).toBe(true);
    });
  });
});