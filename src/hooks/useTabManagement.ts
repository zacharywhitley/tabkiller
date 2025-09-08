import { useCallback, useMemo } from 'react';
import { useTabContext } from '../contexts/TabContext';
import { useSessionContext } from '../contexts/SessionContext';
import { useSettingsContext } from '../contexts/SettingsContext';
import { useUIContext } from '../contexts/UIContext';
import { TabInfo, SessionTab } from '../contexts/types';
import { tabs as tabsAPI } from '../utils/cross-browser';

export interface TabManagementActions {
  // Tab operations
  closeTab: (tabId: number) => Promise<void>;
  duplicateTab: (tabId: number) => Promise<void>;
  muteTab: (tabId: number) => Promise<void>;
  unmuteTab: (tabId: number) => Promise<void>;
  pinTab: (tabId: number) => Promise<void>;
  unpinTab: (tabId: number) => Promise<void>;
  reloadTab: (tabId: number) => Promise<void>;
  
  // Bulk operations
  closeAllTabs: () => Promise<void>;
  closeTabsToRight: (tabId: number) => Promise<void>;
  closeTabsToLeft: (tabId: number) => Promise<void>;
  closeOtherTabs: (tabId: number) => Promise<void>;
  closeDuplicateTabs: () => Promise<void>;
  
  // Session integration
  saveTabsToSession: (tabIds: number[], sessionName?: string) => Promise<void>;
  restoreTabsFromSession: (sessionId: string) => Promise<void>;
  
  // Tab organization
  groupTabsByDomain: () => Promise<void>;
  sortTabsByTitle: () => Promise<void>;
  sortTabsByUrl: () => Promise<void>;
  sortTabsByLastAccessed: () => Promise<void>;
  
  // Tab search and filtering
  findTabsByDomain: (domain: string) => TabInfo[];
  findTabsByTitle: (title: string) => TabInfo[];
  findTabsByUrl: (url: string) => TabInfo[];
  
  // Window operations
  moveTabsToNewWindow: (tabIds: number[]) => Promise<void>;
  moveTabsToExistingWindow: (tabIds: number[], windowId: number) => Promise<void>;
}

/**
 * Hook for advanced tab management functionality
 */
export function useTabManagement(): TabManagementActions {
  const { state: tabState, actions: tabActions } = useTabContext();
  const { state: sessionState, actions: sessionActions } = useSessionContext();
  const { state: settingsState } = useSettingsContext();
  const { actions: uiActions } = useUIContext();

  // Tab operations
  const closeTab = useCallback(async (tabId: number) => {
    try {
      await tabsAPI.remove(tabId);
      tabActions.removeTab(tabId);
      
      uiActions.showSuccessNotification?.('Tab Closed', 'Tab has been closed successfully');
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to close tab');
      throw error;
    }
  }, [tabActions, uiActions]);

  const duplicateTab = useCallback(async (tabId: number) => {
    try {
      const tab = tabState.allTabs.find(t => t.id === tabId);
      if (!tab) {
        throw new Error('Tab not found');
      }
      
      const newTab = await tabsAPI.create({ url: tab.url });
      if (newTab) {
        tabActions.addTab({
          id: newTab.id || 0,
          url: newTab.url || '',
          title: newTab.title || '',
          favIconUrl: newTab.favIconUrl,
          active: newTab.active || false,
          windowId: newTab.windowId || 0,
          index: newTab.index || 0,
          pinned: newTab.pinned || false,
          audible: newTab.audible || false,
          muted: newTab.mutedInfo?.muted || false,
          highlighted: newTab.highlighted || false,
          incognito: newTab.incognito || false,
          status: (newTab.status as 'loading' | 'complete') || 'complete',
          lastAccessed: Date.now()
        });
      }
      
      uiActions.showSuccessNotification?.('Tab Duplicated', 'Tab has been duplicated successfully');
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to duplicate tab');
      throw error;
    }
  }, [tabState.allTabs, tabActions, uiActions]);

  const muteTab = useCallback(async (tabId: number) => {
    try {
      await tabsAPI.update(tabId, { muted: true });
      tabActions.updateTab(tabId, { muted: true });
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to mute tab');
      throw error;
    }
  }, [tabActions, uiActions]);

  const unmuteTab = useCallback(async (tabId: number) => {
    try {
      await tabsAPI.update(tabId, { muted: false });
      tabActions.updateTab(tabId, { muted: false });
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to unmute tab');
      throw error;
    }
  }, [tabActions, uiActions]);

  const pinTab = useCallback(async (tabId: number) => {
    try {
      await tabsAPI.update(tabId, { pinned: true });
      tabActions.updateTab(tabId, { pinned: true });
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to pin tab');
      throw error;
    }
  }, [tabActions, uiActions]);

  const unpinTab = useCallback(async (tabId: number) => {
    try {
      await tabsAPI.update(tabId, { pinned: false });
      tabActions.updateTab(tabId, { pinned: false });
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to unpin tab');
      throw error;
    }
  }, [tabActions, uiActions]);

  const reloadTab = useCallback(async (tabId: number) => {
    try {
      await tabsAPI.update(tabId, { url: tabState.allTabs.find(t => t.id === tabId)?.url });
      uiActions.showSuccessNotification?.('Tab Reloaded', 'Tab has been reloaded');
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to reload tab');
      throw error;
    }
  }, [tabState.allTabs, uiActions]);

  // Bulk operations
  const closeAllTabs = useCallback(async () => {
    try {
      const tabIds = tabState.allTabs.map(tab => tab.id);
      await tabsAPI.remove(tabIds);
      
      // Add all tabs to closed tabs list
      tabState.allTabs.forEach(tab => tabActions.addToClosed(tab));
      
      uiActions.showSuccessNotification?.('All Tabs Closed', `Closed ${tabIds.length} tabs`);
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to close all tabs');
      throw error;
    }
  }, [tabState.allTabs, tabActions, uiActions]);

  const closeTabsToRight = useCallback(async (tabId: number) => {
    try {
      const currentTab = tabState.allTabs.find(t => t.id === tabId);
      if (!currentTab) return;
      
      const tabsToClose = tabState.allTabs
        .filter(tab => tab.windowId === currentTab.windowId && tab.index > currentTab.index)
        .map(tab => tab.id);
      
      if (tabsToClose.length > 0) {
        await tabsAPI.remove(tabsToClose);
        tabsToClose.forEach(id => tabActions.removeTab(id));
        
        uiActions.showSuccessNotification?.('Tabs Closed', `Closed ${tabsToClose.length} tabs to the right`);
      }
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to close tabs to the right');
      throw error;
    }
  }, [tabState.allTabs, tabActions, uiActions]);

  const closeTabsToLeft = useCallback(async (tabId: number) => {
    try {
      const currentTab = tabState.allTabs.find(t => t.id === tabId);
      if (!currentTab) return;
      
      const tabsToClose = tabState.allTabs
        .filter(tab => tab.windowId === currentTab.windowId && tab.index < currentTab.index && !tab.pinned)
        .map(tab => tab.id);
      
      if (tabsToClose.length > 0) {
        await tabsAPI.remove(tabsToClose);
        tabsToClose.forEach(id => tabActions.removeTab(id));
        
        uiActions.showSuccessNotification?.('Tabs Closed', `Closed ${tabsToClose.length} tabs to the left`);
      }
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to close tabs to the left');
      throw error;
    }
  }, [tabState.allTabs, tabActions, uiActions]);

  const closeOtherTabs = useCallback(async (tabId: number) => {
    try {
      const currentTab = tabState.allTabs.find(t => t.id === tabId);
      if (!currentTab) return;
      
      const tabsToClose = tabState.allTabs
        .filter(tab => tab.windowId === currentTab.windowId && tab.id !== tabId && !tab.pinned)
        .map(tab => tab.id);
      
      if (tabsToClose.length > 0) {
        await tabsAPI.remove(tabsToClose);
        tabsToClose.forEach(id => tabActions.removeTab(id));
        
        uiActions.showSuccessNotification?.('Other Tabs Closed', `Closed ${tabsToClose.length} other tabs`);
      }
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to close other tabs');
      throw error;
    }
  }, [tabState.allTabs, tabActions, uiActions]);

  const closeDuplicateTabs = useCallback(async () => {
    try {
      const urlCounts: Record<string, TabInfo[]> = {};
      
      // Group tabs by URL
      tabState.allTabs.forEach(tab => {
        if (!urlCounts[tab.url]) {
          urlCounts[tab.url] = [];
        }
        urlCounts[tab.url].push(tab);
      });
      
      // Find duplicates (keep the first one, close the rest)
      const tabsToClose: number[] = [];
      Object.values(urlCounts).forEach(tabs => {
        if (tabs.length > 1) {
          // Keep the first tab, close the rest
          tabs.slice(1).forEach(tab => {
            tabsToClose.push(tab.id);
          });
        }
      });
      
      if (tabsToClose.length > 0) {
        await tabsAPI.remove(tabsToClose);
        tabsToClose.forEach(id => tabActions.removeTab(id));
        
        uiActions.showSuccessNotification?.('Duplicate Tabs Closed', `Closed ${tabsToClose.length} duplicate tabs`);
      } else {
        uiActions.showInfoNotification?.('No Duplicates', 'No duplicate tabs found');
      }
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to close duplicate tabs');
      throw error;
    }
  }, [tabState.allTabs, tabActions, uiActions]);

  // Session integration
  const saveTabsToSession = useCallback(async (tabIds: number[], sessionName?: string) => {
    try {
      const tabsToSave = tabState.allTabs.filter(tab => tabIds.includes(tab.id));
      
      if (tabsToSave.length === 0) {
        uiActions.showWarningNotification?.('No Tabs', 'No tabs selected to save');
        return;
      }
      
      const sessionTabs: SessionTab[] = tabsToSave.map(tab => ({
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        index: tab.index,
        pinned: tab.pinned,
        timestamp: Date.now()
      }));
      
      const name = sessionName || `Session ${new Date().toLocaleString()}`;
      
      sessionActions.startSession({
        name,
        description: `Saved ${tabsToSave.length} tabs`,
        tags: [],
        tabs: sessionTabs,
        windowCount: new Set(tabsToSave.map(t => t.windowId)).size,
        metadata: {
          totalPages: sessionTabs.length,
          uniqueDomains: new Set(sessionTabs.map(t => new URL(t.url).hostname)).size,
          bookmarkedPages: 0,
          averageTimePerPage: 0
        }
      });
      
      uiActions.showSuccessNotification?.('Session Saved', `Saved ${tabsToSave.length} tabs to session`);
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to save tabs to session');
      throw error;
    }
  }, [tabState.allTabs, sessionActions, uiActions]);

  const restoreTabsFromSession = useCallback(async (sessionId: string) => {
    try {
      const session = sessionState.allSessions.find(s => s.id === sessionId);
      if (!session) {
        uiActions.showErrorNotification?.('Error', 'Session not found');
        return;
      }
      
      // Create tabs from session
      const createdTabs = await Promise.all(
        session.tabs.map(async (sessionTab) => {
          try {
            return await tabsAPI.create({ 
              url: sessionTab.url,
              pinned: sessionTab.pinned
            });
          } catch (error) {
            console.error('Failed to create tab:', error);
            return null;
          }
        })
      );
      
      const successfulTabs = createdTabs.filter(tab => tab !== null);
      
      uiActions.showSuccessNotification?.(
        'Session Restored', 
        `Restored ${successfulTabs.length} of ${session.tabs.length} tabs`
      );
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to restore tabs from session');
      throw error;
    }
  }, [sessionState.allSessions, uiActions]);

  // Search and filtering
  const findTabsByDomain = useCallback((domain: string): TabInfo[] => {
    return tabState.allTabs.filter(tab => {
      try {
        return new URL(tab.url).hostname.includes(domain.toLowerCase());
      } catch {
        return false;
      }
    });
  }, [tabState.allTabs]);

  const findTabsByTitle = useCallback((title: string): TabInfo[] => {
    return tabState.allTabs.filter(tab => 
      tab.title.toLowerCase().includes(title.toLowerCase())
    );
  }, [tabState.allTabs]);

  const findTabsByUrl = useCallback((url: string): TabInfo[] => {
    return tabState.allTabs.filter(tab => 
      tab.url.toLowerCase().includes(url.toLowerCase())
    );
  }, [tabState.allTabs]);

  // Window operations
  const moveTabsToNewWindow = useCallback(async (tabIds: number[]) => {
    try {
      if (tabIds.length === 0) return;
      
      // Create new window with the first tab
      const firstTab = tabState.allTabs.find(t => t.id === tabIds[0]);
      if (!firstTab) return;
      
      const newWindow = await new Promise<chrome.windows.Window>((resolve, reject) => {
        chrome.windows.create({ 
          url: firstTab.url,
          focused: true 
        }, (window) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(window!);
          }
        });
      });
      
      // Move remaining tabs to the new window
      if (tabIds.length > 1 && newWindow.id) {
        const remainingTabIds = tabIds.slice(1);
        await Promise.all(
          remainingTabIds.map(tabId =>
            new Promise<void>((resolve, reject) => {
              chrome.tabs.move(tabId, { 
                windowId: newWindow.id!, 
                index: -1 
              }, () => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve();
                }
              });
            })
          )
        );
      }
      
      uiActions.showSuccessNotification?.('Tabs Moved', `Moved ${tabIds.length} tabs to new window`);
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to move tabs to new window');
      throw error;
    }
  }, [tabState.allTabs, uiActions]);

  const moveTabsToExistingWindow = useCallback(async (tabIds: number[], windowId: number) => {
    try {
      await Promise.all(
        tabIds.map(tabId =>
          new Promise<void>((resolve, reject) => {
            chrome.tabs.move(tabId, { 
              windowId, 
              index: -1 
            }, () => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          })
        )
      );
      
      uiActions.showSuccessNotification?.('Tabs Moved', `Moved ${tabIds.length} tabs to window`);
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to move tabs to window');
      throw error;
    }
  }, [uiActions]);

  // Placeholder implementations for sorting operations
  const groupTabsByDomain = useCallback(async () => {
    uiActions.showInfoNotification?.('Feature Coming Soon', 'Tab grouping by domain will be available in a future update');
  }, [uiActions]);

  const sortTabsByTitle = useCallback(async () => {
    uiActions.showInfoNotification?.('Feature Coming Soon', 'Tab sorting by title will be available in a future update');
  }, [uiActions]);

  const sortTabsByUrl = useCallback(async () => {
    uiActions.showInfoNotification?.('Feature Coming Soon', 'Tab sorting by URL will be available in a future update');
  }, [uiActions]);

  const sortTabsByLastAccessed = useCallback(async () => {
    uiActions.showInfoNotification?.('Feature Coming Soon', 'Tab sorting by last accessed will be available in a future update');
  }, [uiActions]);

  return {
    closeTab,
    duplicateTab,
    muteTab,
    unmuteTab,
    pinTab,
    unpinTab,
    reloadTab,
    closeAllTabs,
    closeTabsToRight,
    closeTabsToLeft,
    closeOtherTabs,
    closeDuplicateTabs,
    saveTabsToSession,
    restoreTabsFromSession,
    groupTabsByDomain,
    sortTabsByTitle,
    sortTabsByUrl,
    sortTabsByLastAccessed,
    findTabsByDomain,
    findTabsByTitle,
    findTabsByUrl,
    moveTabsToNewWindow,
    moveTabsToExistingWindow
  };
}