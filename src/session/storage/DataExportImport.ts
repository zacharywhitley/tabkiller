/**
 * Data Export/Import Module - Handles session data portability
 * Provides export to multiple formats and import with validation and merging strategies
 */

import {
  StoredSession,
  StoredTab,
  StoredNavigationEvent,
  StoredSessionBoundary,
  DatabaseMetadata
} from './schema';

import {
  BrowsingSession,
  ExportOptions,
  ImportOptions
} from '../../shared/types';

import { SessionDataSerializer } from './SessionDataSerializer';
import { DataIntegrityValidator } from './DataIntegrityValidator';
import { calculateSecureHash, formatBytes, sanitizeObject } from '../utils/dataUtils';

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface ExportResult {
  format: string;
  data: string | ArrayBuffer;
  size: number;
  itemCounts: {
    sessions: number;
    tabs: number;
    navigationEvents: number;
    boundaries: number;
  };
  metadata: {
    exportedAt: number;
    version: string;
    checksum: string;
  };
}

export interface ImportResult {
  success: boolean;
  imported: {
    sessions: number;
    tabs: number;
    navigationEvents: number;
    boundaries: number;
  };
  skipped: {
    sessions: number;
    tabs: number;
    navigationEvents: number;
    boundaries: number;
  };
  errors: string[];
  warnings: string[];
  totalProcessed: number;
  processingTime: number;
}

export interface ExportFilter {
  sessionIds?: string[];
  dateRange?: { start: number; end: number };
  tags?: string[];
  domains?: string[];
  includeContent?: boolean;
  includeMetadata?: boolean;
}

// =============================================================================
// DATA EXPORT/IMPORT MODULE
// =============================================================================

export class DataExportImport {
  private serializer: SessionDataSerializer;
  private validator: DataIntegrityValidator;

  constructor() {
    this.serializer = new SessionDataSerializer({
      enableCompression: false, // Don't compress for export
      preserveMetadata: true
    });

    this.validator = new DataIntegrityValidator({
      enableChecks: true
    });
  }

  // =============================================================================
  // EXPORT FUNCTIONALITY
  // =============================================================================

  /**
   * Export data in specified format
   */
  async exportData(
    sessions: StoredSession[],
    tabs: StoredTab[],
    navigationEvents: StoredNavigationEvent[],
    boundaries: StoredSessionBoundary[],
    options: ExportOptions,
    filter?: ExportFilter
  ): Promise<ExportResult> {
    console.log(`Starting data export in ${options.format} format...`);
    const startTime = performance.now();

    // Apply filters
    const filteredData = this.applyExportFilter({
      sessions,
      tabs,
      navigationEvents,
      boundaries
    }, filter);

    // Generate export based on format
    let exportData: string | ArrayBuffer;
    let size: number;

    switch (options.format) {
      case 'json':
        exportData = await this.exportToJSON(filteredData, options);
        size = new Blob([exportData]).size;
        break;

      case 'csv':
        exportData = await this.exportToCSV(filteredData, options);
        size = new Blob([exportData]).size;
        break;

      case 'html':
        exportData = await this.exportToHTML(filteredData, options);
        size = new Blob([exportData]).size;
        break;

      case 'pdf':
        throw new Error('PDF export not yet implemented');

      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }

    // Calculate metadata
    const metadata = {
      exportedAt: Date.now(),
      version: '1.0.0',
      checksum: await calculateSecureHash({
        sessions: filteredData.sessions,
        tabs: filteredData.tabs,
        navigationEvents: filteredData.navigationEvents,
        boundaries: filteredData.boundaries
      })
    };

    // Apply compression if requested
    if (options.compressed && typeof exportData === 'string') {
      exportData = await this.compressData(exportData);
      size = (exportData as ArrayBuffer).byteLength;
    }

    // Apply encryption if requested
    if (options.encrypted && typeof exportData === 'string') {
      exportData = await this.encryptData(exportData);
      size = (exportData as ArrayBuffer).byteLength;
    }

    const processingTime = performance.now() - startTime;
    console.log(`Export completed in ${processingTime.toFixed(2)}ms, size: ${formatBytes(size)}`);

    return {
      format: options.format,
      data: exportData,
      size,
      itemCounts: {
        sessions: filteredData.sessions.length,
        tabs: filteredData.tabs.length,
        navigationEvents: filteredData.navigationEvents.length,
        boundaries: filteredData.boundaries.length
      },
      metadata
    };
  }

  /**
   * Export to JSON format
   */
  private async exportToJSON(
    data: {
      sessions: StoredSession[];
      tabs: StoredTab[];
      navigationEvents: StoredNavigationEvent[];
      boundaries: StoredSessionBoundary[];
    },
    options: ExportOptions
  ): Promise<string> {
    const exportObject = {
      metadata: {
        version: '1.0.0',
        exportedAt: Date.now(),
        format: 'json',
        options: options
      },
      data: {
        sessions: options.includeSessions ? data.sessions : [],
        tabs: options.includeTabs ? data.tabs : [],
        navigationEvents: options.includeHistory ? data.navigationEvents : [],
        boundaries: data.boundaries
      }
    };

    // Sanitize data for safe export
    const sanitized = sanitizeObject(exportObject, {
      maxStringLength: 10000,
      removeUndefined: true
    });

    return JSON.stringify(sanitized, null, 2);
  }

  /**
   * Export to CSV format
   */
  private async exportToCSV(
    data: {
      sessions: StoredSession[];
      tabs: StoredTab[];
      navigationEvents: StoredNavigationEvent[];
      boundaries: StoredSessionBoundary[];
    },
    options: ExportOptions
  ): Promise<string> {
    const csvParts: string[] = [];

    // Export sessions
    if (options.includeSessions && data.sessions.length > 0) {
      csvParts.push('=== SESSIONS ===');
      csvParts.push(this.sessionsToCsv(data.sessions));
      csvParts.push('');
    }

    // Export tabs
    if (options.includeTabs && data.tabs.length > 0) {
      csvParts.push('=== TABS ===');
      csvParts.push(this.tabsToCsv(data.tabs));
      csvParts.push('');
    }

    // Export navigation events
    if (options.includeHistory && data.navigationEvents.length > 0) {
      csvParts.push('=== NAVIGATION EVENTS ===');
      csvParts.push(this.navigationEventsToCsv(data.navigationEvents));
      csvParts.push('');
    }

    return csvParts.join('\n');
  }

  /**
   * Export to HTML format
   */
  private async exportToHTML(
    data: {
      sessions: StoredSession[];
      tabs: StoredTab[];
      navigationEvents: StoredNavigationEvent[];
      boundaries: StoredSessionBoundary[];
    },
    options: ExportOptions
  ): Promise<string> {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TabKiller Session Export</title>
    <style>
        body { 
            font-family: system-ui, -apple-system, sans-serif; 
            line-height: 1.6; 
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .session { 
            border: 1px solid #ddd; 
            margin: 20px 0; 
            padding: 15px; 
            border-radius: 8px; 
        }
        .session-header { 
            background: #f5f5f5; 
            padding: 10px; 
            margin: -15px -15px 15px; 
            border-radius: 7px 7px 0 0; 
        }
        .tab { 
            margin: 10px 0; 
            padding: 8px; 
            background: #fafafa; 
            border-left: 3px solid #007acc; 
        }
        .metadata { 
            color: #666; 
            font-size: 0.9em; 
        }
        .url { 
            word-break: break-all; 
            color: #007acc; 
        }
        h1, h2, h3 { 
            color: #333; 
        }
        .export-info {
            background: #e8f4f8;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="export-info">
        <h1>TabKiller Session Export</h1>
        <p><strong>Exported:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Sessions:</strong> ${data.sessions.length} | <strong>Tabs:</strong> ${data.tabs.length} | <strong>Navigation Events:</strong> ${data.navigationEvents.length}</p>
    </div>

    ${options.includeSessions ? this.sessionsToHtml(data.sessions, data.tabs) : ''}
    
    ${options.includeHistory ? this.navigationEventsToHtml(data.navigationEvents) : ''}
</body>
</html>`;

    return html;
  }

  // =============================================================================
  // IMPORT FUNCTIONALITY
  // =============================================================================

  /**
   * Import data from various formats
   */
  async importData(
    importData: string | ArrayBuffer,
    options: ImportOptions
  ): Promise<ImportResult> {
    console.log(`Starting data import with ${options.format} format...`);
    const startTime = performance.now();

    let dataString: string;

    // Handle different input types
    if (importData instanceof ArrayBuffer) {
      dataString = new TextDecoder().decode(importData);
    } else {
      dataString = importData;
    }

    let parsedData: any;
    const errors: string[] = [];
    const warnings: string[] = [];
    const imported = { sessions: 0, tabs: 0, navigationEvents: 0, boundaries: 0 };
    const skipped = { sessions: 0, tabs: 0, navigationEvents: 0, boundaries: 0 };

    try {
      // Parse data based on format
      switch (options.format) {
        case 'json':
          parsedData = await this.parseJSONImport(dataString, options);
          break;

        case 'csv':
          parsedData = await this.parseCSVImport(dataString, options);
          break;

        case 'html':
          parsedData = await this.parseHTMLImport(dataString, options);
          break;

        default:
          throw new Error(`Unsupported import format: ${options.format}`);
      }

      // Validate imported data
      if (options.validateData) {
        const validationResult = await this.validateImportedData(parsedData);
        errors.push(...validationResult.errors);
        warnings.push(...validationResult.warnings);
      }

      // Process data based on merge strategy
      const processResult = await this.processImportedData(parsedData, options);
      imported.sessions = processResult.imported.sessions;
      imported.tabs = processResult.imported.tabs;
      imported.navigationEvents = processResult.imported.navigationEvents;
      imported.boundaries = processResult.imported.boundaries;

      skipped.sessions = processResult.skipped.sessions;
      skipped.tabs = processResult.skipped.tabs;
      skipped.navigationEvents = processResult.skipped.navigationEvents;
      skipped.boundaries = processResult.skipped.boundaries;

    } catch (error) {
      errors.push(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const processingTime = performance.now() - startTime;
    const totalProcessed = imported.sessions + imported.tabs + imported.navigationEvents + imported.boundaries;

    console.log(`Import completed in ${processingTime.toFixed(2)}ms, imported ${totalProcessed} items`);

    return {
      success: errors.length === 0,
      imported,
      skipped,
      errors,
      warnings,
      totalProcessed,
      processingTime
    };
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  /**
   * Apply export filter to data
   */
  private applyExportFilter(
    data: {
      sessions: StoredSession[];
      tabs: StoredTab[];
      navigationEvents: StoredNavigationEvent[];
      boundaries: StoredSessionBoundary[];
    },
    filter?: ExportFilter
  ) {
    if (!filter) return data;

    let filteredSessions = data.sessions;
    let filteredTabs = data.tabs;
    let filteredEvents = data.navigationEvents;
    let filteredBoundaries = data.boundaries;

    // Filter by session IDs
    if (filter.sessionIds && filter.sessionIds.length > 0) {
      const sessionIdSet = new Set(filter.sessionIds);
      filteredSessions = filteredSessions.filter(s => sessionIdSet.has(s.id));
      filteredTabs = filteredTabs.filter(t => sessionIdSet.has(t.sessionId));
      filteredEvents = filteredEvents.filter(e => sessionIdSet.has(e.sessionId));
      filteredBoundaries = filteredBoundaries.filter(b => sessionIdSet.has(b.sessionId));
    }

    // Filter by date range
    if (filter.dateRange) {
      const { start, end } = filter.dateRange;
      filteredSessions = filteredSessions.filter(s => 
        s.createdAt >= start && s.createdAt <= end
      );
      filteredTabs = filteredTabs.filter(t => 
        t.createdAt >= start && t.createdAt <= end
      );
      filteredEvents = filteredEvents.filter(e => 
        e.timestamp >= start && e.timestamp <= end
      );
      filteredBoundaries = filteredBoundaries.filter(b => 
        b.timestamp >= start && b.timestamp <= end
      );
    }

    // Filter by tags
    if (filter.tags && filter.tags.length > 0) {
      const tagSet = new Set(filter.tags);
      filteredSessions = filteredSessions.filter(s => tagSet.has(s.tag));
      
      // Filter related data
      const filteredSessionIds = new Set(filteredSessions.map(s => s.id));
      filteredTabs = filteredTabs.filter(t => filteredSessionIds.has(t.sessionId));
      filteredEvents = filteredEvents.filter(e => filteredSessionIds.has(e.sessionId));
      filteredBoundaries = filteredBoundaries.filter(b => filteredSessionIds.has(b.sessionId));
    }

    // Filter by domains
    if (filter.domains && filter.domains.length > 0) {
      const domainSet = new Set(filter.domains);
      
      filteredSessions = filteredSessions.filter(s => 
        s.domains.some(domain => domainSet.has(domain))
      );
      filteredTabs = filteredTabs.filter(t => 
        domainSet.has(t.domain)
      );
      filteredEvents = filteredEvents.filter(e => 
        domainSet.has(e.domain)
      );
    }

    return {
      sessions: filteredSessions,
      tabs: filteredTabs,
      navigationEvents: filteredEvents,
      boundaries: filteredBoundaries
    };
  }

  /**
   * Convert sessions to CSV format
   */
  private sessionsToCsv(sessions: StoredSession[]): string {
    const headers = [
      'ID', 'Tag', 'Created At', 'Updated At', 'Tab Count', 
      'Domains', 'Total Time', 'Purpose', 'Notes'
    ];

    const rows = sessions.map(session => [
      this.escapeCsvValue(session.id),
      this.escapeCsvValue(session.tag),
      new Date(session.createdAt).toISOString(),
      new Date(session.updatedAt).toISOString(),
      session.tabs.length.toString(),
      this.escapeCsvValue(session.domains.join('; ')),
      session.metadata.totalTime.toString(),
      this.escapeCsvValue(session.metadata.purpose || ''),
      this.escapeCsvValue(session.metadata.notes || '')
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  /**
   * Convert tabs to CSV format
   */
  private tabsToCsv(tabs: StoredTab[]): string {
    const headers = [
      'ID', 'Session ID', 'URL', 'Title', 'Domain', 'Window ID',
      'Created At', 'Last Accessed', 'Time Spent', 'Is Active'
    ];

    const rows = tabs.map(tab => [
      tab.id.toString(),
      this.escapeCsvValue(tab.sessionId),
      this.escapeCsvValue(tab.url),
      this.escapeCsvValue(tab.title),
      this.escapeCsvValue(tab.domain),
      tab.windowId.toString(),
      new Date(tab.createdAt).toISOString(),
      new Date(tab.lastAccessed).toISOString(),
      tab.timeSpent.toString(),
      tab.isActive.toString()
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  /**
   * Convert navigation events to CSV format
   */
  private navigationEventsToCsv(events: StoredNavigationEvent[]): string {
    const headers = [
      'Tab ID', 'Session ID', 'URL', 'Domain', 'Referrer', 
      'Timestamp', 'Transition Type'
    ];

    const rows = events.map(event => [
      event.tabId.toString(),
      this.escapeCsvValue(event.sessionId),
      this.escapeCsvValue(event.url),
      this.escapeCsvValue(event.domain),
      this.escapeCsvValue(event.referrer || ''),
      new Date(event.timestamp).toISOString(),
      this.escapeCsvValue(event.transitionType)
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  /**
   * Convert sessions to HTML format
   */
  private sessionsToHtml(sessions: StoredSession[], tabs: StoredTab[]): string {
    const tabsBySession = new Map<string, StoredTab[]>();
    
    tabs.forEach(tab => {
      if (!tabsBySession.has(tab.sessionId)) {
        tabsBySession.set(tab.sessionId, []);
      }
      tabsBySession.get(tab.sessionId)!.push(tab);
    });

    return sessions.map(session => {
      const sessionTabs = tabsBySession.get(session.id) || [];
      
      return `
        <div class="session">
            <div class="session-header">
                <h2>${this.escapeHtml(session.tag)}</h2>
                <div class="metadata">
                    <strong>Created:</strong> ${new Date(session.createdAt).toLocaleString()} |
                    <strong>Tabs:</strong> ${sessionTabs.length} |
                    <strong>Domains:</strong> ${session.domains.join(', ')}
                </div>
                ${session.metadata.purpose ? `<p><strong>Purpose:</strong> ${this.escapeHtml(session.metadata.purpose)}</p>` : ''}
                ${session.metadata.notes ? `<p><strong>Notes:</strong> ${this.escapeHtml(session.metadata.notes)}</p>` : ''}
            </div>
            
            <h3>Tabs (${sessionTabs.length})</h3>
            ${sessionTabs.map(tab => `
                <div class="tab">
                    <strong>${this.escapeHtml(tab.title)}</strong><br>
                    <div class="url">${this.escapeHtml(tab.url)}</div>
                    <div class="metadata">
                        Window: ${tab.windowId} | 
                        Time: ${this.formatDuration(tab.timeSpent)} |
                        Accessed: ${new Date(tab.lastAccessed).toLocaleString()}
                    </div>
                </div>
            `).join('')}
        </div>
      `;
    }).join('');
  }

  /**
   * Convert navigation events to HTML format
   */
  private navigationEventsToHtml(events: StoredNavigationEvent[]): string {
    const eventsBySession = new Map<string, StoredNavigationEvent[]>();
    
    events.forEach(event => {
      if (!eventsBySession.has(event.sessionId)) {
        eventsBySession.set(event.sessionId, []);
      }
      eventsBySession.get(event.sessionId)!.push(event);
    });

    return `
      <h2>Navigation History</h2>
      ${Array.from(eventsBySession.entries()).map(([sessionId, sessionEvents]) => `
        <div class="session">
          <h3>Session: ${sessionId}</h3>
          ${sessionEvents.map(event => `
            <div class="tab">
              <div class="url">${this.escapeHtml(event.url)}</div>
              <div class="metadata">
                Tab: ${event.tabId} | 
                ${new Date(event.timestamp).toLocaleString()} |
                Type: ${event.transitionType}
                ${event.referrer ? ` | From: ${this.escapeHtml(event.referrer)}` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `).join('')}
    `;
  }

  /**
   * Parse JSON import data
   */
  private async parseJSONImport(data: string, options: ImportOptions): Promise<any> {
    try {
      const parsed = JSON.parse(data);
      
      // Validate structure
      if (!parsed.data || typeof parsed.data !== 'object') {
        throw new Error('Invalid JSON structure: missing data object');
      }

      return parsed.data;
    } catch (error) {
      throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse CSV import data
   */
  private async parseCSVImport(data: string, options: ImportOptions): Promise<any> {
    // CSV parsing would be implemented here
    // For now, throw an error as it's complex to implement fully
    throw new Error('CSV import not yet implemented');
  }

  /**
   * Parse HTML import data
   */
  private async parseHTMLImport(data: string, options: ImportOptions): Promise<any> {
    // HTML parsing would be implemented here
    // For now, throw an error as it's complex to implement fully
    throw new Error('HTML import not yet implemented');
  }

  /**
   * Validate imported data
   */
  private async validateImportedData(data: any): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate sessions
    if (data.sessions && Array.isArray(data.sessions)) {
      for (const session of data.sessions) {
        const result = await this.validator.validateSession(session);
        errors.push(...result.errors.map(e => `Session ${session.id}: ${e.message}`));
        warnings.push(...result.warnings.map(w => `Session ${session.id}: ${w.message}`));
      }
    }

    // Validate tabs
    if (data.tabs && Array.isArray(data.tabs)) {
      for (const tab of data.tabs) {
        const result = await this.validator.validateTab(tab);
        errors.push(...result.errors.map(e => `Tab ${tab.id}: ${e.message}`));
        warnings.push(...result.warnings.map(w => `Tab ${tab.id}: ${w.message}`));
      }
    }

    return { errors, warnings };
  }

  /**
   * Process imported data based on merge strategy
   */
  private async processImportedData(
    data: any, 
    options: ImportOptions
  ): Promise<{
    imported: { sessions: number; tabs: number; navigationEvents: number; boundaries: number };
    skipped: { sessions: number; tabs: number; navigationEvents: number; boundaries: number };
  }> {
    const imported = { sessions: 0, tabs: 0, navigationEvents: 0, boundaries: 0 };
    const skipped = { sessions: 0, tabs: 0, navigationEvents: 0, boundaries: 0 };

    // This would implement the actual data processing logic
    // For now, just count the items that would be imported
    if (data.sessions && Array.isArray(data.sessions)) {
      imported.sessions = data.sessions.length;
    }

    if (data.tabs && Array.isArray(data.tabs)) {
      imported.tabs = data.tabs.length;
    }

    if (data.navigationEvents && Array.isArray(data.navigationEvents)) {
      imported.navigationEvents = data.navigationEvents.length;
    }

    if (data.boundaries && Array.isArray(data.boundaries)) {
      imported.boundaries = data.boundaries.length;
    }

    return { imported, skipped };
  }

  /**
   * Utility methods
   */
  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Data compression (placeholder implementation)
   */
  private async compressData(data: string): Promise<ArrayBuffer> {
    // In a real implementation, this would use compression libraries
    const encoder = new TextEncoder();
    return encoder.encode(data).buffer;
  }

  /**
   * Data encryption (placeholder implementation)
   */
  private async encryptData(data: string): Promise<ArrayBuffer> {
    // In a real implementation, this would use Web Crypto API for encryption
    const encoder = new TextEncoder();
    return encoder.encode(data).buffer;
  }
}