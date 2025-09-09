/**
 * ShortcutConflictDialog Component
 * Dialog for resolving keyboard shortcut conflicts
 */

import React from 'react';
import { ShortcutConflict, ShortcutCommand } from '../../../context-menu/shortcuts/types';
import { shortcutUtils } from '../../../context-menu/shortcuts/utils';
import { Button } from '../foundation/Button';
import { Card } from '../foundation/Card';
import styles from './ShortcutConflictDialog.module.css';

interface ShortcutConflictDialogProps {
  command: ShortcutCommand;
  conflicts: ShortcutConflict[];
  onResolve: (forceOverride: boolean) => void;
  onCancel: () => void;
}

export const ShortcutConflictDialog: React.FC<ShortcutConflictDialogProps> = ({
  command,
  conflicts,
  onResolve,
  onCancel
}) => {
  const hasErrorConflicts = conflicts.some(c => c.severity === 'error');
  const hasWarningConflicts = conflicts.some(c => c.severity === 'warning');

  const getConflictIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return '⚠️';
      case 'warning':
        return '⚡';
      case 'info':
        return 'ℹ️';
      default:
        return '❓';
    }
  };

  const getConflictTypeDisplay = (type: string) => {
    switch (type) {
      case 'duplicate_extension':
        return 'Extension Command';
      case 'browser_reserved':
        return 'Browser Reserved';
      case 'platform_reserved':
        return 'System Reserved';
      case 'accessibility_conflict':
        return 'Accessibility';
      case 'invalid_combination':
        return 'Invalid Combination';
      default:
        return type;
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <Card className={styles.card}>
          <div className={styles.header}>
            <h3 className={styles.title}>Shortcut Conflict Detected</h3>
            <button 
              className={styles.closeButton}
              onClick={onCancel}
              aria-label="Close dialog"
            >
              ×
            </button>
          </div>

          <div className={styles.content}>
            <div className={styles.commandInfo}>
              <div className={styles.commandName}>{command.name}</div>
              <div className={styles.shortcutDisplay}>
                {command.defaultShortcut && (
                  <code className={styles.shortcutCode}>
                    {shortcutUtils.formatShortcutString(command.defaultShortcut)}
                  </code>
                )}
              </div>
            </div>

            <div className={styles.conflictsList}>
              <h4 className={styles.conflictsTitle}>
                {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} detected:
              </h4>
              
              {conflicts.map((conflict, index) => (
                <div 
                  key={index}
                  className={`${styles.conflictItem} ${styles[conflict.severity]}`}
                >
                  <div className={styles.conflictHeader}>
                    <span className={styles.conflictIcon}>
                      {getConflictIcon(conflict.severity)}
                    </span>
                    <span className={styles.conflictType}>
                      {getConflictTypeDisplay(conflict.type)}
                    </span>
                    <span className={styles.conflictSeverity}>
                      {conflict.severity.toUpperCase()}
                    </span>
                  </div>
                  
                  <div className={styles.conflictDetails}>
                    {conflict.suggestion && (
                      <div className={styles.conflictSuggestion}>
                        {conflict.suggestion}
                      </div>
                    )}
                    
                    {conflict.existingCommand && (
                      <div className={styles.conflictTarget}>
                        Conflicts with: <strong>{conflict.existingCommand}</strong>
                      </div>
                    )}
                    
                    {conflict.browserCommand && (
                      <div className={styles.conflictTarget}>
                        Browser shortcut: <strong>{conflict.browserCommand}</strong>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {hasErrorConflicts && (
              <div className={styles.errorWarning}>
                <strong>Error:</strong> This shortcut cannot be assigned due to critical conflicts.
                Please choose a different shortcut combination.
              </div>
            )}

            {!hasErrorConflicts && hasWarningConflicts && (
              <div className={styles.warningNotice}>
                <strong>Warning:</strong> This shortcut may conflict with browser or system functionality.
                It's recommended to choose a different shortcut, but you can proceed if desired.
              </div>
            )}
          </div>

          <div className={styles.actions}>
            <Button 
              variant="outline" 
              onClick={onCancel}
            >
              Cancel
            </Button>
            
            {!hasErrorConflicts && (
              <Button 
                variant="primary"
                onClick={() => onResolve(true)}
                className={hasWarningConflicts ? styles.warningButton : ''}
              >
                {hasWarningConflicts ? 'Use Anyway' : 'Continue'}
              </Button>
            )}
            
            <Button 
              variant="ghost"
              onClick={() => onResolve(false)}
            >
              Choose Different Shortcut
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ShortcutConflictDialog;