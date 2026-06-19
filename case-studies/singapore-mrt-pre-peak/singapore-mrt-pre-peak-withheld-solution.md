# Case Study: Singapore Rail Peak-Crowding Problem

## Summary

An urban rail system experiences severe morning-peak crowding. The default response is to add physical capacity, but infrastructure and rolling-stock expansion are expensive and slow. The worst crowding is concentrated in a limited morning window, while capacity outside that window is less strained. This version intentionally withholds the known policy mechanism so it can be used as a Doppl prompt.

## Source

### Type

Public policy documentation and candidate note.

### Origin

Derived from public Singapore rail-demand management material.

### Source File

`../sources.md` — Candidate Triage List B ("Singapore Mass Rapid Transit Pre-Peak De-congestion").

### Derived By

Doppl capstone team.

### Fidelity

Summarized.

### Source Notes

Known policy details are intentionally omitted. Public source links should be hidden during generation if previews reveal the answer.

## Visibility

### Level

Public.

### Anonymized

No private individual details are included.

### Public Summary Allowed

Yes.

### Sensitive Details

- The known policy mechanism should be withheld during generation runs.
- Current fare rules may change; verify before external use.

### Sharing Notes

Safe as a public benchmark prompt.

## Problem

### Statement

Morning rail crowding creates uncomfortable trains, platform pressure, missed trains, and reliability risk.

### Background

The rail system is heavily used during a narrow commute window. Adding infrastructure to serve the highest peak is slow and capital intensive, and much of that capacity would be less used outside the peak.

### Why It Matters

Peak crowding worsens experience and can create safety and reliability concerns. It also pushes agencies toward expensive capacity projects.

### Current State

The problem is commonly framed as insufficient capacity. Proposed fixes include more trains, more track, more platforms, or larger stations.

### Impact

If the system only builds for the peak, it may spend heavily to solve a short-duration bottleneck while leaving underused capacity elsewhere.

### Scope

This case focuses on morning commuter rail peak-load management, not all transit planning.

## Purpose

### Goal

Test whether Doppl can identify the hidden variable behind a transit capacity problem and generate a practical demand-management intervention.

### Questions

- What is the actual bottleneck variable?
- Why might physical capacity expansion be an incomplete first answer?
- What intervention can reduce crowding without building new rail capacity?
- How should fairness, adoption, and measurement be handled?

### Success Criteria

A strong generated answer should:

- Identify the hidden variable.
- Propose a practical behavioral or policy lever.
- Avoid assuming all commuters can shift behavior.
- Include measurement of crowding, adoption, and tradeoffs.

### Audience

Doppl builders, transit planners, policy designers.

## User

### Name Or Role

Transit authority or public transport policy team.

### Goals

- Reduce peak crowding.
- Improve comfort and reliability.
- Avoid overbuilding.
- Maintain public legitimacy.

### Needs

- A measurable intervention.
- A clear eligibility or participation rule.
- A validation plan.
- A fairness analysis.

### Pain Points

- Infrastructure is expensive and slow.
- Commuter habits are sticky.
- Some travelers cannot change schedules.
- Demand can move in unintended ways.

## Environment

### Setting

Dense urban rail network with fare gates, commuter peaks, and time-stamped trip data.

### Tools Or Systems

- Fare collection.
- Passenger-load data.
- Station-level demand monitoring.
- Public communication channels.
- Policy eligibility rules.

### Inputs

- Tap-in and tap-out times.
- Peak passenger loads.
- Station and line crowding.
- Revenue impact estimates.
- Commuter response patterns.

### External Factors

- Employer start times.
- School schedules.
- Income sensitivity.
- Public perception.
- Network-specific crowding.

### Assumptions

- Some commuters have schedule flexibility.
- The system can measure trip timing.
- Small shifts can improve the peak experience.

## Constraints

### No Fast Infrastructure Fix

Major rail capacity expansion is slow and expensive.

### Unequal Flexibility

Not all commuters can shift travel time.

### Fiscal Cost Matters

The intervention may affect fare revenue or subsidy needs.

### Rules Must Be Simple

Commuters need to understand the behavior being encouraged.

### Avoid New Peaks

The intervention should not merely move crowding to a different cutoff.

## Failed Attempts

### Build More Capacity

**Approach:** Add track, trains, platforms, or stations.

**Outcome:** Potentially valuable long term but slow and expensive.

**Why It Failed:** It may overbuild for a short peak and does not use off-peak slack.

**Lesson:** A capacity problem may also be a distribution problem.

### Generic Public Appeals

**Approach:** Ask commuters to avoid peak travel.

**Outcome:** Low behavior change.

**Why It Failed:** Habit and schedule constraints overpower vague appeals.

**Lesson:** The desired behavior needs a concrete reason.

### Uniform Service Changes

**Approach:** Improve service equally across all times.

**Outcome:** Does not specifically target the bottleneck.

**Why It Failed:** Untargeted improvements may miss the narrow peak.

**Lesson:** The intervention has to aim at the binding variable.

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

- what policy, communications, or operations lever should be used
- who qualifies
- why commuters would change behavior
- how fiscal and fairness constraints are handled
- how the intervention would be measured

## Reproducible

### Is Reproducible

Yes, approximately.

### Reproducibility Level

Approximate.

### Steps

1. Provide this withheld case study.
2. Ask the system to complete Problem Recovery.
3. Ask it to generate a policy intervention and validation plan.
4. Compare against the evaluator version.

### Required Inputs

- Withheld case.
- Evaluator version.
- Optional passenger-load data.

### Expected Result

A strong system should recover the hidden variable and propose a targeted, measurable intervention.

### Known Variability

Different networks have different payment systems, commuter flexibility, and crowding profiles.

## Validator

### Name Or Role

Transit planner, fare-policy analyst, or public transport operations researcher.

### Relationship To Case

Can judge whether generated policy is feasible and fairly targeted.

### Can Validate

- Transit operations fit.
- Equity and revenue tradeoffs.
- Behavior-change plausibility.
- Hidden-variable recovery.

### Validation Method

Rubric review or simulation.

## Open Questions

- What trip-shift size is needed?
- Which commuters have flexibility?
- How should hard cutoff incentives be smoothed?

## Notes

This case is public and may be answer-contaminated. Score frame recovery and policy reasoning.
