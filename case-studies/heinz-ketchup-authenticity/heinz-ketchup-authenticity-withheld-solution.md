# Case Study: Heinz Ketchup Authenticity Problem

## Summary

In Turkey, some cafes reportedly placed Heinz ketchup bottles on tables but refilled them with cheaper ketchup. This let the venue borrow Heinz's brand trust without serving the Heinz product. The obvious responses were audits, contracts, warnings, disposable packets, or more controlled packaging, but those approaches were costly, awkward, or hard to scale. This version intentionally withholds the known solution so it can be used as a Doppl prompt or evaluation case.

The goal is to see whether a system can identify a simple customer-visible authenticity cue that works at the moment of use.

## Source

### Type

Spreadsheet row, article, and secondary product-history context.

### Origin

This case was derived from a Google Sheet of interesting problem/solution pairs. The source row describes Heinz ketchup bottles in Turkey being refilled with cheaper product and asks what minor change allowed customers to know whether they were getting the real thing. Additional research was used to understand the campaign context and Heinz's broader packaging history.

### Source File

Google Sheet row 202, episode 47, `gid=1141154529`.

### Derived By

Doppl capstone team.

### Fidelity

Summarized.

### Source Notes

Allrecipes summarized the campaign in 2023 and provides public reporting on the known packaging intervention used in Turkey. The public source material does not provide measured fraud prevalence, sales impact, or restaurant compliance data, so the case should be treated as a public brand/packaging design example rather than a full enforcement study.

## Visibility

### Level

Public.

### Anonymized

Not applicable.

### Public Summary Allowed

Yes.

### Sensitive Details

- The exact known package change should be withheld from this prompt version.
- Do not invent fraud rates, enforcement outcomes, or internal Heinz campaign metrics.
- Avoid implying that every cafe in Turkey engaged in substitution.

### Sharing Notes

This is appropriate for demos and evaluations as a public packaging-authentication case. Keep the distinction clear between source-reported campaign story and quantified business impact.

## Problem

### Statement

Heinz needed a way for customers to tell whether a Heinz bottle on a cafe table actually contained Heinz ketchup.

### Background

Heinz ketchup is a globally recognized condiment brand. In restaurants and cafes, the table bottle functions as both packaging and advertising: it tells the customer what product they are about to use. That creates a vulnerability. A venue can reuse the branded bottle but fill it with cheaper ketchup, preserving the visible brand while substituting the contents.

The problem is especially difficult because the refill happens outside Heinz's direct control. Customers see the bottle after the substitution has already occurred. Heinz can protect production and distribution, but the last-mile usage environment is controlled by the restaurant or cafe.

### Why It Matters

Substitution damages the brand in two directions. If the cheaper ketchup tastes worse, customers may blame Heinz. If customers discover the substitution, they may distrust the venue and the brand presentation. Heinz also loses product sales when a restaurant benefits from the brand signal without buying the branded refill.

### Current State

Without a better cue, customers must rely on trust, taste, or close inspection. Heinz could audit restaurants or use legal pressure, but these methods are not immediate and do not help the customer at the table.

### Impact

If the problem is not solved:

- Customers may unknowingly consume non-Heinz ketchup.
- Restaurants can free-ride on Heinz's brand.
- Heinz loses sales and control over product experience.
- Bad substitute ketchup can damage customer perception of Heinz.
- Enforcement becomes expensive and incomplete.

### Scope

This case focuses on tabletop restaurant/cafe ketchup bottles and customer-visible authenticity. It does not cover industrial counterfeiting, grocery-store tampering, factory quality control, or all Heinz packaging.

## Purpose

### Goal

Use this case to test whether Doppl can find a low-cost packaging intervention that turns hidden substitution into something visible to ordinary customers.

### Questions

- Can the system identify that the problem occurs after distribution?
- Can it avoid relying only on audits or legal enforcement?
- Can it design for customers who have only a few seconds at the table?
- Can it use the existing package as a verification surface?
- Can it preserve normal restaurant use without annoying customers or staff?

### Success Criteria

A strong answer should:

- Let customers detect substitution at the table.
- Be inexpensive enough to apply to many bottles.
- Require no electronics or special tools.
- Fit normal restaurant/cafe behavior.
- Avoid creating lots of packaging waste.
- Be understandable without instructions.
- Make the fraud harder to hide, not merely punishable later.

### Audience

This case is for Doppl builders and evaluators testing whether a system can reason from brand-trust constraints to an elegant packaging-authentication solution.

## User

### Name Or Role

Heinz brand, packaging, trade marketing, or restaurant-channel team.

### Goals

- Protect Heinz brand trust.
- Ensure customers receive actual Heinz ketchup.
- Reduce free-riding by venues using Heinz bottles with cheaper contents.
- Keep restaurant packaging familiar and easy to use.
- Avoid expensive enforcement-only approaches.

### Needs

- A customer-visible authenticity cue.
- A solution that works in cafes without staff training.
- A change that can be applied at packaging scale.
- A way to make substitution obvious or risky.
- A simple explanation for marketing and channel partners.

### Pain Points

- The refill process is hidden from customers.
- Taste is subjective and delayed.
- Audits are expensive and incomplete.
- Disposable packets create waste and change the dining experience.
- Restaurants may have an economic incentive to substitute cheaper ketchup.

## Environment

### Setting

Cafes and casual dining venues in Turkey where Heinz-branded bottles may sit on tables and be refilled by staff.

### Tools Or Systems

- Heinz-branded ketchup bottles.
- Bottle labels and packaging surfaces.
- Restaurant refill practices.
- Customer visual inspection.
- Heinz trade marketing and packaging production.
- Retail and foodservice distribution.

### Inputs

- Heinz brand identity.
- Bottle shape and label design.
- Visual properties of ketchup.
- Customer expectations at the table.
- Restaurant staff behavior.
- Cost constraints for label/package changes.

### External Factors

- Cheaper competing ketchup products.
- Cafe incentives to reduce condiment cost.
- Customer trust in visible brands.
- Limited enforcement visibility after distribution.
- Need for fast, intuitive recognition.

### Assumptions

- Some venues refill branded bottles with non-Heinz ketchup.
- Customers care whether the bottle contents match the brand.
- The bottle remains visible during use.
- A subtle package cue can be noticed without requiring a formal inspection.

## Constraints

### Work At The Table

The solution must help customers in the moment they are about to use the ketchup.

**Rationale:** Audits and legal enforcement happen elsewhere and later; the deception is experienced at the table.

### Keep The Bottle Familiar

The bottle should still look and behave like a normal Heinz ketchup bottle.

**Rationale:** The package is already recognizable, and a disruptive redesign could create friction for restaurants and customers.

### Avoid High-Tech Verification

The solution should not require phones, scanners, electronics, or special tools.

**Rationale:** Most customers will not perform a complicated authentication step before using ketchup.

### Scale Cheaply

The intervention should be inexpensive enough to apply across many bottles.

**Rationale:** A costly anti-counterfeit system would be disproportionate for tabletop condiment fraud.

### Preserve Restaurant Workflow

The solution should not require major staff retraining or slow down normal service.

**Rationale:** Restaurants will resist changes that make condiment handling annoying or operationally heavy.

## Failed Attempts

### Rely On Taste

**Approach:** Assume customers can tell whether the ketchup tastes like Heinz.

**Outcome:** Some customers may notice, but many will not, and the damage occurs after use.

**Why It Failed:** Taste is subjective, delayed, and hard to turn into a clear authenticity signal.

**Lesson:** The cue should be visible before or during use, not only tasted afterward.

### Audit Cafes

**Approach:** Inspect restaurants or cafes to verify that bottles contain Heinz ketchup.

**Outcome:** Audits can catch some misuse but are expensive and incomplete.

**Why It Failed:** The problem is distributed across many venues and can recur after an inspection.

**Lesson:** The package should help customers and venues police the issue continuously.

### Use Legal Or Contractual Pressure

**Approach:** Warn venues not to refill Heinz bottles with cheaper ketchup.

**Outcome:** This may deter some substitution but does not give customers immediate proof.

**Why It Failed:** The incentive to substitute remains, and enforcement requires detection.

**Lesson:** The better answer should make detection easier at the point of use.

### Switch To Single-Serve Packets

**Approach:** Replace refillable bottles with sealed single-use packets.

**Outcome:** Packets are harder to refill but create waste and change the restaurant experience.

**Why It Failed:** The fix is heavy relative to the problem and sacrifices the familiar tabletop bottle.

**Lesson:** The ideal solution should keep the bottle while reducing substitution.

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

- what packaging, label, bottle, or usage-surface intervention should be used
- when and how a customer notices the cue
- how it works without electronics, audits, or staff training
- how it preserves the familiar bottle experience
- how Heinz would validate customer recognition and restaurant compliance

### Why This Solution

_To be generated._

### Tradeoffs

_To be generated._

### Validation Plan

_To be generated._

## Reproducible

### Is Reproducible

Yes.

### Reproducibility Level

Approximate.

### Steps

1. Give a model the withheld case-study prompt.
2. Ask it to propose an intervention for detecting substituted ketchup in Heinz bottles.
3. Score whether the answer works at the table.
4. Compare the generated answer against the known solution.
5. Ask for a validation plan using customer recognition and restaurant compliance.

### Required Inputs

- Withheld case-study prompt.
- Basic Heinz packaging context.
- Scoring rubric for simplicity, visibility, cost, and fraud resistance.

### Expected Result

A strong model should propose a low-cost packaging cue that lets ordinary customers notice when the contents do not match the Heinz brand.

### Known Variability

Generated answers may propose seals, tamper bands, special caps, visual package changes, or bottle design changes. They should be rewarded most when they preserve the familiar bottle and make substitution visually obvious without extra tools.

## Validator

### Name Or Role

Packaging designer, brand manager, foodservice channel operator, or advertising strategist.

### Relationship To Case

They can evaluate whether the problem framing, customer behavior, restaurant workflow, and proposed package intervention are plausible.

### Can Validate

- Packaging feasibility.
- Customer-recognition fit.
- Brand-trust logic.
- Foodservice workflow.
- Whether the answer matches the documented Heinz campaign mechanism.

### Validation Method

Rubric review.

### Notes

The ideal validator would have access to Heinz campaign materials, restaurant-channel data, or consumer testing results. Public sources are sufficient for a useful Doppl case but not for a full effectiveness analysis.

## Open Questions

- How common was the refill substitution problem in Turkey?
- How many bottles received the updated packaging?
- Did customers understand the cue without explanation?
- Did restaurants change behavior after the campaign?
- Did the campaign expand beyond Turkey?
- Were there false positives with legitimate Heinz batches or lighting conditions?

## Notes

This is a strong Doppl case because it rewards designing a verification cue into an everyday object. The problem is not only product fraud; it is the customer's inability to see whether the brand promise and the contents still match.

## References

- Google Sheet source: https://docs.google.com/spreadsheets/d/1zpOC-m38VwXiy4Cxy47E6VjJjmbIWT2QUHDfq1VzEwM/edit?gid=1141154529#gid=1141154529
- Allrecipes campaign summary: https://www.allrecipes.com/this-heinz-label-calls-out-imposters-7564614
- Heinz Tomato Ketchup overview: https://en.wikipedia.org/wiki/Heinz_Tomato_Ketchup
