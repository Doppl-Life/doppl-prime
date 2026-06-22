# Fitness And Selection Spec

## Contract

Fitness is not one vibe score. The kernel keeps the load-bearing axes visible:

- `novelty`: did this reach somewhere not already covered?
- `grounding`: did this land on something true, checkable, or externally
  supported?
- `decay`: how fast does the claim lose fitness as the world changes?
- `mechanismCost`: what ownership, dependency, workflow, or complexity cost does
  this introduce?
- `lensFit`: observer-relative usefulness, applied after intrinsic fitness.

Selection may weight the axes, but the tradeoff must remain inspectable.

## Novelty

Novelty cannot be pure model self-grading.

Preferred signals:

- absence from harvested sources or prior memory.
- distance from the stated complaint.
- a new substrate, hidden dependent, disappearing event, or adoption boundary.
- cluster coverage: this branch explains a region no current survivor covers.
- nearest-prior comparison with a named delta.

Bad novelty:

- "the model says this is surprising."
- style changes.
- a wild claim with no mechanism.
- a rarer wording of the same thesis.

## Grounding

Grounding must point outside the prose.

Preferred signals:

- source support.
- mechanism clarity.
- falsifiable near-future prediction.
- held-out case or withheld solution comparison.
- executable check.
- dated signal for zeitgeist cases.
- human verdict from the local judgment ledger or Agora contract.

Bad grounding:

- eloquence.
- agreement among siblings that saw the same prompt.
- unsupported specificity.
- a feasibility argument pretending to be truth.

## Decay

Decay is the time axis of fitness.

- `cross_domain_transfer` has slow decay when the mechanism would still work
  five years earlier or later.
- `zeitgeist_synthesis` has fast decay when timing is load-bearing.
- A dated signal needs refresh or retirement.
- A strong idea can still be brittle if it overfits the current regime.

The BlackBerry lesson: high current adoption and lock-in can hide lethal decay
when the substrate changes.

## Mechanism Cost

Cost is a fitness component, not taste.

Count:

- new dependencies.
- glue code.
- workflow burden.
- irreversible commitments.
- hand-maintained reports.
- data access requirements.
- safety or leakage risk.

A costly mechanism can still win if it buys evidence, correctness, speed, or
decisive user value. It cannot win just because it is elaborate.

## Lens Fit

The engine scores what is novel, grounded, durable, and cheap enough. A lens asks
whether the result is worth acting on for a specific user, demo, or strategy.

Examples:

- capstone-demo-fit.
- market/arbitrage interest.
- build-moat.
- research-benchmark value.

Lens fit can re-rank or filter. It must not rewrite novelty, grounding, or decay.

## Selection

Current v1 selection can use weighted scoring because it is simple and visible.
That is a starting implementation, not a law.

Rules:

- show the component scores.
- show why a candidate was rejected.
- keep the other dial's best candidate when useful as a regret sibling.
- preserve failed checks.
- do not let high novelty erase zero grounding.
- do not let high grounding erase "already obvious."

## Regret Siblings

A regret sibling is the candidate the other dial would have kept from the same
generated pool.

Purpose:

- prove direction matters.
- show the human the missed branch.
- expose whether "diverge" and "converge" are just labels over the same result.

If the same candidate wins both schedules, record that as evidence. It is not
automatic failure; it may mean the pool is small, the case is obvious, or the
candidate is genuinely dominant.

## Pareto Risk

Weighted sums can miss candidates on a concave frontier. If runs show repeated
"interesting but never selected" candidates that humans mark as keepers, test a
Pareto selection pass:

- non-dominated sorting across novelty, grounding, decay, and cost.
- crowding distance to preserve branch diversity.
- lens fit only after intrinsic fronts are built.

Do not add this until the weighted v1 visibly loses useful candidates.

## Consensus Gap

The central open question is whether novelty x grounding is the best space, or
whether the second axis should be truth vs consensus-gap.

Stress test with FSD:

- A claim can be high grounding and high novelty but have low consensus-gap if
  every serious observer already knows it.
- A valuable Pepsi may be the implication nobody has priced, not the surface
  claim "FSD is coming."

The kernel should preserve enough score detail to test this without rewriting
the corpus.

## Tripwires

- A candidate wins on novelty with no external support.
- A candidate wins on grounding while restating the case.
- A human marks repeated rejected candidates as keepers.
- Diverge/converge proof cannot name a regret sibling or shared-pool result.
- Decay-sensitive cases keep winning with stale signals.
- Mechanism cost is hidden in prose instead of scored.
