# /tdd brief — bounded_mutation_with_persisted_rng_outcomes

## Feature
The reproduction **mutation primitive** for the selection track: `mutate(parent, rng, bounds)` changes an
agenome's traits **within allowed bounds** using an injected deterministic RNG, captures the **concrete
RNG outcomes** in a `mutationSummary`, and produces a schema-valid child `Agenome`. A pure
`applyMutation(parent, mutationSummary)` **replay path** reconstructs the identical child from the
persisted outcomes **without any RNG** (KEY SAFETY RULE #7 — replay re-samples nothing). Mutation is
**bounded + finite** and never raises a cap (`spawnBudget` stays a hint — KEY SAFETY RULE #1).

## Use case + traceability
- **Task ID:** P5.8
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (bounded mutation, RNG outcomes persisted;
  reproduction primitives), `§4` (rule #7 — persisted RNG outcomes, replay reconstructs).
- **Related context:**
  - Independent of the scoring chain — depends only on P0.4 (`Agenome` ✓), P0.9 (`ReproductionEvent` ✓),
    P5.1 (✓ via P0). Authored now as the next **unblocked** slice while the held-out-judge contract gap
    (escalated Finding) is resolved upstream.
  - `Agenome` (frozen): `{id, runId, generationId, parentIds[], systemPrompt, personaWeights(record<string,number>), toolPermissions[], decompositionPolicy, spawnBudget(int≥0), mutationMeta?{mode?,mutatedFields?[],summary?}, status}`.
    parentIds count (0–2) + the spawnBudget→cap clamp are **kernel** rules (§6/§1), NOT this slice.
  - `ReproductionEvent` (frozen): `mutationSummary` is `record<string, string|number|boolean>` (NOT
    `z.unknown` — inspectable for replay-diffing) — the persisted RNG outcomes (rule #7).
  - First consumers (in-track, near future): P5.9 (fusion applies mutation), P5.10 (degenerate
    `mutation_only` fallback), P5.11 (successor assembly). This slice ships the PRIMITIVE; the
    `agenome.mutated` event emission + the per-run RNG seed are the reproduction orchestrator's / kernel
    P3.6's job (deferred — see Wiring).
  - Carry-forward: treat `runId`/`parentId`/`childId` as **opaque untrusted bytes**.

## Acceptance criteria (what "done" means)
- [ ] `rng.ts` exposes a **deterministic seeded PRNG** `createRng(seed:number): Rng` (`nextFloat()`,
      `nextInt(maxExclusive)`, `pick(array)`): same seed → identical sequence; `nextInt(n) ∈ [0,n)`. Pure,
      no `Math.random`/`Date.now` (replayable, LESSONS §24).
- [ ] `mutate(parent, rng, bounds, {newId})` returns `{ child: Agenome, mutationSummary }`:
      - mutates traits **only within `bounds`** (Q1 default: `personaWeights` per-key bounded delta;
        `spawnBudget` bounded int delta; `toolPermissions` add/remove within an injected allowlist);
      - **excluded traits unchanged** (Q1: `systemPrompt`, `decompositionPolicy` not mutated in MVP);
      - child records `parentIds:[parent.id]`, `status:'seeded'`, `mutationMeta:{mode,mutatedFields,summary}`,
        and **parses against the frozen `Agenome`**;
      - `spawnBudget` stays a nonneg int **hint** within bounds — mutation never raises an effective cap
        (the kernel clamps; rule #1), no unbounded trait drift (bounded + finite by construction).
- [ ] `mutationSummary` captures the **concrete applied outcomes** (Q5: keys = mutated field paths,
      values = applied value/delta as string|number|boolean) — sufficient to fully reconstruct the child.
- [ ] **REPLAY (rule #7):** `applyMutation(parent, mutationSummary)` reconstructs a child **equal** to
      `mutate`'s child using **no RNG** (assert no `rng` is invoked on this path) — replay reads the
      persisted outcomes, never re-samples.
- [ ] `mutate` is deterministic: same `(parent, seed, bounds)` → identical `child` + `mutationSummary`.
- [ ] All unit tests in `apps/api/test/unit/selection/reproduction/{rng,mutate}.test.ts` pass; full
      `apps/api` unit suite green (no regressions).
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — caller wiring + event emission land in later reproduction slices.** `mutate`/`applyMutation`/`rng`
are reproduction **primitives**. **First consumers (named):** P5.9 (fusion), P5.10 (`mutation_only`
fallback), P5.11 (successor assembly) — they decide the `ReproductionEvent.mode`, emit `agenome.mutated`
(generic-payload event; NOT high-traffic) via the selection event-emitter seam, and supply the **per-run
RNG seed** (kernel **P3.6** persists `RunConfig.rngSeed` in `run.configured`; deferred). Replay-faithfulness
is structural here (outcomes persisted in `mutationSummary` → `applyMutation` reconstructs), independent of
the eventual emitter/seed wiring. Reachable now via the unit suite (deterministic `rng` + fixtures).

## Files expected to touch
**New:**
- `apps/api/src/selection/reproduction/rng.ts` — `createRng(seed)` deterministic PRNG + `Rng` interface. Pure.
- `apps/api/src/selection/reproduction/mutate.ts` — `mutate(parent, rng, bounds, {newId})` (live) +
  `applyMutation(parent, mutationSummary, {newId?})` (replay) + `MutationBounds` type. Pure over inputs.
- `apps/api/test/unit/selection/reproduction/rng.test.ts`
- `apps/api/test/unit/selection/reproduction/mutate.test.ts`

**Modified:**
- `apps/api/src/selection/index.ts` — export `createRng`/`Rng`, `mutate`/`applyMutation`/`MutationBounds`.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

### `rng.test.ts`
1. **`rng_same_seed_same_sequence`** — `createRng(s)` twice → identical sequences. Why: rule #7 replayable.
2. **`rng_different_seeds_differ`** — distinct seeds → different sequences. Why: real randomness source.
3. **`rng_nextInt_in_range`** — `nextInt(n) ∈ [0,n)` across a sample. Why: bounded selection.
4. **`rng_pick_returns_member`** — `pick(arr)` always returns an array member. Why: bounded selection.

### `mutate.test.ts`
5. **`mutate_personaWeights_within_bounds`** — each mutated weight delta within `bounds`. Why: §8 bounded mutation.
6. **`mutate_spawnBudget_within_bounds_stays_hint`** — `spawnBudget` mutated within bounds, nonneg int; never raises a cap (kernel clamps; rule #1). Why: rule #1.
7. **`mutate_toolPermissions_within_allowlist`** — any added permission comes only from the injected allowlist; never invents one. Why: bounded, no privilege invention.
8. **`mutate_excluded_traits_unchanged`** — `systemPrompt`, `decompositionPolicy` identical to parent (Q1 MVP). Why: bounded scope.
9. **`mutate_child_records_parentage_and_meta`** — child `parentIds:[parent.id]`, `status:'seeded'`, `mutationMeta` populated. Why: §3 lineage.
10. **`mutate_child_validates_against_Agenome`** — `Agenome.parse(child)` succeeds. Why: §3 schema-valid offspring.
11. **`mutate_persists_outcomes_in_mutationSummary`** — `mutationSummary` (record<string,string|number|boolean>) captures every applied delta. Why: rule #7 persisted outcomes.
12. **`REPLAY_applyMutation_reconstructs_without_rng`** — `applyMutation(parent, mutate.mutationSummary)` deep-equals `mutate.child`, with **no rng call** on this path. Why: **rule #7** (the slice's safety pin).
13. **`mutate_deterministic_given_seed`** — same `(parent, seed, bounds)` → identical child + summary. Why: replay-faithful + idempotent.
14. **`mutate_finite_no_unbounded_drift`** — a mutated value never exceeds the declared bound (single application bounded). Why: §8 finite mutation.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Consumes frozen `Agenome` (P0.4), `ReproductionEvent` (P0.9).
- **Orchestrator doc rows to write hot (Step 9 routing):** §8 arch-note candidate — pin the **mutation-bounds
  policy + `mutationSummary` field-path encoding convention** so P5.9/P5.10/P5.11 (and replay-diffing) depend
  on a defined shape. (Mine to route → integration.)
- **§2.5-seam model touched?** No shape change — consume-only (`Agenome`, `ReproductionEvent` snapshots
  already exist in `packages/contracts`). No new schema-snapshot; child-validity pinned by test 10
  (`Agenome.parse`).

## Things to flag at Step 2.5
1. **Which traits mutate (MVP).** Default vote: **`personaWeights` (bounded per-key delta) + `spawnBudget`
   (bounded int delta, stays a hint) + `toolPermissions` (add/remove within an injected allowlist)**; do
   NOT mutate `systemPrompt`/`decompositionPolicy` in MVP (free-text mutation is non-deterministic/hard to
   bound — defer or a bounded-variant-pick later). Push back if you want a text-trait variant set now.
2. **RNG implementation.** Default vote: a **pure deterministic seeded PRNG** (e.g. mulberry32) in `rng.ts`,
   seeded by the injected per-run `rngSeed`; replay never re-runs it (reads `mutationSummary`). The kernel's
   per-run RNG (P3.6) supplies the seed at wiring; selection's stream is separate but **replay-independent**
   (outcomes persisted), so it need not match the kernel's stream byte-for-byte.
3. **mutate emits or returns.** Default vote: **pure primitive — returns `{child, mutationSummary}`**, no
   event emission here; `agenome.mutated` emission + `ReproductionEvent.mode` are the reproduction
   orchestrator's (P5.9/P5.10/P5.11). Keeps the primitive reusable by fusion. (Mirrors how P5.2 kept cosine
   pure.)
4. **Replay reconstruction shape.** Default vote: ship **`applyMutation(parent, mutationSummary)`** that
   re-derives the child from persisted outcomes with no RNG; pin `mutate.child === applyMutation(parent, mutate.mutationSummary)`.
   Confirm `mutationSummary`'s `record<string,string|number|boolean>` round-trips all outcomes (per-key
   numeric deltas, `toolPermissions` add/remove as `±name` strings/bools).
5. **`mutationSummary` encoding.** Default vote: **keys = field paths** (`'personaWeights.<k>'`,
   `'spawnBudget'`, `'toolPermissions.+<name>'`/`'.-<name>'`), **values = the applied delta/value**
   (number|string|bool). Must be sufficient for `applyMutation` to reconstruct deterministically.
6. **Child `generationId` + id.** Default vote: **caller passes `targetGenerationId`** (the successor gen,
   assembled in P5.11); `mutate` sets `child.generationId` from it; `child.id` via the injected `newId()`
   (no uuid/`Math.random` inside `mutate`, LESSONS §24).

## Dependencies + sequencing
- **Depends on:** P0.4 (`Agenome` ✓), P0.9 (`ReproductionEvent`/`mutationSummary` ✓), P5.1 ✓ via P0.
  (Independent of the blocked scoring chain.)
- **Blocks:** P5.9 (fusion applies `mutate`), P5.10 (degenerate `mutation_only` reuses `mutate`), P5.11
  (successor assembly). Per-run RNG seed wiring rides kernel P3.6 (deferred).

## Estimated commit count
**1 — SOLO.** Carries the **rule-#7 RNG-persistence pin** (test 12: `applyMutation` reconstructs from
persisted outcomes, no RNG) **and** the **rule-#1 bounded-no-cap-raise** property — a safety-invariant
slice, authored standalone, **not bundled** (root `CLAUDE.md` TDD posture; the bundle-where-safe directive's
hard carve-out). Establishes the reproduction-RNG seam the way P5.2 established the novelty-replay seam.

## Lessons-logged candidates anticipated
- **Convention candidate** — live `mutate(rng)` + replay `applyMutation(persistedOutcomes)`: the rule-#7
  pattern for stochastic reproduction — the live path samples, persists concrete outcomes; replay reads them
  and re-samples nothing (the mutation analog of P5.2's embed/recompute split).
- **Architecture-doc note candidate** — §8: pin the mutation-bounds policy + `mutationSummary` field-path
  encoding so P5.9/P5.10/P5.11 + replay-diffing depend on a defined shape.
- **Future TODO (P3.6)** — the per-run RNG seed (`RunConfig.rngSeed`, persisted in `run.configured`) wires
  as `mutate`'s seed source at the reproduction orchestrator.

## How to invoke
1. **Read this brief end-to-end** — note the live/replay split (`mutate` vs `applyMutation`) is the rule-#7
   heart; 6 Step-2.5 questions.
2. **Run `/tdd bounded_mutation_with_persisted_rng_outcomes`**.
3. **Step 0/1** — confirm against Feature + Files.
4. **Step 2.5** — send the test-design write-up (one `Asserts: <invariant> (§anchor)` line per test +
   coverage map per acceptance bullet) + your votes Q1–Q6. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 9** — categorized flags + ship-ask; hold the §8 arch-note for me to route.
