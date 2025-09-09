/**
 * Timeline Visualization Utilities
 * Helper functions for git-style timeline visualization and session grouping
 */

import { 
  TimelineVisualizationItem, 
  TimelineSession, 
  SessionBranch, 
  ItemRelationships,
  ConnectionType,
  TimelineZoomLevel,
  SessionSummary,
  TimeRange,
  SessionVisual
} from '../types/timeline';
import { HistoryTimelineItem, BrowsingSession } from '../../../../shared/types';

// =============================================================================
// SESSION CONVERSION UTILITIES
// =============================================================================

/**
 * Convert browsing session to timeline session
 */
export function convertToTimelineSession(session: BrowsingSession, items: HistoryTimelineItem[]): TimelineSession {
  const sessionItems = items.filter(item => item.metadata.sessionId === session.id);
  
  return {
    id: session.id,
    tag: session.tag,
    metadata: {
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      purpose: session.metadata.purpose,
      notes: session.metadata.notes,
      isPrivate: session.metadata.isPrivate,
      tags: [], // TODO: Get tags from session
      relatedSessions: []
    },
    items: sessionItems.map(item => convertToVisualizationItem(item, sessionItems)),
    visual: generateSessionVisual(session, sessionItems),
    grouping: {
      expanded: false,
      collapsible: true,
      level: 0,
      childSessions: [],
      collapsedSummary: generateSessionSummary(session, sessionItems)
    },
    stats: calculateSessionStats(session, sessionItems)
  };
}

/**
 * Convert history timeline item to visualization item
 */
export function convertToVisualizationItem(
  item: HistoryTimelineItem, 
  allSessionItems: HistoryTimelineItem[]
): TimelineVisualizationItem {
  const relationships = detectItemRelationships(item, allSessionItems);
  const position = calculateItemPosition(item, allSessionItems);
  
  return {
    ...item,
    position,
    relationships,
    styling: {
      color: getItemColor(item),
      icon: getItemIcon(item),
      size: getItemSize(item),
      highlighted: false,
      selected: false,
      opacity: 1
    },
    sessionContext: {
      sessionId: item.metadata.sessionId!,
      session: {} as TimelineSession, // Will be populated later
      positionInSession: allSessionItems.findIndex(i => i.id === item.id),
      sessionExpanded: false
    }
  };
}

// =============================================================================
// RELATIONSHIP DETECTION
// =============================================================================

/**
 * Detect relationships between timeline items
 */
export function detectItemRelationships(
  item: HistoryTimelineItem,
  allItems: HistoryTimelineItem[]
): ItemRelationships {
  const relationships: ItemRelationships = {
    parentIds: [],
    childIds: [],
    siblingIds: [],
    relatedIds: [],
    connectionType: 'session_flow'
  };

  // Find items from same tab
  const sameTabItems = allItems.filter(i => 
    i.metadata.tabId === item.metadata.tabId && i.id !== item.id
  );

  // Find parent-child relationships (navigation flow)
  const itemIndex = allItems.findIndex(i => i.id === item.id);
  if (itemIndex > 0) {
    const previousItem = allItems[itemIndex - 1];
    if (previousItem.metadata.tabId === item.metadata.tabId) {
      relationships.parentIds.push(previousItem.id);
      relationships.connectionType = 'parent_child';
    }
  }

  if (itemIndex < allItems.length - 1) {
    const nextItem = allItems[itemIndex + 1];
    if (nextItem.metadata.tabId === item.metadata.tabId) {
      relationships.childIds.push(nextItem.id);
    }
  }

  // Find siblings (same session, different tabs)
  relationships.siblingIds = allItems
    .filter(i => 
      i.metadata.sessionId === item.metadata.sessionId &&
      i.metadata.tabId !== item.metadata.tabId &&
      i.id !== item.id
    )
    .map(i => i.id);

  // Find related items (same domain)
  relationships.relatedIds = allItems
    .filter(i => 
      i.metadata.domain === item.metadata.domain &&
      i.metadata.sessionId !== item.metadata.sessionId &&
      i.id !== item.id
    )
    .map(i => i.id);

  return relationships;
}

// =============================================================================
// POSITION CALCULATION
// =============================================================================

/**
 * Calculate item position for git-style visualization
 */
export function calculateItemPosition(
  item: HistoryTimelineItem,
  allSessionItems: HistoryTimelineItem[]
): ItemPosition {
  // Group items by tab to create lanes
  const tabGroups = groupItemsByTab(allSessionItems);
  const tabIds = Object.keys(tabGroups);
  
  const laneIndex = tabIds.findIndex(tabId => 
    tabId === (item.metadata.tabId?.toString() || '0')
  );

  return {
    laneIndex: Math.max(0, laneIndex),
    timestamp: item.timestamp,
    depth: 0,
    isBranchPoint: checkIfBranchPoint(item, allSessionItems),
    isMergePoint: checkIfMergePoint(item, allSessionItems)
  };
}

function groupItemsByTab(items: HistoryTimelineItem[]): Record<string, HistoryTimelineItem[]> {
  return items.reduce((groups, item) => {
    const tabId = item.metadata.tabId?.toString() || '0';
    if (!groups[tabId]) {
      groups[tabId] = [];
    }
    groups[tabId].push(item);
    return groups;
  }, {} as Record<string, HistoryTimelineItem[]>);
}

function checkIfBranchPoint(item: HistoryTimelineItem, allItems: HistoryTimelineItem[]): boolean {
  // Check if this item opens new tabs/windows
  const itemIndex = allItems.findIndex(i => i.id === item.id);
  const nextItems = allItems.slice(itemIndex + 1, itemIndex + 5); // Check next 5 items
  
  return nextItems.some(nextItem => 
    nextItem.metadata.tabId !== item.metadata.tabId &&
    Math.abs(nextItem.timestamp - item.timestamp) < 5000 // Within 5 seconds
  );
}

function checkIfMergePoint(item: HistoryTimelineItem, allItems: HistoryTimelineItem[]): boolean {
  // Check if multiple tabs converge at this point
  const itemIndex = allItems.findIndex(i => i.id === item.id);
  const prevItems = allItems.slice(Math.max(0, itemIndex - 5), itemIndex);
  
  const uniqueTabs = new Set(prevItems.map(i => i.metadata.tabId));
  return uniqueTabs.size > 1 && prevItems.length > 1;
}

// =============================================================================
// VISUAL GENERATION
// =============================================================================

/**
 * Generate visual representation for session
 */
export function generateSessionVisual(
  session: BrowsingSession, 
  items: HistoryTimelineItem[]
): SessionVisual {
  const branches = generateSessionBranches(items);
  
  return {
    color: generateSessionColor(session.id),
    icon: getSessionIcon(session),
    laneIndex: 0,
    branches,
    merges: []
  };
}

function generateSessionBranches(items: HistoryTimelineItem[]): SessionBranch[] {
  const tabGroups = groupItemsByTab(items);
  const branches: SessionBranch[] = [];

  Object.entries(tabGroups).forEach(([tabId, tabItems], index) => {
    if (tabItems.length > 0) {
      branches.push({
        id: `branch-${tabId}`,
        startTimestamp: tabItems[0].timestamp,
        endTimestamp: tabItems[tabItems.length - 1].timestamp,
        laneIndex: index,
        type: 'new_tab',
        itemIds: tabItems.map(item => item.id)
      });
    }
  });

  return branches;
}

/**
 * Generate session summary for collapsed view
 */
export function generateSessionSummary(
  session: BrowsingSession, 
  items: HistoryTimelineItem[]
): SessionSummary {
  const domains = [...new Set(items.map(item => item.metadata.domain).filter(Boolean))];
  const duration = items.length > 0 ? 
    Math.max(...items.map(i => i.timestamp)) - Math.min(...items.map(i => i.timestamp)) : 0;

  return {
    title: session.tag || `Session ${session.id.slice(0, 8)}`,
    description: session.metadata.purpose || `${items.length} pages across ${domains.length} domains`,
    keyStats: {
      tabCount: session.metadata.pageCount,
      duration,
      pageCount: items.length,
      topDomains: domains.slice(0, 3)
    },
    previewItems: items.slice(0, 3).map(item => convertToVisualizationItem(item, items))
  };
}

// =============================================================================
// STYLING UTILITIES
// =============================================================================

/**
 * Get color for timeline item based on type and metadata
 */
export function getItemColor(item: HistoryTimelineItem): string {
  const colorMap: Record<HistoryTimelineItem['type'], string> = {
    'session': '#4F46E5',
    'navigation': '#06B6D4',
    'tab_event': '#8B5CF6',
    'boundary': '#EF4444'
  };
  
  return colorMap[item.type] || '#6B7280';
}

/**
 * Get icon for timeline item based on type
 */
export function getItemIcon(item: HistoryTimelineItem): string {
  const iconMap: Record<HistoryTimelineItem['type'], string> = {
    'session': '📁',
    'navigation': '🌐',
    'tab_event': '📄',
    'boundary': '🚩'
  };
  
  return iconMap[item.type] || '●';
}

/**
 * Get size for timeline item based on importance
 */
export function getItemSize(item: HistoryTimelineItem): 'small' | 'medium' | 'large' {
  if (item.type === 'session') return 'large';
  if (item.type === 'boundary') return 'medium';
  return 'small';
}

/**
 * Generate consistent color for session based on ID
 */
export function generateSessionColor(sessionId: string): string {
  const colors = [
    '#EF4444', '#F97316', '#F59E0B', '#84CC16', 
    '#22C55E', '#10B981', '#06B6D4', '#3B82F6',
    '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
    '#EC4899', '#F43F5E'
  ];
  
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = ((hash << 5) - hash) + sessionId.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Get icon for session based on metadata
 */
export function getSessionIcon(session: BrowsingSession): string {
  if (session.metadata.isPrivate) return '🔒';
  if (session.metadata.purpose?.toLowerCase().includes('work')) return '💼';
  if (session.metadata.purpose?.toLowerCase().includes('research')) return '🔍';
  if (session.metadata.purpose?.toLowerCase().includes('shopping')) return '🛒';
  return '📂';
}

// =============================================================================
// SESSION STATISTICS
// =============================================================================

/**
 * Calculate comprehensive statistics for a session
 */
export function calculateSessionStats(
  session: BrowsingSession,
  items: HistoryTimelineItem[]
): SessionStats {
  const domains = [...new Set(items.map(item => item.metadata.domain).filter(Boolean))];
  const timeSpan = items.length > 1 ? 
    Math.max(...items.map(i => i.timestamp)) - Math.min(...items.map(i => i.timestamp)) : 0;

  return {
    totalTime: session.metadata.totalTime,
    activeTime: Math.max(session.metadata.totalTime * 0.7, 0), // Estimate 70% active
    tabCount: session.metadata.pageCount,
    pageCount: items.length,
    uniqueDomains: domains,
    windowCount: session.windowIds.length,
    navigationEvents: items.filter(i => i.type === 'navigation').length,
    productivityScore: calculateProductivityScore(session, items)
  };
}

function calculateProductivityScore(session: BrowsingSession, items: HistoryTimelineItem[]): number {
  // Simple productivity scoring algorithm
  let score = 50; // Base score
  
  // Bonus for focused sessions (few domains)
  const domains = [...new Set(items.map(item => item.metadata.domain).filter(Boolean))];
  if (domains.length <= 3) score += 20;
  if (domains.length <= 1) score += 10;
  
  // Penalty for too many tabs
  if (session.metadata.pageCount > 10) score -= 10;
  if (session.metadata.pageCount > 20) score -= 20;
  
  // Bonus for longer sessions (indicates deep work)
  if (session.metadata.totalTime > 30 * 60 * 1000) score += 15; // 30+ minutes
  if (session.metadata.totalTime > 60 * 60 * 1000) score += 10; // 60+ minutes
  
  return Math.max(0, Math.min(100, score));
}

// =============================================================================
// TIME RANGE UTILITIES
// =============================================================================

/**
 * Calculate appropriate zoom level based on time range
 */
export function calculateOptimalZoomLevel(range: TimeRange): TimelineZoomLevel {
  const duration = range.end - range.start;
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;
  const oneWeek = 7 * oneDay;
  const oneMonth = 30 * oneDay;

  if (duration <= 2 * oneHour) return 'minutes';
  if (duration <= 2 * oneDay) return 'hours';
  if (duration <= 2 * oneWeek) return 'days';
  if (duration <= 2 * oneMonth) return 'weeks';
  if (duration <= 12 * oneMonth) return 'months';
  return 'years';
}

/**
 * Format timestamp based on zoom level
 */
export function formatTimestamp(timestamp: number, zoomLevel: TimelineZoomLevel): string {
  const date = new Date(timestamp);
  
  switch (zoomLevel) {
    case 'minutes':
      return date.toLocaleTimeString(undefined, { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    case 'hours':
      return date.toLocaleString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit' 
      });
    case 'days':
      return date.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric' 
      });
    case 'weeks':
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      return `Week of ${weekStart.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric' 
      })}`;
    case 'months':
      return date.toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'long' 
      });
    case 'years':
      return date.getFullYear().toString();
    default:
      return date.toLocaleString();
  }
}

/**
 * Calculate time buckets for grouping items
 */
export function calculateTimeBuckets(
  items: HistoryTimelineItem[], 
  zoomLevel: TimelineZoomLevel
): Record<string, HistoryTimelineItem[]> {
  return items.reduce((buckets, item) => {
    const bucketKey = formatTimestamp(item.timestamp, zoomLevel);
    if (!buckets[bucketKey]) {
      buckets[bucketKey] = [];
    }
    buckets[bucketKey].push(item);
    return buckets;
  }, {} as Record<string, HistoryTimelineItem[]>);
}