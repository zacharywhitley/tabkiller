---
issue: 51
title: Capture layer consolidation
analyzed: 2026-07-10T02:00:00Z
streams: 1
---

# Issue #51 Analysis: Capture layer consolidation

## Scope

Retire the older `src/tracking/*` layer, hook `webNavigation.onCommitted`
so `transitionType` is populated on every navigation, unify
`tabs.onActivated` and `windows.onFocusChanged` into a single focus
emitter, and capture the opener chain durably. After this task the
capture surface emits every signal the graph model needs.

## Stream Decomposition

**One stream.** The three sub-parts (retirement, webNavigation hook,
focus emitter) could technically parallelize, but they all edit
`src/background/service-worker.ts` and reason about the same event
stream. Splitting them would create coordination cost inside the same
event loop. Single agent, sequential within one head.

### Stream A — full capture consolidation

Files to author/modify/delete:
- **Deleted:** `src/tracking/EventTracker.ts`, `TabTracker.ts`,
  `NavigationTracker.ts`, `SessionTracker.ts`, `WindowTracker.ts`
  (and the directory)
- **New:** `src/session/tracking/FocusEmitter.ts`,
  `src/session/tracking/__tests__/FocusEmitter.test.ts`,
  `src/session/tracking/__tests__/WebNavigationHook.test.ts`
- **Modified:** `src/background/service-worker.ts` (webNavigation hook,
  focus emitter wiring), `src/session/tracking/TabLifecycleTracker.ts`
  (integrate webNavigation-source events, drop reliance on
  `tabs.onUpdated.changeInfo.url` for URL detection),
  `src/session/detection/*` (absorb any unique heuristics migrating
  from the deleted `SessionTracker.ts`), `manifest.json` +
  `src/manifest/*` per-browser variants (add `webNavigation`
  permission)

**Explicit non-scope:** do NOT modify `src/database/graph/*` or
`src/session/storage/*`. Those belong to #49. Do NOT modify anything
under `src/ui/*`.

Migration rule: before deleting a file in `src/tracking/*`, grep for
its imports. Every consumer must have a path forward. Any unique
session-detection heuristic that lives only in the deleted
`SessionTracker.ts` migrates into `src/session/detection/*` (which
already has the "advanced" engine); do not silently drop behaviour.

Agent type: `general-purpose`

## Dependencies

None (parallel: true; no deps).

## Conflicts

- **Concurrent-with #49:** files are disjoint (see #49 analysis). Git
  index contention on commit is possible but retryable.

## Success Criteria (from 51.md)

- `src/tracking/` gone; no stale imports remain
- `webNavigation.onCommitted` firing on real navigation, transitionType
  populated
- Focus reconciliation demonstrated on Chrome-style dual-event flows
  (`tabs.onActivated` + `windows.onFocusChanged` fire together)
- `webNavigation` added to manifest across all four browser targets
- Existing session-detection tests still pass
- New tests for focus reconciliation and webNavigation event shape
- Verified with `npm test` (per warm-up finding — not ad-hoc)

## Progress

See `updates/51/stream-a.md`.
