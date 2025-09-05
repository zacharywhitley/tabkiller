---
created: 2025-09-05T01:40:49Z
last_updated: 2025-09-05T01:40:49Z
version: 1.0
author: Claude Code PM System
---

# Project Style Guide

## Coding Standards

### General Principles
- **Simplicity Over Complexity:** Choose the most straightforward solution that meets requirements
- **Readability First:** Code should be self-documenting and easily understood by other developers
- **Consistency:** Maintain uniform patterns across the entire codebase
- **Performance Conscious:** Consider resource usage and optimization in all implementations

### File Organization
- **Logical Grouping:** Organize files by feature/functionality, not by file type
- **Consistent Structure:** Maintain parallel directory structures across different platforms
- **Clear Separation:** Separate concerns between UI, business logic, and data layers
- **Meaningful Names:** File names should clearly indicate their purpose and contents

## Naming Conventions

### JavaScript/TypeScript
```javascript
// Constants - SCREAMING_SNAKE_CASE
const MAX_TABS_COUNT = 100;
const DEFAULT_SYNC_INTERVAL = 30000;

// Variables and Functions - camelCase
const currentSession = getCurrentSession();
function updateBrowsingHistory(sessionData) { }

// Classes - PascalCase
class TabManager { }
class BrowsingSession { }

// Private Properties - leading underscore
class TabTracker {
  _privateState = {};
  _internalMethod() { }
}

// Boolean Variables - descriptive prefixes
const isSessionActive = true;
const hasEncryptedData = false;
const canSyncData = checkSyncCapability();
```

### CSS Classes
```css
/* BEM Methodology - Block__Element--Modifier */
.tab-manager { }
.tab-manager__header { }
.tab-manager__header--highlighted { }

/* Component prefix for clarity */
.tk-popup { }  /* TabKiller popup */
.tk-popup__button { }
.tk-popup__button--primary { }
```

### Files and Directories
```
// Directories - kebab-case
background-scripts/
content-scripts/
user-interface/

// JavaScript files - camelCase
tabManager.js
sessionTracker.js
cryptoHelper.js

// Component files - PascalCase
TabPopup.js
SessionViewer.js
HistoryGraph.js

// Configuration files - lowercase
manifest.json
package.json
.eslintrc.json
```

## Code Formatting

### JavaScript/TypeScript Style
```javascript
// Function declarations
function processTabData(tabs, options = {}) {
  // Guard clauses first
  if (!tabs || tabs.length === 0) {
    return [];
  }
  
  // Main logic with clear variable names
  const processedTabs = tabs
    .filter(tab => tab.url && !tab.url.startsWith('chrome://'))
    .map(tab => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      timestamp: Date.now(),
    }));
    
  return processedTabs;
}

// Class definitions
class SessionManager {
  constructor(options) {
    this.options = { ...defaultOptions, ...options };
    this.sessions = new Map();
  }
  
  async createSession(tag) {
    const session = {
      id: generateId(),
      tag,
      createdAt: Date.now(),
      tabs: [],
    };
    
    this.sessions.set(session.id, session);
    await this.persistSession(session);
    
    return session;
  }
}

// Arrow functions for callbacks
const handleTabUpdate = (tabId, changeInfo) => {
  if (changeInfo.url) {
    updateNavigationHistory(tabId, changeInfo.url);
  }
};

// Async/await over Promises
async function syncWithDatabase() {
  try {
    const localData = await getLocalData();
    const syncResult = await uploadToDatabase(localData);
    return syncResult;
  } catch (error) {
    logger.error('Sync failed:', error);
    throw new SyncError('Database synchronization failed');
  }
}
```

### CSS Style
```css
/* Property order: positioning, display, size, styling */
.tab-manager {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 200px;
  padding: 16px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

/* Use CSS custom properties for theming */
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --text-primary: #333333;
  --text-secondary: #666666;
  --border-color: #dddddd;
  --accent-color: #0066cc;
}

/* Mobile-first responsive design */
.session-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 768px) {
  .session-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .session-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

## Documentation Standards

### JSDoc Comments
```javascript
/**
 * Tracks navigation between pages and updates session history
 * @param {Object} navigationData - Navigation event details
 * @param {string} navigationData.url - Target URL
 * @param {string} navigationData.referrer - Source URL
 * @param {number} navigationData.tabId - Browser tab identifier
 * @param {string} navigationData.timestamp - Navigation timestamp
 * @returns {Promise<SessionUpdate>} Updated session information
 * @throws {ValidationError} When navigation data is invalid
 * @example
 * const update = await trackNavigation({
 *   url: 'https://example.com',
 *   referrer: 'https://google.com',
 *   tabId: 123,
 *   timestamp: Date.now()
 * });
 */
async function trackNavigation(navigationData) {
  // Implementation
}
```

### README Structure
```markdown
# Component Name

Brief description of what this component does.

## Usage

```javascript
// Code example showing basic usage
```

## API Reference

### Methods

#### methodName(param1, param2)
- **param1** (Type): Description
- **param2** (Type): Description  
- **Returns**: Type - Description

## Configuration

Available options and their default values.

## Examples

Real-world usage examples with expected output.
```

### Inline Comments
```javascript
// Comments explain WHY, not WHAT
function calculateSessionScore(session) {
  // Score based on time spent and interaction quality
  // Higher scores indicate more valuable sessions
  const timeWeight = Math.log(session.duration + 1);
  const interactionWeight = session.interactions.length * 0.1;
  
  return timeWeight * interactionWeight;
}
```

## Error Handling Patterns

### Error Types and Messages
```javascript
// Custom error types for different failure modes
class ValidationError extends Error {
  constructor(field, value) {
    super(`Invalid ${field}: ${value}`);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

class SyncError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'SyncError';
    this.cause = cause;
  }
}

// Error handling with user-friendly messages
async function saveSession(sessionData) {
  try {
    validateSessionData(sessionData);
    await persistToDatabase(sessionData);
  } catch (error) {
    if (error instanceof ValidationError) {
      showUserMessage('Please check your session data');
    } else if (error instanceof SyncError) {
      showUserMessage('Unable to sync - will retry automatically');
    } else {
      logger.error('Unexpected error:', error);
      showUserMessage('Something went wrong - please try again');
    }
    throw error;
  }
}
```

## Testing Standards

### Test Structure
```javascript
describe('SessionManager', () => {
  let sessionManager;
  
  beforeEach(() => {
    sessionManager = new SessionManager();
  });
  
  afterEach(() => {
    sessionManager.cleanup();
  });
  
  describe('createSession', () => {
    test('should create session with valid tag', async () => {
      // Arrange
      const tag = 'research-project';
      
      // Act
      const session = await sessionManager.createSession(tag);
      
      // Assert
      expect(session.id).toBeDefined();
      expect(session.tag).toBe(tag);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.tabs).toEqual([]);
    });
    
    test('should reject invalid tag', async () => {
      // Arrange
      const invalidTag = '';
      
      // Act & Assert
      await expect(
        sessionManager.createSession(invalidTag)
      ).rejects.toThrow(ValidationError);
    });
  });
});
```

### Test Naming
- **Test file names:** `componentName.test.js`
- **Test descriptions:** Clear, specific descriptions of what is being tested
- **Test structure:** Arrange, Act, Assert pattern
- **Mock naming:** `mockFunctionName` or `functionNameMock`

## Commit Message Standards

### Conventional Commits Format
```
type(scope): description

[optional body]

[optional footer(s)]
```

### Commit Types
- **feat:** New feature implementation
- **fix:** Bug fix
- **docs:** Documentation changes
- **style:** Code style changes (formatting, missing semicolons, etc.)
- **refactor:** Code changes that neither fix a bug nor add a feature
- **test:** Adding or modifying tests
- **chore:** Maintenance tasks (build process, dependencies, etc.)

### Examples
```
feat(sync): implement SSB protocol integration

Add initial SSB client with peer discovery and message broadcasting.
Includes encryption wrapper and conflict resolution logic.

Closes #123

fix(tracking): prevent duplicate navigation events

Filter rapid successive navigation events to the same URL within 100ms
to avoid creating duplicate history entries.

Fixes #456

docs(api): update SessionManager documentation

Add examples for session tagging and improve parameter descriptions.
Include error handling patterns and performance considerations.
```

## Performance Guidelines

### Resource Management
```javascript
// Proper cleanup of resources
class TabTracker {
  constructor() {
    this.listeners = new Set();
    this.timers = new Set();
  }
  
  addListener(target, event, handler) {
    target.addEventListener(event, handler);
    this.listeners.add({ target, event, handler });
  }
  
  setTimeout(callback, delay) {
    const timerId = setTimeout(callback, delay);
    this.timers.add(timerId);
    return timerId;
  }
  
  cleanup() {
    // Remove all event listeners
    for (const { target, event, handler } of this.listeners) {
      target.removeEventListener(event, handler);
    }
    
    // Clear all timers
    for (const timerId of this.timers) {
      clearTimeout(timerId);
    }
    
    this.listeners.clear();
    this.timers.clear();
  }
}
```

### Memory Optimization
```javascript
// Use WeakMap for object associations
const sessionMetadata = new WeakMap();

// Debounce expensive operations
const debouncedSync = debounce(syncWithRemote, 1000);

// Lazy loading for large datasets
async function* getSessionHistory() {
  let offset = 0;
  const limit = 100;
  
  while (true) {
    const batch = await fetchSessionBatch(offset, limit);
    if (batch.length === 0) break;
    
    yield* batch;
    offset += limit;
  }
}
```

## Security Guidelines

### Data Sanitization
```javascript
// Always validate and sanitize external data
function sanitizeUrl(url) {
  try {
    const parsedUrl = new URL(url);
    
    // Only allow HTTP/HTTPS protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid protocol');
    }
    
    return parsedUrl.toString();
  } catch (error) {
    throw new ValidationError('url', url);
  }
}

// Escape HTML content
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

### Content Security Policy
```javascript
// Avoid inline scripts and styles
// Use nonce for dynamic content when necessary
const nonce = crypto.randomUUID();

// Set CSP headers
const csp = `
  default-src 'self';
  script-src 'self' 'nonce-${nonce}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https:;
`.replace(/\s+/g, ' ').trim();
```

These standards ensure consistent, maintainable, and secure code across the entire TabKiller project while supporting the privacy-first architecture and cross-browser compatibility requirements.