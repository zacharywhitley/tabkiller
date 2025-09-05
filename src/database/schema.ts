/**
 * Graph schema definitions for TabKiller browsing history
 * Defines nodes, relationships, and constraints for the graph database
 */

// Node types
export enum NodeType {
  PAGE = 'Page',
  SESSION = 'Session', 
  TAG = 'Tag',
  DOMAIN = 'Domain',
  USER = 'User',
  DEVICE = 'Device',
  WINDOW = 'Window',
  TAB = 'Tab'
}

// Relationship types
export enum RelationshipType {
  NAVIGATED_TO = 'NAVIGATED_TO',
  OPENED_IN_TAB = 'OPENED_IN_TAB',
  PART_OF_SESSION = 'PART_OF_SESSION',
  TAGGED_WITH = 'TAGGED_WITH',
  BELONGS_TO_DOMAIN = 'BELONGS_TO_DOMAIN',
  SYNCED_FROM = 'SYNCED_FROM',
  ACCESSED_BY = 'ACCESSED_BY',
  OPENED_IN_WINDOW = 'OPENED_IN_WINDOW',
  CONTAINS_TAB = 'CONTAINS_TAB',
  REFERRER_FROM = 'REFERRER_FROM'
}

// Base interfaces for graph entities
export interface GraphNode {
  id: string;
  type: NodeType;
  createdAt: number;
  updatedAt: number;
  properties: Record<string, any>;
}

export interface GraphRelationship {
  id: string;
  type: RelationshipType;
  from: string;
  to: string;
  createdAt: number;
  properties: Record<string, any>;
}

// Specific node interfaces
export interface PageNode extends GraphNode {
  type: NodeType.PAGE;
  properties: {
    url: string;
    title: string;
    description?: string;
    keywords?: string[];
    author?: string;
    language?: string;
    charset?: string;
    favicon?: string;
    screenshot?: string;
    html?: string; // Encrypted SingleFile content
    mhtml?: string; // Encrypted MHTML content
    viewportSize?: { width: number; height: number };
    scrollPosition?: { x: number; y: number };
    forms?: FormData[];
    links?: LinkData[];
    loadTime?: number;
    responseTime?: number;
    contentType?: string;
    contentLength?: number;
    isPrivate: boolean;
    visitCount: number;
    totalTimeSpent: number;
  };
}

export interface SessionNode extends GraphNode {
  type: NodeType.SESSION;
  properties: {
    tag: string;
    purpose?: string;
    notes?: string;
    isPrivate: boolean;
    totalTime: number;
    pageCount: number;
    tabCount: number;
    windowCount: number;
    domains: string[];
    startedAt: number;
    endedAt?: number;
    isActive: boolean;
  };
}

export interface TagNode extends GraphNode {
  type: NodeType.TAG;
  properties: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    category?: string;
    usageCount: number;
    createdBy: string; // User ID
    isPublic: boolean;
    isSystem: boolean;
  };
}

export interface DomainNode extends GraphNode {
  type: NodeType.DOMAIN;
  properties: {
    hostname: string;
    protocol: string;
    port?: number;
    category?: string;
    description?: string;
    favicon?: string;
    visitCount: number;
    totalTimeSpent: number;
    isBlocked: boolean;
    isBookmarked: boolean;
    lastVisited: number;
    trustLevel: 'high' | 'medium' | 'low' | 'unknown';
  };
}

export interface UserNode extends GraphNode {
  type: NodeType.USER;
  properties: {
    deviceId: string;
    browser: string;
    browserVersion?: string;
    os?: string;
    osVersion?: string;
    userAgent?: string;
    timezone?: string;
    language?: string;
    screenResolution?: string;
    colorDepth?: number;
    settings: UserSettings;
    syncEnabled: boolean;
    encryptionEnabled: boolean;
    lastSyncAt?: number;
  };
}

export interface DeviceNode extends GraphNode {
  type: NodeType.DEVICE;
  properties: {
    deviceId: string;
    name?: string;
    type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
    browser: string;
    browserVersion: string;
    os: string;
    osVersion: string;
    userAgent: string;
    screenResolution: string;
    timezone: string;
    language: string;
    isCurrentDevice: boolean;
    lastSeenAt: number;
    syncStatus: 'active' | 'inactive' | 'offline';
  };
}

export interface WindowNode extends GraphNode {
  type: NodeType.WINDOW;
  properties: {
    windowId: number;
    type: 'normal' | 'popup' | 'app' | 'panel' | 'devtools';
    state: 'normal' | 'minimized' | 'maximized' | 'fullscreen';
    focused: boolean;
    incognito: boolean;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    tabCount: number;
    createdAt: number;
    lastFocusedAt: number;
  };
}

export interface TabNode extends GraphNode {
  type: NodeType.TAB;
  properties: {
    tabId: number;
    windowId: number;
    index: number;
    active: boolean;
    pinned: boolean;
    highlighted: boolean;
    audible: boolean;
    muted: boolean;
    incognito: boolean;
    groupId?: number;
    openerTabId?: number;
    status: 'loading' | 'complete';
    discarded: boolean;
    autoDiscardable: boolean;
    lastAccessed: number;
    timeSpent: number;
  };
}

// Supporting data structures
export interface FormData {
  id?: string;
  name?: string;
  action?: string;
  method?: string;
  fields: FormField[];
}

export interface FormField {
  name: string;
  type: string;
  value: string; // Encrypted
  required: boolean;
}

export interface LinkData {
  href: string;
  text: string;
  title?: string;
  rel?: string;
}

export interface UserSettings {
  autoCapture: boolean;
  captureInterval: number;
  maxSessions: number;
  defaultTag: string;
  syncEnabled: boolean;
  encryptionEnabled: boolean;
  excludedDomains: string[];
  includedDomains: string[];
  privacyMode: 'strict' | 'moderate' | 'minimal';
  retentionPeriod: number; // days
  maxStorageSize: number; // MB
}

// Relationship interfaces
export interface NavigatedToRelationship extends GraphRelationship {
  type: RelationshipType.NAVIGATED_TO;
  properties: {
    transitionType: NavigationTransition;
    timestamp: number;
    referrer?: string;
    scrollPosition?: number;
    timeOnPage: number;
    clickedElement?: string;
    keyboardUsed: boolean;
    mouseUsed: boolean;
  };
}

export interface OpenedInTabRelationship extends GraphRelationship {
  type: RelationshipType.OPENED_IN_TAB;
  properties: {
    timestamp: number;
    openerTabId?: number;
    position: number;
    method: 'user_action' | 'script' | 'extension';
  };
}

export interface PartOfSessionRelationship extends GraphRelationship {
  type: RelationshipType.PART_OF_SESSION;
  properties: {
    joinedAt: number;
    leftAt?: number;
    timeInSession: number;
    isCurrentSession: boolean;
  };
}

export interface TaggedWithRelationship extends GraphRelationship {
  type: RelationshipType.TAGGED_WITH;
  properties: {
    taggedAt: number;
    taggedBy: string; // User ID
    confidence?: number; // For auto-tagging
    isAutoTag: boolean;
  };
}

export interface BelongsToDomainRelationship extends GraphRelationship {
  type: RelationshipType.BELONGS_TO_DOMAIN;
  properties: {
    path: string;
    queryParams?: Record<string, string>;
    fragment?: string;
    isSubdomain: boolean;
  };
}

export interface SyncedFromRelationship extends GraphRelationship {
  type: RelationshipType.SYNCED_FROM;
  properties: {
    sourceDeviceId: string;
    syncedAt: number;
    syncVersion: string;
    conflictResolution?: 'local' | 'remote' | 'merge';
  };
}

// Navigation transition types
export type NavigationTransition = 
  | 'link'
  | 'typed' 
  | 'bookmark'
  | 'auto_bookmark'
  | 'auto_subframe'
  | 'manual_subframe'
  | 'generated'
  | 'start_page'
  | 'form_submit'
  | 'reload'
  | 'keyword'
  | 'keyword_generated';

// Schema validation and constraints
export interface SchemaConstraints {
  nodes: {
    [NodeType.PAGE]: {
      required: ['url', 'title'];
      indexed: ['url', 'title', 'createdAt', 'visitCount'];
      unique: ['url'];
    };
    [NodeType.SESSION]: {
      required: ['tag', 'isPrivate'];
      indexed: ['tag', 'createdAt', 'isActive'];
      unique: ['id'];
    };
    [NodeType.TAG]: {
      required: ['name'];
      indexed: ['name', 'usageCount'];
      unique: ['name'];
    };
    [NodeType.DOMAIN]: {
      required: ['hostname'];
      indexed: ['hostname', 'visitCount', 'lastVisited'];
      unique: ['hostname'];
    };
    [NodeType.USER]: {
      required: ['deviceId', 'browser'];
      indexed: ['deviceId', 'lastSyncAt'];
      unique: ['deviceId'];
    };
    [NodeType.DEVICE]: {
      required: ['deviceId', 'browser', 'os'];
      indexed: ['deviceId', 'lastSeenAt'];
      unique: ['deviceId'];
    };
  };
  relationships: {
    [RelationshipType.NAVIGATED_TO]: {
      required: ['timestamp'];
      indexed: ['timestamp', 'transitionType'];
    };
    [RelationshipType.PART_OF_SESSION]: {
      required: ['joinedAt'];
      indexed: ['joinedAt', 'isCurrentSession'];
    };
  };
}

// Triple format for LevelGraph
export interface GraphTriple {
  subject: string;
  predicate: string;
  object: string | number | boolean;
}

// Utility functions for schema operations
export class SchemaUtils {
  /**
   * Generate a unique ID for a node
   */
  static generateNodeId(type: NodeType, identifier?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const suffix = identifier ? `-${identifier}` : '';
    return `${type.toLowerCase()}:${timestamp}-${random}${suffix}`;
  }

  /**
   * Generate a unique ID for a relationship
   */
  static generateRelationshipId(type: RelationshipType, from: string, to: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${type.toLowerCase()}:${from}:${to}:${timestamp}-${random}`;
  }

  /**
   * Convert a node to graph triples
   */
  static nodeToTriples(node: GraphNode): GraphTriple[] {
    const triples: GraphTriple[] = [];
    
    // Basic node properties
    triples.push(
      { subject: node.id, predicate: 'type', object: node.type },
      { subject: node.id, predicate: 'createdAt', object: node.createdAt },
      { subject: node.id, predicate: 'updatedAt', object: node.updatedAt }
    );

    // Node-specific properties
    for (const [key, value] of Object.entries(node.properties)) {
      if (value !== null && value !== undefined) {
        if (typeof value === 'object') {
          // Handle complex objects by JSON encoding
          triples.push({ 
            subject: node.id, 
            predicate: key, 
            object: JSON.stringify(value) 
          });
        } else {
          triples.push({ subject: node.id, predicate: key, object: value });
        }
      }
    }

    return triples;
  }

  /**
   * Convert a relationship to graph triples
   */
  static relationshipToTriples(relationship: GraphRelationship): GraphTriple[] {
    const triples: GraphTriple[] = [];
    
    // Basic relationship structure
    triples.push(
      { subject: relationship.from, predicate: relationship.type, object: relationship.to },
      { subject: relationship.id, predicate: 'type', object: 'relationship' },
      { subject: relationship.id, predicate: 'relType', object: relationship.type },
      { subject: relationship.id, predicate: 'from', object: relationship.from },
      { subject: relationship.id, predicate: 'to', object: relationship.to },
      { subject: relationship.id, predicate: 'createdAt', object: relationship.createdAt }
    );

    // Relationship properties
    for (const [key, value] of Object.entries(relationship.properties)) {
      if (value !== null && value !== undefined) {
        if (typeof value === 'object') {
          triples.push({ 
            subject: relationship.id, 
            predicate: key, 
            object: JSON.stringify(value) 
          });
        } else {
          triples.push({ subject: relationship.id, predicate: key, object: value });
        }
      }
    }

    return triples;
  }

  /**
   * Validate node data against schema constraints
   */
  static validateNode(node: GraphNode, constraints: SchemaConstraints): string[] {
    const errors: string[] = [];
    const nodeConstraints = constraints.nodes[node.type as keyof typeof constraints.nodes];
    
    if (!nodeConstraints) {
      return [`Unknown node type: ${node.type}`];
    }

    // Check required properties
    for (const required of nodeConstraints.required) {
      if (!(required in node.properties) || node.properties[required] == null) {
        errors.push(`Missing required property: ${required}`);
      }
    }

    return errors;
  }

  /**
   * Create index triples for efficient querying
   */
  static createIndexTriples(node: GraphNode, constraints: SchemaConstraints): GraphTriple[] {
    const triples: GraphTriple[] = [];
    const nodeConstraints = constraints.nodes[node.type as keyof typeof constraints.nodes];
    
    if (!nodeConstraints) {
      return triples;
    }

    // Create index entries for indexed properties
    for (const indexed of nodeConstraints.indexed) {
      const value = node.properties[indexed];
      if (value !== null && value !== undefined) {
        const indexKey = `index:${node.type}:${indexed}:${value}`;
        triples.push({ subject: indexKey, predicate: 'nodeId', object: node.id });
      }
    }

    return triples;
  }
}

// Export schema constraints
export const SCHEMA_CONSTRAINTS: SchemaConstraints = {
  nodes: {
    [NodeType.PAGE]: {
      required: ['url', 'title'],
      indexed: ['url', 'title', 'createdAt', 'visitCount'],
      unique: ['url']
    },
    [NodeType.SESSION]: {
      required: ['tag', 'isPrivate'],
      indexed: ['tag', 'createdAt', 'isActive'],
      unique: ['id']
    },
    [NodeType.TAG]: {
      required: ['name'],
      indexed: ['name', 'usageCount'],
      unique: ['name']
    },
    [NodeType.DOMAIN]: {
      required: ['hostname'],
      indexed: ['hostname', 'visitCount', 'lastVisited'],
      unique: ['hostname']
    },
    [NodeType.USER]: {
      required: ['deviceId', 'browser'],
      indexed: ['deviceId', 'lastSyncAt'],
      unique: ['deviceId']
    },
    [NodeType.DEVICE]: {
      required: ['deviceId', 'browser', 'os'],
      indexed: ['deviceId', 'lastSeenAt'],
      unique: ['deviceId']
    }
  },
  relationships: {
    [RelationshipType.NAVIGATED_TO]: {
      required: ['timestamp'],
      indexed: ['timestamp', 'transitionType']
    },
    [RelationshipType.PART_OF_SESSION]: {
      required: ['joinedAt'],
      indexed: ['joinedAt', 'isCurrentSession']
    }
  }
};