import React, { forwardRef, HTMLAttributes } from 'react';
import { clsx } from 'clsx';
import styles from './FormField.module.css';

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Label for the form field
   */
  label?: string;
  
  /**
   * Helper text to display below the field
   */
  helperText?: string;
  
  /**
   * Error message to display
   */
  error?: string;
  
  /**
   * Whether the field is required
   */
  required?: boolean;
  
  /**
   * Whether the field should take full width
   */
  fullWidth?: boolean;
  
  /**
   * Children to render (form controls)
   */
  children: React.ReactNode;
}

/**
 * FormField Component
 * 
 * A wrapper component for form controls that provides consistent labeling,
 * helper text, error display, and spacing. Can be used with any form control.
 */
export const FormField = forwardRef<HTMLDivElement, FormFieldProps>(({
  label,
  helperText,
  error,
  required = false,
  fullWidth = false,
  className,
  children,
  ...props
}, ref) => {
  const hasError = Boolean(error);

  const containerClasses = clsx(
    styles.container,
    {
      [styles['container--full-width']]: fullWidth,
      [styles['container--error']]: hasError,
    },
    className
  );

  return (
    <div
      ref={ref}
      className={containerClasses}
      {...props}
    >
      {label && (
        <label 
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
      
      <div className={styles.control}>
        {children}
      </div>
      
      {(helperText || error) && (
        <div
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

FormField.displayName = 'FormField';

export default FormField;