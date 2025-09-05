---
created: 2025-09-05T01:40:49Z
last_updated: 2025-09-05T01:40:49Z
version: 1.0
author: Claude Code PM System
---

# System Patterns and Architecture

## Development Methodology

### Spec-Driven Development
- **No Vibe Coding:** Every line of code traces back to a specification
- **5-Phase Discipline:**
  1. 🧠 Brainstorm - Think deeper than comfortable
  2. 📝 Document - Write specs that leave nothing to interpretation  
  3. 📐 Plan - Architect with explicit technical decisions
  4. ⚡ Execute - Build exactly what was specified
  5. 📊 Track - Maintain transparent progress at every step

### Parallel Agent Architecture
- **Context Firewalls:** Agents isolate implementation details from main conversation
- **Specialized Agents:** Different agents for different types of work
- **Parallel Execution:** Multiple agents working simultaneously on different work streams
- **Consolidated Reporting:** Agents return concise summaries, not verbose output

## Browser Extension Patterns

### Architecture Style
- **Event-Driven:** Reactive to browser events and user actions
- **Service Worker Pattern:** Background processing without persistent pages
- **Message Passing:** Communication between extension components
- **Observer Pattern:** Track changes in browser state

### Data Flow Patterns
```
Browser Events → Content Scripts → Background Service → Local Storage
                                        ↓
User Interface ← Message Handlers ← Background Service
                                        ↓
External Sync ← Batch Processor ← Background Service
```

### Security Patterns
- **Principle of Least Privilege:** Request minimum necessary permissions
- **Content Security Policy:** Strict CSP for all extension pages
- **Input Validation:** Sanitize all external data
- **Secure Communication:** Encrypted channels for sensitive data

## Database Design Patterns

### Graph Database (NeoDB)
- **Node Types:** Pages, Sessions, Tags, Users
- **Relationship Types:** NAVIGATED_TO, OPENED_IN, TAGGED_AS, BELONGS_TO
- **Indexing Strategy:** Time-based and content-based indexes
- **Query Patterns:** Path finding, clustering, temporal analysis

### Local Storage Patterns
- **Cache-Aside:** Local cache with database fallback
- **Write-Through:** Immediate persistence to local storage
- **Eventual Consistency:** Sync with remote database asynchronously
- **Conflict Resolution:** Last-write-wins with user override

## Synchronization Patterns

### SSB Integration
- **Pub-Sub Pattern:** Subscribe to relevant data streams
- **Append-Only Log:** Immutable event stream
- **Gossip Protocol:** Peer-to-peer data propagation
- **Cryptographic Verification:** Signed messages for data integrity

### Conflict Resolution
- **Vector Clocks:** Track causality in distributed updates
- **Operational Transform:** Merge concurrent edits
- **Three-Way Merge:** Compare local, remote, and common ancestor
- **User Intervention:** Manual resolution for complex conflicts

## Error Handling Patterns

### Resilience Strategy
- **Fail Fast:** Critical configuration errors stop execution
- **Log and Continue:** Optional features gracefully degrade
- **Circuit Breaker:** Prevent cascading failures in external services
- **Retry with Backoff:** Handle transient network failures

### Error Recovery
- **Graceful Degradation:** Core functionality works without advanced features
- **Fallback Mechanisms:** Alternative approaches when primary fails
- **User Notification:** Inform users of limitations without technical details
- **Automatic Recovery:** Retry operations after temporary failures

## Testing Patterns

### Testing Philosophy
- **Verbose Tests:** Tests provide debugging information
- **Real Usage Simulation:** No mocks, test against actual services
- **Fail Fast Testing:** Stop on first failure to avoid cascading issues
- **Context Preservation:** Test failures don't pollute main conversation

### Test Organization
- **Unit Tests:** Individual function and component testing
- **Integration Tests:** Cross-component interaction testing
- **E2E Tests:** Full user workflow testing
- **Performance Tests:** Resource usage and response time validation

## Code Organization Patterns

### Module Architecture
- **Single Responsibility:** Each module has one clear purpose
- **Dependency Injection:** Configurable external dependencies
- **Interface Segregation:** Small, focused interfaces
- **Composition over Inheritance:** Favor object composition

### Error Boundaries
- **Try-Catch Blocks:** Localized error handling
- **Error Propagation:** Bubble up actionable errors
- **Error Logging:** Structured error information
- **User-Friendly Messages:** Convert technical errors to user language

## Privacy and Security Patterns

### Data Protection
- **End-to-End Encryption:** User data encrypted before leaving device
- **Key Derivation:** User password derives encryption keys
- **Secure Key Storage:** Browser-native secure storage APIs
- **Data Minimization:** Collect only necessary information

### Access Control
- **Permission Boundaries:** Extension runs with minimal privileges
- **Content Isolation:** Content scripts isolated from page context
- **API Rate Limiting:** Prevent abuse of external services
- **Audit Logging:** Track access to sensitive operations

## Integration Patterns

### LLM Integration
- **Context Window Management:** Optimize prompt size and structure
- **Response Caching:** Cache expensive LLM operations
- **Fallback Models:** Multiple LLM providers for reliability
- **Streaming Responses:** Handle large responses incrementally

### Browser API Integration
- **Polyfill Pattern:** Consistent API across different browsers
- **Feature Detection:** Graceful handling of missing APIs
- **Permission Requests:** Progressive permission requests
- **Event Delegation:** Efficient event handling at scale

## Performance Patterns

### Optimization Strategies
- **Lazy Loading:** Load components and data on demand
- **Debouncing:** Batch rapid user actions
- **Virtual Scrolling:** Handle large data sets efficiently
- **Background Processing:** Move heavy work to service workers

### Memory Management
- **Object Pooling:** Reuse expensive objects
- **Weak References:** Prevent memory leaks in long-lived objects
- **Garbage Collection:** Explicit cleanup of resources
- **Memory Monitoring:** Track and alert on memory usage

## Deployment Patterns

### Release Strategy
- **Feature Flags:** Gradual rollout of new features
- **Blue-Green Deployment:** Zero-downtime updates
- **Canary Releases:** Test with small user subset
- **Rollback Capability:** Quick revert for problematic releases

### Version Management
- **Semantic Versioning:** Clear communication of change impact
- **Backward Compatibility:** Maintain compatibility across versions
- **Migration Scripts:** Automated data and settings migration
- **Deprecation Warnings:** Advance notice of breaking changes