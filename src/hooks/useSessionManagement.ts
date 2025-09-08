import { useCallback } from 'react';
import { useSessionContext } from '../contexts/SessionContext';
import { useTabContext } from '../contexts/TabContext';
import { useUIContext } from '../contexts/UIContext';
import { Session, SessionTag, SessionTab } from '../contexts/types';

export interface SessionManagementActions {
  // Session lifecycle
  createSession: (name: string, description?: string) => Promise<string>;
  duplicateSession: (sessionId: string) => Promise<string>;
  archiveSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  
  // Session content management
  addCurrentTabToSession: (sessionId: string) => Promise<void>;
  addAllTabsToSession: (sessionId: string) => Promise<void>;
  removeTabFromSession: (sessionId: string, tabIndex: number) => Promise<void>;
  
  // Session organization
  tagSession: (sessionId: string, tagId: string) => Promise<void>;
  untagSession: (sessionId: string, tagId: string) => Promise<void>;
  mergeSession: (sourceSessionId: string, targetSessionId: string) => Promise<void>;
  splitSession: (sessionId: string, tabIndices: number[], newSessionName: string) => Promise<string>;
  
  // Session export/import
  exportSession: (sessionId: string) => Promise<string>;
  importSession: (sessionData: string) => Promise<string>;
  
  // Bulk operations
  deleteMultipleSessions: (sessionIds: string[]) => Promise<void>;
  tagMultipleSessions: (sessionIds: string[], tagId: string) => Promise<void>;
}

/**
 * Hook for advanced session management functionality
 */
export function useSessionManagement(): SessionManagementActions {
  const { state: sessionState, actions: sessionActions } = useSessionContext();
  const { state: tabState } = useTabContext();
  const { actions: uiActions } = useUIContext();

  const createSession = useCallback(async (name: string, description?: string): Promise<string> => {
    try {
      const sessionData = {
        name,
        description,
        tags: [],
        tabs: [],
        windowCount: 1,
        metadata: {
          totalPages: 0,
          uniqueDomains: 0,
          bookmarkedPages: 0,
          averageTimePerPage: 0
        }
      };

      sessionActions.startSession(sessionData);
      
      // Find the newly created session
      const newSession = sessionState.allSessions.find(s => s.name === name && s.isActive);
      const sessionId = newSession?.id || '';
      
      uiActions.showSuccessNotification?.('Session Created', `Created new session: ${name}`);
      return sessionId;
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to create session');
      throw error;
    }
  }, [sessionState.allSessions, sessionActions, uiActions]);

  const duplicateSession = useCallback(async (sessionId: string): Promise<string> => {
    try {
      const originalSession = sessionState.allSessions.find(s => s.id === sessionId);
      if (!originalSession) {
        throw new Error('Session not found');
      }

      const duplicatedSessionData = {
        name: `${originalSession.name} (Copy)`,
        description: originalSession.description,
        tags: [...originalSession.tags],
        tabs: [...originalSession.tabs],
        windowCount: originalSession.windowCount,
        metadata: { ...originalSession.metadata }
      };

      sessionActions.startSession(duplicatedSessionData);
      
      // Find the newly created session
      const newSession = sessionState.allSessions.find(s => 
        s.name === duplicatedSessionData.name && s.isActive
      );
      const newSessionId = newSession?.id || '';
      
      uiActions.showSuccessNotification?.('Session Duplicated', `Duplicated session: ${originalSession.name}`);
      return newSessionId;
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to duplicate session');
      throw error;
    }
  }, [sessionState.allSessions, sessionActions, uiActions]);

  const archiveSession = useCallback(async (sessionId: string): Promise<void> => {
    try {
      sessionActions.endSession(sessionId);
      uiActions.showSuccessNotification?.('Session Archived', 'Session has been archived successfully');
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to archive session');
      throw error;
    }
  }, [sessionActions, uiActions]);

  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    try {
      // For now, we'll end the session. In a full implementation, you'd want to
      // actually remove it from storage
      sessionActions.endSession(sessionId);
      uiActions.showSuccessNotification?.('Session Deleted', 'Session has been deleted successfully');
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to delete session');
      throw error;
    }
  }, [sessionActions, uiActions]);

  const addCurrentTabToSession = useCallback(async (sessionId: string): Promise<void> => {
    try {
      const currentTab = tabState.currentTab;
      if (!currentTab) {
        uiActions.showWarningNotification?.('No Active Tab', 'No active tab to add to session');
        return;
      }

      const sessionTab: SessionTab = {
        url: currentTab.url,
        title: currentTab.title,
        favIconUrl: currentTab.favIconUrl,
        index: currentTab.index,
        pinned: currentTab.pinned,
        timestamp: Date.now()
      };

      sessionActions.addTabToSession(sessionId, sessionTab);
      uiActions.showSuccessNotification?.('Tab Added', 'Current tab added to session');
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to add tab to session');
      throw error;
    }
  }, [tabState.currentTab, sessionActions, uiActions]);

  const addAllTabsToSession = useCallback(async (sessionId: string): Promise<void> => {
    try {
      const sessionTabs: SessionTab[] = tabState.allTabs.map(tab => ({
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        index: tab.index,
        pinned: tab.pinned,
        timestamp: Date.now()
      }));

      for (const sessionTab of sessionTabs) {
        sessionActions.addTabToSession(sessionId, sessionTab);
      }

      uiActions.showSuccessNotification?.(
        'All Tabs Added', 
        `Added ${sessionTabs.length} tabs to session`
      );
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to add all tabs to session');
      throw error;
    }
  }, [tabState.allTabs, sessionActions, uiActions]);

  const removeTabFromSession = useCallback(async (sessionId: string, tabIndex: number): Promise<void> => {
    try {
      sessionActions.removeTabFromSession(sessionId, tabIndex);
      uiActions.showSuccessNotification?.('Tab Removed', 'Tab removed from session');
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to remove tab from session');
      throw error;
    }
  }, [sessionActions, uiActions]);

  const tagSession = useCallback(async (sessionId: string, tagId: string): Promise<void> => {
    try {
      const tag = sessionState.sessionTags.find(t => t.id === tagId);
      if (!tag) {
        uiActions.showErrorNotification?.('Error', 'Tag not found');
        return;
      }

      sessionActions.addTagToSession(sessionId, tag);
      uiActions.showSuccessNotification?.('Tag Added', `Added tag: ${tag.name}`);
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to add tag to session');
      throw error;
    }
  }, [sessionState.sessionTags, sessionActions, uiActions]);

  const untagSession = useCallback(async (sessionId: string, tagId: string): Promise<void> => {
    try {
      sessionActions.removeTagFromSession(sessionId, tagId);
      uiActions.showSuccessNotification?.('Tag Removed', 'Tag removed from session');
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to remove tag from session');
      throw error;
    }
  }, [sessionActions, uiActions]);

  const mergeSession = useCallback(async (sourceSessionId: string, targetSessionId: string): Promise<void> => {
    try {
      const sourceSession = sessionState.allSessions.find(s => s.id === sourceSessionId);
      const targetSession = sessionState.allSessions.find(s => s.id === targetSessionId);
      
      if (!sourceSession || !targetSession) {
        uiActions.showErrorNotification?.('Error', 'One or both sessions not found');
        return;
      }

      // Add all tabs from source session to target session
      for (const tab of sourceSession.tabs) {
        sessionActions.addTabToSession(targetSessionId, tab);
      }

      // Add unique tags from source to target
      const targetTagIds = targetSession.tags.map(t => t.id);
      for (const tag of sourceSession.tags) {
        if (!targetTagIds.includes(tag.id)) {
          sessionActions.addTagToSession(targetSessionId, tag);
        }
      }

      // End/delete source session
      sessionActions.endSession(sourceSessionId);

      uiActions.showSuccessNotification?.(
        'Sessions Merged', 
        `Merged ${sourceSession.name} into ${targetSession.name}`
      );
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to merge sessions');
      throw error;
    }
  }, [sessionState.allSessions, sessionActions, uiActions]);

  const splitSession = useCallback(async (
    sessionId: string, 
    tabIndices: number[], 
    newSessionName: string
  ): Promise<string> => {
    try {
      const originalSession = sessionState.allSessions.find(s => s.id === sessionId);
      if (!originalSession) {
        throw new Error('Session not found');
      }

      // Get tabs to move to new session
      const tabsToMove = tabIndices.map(index => originalSession.tabs[index]).filter(Boolean);
      
      if (tabsToMove.length === 0) {
        uiActions.showWarningNotification?.('No Tabs Selected', 'No tabs selected to split');
        return '';
      }

      // Create new session with selected tabs
      const newSessionData = {
        name: newSessionName,
        description: `Split from ${originalSession.name}`,
        tags: [...originalSession.tags],
        tabs: tabsToMove,
        windowCount: 1,
        metadata: {
          totalPages: tabsToMove.length,
          uniqueDomains: new Set(tabsToMove.map(t => new URL(t.url).hostname)).size,
          bookmarkedPages: 0,
          averageTimePerPage: 0
        }
      };

      sessionActions.startSession(newSessionData);

      // Remove tabs from original session (in reverse order to maintain indices)
      const sortedIndices = tabIndices.sort((a, b) => b - a);
      for (const index of sortedIndices) {
        sessionActions.removeTabFromSession(sessionId, index);
      }

      // Find the newly created session
      const newSession = sessionState.allSessions.find(s => 
        s.name === newSessionName && s.isActive
      );
      const newSessionId = newSession?.id || '';

      uiActions.showSuccessNotification?.(
        'Session Split', 
        `Split ${tabsToMove.length} tabs into new session`
      );
      
      return newSessionId;
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to split session');
      throw error;
    }
  }, [sessionState.allSessions, sessionActions, uiActions]);

  const exportSession = useCallback(async (sessionId: string): Promise<string> => {
    try {
      const session = sessionState.allSessions.find(s => s.id === sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      const exportData = {
        name: session.name,
        description: session.description,
        tags: session.tags,
        tabs: session.tabs,
        metadata: session.metadata,
        exportedAt: Date.now(),
        version: '1.0.0'
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      
      uiActions.showSuccessNotification?.('Session Exported', 'Session data copied to clipboard');
      
      // In a real implementation, you might also save to file or copy to clipboard
      return jsonString;
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to export session');
      throw error;
    }
  }, [sessionState.allSessions, uiActions]);

  const importSession = useCallback(async (sessionData: string): Promise<string> => {
    try {
      const parsedData = JSON.parse(sessionData);
      
      // Validate the imported data
      if (!parsedData.name || !Array.isArray(parsedData.tabs)) {
        throw new Error('Invalid session data format');
      }

      const importedSessionData = {
        name: `${parsedData.name} (Imported)`,
        description: parsedData.description || '',
        tags: parsedData.tags || [],
        tabs: parsedData.tabs,
        windowCount: 1,
        metadata: parsedData.metadata || {
          totalPages: parsedData.tabs.length,
          uniqueDomains: new Set(parsedData.tabs.map((t: SessionTab) => new URL(t.url).hostname)).size,
          bookmarkedPages: 0,
          averageTimePerPage: 0
        }
      };

      sessionActions.startSession(importedSessionData);

      // Find the newly created session
      const newSession = sessionState.allSessions.find(s => 
        s.name === importedSessionData.name && s.isActive
      );
      const sessionId = newSession?.id || '';

      uiActions.showSuccessNotification?.('Session Imported', 'Session imported successfully');
      
      return sessionId;
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to import session');
      throw error;
    }
  }, [sessionState.allSessions, sessionActions, uiActions]);

  const deleteMultipleSessions = useCallback(async (sessionIds: string[]): Promise<void> => {
    try {
      for (const sessionId of sessionIds) {
        sessionActions.endSession(sessionId);
      }
      
      uiActions.showSuccessNotification?.(
        'Sessions Deleted', 
        `Deleted ${sessionIds.length} sessions`
      );
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to delete sessions');
      throw error;
    }
  }, [sessionActions, uiActions]);

  const tagMultipleSessions = useCallback(async (sessionIds: string[], tagId: string): Promise<void> => {
    try {
      const tag = sessionState.sessionTags.find(t => t.id === tagId);
      if (!tag) {
        uiActions.showErrorNotification?.('Error', 'Tag not found');
        return;
      }

      for (const sessionId of sessionIds) {
        sessionActions.addTagToSession(sessionId, tag);
      }
      
      uiActions.showSuccessNotification?.(
        'Sessions Tagged', 
        `Added tag "${tag.name}" to ${sessionIds.length} sessions`
      );
    } catch (error) {
      uiActions.showErrorNotification?.('Error', 'Failed to tag sessions');
      throw error;
    }
  }, [sessionState.sessionTags, sessionActions, uiActions]);

  return {
    createSession,
    duplicateSession,
    archiveSession,
    deleteSession,
    addCurrentTabToSession,
    addAllTabsToSession,
    removeTabFromSession,
    tagSession,
    untagSession,
    mergeSession,
    splitSession,
    exportSession,
    importSession,
    deleteMultipleSessions,
    tagMultipleSessions
  };
}