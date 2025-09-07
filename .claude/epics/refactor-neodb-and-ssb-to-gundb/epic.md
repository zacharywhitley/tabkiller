---
name: refactor-neodb-and-ssb-to-gundb
status: completed
created: 2025-09-06T15:40:59Z
completed: 2025-09-07T13:06:16Z
progress: 100%
prd: .claude/prds/refactor-neodb-and-ssb-to-gundb.md
github: https://github.com/zacharywhitley/tabkiller/issues/11
---

# Epic: Refactor NeoDB and SSB to GunDB

## Overview

Simplify TabKiller's data architecture by replacing the current dual-system approach (NeoDB graph database + SSB synchronization) with a unified GunDB solution. This architectural refactoring reduces complexity by 60% while providing both graph database capabilities and real-time synchronization in a single system. The implementation leverages GunDB relay servers for reliable async sync between devices and maintains all existing functionality through backward-compatible APIs.

## Architecture Decisions

**Unified GunDB Architecture**: Replace dual NeoDB/SSB systems with single GunDB instance providing both graph storage and sync capabilities, eliminating data transformation overhead and dual API maintenance.

**Relay Server Pattern**: Deploy GunDB relay servers (Node.js + GunDB) for persistent async synchronization, enabling devices to sync without being online simultaneously while maintaining privacy through end-to-end encryption.

**Backward Compatibility Layer**: Maintain existing repository patterns and service interfaces through adapter layer, ensuring zero API changes while leveraging GunDB's native capabilities underneath.

**Modular Future Extensibility**: Design clean interfaces for potential future layering of SSB (LLM integration) and NeoDB (advanced queries) on top of the simplified GunDB foundation.

**Web Crypto API + GunDB SEA Integration**: Combine existing Web Crypto API encryption with GunDB's Security, Encryption & Authorization (SEA) module for robust end-to-end security through relay servers.

## Technical Approach

### Data Layer Refactoring
**GunDB Schema Design**: Implement graph data models for browsing sessions, tabs, and navigation relationships using GunDB's native graph capabilities, eliminating the need for separate graph database.

**Repository Pattern Preservation**: Create GunDB adapters for all existing repository interfaces (SessionRepository, TabRepository, NavigationRepository) maintaining API compatibility while leveraging GunDB operations underneath.

**Real-Time Reactive Queries**: Replace current polling-based updates with GunDB's native reactive queries, providing real-time UI updates when data changes locally or syncs from remote devices.

### Synchronization Infrastructure  
**GunDB Relay Server Deployment**: Set up lightweight Node.js servers running GunDB for persistent storage and message relay, enabling async device synchronization without direct peer requirements.

**Encrypted Peer Authentication**: Implement secure device pairing using combined Web Crypto API + GunDB SEA, ensuring only authorized devices can sync while maintaining end-to-end encryption through relay infrastructure.

**Conflict Resolution**: Leverage GunDB's built-in Conflict-free Replicated Data Types (CRDTs) for automatic conflict resolution, eliminating complex custom sync logic required by the current NeoDB/SSB approach.

### Performance Optimization
**Bundle Size Reduction**: Remove NeoDB and SSB dependencies, reducing extension bundle size by 15% while adding only GunDB core and SEA modules.

**Memory Management**: Eliminate dual-system memory overhead, targeting <40MB total memory usage compared to current NeoDB+SSB implementation.

**Startup Performance**: Simplify initialization to single GunDB connection, targeting <80ms startup time improvement through reduced system complexity.

## Implementation Strategy

**Phase 1: GunDB Foundation (3 weeks)**
- GunDB integration research and relay server architecture
- Core data model implementation for sessions, tabs, and navigation
- Basic GunDB operations and schema validation
- Performance baseline establishment

**Phase 2: Repository Layer Migration (4 weeks)**
- Implement GunDB adapters for existing repository interfaces  
- Migrate all database operations to GunDB patterns
- Integrate Web Crypto API with GunDB SEA for encryption
- Unit testing framework adaptation for GunDB

**Phase 3: Sync Infrastructure (3 weeks)**
- GunDB relay server deployment and configuration
- Async sync implementation with encrypted peer authentication
- Real-time reactive query implementation
- Cross-browser compatibility validation

**Phase 4: Integration & Polish (2 weeks)**
- End-to-end system integration and testing
- Performance optimization and validation
- Future extensibility interface design
- Documentation and deployment preparation

## Task Breakdown Preview

High-level task categories that will be created:
- [ ] **GunDB Core Integration**: Replace NeoDB with GunDB graph database implementation
- [ ] **Repository Layer Refactoring**: Adapt existing repositories to use GunDB with backward compatibility
- [ ] **GunDB Relay Server Setup**: Deploy and configure relay servers for async device synchronization
- [ ] **Encryption Integration**: Combine Web Crypto API with GunDB SEA for end-to-end security
- [ ] **Sync Protocol Implementation**: Replace SSB with GunDB's native sync capabilities
- [ ] **Real-Time Query System**: Implement reactive queries replacing polling-based updates
- [ ] **Performance Optimization**: Bundle size reduction and memory usage optimization
- [ ] **Cross-Browser Compatibility**: Ensure GunDB functionality across all supported browsers

## Dependencies

### External Dependencies
- **GunDB Core**: Primary database and sync engine
- **GunDB SEA**: Security, Encryption & Authorization module  
- **GunDB Relay Server**: Node.js infrastructure for async sync
- **Web Crypto API**: Existing encryption integration to maintain
- **IndexedDB**: Browser storage backend for GunDB local persistence

### Internal Dependencies
- **Existing Repository Pattern**: Must be preserved through adapter layer
- **Performance Monitoring System**: Requires updates for GunDB metrics
- **Cross-Browser Utils**: May need updates for GunDB compatibility
- **UI Components**: Need reactive programming patterns for real-time updates

### Infrastructure Dependencies
- **Relay Server Hosting**: Cloud infrastructure for persistent GunDB relay nodes
- **Testing Environment**: Adapted for peer-to-peer and async sync testing
- **Development Tooling**: GunDB-compatible testing and debugging tools

## Success Criteria (Technical)

### Performance Benchmarks
- **Startup Time**: <80ms (20% improvement from simplified architecture)
- **Query Response**: <30ms for 95% of operations
- **Memory Usage**: <40MB total (reduction from dual-system elimination)
- **Async Sync Latency**: <30 seconds via relay servers
- **Bundle Size**: 15% reduction through architectural simplification

### Architecture Quality Gates
- **Code Complexity**: 60% reduction in database-related code
- **API Compatibility**: 100% backward compatibility maintained
- **Test Coverage**: >95% for new GunDB components
- **Integration Points**: 50% fewer integration points than dual system

### Reliability Targets
- **Data Consistency**: 99.9% across sync operations
- **Sync Success Rate**: <1% failure rate under normal conditions  
- **Zero Data Loss**: During all normal operations and sync scenarios
- **Cross-Browser Support**: Full functionality in Chrome, Firefox, Safari, Edge

## Estimated Effort

**Overall Timeline**: 12 weeks total
- **Phase 1 (GunDB Foundation)**: 3 weeks
- **Phase 2 (Repository Migration)**: 4 weeks
- **Phase 3 (Sync Infrastructure)**: 3 weeks  
- **Phase 4 (Integration & Polish)**: 2 weeks

**Resource Requirements**: 1 senior full-stack developer with database and sync experience

**Critical Path Items**:
- GunDB relay server architecture and deployment
- Repository layer adapter implementation maintaining API compatibility
- Web Crypto API + GunDB SEA integration for encryption
- Performance validation achieving 60% complexity reduction targets

## Tasks Created
- [ ] #12 - GunDB Core Integration & Data Models (parallel: false)
- [ ] #13 - GunDB Relay Server Infrastructure (parallel: true)
- [ ] #14 - Repository Layer Refactoring (parallel: false)
- [ ] #15 - Web Crypto API + GunDB SEA Integration (parallel: false)
- [ ] #16 - Sync Protocol Implementation (parallel: false)
- [ ] #17 - Real-Time Reactive Query System (parallel: false)

Total tasks:        6
Parallel tasks:        1
Sequential tasks: 5
Estimated total effort: 160 hours (20 days)
