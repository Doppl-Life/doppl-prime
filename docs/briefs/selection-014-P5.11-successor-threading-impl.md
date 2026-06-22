# /tdd brief — successor_threading_impl (the real nextPopulation hook)

## Feature
Implement selection's real `nextPopulation` hook impl — `createSuccessorThreading(deps) → (args: NextPopulationArgs) => Promise<readonly Agenome[]>` — that turns a completed generation's reproduced offspring into the next generation's population. It reads the completed generation's `agenome.reproduced`/`agenome.fused` events from the log, reconstructs each child via `applyReproduction(parents, reproductionEvent)` (gateway/rng-free, rule #7), re-homes each child to the next generation (status `seeded`), and returns them (the kernel clamps to `maxPopulation` per W3a). This is what makes **gen N+1 evolve from gen N's offspring** — the headline "gen N+1 beats gen N." Proven at the loop level with all THREE real seams (verify=`createVerifySeam`, score=W1, reproduce=W2) over real Postgres.

## Use case + traceability
- **Task ID:** P5.11
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (P5.11 successor population — the runtime-handoff realization). **Widens phase scope because** the impl is exercised through the `§5` generation loop (the runtime integration point) via W3a's `nextPopulation` hook.
- **Related context:**
  - W3a (`selection-013`, landed `207a0a8`) added the additive kernel `nextPopulation?` hook + the rule-#1 clamp. This slice is its real impl (the hook impl is selection territory; W3a was the kernel seam).
  - `applyReproduction(parents: readonly FusionParent[], reproductionEvent: ReproductionEvent): Agenome` (reproduce.ts) reconstructs a child from the persisted event with NO gateway/rng (rule #7) — the threading impl's core. `FusionParent = { agenome, noveltyVector }`.
  - W2's reproduce-seam emits `agenome.fused`/`agenome.reproduced` carrying the `ReproductionEvent` (payload IS the ReproductionEvent — the child is reconstructed, never stored).
  - All 3 seams are now real + merged: `createVerifySeam` (cody `9de3ef6`), `createScoreSeam` (W1), `createReproduceSeam` (W2) — the loop-level test drives the true verify→score→reproduce→thread path.
  - **Forward-flag from W3a (rule #1):** re-homed children re-entering the kernel must respect `parentIds` 0–2 (guaranteed by reproduction), `spawnBudget = min(hint, remaining caps)`, and `maxSpawnDepth`. The population-SIZE cap is already held by W3a's clamp; this slice handles the per-child field validity.

## Acceptance criteria (what "done" means)
- [ ] `createSuccessorThreading(deps: SuccessorThreadingDeps): (args: NextPopulationArgs) => Promise<readonly Agenome[]>` — conforms to W3a's `nextPopulation` hook type (structural assignment pinned in-test).
- [ ] `SuccessorThreadingDeps` carries what re-homing needs that `NextPopulationArgs` doesn't (e.g. `caps: RunCaps` for the spawnBudget clamp, `nextGenerationId` derivation — Step-2.5 Q1).
- [ ] Reads `agenome.reproduced`/`agenome.fused` events for `completedGenerationId` from `args.log`; for each, reconstructs the child via `applyReproduction(fusionParents, reproductionEvent)` where `fusionParents` are built from `args.eligibleParents` + their persisted novelty vectors (from `novelty.scored` in the log).
- [ ] **Replay-faithful (rule #7):** the reconstruction calls NO gateway/rng (structural — `applyReproduction` takes neither); the children are byte-identical to what reproduction produced. Pinned.
- [ ] **Re-homes each child:** `generationId = nextGenerationId`, `status = 'seeded'` (so the candidate-production loop's `seeded→active` works), preserving the reconstructed `parentIds`/`systemPrompt`/`personaWeights`/etc. Each returned child `Agenome.safeParse`-validates.
- [ ] **Rule-#1 per-child fields (W3a forward-flag):** `parentIds.length ≤ 2` (assert — reproduction guarantees it); `spawnBudget = min(child.spawnBudget, remaining caps)` clamp; `maxSpawnDepth` respected (Step-2.5 Q3 — likely moot since the gen loop doesn't spawn sub-agents, but set valid + document).
- [ ] Returns the children array; **does NOT clamp to maxPopulation itself** (W3a's kernel clamp owns the SIZE cap — the impl returns all reconstructed children; the kernel truncates). A Step-9 note records this division.
- [ ] Zero reproduced offspring (e.g. all aborted) → returns `[]` (the loop's `< minSurvival` path winds the run down — no fabrication).
- [ ] **Loop-level evolution test (real PG):** drive `runGenerationLoop` with all 3 REAL seams + this threading hook over real Postgres + a fake gateway (LESSONS §24); assert gen-1's population/`candidate.created` agenomes derive from gen-0's reconstructed offspring (parentIds trace to gen-0 agenomes), proving gen N+1 evolves from gen N. Pinned.
- [ ] All tests pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
The threading impl is injected as `runGenerationLoop`'s `nextPopulation` (via `runWorker`) at the W3b-2 boot composition root (`selection-015`). This slice proves it via the loop-level integration test (drive `runGenerationLoop` with the real seams + this hook). Production injection (real config + POST /runs trigger) = W3b-2.

## Files expected to touch
**New:**
- `apps/api/src/selection/seams/successor-threading.ts` — `createSuccessorThreading` + `SuccessorThreadingDeps`.
- `apps/api/test/integration/selection/successor-threading.test.ts` — loop-level evolution test (real PG, 3 real seams).

**Modified:**
- `apps/api/src/selection/index.ts` — export `createSuccessorThreading` + `SuccessorThreadingDeps`.

## RED test outline (apps/api/test/integration/selection/successor-threading.test.ts)
1. **`test_conforms_to_nextPopulation_hook`** — `const hook: GenerationLoopDeps['nextPopulation'] = createSuccessorThreading(deps)` compiles + runs. Why: W3a hook contract.
2. **`test_reconstructs_children_from_reproduction_events`** — seed a generation with agenome.reproduced/fused; run the hook. Asserts: returns children == `applyReproduction(parents, event)` for each, byte-equal, no gateway/rng. Why: rule #7.
3. **`test_children_rehomed_to_next_generation_seeded`** — Asserts: each returned child's `generationId == nextGenerationId`, `status == 'seeded'`, `Agenome.safeParse` valid, `parentIds.length ≤ 2`. Why: §8 re-home + rule-#1 per-child fields.
4. **`test_spawnBudget_clamped_to_remaining_caps`** — a child with an oversized spawnBudget hint. Asserts: clamped to `min(hint, remaining)`. Why: rule #1 (W3a forward-flag).
5. **`test_zero_offspring_returns_empty`** — a generation with no reproduced offspring. Asserts: returns `[]`. Why: no-fabrication (§5/§8).
6. **`test_loop_level_evolution_gen1_from_gen0_offspring`** — drive `runGenerationLoop` with verify=`createVerifySeam`, score=`createScoreSeam`, reproduce=`createReproduceSeam`, nextPopulation=this hook, over real PG + fake gateway. Asserts: gen-1's agenomes derive from gen-0's reproduced offspring (parentIds trace to gen-0) — gen N+1 evolves from gen N. Why: §8 the headline evolution property; the true end-to-end path.

## Cross-doc invariant impact
- **Model field changes:** none — consumes frozen `Agenome`/`ReproductionEvent`/`NoveltyScore`/`RunCaps`.
- **Orchestrator doc rows to write hot:** none. Convention/arch-note bank for the cody handoff.
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **`SuccessorThreadingDeps` vs `NextPopulationArgs` split.** What does the impl need beyond the hook args? My default: `deps = { caps: RunCaps }` (for the spawnBudget clamp) + the `nextGenerationId` derived from `args.completedGenerationId` (parse the `-gen{N}` suffix → `-gen{N+1}`) OR passed in args. My default vote: **derive nextGenerationId from completedGenerationId** (the loop's id scheme is `${runId}-gen${g}`) — confirm that's stable, else add it to NextPopulationArgs (a W3a follow-up). Flag if id-parsing is too brittle.
2. **fusionParents novelty vectors.** `applyReproduction`'s `FusionParent` needs `noveltyVector`. Source: each eligible parent's best candidate's `novelty.scored.vector` from the log. My default vote: **build FusionParent[] from args.eligibleParents joined to their novelty.scored vectors** (same projection W2's reproduce-seam uses — consider sharing the helper). Flag if a parent lacks a novelty vector (degraded path) — fall back deterministically.
3. **maxSpawnDepth for re-homed children.** The candidate-production loop generates (doesn't spawn sub-agents), so maxSpawnDepth likely isn't exercised at this stage. My default vote: **set children valid + document that maxSpawnDepth isn't active in the gen loop** (no nesting); don't add depth machinery this slice. Flag if reproduction sets a depth field that needs clamping.
4. **Sharing the parent-projection with W2.** W2's reproduce-seam has a `projectSuccessorParents`/novelty-join. This impl needs a similar parent+vector projection. My default vote: **reuse/extract the shared helper** if clean; else a local projection. Flag the extraction call.

## Dependencies + sequencing
- **Depends on:** W3a kernel hook (`selection-013`, `207a0a8`) + the merged VerifySeam (`9de3ef6`) + W1/W2 seams.
- **Blocks:** W3b-2 boot composition root + demo trigger + HTTP e2e (`selection-015`).

## Estimated commit count
**1.** One selection-territory slice (`feat(selection):` the threading impl + loop-level evolution test). SOLO — the boot composition + demo trigger (cross-area) is W3b-2. No NEW safety invariant introduced (rule #7 reconstruction is structural; rule-#1 size-cap is W3a's; per-child field validity is asserted) — but it IS the first proof of true multi-gen evolution, so it gets its own commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "the successor-threading hook impl reconstructs offspring from the persisted reproduction events via the replay reconstructor (rule #7, no gateway/rng), re-homes to the next generation (seeded), and returns them as a HINT the kernel clamps (rule #1) — selection proposes, the kernel bounds."
- **Architecture-doc note candidate** — §8: gen N+1's population = gen N's reconstructed offspring (re-homed seeded, kernel-clamped); the evolution loop closes here.
- **Future TODO (W3b-2)** — boot composition + POST /runs trigger + HTTP e2e.

## How to invoke
1. Read end-to-end.
2. `/tdd successor_threading_impl`.
3. Step 0 — confirm restatement.
4. Step 2.5 — answer the 4 design questions (or defaults).
5. Step 9 — note the size-cap division (kernel clamps, impl proposes).
