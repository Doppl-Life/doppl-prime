# Case Study: London Underground Map Distortion

## Summary

London Underground crowding and route choice are not driven only by physical network capacity. Research on transit maps and London commuter behavior suggests that schematic maps, route familiarity, and imperfect experimentation affect which routes people choose. The useful intervention pattern is to treat maps, wayfinding, and journey-planning cues as demand-shaping infrastructure. This is a strong Doppl case when scored as frame recovery: can the system realize that the representation of the network can be part of the network's operating behavior?

## Source

### Type

Research papers and candidate note.

### Origin

Derived from public research on London Underground map effects and commuter experimentation, plus the candidate summary supplied to the Doppl team.

### Source File

`../sources.md` — Candidate Triage List A, item 7 ("The London Underground Map Distortions").

### Derived By

Doppl capstone team.

### Fidelity

Summarized.

### Source Notes

Zhan Guo's "Mind the Map!" argues that the schematic London Underground map affects path choices and that the map effect can outweigh actual travel-time experience. Larcom, Rauch, and Willems show that a 2014 London Underground strike forced some commuters to experiment with alternative routes, and some changes persisted afterward, suggesting that commuters can be stuck in suboptimal habitual routes. This case does not claim a single verified TfL deployment of a deliberately distorted map to relieve crowding; it uses the research as a known solution pattern.

References:

- Zhan Guo, "Mind the Map! The Impact of Transit Maps on Path Choice in Public Transit": https://wagner.nyu.edu/files/faculty/publications/Mind_the_Map_Guo_Zhan_2010.pdf
- Larcom, Rauch, and Willems, "The Benefits of Forced Experimentation": https://ora.ox.ac.uk/objects/uuid:271f6f8e-2915-445f-8ebd-5a2900970af1

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

Do not overstate this as a single implemented map hack unless a deployment source is added. Present it as a research-supported intervention pattern.

## Problem

### Statement

Some Underground routes and interchange points become overcrowded while viable alternatives remain underused.

### Background

Transit authorities often think about crowding through physical capacity: trains, tracks, stations, escalators, and platform management. But passengers choose routes through an information layer. The Tube map is schematic, not geographic. It intentionally distorts distance and connection geometry for legibility. That design can also distort perceived route cost.

### Why It Matters

If passenger route choice is partly shaped by representation, then capacity problems can sometimes be improved by changing the information environment rather than only changing the physical network.

### Current State

Passengers rely on the familiar Tube map, journey planners, station signage, and habitual routes. Many do not continually experiment with alternatives, even when alternatives might be faster or less crowded.

### Impact

If the map and wayfinding layer pushes demand toward already crowded routes, infrastructure becomes less efficient and passengers experience avoidable crowding.

### Scope

This case focuses on route choice, representation, and crowding in a metro network. It does not solve all rail capacity, signaling, staffing, or timetable problems.

## Purpose

### Goal

Test whether Doppl can identify representation and habit as hidden variables in a transit crowding problem.

### Questions

- Can the system notice that maps and journey planners shape behavior?
- Can it avoid defaulting only to physical-capacity expansion?
- Can it propose ethical information-design changes that improve load distribution?
- Can it distinguish nudging from deceptive manipulation?

### Success Criteria

A strong generated answer should:

- Identify the information layer as part of the operating system.
- Propose map, signage, route-planner, or experimentation interventions.
- Include safeguards against misleading passengers.
- Consider crowding, travel time, and accessibility.
- Define a measurable pilot.

### Audience

Doppl builders, transit planners, wayfinding designers, operations researchers.

## User

### Name Or Role

Transit operations and passenger-information team.

### Goals

- Reduce crowding on overloaded routes.
- Improve use of underused alternatives.
- Avoid major capital works where information design can help.
- Maintain passenger trust.

### Needs

- A way to identify suboptimal or overloaded route choices.
- A passenger-facing representation that makes alternatives legible.
- A measurement plan.
- Ethical constraints on map manipulation.

### Pain Points

- Old infrastructure has limited expansion room.
- Passengers are habitual.
- Schematic maps can mislead unintentionally.
- People may distrust information if it looks manipulative.

## Environment

### Setting

Urban metro network with schematic maps, route planners, station signage, smart-card trip data, and congested line segments.

### Tools Or Systems

- Schematic network map.
- Digital journey planner.
- Station wayfinding.
- Service alerts.
- Passenger-flow and tap data.
- Crowding forecasts.

### Inputs

- Origin-destination pairs.
- Current route shares.
- Travel times.
- Crowding by segment.
- Map geometry and transfer coding.
- Alternative route availability.

### External Factors

- Passenger familiarity.
- Tourist vs commuter differences.
- Accessibility and step-free constraints.
- Service disruption.
- Trust in official information.

### Assumptions

- Some route choice is shaped by map representation and habit.
- Some riders can switch routes without materially worse travel.
- The authority can alter map or guidance cues in pilots.

## Constraints

### Cannot Easily Add Physical Capacity

Major rail infrastructure is expensive, slow, and constrained.

**Rationale:** The intervention should work through the passenger-information layer.

### Must Preserve Truthfulness

Maps and route planners cannot intentionally mislead passengers about major costs or accessibility.

**Rationale:** Passenger trust is a core asset.

### Alternatives Must Be Real

The system should not push passengers to routes that are slower, inaccessible, unreliable, or unsafe.

**Rationale:** A nudge that worsens journeys will fail or create backlash.

### Behavior Is Habitual

Commuters may ignore alternatives unless prompted clearly or forced by disruption.

**Rationale:** Information alone must overcome routine.

### Network Effects Matter

Moving passengers can create new crowding elsewhere.

**Rationale:** Load-shifting must be measured across the system, not just at the original bottleneck.

## Failed Attempts

### Build More Capacity

**Approach:** Add trains, platforms, or infrastructure at crowded points.

**Outcome:** Expensive and slow.

**Why It Failed:** It ignores that some crowding may be driven by avoidable route concentration.

**Lesson:** Physical load depends partly on passenger choices.

### Publish The Same Map More Widely

**Approach:** Improve access to the existing map and standard directions.

**Outcome:** Helps navigation but may reinforce existing route perceptions.

**Why It Failed:** If the representation is part of the distortion, more exposure to it does not fix the distortion.

**Lesson:** Information architecture can create demand patterns.

### Generic "Avoid Crowding" Appeals

**Approach:** Ask passengers to use less crowded routes.

**Outcome:** Weak adoption without specific alternatives.

**Why It Failed:** Passengers need credible, easy substitutes, not general instructions.

**Lesson:** The nudge must be route-specific and visible at the decision point.

## Evaluation Focus

### Hidden Variable

Passenger route choice is shaped by schematic representation, perceived transfer cost, and habit, not only by true physical geography or travel time.

### Frame Recovery Target

A strong system should reframe the map, journey planner, and signage layer as part of the transit system's control surface.

### Generated Idea Target

The system should propose map recoding, route-planner prompts, station wayfinding, alternate-route trials, or forced/encouraged experimentation that makes underused but viable routes more salient.

### Scoring Notes

- High score: identifies representation and habit as hidden variables.
- High score: proposes ethical and measurable information-design interventions.
- Medium score: proposes generic live crowding displays.
- Low score: recommends only more trains, larger stations, or crowd marshals.

## Solution

### Summary

Use the passenger-information layer as demand-shaping infrastructure. Adjust map geometry, interchange coding, journey-planner recommendations, station signage, or route prompts so viable alternative routes become more legible and attractive, then measure whether passenger flow shifts away from bottlenecks.

### Details

The solution pattern is:

1. Use trip data to identify congested route choices with viable alternatives.
2. Analyze whether the schematic map or route planner makes the congested route look simpler, shorter, or more direct than it is.
3. Modify representation in a controlled pilot: map insets, route-planner suggestions, station posters, signage, or transfer coding.
4. Make alternatives specific: "For X destination, Y route may be less crowded at this time."
5. Avoid misleading passengers; include travel-time, step-free, and service caveats.
6. Measure route shares, crowding, journey times, complaints, and trust.
7. Keep only changes that improve system load without harming passenger welfare.

### Why This Solution

The research suggests that passengers can be influenced by the map and by habitual under-experimentation. If the information layer can create inefficient concentration, it can also be redesigned to reveal better options.

### Tradeoffs

- Map clarity can suffer if it optimizes for demand management.
- Manipulative or misleading nudges can erode trust.
- Some alternatives may help crowding but hurt individual travel time.
- Tourists and commuters respond differently.
- Network effects can move crowding elsewhere.

### Expected Outcome

Some passengers shift to underused alternatives. Crowding decreases on targeted bottlenecks without physical expansion. The authority gains a repeatable method for testing representation-driven demand shifts.

### Next Steps

- Identify one OD pair or interchange bottleneck.
- Build a before/after map or route-planner treatment.
- Run an A/B test where possible.
- Monitor route choice and crowding.
- Review passenger trust and accessibility impact.

## Reproducible

### Is Reproducible

Yes, approximately.

### Reproducibility Level

Approximate.

### Steps

1. Provide the withheld case.
2. Ask the system to identify the hidden variable.
3. Ask it to generate an intervention and validation plan.
4. Compare against the evaluator target.
5. Have a transit-wayfinding reviewer score ethics and feasibility.

### Required Inputs

- Withheld case.
- Evaluator version.
- Optional OD and crowding data.
- Map and route-planner artifacts.

### Expected Result

A strong system should propose information-design demand shaping, not only physical capacity expansion.

### Known Variability

Different metro systems rely on maps and journey planners differently. The exact intervention depends on route alternatives and passenger trust.

## Validator

### Name Or Role

Transit planner, wayfinding designer, or passenger-information researcher.

### Relationship To Case

Can judge whether the proposed representation change is ethical, legible, and operationally plausible.

### Can Validate

- Map and wayfinding feasibility.
- Crowding impact plausibility.
- Passenger-trust risk.
- Accessibility handling.
- Hidden-variable recovery.

### Validation Method

Rubric review, simulation, or controlled pilot.

## Open Questions

- Was there a specific TfL deployment matching the candidate summary?
- Which OD pairs are most map-distorted and crowding-relevant?
- How should ethical bounds on map manipulation be defined?
- How do journey planners change the map effect today?

## Notes

This case is more research-supported than anecdote-supported. It is valuable for frame recovery but should not be oversold as a clean historical answer-key case.
