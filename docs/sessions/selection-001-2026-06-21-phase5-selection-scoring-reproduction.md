# Session selection-001 — Phase 5: selection / scoring / reproduction (whole phase)

- **Date:** 2026-06-21 → 2026-06-22
- **Phase:** Phase 5 (selection / scoring / reproduction, `ARCHITECTURE.md §8` + §3/§5/§7/§14)
- **Track:** `selection` (worktree `Capstone-selection`, branch `track/selection`)
- **Predecessor session:** none — selection-track inception. Forked from cody freeze-merge `e638d81` (frozen contracts + gateway stub + fixtures) + the P0.16 judge-output-seam merge `19e0833` (mid-session, unblocked P5.5-judge onward).
- **Successor session:** _TBD_

## Why this session existed

Phase 0 (contract freeze) and the kernel freeze bundle (P1/P2) had merged to integration, standing up the selection track to build **all of Phase 5** — the policy-versioned decomposed scorer, novelty, the verifier-evidence fitness components, weak-lineage culling + parent selection, and two-level reproduction (mutation / fusion / dispatcher / successor assembly) — against the frozen contracts, the recorded/fake `ModelGateway` stub, and the canonical fixtures. The whole phase shipped in one continuous implementer session as 10 TDD slices.

## What was built

**Files created — `apps/api/src/selection/`**
- `novelty/cosine.ts` — pure cosine + `1 − max similarity` novelty (zero-norm→0, dim-mismatch throws).
- `novelty/embed.ts` — the sole gateway-touching novelty fn (`embedding` role, port-only); `{ok}` result.
- `novelty/score-novelty.ts` — `scoreNovelty` orchestration + `NoveltyEmitter` seam; P5.3 degrade path (lexical fallback → `novelty_scoring_degraded`); discriminated `ScoreNoveltyResult`.
- `novelty/lexical-fallback.ts` — deterministic token-set Jaccard novelty (the degrade method).
- `components/energy-efficiency.ts` — pure success-only `energyEfficiency(EnergyEvent[])`.
- `components/critic-scores.ts` — pure confidence-weighted critic aggregation (numeric-only; `contributingReviewCount`).
- `components/judge-acceptance.ts` — held-out-judge acceptance read + rubric-load gate (full-5-axis + `immutableToAgents` + policyVersion, fail-closed); `JUDGE_ACCEPTANCE_KEY`.
- `fitness/policy.ts` — pure `applyScoringPolicy` weighted sum (NaN-safe union-key; normalization throw); component-key constants.
- `fitness/score-fitness.ts` — `scoreFitness` composes the 5 components → frozen `FitnessScore`; emits `fitness.scored`; finite-guard.
- `cull.ts` — threshold weak-lineage cull → validated `CullingEvent` → one batch `lineage.culled`.
- `parent-selection.ts` — eligible-only, fitness-ranked, order-independent seeded tie-break; `zeroSurvivors` flag.
- `reproduction/rng.ts` — deterministic mulberry32 PRNG.
- `reproduction/mutate.ts` — bounded `mutate` (live) + `applyMutation` (replay) sharing `reconstructChild`.
- `reproduction/parent-distance.ts` — `parentDistance` (1−cosine over persisted vectors) + `selectDistantPair`.
- `reproduction/crossover.ts` — deterministic structured-trait splice + `reconstructCrossover`.
- `reproduction/fuse.ts` — two-level `fuse` (crossover + gateway synthesis, rule-#5 in/out) + `applyFusion` replay.
- `reproduction/degenerate.ts` — `reproduceMutationOnly` + `abortInsufficientParents`; the shared `SelectionEmitter` type.
- `reproduction/reproduce.ts` — distinct-parent dispatcher + `applyReproduction` mode-keyed replay.
- `allocation.ts` — heuristic largest-remainder allocation, caps-clamped (rule #1 hint).
- `successor.ts` — `assembleSuccessor` (anchor schedule → `reproduce` per slot; runtime handoff, no kernel import).
- 17 `test/unit/selection/**` test files (one per source module / module group).

**Files modified**
- `apps/api/src/selection/index.ts` — the area barrel, extended each slice with the new public surface.

## What landed — 10 slices (all on `track/selection`, not pushed)

| Slice | Commit | Tests |
|---|---|---|
| P5.2 novelty embed + cosine | `4a690f2` | 18 |
| P5.3+P5.4 novelty degrade + energy-efficiency | `d2335b4` | 16 |
| P5.8 bounded mutation + RNG | `3acb121` | 15 |
| P5.5-critic critic-scores | `df8b899` | 13 |
| P5.5-judge judge-acceptance (completes P5.5) | `d10854d` | 13 |
| P5.6 policy-versioned fitness scorer | `c767f88` | 21 |
| P5.7 cull + parent-selection | `9fd104d` | 18 |
| P5.9 two-level fusion | `94ca2fe` | 18 |
| P5.10 reproduce dispatcher + degenerate fallback | `134ddd1` | 13 |
| P5.11 allocation + successor (Phase-5 finisher) | `d38b6e2` | 15 |

Full `apps/api` unit suite **268/268**; every slice security-reviewed CLEAN.

## Decisions made

- **Replay-split discipline (rule #7) per stochastic/provider op:** live `score*/mutate/fuse/reproduce` persist every non-deterministic outcome (embedding vector, RNG indices/choices, synthesis output) into the event; `apply*` reconstructs bit-exact with **zero gateway + zero rng**. `applyFusion`/`applyReproduction`/`applyMutation` are structurally provider-free (no gateway param) — stronger than a call-count assertion.
- **No-gateway-structural over deps-with-gateway:** dropped vestigial `deps.gateway`/call-count designs on the replay/compose functions (P5.6/P5.7/P5.9/P5.10) — structural absence + lint-clean.
- **Degrade-gracefully on provider failure:** novelty embed rejection → lexical estimate (`novelty_scoring_degraded`, P5.3); synthesis-output rejection → crossover-only (`mode:'crossover'`, P5.9) — never silent-zero, never persist an unvalidated output (rule #5).
- **Fail-loud replay-integrity (P5.9):** typed guards on the persisted event (throw on a corrupt `synthesisOutput`/`childGenerationId`) rather than `String()`-coercing — never fold a tampered log into a valid-looking child.
- **Selection-decides / kernel-owns-lifecycle seam:** selection returns flags (`zeroSurvivors`) + emits its own domain events (`lineage.culled`/`fitness.scored`/`agenome.fused`/`reproduced`); the kernel emits lifecycle terminals (`generation.completed`), drives the agenome state machine, debits energy, and mints gen N+1 / assigns child generations.
- **Rule-#1 hint/enforcer split (P5.11):** allocation `Σ ≤ remaining`, never raises a cap; the kernel is the authoritative enforcer.
- **NaN/boundary integrity everywhere:** cosine zero-norm→0, energy zero-spend→1, critic zero-denominator→plain-mean, fitness non-finite component→0-flagged + non-finite total→fail-closed-at-parse, allocation `totalWeight===0`→0. No divide-by-zero / NaN / negative reaches an authoritative value.
- **Shared `SelectionEmitter`** introduced at P5.10; the 4 prior per-module emitter aliases left local (not retrofitted mid-round).

## Decisions explicitly NOT made (deferred)

- **Caller wiring / generation lifecycle → P3 runtime** (named deferral): the generation `scoring`/reproduction loop supplies the per-run seed + real `EventStore.append` emitter + `newId`, reads the persisted component events via the merged replay-reader, loads the immutable `ScoringPolicy`/`FinalJudgeRubric` from immutable config, applies agenome state transitions, mints gen N+1 + assigns child generations, and emits the generation lifecycle. Real-Postgres integration tests ride that P3 slice.
- **Successor gen-N+1 re-homing → kernel/P5.11 handoff:** reproduce/successor children land in the parents' generation G; the kernel assigns gen N+1 (gen N+1 doesn't exist at reproduce time).
- **Learned allocation OUT of scope (P5.11):** no bandit/RL/value-model — MVP heuristic only.
- **Contract-track regression-guard (flagged to orchestrator → contract track):** a `packages/contracts` test pinning `ScoringPolicy` rejects a non-finite weight + `FitnessScore` rejects a non-finite total — the weight-side NaN safety is zod-version-dependent (verified zod 4.4.3).

## TDD compliance

**Clean — no violations.** All 10 slices ran `/tdd` RED → Step-2.5 review (orchestrator-approved) → GREEN → full suite → reachability → security review → Step-9 → commit. Every production change had a failing test first. Orchestrator Step-2.5 ADDs (explanation-enumeration, NaN guards, marker-aware, order-independence, no-scored-cull, cross-mode-gen, per-parent-distribution, synthesis-rejection, parent-immutability) were folded test-first. No safety-critical code shipped without a pinning test.

## Cross-doc invariant audit (multi-track memory check)

**Clean — no contract model field changed this session.** All 10 commits touched only `apps/api/src/selection/**` + tests + the area barrel; zero `packages/contracts` edits. Every slice flagged **"Cross-doc invariant change: NONE"** at Step 9 (orchestrator confirmed). The track is consume-only against the frozen Appendix-A models (`NoveltyScore`/`FitnessScore`/`ScoringPolicy`/`CriticReview`/`CheckResult`/`JudgeResult`/`FinalJudgeRubric`/`EnergyEvent`/`ReproductionEvent`/`Agenome`/`CullingEvent`/`RunCaps` + the gateway/event contracts). No drift; no `ARCHITECTURE.md` edit owed for a field change.

## Reachability

Every feature is **reachable now via the unit suite** (frozen fixtures + fake gateway + fake emitter + fixed seeds). Production wiring is a **named P3 deferral by design** (the selection track is built against frozen contracts + the stub; P3 integration wires it):

- novelty/fitness/components/cull/parent-selection/reproduction/allocation/successor → first consumer = the **P3 runtime generation `scoring`/reproduction loop** (supplies seed + real emitter + replay-reader reads; mints gen N+1 + lifecycle).
- `assembleSuccessor` → explicit **runtime handoff** (returns the population set; imports no kernel — pinned by test).

No tested-but-silently-unwired gap: each deferral names its P3 entry point. Carry into the P3 integration slice.

## Open follow-ups (Step-9 categorized — orchestrator routes at `/orchestrate-end`)

- **Architecture-doc notes (orchestrator → integration `ARCHITECTURE.md`):** §8 novelty formula (1−max cosine, empty→1.0); §8 energy-efficiency formula (1/(1+spend), zero→1.0) + cross-track-epsilon comparison note; §8 critic-aggregation + boundaries; §7/§8 held-out-judge-load validation + `JUDGE_ACCEPTANCE_KEY`; §8 fitness composition (component-key set, normalization-defer-throw, absence=0-flagged, NaN-integrity); §8/§3 cull criterion + order-independent seeded tie-break + zero-survivors split; §8/§14 fusion contract (parent-distance, crossover encoding, synthesis-as-DATA in/out, live/replay split); §8/§3 reproduce dispatch rule + mode-keyed replay + child-gen deferral; §8/§5 allocation heuristic + caps-clamp-as-hint + runtime-handoff. **Phase-5 box → `/phase-exit P5`.**
- **Convention candidates (LESSONS — orchestrator banks at `/orchestrate-end`):** replay-split for stochastic+provider ops; fail-loud replay-integrity; selection-decides/kernel-emits-lifecycle; numeric-only fitness-component purity; consume-an-immutable-anchor; mode-keyed replay dispatcher; allocation-clamp-as-hint; shared `SelectionEmitter`; degrade-via-deterministic-secondary-method.
- **Carry-forward CONSUMED (selection side):** held-out-judge-LOAD validation (P5.5-judge); IDs-opaque parameterization (all slices). Verifier P4.8 still owns the rubric-load-for-application echo.
- **Future TODOs (P3 runtime + contract track):** P3 caller wiring + gen lifecycle + real-PG integration tests; P3.7 bounded embed retry/timeout; P6 `bodyLimit`; the contract-track NaN-rejection regression-guard (zod-version-dependent).

## How to use what was built

The selection surface is exported from `apps/api/src/selection/index.ts`. The P3 runtime composition root drives one generation as: `scoreNovelty` → component reads (`energyEfficiency`/`criticScores`/`judgeAcceptance`) → `scoreFitness` (emits `fitness.scored`) → `cull` + `selectParents` → `assembleSuccessor` (which allocates + `reproduce`s per slot). Replay reconstructs via `applyMutation`/`applyFusion`/`applyReproduction` from the persisted events with no provider calls.
