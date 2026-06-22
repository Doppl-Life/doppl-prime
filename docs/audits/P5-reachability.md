# P5 Phase-Exit Reachability Audit (Re-run after cleanup commit f07367d)

**Branch:** `track/selection` · **HEAD:** `f07367d` (cleanup commit)  
**Date:** 2026-06-22  
**Scope:** `apps/api/src/selection/**` + `apps/api/src/boot/**`  
**Auditor:** reachability-auditor subagent  
**Prior run HEAD:** `a0fe329` — 4 unreachable flagged (BLOCKED)

---

## Cleanup changes verified (f07367d)

| Prior flag | Action taken | Status |
|---|---|---|
| `selectParents` + types (`SelectParentsInput`/`SelectParentsResult`) | `parent-selection.ts` + its test deleted (83 + 136 lines) | CONFIRMED GONE — no trace in `src/` or `selection/index.ts` |
| `jaccardSimilarity` barrel export | Removed from `selection/index.ts`; function kept module-internal in `lexical-fallback.ts` | CONFIRMED GONE from barrel; still used by `lexicalNoveltyScore` → reachable via production path |

---

## Production entry-point chain (unchanged, verified)

```
POST /runs (routes/runs.ts)
  → onRunConfigured (server.ts BuildServerDeps.onRunConfigured — optional hook)
  → createStartRun / startRun.ts (boot/startRun.ts)
  → composeRunWorkerDeps (boot/composeRuntime.ts) → runWorker (runtime/worker/runWorker.ts)
  → runGenerationLoop (runtime/loop/generationLoop.ts)
      seams.score     = createScoreSeam         (selection/seams/score-seam.ts)
      seams.reproduce = createReproduceSeam      (selection/seams/reproduce-seam.ts)
      deps.nextPopulation = createSuccessorThreading (selection/seams/successor-threading.ts)
```

---

## Symbol table — selection area (49 exported symbols from `selection/index.ts`)

### Seam entry points (wired by `composeRunWorkerDeps`) — REACHABLE

| Symbol | File | Wired via |
|---|---|---|
| `createScoreSeam` | `seams/score-seam.ts` | `composeRunWorkerDeps` → `seams.score` |
| `ScoreSeamDeps` (type) | `seams/score-seam.ts` | same |
| `createReproduceSeam` | `seams/reproduce-seam.ts` | `composeRunWorkerDeps` → `seams.reproduce` |
| `ReproduceSeamDeps` (type) | `seams/reproduce-seam.ts` | same |
| `createSuccessorThreading` | `seams/successor-threading.ts` | `composeRunWorkerDeps` → `deps.nextPopulation` |
| `SuccessorThreadingDeps` (type) | `seams/successor-threading.ts` | same |

### Domain functions called by the score seam — REACHABLE (transitive)

| Symbol | File | Reached via |
|---|---|---|
| `scoreNovelty` | `novelty/score-novelty.ts` | `createScoreSeam` → `scoreNovelty` |
| `NoveltyComparison`, `NoveltyEmitter`, `ScoreNoveltyDeps`, `ScoreNoveltyInput`, `ScoreNoveltyResult` (types) | same | same |
| `cosineSimilarity` | `novelty/cosine.ts` | `scoreNovelty` → `cosineSimilarity`; also `parentDistance` → `cosineSimilarity` |
| `noveltyFromSimilarities` | `novelty/cosine.ts` | `scoreNovelty` → `noveltyFromSimilarities`; also `lexicalNoveltyScore` → `noveltyFromSimilarities` |
| `lexicalNoveltyScore` | `novelty/lexical-fallback.ts` | `scoreNovelty` degrade path → `lexicalNoveltyScore` |
| `embed` | `novelty/embed.ts` | `scoreNovelty` → `embed` |
| `EmbedDeps`, `EmbedResult` (types) | `novelty/embed.ts` | same |
| `energyEfficiency` | `components/energy-efficiency.ts` | `createScoreSeam` → `energyEfficiency` |
| `EnergyEfficiencyResult` (type) | same | same |
| `criticScores` | `components/critic-scores.ts` | `createScoreSeam` → `criticScores` |
| `CriticScoresResult` (type) | same | same |
| `JUDGE_ACCEPTANCE_KEY` | `components/judge-acceptance.ts` | `scoreFitness` → policy key |
| `judgeAcceptance` | `components/judge-acceptance.ts` | `createScoreSeam` → `judgeAcceptance` |
| `JudgeAcceptanceResult` (type) | same | same |
| `applyScoringPolicy` | `fitness/policy.ts` | `scoreFitness` → `applyScoringPolicy` |
| `NOVELTY_KEY`, `ENERGY_EFFICIENCY_KEY`, `CRITIC_SCORES_KEY`, `SUBTYPE_CHECK_KEY` | `fitness/policy.ts` | `scoreFitness` → component keys |
| `Contribution`, `ScoringResult` (types) | `fitness/policy.ts` | same |
| `scoreFitness` | `fitness/score-fitness.ts` | `createScoreSeam` → `scoreFitness` |
| `FitnessEmitter`, `ScoreFitnessDeps`, `ScoreFitnessInput` (types) | same | same |
| `cull` | `cull.ts` | `createScoreSeam` → `cull` |
| `AgenomeFitness`, `CullDeps`, `CullEmitter`, `CullInput`, `CullPolicy`, `CullResult`, `ScoredCandidate` (types) | `cull.ts` | same |

### Domain functions called by the reproduce seam — REACHABLE (transitive)

| Symbol | File | Reached via |
|---|---|---|
| `assembleSuccessor` | `successor.ts` | `createReproduceSeam` → `assembleSuccessor` |
| `SuccessorChild`, `SuccessorDeps`, `SuccessorInput`, `SuccessorParent`, `SuccessorResult` (types) | same | same |
| `allocate` | `allocation.ts` | `assembleSuccessor` → `allocate` |
| `Allocation`, `AllocationParent` (types) | same | same |
| `reproduce` | `reproduction/reproduce.ts` | `assembleSuccessor` → `reproduce` |
| `ReproduceDeps`, `ReproduceInput`, `ReproduceResult` (types) | same | same |
| `applyReproduction` | `reproduction/reproduce.ts` | `createSuccessorThreading` → `applyReproduction` |
| `applyFusion`, `fuse` | `reproduction/fuse.ts` | `reproduce` → `fuse` / `applyFusion` |
| `FuseDeps`, `FuseInput`, `FuseResult`, `FusionEmitter` (types) | same | same |
| `abortInsufficientParents`, `reproduceMutationOnly` | `reproduction/degenerate.ts` | `reproduce` → degenerate paths |
| `DegenerateDeps`, `DegenerateOutcome`, `ReproductionContext`, `SelectionEmitter` (types) | same | same |
| `applyMutation`, `mutate` | `reproduction/mutate.ts` | `reproduce` → `mutate` / `applyMutation` |
| `ApplyMutationDeps`, `MutateDeps`, `MutationBounds`, `MutationSummary` (types) | same | same |
| `crossover`, `reconstructCrossover` | `reproduction/crossover.ts` | `fuse` → `crossover` / `reconstructCrossover` |
| `ChildTraits`, `CrossoverChoices`, `CrossoverResult`, `Parent` (types) | same | same |
| `parentDistance`, `selectDistantPair` | `reproduction/parent-distance.ts` | `assembleSuccessor` → `parentDistance`; `fuse` → `selectDistantPair` |
| `FusionParent` (type) | same | same |
| `createRng` | `reproduction/rng.ts` | `fuse`, `degenerate`, `parent-distance` → `createRng` |
| `Rng` (type) | same | same |

---

## Boot area (4 exports from `boot/index.ts`)

| Symbol | File | Status |
|---|---|---|
| `composeRunWorkerDeps` | `boot/composeRuntime.ts:113` | REACHABLE — called by `startRun.ts:61` |
| `ComposeRuntimeInput` (type) | `boot/composeRuntime.ts:35` | REACHABLE — same |
| `createStartRun` | `boot/startRun.ts:54` | ACCEPTED-DEFERRED — see below |
| `StartRunInfra` (type) | `boot/startRun.ts:31` | ACCEPTED-DEFERRED — same |

---

## ACCEPTED-DEFERRED symbols (2 — human-accepted, named consumers, NOT blocking)

### 1. `createStartRun` / `StartRunInfra`

- **File:** `apps/api/src/boot/startRun.ts:54` / `:31`
- **Exported via barrel:** `boot/index.ts:7-8`
- **Currently referenced from:** integration e2e test — `test/integration/routes/runs-execution.e2e.test.ts:14,133`
- **Named production consumer:** Phase-D bootstrap — `buildServer({ onRunConfigured: createStartRun(infra) })` in the not-yet-authored `src/main.ts` (or equivalent Phase-D startup script). `server.ts:59-61` documents the hook and its intended wiring.
- **Ruling:** ACCEPTED-DEFERRED. e2e test exercises the real production code path (real Postgres, real Fastify, real seams). The missing piece is the server bootstrap file, not the function.
- **Phase:** Phase D bootstrap.

### 2. `noveltyScoreOf`

- **File:** `apps/api/src/selection/novelty/cosine.ts:53`
- **Exported via barrel:** `selection/index.ts:7`
- **Currently referenced from:** test only — `test/unit/selection/novelty/cosine.test.ts`, `test/unit/selection/novelty/score-novelty.test.ts`
- **Named production consumer:** demo/Phase-D replay path — the replay-faithful recompute helper for the `/replay-summary` or equivalent replay reader. Documented in `cosine.ts:49-57` as "the replay-faithful entry."
- **Ruling:** ACCEPTED-DEFERRED. Rule-#7 helper (replay-recompute, never re-embeds). Consumer is the Phase-D replay path, not yet authored.
- **Phase:** Phase D / demo replay slice.

---

## Summary for orchestrator

reachability-auditor: selection + boot — 53 exports audited  
  REACHABLE: 51  
  UNREACHABLE: 0  
  ACCEPTED-DEFERRED: 2 (named consumers, human-accepted)

Cleanup verified:
- `selectParents` + types (`SelectParentsInput`/`SelectParentsResult`): DELETED (parent-selection.ts + test removed in f07367d). Zero traces in src/.
- `jaccardSimilarity`: REMOVED from barrel (f07367d). Remains module-internal in `lexical-fallback.ts`; reachable via `lexicalNoveltyScore` in the production path.

Accepted-deferred (NOT blocking):
- `createStartRun` / `StartRunInfra` — Phase-D bootstrap (`src/main.ts`); e2e-proven.
- `noveltyScoreOf` — Phase-D / demo replay path; rule-#7 replay-recompute helper.

**Phase-exit gate: CLEAR**

No unexpected unreachable exports. The 2 accepted-deferred symbols have named Phase-D consumers and are e2e-exercised or documented. Zero new/unexpected gaps introduced by the cleanup commit.
