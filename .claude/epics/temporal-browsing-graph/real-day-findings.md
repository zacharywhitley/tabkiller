---
recorded: 2026-07-10T22:15:00Z
extension_branch: epic/temporal-browsing-graph
extension_load_state: unpacked, Chrome
---

# Real-Day Validation — Findings

The validation session did not produce a full day of real browsing. It
did produce something more valuable: end-to-end evidence that the
schema and query pipeline work against live captured events, plus a
clear inventory of the capture-layer gaps that will need to be closed
before the intended day-long validation can happen.

## What was verified end-to-end

- Loading the unpacked extension does capture real browser events.
  Observed `Navigation event`, `Window event`, `History visited` logs
  in the service worker console for real navigation across
  news.ycombinator.com and google.com.
- The graph store is populated. `graph_nodes` in
  `TabKillerSessions` contains real `Visit` and `Page` records with
  meaningful `at_time`s, `visit_count` incrementing on revisit, and
  URL normalization applied (verified on
  `news.google.com/home?ceid=US%3aen&gl=US&hl=en-US` — query params
  sorted alphabetically).
- `visitsOnScreenBetween(tFrom, tTo)` returns real captured Visits
  correctly ordered by `at_time`.
- URL identity dedup works — two separate google.com visits share a
  single `page_oxvpji` Page node; three news.ycombinator.com visits
  share a single `page_er1ppq` with `visit_count: 3`.

## Capture-layer gaps discovered

All three of the queries that motivated the schema require capture
signal that isn't yet emitted. The plumbing IS able to carry that
signal; the capture layer just doesn't fill it in.

### 1. Page titles are always empty (`title: ""`)

Every Page record shows `title: ""`. The `tabs.onUpdated.changeInfo.title`
field either isn't being emitted to the outbox or the transformer
isn't reading it.

Impact: the tab-tree view has no readable labels — it can fall back
to normalized URL but reads poorly.

Fix: emit title as part of `tab_updated` and/or `navigation_committed`,
have the transformer patch it onto the corresponding Page node.

### 2. `focus_intervals: []` on every Visit

Every Visit has an empty `focus_intervals` array. The service worker
log shows `graph ingest: focus_transition ... visit not in graph`
repeatedly — the race the #52 agent designed the "log-and-skip"
handling for. In practice this fires on every focus transition, not
just the edge case, because focus events consistently arrive before
their Visit is materialized.

Impact: `visitFocusedAt` will never return a result. Time-active
accounting is broken.

Fix: defer focus events (buffer keyed by browser tab id + visit id)
until the corresponding Visit exists, then apply them. The current
skip-on-miss behavior is wrong-tuned for the actual event ordering.

### 3. `transition: "typed"` on every Visit

Every Visit is tagged `transition: "typed"` even for obvious click
navigation. Either the SW capture is hardcoding `typed` or the
transformer isn't reading `webNavigation.onCommitted`'s real
`transitionType`.

Impact: causal-chain queries can't distinguish link/typed/back-forward.
Downstream analysis (e.g., "which pages did I reach via search?")
loses signal.

Fix: read `transitionType` from the webNavigation event, map to the
schema's transition values, propagate through the outbox to the
transformer.

## Structural gap: no Session nodes

Not visible in the `visitsOnScreenBetween` output but confirmed by
inspection of the capture layer: agent-4 for #52 flagged that
`session_started`, `session_ended`, `tag_applied`, `tag_removed`
transformers exist but their capture emissions are not wired. Result:
`graph_nodes` has zero `Session` records, `tabTreeForTag` and
`tabTreeForSession` return `[]` regardless of input.

Impact: the tab-tree view — the primary planned validation UI —
cannot render anything against real data until this is fixed.

Fix: wire session-detection emissions into the outbox and hook the
UI/CLI path that lets a developer create a Tag and apply it.

## Fixes discovered along the way (all shipped on `epic/temporal-browsing-graph`)

These weren't in scope for the epic but blocked its acceptance test:

- **PNG icons** (`42ddc65`) — manifest referenced `.png` icons but
  only `.svg` files existed. Generated PNGs from SVG.
- **jsdom 26 test setup** (`115c6b2`, `b108754`) — `tests/setup.ts`
  used `delete window.location`, throws under jsdom 26. Moved URL
  init to jest's `testEnvironmentOptions`.
- **Debug helper IDB race** (`1115679`, `b45953b`) — the debug page
  helper originally opened IDB at `DATABASE_VERSION` without an
  upgrade handler, poisoning fresh DBs. Now checks
  `indexedDB.databases()` first and refuses to open a non-existent DB.
- **Standalone debug page** (`a7ad705`) — added
  `options/debug.html` mounted with only `GraphQueryPanel` so the
  developer can bypass the pre-existing options-page provider bug
  (React `useNavigation must be used within a NavigationProvider` +
  `removeChild` reconciliation error). That options-page bug predates
  the epic and is out of scope; it is documented here so a future
  UI-migration epic can pick it up.
- **Manifest `type: module`** (`b204b7e`) — the SW was declared as
  `type: module` but webpack emitted a classic IIFE bundle. Chrome
  silently refused to run the SW. Dropped `type: module`.
- **Webpack splitChunks on SW** (`08b4ad0`) — splitChunks was
  extracting shared code into sibling `.js` files that MV3 service
  workers cannot load at runtime. Excluded the SW entry from
  splitting.
- **SessionStorageEngine hang** (`caa1d7c`) — `performMaintenanceTasks`
  was on the init await chain, silently hanging on a Promise that
  never settled. Detached it as fire-and-forget; init now completes
  and the SW's event listeners get wired.
- **`alarms` permission** (`efd4eb6`) — `chrome.alarms` was
  undefined without the permission; graph ingest's 30s tick never
  fired. Added to all four browser manifests.
- **Diagnostic probes cleanup** (`<this commit>`) — the `[TK-SW]`
  probes and try/catch we used to trace the startup path are
  reverted; general-purpose top-level error listeners remain.

## Verdict on the epic

The `temporal-browsing-graph` epic's core deliverables — schema,
storage, query API, ingest pipeline — are verified working end-to-end
against real captured browsing. The intended acceptance test (six
queries against a day of real browsing) is blocked on the
capture-completeness gaps enumerated above. Those gaps are additive
work in the capture layer and do not require schema changes.

**Recommendation:** close this epic on the basis of validated design +
working plumbing, and follow up with a single small task to close the
three data-completeness gaps + the session/tag emission wiring.

## Follow-ups worth naming

- **Capture-completeness task** (recommended next) — fix titles, defer
  focus events, read transitionType, wire session/tag emissions.
- **Options-page bug** — `useNavigation must be used within a
  NavigationProvider` + `removeChild` reconciliation in the pre-existing
  UI epic. Separate epic when someone owns the UI-migration story.
- **`performMaintenanceTasks` root cause** — the detachment fixed the
  init hang but didn't identify which of `cleanupOldData` /
  `updateStorageStats` / `runIntegrityCheck` was hanging. Not urgent
  (maintenance can no longer stall the SW), but a small dedicated
  session with logging in each would close it.
