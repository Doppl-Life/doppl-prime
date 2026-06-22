# /tdd brief — demo_runs_trigger_e2e (POST /runs → runWorker; the production entry point)

> **CROSS-TERRITORY SLICE (human-authorized Option A).** Edits DEMO-territory files on loan: `apps/api/src/routes/runs.ts` + `apps/api/src/server.ts`. Keep the edits MINIMAL + ADDITIVE (an optional trigger callback — the same additive-hook discipline as W3a). **Cross-territory manifest (enumerate at Step 9 + round-seal): `apps/api/src/routes/runs.ts`, `apps/api/src/server.ts` — demo-on-loan.** Explicit `git add <path>` per file, never -A. STOP/Finding if it needs more than an additive trigger callback.

## Feature
Wire the production entry point: `POST /runs` → (after appending `run.configured`) fire the run via `runWorker(composeRunWorkerDeps(runId))` in-process, fire-and-forget. An additive optional `onRunConfigured?: (runId) => void` on the run routes (called after the authoritative `run.configured` append), wired in `buildServer` to the boot composition (W3b-2a). Proven by an HTTP e2e (Fastify `inject` + real PG + fake gateway): POST a run → it executes → multi-generation evolution on the true verify→score→reproduce→thread path, observable via the event log / GET endpoints. This closes the loop from the operator HTTP command to the running organism.

## Use case + traceability
- **Task ID:** P5.11
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (selection reachable from the production entry point — the runtime wiring complete). **Widens phase scope because** it wires the `§11` REST command (`POST /runs`) to the `§5` worker via the W3b-2a composition.
- **Related context:**
  - `routes/runs.ts` POST /runs appends `run.configured` (line ~117-124) then returns 201; it does NOT execute (the trigger was deferred to "demo/Phase D" per the kernel's runWorker comment — now W3b-2b under Option A).
  - `buildServer` (server.ts) registers the routes via DI; add the trigger wiring as an injected dep (additive).
  - `composeRunWorkerDeps` (W3b-2a, `selection-015`) → `RunWorkerDeps`; `runWorker(deps)` executes (single-active-run guarded, idempotent off the log — LESSONS §70).
  - Single-active-run: `routes/runs.ts` already rejects a 2nd active run (409); `runWorker`'s `activeRunGuard` is the authoritative backstop. The trigger fires only for an accepted (201) run.
  - This is the LAST selection slice; `/phase-exit P5` runs after it (true end-to-end via the HTTP entry point).

## Acceptance criteria (what "done" means)
- [ ] `RunRoutesDeps` gains an optional `onRunConfigured?: (runId: string) => void` — called AFTER the `run.configured` append + before/with the 201 response, fire-and-forget (the HTTP response does NOT block on the run). Absent → current behavior (append-only, no execution) unchanged; every existing routes test stays green.
- [ ] `buildServer` accepts an optional trigger wiring (e.g. `startRun?: (runId) => void` or the boot composition handle) and passes it as `onRunConfigured` to `registerRunRoutes`. Additive — absent → today's behavior.
- [ ] The production wiring (in `buildServer` or a thin boot entry): `onRunConfigured = (runId) => { void runWorker(composeRunWorkerDeps({ runId, ... })) }` — fire-and-forget, errors caught + logged (a worker failure must not crash the HTTP server; the run's failure is in the event log). See Step-2.5 Q1.
- [ ] **HTTP e2e (Fastify inject + real PG + fake gateway, LESSONS §24):** POST /runs → 201 {runId}; the run executes; after it completes, the event log shows ≥2 generations + gen N+1 evolving from gen N + a terminal `run.completed`/`run.failed`. The TRUE path end-to-end from the operator command. (Await completion deterministically — Step-2.5 Q2.)
- [ ] A worker error (e.g. fake gateway forced failure) does NOT crash the server / leak a 5xx for the already-returned 201; the run terminalizes failed in the log. Pinned.
- [ ] Single-active-run holds end-to-end: a 2nd POST /runs while one is active → 409 (route guard) — unchanged.
- [ ] No safety regression: REST appends authoritative events only (rule #2), the trigger fires the kernel-enforced worker (caps rule #1), no secrets in responses (rule #4). The trigger wires; it doesn't bypass enforcement.
- [ ] All tests pass; `/preflight` clean (repo-wide).

## Wiring / entry point (Step 7.5)
THIS slice IS the production entry point: `POST /runs` (operator HTTP command, §11) → `run.configured` append → `onRunConfigured` → `runWorker(composeRunWorkerDeps)` → the generation loop with all 3 real seams + threading. After this, selection's entire surface is reachable from the operator command — what `/phase-exit P5`'s reachability auditor verifies. Manifest the demo files touched.

## Files expected to touch
**Modified (DEMO territory — on loan; manifest these):**
- `apps/api/src/routes/runs.ts` — additive `onRunConfigured?` on `RunRoutesDeps`; call it after the `run.configured` append.
- `apps/api/src/server.ts` — additive trigger wiring in `buildServer`; pass through to `registerRunRoutes`.

**New (selection/boot territory):**
- `apps/api/test/integration/routes/runs-execution.e2e.test.ts` — the HTTP e2e (or co-locate in boot/).
- possibly `apps/api/src/boot/startRun.ts` — the fire-and-forget wrapper (`runWorker(composeRunWorkerDeps(...))` with error capture), if cleaner than inlining in server.ts.

## RED test outline
1. **`test_onRunConfigured_absent_is_current_behavior`** — POST /runs with no trigger wired. Asserts: 201 + run.configured appended, NO execution (current behavior; existing routes tests green). Why: additive/non-breaking.
2. **`test_post_runs_triggers_execution`** — POST /runs with the trigger wired (boot composition + fake gateway). Asserts: the run executes (generations appear in the log) after the 201. Why: §11→§5 the production entry point.
3. **`test_http_e2e_multi_generation_evolution`** — THE e2e: POST /runs → await completion → assert ≥2 generations, gen-1 from gen-0 offspring, terminal run.completed + finalIdeaRef, via the event log / GET. Why: §8 end-to-end evolution from the operator command.
4. **`test_worker_error_does_not_crash_server`** — fake gateway forced to fail the run. Asserts: the 201 already returned; the server stays up; the run terminalizes failed in the log (no unhandled rejection). Why: fire-and-forget robustness.
5. **`test_second_run_while_active_409`** — POST a 2nd run while one is active. Asserts: 409 (route guard holds end-to-end). Why: §5/§15 single-active-run.
6. **`test_replay_after_http_run_provider_free`** — replay the persisted log of the HTTP-triggered run. Asserts: state-equivalent, zero provider calls. Why: rule #7 end-to-end.

## Cross-doc invariant impact
- **Model field changes:** none.
- **Orchestrator doc rows to write hot:** none. Arch-note (§8/§11: the production entry point) banks for the cody handoff.
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **Fire-and-forget error handling.** The worker runs async after the 201; an error must not crash the server. My default vote: **`void runWorker(...).catch(err => request.log.error(err))`** — the run's failure is authoritative in the log (terminalized by the worker/crash-forward); the server logs + stays up. Flag if you want a richer supervisor.
2. **Deterministic await in the e2e.** The trigger is fire-and-forget; the test must await the run's completion before asserting. My default vote: **inject a synchronous/awaitable trigger in the test** (the test wires `onRunConfigured` to capture the runWorker promise + awaits it) — keeps the e2e timer-free + deterministic (no polling). Flag if a poll-until-terminal is cleaner.
3. **Where the production trigger is composed.** My default vote: **a thin `boot/startRun.ts`** (`startRun(runId) = void runWorker(composeRunWorkerDeps({runId,...})).catch(...)`) wired in `buildServer`; keeps server.ts's edit to passing the dep through. Flag if inlining in server.ts is cleaner.
4. **Config/infra source for composeRunWorkerDeps at trigger time.** The trigger needs config/gateway/store/registry per run. My default vote: **build the infra ONCE at boot (buildServer) + close over it in `startRun`**; per-run only `runId` varies. Flag if per-run config (from the run.configured payload) should override.

## Dependencies + sequencing
- **Depends on:** W3b-2a boot composition (`selection-015`) + all prior W3 slices + the merged VerifySeam.
- **Blocks:** `/phase-exit P5` (the production entry point completes selection's reachability).

## Estimated commit count
**1.** One slice — the additive demo trigger (2 demo files on loan) + the boot startRun wrapper + the HTTP e2e. The demo edits are additive (an optional callback); keep them isolated + manifested. If you prefer, split the demo-trigger commit (routes/server) from the e2e — but they're one logical "production entry point" unit; 1 commit is fine with the manifest.

## Lessons-logged candidates anticipated
- **Convention candidate** — "wire a deferred execution trigger as an additive optional callback on the existing route deps (fire-and-forget, error-captured, default-absent = unchanged), composed at buildServer from the boot root — the HTTP command stays non-blocking + the run's truth lives in the log."
- **Architecture-doc note candidate** — §8/§11: POST /runs → run.configured → onRunConfigured → runWorker → the evolution loop; the operator-command-to-organism path.
- **Cross-territory manifest** — routes/runs.ts + server.ts on loan (demo); flag at round-seal for the demo lead's merge review.

## How to invoke
1. Read end-to-end — note the CROSS-TERRITORY guardrail (additive trigger only; STOP/Finding if more).
2. `/tdd demo_runs_trigger_e2e`.
3. Step 0 — confirm restatement + the minimal-additive demo edit.
4. Step 2.5 — answer the 4 design questions (or defaults).
5. Step 9 — include the cross-territory manifest.
