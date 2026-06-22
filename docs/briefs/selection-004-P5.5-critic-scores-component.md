# /tdd brief — critic_council_scores_fitness_component (P5.5 — critic-scores half)

## Feature
The **rotating critic-council** fitness-component input for the selection track: a pure
`criticScores(reviews)` that aggregates a candidate's persisted `CriticReview` set into one named
fitness-component value + explanation, treating critic reviews as **evidence inputs only** (never
selecting winners, never altering the scoring policy — rule #6), reading only the **numeric**
`scores`+`confidence` (never the free-text `critique`/candidate text — rule #5 alignment), and producing
a value that is **deterministic + replay-reconstructable** from the persisted `critic.reviewed` events.

> **Scope note — this is the CRITIC half of P5.5 only.** The held-out-judge half
> (`judge-acceptance.ts`) is **HELD**: the human ratified **Option A** for the judge-output seam (a
> forthcoming-frozen `JudgeResult` + `judge.reviewed` event, authored cross-track on the contract track).
> This brief does NOT touch the judge path and does NOT depend on the unfrozen shape. P5.5 stays
> **un-ticked** until the judge half lands. `judge-acceptance.ts` is a separate brief once the amendment
> merges to cody + pulls into this worktree.

## Use case + traceability
- **Task ID:** P5.5
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (decomposed fitness components — the
  rotating critic-council scores as a distinct named component, separate from the held-out judge;
  explainability from persisted events), `§7` (critic council emits structured evidence only; rotation).
- **Related context:**
  - Consumes frozen `CriticReview` (P0.6): `{id, candidateId, mandate, scores(record<string,number>),
    critique, confidence(∈[0,1]), evidenceRefs[]}` — closed 5-member `CriticMandate`. Evidence-only is
    **structural** in the frozen shape (no winner/override/policyVersion field representable) — this slice
    **consumes** that guarantee, it does not re-enforce it.
  - Mirrors P5.4 energy-efficiency: a pure read-only fitness-component computation over persisted events;
    same `{value, explanation}`-style return that **P5.6** (the fitness scorer) places into
    `FitnessScore.components` under a named key + weights via the `ScoringPolicy`.
  - **Solo by dependency-isolation, not safety** — the only currently-unblocked P5 work (judge-acceptance
    + P5.6/7/9/10/11 are held on the Option-A amendment); nothing to bundle it with.
  - Carry-forward: treat `candidateId` as **opaque untrusted bytes**.

## Acceptance criteria (what "done" means)
- [ ] `criticScores(reviews: CriticReview[]): { value: number, reviewCount: number, explanation: string }`
      is **pure** over the input review set — no IO, no gateway, no clock/RNG.
- [ ] The value aggregates the reviews per the pinned formula (Q1+Q2 — default: confidence-weighted mean
      of each review's mean score); it is a deterministic function of the reviews' **numeric
      `scores`+`confidence` only** — **independent of `critique` text / candidate text** (rule #5/#6
      alignment).
- [ ] **Evidence-only (rule #6):** `criticScores` returns a number to be weighted by `ScoringPolicy`
      downstream; it does NOT pick winners, mutate anything, or carry/produce any scoring-policy field —
      pinned by the pure-function signature + the no-mutation-of-input test.
- [ ] **Empty / no-reviews boundary** (Q3): an empty review set → a **defined** value + `reviewCount:0`
      with an explanation that flags absence (never a silent 0 that reads as "critics scored it zero").
- [ ] **Degenerate-confidence boundary** (Q3): if the confidence-weighted denominator is 0 (all reviews
      `confidence:0`), fall back to the defined boundary (plain mean or neutral per Q3) — no
      divide-by-zero / `NaN`.
- [ ] A review whose `scores` record is **empty** is handled deterministically (Q4 — default: contributes
      its `confidence` weight with a per-review mean of the defined empty-scores value, or is excluded;
      pinned either way).
- [ ] `explanation` enumerates each contributing review's `mandate`, its per-review mean, and its
      confidence weight (audit trail — §8 explainable from persisted events).
- [ ] `criticScores` does **not** mutate the input `reviews` array or any review object.
- [ ] All unit tests in `apps/api/test/unit/selection/components/critic-scores.test.ts` pass; full
      `apps/api` unit suite green (no regressions).
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — consumer wiring lands in P5.6.** `criticScores` is a pure fitness-component function exported
from the selection barrel. **First consumer (named) = P5.6** (the policy-versioned fitness scorer — HELD
on the Option-A judge amendment), which composes `criticScores(...).value` into `FitnessScore.components`
under a named key and weights it via the active `ScoringPolicy`. No event emission of its own (P5.6 emits
`fitness.scored`). Reachable now via the unit suite (frozen `CriticReview` fixtures) + the barrel export.

## Files expected to touch
**New:**
- `apps/api/src/selection/components/critic-scores.ts` — `criticScores(reviews)` → `{value, reviewCount, explanation}`. Pure.
- `apps/api/test/unit/selection/components/critic-scores.test.ts`

**Modified:**
- `apps/api/src/selection/index.ts` — export `criticScores` + its result type.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `apps/api/test/unit/selection/components/critic-scores.test.ts`:

1. **`critic_scores_aggregates_per_formula`** — for a known 2-review set, `value` equals the pinned
   confidence-weighted mean of per-review means. Why: §8 decomposed critic component.
2. **`critic_scores_per_review_mean_of_scores`** — a review's contribution uses the mean of its `scores`
   record values. Why: §8 (open `scores` record reduced deterministically).
3. **`critic_scores_confidence_weighted`** — a higher-confidence review moves `value` more than a
   lower-confidence one with the same scores (Q2 default). Why: §7 confidence is the critic's reliability.
4. **`critic_scores_independent_of_critique_text`** — two review sets identical in `scores`+`confidence`
   but with different `critique` strings produce the **same** `value`. Why: rule #5/#6 — text never moves
   the score (anti-injection / anti-reward-hacking).
5. **`critic_scores_empty_set_defined_boundary`** — `[]` → defined `value` + `reviewCount:0` + absence
   flagged in explanation. Why: P5.5 boundary (not silent 0).
6. **`critic_scores_all_zero_confidence_no_nan`** — all `confidence:0` → defined boundary value, no
   `NaN`/divide-by-zero. Why: degenerate-denominator boundary.
7. **`critic_scores_empty_scores_record_deterministic`** — a review with `scores:{}` handled per Q4
   (pinned). Why: deterministic boundary.
8. **`critic_scores_reviewCount_reported`** — `reviewCount` equals the input length. Why: lets P5.6
   distinguish "0 reviews" from "reviews averaging 0."
9. **`critic_scores_explanation_enumerates_mandate_and_contribution`** — explanation includes each
   review's `mandate` + per-review mean + confidence (inclusion-based). Why: §8 explainability.
10. **`critic_scores_deterministic_order_independent`** — permuting the review set yields the identical
    `value` (commutative aggregation). Why: replay-reconstructable from persisted events.
11. **`critic_scores_does_not_mutate_input`** — input array + review objects deep-equal a pre-call
    snapshot. Why: purity (P5.6 reads the same reviews elsewhere).
12. **`critic_scores_reviews_validate_against_CriticReview`** — fixtures parse via the frozen
    `CriticReview` (bind to `CANONICAL_FIXTURES.validCriticReview`). Why: §2.5 frozen-seam conformance.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Consumes frozen `CriticReview`/`CriticMandate` (P0.6). Does NOT touch
  `FitnessScore` (P5.6 composes the component) and does NOT touch the forthcoming judge contract.
- **Orchestrator doc rows to write hot (Step 9 routing):** §8 arch-note candidate — pin the
  **critic-council aggregation formula** (Q1+Q2) like the novelty/energy formulas, so P5.6 depends on a
  defined value. (Mine to route → integration.)
- **§2.5-seam model touched?** No shape change — consume-only; `CriticReview` field-set snapshot already
  exists in `packages/contracts`. No new schema-snapshot; conformance pinned by test 12.

## Things to flag at Step 2.5
1. **Per-review score reduction.** Each `CriticReview.scores` is an open `record<string,number>`. Default
   vote: **mean of the review's score values** (a review with `{grounding:4,citations:3}` → 3.5). Simple,
   deterministic, mandate-agnostic. Alternative: sum, or a mandate-specific key pick. I lean mean.
2. **Cross-review aggregation + confidence.** Default vote: **confidence-weighted mean of per-review
   means** (Σ confidenceᵢ·meanᵢ / Σ confidenceᵢ) — uses the reliability signal the contract deliberately
   carries; a 0-confidence critic contributes nothing. Alternative: plain arithmetic mean (confidence
   recorded in the explanation only, no zero-denominator edge). Both leave the final weighting to P5.6's
   `ScoringPolicy`. I lean **confidence-weighted** with the all-zero boundary handled (Q3); say so if
   you'd rather keep it plain-mean-simple.
3. **Boundary values (empty set + zero-denominator).** Default vote: **empty set → `{value:0, reviewCount:0,
   explanation:"no critic reviews — component absent"}`** (0 as the neutral, reviewCount lets P5.6 treat
   absence specially); **all-zero-confidence → fall back to the plain mean** of per-review means (so the
   information isn't discarded). Push back if you'd rather absence be a distinct sentinel than 0.
4. **Empty `scores:{}` on a single review.** Default vote: **exclude that review from the value but count
   it in `reviewCount` + note it in the explanation** (a critic that emitted no numeric scores shouldn't
   inject a fabricated 0). Alternative: treat empty-scores mean as 0. I lean exclude-but-note.
5. **Normalization / range.** Default vote: **no normalization in the component** — report the raw
   aggregated value; range-scaling is exactly what `ScoringPolicy.normalization` (P5.6) is for. Keeps
   critic-scores an honest reporter of what the critics said. Flag if you want a [0,1] normalization
   assuming the §7 0–5 scale baked in here instead.
6. **Mandate weighting.** Default vote: **all mandates weighted equally in MVP**; the per-mandate
   breakdown lives in the explanation for auditability. Per-mandate weighting is a `ScoringPolicy` concern,
   deferred. Flag if you want per-mandate grouping now.

## Dependencies + sequencing
- **Depends on:** P0.6 (`CriticReview`/`CriticMandate` ✓), P5.1 ✓ via P0. (Independent of the judge path +
  P5.6.)
- **Blocks:** P5.6 (the fitness scorer composes `criticScores.value` into `FitnessScore.components`) — P5.6
  itself is HELD on the Option-A judge amendment.
- **Held (not blocked by this slice):** P5.5 judge-acceptance half → its own brief once `JudgeResult` +
  `judge.reviewed` merge to cody + pull into this worktree.

## Estimated commit count
**1 — SOLO** (by dependency-isolation). ~30 lines, a pure read-only fitness-component computation —
analogous to P5.4. Not a safety-invariant slice (it **consumes** the evidence-only `CriticReview`
guarantee structurally, it doesn't enforce it), so the solo-ness is "nothing else is unblocked," not the
safety carve-out. **Do NOT tick P5.5 complete** when this lands — only the critic half is done; the judge
half remains held.

## Lessons-logged candidates anticipated
- **Architecture-doc note candidate** — §8: pin the critic-council aggregation formula (Q1+Q2) + the
  absence/zero-denominator boundary so P5.6 depends on a defined value (sibling to the novelty/energy
  formula notes).
- **Convention candidate** — fitness-component purity: a component reads only the **numeric** fields of an
  evidence contract (never free-text/candidate text), returns `{value, count, explanation}`, defers
  weighting/normalization to the `ScoringPolicy` — so candidate/critic text can never move a fitness
  component (rule #5/#6 alignment), and the component is replay-reconstructable from persisted events.
- **Future TODO (P5.6)** — `criticScores.value` → `FitnessScore.components` under a named key, weighted by
  the active `ScoringPolicy`; held on the Option-A judge amendment.

## How to invoke
1. **Read this brief end-to-end** — note the **scope boundary** (critic half of P5.5 only; judge half
   held on Option A) and the 6 Step-2.5 questions.
2. **Run `/tdd critic_council_scores_fitness_component`**.
3. **Step 0/1** — confirm against Feature + Files (note P5.5 is partial).
4. **Step 2.5** — send the test-design write-up (one `Asserts: <invariant> (§anchor)` line per test +
   coverage map per acceptance bullet) + votes Q1–Q6. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 9** — categorized flags + ship-ask; hold the §8 formula note for me to route. Flag explicitly
   that P5.5 must NOT be ticked complete (judge half held).
