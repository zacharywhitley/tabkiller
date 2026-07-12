/**
 * Tests for cross-browser compatibility utilities
 */

import browser from 'webextension-polyfill';
import {
  detectBrowser,
  isManifestV3,
  storage,
  tabs,
  getBrowserConfig,
  isFeatureSupported
} from '../../src/utils/cross-browser';

// The detector reads navigator.userAgent; jsdom's default UA string
// contains neither "Chrome" nor "Firefox" so detection lands on
// 'unknown' and every "should be chrome" assertion fails. Pin the UA
// to a real Chrome-shaped string for the file.
const REAL_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const originalUA = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
beforeAll(() => {
  Object.defineProperty(navigator, 'userAgent', {
    value: REAL_UA,
    configurable: true,
  });
});
afterAll(() => {
  if (originalUA) {
    Object.defineProperty(navigator, 'userAgent', originalUA);
  }
});

describe('Cross-browser utilities', () => {
  describe('detectBrowser', () => {
    test('should detect Chrome browser', () => {
      const browser = detectBrowser();
      // In test environment, should detect as chrome due to our mocks
      expect(browser).toBe('chrome');
    });
  });

  describe('isManifestV3', () => {
    test('should return true for Manifest V3', () => {
      const isV3 = isManifestV3();
      expect(isV3).toBe(true);
    });
  });

  describe('storage', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should get data from storage', async () => {
      const mockData = { key: 'value' };
      (browser.storage.local.get as jest.Mock).mockResolvedValue(mockData);

      const result = await storage.get('key');
      
      expect(browser.storage.local.get).toHaveBeenCalledWith('key');
      expect(result).toEqual(mockData);
    });

    test('should set data in storage', async () => {
      const data = { key: 'value' };
      (browser.storage.local.set as jest.Mock).mockResolvedValue(undefined);

      await storage.set(data);
      
      expect(browser.storage.local.set).toHaveBeenCalledWith(data);
    });

    test('should remove data from storage', async () => {
      (browser.storage.local.remove as jest.Mock).mockResolvedValue(undefined);

      await storage.remove('key');
      
      expect(browser.storage.local.remove).toHaveBeenCalledWith('key');
    });

    test('should clear storage', async () => {
      (browser.storage.local.clear as jest.Mock).mockResolvedValue(undefined);

      await storage.clear();
      
      expect(browser.storage.local.clear).toHaveBeenCalled();
    });
  });

  describe('tabs', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should get current tab', async () => {
      const mockTab = { id: 1, url: 'https://example.com', title: 'Example' };
      (browser.tabs.query as jest.Mock).mockResolvedValue([mockTab]);

      const result = await tabs.getCurrent();
      
      expect(browser.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
      expect(result).toEqual(mockTab);
    });

    test('should get all tabs', async () => {
      const mockTabs = [
        { id: 1, url: 'https://example.com', title: 'Example 1' },
        { id: 2, url: 'https://test.com', title: 'Example 2' }
      ];
      (browser.tabs.query as jest.Mock).mockResolvedValue(mockTabs);

      const result = await tabs.getAll();
      
      expect(browser.tabs.query).toHaveBeenCalledWith({});
      expect(result).toEqual(mockTabs);
    });

    test('should create new tab', async () => {
      const newTab = { id: 3, url: 'https://newsite.com', title: 'New Site' };
      const options = { url: 'https://newsite.com' };
      (browser.tabs.create as jest.Mock).mockResolvedValue(newTab);

      const result = await tabs.create(options);
      
      expect(browser.tabs.create).toHaveBeenCalledWith(options);
      expect(result).toEqual(newTab);
    });

    test('should update tab', async () => {
      const updatedTab = { id: 1, url: 'https://updated.com', title: 'Updated' };
      const options = { url: 'https://updated.com' };
      (browser.tabs.update as jest.Mock).mockResolvedValue(updatedTab);

      const result = await tabs.update(1, options);
      
      expect(browser.tabs.update).toHaveBeenCalledWith(1, options);
      expect(result).toEqual(updatedTab);
    });

    test('should remove tabs', async () => {
      (browser.tabs.remove as jest.Mock).mockResolvedValue(undefined);

      await tabs.remove([1, 2]);
      
      expect(browser.tabs.remove).toHaveBeenCalledWith([1, 2]);
    });
  });

  describe('getBrowserConfig', () => {
    test('should return Chrome configuration', () => {
      const config = getBrowserConfig();
      
      expect(config).toEqual({
        manifestVersion: 3,
        backgroundType: 'service-worker',
        actionAPI: 'action',
        storageQuota: 5242880,
        maxBadgeText: 4
      });
    });
  });

  describe('isFeatureSupported', () => {
    test('should return true for Chrome-supported features', () => {
      expect(isFeatureSupported('service-worker')).toBe(true);
      expect(isFeatureSupported('declarative-net-request')).toBe(true);
    });

    test('should return false for Firefox-only features', () => {
      expect(isFeatureSupported('background-scripts')).toBe(false);
      expect(isFeatureSupported('web-request')).toBe(false);
    });

    test('should return false for unknown features', () => {
      expect(isFeatureSupported('unknown-feature')).toBe(false);
    });
  });
});