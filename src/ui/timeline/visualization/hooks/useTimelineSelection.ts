/**
 * Timeline Selection Hook
 * Manages timeline item and session selection state
 */

import { useState, useCallback, useMemo } from 'react';
import { 
  TimelineSelectionState, 
  SelectionMode, 
  TimelineInteraction,
  TimelineInteractionType
} from '../types/timeline';

interface UseTimelineSelectionOptions {
  /** Selection mode */
  mode?: SelectionMode;
  /** Maximum number of items to select */
  maxSelection?: number;
  /** Callback for selection changes */
  onSelectionChange?: (state: TimelineSelectionState) => void;
  /** Callback for interactions */
  onInteraction?: (interaction: TimelineInteraction) => void;
}

export function useTimelineSelection(options: UseTimelineSelectionOptions = {}) {
  const {
    mode = 'multiple',
    maxSelection = 100,
    onSelectionChange,
    onInteraction
  } = options;

  // Selection state
  const [selectionState, setSelectionState] = useState<TimelineSelectionState>({
    selectedItems: new Set(),
    selectedSessions: new Set(),
    mode,
    lastSelection: 0
  });

  // Record interaction
  const recordInteraction = useCallback((
    type: TimelineInteractionType,
    targetId: string,
    data?: any
  ) => {
    const interaction: TimelineInteraction = {
      type,
      targetId,
      timestamp: Date.now(),
      data
    };
    
    onInteraction?.(interaction);
  }, [onInteraction]);

  // Select single item
  const selectItem = useCallback((itemId: string, addToSelection = false) => {
    setSelectionState(prevState => {
      let newSelectedItems: Set<string>;
      let newSelectedSessions = prevState.selectedSessions;

      switch (prevState.mode) {
        case 'none':
          return prevState;
          
        case 'single':
          newSelectedItems = new Set([itemId]);
          newSelectedSessions = new Set();
          break;
          
        case 'multiple':
          if (addToSelection && prevState.selectedItems.has(itemId)) {
            // Deselect if already selected
            newSelectedItems = new Set(prevState.selectedItems);
            newSelectedItems.delete(itemId);
          } else if (addToSelection) {
            // Add to selection
            newSelectedItems = new Set(prevState.selectedItems);
            if (newSelectedItems.size < maxSelection) {
              newSelectedItems.add(itemId);
            }
          } else {
            // Replace selection
            newSelectedItems = new Set([itemId]);
            newSelectedSessions = new Set();
          }
          break;
          
        case 'range':
          // TODO: Implement range selection based on timestamps
          newSelectedItems = new Set([itemId]);
          newSelectedSessions = new Set();
          break;
          
        default:
          newSelectedItems = prevState.selectedItems;
      }

      const newState = {
        ...prevState,
        selectedItems: newSelectedItems,
        selectedSessions: newSelectedSessions,
        lastSelection: Date.now()
      };

      onSelectionChange?.(newState);
      recordInteraction('item_select', itemId, { addToSelection });
      
      return newState;
    });
  }, [maxSelection, onSelectionChange, recordInteraction]);

  // Select session
  const selectSession = useCallback((sessionId: string, addToSelection = false) => {
    setSelectionState(prevState => {
      let newSelectedSessions: Set<string>;
      let newSelectedItems = prevState.selectedItems;

      switch (prevState.mode) {
        case 'none':
          return prevState;
          
        case 'single':
        case 'session':
          newSelectedSessions = new Set([sessionId]);
          newSelectedItems = new Set();
          break;
          
        case 'multiple':
          if (addToSelection && prevState.selectedSessions.has(sessionId)) {
            // Deselect if already selected
            newSelectedSessions = new Set(prevState.selectedSessions);
            newSelectedSessions.delete(sessionId);
          } else if (addToSelection) {
            // Add to selection
            newSelectedSessions = new Set(prevState.selectedSessions);
            if (newSelectedSessions.size < maxSelection) {
              newSelectedSessions.add(sessionId);
            }
          } else {
            // Replace selection
            newSelectedSessions = new Set([sessionId]);
            newSelectedItems = new Set();
          }
          break;
          
        default:
          newSelectedSessions = prevState.selectedSessions;
      }

      const newState = {
        ...prevState,
        selectedItems: newSelectedItems,
        selectedSessions: newSelectedSessions,
        lastSelection: Date.now()
      };

      onSelectionChange?.(newState);
      recordInteraction('session_select', sessionId, { addToSelection });
      
      return newState;
    });
  }, [maxSelection, onSelectionChange, recordInteraction]);

  // Select multiple items by IDs
  const selectMultipleItems = useCallback((itemIds: string[]) => {
    if (selectionState.mode === 'none' || selectionState.mode === 'single') {
      return;
    }

    setSelectionState(prevState => {
      const newSelectedItems = new Set(prevState.selectedItems);
      
      itemIds.slice(0, maxSelection - newSelectedItems.size).forEach(id => {
        newSelectedItems.add(id);
      });

      const newState = {
        ...prevState,
        selectedItems: newSelectedItems,
        selectedSessions: new Set(),
        lastSelection: Date.now()
      };

      onSelectionChange?.(newState);
      recordInteraction('item_select', 'multiple', { itemIds, count: itemIds.length });
      
      return newState;
    });
  }, [selectionState.mode, maxSelection, onSelectionChange, recordInteraction]);

  // Toggle item selection
  const toggleItemSelection = useCallback((itemId: string) => {
    selectItem(itemId, true);
  }, [selectItem]);

  // Toggle session selection
  const toggleSessionSelection = useCallback((sessionId: string) => {
    selectSession(sessionId, true);
  }, [selectSession]);

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectionState(prevState => {
      const newState = {
        ...prevState,
        selectedItems: new Set(),
        selectedSessions: new Set(),
        lastSelection: Date.now()
      };

      onSelectionChange?.(newState);
      recordInteraction('item_select', 'clear', { cleared: true });
      
      return newState;
    });
  }, [onSelectionChange, recordInteraction]);

  // Select all items in current view
  const selectAll = useCallback((availableItemIds: string[]) => {
    if (selectionState.mode === 'none' || selectionState.mode === 'single') {
      return;
    }

    selectMultipleItems(availableItemIds);
  }, [selectionState.mode, selectMultipleItems]);

  // Invert selection
  const invertSelection = useCallback((availableItemIds: string[]) => {
    if (selectionState.mode === 'none' || selectionState.mode === 'single') {
      return;
    }

    setSelectionState(prevState => {
      const currentSelection = prevState.selectedItems;
      const newSelection = new Set<string>();
      
      availableItemIds.forEach(id => {
        if (!currentSelection.has(id)) {
          newSelection.add(id);
        }
      });

      const newState = {
        ...prevState,
        selectedItems: newSelection,
        selectedSessions: new Set(),
        lastSelection: Date.now()
      };

      onSelectionChange?.(newState);
      recordInteraction('item_select', 'invert', { newCount: newSelection.size });
      
      return newState;
    });
  }, [onSelectionChange, recordInteraction]);

  // Change selection mode
  const setSelectionMode = useCallback((newMode: SelectionMode) => {
    setSelectionState(prevState => {
      // Clear selections when changing modes
      const newState = {
        ...prevState,
        mode: newMode,
        selectedItems: new Set(),
        selectedSessions: new Set(),
        lastSelection: Date.now()
      };

      onSelectionChange?.(newState);
      
      return newState;
    });
  }, [onSelectionChange]);

  // Check if item/session is selected
  const isSelected = useCallback((type: 'item' | 'session', id: string): boolean => {
    return type === 'item' 
      ? selectionState.selectedItems.has(id)
      : selectionState.selectedSessions.has(id);
  }, [selectionState]);

  // Get selection summary
  const selectionSummary = useMemo(() => ({
    totalSelected: selectionState.selectedItems.size + selectionState.selectedSessions.size,
    itemsSelected: selectionState.selectedItems.size,
    sessionsSelected: selectionState.selectedSessions.size,
    hasSelection: selectionState.selectedItems.size > 0 || selectionState.selectedSessions.size > 0,
    canSelectMore: (selectionState.selectedItems.size + selectionState.selectedSessions.size) < maxSelection,
    selectionMode: selectionState.mode
  }), [selectionState, maxSelection]);

  // Range selection helper
  const selectRange = useCallback((startId: string, endId: string, availableItems: Array<{ id: string; timestamp: number }>) => {
    if (selectionState.mode !== 'range' && selectionState.mode !== 'multiple') {
      return;
    }

    const startItem = availableItems.find(item => item.id === startId);
    const endItem = availableItems.find(item => item.id === endId);
    
    if (!startItem || !endItem) return;

    const startTime = Math.min(startItem.timestamp, endItem.timestamp);
    const endTime = Math.max(startItem.timestamp, endItem.timestamp);

    const rangeItems = availableItems
      .filter(item => item.timestamp >= startTime && item.timestamp <= endTime)
      .map(item => item.id);

    selectMultipleItems(rangeItems);
  }, [selectionState.mode, selectMultipleItems]);

  return {
    selectionState,
    selectItem,
    selectSession,
    selectMultipleItems,
    toggleItemSelection,
    toggleSessionSelection,
    clearSelection,
    selectAll,
    invertSelection,
    selectRange,
    setSelectionMode,
    isSelected,
    selectionSummary
  };
}