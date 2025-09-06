---
name: refactor-neodb-and-ssb-to-gundb
description: Simplify TabKiller's data architecture by replacing NeoDB/SSB with unified GunDB system, with future extensibility for advanced features
status: backlog
created: 2025-09-06T15:25:08Z
---

# PRD: Refactor NeoDB and SSB to GunDB

## Executive Summary

This PRD outlines the architectural simplification of TabKiller by replacing the current dual-system approach (NeoDB + SSB) with a unified GunDB-based solution. GunDB provides both graph database and real-time sync capabilities in a single system, significantly reducing architectural complexity while maintaining privacy-first, local-first principles.

This simplified approach establishes GunDB as the core foundation, with future extensibility planned for layering SSB (for LLM integration) and NeoDB (for advanced querying) on top, potentially using a GunDB-to-NeoDB syncing mechanism. Since TabKiller is pre-launch with no existing users, this can be implemented as a clean architectural replacement.

## Problem Statement

### Current Architecture Challenges

**Dual-System Complexity:**
- Maintaining separate NeoDB (graph storage) and SSB (sync protocol) systems increases complexity
- Different data models and APIs require dual maintenance paths
- Complex data transformation between local graph storage and sync format
- Increased bundle size and memory footprint from two separate systems

**Performance Limitations:**
- Data must be serialized/deserialized between NeoDB and SSB formats
- Sync conflicts require complex resolution logic between different data models
- Real-time updates require polling rather than reactive updates
- Connection management overhead for both database and sync connections

**Development & Maintenance Overhead:**
- Two separate systems to debug, optimize, and maintain
- Different error handling patterns and retry logic
- Separate testing frameworks and mock strategies required
- Complex deployment and versioning considerations

### Why GunDB is the Simplified Solution

**Architectural Simplification:**
- Single system replacing dual NeoDB/SSB complexity
- Unified graph database and real-time sync capabilities
- Consistent data model across local storage and network sync
- Simplified error handling and connection management

**Asynchronous Sync with Relay Servers:**
- GunDB relay servers enable async sync between devices
- Devices don't need to be online simultaneously
- Persistent relay nodes store and forward encrypted data
- Maintains privacy-first principles with end-to-end encryption

**Future Extensibility:**
- Foundation for optional SSB integration (LLM connectivity)
- Support for future NeoDB layering (advanced graph queries)
- GunDB-to-NeoDB sync mechanisms for complex analytics
- Modular architecture allowing incremental complexity

## User Stories

### Primary User Personas

**Privacy-Conscious Power User (Alex)**
- Wants seamless sync across multiple devices without compromising privacy
- Expects real-time updates when browsing on different devices
- Values data ownership and control over synchronization

**Mobile-Desktop User (Sam)**
- Frequently switches between mobile browser and desktop
- Needs reliable offline browsing history access
- Wants instant sync when connectivity returns

**Security-Focused Professional (Jordan)**
- Requires end-to-end encryption in the new architecture
- Needs audit trail of sync activities for compliance
- Expects robust data integrity guarantees

### Detailed User Journeys

**Real-Time Sync Experience:**
```
As Alex, I want:
1. To see browsing sessions update instantly across devices
2. Real-time notifications when sync conflicts occur
3. Immediate availability of data when switching devices
4. No manual sync triggers or waiting periods

Acceptance Criteria:
- Sync latency < 2 seconds under normal conditions
- Offline changes sync within 5 seconds of reconnection
- Conflict resolution happens automatically with user notification
- Real-time indicators show sync status
```

**Unified Architecture Experience:**
```
As Sam, I want:
1. Seamless real-time sync across all my devices
2. Reliable offline-first operation
3. Fast startup and query performance
4. Simplified data management without complex systems

Acceptance Criteria:
- Real-time sync with <2 second latency
- Offline capability with automatic sync resumption
- 20% improvement in startup performance
- Single, consistent API for all data operations
```

**Privacy & Security Assurance:**
```
As Jordan, I want:
1. Strong encryption standards with GunDB integration
2. Comprehensive audit logging of data operations
3. Authenticated sync partners with proper verification
4. Granular control over data sharing and sync permissions

Acceptance Criteria:
- Web Crypto API + GunDB SEA integration
- AES-GCM encryption maintained end-to-end
- Ed25519 signatures for data integrity
- Complete audit trail for all operations
```

## Requirements

### Functional Requirements

**Core Data Architecture:**
- **REQ-001**: Implement GunDB graph data models for browsing sessions, tabs, and navigation relationships
- **REQ-002**: Design GunDB peer network for decentralized synchronization
- **REQ-003**: Establish data integrity patterns for browsing session and tab management
- **REQ-004**: Implement tagging system and session boundary detection with GunDB

**Async Synchronization with Relay Servers:**
- **REQ-005**: Implement GunDB relay server infrastructure for persistent sync
- **REQ-006**: Enable async sync when devices are not online simultaneously
- **REQ-007**: Support offline-first operation with automatic sync resumption
- **REQ-008**: Maintain encrypted peer authentication through relay servers

**Data Integrity & Security:**
- **REQ-009**: Integrate Web Crypto API with GunDB SEA (Security, Encryption, & Authorization)
- **REQ-010**: Implement AES-GCM data encryption for GunDB operations
- **REQ-011**: Use Ed25519 signatures for data integrity verification
- **REQ-012**: Ensure end-to-end encryption through relay servers

**API Compatibility:**
- **REQ-013**: Maintain backward compatibility for all existing database queries
- **REQ-014**: Preserve existing repository pattern and service interfaces
- **REQ-015**: Support existing performance monitoring and analytics
- **REQ-016**: Maintain cross-browser compatibility layer

**Future Extensibility:**
- **REQ-017**: Design modular architecture for future SSB/NeoDB layering
- **REQ-018**: Create interfaces for GunDB-to-NeoDB sync mechanisms
- **REQ-019**: Establish patterns for optional advanced graph queries
- **REQ-020**: Plan integration points for LLM connectivity via SSB

### Non-Functional Requirements

**Performance Targets:**
- **NFR-001**: Startup time: <80ms (simplified single-system architecture)
- **NFR-002**: Query response time: <30ms for 95% of operations
- **NFR-003**: Memory usage: <40MB total (reduction from eliminating dual systems)
- **NFR-004**: Async sync latency: <30 seconds via relay servers
- **NFR-005**: Bundle size reduction: 15% smaller through architectural simplification

**Scalability Requirements:**
- **NFR-006**: Support 10,000+ browsing sessions per user without degradation
- **NFR-007**: Handle 500+ concurrent sync operations
- **NFR-008**: Scale to 50+ peer connections in mesh network
- **NFR-009**: Efficient handling of large browsing histories (1M+ page visits)

**Reliability Targets:**
- **NFR-010**: 99.9% data consistency across sync operations
- **NFR-011**: System availability >99.9% with graceful degradation
- **NFR-012**: Zero data loss tolerance during normal operations
- **NFR-013**: <1% failure rate for sync operations under normal conditions

**Security Requirements:**
- **NFR-014**: Maintain current encryption strength (AES-256-GCM)
- **NFR-015**: No reduction in privacy guarantees during migration
- **NFR-016**: Comprehensive audit logging for all data operations
- **NFR-017**: Secure key rotation capabilities with GunDB SEA

**Browser Compatibility:**
- **NFR-018**: Full functionality in Chrome, Firefox, Safari, Edge
- **NFR-019**: Graceful degradation for browsers with limited WebRTC support
- **NFR-020**: Consistent performance across all supported browsers

## Success Criteria

### Primary Success Metrics

**Performance Improvements:**
- 20% reduction in extension startup time
- 40% improvement in query response times
- 15% reduction in overall memory usage
- 25% improvement in sync operation speed

**Architecture Simplification:**
- 60% reduction in database-related code complexity (single system vs dual)
- 40% fewer integration tests required
- Single data model and API documentation
- Unified error handling, logging, and connection management
- Foundation ready for future SSB/NeoDB layering

**User Experience Enhancements:**
- Real-time sync replacing polling-based updates
- 95% user satisfaction with migration process
- Zero reported data loss incidents
- <10% support ticket increase during migration period

**Developer Experience:**
- 40% reduction in database layer development time
- Single testing framework for data operations
- Unified documentation and API reference
- Faster onboarding for new contributors

### Key Performance Indicators

**Technical KPIs:**
- Migration completion rate: >99.5%
- Data integrity validation: 100% pass rate
- Sync conflict resolution: <5% manual intervention required
- Performance regression incidents: 0

**Implementation Success KPIs:**
- Development velocity improvement: >30% for data operations
- System complexity reduction: 50% fewer integration points
- Test coverage maintenance: >95% for new architecture
- Performance benchmark achievement: 100% of targets met

**Development KPIs:**
- Code coverage maintenance: >95%
- Build time improvement: >20%
- Bug report reduction: >30% for sync-related issues
- Documentation coverage: 100% for new APIs

## Constraints & Assumptions

### Technical Constraints

**Browser Limitations:**
- WebRTC support varies across browsers for peer-to-peer connections
- Service Worker storage quotas limit local data capacity
- Safari's Web Extension limitations may affect real-time capabilities
- Mobile browser memory constraints require careful optimization

**GunDB Integration Constraints:**
- GunDB's bundle size impact on extension package size
- Learning curve for team members unfamiliar with GunDB patterns
- Relay server infrastructure setup and maintenance requirements
- WebRTC limitations for direct peer connections in some networks

**Implementation Constraints:**
- Must maintain existing API compatibility during development
- Limited production testing environment for peer-to-peer features
- Browser extension size limits may constrain GunDB bundle inclusion
- Cross-browser WebRTC support varies for peer networking

### Assumptions

**User Behavior Assumptions:**
- Users will accept brief performance impact during migration
- Most users have reliable internet connectivity for initial sync
- Users value real-time features over current polling-based approach
- Privacy-conscious users will appreciate architectural simplification

**Technical Assumptions:**
- GunDB relay servers provide reliable async sync capabilities
- GunDB's CRDT implementation handles browsing data conflicts appropriately
- Relay server approach more reliable than direct WebRTC for most users
- GunDB SEA integration compatible with existing Web Crypto API patterns

**Development Assumptions:**
- Team can develop GunDB expertise within project timeline
- Existing test frameworks adaptable to GunDB patterns
- Performance monitoring systems compatible with new architecture
- Cross-browser testing infrastructure adequate for validation

## Out of Scope

### Explicitly Excluded Features

**Advanced GunDB Features (Future Scope):**
- GunDB's advanced mesh networking beyond relay server approach
- Real-time collaborative editing features for browsing sessions
- GunDB's graph visualization capabilities
- Advanced GunDB plugins and ecosystem integrations

**Deferred Advanced Features:**
- SSB integration for LLM connectivity (future layering)
- NeoDB integration for complex graph queries (future layering)
- Advanced analytics requiring complex graph traversals
- Integration with external bookmark sync services

**Performance Optimizations:**
- Advanced caching strategies beyond current implementation
- Background sync optimization for mobile battery life
- Advanced conflict resolution UI beyond current notification system
- Performance analytics beyond existing monitoring

**Browser-Specific Features:**
- Chrome-specific sync integration with Google services
- Firefox-specific sync with Mozilla accounts
- Safari-specific iCloud integration
- Platform-specific native app integration

### Future Considerations

**Post-V1 Enhancements:**
- SSB layer integration for LLM connectivity and advanced AI features
- NeoDB layer integration for complex graph analysis and advanced queries
- GunDB-to-NeoDB sync mechanisms for analytics workloads
- Real-time collaborative features for shared browsing sessions
- Advanced mesh networking beyond relay server architecture

## Dependencies

### External Dependencies

**GunDB Ecosystem:**
- **GunDB Core**: Primary database and sync engine
- **Gun/SEA**: Security, Encryption, and Authorization module
- **GunDB Relay Server**: Node.js server for async device synchronization
- **Gun/Radisk**: Local storage adapter for browser environments

**Browser APIs:**
- **Web Crypto API**: Maintaining existing encryption integration
- **WebRTC**: Required for peer-to-peer sync capabilities
- **IndexedDB**: Local storage backend for GunDB
- **Service Workers**: Background sync operations

**Development Tools:**
- **GunDB Testing Framework**: Adapting existing Jest setup for GunDB patterns
- **Performance Monitoring**: Ensuring compatibility with existing metrics collection
- **Cross-Browser Testing**: Validating GunDB functionality across browsers
- **Migration Testing**: Tools for testing data migration at scale

### Internal Dependencies

**Architecture Components:**
- **Encryption Layer**: Must be adapted for GunDB integration
- **Performance Monitor**: Requires updates for GunDB metrics
- **Cross-Browser Utils**: May need updates for GunDB compatibility
- **UI Components**: Real-time updates require reactive programming patterns

**Data Layer Dependencies:**
- **Repository Pattern**: All repositories must be adapted for GunDB
- **Database Models**: Complete rewrite for GunDB schema patterns  
- **Query Engine**: Optimization strategies must be rebuilt for GunDB
- **Connection Management**: New patterns for GunDB peer connections

**Testing Infrastructure:**
- **Integration Tests**: Complete rewrite for GunDB testing patterns
- **Performance Tests**: New benchmarks specific to GunDB operations
- **Migration Tests**: New test suite for data migration validation
- **Cross-Browser Tests**: Extended coverage for GunDB compatibility

### Timeline Dependencies

**Phase 1 (Weeks 1-3): Foundation & Research**
- GunDB integration research and relay server architecture design
- Development team GunDB training and skill building
- Relay server setup and testing infrastructure
- Performance baseline establishment

**Phase 2 (Weeks 4-7): Core Implementation**
- GunDB data models and repository layer implementation
- Encryption integration with GunDB SEA + Web Crypto API
- Relay server async sync functionality
- Unit testing framework adaptation

**Phase 3 (Weeks 8-10): Integration & Testing**
- Complete system integration and testing
- Relay server deployment and testing
- Cross-browser compatibility validation
- Future extensibility interface design

**Phase 4 (Weeks 11-12): Polish & Launch**
- Performance tuning and optimization
- Documentation and deployment preparation
- Future SSB/NeoDB integration planning
- Launch readiness validation

### Risk Mitigation Dependencies

**Technical Risks:**
- **Dependency**: Comprehensive GunDB expertise development
- **Mitigation**: External GunDB consulting during initial implementation
- **Dependency**: Robust integration testing framework
- **Mitigation**: Comprehensive test data generation and validation tools

**Implementation Risks:**
- **Dependency**: Seamless architectural transition
- **Mitigation**: Incremental implementation with feature flags
- **Dependency**: Performance optimization and validation
- **Mitigation**: Continuous benchmarking and performance monitoring

This simplified GunDB-first architecture establishes a solid foundation that reduces complexity while maintaining extensibility for future enhancements. The relay server approach ensures reliable async sync, and the modular design allows for future layering of SSB (LLM integration) and NeoDB (advanced queries) as TabKiller's feature requirements evolve.