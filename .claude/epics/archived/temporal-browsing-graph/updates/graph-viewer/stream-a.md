---
issue: graph-viewer
stream: A
started: 2026-07-10T22:00:00Z
updated: 2026-07-10T23:22:00Z
status: complete
---

## Approach

Built a standalone dashboard page at `options/dashboard.html`, bypassing
the OptionsApp provider stack the same way `options/debug.html` does.
Sidebar + main-area layout, four views (Sessions / Timeline / Graph /
Search), selected view + selected session persisted in `sessionStorage`.
Reads IndexedDB via the existing `openGraphStoreForDebug()` helper.

Priority-order execution:

1. **Extracted shared helpers.** Moved the domain-color palette + FNV-1a
   hash + `hostnameOf` out of `src/options/debug/tabTreeLayout.ts` into
   `src/options/dashboard/domainColor.ts`. Tab-tree tests still green
   after the move.
2. **Added new query primitives** (`recentSessions`, `visitsInSession`,
   `pagesMatching`, `pagesAndTransitionsBetween`) to `queries.ts` with
   verbose unit tests against the existing fixture. All 17 new test
   cases pass. Zero touch to `store.ts` or `types.ts` per the scope
   guardrail.
3. **Built views in priority order.** Session Browser (view 1) → Timeline
   (view 2) → Node Graph (view 3) → Page Search (view 4). Each view got
   its own commit.

The timeline's axis math (linear `t -> x`, tick-step ladder, tab -> lane
assignment) lives in a DOM-free `timelineLayout.ts` with 14 pure-function
unit tests. The React component is a thin renderer.

## Completed

- **View 1 — Session Browser (solid)**: relative time (absolute hover
  tooltip), duration, distinct-page count, visit count, tag chips, first
  three page titles as subtitle. Row click → Timeline scoped to that
  session. Inline toggle reveals the existing `SessionTabTreeView`.
- **View 2 — Timeline (solid)**: linear time axis, visits as domain-
  colored bars, y-lane = owning tab. Two modes: scoped (session or page)
  and global (last 60 min). Drag to pan, wheel to zoom (time axis only),
  "Now" button snaps window to current. Hover tooltip, click opens URL.
- **View 3 — Node Graph (solid, temporally anchored)**: Pages as
  circles, X = `first_seen` on the time axis, Y = bucketed domain lane,
  radius = `sqrt(visit_count / max)`. Directed transitions from
  `pagesAndTransitionsBetween` — `navigated_from` solid, `opened_from`
  dashed. Range selector (1h / 6h / 24h / 7d / 30d). Not a force
  layout: temporal anchoring is a design commitment, per the brief.
- **View 4 — Page Search (solid)**: debounced case-insensitive substring
  match via `pagesMatching`. Domain badge, title, URL, visit count, and
  first/last seen. Click → Timeline scoped to that Page.
- Webpack entry `options/dashboard` wired in with an HtmlWebpackPlugin.
  `npm run build:chrome` succeeds; `build/chrome/options/dashboard.html`
  is emitted alongside the existing `debug.html`.

## Working On

Nothing — all four views landed.

## Blocked

None.

## Notes / Surprises

- **`recentSessions` index deviation**: the brief said "Uses the Session
  `(type, at_time)` index to walk backward from now." Session nodes
  don't carry `at_time` (they use `started_at`), so they never appear in
  the `(type, at_time)` index. Used `nodesOfType('Session')` + in-memory
  sort by `started_at desc`. At personal scale this is fine and the
  existing `nodesOfType` semantics comment says the same. Documented in
  the primitive's JSDoc.
- **Time-axis math without a chart lib**: five-line linear scale,
  `timeToX(t) = pad + (t - tFrom) / range * usableWidth`, plus a
  tick-step ladder (1s, 5s, 10s, 30s, 1m, …, 7d) picked so the visible
  range yields <= desired ticks. Both `timeToX` and its inverse `xToTime`
  are returned from the layout function so pan/zoom can convert cursor
  coordinates back to time.
- **`pagesAndTransitionsBetween` shape decision**: reduces Visit-level
  edges to Page-level edges with a `count`. A Page visited 500 times
  rendering as 500 nodes would bury structure; this collapses to one
  node with fat edges instead. The dashboard's Node Graph view relies
  on this — writing it directly in the view file would have duplicated
  traversal code that already lives in `visitsOnScreenBetween`.
- **`tabTreeLayout.ts` re-exports** the domain-color symbols so its
  existing callers (and the tab-tree unit tests) keep working after the
  extraction. Tab-tree tests remain 12/12 green.
- **Full test suite state**: 15 pre-existing test suites failed (crypto,
  session/storage, session/tracking, adapters, PrivacyFilter, etc.).
  Verified none of them import from files I touched — the failures were
  already there on the tip I pulled from. Graph + dashboard suites are
  6/6 green, 157/157 individual cases.
- **`window` variable name in TimelineView**: initial pass named the
  visible-time-range state `window`, which shadows the DOM global; fixed
  to `viewWindow` so `globalThis.open()` (for click-to-open-URL) resolves
  reliably.

## Files

Created:
- `src/options/dashboard/index.html` (12 lines)
- `src/options/dashboard/index.tsx` (12 lines)
- `src/options/dashboard/DashboardShell.tsx` (~150 lines)
- `src/options/dashboard/SessionBrowser.tsx` (~200 lines)
- `src/options/dashboard/TimelineView.tsx` (~330 lines)
- `src/options/dashboard/NodeGraphView.tsx` (~330 lines)
- `src/options/dashboard/PageSearch.tsx` (~150 lines)
- `src/options/dashboard/domainColor.ts` (~50 lines)
- `src/options/dashboard/timelineLayout.ts` (~200 lines)
- `src/options/dashboard/__tests__/timelineLayout.test.ts` (~230 lines)

Modified:
- `webpack.config.js` — added `options/dashboard` entry + HtmlWebpackPlugin.
- `src/database/graph/queries.ts` — added `recentSessions`,
  `visitsInSession`, `pagesMatching`, `pagesAndTransitionsBetween`.
- `src/database/graph/__tests__/queries.test.ts` — 17 new test cases
  across the four new primitives.
- `src/options/debug/tabTreeLayout.ts` — palette + hostname helper moved
  to `dashboard/domainColor.ts`, re-exported for callers.

## New query primitives — signatures

```
recentSessions(g: GraphStore, limit: number): Promise<RecentSessionRow[]>
visitsInSession(g: GraphStore, sessionId: string): Promise<VisitInSessionRow[]>
pagesMatching(g: GraphStore, query: string): Promise<PageNode[]>
pagesAndTransitionsBetween(g: GraphStore, tFrom: number, tTo: number): Promise<PagesAndTransitionsResult>
```

## Commits

- `0da0722` feat(graph): add dashboard query primitives and share domain palette
- `71d8dda` feat(dashboard): add graph-viewer shell with Session Browser view
- `21e96d4` feat(dashboard): add Timeline view with pure layout engine and tests
- `65a82ca` feat(dashboard): add Node Graph view — temporally-anchored page graph
- `9662672` feat(dashboard): add Page Search view
