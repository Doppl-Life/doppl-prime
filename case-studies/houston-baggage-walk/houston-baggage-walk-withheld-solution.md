# Case Study: Houston Baggage Claim Complaint Problem

## Summary

An airport receives persistent passenger complaints about checked-bag waits. The baggage system takes roughly eight minutes to deliver bags, while passengers can reach the claim area much sooner. Traditional operational fixes focus on making the baggage process faster, but those fixes are expensive and have diminishing returns. This version intentionally withholds the known intervention so it can be used as a Doppl prompt.

## Source

### Type

Article summary and candidate note.

### Origin

Derived from a public behavioral-operations case about baggage-claim complaints at a Houston airport.

### Source File

`../sources.md` — Candidate Triage List B ("The Houston Baggage Walk Reframe").

### Derived By

Doppl capstone team.

### Fidelity

Summarized.

### Source Notes

The known intervention is intentionally omitted. Public source references should be hidden from model-facing runs if link text or summaries would reveal the answer.

## Visibility

### Level

Public.

### Anonymized

No private individual details are included.

### Public Summary Allowed

Yes.

### Sensitive Details

- The known intervention should be withheld during generation runs.
- Source links should not be included in prompt context if they expose the answer.

### Sharing Notes

Safe to use as a public benchmark prompt.

## Problem

### Statement

Passengers complain that baggage claim takes too long after arrival.

### Background

The airport has a normal passenger path from arrival gates to baggage claim. Passengers often reach the carousel before their bags do. The baggage system itself has practical speed limits, and additional mechanical or labor improvements may be costly.

### Why It Matters

Baggage claim shapes the final impression of the airport. Complaints create reputational and operational pressure even when the underlying baggage process is not unusually slow.

### Current State

The organization frames the issue as a baggage-speed problem. Obvious fixes include more handlers, faster equipment, better conveyor operations, or more apology/status messaging.

### Impact

If the airport spends only on faster bag delivery, it may pay heavily for small gains while leaving the passenger pain mostly unchanged.

### Scope

This case focuses on ordinary checked-bag wait complaints, not lost luggage, airline baggage liability, or airport-wide construction.

## Purpose

### Goal

Test whether Doppl can identify the hidden variable behind the complaint and generate a low-cost operational intervention.

### Questions

- What is the actual problem to solve?
- Which hidden variable explains why faster baggage handling may not be enough?
- What intervention can improve passenger experience without major infrastructure expansion?
- How should the proposal be validated?

### Success Criteria

A strong generated answer should:

- Identify the real driver of dissatisfaction.
- Avoid treating the problem as only a conveyor-speed issue.
- Respect accessibility and safe passenger-flow constraints.
- Propose a practical intervention using existing terminal operations.
- Include a validation plan.

### Audience

Doppl builders, evaluators, operations designers, airport experience teams.

## User

### Name Or Role

Airport operations leader responsible for arrival experience and complaint volume.

### Goals

- Reduce complaints.
- Avoid major capital spend.
- Keep passenger flow safe and legible.
- Improve the felt arrival experience.

### Needs

- A low-cost intervention.
- A way to address passenger frustration.
- A validation plan that can be tested with timing and complaint data.

### Pain Points

- Mechanical improvements are costly.
- Passengers may complain even when the baggage system is functioning normally.
- Idle time near the end of a trip feels especially irritating.

## Environment

### Setting

Airport arrival terminal with gates, passenger corridors, baggage handling, and baggage-claim carousels.

### Tools Or Systems

- Gate assignment.
- Passenger wayfinding.
- Baggage carousels.
- Baggage handling system.
- Complaint tracking.

### Inputs

- Passenger walking times.
- Bag delivery times.
- Terminal layout.
- Complaint data.

### External Factors

- Passenger fatigue.
- Mobility and accessibility requirements.
- Terminal crowding.
- Airline coordination.

### Assumptions

- The baggage process cannot be dramatically accelerated without major cost.
- Passenger flow can be modified within operational limits.
- The airport can measure complaints and timing before and after a pilot.

## Constraints

### No Major Infrastructure Expansion

The airport needs a change that does not require building a new terminal, conveyor network, or baggage system.

### Limited Mechanical Speed Gains

The baggage system has practical limits, so additional speed improvements may have poor leverage.

### Safe Passenger Flow

The solution must preserve safe circulation, clear wayfinding, and accessibility options.

### Honest Experience

The solution should not create a passenger experience that feels deceptive, confusing, or punitive.

## Failed Attempts

### Add Baggage Labor

**Approach:** Hire or assign more handlers to reduce bag delivery time.

**Outcome:** May reduce some delay but can be costly and may not eliminate dissatisfaction.

**Why It Failed:** It attacks the visible process metric without necessarily changing the felt wait.

**Lesson:** Speed is not always the only or best lever.

### Upgrade Conveyor Operations

**Approach:** Improve automation, conveyors, or mechanical baggage handling.

**Outcome:** Expensive and slow to implement.

**Why It Failed:** Marginal speed gains may not justify the cost.

**Lesson:** Physical acceleration can be the wrong abstraction.

### Status Messaging

**Approach:** Tell passengers bags are on the way or apologize for delay.

**Outcome:** Provides information but may not change the underlying frustration.

**Why It Failed:** The passenger still experiences the same waiting situation.

**Lesson:** Information is useful only if it addresses the real source of pain.

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

This section is intentionally blank for the Doppl run. The agenome should generate a proposed solution after completing Problem Recovery.

### Summary

_To be generated._

### Details

_To be generated._

The proposed solution should explain:

- what operational change should be used
- who makes or manages the change
- how it avoids major infrastructure spend
- how it handles accessibility and passenger-flow constraints
- how the airport would validate whether it worked

## Reproducible

### Is Reproducible

Yes, approximately.

### Reproducibility Level

Approximate.

### Steps

1. Provide this withheld case study as prompt context.
2. Ask the system to complete Problem Recovery before proposing a solution.
3. Ask for the solution, tradeoffs, and validation plan.
4. Compare generated answers against the evaluator version.

### Required Inputs

- This withheld case.
- Evaluator version with the known intervention.
- Optional timing and complaint data.

### Expected Result

A strong system should recover the hidden variable and propose a practical terminal-operations intervention without relying on major infrastructure.

### Known Variability

Implementation details vary by terminal layout.

## Validator

### Name Or Role

Airport operations or passenger-experience expert.

### Relationship To Case

Can judge operational feasibility and whether the hidden variable was correctly identified.

### Can Validate

- Operational plausibility.
- Safety and accessibility.
- Whether the answer avoids overbuilding.
- Whether the hidden variable is correct.

### Validation Method

Rubric review or operational pilot.

## Open Questions

- What terminal constraints exist in the specific airport?
- What complaint metric should be used?
- What accessibility safeguards are required?

## Notes

This is a public case, so answer contamination is possible. Score frame recovery and reasoning quality, not just exact answer matching.
