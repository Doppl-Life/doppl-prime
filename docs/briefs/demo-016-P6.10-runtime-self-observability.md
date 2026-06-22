# /tdd brief — runtime_self_observability

## Feature
**Runtime self-observability** — two demo-owned primitives: (1) a **structured kernel-logger** that emits correlation-ID-tagged records (run / generation / agenome + the envelope `correlationId`) to an **injected sink (default console)**, and (2) a **worker-alive heartbeat** emitter driven by an **injected clock/interval** (no real timers) plus a pure **`isWorkerAlive` staleness predicate** so a stalled/crashed worker is detectable. Sinks are **console + an injected sink only** (no external metrics stack). Emission **never blocks or mutates the authoritative append path** (structural — imports nothing from the event-store writer), and any **EXTERNAL emit routes through the existing `createEmitBoundary` scrub** (rule #4 — REUSE the LESSONS §28 boundary, never reimplement). The **live-worker loop wiring + the `/health` surfacing DEFER to P3/integration** (the runtime kernel/worker doesn't exist on the demo fork yet — same build-ahead-of-runtime pattern as P6.1/P6.9).

## Use case + traceability
- **Task ID:** P6.10 (runtime self-observability — structured kernel logs + worker heartbeat)
- **Architecture sections it implements:** `ARCHITECTURE.md §13` (observability is a non-authoritative side channel; redaction before any external emit), `§11`/`§12` (worker-alive signal observable to the operator / health), `§4` (correlation IDs on the envelope: runId + generationId?/agenomeId? + correlationId), `§14` (rule #4 — secrets never leave the process; scrub before external emit).
- **Related context:** key safety rules #4 (redaction before external emit — REUSE `createEmitBoundary`/`scrubObservabilityPayload`, §28/LESSONS §28) + #2 (observability never writes the authoritative log — structural no-event-store-import). **Builds on P6.5** (`packages/observability` scrub + `createEmitBoundary`, §28) + **P6.8** (run-health is the eventual `/health` consumer of the heartbeat — wired at integration). Console is inside the process trust boundary (§32 precedent — `request.log.error` is OUTSIDE the rule-#4 event-log/Langfuse/UI boundary); only an EXTERNAL sink emit is scrubbed. Unit-only (injected clock + sinks; no real timers, no DB).

## Acceptance criteria (what "done" means)
- [ ] The **kernel-logger** emits structured records propagating the **correlation IDs** — `runId` (required) + `generationId?`/`agenomeId?` + `correlationId?` from the `RunEventEnvelope` (§4) — into every record
- [ ] A **worker-alive heartbeat** emits periodically while the worker runs, driven by an **injected clock/interval** (no real timers in tests); a pure **`isWorkerAlive(lastHeartbeatAt, now, staleAfterMs)`** predicate makes a **stale last-heartbeat detectable** as a not-alive signal (stalled/crashed worker visible)
- [ ] Observability sinks are **console + an injected sink only** (MVP); **no external metrics stack** is introduced (no Datadog/Prometheus/StatsD import)
- [ ] Emission **never blocks or mutates the authoritative append path** — the kernel-logger + heartbeat import nothing from the event-store writer / `run_events` (structural pin, rule #2); they emit **no `run_events`** (the closed 36-member registry has no log/heartbeat type — a heartbeat is a side signal, never an authoritative event)
- [ ] Any **EXTERNAL emit routes through `createEmitBoundary`** (scrub-before-emit, rule #4/§14) — REUSE the frozen LESSONS §28 boundary, never reimplement the scrub; console (local) is not the external boundary
- [ ] **Deferred wiring named (not built):** the live-worker loop that calls the logger/heartbeat AND the `/health` surfacing of last-heartbeat wire at **P3/integration** (the worker doesn't exist on the demo fork) — stated explicitly, exercised now against injected deps
- [ ] Unit tests pass (injected clock + sinks; no real timers, no DB); **both counts reported**; `/preflight` clean

## Wiring / entry point (Step 7.5)
**none — wiring lands at P3/integration.** P6.10 provides the `createKernelLogger` + heartbeat (`createHeartbeat` + `isWorkerAlive`) primitives + the `createEmitBoundary` composition for the external sink. The production entry points — the kernel's evolution loop emitting correlated logs + the in-process worker emitting heartbeats, and `GET /runs/:id/health` (P6.8) surfacing last-heartbeat — wire when the **P3 runtime kernel lands at integration**. So: *first consumer — the P3 worker loop (logs/heartbeat) + the P6.8 run-health endpoint (last-heartbeat read), both at integration; exercised now against an injected clock + sink + emit boundary.*

## Files expected to touch
**New:**
- `packages/observability/src/kernel-logger.ts` — `createKernelLogger({ correlationIds, sink?, boundary? })`: structured correlation-ID-tagged records to the injected sink (default console); an external emit goes through the injected `createEmitBoundary`
- `apps/api/src/runtime/heartbeat.ts` — `createHeartbeat({ now, intervalMs, emit })` (injected clock/interval, no real timers) + pure `isWorkerAlive(lastHeartbeatAt, now, staleAfterMs)` staleness predicate (flag placement at 2.5 — `runtime/` doesn't exist on the demo fork; the impl creates it; the live-worker wiring defers to P3)
- `packages/observability/test/kernel-logger.test.ts`
- `apps/api/test/unit/runtime/heartbeat.test.ts`

**Modified:**
- `packages/observability/src/index.ts` — export the kernel-logger

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
**(injected clock + sinks; `spec(§13)`/`spec(§4)`/`spec(§12)`):**
1. **`test_kernel_logger_propagates_correlation_ids`** — a record carries `runId` + `generationId`/`agenomeId` + `correlationId` from the envelope. *(Positive guard.)* Why: §4 correlation.
2. **`test_heartbeat_emits_on_injected_interval`** — the heartbeat emits per the injected clock/interval; an injected (no-op/fake) timer is used, never a real `setInterval`/`Date.now`. Why: §11/§12 worker-alive.
3. **`test_isWorkerAlive_detects_staleness`** — a fresh heartbeat → alive; `now − lastHeartbeatAt > staleAfterMs` → not-alive. Why: §12 stalled/crashed-worker detectable.
4. **`test_external_emit_routes_through_scrub`** — a logger EXTERNAL emit goes through `createEmitBoundary` (scrub-before-emit); an injected secret value is redacted in the emitted payload; the console (local) path is not the external boundary. Why: rule #4 / LESSONS §28.
5. **`test_no_append_path_import`** — structural: kernel-logger + heartbeat import nothing from the event-store writer / `run_events` (never mutate the authoritative log). Why: rule #2.
6. **`test_no_external_metrics_stack`** — structural/convention: sinks are console + injected only (no metrics-stack import). Why: §13 MVP (console + Postgres only).

## Cross-doc invariant impact
- **Model field changes:** none (consumes the frozen `RunEventEnvelope` §4 read-only + the LESSONS §28 boundary). **§2.5-seam:** none (no Appendix-A model touched; `packages/observability` is a thin adapter, not a contract).
- **Orchestrator doc rows (Step 9):** a likely LESSONS entry (structured correlation-ID logger + injected-clock heartbeat + staleness predicate; external emit via the reused §28 scrub; no-append-path-import; deferred-worker wiring). I author hot.

## Things to flag at Step 2.5
1. **`heartbeat.ts` placement — `runtime/` doesn't exist on the demo fork.** My default vote: create `apps/api/src/runtime/heartbeat.ts` per the tracker (NEW file; the kernel track's P3 `runtime/` merges cleanly — different file, no conflict); the live-worker loop wiring + the `/health` last-heartbeat surfacing defer to P3/integration. Alternative: a demo-owned obs location (e.g. `apps/api/src/observability/`). Confirm the tracker path vs a demo-owned location.
2. **Structured-log "Postgres" sink (MVP).** My default vote: console default + an **injected sink seam** (the "Postgres" sink = the injected seam, wired to a Postgres logs table or stdout-capture at integration); **NO new `run_events` writes** (rule #2 — logs/heartbeats are not authoritative events; the closed 36-member `RunEventType` has no log/heartbeat member) and **no new logs table this slice** (hosted hardening, deferred). Confirm console + injected-seam, table-deferred.
3. **Redaction scope for the logger.** My default vote: the **console (local) path is NOT scrubbed** (it's inside the process trust boundary — LESSONS §32 precedent: `request.log.error` is outside the rule-#4 boundary); only an **EXTERNAL sink emit routes through `createEmitBoundary`** (scrub-before-emit). Confirm (vs scrubbing the console path too).

## Dependencies + sequencing
- **Depends on:** **P6.5** (`packages/observability` scrub + `createEmitBoundary`, LESSONS §28 — landed) + **P6.8** (run-health, the eventual `/health` heartbeat consumer — landed). Independent of the live runtime (built ahead, like P6.1/P6.9).
- **Blocks:** the P3/integration worker-loop wiring (logs/heartbeat) + the operator's worker-alive view; PD live demo's "worker is alive" signal.

## Estimated commit count
**1.** Bundled slice — the kernel-logger + the heartbeat are the two halves of "runtime self-observability," same observability area, shared context, and **neither reimplements a safety invariant** (the rule-#4 scrub is REUSED via `createEmitBoundary`, not reimplemented; the heartbeat touches no invariant). **Step-8: security-reviewer RECOMMENDED** (invariant-adjacent — the slice's correctness depends on the rule-#4 redaction reaching every external emit; review that the composition holds, no raw external emit bypasses the scrub). code-quality: phase-boundary.

## Lessons-logged candidates anticipated
- **Convention candidate** — "runtime self-observability primitives are built ahead of the live worker + injected-everything: a structured kernel-logger propagates the §4 correlation IDs to an injected sink (default console); a heartbeat uses an injected clock/interval (no real timers) + a pure `isWorkerAlive` staleness predicate; the EXTERNAL emit REUSES the LESSONS §28 `createEmitBoundary` scrub (never reimplemented), console stays local (LESSONS §32 trust boundary); structural no-append-path-import (rule #2) + no `run_events` (a heartbeat is a side signal, not an authoritative event); the live-worker loop + `/health` surfacing defer to P3/integration."
- **Future TODO — operational** — a Postgres logs table + the worker-loop wiring + the `/health` last-heartbeat read are hosted/P3 integration items (named in the brief, deferred).

## How to invoke
> obs (apps/api) session oriented — `/tdd`. cwd `apps/api/` (the slice touches `packages/observability` + `apps/api`; stage both, never `apps/web`). (Round-3 obs slice 2 — continuous roll, after P6.9.)
1. **Run `/tdd runtime_self_observability`.**
2. **Step 2.5** — answer the 3 questions (esp. Q1 heartbeat placement + Q3 redaction scope), send the write-up + coverage map (each acceptance bullet → its test).
3. **Step 9** — surface the LESSONS candidate + confirm the deferred-wiring items for Carry-forward.
