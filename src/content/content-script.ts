/**
 * Content script for TabKiller extension
 * Handles page-level data capture, form tracking, and user interaction monitoring
 */

import { messaging } from '../utils/cross-browser';
import {
  Message,
  PageCapture,
  PageMetadata,
  FormData,
  FormField,
  LinkInfo,
  NavigationEvent
} from '../shared/types';

class ContentScript {
  private isInitialized = false;
  private pageLoadTime = Date.now();
  private lastScrollPosition = { x: 0, y: 0 };
  private formDataCache = new Map<HTMLFormElement, FormData>();
  private observerInstances: (MutationObserver | IntersectionObserver)[] = [];

  constructor() {
    this.initialize();
  }

  /**
   * Initialize the content script
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('TabKiller content script initializing on:', window.location.href);

      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setupPageTracking());
      } else {
        this.setupPageTracking();
      }

      // Set up message listener
      messaging.onMessage.addListener(this.handleMessage.bind(this));

      this.isInitialized = true;
      console.log('TabKiller content script initialized successfully');
    } catch (error) {
      console.error('Failed to initialize TabKiller content script:', error);
    }
  }

  /**
   * Set up page-level tracking
   */
  private setupPageTracking(): void {
    // Track page load
    this.trackPageLoad();

    // Set up form tracking
    this.setupFormTracking();

    // Set up scroll tracking
    this.setupScrollTracking();

    // Set up link tracking
    this.setupLinkTracking();

    // Set up visibility tracking
    this.setupVisibilityTracking();

    // Set up mutation observer for dynamic content
    this.setupMutationObserver();
  }

  /**
   * Track page load event
   */
  private trackPageLoad(): void {
    const navigationEvent: NavigationEvent = {
      tabId: 0, // Will be set by background script
      url: window.location.href,
      referrer: document.referrer,
      timestamp: this.pageLoadTime,
      transitionType: this.getTransitionType()
    };

    this.sendMessage('track-navigation', navigationEvent);
  }

  /**
   * Set up form tracking
   */
  private setupFormTracking(): void {
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
      this.trackForm(form);
      
      // Listen for form submissions
      form.addEventListener('submit', (event) => {
        this.handleFormSubmit(form, event);
      });

      // Listen for form changes
      form.addEventListener('input', () => {
        this.updateFormData(form);
      });

      // Listen for form focus events
      form.addEventListener('focusin', () => {
        this.handleFormFocus(form);
      });
    });
  }

  /**
   * Track a specific form
   */
  private trackForm(form: HTMLFormElement): void {
    const formData: FormData = {
      id: form.id || undefined,
      name: form.name || undefined,
      action: form.action || undefined,
      method: form.method || 'get',
      fields: this.extractFormFields(form)
    };

    this.formDataCache.set(form, formData);
  }

  /**
   * Extract form field data
   */
  private extractFormFields(form: HTMLFormElement): FormField[] {
    const fields: FormField[] = [];
    const formElements = form.querySelectorAll('input, textarea, select');

    formElements.forEach(element => {
      const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      
      // Skip sensitive fields
      if (this.isSensitiveField(input)) {
        return;
      }

      fields.push({
        name: input.name || input.id || '',
        type: input.type || 'text',
        value: input.value || '',
        required: input.hasAttribute('required')
      });
    });

    return fields;
  }

  /**
   * Check if a field contains sensitive information
   */
  private isSensitiveField(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): boolean {
    const sensitiveTypes = ['password', 'email', 'tel', 'credit-card'];
    const sensitiveNames = ['password', 'pass', 'pwd', 'email', 'phone', 'credit', 'card', 'ssn', 'social'];
    
    const type = element.type?.toLowerCase() || '';
    const name = element.name?.toLowerCase() || '';
    const id = element.id?.toLowerCase() || '';

    return sensitiveTypes.includes(type) ||
           sensitiveNames.some(sensitive => 
             name.includes(sensitive) || id.includes(sensitive)
           );
  }

  /**
   * Handle form submission
   */
  private handleFormSubmit(form: HTMLFormElement, event: SubmitEvent): void {
    const formData = this.formDataCache.get(form);
    if (!formData) return;

    // Update form data before submission
    this.updateFormData(form);

    // Send form submission event
    this.sendMessage('form-submitted', {
      form: formData,
      timestamp: Date.now(),
      url: window.location.href,
      submitter: event.submitter?.tagName || null
    });
  }

  /**
   * Update cached form data
   */
  private updateFormData(form: HTMLFormElement): void {
    const existingData = this.formDataCache.get(form);
    if (!existingData) return;

    existingData.fields = this.extractFormFields(form);
    this.formDataCache.set(form, existingData);
  }

  /**
   * Handle form focus events
   */
  private handleFormFocus(form: HTMLFormElement): void {
    // Track form interaction start
    this.sendMessage('form-focus', {
      formId: form.id || form.name || 'anonymous',
      timestamp: Date.now(),
      url: window.location.href
    });
  }

  /**
   * Set up scroll tracking
   */
  private setupScrollTracking(): void {
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        this.lastScrollPosition = {
          x: window.scrollX,
          y: window.scrollY
        };

        this.sendMessage('scroll-update', {
          position: this.lastScrollPosition,
          timestamp: Date.now(),
          url: window.location.href
        });
      }, 200); // Debounce scroll events
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  /**
   * Set up link tracking
   */
  private setupLinkTracking(): void {
    const links = document.querySelectorAll('a[href]');
    
    links.forEach(link => {
      link.addEventListener('click', (event) => {
        this.handleLinkClick(link as HTMLAnchorElement, event);
      });
    });
  }

  /**
   * Handle link clicks
   */
  private handleLinkClick(link: HTMLAnchorElement, event: MouseEvent): void {
    const linkInfo: LinkInfo = {
      href: link.href,
      text: link.textContent?.trim() || '',
      title: link.title || undefined,
      rel: link.rel || undefined
    };

    this.sendMessage('link-clicked', {
      link: linkInfo,
      timestamp: Date.now(),
      modifiers: {
        ctrl: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
        meta: event.metaKey
      },
      url: window.location.href
    });
  }

  /**
   * Set up page visibility tracking
   */
  private setupVisibilityTracking(): void {
    document.addEventListener('visibilitychange', () => {
      this.sendMessage('visibility-changed', {
        visible: !document.hidden,
        timestamp: Date.now(),
        url: window.location.href
      });
    });

    // Track when page is about to unload
    window.addEventListener('beforeunload', () => {
      this.sendMessage('page-unload', {
        timeOnPage: Date.now() - this.pageLoadTime,
        scrollPosition: this.lastScrollPosition,
        timestamp: Date.now(),
        url: window.location.href
      });
    });
  }

  /**
   * Set up mutation observer for dynamic content
   */
  private setupMutationObserver(): void {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          // Check for new forms
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              
              // Check for new forms
              const newForms = element.tagName === 'FORM' 
                ? [element as HTMLFormElement]
                : Array.from(element.querySelectorAll('form'));
                
              newForms.forEach(form => this.trackForm(form));

              // Check for new links
              const newLinks = element.tagName === 'A'
                ? [element as HTMLAnchorElement]
                : Array.from(element.querySelectorAll('a[href]'));
                
              newLinks.forEach(link => {
                link.addEventListener('click', (event) => {
                  this.handleLinkClick(link, event);
                });
              });
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.observerInstances.push(observer);
  }

  /**
   * Capture current page state
   */
  private capturePageState(): PageCapture {
    return {
      url: window.location.href,
      title: document.title,
      html: this.shouldCaptureHTML() ? document.documentElement.outerHTML : undefined,
      metadata: this.extractPageMetadata(),
      capturedAt: Date.now()
    };
  }

  /**
   * Extract page metadata
   */
  private extractPageMetadata(): PageMetadata {
    const metadata: PageMetadata = {
      description: this.getMetaContent('description'),
      keywords: this.getMetaContent('keywords')?.split(',').map(k => k.trim()),
      author: this.getMetaContent('author'),
      language: document.documentElement.lang || undefined,
      charset: document.characterSet,
      viewportSize: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      scrollPosition: this.lastScrollPosition,
      forms: Array.from(this.formDataCache.values()),
      links: this.extractLinks()
    };

    return metadata;
  }

  /**
   * Get meta tag content
   */
  private getMetaContent(name: string): string | undefined {
    const meta = document.querySelector(`meta[name="${name}"], meta[property="og:${name}"]`);
    return meta?.getAttribute('content') || undefined;
  }

  /**
   * Extract all page links
   */
  private extractLinks(): LinkInfo[] {
    const links: LinkInfo[] = [];
    const linkElements = document.querySelectorAll('a[href]');

    linkElements.forEach(link => {
      const anchor = link as HTMLAnchorElement;
      links.push({
        href: anchor.href,
        text: anchor.textContent?.trim() || '',
        title: anchor.title || undefined,
        rel: anchor.rel || undefined
      });
    });

    return links;
  }

  /**
   * Determine if HTML should be captured based on page content
   */
  private shouldCaptureHTML(): boolean {
    // Don't capture HTML for sensitive pages or very large pages
    const sensitivePatterns = ['/login', '/password', '/payment', '/checkout', '/admin'];
    const url = window.location.href.toLowerCase();
    
    if (sensitivePatterns.some(pattern => url.includes(pattern))) {
      return false;
    }

    // Check document size (avoid capturing very large pages)
    const htmlSize = document.documentElement.outerHTML.length;
    return htmlSize < 1024 * 1024; // 1MB limit
  }

  /**
   * Get navigation transition type based on referrer and other factors
   */
  private getTransitionType(): NavigationEvent['transitionType'] {
    // This is a simplified implementation
    // In a real implementation, you would need more sophisticated detection
    
    if (!document.referrer) {
      return 'typed';
    }
    
    if (document.referrer.includes('google.com') || document.referrer.includes('bing.com')) {
      return 'keyword';
    }
    
    return 'link';
  }

  /**
   * Handle messages from background script
   */
  private async handleMessage(message: Message): Promise<any> {
    switch (message.type) {
      case 'capture-page':
        return this.capturePageState();
        
      case 'get-form-data':
        return Array.from(this.formDataCache.values());
        
      case 'get-scroll-position':
        return this.lastScrollPosition;
        
      case 'ping':
        return { success: true, url: window.location.href };
        
      default:
        console.warn('Unknown message type:', message.type);
        return { error: 'Unknown message type' };
    }
  }

  /**
   * Send message to background script
   */
  private async sendMessage(type: string, payload?: any): Promise<void> {
    try {
      await messaging.sendMessage({ type, payload });
    } catch (error) {
      console.error('Failed to send message to background:', error);
    }
  }

  /**
   * Cleanup when content script is removed
   */
  public cleanup(): void {
    this.observerInstances.forEach(observer => {
      if (observer instanceof MutationObserver) {
        observer.disconnect();
      } else if (observer instanceof IntersectionObserver) {
        observer.disconnect();
      }
    });
    
    this.observerInstances = [];
    this.formDataCache.clear();
  }
}

// Initialize content script
new ContentScript();

// Handle page unload cleanup
window.addEventListener('beforeunload', () => {
  // Any final cleanup can go here
});