# /tdd brief — boot_composition_root (wire selection into the runtime; function-level e2e)

## Feature
Implement the **boot composition root** — a selection-authored module (`apps/api/src/boot/composeRuntime.ts`) that assembles the production `runWorker` dependencies: it constructs/accepts the `AppConfig`, the `ModelGateway`, the `EventStore`, and the check-runner registry, then wires all THREE real seams (verify=`createVerifySeam`, score=`createScoreSeam`, reproduce=`createReproduceSeam`) + the `nextPopulation` threading hook (`createSuccessorThreading`) into a `RunWorkerDeps`. Proven by a **function-level e2e** (real PG + fake gateway) that calls `runWorker(composed deps)` and asserts a multi-generation run completes on the true verify→score→reproduce→thread path with gen N+1 evolving from gen N. This is the production assembly; the HTTP `POST /runs` trigger is W3b-2b (`selection-016`).

## Use case + traceability
- **Task ID:** P5.11
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (selection wired into the runtime — the successor handoff realized end-to-end). **Widens phase scope because** the composition assembles the `§5` runtime worker/loop + the `§6` gateway + the `§7` verifier seam into one runnable boot path.
- **Related context:**
  - All seams are real + landed: `createVerifySeam` (VerifySeamDeps = {gateway, eventStore, registry, config, rubricSource?, activeCount?}), `createScoreSeam` (W1: {gateway, readByRun, policy, rubric, cullPolicy, newId}), `createReproduceSeam` (W2: {gateway, maxPopulation, bounds, seed, newId}), `createSuccessorThreading` (W3b-1: {caps}).
  - `runWorker(RunWorkerDeps)` (runtime/worker) = {runId, config:AppConfig, eventStore, gateway:GenerationGateway, seams:GenerationSeams, nextPopulation?, listRunIds, now?, operatorStop?, heartbeat?, minPopulationSurvival?}.
  - `AppConfig` (configSchema) carries `runConfig`(rngSeed/enabledSubtypes), `scoringPolicy`, `caps`, `seedSet`, `registry`(model) — but NOT the FinalJudgeRubric (see the rule-#6 acceptance bullet).
  - `createGateway(GatewayDeps)→ModelGateway` (model-gateway/gateway.ts); the e2e injects a fake `providerCall` (LESSONS §24) for deterministic multi-role output (embedding/critic/judge/fusion_synthesis).
  - The check-runner registry: `apps/api/src/check-runners/registry.ts`. `listRunIds`: from `projections` (DI, LESSONS §57/§70 — runtime can't import projections).
  - This is selection-authored composition (Option A) — it IMPORTS cross-area modules but EDITS none (a NEW module). The cross-area EDITS (demo POST /runs trigger) are W3b-2b.

## Acceptance criteria (what "done" means)
- [ ] `composeRunWorkerDeps(input) → RunWorkerDeps` assembles the worker deps from injected infra (`{ config: AppConfig, modelGateway: ModelGateway, eventStore: EventStore, checkRegistry, listRunIds, newId, runId }`) — infra is INJECTED (testable with a fake gateway + real PG; no hidden global construction).
- [ ] **Rule #6 single-rubric (load-bearing):** the SAME immutable `FinalJudgeRubric` (the canonical `DEFAULT_JUDGE_RUBRIC` const) is wired to BOTH the verify seam (the judge produces `JudgeResult` under it) AND the score seam (`createScoreSeam.rubric`, where `judgeAcceptance` validates `rubricPolicyVersion`). Pinned by a test asserting the verify-produced `judge.reviewed.rubricPolicyVersion` matches the score seam's rubric → `judge_acceptance` is `present:true` (not a version-mismatch absence).
- [ ] score seam wired with `policy = config.scoringPolicy`, `readByRun = eventStore.readByRun`; reproduce seam with `maxPopulation = config.caps.maxPopulation`, `seed = config.runConfig.rngSeed`, `bounds`; threading with `caps = config.caps`.
- [ ] The `GenerationGateway` runWorker needs (its `generate` port) is adapted from the `ModelGateway` (population_generator role) — see Step-2.5 Q1.
- [ ] **Function-level e2e (real PG + fake gateway, LESSONS §24):** `runWorker(composeRunWorkerDeps({...}))` over a real Postgres event store + a multi-role fake gateway drives a run to terminal; asserts (a) ≥2 generations ran, (b) gen-1's agenomes derive from gen-0's reproduced offspring (gen N+1 evolves from gen N), (c) the run reaches a terminal `run.completed`/`run.failed` with a `finalIdeaRef` when survivors exist. The TRUE path: real council+checks+judge (verify) → score → reproduce → thread.
- [ ] No safety-rule regression: caps kernel-enforced (rule #1 — the worker/loop owns it), append-only (rule #2), energy success-only (rule #8), replay-faithful seams (rule #7), gateway port only (rule #9). The composition wires; it doesn't bypass any kernel enforcement.
- [ ] All tests pass; `/preflight` clean (repo-wide — the verifier format-fix #16 landed first).

## Wiring / entry point (Step 7.5)
The composition root IS the wiring layer — its consumer is the demo `POST /runs` trigger (W3b-2b, `selection-016`) which calls it to start a run. This slice proves it via the function-level e2e (direct `runWorker(composed deps)` call). The production HTTP entry point (`POST /runs` → this composition → runWorker) lands at W3b-2b. Name the handoff in the test header.

## Files expected to touch
**New (selection-authored composition — NOT cross-territory edits):**
- `apps/api/src/boot/composeRuntime.ts` — `composeRunWorkerDeps` + the GenerationGateway adapter + the single-rubric wiring.
- `apps/api/test/integration/boot/compose-runtime.test.ts` — the function-level e2e.

**Modified:**
- `apps/api/src/boot/index.ts` (NEW barrel) or an existing barrel — export `composeRunWorkerDeps`.

If the composition needs a small adapter beyond this (e.g. a `ModelGateway`→`GenerationGateway` shim), keep it in `boot/` and flag at Step 2.5.

## RED test outline (apps/api/test/integration/boot/compose-runtime.test.ts)
1. **`test_composes_runWorkerDeps_with_all_three_real_seams`** — Asserts: `composeRunWorkerDeps` returns deps whose `seams.verify/score/reproduce` are the real adapters + `nextPopulation` set. Why: the composition contract.
2. **`test_single_immutable_rubric_wired_to_judge_and_score`** — run the e2e; Asserts: a candidate's `fitness.scored.components.judge_acceptance` is `present`/non-default (the score seam's rubric policyVersion matches the verify-produced `judge.reviewed.rubricPolicyVersion`). Why: rule #6 single-source (else a version-mismatch silent absence).
3. **`test_function_level_evolution_multi_generation`** — THE e2e: `runWorker(composed deps)` over real PG + fake gateway. Asserts: ≥2 generations; gen-1 agenomes derive from gen-0 reproduced offspring; terminal run.completed with finalIdeaRef. Why: §8 end-to-end evolution on the true path.
4. **`test_run_terminates_within_caps`** — Asserts: the run halts at maxGenerations / maxPopulation (kernel-enforced) — bounded by construction. Why: rule #1 (composition doesn't bypass caps).
5. **`test_replay_after_run_is_provider_free`** — after the e2e run, replay the persisted log; Asserts: state-equivalent reconstruction with zero gateway calls. Why: rule #7 end-to-end (the whole pipeline replays).

## Cross-doc invariant impact
- **Model field changes:** none (composition wires frozen contracts + existing seams).
- **Orchestrator doc rows to write hot:** none. Convention/arch-note bank for the cody handoff.
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **`ModelGateway`→`GenerationGateway` adapter.** runWorker wants `gateway: GenerationGateway` ({generate(req)→GenerateResult}); the seams want `ModelGateway`. My default vote: **a thin adapter in `boot/`** mapping `GenerationGateway.generate` → `modelGateway.generate` (population_generator role), relaying toolCalls/attemptFailures. Flag if an adapter already exists in runtime.
2. **Rubric source.** `DEFAULT_JUDGE_RUBRIC` — where's the canonical const? My default vote: **import the verifier's canonical `DEFAULT_JUDGE_RUBRIC`** (the same one `runJudge` defaults to) so verify + score share ONE source (rule #6, LESSONS §5 single-source). Flag if it's not exported / needs sourcing from config.
3. **cullPolicy + bounds sources.** `createScoreSeam` needs `cullPolicy`, `createReproduceSeam` needs `bounds: MutationBounds`. My default vote: **from `AppConfig`** if present, else module-level defaults in `boot/` (documented MVP constants). Flag if these belong in `AppConfig` (a config-schema follow-up).
4. **`composeRunWorkerDeps` returns deps vs starts the run.** My default vote: **returns `RunWorkerDeps`** (pure assembly; the caller runs `runWorker`) — keeps it testable + lets W3b-2b's trigger own the fire-and-forget. Flag if a `startRun(runId)` convenience is cleaner for the demo trigger.

## Dependencies + sequencing
- **Depends on:** W3b-1 threading impl (`selection-014`, `3485220`) + the merged VerifySeam + W1/W2 seams + W3a hook + the format-fix (#16, so repo-wide preflight is clean).
- **Blocks:** W3b-2b demo POST /runs trigger + HTTP e2e (`selection-016`).

## Estimated commit count
**1.** One selection-authored composition slice (`feat(selection):` or `feat(boot):` — a NEW module, no cross-area edits) + the function-level e2e. SOLO — the demo trigger (cross-territory) is W3b-2b. Sizable but one logical unit (the assembly + its proof).

## Lessons-logged candidates anticipated
- **Convention candidate** — "the boot composition root assembles runWorker from INJECTED infra + the real subsystem seams, sourcing ONE immutable judge rubric to BOTH the verifier (judge) and selection (judgeAcceptance) so the candidateId-join version matches (rule #6 single-source); a fake gateway injected into the real createGateway drives the deterministic e2e (LESSONS §24)."
- **Architecture-doc note candidate** — §5/§8/§11: the production boot path (config → gateway → 3 seams + threading → runWorker); the single-rubric wiring.
- **Future TODO (W3b-2b)** — the demo POST /runs → composition → runWorker trigger + HTTP e2e.

## How to invoke
1. Read end-to-end — note the rule-#6 single-rubric acceptance bullet (load-bearing).
2. `/tdd boot_composition_root`.
3. Step 0 — confirm restatement.
4. Step 2.5 — answer the 4 design questions (or defaults).
5. Step 9 — categorized flags.
