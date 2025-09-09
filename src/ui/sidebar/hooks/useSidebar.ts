/**
 * Sidebar Hook
 * Custom hook for managing sidebar state, animations, and responsive behavior
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUIContext } from '../../../contexts/UIContext';
import { 
  SidebarState, 
  SidebarConfig, 
  UseSidebarReturn,
  AnimationState,
  TouchGesture
} from '../types';
import { 
  DEFAULT_SIDEBAR_CONFIG, 
  DEFAULT_ANIMATION_CONFIG,
  DEFAULT_RESPONSIVE_CONFIG,
  STORAGE_KEYS,
  PERFORMANCE
} from '../utils/constants';

// =============================================================================
// INITIAL STATE
// =============================================================================

const createInitialState = (config: SidebarConfig): SidebarState => ({
  isOpen: false,
  isCollapsed: false,
  width: config.defaultWidth,
  screenSize: 'desktop',
  isResizing: false,
  isAnimating: false,
  isOverlay: false,
  lastUpdated: Date.now()
});

const createInitialAnimationState = (): AnimationState => ({
  isAnimating: false,
  animationType: null,
  startTime: 0,
  duration: 0,
  progress: 0
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get screen size category based on window width
 */
const getScreenSize = (width: number, breakpoints: SidebarConfig['breakpoints']) => {
  if (width < breakpoints.mobile) return 'mobile';
  if (width < breakpoints.tablet) return 'tablet';
  return 'desktop';
};

/**
 * Determine if sidebar should be overlay mode
 */
const shouldUseOverlay = (screenWidth: number, threshold: number): boolean => {
  return screenWidth < threshold;
};

/**
 * Load persisted sidebar state from localStorage
 */
const loadPersistedState = (persistenceKey: string): Partial<SidebarState> | null => {
  try {
    const stored = localStorage.getItem(persistenceKey);
    if (!stored) return null;
    
    const parsed = JSON.parse(stored);
    // Validate the stored data structure
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        isOpen: Boolean(parsed.isOpen),
        isCollapsed: Boolean(parsed.isCollapsed),
        width: typeof parsed.width === 'number' ? parsed.width : DEFAULT_SIDEBAR_CONFIG.defaultWidth
      };
    }
  } catch (error) {
    console.warn('Failed to load persisted sidebar state:', error);
  }
  return null;
};

/**
 * Persist sidebar state to localStorage
 */
const persistState = (state: SidebarState, persistenceKey: string): void => {
  try {
    const stateToPersist = {
      isOpen: state.isOpen,
      isCollapsed: state.isCollapsed,
      width: state.width
    };
    localStorage.setItem(persistenceKey, JSON.stringify(stateToPersist));
  } catch (error) {
    console.warn('Failed to persist sidebar state:', error);
  }
};

// =============================================================================
// SIDEBAR HOOK
// =============================================================================

export const useSidebar = (userConfig?: Partial<SidebarConfig>): UseSidebarReturn => {
  // Merge user config with defaults
  const config = useMemo(() => ({
    ...DEFAULT_SIDEBAR_CONFIG,
    ...userConfig
  }), [userConfig]);

  // Get UI context for global sidebar state
  const { state: uiState, actions: uiActions } = useUIContext();

  // Local sidebar state
  const [localState, setLocalState] = useState<SidebarState>(() => {
    const initial = createInitialState(config);
    const persisted = loadPersistedState(config.persistenceKey);
    return { ...initial, ...persisted };
  });

  // Animation state
  const [animationState, setAnimationState] = useState<AnimationState>(createInitialAnimationState);

  // Refs for managing animations and event listeners
  const animationFrameRef = useRef<number>();
  const resizeObserverRef = useRef<ResizeObserver>();
  const touchStartRef = useRef<TouchGesture | null>(null);

  // =============================================================================
  // RESPONSIVE BEHAVIOR
  // =============================================================================

  // Handle window resize and update screen size
  useEffect(() => {
    const updateScreenSize = () => {
      const width = window.innerWidth;
      const screenSize = getScreenSize(width, config.breakpoints);
      const isOverlay = shouldUseOverlay(width, DEFAULT_RESPONSIVE_CONFIG.overlayThreshold);
      
      setLocalState(prev => {
        const shouldAutoCollapse = config.autoCollapseMobile && 
          screenSize === 'mobile' && 
          prev.screenSize !== 'mobile';
        
        return {
          ...prev,
          screenSize,
          isOverlay,
          isCollapsed: shouldAutoCollapse ? true : prev.isCollapsed,
          lastUpdated: Date.now()
        };
      });
    };

    // Initial check
    updateScreenSize();

    // Debounced resize handler
    let resizeTimer: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateScreenSize, PERFORMANCE.RESIZE_DEBOUNCE_MS);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
    };
  }, [config.breakpoints, config.autoCollapseMobile]);

  // =============================================================================
  // ANIMATION SYSTEM
  // =============================================================================

  /**
   * Start an animation with the given type and duration
   */
  const startAnimation = useCallback((
    type: AnimationState['animationType'],
    duration: number = DEFAULT_ANIMATION_CONFIG.expandDuration
  ) => {
    // Respect reduced motion preference
    if (DEFAULT_ANIMATION_CONFIG.respectReducedMotion && 
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      duration = 0;
    }

    setAnimationState({
      isAnimating: duration > 0,
      animationType: type,
      startTime: Date.now(),
      duration,
      progress: 0
    });

    setLocalState(prev => ({
      ...prev,
      isAnimating: duration > 0,
      lastUpdated: Date.now()
    }));

    if (duration > 0) {
      const animate = () => {
        const elapsed = Date.now() - animationState.startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        setAnimationState(prev => ({
          ...prev,
          progress
        }));

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          // Animation complete
          setAnimationState(createInitialAnimationState());
          setLocalState(prev => ({
            ...prev,
            isAnimating: false,
            lastUpdated: Date.now()
          }));
        }
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    }
  }, [animationState.startTime]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // =============================================================================
  // SIDEBAR ACTIONS
  // =============================================================================

  const toggle = useCallback(() => {
    const newIsOpen = !localState.isOpen;
    
    // Sync with UI context
    uiActions.setSidebarOpen(newIsOpen);
    
    // Update local state with animation
    setLocalState(prev => ({
      ...prev,
      isOpen: newIsOpen,
      lastUpdated: Date.now()
    }));

    // Start animation
    startAnimation(newIsOpen ? 'expand' : 'collapse', config.animationDuration);
    
    // Persist state
    setTimeout(() => {
      persistState({ ...localState, isOpen: newIsOpen }, config.persistenceKey);
    }, PERFORMANCE.PERSIST_DEBOUNCE_MS);
  }, [localState, uiActions, startAnimation, config.animationDuration, config.persistenceKey]);

  const open = useCallback(() => {
    if (!localState.isOpen) {
      toggle();
    }
  }, [localState.isOpen, toggle]);

  const close = useCallback(() => {
    if (localState.isOpen) {
      toggle();
    }
  }, [localState.isOpen, toggle]);

  const collapse = useCallback(() => {
    if (!localState.isCollapsed) {
      setLocalState(prev => ({
        ...prev,
        isCollapsed: true,
        lastUpdated: Date.now()
      }));
      
      startAnimation('collapse', DEFAULT_ANIMATION_CONFIG.resizeDuration);
      
      setTimeout(() => {
        persistState({ ...localState, isCollapsed: true }, config.persistenceKey);
      }, PERFORMANCE.PERSIST_DEBOUNCE_MS);
    }
  }, [localState, startAnimation, config.persistenceKey]);

  const expand = useCallback(() => {
    if (localState.isCollapsed) {
      setLocalState(prev => ({
        ...prev,
        isCollapsed: false,
        lastUpdated: Date.now()
      }));
      
      startAnimation('expand', DEFAULT_ANIMATION_CONFIG.resizeDuration);
      
      setTimeout(() => {
        persistState({ ...localState, isCollapsed: false }, config.persistenceKey);
      }, PERFORMANCE.PERSIST_DEBOUNCE_MS);
    }
  }, [localState, startAnimation, config.persistenceKey]);

  const setWidth = useCallback((width: number) => {
    const constrainedWidth = Math.min(Math.max(width, config.minWidth), config.maxWidth);
    
    setLocalState(prev => ({
      ...prev,
      width: constrainedWidth,
      lastUpdated: Date.now()
    }));

    startAnimation('resize', DEFAULT_ANIMATION_CONFIG.resizeDuration);
    
    setTimeout(() => {
      persistState({ ...localState, width: constrainedWidth }, config.persistenceKey);
    }, PERFORMANCE.PERSIST_DEBOUNCE_MS);
  }, [localState, config.minWidth, config.maxWidth, config.persistenceKey, startAnimation]);

  const resetWidth = useCallback(() => {
    setWidth(config.defaultWidth);
  }, [config.defaultWidth, setWidth]);

  // =============================================================================
  // SYNC WITH UI CONTEXT
  // =============================================================================

  // Sync local state with UI context
  useEffect(() => {
    if (uiState.sidebarOpen !== localState.isOpen) {
      setLocalState(prev => ({
        ...prev,
        isOpen: uiState.sidebarOpen,
        lastUpdated: Date.now()
      }));
    }
  }, [uiState.sidebarOpen, localState.isOpen]);

  // =============================================================================
  // TOUCH GESTURE SUPPORT
  // =============================================================================

  useEffect(() => {
    if (!DEFAULT_RESPONSIVE_CONFIG.enableSwipeGestures || localState.screenSize === 'desktop') {
      return;
    }

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      
      const touch = event.touches[0];
      touchStartRef.current = {
        type: 'swipe',
        direction: undefined,
        startPosition: { x: touch.clientX, y: touch.clientY },
        currentPosition: { x: touch.clientX, y: touch.clientY },
        velocity: 0,
        distance: 0,
        completed: false
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!touchStartRef.current || event.touches.length !== 1) return;
      
      const touch = event.touches[0];
      const gesture = touchStartRef.current;
      
      gesture.currentPosition = { x: touch.clientX, y: touch.clientY };
      gesture.distance = Math.abs(touch.clientX - gesture.startPosition.x);
      
      const threshold = window.innerWidth * DEFAULT_RESPONSIVE_CONFIG.touchSensitivity;
      
      if (gesture.distance > threshold) {
        const isSwipeRight = touch.clientX > gesture.startPosition.x;
        
        if (isSwipeRight && !localState.isOpen) {
          event.preventDefault();
          open();
          gesture.completed = true;
        } else if (!isSwipeRight && localState.isOpen) {
          event.preventDefault();
          close();
          gesture.completed = true;
        }
      }
    };

    const handleTouchEnd = () => {
      touchStartRef.current = null;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [localState.isOpen, localState.screenSize, open, close]);

  // =============================================================================
  // COMPUTED VALUES
  // =============================================================================

  const responsive = useMemo(() => ({
    isMobile: localState.screenSize === 'mobile',
    isTablet: localState.screenSize === 'tablet',
    isDesktop: localState.screenSize === 'desktop',
    shouldOverlay: localState.isOverlay,
    shouldAutoCollapse: config.autoCollapseMobile && localState.screenSize === 'mobile'
  }), [localState.screenSize, localState.isOverlay, config.autoCollapseMobile]);

  const animation = useMemo(() => ({
    isAnimating: animationState.isAnimating,
    progress: animationState.progress,
    duration: animationState.duration
  }), [animationState.isAnimating, animationState.progress, animationState.duration]);

  // =============================================================================
  // RETURN VALUE
  // =============================================================================

  return {
    state: localState,
    actions: {
      toggle,
      open,
      close,
      collapse,
      expand,
      setWidth,
      resetWidth
    },
    config,
    responsive,
    animation
  };
};