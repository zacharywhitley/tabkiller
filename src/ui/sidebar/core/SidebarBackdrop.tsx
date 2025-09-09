/**
 * Sidebar Backdrop Component
 * Overlay backdrop for mobile sidebar
 */

import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import styles from './SidebarBackdrop.module.css';

interface SidebarBackdropProps {
  onClick?: () => void;
  className?: string;
}

export const SidebarBackdrop = forwardRef<HTMLDivElement, SidebarBackdropProps>(({
  onClick,
  className,
  ...props
}, ref) => {
  
  const backdropClasses = clsx(styles.backdrop, className);

  return (
    <div
      ref={ref}
      className={backdropClasses}
      onClick={onClick}
      role="presentation"
      aria-hidden="true"
      {...props}
    />
  );
});

SidebarBackdrop.displayName = 'SidebarBackdrop';