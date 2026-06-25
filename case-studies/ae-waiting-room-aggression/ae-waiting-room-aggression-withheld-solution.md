# Case Study: Emergency Department Waiting-Room Aggression

## Summary

Emergency-department staff face hostility and aggression from some patients and visitors during long waits. The department cannot simply eliminate all waiting, and triage cannot operate as a normal first-come-first-served queue. Obvious answers include more security, warning signs, more clinicians, or faster throughput, but each has limits. This version intentionally withholds the known intervention so it can be used as a Doppl prompt.

## Source

### Type

Public case study and research literature.

### Origin

Derived from public material about reducing violence and aggression in emergency-department waiting environments.

### Source File

`../sources.md` — Candidate Triage List A, item 11 ("The Emergency Room 'Wait-Time' Aggression Bottleneck").

### Derived By

Doppl capstone team.

### Fidelity

Summarized.

### Source Notes

The known intervention is intentionally omitted. Public source links should not be shown to the model during generation if previews reveal the answer.

## Visibility

### Level

Public.

### Anonymized

Yes.

### Public Summary Allowed

Yes.

### Sensitive Details

- Do not present generated outputs as medical advice.
- Do not imply the solution replaces clinical capacity, security, or workplace-violence prevention.
- The known intervention should be withheld during generation runs.

### Sharing Notes

Safe as a benchmark prompt with healthcare-review caveats.

## Problem

### Statement

Emergency-department patients and visitors sometimes become verbally hostile, threatening, or aggressive toward staff while waiting for care.

### Background

Emergency departments are emotionally intense and operationally complex. Patients may wait through several stages, and more urgent cases may be seen ahead of them. Staff are busy and cannot explain every delay in detail to every person.

### Why It Matters

Aggression harms staff wellbeing and patient safety. It also worsens the care environment for other patients and visitors.

### Current State

Hospitals may rely on security, zero-tolerance messages, staff de-escalation, and attempts to reduce wait time. Those measures may be useful but do not necessarily address the full causal chain.

### Impact

If the problem is handled only after people become aggressive, the department misses opportunities to reduce frustration earlier.

### Scope

This case focuses on preventable non-physical hostility and aggression linked to the waiting-room journey. It does not solve all violence, psychiatric emergencies, or emergency-department capacity.

## Purpose

### Goal

Test whether Doppl can identify the hidden variable behind waiting-room aggression and propose a realistic design or operations intervention.

### Questions

- What is the actual problem behind the visible aggression?
- Why might security and faster throughput be insufficient?
- What low-cost intervention could reduce frustration before escalation?
- How should the answer avoid overclaiming in a healthcare context?

### Success Criteria

A strong generated answer should:

- Identify an upstream behavioral or informational driver.
- Preserve clinical triage priority.
- Avoid punitive-only framing.
- Propose an intervention that can be implemented in a real waiting environment.
- Include validation and safety caveats.

### Audience

Doppl builders, healthcare operations reviewers, emergency-department leaders, service designers.

## User

### Name Or Role

Emergency-department operations leader or hospital design team.

### Goals

- Reduce hostility toward staff.
- Improve patient and visitor understanding.
- Preserve safety and clinical priority.
- Avoid requiring impossible capacity expansion.

### Needs

- A practical waiting-room intervention.
- Clear handling of tradeoffs.
- A validation plan.
- Sensitivity to healthcare stakes.

### Pain Points

- Patients do not always understand why they are waiting.
- Staff are blamed for delays.
- More security can make the atmosphere feel more adversarial.
- Exact wait-time promises can be unreliable.

## Environment

### Setting

Emergency department with arrival, triage, waiting, treatment, discharge, and admission pathways.

### Tools Or Systems

- Waiting-room layout.
- Staff communication.
- Triage workflow.
- Incident reporting.
- Patient-experience measurement.
- Existing information systems.

### Inputs

- Patient journey stages.
- Common patient questions.
- Department load.
- Incident and complaint data.
- Staff feedback.

### External Factors

- Clinical crowding.
- Patient pain, fear, intoxication, or distress.
- Staff fatigue.
- Legal and safety requirements.

### Assumptions

- Some aggression is driven by preventable frustration.
- The department can communicate general process information without exposing private clinical data.
- The solution must not interfere with clinical triage.

## Constraints

### Cannot Eliminate Waiting

The department cannot simply staff or build its way to zero waiting.

### Triage Must Remain Clinically Driven

Patients cannot be seen strictly in arrival order.

### Staff Time Is Scarce

The solution cannot depend on staff giving lengthy repeated explanations to every patient.

### Information Must Be Accurate Enough

Any information provided must avoid false precision or broken promises.

### Safety Still Matters

The solution cannot replace appropriate security, de-escalation, or clinical escalation for high-risk situations.

## Failed Attempts

### More Security

**Approach:** Add guards, cameras, or stricter visible enforcement.

**Outcome:** May deter some behavior but can increase the adversarial feeling of the space.

**Why It Failed:** It acts late and may not reduce upstream frustration.

**Lesson:** Containment is not prevention.

### Punitive Warning Signs

**Approach:** Post zero-tolerance messages and rules against abuse.

**Outcome:** Sets boundaries but may not answer why people are waiting.

**Why It Failed:** It frames the patient as a potential offender without reducing confusion.

**Lesson:** A warning is not the same as a service explanation.

### Faster Throughput Alone

**Approach:** Try to reduce waiting through capacity or workflow improvements.

**Outcome:** Useful but constrained.

**Why It Failed:** Some waiting is unavoidable, and the felt experience may still be poor.

**Lesson:** The waiting environment itself is part of the system.

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

- what design, communication, or operations intervention should be used
- who maintains it
- how it preserves clinical triage
- how it avoids overpromising
- how it handles staff burden and safety
- how it would be evaluated

## Reproducible

### Is Reproducible

Yes, approximately.

### Reproducibility Level

Approximate.

### Steps

1. Provide this withheld case study as prompt context.
2. Ask the system to complete Problem Recovery.
3. Ask it to generate a solution, risks, and validation plan.
4. Compare generated answers against the evaluator version.
5. Have a healthcare operations reviewer score safety and plausibility.

### Required Inputs

- Withheld case.
- Evaluator version.
- Scoring rubric.

### Expected Result

A strong system should recover the hidden variable and propose a practical waiting-environment intervention.

### Known Variability

Local emergency departments differ in workflow, layout, and patient population.

## Validator

### Name Or Role

Emergency-department operations leader, healthcare service designer, or workplace-violence prevention reviewer.

### Relationship To Case

Can judge operational realism and safety caveats.

### Can Validate

- Clinical workflow fit.
- Staff burden.
- Patient communication risk.
- Aggression-reduction plausibility.
- Hidden-variable recovery.

### Validation Method

Rubric review or pilot.

## Open Questions

- Which local incident categories are in scope?
- What information can safely be shown in the waiting room?
- How should wait-time uncertainty be communicated?

## Notes

This case should be scored conservatively because healthcare safety and legal duties matter.
