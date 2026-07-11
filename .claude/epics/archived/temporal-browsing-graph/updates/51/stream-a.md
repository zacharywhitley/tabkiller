---
issue: 51
stream: A
started: 2026-07-10T01:43:54Z
status: complete
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
- `src/session/tracking/TabLifecycleTracker.ts:16` — imported `EventTracker`
  but never referenced it. Dead import.
- `src/background/enhanced-service-worker.ts` — dead file (not in
  `webpack.config.js` entries, not referenced anywhere).
- `src/background/optimized-service-worker.ts` — dead file (same).
- `src/__tests__/tracking/EventTracker.test.ts`,
  `src/__tests__/tracking/TabTracker.test.ts` — tests for deleted code.

Only `background/service-worker.ts` is built (single webpack entry).
The dead service workers had to go too — leaving them yields TypeScript
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

## FocusEmitter state machine (one paragraph)

The emitter tracks a single tuple `(focusedTabId, focusedVisitId)`.
`tabs.onActivated(info)` resolves the tab's most recent visit id via
the caller-supplied `resolveVisitForTab` callback and transitions to
`(info.tabId, visitId)`. `windows.onFocusChanged(id)` transitions to
`(null, null)` when `id === WINDOW_ID_NONE`, otherwise queries
`tabs.query({active: true, windowId: id})` and transitions to the
resolved active tab's `(tabId, visitId)`. `notifyVisitChange(tabId,
visitId)` is a no-op unless `tabId === focusedTabId`; if so it
transitions to `(focusedTabId, visitId)`. The emit rule is: (a) if the
target visit id equals the current visit id and the tab id also
matches, no-op; (b) if only the visit id matches (both null, e.g.
switching between two tabs neither of which has a committed
navigation), update the tab pointer silently without emitting; (c)
otherwise, update state and emit `{at: now(), focused_visit: visitId}`.
This yields exactly one emission per Chrome dual-fire, one null-then-
new-visit pair per Firefox WINDOW_ID_NONE blip, and one re-emission
per new navigation on the focused tab.

## Test-stack observation

The `webextension-polyfill` mock in `tests/setup.ts` does not include
`webNavigation` (nor does chrome's mock there), so the WebNavigationHook
test supplies its own mock via `jest.mock('../../../utils/cross-browser')`.
Also worth flagging for later: `jest.isolateModules` creates a fresh
module registry, so any prototype spy installed against the top-level
`import`ed class does NOT intercept calls made from inside the isolated
module. The test loads and spies on `LocalEventStore` inside the same
`isolateModules` scope as the service-worker require. `setImmediate` is
not available in jsdom under current Node; use
`setTimeout(resolve, 0)` instead.

## Completed

- Deleted `src/tracking/EventTracker.ts`, `NavigationTracker.ts`,
  `SessionTracker.ts`, `TabTracker.ts`, `WindowTracker.ts`
  (commit ba2359f).
- Deleted dead `src/background/enhanced-service-worker.ts`,
  `src/background/optimized-service-worker.ts` (same commit).
- Deleted their tests under `src/__tests__/tracking/` (same commit).
- Removed unused `EventTracker` import in `TabLifecycleTracker.ts`
  (same commit).
- Added `webNavigation` permission to `manifest.json` and the four
  per-browser templates under `src/manifest/`.
- Added `focus_transition` to the `EventType` union in
  `src/shared/types.ts`.
- Wrote `src/session/tracking/FocusEmitter.ts`.
- Wired `webNavigation.onCommitted` handler + `FocusEmitter` +
  outbox (`LocalEventStore`) into `src/background/service-worker.ts`.
- Enriched `handleTabCreated` with opener → parent-visit resolution
  and an outbox `tab_created` event.
- Clean up `latestVisitByTab` on `tabs.onRemoved` to avoid stale
  visit ids surviving tab-id reuse.
- Wrote `FocusEmitter.test.ts` (11 tests, all pass) covering:
  Chrome dual-fire dedup, Firefox WINDOW_ID_NONE blip, browser lost
  focus, redundant activation, same-null-visit no-emit, focused-tab
  visit change, non-focused-tab notify no-op, unresolvable active
  tab, `stop()` cleanup, `start()` idempotence,
  `onFocusTransition` unsubscribe.
- Wrote `WebNavigationHook.test.ts` (5 tests, all pass) covering:
  listener registration + scheme filter, top-frame outbox shape,
  sub-frame ignore, `notifyVisitChange` wiring, error-doesn't-update-
  index behavior.
- Verified `npm test` runs the new tests through the real jest
  config (no override).
- `npx tsc --noEmit` clean for all changed files (pre-existing
  `SessionGroup.tsx:238` JSX error is not in scope).

## Working On

Nothing. Task complete.

## Blocked

None.

## Notes / Surprises

- `src/tracking/*` was already dead in the built extension. Only the
  unused import (`TabLifecycleTracker.ts:16`) and the two dead
  service-worker files kept the tree alive at compile time; nothing
  at runtime touched it. The deletion is a pure cleanup.
- Pre-existing failing tests in this repo (verified against the
  parent commit with `git stash`, before my changes):
  - `BehaviorAnalyzer.test.ts` — 5 failures against category logic
  - `IntegratedSessionDetection.test.ts` — 1 performance flake
  - `NavigationHistoryTracker.test.ts` — 9 failures
  - `IntegratedTracking.test.ts` — 12 failures
  - `TabLifecycleTracker.test.ts` — 3 failures
  - `crypto.test.ts`, `AnalyticsEngine.test.ts`, `PrivacyFilter.test.ts`,
    `adapter-system.test.ts`, `conflict-detector.test.ts`,
    `utils.test.ts`, `database/connection.test.ts`,
    `database/models.test.ts`, `tests/utils/cross-browser.test.ts`
  These are NOT caused by my changes. Two of them (SessionStorageEngine
  and StorageIntegration) may be aggravated by #49's in-flight
  schema/engine changes — those are uncommitted in the working tree so
  they show up in the same test run; not my concern.
- `SessionDetectionEngine.test.ts` (the file most relevant to the
  "existing session-detection tests still pass" criterion) is green.
- Coordination: I did NOT touch `src/database/graph/*`,
  `src/session/storage/SessionStorageEngine.ts`,
  `src/session/storage/schema.ts`, `src/utils/url.ts`, or any UI code.
