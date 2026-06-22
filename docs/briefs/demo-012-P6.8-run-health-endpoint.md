# /tdd brief — run_health_endpoint

## Feature
A **run-health projection** + `GET /runs/:id/health` (on the P6.6 Fastify server): a read-only, projection-derived runtime signal — current generation, candidates-in-flight, **operations-in-flight** (unpaired operation-start markers), last-event time, and caps-consumed vs the configured maxima — so the operator can decide continue-vs-switch-to-replay within the 10-minute demo window. Derived purely from the event log; distinct from Langfuse; works without any external metrics stack.

## Use case + traceability
- **Task ID:** P6.8 (GET /runs/:id/health runtime-signal)
- **Architecture sections it implements:** `ARCHITECTURE.md §11` (`GET /runs/:id/health` — current generation, candidates in flight, operations in flight, last-event time, caps consumed; the continue-vs-replay signal), `§12`/`§4` (operations-in-flight from unpaired operation-start markers).
- **Related context:** key safety rule #2 (read-only, projection-derived). **Builds on P6.2** (current-state — generation, candidates, caps usage) + the P6.7 read surface + the P6.6 Fastify server. Registers on `buildServer`. Integration via testcontainers + Fastify `inject`.
- **⚠ sv3 sub-item (flagged):** "operations in flight" pairs each `*_started` marker with its completion. `judge.review_started`'s completion is **`judge.reviewed` (sv3/P0.16, NOT on track/demo)** — see Step-2.5 Q3. On sv2 the judge marker is currently unpaireable; this slice handles the sv2 markers and treats the judge pairing as part of the **sv3-reconcile** (flagged, not blocking).

## Acceptance criteria (what "done" means)
- [ ] `GET /runs/:id/health` returns: current generation, candidates-in-flight count, **operations-in-flight** (unpaired operation-start markers — agenomes generating, critics reviewing, checks running, fusions synthesizing; judge per Q3), last-event time, caps-consumed vs configured maxima
- [ ] A run-health projection derives these **purely from the event log** (read-only; no append, no projection write — rule #2); rebuild-on-read (consistent with P6.7)
- [ ] **last-event time** reflects the most recent appended run_event; a stalled run shows a stale last-event time the operator can act on
- [ ] **caps-consumed** reflects energy/population/generation/tool-call usage vs `RunCaps` and **never reports a value exceeding the enforced ceiling**
- [ ] Operations-in-flight is derived from **unpaired** operation-start markers (a `*_started`/marker with no paired completion) per §4/§12
- [ ] Unknown runId → clean 404; health is distinct from Langfuse + works with no external metrics
- [ ] Integration tests (testcontainers + Fastify `inject`) pass; **both counts reported**; `/preflight` clean

## Wiring / entry point (Step 7.5)
**Entry point — the P6.6 Fastify server** (`GET /runs/:id/health` registers on `buildServer`). First consumers: the operator (continue-vs-replay) + the P7.14 dashboard health/diagnostics panel + the **P7.4 live-RunStatus** seam (the dashboard can poll health for the run's status). So: *registered on the P6.6 server; consumed by P7.14 + the P7.4 banner wiring at integration.*

## Files expected to touch
**New:**
- `apps/api/src/projections/run-health.ts` — the health projection (derive generation/candidates-in-flight/operations-in-flight/last-event-time/caps-consumed from the folded log)
- `apps/api/src/routes/run-health.ts` — `GET /runs/:id/health`
- `apps/api/test/integration/routes/run-health.test.ts` (+ unit for the pure derivation)

**Modified:** `apps/api/src/server.ts` (register the route); `apps/api/src/projections/index.ts` (barrel).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Integration (`apps/api/test/integration/routes/run-health.test.ts`, testcontainers + Fastify `inject`; `spec(§11)`/`spec(§12)`):
1. **`test_health_reports_generation_candidates_caps`** — health returns current generation + candidates-in-flight + caps-consumed for an appended run. *(Positive guard.)* Why: §11.
2. **`test_operations_in_flight_from_unpaired_markers`** — an unpaired `*_started` marker (e.g. `critic.review_started` with no completion) counts as in-flight; once its completion appends, it clears. Why: §4/§12.
3. **`test_last_event_time_reflects_latest`** — last-event time = the most recent run_event's stamp; a stalled run shows it stale. Why: §11.
4. **`test_caps_consumed_never_exceeds_ceiling`** — caps-consumed reports usage vs RunCaps, never above the enforced maxima. Why: §11.
5. **`test_health_read_only`** — health appends no event + writes no projection (rule #2). Why: rule #2.
6. **`test_unknown_run_404`** — unknown runId → clean 404. Why: §11.

## Cross-doc invariant impact
- **Model field changes:** none (derives from the log; the health-signal shape is `apps/api`-internal unless P7 needs a pinned contract — see Q4). **§2.5-seam:** none.
- **Orchestrator doc rows (Step 9):** a likely LESSONS entry (the health projection — operations-in-flight via unpaired markers, caps-consumed-vs-ceiling). I author hot. If the health shape becomes a shared contract (P7.14), flag it.

## Things to flag at Step 2.5
1. **Operations-in-flight pairing.** My default vote: pair each operation-start marker with its completion (generation.verifying↔next-phase/completion, critic.review_started↔critic.reviewed, check.started↔check.completed, fusion.started↔reproduction event, tool_call.started↔tool_call.finished); count unpaired as in-flight. Confirm the pairing map.
2. **Health-signal shape + home.** My default vote: an `apps/api`-internal shape (not a frozen contract yet) — promote to shared at P7.14 if the dashboard needs a pinned shape. Confirm.
3. **⚠ judge in-flight pairing (sv3).** My default vote: `judge.review_started`'s completion is `judge.reviewed` (sv3/P0.16, NOT on track/demo). For THIS slice on sv2: either (a) exclude judge from operations-in-flight (it can't pair on sv2), or (b) report judge.review_started as in-flight with a note. **Vote: (a) handle only the pairable sv2 markers; the judge pairing is part of the sv3-reconcile** (when judge.reviewed lands). Confirm — and I'm escalating the sv3 contract-sync separately.
4. **caps-consumed source.** My default vote: derive energy/population/generation/tool-call usage from the current-state + energy events vs `RunCaps`; clamp the report to the ceiling (never exceed). Confirm.

## Dependencies + sequencing
- **Depends on:** **P6.2** (current-state — `ef43fca`), **P6.6** (Fastify server — `034d587`). No live P3 needed (fixtures via the real writer; markers hand-built). The judge-in-flight pairing depends on sv3 (flagged, sv3-reconcile).
- **Blocks:** P7.14 (health panel) + the P7.4 live-RunStatus wiring.

## Estimated commit count
**1.** Feature slice (health projection + endpoint). Not safety-invariant (read-only). Step-8: code-quality phase-boundary; security-reviewer optional (read-only).

## Lessons-logged candidates anticipated
- **Convention candidate** — "the run-health signal is a read-only projection derived from the log: operations-in-flight = unpaired operation-start markers (pair `*_started`↔completion, count the rest); caps-consumed clamped to the ceiling (never over-report); rebuild-on-read; distinct from Langfuse, no external metrics."

## How to invoke
> obs (apps/api) session oriented — `/tdd`. cwd `apps/api/`. Stage only `apps/api/...`.
1. **Read this brief** — registers on the P6.6 server; note the ⚠ judge-pairing sv3 flag (Q3).
2. **Run `/tdd run_health_endpoint`.**
3. **Step 2.5** — answer the 4 questions (esp. Q1 pairing map + Q3 judge-sv3), send the write-up + coverage map.
4. **Step 9** — surface the LESSONS candidate.
