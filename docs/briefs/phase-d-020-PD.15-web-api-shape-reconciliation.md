# /tdd brief — reconcile_web_api_response_shapes_both_sides_fix_sse_drop

## Feature
PD.15 — reconcile the web data-client ↔ real-API response-shape drift that PD.14's real smoke surfaced (the demo UI's run-list, raw-events, replay, and **live SSE** break against the real API; the headline lineage+winner already renders). **User-decided (2026-06-23, via lead): fix = BOTH SIDES (option C), RECONCILE-THEN-MERGE** (this slice gates the phase-d→cody merge — the merge bar is now "demo UI FULLY works: headline + LIVE view"). **WEB** consumes the API's REST wrapper shapes; **API** omits null optionals on the wire (fixes the SSE drop at its SOURCE) + standardizes the `?since=` param. **ZERO frozen-contract change** — do NOT add `.nullable()` to `RunEventEnvelope`; fix the nulls api-side via omission. Cross-area (api + web hats).

## Use case + traceability
- **Task ID:** PD.15 (the web↔API response-shape reconciliation; gates the lead cody-merge)
- **Architecture sections it implements:** `ARCHITECTURE.md §11` (REST API + SSE — the read routes + stream the web consumes), `§12` (the dashboard — read-only over projections + SSE; resync from lastEventId), `§4` (`RunEventEnvelope` — its `.optional()` fields + the wire serialization), `§9` (projections derived/rebuildable; the log is untouched), `§17` (local-first demo — the live + replay flow).
- **Origin FINDING (category 2, material; PD.14 Step-7.5, lead→user 2026-06-23):** the web data-client and the API routes were unit-tested against DIFFERENT assumed response shapes; the mocked e2e hid it; PD.14's real smoke (`fb27d73`) exposed it. Drift table:
  | runClient | web expects | real API returns | option-C fix |
  |---|---|---|---|
  | `listRuns` | `Run[]` | `{runs:[{runId,status,sequenceThrough}]}` | WEB consumes `{runs:[summary]}` (the REST list wrapper is fine) |
  | `getRun` | `Run` | `{runId,sequenceThrough,state}` | WEB consumes the current-state projection shape |
  | `getEvents` | `RunEventEnvelope[]` | `{runId,events:[…]}` + **null** optionals + route reads `?since=` (web sends `?sinceSequence=`) | WEB consumes `{runId,events}` + sends `?since=`; **API omits null optionals** so envelopes re-parse |
  | `getReplay` | `RunEventEnvelope[]` | `buildReplaySummary()` object | WEB consumes the replay-summary shape (or API exposes events — Step-2.5 Q2) |
  | SSE (live) | per-frame `RunEventEnvelope.parse` | null-bearing envelope frames → **parse throws → every live event silently DROPPED** | **API omits null optionals in the frame serializer** → frames parse → events flow (the demo-critical fix) |
  | `getLineage` / `getCandidate` | frozen projections | MATCH ✓ (built in-memory) | no change |
- **Related:** known latent risk (Carry-forward "demo post-integration follow-ups (d)"), now concrete. PD.14's `web-api-smoke.test.ts` is the harness this slice EXTENDS.

## Acceptance criteria (what "done" means)
- [ ] **API omits null/undefined optionals on the wire** via ONE shared serializer (LESSON §5 single-source) used by BOTH `GET /runs/:id/events` AND the SSE stream frame serialization (+ any other route serializing a `RunEventEnvelope`): a `RunEventRow` whose optional fields are DB-`null` serializes to JSON with those keys ABSENT (not `null`), so the frozen `RunEventEnvelope` (`.optional()`, NOT `.nullable()`) parses cleanly on the consumer.
- [ ] **The serializer is READ-path/presentation only** — it does NOT alter the persisted log (rule #2: the event store + its rows are untouched; serialization is derived/rebuildable) and runs downstream of the persistence redaction scrub (rule #4: no secret re-exposure; the scrub already ran at append).
- [ ] **LIVE SSE flows end-to-end (the demo-critical assertion):** real null-bearing events now stream web←API through the proxy WITHOUT being dropped — a **failing-then-green** test (RED: the pre-fix per-frame parse drops null-bearing frames; GREEN: post-fix they flow). This is the headline of the slice.
- [ ] **WEB data-client consumes the API's real shapes:** `listRuns` → `{runs:[summary]}`; `getRun` → `{runId,sequenceThrough,state}`; `getEvents` → `{runId,events}` and sends `?since=`; `getReplay` → the replay-summary shape (per Step-2.5 Q2). No web call PayloadValidationErrors against the real API.
- [ ] **`?since=` standardized** — the canonical events cursor param is `?since=` (the route's existing convention); the web client sends `?since=` (drops `?sinceSequence=`). Resume/resync (LESSON §1/§2: SSE non-authoritative, resync by `lastEventId`/sequence) still reaches an equivalent view.
- [ ] **ZERO frozen-contract change** — `RunEventEnvelope` (and every Appendix-A model) is untouched; explicitly NO `.nullable()` added. Web-local response-wrapper types (RunSummary, the getRun/getReplay shapes) are web data-client types, not Appendix-A models.
- [ ] **PD.14 smoke EXTENDED, not replaced** — `web-api-smoke.test.ts` now also verifies the reconciled REST endpoints (listRuns/getRun/getEvents/getReplay consumed without error) AND the live-SSE flow above. The mocked Playwright e2e stays.
- [ ] `/preflight` clean BOTH areas (api + web); the extended smoke runnable + green (Docker up) this slice.
- [ ] security-reviewer (invariant) at Step 8 — the serialization change is rule-#2/#4-adjacent (read-path, downstream of scrub).

## Wiring / entry point (Step 7.5)
The shared omit-null serializer is reached from the API read routes (`routes/runs-read.ts` `GET /runs/:id/events`) + the SSE stream (`routes/run-stream.ts` frame serialization) — production entry points the dashboard already calls through the PD.14 proxy. The web data-client (`runClient`/`sseStream` in `apps/web/src/data/`) is the consumer; the dashboard's existing calls flow through it. Confirm the live SSE + the reconciled REST reach the real API end-to-end through the proxy (the extended smoke is the proof).

## Files expected to touch
**API (modified):**
- a NEW shared wire serializer (e.g. `apps/api/src/routes/_support/serializeEnvelope.ts`) — omits null/undefined optionals; used by:
- `apps/api/src/routes/runs-read.ts` — `GET /runs/:id/events` (omit-null + confirm `{runId,events}` wrapper + `?since=` cursor)
- `apps/api/src/routes/run-stream.ts` — the SSE `data:` frame serialization (omit-null)
**WEB (modified):**
- `apps/web/src/data/runClient.ts` (+ `contracts.ts`/types) — consume `{runs}`, `{runId,sequenceThrough,state}`, `{runId,events}`, replay-summary; send `?since=`
- `apps/web/src/data/sseStream.ts` — (no change expected once frames parse; confirm)
- `apps/web/test/smoke/web-api-smoke.test.ts` — EXTEND (reconciled REST + live-SSE-flows failing-then-green)
**New:** api unit/integration for the serializer; web unit for the reconciled client shapes.

**Orchestrator (NOT this slice):** DEMO_RUNBOOK note if the reconciliation changes any operator step (likely none — same commands).

## RED test outline (Step 2)
1. **`serialize_envelope_omits_null_optionals`** (api) — a `RunEventRow` with null optionals → JSON with those keys ABSENT → `RunEventEnvelope.parse` succeeds. RED: nulls currently serialized → parse fails. Why: §4 — the null-drop root cause.
2. **`events_route_and_sse_use_the_shared_omit_null_serializer`** (api integration) — both `GET /runs/:id/events` and the SSE frames emit null-free, re-parseable envelopes; `?since=` honored. Why: §11 single-source the fix.
3. **`runclient_consumes_real_api_wrapper_shapes`** (web) — listRuns/getRun/getEvents/getReplay parse the REAL shapes without PayloadValidationError; getEvents sends `?since=`. RED: currently expects Run[]/Run/envelope[]. Why: §11/§12 consumer matches producer.
4. **`live_sse_flows_null_bearing_events_web_from_api`** (smoke EXTENSION — the headline) — real null-bearing events stream web←API through the proxy without drop. **Failing-then-green**: assert the pre-fix drop, then the post-fix flow. Why: §11/§12/§17 — the demo live view.
5. **`reconciled_rest_endpoints_through_proxy`** (smoke EXTENSION) — listRuns/getRun/getEvents/getReplay return data the web consumes through the proxy. Why: §11/§12.

> The serializer fix must be at the API SOURCE (omit nulls), never `.nullable()` on the frozen contract. The web adapts to the API's wrapper shapes. BOTH sides verified by the one extended smoke.

## Cross-doc invariant impact
- **Model field changes:** NONE. ZERO frozen-contract change (serialization-omission + web-consumer adaptation; no new/changed Appendix-A model; explicitly no `.nullable()`).
- **Orchestrator doc rows (Step 9):** possibly an ARCH §11 note (the read routes/SSE omit null optionals on the wire so the frozen-contract consumer re-parses) — orch-authored. No cross-doc invariant.
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **Shared omit-null serializer:** confirm ONE helper for getEvents + SSE (+ any other envelope route), running downstream of the scrub (rule #4) and NOT mutating the persisted log (rule #2 — serialization only). My default: a pure `(row) => wire-shape` that drops null/undefined optional keys; deep enough to cover nested optional payload fields if any surface as null.
2. **getReplay shape (Q2):** does the web's replay view consume the `buildReplaySummary()` object as-is, or does it need raw events (→ the API exposes events for replay)? Default: web consumes the summary shape (it's what the API returns; least change). Flag what the replay view actually needs.
3. **Bundle vs split:** this is one logical reconciliation verified by ONE extended smoke (the smoke is green only when BOTH api + web land) → my default is ONE bundled commit (api serializer + web consumption + extended smoke). Not a safety-invariant-solo case (it's a read-path/presentation reconciliation). Confirm, or split api-first→web.
4. **Live-SSE failing-then-green:** confirm the RED captures the actual pre-fix silent drop (events dropped at `RunEventEnvelope.parse`) and the GREEN asserts they flow — the user called this the demo-critical assertion.

## Dependencies + sequencing
- **Depends on:** PD.14 (`fb27d73` — the Vite proxy + `web-api-smoke.test.ts` harness) · the existing API read routes + SSE (`runs-read.ts`/`run-stream.ts`) · the frozen `RunEventEnvelope` (consumed, untouched).
- **Blocks:** the phase-d→cody MERGE (user-gated: the merge waits on the demo's live view working).
- **Sequencing:** NOW (this round), same impl (carries both hats). After this lands → residual docs → `/orchestrate-end` seal → STOP for the lead cody-merge + user sign-off.

## Estimated commit count
**1–2.** (1) the bundled reconciliation (api omit-null serializer + web consumption + extended smoke); or (2) split api-serializer / web-consumption if cleaner. Cross-area but one logical fix. security-reviewer (invariant) at Step 8 (rule-#2/#4-adjacent serialization on the read path).

## Lessons-logged candidates anticipated
- **Convention candidate** — "an API serializes DB-`null` optionals as JSON `null`, which the frozen Zod (`.optional()`, not `.nullable()`) rejects on the consumer → fix at the SOURCE with a shared wire serializer that OMITS null/undefined optionals (downstream of the scrub, log untouched), never by loosening the frozen contract to `.nullable()`."
- **Architecture-doc note** — §11: the read routes + SSE omit null optionals on the wire so the frozen-contract consumer re-parses; the web data-client consumes the API's REST wrapper shapes ({runs}, {runId,events}, current-state, replay-summary).

## How to invoke
1. Read this brief + the Finding's cited files (`runs-read.ts`, `run-stream.ts`, `apps/web/src/data/{runClient,sseStream}.ts`, the PD.14 `web-api-smoke.test.ts`).
2. Run `/tdd reconcile_web_api_response_shapes` (api + web hats; read both `CLAUDE.md`s).
3. Step 0 (Restate) — confirm: omit-null api serializer (shared, source-fix) + web consumes real shapes + `?since=` + the live-SSE failing-then-green smoke extension; ZERO frozen-contract change.
4. Step 2.5 — Q1–Q4 (esp. the serializer single-source + the live-SSE RED shape).
5. Step 9 — flag any ARCH §11 note (orch) + the bundle/split choice + that the smoke is extended (not replaced).
