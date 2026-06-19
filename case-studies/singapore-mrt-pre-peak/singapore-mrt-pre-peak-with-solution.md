# Case Study: Singapore MRT Pre-Peak Decongestion

## Summary

Singapore's rail network faces morning-peak congestion that cannot be solved quickly or cheaply by adding physical capacity alone. The non-obvious move is to treat the peak as a demand-distribution problem rather than a total-demand problem. Singapore has used pre-peak fare discounts and selected free off-peak rail rides to encourage commuters to shift travel earlier or outside the most congested window. This is a useful Doppl case because the generated answer should recover the hidden variable, then design an incentive that changes behavior without building a new railway for a narrow peak.

## Source

### Type

Public policy documentation and candidate note.

### Origin

Derived from Singapore public transport fare-policy pages and the candidate summary supplied to the Doppl team.

### Source File

`/Users/michaelhabermas/.codex/attachments/39fcf3bf-eaa5-4c44-920e-71640763f2a4/pasted-text.txt`

### Derived By

Doppl capstone team.

### Fidelity

Summarized.

### Source Notes

The Singapore Public Transport Council page describes Morning Pre-Peak Fares: up to 50-cent savings for commuters tapping in before 7:45am on weekdays, introduced on 29 December 2017 to encourage travel before the morning peak. The Ministry of Transport page also describes free morning off-peak rail rides on selected NEL/SPLRT stations from 27 December 2025 to moderate morning-peak demand.

References:

- Public Transport Council, "Morning pre-peak fares": https://www.ptc.gov.sg/fares/morning-pre-peak-fares/
- Ministry of Transport, "Fares, payment structure, journey planning": https://www.mot.gov.sg/what-we-do/public-transport/fares-payment-structure-journey-planning/

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

Use public policy wording carefully. Fare details may change over time, so verify current policy before using this outside the benchmark.

## Problem

### Statement

Morning peak rail demand creates overcrowding, discomfort, reliability pressure, and missed-train risk.

### Background

Rail systems are built for very high utilization, but peak demand can exceed comfortable capacity for a short window. Building new physical capacity for the peak is expensive and slow. Some commuters have schedule flexibility, but absent a reason to shift, they cluster around the same arrival times.

### Why It Matters

Crowding degrades passenger experience, station safety, and service reliability. It also creates pressure for expensive infrastructure that may be underused outside peak periods.

### Current State

The default institutional frame is capacity expansion: more infrastructure, more trains, or higher peak throughput. Those may be needed long term but are not always the best first lever for a narrow peak.

### Impact

If demand remains concentrated, the system spends heavily to serve the highest few minutes of demand while off-peak capacity remains underused.

### Scope

This case focuses on passenger-load shaping for morning commuter rail. It does not solve all transit capacity planning, land use, employer scheduling, or network design.

## Purpose

### Goal

Test whether Doppl can recover temporal demand distribution as the hidden variable behind a transit capacity problem.

### Questions

- Can the system distinguish total demand from peak concentration?
- Can it propose an incentive rather than only infrastructure?
- Can it handle fairness, revenue, and adoption constraints?
- Can it define a validation plan using passenger-load data?

### Success Criteria

A strong generated answer should:

- Identify temporal load shifting as the core opportunity.
- Propose a discount, free-ride window, reward, or employer-aligned incentive.
- Protect equity and avoid punishing people without schedule flexibility.
- Include measurement of peak load, shifted trips, and revenue impact.
- Avoid assuming all commuters can move their schedules.

### Audience

Doppl builders, transit planners, policy designers, operations researchers.

## User

### Name Or Role

Transit authority or public transport policy team.

### Goals

- Reduce peak crowding.
- Improve reliability and comfort.
- Avoid overbuilding for a narrow peak.
- Use existing payment infrastructure where possible.
- Maintain public legitimacy.

### Needs

- A measurable demand-shifting mechanism.
- A fair eligibility rule.
- Simple passenger communication.
- A way to monitor uptake and crowding.

### Pain Points

- Physical capacity takes years and large capital budgets.
- Peak demand is behaviorally sticky.
- Fare changes affect revenue and public perception.
- Some commuters cannot shift travel times.

## Environment

### Setting

Urban rail network with smart-card or account-based fare collection, predictable morning commute peaks, and station-level passenger-load data.

### Tools Or Systems

- Fare gates.
- Fare calculation rules.
- Smart-card or account-based ticketing.
- Passenger-load data.
- Station eligibility rules.
- Public communication channels.

### Inputs

- Tap-in times.
- Tap-out stations.
- Peak crowding by line and station.
- Fare revenue impact.
- Commuter response rates.

### External Factors

- Employer start times.
- School schedules.
- Passenger income sensitivity.
- Line-specific congestion.
- Public acceptance.

### Assumptions

- Some commuters can shift travel earlier or later if incentives are meaningful.
- Fare systems can apply time-based discounts or free rides.
- A small shift in peak travelers can materially reduce crowding.

## Constraints

### Cannot Add Capacity Quickly

New rail infrastructure or major rolling-stock expansion is slow and expensive.

**Rationale:** The intervention needs to improve a near-term peak problem.

### Not All Demand Is Flexible

Many commuters have fixed work, school, caregiving, or shift schedules.

**Rationale:** The program must avoid assuming universal flexibility or punishing people who cannot shift.

### Revenue And Subsidy Matter

Discounts and free rides have fiscal cost.

**Rationale:** A public agency needs a defensible tradeoff between lost fare revenue and decongestion benefits.

### Rules Must Be Simple

Passengers need to understand the eligibility window and stations.

**Rationale:** If the rule is confusing, adoption falls and complaints rise.

### Avoid Creating New Mini-Peaks

The incentive should not simply move crowding to a different sharp time boundary.

**Rationale:** The goal is load smoothing, not a displaced queue.

## Failed Attempts

### Build More Physical Capacity

**Approach:** Add tracks, stations, trains, or platform capacity.

**Outcome:** May be necessary long term but is slow and expensive.

**Why It Failed:** It over-indexes on supply when part of the problem is demand concentration.

**Lesson:** A short peak can sometimes be flattened more cheaply than it can be built around.

### Generic Commuter Appeals

**Approach:** Ask commuters to travel earlier or later.

**Outcome:** Low adoption if there is no material reason to change routine.

**Why It Failed:** Habit and schedule friction dominate vague public-interest messaging.

**Lesson:** Behavior change needs a concrete reward or constraint.

### Uniform Fare Reduction

**Approach:** Lower fares broadly for all rail trips.

**Outcome:** Improves affordability but does not specifically reduce peak crowding.

**Why It Failed:** It does not target the time distribution of demand.

**Lesson:** Incentives need to be aimed at the bottleneck variable.

## Evaluation Focus

### Hidden Variable

The binding variable is not total daily ridership. It is the concentration of demand in a narrow morning peak.

### Frame Recovery Target

A strong system should reframe the problem from "add more capacity" to "shift enough flexible trips out of the peak to flatten the load curve."

### Generated Idea Target

The system should propose a time-targeted fare discount, free-ride window, travel credit, rewards program, or employer-coordinated incentive that moves some commuters to pre-peak or off-peak travel.

### Scoring Notes

- High score: explicitly distinguishes total demand from peak load.
- High score: proposes targeted incentives using fare/tap data.
- Medium score: proposes generic public messaging without a behavioral lever.
- Low score: recommends only more trains or infrastructure.

## Solution

### Summary

Use fare incentives to shift flexible commuters out of the morning peak. Singapore's public mechanisms include island-wide morning pre-peak fare savings before 7:45am and selected free morning off-peak rail rides for designated corridors and windows.

### Details

The solution pattern is:

1. Identify the line, stations, and time windows where peak crowding is worst.
2. Define an earlier or shoulder-period travel window.
3. Offer a visible fare discount, free ride, points reward, or travel credit for qualifying trips.
4. Apply the rule automatically through fare gates and smart-card/account-based payment.
5. Communicate the rule simply.
6. Monitor ridership shifts, crowding, missed trains, fare revenue, and equity impact.
7. Adjust eligibility windows and station coverage based on measured response.

### Why This Solution

The solution fits because it uses the existing fare system as a demand-shaping mechanism. It does not require all passengers to shift. It only needs enough flexible riders to move so that the worst part of the peak eases for everyone.

### Tradeoffs

- Fare revenue may fall.
- Benefits skew toward commuters with schedule flexibility.
- Hard time boundaries can create mini-peaks.
- Communication must be clear.
- The incentive may need adjustment if adoption is too weak or too strong.

### Expected Outcome

A share of commuters travel before or outside the core peak. Peak crowding falls, passenger experience improves, and the system uses off-peak capacity more efficiently.

### Next Steps

- Calculate target shift needed by line and station.
- Estimate incentive cost per shifted trip.
- Pilot an eligibility window.
- Measure before/after load and revenue.
- Adjust windows to avoid new crowding at cutoff times.

## Reproducible

### Is Reproducible

Yes, approximately.

### Reproducibility Level

Approximate.

### Steps

1. Provide the withheld case to a model.
2. Ask it to identify the hidden variable.
3. Ask for a demand-shaping policy and validation plan.
4. Compare against the evaluator target.
5. Score using passenger-load, revenue, and fairness criteria.

### Required Inputs

- Withheld case.
- Evaluator version.
- Passenger-load profile by time.
- Fare system capabilities.

### Expected Result

A strong system should propose time-targeted incentives rather than only capacity expansion.

### Known Variability

The exact fare rule depends on the city's payment system, subsidy policy, and commuter flexibility.

## Validator

### Name Or Role

Transit planner, fare-policy analyst, or public transport operations researcher.

### Relationship To Case

Can judge whether the demand-shifting mechanism is realistic and measurable.

### Can Validate

- Load-shifting plausibility.
- Fare-policy feasibility.
- Equity risk.
- Revenue impact.
- Whether the hidden variable was correctly recovered.

### Validation Method

Rubric review, simulation, or policy pilot.

## Open Questions

- What percentage of riders must shift to materially reduce crowding?
- How much discount is required for behavior change?
- Which groups cannot shift schedules?
- How should hard cutoff times be smoothed?

## Notes

This case is publicly documented and likely answer-contaminated. Score the reasoning path, especially hidden-variable recovery.
