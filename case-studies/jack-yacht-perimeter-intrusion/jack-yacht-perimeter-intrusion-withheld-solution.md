# Case Study: Superyacht Waterline Intrusion Problem

## Summary

A superyacht protected by a dock watch, conventional CCTV, and crew on board was still breached: an intruder entered the water from shore, swam to the vessel, used the tender as a step, climbed aboard undetected, and reached the interior. The obvious responses — more guards, more deck cameras — scale cost without closing the gap. This version intentionally withholds the known solution so it can be used as a Doppl prompt or evaluation case.

The goal is to see whether a system can reason from the problem and constraints to the unguarded threat vector and a constraint-aware detection-and-response design, without being handed the answer.

## Source

### Type

Transcript and expert recollection.

### Origin

Derived from a conversation with a superyacht-industry domain expert who described a real management-company incident: a person from shore breached multiple security layers and reached the interior of a very large yacht. The expert framed it as a case where the deployed security "didn't work" because it was too primitive for the actual threat vector.

### Source File

`../jack-drone-privacy/Jack-syn-6-18.md`

### Derived By

Doppl capstone team.

### Fidelity

Summarized.

### Source Notes

The source transcript is conversational and covers several adjacent yacht scenarios. This withheld version extracts only the problem, context, constraints, and failed approaches needed for an agenome run. The known solution is intentionally omitted.

## Visibility

### Level

Internal.

### Anonymized

Yes.

### Public Summary Allowed

Yes, if framed as a hypothetical but realistic superyacht security case and stripped of personally identifying details.

### Sensitive Details

- Names or identifying details of owners, guests, vessels, management companies, or security staff.
- Exact locations, dates, or operating details that could identify a real incident.
- The evaluator-only known solution, which should not be included in the prompt context for generation runs.
- Specific defensive procedures that should not be presented as operational advice for a named vessel.

### Sharing Notes

This file is designed as the model-facing case prompt. It may be used in demos and evaluations, but should not include the known answer or any private identifying detail.

## Problem

### Statement

A high-value yacht was protected by human watch-standers and CCTV, yet an individual entered the water from shore, swam to the vessel, used the tender as a step, climbed aboard undetected, and reached the interior. The owner's question to the industry: build a system that detects this kind of incursion before it reaches the yacht.

### Background

Superyachts treat themselves as private, controlled environments, but their real attack surface is a 360-degree volume that includes the water around and beneath the hull. Conventional security focuses on the obvious boarding points and on human attention, which degrades at night. Normally a high, slippery hull is hard to climb — but when the tender is in the water it provides a step up, quietly removing the assumed physical barrier.

### Why It Matters

For ultra-high-net-worth owners, a stranger reaching the interior is both a personal-safety failure and a reputational catastrophe. The incident also reveals the broader pattern: many superyacht problems are not solved by buying the most dramatic technology, but by correctly identifying the unguarded vector and the real job to be done.

### Current State

Operators rely on CCTV trained on decks and boarding points, plus crew on watch and standard access control. These watch the wrong volume (above the waterline, at known entry points) and depend on fallible human attention.

### Impact

If unsolved:

- An intruder can reach the owner, guests, or interior spaces.
- The operator carries severe liability and reputational damage.
- Adding more of the same (guards, deck cameras) raises cost without closing the water-vector gap.

### Scope

This case focuses on detecting an unauthorized person approaching and boarding a yacht from the water. It does not attempt to solve cyber threats, insider threats, piracy at sea, or full military-grade perimeter defense.

## Purpose

### Goal

Use a real intrusion failure to test whether Doppl can identify the unguarded threat vector and a constraint-aware detection-and-response design, rather than recommending "hire more security."

### Questions

- Can a system recognize that the failure was a perimeter-definition problem (the water), not a staffing problem?
- Can it propose detection that distinguishes a human from marine life and from legitimate crew?
- Can it tie detection to a fast, preset human response instead of just raising an alarm?

### Success Criteria

A strong generated answer should:

- Extend the perimeter to include the water surface and water column.
- Automate classification (human vs. dolphin/turtle/debris; intruder vs. crew).
- Account for night and low-visibility conditions.
- Trigger early enough for the onboard team to intercept before boarding or interior breach.
- Avoid simply adding more guards or more of the same cameras.

### Audience

Doppl builders and evaluators who need a realistic, expert-grounded problem for testing idea generation.

## User

### Name Or Role

Yacht management company, captain, security lead, or owner responsible for protecting the vessel and the people aboard.

### Goals

- Detect an incursion before the intruder reaches the yacht or its interior.
- Avoid false alarms on crew or marine life.
- Trigger a fast, rehearsed protective response.
- Keep the owner's experience from feeling like an armed camp.

### Needs

- Coverage of the water vector, including underwater.
- Automated classification so humans are alerted only for real threats.
- Reliable detection at night and in poor visibility.
- Integration with an existing alert-and-lockdown protocol.

### Pain Points

- The real attack surface includes water the current system ignores.
- Human attention degrades over long night watches.
- The tender in the water removes the assumed "too high to climb" barrier.
- More guards and more deck cameras add cost without closing the gap.

## Environment

### Setting

A large yacht at anchor or dock near shore, where a person could enter the water from land or another vessel and approach unseen, often at night.

### Tools Or Systems

- Crew on watch and a bridge/security station.
- Conventional CCTV trained on decks and boarding points.
- Crew radios and an existing alert/lockdown protocol with a safe room.
- Potentially available: in-water sensing, radar, analytics-capable cameras, and small aerial platforms.

### Inputs

- An incident history showing a successful water-vector breach.
- Knowledge that existing CCTV and human watch failed.
- Operating context: near shore, night, tender in the water.

### External Factors

- IMO and maritime regulations, including limits on emissions and active radio/sonar systems in some areas.
- The cost and visible footprint of large sensor hardware.
- Owner expectation of discretion and comfort.

### Assumptions

- The threat can approach from the water, including underwater.
- Sensors can be tuned to distinguish humans from marine life and crew.
- A preset response exists that the crew can execute quickly.

## Constraints

### Must Distinguish Humans From Marine Life And Debris

A detection system that alarms on every dolphin, turtle, or piece of floating rubbish is operationally useless and will be ignored.

**Rationale:** False positives destroy trust in the system and cause crews to disable or ignore alerts, recreating the original failure.

### Must Not Alert On Legitimate Crew

Crew walk the decks and clean the hull, sometimes near the waterline. The system must treat them as legitimate and reserve alerts for genuine intruders.

**Rationale:** The system has to separate "person who belongs here" from "person who does not," or it produces constant noise.

### Must Work At Night And In Low Visibility

The realistic threat arrives at night, exactly when human watch attention is weakest and conventional CCTV is least effective.

**Rationale:** A daytime-only or good-visibility-only solution fails in the conditions the actual incident occurred in.

### Must Detect Early Enough To Act

Detection has to occur far enough out that the onboard security team can intercept before the intruder boards or reaches the interior.

**Rationale:** An alert that fires after boarding has already failed at the real job; timing is the whole point.

### Regulatory And Footprint Limits

Active systems, emissions, and large hardware are constrained by IMO rules and by the owner's desire not to live behind visible heavy security.

**Rationale:** Some active countermeasures are restricted near port; oversized or conspicuous hardware undermines the discretion owners pay for.

## Failed Attempts

### Human Watch Plus Deck CCTV

**Approach:** Rely on watch-standers and conventional CCTV trained on decks and boarding points.

**Outcome:** An intruder swam to the yacht and boarded undetected, reaching the interior.

**Why It Failed:** The perimeter was defined too narrowly — above the waterline, at known entry points — and depended on human attention that degrades at night.

**Lesson:** The breach came from the vector nobody was watching: the water.

### More Guards And More Of The Same Cameras

**Approach:** Scale up the existing approach with additional personnel and conventional cameras.

**Outcome:** Higher cost, no new coverage of the water vector.

**Why It Failed:** Adding capacity to the wrong volume does not close the actual gap.

**Lesson:** This is a perimeter-definition problem, not a staffing problem.

### Reliance On The "Too High To Climb" Assumption

**Approach:** Assume a high, slippery hull is effectively unclimbable.

**Outcome:** The tender in the water provided a step up, and the intruder climbed aboard.

**Why It Failed:** The assumed physical barrier disappears under normal operating conditions.

**Lesson:** Do not treat a situational barrier as a permanent one.

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

- what detection coverage, sensing, or workflow should be used
- who takes each action
- when the response happens
- how the approach distinguishes intruders from crew and marine life
- how the approach works at night and in low visibility
- how the approach avoids the failed attempts above
- how the approach handles each listed constraint

### Why This Solution

_To be generated._

Explain why this solution fits the problem and constraints better than the failed approaches.

### Tradeoffs

_To be generated._

List the risks, limitations, dependencies, or ways this solution could fail.

### Validation Plan

_To be generated._

Describe how an evaluator could test whether the proposed solution is plausible, constraint-aware, and operationally useful.

## Reproducible

### Is Reproducible

Yes, approximately.

### Reproducibility Level

Approximate.

### Steps

1. Provide this withheld-solution case study as the prompt context.
2. Ask the system to complete Problem Recovery.
3. Ask it to generate a solution, tradeoffs, and validation plan.
4. Compare generated answers against the full evaluator version.
5. Have a domain expert rate plausibility, simplicity, and operational fit.

### Required Inputs

- This withheld-solution case study.
- The full solution version for evaluator-only comparison.
- A scoring rubric for vector recovery, false-alarm handling, timing, legality, and non-obviousness.

### Expected Result

A strong system should converge on extending the perimeter into the water, automating classification, and triggering a fast preset response — rather than recommending more guards or more conventional cameras.

### Known Variability

Generated answers may differ in sensor mix and in how detection ties to response. These can still be directionally correct if they reframe the perimeter to include the water and automate the human-vs-everything-else decision.

## Validator

### Name Or Role

Superyacht-industry security domain expert.

### Relationship To Case

Supplied the original incident and can judge whether proposed answers are plausible in the yacht operating environment.

### Can Validate

- Domain plausibility.
- Operational fit for yacht crew and owner behavior.
- Whether a proposal closes the actual threat vector.
- Whether the answer is meaningfully better than generic "more security."

### Validation Method

Async feedback or live review.

### Notes

The validator should compare generated answers against the full evaluator-only case. This prompt-facing file should remain answer-free.

## Open Questions

- What detection range is required for different hull sizes and anchorages?
- What false-alarm rate is acceptable before crews start ignoring alerts?
- Which active systems (sonar, jammers, drones) are permissible in port versus international waters?
- How should the protocol differ at anchor, at dock, and underway?

## Notes

This case should be handled carefully because the superyacht domain is secretive and NDA-constrained. Frame it as a hypothetical but realistic security scenario inspired by expert conversation. The useful evaluation target is the structure of the solution, not any identifying detail.
