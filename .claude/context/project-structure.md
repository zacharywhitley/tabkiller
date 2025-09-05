---
created: 2025-09-05T01:40:49Z
last_updated: 2025-09-05T01:40:49Z
version: 1.0
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

## Planned Project Structure

### Browser Extension Architecture
```
src/
├── manifest.json             # Extension manifest (V3)
├── background/               # Service worker scripts
│   ├── main.js              # Main background script
│   └── database.js          # NeoDB integration
├── content/                  # Content scripts
│   ├── tracker.js           # Page tracking logic
│   └── injector.js          # SingleFile integration
├── popup/                    # Extension popup UI
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/                  # Settings page
│   ├── options.html
│   ├── options.js
│   └── options.css
├── lib/                     # Shared libraries
│   ├── crypto.js            # Encryption utilities
│   ├── ssb.js              # SSB protocol integration
│   └── llm.js              # LLM integration
└── assets/                  # Static assets
    ├── icons/              # Extension icons
    └── styles/             # Shared CSS
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