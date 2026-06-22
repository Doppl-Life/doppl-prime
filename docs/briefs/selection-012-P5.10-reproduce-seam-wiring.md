# /tdd brief — reproduce_seam_wiring (selection → P3 generation loop, reproduce port)

## Feature
Implement selection's real **reproduce-seam adapter** — a `createReproduceSeam(deps) → ReproduceSeam` factory whose returned function conforms to the kernel's injected `ReproduceSeam` port (`generationLoop.ts:99`, called at `:466`). Given the loop's eligible `parents: Agenome[]` + the generation's `scoredEvents`, it projects each parent's best-candidate heuristic weights (fitness · novelty · energy-efficiency · novelty vector) from the persisted log, then runs `assembleSuccessor` (heuristic allocation, caps-clamped — rule #1) which reproduces per slot via `reproduce` (≥2 distinct → two-level fusion through the gateway; 1 → `mutation_only`; 0 → abort), emitting `agenome.fused`/`agenome.reproduced`/`fusion.started`/`reproduction_aborted_insufficient_parents` through `ctx.append`. This is the deferred caller-integration of P5.8–P5.11.

## Use case + traceability
- **Task ID:** P5.10, P5.11
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (reproduction dispatch + heuristic allocation + successor assembly — selection's home).
- **Related context:**
  - The kernel loop is pure orchestration over injected seam ports (LESSONS **§64**); this is selection's real impl of the `reproduce` port. The loop computes eligible parents itself (`resolveEligibleParents` = `fitness.scored ∧ ¬lineage.culled`) and passes them in; the seam never re-resolves eligibility.
  - Seam = a `create<Seam>(deps)→Seam` factory composing already-unit-pinned domain fns (LESSONS §20; established by W1 `selection-011`).
  - Selection reproduction is **replay-faithful via the frozen `ReproductionEvent`** (`crossoverPoints`/`mutationSummary`) + `applyReproduction` — structurally PRNG-free + gateway-free (LESSONS **§47**, rule #7). The seam does NOT need the kernel's `ctx.outcomes` (see Step-2.5 Q1 — the seed source).
  - Rule #1: allocation is a HINT clamped to `min(remaining caps)`; the kernel is the authoritative enforcer. `assembleSuccessor` already pins `Σ allocation ≤ remainingPopulation`.
  - Fusion synthesis goes only through the `ModelGateway` `fusion_synthesis` role (rule #9); the degrade-to-crossover path is already built (P5.9).
- **Composes (do not reimplement):** `assembleSuccessor(input, {gateway, emit, newId, bounds})` → which internally runs `allocate` + `reproduce` per slot (`fuse`/`reproduceMutationOnly`/`abortInsufficientParents`). All exported from `apps/api/src/selection/index.ts`.

## Acceptance criteria (what "done" means)
- [ ] `createReproduceSeam(deps: ReproduceSeamDeps): ReproduceSeam` returns a `(ctx) => Promise<void>` matching the kernel's `ReproduceSeam` type (`generationLoop.ts`) — structural conformance pinned by an in-test `const seam: ReproduceSeam = createReproduceSeam(...)` assignment.
- [ ] `ReproduceSeamDeps` = `{ gateway: ModelGateway; maxPopulation: number; bounds: MutationBounds; seed: number; newId: () => string }` — `maxPopulation` (the rule-#1 clamp bound) + `seed` (the per-run RNG seed) are injected from the boot root / config (see Step-2.5 Q1).
- [ ] The seam projects `SuccessorParent[]` from `ctx.parents` (`Agenome[]`) joined with `ctx.scoredEvents`: per parent, its best-scored candidate's `fitness.scored.total` (fitness), that candidate's `NoveltyScore.score` (novelty) + `NoveltyScore.vector` (noveltyVector), and `fitness.scored.components.energy_efficiency` (energyEfficiency). "Best candidate" = highest `fitness.scored.total` among that agenome's candidates (tie-break LOWEST sequence — deterministic, mirrors LESSONS §68).
- [ ] The seam calls `assembleSuccessor({ runId, generationId, eligibleParents, remainingPopulation: maxPopulation, seed }, { gateway, emit: ctx.append, newId, bounds })`.
- [ ] **Fusion path (mode='fusion', ≥2 distinct eligible parents):** each slot emits `fusion.started` (no-debit marker) → `agenome.fused` carrying the `ReproductionEvent` (mode `fusion`/`crossover`/`output_synthesis`), appended via `ctx.append`; the child records both parentIds + crossover/synthesis metadata; synthesis-rejection degrades to crossover (P5.9), never persists an unvalidated output (rule #5).
- [ ] **Degenerate path (mode='mutation_only', 1 eligible parent):** emits `agenome.reproduced{mode:'mutation_only'}` carrying the `ReproductionEvent` (mutationSummary = persisted RNG outcomes); no fusion/gateway call.
- [ ] **Zero/abort path:** assembleSuccessor over 0 distinct parents produces an empty population (the loop already gates `eligibleParents.length===0` before calling reproduce, so the seam sees ≥1; an in-seam abort from a degenerate slot emits `reproduction_aborted_insufficient_parents` and no child).
- [ ] The successor population is bounded: `Σ children ≤ maxPopulation` (rule #1 — allocation is a hint, never raises a cap). Pinned by a test where the allocation demand exceeds `maxPopulation`.
- [ ] The seam appends events ONLY through `ctx.append` (rule #2/#4) and emits NO `energy.spent` (rule #8 — reproduction energy is the kernel's debit, not the seam's).
- [ ] **Replay-faithful (rule #7):** each child is reconstructable from its persisted `ReproductionEvent` via `applyReproduction` with no gateway/rng — pinned by reconstructing a fused + a mutated child from the appended events and asserting equality.
- [ ] The seam returns `void` — the successor population is persisted as events; **threading the offspring into gen N+1's population is the W3 boot-root slice** (`selection-013`), not this slice.
- [ ] Integration test in `apps/api/test/integration/selection/reproduce-seam.test.ts` passes against the **real Postgres** event store (testcontainers).
- [ ] All tests pass; `/preflight` clean (incl. `format:check`).

## Wiring / entry point (Step 7.5)
Production entry point is the kernel's `ReproduceSeam` port — `await seams.reproduce({ runId, generationId, append, parents, outcomes, scoredEvents, mode })` at `apps/api/src/runtime/loop/generationLoop.ts:466`. **Injection of `createReproduceSeam(...)` into the loop's `seams.reproduce` slot lands at the W3 boot root (`selection-013`).** This slice proves reachability via the integration test driving the returned `ReproduceSeam` directly with a real `EventStore` + a fake-gateway `ModelGateway` (handoff named in the test header: `// first production caller: generationLoop.ts:466 seams.reproduce, injected at selection-013`).

## Files expected to touch
**New:**
- `apps/api/src/selection/seams/reproduce-seam.ts` — `createReproduceSeam` + `ReproduceSeamDeps` + the `SuccessorParent` projection from `scoredEvents`.
- `apps/api/test/integration/selection/reproduce-seam.test.ts` — real-PG integration test.

**Modified:**
- `apps/api/src/selection/index.ts` — export `createReproduceSeam` + `ReproduceSeamDeps`.

Flag at Step 2.5 if a shared scored-events projection helper should be extracted (W1's score-seam may have a similar readByRun-fold worth sharing).

## RED test outline (apps/api/test/integration/selection/reproduce-seam.test.ts)
1. **`test_conforms_to_ReproduceSeam_port`** — `const seam: ReproduceSeam = createReproduceSeam(deps)` compiles + runs. Asserts: structural conformance to the kernel port. Why: LESSONS §64/§20 (seam type IS the kernel contract).
2. **`test_fusion_path_two_distinct_parents`** — seed 2 eligible parents (each with fitness.scored + novelty.scored in scoredEvents); run the seam (mode='fusion'). Asserts: ≥1 `agenome.fused` appended carrying a valid `ReproductionEvent` with both parentIds + crossoverPoints; `fusion.started` precedes it. Why: §8 two-level fusion (P5.9).
3. **`test_mutation_only_path_single_parent`** — one eligible parent (mode='mutation_only'). Asserts: `agenome.reproduced{mode:'mutation_only'}` with a populated `mutationSummary`; no gateway fusion call. Why: §8 degenerate (P5.10).
4. **`test_successor_parents_projected_from_scoredEvents`** — seed parents whose best candidates have distinct fitness totals. Asserts: the heuristic uses each parent's BEST candidate (highest total, tie-break lowest sequence) for fitness/novelty/energyEfficiency/noveltyVector. Why: §8 allocation inputs + LESSONS §68 tie-break.
5. **`test_allocation_clamped_to_maxPopulation`** — set `maxPopulation` below the natural allocation demand. Asserts: `Σ children ≤ maxPopulation`; no cap is raised. Why: rule #1 (hint clamped, kernel enforces).
6. **`test_children_replay_from_persisted_events`** — after the seam runs, reconstruct a fused + a mutated child via `applyReproduction` over the appended `ReproductionEvent`s. Asserts: byte-equal to the live child, zero gateway/rng. Why: rule #7 (LESSONS §47).
7. **`test_appends_only_via_store_no_energy_debit`** — Asserts: seam-appended types ⊆ {fusion.started, agenome.fused, agenome.reproduced, reproduction_aborted_insufficient_parents}; pre-seeded energy.spent count unchanged. Why: rule #2/#4 + #8.
8. **`test_synthesis_rejection_degrades_to_crossover`** — fake gateway returns an invalid synthesis output. Asserts: the child is produced with `mode:'crossover'` (degrade), never an unvalidated synthesis persisted. Why: rule #5 (P5.9 degrade).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes docs)
- **Model field changes:** none — consumes frozen `Agenome`/`ReproductionEvent`/`NoveltyScore`/`FitnessScore` unchanged.
- **Orchestrator doc rows to write hot:** none. (Convention/arch candidates bank for the cody integration handoff.)
- **§2.5-seam model touched?** No — consumer wiring slice; no schema-snapshot owed.

## Things to flag at Step 2.5
1. **Seed source — inject the per-run `seed` vs derive from `ctx.outcomes`.** The kernel passes `ctx.outcomes: OutcomeSource` "so the reproduce seam records its draws," but selection's `assembleSuccessor`/`reproduce` take a numeric `seed` and persist their RNG outcomes in the frozen `ReproductionEvent` (their replay home, LESSONS §47) — AND the loop does NOT persist `ctx.outcomes()` after `seams.reproduce` (it can't ride the frozen `ReproductionEvent`). So `ctx.outcomes` is the wrong mechanism for selection's reproduction. My default vote: **inject the per-run `seed` via `ReproduceSeamDeps.seed`** (from `RunConfig.rngSeed` at the boot root); selection's `ReproductionEvent` persistence covers rule #7; leave `ctx.outcomes` unused (documented). **The orchestrator is surfacing this as a cross-track seam observation to the lead** — if the kernel prefers the seam derive the seed from `ctx.outcomes` (recording it), flag back and we coordinate a kernel-side adjustment. Do not block on it.
2. **`remainingPopulation` value.** For gen N+1 the population starts empty, so the clamp bound = `maxPopulation`. My default vote: **`remainingPopulation = maxPopulation`** (the full budget for the new generation). Flag if you read §5/§8 as "maxPopulation − survivors carried forward."
3. **Best-candidate selection per parent.** A parent (agenome) may have multiple scored candidates. My default vote: **best = max `fitness.scored.total`, tie-break LOWEST sequence** (deterministic, mirrors the terminal classifier LESSONS §68). Flag if novelty should tie-break instead.
4. **`energyEfficiency` source — read from `fitness.scored.components` vs recompute from `energy.spent`.** W1 already folded it into `fitness.scored.components.energy_efficiency`. My default vote: **read it from the persisted `fitness.scored.components`** (single source, no recompute) — the allocation heuristic consumes the same value fitness used. Flag if you'd rather recompute from raw energy events.
5. **`scoredEvents` vs a fresh `readByRun`.** The loop hands the seam `ctx.scoredEvents` (the readByRun snapshot it took post-score). My default vote: **use `ctx.scoredEvents`** (avoids a redundant read; it's the authoritative post-score snapshot). Flag if a child-event read-back is needed mid-seam (it isn't — children are appended, not re-read here).

## Dependencies + sequencing
- **Depends on:** W1 score-seam (`selection-011`, landed — produces the `fitness.scored`/`novelty.scored` the reproduce seam projects parents from) + the merged P3 loop `ReproduceSeam` port + P5.8–P5.11 selection logic.
- **Blocks:** W3 boot-composition-root (`selection-013`, injects this seam + threads the offspring into gen N+1).

## Estimated commit count
**1.** One focused wiring adapter + its real-PG integration test. SOLO — NOT bundled with W1 or W3. Carries the **rule-#1 caps-clamp surface** (allocation ≤ remaining caps) — a safety pin gets its own commit. No NEW invariant logic (the clamp is already pinned in `allocation.ts`/`assembleSuccessor`); this is its integration, so one commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "the reproduce seam projects heuristic parent weights from the persisted `fitness.scored`/`novelty.scored` (best candidate per agenome, deterministic tie-break) and delegates to `assembleSuccessor`; selection's reproduction owns its rule-#7 replay via the frozen `ReproductionEvent`, so the kernel's generic `ctx.outcomes` is unused — the seed is injected from config."
- **Architecture-doc note candidate** — §8: the kernel↔selection reproduce seam uses an injected per-run seed (not `ctx.outcomes`); selection's RNG outcomes live in `ReproductionEvent`. Possible kernel-seam clarification (ReproduceContext could expose `seed`).
- **Future TODO (phase — W3 / selection-013)** — thread the reproduced offspring into gen N+1's population (currently the loop persists gen-0 across generations); injection of this seam into the loop.

## How to invoke
1. Read this brief end-to-end (don't skip Step 2.5 — Q1 is load-bearing).
2. Run `/tdd reproduce_seam_wiring`.
3. Step 0 — confirm the restatement.
4. Step 2.5 — ping back with answers to the 5 design questions (or take defaults).
5. Step 9 — surface anything beyond the anticipated candidates.
