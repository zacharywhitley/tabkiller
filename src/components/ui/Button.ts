/**
 * Reusable Button Component
 * Provides consistent button styling and behavior across the extension
 */

import { ComponentState } from '../../shared/types';

export interface ButtonProps {
  id?: string;
  type?: 'button' | 'submit' | 'reset';
  variant: 'primary' | 'secondary' | 'outline' | 'text' | 'danger';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
  onClick?: (event: MouseEvent) => void;
  children: string | HTMLElement[];
}

export class Button {
  private element: HTMLButtonElement;
  private props: ButtonProps;
  private state: ComponentState;

  constructor(props: ButtonProps) {
    this.props = props;
    this.state = {
      loading: props.loading || false,
      error: undefined,
      lastUpdated: Date.now(),
      retryCount: 0,
      isVisible: true,
    };

    this.element = this.createElement();
    this.setupEventListeners();
    this.updateElement();
  }

  private createElement(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = this.props.type || 'button';
    if (this.props.id) button.id = this.props.id;
    if (this.props.title) button.title = this.props.title;
    if (this.props.ariaLabel) button.setAttribute('aria-label', this.props.ariaLabel);

    return button;
  }

  private setupEventListeners(): void {
    this.element.addEventListener('click', (event) => {
      if (this.props.disabled || this.state.loading) {
        event.preventDefault();
        return;
      }

      this.props.onClick?.(event);
    });

    // Keyboard accessibility
    this.element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        if (this.props.disabled || this.state.loading) {
          event.preventDefault();
          return;
        }
        this.props.onClick?.(event as any);
      }
    });
  }

  private updateElement(): void {
    // Update classes
    this.element.className = this.getClassNames();

    // Update disabled state
    this.element.disabled = this.props.disabled || this.state.loading;

    // Update ARIA attributes
    this.element.setAttribute('aria-disabled', String(this.element.disabled));
    if (this.state.loading) {
      this.element.setAttribute('aria-busy', 'true');
    } else {
      this.element.removeAttribute('aria-busy');
    }

    // Update content
    this.updateContent();
  }

  private updateContent(): void {
    this.element.innerHTML = '';

    if (this.state.loading) {
      const spinner = this.createSpinner();
      this.element.appendChild(spinner);
      return;
    }

    const contentContainer = document.createElement('span');
    contentContainer.className = 'tk-button__content';

    // Add icon if specified
    if (this.props.icon && this.props.iconPosition !== 'right') {
      const icon = this.createIcon(this.props.icon);
      contentContainer.appendChild(icon);
    }

    // Add text content
    if (typeof this.props.children === 'string') {
      const textSpan = document.createElement('span');
      textSpan.textContent = this.props.children;
      textSpan.className = 'tk-button__text';
      contentContainer.appendChild(textSpan);
    } else {
      this.props.children.forEach((child) => {
        contentContainer.appendChild(child);
      });
    }

    // Add right-positioned icon
    if (this.props.icon && this.props.iconPosition === 'right') {
      const icon = this.createIcon(this.props.icon);
      contentContainer.appendChild(icon);
    }

    this.element.appendChild(contentContainer);
  }

  private createIcon(iconText: string): HTMLSpanElement {
    const icon = document.createElement('span');
    icon.className = 'tk-button__icon';
    icon.textContent = iconText;
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }

  private createSpinner(): HTMLSpanElement {
    const spinner = document.createElement('span');
    spinner.className = 'tk-button__spinner';
    spinner.setAttribute('aria-hidden', 'true');
    spinner.innerHTML = '⟳';
    return spinner;
  }

  private getClassNames(): string {
    const classes = ['tk-button'];
    
    classes.push(`tk-button--${this.props.variant}`);
    
    if (this.props.size) {
      classes.push(`tk-button--${this.props.size}`);
    }
    
    if (this.props.fullWidth) {
      classes.push('tk-button--full-width');
    }
    
    if (this.state.loading) {
      classes.push('tk-button--loading');
    }
    
    if (this.props.disabled) {
      classes.push('tk-button--disabled');
    }
    
    if (this.props.className) {
      classes.push(this.props.className);
    }

    return classes.join(' ');
  }

  // Public methods
  public setLoading(loading: boolean): void {
    this.state.loading = loading;
    this.updateElement();
  }

  public setDisabled(disabled: boolean): void {
    this.props.disabled = disabled;
    this.updateElement();
  }

  public updateProps(newProps: Partial<ButtonProps>): void {
    this.props = { ...this.props, ...newProps };
    this.updateElement();
  }

  public getElement(): HTMLButtonElement {
    return this.element;
  }

  public focus(): void {
    this.element.focus();
  }

  public blur(): void {
    this.element.blur();
  }

  public destroy(): void {
    this.element.remove();
  }
}

// Factory function for easier usage
export function createButton(props: ButtonProps): Button {
  return new Button(props);
}

// CSS utility for button styling
export const buttonStyles = `
/* Button component styles */
.tk-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--tk-spacing-xs);
  padding: var(--tk-spacing-sm) var(--tk-spacing-md);
  border: none;
  border-radius: var(--tk-border-radius);
  font-size: var(--tk-font-size-sm);
  font-weight: var(--tk-font-weight-medium);
  font-family: inherit;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  min-height: 36px;
  user-select: none;
  -webkit-user-select: none;
  outline: none;
}

.tk-button:focus-visible {
  outline: 2px solid var(--tk-accent-color);
  outline-offset: 2px;
}

.tk-button:disabled,
.tk-button--disabled {
  opacity: 0.6;
  cursor: not-allowed;
  pointer-events: none;
}

.tk-button--loading {
  cursor: wait;
}

/* Variants */
.tk-button--primary {
  background-color: var(--tk-accent-color);
  color: white;
}

.tk-button--primary:hover:not(:disabled):not(.tk-button--loading) {
  background-color: var(--tk-accent-hover);
}

.tk-button--secondary {
  background-color: var(--tk-bg-tertiary);
  color: var(--tk-text-primary);
  border: 1px solid var(--tk-border-color);
}

.tk-button--secondary:hover:not(:disabled):not(.tk-button--loading) {
  background-color: var(--tk-border-color);
}

.tk-button--outline {
  background-color: transparent;
  color: var(--tk-text-secondary);
  border: 1px solid var(--tk-border-color);
}

.tk-button--outline:hover:not(:disabled):not(.tk-button--loading) {
  background-color: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
}

.tk-button--text {
  background-color: transparent;
  color: var(--tk-accent-color);
  text-decoration: underline;
  padding: var(--tk-spacing-xs) 0;
  min-height: auto;
}

.tk-button--text:hover:not(:disabled):not(.tk-button--loading) {
  color: var(--tk-accent-hover);
}

.tk-button--danger {
  background-color: var(--tk-danger-color);
  color: white;
}

.tk-button--danger:hover:not(:disabled):not(.tk-button--loading) {
  background-color: #c82333;
}

/* Sizes */
.tk-button--small {
  padding: var(--tk-spacing-xs) var(--tk-spacing-sm);
  font-size: var(--tk-font-size-xs);
  min-height: 28px;
}

.tk-button--large {
  padding: var(--tk-spacing-md) var(--tk-spacing-lg);
  font-size: var(--tk-font-size-base);
  min-height: 44px;
}

.tk-button--full-width {
  width: 100%;
}

/* Content and icons */
.tk-button__content {
  display: flex;
  align-items: center;
  gap: var(--tk-spacing-xs);
}

.tk-button__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1em;
  line-height: 1;
}

.tk-button__spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  animation: tk-spin 1s linear infinite;
}

@keyframes tk-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* High contrast mode */
@media (prefers-contrast: high) {
  .tk-button {
    border: 2px solid currentColor;
  }
  
  .tk-button:focus-visible {
    outline: 3px solid var(--tk-accent-color);
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .tk-button {
    transition: none;
  }
  
  .tk-button__spinner {
    animation: none;
  }
}
`;