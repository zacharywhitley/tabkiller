---
created: 2025-09-05T01:40:49Z
last_updated: 2026-07-09T21:59:33Z
version: 2.0
author: Claude Code PM System
---

# Project Structure

## Directory Organization

### Root Level
```
tabkiller/
├── .claude/                    # Claude Code PM system
├── .git/                      # Git repository data
├── .gitignore                 # Git ignore patterns
├── AGENTS.md                  # Agent documentation
├── CLAUDE.md                  # Project instructions for Claude
├── COMMANDS.md                # Command reference
└── README.md                  # PM system documentation
```

### Claude PM System Structure
```
.claude/
├── agents/                    # Specialized task agents
│   ├── code-analyzer.md      # Bug hunting and logic tracing
│   ├── file-analyzer.md      # File content summarization
│   ├── parallel-worker.md    # Parallel execution coordination
│   └── test-runner.md        # Test execution and analysis
├── commands/                  # Command definitions
│   ├── context/              # Context management commands
│   ├── pm/                   # Project management commands
│   └── testing/              # Test execution commands
├── context/                  # Project-wide context files
│   ├── progress.md           # Current status and next steps
│   ├── project-structure.md  # This file
│   ├── tech-context.md       # Dependencies and tools
│   ├── system-patterns.md    # Architectural patterns
│   ├── product-context.md    # Requirements and features
│   ├── project-brief.md      # Scope and objectives
│   ├── project-overview.md   # Features and capabilities
│   ├── project-vision.md     # Long-term direction
│   └── project-style-guide.md # Coding standards
├── epics/                    # Epic planning workspace
├── prds/                     # Product Requirements Documents
├── rules/                    # Development rules and patterns
└── scripts/                  # Utility scripts
```

## Actual Project Structure (as of 2026-07-09)

### Browser Extension Source (`src/`)
```
src/
├── adapters/       # Cross-browser adapters (Chrome/Firefox/Safari/Edge)
├── background/     # Service-worker / background scripts
├── browser/        # Browser API polyfill wrappers
├── components/     # Reusable UI components
├── content/        # Content scripts
├── context-menu/   # Context menu integration (issue #45)
├── contexts/       # React contexts (routing, session, theme, etc.)
├── crypto/         # Encryption utilities
├── database/       # Data-layer abstractions (currently NeoDB-oriented)
├── hooks/          # React hooks
├── icons/          # Extension icons
├── manifest/       # Per-browser manifest generators
├── options/        # Options / settings page
├── performance/    # Performance instrumentation
├── popup/          # Browser action popup
├── router/         # Client-side routing
├── security/       # Security utilities (CSP, permissions, etc.)
├── session/        # Session detection and lifecycle (issue #42)
├── shared/         # Cross-cutting utilities
├── storage/        # Storage abstractions (IndexedDB, chrome.storage)
├── testing/        # Test helpers / harness
├── tracking/       # Tab tracking (issue #42)
├── ui/             # UI feature modules (timeline, sidebar, etc.)
├── utils/          # Generic utilities
└── __tests__/      # Unit tests co-located under src/
```

### Root-Level Extension Files
```
tabkiller/
├── manifest.json          # Base manifest (per-browser variants generated at build)
├── webpack.config.js      # Multi-browser build (TARGET_BROWSER env)
├── tsconfig.json          # TypeScript config
├── jest.config.js         # Jest config
├── test-performance.js    # Performance benchmark harness
├── scripts/               # build.sh, dev.sh helpers
└── tests/                 # Top-level test suites
```

### Testing Structure
```
tests/
├── unit/                    # Unit tests
├── integration/             # Integration tests
├── e2e/                    # End-to-end tests
└── fixtures/               # Test data and mocks
```

### Build and Deployment
```
build/                      # Build output
├── chrome/                 # Chrome extension build
├── firefox/                # Firefox extension build
└── safari/                 # Safari extension build

scripts/
├── build.js               # Build automation
├── test.js                # Test runner
└── package.js             # Extension packaging
```

## File Naming Conventions

### General Patterns
- **Kebab-case** for directories: `background-scripts/`
- **PascalCase** for components: `TabManager.js`
- **camelCase** for utilities: `cryptoHelper.js`
- **SCREAMING_SNAKE_CASE** for constants: `MAX_TABS_COUNT`

### Extension-Specific
- **manifest.json** - Extension configuration
- **content-script-*.js** - Content scripts for different contexts
- **background-*.js** - Service worker modules
- **popup-*.html/js/css** - Popup interface files

### PM System
- **epic-name.md** - Epic documentation
- **001.md, 002.md** - Task files during decomposition
- **1234.md** - Task files after GitHub sync (using issue ID)

## Module Organization

### Separation of Concerns
- **Background scripts** - Handle persistent operations, database sync
- **Content scripts** - Page interaction, data collection
- **Popup/Options** - User interface and settings
- **Libraries** - Shared utilities and integrations

### Data Flow
```
Page Events → Content Script → Background Script → Database
     ↓              ↓              ↓           ↓
User Actions → Popup UI → Background → Sync (SSB)
```

## Integration Points

### External Systems
- **NeoDB** - Graph database for browsing history
- **SSB** - Secure Scuttlebutt for synchronization
- **SingleFile** - Page archiving integration
- **LLM APIs** - Query and analysis capabilities

### Browser APIs
- **Tabs API** - Tab management and tracking
- **History API** - Browser history integration  
- **Storage API** - Local data persistence
- **Bookmarks API** - Bookmark system integration

## Future Expansion

### Planned Directories
- `docs/` - User and developer documentation
- `locales/` - Internationalization files
- `themes/` - UI themes and customization
- `plugins/` - Extension plugin architecture
- `analytics/` - Usage analytics and insights