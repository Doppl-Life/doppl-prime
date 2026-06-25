# Case Study: Heinz Ketchup Authenticity

## Summary

In Turkey, some cafes reportedly refilled Heinz ketchup bottles with cheaper ketchup, letting the venue borrow Heinz's brand trust without serving the Heinz product. Heinz needed a way for customers to detect substitution at the table without audits, electronics, or a major packaging overhaul. The solution was a subtle label redesign: the label border was changed to match the exact red color of Heinz ketchup, reportedly using Pantone color matching. If the bottle was filled with another ketchup, the contents would not match the label edge, making the substitution visible.

The key lesson is that packaging can become a live authenticity test when it compares the product against itself.

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

Allrecipes summarized the campaign in 2023 and reported that Heinz worked with Wunderman Thompson and Pantone to create a label edge matching Heinz ketchup's exact hue. The public source material does not provide measured fraud prevalence, sales impact, or restaurant compliance data, so the case should be treated as a public brand/packaging design example rather than a full enforcement study.

## Visibility

### Level

Public.

### Anonymized

Not applicable.

### Public Summary Allowed

Yes.

### Sensitive Details

- Do not invent fraud rates, enforcement outcomes, or internal Heinz campaign metrics.
- Avoid implying that every cafe in Turkey engaged in substitution.
- Present the campaign's effectiveness as plausible and source-reported unless better data is found.

### Sharing Notes

This is appropriate for demos and evaluations as a public packaging-authentication case. It is a compact example of making fraud visible through design rather than enforcement alone.

## Problem

### Statement

Heinz needed a way for customers to tell whether a Heinz bottle on a cafe table actually contained Heinz ketchup.

### Background

Heinz Tomato Ketchup is a globally recognized condiment brand with a long packaging history. Heinz historically used clear bottles in part because visibility of the product supported trust. In restaurants and cafes, however, the visible bottle can become separated from the authentic refill. A venue can reuse a Heinz bottle but fill it with cheaper ketchup.

The substitution is hard to catch because it happens outside Heinz's direct control. Customers encounter the bottle at the table, after restaurant staff have already handled refilling. Heinz can protect factory production and distribution, but the last mile is a messy foodservice environment.

### Why It Matters

If a customer uses inferior ketchup from a Heinz bottle, the customer may blame Heinz for the taste. If the customer discovers the substitution, the brand presentation itself becomes suspect. Heinz also loses sales when restaurants benefit from the brand signal while buying cheaper alternatives.

### Current State

Without the solution, customers must rely on trust, taste, or close inspection. Heinz could audit cafes or use legal pressure, but those methods are delayed, expensive, and incomplete.

### Impact

If the problem is not solved:

- Customers may unknowingly consume non-Heinz ketchup.
- Restaurants can free-ride on Heinz's brand.
- Heinz loses sales and control over product experience.
- Bad substitute ketchup can damage customer perception of Heinz.
- Enforcement remains expensive and incomplete.

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
- Can it explain why the solution works without special tools?

### Success Criteria

A strong answer should:

- Let customers detect substitution at the table.
- Be inexpensive enough to apply to many bottles.
- Require no electronics or special tools.
- Fit normal restaurant/cafe behavior.
- Preserve the familiar Heinz bottle.
- Be understandable without much instruction.
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
- Pantone color matching.
- Wunderman Thompson campaign/design support.

### Inputs

- Heinz brand identity.
- Bottle shape and label design.
- The visible red color of Heinz ketchup.
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
- Competing ketchup differs enough in color that a color mismatch can reveal substitution.

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

## Solution

### Summary

Heinz changed the label edge/border so it matched the exact red color of Heinz ketchup. When the bottle contains real Heinz, the ketchup visible through the bottle aligns with the label color. If a cafe refills the bottle with another ketchup, the color mismatch exposes the substitution.

### Details

The intervention used the product as its own reference standard. Instead of adding a seal, QR code, enforcement program, or disposable package, Heinz made the label compare visually against the ketchup inside the bottle.

According to the campaign writeup, Heinz worked with Wunderman Thompson and Pantone to identify the exact Heinz ketchup hue and apply that color to the edge of the label. The customer does not need to know supply-chain details or scan anything. They only need to see whether the ketchup and the label cue visually match.

This works because many substituted ketchups are close enough to pass casual use but not close enough to match an intentionally calibrated color reference. The package turns a subtle product difference into a visible discrepancy.

### Why This Solution

The solution fits because it meets the customer where the problem occurs: at the table. It uses the existing bottle and label, requires no electronic infrastructure, and preserves normal restaurant behavior. It also turns Heinz's own product properties into an authentication mechanism, which is elegant because the proof travels with the bottle.

### Tradeoffs

- Color matching may depend on lighting, bottle material, age, and ketchup batch variation.
- Some substitute ketchups may be close enough in color to evade casual detection.
- Customers may need campaign exposure to understand what the cue means.
- The solution may be less useful for opaque squeeze bottles.
- It detects a likely mismatch but is not a legal proof of fraud by itself.

### Expected Outcome

Customers and venues can more easily notice when a Heinz bottle has been refilled with non-Heinz ketchup. The intervention should deter substitution because the deception becomes more visible and more embarrassing. Heinz protects brand trust without relying only on audits or legal enforcement.

### Next Steps

- Test customer recognition under restaurant lighting.
- Measure whether restaurants reduce substitution after receiving the new labels.
- Compare complaint rates or sales in markets with and without the label update.
- Evaluate whether the cue works across bottle types and ketchup batches.
- Decide whether to expand beyond Turkey.

## Reproducible

### Is Reproducible

Yes.

### Reproducibility Level

Approximate.

### Steps

1. Identify a product whose authentic version has a stable visible property.
2. Add a package cue that matches that property.
3. Place the cue where customers naturally compare it with the product.
4. Test with authentic product and likely substitutes.
5. Measure whether ordinary customers notice mismatches quickly.
6. Monitor whether the cue deters substitution in the field.

### Required Inputs

- Authentic Heinz ketchup color standard.
- Candidate substitute ketchups.
- Bottle and label design files.
- Restaurant lighting/customer testing environment.
- Cost constraints for label production.

### Expected Result

A reproducer should find that a calibrated package cue makes at least some non-Heinz refills visibly mismatched, allowing customers to detect substitution without extra tools.

### Known Variability

Effectiveness depends on the visual gap between Heinz and substitutes, lighting, bottle transparency, label placement, customer awareness, and whether venues can find close color matches.

## Validator

### Name Or Role

Packaging designer, brand manager, foodservice channel operator, advertising strategist, or color-management specialist.

### Relationship To Case

They can evaluate whether the problem framing, customer behavior, restaurant workflow, and label/color-matching intervention are plausible.

### Can Validate

- Packaging feasibility.
- Customer-recognition fit.
- Color-matching reliability.
- Brand-trust logic.
- Foodservice workflow.
- Whether the answer matches the documented Heinz campaign mechanism.

### Validation Method

Rubric review.

### Notes

The ideal validator would have access to Heinz campaign materials, restaurant-channel data, consumer testing results, and color-tolerance specifications. Public sources are sufficient for a useful Doppl case but not for a full effectiveness analysis.

## Open Questions

- How common was the refill substitution problem in Turkey?
- How many bottles received the updated packaging?
- Did customers understand the cue without explanation?
- Did restaurants change behavior after the campaign?
- Did the campaign expand beyond Turkey?
- What color tolerance did Heinz use for legitimate product variation?

## Notes

This is a strong Doppl case because it rewards turning an ordinary package detail into an authentication mechanism. The elegant move is not stricter policing; it is making the contents and the brand cue check each other in public.

## References

- Google Sheet source: https://docs.google.com/spreadsheets/d/1zpOC-m38VwXiy4Cxy47E6VjJjmbIWT2QUHDfq1VzEwM/edit?gid=1141154529#gid=1141154529
- Allrecipes campaign summary: https://www.allrecipes.com/this-heinz-label-calls-out-imposters-7564614
- Heinz Tomato Ketchup overview: https://en.wikipedia.org/wiki/Heinz_Tomato_Ketchup
