/**
 * Sidebar Content Component
 * Main content area of the sidebar with sections and session information
 */

import React, { forwardRef, useMemo } from 'react';
import { clsx } from 'clsx';
import { useSessionContext } from '../../../contexts/SessionContext';
import { SidebarContentProps } from '../types';
import { SidebarSection } from './SidebarSection';
import { SessionDisplay } from '../session/SessionDisplay';
import { SessionStats } from '../session/SessionStats';
import { Layout } from '../../components/layout/Layout/Layout';
import styles from './SidebarContent.module.css';

/**
 * SidebarContent Component
 * 
 * Renders the main content area of the sidebar, including sections,
 * current session information, and session statistics.
 */
export const SidebarContent = forwardRef<HTMLDivElement, SidebarContentProps>(({
  sections,
  showSessions = true,
  sessionConfig,
  onSectionToggle,
  className,
  children,
  ...props
}, ref) => {
  
  // Get session context for current session and stats
  const { state: sessionState } = useSessionContext();
  const { currentSession, sessionStats } = sessionState;

  // Sort sections by order
  const sortedSections = useMemo(() => 
    [...sections]
      .filter(section => section.visible)
      .sort((a, b) => a.order - b.order),
    [sections]
  );

  // Handle section toggle
  const handleSectionToggle = (sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    if (section && section.collapsible) {
      onSectionToggle?.(sectionId, !section.collapsed);
    }
  };

  const contentClasses = clsx(
    styles.content,
    {
      [styles['content--with-sessions']]: showSessions,
      [styles['content--no-sessions']]: !showSessions,
    },
    className
  );

  return (
    <div
      ref={ref}
      className={contentClasses}
      role="main"
      aria-label="Sidebar content"
      {...props}
    >
      <Layout 
        direction="column" 
        gap="sm" 
        padding="md"
        fullHeight
        className={styles.layout}
      >
        {/* Render sections */}
        {sortedSections.map((section) => {
          // Current Session section
          if (section.id === 'current-session' && showSessions) {
            return (
              <SidebarSection
                key={section.id}
                section={section}
                onToggle={handleSectionToggle}
                className={styles.section}
              >
                <SessionDisplay
                  session={currentSession}
                  config={sessionConfig}
                  variant="current"
                  className={styles.sessionDisplay}
                />
              </SidebarSection>
            );
          }

          // Recent Sessions section
          if (section.id === 'recent-sessions' && showSessions) {
            return (
              <SidebarSection
                key={section.id}
                section={section}
                onToggle={handleSectionToggle}
                className={styles.section}
              >
                <SessionDisplay
                  sessions={sessionState.recentSessions}
                  config={sessionConfig}
                  variant="list"
                  maxItems={5}
                  className={styles.sessionDisplay}
                />
              </SidebarSection>
            );
          }

          // Session Statistics section
          if (section.id === 'session-stats' && showSessions) {
            return (
              <SidebarSection
                key={section.id}
                section={section}
                onToggle={handleSectionToggle}
                className={styles.section}
              >
                <SessionStats
                  stats={sessionStats}
                  currentSession={currentSession}
                  className={styles.sessionStats}
                />
              </SidebarSection>
            );
          }

          // Generic section (for custom content)
          return (
            <SidebarSection
              key={section.id}
              section={section}
              onToggle={handleSectionToggle}
              className={styles.section}
            >
              <div className={styles.customSection}>
                <p className={styles.placeholder}>
                  {section.title} content goes here
                </p>
              </div>
            </SidebarSection>
          );
        })}

        {/* Custom children content */}
        {children && (
          <div className={styles.customContent}>
            {children}
          </div>
        )}

        {/* Empty state when no sections */}
        {sortedSections.length === 0 && !children && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📋</div>
            <p className={styles.emptyText}>
              No content available
            </p>
          </div>
        )}
      </Layout>
    </div>
  );
});

SidebarContent.displayName = 'SidebarContent';

export default SidebarContent;