---
issue: 54
title: Cutover + delete pass
analyzed: 2026-07-10T04:00:00Z
streams: 1
---

# Issue #54 Analysis: Cutover + delete pass

## Scope

Delete the entire NeoDB/LevelGraph-oriented `src/database/*` module
(everything except the `graph/` subdirectory that this epic built) and
its tests. Wire the background service worker to depend only on the
new `graph/` module. Verify `npm run build:chrome` succeeds — right now
it fails because `level-browserify` isn't installed and the
`connection.ts → integration.ts → service-worker.ts` chain still
references it.

**This is a real cutover.** The old database module was designed
around NeoDB + LevelGraph and was never actually wired to the capture
layer (per the earlier code-analyzer audit — LevelGraph edges were
declared but no ingestion path emitted them). Removing it does not
lose any functionality; the graph store from #49–#53 is now the
single data layer.

## Stream Decomposition

**Single stream.** Mechanical cleanup + one build verification pass.
No parallelism to exploit.

### Stream A — delete + verify

Files to delete:
- `src/database/connection.ts` (LevelGraph triple store setup)
- `src/database/index.ts` (barrel re-exporting deleted modules)
- `src/database/integration.ts` (`initializeDatabaseIntegration`,
  `getDatabaseIntegration` — used by `service-worker.ts` under
  try/catch; can be removed once callers are excised)
- `src/database/models.ts` (LevelGraph-style transformers superseded
  by `graph/transformers.ts`)
- `src/database/queries.ts` and `src/database/optimized-queries.ts`
  (superseded by `graph/queries.ts`)
- `src/database/repositories.ts` (repository pattern over LevelGraph;
  no live consumers now)
- `src/database/encryption.ts` (encryption belongs to a later PRD;
  the stub here was pre-implementation scaffolding tied to LevelGraph
  serialization)
- `src/__tests__/database/{connection,models,repositories}.test.ts`
  (test files for deleted modules)

Files to modify:
- `src/background/service-worker.ts` — remove:
  - `import { initializeDatabaseIntegration, getDatabaseIntegration }
    from '../database/integration'`
  - The `try { initializeDatabaseIntegration(...) } catch { ... }`
    block near line 136
  - Any `getDatabaseIntegration()` call sites (they're wrapped in
    try/catch already; removing them + the try/catch is safe)
  - The `'get-database-status'` message handler (or replace with a
    stub that reports the graph store status)
- `src/session/utils/dataUtils.ts` — remove the dead `normalizeUrl`
  function at line 80 (zero live callers; slated for removal per the
  #50 progress log)
- `src/session/storage/index.ts` — its `export *` barrel re-exports
  the dead `normalizeUrl` from `dataUtils`; remove that specific
  export or drop `dataUtils` from the barrel if it has no other
  live exports
- `src/database/schema.ts` — trim unused edge type declarations:
  `SYNCED_FROM`, `ACCESSED_BY`, `CONTAINS_TAB`, and any other
  edge types confirmed unused after the model transformer
  file is deleted. Keep only what the new schema needs (the graph
  schema now lives in `src/database/graph/`; if `schema.ts` at the
  old path has nothing left, delete it entirely)

Files to leave alone:
- `src/database/graph/**` — this epic's core work
- `src/session/storage/SessionStorageEngine.ts` and its own
  `schema.ts` — hosts the shared IndexedDB with the graph object
  stores (extended by #49)
- `src/storage/LocalEventStore.ts` — the outbox (extended by #52)
- Anything under `src/ui/*` — surface layer; not this epic's concern

`package.json` and `package-lock.json`:
- Remove `level-browserify` and any transitive Level dependencies
- Confirm with `npm ls | grep -i level` returning nothing after

Additive dual-write claim in the PRD/task file:
- On review, #52 shipped in *additive mode* with respect to the OLD
  `SessionStorageEngine` per-session/tab/nav stores — it did NOT
  dual-write to LevelGraph (which had no ingestion path anyway).
- The old `SessionStorageEngine` per-session/tab/nav stores are
  still populated by the capture layer. Those are the "old paths"
  the PRD flagged for cutover. **Do NOT delete them here** — the
  currently-shipping UI (timeline, sidebar, popup) still reads from
  them. Their deletion is a follow-up UI-migration epic, not this
  task. Adjust the PRD's success criterion accordingly and record
  the divergence in the progress log.

## Verification

- `npm run build:chrome` must succeed
- `npm ls level-browserify` must show no results
- `npm test` on the graph module suites (162 tests from #49–#53)
  must still pass
- Bundle size delta ≤ 50 KB against the pre-epic baseline
  (measured — not asserted)
- `npm run type-check` clean

Agent type: `general-purpose`

## Dependencies

- #49, #50, #51, #52, #53 — all complete

## Success Criteria (from 54.md, with the adjustment noted above)

- No `level-*` packages in `npm ls`
- Bundle-size delta measured and ≤ 50 KB
- Graph test suite green (162 tests)
- `npm run build:chrome` succeeds (this is the concrete unblock for
  the deferred real-day validation)
- `npm run type-check` clean

## Progress

See `updates/54/stream-a.md`.
