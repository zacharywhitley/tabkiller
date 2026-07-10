---
issue: 52
title: Ingest pipeline
analyzed: 2026-07-10T02:30:00Z
streams: 1
---

# Issue #52 Analysis: Ingest pipeline

## Scope

Drain events from `LocalEventStore` (the outbox) and transform each
into node/edge writes on `GraphStore`. This is the layer that turns
captured browser events into the graph model. Runs in *additive*
mode: existing storage paths continue to work in parallel; cutover
belongs to #54.

## Stream Decomposition

**Single stream.** The transformer functions, alarm registration, and
outbox drain are one coherent piece of logic; splitting across agents
would create coordination cost with no wall-clock benefit. This
matches the "sequential from here on" decision made after the #49/#51
parallel round revealed shared-worktree hazards.

### Stream A — outbox drain + event-to-graph transformer + alarm

Files to author/modify:
- **New:** `src/database/graph/ingest.ts`,
  `src/database/graph/transformers.ts`,
  `src/database/graph/__tests__/ingest.test.ts`,
  `src/database/graph/__tests__/transformers.test.ts`
- **Modified:** `src/storage/LocalEventStore.ts` — add `pendingBatches()`
  (read) and `markDrained(eventIds)` (mark). Do NOT change its existing
  API for other callers.
- **Modified:** `src/background/service-worker.ts` — register a
  `chrome.alarms.create('graph-ingest', {periodInMinutes: 0.5})`
  handler that calls `ingest.drain()`; register an immediate-drain
  hook after each event emission (best-effort — outbox is the source
  of truth if the worker is killed).

**Contracts to respect:**
- `GraphStore.writeBatch({nodes, edges})` from #49 is the atomic write
  primitive — every event's transform emits ONE batch.
- `FocusEmitter`'s `{at, focused_visit}` events (#51) feed into the
  `focus_transition` event type; reconciliation materializes into the
  `Visit.focus_intervals[]` array.
- `webNavigation.onCommitted` events (from #51) carry
  `transitionType`, which becomes `Visit.transition`.
- URL normalization (`normalizeUrl` from #50) defines `Page` identity.

**Explicit non-scope:**
- Do NOT modify `src/database/graph/store.ts` or `types.ts` — those
  are #49's surface. If you need a new store method, first ask
  whether the existing API can serve the need.
- Do NOT modify anything under `src/session/tracking/*` — that is
  #51's territory.
- Do NOT add query primitives — those are #53.
- Do NOT delete the old `SessionStorageEngine` session/tab/nav-event
  stores — cutover is #54.

## Key ordering problem (called out in 52.md)

`opened_from` requires the child Visit to exist, but the child Visit
is only created when its first `webNavigation.onCommitted` fires
inside the new tab. On `tab_created`, buffer the opener's parent visit
id (or the opener's outbox event id, so it survives worker restart —
resolve at drain time) keyed by `browser_tab_id`, and consume it when
the first navigation event for that tab is drained. If the opener
info is stale by the time the first navigation happens (rare — e.g.
the tab was created but never visited), emit the Visit without the
opener edge.

Agent type: `general-purpose`

## Dependencies

- #49 (GraphStore) — complete
- #50 (URL normalization) — complete
- #51 (Capture consolidation) — complete

## Conflicts

Sequential mode. No concurrent agents. No coordination concerns.

## Success Criteria (from 52.md)

- All event types transform correctly; one unit test per event type
- Atomicity test: throw mid-transform, verify no partial writes
- Alarm-driven drain works; immediate-drain hook fires on emit
- Ingest is idempotent (same batch twice → same graph state)
- Manual smoke test: install extension, navigate through 20+ pages,
  inspect `graph_nodes` and `graph_edges` in DevTools
- Old storage paths still work (existing UI unaffected)
- Verified with `npm test` — not ad-hoc

## Progress

See `updates/52/stream-a.md`.
