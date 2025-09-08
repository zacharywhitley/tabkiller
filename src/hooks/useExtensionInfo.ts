import { useEffect, useState } from 'react';
import { detectBrowser, getBrowserConfig } from '../utils/cross-browser';

export interface ExtensionInfo {
  name: string;
  version: string;
  browser: string;
  browserConfig: ReturnType<typeof getBrowserConfig>;
  manifestVersion: number;
  isDevelopment: boolean;
  extensionId: string;
}

/**
 * Hook to get extension information and metadata
 */
export function useExtensionInfo(): ExtensionInfo {
  const [extensionInfo, setExtensionInfo] = useState<ExtensionInfo>(() => {
    const browser = detectBrowser();
    const browserConfig = getBrowserConfig();
    
    // Get extension info from runtime or fallback values
    const manifest = chrome?.runtime?.getManifest?.() || {};
    const extensionId = chrome?.runtime?.id || 'unknown';
    
    return {
      name: manifest.name || 'TabKiller',
      version: manifest.version || '0.1.0',
      browser,
      browserConfig,
      manifestVersion: manifest.manifest_version || 2,
      isDevelopment: process.env.NODE_ENV === 'development',
      extensionId
    };
  });

  useEffect(() => {
    // Listen for extension updates
    if (chrome?.runtime?.onUpdateAvailable) {
      const handleUpdateAvailable = () => {
        // Reload extension info when update is available
        const manifest = chrome.runtime.getManifest();
        setExtensionInfo(prev => ({
          ...prev,
          version: manifest.version || prev.version
        }));
      };

      chrome.runtime.onUpdateAvailable.addListener(handleUpdateAvailable);
      return () => {
        chrome.runtime.onUpdateAvailable.removeListener(handleUpdateAvailable);
      };
    }
  }, []);

  return extensionInfo;
}