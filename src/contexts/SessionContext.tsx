import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { storageManager } from './storage';
import {
  SessionState,
  SessionAction,
  Session,
  SessionTag,
  SessionTab,
  SessionContextValue,
  ContextProviderProps,
  ContextError
} from './types';

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialSessionState: SessionState = {
  currentSession: null,
  allSessions: [],
  recentSessions: [],
  sessionTags: [],
  sessionStats: {
    totalSessions: 0,
    activeSessions: 0,
    todaysPages: 0,
    totalPages: 0,
    averageSessionDuration: 0
  },
  isLoading: false,
  error: null,
  lastUpdated: Date.now()
};

// =============================================================================
// REDUCER
// =============================================================================

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  const now = Date.now();

  switch (action.type) {
    case 'START_SESSION': {
      const newSession: Session = {
        ...action.payload,
        id: `session_${now}_${Math.random().toString(36).substr(2, 9)}`,
        startTime: now,
        isActive: true,
        metadata: {
          totalPages: 0,
          uniqueDomains: 0,
          bookmarkedPages: 0,
          averageTimePerPage: 0
        }
      };

      return {
        ...state,
        currentSession: newSession,
        allSessions: [newSession, ...state.allSessions],
        sessionStats: {
          ...state.sessionStats,
          totalSessions: state.sessionStats.totalSessions + 1,
          activeSessions: state.sessionStats.activeSessions + 1
        },
        lastUpdated: now
      };
    }

    case 'END_SESSION': {
      const sessionId = action.payload;
      const session = state.allSessions.find(s => s.id === sessionId);
      
      if (!session) return state;

      const endedSession = {
        ...session,
        endTime: now,
        duration: now - session.startTime,
        isActive: false
      };

      const updatedSessions = state.allSessions.map(s => 
        s.id === sessionId ? endedSession : s
      );

      return {
        ...state,
        currentSession: state.currentSession?.id === sessionId ? null : state.currentSession,
        allSessions: updatedSessions,
        recentSessions: [endedSession, ...state.recentSessions.filter(s => s.id !== sessionId)].slice(0, 10),
        sessionStats: {
          ...state.sessionStats,
          activeSessions: Math.max(0, state.sessionStats.activeSessions - 1)
        },
        lastUpdated: now
      };
    }

    case 'UPDATE_SESSION': {
      const { sessionId, updates } = action.payload;
      const updatedSessions = state.allSessions.map(session =>
        session.id === sessionId ? { ...session, ...updates } : session
      );

      return {
        ...state,
        allSessions: updatedSessions,
        currentSession: state.currentSession?.id === sessionId
          ? { ...state.currentSession, ...updates }
          : state.currentSession,
        lastUpdated: now
      };
    }

    case 'ADD_TAB_TO_SESSION': {
      const { sessionId, tab } = action.payload;
      const updatedSessions = state.allSessions.map(session => {
        if (session.id === sessionId) {
          const updatedTabs = [...session.tabs, tab];
          const uniqueDomains = new Set(updatedTabs.map(t => new URL(t.url).hostname)).size;
          
          return {
            ...session,
            tabs: updatedTabs,
            metadata: {
              ...session.metadata,
              totalPages: updatedTabs.length,
              uniqueDomains
            }
          };
        }
        return session;
      });

      return {
        ...state,
        allSessions: updatedSessions,
        currentSession: state.currentSession?.id === sessionId
          ? updatedSessions.find(s => s.id === sessionId) || state.currentSession
          : state.currentSession,
        lastUpdated: now
      };
    }

    case 'REMOVE_TAB_FROM_SESSION': {
      const { sessionId, tabIndex } = action.payload;
      const updatedSessions = state.allSessions.map(session => {
        if (session.id === sessionId) {
          const updatedTabs = session.tabs.filter((_, index) => index !== tabIndex);
          const uniqueDomains = new Set(updatedTabs.map(t => new URL(t.url).hostname)).size;
          
          return {
            ...session,
            tabs: updatedTabs,
            metadata: {
              ...session.metadata,
              totalPages: updatedTabs.length,
              uniqueDomains
            }
          };
        }
        return session;
      });

      return {
        ...state,
        allSessions: updatedSessions,
        currentSession: state.currentSession?.id === sessionId
          ? updatedSessions.find(s => s.id === sessionId) || state.currentSession
          : state.currentSession,
        lastUpdated: now
      };
    }

    case 'ADD_TAG_TO_SESSION': {
      const { sessionId, tag } = action.payload;
      const updatedSessions = state.allSessions.map(session =>
        session.id === sessionId
          ? { ...session, tags: [...session.tags, tag] }
          : session
      );

      return {
        ...state,
        allSessions: updatedSessions,
        currentSession: state.currentSession?.id === sessionId
          ? updatedSessions.find(s => s.id === sessionId) || state.currentSession
          : state.currentSession,
        lastUpdated: now
      };
    }

    case 'REMOVE_TAG_FROM_SESSION': {
      const { sessionId, tagId } = action.payload;
      const updatedSessions = state.allSessions.map(session =>
        session.id === sessionId
          ? { ...session, tags: session.tags.filter(tag => tag.id !== tagId) }
          : session
      );

      return {
        ...state,
        allSessions: updatedSessions,
        currentSession: state.currentSession?.id === sessionId
          ? updatedSessions.find(s => s.id === sessionId) || state.currentSession
          : state.currentSession,
        lastUpdated: now
      };
    }

    case 'CREATE_SESSION_TAG': {
      const newTag: SessionTag = {
        ...action.payload,
        id: `tag_${now}_${Math.random().toString(36).substr(2, 9)}`
      };

      return {
        ...state,
        sessionTags: [...state.sessionTags, newTag],
        lastUpdated: now
      };
    }

    case 'DELETE_SESSION_TAG': {
      const tagId = action.payload;
      
      // Remove tag from all sessions
      const updatedSessions = state.allSessions.map(session => ({
        ...session,
        tags: session.tags.filter(tag => tag.id !== tagId)
      }));

      return {
        ...state,
        sessionTags: state.sessionTags.filter(tag => tag.id !== tagId),
        allSessions: updatedSessions,
        currentSession: state.currentSession ? {
          ...state.currentSession,
          tags: state.currentSession.tags.filter(tag => tag.id !== tagId)
        } : null,
        lastUpdated: now
      };
    }

    case 'SET_CURRENT_SESSION':
      return {
        ...state,
        currentSession: action.payload,
        lastUpdated: now
      };

    case 'SET_ALL_SESSIONS':
      return {
        ...state,
        allSessions: action.payload,
        lastUpdated: now
      };

    case 'SET_RECENT_SESSIONS':
      return {
        ...state,
        recentSessions: action.payload,
        lastUpdated: now
      };

    case 'UPDATE_SESSION_STATS':
      return {
        ...state,
        sessionStats: {
          ...state.sessionStats,
          ...action.payload
        },
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
 * Calculate session statistics
 */
function calculateSessionStats(sessions: Session[]) {
  const now = Date.now();
  const today = new Date().toDateString();
  
  const activeSessions = sessions.filter(s => s.isActive).length;
  const todaysPages = sessions
    .filter(s => new Date(s.startTime).toDateString() === today)
    .reduce((total, s) => total + s.tabs.length, 0);
  
  const totalPages = sessions.reduce((total, s) => total + s.tabs.length, 0);
  
  const completedSessions = sessions.filter(s => s.duration);
  const averageSessionDuration = completedSessions.length > 0
    ? completedSessions.reduce((total, s) => total + (s.duration || 0), 0) / completedSessions.length
    : 0;

  return {
    totalSessions: sessions.length,
    activeSessions,
    todaysPages,
    totalPages,
    averageSessionDuration
  };
}

/**
 * Generate default session tags
 */
function getDefaultSessionTags(): SessionTag[] {
  return [
    { id: 'work', name: 'Work', color: '#2563eb', description: 'Work-related browsing' },
    { id: 'research', name: 'Research', color: '#16a34a', description: 'Research and learning' },
    { id: 'personal', name: 'Personal', color: '#dc2626', description: 'Personal browsing' },
    { id: 'shopping', name: 'Shopping', color: '#ca8a04', description: 'Online shopping' },
    { id: 'entertainment', name: 'Entertainment', color: '#9333ea', description: 'Entertainment and media' },
    { id: 'social', name: 'Social', color: '#0891b2', description: 'Social media and communication' },
    { id: 'development', name: 'Development', color: '#ea580c', description: 'Software development' },
    { id: 'documentation', name: 'Documentation', color: '#65a30d', description: 'Reading documentation' }
  ];
}

// =============================================================================
// CONTEXT
// =============================================================================

const SessionContext = createContext<SessionContextValue | null>(null);

// =============================================================================
// PROVIDER
// =============================================================================

export const SessionProvider: React.FC<ContextProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);

  // =============================================================================
  // ACTIONS
  // =============================================================================

  const startSession = useCallback((sessionData: Omit<Session, 'id' | 'startTime' | 'isActive'>) => {
    dispatch({ type: 'START_SESSION', payload: sessionData });
  }, []);

  const endSession = useCallback((sessionId: string) => {
    dispatch({ type: 'END_SESSION', payload: sessionId });
  }, []);

  const updateSession = useCallback((sessionId: string, updates: Partial<Session>) => {
    dispatch({ type: 'UPDATE_SESSION', payload: { sessionId, updates } });
  }, []);

  const addTabToSession = useCallback((sessionId: string, tab: SessionTab) => {
    dispatch({ type: 'ADD_TAB_TO_SESSION', payload: { sessionId, tab } });
  }, []);

  const removeTabFromSession = useCallback((sessionId: string, tabIndex: number) => {
    dispatch({ type: 'REMOVE_TAB_FROM_SESSION', payload: { sessionId, tabIndex } });
  }, []);

  const addTagToSession = useCallback((sessionId: string, tag: SessionTag) => {
    dispatch({ type: 'ADD_TAG_TO_SESSION', payload: { sessionId, tag } });
  }, []);

  const removeTagFromSession = useCallback((sessionId: string, tagId: string) => {
    dispatch({ type: 'REMOVE_TAG_FROM_SESSION', payload: { sessionId, tagId } });
  }, []);

  const createSessionTag = useCallback((tag: Omit<SessionTag, 'id'>) => {
    dispatch({ type: 'CREATE_SESSION_TAG', payload: tag });
  }, []);

  const deleteSessionTag = useCallback((tagId: string) => {
    dispatch({ type: 'DELETE_SESSION_TAG', payload: tagId });
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });

      const [sessions, sessionTags] = await Promise.all([
        storageManager.getSessions(),
        storageManager.getSessionTags()
      ]);

      if (sessions) {
        dispatch({ type: 'SET_ALL_SESSIONS', payload: sessions });
        
        // Update recent sessions
        const recentSessions = sessions
          .filter((s: Session) => !s.isActive)
          .sort((a: Session, b: Session) => (b.endTime || b.startTime) - (a.endTime || a.startTime))
          .slice(0, 10);
        
        dispatch({ type: 'SET_RECENT_SESSIONS', payload: recentSessions });

        // Find current active session
        const activeSession = sessions.find((s: Session) => s.isActive);
        if (activeSession) {
          dispatch({ type: 'SET_CURRENT_SESSION', payload: activeSession });
        }
      }

      // Load or create default tags
      if (sessionTags && sessionTags.length > 0) {
        state.sessionTags.length === 0 && sessionTags.forEach((tag: SessionTag) => {
          dispatch({ type: 'CREATE_SESSION_TAG', payload: tag });
        });
      } else {
        // Create default tags
        const defaultTags = getDefaultSessionTags();
        defaultTags.forEach(tag => {
          dispatch({ type: 'CREATE_SESSION_TAG', payload: tag });
        });
        await storageManager.setSessionTags(defaultTags);
      }

      dispatch({ type: 'SET_ERROR', payload: null });
    } catch (error) {
      const contextError = new ContextError('Session', 'loadSessions', error as Error);
      dispatch({ type: 'SET_ERROR', payload: contextError.message });
      console.error('Failed to load sessions:', contextError);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.sessionTags.length]);

  const updateSessionStats = useCallback(async () => {
    try {
      const stats = calculateSessionStats(state.allSessions);
      dispatch({ type: 'UPDATE_SESSION_STATS', payload: stats });
    } catch (error) {
      const contextError = new ContextError('Session', 'updateSessionStats', error as Error);
      console.error('Failed to update session stats:', contextError);
    }
  }, [state.allSessions]);

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  // =============================================================================
  // EFFECTS
  // =============================================================================

  // Load initial data
  useEffect(() => {
    loadSessions();
  }, []); // Run only once on mount

  // Auto-save sessions when they change
  useEffect(() => {
    if (state.allSessions.length > 0) {
      storageManager.setSessions(state.allSessions).catch(error => {
        console.error('Failed to persist sessions:', error);
      });
    }
  }, [state.allSessions]);

  // Auto-save session tags when they change
  useEffect(() => {
    if (state.sessionTags.length > 0) {
      storageManager.setSessionTags(state.sessionTags).catch(error => {
        console.error('Failed to persist session tags:', error);
      });
    }
  }, [state.sessionTags]);

  // Update session stats when sessions change
  useEffect(() => {
    updateSessionStats();
  }, [updateSessionStats]);

  // Auto-end sessions that have been inactive for too long
  useEffect(() => {
    const checkInactiveSessions = () => {
      const now = Date.now();
      const maxInactiveTime = 30 * 60 * 1000; // 30 minutes

      state.allSessions
        .filter(session => session.isActive)
        .forEach(session => {
          const lastActivity = Math.max(
            session.startTime,
            ...session.tabs.map(tab => tab.timestamp)
          );
          
          if (now - lastActivity > maxInactiveTime) {
            endSession(session.id);
          }
        });
    };

    const interval = setInterval(checkInactiveSessions, 5 * 60 * 1000); // Check every 5 minutes
    return () => clearInterval(interval);
  }, [state.allSessions, endSession]);

  // =============================================================================
  // CONTEXT VALUE
  // =============================================================================

  const contextValue: SessionContextValue = {
    state,
    actions: {
      startSession,
      endSession,
      updateSession,
      addTabToSession,
      removeTabFromSession,
      addTagToSession,
      removeTagFromSession,
      createSessionTag,
      deleteSessionTag,
      loadSessions,
      updateSessionStats,
      clearError
    }
  };

  return (
    <SessionContext.Provider value={contextValue}>
      {children}
    </SessionContext.Provider>
  );
};

// =============================================================================
// HOOK
// =============================================================================

export const useSessionContext = (): SessionContextValue => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new ContextError('Session', 'useSessionContext', new Error('useSessionContext must be used within SessionProvider'));
  }
  return context;
};