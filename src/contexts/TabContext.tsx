import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { tabs as tabsAPI } from '../utils/cross-browser';
import { storageManager } from './storage';
import {
  TabState,
  TabAction,
  TabInfo,
  WindowInfo,
  TabContextValue,
  ContextProviderProps,
  ContextError
} from './types';

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialTabState: TabState = {
  currentTab: null,
  allTabs: [],
  windows: [],
  activeTabIds: [],
  recentTabs: [],
  closedTabs: [],
  isLoading: false,
  error: null,
  lastUpdated: Date.now()
};

// =============================================================================
// REDUCER
// =============================================================================

function tabReducer(state: TabState, action: TabAction): TabState {
  const now = Date.now();

  switch (action.type) {
    case 'SET_CURRENT_TAB':
      return {
        ...state,
        currentTab: action.payload,
        lastUpdated: now
      };

    case 'ADD_TAB':
      return {
        ...state,
        allTabs: [...state.allTabs, action.payload],
        activeTabIds: [...state.activeTabIds, action.payload.id],
        lastUpdated: now
      };

    case 'UPDATE_TAB': {
      const { tabId, updates } = action.payload;
      return {
        ...state,
        allTabs: state.allTabs.map(tab =>
          tab.id === tabId ? { ...tab, ...updates } : tab
        ),
        currentTab: state.currentTab?.id === tabId 
          ? { ...state.currentTab, ...updates }
          : state.currentTab,
        lastUpdated: now
      };
    }

    case 'REMOVE_TAB': {
      const tabId = action.payload;
      const removedTab = state.allTabs.find(tab => tab.id === tabId);
      
      return {
        ...state,
        allTabs: state.allTabs.filter(tab => tab.id !== tabId),
        activeTabIds: state.activeTabIds.filter(id => id !== tabId),
        currentTab: state.currentTab?.id === tabId ? null : state.currentTab,
        closedTabs: removedTab 
          ? [removedTab, ...state.closedTabs].slice(0, 50) // Keep only last 50
          : state.closedTabs,
        lastUpdated: now
      };
    }

    case 'SET_ALL_TABS':
      return {
        ...state,
        allTabs: action.payload,
        activeTabIds: action.payload.map(tab => tab.id),
        lastUpdated: now
      };

    case 'SET_WINDOWS':
      return {
        ...state,
        windows: action.payload,
        lastUpdated: now
      };

    case 'ADD_TO_RECENT': {
      const tab = action.payload;
      const filteredRecent = state.recentTabs.filter(t => t.id !== tab.id);
      
      return {
        ...state,
        recentTabs: [tab, ...filteredRecent].slice(0, 20), // Keep only last 20
        lastUpdated: now
      };
    }

    case 'ADD_TO_CLOSED': {
      const tab = action.payload;
      
      return {
        ...state,
        closedTabs: [tab, ...state.closedTabs].slice(0, 50), // Keep only last 50
        lastUpdated: now
      };
    }

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
        lastUpdated: now
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isLoading: false,
        lastUpdated: now
      };

    default:
      return state;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Convert browser tab to internal TabInfo format
 */
function browserTabToTabInfo(browserTab: chrome.tabs.Tab): TabInfo {
  return {
    id: browserTab.id || 0,
    url: browserTab.url || '',
    title: browserTab.title || '',
    favIconUrl: browserTab.favIconUrl,
    active: browserTab.active || false,
    windowId: browserTab.windowId || 0,
    index: browserTab.index || 0,
    pinned: browserTab.pinned || false,
    audible: browserTab.audible || false,
    muted: browserTab.mutedInfo?.muted || false,
    highlighted: browserTab.highlighted || false,
    incognito: browserTab.incognito || false,
    status: (browserTab.status as 'loading' | 'complete') || 'complete',
    lastAccessed: Date.now()
  };
}

/**
 * Convert browser window to internal WindowInfo format
 */
function browserWindowToWindowInfo(browserWindow: chrome.windows.Window): WindowInfo {
  return {
    id: browserWindow.id || 0,
    type: (browserWindow.type as WindowInfo['type']) || 'normal',
    state: (browserWindow.state as WindowInfo['state']) || 'normal',
    focused: browserWindow.focused || false,
    alwaysOnTop: browserWindow.alwaysOnTop || false,
    incognito: browserWindow.incognito || false,
    tabs: (browserWindow.tabs || []).map(browserTabToTabInfo)
  };
}

// =============================================================================
// CONTEXT
// =============================================================================

const TabContext = createContext<TabContextValue | null>(null);

// =============================================================================
// PROVIDER
// =============================================================================

export const TabProvider: React.FC<ContextProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(tabReducer, initialTabState);

  // =============================================================================
  // ACTIONS
  // =============================================================================

  const setCurrentTab = useCallback((tab: TabInfo) => {
    dispatch({ type: 'SET_CURRENT_TAB', payload: tab });
    // Add to recent tabs
    dispatch({ type: 'ADD_TO_RECENT', payload: tab });
  }, []);

  const addTab = useCallback((tab: TabInfo) => {
    dispatch({ type: 'ADD_TAB', payload: tab });
  }, []);

  const updateTab = useCallback((tabId: number, updates: Partial<TabInfo>) => {
    dispatch({ type: 'UPDATE_TAB', payload: { tabId, updates } });
  }, []);

  const removeTab = useCallback((tabId: number) => {
    const tab = state.allTabs.find(t => t.id === tabId);
    if (tab) {
      dispatch({ type: 'ADD_TO_CLOSED', payload: tab });
    }
    dispatch({ type: 'REMOVE_TAB', payload: tabId });
  }, [state.allTabs]);

  const refreshTabs = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const browserTabs = await tabsAPI.getAll();
      const tabs = browserTabs.map(browserTabToTabInfo);
      
      dispatch({ type: 'SET_ALL_TABS', payload: tabs });

      // Get current active tab
      const currentTab = await tabsAPI.getCurrent();
      if (currentTab) {
        dispatch({ type: 'SET_CURRENT_TAB', payload: browserTabToTabInfo(currentTab) });
      }

      // Persist to storage
      await storageManager.setTabs(tabs);
      await storageManager.setRecentTabs(state.recentTabs);

      dispatch({ type: 'SET_ERROR', payload: null });
    } catch (error) {
      const contextError = new ContextError('Tab', 'refreshTabs', error as Error);
      dispatch({ type: 'SET_ERROR', payload: contextError.message });
      console.error('Failed to refresh tabs:', contextError);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.recentTabs]);

  const refreshWindows = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });

      // Get all windows with tabs
      const browserWindows = await new Promise<chrome.windows.Window[]>((resolve, reject) => {
        if (typeof chrome !== 'undefined' && chrome.windows) {
          chrome.windows.getAll({ populate: true }, (windows) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(windows);
            }
          });
        } else {
          reject(new Error('Chrome windows API not available'));
        }
      });

      const windows = browserWindows.map(browserWindowToWindowInfo);
      dispatch({ type: 'SET_WINDOWS', payload: windows });

      dispatch({ type: 'SET_ERROR', payload: null });
    } catch (error) {
      const contextError = new ContextError('Tab', 'refreshWindows', error as Error);
      dispatch({ type: 'SET_ERROR', payload: contextError.message });
      console.error('Failed to refresh windows:', contextError);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const addToRecent = useCallback((tab: TabInfo) => {
    dispatch({ type: 'ADD_TO_RECENT', payload: tab });
  }, []);

  const addToClosed = useCallback((tab: TabInfo) => {
    dispatch({ type: 'ADD_TO_CLOSED', payload: tab });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  // =============================================================================
  // EFFECTS
  // =============================================================================

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load from storage first
        const [storedTabs, storedRecentTabs, storedClosedTabs] = await Promise.all([
          storageManager.getTabs(),
          storageManager.getRecentTabs(),
          storageManager.getClosedTabs()
        ]);

        if (storedTabs) {
          dispatch({ type: 'SET_ALL_TABS', payload: storedTabs });
        }

        if (storedRecentTabs) {
          storedRecentTabs.forEach((tab: TabInfo) => {
            dispatch({ type: 'ADD_TO_RECENT', payload: tab });
          });
        }

        if (storedClosedTabs) {
          storedClosedTabs.forEach((tab: TabInfo) => {
            dispatch({ type: 'ADD_TO_CLOSED', payload: tab });
          });
        }

        // Then refresh with current data
        await refreshTabs();
        await refreshWindows();
      } catch (error) {
        const contextError = new ContextError('Tab', 'loadInitialData', error as Error);
        dispatch({ type: 'SET_ERROR', payload: contextError.message });
        console.error('Failed to load initial tab data:', contextError);
      }
    };

    loadInitialData();
  }, []); // Run only once on mount

  // Set up tab event listeners
  useEffect(() => {
    if (!tabsAPI.onUpdated || !tabsAPI.onCreated || !tabsAPI.onRemoved || !tabsAPI.onActivated) {
      return;
    }

    const handleTabUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      const tabInfo = browserTabToTabInfo(tab);
      dispatch({ type: 'UPDATE_TAB', payload: { tabId, updates: tabInfo } });
      
      if (changeInfo.status === 'complete') {
        dispatch({ type: 'ADD_TO_RECENT', payload: tabInfo });
      }
    };

    const handleTabCreated = (tab: chrome.tabs.Tab) => {
      const tabInfo = browserTabToTabInfo(tab);
      dispatch({ type: 'ADD_TAB', payload: tabInfo });
    };

    const handleTabRemoved = (tabId: number) => {
      dispatch({ type: 'REMOVE_TAB', payload: tabId });
    };

    const handleTabActivated = async (activeInfo: chrome.tabs.TabActiveInfo) => {
      try {
        const tab = await tabsAPI.getCurrent();
        if (tab) {
          const tabInfo = browserTabToTabInfo(tab);
          dispatch({ type: 'SET_CURRENT_TAB', payload: tabInfo });
          dispatch({ type: 'ADD_TO_RECENT', payload: tabInfo });
        }
      } catch (error) {
        console.error('Failed to handle tab activation:', error);
      }
    };

    // Add listeners
    tabsAPI.onUpdated.addListener(handleTabUpdated);
    tabsAPI.onCreated.addListener(handleTabCreated);
    tabsAPI.onRemoved.addListener(handleTabRemoved);
    tabsAPI.onActivated.addListener(handleTabActivated);

    // Cleanup listeners
    return () => {
      tabsAPI.onUpdated.removeListener(handleTabUpdated);
      tabsAPI.onCreated.removeListener(handleTabCreated);
      tabsAPI.onRemoved.removeListener(handleTabRemoved);
      tabsAPI.onActivated.removeListener(handleTabActivated);
    };
  }, []);

  // Persist recent and closed tabs when they change
  useEffect(() => {
    if (state.recentTabs.length > 0) {
      storageManager.setRecentTabs(state.recentTabs).catch(error => {
        console.error('Failed to persist recent tabs:', error);
      });
    }
  }, [state.recentTabs]);

  useEffect(() => {
    if (state.closedTabs.length > 0) {
      storageManager.setClosedTabs(state.closedTabs).catch(error => {
        console.error('Failed to persist closed tabs:', error);
      });
    }
  }, [state.closedTabs]);

  // =============================================================================
  // CONTEXT VALUE
  // =============================================================================

  const contextValue: TabContextValue = {
    state,
    actions: {
      setCurrentTab,
      addTab,
      updateTab,
      removeTab,
      refreshTabs,
      refreshWindows,
      addToRecent,
      addToClosed,
      clearError
    }
  };

  return (
    <TabContext.Provider value={contextValue}>
      {children}
    </TabContext.Provider>
  );
};

// =============================================================================
// HOOK
// =============================================================================

export const useTabContext = (): TabContextValue => {
  const context = useContext(TabContext);
  if (!context) {
    throw new ContextError('Tab', 'useTabContext', new Error('useTabContext must be used within TabProvider'));
  }
  return context;
};