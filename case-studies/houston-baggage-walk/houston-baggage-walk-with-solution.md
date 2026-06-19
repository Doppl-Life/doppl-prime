# Case Study: Houston Baggage Walk Reframe

## Summary

An airport faced heavy passenger complaints about checked-bag waits. The baggage system was not wildly slow in objective terms, but passengers reached the carousel quickly and then spent most of the experience standing passively. The useful solution was not to speed up the bags further, but to change the pacing of the passenger journey so passengers spent more time moving and less time waiting idly at baggage claim. This is a strong public Doppl case because the winning move depends on finding the hidden variable before generating the fix.

## Source

### Type

Article summary and candidate note.

### Origin

This case was derived from a candidate summary supplied to the Doppl team and Stephen Shapiro's public writeup of the Houston airport baggage-claim story.

### Source File

`/Users/michaelhabermas/.codex/attachments/39fcf3bf-eaa5-4c44-920e-71640763f2a4/pasted-text.txt`

### Derived By

Doppl capstone team.

### Fidelity

Summarized.

### Source Notes

Stephen Shapiro's writeup says baggage took about eight minutes, passengers reached claim in about one minute, conventional wisdom pushed faster baggage handling, and the airport instead increased passenger walking time so idle waiting nearly disappeared. The writeup cites a New York Times article. This draft should be treated as a public behavioral-operations case, not as an independently audited airport performance dataset.

References:

- Stephen Shapiro, "The Walk More, Wait Less Innovation": https://stephenshapiro.com/walk-wait-innovation/

## Visibility

### Level

Public.

### Anonymized

No private individual details are included.

### Public Summary Allowed

Yes.

### Sensitive Details

None known.

### Sharing Notes

Do not overclaim measured performance beyond the source summary. Frame this as a well-known behavioral-operations case.

## Problem

### Statement

Passengers complain that they wait too long for checked bags after arrival.

### Background

The mechanical baggage process takes roughly eight minutes from plane to claim. Passengers can reach the baggage carousel much faster, leaving several minutes of idle standing. The airport had already tried the intuitive path of improving baggage speed, but the complaint pattern persisted.

### Why It Matters

Baggage claim is one of the last memories of a trip. A few minutes of idle frustration can dominate the perceived quality of the whole arrival experience and generate complaints even when the mechanical process is reasonably efficient.

### Current State

Passengers deplane, reach claim quickly, and wait passively. The visible metric is elapsed time until bags arrive, so the organization naturally thinks in terms of speeding up bag delivery.

### Impact

If the problem is solved only as a mechanical-speed problem, the airport may spend heavily on marginal operational gains while leaving the psychological pain largely intact.

### Scope

This case focuses on passenger experience at baggage claim. It does not cover lost bags, airline staffing contracts, baggage security, or airport-wide terminal design.

## Purpose

### Goal

Use a public airport-operations case to test whether Doppl can identify the hidden variable behind a complaint before producing an intervention.

### Questions

- Can the system distinguish objective wait time from perceived wait pain?
- Can it notice that passive waiting hurts more than active movement?
- Can it propose an operational change rather than a capital-intensive baggage-system upgrade?
- Can it explain why the intervention works under physical constraints?

### Success Criteria

A strong generated answer should:

- Identify idle/passive waiting as the hidden variable.
- Recognize that the passenger and bag journeys can be paced against each other.
- Avoid defaulting to more baggage handlers, conveyors, or apology signage as the primary solution.
- Propose a low-capex operational routing or experience-design change.
- Explain tradeoffs, including accessibility and passenger fatigue.

### Audience

Doppl builders, evaluators, operations designers, airport experience teams.

## User

### Name Or Role

Airport operations leader responsible for arrival experience and complaint volume.

### Goals

- Reduce complaints.
- Avoid major infrastructure spend.
- Preserve safe passenger flow.
- Improve the felt arrival experience.

### Needs

- A change that can be implemented with existing terminal assets.
- A way to reduce idle frustration.
- A solution that does not create new bottlenecks or accessibility problems.

### Pain Points

- Baggage-system speed improvements have diminishing returns.
- Passengers judge the experience emotionally, not only by stopwatch.
- Idle passengers have nothing to do except watch for failure.

## Environment

### Setting

Airport arrival terminal with gates, passenger corridors, baggage handling, and baggage-claim carousels.

### Tools Or Systems

- Gate assignment.
- Passenger wayfinding.
- Baggage carousels.
- Baggage handling system.
- Complaint and customer-experience tracking.

### Inputs

- Approximate bag arrival time.
- Passenger walking time from gate to claim.
- Available terminal routes and carousel assignments.
- Complaint data.

### External Factors

- Passenger fatigue after travel.
- Mobility and accessibility requirements.
- Terminal crowding.
- Airline and airport operational coordination.

### Assumptions

- Baggage arrival time cannot be reduced much further without major spend.
- Passenger routes can be adjusted within the terminal.
- Walking is usually less aversive than idle standing, within reasonable limits.

## Constraints

### Limited Mechanical Upside

The baggage system already operates close enough to its practical limit that further speed gains are expensive or marginal.

**Rationale:** If the physical system is not the main source of pain, spending on it has poor leverage.

### No Major Infrastructure Expansion

The airport cannot quickly build a new baggage system, terminal wing, or conveyor network.

**Rationale:** The intervention needs to be operationally cheap and fast enough to matter.

### Passenger Flow Must Stay Safe

Any routing change must avoid crowding, confusion, or excessive walking for passengers with mobility constraints.

**Rationale:** Reducing complaints at baggage claim is not worth creating safety or accessibility failures.

### The Experience Must Still Feel Honest

The airport should not create a visibly absurd detour that passengers perceive as manipulation.

**Rationale:** If passengers feel tricked, the intervention can create a new complaint category.

## Failed Attempts

### Hire More Baggage Handlers

**Approach:** Add labor to speed bag delivery.

**Outcome:** May reduce some delay, but does not necessarily remove the idle-wait experience.

**Why It Failed:** Once mechanical timing hits diminishing returns, each extra minute saved is expensive and may still leave passengers standing around.

**Lesson:** The most visible process metric may not be the most painful user moment.

### Conveyor Or Automation Upgrade

**Approach:** Invest in faster baggage equipment.

**Outcome:** Could improve throughput, but requires capital, downtime, and operational complexity.

**Why It Failed:** It treats the complaint as a pure speed problem rather than a pacing and perception problem.

**Lesson:** Physical acceleration is not always the cheapest way to improve experience.

### Better Apology Or Status Messaging

**Approach:** Tell passengers bags are coming soon or apologize for delays.

**Outcome:** May reduce uncertainty but leaves the passive wait intact.

**Why It Failed:** Information alone does not make idle time feel productive.

**Lesson:** Some waiting problems need experience redesign, not just communication.

## Evaluation Focus

### Hidden Variable

The complaint is driven less by total elapsed time than by the amount of passive, idle waiting after passengers reach the carousel.

### Frame Recovery Target

A strong system should reframe the problem from "make bags faster" to "synchronize passenger arrival and bag arrival while converting idle wait into acceptable movement."

### Generated Idea Target

The system should propose changing gate/carousel assignment or wayfinding so passengers spend more of the unavoidable time walking through the terminal and arrive at baggage claim closer to when bags appear.

### Scoring Notes

- High score: identifies passive wait as the hidden variable before proposing the solution.
- High score: uses existing terminal routing rather than major baggage infrastructure.
- Medium score: proposes better wait-time displays but misses the movement/pacing intervention.
- Low score: only recommends more handlers, faster belts, or apology messaging.

## Solution

### Summary

Move the passenger path farther from arrival gate to baggage claim, or assign bags to a more distant carousel, so passengers spend the unavoidable time walking instead of standing passively. The bags do not arrive much faster; passengers arrive later, closer to the bags.

### Details

The operational sequence is:

1. Identify flights where passengers reach baggage claim much faster than bags.
2. Assign those flights to carousels farther from the arrival path, or route passengers through a longer but reasonable terminal path.
3. Preserve clear signage so the longer route feels normal and purposeful.
4. Keep accessibility routes available for passengers who cannot take the longer path.
5. Monitor complaints, walking times, and carousel crowding.

### Why This Solution

The solution works because it changes the passenger's experience of time. Standing at a carousel makes the delay salient and unproductive. Walking through the terminal feels like progress. If bags and passengers reach the claim area at roughly the same time, the stopwatch may be similar but the felt wait is lower.

### Tradeoffs

- Some passengers may dislike extra walking.
- Accessibility routes must be protected.
- Poor signage could create confusion.
- The intervention can feel manipulative if the route is obviously gratuitous.
- It does not help when bags are genuinely late beyond the normal process window.

### Expected Outcome

Passengers spend less time standing idle at baggage claim. Complaint volume falls even if mechanical bag-delivery speed changes little.

### Next Steps

- Measure passenger walking time from major arrival gates to claim.
- Compare passenger arrival time with bag arrival time by route.
- Pilot farther carousel assignment for selected flights.
- Track complaints and mobility/accessibility issues before broader rollout.

## Reproducible

### Is Reproducible

Yes, approximately.

### Reproducibility Level

Approximate.

### Steps

1. Provide the withheld problem statement.
2. Ask the system to identify the hidden variable before generating solutions.
3. Ask for one operational intervention and one validation plan.
4. Score whether the answer changes pacing rather than only speeding baggage.
5. Compare against complaint and flow data if an airport dataset is available.

### Required Inputs

- Baggage arrival timing.
- Passenger walking time.
- Terminal routing options.
- Complaint history.

### Expected Result

A strong system should recover that idle waiting is the painful variable and propose routing or carousel assignment to synchronize passenger and bag arrival.

### Known Variability

Different terminals have different routing flexibility. The same principle may be implemented through gate assignment, carousel assignment, moving walkways, retail routing, or staged information.

## Validator

### Name Or Role

Airport operations or passenger-experience expert.

### Relationship To Case

Can judge whether a routing intervention is operationally plausible and whether accessibility/crowding tradeoffs are handled.

### Can Validate

- Operational feasibility.
- Passenger-flow safety.
- Complaint-reduction plausibility.
- Accessibility risks.
- Whether the hidden-variable recovery is correct.

### Validation Method

Rubric review or operational pilot.

### Notes

The public source supports the broad intervention pattern, but local airport experts should validate any concrete routing proposal.

## Open Questions

- Which Houston airport and terminal configuration did the original story involve?
- Were complaints measured before and after, or described anecdotally?
- What accessibility accommodations were used?
- How far can walking time increase before the intervention backfires?

## Notes

This is a strong public warmup case. It is less private than `jack-drone-privacy`, but it cleanly tests frame recovery.
