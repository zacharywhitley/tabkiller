/**
 * Repository pattern implementation for CRUD operations on graph entities
 * Provides high-level interface for managing pages, sessions, tags, and relationships
 */

import { DatabaseConnection } from './connection';
import {
  NodeType,
  RelationshipType,
  GraphNode,
  GraphRelationship,
  GraphTriple,
  PageNode,
  SessionNode,
  TagNode,
  DomainNode,
  UserNode,
  DeviceNode,
  SchemaUtils,
  SCHEMA_CONSTRAINTS
} from './schema';
import { TabKillerError } from '../shared/types';

/**
 * Base repository with common CRUD operations
 */
export abstract class BaseRepository<T extends GraphNode> {
  protected db: DatabaseConnection;
  protected nodeType: NodeType;

  constructor(db: DatabaseConnection, nodeType: NodeType) {
    this.db = db;
    this.nodeType = nodeType;
  }

  /**
   * Create a new node
   */
  async create(node: T): Promise<T> {
    const graph = this.db.getDatabase();
    
    // Validate node
    const errors = SchemaUtils.validateNode(node, SCHEMA_CONSTRAINTS);
    if (errors.length > 0) {
      throw new TabKillerError(
        'VALIDATION_ERROR',
        `Node validation failed: ${errors.join(', ')}`,
        'background',
        { errors, node }
      );
    }

    // Convert to triples
    const triples = SchemaUtils.nodeToTriples(node);
    const indexTriples = SchemaUtils.createIndexTriples(node, SCHEMA_CONSTRAINTS);
    const allTriples = [...triples, ...indexTriples];

    return new Promise((resolve, reject) => {
      graph.put(allTriples, (err: any) => {
        if (err) {
          reject(new TabKillerError(
            'DB_CREATE_FAILED',
            'Failed to create node',
            'background',
            { error: err, nodeId: node.id }
          ));
        } else {
          resolve(node);
        }
      });
    });
  }

  /**
   * Get node by ID
   */
  async getById(id: string): Promise<T | null> {
    const graph = this.db.getDatabase();

    return new Promise((resolve, reject) => {
      graph.get({ subject: id }, (err: any, results: GraphTriple[]) => {
        if (err) {
          reject(new TabKillerError(
            'DB_READ_FAILED',
            'Failed to read node',
            'background',
            { error: err, nodeId: id }
          ));
          return;
        }

        if (results.length === 0) {
          resolve(null);
          return;
        }

        try {
          const node = this.triplesToNode(results);
          resolve(node);
        } catch (error) {
          reject(new TabKillerError(
            'NODE_PARSE_FAILED',
            'Failed to parse node from triples',
            'background',
            { error, nodeId: id, triples: results }
          ));
        }
      });
    });
  }

  /**
   * Update existing node
   */
  async update(node: T): Promise<T> {
    const graph = this.db.getDatabase();
    const existingNode = await this.getById(node.id);
    
    if (!existingNode) {
      throw new TabKillerError(
        'NODE_NOT_FOUND',
        `Node not found: ${node.id}`,
        'background',
        { nodeId: node.id }
      );
    }

    // Update timestamp
    node.updatedAt = Date.now();

    // Remove old triples
    await this.delete(node.id);

    // Create new triples
    return this.create(node);
  }

  /**
   * Delete node by ID
   */
  async delete(id: string): Promise<boolean> {
    const graph = this.db.getDatabase();

    return new Promise((resolve, reject) => {
      // Delete all triples where this node is subject
      graph.del({ subject: id }, (err: any) => {
        if (err) {
          reject(new TabKillerError(
            'DB_DELETE_FAILED',
            'Failed to delete node',
            'background',
            { error: err, nodeId: id }
          ));
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Find nodes by property value
   */
  async findBy(property: string, value: any, limit = 10): Promise<T[]> {
    const graph = this.db.getDatabase();

    return new Promise((resolve, reject) => {
      const query = [
        {
          subject: graph.v('nodeId'),
          predicate: 'type',
          object: this.nodeType
        },
        {
          subject: graph.v('nodeId'),
          predicate: property,
          object: value
        }
      ];

      graph.get(query, (err: any, results: GraphTriple[]) => {
        if (err) {
          reject(new TabKillerError(
            'DB_QUERY_FAILED',
            'Failed to query nodes',
            'background',
            { error: err, property, value }
          ));
          return;
        }

        const nodeIds = [...new Set(results.map(r => r.subject))].slice(0, limit);
        
        Promise.all(nodeIds.map(id => this.getById(id)))
          .then(nodes => resolve(nodes.filter(Boolean) as T[]))
          .catch(reject);
      });
    });
  }

  /**
   * Get all nodes of this type
   */
  async getAll(limit = 50, offset = 0): Promise<T[]> {
    const graph = this.db.getDatabase();

    return new Promise((resolve, reject) => {
      graph.get({
        subject: graph.v('nodeId'),
        predicate: 'type',
        object: this.nodeType
      }, (err: any, results: GraphTriple[]) => {
        if (err) {
          reject(new TabKillerError(
            'DB_QUERY_FAILED',
            'Failed to get all nodes',
            'background',
            { error: err, nodeType: this.nodeType }
          ));
          return;
        }

        const nodeIds = results
          .map(r => r.subject)
          .slice(offset, offset + limit);
        
        Promise.all(nodeIds.map(id => this.getById(id)))
          .then(nodes => resolve(nodes.filter(Boolean) as T[]))
          .catch(reject);
      });
    });
  }

  /**
   * Count total nodes of this type
   */
  async count(): Promise<number> {
    const graph = this.db.getDatabase();

    return new Promise((resolve, reject) => {
      let count = 0;
      const stream = graph.getStream({
        predicate: 'type',
        object: this.nodeType
      });

      stream.on('data', () => count++);
      stream.on('end', () => resolve(count));
      stream.on('error', reject);
    });
  }

  /**
   * Abstract method to convert triples to node (implemented by subclasses)
   */
  protected abstract triplesToNode(triples: GraphTriple[]): T;
}

/**
 * Repository for Page entities
 */
export class PageRepository extends BaseRepository<PageNode> {
  constructor(db: DatabaseConnection) {
    super(db, NodeType.PAGE);
  }

  /**
   * Find pages by URL
   */
  async findByUrl(url: string): Promise<PageNode | null> {
    const pages = await this.findBy('url', url, 1);
    return pages[0] || null;
  }

  /**
   * Find pages by title pattern
   */
  async findByTitle(titlePattern: string, limit = 10): Promise<PageNode[]> {
    const graph = this.db.getDatabase();

    return new Promise((resolve, reject) => {
      const allPages = graph.getStream({
        subject: graph.v('pageId'),
        predicate: 'type',
        object: NodeType.PAGE
      });

      const matchedPages: PageNode[] = [];
      let processed = 0;

      allPages.on('data', async (triple: GraphTriple) => {
        if (matchedPages.length >= limit) return;

        try {
          const page = await this.getById(triple.subject);
          if (page && page.properties.title.toLowerCase().includes(titlePattern.toLowerCase())) {
            matchedPages.push(page);
          }
        } catch (error) {
          console.warn('Error processing page in title search:', error);
        }

        processed++;
      });

      allPages.on('end', () => {
        resolve(matchedPages);
      });

      allPages.on('error', reject);
    });
  }

  /**
   * Get pages by domain
   */
  async findByDomain(hostname: string, limit = 20): Promise<PageNode[]> {
    const graph = this.db.getDatabase();

    return new Promise((resolve, reject) => {
      const allPages = graph.getStream({
        subject: graph.v('pageId'),
        predicate: 'type',
        object: NodeType.PAGE
      });

      const matchedPages: PageNode[] = [];

      allPages.on('data', async (triple: GraphTriple) => {
        if (matchedPages.length >= limit) return;

        try {
          const page = await this.getById(triple.subject);
          if (page) {
            const pageHostname = new URL(page.properties.url).hostname;
            if (pageHostname === hostname) {
              matchedPages.push(page);
            }
          }
        } catch (error) {
          // Ignore invalid URLs
        }
      });

      allPages.on('end', () => {
        resolve(matchedPages);
      });

      allPages.on('error', reject);
    });
  }

  /**
   * Update visit count
   */
  async incrementVisitCount(pageId: string, timeSpent = 0): Promise<void> {
    const page = await this.getById(pageId);
    if (page) {
      page.properties.visitCount = (page.properties.visitCount || 0) + 1;
      page.properties.totalTimeSpent = (page.properties.totalTimeSpent || 0) + timeSpent;
      page.updatedAt = Date.now();
      await this.update(page);
    }
  }

  protected triplesToNode(triples: GraphTriple[]): PageNode {
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

    return {
      id,
      type: NodeType.PAGE,
      createdAt,
      updatedAt,
      properties
    } as PageNode;
  }
}

/**
 * Repository for Session entities
 */
export class SessionRepository extends BaseRepository<SessionNode> {
  constructor(db: DatabaseConnection) {
    super(db, NodeType.SESSION);
  }

  /**
   * Find sessions by tag
   */
  async findByTag(tag: string, limit = 20): Promise<SessionNode[]> {
    return this.findBy('tag', tag, limit);
  }

  /**
   * Get current active sessions
   */
  async getActiveSessions(limit = 10): Promise<SessionNode[]> {
    return this.findBy('isActive', true, limit);
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = await this.getById(sessionId);
    if (session) {
      session.properties.isActive = false;
      session.properties.endedAt = Date.now();
      session.updatedAt = Date.now();
      await this.update(session);
    }
  }

  /**
   * Update session statistics
   */
  async updateStats(
    sessionId: string, 
    stats: { 
      totalTime?: number; 
      pageCount?: number; 
      tabCount?: number; 
      windowCount?: number;
      domains?: string[];
    }
  ): Promise<void> {
    const session = await this.getById(sessionId);
    if (session) {
      Object.assign(session.properties, stats);
      session.updatedAt = Date.now();
      await this.update(session);
    }
  }

  protected triplesToNode(triples: GraphTriple[]): SessionNode {
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
          break;
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

    return {
      id,
      type: NodeType.SESSION,
      createdAt,
      updatedAt,
      properties
    } as SessionNode;
  }
}

/**
 * Repository for Tag entities
 */
export class TagRepository extends BaseRepository<TagNode> {
  constructor(db: DatabaseConnection) {
    super(db, NodeType.TAG);
  }

  /**
   * Find tag by name
   */
  async findByName(name: string): Promise<TagNode | null> {
    const tags = await this.findBy('name', name.toLowerCase(), 1);
    return tags[0] || null;
  }

  /**
   * Get most used tags
   */
  async getMostUsed(limit = 10): Promise<TagNode[]> {
    const allTags = await this.getAll(100); // Get more tags to sort
    return allTags
      .sort((a, b) => b.properties.usageCount - a.properties.usageCount)
      .slice(0, limit);
  }

  /**
   * Increment tag usage
   */
  async incrementUsage(tagId: string): Promise<void> {
    const tag = await this.getById(tagId);
    if (tag) {
      tag.properties.usageCount = (tag.properties.usageCount || 0) + 1;
      tag.updatedAt = Date.now();
      await this.update(tag);
    }
  }

  /**
   * Search tags by name pattern
   */
  async searchByName(pattern: string, limit = 10): Promise<TagNode[]> {
    const allTags = await this.getAll(100);
    return allTags
      .filter(tag => tag.properties.name.includes(pattern.toLowerCase()))
      .slice(0, limit);
  }

  protected triplesToNode(triples: GraphTriple[]): TagNode {
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
          break;
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

    return {
      id,
      type: NodeType.TAG,
      createdAt,
      updatedAt,
      properties
    } as TagNode;
  }
}

/**
 * Repository for Domain entities
 */
export class DomainRepository extends BaseRepository<DomainNode> {
  constructor(db: DatabaseConnection) {
    super(db, NodeType.DOMAIN);
  }

  /**
   * Find domain by hostname
   */
  async findByHostname(hostname: string): Promise<DomainNode | null> {
    const domains = await this.findBy('hostname', hostname, 1);
    return domains[0] || null;
  }

  /**
   * Get most visited domains
   */
  async getMostVisited(limit = 10): Promise<DomainNode[]> {
    const allDomains = await this.getAll(100);
    return allDomains
      .sort((a, b) => b.properties.visitCount - a.properties.visitCount)
      .slice(0, limit);
  }

  /**
   * Update domain statistics
   */
  async updateStats(
    domainId: string,
    stats: {
      visitCount?: number;
      totalTimeSpent?: number;
      lastVisited?: number;
    }
  ): Promise<void> {
    const domain = await this.getById(domainId);
    if (domain) {
      if (stats.visitCount !== undefined) {
        domain.properties.visitCount = (domain.properties.visitCount || 0) + stats.visitCount;
      }
      if (stats.totalTimeSpent !== undefined) {
        domain.properties.totalTimeSpent = (domain.properties.totalTimeSpent || 0) + stats.totalTimeSpent;
      }
      if (stats.lastVisited !== undefined) {
        domain.properties.lastVisited = stats.lastVisited;
      }
      domain.updatedAt = Date.now();
      await this.update(domain);
    }
  }

  protected triplesToNode(triples: GraphTriple[]): DomainNode {
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
          break;
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
 * Repository for managing relationships between entities
 */
export class RelationshipRepository {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /**
   * Create a relationship
   */
  async create(relationship: GraphRelationship): Promise<GraphRelationship> {
    const graph = this.db.getDatabase();
    const triples = SchemaUtils.relationshipToTriples(relationship);

    return new Promise((resolve, reject) => {
      graph.put(triples, (err: any) => {
        if (err) {
          reject(new TabKillerError(
            'RELATIONSHIP_CREATE_FAILED',
            'Failed to create relationship',
            'background',
            { error: err, relationshipId: relationship.id }
          ));
        } else {
          resolve(relationship);
        }
      });
    });
  }

  /**
   * Find relationships by type
   */
  async findByType(type: RelationshipType, limit = 50): Promise<GraphRelationship[]> {
    const graph = this.db.getDatabase();

    return new Promise((resolve, reject) => {
      graph.get({
        subject: graph.v('from'),
        predicate: type,
        object: graph.v('to')
      }, (err: any, results: GraphTriple[]) => {
        if (err) {
          reject(err);
          return;
        }

        const relationships: GraphRelationship[] = results.slice(0, limit).map(triple => ({
          id: `${type}:${triple.subject}:${triple.object}`,
          type,
          from: triple.subject,
          to: triple.object as string,
          createdAt: Date.now(), // Would need to fetch actual timestamp
          properties: {}
        }));

        resolve(relationships);
      });
    });
  }

  /**
   * Get relationships from a specific node
   */
  async getOutgoing(nodeId: string, relationshipType?: RelationshipType): Promise<GraphRelationship[]> {
    const graph = this.db.getDatabase();
    
    const query = relationshipType 
      ? { subject: nodeId, predicate: relationshipType, object: graph.v('to') }
      : { subject: nodeId, predicate: graph.v('predicate'), object: graph.v('to') };

    return new Promise((resolve, reject) => {
      graph.get(query, (err: any, results: GraphTriple[]) => {
        if (err) {
          reject(err);
          return;
        }

        const relationships: GraphRelationship[] = results.map(triple => ({
          id: `${triple.predicate}:${triple.subject}:${triple.object}`,
          type: triple.predicate as RelationshipType,
          from: triple.subject,
          to: triple.object as string,
          createdAt: Date.now(),
          properties: {}
        }));

        resolve(relationships);
      });
    });
  }

  /**
   * Get relationships to a specific node
   */
  async getIncoming(nodeId: string, relationshipType?: RelationshipType): Promise<GraphRelationship[]> {
    const graph = this.db.getDatabase();
    
    const query = relationshipType 
      ? { subject: graph.v('from'), predicate: relationshipType, object: nodeId }
      : { subject: graph.v('from'), predicate: graph.v('predicate'), object: nodeId };

    return new Promise((resolve, reject) => {
      graph.get(query, (err: any, results: GraphTriple[]) => {
        if (err) {
          reject(err);
          return;
        }

        const relationships: GraphRelationship[] = results.map(triple => ({
          id: `${triple.predicate}:${triple.subject}:${triple.object}`,
          type: triple.predicate as RelationshipType,
          from: triple.subject,
          to: triple.object as string,
          createdAt: Date.now(),
          properties: {}
        }));

        resolve(relationships);
      });
    });
  }

  /**
   * Delete a relationship
   */
  async delete(fromId: string, toId: string, type: RelationshipType): Promise<boolean> {
    const graph = this.db.getDatabase();

    return new Promise((resolve, reject) => {
      graph.del({
        subject: fromId,
        predicate: type,
        object: toId
      }, (err: any) => {
        if (err) {
          reject(new TabKillerError(
            'RELATIONSHIP_DELETE_FAILED',
            'Failed to delete relationship',
            'background',
            { error: err, fromId, toId, type }
          ));
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Check if relationship exists
   */
  async exists(fromId: string, toId: string, type: RelationshipType): Promise<boolean> {
    const graph = this.db.getDatabase();

    return new Promise((resolve, reject) => {
      graph.get({
        subject: fromId,
        predicate: type,
        object: toId
      }, (err: any, results: GraphTriple[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(results.length > 0);
        }
      });
    });
  }
}

/**
 * Repository manager that provides access to all entity repositories
 */
export class RepositoryManager {
  private db: DatabaseConnection;
  
  public readonly pages: PageRepository;
  public readonly sessions: SessionRepository;
  public readonly tags: TagRepository;
  public readonly domains: DomainRepository;
  public readonly relationships: RelationshipRepository;

  constructor(db: DatabaseConnection) {
    this.db = db;
    
    this.pages = new PageRepository(db);
    this.sessions = new SessionRepository(db);
    this.tags = new TagRepository(db);
    this.domains = new DomainRepository(db);
    this.relationships = new RelationshipRepository(db);
  }

  /**
   * Perform batch operations within a transaction-like context
   */
  async batch<T>(operations: () => Promise<T>): Promise<T> {
    // LevelGraph doesn't have native transactions, but we can implement
    // a simple batch context for error handling
    try {
      return await operations();
    } catch (error) {
      // In a real implementation, we might rollback changes here
      console.error('Batch operation failed:', error);
      throw error;
    }
  }

  /**
   * Get database health status
   */
  async getHealthStatus(): Promise<{
    connected: boolean;
    nodeCount: number;
    relationshipCount: number;
    lastError?: string;
  }> {
    try {
      const connected = this.db.isConnected();
      
      if (!connected) {
        return {
          connected: false,
          nodeCount: 0,
          relationshipCount: 0,
          lastError: 'Database not connected'
        };
      }

      const [pageCount, sessionCount, tagCount, domainCount] = await Promise.all([
        this.pages.count(),
        this.sessions.count(),
        this.tags.count(),
        this.domains.count()
      ]);

      const nodeCount = pageCount + sessionCount + tagCount + domainCount;
      
      // Rough estimate of relationships (would need proper counting in real implementation)
      const relationshipCount = Math.floor(nodeCount * 1.5);

      return {
        connected: true,
        nodeCount,
        relationshipCount,
        lastError: undefined
      };
    } catch (error) {
      return {
        connected: false,
        nodeCount: 0,
        relationshipCount: 0,
        lastError: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}