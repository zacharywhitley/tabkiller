---
issue: 49
stream: A
started: 2026-07-10T01:40:53Z
status: complete
---

## Approach

Ported `spike/temporal-graph/{types,store}.ts` into `src/database/graph/`, backed by real IndexedDB via a schema-version bump in `src/session/storage/schema.ts` + `SessionStorageEngine`. `GraphStore` takes an initialized `IDBDatabase` (obtained from `SessionStorageEngine.getDatabase()`) and drives it via cursors and indexes.

Design calls:
- **Point vs. interval `at_time` index (the design call the task called out):** split into `(type, at_time)` for point-only edges and `(type, valid_from)` for interval-only edges. IDB indexes silently skip records missing the keyPath, so each temporal index automatically excludes the other kind. `edgesOfType` picks the correct index based on the requested type's discriminator.
- **Node type-specific indexes** (`Page.normalized_url`, `Domain.hostname`, `Tag.slug`, `Tab.browser_tab_id`) are non-unique single-field indexes and rely on the same "skip records missing the keyPath" behavior.
- **Atomic writes:** `putNode`/`putEdge` both funnel through `writeBatch` so every write is a single `readwrite` transaction spanning `graph_nodes` and `graph_edges`. Synchronous throws from `IDBObjectStore.put` (e.g. missing keyPath) explicitly `tx.abort()` so partial commits are impossible.
- **Test isolation:** each test opens a uniquely-named database (`TabKillerSessions_test_<epoch>_<counter>`) so state cannot leak between cases. Real fake-indexeddb, not a mock — per CLAUDE.md.
- **structuredClone shim:** jsdom 26 does not expose `structuredClone`, which fake-indexeddb needs for its clone-on-insertion pass. The test file lifts a `node:v8`-based shim onto the global before importing fake-indexeddb; single-file scope, no test-runner or global-setup changes.
- **Public `getDatabase()` on `SessionStorageEngine`:** needed so #52 can construct a `GraphStore` without opening a second IDB connection. Fails fast if called before `initialize()`.

## Completed
- `src/database/graph/types.ts` — verbatim port from spike (~155 lines).
- `src/database/graph/store.ts` — IDB-backed `GraphStore` with the full spike API plus 4 named identity-index lookups (~240 lines).
- `src/database/graph/__tests__/store.test.ts` — 34 tests covering every node type, every point-edge type, every interval-edge type, every named index, atomicity via a rejected batch, and timestamp discipline via raw-record inspection (~490 lines).
- Schema bump in `src/session/storage/schema.ts`: `DATABASE_VERSION` 1 -> 2, plus two new object stores and 9 new indexes.
- `SessionStorageEngine.getDatabase()` exposed for cross-component IDB sharing.
- `fake-indexeddb@6.2.5` added as devDependency (real in-memory IDB implementation, not a mock).

## Working On
Nothing — task complete.

## Blocked
None.

## Notes / Surprises
- **Concurrent-worktree churn from #51.** The other agent working on #51 has active uncommitted edits to `manifest.json`, `src/background/service-worker.ts`, `src/manifest/*.json`, `src/shared/types.ts`, plus new files under `src/session/tracking/`. Their commit `ba2359f` landed mid-run. A stash/pop round-trip after their commit conflicted on unrelated files. Working around it took a `git checkout stash@{0} -- <my files>` selective restore. Flagging as a coordination note: parallel agents should probably not `git stash` when the peer has WIP.
- **Pre-existing baseline test failures (155 of 460 non-graph tests).** These are the mock-based `SessionStorageEngine.test.ts`, `StorageIntegration.test.ts`, and DOM-heavy UI tests. My schema bump did not change the count materially (150 non-graph fails after my changes, i.e. slightly fewer). Not sidestepped — the failures are unrelated to what #49 shipped.
- **Pre-existing TS error in `src/ui/timeline/visualization/components/SessionGroup.tsx:238`** (unchanged from #50's report). My files type-check clean in isolation.
- **jsdom-26 `structuredClone` gap.** Fixed in-file so the fix doesn't spread; a project-wide polyfill in `tests/setup.ts` would be a cleaner home if #52 or later tasks need the same shim.
- **`SessionStorageEngine.setupSchema` already tolerated schema growth** — it iterates over `Object.values(STORE_NAMES)` and creates any missing store. Bumping `DATABASE_VERSION` to 2 is enough to trigger `onupgradeneeded`, which then discovers and creates `graph_nodes` and `graph_edges`. No changes needed to the upgrade handler itself.

## Commit hashes
Filled in after commit.
