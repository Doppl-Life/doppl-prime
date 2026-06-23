# /tdd brief — production_boot_root_main_ts

## Feature
The production boot root `apps/api/src/main.ts` — the single entrypoint that makes Doppl RUN locally. It does the boundary IO + composition the shipped subsystems deferred to "P3/PD integration": read `process.env` → `loadConfig` (fail-fast env incl. `DATABASE_URL`) → `runMigrations` → assemble real infra (event store, gateway, check registry, `listRunIds`) → **`crashForward` BEFORE the server can accept work** → `buildServer({ onRunConfigured: createStartRun(infra) })` → `app.listen()`. Thin orchestration over already-shipped seams; ZERO new contract surface.

## Use case + traceability
- **Task ID:** PD.3 (the boot-spine portion — production boot root `apps/api/src/main.ts`; PD.3 is the "unified env-parameterized migrate → [seed] → start" task. This slice delivers **PD.3 minus the seed-demo step**; the PD.2 seed-demo step folds in at Tier-2 to COMPLETE PD.3, so PD.3 stays unticked — boot spine landed; seed step pending PD.2 — until then. Files note: `main.ts` is the canonical production boot root; the plan's `scripts/boot-demo.ts` becomes the Tier-2 demo wrapper that calls it — a small PD.3 Files reconcile I route to cody at close-out.)
- **Architecture sections it implements:** `ARCHITECTURE.md §15` (boot config validation + fail-fast env), §5 (crash recovery at boot + single-active-run worker), §11 (REST write path / fire-and-forget run trigger), §17 (identical migrate→[seed]→start sequence, parameterized only by env)
- **Related context / origins:**
  - Selection P5 → Phase-D carry-forward **(b)**: "production boot root — `main.ts` wiring `createStartRun(infra)` as `buildServer({onRunConfigured})`."
  - Phase-D bootstrap-wiring carry-forward: "(a) run `crashForward({listRunIds, eventStore})` BEFORE the worker accepts work (P3.13); (b) wire REST POST /runs → `runWorker` trigger; (c) supply the real `listRunIds` (drizzle `selectDistinct`)."
  - `server.ts` self-documents the gap: *"The listen()/boot wiring (real config load + kernel execution pickup) lands at P3/PD integration."*
- **Shipped seams this slice only COMPOSES (do not modify their signatures):**
  - `loadConfig({ env, fileSources }): AppConfig` — `runtime/config/loadConfig.ts` (PURE; caller does the env/file IO; `assertProviderCredentials(env)` fail-fasts on `OPENROUTER_API_KEY`/`OPENAI_API_KEY`/`DATABASE_URL`, naming the missing var, never echoing a value — rule #4).
  - `runMigrations(connectionString): Promise<void>` — `event-store/migrate.ts` (idempotent; drizzle migrator).
  - `createEventStore({ db, secretValues }): EventStore` — `event-store/append.ts` (`db` = `drizzle(pool)`; `secretValues` = the loaded secret env values for the redaction scrub).
  - `selectGateway(selection): ModelGateway` / `createGateway(deps)` + the OpenRouter/embedding/retrieval adapters + `createModelRegistry` — `model-gateway/` (env-switched real-vs-recorded; local-first must boot even when a hosted provider is down).
  - default `CheckRunnerRegistry` — `check-runners/registry.ts`.
  - `listRunIds(db): Promise<string[]>` — `projections/run-list.ts` (drizzle `selectDistinct`; the ONE source for BOTH the `crashForward` DI and the worker DI).
  - `crashForward({ eventStore, listRunIds }): Promise<CrashForwardResult>` — `runtime/recovery/crashForward.ts` (forward-fails orphaned non-terminal runs to their §3-legal terminal; appends ONLY the run-terminal; no provider/RNG/clock).
  - `createStartRun(infra): (runId) => void` — `boot/startRun.ts` (the fire-and-forget worker trigger; `.catch` guards the server from an unhandled rejection).
  - `buildServer({ store, db, defaultConfig, newId, onRunConfigured, modelRoutes?, sse? }): FastifyInstance` — `server.ts`.

## Acceptance criteria (what "done" means)
- [ ] Boot **fails fast** when a required env var is missing/invalid (`DATABASE_URL`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`) — the error **names the var** and **never echoes its value** (rule #4 / §15); no server is started, no migration is run past the failure point.
- [ ] Boot order is exactly: `loadConfig` (env validate) → `runMigrations(DATABASE_URL)` → build infra → **`await crashForward(...)`** → `app.listen()`. `crashForward` is awaited to completion **before** `listen()` so the server cannot accept a `POST /runs` (the only `onRunConfigured` trigger) until every orphaned run is terminal and the single-active-run guard starts clean (§5).
- [ ] After boot against a DB seeded with an **orphaned non-terminal run** (`run.configured` + `run.started`, no terminal), that run is forward-failed (`run.failed{reason:"crash"}`) by boot — asserted from the persisted log; the next `POST /runs` is then accepted (guard sees no active run).
- [ ] `POST /runs` over the **listening HTTP server** appends `run.configured` and **fires the worker** (`onRunConfigured = createStartRun(infra)`); the run executes in-process and reaches a terminal status — asserted from the persisted log (no direct projection mutation; REST is the sole write path, rule #2).
- [ ] The run trigger is **serialized**: a second `POST /runs` while one run is non-terminal is rejected `409 run_already_active` (the existing in-route `activeRunId` re-validated vs the log, LESSON 56) — boot adds no second concurrent path.
- [ ] `listRunIds` is the real `projections/run-list.listRunIds(db)` drizzle reader, injected into BOTH `crashForward` and the worker deps (`createStartRun` infra) — one source, no divergent enumeration.
- [ ] The gateway is **env-switched** (`selectGateway`): boot completes the full path locally with the recorded/fake gateway even when no live provider is reachable (local-first is the demo of record, §17). The integration test injects the recorded gateway — **no live model/embedding/web call on the test path** (also keeps it replay-safe, rule #7).
- [ ] `main.ts` exports a **testable** boot function (`bootApp(overrides?) → { app, close }`) and only auto-runs when executed as the process entry — so the integration test boots without a process-level side effect and tears down cleanly.
- [ ] Integration test in `apps/api/test/integration/boot/main-boot.test.ts` passes against the **real Postgres** testcontainer (no mocks on the load-bearing path).
- [ ] `/preflight` clean (typecheck/lint/format + unit + integration).
- [ ] Cross-doc invariant: **none** (zero new contract surface; no Appendix-A model defined/changed; no seamSnapshot).

## Wiring / entry point (Step 7.5)
Production entry point `apps/api/src/main.ts`, run via a new `package.json` script (`pnpm --filter @doppl/api start` → `node`/`tsx` `src/main.ts`). The new boot code is reached in production by executing the module; in tests by calling the exported `bootApp(overrides)`. This slice IS the wiring slice — it closes the `server.ts` "listen()/boot wiring lands at P3/PD integration" gap and the carry-forward's "production boot root" item. **The stop path is NOT rewired here** — `POST /runs/:id/stop` keeps its current in-route `run.stopped` append for this slice; the kernel-`operatorStop`/kill-and-drain rewire is the immediately-following isolated **stop-path-rewire slice** (see Dependencies).

## Files expected to touch
**New:**
- `apps/api/src/main.ts` — the production boot root. Exports `bootApp(overrides?): Promise<{ app: FastifyInstance; close: () => Promise<void> }>` (reads `process.env`, builds the pg `Pool` + `drizzle` handle, composes all seams above, awaits `crashForward`, calls `app.listen`); a guarded bottom-of-module runner invokes it only when run as the entry. Overrides allow the test to inject `env`, the gateway selection (recorded), and an ephemeral listen port.
- `apps/api/test/integration/boot/main-boot.test.ts` — real-PG integration test (reuse `test/integration/setup/testcontainers-pg.ts` + the `boot/compose-runtime.test.ts` / `runtime/crash-forward.test.ts` / `runtime/run-worker.test.ts` patterns).

**Modified:**
- `apps/api/package.json` — add a `start` (and optional `dev`) script targeting `src/main.ts`. **Flag at Step 2.5 if a new runtime dep is needed** (e.g. `tsx` for direct TS execution, or a build step) — prefer reusing what's already in the manifest.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (apps/api/test/integration/boot/main-boot.test.ts)
1. **`boot_fails_fast_on_missing_database_url`** — boot with `DATABASE_URL` absent throws; the message contains `DATABASE_URL`, contains NO connection-string value; no server bound. Why: §15 fail-fast env + rule #4 no-value-echo (LESSON 26).
2. **`boot_fails_fast_on_missing_provider_key`** — boot with `OPENROUTER_API_KEY` absent throws naming the var. Why: §15 fail-fast (assertProviderCredentials closed list).
3. **`boot_runs_migrations_idempotently`** — first boot creates the `run_events` table (an append succeeds afterward); a second boot against the same DB is a clean no-op. Why: §9/§17 migrate is the first boot step, idempotent.
4. **`crash_forward_runs_before_listen`** — seed an orphaned `run.configured`+`run.started` run; boot; assert the orphan is `run.failed{crash}` in the log AND a subsequent `POST /runs` is **accepted** (guard clean). Why: §5 crash-forward precedes work; P3.13 clean-slate invariant.
5. **`post_runs_fires_worker_to_terminal`** — over the listening server (recorded gateway), `POST /runs` returns `201 {runId}`; await settle; the run's log reaches a terminal status with `run.started` present (worker actually ran). Why: §11 fire-and-forget trigger wired to `createStartRun`; rule #2 REST-only write path.
6. **`second_post_runs_rejected_while_active`** — a second `POST /runs` before the first terminalizes returns `409 run_already_active`. Why: §15 single-active serialization (LESSON 56), confirms boot adds no concurrent path.
7. **`boot_completes_with_recorded_gateway_no_live_calls`** — the full path runs with the recorded gateway; a spy asserts zero live provider calls. Why: §17 local-first boot; rule #7 replay-safe test path.
8. **`bootApp_close_tears_down`** — `close()` ends the pg pool + closes the server (no open-handle leak across tests). Why: test hygiene / resource lifecycle.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none. Phase D adds zero contract surface; this slice defines/changes no Appendix-A model.
- **Orchestrator doc rows to write hot:** none anticipated (pure composition). If composition surfaces a behavior worth pinning (e.g. the boot order as an invariant), flag it Step 9 → I author an `ARCHITECTURE.md §17`/§5 note + the `apps/api/CLAUDE.md` lookup/cross-doc row.
- **§2.5-seam (shared-contract) model touched?** No — no frozen `packages/contracts` model is touched, so **no schema-snapshot test** is required.

## Things to flag at Step 2.5
1. **Gateway selection switch.** `selectGateway` real-vs-recorded keyed how? My default vote: **an env flag** (e.g. `DOPPL_GATEWAY=live|recorded`, default `live` in prod; the test sets `recorded`). Rationale: §17 local-first must boot with no live provider; keeps the switch a boot-boundary concern, not a kernel one. Confirm the exact `GatewaySelection` shape from `model-gateway/stub/fake-gateway.ts` at Step 1.
2. **`main.ts` testability shape.** Export `bootApp(overrides) → { app, close }` + a guarded entry runner, vs a bare top-level script. My default vote: **exported `bootApp` + guarded runner** — required to integration-test boot without a process side effect and to tear down the pool/server per test.
3. **Config file sources for Tier-1.** Read config from env + compiled defaults only (`fileSources: {}`), or also a JSON/file path? My default vote: **env + defaults only** for Tier-1 (`loadConfig({ env: process.env, fileSources: {} })`); file-sourced config is later polish. Keeps the boot minimal and matches `loadConfig`'s `?? {}` fallbacks.
4. **`secretValues` for the redaction scrub.** Source the `createEventStore` `secretValues` from which env keys? My default vote: **the provider-credential values present in env** (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, and the `DATABASE_URL` password component if present) — the values that must never appear in a payload (rule #4). Confirm what `createEventStore`/the scrub expects (the raw secret strings).
5. **Stop route untouched this slice.** Confirm: leave `POST /runs/:id/stop`'s in-route `run.stopped` append AS-IS here; the kernel-`operatorStop` rewire is the next, isolated stop-path-rewire slice. My default vote: **yes, untouched** — bundling the stop-semantics change (safety-adjacent, rule #2 terminalization) into this wiring slice violates "safety-invariant slices never bundle with feature work."
6. **Listen host/port.** Bind `0.0.0.0:PORT` from env (`PORT`, default 3000), test uses an ephemeral port (`:0`). My default vote: **env `PORT`, default 3000; test injects `0`.**

## Dependencies + sequencing
- **Depends on:** all shipped — `loadConfig` (P3.1), `runMigrations` (P1), `createEventStore` (P1.x), the real gateway + `selectGateway` (P2.x), default `CheckRunnerRegistry` (P4.5), `listRunIds` (P6/demo), `crashForward` (P3.13), `createStartRun`/`composeRunWorkerDeps` (P5.11), `buildServer` (P6.6). Nothing blocks this slice.
- **Blocks:** the **stop-path-rewire slice** (kernel-`operatorStop` kill-and-drain — the next slice, isolated, test-first), then Tier-2 **PD.1** (dump-replay) / **PD.2** (seed-demo) / the **PD.3 completion** (the seed-demo step slotted between migrate and listen). Structure the boot order so a `seed` step slots in after `runMigrations` without reshaping `main.ts`.

## Estimated commit count
**1.** A single focused integration-wiring slice (one `main.ts` + its real-PG integration test + the `package.json` script). No safety-invariant pin is *introduced* here (it composes existing kernel-enforced invariants; it does not author one), so it is not a forced-solo safety slice — but it is a self-contained logical unit, so one commit. The stop-semantics change is deliberately NOT in this commit (it is the next, isolated stop-path-rewire slice).

## Lessons-logged candidates anticipated
- **Convention candidate** — "The production boot root is the ONLY place env/file IO happens; every kernel seam stays pure and is composed here (IO at the boundary, LESSON 4 extended to boot)."
- **Architecture-doc note candidate** — pin the boot order invariant in §17/§5: `loadConfig(env-validate) → migrate → crashForward(awaited) → listen`, with `crashForward` strictly before the server accepts work.
- **Future TODO — operational** — graceful shutdown (SIGTERM → drain in-flight worker via `operatorStop` → close pool) is a later hardening item; Tier-1 covers `close()` for tests only.

## How to invoke
1. Read this brief end-to-end (especially "Things to flag at Step 2.5" — answer the 6 questions or take defaults).
2. `/session-start` (first slice of the phase-d implementer session) — confirm cwd is the **`Capstone-phased` worktree** (branch `phase-d`); all paths/commits land there, never `Capstone-kernel`.
3. Run `/tdd production_boot_root_main_ts`.
4. Step 0 (Restate) — confirm against the Feature line.
5. Step 1 — confirm the file list + resolve the exact `GatewaySelection` / default-`CheckRunnerRegistry` export names.
6. Step 2.5 — ping back the test-design write-up + design-question answers; wait for `APPROVED.`/`TWEAK:`/`ADD:` before GREEN.
7. Step 9 — surface anything beyond the anticipated lessons-logged candidates (esp. any new `package.json` dep).
