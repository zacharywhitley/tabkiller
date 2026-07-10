---
issue: 51
stream: A
started: 2026-07-10T01:43:54Z
status: in_progress
---

## Approach

Three-part capture consolidation:
1. Retire `src/tracking/*` (five files) after migrating any unique
   session-detection heuristics into `src/session/detection/*`.
2. Hook `webNavigation.onCommitted` in `src/background/service-worker.ts`
   with an http/https scheme filter; emit event to the outbox
   (`LocalEventStore`) with `transitionType`. Add the permission to
   `manifest.json` and every per-browser template under `src/manifest/*`.
3. Create `src/session/tracking/FocusEmitter.ts` that owns both
   `tabs.onActivated` and `windows.onFocusChanged` subscriptions and
   emits a single normalized focus-transition stream, deduping the
   Chrome dual-fire pattern.

## Migration analysis (src/tracking/* vs src/session/*)

Live consumers of `src/tracking/*` after grep:
- `src/session/tracking/TabLifecycleTracker.ts:16` — imports `EventTracker`
  but never references it. Dead import.
- `src/background/enhanced-service-worker.ts` — dead file (not in
  `webpack.config.js` entries, not referenced anywhere).
- `src/background/optimized-service-worker.ts` — dead file (same).
- `src/__tests__/tracking/EventTracker.test.ts`,
  `src/__tests__/tracking/TabTracker.test.ts` — tests for deleted code.

Only `background/service-worker.ts` is built (single webpack entry).
The dead service workers must go too — leaving them yields TypeScript
errors on `src/tracking/EventTracker` after deletion, and CLAUDE.md
forbids dead code.

Heuristic delta between `src/tracking/SessionTracker.ts` and
`src/session/detection/SessionDetectionEngine.ts`:
- Idle detection: **detection engine covers it** (temporal
  `extended_idle` signal with grace period).
- Navigation gap: **detection engine covers it** (`navigation_gap`).
- Domain change: **detection engine covers it** with a similarity model
  richer than SessionTracker's binary "related" check.
- Domain change score based on hard-coded social vs work domain lists:
  **detection engine covers this too** via `getDomainCategory` (same
  categories: work, social, plus more), used by
  `analyzeCategoryTransition`.
- Session state management (`startSession`/`endSession`/idle timers on
  a stateful `currentSession` object): this is *session tracking*, not
  detection — and the newer `src/session/tracking/*` +
  `SessionDetectionIntegration.ts` own it now.

Conclusion: no unique detection heuristics to migrate. All behaviour
in `SessionTracker.ts` is either duplicated in
`SessionDetectionEngine.ts` (with a better signal model) or is
session-management code that has been superseded by
`SessionDetectionIntegration.ts`. Deleting the whole `src/tracking/`
tree is a straight retirement.

## Completed

- Progress file created; scope, migration analysis, and deletion plan
  captured.

## Working On

- Deleting `src/tracking/*` and the two dead service worker files;
  cleaning the unused import in `TabLifecycleTracker.ts`.
- Wiring `webNavigation.onCommitted` in `service-worker.ts`.
- Building `FocusEmitter`.
- Manifest + tests.

## Blocked

- None.

## Notes / Surprises

- `src/tracking/*` is already dead in the built extension. Only the
  unused import and the two dead service-worker files kept them
  compilable; nothing at runtime touches them.
- `webextension-polyfill` mock in `tests/setup.ts` does not include
  `webNavigation`. Tests will supply their own mock rather than
  extending the global setup (keeps the setup file scope tight).
