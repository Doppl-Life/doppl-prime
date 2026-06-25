# Case Study: Full Self-Driving Is Solved — Now Game Out the Unlock

## Summary

Premise: general-purpose, vision-based self-driving is solved; the remaining work
is the March of Nines, not feasibility, and in 2025–2026 the legal gate is opening
too (Texas, California progressing). The consensus prices this as "robotaxis
someday, which company wins." This version withholds the synthesis so it can be
used as a Doppl `zeitgeist_synthesis` prompt: the system must recover the real
problem and then **game out** the non-obvious cascade.

## Source

### Type

Article synthesis, market signals, and a strong directional prior.

### Origin

Built from public reporting on autonomy deployment, the build-vs-retrofit cost
contrast, and the crash-cost base.

### Source File

`../sources.md` (Signal Set D); the evaluator file carries the citations.

### Derived By

Doppl capstone team.

### Fidelity

Heavily synthesized.

### Source Notes

The synthesis (thesis, why-now, gamed-out cascade, predictions) is intentionally
omitted. The case stakes a directional claim ("solved; March of Nines"); the
falsifiable predictions carry the risk. Do not present cited statistics as audited
fact during generation.

## Visibility

### Level

Public.

### Anonymized

No private individuals; company names are public.

### Public Summary Allowed

Yes, with caveat.

### Sensitive Details

- Do not present generated output as investment advice.
- Predictions are bets, not facts.
- Handle the human-cost effects (deaths, injuries) soberly, not glibly.

### Sharing Notes

Use as a synthesis benchmark, not a forecast of record.

## Problem

### Statement

Vision-based autonomy is effectively solved and is becoming legal to deploy
without a human in the seat. Given that, what actually happens — especially the
parts no one is looking at?

### Background

A camera-only, end-to-end autonomy stack now drives unsupervised (no in-car
safety monitor) in a major US metro and improves through over-the-air updates to
the whole fleet. The operator builds its own vehicles (cost control, integration,
manufacturing scale) and learns from every mile. Competing approaches rely on
expensive sensor suites bolted onto vehicles they do not build and cannot update
over the air. Regulators in multiple states are now permitting driverless
operation.

### Why It Matters

If this is framed only as "robotaxis someday," the enormous, mostly non-obvious
second- and third-order effects go unpriced and unprepared for — and the approach
question (own-the-stack vs. retrofit) is misjudged.

### Current State

The loud narrative is a maybe-someday robotaxi race scored by current fleet
counts. The premise here is that feasibility is settled and the relevant question
is the cascade.

### Impact

Mispricing the moment (capability solved, market not repriced) and the scope
(obvious effects only) leaves both investors and institutions flat-footed.

### Scope

The non-obvious second- and third-order effects of solved, legal, cheap autonomy,
and the approach question that determines who captures it. Excludes safety
engineering detail.

## Purpose

### Goal

Test whether Doppl can (a) recover that the situation is "solved + now legal," not
"maybe someday"; (b) judge the approach bet (own-the-stack vs. retrofit/LiDAR);
and (c) **game out** the non-obvious cascade into a defensible, falsifiable thesis.

### Questions

- Is feasibility actually the open question, or is it timing/completion + legality?
- Why does owning the vehicle (cost, OTA, integration, fleet learning) change who
  wins, versus a retrofit/LiDAR cost structure?
- What are the non-obvious second- and third-order effects — where does the puck
  go, where does the money go?
- What does the whole cascade add up to?
- What would prove the thesis wrong?

### Success Criteria

A strong generated answer should:

- Recover the "solved + now-legal" frame (not "maybe someday").
- Make the approach argument (own-the-stack curve bends; retrofit/LiDAR cost
  structure does not).
- Acknowledge the now-visible branch (ride-hail, accident economy) briefly, then
  spend its effort on the **non-obvious** cascade, branched a few ways.
- Include the travel / door-to-door economics branch.
- Note the vision-as-substrate unlock (and that a humanoid is the same unlock,
  slower).
- Synthesize "what does this add up to."
- State a thesis with an explicit why-now and >=1 dated falsifiable prediction.
- Not stop at "robotaxis beat Uber."

### Audience

Cross-sector strategists/investors (mobility, insurance, real estate, travel,
public finance); Doppl builders.

## User

### Name Or Role

Cross-sector strategist / investor positioning for the autonomy transition.

### Goals

- Read the moment correctly (solved + legal, not maybe-someday).
- Find the non-obvious winners and losers before they are priced.
- Game out the cascade in multiple ways.

### Needs

- A correct frame and a deep, branched cascade.
- A thesis that can be acted on and later checked.

### Pain Points

- Consensus scores the race by current fleet counts and stops at ride-hail.
- Second/third-order effects are diffuse and easy to under-weight.

## Environment

### Setting

US mobility at the moment autonomy becomes solved-and-legal.

### Tools Or Systems

- A camera-only, OTA-updated, own-built autonomy fleet vs. retrofit/LiDAR fleets.
- The institutions adjacent to driving and crashes.
- Travel, logistics, real estate, labor markets.

### Inputs

- Deployment and regulatory signals.
- Cost-structure contrast (build vs. retrofit; cameras vs. LiDAR; OTA vs. none).
- Crash cost base; commute/time data; travel friction.

### External Factors

- Regulatory pace and liability regime.
- Public acceptance.
- The pace of the last "nines."

### Assumptions

- Feasibility is settled; the open variables are completion timing and legality.
- Owning the stack confers a compounding cost/quality/data advantage.

## Constraints

### Recover The Right Frame

The answer must treat feasibility as settled and identify the open variables as
completion timing + legality, not "does it work."

**Rationale:** Mis-framing as "maybe someday" produces the consensus answer.

### Go Past The Visible Branch

The obvious effects (ride-hail, accident economy) may be acknowledged briefly but
must not be the bulk of the answer.

**Rationale:** The case's value is the non-obvious cascade.

### Game It Out In Branches

The answer must develop multiple chains of consequence, ideally branched a few
ways, and then synthesize.

**Rationale:** "Where does the puck go" requires multi-step, multi-branch
reasoning, not a list.

### Falsifiability Required

The thesis must include at least one dated, checkable prediction.

**Rationale:** `zeitgeist_synthesis` subtype check.

### Timing Must Be Load-Bearing

The thesis must be wrong if proposed five years earlier or later.

**Rationale:** Otherwise it is a perennial truth or a transfer.

### No Investment Advice; Sober On Human Cost

Output is a thesis, not guidance; deaths/injuries handled soberly.

**Rationale:** Safety and tone.

## Failed Attempts

> For a zeitgeist case, "failed attempts" are the consensus plays the thesis must
> beat.

### "Robotaxis Disrupt Uber / Cheaper Rides"

**Approach:** Frame autonomy as a ride-hail cost-and-share story.

**Outcome:** True but tiny; misses the cascade.

**Why It Failed:** Optimizes the visible move; ignores the unlocked downstream.

**Lesson:** The ride market is the pawn.

### "Score The Race By Current Fleet Counts"

**Approach:** Judge who wins by how many vehicles are deployed today.

**Outcome:** Rewards a retrofit/LiDAR operator that has scaled an unsound cost
structure.

**Why It Failed:** A high per-vehicle cost with no OTA and no manufacturing
control does not compress; count is not curve.

**Lesson:** Judge the cost/quality *curve* and who owns the stack, not the
snapshot.

### "It's Still A Research Problem"

**Approach:** Treat feasibility as the open question.

**Outcome:** Waits for a milestone that has effectively passed.

**Why It Failed:** The open variables are completion timing and legality, not
"does it work."

**Lesson:** Re-price the moment: solved, not someday.

## Problem Recovery

This section is intentionally blank for the Doppl run. Before proposing a thesis,
the agenome should recover the actual problem using only the sections above. Treat
"maybe someday / which company has more cars" as a claim to examine, not a frame.

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
the cascade** (multiple chains, branched a few ways, then a synthesis), plus:

- a one-sentence **thesis**
- the **audience** it is for
- the **current signals** it rides (cited)
- a defensible **why-now** (solved + now-legal)
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
3. Ask it to game out the cascade and generate a zeitgeist-synthesis payload.
4. Compare against the evaluator target.
5. Have a cross-sector strategist score plausibility and depth.

### Required Inputs

- Withheld case.
- Evaluator version.

### Expected Result

A strong system re-prices the moment (solved + legal), makes the approach
argument, and games out a deep, branched non-obvious cascade with a synthesis and
a falsifiable thesis.

### Known Variability

Many defensible cascades exist; depth, branching, and falsifiability separate
strong from weak.

## Validator

### Name Or Role

Mobility/insurance/real-estate/public-finance analyst or autonomy strategist.

### Relationship To Case

Can judge grounding, the approach argument, cascade depth, and falsifiability.

### Can Validate

- Frame recovery (solved + legal).
- Plausibility and depth of the gamed-out cascade.
- Falsifiability of predictions.

### Validation Method

Rubric review.

## Open Questions

- How fast do the last nines and the state-by-state legal rollout actually arrive?
- Which dependent institutions restructure vs. unwind?
- How large and how soon is the vision-as-substrate / humanoid spillover?

## Notes

Use as a `zeitgeist_synthesis` frame-recovery and synthesis benchmark, and the
corpus's reference *discovered-attack + unlock* case. The trap is "maybe-someday
robotaxis scored by fleet count"; reward re-pricing the moment and gaming out the
non-obvious cascade.
