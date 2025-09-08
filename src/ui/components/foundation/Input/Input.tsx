import React, { forwardRef, InputHTMLAttributes, useState, useId } from 'react';
import { clsx } from 'clsx';
import styles from './Input.module.css';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /**
   * Label for the input
   */
  label?: string;
  
  /**
   * Helper text to display below the input
   */
  helperText?: string;
  
  /**
   * Error message to display
   */
  error?: string;
  
  /**
   * Size of the input
   */
  size?: 'small' | 'medium' | 'large';
  
  /**
   * Visual variant of the input
   */
  variant?: 'default' | 'filled' | 'outlined';
  
  /**
   * Icon to display in the input
   */
  startIcon?: string;
  
  /**
   * Icon to display at the end of the input
   */
  endIcon?: string;
  
  /**
   * Whether the input should take full width
   */
  fullWidth?: boolean;
  
  /**
   * Whether to show a loading state
   */
  loading?: boolean;
}

/**
 * Input Component
 * 
 * A flexible input component that supports labels, helper text, error states,
 * icons, and different sizes. Built with accessibility in mind.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  helperText,
  error,
  size = 'medium',
  variant = 'default',
  startIcon,
  endIcon,
  fullWidth = false,
  loading = false,
  disabled,
  required,
  className,
  id,
  ...props
}, ref) => {
  const [focused, setFocused] = useState(false);
  const generatedId = useId();
  const inputId = id || generatedId;
  const helperTextId = helperText || error ? `${inputId}-helper` : undefined;

  const hasError = Boolean(error);
  const isDisabled = disabled || loading;

  const containerClasses = clsx(
    styles.container,
    {
      [styles['container--full-width']]: fullWidth,
    }
  );

  const wrapperClasses = clsx(
    styles.wrapper,
    styles[`wrapper--${variant}`],
    styles[`wrapper--${size}`],
    {
      [styles['wrapper--focused']]: focused,
      [styles['wrapper--error']]: hasError,
      [styles['wrapper--disabled']]: isDisabled,
      [styles['wrapper--with-start-icon']]: startIcon,
      [styles['wrapper--with-end-icon']]: endIcon || loading,
    },
    className
  );

  const inputClasses = clsx(
    styles.input,
    styles[`input--${size}`]
  );

  return (
    <div className={containerClasses}>
      {label && (
        <label 
          htmlFor={inputId}
          className={clsx(
            styles.label,
            {
              [styles['label--required']]: required,
              [styles['label--error']]: hasError,
            }
          )}
        >
          {label}
          {required && (
            <span className={styles.required} aria-label="required">
              *
            </span>
          )}
        </label>
      )}
      
      <div className={wrapperClasses}>
        {startIcon && (
          <span className={clsx(styles.icon, styles['icon--start'])} aria-hidden="true">
            {startIcon}
          </span>
        )}
        
        <input
          ref={ref}
          id={inputId}
          className={inputClasses}
          disabled={isDisabled}
          required={required}
          aria-describedby={helperTextId}
          aria-invalid={hasError}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
        
        {loading ? (
          <span className={clsx(styles.icon, styles['icon--end'])} aria-hidden="true">
            <svg
              className={styles.spinner}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="31.416"
                strokeDashoffset="31.416"
              />
            </svg>
          </span>
        ) : endIcon ? (
          <span className={clsx(styles.icon, styles['icon--end'])} aria-hidden="true">
            {endIcon}
          </span>
        ) : null}
      </div>
      
      {(helperText || error) && (
        <div
          id={helperTextId}
          className={clsx(
            styles.helperText,
            {
              [styles['helperText--error']]: hasError,
            }
          )}
          role={hasError ? 'alert' : undefined}
        >
          {error || helperText}
        </div>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;