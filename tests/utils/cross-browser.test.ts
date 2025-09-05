/**
 * Tests for cross-browser compatibility utilities
 */

import { 
  detectBrowser, 
  isManifestV3, 
  storage, 
  tabs,
  getBrowserConfig,
  isFeatureSupported
} from '../../src/utils/cross-browser';

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
      (chrome.storage.local.get as jest.Mock).mockResolvedValue(mockData);

      const result = await storage.get('key');
      
      expect(chrome.storage.local.get).toHaveBeenCalledWith('key');
      expect(result).toEqual(mockData);
    });

    test('should set data in storage', async () => {
      const data = { key: 'value' };
      (chrome.storage.local.set as jest.Mock).mockResolvedValue(undefined);

      await storage.set(data);
      
      expect(chrome.storage.local.set).toHaveBeenCalledWith(data);
    });

    test('should remove data from storage', async () => {
      (chrome.storage.local.remove as jest.Mock).mockResolvedValue(undefined);

      await storage.remove('key');
      
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('key');
    });

    test('should clear storage', async () => {
      (chrome.storage.local.clear as jest.Mock).mockResolvedValue(undefined);

      await storage.clear();
      
      expect(chrome.storage.local.clear).toHaveBeenCalled();
    });
  });

  describe('tabs', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should get current tab', async () => {
      const mockTab = { id: 1, url: 'https://example.com', title: 'Example' };
      (chrome.tabs.query as jest.Mock).mockResolvedValue([mockTab]);

      const result = await tabs.getCurrent();
      
      expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
      expect(result).toEqual(mockTab);
    });

    test('should get all tabs', async () => {
      const mockTabs = [
        { id: 1, url: 'https://example.com', title: 'Example 1' },
        { id: 2, url: 'https://test.com', title: 'Example 2' }
      ];
      (chrome.tabs.query as jest.Mock).mockResolvedValue(mockTabs);

      const result = await tabs.getAll();
      
      expect(chrome.tabs.query).toHaveBeenCalledWith({});
      expect(result).toEqual(mockTabs);
    });

    test('should create new tab', async () => {
      const newTab = { id: 3, url: 'https://newsite.com', title: 'New Site' };
      const options = { url: 'https://newsite.com' };
      (chrome.tabs.create as jest.Mock).mockResolvedValue(newTab);

      const result = await tabs.create(options);
      
      expect(chrome.tabs.create).toHaveBeenCalledWith(options);
      expect(result).toEqual(newTab);
    });

    test('should update tab', async () => {
      const updatedTab = { id: 1, url: 'https://updated.com', title: 'Updated' };
      const options = { url: 'https://updated.com' };
      (chrome.tabs.update as jest.Mock).mockResolvedValue(updatedTab);

      const result = await tabs.update(1, options);
      
      expect(chrome.tabs.update).toHaveBeenCalledWith(1, options);
      expect(result).toEqual(updatedTab);
    });

    test('should remove tabs', async () => {
      (chrome.tabs.remove as jest.Mock).mockResolvedValue(undefined);

      await tabs.remove([1, 2]);
      
      expect(chrome.tabs.remove).toHaveBeenCalledWith([1, 2]);
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