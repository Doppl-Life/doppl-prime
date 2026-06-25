# Case Study: Superyacht Connectivity Continuity (Unsolved)

## Summary

A charter guest paying roughly $2 million a week expects land-identical internet everywhere the yacht goes — their calls, streams, and feeds must never visibly stutter. Starlink collapsed the old economics of yacht connectivity, taking what used to cost about $30,000 a month on bulky VSAT domes down to a couple hundred dollars a month. The obvious move is "just install Starlink and rip out the old gear," but Starlink does not cover everywhere and a single dropped frame reads as a product failure. The deliverable was never cheap, fast internet — it is *uninterrupted experience*.

The action the industry actually took is to keep redundant links and add an automatic failover layer so the connection "never perceptibly drops." That is expensive and elegant, and it is also where this case gets interesting: **it is the action taken, not a solution that closes the problem.** Stack a second bearer and you have bought a better probability, not a guarantee — so why not a third bearer, and a fourth, and a backup for the failover controller that picks between them? That regress never terminates, each added layer is itself a new thing that can fail, and the "single point of failure" simply relocates into the box that does the switching. This version deliberately **leaves the solution space blank**: it is recorded as an *open* problem, with the redundancy approach demoted to "what was tried," so the question — is seamless-feeling continuity achievable by something other than buying ever-more redundancy? — stays live.

This is a useful Doppl case precisely because the cheap answer is wrong, the expensive answer is only asymptotically right, and there is no trusted known solution to validate against — the value is in seeing whether a system can refuse both and reframe.

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

The source transcript is conversational and spans many yacht topics. This writeup isolates the connectivity-continuity case while preserving the core problem, constraints, and the approach that was actually taken. It intentionally does **not** present that approach as a settled solution.

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

### Sharing Notes

Use as a capstone evaluation case and demo artifact. Public versions should keep the scenario anonymized and emphasize the reasoning pattern rather than specific commercial terms.

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
- Either propose a categorically different mechanism (e.g., hide inevitable gaps at the experience layer rather than eliminate them at the bearer layer) **or** explicitly declare the problem open and justify why redundancy is not a true solution.

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

> These are the moves that were tried or are in standard use. None closes the problem; the strongest of them — multi-bearer auto-failover — is the expensive, elegant action that *looks* like a solution and is recorded here as such, not in the solution space.

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

**Why It Doesn't Close The Problem:**

- **Probability, not guarantee.** Each added bearer multiplies reliability toward — but never reaches — 1.0. The guest is promised a guarantee; redundancy can only buy odds.
- **The regress never terminates.** If a second bearer is the answer, why not a third, and a backup for the failover controller, and a backup for *that*? "Add another backup" has no stopping rule — it is a counter you keep incrementing, not a design.
- **The single point of failure relocates.** It moves from "the link" to "the box that decides which link," which is now the critical dependency. Who backs up the chooser?
- **Diminishing returns.** Cost, footprint, licensing, and complexity grow with every layer while the reliability gain shrinks; complexity itself becomes a new source of outage.
- **Coverage holes still win.** In a true hole where no bearer is present, no amount of bearer redundancy helps — the problem is physical, not architectural.

**Lesson:** Redundancy is the expensive, elegant *action taken*, not the solution. Treating "keep the expensive backup" as the answer mistakes a probability purchase for the guarantee the guest is paying for, and quietly accepts an infinite regress.

## Solution

### Summary

Open — intentionally left blank.

### Details

This case is recorded as **unsolved**. The industry's standing answer (multi-bearer redundancy with automatic failover) is documented above under Failed Attempts as the action that was taken, because it does not close the problem — it buys better odds, relocates the single point of failure into the switching layer, and invites an endless "backup for the backup" regress.

The solution space is deliberately left empty so this case can be used to generate and stress-test genuinely different approaches. The open hypothesis worth probing: the deliverable is *zero perceptible downtime*, and perception may be addressable at a different layer than the bearer — i.e., **hiding the inevitable gap** (buffering, prediction/prefetch, local edge caching, graceful degradation, application-aware latency-hiding) rather than trying to *eliminate* every gap by stacking pipes. This is offered as a direction to test, not a validated answer; a strong generated solution should either develop a categorically different mechanism like this or argue rigorously that no better option exists.

### Why This Solution

Not applicable — no solution is asserted. See Open Questions.

### Tradeoffs

Not applicable.

### Expected Outcome

Not applicable.

### Next Steps

- Generate candidate solutions against this problem *without* defaulting to "add more bearers."
- For each candidate, check it against the four failure modes of redundancy above (probability-not-guarantee, regress, relocated SPOF, diminishing returns).
- Probe the experience-layer reframe: can perceived continuity be delivered while a bearer is genuinely down?

## Judge's Knowledge

> Material for the evaluator, not part of the student-facing problem.

The approach taken in-region is multi-bearer redundancy with automatic, session-preserving failover, and operators deliberately retain the expensive backup. The judge should treat this as **what was tried**, not as the gold answer. A generated response that merely reconstructs this approach has matched the obvious-but-flawed move and should be scored accordingly — credit is for reframing past it (or for a rigorous argument that the problem is genuinely unsolved), not for arriving at "keep the expensive backup."

## Reproducible

### Is Reproducible

Yes, approximately.

### Reproducibility Level

Approximate.

### Steps

1. Provide the problem: a guest expects land-identical, uninterrupted internet everywhere; Starlink exists but has coverage gaps and any drop is unacceptable.
2. Give the constraints, including that redundancy buys probability, not a guarantee, and that coverage holes exist where no bearer is present.
3. Ask a model or team to propose solutions with no known answer supplied.
4. Score whether the answer reframes the goal to *perceived* continuity and whether it recognizes the redundancy regress — rather than recommending "just install Starlink" or "just keep stacking backups."
5. Compare against the Judge's Knowledge note (what was tried), treating a match to it as the baseline to beat, not the target.

### Required Inputs

- The connectivity-continuity problem statement.
- Itinerary and coverage context, including the existence of true coverage holes.
- Constraints around downtime, handoff, cost, and the limits of redundancy.
- The Judge's Knowledge note for evaluator-only comparison.

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

The validator is useful for judging directionality and realism, not as an authority on specific commercial terms or licensing. Note that the validator may themselves consider redundancy "the answer" — judge directionality against the reframe, not against current industry habit.

## Open Questions

- Is *perceived* continuity achievable while a bearer is genuinely down — via buffering, prediction, local edge caching, or graceful degradation — and for which applications (streaming vs. live calls)?
- What is the right stopping rule for redundancy, if any, before the regress and diminishing returns dominate?
- How do you back up the failover controller without spawning the next layer of the same regress?
- For a true coverage hole where no bearer exists, is continuity even definable, or must the deliverable be renegotiated?
- Is "zero perceptible downtime everywhere" the right bar, or an over-specified objective that drives the regress?

## Notes

This case should be handled carefully because the superyacht domain is secretive and NDA-constrained. Frame it as a hypothetical but realistic connectivity scenario inspired by expert conversation. This is intentionally an **unsolved** case: its value is the gap between the tempting answers (cheap pipe; or expensive, regressive redundancy) and a genuine reframe of continuity. Some Doppl cases ship with solutions; by nature, others are interesting *open* problems, and that is fine.
