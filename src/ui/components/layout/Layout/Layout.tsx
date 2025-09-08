import React, { forwardRef, HTMLAttributes } from 'react';
import { clsx } from 'clsx';
import styles from './Layout.module.css';

export interface LayoutProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Layout direction
   */
  direction?: 'row' | 'column';
  
  /**
   * Alignment of items along the main axis
   */
  justify?: 'start' | 'end' | 'center' | 'between' | 'around' | 'evenly';
  
  /**
   * Alignment of items along the cross axis
   */
  align?: 'start' | 'end' | 'center' | 'stretch' | 'baseline';
  
  /**
   * Gap between items
   */
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  
  /**
   * Whether items should wrap
   */
  wrap?: boolean;
  
  /**
   * Padding around the layout
   */
  padding?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  
  /**
   * Whether to take full width
   */
  fullWidth?: boolean;
  
  /**
   * Whether to take full height
   */
  fullHeight?: boolean;
  
  /**
   * Children to render
   */
  children: React.ReactNode;
}

/**
 * Layout Component
 * 
 * A flexible container component for arranging child elements using flexbox.
 * Provides common layout patterns with consistent spacing and alignment options.
 */
export const Layout = forwardRef<HTMLDivElement, LayoutProps>(({
  direction = 'column',
  justify = 'start',
  align = 'stretch',
  gap = 'md',
  wrap = false,
  padding = 'none',
  fullWidth = false,
  fullHeight = false,
  className,
  children,
  ...props
}, ref) => {
  const layoutClasses = clsx(
    styles.layout,
    styles[`layout--${direction}`],
    styles[`layout--justify-${justify}`],
    styles[`layout--align-${align}`],
    styles[`layout--gap-${gap}`],
    styles[`layout--padding-${padding}`],
    {
      [styles['layout--wrap']]: wrap,
      [styles['layout--full-width']]: fullWidth,
      [styles['layout--full-height']]: fullHeight,
    },
    className
  );

  return (
    <div
      ref={ref}
      className={layoutClasses}
      {...props}
    >
      {children}
    </div>
  );
});

Layout.displayName = 'Layout';

export default Layout;