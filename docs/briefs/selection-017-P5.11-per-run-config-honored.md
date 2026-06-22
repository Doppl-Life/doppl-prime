# /tdd brief — per_run_config_honored (run.configured drives the worker; recorded == executed)

## Feature
Close the config deferment (human Option B): make the worker EXECUTE the per-run config the operator POSTed (recorded in `run.configured`), not the boot default. `startRun(runId)` reads the run's `run.configured` event → extracts the recorded `RunConfig` → `composeRunWorkerDeps` merges its `caps` / `rngSeed` / `enabledSubtypes` over the boot `AppConfig` (keeping the boot infra + scoringPolicy + rubric + seedSet), **clamped** so a posted cap can only LOWER within the boot ceiling, never RAISE (rule #1). Result: `run.configured` is authoritative-and-true — recorded intent == executed config — fulfilling the log-is-the-truth thesis.

## Use case + traceability
- **Task ID:** P5.11
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (selection's runtime wiring — the operator's recorded config now drives the run). **Widens phase scope because** it spans the `§11` POST /runs record → the `§5` worker config via the boot composition.
- **Related context:**
  - W3b-2b (`635c0ee`) shipped boot-default (the worker ran with the boot AppConfig, NOT the per-run POST config) — recorded≠executed for a custom config. This slice closes that, human-ratified Option B.
  - `routes/runs.ts` POST /runs already validates the body via `validateRunConfig` + rejects cap overrides ABOVE the boot maxima (`overCapField` → 422, lowering-only) + appends the validated `RunConfig` to `run.configured`.
  - `composeRunWorkerDeps` (W3b-2a, `5fdd59d`) takes the boot `AppConfig`; `startRun` (W3b-2b) reads nothing per-run yet (only `runId` varies).
  - `AppConfig` = {runConfig(rngSeed/enabledSubtypes/scoringPolicyVersion), scoringPolicy, caps, seedSet, registry, ...}. The per-run overrides: `caps`, `runConfig.rngSeed`, `runConfig.enabledSubtypes` (the operator-tunable fields). Boot owns: scoringPolicy, rubric, seedSet, gateway/store/registry (infra).
  - Rule #1: caps are kernel-enforced; a hint can only be clamped to `min(remaining caps)`, never raise. The merge must clamp posted caps to `min(posted, boot ceiling)` as defense-in-depth (even though the route already rejects >maxima — a directly-appended `run.configured` must not be able to raise a cap).

## Acceptance criteria (what "done" means)
- [ ] `startRun(runId)` reads the run's `run.configured` event (via the injected EventStore) → extracts the recorded `RunConfig`; passes it to `composeRunWorkerDeps` as a per-run override (e.g. `perRunConfig`).
- [ ] `composeRunWorkerDeps` merges the per-run `RunConfig` over the boot `AppConfig`: `caps` ← per-run caps, `runConfig.rngSeed` ← per-run rngSeed, `runConfig.enabledSubtypes` ← per-run enabledSubtypes; boot retains `scoringPolicy`, the judge rubric, `seedSet`, and all infra. Absent/unreadable `run.configured` → falls back to boot defaults (defensive; the worker's idempotency already requires `run.configured` to exist).
- [ ] **Rule #1 clamp (load-bearing):** each merged cap = `min(perRun cap, boot ceiling cap)` — a posted config can LOWER a cap but NEVER raise it above the boot maximum, even if the `run.configured` payload carries an over-ceiling value (defense-in-depth beyond the route's 422). Pinned by a test feeding a `run.configured` with an over-ceiling cap → the worker runs under the clamped (boot ceiling) value.
- [ ] **recorded == executed:** a CUSTOM posted `RunConfig` (e.g. `maxGenerations` lowered to 1, a distinct `rngSeed`, a single `enabledSubtype`) is the config the worker actually runs under — assert the run's behavior reflects the recorded config (e.g. exactly 1 generation runs when `maxGenerations:1` was posted; the run honors the recorded rngSeed/enabledSubtypes). The authoritative `run.configured` == the executed config.
- [ ] No safety regression: caps stay kernel-enforced (rule #1 — the clamp + the kernel's own enforcement); the merge changes only which config the worker reads, never bypasses enforcement. scoringPolicy/rubric/seedSet remain boot-immutable (not operator-overridable — rule #6 for the rubric).
- [ ] security-reviewer run (this is now on the cap-config path → rule #1 surface).
- [ ] All tests pass; `/preflight` clean (repo-wide).

## Wiring / entry point (Step 7.5)
`POST /runs` → `run.configured`(recorded RunConfig) → `onRunConfigured` → `startRun(runId)` reads `run.configured` → `composeRunWorkerDeps(boot, perRunConfig)` → `runWorker` runs under the MERGED (recorded, clamped) config. The HTTP e2e (extend W3b-2b's) drives a CUSTOM posted config end-to-end. No new entry point — this corrects the config the existing entry point executes.

## Files expected to touch
**Modified (selection/boot territory — NOT cross-territory):**
- `apps/api/src/boot/startRun.ts` — read `run.configured` → extract the recorded `RunConfig` → pass as the per-run override.
- `apps/api/src/boot/composeRuntime.ts` — accept an optional per-run `RunConfig`; merge (caps/rngSeed/enabledSubtypes) over the boot `AppConfig` with the rule-#1 clamp.

**Modified (tests):**
- `apps/api/test/integration/boot/compose-runtime.test.ts` and/or `apps/api/test/integration/routes/runs-execution.e2e.test.ts` — the recorded==executed + clamp tests.

No cross-territory edits (boot is selection-authored). `routes/runs.ts`/`server.ts` are UNCHANGED (they already record the config).

## RED test outline
1. **`test_worker_runs_recorded_config_not_boot_default`** — POST (or seed run.configured with) a custom RunConfig (maxGenerations:1, distinct rngSeed, single enabledSubtype). Asserts: the run executes under it (exactly 1 generation runs), NOT the boot default. Why: §8 recorded==executed (Option B).
2. **`test_merge_keeps_boot_infra_and_immutables`** — Asserts: after the merge, scoringPolicy + judge rubric + seedSet are the BOOT values (operator can't override them); only caps/rngSeed/enabledSubtypes come from run.configured. Why: rule #6 (rubric immutable) + scope of the override.
3. **`test_posted_cap_clamped_to_boot_ceiling`** — a run.configured with `maxPopulation` ABOVE the boot ceiling (a directly-appended payload bypassing the route's 422). Asserts: the worker runs under `min(posted, boot)` = the boot ceiling — never the raised value. Why: rule #1 defense-in-depth (a config can only lower).
4. **`test_absent_run_configured_falls_back_to_boot`** — Asserts: if run.configured is unreadable/absent, startRun falls back to boot defaults (defensive; doesn't crash). Why: robustness.
5. **`test_http_e2e_custom_config_recorded_equals_executed`** — extend the W3b-2b e2e: POST a custom config → assert run.configured payload == the config the run executed under (caps/rngSeed/enabledSubtypes), end-to-end. Why: §8/§11 the operator-driven path.

## Cross-doc invariant impact
- **Model field changes:** none (consumes frozen RunConfig/RunCaps/AppConfig).
- **Orchestrator doc rows to write hot:** none. Arch-note (§8/§11: run.configured drives the worker, clamped) banks for the cody handoff; the deferment Carry-forward item → DELETE (consumed by this slice).
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **Where the merge lives — startRun vs composeRunWorkerDeps.** My default vote: **startRun reads run.configured; composeRunWorkerDeps does the merge+clamp** (pure, testable: `(boot, perRunConfig?) → RunWorkerDeps`). Flag if reading run.configured belongs elsewhere.
2. **Clamp helper reuse.** A cap clamp `min(posted, boot)` per dimension — reuse the kernel's existing cap helper if one fits (e.g. the cap enforcer / overCapField inverse). My default vote: **a small explicit per-dimension `min` in composeRuntime** (clear + local), or reuse `overCapField`'s comparison if clean. Flag the reuse call.
3. **enabledSubtypes override safety.** The per-run enabledSubtypes must be a non-empty subset of what the seed set / boot supports. My default vote: **take run.configured.enabledSubtypes as-is** (validateRunConfig already enforced `.min(1)` + the closed Subtype union at POST) — no further gate. Flag if the seedSet constrains which subtypes can run.
4. **rngSeed override + replay.** The per-run rngSeed drives reproduction determinism; using the recorded one (not boot) is correct (replay reads persisted outcomes regardless). My default vote: **use run.configured.rngSeed**. Flag if any seed is already consumed before startRun (it isn't — the worker hasn't run yet).

## Dependencies + sequencing
- **Depends on:** W3b-2b (`635c0ee`) + W3b-2a (`5fdd59d`).
- **Blocks:** `/phase-exit P5` (this is the last functional gap before the gate).
- **NOTE — context/cycle:** the prior impl session hit ACTION at W3b-2b; this slice is intended for a FRESH implementer session post-cycle (the orchestrator + lead coordinate). The brief is authored + ready for dispatch to the fresh impl.

## Estimated commit count
**1.** One selection/boot slice (`feat(boot):` or `feat(selection):`) — the config merge+clamp + tests. Carries the rule-#1 clamp surface → security-reviewed. No cross-territory edits.

## Lessons-logged candidates anticipated
- **Convention candidate** — "the boot composition merges the run's RECORDED config (run.configured) over the boot defaults so recorded==executed (log-is-truth), clamping caps to the boot ceiling (rule #1 — a posted config lowers, never raises); boot keeps the immutables (scoringPolicy/rubric/seedSet)."
- **Architecture-doc note candidate** — §8/§11: run.configured is authoritative-and-true; the worker runs the recorded config, caps clamped to boot ceilings.
- **Carry-forward DELETE** — the per-run-config deferment (consumed here).

## How to invoke
1. Read end-to-end — note the rule-#1 clamp (load-bearing) + that this is for a fresh impl session.
2. `/tdd per_run_config_honored`.
3. Step 0 — confirm restatement.
4. Step 2.5 — answer the 4 design questions (or defaults).
5. Step 9 — security-review result + the Carry-forward DELETE note.
