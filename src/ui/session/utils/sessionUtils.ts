/**
 * Session Utility Functions
 * Helper functions for session management UI operations
 */

import { Session, SessionTag, SessionTab } from '../../../contexts/types';
import { SessionSearchQuery, SessionFilter, SessionSortOptions } from '../types';

// =============================================================================
// SESSION FILTERING AND SEARCH
// =============================================================================

/**
 * Filter sessions based on search query
 */
export function filterSessions(sessions: Session[], query: SessionSearchQuery): Session[] {
  return sessions.filter(session => {
    // Text search (name, description, tab titles, URLs)
    if (query.text) {
      const searchText = query.text.toLowerCase();
      const matchesName = session.name.toLowerCase().includes(searchText);
      const matchesDescription = session.description?.toLowerCase().includes(searchText) || false;
      const matchesTabs = session.tabs.some(tab => 
        tab.title.toLowerCase().includes(searchText) || 
        tab.url.toLowerCase().includes(searchText)
      );
      
      if (!matchesName && !matchesDescription && !matchesTabs) {
        return false;
      }
    }

    // Tag filtering
    if (query.tags.length > 0) {
      const sessionTagIds = session.tags.map(tag => tag.id);
      const hasMatchingTags = query.tags.some(tagId => sessionTagIds.includes(tagId));
      if (!hasMatchingTags) {
        return false;
      }
    }

    // Date range filtering
    if (query.dateRange) {
      const sessionDate = new Date(session.startTime);
      if (sessionDate < query.dateRange.start || sessionDate > query.dateRange.end) {
        return false;
      }
    }

    // Domain filtering
    if (query.domains.length > 0) {
      const sessionDomains = getSessionDomains(session);
      const hasMatchingDomains = query.domains.some(domain => 
        sessionDomains.includes(domain)
      );
      if (!hasMatchingDomains) {
        return false;
      }
    }

    // Active status filtering
    if (query.isActive !== undefined) {
      if (session.isActive !== query.isActive) {
        return false;
      }
    }

    // Tab count filtering
    if (query.minTabs !== undefined && session.tabs.length < query.minTabs) {
      return false;
    }
    if (query.maxTabs !== undefined && session.tabs.length > query.maxTabs) {
      return false;
    }

    // Duration filtering
    if (session.duration !== undefined) {
      if (query.minDuration !== undefined && session.duration < query.minDuration) {
        return false;
      }
      if (query.maxDuration !== undefined && session.duration > query.maxDuration) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sort sessions based on sort options
 */
export function sortSessions(sessions: Session[], sortOptions: SessionSortOptions): Session[] {
  const { field, order } = sortOptions;
  
  return [...sessions].sort((a, b) => {
    let valueA: any;
    let valueB: any;

    switch (field) {
      case 'name':
        valueA = a.name.toLowerCase();
        valueB = b.name.toLowerCase();
        break;
      case 'startTime':
        valueA = a.startTime;
        valueB = b.startTime;
        break;
      case 'endTime':
        valueA = a.endTime || 0;
        valueB = b.endTime || 0;
        break;
      case 'duration':
        valueA = a.duration || 0;
        valueB = b.duration || 0;
        break;
      case 'tabCount':
        valueA = a.tabs.length;
        valueB = b.tabs.length;
        break;
      case 'lastAccessed':
        valueA = Math.max(a.startTime, ...a.tabs.map(tab => tab.timestamp));
        valueB = Math.max(b.startTime, ...b.tabs.map(tab => tab.timestamp));
        break;
      default:
        return 0;
    }

    if (typeof valueA === 'string' && typeof valueB === 'string') {
      const result = valueA.localeCompare(valueB);
      return order === 'asc' ? result : -result;
    }

    if (valueA < valueB) {
      return order === 'asc' ? -1 : 1;
    }
    if (valueA > valueB) {
      return order === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

// =============================================================================
// SESSION ANALYSIS
// =============================================================================

/**
 * Get unique domains from session tabs
 */
export function getSessionDomains(session: Session): string[] {
  const domains = new Set<string>();
  
  session.tabs.forEach(tab => {
    try {
      const url = new URL(tab.url);
      domains.add(url.hostname);
    } catch (error) {
      // Invalid URL, skip
    }
  });

  return Array.from(domains);
}

/**
 * Calculate session statistics
 */
export function getSessionStats(session: Session) {
  const domains = getSessionDomains(session);
  const totalTabs = session.tabs.length;
  const duration = session.duration || (session.isActive ? Date.now() - session.startTime : 0);
  const averageTimePerTab = totalTabs > 0 ? duration / totalTabs : 0;

  return {
    tabCount: totalTabs,
    domainCount: domains.length,
    duration,
    averageTimePerTab,
    domains,
    isActive: session.isActive,
    windowCount: session.windowCount
  };
}

/**
 * Group sessions by date
 */
export function groupSessionsByDate(sessions: Session[]): Record<string, Session[]> {
  const groups: Record<string, Session[]> = {};

  sessions.forEach(session => {
    const date = new Date(session.startTime).toDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(session);
  });

  return groups;
}

/**
 * Get session duration formatted string
 */
export function formatSessionDuration(duration: number): string {
  if (duration < 1000) {
    return '< 1s';
  }

  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format session start time
 */
export function formatSessionDate(timestamp: number, includeTime = true): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - timestamp;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return includeTime ? `Today at ${date.toLocaleTimeString()}` : 'Today';
  } else if (diffDays === 1) {
    return includeTime ? `Yesterday at ${date.toLocaleTimeString()}` : 'Yesterday';
  } else if (diffDays < 7) {
    return includeTime ? 
      `${date.toLocaleDateString('en', { weekday: 'long' })} at ${date.toLocaleTimeString()}` :
      date.toLocaleDateString('en', { weekday: 'long' });
  } else {
    return includeTime ? date.toLocaleString() : date.toLocaleDateString();
  }
}

// =============================================================================
// SESSION VALIDATION
// =============================================================================

/**
 * Validate session name
 */
export function validateSessionName(name: string): string | null {
  if (!name || name.trim().length === 0) {
    return 'Session name is required';
  }
  
  if (name.length > 100) {
    return 'Session name must be less than 100 characters';
  }
  
  return null;
}

/**
 * Validate session description
 */
export function validateSessionDescription(description: string): string | null {
  if (description && description.length > 500) {
    return 'Description must be less than 500 characters';
  }
  
  return null;
}

/**
 * Validate session form data
 */
export function validateSessionForm(data: { name: string; description?: string }): Record<string, string> {
  const errors: Record<string, string> = {};

  const nameError = validateSessionName(data.name);
  if (nameError) {
    errors.name = nameError;
  }

  if (data.description) {
    const descriptionError = validateSessionDescription(data.description);
    if (descriptionError) {
      errors.description = descriptionError;
    }
  }

  return errors;
}

// =============================================================================
// SESSION MERGING AND SPLITTING
// =============================================================================

/**
 * Merge multiple sessions into one
 */
export function mergeSessions(targetSession: Session, sourceSessions: Session[]): Omit<Session, 'id'> {
  // Combine all tabs
  const allTabs: SessionTab[] = [
    ...targetSession.tabs,
    ...sourceSessions.flatMap(session => session.tabs)
  ];

  // Remove duplicate tabs (same URL and similar timestamp)
  const uniqueTabs = allTabs.filter((tab, index, arr) => {
    return !arr.slice(0, index).some(existingTab => 
      existingTab.url === tab.url && 
      Math.abs(existingTab.timestamp - tab.timestamp) < 5000 // 5 second threshold
    );
  });

  // Combine tags
  const allTags: SessionTag[] = [
    ...targetSession.tags,
    ...sourceSessions.flatMap(session => session.tags)
  ];
  const uniqueTags = allTags.filter((tag, index, arr) =>
    !arr.slice(0, index).some(existingTag => existingTag.id === tag.id)
  );

  // Calculate new metadata
  const totalPages = uniqueTabs.length;
  const uniqueDomains = getSessionDomains({ ...targetSession, tabs: uniqueTabs }).length;
  const windowCount = Math.max(
    targetSession.windowCount,
    ...sourceSessions.map(s => s.windowCount)
  );

  return {
    name: targetSession.name,
    description: targetSession.description,
    tags: uniqueTags,
    tabs: uniqueTabs.sort((a, b) => a.timestamp - b.timestamp),
    windowCount,
    startTime: Math.min(
      targetSession.startTime,
      ...sourceSessions.map(s => s.startTime)
    ),
    endTime: targetSession.endTime,
    duration: targetSession.duration,
    isActive: targetSession.isActive,
    metadata: {
      totalPages,
      uniqueDomains,
      bookmarkedPages: 0, // TODO: implement bookmark detection
      averageTimePerPage: 0 // TODO: calculate from navigation events
    }
  };
}

/**
 * Split session tabs into multiple sessions
 */
export function splitSession(session: Session, tabGroups: SessionTab[][]): Omit<Session, 'id'>[] {
  return tabGroups.map((tabs, index) => {
    const domains = new Set(tabs.map(tab => {
      try {
        return new URL(tab.url).hostname;
      } catch {
        return '';
      }
    })).size;

    return {
      name: index === 0 ? session.name : `${session.name} (${index + 1})`,
      description: session.description,
      tags: [...session.tags],
      tabs: tabs.sort((a, b) => a.timestamp - b.timestamp),
      windowCount: 1, // Each split becomes a separate window
      startTime: Math.min(...tabs.map(tab => tab.timestamp)),
      endTime: session.endTime,
      duration: session.duration ? Math.floor(session.duration / tabGroups.length) : undefined,
      isActive: index === 0 ? session.isActive : false,
      metadata: {
        totalPages: tabs.length,
        uniqueDomains: domains,
        bookmarkedPages: 0,
        averageTimePerPage: 0
      }
    };
  });
}

// =============================================================================
// TAG UTILITIES
// =============================================================================

/**
 * Get most commonly used tags from sessions
 */
export function getMostUsedTags(sessions: Session[], limit = 10): Array<{ tag: SessionTag; count: number }> {
  const tagCounts = new Map<string, { tag: SessionTag; count: number }>();

  sessions.forEach(session => {
    session.tags.forEach(tag => {
      const existing = tagCounts.get(tag.id);
      if (existing) {
        existing.count++;
      } else {
        tagCounts.set(tag.id, { tag, count: 1 });
      }
    });
  });

  return Array.from(tagCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Suggest tags based on session content
 */
export function suggestTagsForSession(session: Session, availableTags: SessionTag[]): SessionTag[] {
  const suggestions: SessionTag[] = [];
  const domains = getSessionDomains(session);

  // Domain-based suggestions
  availableTags.forEach(tag => {
    const tagName = tag.name.toLowerCase();
    
    // Check if any domain suggests this tag
    if (domains.some(domain => {
      return domain.includes(tagName) || 
             tagName.includes(domain.replace(/\.(com|net|org|io|co)$/, ''));
    })) {
      suggestions.push(tag);
    }

    // Check tab titles for keywords
    if (session.tabs.some(tab => 
      tab.title.toLowerCase().includes(tagName) ||
      tab.url.toLowerCase().includes(tagName)
    )) {
      suggestions.push(tag);
    }
  });

  // Remove duplicates and existing tags
  const existingTagIds = new Set(session.tags.map(tag => tag.id));
  return suggestions.filter((tag, index, arr) => 
    !existingTagIds.has(tag.id) &&
    arr.findIndex(t => t.id === tag.id) === index
  );
}