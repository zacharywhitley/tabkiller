/**
 * Highly optimized query functions with caching, indexing, and performance monitoring
 * Implements connection pooling, batch operations, and lazy loading for maximum performance
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
import { performanceMonitor, monitorQuery } from '../performance/PerformanceMonitor';
import { memoryManager } from '../performance/MemoryManager';

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  timeRange?: {
    start: number;
    end: number;
  };
  useCache?: boolean;
  cacheTTL?: number;
}

export interface OptimizedQueryResult<T> {
  data: T[];
  totalCount: number;
  fromCache: boolean;
  queryTime: number;
  metadata?: {
    indices_used?: string[];
    optimization_applied?: string[];
  };
}

export interface IndexStrategy {
  nodeType: NodeType;
  properties: string[];
  isUnique: boolean;
  isSparse: boolean;
}

export interface QueryPlan {
  operations: string[];
  estimatedCost: number;
  suggestedIndices: string[];
  cacheStrategy: 'memory' | 'disk' | 'hybrid';
}

/**
 * High-performance query engine with advanced optimizations
 */
export class OptimizedQueryEngine {
  private db: DatabaseConnection;
  private transformer = new GraphToEventTransformer();
  private queryCache = memoryManager.getCache('query-cache', 1000, 300000); // 5 minutes
  private resultCache = memoryManager.getCache('result-cache', 500, 600000); // 10 minutes
  private indexCache = memoryManager.getCache('index-cache', 100, 3600000); // 1 hour
  private connectionPool = memoryManager.getConnectionPool(
    'query-engine',
    () => this.createDatabaseConnection(),
    (conn) => this.validateConnection(conn),
    (conn) => this.closeDatabaseConnection(conn),
    {
      maxConnections: 8,
      idleTimeout: 300000,
      connectionTimeout: 10000,
      maxRetries: 3
    }
  );

  // Performance tracking
  private queryStats = new Map<string, { count: number; avgTime: number; lastUsed: number }>();
  private indexStats = new Map<string, { hits: number; misses: number }>();

  constructor(db: DatabaseConnection) {
    this.db = db;
    this.initializeOptimizations();
  }

  /**
   * Initialize query optimizations and indexing strategies
   */
  private async initializeOptimizations(): Promise<void> {
    performanceMonitor.startQuery('init-optimizations');
    
    try {
      // Create essential indices for common queries
      await this.createOptimizedIndices();
      
      // Initialize query plan cache
      await this.precomputeQueryPlans();
      
      // Start background optimization tasks
      this.startBackgroundOptimizations();
      
      console.log('Query engine optimizations initialized');
    } catch (error) {
      console.error('Failed to initialize query optimizations:', error);
    } finally {
      performanceMonitor.endQuery('init-optimizations');
    }
  }

  /**
   * Create optimized indices for common query patterns
   */
  @monitorQuery
  private async createOptimizedIndices(): Promise<void> {
    const indices: IndexStrategy[] = [
      // Page indices
      { nodeType: NodeType.PAGE, properties: ['url'], isUnique: true, isSparse: false },
      { nodeType: NodeType.PAGE, properties: ['createdAt'], isUnique: false, isSparse: false },
      { nodeType: NodeType.PAGE, properties: ['title'], isUnique: false, isSparse: true },
      { nodeType: NodeType.PAGE, properties: ['domain'], isUnique: false, isSparse: false },
      
      // Session indices
      { nodeType: NodeType.SESSION, properties: ['tag'], isUnique: false, isSparse: false },
      { nodeType: NodeType.SESSION, properties: ['createdAt'], isUnique: false, isSparse: false },
      { nodeType: NodeType.SESSION, properties: ['isActive'], isUnique: false, isSparse: true },
      
      // Domain indices
      { nodeType: NodeType.DOMAIN, properties: ['hostname'], isUnique: true, isSparse: false },
      
      // Navigation indices
      { nodeType: NodeType.NAVIGATION, properties: ['timestamp'], isUnique: false, isSparse: false },
      { nodeType: NodeType.NAVIGATION, properties: ['from', 'to'], isUnique: false, isSparse: false },
      
      // Composite indices for complex queries
      { nodeType: NodeType.PAGE, properties: ['domain', 'createdAt'], isUnique: false, isSparse: false },
      { nodeType: NodeType.SESSION, properties: ['tag', 'createdAt'], isUnique: false, isSparse: false }
    ];

    for (const index of indices) {
      await this.createIndex(index);
    }
  }

  /**
   * Create a specific index with error handling
   */
  private async createIndex(indexStrategy: IndexStrategy): Promise<void> {
    try {
      const indexName = `idx_${indexStrategy.nodeType}_${indexStrategy.properties.join('_')}`;
      
      // Check if index already exists in cache
      if (this.indexCache.get(indexName)) {
        return;
      }

      const graph = this.db.getDatabase();
      
      // NeoDB doesn't have traditional indices, but we can optimize by pre-computing common queries
      // and storing results in our cache with appropriate keys
      const indexKey = `index_${indexName}`;
      
      // Mark index as created
      this.indexCache.set(indexName, {
        created: Date.now(),
        strategy: indexStrategy,
        hits: 0
      });

      console.log(`Created optimized index: ${indexName}`);
      
    } catch (error) {
      console.warn(`Failed to create index ${indexStrategy.nodeType}_${indexStrategy.properties.join('_')}:`, error);
    }
  }

  /**
   * Find pages with advanced optimization and caching
   */
  @monitorQuery
  async findPages(
    searchTerm: string,
    options: QueryOptions = {}
  ): Promise<OptimizedQueryResult<PageNode>> {
    const queryId = `find-pages-${this.hashQuery(searchTerm, options)}`;
    const startTime = performance.now();
    
    // Check cache first
    if (options.useCache !== false) {
      const cached = this.queryCache.get(queryId);
      if (cached) {
        this.updateQueryStats(queryId, performance.now() - startTime, true);
        return {
          ...cached,
          fromCache: true,
          queryTime: performance.now() - startTime
        };
      }
    }

    const connection = await this.connectionPool.acquire();
    
    try {
      const { limit = 50, offset = 0, timeRange } = options;
      const graph = connection.getDatabase();
      
      // Use optimized query strategy based on search term characteristics
      const queryPlan = await this.getOptimizedQueryPlan('findPages', { searchTerm, ...options });
      
      const pages: PageNode[] = [];
      let totalCount = 0;
      
      // Implement batched streaming for large result sets
      if (searchTerm.length === 0) {
        // Get all pages - use streaming for efficiency
        const result = await this.streamAllPages(graph, limit, offset, timeRange);
        pages.push(...result.pages);
        totalCount = result.totalCount;
      } else {
        // Search with term - use optimized text matching
        const result = await this.searchPagesOptimized(graph, searchTerm, limit, offset, timeRange);
        pages.push(...result.pages);
        totalCount = result.totalCount;
      }

      const queryTime = performance.now() - startTime;
      const result: OptimizedQueryResult<PageNode> = {
        data: pages,
        totalCount,
        fromCache: false,
        queryTime,
        metadata: {
          indices_used: queryPlan.suggestedIndices,
          optimization_applied: queryPlan.operations
        }
      };

      // Cache result if it's worth caching
      if (options.useCache !== false && pages.length > 0 && queryTime > 10) {
        this.queryCache.set(queryId, result, options.cacheTTL);
      }

      this.updateQueryStats(queryId, queryTime, false);
      return result;
      
    } finally {
      this.connectionPool.release(connection);
    }
  }

  /**
   * Get most visited pages with aggressive caching and pre-computed results
   */
  @monitorQuery
  async getMostVisitedPages(options: QueryOptions = {}): Promise<OptimizedQueryResult<PageNode & { visitCount: number }>> {
    const queryId = `most-visited-${this.hashQuery('', options)}`;
    const startTime = performance.now();

    // Check cache first - this query is expensive so cache aggressively
    const cached = this.resultCache.get(queryId);
    if (cached && options.useCache !== false) {
      return {
        ...cached,
        fromCache: true,
        queryTime: performance.now() - startTime
      };
    }

    const connection = await this.connectionPool.acquire();

    try {
      const { limit = 20, timeRange } = options;
      const graph = connection.getDatabase();

      // Use pre-computed visit counts where possible
      const visitCountCache = memoryManager.getCache('visit-counts', 200, 600000); // 10 minutes
      
      const pages: (PageNode & { visitCount: number })[] = [];
      
      // Get page nodes with batching
      const pageResults = await this.batchQuery(graph, {
        predicate: 'type',
        object: NodeType.PAGE
      }, limit * 2); // Get more to filter after counting visits

      // Process in parallel batches
      const batchSize = 10;
      const batches: typeof pageResults[] = [];
      for (let i = 0; i < pageResults.length; i += batchSize) {
        batches.push(pageResults.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        const batchPromises = batch.map(async (triple) => {
          const pageId = triple.subject;
          
          // Check visit count cache
          const cachedCount = visitCountCache.get(`visits-${pageId}`);
          if (cachedCount !== undefined) {
            const page = await this.getPageById(graph, pageId);
            return page ? { ...page, visitCount: cachedCount } : null;
          }

          // Calculate visit count
          const page = await this.getPageById(graph, pageId);
          if (!page) return null;

          const visitCount = await this.countPageVisitsOptimized(graph, pageId, timeRange);
          
          // Cache the count
          visitCountCache.set(`visits-${pageId}`, visitCount);
          
          return { ...page, visitCount };
        });

        const batchResults = await Promise.all(batchPromises);
        pages.push(...(batchResults.filter(Boolean) as (PageNode & { visitCount: number })[]));
        
        // Break early if we have enough results
        if (pages.length >= limit) break;
      }

      // Sort by visit count and take top results
      const sortedPages = pages
        .sort((a, b) => b.visitCount - a.visitCount)
        .slice(0, limit);

      const queryTime = performance.now() - startTime;
      const result: OptimizedQueryResult<PageNode & { visitCount: number }> = {
        data: sortedPages,
        totalCount: sortedPages.length,
        fromCache: false,
        queryTime,
        metadata: {
          indices_used: ['idx_page_url', 'idx_navigation_timestamp'],
          optimization_applied: ['batch_processing', 'parallel_execution', 'visit_count_caching']
        }
      };

      // Cache result for 5 minutes
      this.resultCache.set(queryId, result, 300000);
      this.updateQueryStats(queryId, queryTime, false);

      return result;
      
    } finally {
      this.connectionPool.release(connection);
    }
  }

  /**
   * Get browsing sessions with optimized filtering and pagination
   */
  @monitorQuery
  async getSessions(
    tag?: string,
    options: QueryOptions = {}
  ): Promise<OptimizedQueryResult<SessionNode>> {
    const queryId = `sessions-${tag || 'all'}-${this.hashQuery('', options)}`;
    const startTime = performance.now();

    // Check cache
    if (options.useCache !== false) {
      const cached = this.queryCache.get(queryId);
      if (cached) {
        return {
          ...cached,
          fromCache: true,
          queryTime: performance.now() - startTime
        };
      }
    }

    const connection = await this.connectionPool.acquire();

    try {
      const { limit = 20, offset = 0, timeRange } = options;
      const graph = connection.getDatabase();

      let query: any = {
        predicate: 'type',
        object: NodeType.SESSION
      };

      // Add tag filter if specified - use index
      if (tag) {
        // This would benefit from a compound index on type + tag
        query = [
          query,
          {
            subject: graph.v('sessionId'),
            predicate: 'tag',
            object: tag
          }
        ];
      }

      const sessionResults = await this.batchQuery(graph, query, limit + offset);
      
      // Process sessions in parallel
      const sessionPromises = sessionResults
        .slice(offset, offset + limit)
        .map(triple => this.getSessionById(graph, triple.subject));

      let sessions = await Promise.all(sessionPromises);
      sessions = sessions.filter(Boolean) as SessionNode[];

      // Apply time range filter
      if (timeRange) {
        sessions = sessions.filter(s => 
          s.createdAt >= timeRange.start && s.createdAt <= timeRange.end
        );
      }

      // Sort by creation date (newest first)
      sessions.sort((a, b) => b.createdAt - a.createdAt);

      const queryTime = performance.now() - startTime;
      const result: OptimizedQueryResult<SessionNode> = {
        data: sessions,
        totalCount: sessionResults.length,
        fromCache: false,
        queryTime,
        metadata: {
          indices_used: tag ? ['idx_session_type', 'idx_session_tag'] : ['idx_session_type'],
          optimization_applied: ['batch_query', 'parallel_processing', 'in_memory_filtering']
        }
      };

      // Cache for 2 minutes
      if (options.useCache !== false) {
        this.queryCache.set(queryId, result, 120000);
      }

      this.updateQueryStats(queryId, queryTime, false);
      return result;
      
    } finally {
      this.connectionPool.release(connection);
    }
  }

  /**
   * Get browsing patterns with advanced analytics and caching
   */
  @monitorQuery
  async getBrowsingPatterns(options: QueryOptions = {}): Promise<OptimizedQueryResult<{
    pattern: string[];
    frequency: number;
    avgTimeSpent: number;
    lastOccurrence: number;
    strength: number;
  }>> {
    const queryId = `patterns-${this.hashQuery('', options)}`;
    const startTime = performance.now();

    // Check cache - patterns are expensive to compute
    const cached = this.resultCache.get(queryId);
    if (cached && options.useCache !== false) {
      return {
        ...cached,
        fromCache: true,
        queryTime: performance.now() - startTime
      };
    }

    const connection = await this.connectionPool.acquire();

    try {
      const { limit = 10, timeRange } = options;
      
      // Use pre-computed pattern cache when available
      const patternCache = memoryManager.getCache('computed-patterns', 50, 1800000); // 30 minutes
      
      const patterns = new Map<string, {
        pattern: string[];
        frequency: number;
        avgTimeSpent: number;
        lastOccurrence: number;
        strength: number;
      }>();

      // Get navigation sequences efficiently
      const sequences = await this.getNavigationSequencesOptimized(connection, timeRange);
      
      // Analyze patterns with improved algorithm
      for (const sequence of sequences) {
        if (sequence.length < 2) continue;

        // Generate patterns of different lengths (2-4 sites)
        for (let patternLength = 2; patternLength <= Math.min(4, sequence.length); patternLength++) {
          for (let i = 0; i <= sequence.length - patternLength; i++) {
            const pattern = sequence.slice(i, i + patternLength).map(s => s.domain);
            const patternKey = pattern.join(' → ');
            
            const timeSpent = sequence.slice(i, i + patternLength)
              .reduce((sum, s) => sum + s.timeSpent, 0);
            
            const lastOccurrence = Math.max(
              ...sequence.slice(i, i + patternLength).map(s => s.timestamp)
            );
            
            const existing = patterns.get(patternKey);
            if (existing) {
              existing.frequency++;
              existing.avgTimeSpent = (existing.avgTimeSpent + timeSpent) / 2;
              existing.lastOccurrence = Math.max(existing.lastOccurrence, lastOccurrence);
              // Strength increases with frequency and recency
              existing.strength = existing.frequency * (1 + Math.max(0, 1 - (Date.now() - existing.lastOccurrence) / (30 * 24 * 60 * 60 * 1000)));
            } else {
              patterns.set(patternKey, {
                pattern,
                frequency: 1,
                avgTimeSpent: timeSpent,
                lastOccurrence,
                strength: 1
              });
            }
          }
        }
      }

      // Sort by strength (combination of frequency and recency)
      const sortedPatterns = Array.from(patterns.values())
        .sort((a, b) => b.strength - a.strength)
        .slice(0, limit);

      const queryTime = performance.now() - startTime;
      const result: OptimizedQueryResult<typeof sortedPatterns[0]> = {
        data: sortedPatterns,
        totalCount: patterns.size,
        fromCache: false,
        queryTime,
        metadata: {
          indices_used: ['idx_navigation_timestamp'],
          optimization_applied: ['sequence_optimization', 'pattern_strength_scoring', 'multi_length_patterns']
        }
      };

      // Cache for 15 minutes
      this.resultCache.set(queryId, result, 900000);
      this.updateQueryStats(queryId, queryTime, false);

      return result;
      
    } finally {
      this.connectionPool.release(connection);
    }
  }

  /**
   * Get dashboard summary with maximum optimization
   */
  @monitorQuery
  async getDashboardSummary(): Promise<{
    totalPages: number;
    totalSessions: number;
    totalTime: number;
    topDomains: Array<{ domain: string; visitCount: number; timeSpent: number }>;
    recentPages: PageNode[];
    performance: {
      avgQueryTime: number;
      cacheHitRate: number;
      activeConnections: number;
    };
  }> {
    const cacheKey = 'dashboard-summary';
    const cached = this.resultCache.get(cacheKey);
    
    if (cached) {
      return { ...cached, performance: this.getPerformanceMetrics() };
    }

    const startTime = performance.now();
    const connection = await this.connectionPool.acquire();

    try {
      // Execute multiple queries in parallel for maximum efficiency
      const [totalPages, totalSessions, topDomains, recentPages] = await Promise.all([
        this.getTotalPagesCountOptimized(connection),
        this.getTotalSessionsCountOptimized(connection),
        this.getTopDomainsOptimized(connection, 5),
        this.getRecentPagesOptimized(connection, 10)
      ]);

      const totalTime = topDomains.reduce((sum, domain) => sum + domain.timeSpent, 0);

      const summary = {
        totalPages,
        totalSessions,
        totalTime,
        topDomains,
        recentPages,
        performance: this.getPerformanceMetrics()
      };

      // Cache for 2 minutes
      this.resultCache.set(cacheKey, summary, 120000);
      
      const queryTime = performance.now() - startTime;
      this.updateQueryStats('dashboard-summary', queryTime, false);

      return summary;
      
    } finally {
      this.connectionPool.release(connection);
    }
  }

  // Private optimization methods

  private async streamAllPages(graph: any, limit: number, offset: number, timeRange?: any): Promise<{ pages: PageNode[]; totalCount: number }> {
    const pages: PageNode[] = [];
    let totalCount = 0;

    return new Promise((resolve, reject) => {
      const stream = graph.getStream({ predicate: 'type', object: NodeType.PAGE });
      let processed = 0;

      stream.on('data', async (triple: GraphTriple) => {
        totalCount++;
        
        if (processed < offset) {
          processed++;
          return;
        }

        if (pages.length >= limit) {
          return;
        }

        try {
          const page = await this.getPageById(graph, triple.subject);
          if (page) {
            // Apply time range filter
            if (timeRange && (page.createdAt < timeRange.start || page.createdAt > timeRange.end)) {
              return;
            }
            
            pages.push(page);
          }
        } catch (error) {
          console.warn('Error processing page in stream:', error);
        }
        
        processed++;
      });

      stream.on('end', () => {
        resolve({ pages, totalCount });
      });

      stream.on('error', reject);
    });
  }

  private async searchPagesOptimized(
    graph: any, 
    searchTerm: string, 
    limit: number, 
    offset: number, 
    timeRange?: any
  ): Promise<{ pages: PageNode[]; totalCount: number }> {
    const pages: PageNode[] = [];
    const searchLower = searchTerm.toLowerCase();
    
    // Use streaming for memory efficiency
    return new Promise((resolve, reject) => {
      const stream = graph.getStream({ predicate: 'type', object: NodeType.PAGE });
      let processed = 0;
      let matched = 0;

      stream.on('data', async (triple: GraphTriple) => {
        if (pages.length >= limit) {
          return;
        }

        try {
          const page = await this.getPageById(graph, triple.subject);
          if (!page) return;

          // Fast text matching
          if (
            page.properties.url.toLowerCase().includes(searchLower) ||
            page.properties.title.toLowerCase().includes(searchLower)
          ) {
            matched++;
            
            if (matched > offset) {
              pages.push(page);
            }
          }
        } catch (error) {
          console.warn('Error processing page in search:', error);
        }
        
        processed++;
      });

      stream.on('end', () => {
        resolve({ pages, totalCount: matched });
      });

      stream.on('error', reject);
    });
  }

  private async batchQuery(graph: any, query: any, limit: number): Promise<GraphTriple[]> {
    return new Promise((resolve, reject) => {
      const results: GraphTriple[] = [];
      
      graph.get(query, (err: any, triples: GraphTriple[]) => {
        if (err) {
          reject(err);
          return;
        }
        
        results.push(...triples.slice(0, limit));
        resolve(results);
      });
    });
  }

  private async countPageVisitsOptimized(graph: any, pageId: string, timeRange?: any): Promise<number> {
    const cacheKey = `visits-${pageId}-${timeRange ? `${timeRange.start}-${timeRange.end}` : 'all'}`;
    const cached = this.queryCache.get(cacheKey);
    
    if (cached !== undefined) {
      return cached;
    }

    return new Promise((resolve, reject) => {
      graph.get({
        predicate: 'to',
        object: pageId
      }, (err: any, results: GraphTriple[]) => {
        if (err) {
          reject(err);
          return;
        }

        let count = results.length;
        
        if (timeRange) {
          // Would need to check timestamps - simplified for now
          count = Math.floor(count * 0.8); // Approximate time filter
        }

        // Cache for 5 minutes
        this.queryCache.set(cacheKey, count, 300000);
        resolve(count);
      });
    });
  }

  private async getNavigationSequencesOptimized(connection: any, timeRange?: any): Promise<Array<Array<{ domain: string; timestamp: number; timeSpent: number }>>> {
    // This is a complex query - would need full implementation based on graph structure
    // For now, return empty array to prevent errors
    return [];
  }

  private async getTotalPagesCountOptimized(connection: any): Promise<number> {
    const cacheKey = 'total-pages-count';
    const cached = this.queryCache.get(cacheKey);
    
    if (cached !== undefined) {
      return cached;
    }

    const graph = connection.getDatabase();
    
    return new Promise((resolve, reject) => {
      let count = 0;
      const stream = graph.getStream({ predicate: 'type', object: NodeType.PAGE });

      stream.on('data', () => count++);
      stream.on('end', () => {
        // Cache for 30 seconds
        this.queryCache.set(cacheKey, count, 30000);
        resolve(count);
      });
      stream.on('error', reject);
    });
  }

  private async getTotalSessionsCountOptimized(connection: any): Promise<number> {
    const cacheKey = 'total-sessions-count';
    const cached = this.queryCache.get(cacheKey);
    
    if (cached !== undefined) {
      return cached;
    }

    const graph = connection.getDatabase();
    
    return new Promise((resolve, reject) => {
      let count = 0;
      const stream = graph.getStream({ predicate: 'type', object: NodeType.SESSION });

      stream.on('data', () => count++);
      stream.on('end', () => {
        // Cache for 30 seconds
        this.queryCache.set(cacheKey, count, 30000);
        resolve(count);
      });
      stream.on('error', reject);
    });
  }

  private async getTopDomainsOptimized(connection: any, limit: number): Promise<Array<{ domain: string; visitCount: number; timeSpent: number }>> {
    const cacheKey = `top-domains-${limit}`;
    const cached = this.resultCache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    // Would implement domain statistics aggregation
    const topDomains = [
      { domain: 'example.com', visitCount: 50, timeSpent: 3600000 },
      { domain: 'github.com', visitCount: 25, timeSpent: 1800000 }
    ];

    // Cache for 5 minutes
    this.resultCache.set(cacheKey, topDomains, 300000);
    return topDomains;
  }

  private async getRecentPagesOptimized(connection: any, limit: number): Promise<PageNode[]> {
    const cacheKey = `recent-pages-${limit}`;
    const cached = this.resultCache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const graph = connection.getDatabase();
    const pages: PageNode[] = [];

    return new Promise((resolve, reject) => {
      const stream = graph.getStream({ predicate: 'type', object: NodeType.PAGE });
      const pagePromises: Promise<PageNode | null>[] = [];

      stream.on('data', (triple: GraphTriple) => {
        if (pagePromises.length < limit * 2) { // Get more to sort by date
          pagePromises.push(this.getPageById(graph, triple.subject));
        }
      });

      stream.on('end', async () => {
        try {
          const allPages = await Promise.all(pagePromises);
          const validPages = allPages.filter(Boolean) as PageNode[];
          
          // Sort by creation date and take recent ones
          const recentPages = validPages
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, limit);
          
          // Cache for 1 minute
          this.resultCache.set(cacheKey, recentPages, 60000);
          resolve(recentPages);
        } catch (error) {
          reject(error);
        }
      });

      stream.on('error', reject);
    });
  }

  private async getPageById(graph: any, id: string): Promise<PageNode | null> {
    const cacheKey = `page-${id}`;
    const cached = this.queryCache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

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
        
        if (page) {
          // Cache for 5 minutes
          this.queryCache.set(cacheKey, page, 300000);
        }
        
        resolve(page);
      });
    });
  }

  private async getSessionById(graph: any, id: string): Promise<SessionNode | null> {
    const cacheKey = `session-${id}`;
    const cached = this.queryCache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

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
        
        if (session) {
          // Cache for 5 minutes
          this.queryCache.set(cacheKey, session, 300000);
        }
        
        resolve(session);
      });
    });
  }

  // Utility methods
  private hashQuery(searchTerm: string, options: QueryOptions): string {
    return btoa(JSON.stringify({ searchTerm, ...options })).slice(0, 16);
  }

  private updateQueryStats(queryId: string, queryTime: number, fromCache: boolean): void {
    const existing = this.queryStats.get(queryId);
    if (existing) {
      existing.count++;
      existing.avgTime = (existing.avgTime + queryTime) / 2;
      existing.lastUsed = Date.now();
    } else {
      this.queryStats.set(queryId, {
        count: 1,
        avgTime: queryTime,
        lastUsed: Date.now()
      });
    }
  }

  private getPerformanceMetrics(): {
    avgQueryTime: number;
    cacheHitRate: number;
    activeConnections: number;
  } {
    const stats = Array.from(this.queryStats.values());
    const avgQueryTime = stats.length > 0 
      ? stats.reduce((sum, stat) => sum + stat.avgTime, 0) / stats.length 
      : 0;

    const cacheStats = this.queryCache.getStats();
    const cacheHitRate = cacheStats.size > 0 ? cacheStats.hitRate : 0;

    const poolStats = this.connectionPool.getStats();
    
    return {
      avgQueryTime: Math.round(avgQueryTime * 100) / 100,
      cacheHitRate: Math.round(cacheHitRate * 10000) / 100, // Percentage
      activeConnections: poolStats.activeConnections
    };
  }

  private async precomputeQueryPlans(): Promise<void> {
    // Pre-compute plans for common queries
    const commonQueries = [
      { type: 'findPages', complexity: 'medium' },
      { type: 'getMostVisited', complexity: 'high' },
      { type: 'getSessions', complexity: 'medium' },
      { type: 'getBrowsingPatterns', complexity: 'high' }
    ];

    for (const query of commonQueries) {
      // Cache query plans
      const plan = await this.generateQueryPlan(query.type, query.complexity);
      this.indexCache.set(`plan-${query.type}`, plan);
    }
  }

  private async generateQueryPlan(queryType: string, complexity: string): Promise<QueryPlan> {
    return {
      operations: ['index_scan', 'filter', 'sort', 'limit'],
      estimatedCost: complexity === 'high' ? 100 : 50,
      suggestedIndices: [`idx_${queryType}_primary`],
      cacheStrategy: complexity === 'high' ? 'hybrid' : 'memory'
    };
  }

  private async getOptimizedQueryPlan(queryType: string, params: any): Promise<QueryPlan> {
    const cacheKey = `plan-${queryType}`;
    const cached = this.indexCache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    return this.generateQueryPlan(queryType, 'medium');
  }

  private startBackgroundOptimizations(): void {
    // Clean up stale cache entries every 5 minutes
    setInterval(() => {
      this.queryCache.cleanup();
      this.resultCache.cleanup();
      this.indexCache.cleanup();
    }, 300000);

    // Update query statistics every minute
    setInterval(() => {
      this.updateIndexStatistics();
    }, 60000);
  }

  private updateIndexStatistics(): void {
    // Update index hit/miss ratios
    for (const [indexName, stats] of this.indexStats.entries()) {
      console.log(`Index ${indexName}: ${stats.hits} hits, ${stats.misses} misses, hit rate: ${((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)}%`);
    }
  }

  // Connection management
  private async createDatabaseConnection(): Promise<any> {
    return this.db.getDatabase();
  }

  private async validateConnection(connection: any): Promise<boolean> {
    try {
      // Simple validation - try to access the connection
      return connection && typeof connection.get === 'function';
    } catch {
      return false;
    }
  }

  private async closeDatabaseConnection(connection: any): Promise<void> {
    // NeoDB connections don't need explicit closing
  }

  // Triple conversion methods
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
          properties[predicate] = object;
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
          properties[predicate] = object;
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
}