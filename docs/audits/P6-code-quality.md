# P6 Code-Quality Review — Phase 6 (Projections, API & Observability)

**Branch:** `track/demo` · **Surface:** accumulated `apps/api` P6.1–P6.11 diff  
**Scope:** `apps/api/src/{projections,routes,sse,runtime}` · `packages/observability/src` · their tests  
**Policy trigger:** `phase-boundary` (root `CLAUDE.md` "Reviewer subagents — Step-8 policy")  
**Date:** 2026-06-21  

Suite status going in: 84 unit / 55 integration / 16 observability — all green.

---

## Summary

Phase 6 lands a disciplined read-side stack.  The fold mechanics, watermark handling, rule-#7 structural pins, and observability scrub are sound.  The review surfaces **no load-bearing correctness bugs** in the happy path.  Six findings follow, two medium and four low; none is a safety-rule violation.

**Verdict: CLEAR** — phase can close.  The two [medium] findings are correctness edge cases that don't affect any green integration test today but should be addressed before the route surface is promoted to a stable API (P7.14 or integration handoff).

---

## Findings

### [med] `apps/api/src/routes/run-stream.ts:30` — Empty-string `Last-Event-ID` parsed as cursor=0, silently skipping sequence 0

**Finding.** `parseCursor` runs `Number('')` when the header is an empty string (a valid client-reset sentinel per the SSE spec). `Number('') === 0`, `Number.isInteger(0) === true`, `0 >= 0` → the function returns `0`, which the bridge treats as "resume from sequence 0" (i.e., yield only `sequence > 0`). A client that connects for the first time, or that clears its last-event-id to request a full replay, will never receive the event at `sequence 0`.

**Why it matters.** The SSE specification (WHATWG) says: _"If the last event ID string is the empty string, then there is no last event ID."_ Most browser EventSource implementations send an empty string on the initial connection (before any `id:` frame is received), and on reconnect after a `id:` of `""` was broadcast. A `run.configured` event almost always lands at `sequence 0`; a client that missed it during reconnect cannot reconstruct the full state.

**Edge case not covered by tests.** The integration test `test_resume_from_last_event_id_no_gap_no_dup` exercises `lastEventId=5` (non-zero) and the absent-header path (returns -1 → all sequences), but not the empty-string-header path.

**Recommended fix (small).** Add an empty-string guard before the `Number()` call:
```
if (raw === '') return -1;   // empty string = no cursor; deliver from sequence 0
```
**Severity:** medium · **Action:** fix-in-slice

---

### [med] `apps/api/src/projections/lineage-graph.ts:104–127` — Structural and reproduction edges share the same id format; a same-pair overlap produces a duplicate edge id

**Finding.** `linkStructural` generates an edge id `${source}->${target}` and pushes it unconditionally. The reproduction lineage edges (from `state.lineageEdges`) are also keyed `${parentAgenomeId}->${childAgenomeId}` (set in `lineage-reducer.ts:30`). Both sets are pushed to the same `edges` array without deduplication.

A concrete collision scenario: agenome A spawns agenome B as its direct offspring. `linkStructural` produces a `'generated'` edge `A->B`. If A also appears as a reproduction parent of B in `ReproductionEvent`, the reducer stores a lineage edge with id `A->B` and a different `type` (e.g. `'fusion'`). Both are pushed to `edges[]`, producing two edges with identical `id` values in the `LineageGraphProjection`. React Flow breaks on duplicate edge ids.

**Why it can happen.** The `agenome.reproduced` lifecycle event (which drives `lineageReducer`) is distinct from `agenome.spawned` (which drives `lifecycleReducer`). A child produced via reproduction _and_ referencing its spawning parent will have both edges.

**Test gap.** `test_node_ids_unique` verifies node ids; there is no corresponding `test_edge_ids_unique` test. The current fixture (`fullRunEvents`) uses `agn_1` as both the spawner and the `parentAgenomeId` in `validReproductionEvent` (child `agn_3`), but the structural `generated` edge goes `agn_1->cand_1` (not `agn_1->agn_3`), so the collision doesn't fire in the existing tests.

**Recommended fix.** Either: (a) assert edge-id uniqueness and deduplicate before returning (last-write-wins for the reproduction edge, since it's authoritative), or (b) add a prefix to structural edge ids (`struct:${source}->${target}`) to guarantee no-collision with lineage edge ids.

**Severity:** medium · **Action:** fix-in-slice

---

### [low] `apps/api/src/projections/run-health.ts:19–30` — `CapsConsumed` silently omits two of six `RunCaps` fields without documentation

**Finding.** `RunCaps` defines six caps (`maxPopulation / maxGenerations / energyBudget / maxSpawnDepth / maxToolCalls / wallClockTimeoutMs`). `CapsConsumed` exposes only four (`generations / population / energy / toolCalls`). The two omissions (`maxSpawnDepth`, `wallClockTimeoutMs`) are reasonable (depth is not easily countable per-event; wall-clock requires a real clock not available in a pure fold), but neither the interface JSDoc nor the implementation comment explains why. A consumer wondering "why can't I see depth or wall-clock?" has no in-code answer.

**Recommended fix.** Add a JSDoc note on `CapsConsumed`:
```
/** Subset of the six RunCaps — depth (not event-countable) and wallClockTimeoutMs
 *  (requires a live clock) are omitted; the kernel enforces them independently. */
```
**Severity:** low · **Action:** fix-in-slice (doc only)

---

### [low] `apps/api/src/routes/run-stream.ts:54–58` — `connection: keep-alive` header in `writeHead` is invalid under HTTP/2

**Finding.** The SSE `writeHead` call includes `'connection': 'keep-alive'`. Per RFC 9113 §8.2.2, the `Connection` header is forbidden in HTTP/2; a conformant HTTP/2 intermediary will strip or reject it. Under HTTP/1.1 this header is harmless (the default). The actual SSE connection semantics (`Transfer-Encoding: chunked` + persistent) work without this header in both HTTP versions.

**Impact.** Low: the demo API is served over HTTP/1.1 today (no TLS, no h2 upgrade); the header is redundant-but-harmless there. Under future HTTPS/h2 the header is quietly stripped by intermediaries, so functional behaviour is unchanged. The risk is a surprise if the team later adds h2 and wonders why the header vanishes.

**Recommended fix.** Remove `'connection': 'keep-alive'` from the `writeHead` object.

**Severity:** low · **Action:** defer (no production h2 today; revisit at TLS integration)

---

### [low] `apps/api/src/projections/lineage-export.ts:40–44` — `LineageExport` drops `runId`; a multi-run export batch is unidentifiable

**Finding.** `LineageGraphProjection` carries `runId`; `LineageExport` (the Neo4j spike output) carries `sequenceThrough` but NOT `runId`. A notebook that exports multiple runs into Neo4j must inject the `runId` from context, or every node batch is ambiguous.

This is a spike artifact (P6.11 explicitly labels this a throwaway spike notebook path), and the module doc says "the demo path works with the notebook absent." However, omitting `runId` is a silent footgun for anyone who tries to use the export in a multi-run context.

**Recommended fix.** Add `runId: string` to `LineageExport` and carry it through from the projection:
```
return { runId: projection.runId, nodes, edges, sequenceThrough: projection.sequenceThrough };
```
**Severity:** low · **Action:** fix-in-slice (one-line addition; cheap to do now before the spike notebook hardens)

---

### [low] `apps/api/src/routes/runs.ts:25` — `'cancelled'` in `TERMINAL_RUN_STATUSES` is unreachable dead code (no producing event)

**Finding.** `TERMINAL_RUN_STATUSES` includes `'cancelled'`. The lifecycle reducer (`reducers/lifecycle.ts` `RUN_TRANSITIONS`) maps zero events to `'cancelled'` — no `run.cancelled` event exists in the closed 36-member `RunEventType` registry, and the kernel driver (P3) is absent on the demo fork. So `state.runs[runId]?.status === 'cancelled'` can never be `true` in the current codebase.

This is forward-compatible (a future kernel may emit `run.cancelled` before P3 ships), so the dead-code entry is harmless. It is worth flagging so a reader doesn't wonder why the reachability audit would flag it.

**No recommended fix** — the forward-compatible comment in the constant would suffice:
```
'cancelled', // forward-compatible: no producing event yet (P3 kernel carry-forward)
```
**Severity:** low · **Action:** defer (forward-compatible placeholder; document in constant comment)

---

## Axes with no findings

- **Fold purity / watermark:** `buildProjection` is correctly pure; `sequenceThrough` is set to `prevSequence` (the last-folded event's sequence) in all paths; `isStale` comparison is correct (`>`, not `>=`).
- **Reducer injection:** All concrete projections inject into `buildProjection`; none hand-rolls a fold.
- **Rule #7 (replay calls no providers):** Structural import-ban tests cover `projections/`, `replay-summary.ts`, `replay-reader.ts`, `kernel-logger.ts`, `heartbeat.ts`. No provider import found.
- **Rule #2 (append-only):** SSE bridge uses `Pick<EventStore,'readByRun'>` narrowing; heartbeat and kernel-logger have no event-store import; lineage-export has no drizzle import. All pinned by structural tests.
- **Run-health count-based math:** `Math.max(0, count(start) - count(completion))` correctly clamps negative values; cap clamping via `Math.min(consumed, ceiling)` is correct; `tool_call.finished` is correctly used for `toolCalls.consumed` (rule-#8 alignment: successful spend only).
- **SSE cursor logic:** `sequence > cursor` (strict greater-than) is correct for gap/dup-free resume; `fromSequence = -1` for absent header means `sequence > -1` = all sequences.
- **Heartbeat throttle:** `at - lastEmitAt >= intervalMs` correctly uses `>=` for "at least intervalMs"; `isWorkerAlive` uses `<=` which treats the exact boundary as alive (reasonable; consistent with "within staleAfterMs").
- **Observability scrub:** `enforcePayloadCeiling` before `scrubObservabilityPayload` (depth-before-size ordering per LESSONS §28); boundary-local env-value layer composed correctly over frozen `scrubSecrets`; `MIN_SECRET_LENGTH = 8` guard and `!REDACTION_PLACEHOLDER.includes(secret)` filter are correct.
- **Readability / naming:** All modules have clear JSDoc headers citing architecture sections; magic constants are named exports (`DEFAULT_SSE_INTERVAL_MS`, `MIN_SECRET_LENGTH`); internal helpers are clearly named.
- **Dead code:** No commented-out blocks or unused exports found beyond the `'cancelled'` finding above.
- **Test quality:** All tests lead with a positive guard (LESSONS §10 compliance); structural import-ban tests use `readFileSync` on the source so they can't false-pass if the export changes; `toThrow(ProjectionError)` is paired with a reason check (`reason === 'sequence_gap'` etc.) so they can't pass vacuously.

---

## Cross-reference: LESSONS §27–§37 compliance

| Lesson | Rule | Verdict |
|---|---|---|
| §27 — projection = pure ordered fold + watermark | `buildProjection` asserts monotonic ordering, rejects empty/mixed-run/schema-gap, returns `sequenceThrough = prevSequence` | PASS |
| §28 — second persistence boundary mirrors first exactly | `scrubObservabilityPayload`: ceiling-then-scrub ordering preserved; env-value layer with de-collision | PASS |
| §29 — concrete projection = reducer injected into fold | `buildCurrentState` injects reducer array; no hand-rolled fold | PASS |
| §30 — secondary projection = pure transform; dangling edge guard | `buildLineageGraph`: pure transform, no re-fold, dangling endpoint guard present | PASS (modulo medium finding #2) |
| §31 — replay path structurally pinned | `Pick<EventStore,'readByRun'>` narrowing + import-ban + Math.random/fetch call-shape test | PASS |
| §32 — REST write path: sanitizing boundary + ingestion gates | `setErrorHandler` sanitizes 5xx; `bodyLimit`; `validateRunConfig` fail-fast; cap-override gate | PASS |
| §33 — REST read surface: rebuild-on-read + clean 404 | All read routes do `readByRun → build*`; empty events → 404; no append on read path | PASS |
| §34 — run-health = count-based ops-in-flight; clamped caps | `Math.max(0, ...)` clamping; `Math.min(consumed, ceiling)` cap reporting | PASS |
| §35 — SSE bridge polling `readByRun`; id=sequence resume | `sequence > cursor` filter; `Last-Event-ID` + `?lastEventId` fallback; `reply.hijack()` + `AbortController` | PASS (modulo medium finding #1 for empty-string header) |
| §36 — kernel-logger: injected clock/sink; heartbeat throttle | `createKernelLogger` with injected sink + boundary; `createHeartbeat` with injected `now()`; structural no-append tests | PASS |
| §37 — `format:check` in per-slice gate | P6.9/P6.10 drift caught at P6.11 boundary per session notes; a standalone `style:` commit (`ec99178`) fixed accumulated drift | PASS (lesson learned; durable fix deferred to scaffold) |
