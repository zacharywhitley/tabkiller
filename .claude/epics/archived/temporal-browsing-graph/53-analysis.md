---
issue: 53
title: Query API + real-day integration
analyzed: 2026-07-10T03:00:00Z
streams: 1
manual_step: true
---

# Issue #53 Analysis: Query API + real-day integration

## Scope

Two parts. The first is a straight port from the spike; the second is
a manual, developer-driven acceptance test that the schema and capture
layer actually answer the queries the product needs.

- **Stream A (agent):** port the six query primitives from
  `spike/temporal-graph/queries.ts` to `src/database/graph/queries.ts`
  (backed by the real IDB `GraphStore`), add a debug panel behind an
  options-page flag, and cover the queries with fixture-based tests.
- **Manual step (developer):** install the extension, use it for a
  real day, run every query against the captured data, verify results
  by hand, and document findings.

The manual step is the epic's acceptance test. It cannot be delegated.

## Stream Decomposition

**Single agent stream.** Queries, tests, and debug panel are one
coherent piece of read-side work.

### Stream A — queries + panel + fixture tests

Files to author/modify:
- **New:** `src/database/graph/queries.ts`,
  `src/database/graph/__tests__/queries.test.ts`,
  `src/database/graph/__tests__/fixture.ts` (ported from
  `spike/temporal-graph/fixtures.ts`),
  `src/options/debug/GraphQueryPanel.tsx` (debug UI),
  `src/options/debug/index.ts` (registration behind a debug flag)
- **Modified:** the options page entry to conditionally render
  `GraphQueryPanel` when a `TABKILLER_DEBUG` flag is set (localStorage
  or query-string toggle — whichever fits the existing options-page
  pattern). Do NOT ship the panel visible by default.

**Query primitives (from PRD, resolving the spike's Q4 finding):**
1. `pagesOpenedFromDomain(hostname, from, to)` — walks `opened_from`
2. `visitFocusedAt(t)` — scans Visits with focus intervals containing t
3. `visitsInTagPredatingTag(tagSlug)` — bitemporal join
4. `causalPredecessors(visitId, windowMs)` — walks `navigated_from` then
   `opened_from` backward (renamed from spike's `visitsBefore`)
5. `visitsOnScreenBetween(tFrom, tTo)` — **new**; range-scan Visit
   `[at_time, ended_at]` overlap; addresses the spike's Q4 finding
6. `tabTreeForTag(tagSlug)` — structural + temporal join

**Index usage rule:** every query uses one of the compound indexes
declared in #49's schema. No full-table scans in the query path. The
`GraphStore` already exposes `outEdges/inEdges/outPoint/etc.` — those
are your primitives. For `visitFocusedAt`, use the `(type, at_time)`
node index to seek starting from the target instant and walk.

**Debug panel MVP:** a form with a query selector and per-query input
fields. Renders results as a JSON pane. Not styled beyond what the
existing options-page CSS provides. Purpose is developer inspection
during the manual step, not a shipped feature.

**Explicit non-scope for the agent:**
- Do NOT modify `src/database/graph/store.ts`, `types.ts`, or `ingest.ts`
- Do NOT modify any capture-layer file under `src/session/tracking/*`
  or `src/background/service-worker.ts`
- Do NOT touch the currently-shipping UI (timeline, sidebar, popup)
- Do NOT delete the old storage paths — cutover is #54

Agent type: `general-purpose`

## Manual step — the acceptance test

**Owned by the developer, not the agent.** After Stream A lands:

1. Build the extension (`npm run build:chrome`)
2. Load unpacked into a regular Chrome profile
3. Enable `TABKILLER_DEBUG` (localStorage or however the panel is gated)
4. Use the browser normally for a day — target: 100+ navigations, ≥2
   sessions, ≥1 retroactive tag application
5. Open the options page → debug panel → run each of the six queries
   with realistic parameters
6. Verify:
   - Q1 (`pagesOpenedFromDomain`) — pick a domain you know you clicked
     from during the day
   - Q2 (`visitFocusedAt`) — pick an instant you remember and check the
     right page comes back
   - Q3 (`visitsInTagPredatingTag`) — retroactively tag a session and
     confirm the pre-tag visits are returned
   - Q4 (`causalPredecessors`) — pick a landing page, walk the chain
     back to its origin
   - Q4b (`visitsOnScreenBetween`) — pick a 10-minute window; confirm
     everything visible is returned
   - Q5 (`tabTreeForTag`) — pick a tag, get the reconstructed tab tree,
     see if it matches memory
7. **Document findings in** `.claude/epics/temporal-browsing-graph/real-day-findings.md`:
   - What matched intuition
   - What didn't (schema issue? capture gap? query bug?)
   - Any surprising query shapes or edge cases
   - Whether the epic acceptance criteria are met

## Dependencies

- #49, #50, #51, #52 — all complete
- Real-day capture requires the extension to be installed and
  working end-to-end

## Success Criteria (from 53.md)

- Six primitives implemented and tested against the ported fixture
- No full-table scans in the query path
- Debug panel gated behind a flag; not visible by default
- Real-day findings documented (manual step)
- `npm test` verifies the new tests via real config

## Progress

See `updates/53/stream-a.md` (agent) and `real-day-findings.md`
(developer-authored after the manual step).
