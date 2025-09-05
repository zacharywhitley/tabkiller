---
created: 2025-09-05T01:40:49Z
last_updated: 2025-09-05T01:40:49Z
version: 1.0
author: Claude Code PM System
---

# Technology Context

## Current Technology Stack

### Development Environment
- **Git:** Repository version control
- **GitHub:** Remote repository and issue tracking
- **Claude Code PM:** Structured development workflow system

### Documentation Tools
- **Markdown:** Documentation format
- **Mermaid:** Diagram generation (in README)

## Planned Technology Stack

### Core Technologies

#### Browser Extension Framework
- **Manifest V3:** Modern extension standard
- **Web Extensions API:** Cross-browser compatibility
- **Service Workers:** Background processing (replaces background pages)

#### Programming Languages
- **JavaScript (ES2022+):** Primary development language
- **TypeScript:** Type safety and better developer experience
- **CSS3:** Styling with modern features
- **HTML5:** Popup and options interfaces

#### Database & Storage
- **NeoDB:** Graph database for browsing history
  - Neo4j-compatible graph database
  - Optimized for relationship queries
  - Support for complex browsing pattern analysis
- **IndexedDB:** Browser-native local storage
- **Chrome Storage API:** Extension-specific storage

#### Synchronization
- **Secure Scuttlebutt (SSB):** Decentralized synchronization protocol
  - Peer-to-peer data sync
  - Offline-first architecture
  - Cryptographic data integrity
- **Custom Sync Layer:** Bridge between browser storage and SSB

#### Security & Encryption
- **Web Crypto API:** Browser-native cryptographic operations
- **AES-GCM:** Symmetric encryption for user data
- **Ed25519:** Digital signatures for data integrity
- **PBKDF2:** Key derivation from user passwords

#### Page Archiving
- **SingleFile:** Complete page preservation
- **DOM Serialization:** Lightweight page snapshots
- **Content Extraction:** Text and metadata parsing

#### AI/LLM Integration
- **OpenAI API:** GPT models for query processing
- **Anthropic Claude:** Alternative LLM provider
- **Local Models:** Privacy-focused inference options
- **Embedding Models:** Semantic search capabilities

### Development Tools

#### Build System
- **Webpack:** Module bundling and asset management
- **Babel:** JavaScript transpilation
- **PostCSS:** CSS processing and optimization
- **ESLint:** Code linting and style enforcement
- **Prettier:** Code formatting

#### Testing Framework
- **Jest:** Unit testing framework
- **Puppeteer:** End-to-end browser testing
- **WebExtensions Testing:** Extension-specific testing tools
- **Playwright:** Cross-browser testing

#### Development Workflow
- **npm/yarn:** Package management
- **GitHub Actions:** CI/CD pipeline
- **Web-ext:** Extension development and testing tool

## Browser Compatibility

### Target Browsers
- **Chrome/Chromium:** Primary target (70%+ market share)
- **Firefox:** Secondary target (strong developer community)
- **Safari:** Tertiary target (macOS/iOS ecosystem)
- **Edge:** Chromium-based, inherits Chrome support

### Extension API Support
- **Manifest V3:** Modern standard across all browsers
- **Storage API:** Consistent across platforms
- **Tabs API:** Universal support with minor variations
- **Content Scripts:** Core functionality available everywhere

## External Dependencies

### Core Libraries
```json
{
  "neo4j-driver": "^5.x",
  "ssb-client": "^4.x",
  "single-file": "^1.x",
  "openai": "^4.x"
}
```

### Development Dependencies
```json
{
  "webpack": "^5.x",
  "typescript": "^5.x",
  "jest": "^29.x",
  "puppeteer": "^21.x",
  "eslint": "^8.x",
  "web-ext": "^7.x"
}
```

## Infrastructure Requirements

### Database Infrastructure
- **NeoDB Instance:** Self-hosted or managed graph database
- **Backup Strategy:** Regular graph database snapshots
- **Scaling Plan:** Horizontal scaling for multi-user support

### Synchronization Network
- **SSB Peers:** Distributed network nodes
- **Bootstrap Servers:** Initial peer discovery
- **Relay Nodes:** Message propagation assistance

### API Services
- **LLM Endpoints:** OpenAI/Claude API access
- **Embedding Services:** Vector similarity calculations
- **Content Processing:** Page analysis and extraction

## Security Considerations

### Data Protection
- **End-to-End Encryption:** All user data encrypted before storage
- **Key Management:** User-controlled encryption keys
- **Privacy by Design:** No plaintext data leaves user control

### Browser Security
- **Content Security Policy:** Strict CSP for all extension pages
- **Permissions Model:** Minimal required permissions
- **Isolation:** Proper content script isolation

### Network Security
- **HTTPS Only:** All external communications encrypted
- **Certificate Pinning:** API endpoint verification
- **Rate Limiting:** Prevent abuse of external services

## Performance Targets

### Extension Performance
- **Startup Time:** < 100ms extension initialization
- **Memory Usage:** < 50MB RAM footprint
- **CPU Impact:** < 5% background CPU usage

### Database Performance
- **Query Response:** < 50ms for typical queries
- **Sync Latency:** < 2s for small updates
- **Storage Efficiency:** < 1MB per 1000 pages tracked

### Network Performance
- **Sync Bandwidth:** < 10KB/min background sync
- **API Latency:** < 500ms for LLM queries
- **Offline Support:** Full functionality without network

## Version Strategy

### Browser Extension
- **Semantic Versioning:** Major.Minor.Patch
- **Auto-Update:** Gradual rollout for stability
- **Feature Flags:** A/B testing for new features

### Dependencies
- **LTS Versions:** Prefer long-term support releases
- **Security Updates:** Immediate updates for vulnerabilities
- **Breaking Changes:** Major version increments only