/**
 * Timeline Navigation Controller
 * Comprehensive navigation system with scrubbing, zooming, and jump-to functionality
 */

import { HistoryTimelineItem } from '../../../../shared/types';
import { 
  TimelineNavigation,
  TimelineZoomLevel,
  TimelineViewMode,
  NavigationTarget,
  NavigationHistoryEntry,
  NavigationBookmark,
  TimeRange,
  ScrubbingControls,
  ZoomControls,
  PlaybackControls,
  QuickNavigationControls
} from '../types';

/**
 * Navigation controller for timeline interactions
 */
export class TimelineNavigationController {
  private navigation: TimelineNavigation;
  private items: HistoryTimelineItem[] = [];
  private callbacks: NavigationCallbacks = {};
  private playbackInterval: number | null = null;

  constructor(
    initialNavigation: Partial<TimelineNavigation> = {},
    items: HistoryTimelineItem[] = []
  ) {
    this.items = items;
    this.navigation = {
      viewMode: 'timeline',
      zoomLevel: 'hours',
      timeRange: this.calculateTimeRange(items),
      scrollPosition: 0,
      history: [],
      bookmarks: [],
      ...initialNavigation
    };
  }

  /**
   * Set navigation callbacks
   */
  setCallbacks(callbacks: Partial<NavigationCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Update timeline items
   */
  updateItems(items: HistoryTimelineItem[]): void {
    this.items = items;
    this.navigation.timeRange = this.calculateTimeRange(items);
    this.callbacks.onNavigationChange?.(this.navigation);
  }

  /**
   * Get current navigation state
   */
  getNavigation(): TimelineNavigation {
    return { ...this.navigation };
  }

  // =============================================================================
  // SCRUBBING CONTROLS
  // =============================================================================

  /**
   * Create scrubbing controls
   */
  createScrubbingControls(): ScrubbingControls {
    return {
      enabled: true,
      sensitivity: 1.0,
      showPreview: true,
      snapToItems: true,
      position: this.navigation.scrollPosition,
      preview: this.generateScrubbingPreview(this.navigation.scrollPosition),
      
      // Note: The actual scrubbing interaction would be handled by UI components
      // This provides the configuration and preview generation
    };
  }

  /**
   * Handle scrubbing position change
   */
  handleScrubbingChange(position: number, showPreview: boolean = true): void {
    this.navigation.scrollPosition = Math.max(0, Math.min(position, 1));
    
    if (showPreview) {
      const preview = this.generateScrubbingPreview(position);
      this.callbacks.onScrubbingChange?.(position, preview);
    }

    this.callbacks.onNavigationChange?.(this.navigation);
  }

  /**
   * Generate scrubbing preview data
   */
  private generateScrubbingPreview(position: number) {
    const { start, end } = this.navigation.timeRange;
    const timestamp = start + (end - start) * position;
    
    // Find items around the timestamp
    const previewItems = this.items
      .filter(item => Math.abs(item.timestamp - timestamp) < 60000) // Within 1 minute
      .sort((a, b) => Math.abs(a.timestamp - timestamp) - Math.abs(b.timestamp - timestamp))
      .slice(0, 5);

    return {
      timestamp,
      items: previewItems,
      position
    };
  }

  // =============================================================================
  // ZOOM CONTROLS  
  // =============================================================================

  /**
   * Create zoom controls
   */
  createZoomControls(): ZoomControls {
    const availableLevels: TimelineZoomLevel[] = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'];
    const currentIndex = availableLevels.indexOf(this.navigation.zoomLevel);

    return {
      currentLevel: this.navigation.zoomLevel,
      availableLevels,
      zoomIn: () => this.zoomIn(),
      zoomOut: () => this.zoomOut(),
      setZoomLevel: (level) => this.setZoomLevel(level),
      zoomToFit: () => this.zoomToFit(),
      zoomToSelection: () => this.zoomToSelection()
    };
  }

  /**
   * Zoom in one level
   */
  zoomIn(): void {
    const levels: TimelineZoomLevel[] = ['years', 'months', 'weeks', 'days', 'hours', 'minutes'];
    const currentIndex = levels.indexOf(this.navigation.zoomLevel);
    
    if (currentIndex < levels.length - 1) {
      this.setZoomLevel(levels[currentIndex + 1]);
    }
  }

  /**
   * Zoom out one level
   */
  zoomOut(): void {
    const levels: TimelineZoomLevel[] = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'];
    const currentIndex = levels.indexOf(this.navigation.zoomLevel);
    
    if (currentIndex < levels.length - 1) {
      this.setZoomLevel(levels[currentIndex + 1]);
    }
  }

  /**
   * Set specific zoom level
   */
  setZoomLevel(level: TimelineZoomLevel): void {
    if (this.navigation.zoomLevel !== level) {
      this.navigation.zoomLevel = level;
      this.navigation.timeRange = this.calculateTimeRangeForZoom(level);
      
      this.addToHistory({
        id: `zoom-${Date.now()}`,
        timestamp: Date.now(),
        target: {
          type: 'date',
          id: level,
          label: `Zoom level: ${level}`
        },
        zoomLevel: level,
        scrollPosition: this.navigation.scrollPosition
      });

      this.callbacks.onZoomChange?.(level);
      this.callbacks.onNavigationChange?.(this.navigation);
    }
  }

  /**
   * Zoom to fit all data
   */
  zoomToFit(): void {
    const optimalZoom = this.calculateOptimalZoomLevel();
    this.setZoomLevel(optimalZoom);
  }

  /**
   * Zoom to current selection
   */
  zoomToSelection(): void {
    // This would be implemented based on current selection state
    // For now, just zoom to hours level
    this.setZoomLevel('hours');
  }

  // =============================================================================
  // PLAYBACK CONTROLS
  // =============================================================================

  /**
   * Create playback controls
   */
  createPlaybackControls(): PlaybackControls {
    return {
      isPlaying: this.playbackInterval !== null,
      speed: 1.0,
      availableSpeeds: [0.25, 0.5, 1.0, 2.0, 4.0],
      togglePlayback: () => this.togglePlayback(),
      stop: () => this.stopPlayback(),
      setSpeed: (speed) => this.setPlaybackSpeed(speed),
      stepForward: () => this.stepForward(),
      stepBackward: () => this.stepBackward()
    };
  }

  /**
   * Toggle playback state
   */
  togglePlayback(): void {
    if (this.playbackInterval) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  /**
   * Start playback
   */
  private startPlayback(): void {
    if (this.playbackInterval) return;

    this.playbackInterval = window.setInterval(() => {
      const step = 0.01; // Move 1% forward each step
      const newPosition = Math.min(this.navigation.scrollPosition + step, 1);
      
      if (newPosition >= 1) {
        this.stopPlayback();
      } else {
        this.handleScrubbingChange(newPosition, false);
      }
    }, 100); // 100ms intervals

    this.callbacks.onPlaybackChange?.(true);
  }

  /**
   * Stop playback
   */
  private stopPlayback(): void {
    if (this.playbackInterval) {
      window.clearInterval(this.playbackInterval);
      this.playbackInterval = null;
      this.callbacks.onPlaybackChange?.(false);
    }
  }

  /**
   * Set playback speed
   */
  private setPlaybackSpeed(speed: number): void {
    const wasPlaying = this.playbackInterval !== null;
    
    if (wasPlaying) {
      this.stopPlayback();
    }

    // Adjust playback interval based on speed
    // This is a simplified implementation
    
    if (wasPlaying) {
      this.startPlayback();
    }

    this.callbacks.onPlaybackSpeedChange?.(speed);
  }

  /**
   * Step forward one item
   */
  private stepForward(): void {
    const currentTime = this.getCurrentTimestamp();
    const nextItem = this.items.find(item => item.timestamp > currentTime);
    
    if (nextItem) {
      this.navigateToItem(nextItem.id);
    }
  }

  /**
   * Step backward one item  
   */
  private stepBackward(): void {
    const currentTime = this.getCurrentTimestamp();
    const prevItems = this.items.filter(item => item.timestamp < currentTime);
    const prevItem = prevItems[prevItems.length - 1];
    
    if (prevItem) {
      this.navigateToItem(prevItem.id);
    }
  }

  // =============================================================================
  // QUICK NAVIGATION
  // =============================================================================

  /**
   * Create quick navigation controls
   */
  createQuickNavigationControls(): QuickNavigationControls {
    return {
      jumpToToday: () => this.jumpToToday(),
      jumpToDate: (date) => this.jumpToDate(date),
      jumpToItem: (itemId) => this.navigateToItem(itemId),
      jumpToSessionStart: (sessionId) => this.jumpToSessionStart(sessionId),
      jumpToSessionEnd: (sessionId) => this.jumpToSessionEnd(sessionId),
      previousSession: () => this.navigateToPreviousSession(),
      nextSession: () => this.navigateToNextSession(),
      previousDay: () => this.navigateToPreviousDay(),
      nextDay: () => this.navigateToNextDay()
    };
  }

  /**
   * Jump to today's date
   */
  jumpToToday(): void {
    this.jumpToDate(new Date());
  }

  /**
   * Jump to specific date
   */
  jumpToDate(date: Date): void {
    const timestamp = date.getTime();
    const position = this.calculatePositionForTimestamp(timestamp);
    
    this.navigation.scrollPosition = position;
    
    this.addToHistory({
      id: `date-${timestamp}`,
      timestamp: Date.now(),
      target: {
        type: 'date',
        id: timestamp.toString(),
        label: date.toDateString()
      },
      zoomLevel: this.navigation.zoomLevel,
      scrollPosition: position
    });

    this.callbacks.onNavigationChange?.(this.navigation);
  }

  /**
   * Navigate to specific item
   */
  navigateToItem(itemId: string): void {
    const item = this.items.find(item => item.id === itemId);
    if (!item) return;

    const position = this.calculatePositionForTimestamp(item.timestamp);
    this.navigation.scrollPosition = position;
    this.navigation.currentIndex = this.items.indexOf(item);

    this.addToHistory({
      id: `item-${itemId}`,
      timestamp: Date.now(),
      target: {
        type: 'item',
        id: itemId,
        label: item.title
      },
      zoomLevel: this.navigation.zoomLevel,
      scrollPosition: position
    });

    this.callbacks.onItemNavigation?.(item);
    this.callbacks.onNavigationChange?.(this.navigation);
  }

  /**
   * Jump to session start
   */
  jumpToSessionStart(sessionId: string): void {
    const sessionItems = this.items.filter(item => item.metadata.sessionId === sessionId);
    if (sessionItems.length === 0) return;

    const firstItem = sessionItems.reduce((earliest, item) => 
      item.timestamp < earliest.timestamp ? item : earliest
    );

    this.navigateToItem(firstItem.id);
  }

  /**
   * Jump to session end
   */
  jumpToSessionEnd(sessionId: string): void {
    const sessionItems = this.items.filter(item => item.metadata.sessionId === sessionId);
    if (sessionItems.length === 0) return;

    const lastItem = sessionItems.reduce((latest, item) => 
      item.timestamp > latest.timestamp ? item : latest
    );

    this.navigateToItem(lastItem.id);
  }

  /**
   * Navigate to previous session
   */
  navigateToPreviousSession(): void {
    const currentTime = this.getCurrentTimestamp();
    const currentSessionId = this.getCurrentSessionId();
    
    // Find items from different sessions that are before current time
    const prevSessionItems = this.items
      .filter(item => 
        item.timestamp < currentTime && 
        item.metadata.sessionId !== currentSessionId
      )
      .sort((a, b) => b.timestamp - a.timestamp);

    if (prevSessionItems.length > 0) {
      const prevSessionId = prevSessionItems[0].metadata.sessionId;
      this.jumpToSessionStart(prevSessionId!);
    }
  }

  /**
   * Navigate to next session
   */
  navigateToNextSession(): void {
    const currentTime = this.getCurrentTimestamp();
    const currentSessionId = this.getCurrentSessionId();
    
    // Find items from different sessions that are after current time
    const nextSessionItems = this.items
      .filter(item => 
        item.timestamp > currentTime && 
        item.metadata.sessionId !== currentSessionId
      )
      .sort((a, b) => a.timestamp - b.timestamp);

    if (nextSessionItems.length > 0) {
      const nextSessionId = nextSessionItems[0].metadata.sessionId;
      this.jumpToSessionStart(nextSessionId!);
    }
  }

  /**
   * Navigate to previous day
   */
  navigateToPreviousDay(): void {
    const currentDate = new Date(this.getCurrentTimestamp());
    const prevDay = new Date(currentDate);
    prevDay.setDate(prevDay.getDate() - 1);
    this.jumpToDate(prevDay);
  }

  /**
   * Navigate to next day
   */
  navigateToNextDay(): void {
    const currentDate = new Date(this.getCurrentTimestamp());
    const nextDay = new Date(currentDate);
    nextDay.setDate(nextDay.getDate() + 1);
    this.jumpToDate(nextDay);
  }

  // =============================================================================
  // VIEW MODE CONTROLS
  // =============================================================================

  /**
   * Set view mode
   */
  setViewMode(mode: TimelineViewMode): void {
    if (this.navigation.viewMode !== mode) {
      this.navigation.viewMode = mode;
      
      this.addToHistory({
        id: `viewmode-${mode}-${Date.now()}`,
        timestamp: Date.now(),
        target: {
          type: 'session',
          id: mode,
          label: `View mode: ${mode}`
        },
        zoomLevel: this.navigation.zoomLevel,
        scrollPosition: this.navigation.scrollPosition
      });

      this.callbacks.onViewModeChange?.(mode);
      this.callbacks.onNavigationChange?.(this.navigation);
    }
  }

  // =============================================================================
  // BOOKMARKS
  // =============================================================================

  /**
   * Create bookmark at current position
   */
  createBookmark(label: string, notes?: string, color?: string): void {
    const bookmark: NavigationBookmark = {
      id: `bookmark-${Date.now()}`,
      label,
      createdAt: Date.now(),
      target: {
        type: 'bookmark',
        id: `position-${this.navigation.scrollPosition}`,
        label: `Position ${(this.navigation.scrollPosition * 100).toFixed(1)}%`
      },
      color,
      notes
    };

    this.navigation.bookmarks.push(bookmark);
    this.callbacks.onBookmarkChange?.(this.navigation.bookmarks);
    this.callbacks.onNavigationChange?.(this.navigation);
  }

  /**
   * Remove bookmark
   */
  removeBookmark(bookmarkId: string): void {
    const index = this.navigation.bookmarks.findIndex(b => b.id === bookmarkId);
    if (index >= 0) {
      this.navigation.bookmarks.splice(index, 1);
      this.callbacks.onBookmarkChange?.(this.navigation.bookmarks);
      this.callbacks.onNavigationChange?.(this.navigation);
    }
  }

  /**
   * Navigate to bookmark
   */
  navigateToBookmark(bookmarkId: string): void {
    const bookmark = this.navigation.bookmarks.find(b => b.id === bookmarkId);
    if (!bookmark) return;

    if (bookmark.target.type === 'item') {
      this.navigateToItem(bookmark.target.id);
    } else if (bookmark.target.type === 'date') {
      this.jumpToDate(new Date(parseInt(bookmark.target.id)));
    } else {
      // Navigate to bookmark position
      const position = parseFloat(bookmark.target.id.replace('position-', '')) / 100;
      this.handleScrubbingChange(position, false);
    }
  }

  // =============================================================================
  // HISTORY MANAGEMENT
  // =============================================================================

  /**
   * Go back in navigation history
   */
  goBack(): void {
    // Implementation for history navigation
    if (this.navigation.history.length > 1) {
      const currentIndex = this.navigation.history.length - 1;
      const prevEntry = this.navigation.history[currentIndex - 1];
      
      this.restoreHistoryEntry(prevEntry);
    }
  }

  /**
   * Go forward in navigation history
   */
  goForward(): void {
    // This would require maintaining a separate forward history stack
    // Simplified implementation
  }

  /**
   * Add entry to navigation history
   */
  private addToHistory(entry: NavigationHistoryEntry): void {
    this.navigation.history.push(entry);
    
    // Limit history size
    if (this.navigation.history.length > 50) {
      this.navigation.history.shift();
    }
  }

  /**
   * Restore from history entry
   */
  private restoreHistoryEntry(entry: NavigationHistoryEntry): void {
    this.navigation.scrollPosition = entry.scrollPosition;
    this.navigation.zoomLevel = entry.zoomLevel;
    
    if (entry.filters) {
      // Apply filters if provided
      this.callbacks.onFilterChange?.(entry.filters);
    }

    this.callbacks.onNavigationChange?.(this.navigation);
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Calculate time range from items
   */
  private calculateTimeRange(items: HistoryTimelineItem[]): TimeRange {
    if (items.length === 0) {
      const now = Date.now();
      return { start: now - 86400000, end: now }; // Last 24 hours
    }

    const timestamps = items.map(item => item.timestamp);
    return {
      start: Math.min(...timestamps),
      end: Math.max(...timestamps)
    };
  }

  /**
   * Calculate time range for zoom level
   */
  private calculateTimeRangeForZoom(zoomLevel: TimelineZoomLevel): TimeRange {
    const currentTime = this.getCurrentTimestamp();
    let duration: number;

    switch (zoomLevel) {
      case 'minutes':
        duration = 60000; // 1 minute
        break;
      case 'hours':
        duration = 3600000; // 1 hour
        break;
      case 'days':
        duration = 86400000; // 1 day
        break;
      case 'weeks':
        duration = 604800000; // 1 week
        break;
      case 'months':
        duration = 2592000000; // ~30 days
        break;
      case 'years':
        duration = 31536000000; // ~365 days
        break;
      default:
        duration = 3600000;
    }

    return {
      start: currentTime - duration / 2,
      end: currentTime + duration / 2
    };
  }

  /**
   * Calculate optimal zoom level based on data density
   */
  private calculateOptimalZoomLevel(): TimelineZoomLevel {
    const { start, end } = this.navigation.timeRange;
    const duration = end - start;

    // Choose zoom level based on total time span
    if (duration < 3600000) return 'minutes';      // < 1 hour
    if (duration < 86400000) return 'hours';       // < 1 day  
    if (duration < 604800000) return 'days';       // < 1 week
    if (duration < 2592000000) return 'weeks';     // < ~30 days
    if (duration < 31536000000) return 'months';   // < ~365 days
    return 'years';
  }

  /**
   * Calculate position for timestamp
   */
  private calculatePositionForTimestamp(timestamp: number): number {
    const { start, end } = this.navigation.timeRange;
    if (end === start) return 0;
    return Math.max(0, Math.min(1, (timestamp - start) / (end - start)));
  }

  /**
   * Get current timestamp from scroll position
   */
  private getCurrentTimestamp(): number {
    const { start, end } = this.navigation.timeRange;
    return start + (end - start) * this.navigation.scrollPosition;
  }

  /**
   * Get current session ID
   */
  private getCurrentSessionId(): string | null {
    if (this.navigation.currentIndex !== undefined) {
      const currentItem = this.items[this.navigation.currentIndex];
      return currentItem?.metadata.sessionId || null;
    }
    return null;
  }
}

/**
 * Navigation callback interface
 */
export interface NavigationCallbacks {
  onNavigationChange?: (navigation: TimelineNavigation) => void;
  onScrubbingChange?: (position: number, preview?: any) => void;
  onZoomChange?: (level: TimelineZoomLevel) => void;
  onViewModeChange?: (mode: TimelineViewMode) => void;
  onPlaybackChange?: (isPlaying: boolean) => void;
  onPlaybackSpeedChange?: (speed: number) => void;
  onItemNavigation?: (item: HistoryTimelineItem) => void;
  onBookmarkChange?: (bookmarks: NavigationBookmark[]) => void;
  onFilterChange?: (filters: any) => void;
}

// Export singleton factory
export const createNavigationController = (
  initialNavigation?: Partial<TimelineNavigation>,
  items?: HistoryTimelineItem[]
): TimelineNavigationController => {
  return new TimelineNavigationController(initialNavigation, items);
};