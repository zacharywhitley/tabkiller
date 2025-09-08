import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { storageManager } from './storage';
import {
  SettingsState,
  SettingsAction,
  Settings,
  GeneralSettings,
  PrivacySettings,
  UISettings,
  StorageSettings,
  SettingsContextValue,
  ContextProviderProps,
  ContextError
} from './types';

// =============================================================================
// DEFAULT SETTINGS
// =============================================================================

const defaultGeneralSettings: GeneralSettings = {
  autoStartSessions: true,
  maxRecentTabs: 20,
  maxClosedTabs: 50,
  maxRecentSessions: 10,
  enableNotifications: true,
  notificationDuration: 3000,
  enableAnalytics: false,
  enableBrowserSync: true
};

const defaultPrivacySettings: PrivacySettings = {
  encryptData: true,
  excludeIncognito: true,
  excludeDomains: [
    'chrome-extension://',
    'moz-extension://',
    'safari-extension://',
    'about:',
    'chrome://',
    'edge://'
  ],
  retentionDays: 365,
  clearDataOnUninstall: false,
  enableSSBSync: false
};

const defaultUISettings: UISettings = {
  theme: 'auto',
  compactMode: false,
  showFavicons: true,
  showTabCounts: true,
  defaultView: 'popup',
  animationsEnabled: true,
  keyboardShortcuts: {
    'toggle-popup': 'Ctrl+Shift+K',
    'start-session': 'Ctrl+Shift+S',
    'end-session': 'Ctrl+Shift+E',
    'capture-tabs': 'Ctrl+Shift+C'
  }
};

const defaultStorageSettings: StorageSettings = {
  maxStorageSize: 100 * 1024 * 1024, // 100MB
  compressionLevel: 1,
  enableBackup: true,
  backupInterval: 24 * 60 * 60 * 1000, // 24 hours
  maxBackups: 7,
  storageLocation: 'local'
};

const defaultSettings: Settings = {
  general: defaultGeneralSettings,
  privacy: defaultPrivacySettings,
  ui: defaultUISettings,
  storage: defaultStorageSettings,
  version: '1.0.0',
  lastModified: Date.now()
};

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialSettingsState: SettingsState = {
  settings: defaultSettings,
  hasUnsavedChanges: false,
  resetInProgress: false,
  isLoading: false,
  error: null,
  lastUpdated: Date.now()
};

// =============================================================================
// REDUCER
// =============================================================================

function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  const now = Date.now();

  switch (action.type) {
    case 'UPDATE_GENERAL_SETTINGS':
      return {
        ...state,
        settings: {
          ...state.settings,
          general: {
            ...state.settings.general,
            ...action.payload
          },
          lastModified: now
        },
        hasUnsavedChanges: true,
        lastUpdated: now
      };

    case 'UPDATE_PRIVACY_SETTINGS':
      return {
        ...state,
        settings: {
          ...state.settings,
          privacy: {
            ...state.settings.privacy,
            ...action.payload
          },
          lastModified: now
        },
        hasUnsavedChanges: true,
        lastUpdated: now
      };

    case 'UPDATE_UI_SETTINGS':
      return {
        ...state,
        settings: {
          ...state.settings,
          ui: {
            ...state.settings.ui,
            ...action.payload
          },
          lastModified: now
        },
        hasUnsavedChanges: true,
        lastUpdated: now
      };

    case 'UPDATE_STORAGE_SETTINGS':
      return {
        ...state,
        settings: {
          ...state.settings,
          storage: {
            ...state.settings.storage,
            ...action.payload
          },
          lastModified: now
        },
        hasUnsavedChanges: true,
        lastUpdated: now
      };

    case 'SAVE_SETTINGS':
      return {
        ...state,
        hasUnsavedChanges: false,
        lastUpdated: now
      };

    case 'RESET_SETTINGS':
      return {
        ...state,
        settings: {
          ...defaultSettings,
          lastModified: now
        },
        hasUnsavedChanges: false,
        resetInProgress: false,
        lastUpdated: now
      };

    case 'RESTORE_DEFAULTS':
      return {
        ...state,
        settings: {
          ...defaultSettings,
          version: state.settings.version, // Keep current version
          lastModified: now
        },
        hasUnsavedChanges: true,
        lastUpdated: now
      };

    case 'IMPORT_SETTINGS': {
      const importedSettings = action.payload;
      return {
        ...state,
        settings: {
          ...state.settings,
          ...importedSettings,
          lastModified: now
        },
        hasUnsavedChanges: true,
        lastUpdated: now
      };
    }

    case 'SET_UNSAVED_CHANGES':
      return {
        ...state,
        hasUnsavedChanges: action.payload,
        lastUpdated: now
      };

    case 'SET_RESET_IN_PROGRESS':
      return {
        ...state,
        resetInProgress: action.payload,
        lastUpdated: now
      };

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
 * Validate settings object
 */
function validateSettings(settings: Partial<Settings>): string[] {
  const errors: string[] = [];

  // Validate general settings
  if (settings.general) {
    const { maxRecentTabs, maxClosedTabs, maxRecentSessions, notificationDuration } = settings.general;
    
    if (maxRecentTabs !== undefined && (maxRecentTabs < 1 || maxRecentTabs > 100)) {
      errors.push('Max recent tabs must be between 1 and 100');
    }
    
    if (maxClosedTabs !== undefined && (maxClosedTabs < 1 || maxClosedTabs > 200)) {
      errors.push('Max closed tabs must be between 1 and 200');
    }
    
    if (maxRecentSessions !== undefined && (maxRecentSessions < 1 || maxRecentSessions > 50)) {
      errors.push('Max recent sessions must be between 1 and 50');
    }
    
    if (notificationDuration !== undefined && (notificationDuration < 1000 || notificationDuration > 30000)) {
      errors.push('Notification duration must be between 1 and 30 seconds');
    }
  }

  // Validate privacy settings
  if (settings.privacy) {
    const { retentionDays, excludeDomains } = settings.privacy;
    
    if (retentionDays !== undefined && (retentionDays < 1 || retentionDays > 3650)) {
      errors.push('Retention days must be between 1 and 3650 (10 years)');
    }
    
    if (excludeDomains !== undefined && excludeDomains.length > 100) {
      errors.push('Cannot exclude more than 100 domains');
    }
  }

  // Validate UI settings
  if (settings.ui) {
    const { theme, defaultView } = settings.ui;
    
    if (theme !== undefined && !['light', 'dark', 'auto'].includes(theme)) {
      errors.push('Theme must be light, dark, or auto');
    }
    
    if (defaultView !== undefined && !['popup', 'history', 'sessions'].includes(defaultView)) {
      errors.push('Default view must be popup, history, or sessions');
    }
  }

  // Validate storage settings
  if (settings.storage) {
    const { maxStorageSize, compressionLevel, maxBackups, backupInterval } = settings.storage;
    
    if (maxStorageSize !== undefined && (maxStorageSize < 1024 * 1024 || maxStorageSize > 1024 * 1024 * 1024)) {
      errors.push('Max storage size must be between 1MB and 1GB');
    }
    
    if (compressionLevel !== undefined && (compressionLevel < 0 || compressionLevel > 9)) {
      errors.push('Compression level must be between 0 and 9');
    }
    
    if (maxBackups !== undefined && (maxBackups < 1 || maxBackups > 30)) {
      errors.push('Max backups must be between 1 and 30');
    }
    
    if (backupInterval !== undefined && backupInterval < 60 * 1000) {
      errors.push('Backup interval must be at least 1 minute');
    }
  }

  return errors;
}

/**
 * Merge settings with defaults
 */
function mergeWithDefaults(settings: Partial<Settings>): Settings {
  return {
    general: { ...defaultGeneralSettings, ...settings.general },
    privacy: { ...defaultPrivacySettings, ...settings.privacy },
    ui: { ...defaultUISettings, ...settings.ui },
    storage: { ...defaultStorageSettings, ...settings.storage },
    version: settings.version || defaultSettings.version,
    lastModified: settings.lastModified || Date.now()
  };
}

// =============================================================================
// CONTEXT
// =============================================================================

const SettingsContext = createContext<SettingsContextValue | null>(null);

// =============================================================================
// PROVIDER
// =============================================================================

export const SettingsProvider: React.FC<ContextProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(settingsReducer, initialSettingsState);

  // =============================================================================
  // ACTIONS
  // =============================================================================

  const updateGeneralSettings = useCallback((updates: Partial<GeneralSettings>) => {
    const errors = validateSettings({ general: updates });
    if (errors.length > 0) {
      dispatch({ type: 'SET_ERROR', payload: `Validation failed: ${errors.join(', ')}` });
      return;
    }
    
    dispatch({ type: 'UPDATE_GENERAL_SETTINGS', payload: updates });
  }, []);

  const updatePrivacySettings = useCallback((updates: Partial<PrivacySettings>) => {
    const errors = validateSettings({ privacy: updates });
    if (errors.length > 0) {
      dispatch({ type: 'SET_ERROR', payload: `Validation failed: ${errors.join(', ')}` });
      return;
    }
    
    dispatch({ type: 'UPDATE_PRIVACY_SETTINGS', payload: updates });
  }, []);

  const updateUISettings = useCallback((updates: Partial<UISettings>) => {
    const errors = validateSettings({ ui: updates });
    if (errors.length > 0) {
      dispatch({ type: 'SET_ERROR', payload: `Validation failed: ${errors.join(', ')}` });
      return;
    }
    
    dispatch({ type: 'UPDATE_UI_SETTINGS', payload: updates });
  }, []);

  const updateStorageSettings = useCallback((updates: Partial<StorageSettings>) => {
    const errors = validateSettings({ storage: updates });
    if (errors.length > 0) {
      dispatch({ type: 'SET_ERROR', payload: `Validation failed: ${errors.join(', ')}` });
      return;
    }
    
    dispatch({ type: 'UPDATE_STORAGE_SETTINGS', payload: updates });
  }, []);

  const saveSettings = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      await storageManager.setSettings(state.settings);
      
      dispatch({ type: 'SAVE_SETTINGS' });
      dispatch({ type: 'SET_ERROR', payload: null });
    } catch (error) {
      const contextError = new ContextError('Settings', 'saveSettings', error as Error);
      dispatch({ type: 'SET_ERROR', payload: contextError.message });
      console.error('Failed to save settings:', contextError);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.settings]);

  const resetSettings = useCallback(async () => {
    try {
      dispatch({ type: 'SET_RESET_IN_PROGRESS', payload: true });
      dispatch({ type: 'SET_LOADING', payload: true });
      
      await storageManager.setSettings(defaultSettings);
      
      dispatch({ type: 'RESET_SETTINGS' });
      dispatch({ type: 'SET_ERROR', payload: null });
    } catch (error) {
      const contextError = new ContextError('Settings', 'resetSettings', error as Error);
      dispatch({ type: 'SET_ERROR', payload: contextError.message });
      console.error('Failed to reset settings:', contextError);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_RESET_IN_PROGRESS', payload: false });
    }
  }, []);

  const restoreDefaults = useCallback(() => {
    dispatch({ type: 'RESTORE_DEFAULTS' });
  }, []);

  const importSettings = useCallback((settings: Partial<Settings>) => {
    const errors = validateSettings(settings);
    if (errors.length > 0) {
      dispatch({ type: 'SET_ERROR', payload: `Import validation failed: ${errors.join(', ')}` });
      return;
    }
    
    const mergedSettings = mergeWithDefaults(settings);
    dispatch({ type: 'IMPORT_SETTINGS', payload: mergedSettings });
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const storedSettings = await storageManager.getSettings();
      
      if (storedSettings) {
        const mergedSettings = mergeWithDefaults(storedSettings);
        dispatch({ type: 'IMPORT_SETTINGS', payload: mergedSettings });
        dispatch({ type: 'SET_UNSAVED_CHANGES', payload: false });
      } else {
        // First time setup - save defaults
        await storageManager.setSettings(defaultSettings);
        dispatch({ type: 'SET_UNSAVED_CHANGES', payload: false });
      }
      
      dispatch({ type: 'SET_ERROR', payload: null });
    } catch (error) {
      const contextError = new ContextError('Settings', 'loadSettings', error as Error);
      dispatch({ type: 'SET_ERROR', payload: contextError.message });
      console.error('Failed to load settings:', contextError);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  // =============================================================================
  // EFFECTS
  // =============================================================================

  // Load initial settings
  useEffect(() => {
    loadSettings();
  }, []); // Run only once on mount

  // Auto-save settings when they change (with debouncing)
  useEffect(() => {
    if (!state.hasUnsavedChanges || state.isLoading) {
      return;
    }

    const autoSaveTimer = setTimeout(() => {
      saveSettings();
    }, 2000); // Auto-save after 2 seconds of inactivity

    return () => clearTimeout(autoSaveTimer);
  }, [state.hasUnsavedChanges, state.isLoading, saveSettings]);

  // Apply theme changes to document
  useEffect(() => {
    const applyTheme = () => {
      const { theme } = state.settings.ui;
      const root = document.documentElement;
      
      if (theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.toggle('tk-dark', prefersDark);
        root.classList.toggle('tk-light', !prefersDark);
      } else {
        root.classList.toggle('tk-dark', theme === 'dark');
        root.classList.toggle('tk-light', theme === 'light');
      }
    };

    applyTheme();

    // Listen for system theme changes when auto theme is selected
    if (state.settings.ui.theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addListener(applyTheme);
      return () => mediaQuery.removeListener(applyTheme);
    }
  }, [state.settings.ui.theme]);

  // Set up keyboard shortcuts
  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      const { keyboardShortcuts } = state.settings.ui;
      const pressedKeys = [];
      
      if (event.ctrlKey) pressedKeys.push('Ctrl');
      if (event.shiftKey) pressedKeys.push('Shift');
      if (event.altKey) pressedKeys.push('Alt');
      if (event.metaKey) pressedKeys.push('Meta');
      
      pressedKeys.push(event.key);
      const shortcut = pressedKeys.join('+');
      
      // Find matching action
      const action = Object.entries(keyboardShortcuts).find(([, keys]) => keys === shortcut)?.[0];
      
      if (action) {
        event.preventDefault();
        
        // Dispatch custom event for the shortcut
        window.dispatchEvent(new CustomEvent('tabkiller-shortcut', {
          detail: { action }
        }));
      }
    };

    document.addEventListener('keydown', handleKeyboardShortcut);
    return () => document.removeEventListener('keydown', handleKeyboardShortcut);
  }, [state.settings.ui.keyboardShortcuts]);

  // =============================================================================
  // CONTEXT VALUE
  // =============================================================================

  const contextValue: SettingsContextValue = {
    state,
    actions: {
      updateGeneralSettings,
      updatePrivacySettings,
      updateUISettings,
      updateStorageSettings,
      saveSettings,
      resetSettings,
      restoreDefaults,
      importSettings,
      loadSettings,
      clearError
    }
  };

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
};

// =============================================================================
// HOOK
// =============================================================================

export const useSettingsContext = (): SettingsContextValue => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new ContextError('Settings', 'useSettingsContext', new Error('useSettingsContext must be used within SettingsProvider'));
  }
  return context;
};