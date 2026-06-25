# Case Study: Airport Liquid Rule Congestion

## Summary

Airport security queues slow down when ordinary passengers accidentally bring oversized liquid containers into the screening lane. Most cases are not malicious. Passengers may forget, misunderstand the rule, or discover the issue only when staff inspect their bags. This version intentionally withholds the known candidate-solution direction so it can be used as a Doppl prompt.

## Source

### Type

Podcast transcript and candidate note.

### Origin

Derived from a public Rory Sutherland discussion of airport-security liquid backlogs and a candidate summary supplied to the Doppl team.

### Source File

`../sources.md` — Candidate Triage List A, item 4 ("The Airport Security Fluid Smuggling Bottleneck").

### Derived By

Doppl capstone team.

### Fidelity

Summarized with caveat.

### Source Notes

The known candidate-solution direction is intentionally omitted. Source links should not be shown during generation if previews reveal the answer.

## Visibility

### Level

Public.

### Anonymized

No private individual details are included.

### Public Summary Allowed

Yes, with caveat.

### Sensitive Details

- Do not present generated outputs as airport-security policy.
- Do not reveal the known candidate-solution direction in prompt context.
- Avoid operational details that could weaken security.

### Sharing Notes

Use as a behavioral-operations benchmark, not as direct airport-security advice.

## Problem

### Statement

Airport security lanes are slowed by accidental liquid-rule violations.

### Background

Passengers may carry containers that violate the liquid rules without intending harm. A common misunderstanding is that the remaining amount of liquid matters more than the container size. The mistake is often found only once the passenger has reached the screening lane.

### Why It Matters

Security lanes are scarce and throughput matters. Every preventable stop creates delay, passenger frustration, and staff friction.

### Current State

Airports may post signs, rely on staff reminders, confiscate items at screening, or add more lane capacity.

### Impact

If accidental violations keep entering the screening lane, the airport pays the operational cost at the most expensive point in the process.

### Scope

This case focuses on accidental passenger noncompliance with liquid-container rules. It does not cover malicious threats or changes to aviation law.

## Purpose

### Goal

Test whether Doppl can identify the hidden variable behind the security backlog and generate a practical intervention.

### Questions

- What is the actual problem behind the visible queue?
- Why might more lanes or more signs be insufficient?
- Where in the passenger journey should the intervention happen?
- How can the intervention preserve security and avoid overcomplication?

### Success Criteria

A strong generated answer should:

- Identify the hidden variable.
- Act before the bottleneck.
- Avoid relying only on long written signs.
- Respect security rules.
- Include a measurable validation plan.

### Audience

Doppl builders, airport operations designers, behavioral scientists.

## User

### Name Or Role

Airport operations or security-process improvement team.

### Goals

- Reduce avoidable lane delays.
- Keep security rules intact.
- Reduce staff-passenger friction.
- Avoid unnecessary infrastructure expansion.

### Needs

- A practical pre-screening intervention.
- Simple passenger behavior change.
- Security-safe messaging.
- Throughput measurement.

### Pain Points

- Passengers are stressed and distracted.
- Rules can be misunderstood.
- Staff discover preventable mistakes too late.
- More infrastructure is costly.

## Environment

### Setting

Airport check-in, queuing, and security-screening flow.

### Tools Or Systems

- Check-in and bag-prep areas.
- Security queue.
- Screening lanes.
- Passenger signage.
- Staff scripts.
- Waste or surrender points.
- Throughput data.

### Inputs

- Common liquid-rule violations.
- Queue times.
- Lane stop reasons.
- Passenger flow and dwell points.
- Airport layout.

### External Factors

- Travel stress.
- Language differences.
- Family/group travel.
- Rule changes across airports.
- Time pressure.

### Assumptions

- Most violations are accidental.
- Some passengers can self-correct if cued at the right time.
- The intervention must be fast and low-space.

## Constraints

### Cannot Change Aviation Rules

The solution must work inside existing liquid-container policy.

### Must Preserve Security

The solution cannot reduce inspection quality or reveal evasion tactics.

### Must Act Before Screening

Fixing the issue at the scanner still slows the lane.

### Signs Alone Are Weak

Written warnings are easy to miss or misunderstand.

### Space Is Limited

Airport queues and check-in zones have little spare room.

## Failed Attempts

### More Screening Lanes

**Approach:** Add staff or equipment.

**Outcome:** Increases capacity but is expensive and space-constrained.

**Why It Failed:** It does not reduce avoidable mistakes entering the bottleneck.

**Lesson:** Capacity is not the only lever.

### More Signs

**Approach:** Add written warnings before security.

**Outcome:** Some passengers comply, but many still miss the rule.

**Why It Failed:** Stress and sign clutter reduce attention.

**Lesson:** The cue has to be behaviorally stronger than another notice.

### Confiscate At Screening

**Approach:** Enforce the rule once the bag reaches staff.

**Outcome:** Correct but slow.

**Why It Failed:** The lane is already blocked.

**Lesson:** Late enforcement still creates congestion.

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

- where in the passenger journey the intervention happens
- what cue or process changes behavior
- how it avoids slowing the security lane
- how it preserves security
- how it would be measured

## Reproducible

### Is Reproducible

Yes, approximately.

### Reproducibility Level

Approximate.

### Steps

1. Provide this withheld case study.
2. Ask the system to complete Problem Recovery.
3. Ask it to generate a solution and validation plan.
4. Compare against the evaluator target.
5. Have airport operations or security-process reviewers score feasibility.

### Required Inputs

- Withheld case.
- Evaluator version.
- Optional stop-reason and throughput data.

### Expected Result

A strong system should recover the hidden variable and propose a practical intervention that reduces preventable screening delays.

### Known Variability

Airport layouts and security rules vary.

## Validator

### Name Or Role

Airport operations expert, security-process designer, or behavioral scientist.

### Relationship To Case

Can judge whether the generated intervention is security-safe and operationally plausible.

### Can Validate

- Security compatibility.
- Passenger behavior.
- Throughput plausibility.
- Hidden-variable recovery.

### Validation Method

Rubric review or pilot.

## Open Questions

- What exact candidate solution source should be added?
- Which airport layout is assumed?
- How should passenger groups and language differences be handled?

## Notes

This public case has a stronger problem source than solution source. Use it primarily to score frame recovery.
