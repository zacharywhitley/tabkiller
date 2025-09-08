import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { storageManager } from './storage';
import {
  UIState,
  UIAction,
  Notification,
  UIContextValue,
  ContextProviderProps,
  ContextError
} from './types';

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialUIState: UIState = {
  sidebarOpen: false,
  currentView: 'popup',
  currentModal: null,
  searchQuery: '',
  searchResults: [],
  selectedItems: [],
  sortBy: 'timestamp',
  sortOrder: 'desc',
  filterBy: {},
  pageSize: 20,
  currentPage: 1,
  notifications: [],
  isLoading: false,
  error: null,
  lastUpdated: Date.now()
};

// =============================================================================
// REDUCER
// =============================================================================

function uiReducer(state: UIState, action: UIAction): UIState {
  const now = Date.now();

  switch (action.type) {
    case 'TOGGLE_SIDEBAR':
      return {
        ...state,
        sidebarOpen: !state.sidebarOpen,
        lastUpdated: now
      };

    case 'SET_SIDEBAR_OPEN':
      return {
        ...state,
        sidebarOpen: action.payload,
        lastUpdated: now
      };

    case 'SET_CURRENT_VIEW':
      return {
        ...state,
        currentView: action.payload,
        lastUpdated: now
      };

    case 'OPEN_MODAL':
      return {
        ...state,
        currentModal: action.payload,
        lastUpdated: now
      };

    case 'CLOSE_MODAL':
      return {
        ...state,
        currentModal: null,
        lastUpdated: now
      };

    case 'SET_SEARCH_QUERY':
      return {
        ...state,
        searchQuery: action.payload,
        currentPage: 1, // Reset to first page when searching
        lastUpdated: now
      };

    case 'SET_SEARCH_RESULTS':
      return {
        ...state,
        searchResults: action.payload,
        lastUpdated: now
      };

    case 'SET_SELECTED_ITEMS':
      return {
        ...state,
        selectedItems: action.payload,
        lastUpdated: now
      };

    case 'ADD_SELECTED_ITEM': {
      const item = action.payload;
      if (!state.selectedItems.includes(item)) {
        return {
          ...state,
          selectedItems: [...state.selectedItems, item],
          lastUpdated: now
        };
      }
      return state;
    }

    case 'REMOVE_SELECTED_ITEM': {
      const item = action.payload;
      return {
        ...state,
        selectedItems: state.selectedItems.filter(i => i !== item),
        lastUpdated: now
      };
    }

    case 'CLEAR_SELECTED_ITEMS':
      return {
        ...state,
        selectedItems: [],
        lastUpdated: now
      };

    case 'SET_SORT': {
      const { sortBy, sortOrder } = action.payload;
      return {
        ...state,
        sortBy,
        sortOrder,
        lastUpdated: now
      };
    }

    case 'SET_FILTER': {
      const { key, value } = action.payload;
      return {
        ...state,
        filterBy: {
          ...state.filterBy,
          [key]: value
        },
        currentPage: 1, // Reset to first page when filtering
        lastUpdated: now
      };
    }

    case 'CLEAR_FILTERS':
      return {
        ...state,
        filterBy: {},
        currentPage: 1,
        lastUpdated: now
      };

    case 'SET_PAGE_SIZE':
      return {
        ...state,
        pageSize: action.payload,
        currentPage: 1, // Reset to first page when changing page size
        lastUpdated: now
      };

    case 'SET_CURRENT_PAGE':
      return {
        ...state,
        currentPage: action.payload,
        lastUpdated: now
      };

    case 'ADD_NOTIFICATION': {
      const notification: Notification = {
        ...action.payload,
        id: `notification_${now}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: now
      };

      return {
        ...state,
        notifications: [notification, ...state.notifications],
        lastUpdated: now
      };
    }

    case 'REMOVE_NOTIFICATION': {
      const notificationId = action.payload;
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== notificationId),
        lastUpdated: now
      };
    }

    case 'CLEAR_NOTIFICATIONS':
      return {
        ...state,
        notifications: [],
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
 * Generate a unique notification ID
 */
function generateNotificationId(): string {
  return `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if a notification should auto-close
 */
function shouldAutoClose(notification: Notification): boolean {
  if (!notification.autoClose) return false;
  const age = Date.now() - notification.timestamp;
  return age >= notification.duration;
}

/**
 * Create a notification with default values
 */
function createNotification(notification: Omit<Notification, 'id' | 'timestamp'>): Notification {
  return {
    ...notification,
    id: generateNotificationId(),
    timestamp: Date.now(),
    autoClose: notification.autoClose ?? true,
    duration: notification.duration ?? 5000
  };
}

// =============================================================================
// CONTEXT
// =============================================================================

const UIContext = createContext<UIContextValue | null>(null);

// =============================================================================
// PROVIDER
// =============================================================================

export const UIProvider: React.FC<ContextProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(uiReducer, initialUIState);

  // =============================================================================
  // ACTIONS
  // =============================================================================

  const toggleSidebar = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
  }, []);

  const setSidebarOpen = useCallback((open: boolean) => {
    dispatch({ type: 'SET_SIDEBAR_OPEN', payload: open });
  }, []);

  const setCurrentView = useCallback((view: UIState['currentView']) => {
    dispatch({ type: 'SET_CURRENT_VIEW', payload: view });
  }, []);

  const openModal = useCallback((modal: string) => {
    dispatch({ type: 'OPEN_MODAL', payload: modal });
  }, []);

  const closeModal = useCallback(() => {
    dispatch({ type: 'CLOSE_MODAL' });
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: query });
  }, []);

  const setSearchResults = useCallback((results: any[]) => {
    dispatch({ type: 'SET_SEARCH_RESULTS', payload: results });
  }, []);

  const setSelectedItems = useCallback((items: string[]) => {
    dispatch({ type: 'SET_SELECTED_ITEMS', payload: items });
  }, []);

  const addSelectedItem = useCallback((item: string) => {
    dispatch({ type: 'ADD_SELECTED_ITEM', payload: item });
  }, []);

  const removeSelectedItem = useCallback((item: string) => {
    dispatch({ type: 'REMOVE_SELECTED_ITEM', payload: item });
  }, []);

  const clearSelectedItems = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTED_ITEMS' });
  }, []);

  const setSort = useCallback((sortBy: string, sortOrder: 'asc' | 'desc') => {
    dispatch({ type: 'SET_SORT', payload: { sortBy, sortOrder } });
  }, []);

  const setFilter = useCallback((key: string, value: any) => {
    dispatch({ type: 'SET_FILTER', payload: { key, value } });
  }, []);

  const clearFilters = useCallback(() => {
    dispatch({ type: 'CLEAR_FILTERS' });
  }, []);

  const setPageSize = useCallback((size: number) => {
    dispatch({ type: 'SET_PAGE_SIZE', payload: size });
  }, []);

  const setCurrentPage = useCallback((page: number) => {
    dispatch({ type: 'SET_CURRENT_PAGE', payload: page });
  }, []);

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp'>) => {
    const fullNotification = createNotification(notification);
    dispatch({ type: 'ADD_NOTIFICATION', payload: fullNotification });

    // Auto-remove notification if it has auto-close enabled
    if (fullNotification.autoClose) {
      setTimeout(() => {
        dispatch({ type: 'REMOVE_NOTIFICATION', payload: fullNotification.id });
      }, fullNotification.duration);
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
  }, []);

  const clearNotifications = useCallback(() => {
    dispatch({ type: 'CLEAR_NOTIFICATIONS' });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  // =============================================================================
  // HELPER FUNCTIONS
  // =============================================================================

  const showSuccessNotification = useCallback((title: string, message: string) => {
    addNotification({
      type: 'success',
      title,
      message,
      autoClose: true,
      duration: 3000
    });
  }, [addNotification]);

  const showErrorNotification = useCallback((title: string, message: string) => {
    addNotification({
      type: 'error',
      title,
      message,
      autoClose: true,
      duration: 5000
    });
  }, [addNotification]);

  const showWarningNotification = useCallback((title: string, message: string) => {
    addNotification({
      type: 'warning',
      title,
      message,
      autoClose: true,
      duration: 4000
    });
  }, [addNotification]);

  const showInfoNotification = useCallback((title: string, message: string) => {
    addNotification({
      type: 'info',
      title,
      message,
      autoClose: true,
      duration: 3000
    });
  }, [addNotification]);

  // =============================================================================
  // EFFECTS
  // =============================================================================

  // Load initial UI state from storage
  useEffect(() => {
    const loadUIState = async () => {
      try {
        const storedUIState = await storageManager.getUIState();
        
        if (storedUIState) {
          // Restore certain UI state properties (but not all, like notifications)
          if (storedUIState.currentView) {
            dispatch({ type: 'SET_CURRENT_VIEW', payload: storedUIState.currentView });
          }
          
          if (storedUIState.sidebarOpen !== undefined) {
            dispatch({ type: 'SET_SIDEBAR_OPEN', payload: storedUIState.sidebarOpen });
          }
          
          if (storedUIState.sortBy && storedUIState.sortOrder) {
            dispatch({ type: 'SET_SORT', payload: { 
              sortBy: storedUIState.sortBy, 
              sortOrder: storedUIState.sortOrder 
            }});
          }
          
          if (storedUIState.pageSize) {
            dispatch({ type: 'SET_PAGE_SIZE', payload: storedUIState.pageSize });
          }
        }
      } catch (error) {
        console.error('Failed to load UI state from storage:', error);
      }
    };

    loadUIState();
  }, []);

  // Persist UI state changes
  useEffect(() => {
    const persistUIState = async () => {
      try {
        const stateToPersist = {
          currentView: state.currentView,
          sidebarOpen: state.sidebarOpen,
          sortBy: state.sortBy,
          sortOrder: state.sortOrder,
          pageSize: state.pageSize
        };
        
        await storageManager.setUIState(stateToPersist);
      } catch (error) {
        console.error('Failed to persist UI state:', error);
      }
    };

    // Debounce the persistence to avoid too many writes
    const timer = setTimeout(persistUIState, 1000);
    return () => clearTimeout(timer);
  }, [state.currentView, state.sidebarOpen, state.sortBy, state.sortOrder, state.pageSize]);

  // Clean up expired notifications
  useEffect(() => {
    const cleanupTimer = setInterval(() => {
      const now = Date.now();
      state.notifications.forEach(notification => {
        if (notification.autoClose && (now - notification.timestamp) >= notification.duration) {
          dispatch({ type: 'REMOVE_NOTIFICATION', payload: notification.id });
        }
      });
    }, 1000);

    return () => clearInterval(cleanupTimer);
  }, [state.notifications]);

  // Handle keyboard shortcuts for UI actions
  useEffect(() => {
    const handleKeyboardShortcut = (event: CustomEvent) => {
      const { action } = event.detail;
      
      switch (action) {
        case 'toggle-sidebar':
          toggleSidebar();
          break;
        case 'toggle-popup':
          setCurrentView('popup');
          break;
        case 'view-history':
          setCurrentView('history');
          break;
        case 'view-sessions':
          setCurrentView('sessions');
          break;
        case 'open-settings':
          openModal('settings');
          break;
        case 'clear-search':
          setSearchQuery('');
          break;
        case 'clear-selection':
          clearSelectedItems();
          break;
        default:
          break;
      }
    };

    window.addEventListener('tabkiller-shortcut', handleKeyboardShortcut as EventListener);
    return () => window.removeEventListener('tabkiller-shortcut', handleKeyboardShortcut as EventListener);
  }, [toggleSidebar, setCurrentView, openModal, setSearchQuery, clearSelectedItems]);

  // Handle modal close on escape key
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && state.currentModal) {
        closeModal();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [state.currentModal, closeModal]);

  // =============================================================================
  // CONTEXT VALUE
  // =============================================================================

  const contextValue: UIContextValue = {
    state,
    actions: {
      toggleSidebar,
      setSidebarOpen,
      setCurrentView,
      openModal,
      closeModal,
      setSearchQuery,
      setSearchResults,
      setSelectedItems,
      addSelectedItem,
      removeSelectedItem,
      clearSelectedItems,
      setSort,
      setFilter,
      clearFilters,
      setPageSize,
      setCurrentPage,
      addNotification,
      removeNotification,
      clearNotifications,
      clearError
    }
  };

  // Add helper methods to context value
  const extendedContextValue = {
    ...contextValue,
    helpers: {
      showSuccessNotification,
      showErrorNotification,
      showWarningNotification,
      showInfoNotification
    }
  };

  return (
    <UIContext.Provider value={extendedContextValue}>
      {children}
    </UIContext.Provider>
  );
};

// =============================================================================
// HOOK
// =============================================================================

export const useUIContext = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new ContextError('UI', 'useUIContext', new Error('useUIContext must be used within UIProvider'));
  }
  return context;
};