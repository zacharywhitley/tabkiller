---
name: temporal-browsing-graph
description: Visit-centric temporal graph model for TabKiller's core data layer — single IndexedDB store, two edge shapes, event-time / recorded-at bitemporality, no exotic infrastructure.
status: complete
created: 2026-07-10T00:22:14Z
supersedes: refactor-neodb-and-ssb-to-gundb
---

# PRD: Temporal Browsing Graph

## Executive Summary

TabKiller's differentiator is *not* which database it uses. It's the shape of
the data it captures — a **temporal graph of browsing intent**, in which
`Visit` (an instance of viewing a page in a tab at a moment) is the atomic
entity, and structural edges (tab tree, session membership) coexist with
temporal edges (navigation chains, focus intervals, retroactive tags).

Prior PRDs (`tabkiller.md` — NeoDB + SSB; `refactor-neodb-and-ssb-to-gundb`
— GunDB) both picked exotic storage substrates before defining the model.
This PRD reverses that priority. Storage is commodity: a single IndexedDB
database with two object stores (`nodes`, `edges`) and standard compound
indexes handles personal-scale data — millions of visits per user, single
writer per device — with lower complexity than any distributed or graph-DB
substrate.

The model was pressure-tested by a spike at `spike/temporal-graph/`. Five
queries covering the four shapes we need (point traversal, interval scan,
retroactive edit, structural + temporal join) all ran cleanly; each query
implementation is 20–30 lines. Findings from that spike are folded into the
requirements below.

**In scope:** schema, capture layer consolidation, single IndexedDB store,
ingest pipeline, query primitives, cleanup of parallel/unused storage code.

**Out of scope, deferred to later PRDs:** cross-device sync, at-rest
encryption of persisted data, LLM/embedding-derived edges, SingleFile page
archiving, UI implementation.

## Problem Statement

A code audit at 2026-07-09 revealed three problems that together prevent
TabKiller from answering its own core questions.

### Three storage stacks, none authoritative

- `src/storage/LocalEventStore.ts` writes batched, compressed event blobs to
  `chrome.storage.local`. Opaque; not queryable.
- `src/session/storage/SessionStorageEngine.ts` uses real IndexedDB with
  proper object stores. Works, but only for session/tab/navigation records.
- `src/database/connection.ts` sets up a LevelGraph triple store on
  `level-browserify`. Declared but **never wired** to either tracker. Ten
  edge types are declared; only three are ever constructed; none are ever
  read.

### Two overlapping tracking layers

`src/tracking/*` accepts pre-normalized events from a caller that doesn't
exist. `src/session/tracking/*` is what actually hooks the browser APIs.
The two duplicate types (`TabInfo`, `BrowsingSession`, `NavigationEvent`)
and neither is the source of truth.

### Capture surface is missing critical signal

- `webNavigation.*` is **not hooked anywhere**. URL changes are inferred
  from `tabs.onUpdated.changeInfo.url`, which loses `transitionType` — the
  most valuable single piece of metadata for graph edges.
- The opener chain (`openerTabId`) is captured on tab creation, held in
  memory, and wiped on tab close. Not persisted. Cannot be reconstructed.
- Intra-tab navigation history is held in memory only; `StoredTab` stores
  a `navigationCount` scalar, not the chain.
- Tags are `string` on Session, not first-class nodes.
- No URL normalization: every `google.com/search?q=x` is a distinct Page.

### Consequence

None of the queries that motivate the product are answerable today:

- "Which pages did I open from Hacker News last month?"
- "What was I looking at at 3:47pm on Tuesday?"
- "Reconstruct the tab tree from my react-research session."
- "What did I visit right before I tagged this session?"

## User Stories / Query Catalog

The schema's acceptance criterion is that these queries are expressible in
short, readable application code. Each was validated in the spike.

| ID | Query | Query shape | Spike result |
|---|---|---|---|
| Q1 | Pages I opened from `<domain>` in a time window | Point traversal via `opened_from` | ~20 lines, correct |
| Q2 | What Visit was focused at instant T | Interval scan via `focus_intervals` | ~15 lines, correct across 6 probe times including idle gap |
| Q3 | Visits inside a session whose event_time predates a retroactive tag | Bitemporal join (`at_time` vs `tagged_with.at_time`) | ~25 lines, correct — 5/5 visits identified |
| Q4a | Causal chain of visits leading to `<visit>` within N ms | Walk `navigated_from` + `opened_from` backward | ~15 lines, correct |
| Q4b | Visits whose focus overlapped `[t_from, t_to]` | Interval-window scan | (Added in PRD; not in spike — see decision below) |
| Q5 | Tab tree for all sessions tagged `<slug>` | Structural + temporal join | ~30 lines, correct — parent tab resolved via opener chain |
| Q6 | *(Later)* Pages semantically related to `<page>` | Weighted `related_to` edges from embeddings | Schema-shaped to accept; not implemented in v1 |

### Design decision (from spike Q4)

The spike surfaced that **"N seconds before this visit" is two different
questions**:

- **Causal:** what browsing led here? (walk `navigated_from` / `opened_from`)
- **Temporal:** what was on my screen during a time window? (interval scan
  over Visit ranges + focus intervals)

The immediate predecessor by `at_time` can be hours old if the user stared
at a page during idle. Collapsing these into one primitive gives wrong
answers to at least one of them. Provide both, name them separately:

- `causal_predecessors(visit_id, window_ms)`
- `visits_on_screen_between(t_from, t_to)`

No schema change; query-layer distinction only.

## Requirements

### Functional

- **REQ-01** Node types: `Page`, `Visit`, `Tab`, `Window`, `Session`,
  `Domain`, `Tag`, `SearchQuery`. Fields as defined in
  `spike/temporal-graph/types.ts`.

- **REQ-02** Edge types split by shape:
  - **Point** (`at_time`): `navigated_from`, `opened_from`, `arrived_via`,
    `tagged_with`
  - **Interval** (`valid_from`, `valid_to`): `of_page`, `in_tab`,
    `in_session`, `in_window`, `on_domain`

- **REQ-03** Every node and edge carries two timestamps:
  - `at_time` (or `valid_from`) — event time
  - `recorded_at` — write time
  These may diverge (retroactive tag, LLM-derived edge, manual correction).
  All timestamps are integer milliseconds since epoch, UTC. No `Date`
  objects in storage.

- **REQ-04** URL normalization defines Page identity. Canonicalization must:
  - Lowercase scheme + host
  - Strip tracking params: `utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`,
    `_ga`, `ref`, `ref_src` (extensible list)
  - Preserve query string otherwise (search queries live here)
  - Strip fragments by default; per-domain allowlist for SPAs that use
    fragments as routes (e.g. legacy Gmail, some docs sites)
  - Remove trailing slash from path unless path is `/`

- **REQ-05** Focus intervals on `Visit` are materialized from `tabs.onActivated`
  and `windows.onFocusChanged`. The raw event stream is captured to an
  outbox; intervals are computed on write. `focus_interval.end === null`
  means "still focused as of last known event."

- **REQ-06** Hook `webNavigation.onCommitted` for reliable `transitionType`
  on every navigation. Add `webNavigation` to manifest permissions.

- **REQ-07** Persist opener chain **durably on the Visit** at tab-create
  time as an `opened_from` point edge to the spawning Visit. The edge
  survives parent tab close.

- **REQ-08** Tags are first-class `Tag` nodes with `tagged_with` point
  edges from `Session` to `Tag`. Not strings on Session. Multiple tags per
  session by adding multiple edges. Untagging is a new edge type
  (`untagged_with`) or a soft-delete convention; TBD, but the schema does
  not permit in-place edge removal.

- **REQ-09** Query API exposes at minimum the six primitives in the query
  catalog. Each primitive is a plain function operating on the store; no
  DSL, no query language.

### Non-Functional

- **NFR-01** All reads served from IndexedDB. Zero network in the query
  path.

- **NFR-02** Append-only edges. Retroactive edits create new records,
  never mutate existing ones. `recorded_at` is the audit trail.

- **NFR-03** Storage: **one** IndexedDB database, two object stores
  (`nodes`, `edges`), no other persistent store used for graph data.
  `LocalEventStore` is retained as a **write-ahead outbox** only, drained
  by the ingest pipeline.

- **NFR-04** Only one tracking layer. `src/session/tracking/*` remains;
  `src/tracking/*` is retired.

- **NFR-05** Manifest V3 compatible. Ingest pipeline uses `chrome.alarms`
  to drain the outbox so a service-worker termination cannot lose data
  captured to the outbox.

- **NFR-06** No new runtime dependencies. `level-browserify` (and any
  LevelGraph deps) are removed.

- **NFR-07** Bundle size delta from schema + graph engine ≤ 50 KB.

### Indexes

Object store `nodes` — compound indexes:
- `(type, at_time)` — used by Q2 and any time-window scan for a node type
- Type-specific single-field indexes: `Page.normalized_url`, `Domain.hostname`, `Tag.slug`, `Tab.browser_tab_id`

Object store `edges` — compound indexes:
- `(from_id, type)` — outbound traversal
- `(to_id, type)` — inbound traversal
- `(type, at_time)` — for cross-source time-window scans (e.g. all
  `tagged_with` events in a range)

## Success Criteria

Measurable, not aspirational. No fabricated performance targets.

- All six queries in the catalog run correctly against a **real captured
  day of the developer's own browsing** — not just the fixture. This is
  the first integration milestone.
- Zero new runtime dependencies added; `level-browserify` removed.
- One tracking layer; `src/tracking/*` deleted.
- `webNavigation` hooked; `transitionType` populated on every navigation
  in a captured day.
- Retroactive tag on a real session works: tag applied, Q3 returns the
  visits that predate the tag application, `recorded_at` shows the
  intended divergence from `at_time`.
- Bundle size delta measured and ≤ 50 KB.
- Existing test suite passes; new unit tests for URL normalization, each
  edge-type transformer, and each query primitive.

Explicitly **not** success criteria: startup time reduction, memory
usage reduction, query response time targets. Those require a baseline
to compare against, and no such baseline exists. They will be measured
in a follow-up perf pass once the model is stable.

## Constraints & Assumptions

### Constraints

- Manifest V3 service worker lifetime — the background worker can be
  killed when idle. Any writes must land in the outbox synchronously
  during the event handler; drain-to-IndexedDB happens asynchronously
  under an alarm.
- Focus event stream is not perfectly reliable across all browsers —
  service-worker sleep can drop a `windows.onFocusChanged`. Reconcile on
  Visit close: if a visit's last focus interval has `end === null` and
  the visit is now closed, backfill the end.
- IndexedDB transactions are per-store or per-database, not cross-store
  across microtasks. Every write of a node and its outgoing edges must
  happen in a single transaction to preserve invariants.

### Assumptions

- Personal scale: single-user, single-writer per device, low millions of
  visits per year at the high end. A hand-rolled IndexedDB graph engine
  is sufficient at this scale for the queries in the catalog.
- Zero current users — schema migration cost is essentially free; we can
  drop old data on first launch.
- The five spike queries are representative. If new query shapes appear
  during real-day integration, the schema absorbs them by adding edges,
  not by restructuring nodes. This is a bet; it may be wrong.

## Out of Scope

Deferred to their own PRDs:

- **Sync between devices.** A later PRD will define upload/download to a
  hosted store (candidates: Cloudflare R2 + Workers, or a small
  self-hosted GCP box). The graph model is designed to be
  sync-transport-agnostic.
- **At-rest encryption of persisted data.** Web Crypto AES-GCM,
  passphrase-derived key. Separate PRD, coupled to the sync PRD.
- **LLM/embedding-derived `related_to` edges.** Schema is designed to
  accept them (new node type `Embedding`, new edge type `related_to`) but
  no capture, storage, or query for embeddings is in this PRD.
- **SingleFile page archiving.** Will attach to `Page` via a new edge
  type in a later PRD.
- **UI implementation.** The completed `user-interface` epic renders the
  current (flat) data model. Adapting it to consume the graph query API
  is a separate epic, not this one.
- **Server infrastructure.**

## Cleanup / Migration

Explicit list because the delete pile is nontrivial:

- **Delete** `level-browserify` and any dependent code.
- **Delete** LevelGraph paths in `src/database/connection.ts` and the
  triple-store abstractions in `src/database/repositories.ts` that assume
  Level.
- **Delete** `src/tracking/*` (older layer with no browser hookup).
  Any unique logic (session detection heuristics) migrates into
  `src/session/tracking/*`.
- **Delete** unused edge-type declarations in `src/database/schema.ts`
  that don't survive into the new schema (`SYNCED_FROM`, `ACCESSED_BY`,
  `CONTAINS_TAB` unless we adopt them).
- **Repurpose** `LocalEventStore` as a write-ahead outbox: same API,
  same storage, but the ingest pipeline drains it on an alarm rather
  than treating it as durable.
- **Migrate** any browsing data captured by the current stack:
  chrome.storage.local batches + existing IndexedDB session data. Zero
  users, low stakes, but a one-shot migration script is cleaner than
  data loss.
- **Manifest** — add `webNavigation` to permissions.

## Dependencies

- **No new runtime dependencies.** TypeScript, IndexedDB, and
  `webextension-polyfill` (already present) are sufficient.
- **Removes** `level-browserify` and its transitive Level deps.
- **Manifest permission** added: `webNavigation`. Users who install the
  extension after this change will see the additional permission at
  install; existing users would see a permission prompt on upgrade.

## Risks

- **URL normalization corner cases.** Auth tokens in query strings,
  session IDs, dynamically-generated params. Wrong normalization
  overcounts Page identity or under-counts. Mitigation: strict allowlist
  of params to strip; log unknown params for review; expose a
  per-domain override in settings later.
- **Focus event unreliability under MV3 service-worker sleep.**
  Mitigation: reconcile on Visit close; treat `focus_intervals` as
  best-effort.
- **Bitemporality under-tested.** The spike exercised one retroactive
  edit case. Real usage will surface more (correcting a mis-detected
  session boundary, splitting/merging sessions after the fact, LLM
  edges added weeks later). Mitigation: mark this an explicit risk;
  add regression tests as cases surface; keep `recorded_at` on every
  record so we always have the escape hatch.
- **Schema calcification.** If a genuinely new query shape appears that
  can't be answered by adding edges, we'll have to migrate. Mitigation:
  designed the schema around append-only edges specifically so that
  additive changes require no migration; only breaking changes do.

## Epic Decomposition Preview

Rough sequencing for the epic that follows this PRD (subject to a
proper decomposition pass):

1. **Schema + storage** — IndexedDB schema, `GraphStore` class, indexes.
2. **URL normalization** — utility + tests.
3. **Capture consolidation** — retire `src/tracking/*`; hook
   `webNavigation.onCommitted`; consolidate focus event handling.
4. **Ingest pipeline** — outbox drain → node/edge writes in transactions.
5. **Query primitives** — implement the six queries as a public API.
6. **Migration** — one-shot import from existing stores; then delete
   LevelGraph.
7. **First real-day integration** — capture, ingest, run all six queries
   against captured data.
8. **Tests** — normalization, transformers, queries, on both fixture and
   real-day data.

## References

- Spike code: `spike/temporal-graph/` (types, store, fixtures, queries,
  runner). Committed 2026-07-09.
- Code audit: current tracking / session / database / storage layers
  documented in the session log preceding this PRD.
- Superseded PRD: `refactor-neodb-and-ssb-to-gundb.md` (deprecated
  2026-07-10).
- Original PRD: `tabkiller.md` (still valid as product vision; storage
  and sync sections are superseded by this PRD and future sync PRD).
