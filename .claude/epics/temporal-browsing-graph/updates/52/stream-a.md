---
issue: 52
stream: A
started: 2026-07-10T10:33:02Z
updated: 2026-07-10T11:07:00Z
status: complete
---

## Approach

Split ingest into two modules per the task spec:

- `src/database/graph/transformers.ts` — one async transformer per event type, taking `(event, context) → GraphWriteBatch`. `IngestContext` exposes the read-only graph lookups (find Page by normalized_url, find Visit, etc.) plus the in-memory state the ingest owns (opener buffer, search buffer, currently focused visit, current session).
- `src/database/graph/ingest.ts` — the drainer: reads pending outbox events, threads context, dispatches to transformers, writes via `GraphStore.writeBatch`, and marks drained. Owns the opener/search buffers, currently-focused-visit pointer, current-session pointer, and search-engine URL detection. Also owns the debounced `drainSoon()` and the `chrome.alarms` handler wiring.

Design calls:
- **Idempotent ids.** Node ids derive from event ids or from the identifying attribute (`page_<hash>`, `domain_<hostname>`, `tag_<slug>`, `visit_<eventId>`, `tab_<eventId>`, `session_<eventId>`, `searchquery_<engine>_<hash>`, `window_<browserWindowId>`). Edge ids: `edge_<sourceEventId>_<edgeType>_<index>`. Replays re-put the same records — no dupes.
- **Idempotency guard on the close-out block.** `transformNavigationCommitted` normally closes the tab's previous visit and emits `navigated_from`. On replay the tab's previous-visit pointer equals the current event's derived visit id (self); the transformer skips the close-out to avoid emitting a self-loop `navigated_from`.
- **Focus reconciliation.** Ingest tracks `currentlyFocusedVisitId` in memory. A focus_transition event closes the trailing interval (`end: null` → `end: event.at`) on the outgoing visit and appends `{ start: event.at, end: null }` on the incoming visit. On visit close (new navigation in same tab, or tab close), any trailing null-end intervals on the closing visit are set to the visit's `ended_at`. Recovers from SW-restart focus loss.
- **Opener buffer.** In-memory `Map<browserTabId, { openerVisitId, expiresAt }>`. On tab_created with an opener, populated. On first navigation_committed for that tab, consumed to emit `opened_from` edge. 60s expiry, pruned on read/write. Best-effort — lost on SW restart, no `opened_from` edge in that case.
- **Search buffer.** Same shape, keyed by browser tab id. Populated when a navigation lands on a search-results URL. Consumed on the *next* navigation in that tab to emit `arrived_via`. Search detection uses hostname pattern + path check + query param extraction for google / bing / ddg / youtube.
- **Missing referenced visits.** Focus_transition can reference a Visit id whose navigation_committed event has not been drained yet. Order-wise this cannot happen inside a single well-ordered batch (nav is enqueued before focus), but on partial replay or SW crash mid-drain the visit lookup can return undefined. Policy: log a structured warning, skip that side of the focus interval update, still advance the focus pointer so future close-outs align. Refuses to stall the pipeline for missing prior state.
- **LocalEventStore drain helpers, additive.** Add `pendingBatches()` and `markDrained(eventIds)` without touching the write/query/cleanup paths. Drained ids persist under a new storage key; `pendingBatches` filters them out. Drained ids for a batch are cleaned up when the batch itself is removed (age or size cleanup) so the set does not grow unbounded.
- **Alarm cadence.** `chrome.alarms.create('graph-ingest', { periodInMinutes: 0.5 })` per the task spec. `drainSoon()` debounces to 500 ms and runs the same drain code as the alarm.

## Completed

- `src/database/graph/transformers.ts` (~870 lines) with dispatcher `transformEvent`, one function per event type, plus helpers (`detectSearchEngine`, `visitNodeId`, `edgeId`, focus-interval clip, slug sanitiser, transition mapper, deterministic hash).
- `src/database/graph/ingest.ts` (~308 lines) with `GraphIngest` class, opener/search buffers with 60 s expiry, in-memory session/focus pointers, per-tab latest-visit pointer, drain / drainSoon / runAlarm, and `initialize()` that reconstructs pointers from the graph after SW restart.
- `src/database/graph/__tests__/transformers.test.ts` (~1048 lines, 28 tests) — one test per event type minimum, plus search detection, opener/search-buffer consumption, focus interval materialisation, and reconciliation-on-close.
- `src/database/graph/__tests__/ingest.test.ts` (~438 lines, 9 tests) — end-to-end drain against real fake-indexeddb: happy-path shape, navigated_from between two navigations, focus interval materialisation, arrived_via chain, opened_from chain, atomicity (throw mid-transform blocked no partial write, subsequent event still processed, next drain retried the failed one), idempotency (replay identical event set = same node/edge counts), alarm route (`runAlarm`), and drainSoon debounce coalescing.
- `src/storage/LocalEventStore.ts` extended additively with `pendingBatches()`, `markDrained(eventIds)`, drained-id persistence, cleanup on batch removal, cleared on `clear()`.
- `src/background/service-worker.ts` wired: `SessionStorageEngine.initialize()` at boot, `GraphStore` constructed from its `getDatabase()`, `GraphIngest` created and `initialize()`d, `chrome.alarms.create('graph-ingest', { periodInMinutes: 0.5 })` registered, `alarms.onAlarm` handler dispatches to `runAlarm`, `drainSoon()` kicked after each of the three current outbox emissions (`tab_created`, `navigation_committed`, `focus_transition`).
- `src/shared/types.ts` extended: `tag_applied` and `tag_removed` added to `EventType`. `focus_transition` was already present from #51.

## Working On
Nothing — task complete.

## Blocked
None.

## Notes / Surprises

- **Events not yet emitted by #51's capture layer.** The transformers cover the full mapping in 52.md, but only `tab_created`, `navigation_committed`, and `focus_transition` are actually appended to the outbox by `service-worker.ts` today. `tab_updated`, `tab_removed`, `session_started`, `session_ended`, `tag_applied`, and `tag_removed` have transformers ready but no capture-side emission. This is deliberate: 52.md says "if any event type isn't emitted yet by #51's capture layer, note it as a TODO in your progress log rather than silently omitting". Follow-up work should hook the corresponding browser APIs and store events with the metadata shapes the transformers expect (`openerVisitId` on `tab_created` — already done; `detectedBy`/`title` on `session_started`; `slug`/`label`/`sessionNodeId` on `tag_applied`).

- **`tab_updated` transformer is intentionally empty.** URL changes flow through `webNavigation.onCommitted` (as new Visits) and title changes are surfaced on the next navigation via the Page node's title field. Returning an empty batch still marks the event drained so the outbox does not grow unbounded.

- **`tag_removed` transformer logs intent but does not materialise a retraction.** The graph model treats point edges as append-only; a proper implementation needs either a delete API on GraphStore or an inverse `untagged_from` edge type. Neither exists at this task's slice. The commit body documents the deferral so a follow-up can pick either path without another schema migration.

- **Missing-visit case for `focus_transition`.** The task explicitly flagged this as expected. My handling: log a structured warning through the ingest's `warn` sink, skip that side of the interval update, but *still advance the focus pointer* so subsequent close-outs target the right thing. Tests cover both directions (outgoing missing, incoming missing).

- **Idempotency required a targeted guard, not a generic dedup.** Replaying an already-processed `navigation_committed` was creating a `navigated_from` self-loop because `previousVisitInTab(tabId)` returned the same event's own visit id. Fixed by adding `previousVisitId !== visitId` to the close-out condition. All other transformers are naturally idempotent via deterministic ids and `put` semantics.

- **`URLSearchParams.get` decodes `+` to space** per WHATWG. Initial test expectations were wrong ("temporal+graph" vs "temporal graph"); tests corrected to match the actual behavior with an inline note. Documented so the search-detection expectations don't drift back.

- **`SessionStorageEngine` instantiated freshly in the SW for the graph path.** The old `initializeDatabaseIntegration` uses a different database module (`src/database/index.ts`), so the graph path opens its own SSE. IndexedDB tolerates multiple connections to the same named database; no locking conflict observed.

- **150 pre-existing non-graph test failures unchanged.** Matches #49's stream-a report. The failing tests are the mock-based `SessionStorageEngine.test.ts`, `StorageIntegration.test.ts`, and DOM-heavy UI tests — all unrelated to what #52 shipped.

- **Pre-existing TS error in `src/ui/timeline/visualization/components/SessionGroup.tsx:238`** (unchanged from #50's and #49's reports). My files type-check clean in isolation.

- **No `git pull` — no SSH auth to the remote.** The pull failed (`Permission denied (publickey)`). Working tree was already at `b108754` matching the task spec's expectation, so I proceeded without it.

- **`npm install` was required.** The worktree started with no `node_modules`. Ran once, all subsequent test/type-check runs succeeded from the same install.

## Commit hashes
- `917f0f2` feat(graph): implement ingest pipeline drain and transformers
