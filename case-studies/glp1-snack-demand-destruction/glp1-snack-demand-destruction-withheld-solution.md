# Case Study: GLP-1 and the Packaged-Food Demand Regime

## Summary

By mid-2026, roughly one in five US households includes a GLP-1 user, and
adoption more than doubled in the year to December 2025. The packaged-food
industry is treating this as a healthy-eating trend to ride with reformulations
and "GLP-1 friendly" line extensions. This version withholds the synthesis so it
can be used as a Doppl `zeitgeist_synthesis` prompt: the system must recover what
the moment actually is before proposing a thesis.

## Source

### Type

Article synthesis and market signals.

### Origin

Built from public reporting on GLP-1 adoption and food-purchase shifts.

### Source File

`../sources.md` (signal list); the evaluator file carries the citations.

### Derived By

Doppl capstone team.

### Fidelity

Heavily synthesized.

### Source Notes

The synthesis (thesis, why-now, predictions) is intentionally omitted. Do not
present cited statistics as audited fact during generation.

## Visibility

### Level

Public.

### Anonymized

No private individuals; company names are public.

### Public Summary Allowed

Yes, with caveat.

### Sensitive Details

- Do not present generated output as investment advice or medical guidance.
- Do not assert the predictions as facts; they are bets.

### Sharing Notes

Use as a market-synthesis benchmark, not as a forecast of record.

## Problem

### Statement

GLP-1 adoption is reshaping what households buy, and packaged-food companies must
decide how to respond.

### Background

GLP-1 receptor agonists suppress appetite and were originally diabetes drugs, now
widely prescribed for weight loss. Adoption has moved from niche to roughly a
fifth of US households. The industry response so far is reformulation, smaller
packs, protein/fiber extensions, and "GLP-1 friendly" labeling.

### Why It Matters

Packaged food is a volume business with margins concentrated in salty, sweet, and
impulse categories. A demand shift in those categories is an existential P&L
question, not a marketing tweak.

### Current State

Companies are launching reformulated lines, mini-cans, and protein-forward SKUs,
framing GLP-1 as a trend to capture like prior diet movements.

### Impact

If the response misreads the moment, companies may spend heavily on line
extensions that do not recover the lost volume, while mis-managing the categories
actually in structural decline.

### Scope

US packaged-food / CPG demand and category strategy. Excludes drug-pricing
policy, clinical questions, and non-food categories — though the case asks the
system to consider whether the mechanism has implications beyond food.

## Purpose

### Goal

Test whether Doppl can recover a demand-regime change from a "healthy trend"
narrative, then synthesize a defensible, falsifiable thesis fitted to the moment.

### Questions

- Is this a preference shift among the same occasions, or a change in the number
  and nature of consumption occasions?
- Whose behavior is the unit of demand destruction — the patient, or the
  household?
- Does the mechanism stop at food, or does it generalize?
- Why is this thesis a 2026 thesis specifically?
- What would prove the thesis wrong?

### Success Criteria

A strong generated answer should:

- Recover that the mechanism acts on the brain's reward system, not just the
  stomach — and therefore destroys impulse/grazing demand rather than shifting
  flavor preference.
- Consider whether the effect generalizes beyond food.
- State a thesis with an explicit, defensible why-now.
- Give at least one dated, falsifiable prediction.
- Cite comparable prior regime changes without making the analogy the point.
- Avoid recommending "just launch a protein bar."

### Audience

CPG strategy, retail category managers, food-industry investors, Doppl builders.

## User

### Name Or Role

Packaged-food strategy lead or category investor.

### Goals

- Decide where to invest and where to manage decline.
- Avoid spending into a falling category as if it were recoverable.
- Position the portfolio for the next five years.

### Needs

- A correct read of what GLP-1 changes structurally.
- A thesis that can be acted on and later checked.

### Pain Points

- The consensus narrative is comforting and may be wrong.
- Volume and value can move in opposite directions.

## Environment

### Setting

US grocery and CPG market under rapid GLP-1 adoption.

### Tools Or Systems

- Household purchase-panel data.
- Category volume/value tracking.
- Product reformulation and packaging pipelines.

### Inputs

- GLP-1 household penetration and growth.
- Category-level spend shifts among users.
- Competitor reformulation moves.

### External Factors

- Drug pricing, coverage, and the shift from injection to pill.
- Macro grocery spend and private-label dynamics.
- Anecdotal user reports of reduced cravings beyond food (e.g., alcohol,
  impulse purchases) — unverified at the case level, included as a thread to
  examine, not a conclusion.

### Assumptions

- Adoption continues to rise over the medium term.
- User behavior changes the household basket, not only the patient's plate.

## Constraints

### Volume Versus Value

A category can lose units while gaining revenue per unit; the answer must
distinguish them.

**Rationale:** Premiumization can mask volume destruction in the P&L.

### Falsifiability Required

The thesis must include at least one dated, checkable prediction.

**Rationale:** This is a `zeitgeist_synthesis` case; an unfalsifiable thesis
fails the subtype check.

### Timing Must Be Load-Bearing

The thesis must be wrong if proposed five years earlier or later.

**Rationale:** Otherwise it is a perennial truth or a transfer, not zeitgeist.

### No Medical Or Investment Advice

Output is a market thesis, not guidance.

**Rationale:** Safety and scope.

## Failed Attempts

> For a zeitgeist case, "failed attempts" are the consensus plays implied by the
> hype narrative — the moves the thesis must beat.

### Reformulate And Relabel

**Approach:** Cut artificial ingredients, add "GLP-1 friendly" callouts.

**Outcome:** Captures attention but does not address lost occasions.

**Why It Failed:** Treats a demand-volume problem as a preference problem.

**Lesson:** Relabeling does not recover destroyed grazing volume.

### Launch A Protein / Fiber Line Extension

**Approach:** Add nutrient-dense SKUs aimed at GLP-1 users.

**Outcome:** Some incremental sales; does not offset salty/sweet declines on a
units basis in user households.

**Why It Failed:** The new SKUs ride a small growing pool while the core volume
pool shrinks.

**Lesson:** Riding the trend is not the same as managing the regime.

### Smaller Packs / Mini Formats

**Approach:** Match compressed appetites with single-serve and mini formats.

**Outcome:** Sensible mitigation; still a managed-decline tactic, not a thesis.

**Why It Failed:** Optimizes the symptom (smaller appetite) without naming the
regime change.

**Lesson:** Tactics are not synthesis.

## Problem Recovery

This section is intentionally blank for the Doppl run. Before proposing a thesis,
the agenome should recover the actual problem using only the sections above. Treat
the industry's "healthy-trend" narrative as a claim to examine, not a binding
frame.

### Observed Situation

_To be generated._

### Stated Problem Or Symptom

_To be generated._

### Source-Proposed Solution Or Assumption

_To be generated._

### Deleted Assumptions

_To be generated._

### Actual Problem

_To be generated._

### Hidden Variable

_To be generated._

### Solution Class

_To be generated._

### Confidence And Open Questions

_To be generated._

## Solution

This section is intentionally blank for the Doppl run. After Problem Recovery, the
agenome should generate a `zeitgeist_synthesis` payload:

- a one-sentence **thesis**
- the **audience** it is for
- the **current signals** it rides (cited)
- a defensible **why-now**
- at least one **falsifiable prediction** (dated)
- **comparable prior art**

### Summary

_To be generated._

### Details

_To be generated._

## Reproducible

### Is Reproducible

Yes, approximately.

### Reproducibility Level

Approximate.

### Steps

1. Provide this withheld case.
2. Ask the system to complete Problem Recovery.
3. Ask it to generate a zeitgeist-synthesis payload.
4. Compare against the evaluator target.
5. Have a CPG strategist or food-industry analyst score plausibility.

### Required Inputs

- Withheld case.
- Evaluator version.

### Expected Result

A strong system recovers a reward-driven demand-regime change (not a flavor
trend) and produces a falsifiable, well-timed thesis.

### Known Variability

Different reasonable theses can score well if the why-now and falsifiability are
strong.

## Validator

### Name Or Role

CPG strategy lead, food-industry equity analyst, or consumer economist.

### Relationship To Case

Can judge whether the thesis is grounded, novel, well-timed, coherent, and
falsifiable.

### Can Validate

- Signal grounding.
- Market-timing plausibility.
- Falsifiability of predictions.

### Validation Method

Rubric review.

## Open Questions

- How far will penetration rise, and how fast does behavior normalize over years
  on-drug?
- Does the household-basket spillover persist or fade?
- How strong is the cross-category (beyond-food) effect in real purchase data?

## Notes

Use as a `zeitgeist_synthesis` frame-recovery and synthesis benchmark. The
consensus narrative is the trap; reward the system for escaping it.
