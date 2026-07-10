---
issue: 49
title: IndexedDB GraphStore
analyzed: 2026-07-10T02:00:00Z
streams: 1
---

# Issue #49 Analysis: IndexedDB GraphStore

## Scope

Port the spike's schema types and store API into `src/`, backed by real
IndexedDB (extending `SessionStorageEngine`). This is a foundational
piece — everything downstream reads and writes through it. Correctness
of indexes and transaction atomicity matter more than throughput at
this stage.

## Stream Decomposition

**One stream.** The parts (types → store → schema bump → tests) are
sequential dependencies within the task; splitting them across agents
would add coordination cost with no wall-clock benefit.

### Stream A — types + store + schema bump + tests

Files to author/modify:
- New: `src/database/graph/types.ts`, `src/database/graph/store.ts`,
  `src/database/graph/__tests__/store.test.ts`
- Modified: `src/session/storage/SessionStorageEngine.ts`
  (add `graph_nodes` + `graph_edges` object stores in `onupgradeneeded`,
   bump DB version)
- Modified: `src/session/storage/schema.ts`
  (declare new object stores + indexes as constants)

**Explicit non-scope:** do NOT modify `src/background/service-worker.ts`.
Store instantiation and wiring belongs to #52 (ingest pipeline). Import
path can be proven by compilation alone.

Agent type: `general-purpose`

## Dependencies

None (parallel: true; no deps).

## Conflicts

- **Concurrent-with #51:** both run against the same worktree/branch.
  Files are disjoint: #49 touches `src/database/graph/*` and
  `src/session/storage/*`; #51 touches `src/session/tracking/*`,
  `src/tracking/*` (deleted), `src/background/service-worker.ts`, and
  `manifest.json`. No file collision. Git index contention on commit
  is possible but retryable.

## Success Criteria (from 49.md)

- Types port verbatim from spike (identical field names)
- Store API surface matches spike; every write atomic in a single
  transaction spanning both object stores
- Compound indexes created per the PRD
- Unit tests cover put/get for every node type, both edge shapes, and
  each named index
- No `Date` objects survive a write/read cycle
- Verified with `npm test` (per warm-up finding — not ad-hoc)

## Progress

See `updates/49/stream-a.md`.
