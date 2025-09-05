/**
 * Window relationship tracking and grouping
 * Monitors window creation, focus changes, and multi-window session correlation
 */

import {
  BrowsingEvent,
  WindowEvent,
  WindowBounds,
  TrackingConfig,
  EventType,
  EventMetadata
} from '../shared/types';
import { EventTracker } from './EventTracker';

interface WindowState {
  id: number;
  type: 'normal' | 'popup' | 'panel' | 'app' | 'devtools';
  state: 'normal' | 'minimized' | 'maximized' | 'fullscreen';
  bounds: WindowBounds;
  createdAt: number;
  lastFocused: number;
  focusTime: number;
  focusCount: number;
  tabIds: Set<number>;
  sessionId: string;
  isIncognito: boolean;
  relationships: WindowRelationships;
}

interface WindowRelationships {
  parentWindowId?: number;
  childWindowIds: number[];
  popupSourceTabId?: number;
  relatedWindows: number[];
}

export class WindowTracker {
  private config: TrackingConfig;
  private eventHandler: (event: BrowsingEvent) => Promise<void>;
  private windowStates = new Map<number, WindowState>();
  private activeWindowId?: number;
  private lastFocusTime = Date.now();
  private windowGroups = new Map<string, Set<number>>();

  constructor(config: TrackingConfig, eventHandler: (event: BrowsingEvent) => Promise<void>) {
    this.config = config;
    this.eventHandler = eventHandler;
  }

  /**
   * Initialize window tracking
   */
  async initialize(): Promise<void> {
    console.log('Initializing WindowTracker...');
    
    // Load existing window states if available
    await this.loadWindowStates();
    
    console.log('WindowTracker initialized');
  }

  /**
   * Shutdown window tracking
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down WindowTracker...');
    
    // Save window states
    await this.saveWindowStates();
    
    // Clean up resources
    this.windowStates.clear();
    this.windowGroups.clear();
    
    console.log('WindowTracker shutdown complete');
  }

  /**
   * Process window events from browser API
   */
  async processEvent(windowEvent: WindowEvent): Promise<void> {
    if (!this.config.enableWindowTracking) {
      return;
    }

    const now = Date.now();
    const sessionId = this.getCurrentSessionId();

    switch (windowEvent.type) {
      case 'created':
        await this.handleWindowCreated(windowEvent, sessionId, now);
        break;
      case 'removed':
        await this.handleWindowRemoved(windowEvent, sessionId, now);
        break;
      case 'focus_changed':
        await this.handleWindowFocusChanged(windowEvent, sessionId, now);
        break;
      case 'state_changed':
        await this.handleWindowStateChanged(windowEvent, sessionId, now);
        break;
    }
  }

  /**
   * Handle window creation
   */
  private async handleWindowCreated(windowEvent: WindowEvent, sessionId: string, timestamp: number): Promise<void> {
    const windowState: WindowState = {
      id: windowEvent.windowId,
      type: windowEvent.windowType || 'normal',
      state: windowEvent.state || 'normal',
      bounds: windowEvent.bounds || { left: 0, top: 0, width: 0, height: 0 },
      createdAt: timestamp,
      lastFocused: timestamp,
      focusTime: 0,
      focusCount: 0,
      tabIds: new Set(),
      sessionId,
      isIncognito: false, // Would need to detect this from browser API
      relationships: {
        childWindowIds: [],
        relatedWindows: []
      }
    };

    // Detect window relationships
    await this.detectWindowRelationships(windowState);
    
    // Group windows by type and context
    await this.groupWindow(windowState);

    this.windowStates.set(windowEvent.windowId, windowState);

    // Emit tracking event
    const event = EventTracker.createEvent(
      'window_created',
      sessionId,
      this.createWindowEventMetadata(windowState, {
        windowType: windowState.type,
        initialState: windowState.state,
        bounds: windowState.bounds
      }),
      undefined,
      windowEvent.windowId
    );

    await this.eventHandler(event);
  }

  /**
   * Handle window removal
   */
  private async handleWindowRemoved(windowEvent: WindowEvent, sessionId: string, timestamp: number): Promise<void> {
    const windowState = this.windowStates.get(windowEvent.windowId);
    if (!windowState) {
      return;
    }

    // Calculate final metrics
    const totalTime = timestamp - windowState.createdAt;
    let focusTime = windowState.focusTime;
    
    if (this.activeWindowId === windowEvent.windowId) {
      focusTime += timestamp - this.lastFocusTime;
    }

    // Clean up window relationships
    await this.cleanupWindowRelationships(windowEvent.windowId);

    // Remove from window groups
    await this.ungroupWindow(windowState);

    const event = EventTracker.createEvent(
      'window_removed',
      sessionId,
      this.createWindowEventMetadata(windowState, {
        totalTime,
        finalFocusTime: focusTime,
        tabCount: windowState.tabIds.size,
        focusCount: windowState.focusCount
      }),
      undefined,
      windowEvent.windowId
    );

    await this.eventHandler(event);

    // Clean up window state
    this.windowStates.delete(windowEvent.windowId);
    if (this.activeWindowId === windowEvent.windowId) {
      this.activeWindowId = undefined;
    }
  }

  /**
   * Handle window focus changes
   */
  private async handleWindowFocusChanged(windowEvent: WindowEvent, sessionId: string, timestamp: number): Promise<void> {
    // Update previous active window's focus time
    if (this.activeWindowId && this.activeWindowId !== windowEvent.windowId) {
      const prevWindowState = this.windowStates.get(this.activeWindowId);
      if (prevWindowState) {
        prevWindowState.focusTime += timestamp - this.lastFocusTime;
      }
    }

    // Update current active window
    this.activeWindowId = windowEvent.windowId;
    this.lastFocusTime = timestamp;

    const windowState = this.windowStates.get(windowEvent.windowId);
    if (windowState) {
      windowState.lastFocused = timestamp;
      windowState.focusCount++;
    }

    const event = EventTracker.createEvent(
      'window_focus_changed',
      sessionId,
      this.createWindowEventMetadata(windowState, {
        previousWindowId: this.activeWindowId,
        focusCount: windowState?.focusCount
      }),
      undefined,
      windowEvent.windowId
    );

    await this.eventHandler(event);
  }

  /**
   * Handle window state changes (minimize, maximize, etc.)
   */
  private async handleWindowStateChanged(windowEvent: WindowEvent, sessionId: string, timestamp: number): Promise<void> {
    const windowState = this.windowStates.get(windowEvent.windowId);
    if (!windowState) {
      return;
    }

    const previousState = windowState.state;
    if (windowEvent.state) {
      windowState.state = windowEvent.state;
    }
    
    if (windowEvent.bounds) {
      windowState.bounds = windowEvent.bounds;
    }

    const event = EventTracker.createEvent(
      'window_state_changed',
      sessionId,
      this.createWindowEventMetadata(windowState, {
        previousState,
        newState: windowState.state,
        bounds: windowState.bounds,
        stateChange: true
      }),
      undefined,
      windowEvent.windowId
    );

    await this.eventHandler(event);
  }

  /**
   * Associate a tab with a window
   */
  async associateTab(windowId: number, tabId: number): Promise<void> {
    const windowState = this.windowStates.get(windowId);
    if (windowState) {
      windowState.tabIds.add(tabId);
    }
  }

  /**
   * Disassociate a tab from a window
   */
  async disassociateTab(windowId: number, tabId: number): Promise<void> {
    const windowState = this.windowStates.get(windowId);
    if (windowState) {
      windowState.tabIds.delete(tabId);
    }
  }

  /**
   * Detect relationships between windows
   */
  private async detectWindowRelationships(windowState: WindowState): Promise<void> {
    // Detect popup relationships based on timing and type
    if (windowState.type === 'popup') {
      // Find recently active window that might be the parent
      let parentWindowId: number | undefined;
      let latestFocus = 0;

      for (const [windowId, otherState] of this.windowStates) {
        if (windowId === windowState.id) continue;
        
        // Look for windows focused recently before this popup was created
        const timeDiff = windowState.createdAt - otherState.lastFocused;
        if (timeDiff > 0 && timeDiff < 5000 && otherState.lastFocused > latestFocus) {
          latestFocus = otherState.lastFocused;
          parentWindowId = windowId;
        }
      }

      if (parentWindowId) {
        windowState.relationships.parentWindowId = parentWindowId;
        
        const parentState = this.windowStates.get(parentWindowId);
        if (parentState) {
          parentState.relationships.childWindowIds.push(windowState.id);
        }
      }
    }

    // Detect related windows (same session, similar domains)
    await this.detectRelatedWindows(windowState);
  }

  /**
   * Detect windows that might be related
   */
  private async detectRelatedWindows(windowState: WindowState): Promise<void> {
    for (const [windowId, otherState] of this.windowStates) {
      if (windowId === windowState.id) continue;

      // Same session = potentially related
      if (otherState.sessionId === windowState.sessionId) {
        // Check temporal proximity (created close in time)
        const timeDiff = Math.abs(windowState.createdAt - otherState.createdAt);
        if (timeDiff < 60000) { // Within 1 minute
          windowState.relationships.relatedWindows.push(windowId);
          if (!otherState.relationships.relatedWindows.includes(windowState.id)) {
            otherState.relationships.relatedWindows.push(windowState.id);
          }
        }
      }
    }
  }

  /**
   * Group windows by context or purpose
   */
  private async groupWindow(windowState: WindowState): Promise<void> {
    let groupKey: string;

    // Group by window type
    if (windowState.type === 'popup') {
      groupKey = `popup_${windowState.sessionId}`;
    } else if (windowState.type === 'devtools') {
      groupKey = `devtools_${windowState.sessionId}`;
    } else {
      groupKey = `normal_${windowState.sessionId}`;
    }

    if (!this.windowGroups.has(groupKey)) {
      this.windowGroups.set(groupKey, new Set());
    }
    
    this.windowGroups.get(groupKey)!.add(windowState.id);
  }

  /**
   * Remove window from groups
   */
  private async ungroupWindow(windowState: WindowState): Promise<void> {
    for (const [groupKey, windowIds] of this.windowGroups) {
      if (windowIds.has(windowState.id)) {
        windowIds.delete(windowState.id);
        
        // Remove empty groups
        if (windowIds.size === 0) {
          this.windowGroups.delete(groupKey);
        }
      }
    }
  }

  /**
   * Clean up relationships when a window is closed
   */
  private async cleanupWindowRelationships(closedWindowId: number): Promise<void> {
    for (const [windowId, windowState] of this.windowStates) {
      if (windowId === closedWindowId) continue;

      // Remove from child lists
      windowState.relationships.childWindowIds = windowState.relationships.childWindowIds
        .filter(id => id !== closedWindowId);
      
      // Remove from related lists
      windowState.relationships.relatedWindows = windowState.relationships.relatedWindows
        .filter(id => id !== closedWindowId);
      
      // Clear parent references
      if (windowState.relationships.parentWindowId === closedWindowId) {
        windowState.relationships.parentWindowId = undefined;
      }
    }
  }

  /**
   * Create metadata for window events
   */
  private createWindowEventMetadata(windowState: WindowState | undefined, additionalData?: any): EventMetadata {
    const metadata: EventMetadata = {
      ...additionalData
    };

    if (windowState) {
      metadata.windowType = windowState.type;
      metadata.windowState = windowState.state;
      metadata.relationships = windowState.relationships;
      metadata.isIncognito = windowState.isIncognito;
      metadata.tabCount = windowState.tabIds.size;
      metadata.focusTime = windowState.focusTime;
      metadata.focusCount = windowState.focusCount;
    }

    return metadata;
  }

  /**
   * Get current session ID (would be provided by SessionTracker)
   */
  private getCurrentSessionId(): string {
    // This would typically come from the SessionTracker
    // For now, return a placeholder
    return 'session_' + Date.now();
  }

  /**
   * Get window state for a specific window
   */
  getWindowState(windowId: number): WindowState | undefined {
    return this.windowStates.get(windowId);
  }

  /**
   * Get all active window states
   */
  getAllWindowStates(): Map<number, WindowState> {
    return new Map(this.windowStates);
  }

  /**
   * Get window groups
   */
  getWindowGroups(): Map<string, Set<number>> {
    return new Map(this.windowGroups);
  }

  /**
   * Get multi-window session statistics
   */
  getSessionWindowStats(sessionId: string) {
    const sessionWindows = Array.from(this.windowStates.values())
      .filter(state => state.sessionId === sessionId);

    return {
      totalWindows: sessionWindows.length,
      windowTypes: sessionWindows.reduce((acc, state) => {
        acc[state.type] = (acc[state.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      totalTabs: sessionWindows.reduce((sum, state) => sum + state.tabIds.size, 0),
      averageFocusTime: sessionWindows.length > 0 
        ? sessionWindows.reduce((sum, state) => sum + state.focusTime, 0) / sessionWindows.length 
        : 0,
      relationships: {
        popups: sessionWindows.filter(s => s.type === 'popup').length,
        hasParentChild: sessionWindows.some(s => s.relationships.parentWindowId || s.relationships.childWindowIds.length > 0)
      }
    };
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: TrackingConfig): Promise<void> {
    this.config = newConfig;
  }

  /**
   * Load window states from storage (implementation placeholder)
   */
  private async loadWindowStates(): Promise<void> {
    // Implementation would load from storage
    // For now, this is a placeholder
  }

  /**
   * Save window states to storage (implementation placeholder)
   */
  private async saveWindowStates(): Promise<void> {
    // Implementation would save to storage
    // For now, this is a placeholder
  }
}