/**
 * Tests for data models and transformers
 */

import { EventToGraphTransformer, GraphToEventTransformer } from '../../database/models';
import { NodeType, RelationshipType } from '../../database/schema';
import { BrowsingSession, TabInfo, NavigationEvent, ExtensionSettings } from '../../shared/types';

// Mock browser environment
Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    language: 'en-US'
  }
});

Object.defineProperty(global, 'screen', {
  value: {
    width: 1920,
    height: 1080,
    colorDepth: 24
  }
});

Object.defineProperty(global, 'Intl', {
  value: {
    DateTimeFormat: () => ({
      resolvedOptions: () => ({ timeZone: 'America/New_York' })
    })
  }
});

// Mock document and canvas
Object.defineProperty(global, 'document', {
  value: {
    createElement: jest.fn(() => ({
      getContext: jest.fn(() => ({
        textBaseline: '',
        font: '',
        fillText: jest.fn()
      })),
      toDataURL: jest.fn(() => 'data:image/png;base64,mock')
    }))
  }
});

describe('EventToGraphTransformer', () => {
  let transformer: EventToGraphTransformer;

  beforeEach(() => {
    transformer = new EventToGraphTransformer();
  });

  describe('session transformation', () => {
    it('should transform BrowsingSession to SessionNode', () => {
      const session: BrowsingSession = {
        id: 'session-1',
        tag: 'work',
        createdAt: 1640995200000,
        updatedAt: 1640995200000,
        tabs: [],
        windowIds: [1, 2],
        metadata: {
          purpose: 'Research project',
          notes: 'Important documents',
          isPrivate: false,
          totalTime: 3600000,
          pageCount: 5,
          domain: ['example.com', 'google.com']
        }
      };

      const sessionNode = transformer.transformSession(session, 'user-1');

      expect(sessionNode.type).toBe(NodeType.SESSION);
      expect(sessionNode.properties.tag).toBe('work');
      expect(sessionNode.properties.purpose).toBe('Research project');
      expect(sessionNode.properties.notes).toBe('Important documents');
      expect(sessionNode.properties.isPrivate).toBe(false);
      expect(sessionNode.properties.totalTime).toBe(3600000);
      expect(sessionNode.properties.pageCount).toBe(5);
      expect(sessionNode.properties.tabCount).toBe(0);
      expect(sessionNode.properties.windowCount).toBe(2);
      expect(sessionNode.properties.domains).toEqual(['example.com', 'google.com']);
      expect(sessionNode.properties.isActive).toBe(true);
    });
  });

  describe('tab transformation', () => {
    it('should transform TabInfo to PageNode', () => {
      const tab: TabInfo = {
        id: 123,
        url: 'https://example.com/page',
        title: 'Example Page',
        favicon: 'https://example.com/favicon.ico',
        windowId: 1,
        createdAt: 1640995200000,
        lastAccessed: 1640995300000,
        timeSpent: 60000,
        scrollPosition: 100
      };

      const pageNode = transformer.transformTabToPage(tab);

      expect(pageNode.type).toBe(NodeType.PAGE);
      expect(pageNode.properties.url).toBe('https://example.com/page');
      expect(pageNode.properties.title).toBe('Example Page');
      expect(pageNode.properties.favicon).toBe('https://example.com/favicon.ico');
      expect(pageNode.properties.visitCount).toBe(1);
      expect(pageNode.properties.totalTimeSpent).toBe(60000);
      expect(pageNode.properties.scrollPosition).toEqual({ x: 100, y: 0 });
      expect(pageNode.createdAt).toBe(1640995200000);
      expect(pageNode.updatedAt).toBe(1640995300000);
    });

    it('should handle tab with page capture', () => {
      const tab: TabInfo = {
        id: 123,
        url: 'https://example.com',
        title: 'Example',
        windowId: 1,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        timeSpent: 0,
        scrollPosition: 0
      };

      const capture = {
        url: 'https://example.com',
        title: 'Example',
        capturedAt: Date.now(),
        metadata: {
          description: 'Test page',
          keywords: ['test', 'example'],
          author: 'Test Author',
          language: 'en',
          charset: 'UTF-8',
          viewportSize: { width: 1920, height: 1080 },
          scrollPosition: { x: 0, y: 0 },
          forms: [],
          links: [
            { href: '/about', text: 'About' },
            { href: '/contact', text: 'Contact' }
          ]
        }
      };

      const pageNode = transformer.transformTabToPage(tab, capture);

      expect(pageNode.properties.description).toBe('Test page');
      expect(pageNode.properties.keywords).toEqual(['test', 'example']);
      expect(pageNode.properties.author).toBe('Test Author');
      expect(pageNode.properties.language).toBe('en');
      expect(pageNode.properties.charset).toBe('UTF-8');
      expect(pageNode.properties.viewportSize).toEqual({ width: 1920, height: 1080 });
      expect(pageNode.properties.links).toHaveLength(2);
    });
  });

  describe('navigation transformation', () => {
    it('should transform NavigationEvent to NavigatedToRelationship', () => {
      const navigation: NavigationEvent = {
        tabId: 123,
        url: 'https://example.com/page2',
        referrer: 'https://example.com/page1',
        timestamp: 1640995200000,
        transitionType: 'link'
      };

      const relationship = transformer.transformNavigation(
        navigation,
        'page-1',
        'page-2'
      );

      expect(relationship.type).toBe(RelationshipType.NAVIGATED_TO);
      expect(relationship.from).toBe('page-1');
      expect(relationship.to).toBe('page-2');
      expect(relationship.properties.transitionType).toBe('link');
      expect(relationship.properties.timestamp).toBe(1640995200000);
      expect(relationship.properties.referrer).toBe('https://example.com/page1');
    });
  });

  describe('domain transformation', () => {
    it('should transform URL to DomainNode', () => {
      const domainNode = transformer.transformUrlToDomain('https://example.com:8080/path?query=1#fragment');

      expect(domainNode.type).toBe(NodeType.DOMAIN);
      expect(domainNode.properties.hostname).toBe('example.com');
      expect(domainNode.properties.protocol).toBe('https:');
      expect(domainNode.properties.port).toBe(8080);
      expect(domainNode.properties.visitCount).toBe(1);
      expect(domainNode.properties.totalTimeSpent).toBe(0);
      expect(domainNode.properties.isBlocked).toBe(false);
      expect(domainNode.properties.isBookmarked).toBe(false);
      expect(domainNode.properties.trustLevel).toBe('unknown');
    });

    it('should categorize common domains', () => {
      const googleDomain = transformer.transformUrlToDomain('https://google.com/search?q=test');
      expect(googleDomain.properties.category).toBe('search');

      const githubDomain = transformer.transformUrlToDomain('https://github.com/user/repo');
      expect(githubDomain.properties.category).toBe('development');

      const unknownDomain = transformer.transformUrlToDomain('https://unknown-site.com');
      expect(unknownDomain.properties.category).toBe('other');
    });
  });

  describe('user and device creation', () => {
    it('should create UserNode from settings', () => {
      const settings: ExtensionSettings = {
        autoCapture: true,
        captureInterval: 30000,
        maxSessions: 100,
        defaultTag: 'browsing',
        syncEnabled: false,
        encryptionEnabled: true,
        excludedDomains: [],
        includedDomains: [],
        privacyMode: 'moderate'
      };

      const userNode = transformer.createUserNode(settings);

      expect(userNode.type).toBe(NodeType.USER);
      expect(userNode.properties.browser).toBeTruthy();
      expect(userNode.properties.deviceId).toBeTruthy();
      expect(userNode.properties.settings).toEqual(expect.objectContaining({
        autoCapture: true,
        captureInterval: 30000,
        maxSessions: 100,
        defaultTag: 'browsing',
        syncEnabled: false,
        encryptionEnabled: true,
        privacyMode: 'moderate'
      }));
    });

    it('should create DeviceNode', () => {
      const deviceNode = transformer.createDeviceNode();

      expect(deviceNode.type).toBe(NodeType.DEVICE);
      expect(deviceNode.properties.deviceId).toBeTruthy();
      expect(deviceNode.properties.browser).toBeTruthy();
      expect(deviceNode.properties.os).toBeTruthy();
      expect(deviceNode.properties.userAgent).toBeTruthy();
      expect(deviceNode.properties.isCurrentDevice).toBe(true);
      expect(deviceNode.properties.syncStatus).toBe('active');
    });
  });

  describe('relationship creation', () => {
    it('should create part-of-session relationship', () => {
      const relationship = transformer.createPartOfSessionRelationship(
        'page-1',
        'session-1',
        1640995200000
      );

      expect(relationship.type).toBe(RelationshipType.PART_OF_SESSION);
      expect(relationship.from).toBe('page-1');
      expect(relationship.to).toBe('session-1');
      expect(relationship.properties.joinedAt).toBe(1640995200000);
      expect(relationship.properties.isCurrentSession).toBe(true);
    });

    it('should create belongs-to-domain relationship', () => {
      const relationship = transformer.createBelongsToDomainRelationship(
        'page-1',
        'domain-1',
        'https://example.com/path?query=value#fragment'
      );

      expect(relationship.type).toBe(RelationshipType.BELONGS_TO_DOMAIN);
      expect(relationship.from).toBe('page-1');
      expect(relationship.to).toBe('domain-1');
      expect(relationship.properties.path).toBe('/path');
      expect(relationship.properties.queryParams).toEqual({ query: 'value' });
      expect(relationship.properties.fragment).toBe('#fragment');
      expect(relationship.properties.isSubdomain).toBe(false);
    });

    it('should create tagged-with relationship', () => {
      const relationship = transformer.createTaggedWithRelationship(
        'session-1',
        'tag-1',
        'user-1',
        false
      );

      expect(relationship.type).toBe(RelationshipType.TAGGED_WITH);
      expect(relationship.from).toBe('session-1');
      expect(relationship.to).toBe('tag-1');
      expect(relationship.properties.taggedBy).toBe('user-1');
      expect(relationship.properties.isAutoTag).toBe(false);
      expect(relationship.properties.confidence).toBe(1.0);
    });
  });
});

describe('GraphToEventTransformer', () => {
  let transformer: GraphToEventTransformer;

  beforeEach(() => {
    transformer = new GraphToEventTransformer();
  });

  describe('session conversion', () => {
    it('should convert SessionNode back to BrowsingSession', () => {
      const sessionNode = {
        id: 'session:123-abc',
        type: NodeType.SESSION,
        createdAt: 1640995200000,
        updatedAt: 1640995300000,
        properties: {
          tag: 'work',
          purpose: 'Research',
          notes: 'Important',
          isPrivate: false,
          totalTime: 3600000,
          pageCount: 5,
          tabCount: 3,
          windowCount: 2,
          domains: ['example.com', 'test.com'],
          startedAt: 1640995200000,
          endedAt: undefined,
          isActive: true
        }
      };

      const session = transformer.sessionNodeToSession(sessionNode);

      expect(session.id).toBe('session:123-abc');
      expect(session.tag).toBe('work');
      expect(session.createdAt).toBe(1640995200000);
      expect(session.updatedAt).toBe(1640995300000);
      expect(session.metadata.purpose).toBe('Research');
      expect(session.metadata.notes).toBe('Important');
      expect(session.metadata.isPrivate).toBe(false);
      expect(session.metadata.totalTime).toBe(3600000);
      expect(session.metadata.pageCount).toBe(5);
      expect(session.metadata.domain).toEqual(['example.com', 'test.com']);
    });
  });

  describe('page conversion', () => {
    it('should convert PageNode to TabInfo', () => {
      const pageNode = {
        id: 'page:123-abc',
        type: NodeType.PAGE,
        createdAt: 1640995200000,
        updatedAt: 1640995300000,
        properties: {
          url: 'https://example.com/page',
          title: 'Example Page',
          favicon: 'https://example.com/favicon.ico',
          description: 'Test page',
          totalTimeSpent: 60000,
          visitCount: 5,
          scrollPosition: { x: 0, y: 100 },
          forms: [
            {
              id: 'form-1',
              name: 'contact',
              action: '/submit',
              method: 'POST',
              fields: [
                { name: 'email', type: 'email', value: 'test@example.com', required: true }
              ]
            }
          ],
          isPrivate: false
        }
      };

      const tabInfo = transformer.pageNodeToTab(pageNode, 456, 789);

      expect(tabInfo.id).toBe(456);
      expect(tabInfo.url).toBe('https://example.com/page');
      expect(tabInfo.title).toBe('Example Page');
      expect(tabInfo.favicon).toBe('https://example.com/favicon.ico');
      expect(tabInfo.windowId).toBe(789);
      expect(tabInfo.createdAt).toBe(1640995200000);
      expect(tabInfo.lastAccessed).toBe(1640995300000);
      expect(tabInfo.timeSpent).toBe(60000);
      expect(tabInfo.scrollPosition).toBe(100);
      expect(tabInfo.formData).toEqual({ email: 'test@example.com' });
    });
  });
});