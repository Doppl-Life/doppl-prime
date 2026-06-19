# PRD 04: Run Trace Viewer Prototype

## Prototype Question

Can Doppl give one reusable viewer for any experiment trace, letting users zoom from population-level evolution to an individual agenome to the atomic evidence underneath?

## Audience Moment

Within 10 seconds, a viewer should see the core promise: every impressive output has an audit trail. You can move from meta to individual to atom: generation summary, agenome proposal, literal prompt/response, critic reasoning, and inheritance math.

## User Workflow

- View generations as columns.
- Compare energy, fitness, and novelty over time.
- Open one individual.
- Switch between prompt/response, critic breakdown, and inheritance atoms.
- Return to the population view.

## Required Data / Events

- `RunEventEnvelope`
- `Generation`
- `Agenome`
- `CandidateIdea`
- `CriticReview`
- `FitnessScore`
- `NoveltyScore`
- `EnergyEvent`
- `LineageGraphProjection`
- prompt/response trace metadata from ModelGateway

## Acceptable Fixture

The current sample trace can be hand-shaped as long as it conforms to a documented schema and is replaceable wholesale by live runner output.

## Convincing Demo Bar

- The viewer accepts one trace shape across lineage, fusion, inter-stratum, and crossover experiments.
- Drill-down is a property of the viewer, not bespoke per experiment.
- Atoms include actual prompts, raw outputs, critic reasoning, and inheritance data.
- Users can explain why a lineage improved without leaving the viewer.

## Falsification Bar

This prototype fails if trace detail is a summary with no raw evidence, if each experiment needs a custom viewer, or if replay cannot reconstruct the same drill-down.

## Graduation Path

Map the trace schema to event-store projections. The production viewer should hydrate from stored events and projection builders, with no model calls during replay.

