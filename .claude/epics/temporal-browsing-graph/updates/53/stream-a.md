---
issue: 53
stream: A
started: 2026-07-10T10:59:52Z
status: complete
---

## Approach

Port `spike/temporal-graph/{queries,fixtures}.ts` into `src/database/graph/`
backed by the real `GraphStore`. Six primitives, one test per primitive, plus
a debug panel behind a flag on the options page.

Design calls:

- Signatures switch from the spike's sync Map scans to `Promise<...>` because
  IDB reads are async in production.
- Q4 splits per the PRD: `causalPredecessors(visitId, windowMs)` (the graph
  walk, renamed from `visitsBefore`) plus `visitsOnScreenBetween(tFrom, tTo)`
  (the new temporal-window primitive).
- `visitsOnScreenBetween` uses two cursor walks on the Visit `(type, at_time)`
  index: (1) a forward walk on `at_time >= tFrom` for visits that started
  inside the window, (2) a backward walk on `at_time < tFrom` collecting any
  visit whose `[at_time, ended_at ?? tTo]` still overlaps the window. That
  answers the Q4 finding: a visit whose `at_time` is BEFORE the window can
  still be on-screen during it. Stop the backward walk on the first visit
  whose `ended_at` is set and precedes `tFrom` (its interval cannot overlap,
  and every visit further back started even earlier).
- Fixture ports the spike verbatim as `{nodes, edges}` and adds a `seedGraph`
  helper that writes them all via a single `writeBatch`.
- Debug flag: `localStorage.getItem('TABKILLER_DEBUG') === '1'`. Simple, works
  from the DevTools console, no build changes.

## Completed
- Ported fixture from `spike/temporal-graph/fixtures.ts` to
  `src/database/graph/__tests__/fixture.ts` with an added `seedGraph`
  helper that writes nodes + edges via one atomic `writeBatch`.
- Ported all six query primitives to `src/database/graph/queries.ts`.
  Every one is async and drives the compound indexes the schema declares.
  `visitsBefore` was renamed to `causalPredecessors` and given cycle
  protection (a `seen` set) so a malformed chain cannot loop forever.
  `visitsOnScreenBetween` is new and covers the Q4-split temporal-window
  case.
- Added one new method to `GraphStore`: `visitsInAtTimeRange(lower, upper,
  direction)` — cursor-based, uses the existing `(type, at_time)` compound
  index, returns Visit nodes ascending or descending. Flagged here per the
  parent's rule: `nodesOfType('Visit')` does a `getAll()` on the entire
  node store; the query API requires an indexed accessor.
- Wrote `src/database/graph/__tests__/queries.test.ts` with 23 tests:
  every primitive is covered, every acceptance-criteria bullet from #53
  has a matching test, and the `visitsOnScreenBetween` at_time-before-window
  case gets its own explicit assertion. All 23 pass.
- Narrowed `jest.config.js` testMatch: previously `**/__tests__/**/*.+(ts|tsx|js)`
  matched every file inside `__tests__`, which counted the new fixture as
  an empty test suite. The convention already followed by the whole repo
  is `*.test.*` / `*.spec.*`, so the pattern is tightened to require
  those suffixes even inside `__tests__`.
- Built the debug panel (`src/options/debug/GraphQueryPanel.tsx`), the
  helper (`src/options/debug/index.ts`), and wired both into
  `src/ui/options/components/OptionsApp.tsx`. The panel opens its own
  read-only IDB connection to the shared TabKiller database.
- `npx tsc --noEmit` on my files is clean. Only the pre-existing
  `src/ui/timeline/visualization/components/SessionGroup.tsx:238` error
  remains (unchanged, called out in #49's report).

## Working On
Nothing — task complete.

## Blocked
None.

## Test results
- Graph module (in isolation): 94 tests pass across 4 files —
  `queries.test.ts` (23 new, all pass), `store.test.ts` (34),
  `ingest.test.ts` (23), `transformers.test.ts` (14).
- Full suite `npm test`: 404 passed, 150 failed, 554 total. Every failure
  is in the pre-existing mock-based SessionStorageEngine and DOM UI
  suites called out in #49's stream-a report ("150 non-graph fails after
  my changes"). Diff of tracked files vs. HEAD confirms I have not
  touched any of those areas.
- `npx tsc --noEmit`: only the pre-existing
  `src/ui/timeline/visualization/components/SessionGroup.tsx:238`
  error remains (also called out in #49's report). My files are clean.

## Notes / Surprises
- No remote access. `git pull` fails; branch tip is already at `e9b26d9`.
- `src/options/options.ts` and `options.html` appear to be a dead earlier
  design — webpack entry is `src/ui/options/index.tsx`. The debug panel
  goes under `src/options/debug/` per the task spec but is imported and
  rendered by the React `OptionsApp` component.
- Added-method rationale: `nodesOfType` in `GraphStore` currently uses
  `store.getAll()` and filters in memory; the task's rule "no full linear
  scans in the query path" would be violated by any query that consumed
  it. Adding one indexed helper via `openCursor` on the existing
  `(type, at_time)` compound index is the smallest fix.
- Cycle guard on `causalPredecessors` walk is not in the spike but was
  added defensively — a bug in ingest could produce a self-referencing
  `navigated_from` edge and the recursion would loop.
