/**
 * Integration layer between the service worker and graph database
 * Transforms and persists browsing events into the graph database
 */

import {
  BrowsingSession,
  TabInfo,
  NavigationEvent,
  TabEvent,
  WindowEvent,
  PageCapture,
  ExtensionSettings
} from '../shared/types';

import { getDatabase, TabKillerDatabase } from './index';
import {
  NodeType,
  RelationshipType,
  PageNode,
  SessionNode,
  TagNode,
  DomainNode,
  UserNode,
  DeviceNode,
  SchemaUtils
} from './schema';

/**
 * Database integration service for the background service worker
 */
export class DatabaseIntegration {
  private database: TabKillerDatabase;
  private userId: string | null = null;
  private deviceId: string | null = null;
  private currentSessionId: string | null = null;

  constructor() {
    this.database = getDatabase();
  }

  /**
   * Initialize database integration
   */
  async initialize(settings: ExtensionSettings, masterPassword?: string): Promise<void> {
    try {
      // Initialize database with encryption if enabled
      await this.database.initialize(settings.encryptionEnabled, masterPassword);

      // Initialize or get user and device
      await this.initializeUserAndDevice(settings);

      console.log('Database integration initialized');
    } catch (error) {
      console.error('Failed to initialize database integration:', error);
      throw error;
    }
  }

  /**
   * Process tab creation event
   */
  async handleTabCreated(tabInfo: TabInfo, capture?: PageCapture): Promise<void> {
    if (!this.database.isReady()) {
      console.warn('Database not ready, skipping tab creation');
      return;
    }

    try {
      const repositories = this.database.getRepositories();
      const transformFactory = this.database.getTransformFactory();
      const eventTransformer = transformFactory.getEventTransformer();

      // Transform tab to page node
      const pageNode = eventTransformer.transformTabToPage(tabInfo, capture);
      
      // Check if page already exists
      const existingPage = await repositories.pages.findByUrl(tabInfo.url);
      if (existingPage) {
        // Update visit count and time spent
        await repositories.pages.incrementVisitCount(existingPage.id, tabInfo.timeSpent);
        return;
      }

      // Create new page
      await repositories.pages.create(pageNode);

      // Create or update domain
      const domainNode = eventTransformer.transformUrlToDomain(tabInfo.url);
      let domain = await repositories.domains.findByHostname(domainNode.properties.hostname);
      
      if (!domain) {
        domain = await repositories.domains.create(domainNode);
      }

      // Create page-domain relationship
      const belongsToRelation = eventTransformer.createBelongsToDomainRelationship(
        pageNode.id,
        domain.id,
        tabInfo.url
      );
      await repositories.relationships.create(belongsToRelation);

      // Update domain statistics
      await repositories.domains.updateStats(domain.id, {
        visitCount: 1,
        totalTimeSpent: tabInfo.timeSpent,
        lastVisited: Date.now()
      });

      // Associate with current session if exists
      if (this.currentSessionId) {
        const sessionRelation = eventTransformer.createPartOfSessionRelationship(
          pageNode.id,
          this.currentSessionId,
          tabInfo.createdAt
        );
        await repositories.relationships.create(sessionRelation);

        // Update session statistics
        await repositories.sessions.updateStats(this.currentSessionId, {
          pageCount: 1,
          tabCount: 1
        });
      }

      console.log(`Page created in graph: ${tabInfo.url}`);
    } catch (error) {
      console.error('Failed to handle tab creation:', error);
    }
  }

  /**
   * Process tab navigation event
   */
  async handleNavigation(navigation: NavigationEvent): Promise<void> {
    if (!this.database.isReady()) {
      return;
    }

    try {
      const repositories = this.database.getRepositories();
      const transformFactory = this.database.getTransformFactory();
      const eventTransformer = transformFactory.getEventTransformer();

      // Find source and target pages
      const targetPage = await repositories.pages.findByUrl(navigation.url);
      let sourcePage: PageNode | null = null;

      if (navigation.referrer) {
        sourcePage = await repositories.pages.findByUrl(navigation.referrer);
      }

      if (sourcePage && targetPage) {
        // Create navigation relationship
        const navRelation = eventTransformer.transformNavigation(
          navigation,
          sourcePage.id,
          targetPage.id
        );
        
        // Check if relationship already exists
        const exists = await repositories.relationships.exists(
          sourcePage.id,
          targetPage.id,
          RelationshipType.NAVIGATED_TO
        );

        if (!exists) {
          await repositories.relationships.create(navRelation);
        }
      }

      console.log(`Navigation recorded: ${navigation.referrer} -> ${navigation.url}`);
    } catch (error) {
      console.error('Failed to handle navigation:', error);
    }
  }

  /**
   * Create new browsing session
   */
  async createSession(sessionData: BrowsingSession): Promise<SessionNode> {
    if (!this.database.isReady()) {
      throw new Error('Database not ready');
    }

    try {
      const repositories = this.database.getRepositories();
      const transformFactory = this.database.getTransformFactory();
      const eventTransformer = transformFactory.getEventTransformer();

      // End current session if exists
      if (this.currentSessionId) {
        await repositories.sessions.endSession(this.currentSessionId);
      }

      // Transform and create session
      const sessionNode = eventTransformer.transformSession(sessionData, this.userId!);
      const createdSession = await repositories.sessions.create(sessionNode);
      this.currentSessionId = createdSession.id;

      // Create or get session tag
      let tag = await repositories.tags.findByName(sessionData.tag);
      if (!tag) {
        tag = await repositories.tags.create(
          eventTransformer.createTagNode(sessionData.tag, this.userId!, false)
        );
      }

      // Create session-tag relationship
      const tagRelation = eventTransformer.createTaggedWithRelationship(
        createdSession.id,
        tag.id,
        this.userId!,
        false
      );
      await repositories.relationships.create(tagRelation);

      // Update tag usage
      await repositories.tags.incrementUsage(tag.id);

      // Transform existing tabs and associate with session
      const { nodes, relationships } = await transformFactory.transformCompleteSession(
        sessionData,
        this.userId!,
        new Map() // No captures for now
      );

      // Create session relationships for existing nodes
      for (const relation of relationships) {
        if (relation.type === RelationshipType.PART_OF_SESSION) {
          const exists = await repositories.relationships.exists(
            relation.from,
            relation.to,
            RelationshipType.PART_OF_SESSION
          );
          
          if (!exists) {
            await repositories.relationships.create(relation);
          }
        }
      }

      console.log(`Session created: ${sessionData.tag} (${createdSession.id})`);
      return createdSession;
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  }

  /**
   * End current browsing session
   */
  async endCurrentSession(): Promise<void> {
    if (!this.database.isReady() || !this.currentSessionId) {
      return;
    }

    try {
      const repositories = this.database.getRepositories();
      await repositories.sessions.endSession(this.currentSessionId);
      
      console.log(`Session ended: ${this.currentSessionId}`);
      this.currentSessionId = null;
    } catch (error) {
      console.error('Failed to end session:', error);
    }
  }

  /**
   * Get current session from database
   */
  async getCurrentSession(): Promise<SessionNode | null> {
    if (!this.database.isReady()) {
      return null;
    }

    try {
      const queries = this.database.getQueries();
      return await queries.getCurrentSession();
    } catch (error) {
      console.error('Failed to get current session:', error);
      return null;
    }
  }

  /**
   * Get browsing statistics for dashboard
   */
  async getDashboardData(): Promise<{
    totalPages: number;
    totalSessions: number;
    totalTime: number;
    topDomains: any[];
    recentPages: PageNode[];
    currentSession: SessionNode | null;
  }> {
    if (!this.database.isReady()) {
      return {
        totalPages: 0,
        totalSessions: 0,
        totalTime: 0,
        topDomains: [],
        recentPages: [],
        currentSession: null
      };
    }

    try {
      const optimizedQueries = this.database.getOptimizedQueries();
      const summary = await optimizedQueries.getDashboardSummary();
      const currentSession = await this.getCurrentSession();

      return {
        ...summary,
        currentSession
      };
    } catch (error) {
      console.error('Failed to get dashboard data:', error);
      return {
        totalPages: 0,
        totalSessions: 0,
        totalTime: 0,
        topDomains: [],
        recentPages: [],
        currentSession: null
      };
    }
  }

  /**
   * Search browsing history
   */
  async searchHistory(
    searchTerm: string,
    limit = 20
  ): Promise<{ pages: PageNode[]; sessions: SessionNode[] }> {
    if (!this.database.isReady()) {
      return { pages: [], sessions: [] };
    }

    try {
      const queries = this.database.getQueries();
      
      const [pageResults, sessionResults] = await Promise.all([
        queries.findPages(searchTerm, { limit }),
        queries.getSessions(undefined, { limit })
      ]);

      // Filter sessions by search term
      const filteredSessions = sessionResults.sessions.filter(session =>
        session.properties.tag.toLowerCase().includes(searchTerm.toLowerCase()) ||
        session.properties.purpose?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        session.properties.notes?.toLowerCase().includes(searchTerm.toLowerCase())
      );

      return {
        pages: pageResults.pages,
        sessions: filteredSessions
      };
    } catch (error) {
      console.error('Failed to search history:', error);
      return { pages: [], sessions: [] };
    }
  }

  /**
   * Get browsing patterns for analysis
   */
  async getBrowsingPatterns(): Promise<any[]> {
    if (!this.database.isReady()) {
      return [];
    }

    try {
      const queries = this.database.getQueries();
      return await queries.getBrowsingPatterns({ limit: 10 });
    } catch (error) {
      console.error('Failed to get browsing patterns:', error);
      return [];
    }
  }

  /**
   * Update user settings
   */
  async updateUserSettings(settings: ExtensionSettings): Promise<void> {
    if (!this.database.isReady() || !this.userId) {
      return;
    }

    try {
      const repositories = this.database.getRepositories();
      const user = await repositories.getById(this.userId) as UserNode;
      
      if (user) {
        user.properties.settings = {
          ...user.properties.settings,
          ...settings
        };
        user.updatedAt = Date.now();
        
        await repositories.update(user);
        console.log('User settings updated in database');
      }
    } catch (error) {
      console.error('Failed to update user settings:', error);
    }
  }

  /**
   * Get database health status
   */
  async getHealthStatus(): Promise<any> {
    if (!this.database.isReady()) {
      return {
        initialized: false,
        connected: false,
        error: 'Database not ready'
      };
    }

    return await this.database.getStatus();
  }

  // Private helper methods
  private async initializeUserAndDevice(settings: ExtensionSettings): Promise<void> {
    const repositories = this.database.getRepositories();
    const transformFactory = this.database.getTransformFactory();
    const eventTransformer = transformFactory.getEventTransformer();

    // Create or get user
    const userNode = eventTransformer.createUserNode(settings);
    this.userId = userNode.id;

    // Check if user exists (by device ID)
    const existingUsers = await repositories.findBy('deviceId', userNode.properties.deviceId, 1);
    if (existingUsers.length > 0) {
      this.userId = existingUsers[0].id;
    } else {
      await repositories.create(userNode);
    }

    // Create or get device
    const deviceNode = eventTransformer.createDeviceNode();
    this.deviceId = deviceNode.properties.deviceId;

    const existingDevices = await repositories.findBy('deviceId', deviceNode.properties.deviceId, 1);
    if (existingDevices.length === 0) {
      await repositories.create(deviceNode);
    }

    console.log(`User initialized: ${this.userId}, Device: ${this.deviceId}`);
  }
}

/**
 * Global integration instance
 */
let globalIntegration: DatabaseIntegration | null = null;

/**
 * Get or create global integration instance
 */
export function getDatabaseIntegration(): DatabaseIntegration {
  if (!globalIntegration) {
    globalIntegration = new DatabaseIntegration();
  }
  return globalIntegration;
}

/**
 * Initialize global integration
 */
export async function initializeDatabaseIntegration(
  settings: ExtensionSettings,
  masterPassword?: string
): Promise<DatabaseIntegration> {
  const integration = getDatabaseIntegration();
  await integration.initialize(settings, masterPassword);
  return integration;
}