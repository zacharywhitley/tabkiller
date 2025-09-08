import React, { forwardRef, HTMLAttributes } from 'react';
import { clsx } from 'clsx';
import styles from './Card.module.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Visual variant of the card
   */
  variant?: 'default' | 'outlined' | 'elevated';
  
  /**
   * Padding size of the card
   */
  padding?: 'none' | 'small' | 'medium' | 'large';
  
  /**
   * Whether the card is interactive (hoverable/clickable)
   */
  interactive?: boolean;
  
  /**
   * Content of the card
   */
  children: React.ReactNode;
}

/**
 * Card Component
 * 
 * A versatile container component that provides a visual boundary for content.
 * Supports different variants, padding sizes, and interactive states.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(({
  variant = 'default',
  padding = 'medium',
  interactive = false,
  className,
  children,
  ...props
}, ref) => {
  const cardClasses = clsx(
    styles.card,
    styles[`card--${variant}`],
    styles[`card--padding-${padding}`],
    {
      [styles['card--interactive']]: interactive,
    },
    className
  );

  return (
    <div
      ref={ref}
      className={cardClasses}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

export default Card;