# Case Study: Superyacht Connectivity Continuity Problem

## Summary

A charter guest paying roughly $2 million a week expects land-identical internet everywhere the yacht goes — calls, streams, and feeds must never visibly stutter. Starlink made connectivity cheap and fast, but it does not cover everywhere, and a single dropped frame reads as a product failure. The deliverable is *uninterrupted experience*, not cheap megabits. This version is the model-facing prompt: it withholds the evaluator's notes and leaves the solution open so a system can be tested on whether it can reframe past both the cheap answer ("just use Starlink") and the expensive one ("keep stacking redundant bearers").

The goal is to see whether a system can reason from the problem and constraints to a genuinely different approach — or honestly mark the problem unsolved and justify why — without being handed an answer.

## Source

### Type

Transcript and expert recollection.

### Origin

Derived from a conversation with a superyacht-industry domain expert describing how Starlink decimated the VSAT segment, and how the real engineering problem shifted from raw connectivity to guaranteed continuity for guests with extreme expectations.

### Source File

`../jack-drone-privacy/Jack-syn-6-18.md`

### Derived By

Doppl capstone team.

### Fidelity

Summarized.

### Source Notes

The source transcript is conversational and spans many yacht topics. This withheld version isolates the connectivity-continuity problem, context, constraints, and what was tried. The evaluator-only "Judge's Knowledge" note and any solution direction are intentionally omitted.

## Visibility

### Level

Internal.

### Anonymized

Yes.

### Public Summary Allowed

Yes, if framed as a hypothetical but realistic superyacht connectivity case and stripped of identifying details.

### Sensitive Details

- Names or identifying details of owners, guests, charter clients, or vendors.
- Exact pricing, contracts, or operating details that could identify a real client.
- The evaluator-only "Judge's Knowledge" note and any solution direction, which should not be included in the prompt context for generation runs.

### Sharing Notes

This file is designed as the model-facing case prompt. It may be used in demos and evaluations, but should not include the evaluator notes or any private commercial detail.

## Problem

### Statement

A guest paying enormous sums expects the same uninterrupted internet they have at home, everywhere the yacht travels. Starlink now provides cheap, fast connectivity, but it has coverage gaps, and even a momentary drop is unacceptable. How do you guarantee *continuity* — the perception of an unbroken connection — rather than just provide connectivity, without the answer collapsing into "buy one more backup forever"?

### Background

For decades, yacht internet meant expensive VSAT — large tracking domes and dedicated satellite capacity costing tens of thousands per month. Starlink upended that, delivering comparable everyday performance for a tiny fraction of the price. The temptation is to treat connectivity as a solved, commoditized problem. But yachts travel to places no single provider reliably covers, and the guest's standard is land parity with zero perceptible interruption.

### Why It Matters

The superyacht promise is that nothing onboard feels worse than home. A guest paying $2 million a week who watches their feed freeze experiences a product failure, regardless of how cheap the underlying bandwidth became. The job to be done is continuity, not megabits. The trap is that "continuity" gets quietly redefined as "more redundancy," which is an expense, not an answer.

### Current State

Operators either keep legacy VSAT, adopt Starlink, or run both behind a routing layer that hands off between them. The prevailing in-region practice is multi-bearer redundancy with automatic failover. It works most of the time and degrades — rather than solves — at the edges: true coverage holes where no bearer is present, and the failover controller itself becoming a critical dependency.

### Impact

If unresolved:

- The guest experiences visible outages and judges the entire vessel by them.
- Operators over-invest in stacking bearers and still fail in genuine coverage holes.
- The business mistakes "we added another backup" for "we solved continuity," and pays linearly increasing cost for asymptotically shrinking reliability gains.

### Scope

This case focuses on guaranteeing *perceived* continuity for guests aboard a moving yacht with extreme uptime expectations. It does not cover cybersecurity, onboard network design beyond continuity, or shoreside infrastructure.

## Purpose

### Goal

Use the Starlink disruption to test whether Doppl can (a) see past the cheap, obvious "just use Starlink" answer, and (b) refuse to settle for the expensive, obvious "keep stacking redundant bearers" answer — recognizing that redundancy buys probability, not the guarantee the guest is paying for — and reach for a categorically different reframe, or honestly mark the problem open.

### Questions

- Can a system recognize that "just use Starlink" solves the wrong objective?
- Can it recognize that multi-bearer redundancy with auto-failover is the *action that was taken*, not a closed solution — that it regresses (backup for the backup), relocates the single point of failure into the switching layer, and has diminishing returns?
- Can it propose something that attacks the *perception* of continuity rather than buying more physical redundancy — or, failing that, state clearly that the problem is unsolved and why?

### Success Criteria

A strong generated answer should:

- Reframe the goal from cheap/fast connectivity to uninterrupted *experience*.
- Identify the regress in "add another backup": you can never reach a guarantee by stacking finite redundancy, and each layer adds its own failure surface.
- Notice that automatic failover relocates rather than removes the single point of failure (the controller that chooses the bearer).
- Either propose a categorically different mechanism or explicitly declare the problem open and justify why redundancy is not a true solution.

A weak answer "passes" the obvious bar — "run Starlink plus VSAT and/or cellular with automatic failover, and keep the expensive backup on purpose." This case exists partly to *catch* that answer, not to reward it.

### Audience

Doppl builders and evaluators who need a realistic, expert-grounded *open* problem for testing idea generation under a tempting-but-wrong obvious answer.

## User

### Name Or Role

Yacht owner, charter manager, or AV/IT integrator responsible for guest connectivity.

### Goals

- Deliver land-identical, uninterrupted internet everywhere the yacht goes.
- Avoid any perceptible outage for guests.
- Control cost without sacrificing reliability.

### Needs

- Coverage across regions where any single provider has gaps.
- A connection that *feels* continuous even when no single bearer can guarantee it.
- Session persistence so streams and calls do not drop.

### Pain Points

- Starlink alone has coverage gaps.
- Manual switching is too slow; the guest notices.
- A price collapse tempts operators to drop redundancy entirely — or, in the other direction, to keep buying redundancy as if it were a guarantee.

## Environment

### Setting

A yacht underway across varied regions and latitudes, carrying guests with extreme uptime expectations.

### Tools Or Systems

- Starlink terminal(s).
- Legacy VSAT and/or alternative satellite capacity.
- Cellular (4G/5G) near shore.
- A routing/steering layer capable of multi-bearer bonding and failover.

### Inputs

- Knowledge that Starlink is cheap and fast but not universal.
- A guest expectation of zero perceptible downtime.
- Existing onboard network and provider options.

### External Factors

- Satellite coverage maps and regional availability.
- Maritime licensing and IMO regulation.
- Rapidly shifting provider economics.

### Assumptions

- Multiple bearers are available to combine, but none covers everywhere.
- There exist genuine coverage holes where *no* bearer is present.
- The guest values reliability over cost, but cost and complexity still grow with every added layer.

## Constraints

### Coverage Gaps

No single provider — including Starlink — covers everywhere the yacht goes, and some itineraries pass through holes where *no* bearer is present.

**Rationale:** A single-bearer solution will eventually enter a region where that bearer is weak or absent. Stacking bearers shrinks but never eliminates this, because physical coverage holes exist.

### Zero Perceptible Downtime

The guest's standard is land parity: the connection must never visibly drop, even for seconds.

**Rationale:** The product is the experience; a perceptible gap is a product failure regardless of underlying cost or speed.

### Redundancy Is Not A Guarantee

Adding links improves the *probability* of an available bearer; it does not provide the guarantee the guest is paying for, and the regress (a backup for the backup, and a backup for the failover controller) never terminates.

**Rationale:** Finite redundancy can only push reliability toward 1.0 asymptotically while cost and failure surface grow. A solution that scores well must not depend on "just add another bearer."

### Cost And Footprint Are Secondary But Real

Reliability outranks cost, but hardware footprint (domes), licensing, and the complexity of the switching layer still matter.

**Rationale:** Owners want reliability without an ugly, non-compliant, or fragile installation; every added layer is also a new thing that can fail.

## Failed Attempts

> These are the moves that were tried or are in standard use. None closes the problem. The strongest of them — multi-bearer auto-failover — is the expensive, elegant action that *looks* like a solution; it is recorded here as what was tried, not as the answer.

### Starlink-Only Replacement

**Approach:** Rip out VSAT and rely solely on Starlink because it is far cheaper and fast.

**Outcome:** Works most of the time, fails in coverage gaps.

**Why It Failed:** A single dropped connection violates the actual requirement; cheap and fast solved the wrong objective.

**Lesson:** The goal is continuity, not the lowest-cost pipe.

### Manual Switching Between Links

**Approach:** Keep multiple links and switch manually when one degrades.

**Outcome:** The guest experiences a visible gap during the switch.

**Why It Failed:** Human-speed failover is too slow to be imperceptible.

**Lesson:** Continuity requires automatic, session-preserving handoff.

### Single-Provider Redundancy

**Approach:** Add a second terminal from the same provider for resilience.

**Outcome:** Improves hardware resilience but not coverage diversity.

**Why It Failed:** Shares the same coverage profile, so regional gaps remain.

**Lesson:** Redundancy must span different bearers, not just duplicate one.

### Multi-Bearer Redundancy With Automatic Failover (the action actually taken)

**Approach:** Run diverse bearers — Starlink plus VSAT and/or cellular — behind an SD-WAN-style routing layer that monitors link health, bonds or prioritizes links, and fails over automatically while preserving sessions. Keep the expensive backup on purpose for the regions where the cheap link is weak.

**Outcome:** The best available in-region practice. The connection usually feels continuous, and the guest rarely notices a handoff.

**Why It Doesn't Close The Problem:** It improves the odds of an available bearer but does not deliver the guarantee the guest is paying for, and it does nothing in a true coverage hole. Whether it can ever amount to a real solution — or only a better probability — is left for the run to analyze (see Constraints).

**Lesson:** Treat this as the baseline to beat, not the target.

## Problem Recovery

This section is intentionally blank for the Doppl run. Before proposing a solution, the agenome should recover the actual problem using only the problem, purpose, constraints, failed attempts, user, and environment sections above. Treat the stated problem as a symptom report, not as a binding requirement.

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

This section is intentionally blank for the Doppl run. This is an **open** case: the agenome should either generate a categorically different mechanism after completing Problem Recovery, or argue rigorously that the problem is unsolved. It should not default to "add more bearers."

### Summary

_To be generated._

### Details

_To be generated._

The proposed solution should explain:

- what mechanism, workflow, or reframe is used (or why none exists)
- how it addresses *perceived* continuity rather than merely stacking physical redundancy
- how it handles a true coverage hole where no bearer is present
- how it avoids the failed attempts above
- how it handles each listed constraint

### Why This Solution

_To be generated._

Explain why this approach fits the problem and constraints better than the failed approaches — or why no approach does.

### Tradeoffs

_To be generated._

List the risks, limitations, dependencies, or ways this approach could fail.

### Validation Plan

_To be generated._

Describe how an evaluator could test whether the proposed approach is plausible, constraint-aware, and operationally useful.

## Reproducible

### Is Reproducible

Yes, approximately.

### Reproducibility Level

Approximate.

### Steps

1. Provide this withheld case study as the prompt context.
2. Ask the system to complete Problem Recovery.
3. Ask it to generate an approach (or a justified declaration that the problem is open), with tradeoffs and a validation plan.
4. Require it to check any candidate against the limits of redundancy described in the constraints.
5. Compare generated answers against the full evaluator version, treating multi-bearer failover as the baseline to beat.

### Required Inputs

- This withheld case study.
- The full evaluator version (including Judge's Knowledge) for evaluator-only comparison.
- A scoring rubric for reframing, constraint-awareness, and intellectual honesty about open problems.

### Expected Result

A strong system should refuse both obvious answers and either reach for an experience-layer reframe or honestly mark the problem open with a justified critique of redundancy.

### Known Variability

Generated answers will differ in how they attack the perception layer (or whether they conclude it is unsolved). They can still be directionally strong if they reframe the objective and avoid treating "add another bearer" as a closing move.

## Validator

### Name Or Role

Superyacht-industry connectivity domain expert or AV/IT integrator.

### Relationship To Case

Supplied the original disruption story and can judge whether proposed answers are plausible for real guest expectations and operating conditions.

### Can Validate

- Domain plausibility.
- Whether the answer reframes connectivity as *perceived* continuity.
- Whether the answer escapes the redundancy regress rather than restating it.
- Operational fit for guest expectations and yacht itineraries.

### Validation Method

Async feedback or live review.

### Notes

The validator should compare generated answers against the full evaluator-only case. Note that the validator may themselves consider redundancy "the answer" — judge directionality against the reframe, not against current industry habit. This prompt-facing file should remain free of the evaluator notes.

## Open Questions

- Is *perceived* continuity achievable while a bearer is genuinely down — via buffering, prediction, local edge caching, or graceful degradation — and for which applications (streaming vs. live calls)?
- What is the right stopping rule for redundancy, if any, before the regress and diminishing returns dominate?
- How do you back up the failover controller without spawning the next layer of the same regress?
- For a true coverage hole where no bearer exists, is continuity even definable, or must the deliverable be renegotiated?
- Is "zero perceptible downtime everywhere" the right bar, or an over-specified objective that drives the regress?

## Notes

This case should be handled carefully because the superyacht domain is secretive and NDA-constrained. Frame it as a hypothetical but realistic connectivity scenario inspired by expert conversation. This is intentionally an **open** case: its value is the gap between the tempting answers and a genuine reframe. The full evaluator version is `jack-yacht-connectivity-continuity-unsolved.md`.
