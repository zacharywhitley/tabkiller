/**
 * Sidebar Resize Handle Component
 * Draggable handle for resizing the sidebar
 */

import React, { forwardRef, useCallback, useRef, useState } from 'react';
import { clsx } from 'clsx';
import styles from './SidebarResizeHandle.module.css';

interface SidebarResizeHandleProps {
  onResize?: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
}

export const SidebarResizeHandle = forwardRef<HTMLDivElement, SidebarResizeHandleProps>(({
  onResize,
  minWidth = 240,
  maxWidth = 480,
  className,
  ...props
}, ref) => {
  
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setIsResizing(true);
    
    const sidebar = (event.target as HTMLElement).closest('[data-testid="sidebar"]') as HTMLElement;
    if (!sidebar) return;
    
    startXRef.current = event.clientX;
    startWidthRef.current = sidebar.offsetWidth;
    
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isResizing) return;
    
    const deltaX = event.clientX - startXRef.current;
    const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + deltaX));
    
    onResize?.(newWidth);
  }, [isResizing, minWidth, maxWidth, onResize]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // Add global mouse event listeners
  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const handleClasses = clsx(
    styles.handle,
    {
      [styles['handle--resizing']]: isResizing,
    },
    className
  );

  return (
    <div
      ref={ref}
      className={handleClasses}
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      tabIndex={0}
      {...props}
    />
  );
});

SidebarResizeHandle.displayName = 'SidebarResizeHandle';