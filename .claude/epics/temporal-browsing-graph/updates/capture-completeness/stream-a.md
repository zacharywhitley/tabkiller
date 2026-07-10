---
issue: capture-completeness
stream: A
started: 2026-07-10T22:20:46Z
status: in_progress
---

## Approach

Four surgical fixes to close the observed capture-layer gaps, without
touching the frozen schema (`store.ts`, `types.ts`, `queries.ts`):

1. **Titles** — enrich `navigation_committed` with a synchronous
   `chrome.tabs.get(tabId).title` read at commit time, and emit
   `tab_updated` outbox events on `tabs.onUpdated` when a title change
   arrives late (SPAs). Extend `transformTabUpdated` to rewrite the
   Page node's title in place.
2. **Focus race** — add a per-tab focus buffer in `GraphIngest`. Focus
   events referencing a Visit id not yet in the graph get parked
   keyed by `browserTabId`; on the next `navigation_committed` for
   that tab, buffered events are replayed with `focused_visit`
   rewritten to the newly-created Visit. `FocusEmitter` now carries
   `focused_tab_id` on its emissions so the SW can forward it.
3. **Transition type** — extend `mapTransition` to explicitly handle
   the Chrome extras (`keyword`, `keyword_generated`, `manual_subframe`,
   `auto_subframe`, `start_page`) and log a warning on any truly
   unrecognized value.
4. **Sessions + tag form** — new `SessionEmitter` module (idle-gap
   detection derived from outbox activity; no new manifest permission
   needed). Wired into `BackgroundService.initialize` before the event
   listeners register, so `session_started` lands ahead of the first
   `navigation_committed`. Debug tag form (`TagForm.tsx`) sends
   `apply-tag` / `remove-tag` runtime messages to the SW, which
   appends `tag_applied` / `tag_removed` to the outbox.

## Completed

- Gap 1: titles wired end-to-end (transformer + SW handlers).
- Gap 2: focus buffer in `GraphIngest`, plus `focused_tab_id` on
  `FocusTransition` and on the outbox event.
- Gap 3: transition mapping extended and warns on surprises.
- Gap 4: `SessionEmitter` module, `SessionEmitter.test.ts`, wired
  into SW init; developer `TagForm` + SW message handlers
  (`apply-tag`, `remove-tag`, `get-current-session-id`) added.
- Updated `FocusEmitter.test.ts` for new `focused_tab_id` field.
- Updated `transformers.test.ts` with title patch, transition mapping,
  and unknown-value warning tests.
- Added `GraphIngest.drain — focus buffer` describe block covering
  the race and the buffered-then-drained happy path.

## Working On

Full test suite run + type-check + build validation.

## Blocked

None.

## Notes / Surprises

- The heavier `SessionDetectionEngine` from the user-interface epic is
  overkill for the graph capture layer. A ~180-line `SessionEmitter`
  covers idle-gap detection using the outbox activity we already
  write — no new manifest permission.
- `chrome.idle` was considered but rejected — it would add a
  permission the manifest does not currently declare, and the
  outbox-derived idle signal is sufficient for the current graph
  ingest use case.
- The focus buffer's semantic is deliberately "associate buffered
  focus events with the next Visit created for that tab" — not
  "replay original focus_visit id". This is the correct model when
  the SW's tab→visit map has raced ahead of the outbox drain.
- The tag form talks to the SW via `runtime.sendMessage` rather than
  opening its own outbox — avoids doubling LocalEventStore state.
