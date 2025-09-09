/**
 * Keyboard Shortcut Editor Component
 * Provides UI for editing and managing keyboard shortcuts
 */

import React, { useState, useCallback, useEffect } from 'react';
import { KeyCombination, ShortcutCommand } from '../../shortcuts/types';
import i18nManager from '../i18n';

/**
 * Props for ShortcutEditor component
 */
interface ShortcutEditorProps {
  shortcut?: KeyCombination;
  onShortcutChange: (shortcut: KeyCombination | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  allowClear?: boolean;
  conflictingCommands?: string[];
}

/**
 * Props for ShortcutDisplay component
 */
interface ShortcutDisplayProps {
  shortcut: KeyCombination;
  className?: string;
  showPlatformSpecific?: boolean;
}

/**
 * Keyboard shortcut display component
 */
export const ShortcutDisplay: React.FC<ShortcutDisplayProps> = ({
  shortcut,
  className = '',
  showPlatformSpecific = false
}) => {
  const formatModifier = (modifier: string): string => {
    const key = `menu.shortcuts.${modifier.toLowerCase()}`;
    return i18nManager.t(key, undefined, modifier);
  };

  const formatKey = (key: string): string => {
    // Handle special keys
    const specialKeys: Record<string, string> = {
      'Enter': i18nManager.t('menu.shortcuts.enter', undefined, 'Enter'),
      'Escape': i18nManager.t('menu.shortcuts.escape', undefined, 'Esc'),
      'Space': i18nManager.t('menu.shortcuts.space', undefined, 'Space'),
      'Tab': i18nManager.t('menu.shortcuts.tab', undefined, 'Tab'),
      'Backspace': i18nManager.t('menu.shortcuts.backspace', undefined, 'Backspace'),
      'Delete': i18nManager.t('menu.shortcuts.delete', undefined, 'Delete'),
      'ArrowUp': i18nManager.t('menu.shortcuts.arrow-up', undefined, '↑'),
      'ArrowDown': i18nManager.t('menu.shortcuts.arrow-down', undefined, '↓'),
      'ArrowLeft': i18nManager.t('menu.shortcuts.arrow-left', undefined, '←'),
      'ArrowRight': i18nManager.t('menu.shortcuts.arrow-right', undefined, '→')
    };

    return specialKeys[key] || key.toUpperCase();
  };

  const modifiers = shortcut.modifiers.map(formatModifier);
  const key = formatKey(shortcut.key);
  const parts = [...modifiers, key];

  return (
    <span className={`tk-shortcut-display ${className}`}>
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          <kbd className="tk-key">{part}</kbd>
          {index < parts.length - 1 && <span className="tk-key-separator">+</span>}
        </React.Fragment>
      ))}
    </span>
  );
};

/**
 * Keyboard shortcut editor component
 */
export const ShortcutEditor: React.FC<ShortcutEditorProps> = ({
  shortcut,
  onShortcutChange,
  placeholder = 'Click to set shortcut',
  className = '',
  disabled = false,
  allowClear = true,
  conflictingCommands = []
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<{
    modifiers: Set<string>;
    key: string;
  }>({
    modifiers: new Set(),
    key: ''
  });

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isRecording) return;

    event.preventDefault();
    event.stopPropagation();

    const modifiers = new Set<string>();
    
    if (event.ctrlKey) modifiers.add('ctrl');
    if (event.altKey) modifiers.add('alt');
    if (event.shiftKey) modifiers.add('shift');
    if (event.metaKey) modifiers.add('meta');

    // Don't record modifier keys by themselves
    const isModifierKey = ['Control', 'Alt', 'Shift', 'Meta', 'Cmd'].includes(event.key);
    
    if (!isModifierKey) {
      setRecordedKeys({
        modifiers,
        key: event.key
      });
    }
  }, [isRecording]);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (!isRecording) return;

    event.preventDefault();
    event.stopPropagation();

    // If we have a non-modifier key recorded, finish the recording
    if (recordedKeys.key && recordedKeys.key !== '') {
      const newShortcut: KeyCombination = {
        modifiers: Array.from(recordedKeys.modifiers) as any[],
        key: recordedKeys.key
      };

      onShortcutChange(newShortcut);
      setIsRecording(false);
      setRecordedKeys({ modifiers: new Set(), key: '' });
    }
  }, [isRecording, recordedKeys, onShortcutChange]);

  const startRecording = useCallback(() => {
    if (disabled) return;
    
    setIsRecording(true);
    setRecordedKeys({ modifiers: new Set(), key: '' });
  }, [disabled]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    setRecordedKeys({ modifiers: new Set(), key: '' });
  }, []);

  const clearShortcut = useCallback(() => {
    if (disabled) return;
    onShortcutChange(undefined);
  }, [disabled, onShortcutChange]);

  // Add event listeners when recording
  useEffect(() => {
    if (isRecording) {
      document.addEventListener('keydown', handleKeyDown, true);
      document.addEventListener('keyup', handleKeyUp, true);
      
      return () => {
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('keyup', handleKeyUp, true);
      };
    }
  }, [isRecording, handleKeyDown, handleKeyUp]);

  // Handle escape key to cancel recording
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (isRecording && event.key === 'Escape') {
        stopRecording();
      }
    };

    if (isRecording) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isRecording, stopRecording]);

  const hasConflicts = conflictingCommands.length > 0;

  return (
    <div className={`tk-shortcut-editor ${className} ${disabled ? 'tk-disabled' : ''}`}>
      <div className="tk-shortcut-input-container">
        <button
          type="button"
          className={`tk-shortcut-input ${isRecording ? 'tk-recording' : ''} ${hasConflicts ? 'tk-has-conflicts' : ''}`}
          onClick={startRecording}
          disabled={disabled}
        >
          {isRecording ? (
            <span className="tk-recording-indicator">
              {i18nManager.t('menu.shortcuts.recording', undefined, 'Recording...')}
              {recordedKeys.modifiers.size > 0 && (
                <span className="tk-recorded-keys">
                  {Array.from(recordedKeys.modifiers).join('+')}
                  {recordedKeys.key && `+${recordedKeys.key}`}
                </span>
              )}
            </span>
          ) : shortcut ? (
            <ShortcutDisplay shortcut={shortcut} />
          ) : (
            <span className="tk-shortcut-placeholder">{placeholder}</span>
          )}
        </button>

        {allowClear && shortcut && !disabled && (
          <button
            type="button"
            className="tk-shortcut-clear"
            onClick={clearShortcut}
            title={i18nManager.t('menu.shortcuts.clear', undefined, 'Clear shortcut')}
          >
            ×
          </button>
        )}
      </div>

      {isRecording && (
        <div className="tk-shortcut-help">
          <p>{i18nManager.t('menu.shortcuts.help.recording', undefined, 'Press the desired key combination')}</p>
          <p className="tk-shortcut-help-cancel">
            {i18nManager.t('menu.shortcuts.help.cancel', undefined, 'Press Esc to cancel')}
          </p>
        </div>
      )}

      {hasConflicts && (
        <div className="tk-shortcut-conflicts">
          <p className="tk-conflict-warning">
            {i18nManager.t('menu.shortcuts.conflicts.warning', undefined, 'This shortcut conflicts with:')}
          </p>
          <ul className="tk-conflict-list">
            {conflictingCommands.map((command, index) => (
              <li key={index} className="tk-conflict-item">
                {command}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/**
 * Props for ShortcutList component
 */
interface ShortcutListProps {
  commands: ShortcutCommand[];
  onShortcutChange: (commandId: string, shortcut: KeyCombination | undefined) => void;
  className?: string;
  groupByCategory?: boolean;
  searchTerm?: string;
}

/**
 * Shortcut list component for managing multiple shortcuts
 */
export const ShortcutList: React.FC<ShortcutListProps> = ({
  commands,
  onShortcutChange,
  className = '',
  groupByCategory = true,
  searchTerm = ''
}) => {
  const filteredCommands = commands.filter(command =>
    !searchTerm ||
    command.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    command.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedCommands = groupByCategory
    ? filteredCommands.reduce((acc, command) => {
        const category = command.category;
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(command);
        return acc;
      }, {} as Record<string, ShortcutCommand[]>)
    : { all: filteredCommands };

  const getCategoryTitle = (category: string): string => {
    const categoryKey = `menu.shortcuts.categories.${category}`;
    return i18nManager.t(categoryKey, undefined, category);
  };

  return (
    <div className={`tk-shortcut-list ${className}`}>
      {Object.entries(groupedCommands).map(([category, categoryCommands]) => (
        <div key={category} className="tk-shortcut-category">
          {groupByCategory && (
            <h4 className="tk-category-title">{getCategoryTitle(category)}</h4>
          )}
          
          <div className="tk-shortcut-items">
            {categoryCommands.map(command => (
              <div key={command.id} className="tk-shortcut-item">
                <div className="tk-shortcut-info">
                  <div className="tk-shortcut-name">{command.name}</div>
                  <div className="tk-shortcut-description">{command.description}</div>
                </div>
                
                <div className="tk-shortcut-editor-container">
                  <ShortcutEditor
                    shortcut={command.defaultShortcut}
                    onShortcutChange={(shortcut) => onShortcutChange(command.id, shortcut)}
                    placeholder={i18nManager.t('menu.shortcuts.set-shortcut', undefined, 'Set shortcut')}
                    disabled={!command.enabled}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      
      {filteredCommands.length === 0 && (
        <div className="tk-empty-state">
          <p>
            {searchTerm
              ? i18nManager.t('menu.shortcuts.no-results', undefined, 'No shortcuts found matching your search.')
              : i18nManager.t('menu.shortcuts.no-shortcuts', undefined, 'No shortcuts configured.')
            }
          </p>
        </div>
      )}
    </div>
  );
};