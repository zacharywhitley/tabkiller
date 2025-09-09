/**
 * Session Data Serializer - Handles serialization, compression, and data optimization
 * Converts between domain models and storage models with integrity validation
 */

import {
  BrowsingSession,
  TabInfo,
  NavigationEvent,
  SessionBoundary
} from '../../shared/types';

import {
  StoredSession,
  StoredTab,
  StoredNavigationEvent,
  StoredSessionBoundary
} from './schema';

import { calculateChecksum, extractDomain } from '../utils/dataUtils';

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface SerializerConfig {
  enableCompression: boolean;
  compressionThreshold: number; // bytes
  enableOptimization: boolean;
  preserveMetadata: boolean;
}

export interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  compressionTime: number;
}

// =============================================================================
// SESSION DATA SERIALIZER
// =============================================================================

export class SessionDataSerializer {
  private config: SerializerConfig;

  constructor(config: Partial<SerializerConfig> = {}) {
    this.config = {
      enableCompression: true,
      compressionThreshold: 1024, // 1KB
      enableOptimization: true,
      preserveMetadata: true,
      ...config
    };
  }

  // =============================================================================
  // SESSION SERIALIZATION
  // =============================================================================

  /**
   * Serialize session for storage
   */
  async serializeSession(session: BrowsingSession): Promise<StoredSession> {
    const now = Date.now();
    const domains = this.extractDomainsFromSession(session);
    const serializedData = JSON.stringify(session);
    const originalSize = new Blob([serializedData]).size;

    let optimizedSession = session;
    let compressed = false;
    let finalSize = originalSize;

    // Apply optimizations if enabled
    if (this.config.enableOptimization) {
      optimizedSession = this.optimizeSessionData(session);
    }

    // Apply compression if size exceeds threshold
    if (this.config.enableCompression && originalSize > this.config.compressionThreshold) {
      try {
        const compressionResult = await this.compressSessionData(optimizedSession);
        if (compressionResult.compressedSize < originalSize * 0.9) { // Only use if 10%+ savings
          optimizedSession = compressionResult.data;
          compressed = true;
          finalSize = compressionResult.compressedSize;
        }
      } catch (error) {
        console.warn('Session compression failed, using uncompressed data:', error);
      }
    }

    const storedSession: StoredSession = {
      ...optimizedSession,
      
      // Storage metadata
      version: 1,
      lastModified: now,
      size: finalSize,
      compressed,
      
      // Computed fields for indexing
      domains,
      totalTabCount: session.tabs.length,
      totalNavigationEvents: 0, // Will be calculated separately
      
      // Data integrity
      checksum: calculateChecksum(optimizedSession),
      isValid: true
    };

    return storedSession;
  }

  /**
   * Deserialize session from storage
   */
  async deserializeSession(storedSession: StoredSession): Promise<BrowsingSession> {
    let session = storedSession as BrowsingSession;

    // Decompress if needed
    if (storedSession.compressed) {
      try {
        session = await this.decompressSessionData(storedSession);
      } catch (error) {
        console.error('Failed to decompress session data:', error);
        throw new Error('Session data corruption detected');
      }
    }

    // Validate checksum if enabled
    if (this.config.preserveMetadata) {
      const currentChecksum = calculateChecksum(session);
      if (currentChecksum !== storedSession.checksum) {
        console.warn(`Session checksum mismatch for ${session.id}`);
        // Mark as invalid but still return data
      }
    }

    return session;
  }

  // =============================================================================
  // TAB SERIALIZATION
  // =============================================================================

  /**
   * Serialize tab for storage
   */
  async serializeTab(tab: TabInfo, sessionId: string): Promise<StoredTab> {
    const now = Date.now();
    const domain = extractDomain(tab.url) || 'unknown';

    const storedTab: StoredTab = {
      ...tab,
      
      // Session relationship
      sessionId,
      
      // Enhanced metadata
      domain,
      isActive: false, // Will be updated by lifecycle tracker
      interactionCount: 0,
      focusTime: 0,
      
      // Storage metadata
      version: 1,
      lastModified: now,
      
      // Navigation summary
      navigationCount: 0,
      firstNavigationAt: undefined,
      lastNavigationAt: undefined,
      
      // Data integrity
      checksum: calculateChecksum(tab)
    };

    return storedTab;
  }

  /**
   * Deserialize tab from storage
   */
  async deserializeTab(storedTab: StoredTab): Promise<TabInfo> {
    // Validate checksum
    const expectedChecksum = calculateChecksum({
      id: storedTab.id,
      url: storedTab.url,
      title: storedTab.title,
      favicon: storedTab.favicon,
      windowId: storedTab.windowId,
      createdAt: storedTab.createdAt,
      lastAccessed: storedTab.lastAccessed,
      timeSpent: storedTab.timeSpent,
      scrollPosition: storedTab.scrollPosition,
      formData: storedTab.formData
    });

    if (expectedChecksum !== storedTab.checksum) {
      console.warn(`Tab checksum mismatch for ${storedTab.id}`);
    }

    const tab: TabInfo = {
      id: storedTab.id,
      url: storedTab.url,
      title: storedTab.title,
      favicon: storedTab.favicon,
      windowId: storedTab.windowId,
      createdAt: storedTab.createdAt,
      lastAccessed: storedTab.lastAccessed,
      timeSpent: storedTab.timeSpent,
      scrollPosition: storedTab.scrollPosition,
      formData: storedTab.formData
    };

    return tab;
  }

  // =============================================================================
  // NAVIGATION EVENT SERIALIZATION
  // =============================================================================

  /**
   * Serialize navigation event for storage
   */
  async serializeNavigationEvent(
    event: NavigationEvent, 
    sessionId: string
  ): Promise<StoredNavigationEvent> {
    const domain = extractDomain(event.url) || 'unknown';

    const storedEvent: StoredNavigationEvent = {
      ...event,
      
      // Session relationship
      sessionId,
      
      // Computed fields for indexing
      domain,
      
      // Storage metadata
      version: 1,
      batchId: undefined, // Will be set during batching
      
      // Data integrity
      checksum: calculateChecksum(event)
    };

    return storedEvent;
  }

  /**
   * Deserialize navigation event from storage
   */
  async deserializeNavigationEvent(storedEvent: StoredNavigationEvent): Promise<NavigationEvent> {
    const event: NavigationEvent = {
      tabId: storedEvent.tabId,
      url: storedEvent.url,
      referrer: storedEvent.referrer,
      timestamp: storedEvent.timestamp,
      transitionType: storedEvent.transitionType
    };

    return event;
  }

  // =============================================================================
  // SESSION BOUNDARY SERIALIZATION
  // =============================================================================

  /**
   * Serialize session boundary for storage
   */
  async serializeSessionBoundary(boundary: SessionBoundary): Promise<StoredSessionBoundary> {
    const storedBoundary: StoredSessionBoundary = {
      ...boundary,
      
      // Additional context
      tabCount: boundary.metadata.tabsInvolved?.length || 0,
      windowCount: boundary.metadata.windowsInvolved?.length || 0,
      
      // Storage metadata
      version: 1,
      
      // Data integrity
      checksum: calculateChecksum(boundary)
    };

    return storedBoundary;
  }

  // =============================================================================
  // DATA OPTIMIZATION
  // =============================================================================

  /**
   * Optimize session data for storage efficiency
   */
  private optimizeSessionData(session: BrowsingSession): BrowsingSession {
    const optimized = { ...session };

    // Optimize tabs array
    optimized.tabs = session.tabs.map(tab => ({
      ...tab,
      // Truncate very long URLs
      url: this.truncateUrl(tab.url),
      // Truncate very long titles
      title: this.truncateTitle(tab.title),
      // Remove large form data for old tabs
      formData: this.shouldPreserveFormData(tab) ? tab.formData : undefined
    }));

    // Optimize metadata
    if (optimized.metadata.notes && optimized.metadata.notes.length > 1000) {
      optimized.metadata.notes = optimized.metadata.notes.substring(0, 1000) + '...';
    }

    return optimized;
  }

  /**
   * Compress session data
   */
  private async compressSessionData(session: BrowsingSession): Promise<{
    data: BrowsingSession;
    compressedSize: number;
    originalSize: number;
  }> {
    const originalData = JSON.stringify(session);
    const originalSize = new Blob([originalData]).size;

    // For now, implement simple compression by removing redundant data
    // In a production environment, you'd use a real compression library
    const compressed = this.simpleCompress(session);
    const compressedData = JSON.stringify(compressed);
    const compressedSize = new Blob([compressedData]).size;

    return {
      data: compressed,
      compressedSize,
      originalSize
    };
  }

  /**
   * Decompress session data
   */
  private async decompressSessionData(storedSession: StoredSession): Promise<BrowsingSession> {
    // In a real implementation, this would reverse the compression
    // For now, just return the stored session as-is
    return storedSession as BrowsingSession;
  }

  /**
   * Simple compression by removing redundant data
   */
  private simpleCompress(session: BrowsingSession): BrowsingSession {
    const compressed = { ...session };

    // Create domain mapping to reduce redundancy
    const domainMap = new Map<string, string>();
    let domainIndex = 0;

    // Compress tabs
    compressed.tabs = session.tabs.map(tab => {
      const domain = extractDomain(tab.url);
      if (domain && !domainMap.has(domain)) {
        domainMap.set(domain, `d${domainIndex++}`);
      }

      return {
        ...tab,
        // Use domain shorthand
        url: this.compressUrl(tab.url, domainMap),
        // Remove duplicate favicon URLs
        favicon: this.shouldKeepFavicon(tab.favicon, domainMap) ? tab.favicon : undefined
      };
    });

    return compressed;
  }

  /**
   * URL compression utilities
   */
  private truncateUrl(url: string): string {
    if (url.length <= 500) return url;
    
    try {
      const urlObj = new URL(url);
      // Keep protocol, host, and first part of pathname
      const truncatedPath = urlObj.pathname.length > 200 
        ? urlObj.pathname.substring(0, 200) + '...'
        : urlObj.pathname;
      
      return `${urlObj.protocol}//${urlObj.host}${truncatedPath}`;
    } catch {
      return url.substring(0, 500) + '...';
    }
  }

  private compressUrl(url: string, domainMap: Map<string, string>): string {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const domainKey = domainMap.get(domain);
      
      if (domainKey) {
        return `${domainKey}${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
      }
    } catch {
      // Invalid URL, return as-is
    }
    
    return url;
  }

  /**
   * Title optimization
   */
  private truncateTitle(title: string): string {
    if (title.length <= 200) return title;
    return title.substring(0, 200) + '...';
  }

  /**
   * Form data preservation logic
   */
  private shouldPreserveFormData(tab: TabInfo): boolean {
    // Preserve form data for recent tabs (less than 1 hour old)
    const hourAgo = Date.now() - (60 * 60 * 1000);
    return tab.createdAt > hourAgo;
  }

  /**
   * Favicon optimization
   */
  private shouldKeepFavicon(favicon: string | undefined, domainMap: Map<string, string>): boolean {
    if (!favicon) return false;
    
    // Keep favicon if it's the first one we've seen for this domain
    try {
      const domain = extractDomain(favicon);
      return domain ? !domainMap.has(domain) : true;
    } catch {
      return true;
    }
  }

  /**
   * Extract domains from session for indexing
   */
  private extractDomainsFromSession(session: BrowsingSession): string[] {
    const domains = new Set<string>();
    
    for (const tab of session.tabs) {
      const domain = extractDomain(tab.url);
      if (domain) {
        domains.add(domain);
      }
    }
    
    return Array.from(domains);
  }

  // =============================================================================
  // BATCH OPERATIONS
  // =============================================================================

  /**
   * Serialize multiple sessions for batch storage
   */
  async serializeBatch(sessions: BrowsingSession[]): Promise<StoredSession[]> {
    const serialized: StoredSession[] = [];
    
    for (const session of sessions) {
      try {
        const storedSession = await this.serializeSession(session);
        serialized.push(storedSession);
      } catch (error) {
        console.error(`Failed to serialize session ${session.id}:`, error);
        // Continue with other sessions
      }
    }
    
    return serialized;
  }

  /**
   * Deserialize multiple sessions from storage
   */
  async deserializeBatch(storedSessions: StoredSession[]): Promise<BrowsingSession[]> {
    const deserialized: BrowsingSession[] = [];
    
    for (const storedSession of storedSessions) {
      try {
        const session = await this.deserializeSession(storedSession);
        deserialized.push(session);
      } catch (error) {
        console.error(`Failed to deserialize session ${storedSession.id}:`, error);
        // Continue with other sessions
      }
    }
    
    return deserialized;
  }

  // =============================================================================
  // COMPRESSION STATISTICS
  // =============================================================================

  /**
   * Calculate compression statistics
   */
  async getCompressionStats(data: any): Promise<CompressionStats> {
    const startTime = performance.now();
    const originalData = JSON.stringify(data);
    const originalSize = new Blob([originalData]).size;
    
    let compressedSize = originalSize;
    
    try {
      const compressed = await this.compressSessionData(data);
      compressedSize = compressed.compressedSize;
    } catch {
      // Compression failed, use original size
    }
    
    const compressionTime = performance.now() - startTime;
    
    return {
      originalSize,
      compressedSize,
      compressionRatio: originalSize > 0 ? compressedSize / originalSize : 1,
      compressionTime
    };
  }

  // =============================================================================
  // CONFIGURATION
  // =============================================================================

  /**
   * Update serializer configuration
   */
  updateConfig(newConfig: Partial<SerializerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): SerializerConfig {
    return { ...this.config };
  }
}