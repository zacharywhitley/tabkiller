/**
 * Optimized query functions for browsing patterns and temporal analysis
 * Provides high-level querying interface for common browsing history operations
 */

import { DatabaseConnection } from './connection';
import {
  NodeType,
  RelationshipType,
  PageNode,
  SessionNode,
  TagNode,
  DomainNode,
  GraphTriple,
  SchemaUtils
} from './schema';
import { BrowsingSession, TabInfo } from '../shared/types';
import { GraphToEventTransformer } from './models';

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  timeRange?: {
    start: number;
    end: number;
  };
}

export interface PageQueryResult {
  pages: PageNode[];
  totalCount: number;
}

export interface SessionQueryResult {
  sessions: SessionNode[];
  totalCount: number;
}

export interface BrowsingPattern {
  pattern: string[];
  frequency: number;
  avgTimeSpent: number;
  lastOccurrence: number;
}

export interface DomainStatistics {
  domain: string;
  visitCount: number;
  totalTimeSpent: number;
  uniquePages: number;
  lastVisited: number;
  averageTimePerVisit: number;
}

export interface TimeSeriesData {
  timestamp: number;
  value: number;
  label?: string;
}

/**
 * High-level query interface for browsing history graph
 */
export class BrowsingHistoryQueries {
  private db: DatabaseConnection;
  private transformer = new GraphToEventTransformer();

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /**
   * Find pages by URL pattern or title
   */
  async findPages(
    searchTerm: string,
    options: QueryOptions = {}
  ): Promise<PageQueryResult> {
    const graph = this.db.getDatabase();
    const { limit = 50, offset = 0 } = options;

    return new Promise((resolve, reject) => {
      const pages: PageNode[] = [];
      const query = {
        subject: graph.v(),
        predicate: 'type',
        object: NodeType.PAGE
      };

      const stream = graph.searchStream([query]);
      let count = 0;
      let processed = 0;

      stream.on('data', (triple: GraphTriple) => {
        if (processed < offset) {
          processed++;
          return;
        }

        if (pages.length >= limit) {
          return;
        }

        // Get full page data
        this.getPageById(triple.subject).then(page => {
          if (page && (
            page.properties.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
            page.properties.title.toLowerCase().includes(searchTerm.toLowerCase())
          )) {
            pages.push(page);
          }
        }).catch(console.error);

        count++;
      });

      stream.on('end', () => {
        resolve({ pages, totalCount: count });
      });

      stream.on('error', reject);
    });
  }

  /**
   * Get most visited pages
   */
  async getMostVisitedPages(options: QueryOptions = {}): Promise<PageQueryResult> {
    const graph = this.db.getDatabase();
    const { limit = 20, timeRange } = options;

    return new Promise((resolve, reject) => {
      const pages: (PageNode & { visitCount: number })[] = [];
      
      graph.get({
        subject: graph.v('pageId'),
        predicate: 'type',
        object: NodeType.PAGE
      }, (err: any, results: GraphTriple[]) => {
        if (err) {
          reject(err);
          return;
        }

        Promise.all(
          results.slice(0, limit * 2).map(async (triple) => {
            const page = await this.getPageById(triple.subject);
            if (!page) return null;

            // Count visits within time range
            const visitCount = await this.countPageVisits(page.id, timeRange);
            return { ...page, visitCount };
          })
        ).then(results => {
          const validResults = results
            .filter(Boolean)
            .sort((a, b) => b!.visitCount - a!.visitCount)
            .slice(0, limit);

          resolve({
            pages: validResults as PageNode[],
            totalCount: validResults.length
          });
        }).catch(reject);
      });
    });
  }

  /**
   * Get browsing sessions by tag or time range
   */
  async getSessions(
    tag?: string,
    options: QueryOptions = {}
  ): Promise<SessionQueryResult> {
    const graph = this.db.getDatabase();
    const { limit = 20, offset = 0, timeRange } = options;

    return new Promise((resolve, reject) => {
      const sessions: SessionNode[] = [];
      let query: any = {
        subject: graph.v('sessionId'),
        predicate: 'type',
        object: NodeType.SESSION
      };

      // Add tag filter if specified
      if (tag) {
        query = [
          query,
          {
            subject: graph.v('sessionId'),
            predicate: 'tag',
            object: tag
          }
        ];
      }

      graph.get(query, (err: any, results: GraphTriple[]) => {
        if (err) {
          reject(err);
          return;
        }

        Promise.all(
          results
            .slice(offset, offset + limit)
            .map(triple => this.getSessionById(triple.subject))
        ).then(sessions => {
          const validSessions = sessions.filter(Boolean) as SessionNode[];
          
          // Apply time range filter
          const filteredSessions = timeRange
            ? validSessions.filter(s => 
                s.createdAt >= timeRange.start && s.createdAt <= timeRange.end
              )
            : validSessions;

          resolve({
            sessions: filteredSessions,
            totalCount: results.length
          });
        }).catch(reject);
      });
    });
  }

  /**
   * Get current active session
   */
  async getCurrentSession(): Promise<SessionNode | null> {
    const graph = this.db.getDatabase();

    return new Promise((resolve, reject) => {
      graph.get({
        subject: graph.v('sessionId'),
        predicate: 'isActive',
        object: true
      }, (err: any, results: GraphTriple[]) => {
        if (err) {
          reject(err);
          return;
        }

        if (results.length === 0) {
          resolve(null);
          return;
        }

        // Get the most recent active session
        Promise.all(
          results.map(triple => this.getSessionById(triple.subject))
        ).then(sessions => {
          const validSessions = sessions.filter(Boolean) as SessionNode[];
          const mostRecent = validSessions.reduce((latest, current) => 
            current.updatedAt > latest.updatedAt ? current : latest
          );
          resolve(mostRecent);
        }).catch(reject);
      });
    });
  }

  /**
   * Analyze browsing patterns
   */
  async getBrowsingPatterns(
    options: QueryOptions = {}
  ): Promise<BrowsingPattern[]> {
    const { limit = 10, timeRange } = options;
    const patterns: Map<string, BrowsingPattern> = new Map();

    // Get navigation sequences
    const navigations = await this.getNavigationSequences(timeRange);
    
    // Analyze patterns
    for (const sequence of navigations) {
      if (sequence.length < 2) continue;

      for (let i = 0; i < sequence.length - 1; i++) {
        const pattern = [sequence[i].domain, sequence[i + 1].domain];
        const patternKey = pattern.join(' -> ');
        
        const existing = patterns.get(patternKey);
        if (existing) {
          existing.frequency++;
          existing.avgTimeSpent = (existing.avgTimeSpent + sequence[i].timeSpent) / 2;
          existing.lastOccurrence = Math.max(existing.lastOccurrence, sequence[i].timestamp);
        } else {
          patterns.set(patternKey, {
            pattern,
            frequency: 1,
            avgTimeSpent: sequence[i].timeSpent,
            lastOccurrence: sequence[i].timestamp
          });
        }
      }
    }

    return Array.from(patterns.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  }

  /**
   * Get domain statistics
   */
  async getDomainStatistics(options: QueryOptions = {}): Promise<DomainStatistics[]> {
    const graph = this.db.getDatabase();
    const { limit = 20, timeRange } = options;

    return new Promise((resolve, reject) => {
      graph.get({
        subject: graph.v('domainId'),
        predicate: 'type',
        object: NodeType.DOMAIN
      }, (err: any, results: GraphTriple[]) => {
        if (err) {
          reject(err);
          return;
        }

        Promise.all(
          results.map(async (triple) => {
            const domain = await this.getDomainById(triple.subject);
            if (!domain) return null;

            const stats = await this.calculateDomainStats(domain.id, timeRange);
            return {
              domain: domain.properties.hostname,
              visitCount: stats.visitCount,
              totalTimeSpent: stats.totalTimeSpent,
              uniquePages: stats.uniquePages,
              lastVisited: stats.lastVisited,
              averageTimePerVisit: stats.averageTimePerVisit
            };
          })
        ).then(results => {
          const validResults = results
            .filter(Boolean)
            .sort((a, b) => b!.visitCount - a!.visitCount)
            .slice(0, limit);

          resolve(validResults as DomainStatistics[]);
        }).catch(reject);
      });
    });
  }

  /**
   * Get time-based browsing activity
   */
  async getBrowsingActivity(
    granularity: 'hour' | 'day' | 'week' | 'month',
    options: QueryOptions = {}
  ): Promise<TimeSeriesData[]> {
    const { timeRange } = options;
    const now = Date.now();
    const data: Map<number, number> = new Map();

    // Determine time buckets based on granularity
    const bucketSize = this.getBucketSize(granularity);
    const startTime = timeRange?.start || (now - (30 * 24 * 60 * 60 * 1000)); // 30 days default
    const endTime = timeRange?.end || now;

    // Initialize buckets
    for (let time = startTime; time <= endTime; time += bucketSize) {
      data.set(time, 0);
    }

    // Get all page visits in time range
    const visits = await this.getPageVisitsInRange(startTime, endTime);
    
    // Aggregate by time bucket
    visits.forEach(visit => {
      const bucket = Math.floor(visit.timestamp / bucketSize) * bucketSize;
      data.set(bucket, (data.get(bucket) || 0) + 1);
    });

    return Array.from(data.entries())
      .map(([timestamp, value]) => ({
        timestamp,
        value,
        label: this.formatTimeLabel(timestamp, granularity)
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Find related pages based on co-occurrence in sessions
   */
  async getRelatedPages(pageUrl: string, limit = 10): Promise<PageNode[]> {
    const graph = this.db.getDatabase();

    return new Promise((resolve, reject) => {
      // Find the page
      graph.get({
        subject: graph.v('pageId'),
        predicate: 'url',
        object: pageUrl
      }, (err: any, results: GraphTriple[]) => {
        if (err || results.length === 0) {
          resolve([]);
          return;
        }

        const pageId = results[0].subject;

        // Find sessions containing this page
        graph.get({
          subject: pageId,
          predicate: RelationshipType.PART_OF_SESSION,
          object: graph.v('sessionId')
        }, (err: any, sessionResults: GraphTriple[]) => {
          if (err) {
            reject(err);
            return;
          }

          const sessionIds = sessionResults.map(r => r.object);
          
          // Find other pages in these sessions
          Promise.all(
            sessionIds.map(sessionId =>
              new Promise<string[]>((resolve) => {
                graph.get({
                  subject: graph.v('otherPageId'),
                  predicate: RelationshipType.PART_OF_SESSION,
                  object: sessionId
                }, (err: any, pageResults: GraphTriple[]) => {
                  if (err) {
                    resolve([]);
                    return;
                  }
                  
                  resolve(pageResults
                    .map(r => r.subject)
                    .filter(id => id !== pageId)
                  );
                });
              })
            )
          ).then(async (pageGroups) => {
            // Count co-occurrences
            const coOccurrences: Map<string, number> = new Map();
            pageGroups.flat().forEach(pageId => {
              coOccurrences.set(pageId, (coOccurrences.get(pageId) || 0) + 1);
            });

            // Get top related pages
            const sortedPages = Array.from(coOccurrences.entries())
              .sort(([, a], [, b]) => b - a)
              .slice(0, limit);

            const relatedPages = await Promise.all(
              sortedPages.map(([pageId]) => this.getPageById(pageId))
            );

            resolve(relatedPages.filter(Boolean) as PageNode[]);
          }).catch(reject);
        });
      });
    });
  }

  /**
   * Search pages by content (if SingleFile content is available)
   */
  async searchPageContent(
    searchTerm: string,
    options: QueryOptions = {}
  ): Promise<PageQueryResult> {
    // This would require full-text search capabilities
    // For now, implement basic title/URL search
    return this.findPages(searchTerm, options);
  }

  // Private helper methods
  private async getPageById(id: string): Promise<PageNode | null> {
    const graph = this.db.getDatabase();
    
    return new Promise((resolve, reject) => {
      graph.get({ subject: id }, (err: any, results: GraphTriple[]) => {
        if (err) {
          reject(err);
          return;
        }

        if (results.length === 0) {
          resolve(null);
          return;
        }

        const page = this.triplesToPage(results);
        resolve(page);
      });
    });
  }

  private async getSessionById(id: string): Promise<SessionNode | null> {
    const graph = this.db.getDatabase();
    
    return new Promise((resolve, reject) => {
      graph.get({ subject: id }, (err: any, results: GraphTriple[]) => {
        if (err) {
          reject(err);
          return;
        }

        if (results.length === 0) {
          resolve(null);
          return;
        }

        const session = this.triplesToSession(results);
        resolve(session);
      });
    });
  }

  private async getDomainById(id: string): Promise<DomainNode | null> {
    const graph = this.db.getDatabase();
    
    return new Promise((resolve, reject) => {
      graph.get({ subject: id }, (err: any, results: GraphTriple[]) => {
        if (err) {
          reject(err);
          return;
        }

        if (results.length === 0) {
          resolve(null);
          return;
        }

        const domain = this.triplesToDomain(results);
        resolve(domain);
      });
    });
  }

  private async countPageVisits(
    pageId: string, 
    timeRange?: { start: number; end: number }
  ): Promise<number> {
    const graph = this.db.getDatabase();
    
    return new Promise((resolve, reject) => {
      graph.get({
        subject: graph.v('navId'),
        predicate: 'to',
        object: pageId
      }, (err: any, results: GraphTriple[]) => {
        if (err) {
          reject(err);
          return;
        }

        if (!timeRange) {
          resolve(results.length);
          return;
        }

        // Filter by time range
        Promise.all(
          results.map(triple =>
            new Promise<boolean>((resolve) => {
              graph.get({
                subject: triple.subject,
                predicate: 'timestamp'
              }, (err: any, timeResults: GraphTriple[]) => {
                if (err || timeResults.length === 0) {
                  resolve(false);
                  return;
                }
                
                const timestamp = timeResults[0].object as number;
                resolve(timestamp >= timeRange.start && timestamp <= timeRange.end);
              });
            })
          )
        ).then(validations => {
          const count = validations.filter(Boolean).length;
          resolve(count);
        }).catch(reject);
      });
    });
  }

  private async getNavigationSequences(
    timeRange?: { start: number; end: number }
  ): Promise<Array<Array<{ domain: string; timestamp: number; timeSpent: number }>>> {
    // This would require traversing navigation relationships
    // Implementation would be complex, returning empty for now
    return [];
  }

  private async calculateDomainStats(
    domainId: string,
    timeRange?: { start: number; end: number }
  ): Promise<{
    visitCount: number;
    totalTimeSpent: number;
    uniquePages: number;
    lastVisited: number;
    averageTimePerVisit: number;
  }> {
    // Implementation would calculate actual statistics
    return {
      visitCount: 0,
      totalTimeSpent: 0,
      uniquePages: 0,
      lastVisited: 0,
      averageTimePerVisit: 0
    };
  }

  private async getPageVisitsInRange(
    start: number,
    end: number
  ): Promise<Array<{ timestamp: number; pageId: string }>> {
    // Implementation would query navigation relationships within time range
    return [];
  }

  private getBucketSize(granularity: 'hour' | 'day' | 'week' | 'month'): number {
    const sizes = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000
    };
    return sizes[granularity];
  }

  private formatTimeLabel(timestamp: number, granularity: 'hour' | 'day' | 'week' | 'month'): string {
    const date = new Date(timestamp);
    
    switch (granularity) {
      case 'hour':
        return date.toLocaleString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          hour: 'numeric' 
        });
      case 'day':
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
      case 'week':
        return `Week of ${date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        })}`;
      case 'month':
        return date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long' 
        });
      default:
        return date.toLocaleDateString();
    }
  }

  private triplesToPage(triples: GraphTriple[]): PageNode | null {
    const properties: any = {};
    let id = '';
    let createdAt = 0;
    let updatedAt = 0;

    for (const triple of triples) {
      const { subject, predicate, object } = triple;
      
      if (!id) id = subject;
      
      switch (predicate) {
        case 'createdAt':
          createdAt = object as number;
          break;
        case 'updatedAt':
          updatedAt = object as number;
          break;
        case 'type':
          break; // Skip type predicate
        default:
          try {
            properties[predicate] = typeof object === 'string' && object.startsWith('{')
              ? JSON.parse(object)
              : object;
          } catch {
            properties[predicate] = object;
          }
      }
    }

    if (!id || !properties.url) return null;

    return {
      id,
      type: NodeType.PAGE,
      createdAt,
      updatedAt,
      properties
    } as PageNode;
  }

  private triplesToSession(triples: GraphTriple[]): SessionNode | null {
    const properties: any = {};
    let id = '';
    let createdAt = 0;
    let updatedAt = 0;

    for (const triple of triples) {
      const { subject, predicate, object } = triple;
      
      if (!id) id = subject;
      
      switch (predicate) {
        case 'createdAt':
          createdAt = object as number;
          break;
        case 'updatedAt':
          updatedAt = object as number;
          break;
        case 'type':
          break; // Skip type predicate
        default:
          try {
            properties[predicate] = typeof object === 'string' && object.startsWith('{')
              ? JSON.parse(object)
              : object;
          } catch {
            properties[predicate] = object;
          }
      }
    }

    if (!id || !properties.tag) return null;

    return {
      id,
      type: NodeType.SESSION,
      createdAt,
      updatedAt,
      properties
    } as SessionNode;
  }

  private triplesToDomain(triples: GraphTriple[]): DomainNode | null {
    const properties: any = {};
    let id = '';
    let createdAt = 0;
    let updatedAt = 0;

    for (const triple of triples) {
      const { subject, predicate, object } = triple;
      
      if (!id) id = subject;
      
      switch (predicate) {
        case 'createdAt':
          createdAt = object as number;
          break;
        case 'updatedAt':
          updatedAt = object as number;
          break;
        case 'type':
          break; // Skip type predicate
        default:
          try {
            properties[predicate] = typeof object === 'string' && object.startsWith('{')
              ? JSON.parse(object)
              : object;
          } catch {
            properties[predicate] = object;
          }
      }
    }

    if (!id || !properties.hostname) return null;

    return {
      id,
      type: NodeType.DOMAIN,
      createdAt,
      updatedAt,
      properties
    } as DomainNode;
  }
}

/**
 * Specialized queries for performance optimization
 */
export class OptimizedQueries extends BrowsingHistoryQueries {
  /**
   * Get recent browsing activity with caching
   */
  async getRecentActivity(hours = 24): Promise<PageNode[]> {
    const timeRange = {
      start: Date.now() - (hours * 60 * 60 * 1000),
      end: Date.now()
    };

    const result = await this.findPages('', { 
      limit: 50, 
      timeRange,
      orderBy: 'createdAt',
      orderDirection: 'desc' as const
    });

    return result.pages;
  }

  /**
   * Get browsing summary for dashboard
   */
  async getDashboardSummary(): Promise<{
    totalPages: number;
    totalSessions: number;
    totalTime: number;
    topDomains: DomainStatistics[];
    recentPages: PageNode[];
  }> {
    const [
      totalPages,
      totalSessions, 
      topDomains,
      recentPages
    ] = await Promise.all([
      this.getTotalPagesCount(),
      this.getTotalSessionsCount(),
      this.getDomainStatistics({ limit: 5 }),
      this.getRecentActivity(24)
    ]);

    const totalTime = topDomains.reduce((sum, domain) => sum + domain.totalTimeSpent, 0);

    return {
      totalPages,
      totalSessions,
      totalTime,
      topDomains,
      recentPages: recentPages.slice(0, 10)
    };
  }

  private async getTotalPagesCount(): Promise<number> {
    const graph = this.db.getDatabase();
    
    return new Promise((resolve, reject) => {
      let count = 0;
      const stream = graph.getStream({
        predicate: 'type',
        object: NodeType.PAGE
      });

      stream.on('data', () => count++);
      stream.on('end', () => resolve(count));
      stream.on('error', reject);
    });
  }

  private async getTotalSessionsCount(): Promise<number> {
    const graph = this.db.getDatabase();
    
    return new Promise((resolve, reject) => {
      let count = 0;
      const stream = graph.getStream({
        predicate: 'type',
        object: NodeType.SESSION
      });

      stream.on('data', () => count++);
      stream.on('end', () => resolve(count));
      stream.on('error', reject);
    });
  }
}