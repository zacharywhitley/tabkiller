---
task: capture-completeness
title: Close the four capture-layer gaps blocking end-to-end validation
analyzed: 2026-07-10T22:20:00Z
streams: 1
parent_epic: temporal-browsing-graph
---

# Capture-Completeness Follow-up

## Why this task exists

`temporal-browsing-graph`'s core schema + storage + query pipeline are
verified end-to-end against real captured browsing (see
`real-day-findings.md`). But every Visit landed with `title: ""`,
`focus_intervals: []`, `transition: "typed"`, and no Session nodes were
created. The intended day-long validation cannot happen against blank
labels, empty focus data, hardcoded transitions, and missing sessions.

All four gaps are additive work in the capture layer. None require
schema changes.

## Scope

### Gap 1 — Page titles

`tabs.onUpdated.changeInfo.title` is available on the browser event
that already reaches the SW; either the event isn't emitted to the
outbox with the title, or the transformer's Page-node write doesn't
pull it. **Fix:** propagate `title` end-to-end; patch it onto the
Page node on first-seen and on any subsequent title change for the
same normalized URL.

### Gap 2 — Focus interval race

Every `focus_transition` warning fires "visit not in graph" — the
focus event arrives before its Visit is materialized in the graph
store. Current transformer logs and skips. That's the wrong tuning
for the actual event ordering. **Fix:** buffer pending focus events
by browser tab id, and drain the buffer against a Visit as soon as
one is created for that tab. Buffer entries older than 5 seconds
without a matching Visit expire silently.

### Gap 3 — Transition type

Every Visit shows `transition: "typed"` regardless of actual
navigation cause. **Fix:** read `transitionType` from the real
`webNavigation.onCommitted` event, map to the schema's transition
values (`link` / `typed` / `form_submit` / `auto_bookmark` /
`reload` / `back_forward` / `generated` / `unknown`), propagate
through the outbox to the transformer. Do not hardcode a default;
missing values become `unknown`.

### Gap 4 — Session and Tag emission

The transformers for `session_started`, `session_ended`,
`tag_applied`, `tag_removed` exist and are tested. Their capture-side
emissions are not wired.

**Session emission:** hook the existing
`SessionDetectionEngine` (already present under
`src/session/detection/`) to emit `session_started` /
`session_ended` events into the outbox on the boundaries it
detects. If the SessionDetectionEngine isn't yet initialized in the
SW, initialize it as part of `BackgroundService.initialize()`.

**Tag emission (developer path, minimal):** add a small form to
`src/options/debug/GraphQueryPanel.tsx` (or a sibling component) that
accepts a Session id + tag slug and emits a `tag_applied` outbox
event. Not the shipping tag UI — that belongs to a follow-up UI epic.
Just enough that the developer can apply a tag and see the
`tabTreeForTag` view populate.

## Non-scope

- Fixing the pre-existing options-page React error (out of scope; a UI
  epic will handle it).
- Diagnosing which of `cleanupOldData` / `updateStorageStats` /
  `runIntegrityCheck` was hanging in `performMaintenanceTasks`. The
  detachment already fixed the user-visible symptom.
- Modifying the graph store, query API, or schema. Only capture-layer
  and ingest-buffer changes.
- Modifying `src/ui/*` — the shipping UI is not this task's concern.

## Dependencies

- `epic/temporal-browsing-graph` branch, tip at `97b7570` or later
- All of #49–#54 are complete

## Success criteria

- After a fresh reload and a minute of real browsing, `graph_nodes`
  contains `Session` records with reasonable `started_at` timestamps.
- Page records show real titles, not `""`.
- Every Visit's `transition` reflects the real browser transition
  type — verified by mixing typed URLs (`transition: "typed"`),
  link clicks (`transition: "link"`), and back-button navigations
  (`transition: "back_forward"`).
- No `focus_transition ... visit not in graph` warnings after the
  first 5 seconds of a session. `focus_intervals` are populated on
  Visits.
- Applying a tag to a session via the developer path lets
  `tabTreeForTag(<slug>)` return non-empty results.
- All 176+ existing epic tests still pass. New tests cover: title
  propagation, deferred-focus buffer draining, transition-type
  mapping, session emission.
- Verified with real `npm test` (not ad-hoc), plus manual check on
  the loaded extension.

## Progress

See `updates/capture-completeness/stream-a.md`.
