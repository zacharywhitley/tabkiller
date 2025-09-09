/**
 * ShortcutInput Component
 * Allows users to input and edit keyboard shortcuts
 */

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { KeyCombination, KeyModifier } from '../../../context-menu/shortcuts/types';
import { shortcutUtils } from '../../../context-menu/shortcuts/utils';
import styles from './ShortcutInput.module.css';

interface ShortcutInputProps {
  value?: KeyCombination;
  onChange: (shortcut: KeyCombination | null) => void;
  onValidationChange?: (isValid: boolean, error?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showClearButton?: boolean;
  validateOnChange?: boolean;
}

interface RecordingState {
  isRecording: boolean;
  pressedKeys: Set<string>;
  modifiers: Set<KeyModifier>;
  mainKey: string | null;
}

export const ShortcutInput: React.FC<ShortcutInputProps> = ({
  value,
  onChange,
  onValidationChange,
  placeholder = 'Click to record shortcut...',
  disabled = false,
  className = '',
  showClearButton = true,
  validateOnChange = true
}) => {
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    pressedKeys: new Set(),
    modifiers: new Set(),
    mainKey: null
  });
  const [displayValue, setDisplayValue] = useState('');
  const [isValid, setIsValid] = useState(true);
  const [validationError, setValidationError] = useState<string>('');
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Update display value when value prop changes
  useEffect(() => {
    if (value) {
      setDisplayValue(shortcutUtils.formatShortcutString(value));
    } else {
      setDisplayValue('');
    }
  }, [value]);

  // Validate shortcut when validateOnChange is enabled
  useEffect(() => {
    if (validateOnChange && value) {
      const validation = shortcutUtils.isValidCombination(value);
      setIsValid(validation);
      
      if (!validation) {
        setValidationError('Invalid shortcut combination');
      } else {
        setValidationError('');
      }
      
      onValidationChange?.(validation, validation ? undefined : 'Invalid shortcut combination');
    }
  }, [value, validateOnChange, onValidationChange]);

  const handleInputClick = () => {
    if (disabled) return;
    
    startRecording();
  };

  const handleInputFocus = () => {
    if (disabled) return;
    
    startRecording();
  };

  const handleInputBlur = () => {
    stopRecording();
  };

  const startRecording = () => {
    setRecordingState({
      isRecording: true,
      pressedKeys: new Set(),
      modifiers: new Set(),
      mainKey: null
    });
    setDisplayValue('Recording...');
    inputRef.current?.focus();
  };

  const stopRecording = () => {
    setRecordingState(prev => ({
      ...prev,
      isRecording: false
    }));
    
    // Update display with current value
    if (value) {
      setDisplayValue(shortcutUtils.formatShortcutString(value));
    } else {
      setDisplayValue('');
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled || !recordingState.isRecording) return;

    event.preventDefault();
    event.stopPropagation();

    const key = event.key;
    const code = event.code;

    // Map modifier keys
    const modifierMap: Record<string, KeyModifier> = {
      'Control': 'ctrl',
      'Alt': 'alt',
      'Shift': 'shift',
      'Meta': 'meta',
      'Cmd': 'meta'
    };

    // Check if this is a modifier key
    if (modifierMap[key]) {
      const modifier = modifierMap[key];
      setRecordingState(prev => ({
        ...prev,
        modifiers: new Set([...prev.modifiers, modifier]),
        pressedKeys: new Set([...prev.pressedKeys, key])
      }));
      
      // Update display to show current modifiers
      const currentModifiers = Array.from(recordingState.modifiers);
      if (!currentModifiers.includes(modifier)) {
        currentModifiers.push(modifier);
      }
      setDisplayValue(currentModifiers.join('+') + (currentModifiers.length > 0 ? '+' : ''));
      return;
    }

    // This is a main key
    const normalizedKey = normalizeKey(key, code);
    if (normalizedKey) {
      const modifiers = Array.from(recordingState.modifiers);
      const combination: KeyCombination = {
        key: normalizedKey,
        modifiers,
        code
      };

      // Validate the combination
      const validation = shortcutUtils.isValidCombination(combination);
      setIsValid(validation);
      
      if (validation) {
        setValidationError('');
        onChange(combination);
        onValidationChange?.(true);
      } else {
        setValidationError('Invalid shortcut combination');
        onValidationChange?.(false, 'Invalid shortcut combination');
      }

      // Update display
      setDisplayValue(shortcutUtils.formatShortcutString(combination));
      
      // Stop recording after capturing main key
      setTimeout(() => {
        stopRecording();
        inputRef.current?.blur();
      }, 100);
    }
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled || !recordingState.isRecording) return;

    event.preventDefault();
    event.stopPropagation();

    const key = event.key;
    
    // Remove modifier from state when released
    const modifierMap: Record<string, KeyModifier> = {
      'Control': 'ctrl',
      'Alt': 'alt', 
      'Shift': 'shift',
      'Meta': 'meta',
      'Cmd': 'meta'
    };

    if (modifierMap[key]) {
      const modifier = modifierMap[key];
      setRecordingState(prev => {
        const newModifiers = new Set(prev.modifiers);
        newModifiers.delete(modifier);
        const newPressedKeys = new Set(prev.pressedKeys);
        newPressedKeys.delete(key);
        
        return {
          ...prev,
          modifiers: newModifiers,
          pressedKeys: newPressedKeys
        };
      });
    }
  };

  const handleClear = () => {
    onChange(null);
    setDisplayValue('');
    setIsValid(true);
    setValidationError('');
    onValidationChange?.(true);
  };

  const normalizeKey = (key: string, code: string): string | null => {
    // Handle special keys
    if (key === ' ') return 'Space';
    if (key === 'Enter') return 'Enter';
    if (key === 'Escape') return 'Escape';
    if (key === 'Tab') return 'Tab';
    if (key === 'Backspace') return 'Backspace';
    if (key === 'Delete') return 'Delete';
    if (key === 'Insert') return 'Insert';
    if (key === 'Home') return 'Home';
    if (key === 'End') return 'End';
    if (key === 'PageUp') return 'PageUp';
    if (key === 'PageDown') return 'PageDown';

    // Handle arrow keys
    if (key.startsWith('Arrow')) {
      return key.replace('Arrow', '');
    }

    // Handle function keys
    if (/^F\d+$/.test(key)) {
      return key;
    }

    // Handle alphanumeric keys
    if (/^[a-zA-Z0-9]$/.test(key)) {
      return key.toUpperCase();
    }

    // Handle special characters that are allowed
    const allowedSpecialKeys = [',', '.', '/', ';', "'", '\\', '[', ']', '`', '-', '='];
    if (allowedSpecialKeys.includes(key)) {
      return key;
    }

    return null;
  };

  const inputClassName = [
    styles.shortcutInput,
    recordingState.isRecording ? styles.recording : '',
    !isValid ? styles.invalid : '',
    disabled ? styles.disabled : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.shortcutInputContainer}>
      <div className={styles.inputWrapper}>
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          placeholder={placeholder}
          onClick={handleInputClick}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          className={inputClassName}
          disabled={disabled}
          readOnly
        />
        
        {showClearButton && value && !disabled && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            title="Clear shortcut"
          >
            ×
          </button>
        )}
      </div>
      
      {recordingState.isRecording && (
        <div className={styles.recordingIndicator}>
          Press keys to record shortcut...
        </div>
      )}
      
      {!isValid && validationError && (
        <div className={styles.errorMessage}>
          {validationError}
        </div>
      )}
    </div>
  );
};

export default ShortcutInput;