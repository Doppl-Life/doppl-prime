# selection-003 — Phase 5 selection wiring pass (W1→W3b-2b): operator-command-to-organism loop closed

- **Date:** 2026-06-22
- **Phase:** 5 (Selection, scoring & reproduction) — the deferred-wiring + production-reachability pass
- **Track:** `selection` (branch `track/selection`)
- **Predecessor:** [selection-002](selection-002-2026-06-21-phase5-orchestration-roundclose.md)
- **Successor:** [selection-004](selection-004-2026-06-22-P5.7-reachability-cleanup.md) — P5.7 reachability cleanup (remove dead exports → `/phase-exit P5` true-CLEAR)

## Why this session existed

Phase-5 selection *logic* (P5.1–P5.11) was built + unit-green in the prior round but **deferred its wiring** to the real runtime: the seams were faked against frozen contracts. This session resumed after the cody merge (P3 loop + P4 verifier + demo + contracts sv3→sv5 merged to the integration branch) and ran the **wiring pass** — connecting selection's seams to the real P3 generation loop + P4 verifier events, then standing up the production path so the whole organism is reachable from the operator's `POST /runs` HTTP command. The headline goal: prove **gen N+1 evolves from gen N** end-to-end on the true verify→score→reproduce→thread path.

## What was built (9 commits)

| Slice | Commit | Summary |
|---|---|---|
| W1 score-seam (P5.6/P5.7) | `6194348` | `createScoreSeam(deps)→ScoreSeam` — selection's real impl of the kernel score port; per-candidate novelty → persisted-evidence read via `readByRun` → 5-component fitness (incl. the held-out-judge `candidateId` join) → `fitness.scored` → `cull`-after-all. |
| P5.8 mutate rule-#7 fix | `2a65c5a` | **Defect caught by W2's round-trip test:** `reconstructChild` built `mutationMeta` key-order-sensitively (`Object.keys`/`JSON.stringify`); Postgres jsonb reorders keys → live child ≠ replayed child (broke §31 state-equivalence). Fix: canonical sorted-key provenance. |
| W2 reproduce-seam (P5.10/P5.11) | `609a811` | `createReproduceSeam(deps)→ReproduceSeam` — projects heuristic parent weights from the persisted log → `assembleSuccessor` (caps-clamped allocation → fusion/mutation_only/abort) → emits `agenome.fused`/`reproduced`/`fusion.started`. |
| W3a kernel hook + rule-#1 clamp (P5.11) | `207a0a8` | **Cross-territory (kernel on loan):** additive optional `nextPopulation?` hook on `GenerationLoopDeps` (mirrors `onIteration` §71) + `runWorker` forward; `const population`→`let`; a guarded boundary call that CLAMPS the hook's return to `maxPopulation` (rule #1 — human-authorized guardrail lift). |
| W3b-1 successor-threading impl (P5.11) | `3485220` | `createSuccessorThreading(deps)` — the real `nextPopulation` impl: reconstruct gen N's offspring via `applyReproduction` (rule #7, no gateway/rng) → re-home to gen N+1 (seeded, spawnBudget kernel-clamped) → return. **Proves gen N+1 from gen N** over real PG with all 3 real seams. |
| style: verifier reformat | `f03a363` | **Cross-territory (verifier on loan):** prettier-only reformat of 2 verify-seam test files the cody merge left format-dirty; unblocked repo-wide `format:check`/`/preflight`. Zero content change. |
| W3b-2a boot composition root (P5.11) | `5fdd59d` | `composeRunWorkerDeps` (new `src/boot/`) — assembles `RunWorkerDeps` from injected infra + all 3 real seams + the threading hook; ONE `DEFAULT_JUDGE_RUBRIC` single-sourced to verify (judge) + score (judgeAcceptance) — rule #6. Function-level e2e: `runWorker(composed)` evolves. |
| W3b-2b POST /runs trigger (P5.11) | `635c0ee` | **Cross-territory (demo on loan):** additive optional `onRunConfigured?` on the route/server + `boot/startRun.ts` (fire-and-forget, error- + hook-throw-safe). **The production entry point** — POST /runs → run.configured → trigger → runWorker → evolution loop. HTTP e2e proves it. |
| W3b-2c per-run config honored (P5.11) | `beb36b2` | `startRun` reads `run.configured` → `composeRunWorkerDeps` merges the recorded caps/rngSeed/enabledSubtypes over the boot AppConfig, **clamped** to the boot ceiling (rule #1, all 6 dims `min`); immutables (scoringPolicy/rubric/seedSet) stay boot. **recorded == executed** (a custom POST config is what runs). |

### Files created
- `apps/api/src/selection/seams/score-seam.ts` — `createScoreSeam` + `ScoreSeamDeps` (W1).
- `apps/api/src/selection/seams/reproduce-seam.ts` — `createReproduceSeam` + `ReproduceSeamDeps` + exported pure `projectSuccessorParents` (W2).
- `apps/api/src/selection/seams/successor-threading.ts` — `createSuccessorThreading` + `SuccessorThreadingDeps` (W3b-1).
- `apps/api/src/boot/composeRuntime.ts` — `composeRunWorkerDeps` + the `ModelGateway→GenerationGateway` adapter + MVP boot defaults (W3b-2a).
- `apps/api/src/boot/index.ts` — boot barrel (W3b-2a/W3b-2b).
- `apps/api/src/boot/startRun.ts` — `createStartRun` fire-and-forget run trigger (W3b-2b).
- Integration tests: `test/integration/selection/{score-seam,reproduce-seam,successor-threading}.test.ts`, `test/integration/boot/compose-runtime.test.ts`, `test/integration/routes/runs-execution.e2e.test.ts`.

### Files modified
- `apps/api/src/selection/index.ts` — barrel exports for the 3 seams + threading.
- `apps/api/src/selection/reproduction/mutate.ts` + `test/unit/selection/reproduction/mutate.test.ts` — the rule-#7 canonicalization fix + regression (#13).
- **Kernel-on-loan (W3a):** `src/runtime/loop/generationLoop.ts` (NextPopulationArgs + hook + clamp), `src/runtime/worker/runWorker.ts` (forward), `src/runtime/index.ts` (export) + their unit tests.
- **Verifier-on-loan (#16):** `test/{unit,integration}/verifier/verify-seam.test.ts` (reformat only).
- **Demo-on-loan (W3b-2b):** `src/routes/runs.ts` (additive `onRunConfigured?` + call), `src/server.ts` (additive pass-through).
- **W3b-2c (selection-pure):** `src/boot/composeRuntime.ts` (optional `perRunConfig` + `mergePerRunConfig` clamp), `src/boot/startRun.ts` (reads run.configured → `perRunConfig`) + their integration tests.

## Decisions made
- **Q2 (W3b-1) — no novelty-vector join:** `applyReproduction` doesn't read `noveltyVector` on replay (resolves parents by id + reconstructs from `crossoverPoints`; `selectDistantPair` is live-only), so the threading pool is `eligibleParents.map(a => ({agenome: a}))` — simpler than the brief's default, orchestrator-verified.
- **W3a clamp (human Option 1):** the kernel loop defensively clamps the hook's returned population to `maxPopulation` (un-bypassable hint, like spawnBudget) — guardrail #1 lifted for that one call-site line; security-verified.
- **Rule #6 single-rubric (W3b-2a):** one `DEFAULT_JUDGE_RUBRIC` wired to BOTH verify + score so the candidateId-join `judge_acceptance` is present (not a version-mismatch absence). e2e pins `judge_acceptance === persisted JudgeResult.acceptance` verbatim.
- **Fire-and-forget robustness (W3b-2b):** `void runWorker(...).catch().finally()` with both hook bodies try/catch-wrapped (the in-slice fix for the security `[low]`) — a worker/hook failure can never crash the HTTP server; the run's failure is authoritative in the log.
- **nextGenerationId derivation (W3b-1):** derived from the loop's `${runId}-gen{N}` scheme with a fail-loud guard (couples to the id convention by design; the child's generationId is record-consistency-only).
- **W3b-2c per-run config (human Option B, LANDED `beb36b2`):** the worker now executes the recorded `run.configured` config (caps/rngSeed/enabledSubtypes), clamped to the boot ceiling (rule #1, all 6 dims `min`-clamped, both `config.caps` + `runConfig.caps` set); immutables stay boot. **Process note:** a lead↔orchestrator path-A (cycle) ↔ path-B (finish) cross occurred — I'd prematurely path-A-reverted + `/session-end` (690397d); the orchestrator's path-B APPROVED won, I rejected a stale-premise shutdown, re-applied + finished. (Auto-memory banked the cross-directive lesson.)

## Decisions explicitly NOT made (deferred)
- **Route-max ↔ boot-ceiling alignment (Option-B residual, flagged to the human):** full `recorded == executed` for ALL route-accepted configs requires the route maxima (`buildServer.defaultConfig.caps`) == the boot ceiling (`loadConfig` top-level caps). They CAN diverge (`DEFAULT_RUN_CONFIG.caps` 5/10 ≠ the e2e boot ceiling 2/2), so a route-accepted-but-above-boot config still clamps → `recorded≠executed`. W3b-2c's clamp is the rule-#1 backstop that keeps the divergence SAFE (clamps, never raises). The residual fix = align `buildServer.defaultConfig` with the boot ceiling at the Phase-D production boot root (boot-wiring, demo-adjacent) — NOT done here (orchestrator routes to the human).
- **Q1 nextGenerationId via NextPopulationArgs** (W3a follow-up) — cleaner than the id-scheme coupling; non-blocking.
- **cullPolicy + MutationBounds → AppConfig** — currently boot MVP defaults; a config-schema follow-up.
- **toolCalls/attemptFailures relay** in the boot gateway adapter — the frozen ModelGateway port can't carry them; lands with the production gateway tool surface (Phase-D).

## TDD compliance
**CLEAN — no violations.** Every slice was test-first (RED confirmed for the right reason before impl). The P5.8 fix (#13) was regression-test-first (a key-reordered reconstruction test, RED without the fix). All Step-2.5 reviews ran; one `ADD` (W2 round-trip equality) caught the real rule-#7 defect.

## Reachability
The wiring pass closed the chain — **the entire selection surface is now reachable from the operator HTTP command:**
- `POST /runs` (route) → `run.configured` append → `onRunConfigured` (W3b-2b) → `createStartRun` → `runWorker` → `runGenerationLoop` with `seams = {verify, score, reproduce}` + `nextPopulation` (all injected by `composeRunWorkerDeps`, W3b-2a).
- score-seam ← `generationLoop.ts:447 seams.score`; reproduce-seam ← `:466 seams.reproduce`; threading ← the `nextPopulation` boundary call.
- Proven end-to-end by `test_http_e2e_multi_generation_evolution` (POST → ≥2 gens → gen N+1 from gen N → terminal `run.completed{finalIdeaRef}`).
- **No tested-but-unwired gaps** — the final slice (W3b-2b) wired the last link.

## Open follow-ups
- **Route-max ↔ boot-ceiling alignment (W3b-2c residual)** — see "Decisions explicitly NOT made"; the orchestrator routes it to the human as a Phase-D boot-wiring follow-up (align `buildServer.defaultConfig` with the boot ceiling). W3b-2c's clamp makes the current divergence clamp-safe.
- **Cross-territory manifests for the respective leads' merge review:** kernel (`generationLoop.ts`, `runWorker.ts`, `runtime/index.ts` — W3a, incl. the human-authorized clamp line) + demo (`routes/runs.ts`, `server.ts` — W3b-2b, additive) + verifier (the #16 reformat).
- **Banked future-TODOs:** Q1 nextGenerationId via NextPopulationArgs; cullPolicy/bounds → AppConfig; toolCalls relay (Phase-D); comparison-set O(n²) per generation (operational, fine at MVP caps).
- **Convention/arch-note candidates** (orchestrator banks at the cody handoff): the seam-factory pattern; canonical sorted-key provenance for jsonb-persisted/replayed denormalized fields (§31/§46); the additive-optional-kernel-hook pattern; the single-rubric boot wiring; the operator-command-to-organism path.

## How to use what was built
Start a run from the HTTP edge: `POST /runs` with a `RunConfig` body → 201 `{runId}` → the run executes in-process (fire-and-forget) → observe via the event log / GET endpoints. The production boot caller wires `onRunConfigured: createStartRun({config, modelGateway, eventStore, checkRegistry, listRunIds, newId})` into `buildServer` (real `listRunIds` from projections).
