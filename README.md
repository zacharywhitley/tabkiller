# TabKiller

A universal browser extension that transforms how you interact with your browsing history through intelligent organization, powerful search capabilities, and complete privacy control.

## Overview

TabKiller revolutionizes traditional bookmarks by providing:

- **Intelligent Tracking**: Automatic browsing session detection and relationship mapping
- **Session Tagging**: Organize browsing activities by purpose and context
- **AI-Powered Search**: Natural language queries across your browsing history
- **Privacy-First**: End-to-end encryption with user-controlled data
- **Cross-Device Sync**: Real-time decentralized synchronization using GunDB relay network
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

### 📊 Unified Graph Database
- GunDB for graph storage and real-time sync
- Navigation path analysis with CRDT conflict resolution  
- Temporal pattern recognition
- Real-time cross-device data synchronization

## Architecture

```
Browser Events → Content Scripts → Background Service → GunDB (Local + Sync)
                                        ↓                      ↓
User Interface ← Reactive Queries ← Query Processor ← Real-time Updates
                                        ↓                      ↓
Cross-Device ← Zero-Knowledge E2E ← GunDB Relays ← Encrypted Sync
```

## Technology Stack

- **Browser Extension**: Manifest V3 for modern browser compatibility
- **Languages**: JavaScript/TypeScript, CSS3, HTML5
- **Database**: GunDB (unified graph database + real-time sync)
- **Synchronization**: GunDB relay servers with CRDT conflict resolution
- **Security**: Web Crypto API + GunDB SEA with zero-knowledge E2E encryption
- **Page Archiving**: SingleFile integration
- **AI Integration**: OpenAI/Claude APIs for natural language processing

## Development Status

**Current Phase**: Core Architecture Complete ✅  
- ✅ Repository initialized with Claude Code PM system
- ✅ Comprehensive project context established
- ✅ **GunDB Core Integration**: Complete unified database system
- ✅ **Relay Infrastructure**: Production-ready GunDB relay servers
- ✅ **Repository Layer**: Dual-backend support with 100% API compatibility
- ✅ **Zero-Knowledge Encryption**: Web Crypto + GunDB SEA integration
- ✅ **Real-Time Queries**: Reactive system replacing polling architecture
- ✅ **Cross-Device Sync**: CRDT-based sync protocol with <30s latency
- 🚧 UI implementation and extension packaging in progress

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

- **Local First**: Primary storage on user devices with offline-first architecture
- **Zero-Knowledge Encryption**: End-to-end encryption where relay servers cannot decrypt data
- **Decentralized Sync**: GunDB relay network with CRDT conflict resolution
- **Open Source**: Core security components are auditable
- **Data Portability**: Export all data in open formats

## Roadmap

### ✅ Phase 1: Foundation Architecture (Complete)
- ✅ GunDB core integration with unified graph database
- ✅ Real-time reactive query system (eliminates polling)
- ✅ Repository layer with dual-backend support
- ✅ Cross-browser compatibility infrastructure

### ✅ Phase 2: Synchronization & Security (Complete)
- ✅ GunDB relay server infrastructure with monitoring
- ✅ Zero-knowledge end-to-end encryption (Web Crypto + GunDB SEA)
- ✅ CRDT-based conflict resolution for cross-device sync
- ✅ Production-ready security validation and testing

### 🚧 Phase 3: Extension Implementation (In Progress)
- 🚧 Browser extension UI and content scripts
- 🚧 Tab and navigation tracking implementation
- 🚧 Session tagging and organization features
- 🚧 Page archiving with SingleFile integration

### 📋 Phase 4: AI & Polish (Planned)
- 📋 AI-powered natural language queries
- 📋 Advanced session pattern recognition
- 📋 Performance optimization and security auditing
- 📋 Beta user program and feedback integration

## License

[License TBD - Privacy-focused open source license]

## Support

For questions, feedback, or contributions:
- **Issues**: [GitHub Issues](https://github.com/zacharywhitley/tabkiller/issues)
- **Discussions**: [GitHub Discussions](https://github.com/zacharywhitley/tabkiller/discussions)

---

*TabKiller: Intelligent browsing history without the surveillance.*