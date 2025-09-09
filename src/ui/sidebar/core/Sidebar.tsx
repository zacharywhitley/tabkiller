/**
 * Sidebar Component
 * Main collapsible sidebar component with animations and responsive behavior
 */

import React, { forwardRef, useEffect, useCallback, useRef } from 'react';
import { clsx } from 'clsx';
import { useSidebar } from '../hooks/useSidebar';
import { SidebarProps } from '../types';
import { DEFAULT_SECTIONS, KEYBOARD_SHORTCUTS, EVENTS } from '../utils/constants';
import { SidebarHeader } from './SidebarHeader';
import { SidebarContent } from './SidebarContent';
import { SidebarFooter } from './SidebarFooter';
import { SidebarResizeHandle } from './SidebarResizeHandle';
import { SidebarBackdrop } from './SidebarBackdrop';
import styles from './Sidebar.module.css';

/**
 * Sidebar Component
 * 
 * A collapsible sidebar with smooth animations, responsive behavior, and accessibility support.
 * Integrates with the TabKiller session management system to display current session information,
 * recent sessions, and provide quick actions for tab management.
 */
export const Sidebar = forwardRef<HTMLDivElement, SidebarProps>(({
  className,
  config: userConfig,
  sections = DEFAULT_SECTIONS,
  quickActions = [],
  showSessions = true,
  sessionConfig,
  onToggle,
  onResize,
  onSectionToggle,
  children,
  ...props
}, ref) => {
  
  // Sidebar state management
  const {
    state,
    actions,
    config,
    responsive,
    animation
  } = useSidebar(userConfig);

  // Refs for managing focus and resize
  const sidebarRef = useRef<HTMLDivElement>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);

  // =============================================================================
  // EVENT HANDLERS
  // =============================================================================

  // Handle toggle events
  const handleToggle = useCallback(() => {
    actions.toggle();
    onToggle?.(state.isOpen);
    
    // Dispatch custom event for integration with other components
    const event = new CustomEvent(EVENTS.SIDEBAR_TOGGLE, {
      detail: { isOpen: !state.isOpen }
    });
    window.dispatchEvent(event);
  }, [actions, state.isOpen, onToggle]);

  // Handle close events
  const handleClose = useCallback(() => {
    actions.close();
    onToggle?.(false);
    
    // Restore focus to previously focused element
    if (lastFocusedElement.current) {
      lastFocusedElement.current.focus();
      lastFocusedElement.current = null;
    }
  }, [actions, onToggle]);

  // Handle resize events
  const handleResize = useCallback((newWidth: number) => {
    actions.setWidth(newWidth);
    onResize?.(newWidth);
    
    // Dispatch custom event
    const event = new CustomEvent(EVENTS.SIDEBAR_RESIZE, {
      detail: { width: newWidth }
    });
    window.dispatchEvent(event);
  }, [actions, onResize]);

  // Handle section toggle events
  const handleSectionToggle = useCallback((sectionId: string, collapsed: boolean) => {
    onSectionToggle?.(sectionId, collapsed);
    
    // Dispatch custom event
    const event = new CustomEvent(EVENTS.SIDEBAR_SECTION_TOGGLE, {
      detail: { sectionId, collapsed }
    });
    window.dispatchEvent(event);
  }, [onSectionToggle]);

  // Handle backdrop click (close on overlay mode)
  const handleBackdropClick = useCallback(() => {
    if (responsive.shouldOverlay) {
      handleClose();
    }
  }, [responsive.shouldOverlay, handleClose]);

  // =============================================================================
  // KEYBOARD NAVIGATION
  // =============================================================================

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Handle escape key
      if (event.key === 'Escape' && state.isOpen) {
        event.preventDefault();
        handleClose();
        return;
      }

      // Handle keyboard shortcuts
      const isShortcutKey = event.ctrlKey || event.metaKey;
      if (!isShortcutKey) return;

      switch (event.key) {
        case 's':
          if (event.shiftKey) {
            event.preventDefault();
            handleToggle();
          }
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.isOpen, handleClose, handleToggle]);

  // =============================================================================
  // FOCUS MANAGEMENT
  // =============================================================================

  // Manage focus when sidebar opens/closes
  useEffect(() => {
    if (state.isOpen) {
      // Store currently focused element
      lastFocusedElement.current = document.activeElement as HTMLElement;
      
      // Focus first focusable element in sidebar
      setTimeout(() => {
        const focusableElements = sidebarRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusableElements?.[0] as HTMLElement;
        firstFocusable?.focus();
      }, animation.duration);
    }
  }, [state.isOpen, animation.duration]);

  // Trap focus within sidebar when open
  useEffect(() => {
    if (!state.isOpen || !sidebarRef.current) return;

    const handleFocusTrap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const focusableElements = sidebarRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as NodeListOf<HTMLElement>;

      if (!focusableElements || focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        // Shift + Tab (backward)
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab (forward)
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleFocusTrap);
    return () => document.removeEventListener('keydown', handleFocusTrap);
  }, [state.isOpen]);

  // =============================================================================
  // CSS VARIABLES AND CLASSES
  // =============================================================================

  // Calculate CSS custom properties for dynamic styling
  const cssVariables = {
    '--tk-sidebar-width': `${state.width}px`,
    '--tk-sidebar-animation-duration': `${animation.duration}ms`,
    '--tk-sidebar-animation-progress': animation.progress.toString()
  } as React.CSSProperties;

  // Calculate sidebar classes
  const sidebarClasses = clsx(
    styles.sidebar,
    {
      [styles['sidebar--open']]: state.isOpen,
      [styles['sidebar--collapsed']]: state.isCollapsed,
      [styles['sidebar--animating']]: animation.isAnimating,
      [styles['sidebar--mobile']]: responsive.isMobile,
      [styles['sidebar--tablet']]: responsive.isTablet,
      [styles['sidebar--desktop']]: responsive.isDesktop,
      [styles['sidebar--overlay']]: responsive.shouldOverlay,
      [styles['sidebar--resizable']]: config.resizable && !responsive.isMobile,
    },
    className
  );

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <>
      {/* Backdrop for overlay mode */}
      {responsive.shouldOverlay && state.isOpen && (
        <SidebarBackdrop 
          onClick={handleBackdropClick}
          className={styles.backdrop}
        />
      )}

      {/* Main sidebar container */}
      <aside
        ref={ref || sidebarRef}
        className={sidebarClasses}
        style={cssVariables}
        role="complementary"
        aria-label="TabKiller Sidebar"
        aria-hidden={!state.isOpen}
        data-testid="sidebar"
        {...props}
      >
        {/* Sidebar header */}
        <SidebarHeader
          showCloseButton={responsive.shouldOverlay}
          title="TabKiller"
          onClose={handleClose}
          className={styles.header}
        />

        {/* Sidebar content */}
        <SidebarContent
          sections={sections}
          showSessions={showSessions}
          sessionConfig={sessionConfig}
          onSectionToggle={handleSectionToggle}
          className={styles.content}
        >
          {children}
        </SidebarContent>

        {/* Sidebar footer with quick actions */}
        {quickActions.length > 0 && (
          <SidebarFooter
            quickActions={quickActions}
            showLabels={!state.isCollapsed}
            maxActions={responsive.isMobile ? 3 : 5}
            className={styles.footer}
          />
        )}

        {/* Resize handle for desktop */}
        {config.resizable && !responsive.isMobile && (
          <SidebarResizeHandle
            onResize={handleResize}
            minWidth={config.minWidth}
            maxWidth={config.maxWidth}
            className={styles.resizeHandle}
          />
        )}
      </aside>
    </>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;