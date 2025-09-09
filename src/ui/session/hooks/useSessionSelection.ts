/**
 * useSessionSelection Hook
 * Custom hook for managing session selection in lists
 */

import { useState, useCallback, useMemo } from 'react';
import { Session } from '../../../contexts/types';

export function useSessionSelection(sessions: Session[] = []) {
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());

  // Get selected session objects
  const selectedSessions = useMemo(() => {
    return sessions.filter(session => selectedSessionIds.has(session.id));
  }, [sessions, selectedSessionIds]);

  // Selection state
  const hasSelection = selectedSessionIds.size > 0;
  const selectedCount = selectedSessionIds.size;
  const isAllSelected = sessions.length > 0 && selectedSessionIds.size === sessions.length;
  const isPartiallySelected = hasSelection && !isAllSelected;

  // Toggle single session selection
  const toggleSession = useCallback((sessionId: string) => {
    setSelectedSessionIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  }, []);

  // Select single session (replace current selection)
  const selectSession = useCallback((sessionId: string) => {
    setSelectedSessionIds(new Set([sessionId]));
  }, []);

  // Add session to selection
  const addToSelection = useCallback((sessionId: string) => {
    setSelectedSessionIds(prev => new Set([...prev, sessionId]));
  }, []);

  // Remove session from selection
  const removeFromSelection = useCallback((sessionId: string) => {
    setSelectedSessionIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(sessionId);
      return newSet;
    });
  }, []);

  // Select multiple sessions
  const selectMultiple = useCallback((sessionIds: string[]) => {
    setSelectedSessionIds(new Set(sessionIds));
  }, []);

  // Add multiple sessions to selection
  const addMultipleToSelection = useCallback((sessionIds: string[]) => {
    setSelectedSessionIds(prev => new Set([...prev, ...sessionIds]));
  }, []);

  // Select all sessions
  const selectAll = useCallback(() => {
    setSelectedSessionIds(new Set(sessions.map(session => session.id)));
  }, [sessions]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedSessionIds(new Set());
  }, []);

  // Select range (from startIndex to endIndex)
  const selectRange = useCallback((startIndex: number, endIndex: number) => {
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    const rangeSessionIds = sessions.slice(start, end + 1).map(session => session.id);
    setSelectedSessionIds(new Set(rangeSessionIds));
  }, [sessions]);

  // Add range to selection
  const addRangeToSelection = useCallback((startIndex: number, endIndex: number) => {
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    const rangeSessionIds = sessions.slice(start, end + 1).map(session => session.id);
    addMultipleToSelection(rangeSessionIds);
  }, [sessions, addMultipleToSelection]);

  // Toggle all selection
  const toggleAll = useCallback(() => {
    if (isAllSelected) {
      clearSelection();
    } else {
      selectAll();
    }
  }, [isAllSelected, clearSelection, selectAll]);

  // Invert selection
  const invertSelection = useCallback(() => {
    const unselectedIds = sessions
      .filter(session => !selectedSessionIds.has(session.id))
      .map(session => session.id);
    setSelectedSessionIds(new Set(unselectedIds));
  }, [sessions, selectedSessionIds]);

  // Check if session is selected
  const isSessionSelected = useCallback((sessionId: string) => {
    return selectedSessionIds.has(sessionId);
  }, [selectedSessionIds]);

  // Keyboard selection handlers
  const handleKeyboardSelection = useCallback((
    sessionId: string,
    sessionIndex: number,
    event: React.KeyboardEvent | React.MouseEvent,
    lastSelectedIndex?: number
  ) => {
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd + Click: Toggle individual selection
      toggleSession(sessionId);
    } else if (event.shiftKey && lastSelectedIndex !== undefined) {
      // Shift + Click: Select range
      selectRange(lastSelectedIndex, sessionIndex);
    } else {
      // Regular click: Select only this session
      selectSession(sessionId);
    }
  }, [toggleSession, selectRange, selectSession]);

  // Get selection info for display
  const getSelectionInfo = useCallback(() => {
    if (selectedCount === 0) {
      return 'No sessions selected';
    } else if (selectedCount === 1) {
      return '1 session selected';
    } else if (isAllSelected) {
      return `All ${selectedCount} sessions selected`;
    } else {
      return `${selectedCount} sessions selected`;
    }
  }, [selectedCount, isAllSelected]);

  return {
    // State
    selectedSessionIds: Array.from(selectedSessionIds),
    selectedSessions,
    hasSelection,
    selectedCount,
    isAllSelected,
    isPartiallySelected,

    // Single selection actions
    toggleSession,
    selectSession,
    addToSelection,
    removeFromSelection,
    isSessionSelected,

    // Multiple selection actions
    selectMultiple,
    addMultipleToSelection,
    selectAll,
    clearSelection,
    toggleAll,
    invertSelection,

    // Range selection actions
    selectRange,
    addRangeToSelection,

    // Event handlers
    handleKeyboardSelection,

    // Utilities
    getSelectionInfo
  };
}