# Case Study: Metro Route Crowding And Passenger Choice

## Summary

A metro system experiences crowding on certain routes, interchanges, or line segments while some alternatives appear underused. Adding physical capacity is slow and expensive. Passengers make route decisions with incomplete information, familiar habits, and official navigation aids. This version intentionally withholds the known solution pattern so it can be used as a Doppl prompt.

## Source

### Type

Research papers and candidate note.

### Origin

Derived from public research on metro route choice and London Underground passenger behavior.

### Source File

`../sources.md` — Candidate Triage List A, item 7 ("The London Underground Map Distortions").

### Derived By

Doppl capstone team.

### Fidelity

Summarized.

### Source Notes

The known solution pattern is intentionally omitted. Public source links should not be shown during generation if previews reveal the frame.

## Visibility

### Level

Public.

### Anonymized

No private individual details are included.

### Public Summary Allowed

Yes.

### Sensitive Details

- The solution pattern should be withheld during generation runs.
- Do not claim a specific implemented deployment unless later verified.

### Sharing Notes

Safe as a public benchmark prompt with source caveats.

## Problem

### Statement

Passenger demand concentrates on some metro routes and interchange points even when alternatives exist.

### Background

Urban rail networks are complex. Passengers use maps, signs, journey planners, memory, and habit to decide how to travel. Some riders may not know or trust alternative routes.

### Why It Matters

Crowding reduces comfort and reliability. If avoidable route concentration persists, expensive physical capacity can be used inefficiently.

### Current State

The problem is commonly framed as insufficient capacity at crowded points. Proposed fixes include more trains, larger stations, crowd marshals, and infrastructure expansion.

### Impact

If the agency treats route concentration only as a physical capacity issue, it may miss cheaper ways to redistribute demand.

### Scope

This case focuses on route choice and non-capital demand management in a metro network. It does not solve all rail capacity or timetable planning.

## Purpose

### Goal

Test whether Doppl can identify the hidden variable behind route crowding and generate an ethical demand-shaping intervention.

### Questions

- What hidden variable affects passenger route choice?
- Why might physical capacity expansion be incomplete?
- What intervention can shift some passengers to better alternatives?
- How should the intervention avoid misleading passengers?

### Success Criteria

A strong generated answer should:

- Identify a non-physical driver of route choice.
- Propose a specific low-capex intervention.
- Include trust, accessibility, and network-effect safeguards.
- Define a measurable pilot.

### Audience

Doppl builders, transit planners, wayfinding designers.

## User

### Name Or Role

Transit operations or passenger-experience team.

### Goals

- Reduce crowding.
- Improve use of underused routes.
- Avoid unnecessary capital works.
- Preserve passenger trust.

### Needs

- A way to reveal viable alternatives.
- A measurement plan.
- Ethical constraints.
- Passenger-facing implementation details.

### Pain Points

- Infrastructure is constrained.
- Passengers are habitual.
- Network alternatives may be hard to see.
- Nudges can backfire if they feel manipulative.

## Environment

### Setting

Metro network with maps, signs, digital journey planners, smart-card data, and congested segments.

### Tools Or Systems

- Network map.
- Journey planner.
- Station signage.
- Crowding data.
- Origin-destination data.
- Service-alert channels.

### Inputs

- Passenger route shares.
- Crowding by segment.
- Alternative route options.
- Travel times.
- Transfer conditions.
- Accessibility data.

### External Factors

- Commuter familiarity.
- Tourist use.
- Service disruption.
- Accessibility needs.
- Trust in official guidance.

### Assumptions

- Some passengers can switch routes.
- Some route choices are habitual or information-driven.
- The authority can test non-capital changes to passenger behavior.

## Constraints

### No Quick Physical Expansion

New infrastructure is slow and expensive.

### Must Preserve Trust

Passenger information cannot become deceptive.

### Alternatives Must Be Good Enough

The intervention should not send people to materially worse journeys.

### Network Effects Matter

Moving passengers can create crowding elsewhere.

### Accessibility Must Be Protected

Alternative routes may differ in steps, lifts, walking distance, and interchange difficulty.

## Failed Attempts

### Add Capacity

**Approach:** Add trains, platforms, or station capacity.

**Outcome:** Expensive and slow.

**Why It Failed:** It may ignore avoidable concentration caused by route choice.

**Lesson:** Demand distribution matters.

### Generic Crowding Warnings

**Approach:** Warn passengers that a line or station is busy.

**Outcome:** May not change behavior if alternatives are unclear.

**Why It Failed:** Warnings without specific alternatives are hard to act on.

**Lesson:** The intervention must support a concrete route decision.

### Passive Information Publication

**Approach:** Publish more static information and assume passengers will optimize.

**Outcome:** Habit often persists.

**Why It Failed:** People do not constantly search for better routes.

**Lesson:** Route experimentation may need prompting.

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

This section is intentionally blank for the Doppl run. The agenome should generate a proposed intervention after completing Problem Recovery.

### Summary

_To be generated._

### Details

_To be generated._

The proposed solution should explain:

- what intervention should be used
- where it appears in the journey
- how it avoids misleading passengers
- how accessibility and network effects are handled
- how the pilot would be measured

## Reproducible

### Is Reproducible

Yes, approximately.

### Reproducibility Level

Approximate.

### Steps

1. Provide this withheld case.
2. Ask the system to complete Problem Recovery.
3. Ask it to propose an intervention and validation plan.
4. Compare against the evaluator version.

### Required Inputs

- Withheld case.
- Evaluator version.
- Optional route and crowding data.

### Expected Result

A strong system should recover the hidden variable and propose an ethical, measurable demand-shaping intervention.

### Known Variability

The exact answer depends on the network, data, and passenger-information channels.

## Validator

### Name Or Role

Transit planner or wayfinding designer.

### Relationship To Case

Can judge feasibility, ethics, and passenger trust.

### Can Validate

- Route-choice plausibility.
- Wayfinding quality.
- Accessibility handling.
- Network effects.
- Hidden-variable recovery.

### Validation Method

Rubric review, simulation, or pilot.

## Open Questions

- Which route-choice data is available?
- Which alternatives are genuinely acceptable?
- What ethical limits should govern passenger-information nudges?

## Notes

This case is public and research-supported. Score frame recovery more than exact historical matching.
