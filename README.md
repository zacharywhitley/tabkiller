# TabKiller

A universal browser extension that transforms how you interact with your browsing history through intelligent organization, powerful search capabilities, and complete privacy control.

## Overview

TabKiller revolutionizes traditional bookmarks by providing:

- **Intelligent Tracking**: Automatic browsing session detection and relationship mapping
- **Session Tagging**: Organize browsing activities by purpose and context
- **AI-Powered Search**: Natural language queries across your browsing history
- **Privacy-First**: End-to-end encryption with user-controlled data
- **Cross-Browser Sync**: Decentralized synchronization across devices using SSB protocol
- **Page Archiving**: Complete page preservation with SingleFile integration

## Key Features

### 🎯 Smart Session Management
- Automatic session boundary detection
- Manual session tagging and categorization
- Complete browsing session restoration
- Cross-window relationship tracking

### 🔍 Intelligent Search
- Natural language queries about your browsing history
- Semantic search beyond keywords
- Pattern recognition in browsing behavior
- Context-aware content suggestions

### 🔒 Privacy & Security
- End-to-end encryption with user-controlled keys
- Local-first data storage
- Decentralized synchronization (no corporate servers)
- Complete data ownership and portability

### 📊 Graph Database Integration
- NeoDB for relationship-rich data storage
- Navigation path analysis
- Temporal pattern recognition
- Content relationship discovery

## Architecture

```
Browser Events → Content Scripts → Background Service → Local Database
                                        ↓
User Interface ← Search Engine ← Query Processor ← Graph Database
                                        ↓
External Sync ← Encryption Layer ← Batch Processor ← Change Detection
```

## Technology Stack

- **Browser Extension**: Manifest V3 for modern browser compatibility
- **Languages**: JavaScript/TypeScript, CSS3, HTML5
- **Database**: NeoDB (graph database) + IndexedDB (local storage)
- **Synchronization**: Secure Scuttlebutt (SSB) protocol
- **Security**: Web Crypto API with AES-GCM encryption
- **Page Archiving**: SingleFile integration
- **AI Integration**: OpenAI/Claude APIs for natural language processing

## Development Status

**Current Phase**: Initial setup and planning
- ✅ Repository initialized with Claude Code PM system
- ✅ Comprehensive project context established
- ✅ Technical architecture defined
- 🚧 Core extension development in progress

## Getting Started

### Prerequisites
- Node.js 18+ 
- Chrome/Firefox/Safari for testing
- Git for version control

### Development Setup
```bash
git clone https://github.com/zacharywhitley/tabkiller.git
cd tabkiller
npm install
npm run dev
```

### Claude Code PM Workflow
This project uses Claude Code's structured development workflow:

```bash
# Initialize project
/pm:init

# Create new features
/pm:prd-new [feature-name]
/pm:epic-oneshot [feature-name]

# Start development work
/pm:issue-start [issue-id]

# Run tests
/testing:run
```

## Contributing

This project follows spec-driven development principles:

1. **No Vibe Coding**: Every feature traced back to explicit specifications
2. **5-Phase Discipline**: Brainstorm → Document → Plan → Execute → Track
3. **Parallel Agent Architecture**: Specialized agents for different work streams
4. **Context Preservation**: Maintain clean main conversation flow

### Code Standards
- **JavaScript**: ES2022+ with TypeScript for type safety
- **Formatting**: Prettier with ESLint
- **Testing**: Jest for unit tests, Puppeteer for E2E
- **Commits**: Conventional Commits format

## Privacy Philosophy

TabKiller is built on the principle that users should own and control their browsing data:

- **Local First**: Primary storage on user devices, not cloud servers
- **User-Controlled Encryption**: You manage your own encryption keys
- **Decentralized Sync**: Peer-to-peer synchronization without corporate intermediaries
- **Open Source**: Core security components are auditable
- **Data Portability**: Export all data in open formats

## Roadmap

### Phase 1: Foundation (Months 1-2)
- Core extension architecture
- Basic tab and navigation tracking
- Local storage and session management
- Cross-browser compatibility

### Phase 2: Intelligence (Months 3-4)
- Graph database integration
- Session tagging and organization
- Basic search and filtering
- Page archiving system

### Phase 3: Synchronization (Months 5-6)
- SSB protocol integration
- End-to-end encryption
- Cross-device synchronization
- AI-powered natural language queries

### Phase 4: Polish and Launch (Months 6-8)
- User interface refinement
- Performance optimization
- Security auditing
- Beta user program

## License

[License TBD - Privacy-focused open source license]

## Support

For questions, feedback, or contributions:
- **Issues**: [GitHub Issues](https://github.com/zacharywhitley/tabkiller/issues)
- **Discussions**: [GitHub Discussions](https://github.com/zacharywhitley/tabkiller/discussions)

---

*TabKiller: Intelligent browsing history without the surveillance.*