/**
 * Sidebar Section Component
 * Individual collapsible section within the sidebar
 */

import React, { forwardRef, useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../../components/foundation/Button/Button';
import { SidebarSection as SidebarSectionType } from '../types';
import styles from './SidebarSection.module.css';

interface SidebarSectionProps {
  section: SidebarSectionType;
  onToggle?: (sectionId: string) => void;
  className?: string;
  children?: React.ReactNode;
}

/**
 * SidebarSection Component
 * 
 * A collapsible section within the sidebar with header and content area.
 */
export const SidebarSection = forwardRef<HTMLDivElement, SidebarSectionProps>(({
  section,
  onToggle,
  className,
  children,
  ...props
}, ref) => {
  
  const [isAnimating, setIsAnimating] = useState(false);
  
  const handleToggle = () => {
    if (!section.collapsible) return;
    
    setIsAnimating(true);
    onToggle?.(section.id);
    
    // Reset animation state after transition
    setTimeout(() => {
      setIsAnimating(false);
    }, 250);
  };

  const sectionClasses = clsx(
    styles.section,
    {
      [styles['section--collapsed']]: section.collapsed,
      [styles['section--collapsible']]: section.collapsible,
      [styles['section--animating']]: isAnimating,
    },
    className
  );

  return (
    <div
      ref={ref}
      className={sectionClasses}
      data-section-id={section.id}
      {...props}
    >
      {/* Section Header */}
      <div className={styles.header}>
        <div className={styles.titleContainer}>
          {section.icon && (
            <span className={styles.icon} aria-hidden="true">
              {section.icon}
            </span>
          )}
          <h3 className={styles.title}>
            {section.title}
          </h3>
        </div>
        
        {section.collapsible && (
          <Button
            variant="text"
            size="small"
            icon={section.collapsed ? '▶' : '▼'}
            onClick={handleToggle}
            aria-label={section.collapsed ? `Expand ${section.title}` : `Collapse ${section.title}`}
            aria-expanded={!section.collapsed}
            className={styles.toggleButton}
          />
        )}
      </div>

      {/* Section Content */}
      <div 
        className={styles.content}
        aria-hidden={section.collapsed}
        role="region"
        aria-labelledby={`section-${section.id}-title`}
      >
        <div className={styles.contentInner}>
          {children}
        </div>
      </div>
    </div>
  );
});

SidebarSection.displayName = 'SidebarSection';

export default SidebarSection;