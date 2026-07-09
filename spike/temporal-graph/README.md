# Temporal Graph Spike

Throwaway spike to validate the Visit-centric temporal graph model for TabKiller
before committing to it in a PRD.

**Not shipped.** Not in `src/`. Node-only, no browser APIs, no persistence.
Runs against an in-memory store. If a query gets ugly, the schema is wrong.

## Files

- `types.ts` — node and edge types, with the two-time-axis discipline
- `store.ts` — minimal in-memory node+edge store with both-direction indexes
- `fixtures.ts` — one fabricated day of browsing (multiple sessions, tab tree,
  retroactive tag, search-arrival, focus intervals)
- `queries.ts` — target queries as plain functions
- `run.ts` — runs each query, prints results

## Target queries (design pressure)

1. **Point traversal** — pages I opened from a given domain in a time window
2. **Interval query** — what was I looking at *at* time T (focus intervals)
3. **Retroactive edit** — tag yesterday's session now, list visits in it
   that occurred before the tag was applied (event-time vs. recorded-at)
4. **Time adjacency** — for a given visit, what did I look at in the 60s before
5. **Structural + temporal** — reconstruct the tab tree for a tagged session

## Run

```
cd spike/temporal-graph
npm install
npm start
```
