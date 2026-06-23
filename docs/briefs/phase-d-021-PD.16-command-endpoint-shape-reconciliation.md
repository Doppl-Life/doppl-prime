# /tdd brief — reconcile_web_api_command_endpoint_shapes_operator_start_stop

## Feature
PD.16 — reconcile the web↔API **command-endpoint** response shapes (operator START/STOP), the same drift class PD.15 fixed on the read path. The dashboard's `startRun`/`startDemoRun`/`stopRun` parse the command responses as a full `Run`, but the API returns `{runId}` (201) / `{runId,idempotent:true}` (200) / `{runId,status,stopped}` — so the dashboard's operator Start (type problem → Start) + Stop BREAK against the real API. **Web-side only** (the API shapes are already correct). **Split from PD.15** (the ripple is ~11 files — component + test churn from `Run`→`{runId}`). ZERO contract surface. Web hat.

## Use case + traceability
- **Task ID:** PD.16 (the command-endpoint reconciliation; completes the live INTERACTIVE demo path)
- **Architecture sections it implements:** `ARCHITECTURE.md §11` (REST command routes — POST /runs, POST /runs/:id/stop), `§12` (dashboard operator controls — read-via-store / write-via-command, apps/web LESSON 4 + apps/api LESSON 85).
- **Origin:** PD.15 mid-wiring finding (same drift class; orch split 2026-06-23 — verified-the-premise correction: ~11 files, not the runClient-only change first assumed). The creds-free demo-of-record only VIEWs a seeded run (start/stop not exercised); this completes the LIVE demo's operator interaction.
- **FINDING (category 2, material):** web `startRun`/`startDemoRun`/`stopRun` `getJson(..., Run, ...)` → `Run.parse({runId})` throws `PayloadValidationError` vs the real API → operator Start/Stop broken in the real app.

## Acceptance criteria (what "done" means)
- [ ] `startRun` / `startDemoRun` consume `{runId}` (201) AND the 200 idempotent `{runId,idempotent:true}` — the caller needs only the new run id to switch the observed run (web-local return type, NOT a frozen `Run`).
- [ ] `stopRun` consumes `{runId,status,stopped}` (web-local return type).
- [ ] The 4 command consumers (`OperatorPromptPanel`, `RunConfigPanel`, `FallbackLadderPanel`, `StopControl`) + `Dashboard.tsx` adapt their `onStarted`/`onStopped` handling `run.id` → `run.runId` (the observed-run switch keys off the returned id).
- [ ] The web↔API smoke (PD.14/15 `web-api-smoke.test.ts`) asserts operator START (→ a real runId) + STOP (→ the stop wrapper) through the proxy against the REAL API.
- [ ] The mocked Playwright e2e stays (its fixtures update to the command shapes if it drives start/stop).
- [ ] `/preflight` clean (web); ZERO frozen-contract change (web-local response types; no Appendix-A model touched).

## Wiring / entry point (Step 7.5)
The dashboard's operator controls — `OperatorPromptPanel` Start → `startDemoRun`, `StopControl` → `stopRun` — reach the real API command endpoints (POST /runs, POST /runs/:id/stop) through the PD.14 proxy. The returned id switches the observed run in the store/shell. Confirm the operator Start/Stop round-trip works end-to-end through the proxy against the real API (the smoke is the proof).

## Files expected to touch
**Modified (web):**
- `apps/web/src/data/runClient.ts` — `startRun`/`startDemoRun`/`stopRun` consume the command shapes (web-local types)
- `apps/web/src/.../OperatorPromptPanel`, `RunConfigPanel`, `FallbackLadderPanel`, `StopControl` — `onStarted`/`onStopped` typed off the new shape; `.id` → `.runId`
- `apps/web/src/routes/Dashboard.tsx` — the 3× `run.id` observed-run switch → `run.runId`
- `apps/web/test/...` — the component tests (mock the command methods returning `{runId}`/stop-wrapper) + `runClient` command test (`test_commands_post_and_validate_run` → the new shapes)
- `apps/web/test/smoke/web-api-smoke.test.ts` — EXTEND with start/stop through the proxy

## RED test outline (Step 2)
1. **`runclient_commands_consume_command_shapes`** (web unit) — `startRun`/`startDemoRun` parse `{runId}` (+ 200 `{runId,idempotent:true}`); `stopRun` parses `{runId,status,stopped}`. RED: currently `Run.parse` → PayloadValidationError. Why: §11 the command surface.
2. **`operator_controls_switch_observed_run_by_runId`** (web unit) — `OperatorPromptPanel`/`StopControl` (+ RunConfig/FallbackLadder) `onStarted/onStopped` read `.runId` from the command result. RED: read `.id` off a no-longer-`Run` shape. Why: §12 operator controls.
3. **`smoke_operator_start_stop_through_proxy`** (smoke EXTENSION) — START returns a real runId + STOP returns the stop wrapper, through the proxy against the real API. Why: §11/§12/§17 the live interactive path.

## Cross-doc invariant impact
- **Model field changes:** NONE. ZERO frozen-contract change (web-local command-response types; no Appendix-A model).
- **Orchestrator doc rows (Step 9):** none expected (the ARCH §11 note from PD.15 already covers the web↔API shape reconciliation; PD.16 can fold a one-line "incl. command endpoints" if needed — orch).
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **Consumer surface:** confirm the full `Run`→`{runId}` ripple set (the 4 components + Dashboard + tests) — any consumer that needs MORE than the runId from the command result? (The premise: callers only need the id to switch the observed run; the run's full state arrives via the GET/SSE path PD.15 reconciled.) Flag if any reads more.
2. **Idempotent 200:** confirm `startRun` handles both 201 `{runId}` and 200 `{runId,idempotent:true}` (same `runId` field; the `idempotent` flag is optional info).
3. **Mocked e2e:** does it drive start/stop? If so, update its fixtures to the command shapes; else leave untouched.

## Dependencies + sequencing
- **Depends on:** PD.15 (the read-path core + the smoke harness) · the API command routes (POST /runs / POST /runs/:id/stop — already return the correct shapes, untouched).
- **Blocks:** the phase-d→cody merge (DEFAULT — operator Start is part of the live interactive demo; unless the user scopes operator-Start out of "demo fully works", in which case PD.16 may be post-merge).
- **Sequencing:** immediately AFTER PD.15, same impl (web hat).

## Estimated commit count
**1.** A focused web-side command-reconciliation (runClient command methods + the 4 components + Dashboard + tests + smoke). **No security-reviewer** — NO invariant touched (web response-consumption only; the create / stop command SEMANTICS [apps/api LESSON 56 / LESSON 85] are server-side and untouched). Mechanical ripple, same pattern as PD.15.

## Lessons-logged candidates anticipated
- **None new** — same drift class as apps/web LESSON §12 (mocked e2e hides the real web↔API connection; reconcile both sides). PD.16 is a second instance the §12 rule already covers.

## How to invoke
1. Read this brief + the cited files (`runClient.ts` command methods, the 4 components, `Dashboard.tsx`, the smoke).
2. Run `/tdd reconcile_web_api_command_endpoint_shapes` (web hat; read `apps/web/CLAUDE.md`).
3. Step 0 (Restate) — confirm: web command methods + the 4 components + Dashboard adapt to `{runId}`/stop-wrapper; smoke asserts start/stop through the proxy; ZERO contract surface.
4. Step 2.5 — Q1–Q3 (esp. the full ripple surface).
5. Step 9 — flag any ARCH §11 one-line addendum (orch) + that the mocked e2e stayed/updated.
