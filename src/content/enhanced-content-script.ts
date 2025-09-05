/**
 * Enhanced content script for TabKiller extension
 * Advanced page tracking with comprehensive interaction monitoring and event batching
 */

import { messaging } from '../utils/cross-browser';
import {
  Message,
  PageCapture,
  PageMetadata,
  FormData,
  FormField,
  LinkInfo,
  NavigationEvent,
  BrowsingEvent,
  EventType
} from '../shared/types';

interface InteractionEvent {
  type: 'scroll' | 'click' | 'form' | 'focus' | 'selection' | 'keypress';
  target: string;
  timestamp: number;
  data: any;
}

interface PageMetrics {
  loadTime: number;
  renderTime: number;
  interactionCount: number;
  scrollDepth: number;
  timeOnPage: number;
  focusTime: number;
  idleTime: number;
  readingSpeed: number;
  engagementScore: number;
}

interface ViewportInfo {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  documentHeight: number;
  visibleAreaRatio: number;
}

class EnhancedContentScript {
  private isInitialized = false;
  private pageLoadTime = Date.now();
  private lastActivityTime = Date.now();
  private lastScrollPosition = { x: 0, y: 0 };
  private formDataCache = new Map<HTMLFormElement, FormData>();
  private observerInstances: (MutationObserver | IntersectionObserver | ResizeObserver)[] = [];
  
  // Enhanced tracking
  private interactions: InteractionEvent[] = [];
  private pageMetrics: PageMetrics;
  private viewportInfo: ViewportInfo;
  private eventQueue: BrowsingEvent[] = [];
  private batchTimer?: NodeJS.Timeout;
  private isPageVisible = !document.hidden;
  private focusStartTime = Date.now();
  
  // Reading analysis
  private textNodes: Text[] = [];
  private readingProgress = 0;
  private visibleTextLength = 0;
  
  // Performance monitoring
  private performanceObserver?: PerformanceObserver;

  constructor() {
    this.pageMetrics = {
      loadTime: 0,
      renderTime: 0,
      interactionCount: 0,
      scrollDepth: 0,
      timeOnPage: 0,
      focusTime: 0,
      idleTime: 0,
      readingSpeed: 0,
      engagementScore: 0
    };
    
    this.viewportInfo = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      documentHeight: document.documentElement.scrollHeight,
      visibleAreaRatio: 0
    };
    
    this.initialize();
  }

  /**
   * Initialize the enhanced content script
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('TabKiller enhanced content script initializing on:', window.location.href);

      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setupAdvancedTracking());
      } else {
        this.setupAdvancedTracking();
      }

      // Set up message listener
      messaging.onMessage.addListener(this.handleMessage.bind(this));
      
      // Set up event batching
      this.setupEventBatching();
      
      // Set up performance monitoring
      this.setupPerformanceMonitoring();

      this.isInitialized = true;
      console.log('TabKiller enhanced content script initialized successfully');
    } catch (error) {
      console.error('Failed to initialize TabKiller enhanced content script:', error);
    }
  }

  /**
   * Set up advanced page tracking
   */
  private setupAdvancedTracking(): void {
    // Basic tracking
    this.trackPageLoad();
    this.setupFormTracking();
    this.setupScrollTracking();
    this.setupLinkTracking();
    this.setupVisibilityTracking();
    this.setupMutationObserver();
    
    // Enhanced tracking
    this.setupClickTracking();
    this.setupFocusTracking();
    this.setupSelectionTracking();
    this.setupKeyboardTracking();
    this.setupReadingAnalysis();
    this.setupViewportTracking();
    this.setupEngagementTracking();
    this.setupIdleDetection();
    
    // Calculate initial metrics
    this.calculateInitialMetrics();
  }

  /**
   * Track page load with enhanced metrics
   */
  private trackPageLoad(): void {
    const navigationTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    if (navigationTiming) {
      this.pageMetrics.loadTime = navigationTiming.loadEventEnd - navigationTiming.navigationStart;
      this.pageMetrics.renderTime = navigationTiming.domContentLoadedEventEnd - navigationTiming.navigationStart;
    }

    const navigationEvent: NavigationEvent = {
      tabId: 0, // Will be set by background script
      url: window.location.href,
      referrer: document.referrer,
      timestamp: this.pageLoadTime,
      transitionType: this.getTransitionType()
    };

    this.queueEvent('page_loaded', {
      navigationEvent,
      loadTime: this.pageMetrics.loadTime,
      renderTime: this.pageMetrics.renderTime,
      documentHeight: this.viewportInfo.documentHeight,
      viewportSize: {
        width: this.viewportInfo.width,
        height: this.viewportInfo.height
      }
    });
  }

  /**
   * Enhanced form tracking with privacy awareness
   */
  private setupFormTracking(): void {
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
      this.trackForm(form);
      
      // Enhanced form events
      form.addEventListener('submit', (event) => {
        this.handleFormSubmit(form, event);
      });

      form.addEventListener('input', (event) => {
        this.handleFormInput(form, event);
      });

      form.addEventListener('focusin', () => {
        this.handleFormFocus(form);
      });

      // Track form abandonment
      form.addEventListener('focusout', () => {
        this.handleFormBlur(form);
      });
    });
  }

  /**
   * Enhanced form input handling
   */
  private handleFormInput(form: HTMLFormElement, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    
    // Skip sensitive fields
    if (this.isSensitiveField(target)) {
      return;
    }

    this.recordInteraction('form', target.tagName.toLowerCase(), {
      formId: form.id || form.name || 'anonymous',
      fieldName: target.name || target.id,
      fieldType: target.type || 'text',
      valueLength: target.value.length,
      hasValue: target.value.length > 0
    });
    
    this.updateFormData(form);
  }

  /**
   * Enhanced scroll tracking with reading analysis
   */
  private setupScrollTracking(): void {
    let scrollTimeout: NodeJS.Timeout;
    let scrollStart = Date.now();
    let scrollDistance = 0;

    const handleScroll = () => {
      const currentTime = Date.now();
      const currentPosition = { x: window.scrollX, y: window.scrollY };
      
      // Calculate scroll distance
      const deltaY = Math.abs(currentPosition.y - this.lastScrollPosition.y);
      const deltaX = Math.abs(currentPosition.x - this.lastScrollPosition.x);
      scrollDistance += Math.sqrt(deltaY * deltaY + deltaX * deltaX);
      
      // Update scroll depth
      const scrollPercentage = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
      this.pageMetrics.scrollDepth = Math.max(this.pageMetrics.scrollDepth, scrollPercentage);
      
      // Update viewport info
      this.viewportInfo.scrollX = currentPosition.x;
      this.viewportInfo.scrollY = currentPosition.y;
      
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const scrollDuration = currentTime - scrollStart;
        const scrollSpeed = scrollDistance / Math.max(scrollDuration, 1);
        
        this.recordInteraction('scroll', 'window', {
          position: currentPosition,
          distance: scrollDistance,
          duration: scrollDuration,
          speed: scrollSpeed,
          depth: this.pageMetrics.scrollDepth
        });
        
        // Update reading analysis
        this.updateReadingProgress();
        
        // Reset for next scroll session
        scrollDistance = 0;
        scrollStart = Date.now();
      }, 200); // Debounce scroll events
      
      this.lastScrollPosition = currentPosition;
      this.lastActivityTime = currentTime;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  /**
   * Enhanced click tracking with element analysis
   */
  private setupClickTracking(): void {
    document.addEventListener('click', (event) => {
      const target = event.target as Element;
      const elementInfo = this.analyzeElement(target);
      
      this.recordInteraction('click', elementInfo.type, {
        element: elementInfo,
        position: { x: event.clientX, y: event.clientY },
        modifiers: {
          ctrl: event.ctrlKey,
          alt: event.altKey,
          shift: event.shiftKey,
          meta: event.metaKey
        },
        timestamp: Date.now()
      });
      
      // Track link clicks separately
      if (target.tagName === 'A') {
        this.handleLinkClick(target as HTMLAnchorElement, event);
      }
    });
  }

  /**
   * Focus tracking for attention analysis
   */
  private setupFocusTracking(): void {
    let focusedElement: Element | null = null;
    let focusStartTime = Date.now();

    document.addEventListener('focusin', (event) => {
      if (focusedElement) {
        // Record time spent on previous element
        const focusTime = Date.now() - focusStartTime;
        this.recordElementFocus(focusedElement, focusTime);
      }
      
      focusedElement = event.target as Element;
      focusStartTime = Date.now();
      
      this.recordInteraction('focus', focusedElement.tagName.toLowerCase(), {
        element: this.analyzeElement(focusedElement),
        timestamp: focusStartTime
      });
    });

    document.addEventListener('focusout', (event) => {
      if (focusedElement) {
        const focusTime = Date.now() - focusStartTime;
        this.recordElementFocus(focusedElement, focusTime);
        focusedElement = null;
      }
    });
  }

  /**
   * Text selection tracking for reading analysis
   */
  private setupSelectionTracking(): void {
    document.addEventListener('selectionchange', () => {
      const selection = window.getSelection();
      
      if (selection && selection.toString().length > 0) {
        const selectedText = selection.toString().trim();
        
        if (selectedText.length >= 10) { // Only track meaningful selections
          this.recordInteraction('selection', 'text', {
            length: selectedText.length,
            wordCount: selectedText.split(/\s+/).length,
            hasUrl: /https?:\/\/\S+/i.test(selectedText),
            hasEmail: /@\S+\.\S+/.test(selectedText)
          });
        }
      }
    });
  }

  /**
   * Keyboard interaction tracking
   */
  private setupKeyboardTracking(): void {
    let keypressCount = 0;
    let keySequence: string[] = [];
    
    document.addEventListener('keydown', (event) => {
      keypressCount++;
      keySequence.push(event.key);
      
      // Keep only recent keys
      if (keySequence.length > 10) {
        keySequence.shift();
      }
      
      // Track significant keyboard shortcuts
      if (event.ctrlKey || event.metaKey) {
        this.recordInteraction('keypress', 'shortcut', {
          key: event.key,
          shortcut: `${event.ctrlKey ? 'Ctrl+' : ''}${event.metaKey ? 'Meta+' : ''}${event.key}`,
          timestamp: Date.now()
        });
      }
    });
    
    // Batch keyboard activity every 10 seconds
    setInterval(() => {
      if (keypressCount > 0) {
        this.recordInteraction('keypress', 'batch', {
          count: keypressCount,
          duration: 10000,
          rate: keypressCount / 10
        });
        keypressCount = 0;
      }
    }, 10000);
  }

  /**
   * Reading analysis and text comprehension tracking
   */
  private setupReadingAnalysis(): void {
    // Find all text nodes
    this.findTextNodes();
    
    // Calculate initial visible text
    this.updateVisibleText();
    
    // Set up intersection observer for text visibility
    this.setupTextVisibilityTracking();
  }

  /**
   * Find all text nodes in the document
   */
  private findTextNodes(): void {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const text = node.textContent?.trim();
          if (text && text.length > 10 && !this.isInHiddenElement(node.parentElement)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    this.textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      this.textNodes.push(node as Text);
    }
  }

  /**
   * Set up text visibility tracking for reading analysis
   */
  private setupTextVisibilityTracking(): void {
    const textElements = new Set<Element>();
    
    // Get parent elements of text nodes
    this.textNodes.forEach(textNode => {
      const parent = textNode.parentElement;
      if (parent) {
        textElements.add(parent);
      }
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
          // Element is significantly visible
          this.updateReadingProgress();
        }
      });
    }, {
      threshold: [0.1, 0.5, 0.9]
    });

    textElements.forEach(element => {
      observer.observe(element);
    });

    this.observerInstances.push(observer);
  }

  /**
   * Update reading progress based on visible text
   */
  private updateReadingProgress(): void {
    let visibleTextLength = 0;
    
    this.textNodes.forEach(textNode => {
      const element = textNode.parentElement;
      if (element && this.isElementVisible(element)) {
        visibleTextLength += textNode.textContent?.length || 0;
      }
    });

    if (visibleTextLength > this.visibleTextLength) {
      const newTextRead = visibleTextLength - this.visibleTextLength;
      const timeSpent = Date.now() - this.lastActivityTime;
      
      if (timeSpent > 0 && newTextRead > 0) {
        const readingSpeed = (newTextRead / timeSpent) * 60000; // chars per minute
        this.pageMetrics.readingSpeed = readingSpeed;
      }
      
      this.visibleTextLength = visibleTextLength;
      this.readingProgress = this.visibleTextLength / this.getTotalTextLength();
    }
  }

  /**
   * Viewport and responsive design tracking
   */
  private setupViewportTracking(): void {
    const updateViewportInfo = () => {
      this.viewportInfo = {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        documentHeight: document.documentElement.scrollHeight,
        visibleAreaRatio: (window.innerHeight * window.innerWidth) / 
          (document.documentElement.scrollHeight * document.documentElement.scrollWidth)
      };
    };

    const resizeObserver = new ResizeObserver(() => {
      updateViewportInfo();
      
      this.queueEvent('viewport_changed', {
        viewport: this.viewportInfo,
        timestamp: Date.now()
      });
    });

    resizeObserver.observe(document.documentElement);
    this.observerInstances.push(resizeObserver);
    
    // Track orientation changes
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        updateViewportInfo();
        this.queueEvent('orientation_changed', {
          orientation: screen.orientation?.angle || 0,
          viewport: this.viewportInfo
        });
      }, 100);
    });
  }

  /**
   * Engagement tracking and scoring
   */
  private setupEngagementTracking(): void {
    setInterval(() => {
      this.calculateEngagementScore();
    }, 30000); // Update every 30 seconds
  }

  /**
   * Idle detection for accurate time tracking
   */
  private setupIdleDetection(): void {
    let idleTimer: NodeJS.Timeout;
    const idleThreshold = 30000; // 30 seconds
    
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      
      // If was idle, record idle time
      if (this.pageMetrics.idleTime > 0) {
        const idleEnd = Date.now();
        this.recordInteraction('focus', 'resumed', {
          idleDuration: idleEnd - this.lastActivityTime,
          timestamp: idleEnd
        });
      }
      
      this.lastActivityTime = Date.now();
      
      idleTimer = setTimeout(() => {
        // User is idle
        this.recordInteraction('focus', 'idle', {
          timestamp: Date.now(),
          threshold: idleThreshold
        });
      }, idleThreshold);
    };

    // Reset idle timer on any activity
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
      document.addEventListener(event, resetIdleTimer, { passive: true });
    });
    
    resetIdleTimer(); // Start the timer
  }

  /**
   * Performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    if ('PerformanceObserver' in window) {
      this.performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'largest-contentful-paint') {
            this.queueEvent('performance_metric', {
              type: 'LCP',
              value: entry.startTime,
              timestamp: Date.now()
            });
          } else if (entry.entryType === 'first-input') {
            this.queueEvent('performance_metric', {
              type: 'FID',
              value: entry.processingStart - entry.startTime,
              timestamp: Date.now()
            });
          } else if (entry.entryType === 'layout-shift') {
            this.queueEvent('performance_metric', {
              type: 'CLS',
              value: entry.value,
              timestamp: Date.now()
            });
          }
        }
      });

      try {
        this.performanceObserver.observe({ 
          entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] 
        });
      } catch (error) {
        console.warn('Performance observer failed:', error);
      }
    }
  }

  /**
   * Event batching system
   */
  private setupEventBatching(): void {
    // Batch events every 10 seconds
    this.batchTimer = setInterval(() => {
      this.flushEventQueue();
    }, 10000);
  }

  /**
   * Queue event for batching
   */
  private queueEvent(type: EventType, data: any): void {
    const event: BrowsingEvent = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      type,
      sessionId: 'unknown', // Will be set by background
      url: window.location.href,
      title: document.title,
      metadata: data
    };

    this.eventQueue.push(event);
    
    // Flush immediately if queue is full
    if (this.eventQueue.length >= 50) {
      this.flushEventQueue();
    }
  }

  /**
   * Flush event queue to background script
   */
  private async flushEventQueue(): void {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      await this.sendMessage('event-batch', { events });
    } catch (error) {
      console.error('Failed to send event batch:', error);
      // Return events to queue for retry
      this.eventQueue.unshift(...events);
    }
  }

  /**
   * Record interaction event
   */
  private recordInteraction(type: InteractionEvent['type'], target: string, data: any): void {
    const interaction: InteractionEvent = {
      type,
      target,
      timestamp: Date.now(),
      data
    };

    this.interactions.push(interaction);
    this.pageMetrics.interactionCount++;
    
    // Keep only recent interactions
    if (this.interactions.length > 1000) {
      this.interactions = this.interactions.slice(-500);
    }

    // Queue as browsing event
    this.queueEvent(`${type}_event` as EventType, {
      interaction,
      metrics: this.getBasicMetrics()
    });
  }

  /**
   * Enhanced visibility tracking
   */
  private setupVisibilityTracking(): void {
    document.addEventListener('visibilitychange', () => {
      const isVisible = !document.hidden;
      const timestamp = Date.now();
      
      if (this.isPageVisible !== isVisible) {
        if (isVisible) {
          // Page became visible
          this.focusStartTime = timestamp;
          this.queueEvent('page_focus', {
            timestamp,
            hiddenDuration: timestamp - this.lastActivityTime
          });
        } else {
          // Page became hidden
          const focusTime = timestamp - this.focusStartTime;
          this.pageMetrics.focusTime += focusTime;
          
          this.queueEvent('page_blur', {
            timestamp,
            focusTime,
            totalFocusTime: this.pageMetrics.focusTime
          });
        }
        
        this.isPageVisible = isVisible;
      }
    });

    // Track when page is about to unload
    window.addEventListener('beforeunload', () => {
      this.calculateFinalMetrics();
      
      this.queueEvent('page_unload', {
        timeOnPage: Date.now() - this.pageLoadTime,
        metrics: this.pageMetrics,
        interactions: this.interactions.length,
        scrollDepth: this.pageMetrics.scrollDepth,
        readingProgress: this.readingProgress,
        engagementScore: this.pageMetrics.engagementScore
      });
      
      // Immediate flush on unload
      this.flushEventQueue();
    });
  }

  /**
   * Calculate initial page metrics
   */
  private calculateInitialMetrics(): void {
    this.pageMetrics.timeOnPage = Date.now() - this.pageLoadTime;
    this.viewportInfo.documentHeight = document.documentElement.scrollHeight;
    this.viewportInfo.visibleAreaRatio = (window.innerHeight * window.innerWidth) / 
      (document.documentElement.scrollHeight * document.documentElement.scrollWidth);
  }

  /**
   * Calculate engagement score based on various factors
   */
  private calculateEngagementScore(): void {
    const timeOnPage = Date.now() - this.pageLoadTime;
    const timeScore = Math.min(timeOnPage / 300000, 1); // Up to 5 minutes
    const scrollScore = this.pageMetrics.scrollDepth;
    const interactionScore = Math.min(this.pageMetrics.interactionCount / 10, 1);
    const readingScore = this.readingProgress;
    const focusScore = this.pageMetrics.focusTime / timeOnPage;
    
    this.pageMetrics.engagementScore = (
      timeScore * 0.2 +
      scrollScore * 0.2 +
      interactionScore * 0.2 +
      readingScore * 0.2 +
      focusScore * 0.2
    ) * 100;
  }

  /**
   * Calculate final metrics before page unload
   */
  private calculateFinalMetrics(): void {
    const now = Date.now();
    this.pageMetrics.timeOnPage = now - this.pageLoadTime;
    
    if (this.isPageVisible) {
      this.pageMetrics.focusTime += now - this.focusStartTime;
    }
    
    this.calculateEngagementScore();
  }

  /**
   * Utility methods
   */
  private analyzeElement(element: Element): any {
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || undefined,
      className: element.className || undefined,
      type: (element as any).type || undefined,
      href: (element as HTMLAnchorElement).href || undefined,
      text: element.textContent?.substring(0, 100) || undefined,
      attributes: this.getRelevantAttributes(element)
    };
  }

  private getRelevantAttributes(element: Element): Record<string, string> {
    const relevantAttrs = ['data-track', 'data-analytics', 'role', 'aria-label'];
    const attrs: Record<string, string> = {};
    
    relevantAttrs.forEach(attr => {
      const value = element.getAttribute(attr);
      if (value) {
        attrs[attr] = value;
      }
    });
    
    return attrs;
  }

  private recordElementFocus(element: Element, focusTime: number): void {
    if (focusTime > 1000) { // Only record significant focus times
      this.queueEvent('element_focus', {
        element: this.analyzeElement(element),
        focusTime,
        timestamp: Date.now()
      });
    }
  }

  private isElementVisible(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.left >= 0 && 
           rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
  }

  private isInHiddenElement(element: Element | null): boolean {
    while (element) {
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return true;
      }
      element = element.parentElement;
    }
    return false;
  }

  private getTotalTextLength(): number {
    return this.textNodes.reduce((total, node) => total + (node.textContent?.length || 0), 0);
  }

  private getBasicMetrics() {
    return {
      timeOnPage: Date.now() - this.pageLoadTime,
      interactionCount: this.pageMetrics.interactionCount,
      scrollDepth: this.pageMetrics.scrollDepth,
      viewportInfo: this.viewportInfo
    };
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  // ... (keep existing methods from original content script)
  
  /**
   * Enhanced message handling
   */
  private async handleMessage(message: Message): Promise<any> {
    switch (message.type) {
      case 'capture-page':
        return this.capturePageState();
        
      case 'get-form-data':
        return Array.from(this.formDataCache.values());
        
      case 'get-scroll-position':
        return this.lastScrollPosition;
        
      case 'get-page-metrics':
        this.calculateFinalMetrics();
        return {
          metrics: this.pageMetrics,
          interactions: this.interactions.slice(-50), // Recent interactions
          viewport: this.viewportInfo,
          readingProgress: this.readingProgress
        };
        
      case 'ping':
        return { 
          success: true, 
          url: window.location.href,
          isActive: this.isPageVisible,
          timeOnPage: Date.now() - this.pageLoadTime
        };
        
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
   * Enhanced page state capture
   */
  private capturePageState(): PageCapture {
    this.calculateFinalMetrics();
    
    return {
      url: window.location.href,
      title: document.title,
      html: this.shouldCaptureHTML() ? document.documentElement.outerHTML : undefined,
      metadata: this.extractEnhancedPageMetadata(),
      capturedAt: Date.now()
    };
  }

  /**
   * Extract enhanced page metadata
   */
  private extractEnhancedPageMetadata(): PageMetadata {
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

    // Add enhanced metadata
    (metadata as any).enhanced = {
      metrics: this.pageMetrics,
      interactionCount: this.interactions.length,
      readingProgress: this.readingProgress,
      engagementScore: this.pageMetrics.engagementScore,
      viewportInfo: this.viewportInfo,
      performanceMetrics: this.getPerformanceMetrics()
    };

    return metadata;
  }

  /**
   * Get performance metrics
   */
  private getPerformanceMetrics() {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paint = performance.getEntriesByType('paint');
    
    return {
      loadTime: this.pageMetrics.loadTime,
      renderTime: this.pageMetrics.renderTime,
      firstPaint: paint.find(p => p.name === 'first-paint')?.startTime,
      firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime,
      domInteractive: navigation?.domInteractive,
      domComplete: navigation?.domComplete
    };
  }

  // Keep existing utility methods from original content script...
  private getTransitionType(): NavigationEvent['transitionType'] {
    if (!document.referrer) {
      return 'typed';
    }
    
    if (document.referrer.includes('google.com') || document.referrer.includes('bing.com')) {
      return 'keyword';
    }
    
    return 'link';
  }

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

  private extractFormFields(form: HTMLFormElement): FormField[] {
    const fields: FormField[] = [];
    const formElements = form.querySelectorAll('input, textarea, select');

    formElements.forEach(element => {
      const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      
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

  private handleFormSubmit(form: HTMLFormElement, event: SubmitEvent): void {
    const formData = this.formDataCache.get(form);
    if (!formData) return;

    this.updateFormData(form);

    this.queueEvent('form_interaction', {
      form: formData,
      action: 'submit',
      timestamp: Date.now(),
      url: window.location.href,
      submitter: event.submitter?.tagName || null
    });
  }

  private updateFormData(form: HTMLFormElement): void {
    const existingData = this.formDataCache.get(form);
    if (!existingData) return;

    existingData.fields = this.extractFormFields(form);
    this.formDataCache.set(form, existingData);
  }

  private handleFormFocus(form: HTMLFormElement): void {
    this.recordInteraction('form', 'focus', {
      formId: form.id || form.name || 'anonymous',
      timestamp: Date.now(),
      url: window.location.href
    });
  }

  private handleFormBlur(form: HTMLFormElement): void {
    this.recordInteraction('form', 'blur', {
      formId: form.id || form.name || 'anonymous',
      timestamp: Date.now(),
      url: window.location.href
    });
  }

  private handleLinkClick(link: HTMLAnchorElement, event: MouseEvent): void {
    const linkInfo: LinkInfo = {
      href: link.href,
      text: link.textContent?.trim() || '',
      title: link.title || undefined,
      rel: link.rel || undefined
    };

    this.queueEvent('click_event', {
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

  private setupMutationObserver(): void {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              
              const newForms = element.tagName === 'FORM' 
                ? [element as HTMLFormElement]
                : Array.from(element.querySelectorAll('form'));
                
              newForms.forEach(form => this.trackForm(form));

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

  private shouldCaptureHTML(): boolean {
    const sensitivePatterns = ['/login', '/password', '/payment', '/checkout', '/admin'];
    const url = window.location.href.toLowerCase();
    
    if (sensitivePatterns.some(pattern => url.includes(pattern))) {
      return false;
    }

    const htmlSize = document.documentElement.outerHTML.length;
    return htmlSize < 1024 * 1024; // 1MB limit
  }

  private getMetaContent(name: string): string | undefined {
    const meta = document.querySelector(`meta[name="${name}"], meta[property="og:${name}"]`);
    return meta?.getAttribute('content') || undefined;
  }

  /**
   * Cleanup when content script is removed
   */
  public cleanup(): void {
    // Clear timers
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
    
    // Flush remaining events
    this.flushEventQueue();
    
    // Disconnect observers
    this.observerInstances.forEach(observer => {
      observer.disconnect();
    });
    
    // Disconnect performance observer
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
    
    this.observerInstances = [];
    this.formDataCache.clear();
    this.interactions = [];
    this.textNodes = [];
  }
}

// Initialize enhanced content script
new EnhancedContentScript();

// Handle page unload cleanup
window.addEventListener('beforeunload', () => {
  // Final cleanup is handled in the class
});