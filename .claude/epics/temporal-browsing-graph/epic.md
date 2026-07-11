---
name: temporal-browsing-graph
status: completed
created: 2026-07-10T00:55:11Z
updated: 2026-07-11T11:07:36Z
completed: 2026-07-11T11:07:36Z
progress: 100%
prd: .claude/prds/temporal-browsing-graph.md
github: https://github.com/zacharywhitley/tabkiller/issues/48
---

# Epic: temporal-browsing-graph

## Overview

Replace three parallel (and non-communicating) storage stacks with a single
IndexedDB-backed graph store that persists the Visit-centric temporal schema
validated by the spike at `spike/temporal-graph/`. Consolidate two duplicated
tracking layers into one, close the `webNavigation` capture gap, and expose
the six query primitives from the PRD as a plain function API.

The scope is deliberately narrow: **data model, capture, persistence, and
query**. Sync, encryption, LLM edges, and SingleFile archiving are separate
epics that will consume this graph via its query API.

Most of the design work is done. This epic is largely about porting the spike
into `src/`, wiring the capture layer to actually populate it, and deleting
the code paths that this replaces.

## Architecture Decisions

Most architectural bets were made in the PRD and validated in the spike;
this section records them so the tasks don't relitigate them.

- **One IndexedDB database, two object stores (`nodes`, `edges`).** Not a
  graph database, not a triple store. Personal-scale data doesn't need one.
- **Extend `SessionStorageEngine`, don't create a new store class.** It
  already opens the right IndexedDB instance and handles versioning; add
  the new object stores in a schema bump.
- **Reuse `LocalEventStore` as a write-ahead outbox.** No new outbox
  needed; only the drain semantics change.
- **Point vs. interval edges as two distinct on-disk shapes**, discriminated
  by a `kind` field. Same object store, same indexes, different query
  helpers.
- **Two-time-axis discipline**: every record carries `at_time`/`valid_from`
  (event time) *and* `recorded_at` (write time). Retroactive edits diverge
  the two; live capture keeps them equal.
- **Append-only edges.** Retroactive changes create new rows. Nothing is
  mutated in place. `recorded_at` is the audit trail.
- **URL normalization defines `Page` identity.** Wrong normalization
  corrupts every downstream query; treat it as its own testable module.
- **Delete rather than deprecate the code being replaced.** Zero users; no
  compat surface to preserve. `level-browserify`, `src/tracking/*`, and the
  unused edge-type declarations go.

## Technical Approach

The feature is a data layer, so the standard "frontend / backend /
infrastructure" split doesn't fit cleanly. Reframed to match reality:

### Data layer (the substance of this epic)
- **Schema types** in `src/database/graph/types.ts` — direct port of
  `spike/temporal-graph/types.ts`, no changes.
- **`GraphStore`** in `src/database/graph/store.ts` — real IndexedDB
  implementation of the same API as the spike's in-memory store. Two
  object stores (`nodes`, `edges`) with the compound indexes named in the
  PRD. All writes atomic within a single transaction per event.
- **URL normalization** in `src/utils/url.ts` — pure function, extensive
  unit tests. Strips tracking params (allowlist), lowercases host,
  normalizes trailing slash, fragment handling per allowlist.
- **Ingest transformer** in `src/database/graph/ingest.ts` — reads
  outbox events, emits node/edge writes into `GraphStore`. This is where
  the event-shape to graph-shape mapping lives.
- **Query API** in `src/database/graph/queries.ts` — six named primitives
  from the PRD. Signatures mirror the spike; internals swap Map-scans for
  IndexedDB cursor walks.

### Capture layer (the rewiring)
- **Retire `src/tracking/*`.** Migrate any unique session-detection
  heuristics into `src/session/tracking/*`.
- **Hook `webNavigation.onCommitted`** in the service worker so
  `transitionType` is captured on every navigation. Add `webNavigation`
  to `manifest.json` permissions.
- **Focus event capture** — reconcile `tabs.onActivated` and
  `windows.onFocusChanged` into a single focus-transition stream that
  materializes into `focus_intervals[]` on the current `Visit`.
- **Outbox drain** on a `chrome.alarms` tick — service-worker restarts
  cannot lose data captured to the outbox.

### UI (not this epic)
Existing UI consumes the current flat storage. Adapting it to consume the
graph query API is a separate epic. This epic ships a working data layer
plus a validation harness; it doesn't touch React components.

### Infrastructure (not applicable)
No server, no deployment, no scaling considerations. Everything runs
in-browser in the extension. Manifest change (add `webNavigation`
permission) is the only distribution concern.

## Implementation Strategy

### Phasing
1. Build the new store and the ingest transformer against the existing
   capture layer as an **additive** change — write to both old and new
   stores in parallel. This keeps the extension functional while the new
   layer is proven.
2. Consolidate the capture layer and add `webNavigation`. At this point
   real data flows into the graph store.
3. Validate against a real captured day. If the queries return correct
   results, cut over.
4. Delete the old stores, the old tracking layer, and `level-browserify`.

### Risk mitigation
- **URL normalization bugs are silent and destructive.** Test heavily,
  log unknown query params on ingest for later review, ship with a
  conservative allowlist.
- **Manifest V3 service worker termination** loses in-flight focus
  events. Mitigation: reconcile on visit close; the outbox catches
  everything that was serialized before termination.
- **Additive-then-cutover keeps a reversible path** until the real-day
  validation passes. If the new layer is wrong, we haven't lost the old
  one yet.

### Testing approach
- Unit tests for URL normalization (many cases; this is where corruption
  lives).
- Unit tests for each edge-type transformer in the ingest pipeline.
- Query-level tests using the spike's fixture ported into `src/`.
- **Integration test: capture a real day of the developer's own browsing,
  run all six queries, compare against expected results by hand.** This
  is the acceptance test named in the PRD.

## Task Breakdown Preview

Six tasks. Kept small by leveraging what already exists:
- Types come from the spike verbatim.
- `SessionStorageEngine` provides the IndexedDB open/version machinery.
- `LocalEventStore` becomes the outbox with no API change.
- `src/session/tracking/*` already hooks most events; only `webNavigation`
  and focus reconciliation are new.
- Query implementations are ~20–30 line ports from the spike.

- [ ] **T1: IndexedDB `GraphStore`.** Port spike types into
      `src/database/graph/`; extend the existing IndexedDB schema (via
      `SessionStorageEngine`) with `nodes` and `edges` object stores and
      the four compound indexes named in the PRD. Same API surface as the
      spike store; every write atomic in one transaction.
- [ ] **T2: URL normalization.** Pure function in `src/utils/url.ts` with
      an allowlist of tracking params to strip, per-domain fragment
      allowlist, and thorough unit tests. This is where silent corruption
      hides; test heavily.
- [ ] **T3: Capture consolidation.** Retire `src/tracking/*` (migrate any
      unique session-detection heuristics into `src/session/tracking/*`),
      add `webNavigation.onCommitted` hook + manifest permission,
      consolidate focus events into a single stream feeding
      `focus_intervals`.
- [ ] **T4: Ingest pipeline.** Read from `LocalEventStore` (now the
      outbox), transform each event into node/edge writes on `GraphStore`
      within one IndexedDB transaction per event; drain triggered by
      `chrome.alarms`. Run in additive mode alongside the old paths.
- [ ] **T5: Query API + real-day integration.** Port the six spike queries
      into `src/database/graph/queries.ts`. Capture a real day of the
      developer's own browsing, run every query, verify results by hand.
      This is the epic's acceptance test.
- [ ] **T6: Cutover + delete pass.** Remove `level-browserify` and
      `src/database/connection.ts`'s LevelGraph paths, delete unused
      edge-type declarations, delete the old dual-write path from T4,
      remove any dead code the consolidation exposed.

## Dependencies

### External
- **`webextension-polyfill`** (already installed) — used for cross-browser
  `webNavigation` API.
- **No new runtime dependencies.** `level-browserify` and any LevelGraph
  deps are *removed*.

### Internal
- **User-interface epic (complete)** consumes the current flat data model.
  This epic does not touch it; a separate follow-up epic will migrate the
  UI to the graph query API.
- **`SessionStorageEngine`** — extended by T1 for the new object stores.
- **`LocalEventStore`** — repurposed by T4 as the write-ahead outbox.
- **`src/session/tracking/*`** — extended by T3 with `webNavigation` +
  focus reconciliation.

### Prerequisite work
- None. Everything needed is either present or scheduled for deletion.

### Manifest / permissions
- Add `webNavigation` to `manifest.json`. Existing users would see a
  permission prompt on upgrade; zero users currently, so this is a
  non-event.

## Success Criteria (Technical)

Straight port of the PRD's Success Criteria — repeated here so the epic
can be closed against a checklist:

- All six queries in the PRD's catalog run correctly against a **real
  captured day** of the developer's own browsing.
- Every navigation in that captured day has a populated `transition_type`
  (i.e. `webNavigation` is actually firing).
- Retroactive tag on a real session works: Q3 identifies the visits
  that predate the tag application; `recorded_at` differs from `at_time`
  on the tag edges.
- Bundle-size delta ≤ 50 KB (measured; not aspirational).
- Zero new runtime dependencies; `level-browserify` removed from
  `package.json`.
- One tracking layer; `src/tracking/*` is gone.
- Existing test suite passes; new unit tests cover URL normalization,
  each edge-type transformer, and each query primitive.

**Explicitly not success criteria** (called out to prevent scope creep):
startup time, memory usage, query response time. No baseline exists to
measure against, and inventing targets was the failure mode of the two
prior PRDs.

## Estimated Effort

Rough sizing based on the spike having already answered the design
questions. Total: **~2 weeks of focused solo work**, sequenced as:

- **T1 GraphStore** — 2 days. Mostly typing + IDB transactions;
  algorithm already validated by spike.
- **T2 URL normalization** — 1 day. Small but requires lots of test
  cases; corner cases are the whole point.
- **T3 Capture consolidation** — 2–3 days. Half is deletion; the rest is
  wiring `webNavigation` and consolidating focus events across browsers.
- **T4 Ingest pipeline** — 2 days. Straightforward transformer with the
  outbox already in place.
- **T5 Query API + real-day validation** — 2–3 days. Queries are quick
  ports; the real-day capture-and-verify pass is where the surprises
  will land.
- **T6 Cutover + delete pass** — 1 day. Mechanical.

### Critical path
T1 → T4 → T5 (validation) is the critical path. T2 and T3 are largely
parallelizable with T1. T6 must come last.

### Resource requirements
Solo developer, no external dependencies. No infrastructure. No new
tooling. A day of the developer's own live browsing is required as the
integration test data.

## Tasks Created

- [ ] #49 - IndexedDB GraphStore (parallel: true)
- [ ] #50 - URL normalization (parallel: true)
- [ ] #51 - Capture layer consolidation (parallel: true)
- [ ] #52 - Ingest pipeline (parallel: false, depends on #49, #50, #51)
- [ ] #53 - Query API + real-day integration (parallel: false, depends on #52)
- [ ] #54 - Cutover + delete pass (parallel: false, depends on #53)

Total tasks: 6
Parallel tasks: 3 (#49, #50, #51 — can all start immediately)
Sequential tasks: 3 (#52 → #53 → #54 form the critical path)
Estimated total effort: ~88 hours (~11 solo working days)
