# /tdd brief — critic_set_rotation

## Feature
A **pure, deterministic per-generation critic-set selector**: `selectCriticMandates({ rngSeed,
generationIndex, activeCount? })` returns the active subset of the closed `CriticMandate` union for a
given generation, derived by closed-form from the run's PERSISTED RNG seed + the generation index — so
the verification target keeps **moving** generation to generation, the same set is reproduced on replay
without re-sampling, and the held-out judge anchor is structurally untouched. Output feeds the P4.6
council (`runCouncil(...mandates)`).

## Use case + traceability
- **Task ID:** P4.7
- **Architecture sections it implements:** `ARCHITECTURE.md §7` (held-out judge + **critic rotation** —
  "the critic agenome set rotates across generations so the target keeps moving"; the judge config +
  rubric are immutable to agents), `§4` (replay reconstructs deterministically from the persisted per-run
  RNG seed; no re-sampling).
- **Related context:**
  - **Key safety rule #6** (the held-out judge, its rubric, and the scoring policy are immutable to
    agents — the bedrock anchor): rotation changes ONLY the breeding-loop critic set; it NEVER reads or
    writes `FinalJudgeRubric` / judge config / `ScoringPolicy`.
  - **Key safety rule #7** (replay calls no providers, reconstructs from the persisted seed + outcomes):
    rotation is a pure deterministic derivation — replay re-derives the identical set; nothing is
    re-sampled from the shared run RNG.
  - **P3.6 RNG substrate (in the worktree):** `apps/api/src/runtime/rng/seededRng.ts` exports
    `createSeededRng(seed: number): SeededRng` (mulberry32, byte-stable across V8; `nextInt(lo, hi)`) and
    `readRngSeed(runConfig): number` (the persisted `RunConfig.rngSeed`, NOT the problem-scenario
    `seed` string). Re-exported from the runtime barrel `apps/api/src/runtime/index.ts`. **Layer rule:**
    `verifier → runtime` is a legal import edge (verifier sits above runtime).
  - **P3.6 outcome bridge (`persistOutcomes.ts`) is deliberately NOT used here** — see Acceptance + Q1.
    Mutation/fusion need it (their draws are position-dependent on the shared run stream, so they must
    record outcomes); rotation does NOT, because it is a closed-form function of two PERSISTED inputs.
  - **P4.6 council (landed):** `apps/api/src/verifier/council/run-council.ts` —
    `runCouncil({ ..., mandates: readonly CriticMandate[] })` runs whatever mandate set it is GIVEN
    (rotation was explicitly deferred to P4.7). This slice produces that set.
  - **Frozen contract (adopt, do not redefine):** `CriticMandate` = `z.enum([...])` (P0.6) — the closed
    5-member union (`factual_grounding`, `novelty_prior_art`, `feasibility`, `falsification`,
    `subtype_specific`). The universe MUST come from `CriticMandate.options` (single source of truth,
    lesson 5), never a re-declared local list.

## Acceptance criteria (what "done" means)
- [ ] `selectCriticMandates({ rngSeed, generationIndex })` returns a `CriticMandate[]` of length
      `min(K, N)` where `K = DEFAULT_ACTIVE_CRITIC_COUNT` (default **3**) and `N = CriticMandate.options.length`
      (= 5) — every element is a valid `CriticMandate`, and the array has **no duplicates**.
- [ ] **Deterministic (rule #7 / §4 replay):** two calls with the same `(rngSeed, generationIndex, activeCount)`
      return an identical array (same members AND same order) — no `Math.random` / `Date.now`. This IS the
      replay guarantee: the set is re-derived identically on replay, never re-sampled.
- [ ] **Moving target (§7):** across a span of generation indices under the same seed, the active set is
      NOT invariant — at least two distinct generation indices yield different sets.
- [ ] **Seed drives selection (§7):** for a fixed generation index, two different `rngSeed`s can yield
      different sets — the seed is the actual driver (a candidate/agenome cannot influence it; see below).
- [ ] **Judge anchor untouched (rule #6):** the module imports NO `FinalJudgeRubric` / judge config /
      `ScoringPolicy` / scoring symbols; its codomain is exactly the `CriticMandate` universe — it cannot
      add, remove, reweight, or alter any judging axis or the held-out judge config. (Structural —
      verified by the import list + codomain test.)
- [ ] **No candidate/agenome influence (rule #6):** the function signature accepts ONLY
      `(rngSeed: number, generationIndex: number, activeCount?: number)` — there is no `CandidateIdea` /
      `Agenome` / candidate-content parameter, so candidate text or an agenome metric-mutation attempt is
      structurally incapable of moving the selection.
- [ ] **Replay-pure (rule #7, lesson 30):** the module imports no model / embedding / web / event-store
      seam — verify by the import list; the function is pure and does no IO.
- [ ] **Closed-form, no event (derivable/explainable from persisted events):** rotation does NOT draw from
      the shared run RNG via the `persistOutcomes` bridge and emits NO event/contract — the active set is
      re-derivable from `(RunConfig.rngSeed in run.configured, Generation.index)`, both persisted, and is
      additionally directly inspectable from the council's per-mandate `critic.review_started` /
      `critic.reviewed` events for that generation.
- [ ] **Bounds:** `activeCount` clamps to `[1, N]` — `activeCount ≤ 0` → 1; `activeCount ≥ N` → the full
      set (N members, set-equal to `CriticMandate.options`).
- [ ] All unit tests in `apps/api/test/unit/verifier/council/rotation.test.ts` pass; `/preflight` clean.
- [ ] **No integration test** — the selector is a pure function with no Postgres / event interaction;
      its replay-faithfulness is the determinism pin, not an event round-trip. (Confirm at Step 2.5.)

## Wiring / entry point (Step 7.5)
**none (full runtime invocation) — first consumer is the P3 generation `verifying` phase**, which (per
generation) calls `selectCriticMandates({ rngSeed: readRngSeed(runConfig), generationIndex: generation.index })`
and passes the result as `runCouncil({ ..., mandates })`. Same deferred-wiring posture as P4.6 (the
council itself is not yet wired to a live caller). The selector is exercised end-to-end via its unit
tests. Confirm at Step 7.5: the function takes only scalar inputs (no candidate/agenome/store/gateway in
scope) and the universe is `CriticMandate.options` (no bypass list). Export it so the future P3 caller can
import it (`apps/api/src/verifier/council/rotation.ts` — direct import, consistent with how `run-council.ts`
is imported today; there is no `verifier/index.ts` barrel).

## Files expected to touch
**New:**
- `apps/api/src/verifier/council/rotation.ts` — `selectCriticMandates(...)`, `deriveGenSeed(...)` (module-
  private), and the exported tunable `DEFAULT_ACTIVE_CRITIC_COUNT` constant. Imports ONLY `CriticMandate`
  (from `@doppl/contracts`) + `createSeededRng` (from `../../runtime`). No other imports.
- `apps/api/test/unit/verifier/council/rotation.test.ts` — the RED suite below.

**Modified:** none. (If the unit glob doesn't pick up the new file, flag at Step 2.5 — but
`test/unit/verifier/council/` already holds `critic-call.test.ts` / `run-council.test.ts`, so it's covered.)

## RED test outline (Step 2) — `apps/api/test/unit/verifier/council/rotation.test.ts`
Pure function, no PG. Lead each block with a positive guard (lesson 10 — an all-negative test
false-passes if the export is `undefined`).

1. **`test_returns_valid_mandate_subset_of_default_size`** — Asserts: a default call returns an array of
   length 3; every element ∈ `CriticMandate.options`; `CriticMandate.safeParse` succeeds for each.
   - Why: §7 (the active critic set).
2. **`test_selection_is_deterministic_for_same_inputs`** — Asserts: two calls with the same
   `(rngSeed, generationIndex)` are deep-equal (members AND order).
   - Why: §4 / §7 replay-faithfulness (rule #7) — replay re-derives, never re-samples.
3. **`test_set_moves_across_generations`** — Asserts: collecting the set for generation indices `0..6`
   under one seed yields ≥2 distinct sets (the target is not invariant).
   - Why: §7 (moving target).
4. **`test_seed_drives_selection`** — Asserts: there exists a generation index for which two different
   seeds produce different sets (seed is the driver).
   - Why: §7 (rotation keyed by the persisted seed).
5. **`test_no_duplicate_mandates`** — Asserts: every returned set has unique members (Fisher-Yates
   correctness; `new Set(result).size === result.length`).
   - Why: §7 (well-formed set; a critic never doubles).
6. **`test_active_count_clamped_to_bounds`** — Asserts: `activeCount: 0` → length 1; `activeCount: 99` →
   length N (= 5) and the result is set-equal to `CriticMandate.options`; `activeCount: 5` → all 5.
   - Why: bounds safety (a tunable constant never under/over-runs the closed universe).
7. **`test_codomain_is_critic_mandate_universe_only`** — Asserts: over many `(seed, generationIndex)`
   pairs, every returned member is always within `CriticMandate.options` — never a judge / axis / scoring
   / non-mandate value.
   - Why: rule #6 (the held-out judge anchor is structurally untouchable; rotation can only ever pick
     among critics).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Consumes frozen `CriticMandate`; introduces no new/changed
  Appendix-A model and no new event type. No schema-snapshot needed (no §2.5-seam model changes).
- **§2.5-seam (shared-contract) model touched?** No *change* (the slice READS `CriticMandate.options`; it
  does not alter the contract) → no schema-snapshot test required.
- **Orchestrator doc rows to write hot (Step 9 routing):**
  - Likely an **Architecture-doc note (§7)** — name `rotation.ts` / `selectCriticMandates` as the
    deterministic per-generation critic-set selector; record the **closed-form re-derivation** decision
    (rule #7 — NOT the `persistOutcomes` bridge) + the **K-of-N MVP** semantics (default K=3, tunable).
  - Possibly a **Convention lesson** — see "Lessons-logged candidates."
  - _(Orchestrator-side note, not the impl's concern: per the multi-track carve-out the `ARCHITECTURE.md`
    §7 edit + the `IMPLEMENTATION_PLAN.md` P4 tick route to the integration owner / lead's final merge
    pass; the impl just flags the candidates at Step 9.)_

## Things to flag at Step 2.5
1. **Determinism mechanism — closed-form re-derivation vs. the `persistOutcomes` bridge.** My default
   vote (**ENDORSED by lead + user**): **closed-form pure derivation** from `(rngSeed, generationIndex)`
   — derive a per-generation seeded sub-stream, select, return; **no** outcome-bridge, **no** event, **no**
   contract. Rationale: both inputs are already persisted (seed in `run.configured`, `Generation.index`),
   so replay reproduces the identical set with zero shared-RNG-ordering coupling — analogous to §9 replay
   recomputing the deterministic cosine math from persisted vectors. "Never re-sampled" holds trivially
   because nothing samples the shared run stream. Do NOT reach for `persistOutcomes` here.
2. **Subset semantics — K-of-N subset vs. full permutation.** My default vote: **K-of-N subset** (default
   K=3). A full permutation alone does NOT move the target — the council runs *every* mandate it is given,
   so reordering 5 critics that all still run changes nothing. A *varying subset* is the real moving
   target (candidates can't overfit a fixed panel). C(5,3)=10 distinct subsets gives good per-generation
   variety with substantive coverage.
3. **Per-generation seed derivation.** My default vote: a pure-integer `Math.imul` avalanche mix of
   `(rngSeed >>> 0, generationIndex >>> 0)` → a distinct, well-distributed uint32 per generation, fed to
   `createSeededRng`. Recommended shape (you finalize the exact constants):
   ```ts
   function deriveGenSeed(rngSeed: number, generationIndex: number): number {
     let h = (rngSeed >>> 0) ^ Math.imul(generationIndex >>> 0, 0x9e3779b1);
     h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
     h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
     return (h ^ (h >>> 16)) >>> 0;
   }
   ```
   Property pins (the test enforces these, not the constants): different `generationIndex` ⇒ different
   stream (so the set actually rotates — test 3); byte-stable + pure-integer + deterministic (no
   `Math.random`/`Date.now`). A rare seed collision across generations is acceptable (it just repeats a
   set — not a safety issue); collision-freeness is NOT required.
4. **Universe source.** My default vote: `CriticMandate.options` (the frozen enum's member list — single
   source of truth, lesson 5). Never a re-declared local array (would silently drift if the union ever
   changes).
5. **`activeCount` default + bounds.** My default vote: `DEFAULT_ACTIVE_CRITIC_COUNT = 3` (exported,
   tunable later); clamp to `[1, N]`. No pinned "always-on" mandate for MVP (maximizes the moving-target
   property); a fixed core can be layered later if a generation skipping a critic proves undesirable.

## Dependencies + sequencing
- **Depends on:** P4.6 council (landed — `run-council.ts`/`critic-call.ts`); P3.6 RNG substrate
  (`createSeededRng`/`readRngSeed`, in the worktree); frozen `CriticMandate` (P0.6).
- **Blocks:** the P3 generation `verifying` phase (the real caller, which feeds the rotated set to the
  council). After this lands + the verifier→cody merge, **Phase 4 is COMPLETE**.

## Estimated commit count
**1.** A single, self-contained pure-function slice (one source file + one unit test). It is
**invariant-touching** (rules #6 + #7 are pinned structurally here) → it stands **SOLO**, never bundled
(there is no other open verifier task to bundle with anyway — it's the last P4 task). **security-reviewer
applies (invariant policy):** confirm (a) no judge/rubric/scoring import (rule #6 anchor untouchable),
(b) no model/web/store seam import + pure determinism (rule #7 replay-safe), (c) no candidate/agenome
input path (selection uninfluenceable by candidate content).

## Lessons-logged candidates anticipated
- **Convention candidate** — "a per-generation deterministic selection that is a pure closed-form function
  of PERSISTED inputs (run seed + generation index) is re-derived on replay rather than recorded through
  the outcome bridge — the bridge is for draws that are position-dependent on the shared run stream
  (mutation/fusion); a self-contained closed-form derivation needs neither an outcome log nor an event,
  and stays replay-faithful by construction. Confine the codomain to the closed target union (here
  `CriticMandate.options`) so the selector structurally cannot touch the immutable judge anchor (rule
  #6), and keep candidate/agenome inputs out of the signature so the choice is uninfluenceable."
- **Architecture-doc note candidate** — §7: name `selectCriticMandates` (`rotation.ts`) as the
  deterministic per-generation critic-set rotation; record the closed-form-not-bridge decision + the
  K-of-N (default 3) MVP semantics.

## How to invoke
1. **Read this brief end-to-end** (session is already oriented — no `/session-start`).
2. **Run `/tdd critic_set_rotation`.**
3. **Step 0/1** — confirm Feature + the 2-file list (one source + one unit test; no integration test).
4. **Step 2.5** — answer the 5 design questions (or take defaults; Q1 + Q2 are already lead/user-endorsed)
   and send the Step-2.5 write-up (asserted-invariant + coverage map) to the orchestrator before GREEN.
5. **Step 9** — surface anything beyond the anticipated candidates. **security-reviewer applies
   (invariant policy).**
