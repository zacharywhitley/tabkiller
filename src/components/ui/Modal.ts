/**
 * Modal Component
 * Provides reusable modal dialog functionality with accessibility support
 */

import { Modal as ModalType, ModalAction, ComponentState } from '../../shared/types';

export interface ModalProps {
  id: string;
  title: string;
  size?: 'small' | 'medium' | 'large' | 'fullscreen';
  closable?: boolean;
  backdrop?: boolean;
  className?: string;
  onClose?: () => void;
  children?: HTMLElement | string;
}

export class Modal {
  private element: HTMLDivElement;
  private overlay: HTMLDivElement;
  private content: HTMLDivElement;
  private header: HTMLDivElement;
  private body: HTMLDivElement;
  private footer?: HTMLDivElement;
  private props: ModalProps;
  private state: ComponentState;
  private focusTrapped: boolean = false;
  private previousFocusedElement: HTMLElement | null = null;

  constructor(props: ModalProps) {
    this.props = props;
    this.state = {
      loading: false,
      error: undefined,
      lastUpdated: Date.now(),
      retryCount: 0,
      isVisible: false,
    };

    this.element = this.createElement();
    this.overlay = this.createOverlay();
    this.content = this.createContent();
    this.header = this.createHeader();
    this.body = this.createBody();

    this.setupStructure();
    this.setupEventListeners();
    this.setupAccessibility();
  }

  private createElement(): HTMLDivElement {
    const modal = document.createElement('div');
    modal.id = this.props.id;
    modal.className = this.getClassNames();
    modal.style.display = 'none';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', `${this.props.id}-title`);
    
    return modal;
  }

  private createOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'tk-modal__overlay';
    return overlay;
  }

  private createContent(): HTMLDivElement {
    const content = document.createElement('div');
    content.className = 'tk-modal__content';
    return content;
  }

  private createHeader(): HTMLDivElement {
    const header = document.createElement('div');
    header.className = 'tk-modal__header';

    const title = document.createElement('h2');
    title.className = 'tk-modal__title';
    title.id = `${this.props.id}-title`;
    title.textContent = this.props.title;

    header.appendChild(title);

    if (this.props.closable !== false) {
      const closeButton = document.createElement('button');
      closeButton.className = 'tk-modal__close';
      closeButton.setAttribute('aria-label', 'Close modal');
      closeButton.innerHTML = '×';
      closeButton.addEventListener('click', () => this.close());
      header.appendChild(closeButton);
    }

    return header;
  }

  private createBody(): HTMLDivElement {
    const body = document.createElement('div');
    body.className = 'tk-modal__body';
    return body;
  }

  private createFooter(): HTMLDivElement {
    const footer = document.createElement('div');
    footer.className = 'tk-modal__footer';
    return footer;
  }

  private setupStructure(): void {
    this.content.appendChild(this.header);
    this.content.appendChild(this.body);
    this.element.appendChild(this.overlay);
    this.element.appendChild(this.content);
  }

  private setupEventListeners(): void {
    // Close on overlay click
    if (this.props.backdrop !== false) {
      this.overlay.addEventListener('click', () => this.close());
    }

    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state.isVisible && this.props.closable !== false) {
        this.close();
      }
    });

    // Trap focus within modal
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && this.state.isVisible) {
        this.trapFocus(e);
      }
    });
  }

  private setupAccessibility(): void {
    // Ensure modal is added to the end of body for proper screen reader order
    document.body.appendChild(this.element);
  }

  private trapFocus(event: KeyboardEvent): void {
    const focusableElements = this.content.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstFocusableElement = focusableElements[0] as HTMLElement;
    const lastFocusableElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (event.shiftKey) {
      if (document.activeElement === firstFocusableElement) {
        lastFocusableElement.focus();
        event.preventDefault();
      }
    } else {
      if (document.activeElement === lastFocusableElement) {
        firstFocusableElement.focus();
        event.preventDefault();
      }
    }
  }

  private getClassNames(): string {
    const classes = ['tk-modal'];
    
    if (this.props.size) {
      classes.push(`tk-modal--${this.props.size}`);
    }
    
    if (this.props.className) {
      classes.push(this.props.className);
    }

    return classes.join(' ');
  }

  // Public methods
  public open(): void {
    this.state.isVisible = true;
    this.element.style.display = 'flex';
    
    // Store currently focused element
    this.previousFocusedElement = document.activeElement as HTMLElement;
    
    // Focus first focusable element in modal
    setTimeout(() => {
      const firstFocusable = this.content.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement;
      
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        this.content.focus();
      }
    }, 100);

    // Prevent body scrolling
    document.body.style.overflow = 'hidden';
    
    this.element.setAttribute('aria-hidden', 'false');
  }

  public close(): void {
    if (!this.state.isVisible) return;

    this.state.isVisible = false;
    this.element.style.display = 'none';
    
    // Restore focus to previous element
    if (this.previousFocusedElement) {
      this.previousFocusedElement.focus();
      this.previousFocusedElement = null;
    }
    
    // Restore body scrolling
    document.body.style.overflow = '';
    
    this.element.setAttribute('aria-hidden', 'true');
    
    // Call close callback
    this.props.onClose?.();
  }

  public setTitle(title: string): void {
    this.props.title = title;
    const titleElement = this.header.querySelector('.tk-modal__title');
    if (titleElement) {
      titleElement.textContent = title;
    }
  }

  public setContent(content: HTMLElement | string): void {
    this.body.innerHTML = '';
    
    if (typeof content === 'string') {
      this.body.innerHTML = content;
    } else {
      this.body.appendChild(content);
    }
  }

  public addFooter(actions: ModalAction[]): void {
    if (!this.footer) {
      this.footer = this.createFooter();
      this.content.appendChild(this.footer);
    }

    this.footer.innerHTML = '';
    
    actions.forEach(action => {
      const button = document.createElement('button');
      button.className = `tk-button tk-button--${action.type}`;
      button.textContent = action.label;
      button.disabled = action.disabled || false;
      
      button.addEventListener('click', async () => {
        try {
          await action.action();
        } catch (error) {
          console.error('Modal action failed:', error);
        }
      });
      
      this.footer!.appendChild(button);
    });
  }

  public getElement(): HTMLDivElement {
    return this.element;
  }

  public isOpen(): boolean {
    return this.state.isVisible;
  }

  public destroy(): void {
    this.close();
    this.element.remove();
  }
}

// Factory function
export function createModal(props: ModalProps): Modal {
  return new Modal(props);
}

// Modal styles to be included in CSS
export const modalStyles = `
/* Modal component styles */
.tk-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: tk-modal-fade-in 0.2s ease-out;
}

.tk-modal[aria-hidden="true"] {
  display: none;
}

.tk-modal__overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}

.tk-modal__content {
  position: relative;
  background-color: var(--tk-bg-primary);
  border-radius: var(--tk-border-radius-lg);
  box-shadow: var(--tk-shadow-lg, 0 10px 25px rgba(0, 0, 0, 0.15));
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  animation: tk-modal-slide-in 0.2s ease-out;
}

.tk-modal--small .tk-modal__content {
  width: 320px;
}

.tk-modal--medium .tk-modal__content {
  width: 480px;
}

.tk-modal--large .tk-modal__content {
  width: 640px;
}

.tk-modal--fullscreen .tk-modal__content {
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  border-radius: 0;
}

.tk-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--tk-spacing-lg);
  border-bottom: 1px solid var(--tk-border-color);
}

.tk-modal__title {
  font-size: var(--tk-font-size-lg);
  font-weight: var(--tk-font-weight-semibold);
  color: var(--tk-text-primary);
  margin: 0;
}

.tk-modal__close {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--tk-text-muted);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--tk-border-radius);
  transition: all 0.2s ease-in-out;
}

.tk-modal__close:hover {
  color: var(--tk-text-primary);
  background-color: var(--tk-bg-secondary);
}

.tk-modal__close:focus-visible {
  outline: 2px solid var(--tk-accent-color);
  outline-offset: 2px;
}

.tk-modal__body {
  padding: var(--tk-spacing-lg);
  min-height: 60px;
}

.tk-modal__footer {
  display: flex;
  gap: var(--tk-spacing-sm);
  justify-content: flex-end;
  padding: var(--tk-spacing-lg);
  border-top: 1px solid var(--tk-border-color);
  background-color: var(--tk-bg-secondary);
}

/* Animations */
@keyframes tk-modal-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes tk-modal-slide-in {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Responsive design */
@media (max-width: 768px) {
  .tk-modal__content {
    width: 100vw;
    height: 100vh;
    max-width: 100vw;
    max-height: 100vh;
    border-radius: 0;
  }
  
  .tk-modal--small .tk-modal__content,
  .tk-modal--medium .tk-modal__content,
  .tk-modal--large .tk-modal__content {
    width: 100vw;
    height: 100vh;
  }
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
  .tk-modal,
  .tk-modal__content {
    animation: none;
  }
}

/* High contrast mode */
@media (prefers-contrast: high) {
  .tk-modal__content {
    border: 2px solid var(--tk-text-primary);
  }
  
  .tk-modal__header,
  .tk-modal__footer {
    border-color: var(--tk-text-primary);
  }
}
`;