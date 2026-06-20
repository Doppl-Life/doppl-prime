# Case Study: Starship Collapses Launch Cost — Follow the Money

## Summary

Starship is pushing the cost of mass-to-orbit down by one to two orders of
magnitude (Falcon 9 commercial ~$2,700–3,000/kg; Starship near-term modeled
~$100–167/kg; target $10–100/kg). The consensus argues about destinations
(Mars/Moon). This version withholds the synthesis so it can be used as a Doppl
`zeitgeist_synthesis` prompt: the system must recover the real problem and **game
out where the money goes** when the input cost collapses.

## Source

### Type

Article synthesis and market signals.

### Origin

Built from public reporting on Starship V3, launch cadence, and launch-cost
economics.

### Source File

`../sources.md` (Signal Set D); the evaluator file carries the citations.

### Derived By

Doppl capstone team.

### Fidelity

Heavily synthesized.

### Source Notes

The synthesis (thesis, why-now, beneficiary map, predictions) is intentionally
omitted. Cost-per-kg figures are third-party models / SpaceX aspirations, not a
published rate card. Do not present them as audited fact during generation.

## Visibility

### Level

Public.

### Anonymized

No private individuals; company names are public.

### Public Summary Allowed

Yes, with caveat.

### Sensitive Details

- Not investment advice.
- Predictions are bets, not facts.

### Sharing Notes

Use as a synthesis benchmark, not a forecast of record.

## Problem

### Statement

Starship is collapsing the cost of mass-to-orbit. Given that, where does the value
actually accrue?

### Background

Reusable super-heavy lift is moving launch from a scarce, mission-by-mission
expense toward an airline-like, high-cadence service. SpaceX controls the vehicle
and its own anchor demand (Starlink V3). The relevant question is what a collapsed
launch cost unlocks downstream.

### Why It Matters

If the conversation stays on destinations, the specific second-order
beneficiaries — the picks-and-shovels and the newly-viable payload classes — go
unpriced, exactly as the EV → lithium/copper/silver winners were initially missed.

### Current State

The loud narrative is Mars/Moon and "is Starship needed?" The quieter reality is a
cost curve that re-prices the entire space value chain.

### Impact

Misreading the question (destination vs. cost-curve) means missing where the money
goes.

### Scope

The downstream value reallocation from a collapsed launch cost: enablers, inputs,
and newly-economic payload classes. Excludes the engineering of the vehicle and
the Mars-colonization debate.

## Purpose

### Goal

Test whether Doppl can recover the cost-curve framing and **game out the
beneficiary map** — using the "follow the inputs / picks-and-shovels" method — into
a defensible, falsifiable thesis.

### Questions

- Is the right question the destination, or the cost curve?
- When launch gets cheap, what becomes economic that was not?
- Where does the money go — which inputs, enablers, and payload classes re-rate?
- Who loses?
- Why is this a 2026 thesis?
- What would prove it wrong?

### Success Criteria

A strong generated answer should:

- Reframe from "destination" to "the cost curve re-prices the value chain."
- Apply the follow-the-money method (the EV → lithium/copper/silver template) to
  name specific second-order beneficiaries.
- Identify newly-viable payload classes (mass/volume-insensitive uses).
- Name the losers (legacy expendable launch).
- State a thesis with an explicit why-now and >=1 dated falsifiable prediction.
- Cite comparable cost-collapse precedents without making the analogy the point.

### Audience

Space-economy and commodity/industrials investors, payload entrepreneurs, Doppl
builders.

## User

### Name Or Role

Space-economy / industrials strategist or investor.

### Goals

- Read the moment as a cost-curve collapse, not a destination debate.
- Find the non-obvious beneficiaries before they re-rate.

### Needs

- A correct frame and a specific beneficiary map.
- A thesis that can be acted on and checked.

### Pain Points

- Consensus fixates on Mars/Moon and "is it needed."
- Second-order beneficiaries are easy to miss (as with EV commodities).

## Environment

### Setting

Global launch market at the moment reusable super-heavy lift reaches operation.

### Tools Or Systems

- Starship V3 (reusable; large payload), high-cadence authorizations.
- Propellant, ground infrastructure, space-grade materials/components.
- Newly-affordable payload classes; legacy expendable launchers.

### Inputs

- Cost-per-kg trajectory and cadence.
- Anchor demand (Starlink V3).
- The set of payloads gated by current launch cost.

### External Factors

- Regulatory cadence approvals; recovery/reuse validation.
- Competitor launch economics.

### Assumptions

- Reuse and cadence continue to drive cost down.
- A backlog of payloads is currently priced out by launch cost.

## Constraints

### Reframe To The Cost Curve

The answer must treat the cost-curve collapse — not the destination — as the
event.

**Rationale:** The destination debate misses where value accrues.

### Follow The Money

The answer must trace specific second-order beneficiaries (inputs, enablers,
payload classes), not just say "space will grow."

**Rationale:** This is the case's core method (the EV-commodity template).

### Falsifiability Required

The thesis must include at least one dated, checkable prediction.

**Rationale:** `zeitgeist_synthesis` subtype check.

### Timing Must Be Load-Bearing

The thesis must be wrong if proposed five years earlier or later.

**Rationale:** Otherwise it is a perennial truth or a transfer.

### No Investment Advice

Output is a thesis, not guidance.

**Rationale:** Safety and scope.

## Failed Attempts

> For a zeitgeist case, "failed attempts" are the consensus plays the thesis must
> beat.

### "It's About Mars / The Moon"

**Approach:** Frame Starship as a destination/colonization story.

**Outcome:** Captivating but unactionable and far-off.

**Why It Failed:** Ignores the near-term cost-curve re-pricing.

**Lesson:** The event is the cost curve, not the destination.

### "Nobody Needs Starship"

**Approach:** Argue current demand can be met by expendable rockets at today's
cadence.

**Outcome:** Misses that cheap launch *creates* demand that does not exist at
current prices.

**Why It Failed:** Demand at $3,000/kg is not demand at $150/kg.

**Lesson:** A cost collapse expands the market; do not size it at the old price.

### "Buy The Rocket Company"

**Approach:** Treat the trade as the launch provider alone.

**Outcome:** Misses the picks-and-shovels and payload-class winners.

**Why It Failed:** As with EVs, much of the money went to inputs and enablers, not
only the maker.

**Lesson:** Follow the money downstream.

## Problem Recovery

This section is intentionally blank for the Doppl run. Before proposing a thesis,
the agenome should recover the actual problem using only the sections above. Treat
"it's about the destination" and "nobody needs it" as claims to examine.

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
agenome should generate a `zeitgeist_synthesis` payload whose `details` **game out
where the money goes** (a branched beneficiary map + a synthesis), plus:

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
3. Ask it to game out the beneficiary map and generate a zeitgeist-synthesis
   payload.
4. Compare against the evaluator target.
5. Have a space-economy reviewer score plausibility.

### Required Inputs

- Withheld case.
- Evaluator version.

### Expected Result

Reframe to the cost curve + a specific, branched beneficiary map + a falsifiable,
well-timed thesis.

### Known Variability

Many defensible beneficiary maps; specificity and falsifiability separate strong
from weak.

## Validator

### Name Or Role

Space-economy / industrials analyst or payload entrepreneur.

### Relationship To Case

Can judge grounding, the beneficiary map, and falsifiability.

### Can Validate

- Cost-curve framing.
- Plausibility of the beneficiary map.
- Falsifiability of predictions.

### Validation Method

Rubric review.

## Open Questions

- How fast does reuse drive cost to the modeled levels?
- Which payload classes materialize first?

## Notes

Use as a `zeitgeist_synthesis` frame-recovery and synthesis benchmark, and a
companion *latent-asset unlock* to the firm-power case. The trap is the
destination debate; reward following the money downstream.
