/**
 * Tests for repository CRUD operations
 */

import { DatabaseConnection } from '../../database/connection';
import { PageRepository, SessionRepository, TagRepository, DomainRepository } from '../../database/repositories';
import { NodeType, PageNode, SessionNode, TagNode, DomainNode } from '../../database/schema';

// Mock the database connection
const mockDatabase = {
  on: jest.fn(),
  get: jest.fn(),
  put: jest.fn(),
  del: jest.fn(),
  getStream: jest.fn(() => ({
    on: jest.fn()
  }))
};

const mockConnection = {
  getDatabase: jest.fn(() => mockDatabase),
  isConnected: jest.fn(() => true),
  initialize: jest.fn(),
  close: jest.fn(),
  healthCheck: jest.fn(() => Promise.resolve(true)),
  getStatus: jest.fn(),
  backup: jest.fn(),
  restore: jest.fn()
} as any as DatabaseConnection;

describe('PageRepository', () => {
  let repository: PageRepository;

  beforeEach(() => {
    repository = new PageRepository(mockConnection);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new page successfully', async () => {
      const pageNode: PageNode = {
        id: 'page:123',
        type: NodeType.PAGE,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        properties: {
          url: 'https://example.com',
          title: 'Example Page',
          description: 'Test page',
          favicon: 'https://example.com/favicon.ico',
          visitCount: 1,
          totalTimeSpent: 0,
          isPrivate: false
        }
      };

      mockDatabase.put.mockImplementation((triples, callback) => {
        callback(null);
      });

      const result = await repository.create(pageNode);
      
      expect(result).toEqual(pageNode);
      expect(mockDatabase.put).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            subject: 'page:123',
            predicate: 'type',
            object: NodeType.PAGE
          })
        ]),
        expect.any(Function)
      );
    });

    it('should throw error when create fails', async () => {
      const pageNode: PageNode = {
        id: 'page:123',
        type: NodeType.PAGE,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        properties: {
          url: 'https://example.com',
          title: 'Example Page',
          visitCount: 1,
          totalTimeSpent: 0,
          isPrivate: false
        }
      };

      mockDatabase.put.mockImplementation((triples, callback) => {
        callback(new Error('Database error'));
      });

      await expect(repository.create(pageNode)).rejects.toThrow('Failed to create node');
    });
  });

  describe('getById', () => {
    it('should retrieve page by ID', async () => {
      const triples = [
        { subject: 'page:123', predicate: 'type', object: NodeType.PAGE },
        { subject: 'page:123', predicate: 'url', object: 'https://example.com' },
        { subject: 'page:123', predicate: 'title', object: 'Example Page' },
        { subject: 'page:123', predicate: 'createdAt', object: 1640995200000 },
        { subject: 'page:123', predicate: 'updatedAt', object: 1640995200000 },
        { subject: 'page:123', predicate: 'visitCount', object: 1 },
        { subject: 'page:123', predicate: 'totalTimeSpent', object: 0 },
        { subject: 'page:123', predicate: 'isPrivate', object: false }
      ];

      mockDatabase.get.mockImplementation((query, callback) => {
        callback(null, triples);
      });

      const result = await repository.getById('page:123');

      expect(result).toEqual({
        id: 'page:123',
        type: NodeType.PAGE,
        createdAt: 1640995200000,
        updatedAt: 1640995200000,
        properties: {
          url: 'https://example.com',
          title: 'Example Page',
          visitCount: 1,
          totalTimeSpent: 0,
          isPrivate: false
        }
      });
    });

    it('should return null when page not found', async () => {
      mockDatabase.get.mockImplementation((query, callback) => {
        callback(null, []);
      });

      const result = await repository.getById('page:nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findByUrl', () => {
    it('should find page by URL', async () => {
      const mockPage: PageNode = {
        id: 'page:123',
        type: NodeType.PAGE,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        properties: {
          url: 'https://example.com',
          title: 'Example Page',
          visitCount: 1,
          totalTimeSpent: 0,
          isPrivate: false
        }
      };

      // Mock findBy method
      jest.spyOn(repository, 'findBy').mockResolvedValue([mockPage]);

      const result = await repository.findByUrl('https://example.com');

      expect(result).toEqual(mockPage);
      expect(repository.findBy).toHaveBeenCalledWith('url', 'https://example.com', 1);
    });

    it('should return null when URL not found', async () => {
      jest.spyOn(repository, 'findBy').mockResolvedValue([]);

      const result = await repository.findByUrl('https://nonexistent.com');
      expect(result).toBeNull();
    });
  });

  describe('incrementVisitCount', () => {
    it('should increment visit count and time spent', async () => {
      const mockPage: PageNode = {
        id: 'page:123',
        type: NodeType.PAGE,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        properties: {
          url: 'https://example.com',
          title: 'Example Page',
          visitCount: 1,
          totalTimeSpent: 1000,
          isPrivate: false
        }
      };

      jest.spyOn(repository, 'getById').mockResolvedValue(mockPage);
      jest.spyOn(repository, 'update').mockResolvedValue(mockPage);

      await repository.incrementVisitCount('page:123', 2000);

      expect(repository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'page:123',
          properties: expect.objectContaining({
            visitCount: 2,
            totalTimeSpent: 3000
          })
        })
      );
    });

    it('should handle missing page gracefully', async () => {
      jest.spyOn(repository, 'getById').mockResolvedValue(null);

      await expect(repository.incrementVisitCount('nonexistent', 1000))
        .resolves
        .not.toThrow();
    });
  });
});

describe('SessionRepository', () => {
  let repository: SessionRepository;

  beforeEach(() => {
    repository = new SessionRepository(mockConnection);
    jest.clearAllMocks();
  });

  describe('findByTag', () => {
    it('should find sessions by tag', async () => {
      const mockSession: SessionNode = {
        id: 'session:123',
        type: NodeType.SESSION,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        properties: {
          tag: 'work',
          isPrivate: false,
          totalTime: 0,
          pageCount: 0,
          tabCount: 0,
          windowCount: 0,
          domains: [],
          startedAt: Date.now(),
          isActive: true
        }
      };

      jest.spyOn(repository, 'findBy').mockResolvedValue([mockSession]);

      const result = await repository.findByTag('work', 10);

      expect(result).toEqual([mockSession]);
      expect(repository.findBy).toHaveBeenCalledWith('tag', 'work', 10);
    });
  });

  describe('getActiveSessions', () => {
    it('should get active sessions', async () => {
      const mockSession: SessionNode = {
        id: 'session:123',
        type: NodeType.SESSION,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        properties: {
          tag: 'work',
          isPrivate: false,
          totalTime: 0,
          pageCount: 0,
          tabCount: 0,
          windowCount: 0,
          domains: [],
          startedAt: Date.now(),
          isActive: true
        }
      };

      jest.spyOn(repository, 'findBy').mockResolvedValue([mockSession]);

      const result = await repository.getActiveSessions(5);

      expect(result).toEqual([mockSession]);
      expect(repository.findBy).toHaveBeenCalledWith('isActive', true, 5);
    });
  });

  describe('endSession', () => {
    it('should end an active session', async () => {
      const mockSession: SessionNode = {
        id: 'session:123',
        type: NodeType.SESSION,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        properties: {
          tag: 'work',
          isPrivate: false,
          totalTime: 0,
          pageCount: 0,
          tabCount: 0,
          windowCount: 0,
          domains: [],
          startedAt: Date.now(),
          isActive: true
        }
      };

      jest.spyOn(repository, 'getById').mockResolvedValue(mockSession);
      jest.spyOn(repository, 'update').mockResolvedValue(mockSession);

      await repository.endSession('session:123');

      expect(repository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'session:123',
          properties: expect.objectContaining({
            isActive: false,
            endedAt: expect.any(Number)
          })
        })
      );
    });
  });
});

describe('TagRepository', () => {
  let repository: TagRepository;

  beforeEach(() => {
    repository = new TagRepository(mockConnection);
    jest.clearAllMocks();
  });

  describe('findByName', () => {
    it('should find tag by name', async () => {
      const mockTag: TagNode = {
        id: 'tag:123',
        type: NodeType.TAG,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        properties: {
          name: 'work',
          usageCount: 5,
          createdBy: 'user:123',
          isPublic: false,
          isSystem: false
        }
      };

      jest.spyOn(repository, 'findBy').mockResolvedValue([mockTag]);

      const result = await repository.findByName('work');

      expect(result).toEqual(mockTag);
      expect(repository.findBy).toHaveBeenCalledWith('name', 'work', 1);
    });

    it('should convert tag name to lowercase', async () => {
      jest.spyOn(repository, 'findBy').mockResolvedValue([]);

      await repository.findByName('WORK');

      expect(repository.findBy).toHaveBeenCalledWith('name', 'work', 1);
    });
  });

  describe('incrementUsage', () => {
    it('should increment tag usage count', async () => {
      const mockTag: TagNode = {
        id: 'tag:123',
        type: NodeType.TAG,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        properties: {
          name: 'work',
          usageCount: 5,
          createdBy: 'user:123',
          isPublic: false,
          isSystem: false
        }
      };

      jest.spyOn(repository, 'getById').mockResolvedValue(mockTag);
      jest.spyOn(repository, 'update').mockResolvedValue(mockTag);

      await repository.incrementUsage('tag:123');

      expect(repository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tag:123',
          properties: expect.objectContaining({
            usageCount: 6
          })
        })
      );
    });
  });
});

describe('DomainRepository', () => {
  let repository: DomainRepository;

  beforeEach(() => {
    repository = new DomainRepository(mockConnection);
    jest.clearAllMocks();
  });

  describe('findByHostname', () => {
    it('should find domain by hostname', async () => {
      const mockDomain: DomainNode = {
        id: 'domain:123',
        type: NodeType.DOMAIN,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        properties: {
          hostname: 'example.com',
          protocol: 'https:',
          visitCount: 10,
          totalTimeSpent: 60000,
          isBlocked: false,
          isBookmarked: false,
          lastVisited: Date.now(),
          trustLevel: 'unknown'
        }
      };

      jest.spyOn(repository, 'findBy').mockResolvedValue([mockDomain]);

      const result = await repository.findByHostname('example.com');

      expect(result).toEqual(mockDomain);
      expect(repository.findBy).toHaveBeenCalledWith('hostname', 'example.com', 1);
    });
  });

  describe('updateStats', () => {
    it('should update domain statistics', async () => {
      const mockDomain: DomainNode = {
        id: 'domain:123',
        type: NodeType.DOMAIN,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        properties: {
          hostname: 'example.com',
          protocol: 'https:',
          visitCount: 5,
          totalTimeSpent: 30000,
          isBlocked: false,
          isBookmarked: false,
          lastVisited: Date.now(),
          trustLevel: 'unknown'
        }
      };

      jest.spyOn(repository, 'getById').mockResolvedValue(mockDomain);
      jest.spyOn(repository, 'update').mockResolvedValue(mockDomain);

      await repository.updateStats('domain:123', {
        visitCount: 2,
        totalTimeSpent: 15000,
        lastVisited: 1640995200000
      });

      expect(repository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'domain:123',
          properties: expect.objectContaining({
            visitCount: 7,
            totalTimeSpent: 45000,
            lastVisited: 1640995200000
          })
        })
      );
    });
  });
});