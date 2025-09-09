/**
 * Sidebar Footer Component
 * Footer section with quick action buttons
 */

import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { Button } from '../../components/foundation/Button/Button';
import { SidebarFooterProps } from '../types';
import styles from './SidebarFooter.module.css';

export const SidebarFooter = forwardRef<HTMLDivElement, SidebarFooterProps>(({
  quickActions,
  showLabels = true,
  maxActions = 5,
  className,
  ...props
}, ref) => {
  
  // Sort actions by order and limit to maxActions
  const sortedActions = quickActions
    .sort((a, b) => a.order - b.order)
    .slice(0, maxActions);

  const footerClasses = clsx(
    styles.footer,
    {
      [styles['footer--with-labels']]: showLabels,
      [styles['footer--compact']]: !showLabels,
    },
    className
  );

  return (
    <footer
      ref={ref}
      className={footerClasses}
      role="toolbar"
      aria-label="Quick actions"
      {...props}
    >
      <div className={styles.actions}>
        {sortedActions.map((action) => (
          <Button
            key={action.id}
            variant="outline"
            size="small"
            icon={action.icon}
            onClick={action.action}
            disabled={action.disabled}
            loading={action.loading}
            title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}
            aria-label={action.label}
            className={styles.actionButton}
          >
            {showLabels ? action.label : null}
          </Button>
        ))}
      </div>
    </footer>
  );
});

SidebarFooter.displayName = 'SidebarFooter';