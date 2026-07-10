---
issue: 50
title: URL normalization
analyzed: 2026-07-10T01:20:00Z
streams: 1
---

# Issue #50 Analysis: URL normalization

## Scope

Pure function that canonicalizes a URL to define `Page` identity in the
graph model. Isolated, testable, no side effects. The rule set is in
task 50.md.

## Stream Decomposition

**One stream.** The function and its tests are intimately coupled;
splitting them across two agents would add coordination cost with zero
wall-clock benefit. TDD-style development inside a single agent
produces a coherent, test-driven module faster than parallel streams.

### Stream A — URL normalization implementation + tests

Files:
- `src/utils/url.ts` (new)
- `src/utils/__tests__/url.test.ts` (new)

Approach:
1. Read `.claude/epics/temporal-browsing-graph/50.md` for the full
   acceptance criteria (rule list, allowlist, edge cases).
2. Scan `src/utils/` for existing url-handling helpers to avoid
   duplication (any existing normalization or param-stripping should be
   consolidated into this module, not lived alongside it).
3. Author `normalizeUrl(raw: string): string` and the per-domain
   fragment allowlist setter.
4. Author ≥20 unit-test cases covering: every tracking param in the
   allowlist; unknown params preserved; query-param sort; fragment
   strip; per-domain fragment kept; trailing slash rules; case folding;
   IDN hosts (punycode); malformed input returned unchanged with a
   logger warning.
5. Run `npm run test -- url.test` and `npm run type-check` before
   declaring done.
6. Commit as work progresses (small, focused commits). Message format:
   `Issue #50: <specific change>`.

Agent type: `general-purpose`

## Dependencies

None (parallel: true; no deps).

## Conflicts

None. This task creates new files under `src/utils/`; no other ready or
in-flight task touches `src/utils/url.ts`.

## Success Criteria

- Function passes all tests in `url.test.ts`.
- No new runtime deps.
- `npm run type-check` clean.
- All acceptance criteria in 50.md ticked.

## Progress

See `updates/50/stream-a.md`.
