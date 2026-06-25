# Case Study: Loft Insulation Adoption Failure

## Summary

UK households were under-adopting loft insulation despite a strong apparent case for it: reduced heat loss, lower energy use, greater comfort, and long-lived savings. The obvious explanations focused on awareness, motivation, belief in the savings, or financial incentives. But this version intentionally withholds the known solution so it can be used as a Doppl prompt or evaluation case.

The goal is to see whether a system can identify a hidden last-mile constraint in a public-policy adoption problem, rather than defaulting to education, persuasion, or larger subsidies.

## Source

### Type

Article, public organization summary, and secondary energy-efficiency guidance.

### Origin

This case was derived from a public Behavioural Insights Team example about increasing loft insulation installation. Additional research was used to understand BIT's methodology and the practical context of loft insulation in UK homes.

### Source File

Behavioural Insights Team public summary and GOV.UK `Test, Learn, Adapt` RCT methodology paper.

### Derived By

Doppl capstone team.

### Fidelity

Summarized.

### Source Notes

The public BIT summary reports the central result but does not provide a full accessible trial report in the source material gathered here. The fivefold increase should therefore be treated as source-reported. The GOV.UK paper supports BIT's broader test-learn-adapt methodology, while Energy Saving Trust guidance supports the practical insulation context.

## Visibility

### Level

Public.

### Anonymized

Not applicable.

### Public Summary Allowed

Yes.

### Sensitive Details

- The specific hidden blocker should be withheld from this prompt version.
- The exact intervention should be withheld from this prompt version.
- Do not invent trial sample sizes, costs, locations, or treatment arms.
- Present the reported fivefold effect as source-reported unless a primary evaluation is later found.

### Sharing Notes

This is safe for public demos and evaluation, provided the withheld version does not reveal the practical blocker or the intervention.

## Problem

### Statement

Many households were not installing loft insulation even though it appeared financially and practically sensible. The challenge was to increase installation without relying only on more information, stronger persuasion, or larger financial incentives.

### Background

Loft insulation reduces heat loss through the roof and can make a home warmer while reducing heating demand. The Energy Saving Trust says an uninsulated home can lose around 25% of its heat through the roof. It also notes that correctly installed loft insulation can last around 40 years and can pay for itself many times over.

In the standard policy framing, low adoption of such an improvement looks like a motivation or information problem. Households may not know how much heat they are losing, may not trust the savings, may discount future benefits, may dislike arranging home improvements, or may simply not prioritize energy efficiency. These explanations point toward leaflets, financial calculators, awareness campaigns, subsidies, or climate messaging.

But the installation journey happens inside an ordinary home, not inside a policy diagram. A household must move from agreement in principle to an appointment, access, preparation, installer entry, completion, and follow-through. Each step can contain mundane friction that is invisible if the team studies attitudes rather than the lived workflow.

### Why It Matters

Under-adoption wastes a comparatively simple opportunity to reduce heating demand, household energy bills, and emissions. It also shows how a policy can fail even when the economic case is strong, because the bottleneck may be hidden in the final physical action required to turn intention into completion.

### Current State

The default responses are to explain the benefits more clearly, advertise the savings, offer grants or discounts, send reminders, simplify booking, or use social-norm messages. These may help, but they may not solve the point where the behavior actually stalls.

### Impact

If the adoption problem is not solved:

- Homes continue losing avoidable heat through the roof.
- Households miss potential bill savings and comfort improvements.
- Public energy-efficiency programs underperform.
- Policy teams may spend money on awareness campaigns that do not address the true obstacle.
- Installers and program administrators may see interest fail to convert into completed work.

### Scope

This case focuses on the adoption of loft insulation in ordinary households. It does not cover all building retrofit measures, complex damp or structural problems, poor-quality installation scandals, or whole-home retrofit policy.

## Purpose

### Goal

Use this case to test whether Doppl can uncover a practical hidden constraint behind a rational-seeming but under-adopted household improvement.

### Questions

- Can the system avoid assuming that low adoption means low awareness or weak incentives?
- Can it reason through the household workflow from intention to completed installation?
- Can it identify mundane physical or logistical friction as a plausible bottleneck?
- Can it propose a low-cost service change that removes the bottleneck?
- Can it include a way to test the intervention against the status quo?

### Success Criteria

A strong answer should:

- Treat installation completion, not expressed interest, as the outcome.
- Investigate the last-mile steps required inside the home.
- Look for practical friction that blocks action after people already accept the value.
- Avoid relying only on education, persuasion, or bigger subsidies.
- Propose a bundled intervention that makes installation easier at the point of failure.
- Be testable with a comparison between standard offers and the modified offer.
- Preserve safety, trust, and respect inside the household.

### Audience

This case is for Doppl builders and evaluators studying hidden constraints, behavioral design, and public-policy implementation.

## User

### Name Or Role

Household energy-efficiency program team, local authority, insulation provider, or public-policy unit.

### Goals

- Increase completed loft insulation installations.
- Reduce avoidable home heat loss.
- Make the adoption journey easier for households.
- Spend public or program money on interventions that change actual behavior.
- Learn which part of the process blocks completion.

### Needs

- A diagnosis of why households do not complete installation.
- A practical intervention that can be delivered through the installation process.
- A way to measure installation completion.
- A solution that is low-cost relative to the value of completed insulation.
- A household-respecting process for entering and working in private homes.

### Pain Points

- Households may agree that insulation is worthwhile but still postpone it.
- Installations require access to a private domestic space.
- The program may not observe the true blocker if it only measures attitudes.
- Installers may arrive to conditions that make the work difficult or impossible.
- Householders may avoid tasks that feel annoying, embarrassing, or time-consuming.

## Environment

### Setting

UK household energy-efficiency policy and service delivery. The work involves private homes, household decision-makers, insulation installers, appointment booking, and practical preparation before work can happen.

### Tools Or Systems

- Loft insulation materials and installation process.
- Household outreach or offer letters.
- Booking and appointment systems.
- Installer visits.
- Program data on appointments and completed installations.
- Energy-efficiency advice and grant programs.

### Inputs

- Evidence that loft insulation can reduce heat loss and save money.
- Low installation rates despite the apparent value proposition.
- Existing policy tools such as information, incentives, and installer networks.
- Observations from households or installers about why work does not proceed.
- Program ability to vary the offer and measure completion.

### External Factors

- Energy prices and household budget pressure.
- Trust in home-improvement providers.
- Safety and quality expectations for installers.
- Differences in home layout, access, damp, and how the loft is currently used.
- The inconvenience of preparing a home for tradespeople.

### Assumptions

- At least some households already accept the value of loft insulation in principle.
- The bottleneck may occur after the decision to consider insulation.
- Domestic preparation work can be a major source of friction.
- Small service changes can outperform larger persuasion efforts when they remove the true constraint.

## Constraints

### Respect Private Domestic Space

Any intervention must work inside people's homes without making them feel judged, exposed, or coerced.

**Rationale:** Household spaces are personal, and shame or discomfort can reduce uptake.

### Keep The Intervention Low-Cost

The solution should be cheap enough that it does not erase the financial case for insulation.

**Rationale:** Loft insulation is attractive partly because it can be a cost-effective retrofit.

### Measure Completed Installation

The program should track whether insulation was actually installed, not just whether households showed interest.

**Rationale:** The failure may happen between intention and completion.

### Fit Existing Installer Workflows

The solution should be compatible with normal assessment, booking, and installation processes.

**Rationale:** A solution that requires a new bespoke retrofit system may be too expensive or slow.

### Avoid Overclaiming Source Precision

The reported fivefold result should be labeled as source-reported unless a primary trial report is found.

**Rationale:** The accessible source trail summarizes the result but does not provide a full audited trial account.

## Failed Attempts

### Better Information

**Approach:** Explain that loft insulation reduces heat loss and can lower bills.

**Outcome:** This may increase awareness but may not produce completed installations.

**Why It Failed:** It assumes the primary blocker is ignorance or disbelief rather than a practical step in the installation journey.

**Lesson:** Awareness is not the same as action.

### Stronger Financial Messaging

**Approach:** Emphasize payback, long lifespan, and energy-bill savings.

**Outcome:** Households may agree with the financial case and still fail to proceed.

**Why It Failed:** It treats the decision as an abstract cost-benefit calculation, while the actual behavior requires domestic preparation.

**Lesson:** A positive expected return does not remove immediate hassle.

### Larger Subsidies

**Approach:** Reduce the installation price further through grants or discounts.

**Outcome:** Subsidies may help price-sensitive households but may be inefficient if the true blocker is not price.

**Why It Failed:** A lower price does not necessarily solve non-financial friction.

**Lesson:** Incentives should target the bottleneck, not just the headline purchase.

### Generic Reminders

**Approach:** Send reminders or prompts encouraging households to book or complete installation.

**Outcome:** Reminders may bring the task back to mind but not make it easier to do.

**Why It Failed:** Prompting does not remove the hard step if the hard step remains outside the service boundary.

**Lesson:** The right nudge may be a service redesign, not just a message.

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

- what service, workflow, or household-journey intervention should be used
- where it enters the path from interest to completed installation
- who does what, and with what consent
- how it protects privacy, liability, and installer workflow
- how completion rates and cost per completed installation would be measured

### Why This Solution

_To be generated._

### Tradeoffs

_To be generated._

### Validation Plan

_To be generated._

## Reproducible

### Is Reproducible

True.

### Reproducibility Level

Approximate.

### Steps

- Identify households eligible for loft insulation.
- Randomly assign comparable households to a standard offer or a modified offer.
- Measure completed installations, cancellations, failed visits, and cost per completion.
- Interview households and installers after non-completion to identify remaining barriers.
- Compare the modified offer against the standard offer.

### Required Inputs

- Eligible household list.
- Standard loft insulation offer.
- Installation completion data.
- Installer feedback on failed or delayed jobs.
- Budget for a small operational add-on.

### Expected Result

A reproducer should expect that if practical preparation is the true bottleneck, an intervention that removes that preparation burden will produce more completed installations than information or price messaging alone.

### Known Variability

Results may vary by housing stock, existing insulation depth, household income, trust in installers, how the loft is currently used, local installer capacity, damp or structural issues, and the design of the service add-on.

## Validator

### Name Or Role

Domestic retrofit program manager, insulation installer, local authority energy-efficiency officer, or behavioural insights evaluator.

### Relationship To Case

These reviewers can judge whether the described adoption bottleneck is plausible and whether the intervention would fit real installation workflows.

### Can Validate

- Domain plausibility.
- Installer workflow fit.
- Household trust and consent risks.
- Measurement design.
- Cost-effectiveness assumptions.

### Validation Method

Rubric review.

### Notes

The strongest validation would come from a primary BIT report or trial data for the exact loft insulation intervention.

## Open Questions

- Is there a primary public report that documents the exact trial design and sample size?
- What was the precise cost of the operational add-on?
- Was the fivefold increase measured as bookings, completed installations, or another outcome?
- Which households were eligible for the offer?
- Did the intervention change no-shows, failed visits, booking rates, or all three?
- Were there any issues around liability, disposal, or household consent?

## Notes

This is a classic hidden-constraint case. It is most valuable when the prompt keeps the model focused on the gap between believing a measure is worthwhile and completing the physical steps required to make it happen.

## References

- Behavioural Insights Team overview and loft insulation example: https://en.wikipedia.org/wiki/Behavioural_Insights_Team
- GOV.UK, `Test, Learn, Adapt: Developing Public Policy with Randomised Controlled Trials`: https://www.gov.uk/government/publications/test-learn-adapt-developing-public-policy-with-randomised-controlled-trials
- `Test, Learn, Adapt` PDF: https://assets.publishing.service.gov.uk/media/5a7488c8e5274a7f9c586c23/TLA-1906126.pdf
- Energy Saving Trust, `Roof and loft insulation`: https://energysavingtrust.org.uk/advice/roof-and-loft-insulation/
