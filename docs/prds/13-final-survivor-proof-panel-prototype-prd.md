# PRD 13: Final Survivor Proof Panel Prototype

## Prototype Question

Can Doppl end a run with one audience-ready artifact that proves why the surviving idea won?

## Audience Moment

Within 10 seconds, a viewer should see the final idea, the improvement claim, and the evidence bundle: lineage, critics, checks, novelty, fitness, energy, spend, and held-out judge.

## User Workflow

- Open the final surviving idea.
- Read the proposed solution.
- See the generation improvement claim.
- Follow links to lineage, critic evidence, subtype checks, novelty, energy, spend, and trace atoms.
- See unresolved risks and validation plan.

## Required Data / Events

- `CandidateIdea`
- `LineageGraphProjection`
- `CriticReview`
- `CheckResult`
- `NoveltyScore`
- `FitnessScore`
- `EnergyEvent`
- cost metadata
- held-out judge output
- final terminal run summary

## Acceptable Fixture

Use a completed replay fixture with one final selected candidate. The fixture must also include a no-survivor terminal case for state design.

## Convincing Demo Bar

- The final panel is a proof, not a trophy card.
- Every evidence link resolves.
- The improvement over earlier generations is visible.
- Unresolved risks are not hidden.
- Live and replay modes render the same proof semantics.

## Falsification Bar

This prototype fails if the winner feels self-declared, if links are dead, if evidence is scattered across unrelated views, or if no-survivor runs fabricate a winner.

## Graduation Path

Build from production projections and event references. This becomes the capstone closing surface and the product's shareable run summary.

