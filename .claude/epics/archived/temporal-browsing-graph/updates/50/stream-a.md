---
issue: 50
stream: A
started: 2026-07-10T01:24:25Z
status: complete
---

## Approach

Built `src/utils/url.ts` with a pure `normalizeUrl` function per issue #50 spec. Key design calls:

- Use the `URL` constructor for parsing; catch `TypeError` for malformed inputs, return raw and log via `console.warn`.
- Tracking-param allowlist is a module-scoped `ReadonlySet<string>` — single source of truth, extension point documented in the file header comment.
- Per-domain fragment allowlist is a `Map<string, boolean>` (per spec), with `setFragmentAllowlist(map)` (replace) and `getFragmentAllowlist()` (defensive-copy read) for future settings integration.
- Query sorting via `URLSearchParams.sort()` — spec-guaranteed stable for repeat keys, which is what we want for stable Page identity.
- Percent-encoding lowercased via a single regex pass on the serialized URL.
- Scheme/host case folding is inherent to the `URL` constructor; IDN → punycode is also inherent.

## Prior art found

`src/session/utils/dataUtils.ts:80` has an existing `normalizeUrl(url)` that partially overlaps (only 11 tracking params, no fragment allowlist, no case folding of scheme/host explicitly documented, no path trailing slash, no percent-encoding normalization). It has **zero direct callers** (only self-export via `src/session/storage/index.ts`'s `export *`).

Decision: leave that duplicate alone for now. Task instructions explicitly say deletion is issue #54's job, and touching the barrel export could ripple. Flagged for #54.

## Completed
- Committed implementation and tests (see commit hashes in final report)
- Type-check clean for both new files
- 52 tests pass (spec required ≥20)
- Scanned codebase for URL/tracking-param helpers; documented prior art in `dataUtils.ts`

## Working On
Nothing — task complete.

## Blocked
None.

## Notes / Surprises

- **Existing `normalizeUrl` in `src/session/utils/dataUtils.ts` has no callers** — issue #54 (cleanup) should remove it and its re-export in `src/session/storage/index.ts`.
- **No project-wide logger module exists.** Codebase pattern for warnings is `console.warn(message, contextObject)` (see `src/background/service-worker.ts`). Matched that.
- **Test harness has a pre-existing jsdom-26 incompatibility in `tests/setup.ts:261`** (`delete window.location` throws because jsdom 26 marks it non-configurable). Blocks the normal `npm test` invocation for any test that loads global setup. I sidestepped it for this task by running the URL test suite with a targeted node-environment jest config (no dependency on jsdom or the broken setup). Flagging for the epic lead — this will bite subsequent tasks and should be fixed before #52 (ingest pipeline).
- Pre-existing TS error in `src/ui/timeline/visualization/components/SessionGroup.tsx:238` (unrelated) — introduced in `cf72c61 Issue #43`. My files type-check clean in isolation.
- Pre-existing eslint config error (`@typescript-eslint/recommended` cannot be found). `npm run lint` errors out project-wide. Not addressed here.
- `URL` constructor handles IDN normalization to punycode automatically and lowercases scheme/host on parse — no manual work needed for those two rules.
- Task spec asks for lowercase percent-hex, which is against RFC 3986's preference for uppercase but is a valid canonical form. Following the spec.
