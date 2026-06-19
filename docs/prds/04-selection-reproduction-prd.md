# PRD 04: Selection, Scoring, And Reproduction

## Purpose

Turn persisted evidence into fitness, preserve novelty pressure, choose parents, cull weak lineages, and create the next generation through fusion and mutation.

## Spec Anchors

- `ARCHITECTURE.md §8` selection, scoring, and novelty
- `ARCHITECTURE.md §5` runtime handoff and caps
- `ARCHITECTURE.md §3` lifecycle and lineage
- `IMPLEMENTATION_PLAN.md P5`

## Owner Surface

Selection / ML.

## Consumes

`CandidateIdea`, `CriticReview`, `CheckResult`, `NoveltyScore`, `FitnessScore`, `ScoringPolicy`, `EnergyEvent`, `Agenome`, lineage/reproduction contracts, embedding vectors, and held-out judge output.

## Produces

- `novelty.scored` events.
- `fitness.scored` events.
- `lineage.culled` events.
- parent-selection decisions.
- `agenome.fused`, `agenome.mutated`, and reproduction metadata.

## Requirements

- Compute novelty from candidate summaries using persisted embeddings and app-level cosine similarity for MVP scale.
- Persist embedding vectors needed for replay.
- Degrade novelty explicitly with `novelty_scoring_degraded` when embeddings fail.
- Compute decomposed `FitnessScore` from critic scores, subtype checks, novelty, energy efficiency, and held-out judge score.
- Version every scoring policy.
- Make every culling and parent-selection decision explainable from persisted events.
- Prefer distant lineages where possible to avoid collapse.
- Implement two reproduction levels: agenome-level crossover and output-level synthesis.
- Persist parentage, fusion metadata, mutation metadata, and concrete RNG outcomes or seeds.
- Never let evolving agents mutate the held-out judge, cap policy, or scoring structure.

## Handoffs

- From verifier: structured reviews, checks, and held-out judge evidence.
- From kernel: generation state, surviving agenomes, caps, energy ledger, RNG seed.
- To kernel: next-generation agenomes and reproduction/culling events.
- To demo: generation comparison, fitness chart inputs, lineage metadata, final survivor proof inputs.

## Exit Gate

- A completed generation has novelty and fitness scores for valid candidates.
- Parent selection and culling can be replayed from persisted data.
- Fusion/mutation records explain the next generation's parentage.
- Generation N+1 vs N comparison can be computed from stored `fitness.scored` events.
- Zero-survivor and insufficient-parent cases terminate or abort reproduction with explicit events.

