/**
 * Timeline Navigation Hook
 * React hook for managing timeline navigation state and controls
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { HistoryTimelineItem } from '../../../../shared/types';
import { 
  TimelineNavigation,
  TimelineZoomLevel,
  TimelineViewMode,
  NavigationBookmark,
  TimelineControls,
  UseTimelineNavigation,
  AdvancedTimelineFilter
} from '../types';
import { 
  TimelineNavigationController, 
  NavigationCallbacks 
} from '../utils/TimelineNavigationController';

// Default navigation state
const DEFAULT_NAVIGATION: TimelineNavigation = {
  viewMode: 'timeline',
  zoomLevel: 'hours',
  timeRange: { start: 0, end: Date.now() },
  scrollPosition: 0,
  history: [],
  bookmarks: []
};

/**
 * Custom hook for timeline navigation functionality
 */
export function useTimelineNavigation(
  items: HistoryTimelineItem[],
  options: {
    initialNavigation?: Partial<TimelineNavigation>;
    enableAutoSave?: boolean;
    enableKeyboardNavigation?: boolean;
    storageKey?: string;
  } = {}
): UseTimelineNavigation {
  const {
    initialNavigation = {},
    enableAutoSave = true,
    enableKeyboardNavigation = true,
    storageKey = 'timeline-navigation'
  } = options;

  // State management
  const [navigation, setNavigation] = useState<TimelineNavigation>(() => {
    // Try to load from localStorage if auto-save is enabled
    if (enableAutoSave && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsedNavigation = JSON.parse(saved);
          return { ...DEFAULT_NAVIGATION, ...initialNavigation, ...parsedNavigation };
        }
      } catch (error) {
        console.warn('Failed to load navigation state from localStorage:', error);
      }
    }
    
    return { ...DEFAULT_NAVIGATION, ...initialNavigation };
  });

  // Navigation controller ref
  const controllerRef = useRef<TimelineNavigationController | null>(null);

  // Initialize navigation controller
  useEffect(() => {
    const callbacks: NavigationCallbacks = {
      onNavigationChange: (newNavigation) => {
        setNavigation(newNavigation);
      },
      onScrubbingChange: (position, preview) => {
        setNavigation(prev => ({
          ...prev,
          scrollPosition: position
        }));
      },
      onZoomChange: (level) => {
        setNavigation(prev => ({
          ...prev,
          zoomLevel: level
        }));
      },
      onViewModeChange: (mode) => {
        setNavigation(prev => ({
          ...prev,
          viewMode: mode
        }));
      },
      onItemNavigation: (item) => {
        // Handle item navigation callback
      },
      onBookmarkChange: (bookmarks) => {
        setNavigation(prev => ({
          ...prev,
          bookmarks
        }));
      }
    };

    controllerRef.current = new TimelineNavigationController(navigation, items);
    controllerRef.current.setCallbacks(callbacks);
  }, []);

  // Update controller when items change
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.updateItems(items);
    }
  }, [items]);

  // Auto-save navigation state
  useEffect(() => {
    if (enableAutoSave && typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, JSON.stringify(navigation));
      } catch (error) {
        console.warn('Failed to save navigation state to localStorage:', error);
      }
    }
  }, [navigation, enableAutoSave, storageKey]);

  // Memoized timeline controls
  const controls = useMemo<TimelineControls>(() => {
    if (!controllerRef.current) {
      // Return default controls structure
      return {
        scrubbing: {
          enabled: false,
          sensitivity: 1,
          showPreview: false,
          snapToItems: false,
          position: 0
        },
        zoom: {
          currentLevel: 'hours',
          availableLevels: ['minutes', 'hours', 'days', 'weeks', 'months', 'years'],
          zoomIn: () => {},
          zoomOut: () => {},
          setZoomLevel: () => {},
          zoomToFit: () => {},
          zoomToSelection: () => {}
        },
        playback: {
          isPlaying: false,
          speed: 1,
          availableSpeeds: [0.25, 0.5, 1, 2, 4],
          togglePlayback: () => {},
          stop: () => {},
          setSpeed: () => {},
          stepForward: () => {},
          stepBackward: () => {}
        },
        viewMode: {
          currentMode: 'timeline',
          availableModes: ['timeline', 'sessions', 'branching', 'calendar', 'heatmap', 'analytics'],
          setViewMode: () => {},
          toggleTimelineSessions: () => {}
        },
        quickNav: {
          jumpToToday: () => {},
          jumpToDate: () => {},
          jumpToItem: () => {},
          jumpToSessionStart: () => {},
          jumpToSessionEnd: () => {},
          previousSession: () => {},
          nextSession: () => {},
          previousDay: () => {},
          nextDay: () => {}
        }
      };
    }

    return {
      scrubbing: controllerRef.current.createScrubbingControls(),
      zoom: controllerRef.current.createZoomControls(),
      playback: controllerRef.current.createPlaybackControls(),
      viewMode: {
        currentMode: navigation.viewMode,
        availableModes: ['timeline', 'sessions', 'branching', 'calendar', 'heatmap', 'analytics'],
        setViewMode: (mode) => controllerRef.current?.setViewMode(mode),
        toggleTimelineSessions: () => {
          const newMode = navigation.viewMode === 'timeline' ? 'sessions' : 'timeline';
          controllerRef.current?.setViewMode(newMode);
        }
      },
      quickNav: controllerRef.current.createQuickNavigationControls()
    };
  }, [navigation.viewMode]);

  // Navigation action callbacks
  const navigateToItem = useCallback((itemId: string) => {
    controllerRef.current?.navigateToItem(itemId);
  }, []);

  const navigateToDate = useCallback((date: Date) => {
    controllerRef.current?.jumpToDate(date);
  }, []);

  const setZoomLevel = useCallback((level: TimelineZoomLevel) => {
    controllerRef.current?.setZoomLevel(level);
  }, []);

  const setViewMode = useCallback((mode: TimelineViewMode) => {
    controllerRef.current?.setViewMode(mode);
  }, []);

  const createBookmark = useCallback((label: string, notes?: string) => {
    controllerRef.current?.createBookmark(label, notes);
  }, []);

  const removeBookmark = useCallback((bookmarkId: string) => {
    controllerRef.current?.removeBookmark(bookmarkId);
  }, []);

  const goBack = useCallback(() => {
    controllerRef.current?.goBack();
  }, []);

  const goForward = useCallback(() => {
    controllerRef.current?.goForward();
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!enableKeyboardNavigation || typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (event.target instanceof HTMLInputElement || 
          event.target instanceof HTMLTextAreaElement) {
        return;
      }

      const { key, ctrlKey, metaKey, shiftKey } = event;
      const isModified = ctrlKey || metaKey;

      switch (key) {
        case 'ArrowLeft':
          if (isModified) {
            controls.quickNav.previousDay();
          } else if (shiftKey) {
            controls.quickNav.previousSession();
          } else {
            controls.playback.stepBackward();
          }
          event.preventDefault();
          break;

        case 'ArrowRight':
          if (isModified) {
            controls.quickNav.nextDay();
          } else if (shiftKey) {
            controls.quickNav.nextSession();
          } else {
            controls.playback.stepForward();
          }
          event.preventDefault();
          break;

        case 'ArrowUp':
          if (isModified) {
            controls.zoom.zoomIn();
          }
          event.preventDefault();
          break;

        case 'ArrowDown':
          if (isModified) {
            controls.zoom.zoomOut();
          }
          event.preventDefault();
          break;

        case ' ':
          controls.playback.togglePlayback();
          event.preventDefault();
          break;

        case 'Home':
          if (isModified) {
            controls.quickNav.jumpToToday();
          }
          event.preventDefault();
          break;

        case 'f':
          if (isModified) {
            controls.zoom.zoomToFit();
            event.preventDefault();
          }
          break;

        case 't':
          if (isModified) {
            controls.viewMode.toggleTimelineSessions();
            event.preventDefault();
          }
          break;

        case 'b':
          if (isModified) {
            createBookmark(`Bookmark ${new Date().toLocaleString()}`);
            event.preventDefault();
          }
          break;

        case 'Escape':
          if (controls.playback.isPlaying) {
            controls.playback.stop();
            event.preventDefault();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboardNavigation, controls, createBookmark]);

  return {
    navigation,
    controls,
    navigateToItem,
    navigateToDate,
    setZoomLevel,
    setViewMode,
    createBookmark,
    removeBookmark,
    goBack,
    goForward
  };
}

/**
 * Hook for managing timeline scrubbing
 */
export function useTimelineScrubbing(
  navigation: TimelineNavigation,
  onScrubbingChange: (position: number) => void,
  options: {
    sensitivity?: number;
    snapToItems?: boolean;
    showPreview?: boolean;
  } = {}
) {
  const { sensitivity = 1.0, snapToItems = true, showPreview = true } = options;

  const [isDragging, setIsDragging] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setIsDragging(true);
    event.preventDefault();
  }, []);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!isDragging) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    
    onScrubbingChange(position);
  }, [isDragging, onScrubbingChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setPreviewData(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove as any);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove as any);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return {
    isDragging,
    previewData,
    scrubHandlers: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp
    }
  };
}

/**
 * Hook for bookmark management with persistence
 */
export function useBookmarkManager(
  storageKey: string = 'timeline-bookmarks'
) {
  const [bookmarks, setBookmarks] = useState<NavigationBookmark[]>(() => {
    if (typeof window === 'undefined') return [];
    
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persist bookmarks
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, JSON.stringify(bookmarks));
      } catch (error) {
        console.warn('Failed to save bookmarks:', error);
      }
    }
  }, [bookmarks, storageKey]);

  const addBookmark = useCallback((bookmark: Omit<NavigationBookmark, 'id' | 'createdAt'>) => {
    const newBookmark: NavigationBookmark = {
      ...bookmark,
      id: `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now()
    };

    setBookmarks(prev => [...prev, newBookmark]);
    return newBookmark.id;
  }, []);

  const removeBookmark = useCallback((bookmarkId: string) => {
    setBookmarks(prev => prev.filter(bookmark => bookmark.id !== bookmarkId));
  }, []);

  const updateBookmark = useCallback((bookmarkId: string, updates: Partial<NavigationBookmark>) => {
    setBookmarks(prev => prev.map(bookmark => 
      bookmark.id === bookmarkId ? { ...bookmark, ...updates } : bookmark
    ));
  }, []);

  const clearBookmarks = useCallback(() => {
    setBookmarks([]);
  }, []);

  return {
    bookmarks,
    addBookmark,
    removeBookmark,
    updateBookmark,
    clearBookmarks
  };
}

/**
 * Hook for timeline performance monitoring
 */
export function useTimelinePerformance() {
  const [performanceData, setPerformanceData] = useState({
    renderTime: 0,
    scrollPerformance: 0,
    memoryUsage: 0,
    frameRate: 60
  });

  const measureRender = useCallback((startTime: number) => {
    const renderTime = performance.now() - startTime;
    
    setPerformanceData(prev => ({
      ...prev,
      renderTime
    }));
  }, []);

  const measureScroll = useCallback((callback: () => void) => {
    const startTime = performance.now();
    callback();
    const scrollTime = performance.now() - startTime;
    
    setPerformanceData(prev => ({
      ...prev,
      scrollPerformance: scrollTime
    }));
  }, []);

  return {
    performanceData,
    measureRender,
    measureScroll
  };
}