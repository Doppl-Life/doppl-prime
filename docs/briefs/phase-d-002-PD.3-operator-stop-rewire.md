# /tdd brief — operator_stop_kill_and_drain_rewire

## Feature
Rewire `POST /runs/:id/stop` to SIGNAL the kernel's operator-stop kill-and-drain path instead of appending `run.stopped` in-route. A NEW in-memory operator-stop signal channel (keyed by runId), shared between the route (sets the latch) and the in-flight worker (the loop polls it through the already-built `operatorStop: () => boolean` seam): the route latches the stop + returns an async "accepted"; the WORKER's loop picks the latch up at its next generation-boundary kill-check, lets the current generation drain, and terminalizes the run with `run.stopped` (`running`→`stopping`, reason `operator_stop`) + the partial summary — **the route appends NO terminal**.

## Use case + traceability
- **Task ID:** PD.3 (the stop-path portion of the production-boot wiring; the bootstrap-wiring carry-forward bundles the boot root + this stop endpoint. A distinct slice — flagged to the lead for a dedicated cody plan row at /orchestrate-end.)
- **Architecture sections it implements:** `ARCHITECTURE.md §5` (kill switch / operator stop / drain-then-terminalize), §3 (legal terminal edges — `running→stopping→stopped`), §11 (REST stop command)
- **Origin:** Phase-D bootstrap-wiring carry-forward item (b): "POST /runs/:id/stop → injected `operatorStop`." Lead directive (ratified): route through the kernel kill-and-drain, NOT the in-route append — "the route SIGNALS the in-flight worker (a latching operatorStop the running loop picks up), then the WORKER drains + terminalizes with the partial summary."
- **The seam is ALREADY built end-to-end in the kernel — this slice only WIRES it:**
  - `runWorker` accepts `operatorStop?: () => boolean` (`worker/runWorker.ts:57`) + threads it to the loop (`:140`).
  - the loop's `detectKill()` polls it at each generation boundary (`loop/generationLoop.ts:299`, called at `:348`) → on `true` returns `{kind:'operator_stop'}` → `executeKillAndDrain('operator_stop','running',…)` (`loop/killDrain.ts`) appends `run.stopped` `{from:'running',to:'stopping',reason:'operator_stop'}` via the loop's kernel append (`actor:'runtime'`, `:246`) + drains, then P3.11 sees the terminal already in the log → no double-emit.
  - the current in-route append (`routes/runs.ts:139-161`, `run.stopped` actor `operator`, empty payload) is the **demo-era placeholder being REPLACED** — it is also BUGGY against a live worker (the loop polls the injected signal, not the log, so a route-appended `run.stopped` does NOT stop the loop — it keeps running + would append its own terminal later, a rule-#2 double-terminal hazard).

## Acceptance criteria (what "done" means)
- [ ] NEW operator-stop registry (keyed by runId): `request(runId)` latches a stop; `checker(runId): () => boolean` returns the poll fn. ONE instance created at boot (`main.ts`), shared: `request` → the stop route, `checker(runId)` → `createStartRun`'s worker composition as `operatorStop`.
- [ ] `POST /runs/:id/stop` on a NON-terminal run latches via `registry.request(runId)` and **appends NOTHING** — returns an async accept (`202 {runId, stopRequested:true}`). The worker owns the terminal (rule #2).
- [ ] The in-flight worker's loop picks up the latch at its next generation boundary → the current generation drains → `executeKillAndDrain` appends `run.stopped` `{from:'running', to:'stopping', reason:'operator_stop'}` with `actor:'runtime'` + the partial summary; the run is terminal. Asserted from the persisted log.
- [ ] **Route-didn't-terminalize discriminator:** the only `run.stopped` is the worker-drained one (`actor:'runtime'`, kill payload) — NEVER an `actor:'operator'` empty-payload route append (rule #2).
- [ ] `POST /runs/:id/stop` on an ALREADY-TERMINAL run is idempotent: `200 {runId, status, stopped:false}`, no signal effect, no second terminal (rule #2).
- [ ] `POST /runs/:id/stop` on an UNKNOWN runId → `404 run_not_found`.
- [ ] The route does NOT clear its in-memory `activeRunId` on stop (the run is still draining/non-terminal until the worker terminalizes) → a concurrent `POST /runs` while draining still gets `409` (the run is non-terminal in the log; the worker's terminalization + the next `isActive()` log re-validation is the source of truth).
- [ ] A generation already in progress when the stop is latched **completes** (drain semantics — "drain to a legal terminal, not an abrupt cut"); the NEXT generation never starts; the run terminalizes `run.stopped`. (The kill-check is generation-boundary granularity, `:348`.)
- [ ] **Replay-equivalence:** a stopped run reconstructs to the same terminal state from the persisted log with ZERO provider calls (rule #7); the operator-stop terminal is deterministic + replayable.
- [ ] Threading: `operatorStop` flows `StartRunInfra` → `createStartRun` → `composeRunWorkerDeps` → `RunWorkerDeps` → `runGenerationLoop` (the seam exists at every layer; this slice fills the previously-unset `operatorStop`).
- [ ] All unit + integration tests pass (existing `routes/runs.test.ts` stop cases updated to the new behavior); `/preflight` clean.
- [ ] Cross-doc invariant: **none** (zero new contract surface; `run.stopped` + the kill path are already-frozen; no Appendix-A model changed; no seamSnapshot).

## Wiring / entry point (Step 7.5)
`POST /runs/:id/stop` (`routes/runs.ts`, registered by `buildServer`) → `registry.request(runId)`. The worker side: `main.ts` creates the registry, injects `registry.request` into `registerRunRoutes` (via a new `buildServer` dep `requestStop`) + `registry.checker` into `createStartRun`'s `StartRunInfra` (`operatorStopFor`). The loop already consumes `operatorStop`. Reachable: `POST /runs/:id/stop` over the listening server → latch → the live worker drains + terminalizes (proven by an integration test driving the REAL loop with a gated gateway holding the worker mid-run).

## Files expected to touch
**New:**
- `apps/api/src/boot/operatorStop.ts` — `createOperatorStopRegistry() → { request(runId), checker(runId), clear?(runId) }` (a `Set<runId>` of latched stops).
- `apps/api/test/integration/boot/operator-stop.test.ts` — real-PG + live-worker drain test (gated gateway).

**Modified:**
- `apps/api/src/routes/runs.ts` — replace the in-route `run.stopped` append with `registry.request(runId)`; `RunRoutesDeps` gains `requestStop: (runId) => void`; response → `202 {stopRequested:true}`; KEEP the 404 + terminal-idempotent branches; do NOT clear `activeRunId`.
- `apps/api/src/boot/startRun.ts` — `StartRunInfra` gains `operatorStopFor: (runId) => () => boolean`; `createStartRun` passes `operatorStop: infra.operatorStopFor(runId)` into `composeRunWorkerDeps`.
- `apps/api/src/boot/composeRuntime.ts` — `ComposeRuntimeInput` gains `operatorStop?: () => boolean` → set it on the returned `RunWorkerDeps`.
- `apps/api/src/server.ts` — `BuildServerDeps` gains `requestStop`; wire into `registerRunRoutes`.
- `apps/api/src/main.ts` — create the registry; wire `request` → `buildServer`, `checker` → `createStartRun` infra.
- `apps/api/test/integration/routes/runs.test.ts` — update the stop-route cases to the new async-signal behavior.
- `apps/api/test/integration/boot/main-boot.test.ts` — thread the registry through `bootApp` (a stop e2e may move/extend here).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (apps/api/test/integration/boot/operator-stop.test.ts — real PG + gated worker)
1. **`stop_signals_worker_drains_to_run_stopped`** — start a run with a gated gateway holding the worker mid-run; `POST /runs/:id/stop`; release the gate; the log gains `run.stopped` `{from:'running',to:'stopping',reason:'operator_stop'}`, the run is terminal. Why: §5 drain-then-terminalize via the latch.
2. **`stop_route_appends_nothing`** — after `POST stop`, there is NO `run.stopped` with `actor:'operator'`; the only `run.stopped` is the worker-drained one (`actor:'runtime'`, kill payload). Why: rule #2 — the worker owns the terminal, not the route.
3. **`stop_terminal_run_idempotent`** — stop an already-terminal run → `200 stopped:false`; event count unchanged (no second terminal). Why: rule #2 no double-terminal.
4. **`stop_unknown_run_404`** — unknown id → `404 run_not_found`. Why: §11.
5. **`stop_lets_current_generation_drain_then_stops`** — latch the stop while generation g is in progress; g completes; generation g+1 never starts; run terminalizes `run.stopped`. Why: §5 generation-boundary drain (the loop's `detectKill` is between generations).
6. **`stop_response_is_async_accept`** — the route returns `202 {stopRequested:true}` (async accept), NOT a synchronous `stopped:true`. Why: §5 — the worker terminalizes, the route only signals.
7. **`stopped_run_replays_equivalent`** — the stopped run reconstructs to the same terminal state from the log with zero provider calls. Why: rule #7 replay-determinism.
8. **`operator_stop_registry`** (unit, same/sibling file) — `checker(runId)()` is `false` before `request`, `true` after; isolated per runId; `clear` resets (if implemented). Why: the channel's contract.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none. `run.stopped`, the kill switch, and `KillPlanSummary` are already frozen/shipped; no Appendix-A model touched.
- **Orchestrator doc rows to write hot:** likely an `ARCHITECTURE.md §5/§11` note (the stop endpoint is an async signal; the worker drains+terminalizes; the route appends nothing) — I author it (routed to cody). Flag at Step 9 if the wiring surfaces anything else.
- **§2.5-seam (shared-contract) model touched?** No — no frozen `packages/contracts` model; **no schema-snapshot test**.

## Things to flag at Step 2.5
1. **Registry shape + placement.** `createOperatorStopRegistry()` in `boot/operatorStop.ts`; a `Set<runId>`; `request(runId)` / `checker(runId): () => boolean`. My default vote: **`boot/`** — it's a composition-layer concern injecting plain fns into the runtime worker (`operatorStop: () => boolean`) + the route (`requestStop`); neither the runtime nor the route imports the registry (layer rule).
2. **Stop response code/shape.** `202 {runId, stopRequested:true}` (HTTP-correct async accept) vs `200 {stopRequested:true}` vs keeping `200 {status:'stopping', stopped:true}`. My default vote: **`202 {runId, stopRequested:true}`** — the stop is genuinely async (the worker drains). **FLAG:** the web stop control (P7.6) POSTs this today — verify it doesn't hard-depend on `stopped:true`; it reads run state via SSE/health so the eventual `run.stopped` propagates. A web "stopping…" tweak is a **carry-forward (apps/web)**, NOT this api slice.
3. **`activeRunId` on stop.** Keep it set (the run drains, still non-terminal) so a concurrent `POST /runs` gets `409` until the worker terminalizes, vs clear it. My default vote: **keep set** — clearing would let a second run start while the first is still draining (two active runs); the log re-validation (`isActive()`) is the truth.
4. **Registry cleanup.** Clear the entry when a run terminalizes (`createStartRun.onSettled → registry.clear(runId)`) to bound the `Set`, vs leave it. My default vote: **clear on `onSettled`** (cheap, avoids unbounded growth) — acceptable to defer for the single-run MVP.
5. **Stop on a `configured`-not-yet-started run.** If the stop arrives before the worker appends `run.started`: the latch is set; when the worker runs it appends `run.started` then immediately drains (`running→stopping→stopped`). My default vote: **let it run through `running→stopping→stopped`** (the loop's first kill-check at g=0 drains it) — simplest; if the worker never picks it up, the latch is a harmless no-op and crash-forward cleans the orphan next boot. (Do NOT special-case `configured→cancelled` in the route — that's the kill switch's job, and the worker path is the single source.)

## Dependencies + sequencing
- **Depends on:** PD.3 boot-spine (`f330475`) — `main.ts` + `createStartRun` + `buildServer` wiring exist; the `operatorStop` seam (worker→loop→killSwitch) shipped in P3.4/P3.10e/P3.12.
- **Blocks:** the demo stop-control rehearsal (PD.8); the **web stop-control async-handling follow-up** (carry-forward, apps/web — handle `202 stopRequested` + observe `run.stopped` via SSE).

## Estimated commit count
**1.** Safety-adjacent — it rewires authoritative run terminalization onto the kernel kill-and-drain path (rule #2) and changes stop semantics. Solo commit, never bundled (root `CLAUDE.md` TDD posture + the lead's "test-first + isolated" directive).

## Lessons-logged candidates anticipated
- **Convention candidate** — "an operator command that must abort in-flight work SIGNALS a latching in-memory channel the worker polls (`operatorStop`), never appends the terminal in the route — the worker drains to a legal terminal (rule #2); the route returns an async accept (202). A direct in-route terminal append is buggy against a live worker (the loop polls the signal, not the log)."
- **Architecture-doc note candidate** — pin §5/§11: `POST /runs/:id/stop` is an async signal (`202 stopRequested`); the worker drains the current generation + appends `run.stopped` (`running→stopping`, actor `runtime`); the route appends nothing.
- **Future TODO (web)** — the dashboard stop control handles the async `202` (show "stopping…") + observes `run.stopped` via SSE; verify P7.6 doesn't break on the response-shape change.

## How to invoke
1. Read this brief end-to-end (5 Step-2.5 design questions, pre-loaded with my default votes).
2. Confirm cwd is the **`Capstone-phased`** worktree (`git -C /Users/dreddy/Documents/GauntletAI/Capstone-phased branch --show-current` → `phase-d`) before any edit — same cwd gate as PD.3.
3. Run `/tdd operator_stop_kill_and_drain_rewire`.
4. Step 0 (Restate) → confirm against the Feature line.
5. Step 1 → confirm the file list + the `operatorStop` threading points.
6. Step 2.5 → send the test-design write-up (asserted-invariant lines + the acceptance-bullet→test coverage map); wait for `APPROVED.`/`TWEAK:`/`ADD:` before GREEN.
7. Step 9 → surface anything beyond the anticipated lessons-logged candidates (esp. the web stop-control compat).
