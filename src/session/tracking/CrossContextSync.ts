/**
 * Cross Context Sync - Data synchronization between extension contexts
 * Handles synchronization between background, popup, content scripts, and options pages
 */

import { TabEvent, BrowsingEvent } from '../../shared/types';
import { getBrowserAPI } from '../../utils/cross-browser';

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface SyncMessage {
  type: SyncMessageType;
  contextId: string;
  timestamp: number;
  payload: any;
  requestId?: string;
  priority: SyncPriority;
}

export type SyncMessageType = 
  | 'sync_tab_event'
  | 'sync_navigation_update'
  | 'sync_state_change'
  | 'sync_request'
  | 'sync_response'
  | 'sync_heartbeat'
  | 'sync_bulk_update'
  | 'sync_conflict_resolution';

export type SyncPriority = 'low' | 'medium' | 'high' | 'critical';

export type ExtensionContext = 
  | 'background'
  | 'popup'
  | 'options'
  | 'content_script'
  | 'devtools'
  | 'sidebar';

export interface SyncState {
  lastSyncTimestamp: number;
  conflictCount: number;
  pendingSyncs: number;
  failedSyncs: number;
  totalSyncs: number;
  averageLatency: number;
  contextStatus: Map<string, ContextStatus>;
}

export interface ContextStatus {
  contextId: string;
  contextType: ExtensionContext;
  lastSeen: number;
  isActive: boolean;
  syncVersion: number;
  latency: number;
}

export interface SyncConflict {
  conflictId: string;
  timestamp: number;
  dataType: string;
  localVersion: any;
  remoteVersion: any;
  resolution?: 'local' | 'remote' | 'merge' | 'manual';
}

export interface CrossContextSyncConfig {
  enabled: boolean;
  realTimeSync: boolean;
  syncInterval?: number;
  maxRetries?: number;
  conflictResolution?: 'local_wins' | 'remote_wins' | 'timestamp_wins' | 'manual';
  enableCompression?: boolean;
  maxMessageSize?: number;
  heartbeatInterval?: number;
}

// =============================================================================
// CROSS CONTEXT SYNC
// =============================================================================

export class CrossContextSync {
  private config: CrossContextSyncConfig;
  private browser = getBrowserAPI();
  private contextId: string;
  private contextType: ExtensionContext;
  
  private syncState: SyncState;
  private activeContexts = new Map<string, ContextStatus>();
  private pendingMessages = new Map<string, SyncMessage>();
  private conflictQueue = new Map<string, SyncConflict>();
  
  private isInitialized: boolean = false;
  private syncInterval?: number;
  private heartbeatInterval?: number;
  private messageHandlers = new Map<SyncMessageType, Array<(message: SyncMessage) => Promise<void>>>();
  
  private incomingSyncHandlers: Array<(data: any) => Promise<void>> = [];
  private syncErrorHandlers: Array<(error: Error) => void> = [];

  constructor(config: CrossContextSyncConfig) {
    this.config = {
      syncInterval: 5000, // 5 seconds
      maxRetries: 3,
      conflictResolution: 'timestamp_wins',
      enableCompression: false,
      maxMessageSize: 1024 * 1024, // 1MB
      heartbeatInterval: 30000, // 30 seconds
      ...config
    };

    // Generate unique context ID
    this.contextId = `${this.detectContextType()}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.contextType = this.detectContextType();

    // Initialize sync state
    this.syncState = {
      lastSyncTimestamp: 0,
      conflictCount: 0,
      pendingSyncs: 0,
      failedSyncs: 0,
      totalSyncs: 0,
      averageLatency: 0,
      contextStatus: new Map()
    };
  }

  /**
   * Initialize cross-context synchronization
   */
  async initialize(): Promise<void> {
    if (this.isInitialized || !this.config.enabled) return;

    try {
      console.log(`Initializing CrossContextSync for ${this.contextType} context...`);

      // Set up message listeners
      this.setupMessageListeners();

      // Register default message handlers
      this.registerDefaultHandlers();

      // Start heartbeat if enabled
      if (this.config.heartbeatInterval) {
        this.heartbeatInterval = window.setInterval(
          this.sendHeartbeat.bind(this),
          this.config.heartbeatInterval
        );
      }

      // Start periodic sync if enabled
      if (this.config.syncInterval && !this.config.realTimeSync) {
        this.syncInterval = window.setInterval(
          this.performPeriodicSync.bind(this),
          this.config.syncInterval
        );
      }

      // Send initial heartbeat to announce presence
      await this.sendHeartbeat();

      this.isInitialized = true;
      console.log('CrossContextSync initialized successfully');

    } catch (error) {
      console.error('Failed to initialize CrossContextSync:', error);
      throw error;
    }
  }

  /**
   * Detect the current extension context
   */
  private detectContextType(): ExtensionContext {
    // Check if we're in a background context
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getBackgroundPage) {
      try {
        if (chrome.runtime.getBackgroundPage() === window) {
          return 'background';
        }
      } catch {}
    }

    // Check if we're in a content script
    if (typeof window !== 'undefined' && window.location && 
        !window.location.href.startsWith('chrome-extension://') &&
        !window.location.href.startsWith('moz-extension://')) {
      return 'content_script';
    }

    // Check specific extension pages by URL
    if (typeof window !== 'undefined' && window.location) {
      const url = window.location.href;
      if (url.includes('/popup.html') || url.includes('/popup/')) {
        return 'popup';
      } else if (url.includes('/options.html') || url.includes('/options/')) {
        return 'options';
      } else if (url.includes('/sidebar.html') || url.includes('/sidebar/')) {
        return 'sidebar';
      } else if (url.includes('/devtools.html') || url.includes('/devtools/')) {
        return 'devtools';
      }
    }

    // Default to background if we can't determine
    return 'background';
  }

  /**
   * Set up message listeners for cross-context communication
   */
  private setupMessageListeners(): void {
    try {
      // Listen for runtime messages
      this.browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleIncomingMessage(message, sender).then(response => {
          if (response) {
            sendResponse(response);
          }
        }).catch(error => {
          console.error('Error handling sync message:', error);
          sendResponse({ error: error.message });
        });
        
        // Return true to indicate async response
        return true;
      });

      // Listen for storage changes (for fallback sync)
      if (this.browser.storage && this.browser.storage.onChanged) {
        this.browser.storage.onChanged.addListener((changes, namespace) => {
          if (namespace === 'local') {
            this.handleStorageChange(changes);
          }
        });
      }

    } catch (error) {
      console.error('Error setting up message listeners:', error);
    }
  }

  /**
   * Register default message handlers
   */
  private registerDefaultHandlers(): void {
    this.registerHandler('sync_tab_event', this.handleTabEventSync.bind(this));
    this.registerHandler('sync_navigation_update', this.handleNavigationUpdateSync.bind(this));
    this.registerHandler('sync_state_change', this.handleStateChangeSync.bind(this));
    this.registerHandler('sync_heartbeat', this.handleHeartbeat.bind(this));
    this.registerHandler('sync_request', this.handleSyncRequest.bind(this));
    this.registerHandler('sync_response', this.handleSyncResponse.bind(this));
    this.registerHandler('sync_bulk_update', this.handleBulkUpdateSync.bind(this));
    this.registerHandler('sync_conflict_resolution', this.handleConflictResolution.bind(this));
  }

  /**
   * Handle incoming messages
   */
  private async handleIncomingMessage(message: any, sender: chrome.runtime.MessageSender): Promise<any> {
    // Check if this is a sync message
    if (!this.isSyncMessage(message)) {
      return null;
    }

    const syncMessage = message as SyncMessage;

    // Ignore messages from self
    if (syncMessage.contextId === this.contextId) {
      return null;
    }

    try {
      // Update latency metrics
      const latency = Date.now() - syncMessage.timestamp;
      this.updateLatencyMetrics(syncMessage.contextId, latency);

      // Process message through handlers
      const handlers = this.messageHandlers.get(syncMessage.type) || [];
      for (const handler of handlers) {
        await handler(syncMessage);
      }

      // Update sync statistics
      this.syncState.totalSyncs++;
      this.syncState.lastSyncTimestamp = Date.now();

      return { success: true, contextId: this.contextId };

    } catch (error) {
      console.error(`Error processing sync message ${syncMessage.type}:`, error);
      this.syncState.failedSyncs++;
      this.notifySyncError(error as Error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Check if message is a sync message
   */
  private isSyncMessage(message: any): boolean {
    return message && 
           typeof message.type === 'string' &&
           message.type.startsWith('sync_') &&
           message.contextId &&
           message.timestamp;
  }

  /**
   * Handle storage changes (fallback sync mechanism)
   */
  private handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }): void {
    for (const [key, change] of Object.entries(changes)) {
      if (key.startsWith('sync_')) {
        // Process storage-based sync
        this.handleStorageSync(key, change.newValue, change.oldValue);
      }
    }
  }

  /**
   * Handle storage-based sync
   */
  private async handleStorageSync(key: string, newValue: any, oldValue: any): Promise<void> {
    try {
      if (newValue && newValue.contextId !== this.contextId) {
        // Process sync data from storage
        for (const handler of this.incomingSyncHandlers) {
          await handler(newValue);
        }
      }
    } catch (error) {
      console.error('Error handling storage sync:', error);
    }
  }

  /**
   * Update latency metrics
   */
  private updateLatencyMetrics(contextId: string, latency: number): void {
    const context = this.activeContexts.get(contextId);
    if (context) {
      context.latency = latency;
      context.lastSeen = Date.now();
    }

    // Update overall average latency
    const totalLatency = this.syncState.averageLatency * (this.syncState.totalSyncs || 1);
    this.syncState.averageLatency = (totalLatency + latency) / (this.syncState.totalSyncs + 1);
  }

  // =============================================================================
  // MESSAGE HANDLERS
  // =============================================================================

  /**
   * Handle tab event synchronization
   */
  private async handleTabEventSync(message: SyncMessage): Promise<void> {
    const tabEvent = message.payload as TabEvent;
    for (const handler of this.incomingSyncHandlers) {
      await handler({ type: 'tab_event', event: tabEvent });
    }
  }

  /**
   * Handle navigation update synchronization
   */
  private async handleNavigationUpdateSync(message: SyncMessage): Promise<void> {
    const navigationUpdate = message.payload;
    for (const handler of this.incomingSyncHandlers) {
      await handler({ type: 'navigation_update', update: navigationUpdate });
    }
  }

  /**
   * Handle state change synchronization
   */
  private async handleStateChangeSync(message: SyncMessage): Promise<void> {
    const stateChange = message.payload;
    for (const handler of this.incomingSyncHandlers) {
      await handler({ type: 'state_change', change: stateChange });
    }
  }

  /**
   * Handle heartbeat messages
   */
  private async handleHeartbeat(message: SyncMessage): Promise<void> {
    const heartbeatData = message.payload;
    
    // Update context status
    const contextStatus: ContextStatus = {
      contextId: message.contextId,
      contextType: heartbeatData.contextType || 'unknown',
      lastSeen: Date.now(),
      isActive: true,
      syncVersion: heartbeatData.syncVersion || 1,
      latency: Date.now() - message.timestamp
    };

    this.activeContexts.set(message.contextId, contextStatus);
  }

  /**
   * Handle sync requests
   */
  private async handleSyncRequest(message: SyncMessage): Promise<void> {
    const requestData = message.payload;
    
    // Respond with requested data
    if (message.requestId) {
      const response = await this.generateSyncResponse(requestData);
      await this.sendMessage('sync_response', response, 'high', message.requestId);
    }
  }

  /**
   * Handle sync responses
   */
  private async handleSyncResponse(message: SyncMessage): Promise<void> {
    const responseData = message.payload;
    
    if (message.requestId) {
      // Process response for pending request
      const pendingMessage = this.pendingMessages.get(message.requestId);
      if (pendingMessage) {
        this.pendingMessages.delete(message.requestId);
        // Process the response data
        for (const handler of this.incomingSyncHandlers) {
          await handler({ type: 'sync_response', data: responseData });
        }
      }
    }
  }

  /**
   * Handle bulk update synchronization
   */
  private async handleBulkUpdateSync(message: SyncMessage): Promise<void> {
    const bulkData = message.payload;
    
    // Process bulk updates
    if (Array.isArray(bulkData.updates)) {
      for (const update of bulkData.updates) {
        for (const handler of this.incomingSyncHandlers) {
          await handler(update);
        }
      }
    }
  }

  /**
   * Handle conflict resolution
   */
  private async handleConflictResolution(message: SyncMessage): Promise<void> {
    const resolution = message.payload;
    
    if (resolution.conflictId) {
      const conflict = this.conflictQueue.get(resolution.conflictId);
      if (conflict) {
        conflict.resolution = resolution.resolution;
        this.conflictQueue.delete(resolution.conflictId);
        
        // Apply resolution
        await this.applyConflictResolution(conflict);
      }
    }
  }

  // =============================================================================
  // PUBLIC SYNC METHODS
  // =============================================================================

  /**
   * Sync a tab event across contexts
   */
  async syncTabEvent(tabEvent: TabEvent): Promise<void> {
    if (!this.config.enabled || !this.config.realTimeSync) return;

    await this.sendMessage('sync_tab_event', tabEvent, 'high');
  }

  /**
   * Sync navigation update across contexts
   */
  async syncNavigationUpdate(update: any): Promise<void> {
    if (!this.config.enabled || !this.config.realTimeSync) return;

    await this.sendMessage('sync_navigation_update', update, 'medium');
  }

  /**
   * Sync state change across contexts
   */
  async syncStateChange(change: any): Promise<void> {
    if (!this.config.enabled || !this.config.realTimeSync) return;

    await this.sendMessage('sync_state_change', change, 'medium');
  }

  /**
   * Perform bulk synchronization
   */
  async syncBulkData(updates: any[]): Promise<void> {
    if (!this.config.enabled) return;

    const bulkData = {
      updates,
      timestamp: Date.now(),
      contextId: this.contextId
    };

    await this.sendMessage('sync_bulk_update', bulkData, 'low');
  }

  /**
   * Request data from other contexts
   */
  async requestSync(requestData: any): Promise<any> {
    if (!this.config.enabled) return null;

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store pending request
    const requestMessage: SyncMessage = {
      type: 'sync_request',
      contextId: this.contextId,
      timestamp: Date.now(),
      payload: requestData,
      requestId,
      priority: 'high'
    };
    
    this.pendingMessages.set(requestId, requestMessage);

    // Send request
    await this.sendMessage('sync_request', requestData, 'high', requestId);

    // Wait for response (with timeout)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(requestId);
        reject(new Error('Sync request timeout'));
      }, 5000);

      const checkResponse = () => {
        if (!this.pendingMessages.has(requestId)) {
          clearTimeout(timeout);
          resolve(true);
        } else {
          setTimeout(checkResponse, 100);
        }
      };

      checkResponse();
    });
  }

  /**
   * Force synchronization across all contexts
   */
  async forceSync(): Promise<void> {
    if (!this.config.enabled) return;

    // Send heartbeat to all contexts
    await this.sendHeartbeat();

    // Perform bulk sync if there's data to sync
    await this.performPeriodicSync();
  }

  /**
   * Send message to other contexts
   */
  private async sendMessage(
    type: SyncMessageType,
    payload: any,
    priority: SyncPriority,
    requestId?: string
  ): Promise<void> {
    try {
      const message: SyncMessage = {
        type,
        contextId: this.contextId,
        timestamp: Date.now(),
        payload,
        requestId,
        priority
      };

      // Check message size
      const messageSize = JSON.stringify(message).length;
      if (messageSize > this.config.maxMessageSize!) {
        console.warn(`Sync message too large (${messageSize} bytes), skipping`);
        return;
      }

      // Compress if enabled
      if (this.config.enableCompression && messageSize > 1024) {
        // In a real implementation, you might use compression here
        // message.payload = await compressData(message.payload);
      }

      this.syncState.pendingSyncs++;

      // Send to background script (which can relay to other contexts)
      if (this.contextType !== 'background') {
        await this.browser.runtime.sendMessage(message);
      } else {
        // If we're in background, broadcast to all tabs and extension pages
        await this.broadcastFromBackground(message);
      }

      this.syncState.pendingSyncs--;

    } catch (error) {
      this.syncState.pendingSyncs--;
      this.syncState.failedSyncs++;
      console.error('Error sending sync message:', error);
      this.notifySyncError(error as Error);
    }
  }

  /**
   * Broadcast message from background context
   */
  private async broadcastFromBackground(message: SyncMessage): Promise<void> {
    try {
      // Send to all tabs
      const tabs = await this.browser.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          try {
            await this.browser.tabs.sendMessage(tab.id, message);
          } catch {
            // Tab might not have content script, ignore
          }
        }
      }

      // Send to extension pages (popup, options, etc.)
      const extensionViews = this.browser.extension?.getViews?.() || [];
      for (const view of extensionViews) {
        if (view !== window) {
          try {
            view.postMessage(message, '*');
          } catch {
            // View might be closed, ignore
          }
        }
      }

    } catch (error) {
      console.error('Error broadcasting from background:', error);
    }
  }

  /**
   * Send heartbeat to announce presence
   */
  private async sendHeartbeat(): Promise<void> {
    const heartbeatData = {
      contextType: this.contextType,
      syncVersion: 1,
      timestamp: Date.now(),
      activeContexts: this.activeContexts.size
    };

    await this.sendMessage('sync_heartbeat', heartbeatData, 'low');
  }

  /**
   * Perform periodic synchronization
   */
  async performPeriodicSync(): Promise<void> {
    if (!this.isInitialized) return;

    try {
      // Clean up inactive contexts
      this.cleanupInactiveContexts();

      // Check for conflicts and resolve them
      await this.resolveConflicts();

      // Send heartbeat
      await this.sendHeartbeat();

    } catch (error) {
      console.error('Error during periodic sync:', error);
    }
  }

  /**
   * Clean up inactive contexts
   */
  private cleanupInactiveContexts(): void {
    const now = Date.now();
    const timeoutThreshold = (this.config.heartbeatInterval || 30000) * 2;

    for (const [contextId, status] of this.activeContexts) {
      if (now - status.lastSeen > timeoutThreshold) {
        status.isActive = false;
        console.log(`Context ${contextId} marked as inactive`);
      }
    }
  }

  /**
   * Generate sync response for requests
   */
  private async generateSyncResponse(requestData: any): Promise<any> {
    // This would generate appropriate response data based on the request
    // For now, return basic context information
    return {
      contextId: this.contextId,
      contextType: this.contextType,
      timestamp: Date.now(),
      syncState: this.syncState
    };
  }

  /**
   * Resolve sync conflicts
   */
  private async resolveConflicts(): Promise<void> {
    if (this.conflictQueue.size === 0) return;

    for (const [conflictId, conflict] of this.conflictQueue) {
      if (!conflict.resolution) {
        // Apply conflict resolution strategy
        const resolution = this.getConflictResolution(conflict);
        conflict.resolution = resolution;

        // Notify other contexts of resolution
        await this.sendMessage('sync_conflict_resolution', {
          conflictId,
          resolution
        }, 'high');

        // Apply resolution locally
        await this.applyConflictResolution(conflict);
        
        this.conflictQueue.delete(conflictId);
      }
    }
  }

  /**
   * Get conflict resolution based on strategy
   */
  private getConflictResolution(conflict: SyncConflict): 'local' | 'remote' | 'merge' {
    switch (this.config.conflictResolution) {
      case 'local_wins':
        return 'local';
      case 'remote_wins':
        return 'remote';
      case 'timestamp_wins':
        // Compare timestamps and choose newer
        return conflict.localVersion?.timestamp > conflict.remoteVersion?.timestamp ? 'local' : 'remote';
      default:
        return 'merge';
    }
  }

  /**
   * Apply conflict resolution
   */
  private async applyConflictResolution(conflict: SyncConflict): Promise<void> {
    // This would apply the resolved data
    // Implementation depends on the specific data type
    console.log(`Applied conflict resolution: ${conflict.resolution} for ${conflict.dataType}`);
  }

  // =============================================================================
  // EVENT HANDLER REGISTRATION
  // =============================================================================

  /**
   * Register message handler
   */
  registerHandler(messageType: SyncMessageType, handler: (message: SyncMessage) => Promise<void>): void {
    const handlers = this.messageHandlers.get(messageType) || [];
    handlers.push(handler);
    this.messageHandlers.set(messageType, handlers);
  }

  /**
   * Register incoming sync handler
   */
  onIncomingSync(handler: (data: any) => Promise<void>): void {
    this.incomingSyncHandlers.push(handler);
  }

  /**
   * Register sync error handler
   */
  onSyncError(handler: (error: Error) => void): void {
    this.syncErrorHandlers.push(handler);
  }

  /**
   * Notify sync error handlers
   */
  private notifySyncError(error: Error): void {
    for (const handler of this.syncErrorHandlers) {
      try {
        handler(error);
      } catch (handlerError) {
        console.error('Error in sync error handler:', handlerError);
      }
    }
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  /**
   * Get last sync latency
   */
  async getLastSyncLatency(): Promise<number> {
    return this.syncState.averageLatency;
  }

  /**
   * Get sync statistics
   */
  getSyncStats(): SyncState {
    return { ...this.syncState };
  }

  /**
   * Get active contexts
   */
  getActiveContexts(): ContextStatus[] {
    return Array.from(this.activeContexts.values()).filter(ctx => ctx.isActive);
  }

  /**
   * Enable/disable real-time sync
   */
  setRealTimeSyncEnabled(enabled: boolean): void {
    this.config.realTimeSync = enabled;
  }

  /**
   * Reset sync state
   */
  async reset(): Promise<void> {
    try {
      console.log('Resetting CrossContextSync...');

      this.syncState = {
        lastSyncTimestamp: 0,
        conflictCount: 0,
        pendingSyncs: 0,
        failedSyncs: 0,
        totalSyncs: 0,
        averageLatency: 0,
        contextStatus: new Map()
      };

      this.activeContexts.clear();
      this.pendingMessages.clear();
      this.conflictQueue.clear();

      console.log('CrossContextSync reset complete');
    } catch (error) {
      console.error('Error resetting CrossContextSync:', error);
    }
  }

  /**
   * Shutdown cross-context sync
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) return;

    try {
      console.log('Shutting down CrossContextSync...');

      // Clear intervals
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = undefined;
      }

      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = undefined;
      }

      // Clear handlers
      this.messageHandlers.clear();
      this.incomingSyncHandlers = [];
      this.syncErrorHandlers = [];

      this.isInitialized = false;
      console.log('CrossContextSync shutdown complete');

    } catch (error) {
      console.error('Error shutting down CrossContextSync:', error);
    }
  }
}