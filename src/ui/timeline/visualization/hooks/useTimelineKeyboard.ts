/**
 * Timeline Keyboard Hook
 * Handles keyboard navigation and shortcuts for timeline visualization
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { TimelineVisualizationItem, KeyboardShortcut } from '../types/timeline';

interface UseTimelineKeyboardOptions {
  /** Available timeline items */
  items: TimelineVisualizationItem[];
  /** Item selection callback */
  onItemSelect?: (itemId: string) => void;
  /** Session selection callback */
  onSessionSelect?: (sessionId: string) => void;
  /** Zoom change callback */
  onZoomChange?: (direction: 'in' | 'out') => void;
  /** View mode change callback */
  onViewModeChange?: () => void;
  /** Enable keyboard navigation */
  enabled?: boolean;
}

export function useTimelineKeyboard(options: UseTimelineKeyboardOptions) {
  const {
    items,
    onItemSelect,
    onSessionSelect,
    onZoomChange,
    onViewModeChange,
    enabled = true
  } = options;

  // Keyboard navigation state
  const [focusedItem, setFocusedItem] = useState<string | null>(null);
  const [navigationMode, setNavigationMode] = useState<'item' | 'session'>('item');
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  // Find current focused item index
  const focusedIndex = useMemo(() => {
    if (!focusedItem) return -1;
    return items.findIndex(item => item.id === focusedItem);
  }, [items, focusedItem]);

  // Navigate to next item
  const navigateNext = useCallback(() => {
    if (items.length === 0) return;
    
    const currentIndex = focusedIndex;
    const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
    const nextItem = items[nextIndex];
    
    if (nextItem) {
      setFocusedItem(nextItem.id);
      
      // Scroll item into view
      const element = document.querySelector(`[data-item-id="${nextItem.id}"]`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [items, focusedIndex]);

  // Navigate to previous item
  const navigatePrevious = useCallback(() => {
    if (items.length === 0) return;
    
    const currentIndex = focusedIndex;
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
    const prevItem = items[prevIndex];
    
    if (prevItem) {
      setFocusedItem(prevItem.id);
      
      // Scroll item into view
      const element = document.querySelector(`[data-item-id="${prevItem.id}"]`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [items, focusedIndex]);

  // Navigate to first item
  const navigateFirst = useCallback(() => {
    if (items.length > 0) {
      const firstItem = items[0];
      setFocusedItem(firstItem.id);
      
      const element = document.querySelector(`[data-item-id="${firstItem.id}"]`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [items]);

  // Navigate to last item
  const navigateLast = useCallback(() => {
    if (items.length > 0) {
      const lastItem = items[items.length - 1];
      setFocusedItem(lastItem.id);
      
      const element = document.querySelector(`[data-item-id="${lastItem.id}"]`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [items]);

  // Select currently focused item
  const selectFocusedItem = useCallback(() => {
    if (focusedItem) {
      const item = items.find(i => i.id === focusedItem);
      if (item) {
        if (navigationMode === 'item') {
          onItemSelect?.(focusedItem);
        } else if (navigationMode === 'session' && item.sessionContext) {
          onSessionSelect?.(item.sessionContext.sessionId);
        }
      }
    }
  }, [focusedItem, items, navigationMode, onItemSelect, onSessionSelect]);

  // Navigate by session
  const navigateToNextSession = useCallback(() => {
    if (!focusedItem || items.length === 0) return;
    
    const currentItem = items.find(i => i.id === focusedItem);
    if (!currentItem?.sessionContext) return;
    
    const currentSessionId = currentItem.sessionContext.sessionId;
    
    // Find next item with different session
    const currentIndex = focusedIndex;
    for (let i = currentIndex + 1; i < items.length; i++) {
      const item = items[i];
      if (item.sessionContext?.sessionId !== currentSessionId) {
        setFocusedItem(item.id);
        const element = document.querySelector(`[data-item-id="${item.id}"]`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      }
    }
  }, [focusedItem, items, focusedIndex]);

  const navigateToPreviousSession = useCallback(() => {
    if (!focusedItem || items.length === 0) return;
    
    const currentItem = items.find(i => i.id === focusedItem);
    if (!currentItem?.sessionContext) return;
    
    const currentSessionId = currentItem.sessionContext.sessionId;
    
    // Find previous item with different session
    const currentIndex = focusedIndex;
    for (let i = currentIndex - 1; i >= 0; i--) {
      const item = items[i];
      if (item.sessionContext?.sessionId !== currentSessionId) {
        setFocusedItem(item.id);
        const element = document.querySelector(`[data-item-id="${item.id}"]`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      }
    }
  }, [focusedItem, items, focusedIndex]);

  // Jump to specific time period
  const jumpToTimeRange = useCallback((direction: 'start' | 'end' | 'middle') => {
    if (items.length === 0) return;
    
    let targetItem: TimelineVisualizationItem;
    
    switch (direction) {
      case 'start':
        targetItem = items[0];
        break;
      case 'end':
        targetItem = items[items.length - 1];
        break;
      case 'middle':
        targetItem = items[Math.floor(items.length / 2)];
        break;
    }
    
    setFocusedItem(targetItem.id);
    const element = document.querySelector(`[data-item-id="${targetItem.id}"]`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [items]);

  // Keyboard shortcuts definition
  const shortcuts = useMemo<KeyboardShortcut[]>(() => [
    {
      id: 'navigate-next',
      combination: ['ArrowDown', 'j'],
      description: 'Navigate to next item',
      action: navigateNext,
      context: ['timeline'],
      enabled: true
    },
    {
      id: 'navigate-previous',
      combination: ['ArrowUp', 'k'],
      description: 'Navigate to previous item',
      action: navigatePrevious,
      context: ['timeline'],
      enabled: true
    },
    {
      id: 'navigate-first',
      combination: ['Home', 'g g'],
      description: 'Navigate to first item',
      action: navigateFirst,
      context: ['timeline'],
      enabled: true
    },
    {
      id: 'navigate-last',
      combination: ['End', 'G'],
      description: 'Navigate to last item',
      action: navigateLast,
      context: ['timeline'],
      enabled: true
    },
    {
      id: 'select-item',
      combination: ['Enter', ' '],
      description: 'Select focused item',
      action: selectFocusedItem,
      context: ['timeline'],
      enabled: true
    },
    {
      id: 'next-session',
      combination: ['Shift+ArrowDown', 'Shift+j'],
      description: 'Navigate to next session',
      action: navigateToNextSession,
      context: ['timeline'],
      enabled: true
    },
    {
      id: 'previous-session',
      combination: ['Shift+ArrowUp', 'Shift+k'],
      description: 'Navigate to previous session',
      action: navigateToPreviousSession,
      context: ['timeline'],
      enabled: true
    },
    {
      id: 'zoom-in',
      combination: ['+', '='],
      description: 'Zoom in',
      action: () => onZoomChange?.('in'),
      context: ['timeline'],
      enabled: true
    },
    {
      id: 'zoom-out',
      combination: ['-'],
      description: 'Zoom out',
      action: () => onZoomChange?.('out'),
      context: ['timeline'],
      enabled: true
    },
    {
      id: 'toggle-view',
      combination: ['v'],
      description: 'Toggle view mode',
      action: () => onViewModeChange?.(),
      context: ['timeline'],
      enabled: true
    },
    {
      id: 'jump-start',
      combination: ['0'],
      description: 'Jump to timeline start',
      action: () => jumpToTimeRange('start'),
      context: ['timeline'],
      enabled: true
    },
    {
      id: 'jump-end',
      combination: ['$'],
      description: 'Jump to timeline end',
      action: () => jumpToTimeRange('end'),
      context: ['timeline'],
      enabled: true
    },
    {
      id: 'jump-middle',
      combination: ['M'],
      description: 'Jump to timeline middle',
      action: () => jumpToTimeRange('middle'),
      context: ['timeline'],
      enabled: true
    },
    {
      id: 'toggle-help',
      combination: ['?', 'h'],
      description: 'Show/hide keyboard shortcuts',
      action: () => setShowShortcutHelp(!showShortcutHelp),
      context: ['timeline'],
      enabled: true
    },
    {
      id: 'escape',
      combination: ['Escape'],
      description: 'Clear focus/close dialogs',
      action: () => {
        setFocusedItem(null);
        setShowShortcutHelp(false);
      },
      context: ['timeline'],
      enabled: true
    }
  ], [
    navigateNext, navigatePrevious, navigateFirst, navigateLast,
    selectFocusedItem, navigateToNextSession, navigateToPreviousSession,
    onZoomChange, onViewModeChange, jumpToTimeRange, showShortcutHelp
  ]);

  // Main keyboard event handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Don't handle keys when user is typing in an input
    const target = event.target as HTMLElement;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || 
        target?.contentEditable === 'true') {
      return;
    }

    // Find matching shortcut
    const matchingShortcut = shortcuts.find(shortcut => 
      shortcut.enabled && shortcut.combination.some(combo => {
        // Handle simple key combinations
        if (combo === event.key) return true;
        
        // Handle modifier combinations
        if (combo.includes('Shift+') && !event.shiftKey) return false;
        if (combo.includes('Ctrl+') && !event.ctrlKey) return false;
        if (combo.includes('Alt+') && !event.altKey) return false;
        
        const baseKey = combo.replace(/^(Shift\+|Ctrl\+|Alt\+)/, '');
        return baseKey === event.key;
      })
    );

    if (matchingShortcut) {
      event.preventDefault();
      matchingShortcut.action();
    }
  }, [enabled, shortcuts]);

  // Initialize focus on first item
  useEffect(() => {
    if (items.length > 0 && !focusedItem) {
      setFocusedItem(items[0].id);
    }
  }, [items, focusedItem]);

  // Auto-focus on item changes
  useEffect(() => {
    if (focusedItem && enabled) {
      const element = document.querySelector(`[data-item-id="${focusedItem}"]`) as HTMLElement;
      if (element && document.activeElement !== element) {
        element.focus();
      }
    }
  }, [focusedItem, enabled]);

  return {
    // Navigation state
    focusedItem,
    setFocusedItem,
    navigationMode,
    setNavigationMode,
    
    // Navigation actions
    navigateNext,
    navigatePrevious,
    navigateFirst,
    navigateLast,
    navigateToNextSession,
    navigateToPreviousSession,
    selectFocusedItem,
    jumpToTimeRange,
    
    // Keyboard handling
    handleKeyDown,
    shortcuts,
    
    // Help system
    showShortcutHelp,
    setShowShortcutHelp
  };
}