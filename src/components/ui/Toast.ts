/**
 * Toast Component
 * Provides non-intrusive notification system with auto-dismiss and action support
 */

import { Toast as ToastType, ToastAction, ComponentState } from '../../shared/types';

export interface ToastProps {
  id?: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  persistent?: boolean;
  actions?: ToastAction[];
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  onDismiss?: (id: string) => void;
}

export class Toast {
  private element: HTMLDivElement;
  private props: ToastProps;
  private state: ComponentState;
  private dismissTimer?: number;
  private static container: HTMLDivElement | null = null;
  private static activeToasts: Map<string, Toast> = new Map();

  constructor(props: ToastProps) {
    this.props = {
      id: props.id || this.generateId(),
      duration: props.duration || (props.persistent ? 0 : this.getDefaultDuration(props.type)),
      position: props.position || 'top-right',
      ...props
    };

    this.state = {
      loading: false,
      error: undefined,
      lastUpdated: Date.now(),
      retryCount: 0,
      isVisible: false,
    };

    this.element = this.createElement();
    this.setupEventListeners();
  }

  private generateId(): string {
    return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDefaultDuration(type: ToastProps['type']): number {
    const durations = {
      success: 4000,
      info: 5000,
      warning: 6000,
      error: 8000,
    };
    return durations[type];
  }

  private createElement(): HTMLDivElement {
    const toast = document.createElement('div');
    toast.className = this.getClassNames();
    toast.setAttribute('role', this.props.type === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', this.props.type === 'error' ? 'assertive' : 'polite');
    toast.setAttribute('aria-atomic', 'true');

    // Icon
    const icon = document.createElement('div');
    icon.className = 'tk-toast__icon';
    icon.innerHTML = this.getIcon();
    toast.appendChild(icon);

    // Content
    const content = document.createElement('div');
    content.className = 'tk-toast__content';

    const title = document.createElement('div');
    title.className = 'tk-toast__title';
    title.textContent = this.props.title;
    content.appendChild(title);

    if (this.props.message) {
      const message = document.createElement('div');
      message.className = 'tk-toast__message';
      message.textContent = this.props.message;
      content.appendChild(message);
    }

    // Actions
    if (this.props.actions && this.props.actions.length > 0) {
      const actions = document.createElement('div');
      actions.className = 'tk-toast__actions';

      this.props.actions.forEach(action => {
        const button = document.createElement('button');
        button.className = 'tk-toast__action';
        button.textContent = action.label;
        button.addEventListener('click', () => {
          action.action();
          this.dismiss();
        });
        actions.appendChild(button);
      });

      content.appendChild(actions);
    }

    toast.appendChild(content);

    // Close button
    if (!this.props.persistent) {
      const closeButton = document.createElement('button');
      closeButton.className = 'tk-toast__close';
      closeButton.setAttribute('aria-label', 'Dismiss notification');
      closeButton.innerHTML = '×';
      closeButton.addEventListener('click', () => this.dismiss());
      toast.appendChild(closeButton);
    }

    // Progress bar for non-persistent toasts
    if (!this.props.persistent && this.props.duration && this.props.duration > 0) {
      const progress = document.createElement('div');
      progress.className = 'tk-toast__progress';
      toast.appendChild(progress);
    }

    return toast;
  }

  private getIcon(): string {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ',
    };
    return icons[this.props.type];
  }

  private getClassNames(): string {
    const classes = ['tk-toast', `tk-toast--${this.props.type}`];
    
    if (this.props.persistent) {
      classes.push('tk-toast--persistent');
    }

    return classes.join(' ');
  }

  private setupEventListeners(): void {
    // Pause timer on hover
    this.element.addEventListener('mouseenter', () => {
      if (this.dismissTimer) {
        clearTimeout(this.dismissTimer);
      }
    });

    // Resume timer on leave
    this.element.addEventListener('mouseleave', () => {
      if (!this.props.persistent && this.props.duration && this.props.duration > 0) {
        this.startDismissTimer();
      }
    });

    // Keyboard accessibility
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.dismiss();
      }
    });
  }

  private startDismissTimer(): void {
    if (this.props.persistent || !this.props.duration || this.props.duration <= 0) {
      return;
    }

    this.dismissTimer = window.setTimeout(() => {
      this.dismiss();
    }, this.props.duration);

    // Update progress bar
    const progressBar = this.element.querySelector('.tk-toast__progress') as HTMLDivElement;
    if (progressBar) {
      progressBar.style.animation = `tk-toast-progress ${this.props.duration}ms linear`;
    }
  }

  private static ensureContainer(position: ToastProps['position']): HTMLDivElement {
    const containerId = `tk-toast-container-${position}`;
    let container = document.getElementById(containerId) as HTMLDivElement;

    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.className = `tk-toast-container tk-toast-container--${position}`;
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-label', 'Notifications');
      document.body.appendChild(container);
    }

    return container;
  }

  // Public methods
  public show(): void {
    if (this.state.isVisible) return;

    const container = Toast.ensureContainer(this.props.position!);
    container.appendChild(this.element);

    // Add to active toasts
    Toast.activeToasts.set(this.props.id!, this);

    this.state.isVisible = true;

    // Trigger entrance animation
    requestAnimationFrame(() => {
      this.element.classList.add('tk-toast--visible');
    });

    // Start dismiss timer
    if (!this.props.persistent) {
      this.startDismissTimer();
    }
  }

  public dismiss(): void {
    if (!this.state.isVisible) return;

    // Clear timer
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
    }

    // Trigger exit animation
    this.element.classList.remove('tk-toast--visible');
    this.element.classList.add('tk-toast--dismissed');

    // Remove from DOM after animation
    setTimeout(() => {
      if (this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      
      // Remove from active toasts
      Toast.activeToasts.delete(this.props.id!);
      
      this.state.isVisible = false;
      
      // Call dismiss callback
      this.props.onDismiss?.(this.props.id!);
    }, 300);
  }

  public updateContent(title: string, message?: string): void {
    this.props.title = title;
    if (message !== undefined) {
      this.props.message = message;
    }

    const titleElement = this.element.querySelector('.tk-toast__title');
    const messageElement = this.element.querySelector('.tk-toast__message');

    if (titleElement) {
      titleElement.textContent = title;
    }

    if (messageElement && message !== undefined) {
      messageElement.textContent = message;
    }
  }

  public getElement(): HTMLDivElement {
    return this.element;
  }

  public getId(): string {
    return this.props.id!;
  }

  // Static methods for global toast management
  public static show(props: ToastProps): Toast {
    const toast = new Toast(props);
    toast.show();
    return toast;
  }

  public static success(title: string, message?: string, options?: Partial<ToastProps>): Toast {
    return Toast.show({
      type: 'success',
      title,
      message: message || '',
      ...options
    });
  }

  public static error(title: string, message?: string, options?: Partial<ToastProps>): Toast {
    return Toast.show({
      type: 'error',
      title,
      message: message || '',
      ...options
    });
  }

  public static warning(title: string, message?: string, options?: Partial<ToastProps>): Toast {
    return Toast.show({
      type: 'warning',
      title,
      message: message || '',
      ...options
    });
  }

  public static info(title: string, message?: string, options?: Partial<ToastProps>): Toast {
    return Toast.show({
      type: 'info',
      title,
      message: message || '',
      ...options
    });
  }

  public static dismiss(id: string): void {
    const toast = Toast.activeToasts.get(id);
    toast?.dismiss();
  }

  public static dismissAll(): void {
    Toast.activeToasts.forEach(toast => toast.dismiss());
  }

  public static getActiveToasts(): Toast[] {
    return Array.from(Toast.activeToasts.values());
  }
}

// Toast styles to be included in CSS
export const toastStyles = `
/* Toast container positioning */
.tk-toast-container {
  position: fixed;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: var(--tk-spacing-sm);
  max-width: 400px;
  pointer-events: none;
}

.tk-toast-container--top-right {
  top: var(--tk-spacing-lg);
  right: var(--tk-spacing-lg);
}

.tk-toast-container--top-left {
  top: var(--tk-spacing-lg);
  left: var(--tk-spacing-lg);
}

.tk-toast-container--bottom-right {
  bottom: var(--tk-spacing-lg);
  right: var(--tk-spacing-lg);
}

.tk-toast-container--bottom-left {
  bottom: var(--tk-spacing-lg);
  left: var(--tk-spacing-lg);
}

.tk-toast-container--top-center {
  top: var(--tk-spacing-lg);
  left: 50%;
  transform: translateX(-50%);
}

.tk-toast-container--bottom-center {
  bottom: var(--tk-spacing-lg);
  left: 50%;
  transform: translateX(-50%);
}

/* Toast component styles */
.tk-toast {
  display: flex;
  align-items: flex-start;
  gap: var(--tk-spacing-sm);
  padding: var(--tk-spacing-md);
  background-color: var(--tk-bg-primary);
  border-radius: var(--tk-border-radius);
  box-shadow: var(--tk-shadow-md);
  border-left: 4px solid;
  pointer-events: auto;
  transform: translateX(100%);
  opacity: 0;
  transition: all 0.3s ease-out;
  position: relative;
  overflow: hidden;
  min-width: 300px;
}

.tk-toast--visible {
  transform: translateX(0);
  opacity: 1;
}

.tk-toast--dismissed {
  transform: translateX(100%);
  opacity: 0;
}

/* Toast types */
.tk-toast--success {
  border-left-color: var(--tk-success-color);
}

.tk-toast--error {
  border-left-color: var(--tk-danger-color);
}

.tk-toast--warning {
  border-left-color: var(--tk-warning-color);
}

.tk-toast--info {
  border-left-color: var(--tk-accent-color);
}

/* Toast icon */
.tk-toast__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: var(--tk-font-size-sm);
  font-weight: bold;
  flex-shrink: 0;
}

.tk-toast--success .tk-toast__icon {
  background-color: var(--tk-success-color);
  color: white;
}

.tk-toast--error .tk-toast__icon {
  background-color: var(--tk-danger-color);
  color: white;
}

.tk-toast--warning .tk-toast__icon {
  background-color: var(--tk-warning-color);
  color: white;
}

.tk-toast--info .tk-toast__icon {
  background-color: var(--tk-accent-color);
  color: white;
}

/* Toast content */
.tk-toast__content {
  flex: 1;
}

.tk-toast__title {
  font-weight: var(--tk-font-weight-semibold);
  color: var(--tk-text-primary);
  margin-bottom: var(--tk-spacing-xs);
  line-height: 1.4;
}

.tk-toast__message {
  color: var(--tk-text-secondary);
  font-size: var(--tk-font-size-sm);
  line-height: 1.4;
  margin-bottom: var(--tk-spacing-xs);
}

/* Toast actions */
.tk-toast__actions {
  display: flex;
  gap: var(--tk-spacing-xs);
  margin-top: var(--tk-spacing-sm);
}

.tk-toast__action {
  background: none;
  border: none;
  color: var(--tk-accent-color);
  font-size: var(--tk-font-size-sm);
  font-weight: var(--tk-font-weight-medium);
  cursor: pointer;
  padding: var(--tk-spacing-xs) 0;
  text-decoration: underline;
  transition: color 0.2s ease-in-out;
}

.tk-toast__action:hover {
  color: var(--tk-accent-hover);
}

.tk-toast__action:focus-visible {
  outline: 2px solid var(--tk-accent-color);
  outline-offset: 2px;
  border-radius: 2px;
}

/* Toast close button */
.tk-toast__close {
  background: none;
  border: none;
  color: var(--tk-text-muted);
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease-in-out;
  flex-shrink: 0;
}

.tk-toast__close:hover {
  color: var(--tk-text-primary);
  background-color: var(--tk-bg-secondary);
}

.tk-toast__close:focus-visible {
  outline: 2px solid var(--tk-accent-color);
  outline-offset: 2px;
}

/* Progress bar */
.tk-toast__progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background-color: var(--tk-accent-color);
  width: 100%;
  transform-origin: left;
}

.tk-toast--success .tk-toast__progress {
  background-color: var(--tk-success-color);
}

.tk-toast--error .tk-toast__progress {
  background-color: var(--tk-danger-color);
}

.tk-toast--warning .tk-toast__progress {
  background-color: var(--tk-warning-color);
}

@keyframes tk-toast-progress {
  0% { transform: scaleX(1); }
  100% { transform: scaleX(0); }
}

/* Responsive design */
@media (max-width: 480px) {
  .tk-toast-container {
    left: var(--tk-spacing-sm) !important;
    right: var(--tk-spacing-sm) !important;
    max-width: none;
    transform: none !important;
  }
  
  .tk-toast {
    min-width: auto;
    width: 100%;
  }
}

/* Left-positioned containers */
.tk-toast-container--top-left .tk-toast,
.tk-toast-container--bottom-left .tk-toast {
  transform: translateX(-100%);
}

.tk-toast-container--top-left .tk-toast--visible,
.tk-toast-container--bottom-left .tk-toast--visible {
  transform: translateX(0);
}

.tk-toast-container--top-left .tk-toast--dismissed,
.tk-toast-container--bottom-left .tk-toast--dismissed {
  transform: translateX(-100%);
}

/* Center-positioned containers */
.tk-toast-container--top-center .tk-toast,
.tk-toast-container--bottom-center .tk-toast {
  transform: translateY(-20px);
}

.tk-toast-container--top-center .tk-toast--visible,
.tk-toast-container--bottom-center .tk-toast--visible {
  transform: translateY(0);
}

.tk-toast-container--top-center .tk-toast--dismissed,
.tk-toast-container--bottom-center .tk-toast--dismissed {
  transform: translateY(-20px);
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
  .tk-toast {
    transition: none;
    transform: none !important;
    opacity: 1 !important;
  }
  
  .tk-toast__progress {
    animation: none !important;
  }
}

/* High contrast mode */
@media (prefers-contrast: high) {
  .tk-toast {
    border: 2px solid var(--tk-text-primary);
  }
}
`;