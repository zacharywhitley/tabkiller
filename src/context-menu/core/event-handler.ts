/**
 * Context Menu Event Handler
 * Provides comprehensive event handling for context menu interactions
 * with performance monitoring and error recovery
 */

import {
  MenuClickInfo,
  MenuTab,
  ContextMenuEventHandlers,
  ContextMenuError,
  ContextMenuConfig
} from './types';
import { getCurrentBrowserType } from '../../browser';

/**
 * Event handler registration info
 */
interface EventHandlerRegistration {
  id: string;
  handler: Function;
  priority: number;
  enabled: boolean;
  lastExecution?: number;
  executionCount: number;
  errorCount: number;
}

/**
 * Event performance metrics
 */
interface EventMetrics {
  totalEvents: number;
  averageExecutionTime: number;
  maxExecutionTime: number;
  minExecutionTime: number;
  errorRate: number;
  lastEventTime?: number;
}

/**
 * Context Menu Event Handler System
 */
export class ContextMenuEventHandler {
  private config: ContextMenuConfig;
  private clickHandlers: Map<string, EventHandlerRegistration> = new Map();
  private globalHandlers: ContextMenuEventHandlers = {};
  private metrics: EventMetrics;
  private eventQueue: Array<{
    type: string;
    data: any;
    timestamp: number;
    processed: boolean;
  }> = [];

  constructor(config: ContextMenuConfig = {}) {
    this.config = config;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Register a click handler for a specific menu item
   */
  registerClickHandler(
    menuItemId: string,
    handler: (info: MenuClickInfo, tab?: MenuTab) => void | Promise<void>,
    options: {
      priority?: number;
      enabled?: boolean;
    } = {}
  ): string {
    const registration: EventHandlerRegistration = {
      id: menuItemId,
      handler,
      priority: options.priority || 0,
      enabled: options.enabled !== false,
      executionCount: 0,
      errorCount: 0
    };

    this.clickHandlers.set(menuItemId, registration);

    if (this.config.debug) {
      console.log(`[ContextMenuEventHandler] Registered click handler for: ${menuItemId}`);
    }

    return menuItemId;
  }

  /**
   * Unregister a click handler
   */
  unregisterClickHandler(menuItemId: string): boolean {
    const removed = this.clickHandlers.delete(menuItemId);

    if (this.config.debug && removed) {
      console.log(`[ContextMenuEventHandler] Unregistered click handler for: ${menuItemId}`);
    }

    return removed;
  }

  /**
   * Set global event handlers
   */
  setGlobalHandlers(handlers: ContextMenuEventHandlers): void {
    this.globalHandlers = { ...this.globalHandlers, ...handlers };

    if (this.config.debug) {
      console.log('[ContextMenuEventHandler] Global handlers updated:', Object.keys(handlers));
    }
  }

  /**
   * Handle a menu click event
   */
  async handleMenuClick(info: MenuClickInfo, tab?: MenuTab): Promise<void> {
    const startTime = performance.now();
    const menuItemId = String(info.menuItemId);

    // Add to event queue for debugging
    this.eventQueue.push({
      type: 'click',
      data: { info, tab },
      timestamp: Date.now(),
      processed: false
    });

    // Limit queue size
    if (this.eventQueue.length > 100) {
      this.eventQueue = this.eventQueue.slice(-50);
    }

    try {
      // Execute specific handler if registered
      const registration = this.clickHandlers.get(menuItemId);
      if (registration && registration.enabled) {
        await this.executeHandler(registration, info, tab);
      }

      // Execute global handler
      if (this.globalHandlers.onMenuClick) {
        await this.executeGlobalHandler(this.globalHandlers.onMenuClick, info, tab);
      }

      // Update metrics
      const executionTime = performance.now() - startTime;
      this.updateMetrics(executionTime);

      // Mark event as processed
      const lastEvent = this.eventQueue[this.eventQueue.length - 1];
      if (lastEvent) {
        lastEvent.processed = true;
      }

      if (this.config.performance?.enableTiming && 
          executionTime > (this.config.performance.maxCreationTime || 1)) {
        console.warn(`[ContextMenuEventHandler] Click handler took ${executionTime.toFixed(2)}ms`);
      }

    } catch (error) {
      await this.handleEventError(error, 'click', { menuItemId, info, tab });
    }
  }

  /**
   * Handle menu creation events
   */
  handleMenuCreated(menuItemId: string): void {
    try {
      if (this.globalHandlers.onMenuCreated) {
        this.globalHandlers.onMenuCreated(menuItemId);
      }

      if (this.config.enableLogging) {
        console.log(`[ContextMenuEventHandler] Menu created: ${menuItemId}`);
      }
    } catch (error) {
      this.handleEventError(error, 'created', { menuItemId }).catch(console.error);
    }
  }

  /**
   * Handle menu removal events
   */
  handleMenuRemoved(menuItemId: string): void {
    try {
      // Clean up handler registration
      this.clickHandlers.delete(menuItemId);

      if (this.globalHandlers.onMenuRemoved) {
        this.globalHandlers.onMenuRemoved(menuItemId);
      }

      if (this.config.enableLogging) {
        console.log(`[ContextMenuEventHandler] Menu removed: ${menuItemId}`);
      }
    } catch (error) {
      this.handleEventError(error, 'removed', { menuItemId }).catch(console.error);
    }
  }

  /**
   * Get event performance metrics
   */
  getMetrics(): EventMetrics & { handlerCount: number } {
    return {
      ...this.metrics,
      handlerCount: this.clickHandlers.size
    };
  }

  /**
   * Get recent events for debugging
   */
  getRecentEvents(limit = 10): Array<{
    type: string;
    data: any;
    timestamp: number;
    processed: boolean;
  }> {
    return this.eventQueue.slice(-limit);
  }

  /**
   * Get handler information
   */
  getHandlerInfo(): Array<{
    menuItemId: string;
    enabled: boolean;
    executionCount: number;
    errorCount: number;
    lastExecution?: number;
    errorRate: number;
  }> {
    return Array.from(this.clickHandlers.entries()).map(([id, registration]) => ({
      menuItemId: id,
      enabled: registration.enabled,
      executionCount: registration.executionCount,
      errorCount: registration.errorCount,
      lastExecution: registration.lastExecution,
      errorRate: registration.executionCount > 0 ? 
        registration.errorCount / registration.executionCount : 0
    }));
  }

  /**
   * Enable or disable a specific handler
   */
  setHandlerEnabled(menuItemId: string, enabled: boolean): boolean {
    const registration = this.clickHandlers.get(menuItemId);
    if (registration) {
      registration.enabled = enabled;
      
      if (this.config.debug) {
        console.log(`[ContextMenuEventHandler] Handler ${menuItemId} ${enabled ? 'enabled' : 'disabled'}`);
      }
      
      return true;
    }
    return false;
  }

  /**
   * Clear all handlers and reset metrics
   */
  clear(): void {
    this.clickHandlers.clear();
    this.globalHandlers = {};
    this.metrics = this.initializeMetrics();
    this.eventQueue = [];

    if (this.config.debug) {
      console.log('[ContextMenuEventHandler] All handlers cleared');
    }
  }

  /**
   * Execute a registered handler with error handling
   */
  private async executeHandler(
    registration: EventHandlerRegistration,
    info: MenuClickInfo,
    tab?: MenuTab
  ): Promise<void> {
    const startTime = performance.now();

    try {
      await registration.handler(info, tab);
      
      registration.executionCount++;
      registration.lastExecution = Date.now();

      if (this.config.debug) {
        const duration = performance.now() - startTime;
        console.log(`[ContextMenuEventHandler] Handler ${registration.id} executed in ${duration.toFixed(2)}ms`);
      }
    } catch (error) {
      registration.errorCount++;
      throw error;
    }
  }

  /**
   * Execute a global handler with error handling
   */
  private async executeGlobalHandler(
    handler: (info: MenuClickInfo, tab?: MenuTab) => void | Promise<void>,
    info: MenuClickInfo,
    tab?: MenuTab
  ): Promise<void> {
    try {
      await handler(info, tab);
    } catch (error) {
      if (this.config.enableLogging) {
        console.error('[ContextMenuEventHandler] Global handler error:', error);
      }
      throw error;
    }
  }

  /**
   * Handle event execution errors
   */
  private async handleEventError(error: any, eventType: string, context: any): Promise<void> {
    const contextMenuError = new ContextMenuError(
      'API_ERROR',
      `Event handler error (${eventType}): ${error.message}`,
      getCurrentBrowserType(),
      context.menuItemId
    );

    // Update metrics
    this.metrics.errorRate = this.metrics.totalEvents > 0 ? 
      (this.metrics.errorRate * this.metrics.totalEvents + 1) / (this.metrics.totalEvents + 1) : 1;

    if (this.globalHandlers.onError) {
      try {
        this.globalHandlers.onError(contextMenuError);
      } catch (handlerError) {
        console.error('[ContextMenuEventHandler] Error in error handler:', handlerError);
      }
    } else {
      console.error('[ContextMenuEventHandler] Unhandled event error:', contextMenuError);
    }

    // Log detailed error information in debug mode
    if (this.config.debug) {
      console.error('[ContextMenuEventHandler] Event error details:', {
        error: contextMenuError,
        eventType,
        context,
        stack: error.stack
      });
    }
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(executionTime: number): void {
    this.metrics.totalEvents++;
    this.metrics.lastEventTime = Date.now();

    // Update execution time metrics
    if (this.metrics.totalEvents === 1) {
      this.metrics.averageExecutionTime = executionTime;
      this.metrics.maxExecutionTime = executionTime;
      this.metrics.minExecutionTime = executionTime;
    } else {
      this.metrics.averageExecutionTime = 
        (this.metrics.averageExecutionTime * (this.metrics.totalEvents - 1) + executionTime) / 
        this.metrics.totalEvents;
      
      this.metrics.maxExecutionTime = Math.max(this.metrics.maxExecutionTime, executionTime);
      this.metrics.minExecutionTime = Math.min(this.metrics.minExecutionTime, executionTime);
    }
  }

  /**
   * Initialize metrics object
   */
  private initializeMetrics(): EventMetrics {
    return {
      totalEvents: 0,
      averageExecutionTime: 0,
      maxExecutionTime: 0,
      minExecutionTime: 0,
      errorRate: 0
    };
  }
}

/**
 * Create a context menu event handler
 */
export function createContextMenuEventHandler(config?: ContextMenuConfig): ContextMenuEventHandler {
  return new ContextMenuEventHandler(config);
}