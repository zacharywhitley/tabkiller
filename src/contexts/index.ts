// Context providers
export { TabProvider, useTabContext } from './TabContext';
export { SessionProvider, useSessionContext } from './SessionContext';
export { SettingsProvider, useSettingsContext } from './SettingsContext';
export { UIProvider, useUIContext } from './UIContext';
export { AppContextProvider, withAppContext, useContextsInitialized } from './AppContextProvider';

// Storage utilities
export { storageManager, StorageManager, STORAGE_KEYS } from './storage';

// Types
export type {
  // Base types
  BaseState,
  BaseAction,
  
  // Tab types
  TabInfo,
  WindowInfo,
  TabState,
  TabAction,
  TabContextValue,
  
  // Session types
  Session,
  SessionTag,
  SessionTab,
  SessionState,
  SessionAction,
  SessionContextValue,
  
  // Settings types
  Settings,
  GeneralSettings,
  PrivacySettings,
  UISettings,
  StorageSettings,
  SettingsState,
  SettingsAction,
  SettingsContextValue,
  
  // UI types
  UIState,
  UIAction,
  Notification,
  UIContextValue,
  
  // Common types
  ContextProviderProps,
  
  // Storage types
  StorageKey,
  StorageData,
  StoragePersistence,
  
  // Error types
  ContextError,
  StorageError
} from './types';

// Utilities
export { createNotification } from './utils';

// Re-export commonly used context combinations
import { useTabContext } from './TabContext';
import { useSessionContext } from './SessionContext';
import { useSettingsContext } from './SettingsContext';
import { useUIContext } from './UIContext';

/**
 * Hook that provides access to all contexts at once
 * Use sparingly - prefer individual context hooks for better performance
 */
export function useAllContexts() {
  const tabContext = useTabContext();
  const sessionContext = useSessionContext();
  const settingsContext = useSettingsContext();
  const uiContext = useUIContext();
  
  return {
    tab: tabContext,
    session: sessionContext,
    settings: settingsContext,
    ui: uiContext
  };
}