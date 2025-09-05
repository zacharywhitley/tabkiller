/**
 * Data transformation utilities between extension events and graph storage
 * Converts tracking events, tabs, sessions into graph nodes and relationships
 */

import {
  BrowsingSession,
  TabInfo,
  NavigationEvent,
  TabEvent,
  WindowEvent,
  NavigationTransition,
  PageCapture,
  ExtensionSettings
} from '../shared/types';

import {
  NodeType,
  RelationshipType,
  PageNode,
  SessionNode,
  TagNode,
  DomainNode,
  UserNode,
  DeviceNode,
  WindowNode,
  TabNode,
  NavigatedToRelationship,
  OpenedInTabRelationship,
  PartOfSessionRelationship,
  TaggedWithRelationship,
  BelongsToDomainRelationship,
  GraphNode,
  GraphRelationship,
  SchemaUtils
} from './schema';

import { detectBrowser, getBrowserConfig } from '../utils/cross-browser';

/**
 * Transformer class for converting extension events to graph data structures
 */
export class EventToGraphTransformer {
  private readonly browser = detectBrowser();
  private readonly browserConfig = getBrowserConfig();

  /**
   * Transform a BrowsingSession to a SessionNode
   */
  transformSession(session: BrowsingSession, userId: string): SessionNode {
    const sessionId = SchemaUtils.generateNodeId(NodeType.SESSION, session.id);
    
    return {
      id: sessionId,
      type: NodeType.SESSION,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      properties: {
        tag: session.tag,
        purpose: session.metadata.purpose,
        notes: session.metadata.notes,
        isPrivate: session.metadata.isPrivate,
        totalTime: session.metadata.totalTime,
        pageCount: session.metadata.pageCount,
        tabCount: session.tabs.length,
        windowCount: session.windowIds.length,
        domains: session.metadata.domain,
        startedAt: session.createdAt,
        endedAt: undefined, // Set when session is closed
        isActive: true
      }
    };
  }

  /**
   * Transform a TabInfo to a PageNode
   */
  transformTabToPage(tab: TabInfo, capture?: PageCapture): PageNode {
    const pageId = SchemaUtils.generateNodeId(NodeType.PAGE, this.hashUrl(tab.url));
    
    return {
      id: pageId,
      type: NodeType.PAGE,
      createdAt: tab.createdAt,
      updatedAt: tab.lastAccessed,
      properties: {
        url: tab.url,
        title: tab.title,
        description: capture?.metadata.description,
        keywords: capture?.metadata.keywords,
        author: capture?.metadata.author,
        language: capture?.metadata.language,
        charset: capture?.metadata.charset,
        favicon: tab.favicon,
        screenshot: capture?.screenshot,
        html: capture?.html, // Will be encrypted
        mhtml: capture?.mhtml, // Will be encrypted
        viewportSize: capture?.metadata.viewportSize,
        scrollPosition: { x: tab.scrollPosition || 0, y: 0 },
        forms: capture?.metadata.forms,
        links: capture?.metadata.links.map(link => ({
          href: link.href,
          text: link.text,
          title: link.title,
          rel: link.rel
        })),
        loadTime: undefined, // Could be measured
        responseTime: undefined, // Could be measured
        contentType: undefined, // From response headers
        contentLength: undefined, // From response headers
        isPrivate: false, // Detect incognito mode
        visitCount: 1,
        totalTimeSpent: tab.timeSpent
      }
    };
  }

  /**
   * Transform a TabInfo to a TabNode
   */
  transformTab(tab: TabInfo): TabNode {
    const tabId = SchemaUtils.generateNodeId(NodeType.TAB, tab.id.toString());
    
    return {
      id: tabId,
      type: NodeType.TAB,
      createdAt: tab.createdAt,
      updatedAt: tab.lastAccessed,
      properties: {
        tabId: tab.id,
        windowId: tab.windowId,
        index: 0, // Would need to get from browser API
        active: false, // Would need to track
        pinned: false, // Would need to get from browser API
        highlighted: false, // Would need to get from browser API
        audible: false, // Would need to get from browser API
        muted: false, // Would need to get from browser API
        incognito: false, // Would need to detect
        groupId: undefined, // Chrome feature
        openerTabId: undefined, // Would need to track
        status: 'complete' as const,
        discarded: false, // Would need to detect
        autoDiscardable: true, // Default
        lastAccessed: tab.lastAccessed,
        timeSpent: tab.timeSpent
      }
    };
  }

  /**
   * Transform a NavigationEvent to a NavigatedToRelationship
   */
  transformNavigation(
    navigation: NavigationEvent, 
    fromPageId: string, 
    toPageId: string
  ): NavigatedToRelationship {
    const relationshipId = SchemaUtils.generateRelationshipId(
      RelationshipType.NAVIGATED_TO,
      fromPageId,
      toPageId
    );

    return {
      id: relationshipId,
      type: RelationshipType.NAVIGATED_TO,
      from: fromPageId,
      to: toPageId,
      createdAt: navigation.timestamp,
      properties: {
        transitionType: navigation.transitionType,
        timestamp: navigation.timestamp,
        referrer: navigation.referrer,
        scrollPosition: 0, // Would need to capture
        timeOnPage: 0, // Would need to calculate
        clickedElement: undefined, // Would need to capture from content script
        keyboardUsed: false, // Would need to detect
        mouseUsed: false // Would need to detect
      }
    };
  }

  /**
   * Transform a URL to a DomainNode
   */
  transformUrlToDomain(url: string): DomainNode {
    const parsedUrl = new URL(url);
    const domainId = SchemaUtils.generateNodeId(NodeType.DOMAIN, parsedUrl.hostname);
    
    return {
      id: domainId,
      type: NodeType.DOMAIN,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      properties: {
        hostname: parsedUrl.hostname,
        protocol: parsedUrl.protocol,
        port: parsedUrl.port ? parseInt(parsedUrl.port) : undefined,
        category: this.categorizeDomain(parsedUrl.hostname),
        description: undefined,
        favicon: undefined, // Could be extracted
        visitCount: 1,
        totalTimeSpent: 0,
        isBlocked: false,
        isBookmarked: false,
        lastVisited: Date.now(),
        trustLevel: 'unknown' as const
      }
    };
  }

  /**
   * Create a tag node
   */
  createTagNode(name: string, userId: string, isSystem = false): TagNode {
    const tagId = SchemaUtils.generateNodeId(NodeType.TAG, name);
    
    return {
      id: tagId,
      type: NodeType.TAG,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      properties: {
        name: name.toLowerCase(),
        description: undefined,
        color: this.generateTagColor(name),
        icon: undefined,
        category: 'user',
        usageCount: 0,
        createdBy: userId,
        isPublic: false,
        isSystem
      }
    };
  }

  /**
   * Create a user node from browser environment
   */
  createUserNode(settings: ExtensionSettings): UserNode {
    const deviceId = this.generateDeviceId();
    const userId = SchemaUtils.generateNodeId(NodeType.USER, deviceId);
    
    return {
      id: userId,
      type: NodeType.USER,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      properties: {
        deviceId,
        browser: this.browser,
        browserVersion: this.getBrowserVersion(),
        os: this.getOperatingSystem(),
        osVersion: this.getOSVersion(),
        userAgent: navigator.userAgent,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
        screenResolution: `${screen.width}x${screen.height}`,
        colorDepth: screen.colorDepth,
        settings: {
          autoCapture: settings.autoCapture,
          captureInterval: settings.captureInterval,
          maxSessions: settings.maxSessions,
          defaultTag: settings.defaultTag,
          syncEnabled: settings.syncEnabled,
          encryptionEnabled: settings.encryptionEnabled,
          excludedDomains: settings.excludedDomains,
          includedDomains: settings.includedDomains,
          privacyMode: settings.privacyMode,
          retentionPeriod: 365, // Default 1 year
          maxStorageSize: this.browserConfig.storageQuota / (1024 * 1024) // MB
        },
        syncEnabled: settings.syncEnabled,
        encryptionEnabled: settings.encryptionEnabled,
        lastSyncAt: undefined
      }
    };
  }

  /**
   * Create a device node
   */
  createDeviceNode(): DeviceNode {
    const deviceId = this.generateDeviceId();
    const nodeId = SchemaUtils.generateNodeId(NodeType.DEVICE, deviceId);
    
    return {
      id: nodeId,
      type: NodeType.DEVICE,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      properties: {
        deviceId,
        name: this.generateDeviceName(),
        type: this.getDeviceType(),
        browser: this.browser,
        browserVersion: this.getBrowserVersion(),
        os: this.getOperatingSystem(),
        osVersion: this.getOSVersion(),
        userAgent: navigator.userAgent,
        screenResolution: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
        isCurrentDevice: true,
        lastSeenAt: Date.now(),
        syncStatus: 'active' as const
      }
    };
  }

  /**
   * Create relationships between entities
   */
  createPartOfSessionRelationship(
    pageId: string, 
    sessionId: string, 
    joinedAt: number
  ): PartOfSessionRelationship {
    const relationshipId = SchemaUtils.generateRelationshipId(
      RelationshipType.PART_OF_SESSION,
      pageId,
      sessionId
    );

    return {
      id: relationshipId,
      type: RelationshipType.PART_OF_SESSION,
      from: pageId,
      to: sessionId,
      createdAt: joinedAt,
      properties: {
        joinedAt,
        leftAt: undefined,
        timeInSession: 0,
        isCurrentSession: true
      }
    };
  }

  createBelongsToDomainRelationship(
    pageId: string, 
    domainId: string, 
    url: string
  ): BelongsToDomainRelationship {
    const parsedUrl = new URL(url);
    const relationshipId = SchemaUtils.generateRelationshipId(
      RelationshipType.BELONGS_TO_DOMAIN,
      pageId,
      domainId
    );

    return {
      id: relationshipId,
      type: RelationshipType.BELONGS_TO_DOMAIN,
      from: pageId,
      to: domainId,
      createdAt: Date.now(),
      properties: {
        path: parsedUrl.pathname,
        queryParams: Object.fromEntries(parsedUrl.searchParams),
        fragment: parsedUrl.hash,
        isSubdomain: parsedUrl.hostname.split('.').length > 2
      }
    };
  }

  createTaggedWithRelationship(
    entityId: string, 
    tagId: string, 
    userId: string,
    isAutoTag = false
  ): TaggedWithRelationship {
    const relationshipId = SchemaUtils.generateRelationshipId(
      RelationshipType.TAGGED_WITH,
      entityId,
      tagId
    );

    return {
      id: relationshipId,
      type: RelationshipType.TAGGED_WITH,
      from: entityId,
      to: tagId,
      createdAt: Date.now(),
      properties: {
        taggedAt: Date.now(),
        taggedBy: userId,
        confidence: isAutoTag ? 0.8 : 1.0,
        isAutoTag
      }
    };
  }

  // Private utility methods
  private hashUrl(url: string): string {
    // Simple hash function for URL (could use crypto for better hashing)
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private categorizeDomain(hostname: string): string {
    const categories: Record<string, string[]> = {
      'social': ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'reddit.com'],
      'search': ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com'],
      'news': ['bbc.com', 'cnn.com', 'reuters.com', 'nytimes.com'],
      'development': ['github.com', 'stackoverflow.com', 'npmjs.com', 'developer.mozilla.org'],
      'entertainment': ['youtube.com', 'netflix.com', 'spotify.com', 'twitch.tv'],
      'shopping': ['amazon.com', 'ebay.com', 'etsy.com', 'shopify.com'],
      'productivity': ['notion.so', 'trello.com', 'slack.com', 'zoom.us']
    };

    for (const [category, domains] of Object.entries(categories)) {
      if (domains.some(domain => hostname.includes(domain))) {
        return category;
      }
    }

    return 'other';
  }

  private generateTagColor(name: string): string {
    // Generate a consistent color based on tag name
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#FFB6C1', '#87CEEB', '#F0E68C'
    ];
    
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  }

  private generateDeviceId(): string {
    // Generate a consistent device ID based on browser fingerprint
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx!.textBaseline = 'top';
    ctx!.font = '14px Arial';
    ctx!.fillText('Device fingerprint', 2, 2);
    
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      !!window.sessionStorage,
      !!window.localStorage,
      canvas.toDataURL()
    ].join('|');

    // Simple hash
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return Math.abs(hash).toString(36);
  }

  private generateDeviceName(): string {
    const os = this.getOperatingSystem();
    const browser = this.browser;
    return `${os} ${browser}`.replace(/^\w/, c => c.toUpperCase());
  }

  private getDeviceType(): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (/tablet|ipad/i.test(userAgent)) {
      return 'tablet';
    }
    
    if (/mobile|android|ios|iphone/i.test(userAgent)) {
      return 'mobile';
    }
    
    if (/desktop|windows|macintosh|linux/i.test(userAgent)) {
      return 'desktop';
    }
    
    return 'unknown';
  }

  private getBrowserVersion(): string {
    const userAgent = navigator.userAgent;
    
    if (this.browser === 'chrome') {
      const match = userAgent.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
      return match ? match[1] : 'unknown';
    }
    
    if (this.browser === 'firefox') {
      const match = userAgent.match(/Firefox\/(\d+\.\d+)/);
      return match ? match[1] : 'unknown';
    }
    
    if (this.browser === 'safari') {
      const match = userAgent.match(/Version\/(\d+\.\d+)/);
      return match ? match[1] : 'unknown';
    }
    
    return 'unknown';
  }

  private getOperatingSystem(): string {
    const userAgent = navigator.userAgent;
    
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac OS X')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    
    return 'Unknown';
  }

  private getOSVersion(): string {
    const userAgent = navigator.userAgent;
    
    // Windows
    const windowsMatch = userAgent.match(/Windows NT (\d+\.\d+)/);
    if (windowsMatch) {
      const versionMap: Record<string, string> = {
        '10.0': '10',
        '6.3': '8.1',
        '6.2': '8',
        '6.1': '7'
      };
      return versionMap[windowsMatch[1]] || windowsMatch[1];
    }
    
    // macOS
    const macMatch = userAgent.match(/Mac OS X (\d+[._]\d+([._]\d+)?)/);
    if (macMatch) {
      return macMatch[1].replace(/_/g, '.');
    }
    
    return 'unknown';
  }
}

/**
 * Transformer for converting graph data back to extension events
 */
export class GraphToEventTransformer {
  /**
   * Transform a SessionNode back to BrowsingSession
   */
  sessionNodeToSession(node: SessionNode, tabs: TabInfo[] = []): BrowsingSession {
    return {
      id: node.id,
      tag: node.properties.tag,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      tabs,
      windowIds: [], // Would need to be populated from relationships
      metadata: {
        purpose: node.properties.purpose,
        notes: node.properties.notes,
        isPrivate: node.properties.isPrivate,
        totalTime: node.properties.totalTime,
        pageCount: node.properties.pageCount,
        domain: node.properties.domains
      }
    };
  }

  /**
   * Transform a PageNode to TabInfo
   */
  pageNodeToTab(node: PageNode, tabId: number, windowId: number): TabInfo {
    return {
      id: tabId,
      url: node.properties.url,
      title: node.properties.title,
      favicon: node.properties.favicon,
      windowId,
      createdAt: node.createdAt,
      lastAccessed: node.updatedAt,
      timeSpent: node.properties.totalTimeSpent,
      scrollPosition: node.properties.scrollPosition?.y || 0,
      formData: node.properties.forms?.reduce((acc, form) => {
        form.fields.forEach(field => {
          acc[field.name] = field.value;
        });
        return acc;
      }, {} as Record<string, string>)
    };
  }
}

/**
 * Factory for creating common graph transformations
 */
export class GraphTransformFactory {
  private eventTransformer = new EventToGraphTransformer();
  private graphTransformer = new GraphToEventTransformer();

  /**
   * Transform a complete browsing session with all related entities
   */
  async transformCompleteSession(
    session: BrowsingSession,
    userId: string,
    captures: Map<string, PageCapture> = new Map()
  ): Promise<{
    nodes: GraphNode[];
    relationships: GraphRelationship[];
  }> {
    const nodes: GraphNode[] = [];
    const relationships: GraphRelationship[] = [];

    // Transform session
    const sessionNode = this.eventTransformer.transformSession(session, userId);
    nodes.push(sessionNode);

    // Transform tabs to pages and create relationships
    for (const tab of session.tabs) {
      const capture = captures.get(tab.url);
      
      // Create page node
      const pageNode = this.eventTransformer.transformTabToPage(tab, capture);
      nodes.push(pageNode);

      // Create domain node if not exists
      const domainNode = this.eventTransformer.transformUrlToDomain(tab.url);
      const existingDomain = nodes.find(n => 
        n.type === NodeType.DOMAIN && 
        (n as DomainNode).properties.hostname === domainNode.properties.hostname
      );
      
      if (!existingDomain) {
        nodes.push(domainNode);
      }

      // Create relationships
      relationships.push(
        this.eventTransformer.createPartOfSessionRelationship(
          pageNode.id,
          sessionNode.id,
          tab.createdAt
        ),
        this.eventTransformer.createBelongsToDomainRelationship(
          pageNode.id,
          existingDomain?.id || domainNode.id,
          tab.url
        )
      );

      // Create session tag relationship
      const tagNode = this.eventTransformer.createTagNode(session.tag, userId);
      const existingTag = nodes.find(n => 
        n.type === NodeType.TAG && 
        (n as TagNode).properties.name === tagNode.properties.name
      );
      
      if (!existingTag) {
        nodes.push(tagNode);
      }

      relationships.push(
        this.eventTransformer.createTaggedWithRelationship(
          sessionNode.id,
          existingTag?.id || tagNode.id,
          userId
        )
      );
    }

    return { nodes, relationships };
  }

  /**
   * Get transformers
   */
  getEventTransformer(): EventToGraphTransformer {
    return this.eventTransformer;
  }

  getGraphTransformer(): GraphToEventTransformer {
    return this.graphTransformer;
  }
}