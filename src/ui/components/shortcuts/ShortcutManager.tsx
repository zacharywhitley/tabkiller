/**
 * ShortcutManager Component
 * Main interface for managing keyboard shortcuts and commands
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShortcutCommand, 
  KeyCombination, 
  ShortcutConflict,
  ShortcutPreferences 
} from '../../../context-menu/shortcuts/types';
import { ShortcutManagerImpl } from '../../../context-menu/shortcuts/shortcut-manager';
import { Button } from '../foundation/Button';
import { Card } from '../foundation/Card';
import ShortcutInput from './ShortcutInput';
import ShortcutConflictDialog from './ShortcutConflictDialog';
import styles from './ShortcutManager.module.css';

interface ShortcutManagerProps {
  shortcutManager: ShortcutManagerImpl;
  className?: string;
  onShortcutChanged?: (commandId: string, shortcut: KeyCombination | null) => void;
  onPreferencesChanged?: (preferences: ShortcutPreferences) => void;
}

interface CommandState extends ShortcutCommand {
  isEditing: boolean;
  tempShortcut?: KeyCombination | null;
  conflicts: ShortcutConflict[];
  hasUnsavedChanges: boolean;
}

export const ShortcutManager: React.FC<ShortcutManagerProps> = ({
  shortcutManager,
  className = '',
  onShortcutChanged,
  onPreferencesChanged
}) => {
  const [commands, setCommands] = useState<CommandState[]>([]);
  const [preferences, setPreferences] = useState<ShortcutPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflictDialog, setConflictDialog] = useState<{
    command: CommandState;
    conflicts: ShortcutConflict[];
  } | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Load commands and preferences
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load commands
      const commandsList = shortcutManager.getCommands();
      const commandStates: CommandState[] = commandsList.map(cmd => ({
        ...cmd,
        isEditing: false,
        conflicts: [],
        hasUnsavedChanges: false
      }));
      setCommands(commandStates);

      // Load preferences
      const prefs = await shortcutManager.loadPreferences();
      setPreferences(prefs);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shortcuts');
    } finally {
      setIsLoading(false);
    }
  }, [shortcutManager]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Get unique categories for filter
  const categories = React.useMemo(() => {
    const cats = new Set(commands.map(cmd => cmd.category));
    return ['all', ...Array.from(cats).sort()];
  }, [commands]);

  // Filter commands based on search and category
  const filteredCommands = React.useMemo(() => {
    return commands.filter(cmd => {
      const matchesSearch = searchFilter === '' || 
        cmd.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        cmd.description.toLowerCase().includes(searchFilter.toLowerCase());
      
      const matchesCategory = categoryFilter === 'all' || cmd.category === categoryFilter;
      
      return matchesSearch && matchesCategory;
    });
  }, [commands, searchFilter, categoryFilter]);

  const handleEditStart = (commandId: string) => {
    setCommands(prev => prev.map(cmd => 
      cmd.id === commandId 
        ? { 
            ...cmd, 
            isEditing: true, 
            tempShortcut: cmd.defaultShortcut,
            hasUnsavedChanges: false 
          }
        : cmd
    ));
  };

  const handleEditCancel = (commandId: string) => {
    setCommands(prev => prev.map(cmd => 
      cmd.id === commandId 
        ? { 
            ...cmd, 
            isEditing: false, 
            tempShortcut: undefined,
            conflicts: [],
            hasUnsavedChanges: false 
          }
        : cmd
    ));
  };

  const handleShortcutChange = (commandId: string, shortcut: KeyCombination | null) => {
    const command = commands.find(cmd => cmd.id === commandId);
    if (!command) return;

    // Detect conflicts
    const conflicts = shortcut 
      ? shortcutManager.detectConflicts(shortcut, commandId)
      : [];

    setCommands(prev => prev.map(cmd => 
      cmd.id === commandId 
        ? { 
            ...cmd, 
            tempShortcut: shortcut,
            conflicts,
            hasUnsavedChanges: true 
          }
        : cmd
    ));
  };

  const handleEditSave = async (commandId: string) => {
    const command = commands.find(cmd => cmd.id === commandId);
    if (!command || !command.isEditing) return;

    try {
      // Check for conflicts
      if (command.conflicts.length > 0) {
        const hasErrors = command.conflicts.some(c => c.severity === 'error');
        if (hasErrors) {
          setConflictDialog({ command, conflicts: command.conflicts });
          return;
        }
      }

      // Save the shortcut
      if (command.tempShortcut) {
        const result = await shortcutManager.updateCommandShortcut(commandId, command.tempShortcut);
        if (!result.success) {
          throw result.error || new Error('Failed to update shortcut');
        }
      }

      // Update local state
      setCommands(prev => prev.map(cmd => 
        cmd.id === commandId 
          ? { 
              ...cmd, 
              defaultShortcut: cmd.tempShortcut || undefined,
              isEditing: false, 
              tempShortcut: undefined,
              conflicts: [],
              hasUnsavedChanges: false 
            }
          : cmd
      ));

      onShortcutChanged?.(commandId, command.tempShortcut || null);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save shortcut');
    }
  };

  const handleResetToDefault = async (commandId: string) => {
    try {
      const result = await shortcutManager.resetToDefaults();
      if (!result.success) {
        throw result.error || new Error('Failed to reset shortcuts');
      }

      await loadData(); // Reload data

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset shortcuts');
    }
  };

  const handleResetAll = async () => {
    if (!confirm('Reset all shortcuts to defaults? This cannot be undone.')) {
      return;
    }

    try {
      const result = await shortcutManager.resetToDefaults();
      if (!result.success) {
        throw result.error || new Error('Failed to reset shortcuts');
      }

      await loadData(); // Reload data

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset shortcuts');
    }
  };

  const handleConflictResolve = async (forceOverride: boolean) => {
    if (!conflictDialog) return;

    if (forceOverride) {
      // Save anyway, ignoring conflicts
      await handleEditSave(conflictDialog.command.id);
    }

    setConflictDialog(null);
  };

  const getShortcutDisplay = (command: CommandState): KeyCombination | undefined => {
    if (command.isEditing) {
      return command.tempShortcut || undefined;
    }
    return command.defaultShortcut;
  };

  if (isLoading) {
    return (
      <div className={`${styles.shortcutManager} ${className}`}>
        <div className={styles.loading}>Loading shortcuts...</div>
      </div>
    );
  }

  return (
    <div className={`${styles.shortcutManager} ${className}`}>
      <div className={styles.header}>
        <h2>Keyboard Shortcuts</h2>
        <div className={styles.headerActions}>
          <Button variant="outline" onClick={handleResetAll}>
            Reset All
          </Button>
        </div>
      </div>

      {error && (
        <div className={styles.error}>
          <strong>Error:</strong> {error}
          <button 
            className={styles.errorClose}
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}

      <div className={styles.filters}>
        <div className={styles.searchFilter}>
          <input
            type="text"
            placeholder="Search shortcuts..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        
        <div className={styles.categoryFilter}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={styles.categorySelect}
          >
            {categories.map(category => (
              <option key={category} value={category}>
                {category === 'all' ? 'All Categories' : category.charAt(0).toUpperCase() + category.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.commandsList}>
        {filteredCommands.map(command => (
          <Card key={command.id} className={styles.commandCard}>
            <div className={styles.commandInfo}>
              <div className={styles.commandName}>{command.name}</div>
              <div className={styles.commandDescription}>{command.description}</div>
              <div className={styles.commandCategory}>
                Category: {command.category}
              </div>
            </div>

            <div className={styles.commandShortcut}>
              {command.isEditing ? (
                <div className={styles.editingShortcut}>
                  <ShortcutInput
                    value={getShortcutDisplay(command)}
                    onChange={(shortcut) => handleShortcutChange(command.id, shortcut)}
                    placeholder="Record new shortcut..."
                    className={styles.shortcutInput}
                  />
                  
                  {command.conflicts.length > 0 && (
                    <div className={styles.conflicts}>
                      {command.conflicts.map((conflict, index) => (
                        <div 
                          key={index} 
                          className={`${styles.conflict} ${styles[conflict.severity]}`}
                        >
                          {conflict.suggestion || `${conflict.type} conflict detected`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.displayShortcut}>
                  {command.defaultShortcut ? (
                    <code className={styles.shortcutCode}>
                      {command.defaultShortcut.modifiers.join('+')}
                      {command.defaultShortcut.modifiers.length > 0 ? '+' : ''}
                      {command.defaultShortcut.key}
                    </code>
                  ) : (
                    <span className={styles.noShortcut}>No shortcut assigned</span>
                  )}
                </div>
              )}
            </div>

            <div className={styles.commandActions}>
              {command.isEditing ? (
                <>
                  <Button 
                    variant="primary" 
                    size="small"
                    onClick={() => handleEditSave(command.id)}
                    disabled={!command.hasUnsavedChanges}
                  >
                    Save
                  </Button>
                  <Button 
                    variant="outline" 
                    size="small"
                    onClick={() => handleEditCancel(command.id)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button 
                    variant="outline" 
                    size="small"
                    onClick={() => handleEditStart(command.id)}
                  >
                    Edit
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="small"
                    onClick={() => handleResetToDefault(command.id)}
                    title="Reset to default"
                  >
                    Reset
                  </Button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      {filteredCommands.length === 0 && (
        <div className={styles.noResults}>
          No shortcuts found matching your search criteria.
        </div>
      )}

      {conflictDialog && (
        <ShortcutConflictDialog
          command={conflictDialog.command}
          conflicts={conflictDialog.conflicts}
          onResolve={handleConflictResolve}
          onCancel={() => setConflictDialog(null)}
        />
      )}
    </div>
  );
};

export default ShortcutManager;