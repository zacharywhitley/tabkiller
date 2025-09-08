import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import styles from './Button.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual variant of the button
   */
  variant?: 'primary' | 'secondary' | 'outline' | 'text' | 'danger';
  
  /**
   * Size of the button
   */
  size?: 'small' | 'medium' | 'large';
  
  /**
   * Whether the button is in a loading state
   */
  loading?: boolean;
  
  /**
   * Icon to display in the button
   */
  icon?: string;
  
  /**
   * Position of the icon
   */
  iconPosition?: 'left' | 'right';
  
  /**
   * Whether the button should take full width of its container
   */
  fullWidth?: boolean;
  
  /**
   * Content of the button
   */
  children: React.ReactNode;
}

/**
 * Button Component
 * 
 * A versatile button component that supports multiple variants, sizes, icons, and loading states.
 * Built on top of the TabKiller design system with full accessibility support.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'medium',
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  disabled,
  className,
  children,
  ...props
}, ref) => {
  const buttonClasses = clsx(
    styles.button,
    styles[`button--${variant}`],
    styles[`button--${size}`],
    {
      [styles['button--loading']]: loading,
      [styles['button--full-width']]: fullWidth,
      [styles['button--with-icon']]: icon && children,
    },
    className
  );

  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      className={buttonClasses}
      disabled={isDisabled}
      aria-busy={loading}
      {...props}
    >
      {loading ? (
        <span className={styles.spinner} aria-hidden="true">
          <svg
            className={styles.spinnerSvg}
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
      ) : (
        <span className={styles.content}>
          {icon && iconPosition === 'left' && (
            <span className={styles.icon} aria-hidden="true">
              {icon}
            </span>
          )}
          
          {children && (
            <span className={styles.text}>
              {children}
            </span>
          )}
          
          {icon && iconPosition === 'right' && (
            <span className={styles.icon} aria-hidden="true">
              {icon}
            </span>
          )}
        </span>
      )}
    </button>
  );
});

Button.displayName = 'Button';

export default Button;