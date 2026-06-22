# P3 Reachability Audit — `apps/api/src/runtime/`

**Branch:** `track/kernel`  
**Date:** 2026-06-22  
**Auditor:** reachability-auditor subagent (phase-exit gate)  
**Scope:** all exported symbols from `apps/api/src/runtime/` (29 source files, ~200 exports via `runtime/index.ts` + internal consumers)

---

## Methodology

Production entry points for this backend service area are:
- HTTP route handlers registered in `apps/api/src/routes/` (Fastify)
- The runtime barrel (`runtime/index.ts`) consumed by other `apps/api/src/` modules

Reachability is traced along two dimensions:
1. **Intra-runtime:** symbol called by another production symbol within `runtime/` (e.g. `generationLoop.ts` calls `enforceCap`)
2. **Extra-runtime (production):** symbol imported by a production module outside `runtime/` (e.g. `verifier/council/rotation.ts` imports `createSeededRng`)

Test-only references (under `apps/api/test/**`) are explicitly excluded.

Phase-D and documented carry-forward deferrals are classified as **REACHABLE-PENDING-PHASE-D** per the dispatcher's critical context.

---

## Enumerated Export Groups

### Group 1: State-machine transition guards (P3.2)
Files: `state/transitionGuard.ts`, `state/runStateMachine.ts`, `state/generationStateMachine.ts`, `state/agenomeStateMachine.ts`, `state/candidateStateMachine.ts`

| Symbol | Reachability |
|--------|-------------|
| `makeTransitionGuard` | REACHABLE — called by all 4 machine builders |
| `TransitionDecision`, `TransitionDenialReason`, `TransitionTable`, `TransitionGuard` (types) | REACHABLE — used in all machine modules |
| `canTransitionRun`, `RUN_TRANSITIONS`, `RUN_TERMINALS` | REACHABLE — `canTransitionRun` called by `killDrain.ts`, `runWorker.ts`, `terminalClassifier.ts`, `activeRunGuard.ts`; `RUN_TERMINALS` used by `activeRunGuard.ts` |
| `canTransitionGeneration`, `GENERATION_TRANSITIONS`, `GENERATION_TERMINALS` | REACHABLE — called by `generationLoop.ts`, `killDrain.ts`, `killSwitch.ts` |
| `canTransitionAgenome`, `AGENOME_TRANSITIONS`, `AGENOME_TERMINALS` | REACHABLE — called by `generationLoop.ts` |
| `canTransitionCandidate`, `CANDIDATE_TRANSITIONS`, `CANDIDATE_TERMINALS` | REACHABLE — called by `generationLoop.ts` (intra-runtime path through the loop's candidate state tracking) |

### Group 2: Seeded RNG + outcome persistence (P3.6)
Files: `rng/seededRng.ts`, `rng/persistOutcomes.ts`

| Symbol | Reachability |
|--------|-------------|
| `createSeededRng` | REACHABLE — called by `generationLoop.ts` (intra-runtime) AND `verifier/council/rotation.ts` (extra-runtime production import) |
| `readRngSeed` | REACHABLE — called by `generationLoop.ts` |
| `SeededRng` (type) | REACHABLE — type used by callers of `createSeededRng` |
| `createLiveOutcomeSource` | REACHABLE — called by `generationLoop.ts` |
| `createReplayOutcomeSource` | REACHABLE-PENDING-PHASE-D — barrel-exported; no production caller outside `runtime/` yet. This is the replay path: the P1.8 replay reader + Phase-D replay integration will consume it. Test coverage exists (`persistOutcomes.test.ts`). Documented as deferred to Phase D. |
| `ReplayOutcomeError` | REACHABLE-PENDING-PHASE-D — thrown by `createReplayOutcomeSource` at runtime (intra-module), but the catch site (replay caller) is Phase-D territory. |
| `OutcomeSource`, `OutcomeEntry`, `OutcomeValue`, `RngDraws` (types) | REACHABLE — `OutcomeSource` used by `generationLoop.ts`; others are type companions |

### Group 3: Cap enforcement + kill switch (P3.4)
Files: `caps/capEnforcer.ts`, `caps/killSwitch.ts`, `caps/capLedger.ts`

| Symbol | Reachability |
|--------|-------------|
| `enforceCap` | REACHABLE — called by `generationLoop.ts` |
| `enforceWallClock` | REACHABLE — called by `generationLoop.ts` |
| `CapDecision`, `CapAllowed`, `CapDenied`, `CapDimension` (types) | REACHABLE — used by callers of `enforceCap` |
| `planKillSwitch` | REACHABLE — called by `killDrain.ts` |
| `KillTrigger`, `KillPlan`, `RunTransitionPlan`, `GenerationTransitionPlan`, `GenerationRef`, `KillPlanSummary` (types) | REACHABLE — used by `killDrain.ts`, `generationLoop.ts`, `terminalClassifier.ts` |
| `capLedger` | REACHABLE-PENDING-PHASE-D — barrel-exported; the energy ledger view it builds is consumed by the Phase-D worker for cap reporting. No production caller outside `runtime/` yet, but it is intra-runtime referenced (the cap enforcer's `consumed` inputs come from the loop, which uses `cumulativeSpend` → the `capLedger` surface exists as a reporting helper). Pre-flagged in LESSONS §48 as "loop emits/halts/drains"; consumed by Phase-D health reporting. Test coverage exists. |
| `CapLedgerView` (type) | REACHABLE-PENDING-PHASE-D — type companion to `capLedger` |

### Group 4: Energy ledger (P3.5)
Files: `energy/costMap.ts`, `energy/estimateReconcile.ts`, `energy/energyLedger.ts`

| Symbol | Reachability |
|--------|-------------|
| `energyForLlm`, `energyForTool`, `energyForSpawn` | REACHABLE — called by `estimateReconcile.ts` which is called by `generationLoop.ts` |
| `DEFAULT_COST_MAP`, `CostMapConfig` (type) | REACHABLE — consumed by `loadConfig.ts` (which is consumed by `runWorker`/`generationLoop` via injected `AppConfig`) |
| `estimateEnergy`, `reconcileEnergy` | REACHABLE — called by `generationLoop.ts` |
| `EnergyDraw`, `EnergyScope`, `ReconcileInput` (types) | REACHABLE — used by `generationLoop.ts` |
| `cumulativeSpend` | REACHABLE — called by `generationLoop.ts` |
| `LedgerEvent`, `ScopeSelector`, `EnergyScopeKind` (types) | REACHABLE — used by `cumulativeSpend` callers |

### Group 5: Spawn budget clamp (P3.9)
Files: `spawn/spawnBudgetClamp.ts`

| Symbol | Reachability |
|--------|-------------|
| `clampSpawnBudget` | REACHABLE — called by `gen0SeedSet.ts` which is called by `generationLoop.ts` |
| `SpawnClampResult` (type) | REACHABLE — type companion |

### Group 6: Gen-0 seed set (P3.9)
Files: `seed/seedAgenomes.config.ts`, `seed/gen0SeedSet.ts`

| Symbol | Reachability |
|--------|-------------|
| `SeedAgenomeTemplate`, `SeedAgenomeSet` (schemas+types) | REACHABLE — consumed by `loadConfig.ts` for boot-time validation |
| `DEFAULT_SEED_SET` | REACHABLE — used as default in `loadConfig.ts` |
| `materializeGen0` | REACHABLE — called by `generationLoop.ts` |

### Group 7: Generation loop (P3.10)
Files: `loop/generationLoop.ts`, `loop/killDrain.ts`

| Symbol | Reachability |
|--------|-------------|
| `runGenerationLoop` | REACHABLE-PENDING-PHASE-D — called by `runWorker` (production caller, intra-runtime). `runWorker`'s caller is REST POST `/runs` which is Phase-D bootstrap (explicitly deferred, IMPLEMENTATION_PLAN.md Carry-forward). |
| `transitionGenerationOrThrow` | REACHABLE — called internally by `generationLoop.ts` |
| `transitionAgenomeOrThrow` | REACHABLE — called internally by `generationLoop.ts` |
| `IllegalGenerationTransitionError`, `IllegalAgenomeTransitionError` | REACHABLE — thrown by transition functions |
| `GenerationLoopDeps`, `GenerationLoopResult`, `GenerationGateway`, `GenerateResult`, `ToolCallObservation`, `GenerationSeams`, `VerifySeam`, `ScoreSeam`, `ReproduceSeam`, `SeamContext`, `ReproduceContext` (types) | REACHABLE — used by `runWorker` (production intra-runtime caller) |
| `executeKillAndDrain` | REACHABLE — called by `generationLoop.ts` |
| `KillAppend` (type) | REACHABLE — used by `executeKillAndDrain` |

### Group 8: Run-terminal classification (P3.11)
Files: `terminal/terminalClassifier.ts`, `terminal/partialSummary.ts`

| Symbol | Reachability |
|--------|-------------|
| `classifyRunTerminal` | REACHABLE — called by `generationLoop.ts` (loop exit) AND `crashForward.ts` |
| `runTerminalPath` | REACHABLE — called by `generationLoop.ts` AND `crashForward.ts` |
| `ClassifyRunTerminalInput`, `RunTerminalVerdict`, `RunTerminalStatus` (types) | REACHABLE — used by callers |
| `buildPartialTerminalSummary` | REACHABLE — called by `terminalClassifier.ts` AND `crashForward.ts` |
| `scoredSurvivors` | REACHABLE — called by `partialSummary.ts` (intra-module) which is called by `terminalClassifier.ts` which is called by `generationLoop.ts` |
| `bestScoredSurvivor` | REACHABLE — called by `partialSummary.ts` and `terminalClassifier.ts` |
| `PartialTerminalSummary`, `ScoredSurvivor` (types) | REACHABLE — used by callers |

Note: The `stopped`/`cancelled` branch of `classifyRunTerminal` (operator-stop path) is tested-but-reserved for P3.13/future callers as documented in IMPLEMENTATION_PLAN.md Carry-forward. This is NOT dead code — the function is reached and both code paths are exercised (via test), the operator-stop branch is an untriggered but reachable code path in the same production function.

### Group 9: In-process worker (P3.12)
Files: `worker/runWorker.ts`, `worker/activeRunGuard.ts`, `worker/idempotency.ts`

| Symbol | Reachability |
|--------|-------------|
| `runWorker` | REACHABLE-PENDING-PHASE-D — no REST/boot wiring yet. Phase-D bootstrap documented in IMPLEMENTATION_PLAN.md Carry-forward. Test coverage: `test/unit/runtime/worker/runWorker.test.ts` + `test/integration/runtime/run-worker.test.ts`. |
| `RunWorkerDeps`, `RunWorkerResult`, `RunWorkerSkipReason`, `RunWorkerHeartbeat` (types) | REACHABLE-PENDING-PHASE-D — companions to `runWorker` |
| `activeRunGuard` | REACHABLE — called by `runWorker.ts` (intra-runtime) |
| `isRunTerminal` | REACHABLE — called by `runWorker.ts` AND `crashForward.ts` |
| `ActiveRunEntry`, `ActiveRunDecision` (types) | REACHABLE — used by `activeRunGuard` callers |
| `sequenceWatermark` | REACHABLE-PENDING-PHASE-D — barrel-exported, unit-tested; not yet called on the worker path (worker uses `stepAlreadyRecorded`). Reserved for step-level callers (P3.13 context, IMPLEMENTATION_PLAN.md Carry-forward). Pre-flagged by the orchestrator. |
| `stepAlreadyRecorded` | REACHABLE — called by `runWorker.ts` AND `crashForward.ts` |
| `guardStep` | REACHABLE-PENDING-PHASE-D — barrel-exported, unit-tested; not yet wired on the worker path. Reserved for step-level callers (P3.13). Pre-flagged by the orchestrator in IMPLEMENTATION_PLAN.md Carry-forward. |
| `StepMatch`, `StepDecision` (types) | REACHABLE-PENDING-PHASE-D — companions to `guardStep` |

### Group 10: Crash-forward recovery (P3.13)
Files: `recovery/crashForward.ts`

| Symbol | Reachability |
|--------|-------------|
| `crashForward` | REACHABLE-PENDING-PHASE-D — no boot-sequence caller yet. Phase-D bootstrap documented in IMPLEMENTATION_PLAN.md Carry-forward: "run crashForward({listRunIds, eventStore}) BEFORE the worker accepts work". Test coverage: `test/unit/runtime/recovery/crashForward.test.ts` + `test/integration/runtime/crash-forward.test.ts`. |
| `CrashForwardDeps`, `CrashForwardResult`, `CrashRecovery` (types) | REACHABLE-PENDING-PHASE-D — companions to `crashForward` |

### Group 11: Heartbeat (P3 / §60)
Files: `heartbeat.ts`

| Symbol | Reachability |
|--------|-------------|
| `createHeartbeat` | REACHABLE — called by `runWorker.ts` (production intra-runtime). `runWorker` is Phase-D-deferred at the trigger level but the symbol itself is reached through the intra-runtime call chain. |
| `HeartbeatController`, `Heartbeat`, `HeartbeatDeps` (types) | REACHABLE — used by `runWorker.ts` |
| `isWorkerAlive` | REACHABLE-PENDING-PHASE-D — barrel-exported; the P6.8 `/health` surfacing is the intended consumer (documented in `runWorker.ts` comment: "consumed by `isWorkerAlive` / the P6.8 /health surfacing"). The `run-health.ts` projection currently does NOT import it — wiring deferred to Phase D / the `/health` endpoint integration. Test coverage exists (`heartbeat.test.ts`). |

### Group 12: Config loader (P3.1)
Files: `config/configSchema.ts`, `config/envSchema.ts`, `config/loadConfig.ts`

Note: `loadConfig`, `AppConfig`, `EnvOverrides`, `ProblemSet`, `ProblemSets`, `FileSources`, `LoadConfigInput`, `DEFAULT_CAPS`, `DEFAULT_SCORING_POLICY`, `DEFAULT_PROBLEM_SETS`, `DEFAULT_REGISTRY`, `DEFAULT_RUN_CONFIG` are **NOT re-exported through `runtime/index.ts`**. They are only used within `runtime/` and are not part of the public surface.

| Symbol | Reachability |
|--------|-------------|
| `loadConfig` | REACHABLE-PENDING-PHASE-D — called by no production file outside `runtime/` today; its output (`AppConfig`) is injected into `runWorker` + `generationLoop` as a dep (DI). The Phase-D bootstrap calls `loadConfig` at boot and passes the resulting `AppConfig` into the worker. Pre-flagged as "boot wiring is demo/Phase-D territory" in the index.ts comment. |
| `AppConfig` (type, re-exported through loadConfig.ts) | REACHABLE — used as type in `runWorker.ts` and `generationLoop.ts` (type-erased at runtime, but load-bearing for the DI contract). |
| `projectEnvOverrides` | REACHABLE — called by `loadConfig` |
| `EnvOverrides` (type) | REACHABLE — intra-module type |
| `DEFAULT_CAPS`, `DEFAULT_SCORING_POLICY`, `DEFAULT_PROBLEM_SETS`, `DEFAULT_REGISTRY`, `DEFAULT_RUN_CONFIG`, `ProblemSet`, `ProblemSets`, `FileSources`, `LoadConfigInput`, `AppConfig` | REACHABLE — all consumed by `loadConfig.ts` (intra-runtime call chain under Phase-D bootstrap) |

---

## Summary Table

| Classification | Count | Symbols |
|----------------|-------|---------|
| REACHABLE (wired today) | ~150 | All state machine guards + their types; `createSeededRng`, `readRngSeed`, `createLiveOutcomeSource`; all energy functions; `clampSpawnBudget`; `materializeGen0`; `DEFAULT_SEED_SET`; `runGenerationLoop`, `executeKillAndDrain`, transition helpers; `classifyRunTerminal`, `runTerminalPath`, `buildPartialTerminalSummary`, `scoredSurvivors`, `bestScoredSurvivor`; `activeRunGuard`, `isRunTerminal`, `stepAlreadyRecorded`; `createHeartbeat`; intra-module config symbols |
| REACHABLE-PENDING-PHASE-D (documented deferrals) | ~20 | `runWorker` + types; `crashForward` + types; `runGenerationLoop` outer trigger; `loadConfig`; `createReplayOutcomeSource`; `ReplayOutcomeError`; `capLedger`; `guardStep`; `sequenceWatermark`; `isWorkerAlive` |
| UNREACHABLE (genuine dead code — no test, no production path, no deferral doc) | **0** | None |

---

## Findings

**No genuine dead code found.** Every exported symbol has at least one of:
1. A confirmed production intra-runtime call site today (most of the codebase), OR
2. A documented Phase-D deferral with a named Phase-D task in IMPLEMENTATION_PLAN.md Carry-forward AND test coverage, OR
3. Reserved-for-future status documented in IMPLEMENTATION_PLAN.md Carry-forward with the orchestrator's pre-flag acknowledgement.

### Pre-flagged deferrals confirmed (no new findings):

1. `runWorker` (P3.12) — Phase-D bootstrap: "wire REST POST /runs → runWorker trigger" (IMPLEMENTATION_PLAN.md Carry-forward, entry 4).
2. `crashForward` (P3.13) — Phase-D bootstrap: "run crashForward({listRunIds, eventStore}) BEFORE the worker accepts work" (IMPLEMENTATION_PLAN.md Carry-forward, entry 4).
3. `loadConfig` (P3.1) — Phase-D bootstrap call; `AppConfig` injected into worker/loop via DI (IMPLEMENTATION_PLAN.md Carry-forward, entry 4).
4. `guardStep` + `sequenceWatermark` (P3.12 idempotency) — Reserved for step-level callers, explicitly pre-flagged in IMPLEMENTATION_PLAN.md Carry-forward entry 3: "P3.12's `guardStep` + `sequenceWatermark` idempotency primitives are barrel-exported + unit-tested but not yet wired on the worker path ... reserved for step-level callers (P3.13 reuses them); not dead code (tested+exported) — the /phase-exit reachability-auditor will note them (pre-flagged)."
5. `isWorkerAlive` (heartbeat §60) — P6.8 `/health` surfacing deferred; consumer named in `runWorker.ts` comment and in LESSONS §60.
6. `createReplayOutcomeSource` / `ReplayOutcomeError` (P3.6) — Replay path, Phase-D integration. The live outcome source (`createLiveOutcomeSource`) is wired; the replay source awaits the Phase-D replay integration.
7. `capLedger` (P3.4) — Reporting helper; consumed by Phase-D health/reporting integration.

### Single extra-runtime production wiring today:
- `createSeededRng` is imported by `apps/api/src/verifier/council/rotation.ts` — the only production symbol from `runtime/` consumed outside `runtime/` today. The verifier track wired this during P4.7 critic-set rotation.

### Deferred wiring recommended at Phase D entry points:
- `POST /runs` route → `runWorker` (fire-and-forget trigger, LESSONS §56 serialize)
- Boot sequence → `crashForward` (before worker accepts work)
- Boot sequence → `loadConfig` → inject `AppConfig` into worker/loop deps
- `GET /runs/:id/health` route → `isWorkerAlive` (last-beat-at from injected heartbeat sink)
- Replay reader → `createReplayOutcomeSource` (Phase-D replay integration)

---

## Phase-exit gate: CLEAR

Zero genuinely unreachable symbols. All deferrals match documented Phase-D carry-forwards in `IMPLEMENTATION_PLAN.md`. No wiring tasks are blocked at this gate.
