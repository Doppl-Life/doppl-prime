# phase-d-001 — Demo boot spine + prepared-replay loop (PD.3 COMPLETE, PD.1/PD.2)

- **Date:** 2026-06-22
- **Phase:** Phase D (Demo — local-first demo path + replay safety net)
- **Track:** phase-d (worktree `Capstone-phased`, branch `phase-d`, off the fully-integrated cody)
- **Predecessor session:** _(none — first phase-d implementer session)_
- **Successor session:** _(TBD — next phase-d session, e.g. PD.4 fallback ladder)_
- **Tasks:** #35 (PD.3 boot-spine) · #36 (PD.3 stop-rewire) · #37 (PD.1 dump) · #38 (PD.2 seed) · #39 (PD.3-completion) — all `completed`.

## Why this session existed

The five build tracks (contract/kernel/verifier/selection/demo) shipped the subsystems but left no runnable local-first demo. Phase D wires them into a runnable demo with a prepared-replay safety net, adding ZERO new contract surface. This session built the demo's boot spine + the prepared-replay capture→store→boot loop:

- a production boot root that makes Doppl RUN locally (`migrate → crashForward → listen`);
- the operator stop signal routed to the kernel kill-and-drain (replacing a demo-era in-route append);
- the prepared-replay dump (capture) + seed (restore) pipeline;
- completing the unified `migrate → seed → start` boot sequence + hardening the restore.

## What was built

### Files created
- `apps/api/src/main.ts` — the production boot root `bootApp(overrides?)`: `loadConfig` (fail-fast env) → `runMigrations` → infra over one pg pool (the real `listRunIds(db)` into BOTH crashForward + the worker) → **conditional seed step** → `await crashForward` (before listen) → `buildServer({onRunConfigured: createStartRun(infra), requestStop})` → `app.listen`. Guarded process-entry runner (`pnpm start`).
- `apps/api/src/boot/operatorStop.ts` — `createOperatorStopRegistry() → {request, checker, clear}`: the in-memory operator-stop latch shared route↔worker.
- `apps/api/src/event-store/scripts/dump-replay.ts` — PD.1 capture: `buildReplayFixture` (terminal-guard → `replayEvents` validate/order → pin `schemaVersion=max`) + `dumpReplayToFile` IO + guarded CLI runner (`pnpm dump-replay`).
- `apps/api/src/event-store/scripts/seed-demo.ts` — PD.2 restore: `buildSeedPlan` (schemaVersion ≤ current gate + **per-event `RunEventEnvelope`+`validateEventPayload`** + occurredAt ISO→Date) + `seedDemo` (path-guard → read fixture → `to_regclass` migrate-probe → direct insert `onConflictDoNothing` on (run_id,sequence)) + guarded CLI runner (`pnpm seed-demo`).
- `apps/api/src/event-store/scripts/runId-guard.ts` — shared `assertSafeRunId` path-guard (promoted from dump-replay; LESSON 5 extract-at-2nd-consumer).
- `fixtures/replay/.gitkeep` — committed fixtures dir (repo root).
- Tests: `test/integration/boot/main-boot.test.ts` (boot-spine + boot-seed), `test/integration/boot/operator-stop.test.ts`, `test/{unit,integration}/event-store/dump-replay.test.ts`, `test/{unit,integration}/event-store/seed-demo.test.ts`.

### Files modified
- `apps/api/src/routes/runs.ts` — stop route now SIGNALS `requestStop(runId)` + returns 202 (no in-route append); keeps 404/terminal-idempotent; does NOT clear `activeRunId`.
- `apps/api/src/server.ts` — `BuildServerDeps.requestStop?` (no-op default → `registerRunRoutes`).
- `apps/api/src/boot/startRun.ts` — `StartRunInfra.operatorStopFor?` threaded as `operatorStop` into `composeRunWorkerDeps`.
- `apps/api/src/boot/composeRuntime.ts` — `ComposeRuntimeInput.operatorStop?` set on `RunWorkerDeps`.
- `apps/api/src/event-store/scripts/dump-replay.ts` — imports the shared `assertSafeRunId` (local copy removed).
- `apps/api/package.json` — `start`/`dev`/`dump-replay`/`seed-demo` scripts + new devDep `tsx`.
- `test/integration/routes/runs.test.ts` — stop cases → async-202 + terminal-idempotent.

## Decisions made
- **`selectGateway` default = `recorded`** (local-first is the demo of record, §17); `live` selects `useStub:false` which currently throws (the real-gateway-into-selectGateway is P2.5-deferred). A `live` default would break `pnpm start`.
- **Per-test `CREATE DATABASE` isolation** for every test that uses the real whole-DB `listRunIds(db)` (boot) or a specific-runId restore (seed) — the shared testcontainer carries other tests' runs; the existing crash-forward/e2e tests dodge this by scoping `listRunIds`, but the boot/seed slices can't.
- **Multi-role fake gateway** for loop-driving tests — `selectGateway`'s `createFakeGateway` fixtures (population_generator `{idea}`, stale `final_judge`) cannot shape a CandidateIdea / drive the generation loop; tests inject a bespoke multi-role fake (no live SDK), mirroring `runs-execution.e2e`.
- **Operator stop = a latching in-memory SIGNAL** the worker polls (`operatorStop`), not an in-route terminal append (which is buggy against a live worker — the loop polls the signal, not the log → double-terminal hazard, rule #2). The worker drains the current generation + terminalizes `run.stopped` (actor `runtime`); the route returns 202.
- **Seed = a DIRECT restore-insert** preserving recorded `(sequence, occurredAt)` — the append path re-allocates sequence + stamps now(), so it can't restore; legal because the append-only trigger blocks UPDATE/DELETE/TRUNCATE but allows INSERT; idempotent via `onConflictDoNothing` on (run_id,sequence).
- **`assertSafeRunId` shared guard** + **per-event seed validation** (`RunEventEnvelope` on a null-stripped copy + `validateEventPayload`) — the restore validates each event the way the append path does, so a malformed fixture event can't seed a row that fails on read (LESSON 46).
- **`bootApp` ends the pg pool on any boot abort** (try/catch) — also fixes a latent boot-spine leak (crashForward/listen throw previously leaked the pool).
- **`defaultConfig.caps = config.caps`** in bootApp — the route cap-maxima == the boot ceiling the worker clamps to (rule #1; closes the selection P5 carry-forward (a) route-max residual).
- **In-slice fail-fast hardening (test-first)** surfaced by security review: PORT validation (boot-spine), path-traversal guard (PD.1), call-site path-guard pin (PD.2).

## Decisions explicitly NOT made (deferred)
- **Wiring the OpenRouter adapter into `selectGateway`** so `DOPPL_GATEWAY=live` works — currently an honest throw. Gates the PD.4 low-cap-LIVE rung (the ladder falls to prepared/replay). _(Future TODO, model-gateway/PD)_
- **Capturing the REAL committed demo fixture** (run the demo → dump → commit the JSON) — the downstream artifact step (PD.8 rehearsal / operator). This session shipped the SCRIPTS, tested vs synthetic runs.
- **Multi-fixture / fixture-catalog seeding** for the fallback ladder (PD.4) — a later extension; this seeds one `<runId>`.
- **Web stop-control async-202 handling** (P7.6 shows "stopping…" + observes `run.stopped` via SSE) — apps/web carry-forward, NOT this api slice.
- **Graceful shutdown** (SIGTERM → operatorStop drain → close pool) — later operational hardening; `close()` covers tests.
- **Broaden the fake-gateway carry-forward** — `createFakeGateway` is not loop-capable (BOTH its population_generator AND final_judge fixtures); the existing carry-forward named only the judge. Relevant when a real recorded demo gateway is promoted to `src/`.

## TDD compliance
**Clean — no violations.** All five slices were strict test-first: RED confirmed for the right reason (missing module / assertion mismatch), Step-2.5 orchestrator review (`APPROVED.`) before GREEN, then GREEN. Every in-slice hardening surfaced by security review (PORT fail-fast, path-traversal guard, call-site guard pin, malformed-event rejection) was added test-first (RED → GREEN). Safety-adjacent slices ran SOLO (PD.3 stop-rewire), write-path-adjacent ran with security-reviewer INVARIANT policy (PD.2, PD.3-completion).

## Cross-doc invariant audit
**Clean (multi-track memory check).** Every slice this session = ZERO new contract surface (no Appendix-A model field add/remove/rename), confirmed at each Step 9 (orchestrator receipt). No `RunEventEnvelope` / Appendix-A model touched → no `ARCHITECTURE.md` model-row edit owed. The orchestrator routes the §17/§9/§5/§11 prose arch notes (boot sequence, async-stop, seed-restore + per-event validation) to cody at `/orchestrate-end`.

## Reachability
- **`bootApp` / boot spine** — `pnpm --filter @doppl/api start` → tsx `src/main.ts` → guarded `isProcessEntry()` → `bootApp` → `app.listen`; runtime `POST /runs` → `createStartRun` → `runWorker`. Closes `server.ts` "listen()/boot lands at P3/PD integration".
- **operator-stop** — `POST /runs/:id/stop` → `requestStop` → `operatorStop.request`; worker → `operatorStop.checker(runId)` → loop `detectKill` (main.ts wires both on the prod boot path).
- **dump-replay** — `pnpm dump-replay <runId>` → guarded runner → `dumpReplayToFile` → `buildReplayFixture` (ops/CLI, not server-wired by design, §16).
- **seed-demo** — `pnpm seed-demo <runId>` (CLI) + the `bootApp` seed step (`DOPPL_SEED_FIXTURE`) → `seedDemo` → `buildSeedPlan`.
- No tested-but-unwired gaps. `selectGateway` `live` path is a deliberate honest-throw (deferred), not an unwired feature.

## Open follow-ups
Step-9 categorized items were routed hot to the orchestrator during the session (it writes the docs at `/orchestrate-end`). Still-open follow-ups:
- **Cross-track (apps/web carry-forwards):** RunHealth promotion + per-category in-flight render; web stop-control async-202 ("stopping…") + `run.stopped`-via-SSE; lineage `onSelect`; SSE connection-drop fallback; chart mean-series.
- **Cross-track (gateway/PD):** wire OpenRouter into `selectGateway` (`DOPPL_GATEWAY=live`); broaden the `createFakeGateway`-not-loop-capable carry-forward (population_generator + final_judge).
- **Phase-D remaining:** PD.4 (operator fallback ladder — serves the seeded run as rung-3 labeled replay) · PD.5 (operator-entered prompt path) · PD.6 (live/replay mode indicator + GET /runs/:id/health surfacing) · PD.7 (final-surviving-idea proof panel) · PD.8 (§16 rehearsal scripts + the REAL committed demo fixture capture).
- **Operational (low):** graceful shutdown (SIGTERM); multi-fixture catalog seeding; optional Zod boundary-parse of the fixture (the seed now validates per-event, which subsumes most of this).

## How to use what was built
- **Run the demo locally:** `DATABASE_URL=… OPENROUTER_API_KEY=… OPENAI_API_KEY=… pnpm --filter @doppl/api start` (default recorded gateway, local-first).
- **Capture a fixture:** complete a run, then `pnpm --filter @doppl/api dump-replay <runId>` → `fixtures/replay/<runId>.json`.
- **Boot with a prepared replay:** `DOPPL_SEED_FIXTURE=<runId> pnpm --filter @doppl/api start` (or `pnpm seed-demo <runId>` standalone) — restores the fixture after migrations, before the server accepts work.
