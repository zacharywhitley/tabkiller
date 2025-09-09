/**
 * Sidebar Header Component
 * Header section of the sidebar with title and close button
 */

import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { Button } from '../../components/foundation/Button/Button';
import { SidebarHeaderProps } from '../types';
import styles from './SidebarHeader.module.css';

/**
 * SidebarHeader Component
 * 
 * Displays the sidebar title and optional close button.
 * Provides consistent header styling and accessibility features.
 */
export const SidebarHeader = forwardRef<HTMLDivElement, SidebarHeaderProps>(({
  showCloseButton = false,
  title = 'TabKiller',
  actions = [],
  onClose,
  className,
  ...props
}, ref) => {
  
  const headerClasses = clsx(
    styles.header,
    {
      [styles['header--with-actions']]: actions.length > 0,
      [styles['header--with-close']]: showCloseButton,
    },
    className
  );

  const handleClose = () => {
    onClose?.();
  };

  return (
    <header
      ref={ref}
      className={headerClasses}
      role="banner"
      aria-label="Sidebar header"
      {...props}
    >
      {/* Title */}
      <div className={styles.titleSection}>
        <h2 className={styles.title} id="sidebar-title">
          {title}
        </h2>
      </div>

      {/* Actions */}
      {actions.length > 0 && (
        <div className={styles.actions} role="toolbar" aria-label="Header actions">
          {actions.map((action) => (
            <Button
              key={action.id}
              variant="text"
              size="small"
              icon={action.icon}
              onClick={action.action}
              disabled={action.disabled}
              loading={action.loading}
              title={action.label}
              aria-label={action.label}
              className={styles.actionButton}
            >
              {/* Don't show label for header actions to save space */}
            </Button>
          ))}
        </div>
      )}

      {/* Close button */}
      {showCloseButton && (
        <Button
          variant="text"
          size="small"
          icon="✕"
          onClick={handleClose}
          title="Close sidebar"
          aria-label="Close sidebar"
          className={styles.closeButton}
        />
      )}
    </header>
  );
});

SidebarHeader.displayName = 'SidebarHeader';

export default SidebarHeader;