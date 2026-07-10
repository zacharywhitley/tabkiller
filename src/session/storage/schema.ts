/**
 * IndexedDB Schema Definition for Session Management
 * Defines the database structure for storing sessions, tabs, and navigation events
 */

import { BrowsingSession, TabInfo, NavigationEvent, SessionBoundary } from '../../shared/types';

// =============================================================================
// DATABASE SCHEMA CONFIGURATION
// =============================================================================

export const DATABASE_NAME = 'TabKillerSessions';
export const DATABASE_VERSION = 2;

// Object store names
export const STORE_NAMES = {
  SESSIONS: 'sessions',
  TABS: 'tabs',
  NAVIGATION_EVENTS: 'navigation_events',
  SESSION_BOUNDARIES: 'session_boundaries',
  METADATA: 'metadata',
  GRAPH_NODES: 'graph_nodes',
  GRAPH_EDGES: 'graph_edges'
} as const;

// Index names for efficient querying
export const INDEX_NAMES = {
  // Session indexes
  SESSION_BY_TAG: 'by_tag',
  SESSION_BY_CREATED_AT: 'by_created_at',
  SESSION_BY_UPDATED_AT: 'by_updated_at',
  SESSION_BY_DOMAIN: 'by_domain',

  // Tab indexes
  TAB_BY_SESSION_ID: 'by_session_id',
  TAB_BY_WINDOW_ID: 'by_window_id',
  TAB_BY_URL: 'by_url',
  TAB_BY_DOMAIN: 'by_domain',
  TAB_BY_CREATED_AT: 'by_created_at',

  // Navigation event indexes
  NAV_BY_TAB_ID: 'by_tab_id',
  NAV_BY_SESSION_ID: 'by_session_id',
  NAV_BY_TIMESTAMP: 'by_timestamp',
  NAV_BY_URL: 'by_url',
  NAV_BY_DOMAIN: 'by_domain',

  // Boundary indexes
  BOUNDARY_BY_SESSION_ID: 'by_session_id',
  BOUNDARY_BY_TIMESTAMP: 'by_timestamp',
  BOUNDARY_BY_REASON: 'by_reason',

  // Graph node indexes
  //
  // The temporal graph model (see PRD temporal-browsing-graph) requires
  // efficient lookup by (type, at_time) for nodes carrying an at_time
  // field, plus node-type-specific single-field indexes for identity
  // lookups. Non-matching records (missing the keyPath) are simply
  // skipped by IndexedDB.
  GRAPH_NODE_BY_TYPE_AT_TIME: 'by_type_at_time',
  GRAPH_NODE_BY_PAGE_NORMALIZED_URL: 'by_page_normalized_url',
  GRAPH_NODE_BY_DOMAIN_HOSTNAME: 'by_domain_hostname',
  GRAPH_NODE_BY_TAG_SLUG: 'by_tag_slug',
  GRAPH_NODE_BY_TAB_BROWSER_TAB_ID: 'by_tab_browser_tab_id',

  // Graph edge indexes
  //
  // (from_id, type) and (to_id, type) power the out/in adjacency queries.
  // Point and interval edges live in the same store and use different
  // temporal keys — indexing on a combined virtual field would require
  // stored duplication, so we split into two temporal indexes; queries
  // by edge type pick the appropriate one based on the type's kind.
  GRAPH_EDGE_BY_FROM_TYPE: 'by_from_type',
  GRAPH_EDGE_BY_TO_TYPE: 'by_to_type',
  GRAPH_EDGE_BY_TYPE_AT_TIME: 'by_type_at_time',
  GRAPH_EDGE_BY_TYPE_VALID_FROM: 'by_type_valid_from'
} as const;

// =============================================================================
// ENHANCED DATA MODELS FOR STORAGE
// =============================================================================

/**
 * Enhanced session model with storage-specific fields
 */
export interface StoredSession extends BrowsingSession {
  // Storage metadata
  version: number;
  lastModified: number;
  size: number;
  compressed: boolean;
  
  // Computed fields for indexing
  domains: string[];
  totalTabCount: number;
  totalNavigationEvents: number;
  
  // Data integrity
  checksum: string;
  isValid: boolean;
}

/**
 * Enhanced tab model with additional tracking data
 */
export interface StoredTab extends TabInfo {
  // Session relationship
  sessionId: string;
  
  // Enhanced metadata
  domain: string;
  isActive: boolean;
  interactionCount: number;
  focusTime: number;
  
  // Storage metadata
  version: number;
  lastModified: number;
  
  // Navigation summary
  navigationCount: number;
  firstNavigationAt?: number;
  lastNavigationAt?: number;
  
  // Data integrity
  checksum: string;
}

/**
 * Enhanced navigation event with indexing fields
 */
export interface StoredNavigationEvent extends NavigationEvent {
  // Session relationship
  sessionId: string;
  
  // Computed fields for indexing
  domain: string;
  
  // Storage metadata
  version: number;
  batchId?: string;
  
  // Data integrity
  checksum: string;
}

/**
 * Enhanced session boundary with additional context
 */
export interface StoredSessionBoundary extends SessionBoundary {
  // Additional context
  tabCount: number;
  windowCount: number;
  
  // Storage metadata
  version: number;
  
  // Data integrity
  checksum: string;
}

/**
 * Database metadata for version control and integrity
 */
export interface DatabaseMetadata {
  version: number;
  createdAt: number;
  lastModified: number;
  lastBackup?: number;
  totalSessions: number;
  totalTabs: number;
  totalNavigationEvents: number;
  storageSize: number;
  integrityCheck: {
    lastCheck: number;
    isValid: boolean;
    errors: string[];
  };
}

// =============================================================================
// SCHEMA DEFINITION
// =============================================================================

export interface DatabaseSchema {
  [STORE_NAMES.SESSIONS]: {
    keyPath: 'id';
    autoIncrement: false;
    indexes: {
      [INDEX_NAMES.SESSION_BY_TAG]: {
        keyPath: 'tag';
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.SESSION_BY_CREATED_AT]: {
        keyPath: 'createdAt';
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.SESSION_BY_UPDATED_AT]: {
        keyPath: 'updatedAt';
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.SESSION_BY_DOMAIN]: {
        keyPath: 'domains';
        unique: false;
        multiEntry: true;
      };
    };
  };
  
  [STORE_NAMES.TABS]: {
    keyPath: 'id';
    autoIncrement: false;
    indexes: {
      [INDEX_NAMES.TAB_BY_SESSION_ID]: {
        keyPath: 'sessionId';
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.TAB_BY_WINDOW_ID]: {
        keyPath: 'windowId';
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.TAB_BY_URL]: {
        keyPath: 'url';
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.TAB_BY_DOMAIN]: {
        keyPath: 'domain';
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.TAB_BY_CREATED_AT]: {
        keyPath: 'createdAt';
        unique: false;
        multiEntry: false;
      };
    };
  };
  
  [STORE_NAMES.NAVIGATION_EVENTS]: {
    keyPath: ['tabId', 'timestamp'];
    autoIncrement: false;
    indexes: {
      [INDEX_NAMES.NAV_BY_TAB_ID]: {
        keyPath: 'tabId';
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.NAV_BY_SESSION_ID]: {
        keyPath: 'sessionId';
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.NAV_BY_TIMESTAMP]: {
        keyPath: 'timestamp';
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.NAV_BY_URL]: {
        keyPath: 'url';
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.NAV_BY_DOMAIN]: {
        keyPath: 'domain';
        unique: false;
        multiEntry: false;
      };
    };
  };
  
  [STORE_NAMES.SESSION_BOUNDARIES]: {
    keyPath: 'id';
    autoIncrement: false;
    indexes: {
      [INDEX_NAMES.BOUNDARY_BY_SESSION_ID]: {
        keyPath: 'sessionId';
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.BOUNDARY_BY_TIMESTAMP]: {
        keyPath: 'timestamp';
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.BOUNDARY_BY_REASON]: {
        keyPath: 'reason';
        unique: false;
        multiEntry: false;
      };
    };
  };
  
  [STORE_NAMES.METADATA]: {
    keyPath: 'version';
    autoIncrement: false;
    indexes: {};
  };

  [STORE_NAMES.GRAPH_NODES]: {
    keyPath: 'id';
    autoIncrement: false;
    indexes: {
      [INDEX_NAMES.GRAPH_NODE_BY_TYPE_AT_TIME]: {
        keyPath: ['type', 'at_time'];
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.GRAPH_NODE_BY_PAGE_NORMALIZED_URL]: {
        keyPath: 'normalized_url';
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.GRAPH_NODE_BY_DOMAIN_HOSTNAME]: {
        keyPath: 'hostname';
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.GRAPH_NODE_BY_TAG_SLUG]: {
        keyPath: 'slug';
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.GRAPH_NODE_BY_TAB_BROWSER_TAB_ID]: {
        keyPath: 'browser_tab_id';
        unique: false;
        multiEntry: false;
      };
    };
  };

  [STORE_NAMES.GRAPH_EDGES]: {
    keyPath: 'id';
    autoIncrement: false;
    indexes: {
      [INDEX_NAMES.GRAPH_EDGE_BY_FROM_TYPE]: {
        keyPath: ['from_id', 'type'];
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.GRAPH_EDGE_BY_TO_TYPE]: {
        keyPath: ['to_id', 'type'];
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.GRAPH_EDGE_BY_TYPE_AT_TIME]: {
        keyPath: ['type', 'at_time'];
        unique: false;
        multiEntry: false;
      };
      [INDEX_NAMES.GRAPH_EDGE_BY_TYPE_VALID_FROM]: {
        keyPath: ['type', 'valid_from'];
        unique: false;
        multiEntry: false;
      };
    };
  };
}

// =============================================================================
// SCHEMA UTILITY FUNCTIONS
// =============================================================================

/**
 * Create object store configurations for IndexedDB
 */
export function createStoreConfig(storeName: keyof DatabaseSchema) {
  const schema = getSchemaDefinition();
  const storeConfig = schema[storeName];
  
  return {
    name: storeName,
    options: {
      keyPath: storeConfig.keyPath,
      autoIncrement: storeConfig.autoIncrement
    },
    indexes: Object.entries(storeConfig.indexes).map(([indexName, config]) => ({
      name: indexName,
      keyPath: config.keyPath,
      options: {
        unique: config.unique,
        multiEntry: config.multiEntry
      }
    }))
  };
}

/**
 * Get the complete schema definition
 */
export function getSchemaDefinition(): DatabaseSchema {
  return {
    [STORE_NAMES.SESSIONS]: {
      keyPath: 'id',
      autoIncrement: false,
      indexes: {
        [INDEX_NAMES.SESSION_BY_TAG]: {
          keyPath: 'tag',
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.SESSION_BY_CREATED_AT]: {
          keyPath: 'createdAt',
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.SESSION_BY_UPDATED_AT]: {
          keyPath: 'updatedAt',
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.SESSION_BY_DOMAIN]: {
          keyPath: 'domains',
          unique: false,
          multiEntry: true
        }
      }
    },
    
    [STORE_NAMES.TABS]: {
      keyPath: 'id',
      autoIncrement: false,
      indexes: {
        [INDEX_NAMES.TAB_BY_SESSION_ID]: {
          keyPath: 'sessionId',
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.TAB_BY_WINDOW_ID]: {
          keyPath: 'windowId',
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.TAB_BY_URL]: {
          keyPath: 'url',
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.TAB_BY_DOMAIN]: {
          keyPath: 'domain',
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.TAB_BY_CREATED_AT]: {
          keyPath: 'createdAt',
          unique: false,
          multiEntry: false
        }
      }
    },
    
    [STORE_NAMES.NAVIGATION_EVENTS]: {
      keyPath: ['tabId', 'timestamp'],
      autoIncrement: false,
      indexes: {
        [INDEX_NAMES.NAV_BY_TAB_ID]: {
          keyPath: 'tabId',
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.NAV_BY_SESSION_ID]: {
          keyPath: 'sessionId',
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.NAV_BY_TIMESTAMP]: {
          keyPath: 'timestamp',
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.NAV_BY_URL]: {
          keyPath: 'url',
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.NAV_BY_DOMAIN]: {
          keyPath: 'domain',
          unique: false,
          multiEntry: false
        }
      }
    },
    
    [STORE_NAMES.SESSION_BOUNDARIES]: {
      keyPath: 'id',
      autoIncrement: false,
      indexes: {
        [INDEX_NAMES.BOUNDARY_BY_SESSION_ID]: {
          keyPath: 'sessionId',
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.BOUNDARY_BY_TIMESTAMP]: {
          keyPath: 'timestamp',
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.BOUNDARY_BY_REASON]: {
          keyPath: 'reason',
          unique: false,
          multiEntry: false
        }
      }
    },
    
    [STORE_NAMES.METADATA]: {
      keyPath: 'version',
      autoIncrement: false,
      indexes: {}
    },

    [STORE_NAMES.GRAPH_NODES]: {
      keyPath: 'id',
      autoIncrement: false,
      indexes: {
        [INDEX_NAMES.GRAPH_NODE_BY_TYPE_AT_TIME]: {
          keyPath: ['type', 'at_time'],
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.GRAPH_NODE_BY_PAGE_NORMALIZED_URL]: {
          keyPath: 'normalized_url',
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.GRAPH_NODE_BY_DOMAIN_HOSTNAME]: {
          keyPath: 'hostname',
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.GRAPH_NODE_BY_TAG_SLUG]: {
          keyPath: 'slug',
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.GRAPH_NODE_BY_TAB_BROWSER_TAB_ID]: {
          keyPath: 'browser_tab_id',
          unique: false,
          multiEntry: false
        }
      }
    },

    [STORE_NAMES.GRAPH_EDGES]: {
      keyPath: 'id',
      autoIncrement: false,
      indexes: {
        [INDEX_NAMES.GRAPH_EDGE_BY_FROM_TYPE]: {
          keyPath: ['from_id', 'type'],
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.GRAPH_EDGE_BY_TO_TYPE]: {
          keyPath: ['to_id', 'type'],
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.GRAPH_EDGE_BY_TYPE_AT_TIME]: {
          keyPath: ['type', 'at_time'],
          unique: false,
          multiEntry: false
        },
        [INDEX_NAMES.GRAPH_EDGE_BY_TYPE_VALID_FROM]: {
          keyPath: ['type', 'valid_from'],
          unique: false,
          multiEntry: false
        }
      }
    }
  };
}

/**
 * Validate object against schema
 */
export function validateObject<T>(storeName: keyof DatabaseSchema, obj: T): boolean {
  try {
    const schema = getSchemaDefinition();
    const storeConfig = schema[storeName];
    
    // Check if object has required key path
    if (Array.isArray(storeConfig.keyPath)) {
      for (const keyPath of storeConfig.keyPath) {
        if (!(keyPath in (obj as any))) {
          console.warn(`Missing required key path: ${keyPath}`);
          return false;
        }
      }
    } else {
      if (!(storeConfig.keyPath in (obj as any))) {
        console.warn(`Missing required key path: ${storeConfig.keyPath}`);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Schema validation error:', error);
    return false;
  }
}

/**
 * Generate schema migration instructions
 */
export function generateMigrationInstructions(fromVersion: number, toVersion: number): string[] {
  const instructions: string[] = [];
  
  if (fromVersion < 1 && toVersion >= 1) {
    instructions.push('Create initial schema with sessions, tabs, navigation_events, session_boundaries, and metadata stores');
    instructions.push('Add all required indexes for efficient querying');
  }

  if (fromVersion < 2 && toVersion >= 2) {
    instructions.push('Add graph_nodes and graph_edges object stores for the temporal browsing graph');
    instructions.push('Create graph node indexes: (type, at_time), plus type-specific single-field indexes');
    instructions.push('Create graph edge indexes: (from_id, type), (to_id, type), (type, at_time), (type, valid_from)');
  }

  return instructions;
}