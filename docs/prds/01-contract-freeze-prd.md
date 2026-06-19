# PRD 01: Contract Freeze

## Purpose

Freeze the shared Zod contracts before parallel implementation starts. This PRD is the gate that lets kernel/runtime, verifier council, selection/ML, and demo/observability work independently without field drift.

## Spec Anchors

- `ARCHITECTURE.md §2.5` shared contracts crossed by DAG edges
- `ARCHITECTURE.md §4` contracts and event model
- `ARCHITECTURE.md Appendix A` model inventory
- `IMPLEMENTATION_PLAN.md Phase 0`

## Owner

Contract authoring lead, with required whole-team review. This is the only PRD where every surface is a blocker before fork.

## Must Freeze

- `RunEventEnvelope`, closed `RunEventType`, closed 7-role actor union
- `Run`, `Generation`, `RunConfig`, `RunCaps`
- `Agenome`
- `CandidateIdea`, subtype payloads, `EvidenceRef`
- `CriticReview`
- `CheckResult`
- `NoveltyScore`
- `FitnessScore`, `ScoringPolicy`
- `EnergyEvent`
- `ReproductionEvent`, `CullingEvent`
- `ModelGatewayRequest`, `ModelGatewayResponse`, `ProviderCapability`
- `LineageGraphProjection`
- secret-redaction scrub contract
- boot config-validation contract

## Deferred-Open Values

Numeric scoring weights may evolve by policy version. The structure of `ScoringPolicy`, `FitnessScore`, events, and score components must still be frozen.

## Required Contract Tests

- Field-name-set schema snapshots for every §2.5 seam model.
- Closed enum rejection tests for event types, actors, candidate subtypes, lifecycle statuses, critic mandates, and check statuses.
- Producer/consumer fixtures for `candidate.created`, `critic.reviewed`, `check.completed`, `novelty.scored`, `fitness.scored`, `energy.spent`, lineage, failure, and terminal events.
- Redaction idempotency and secret-pattern tests.
- Config validation fail-fast tests.
- ModelGateway structured-output validation fixtures for accepted, repaired, and rejected outputs.

## Handoffs

- Kernel consumes all run, event, agenome, energy, reproduction, and gateway contracts.
- Verifier consumes candidate/evidence/gateway contracts and produces `CriticReview` and `CheckResult`.
- Selection consumes candidate, review, check, novelty, energy, and judge contracts and produces `FitnessScore`, culling, and parent-selection decisions.
- Demo consumes all events and projections but produces no authoritative domain model.

## Exit Gate

Parallel implementation may start only when:

- All seam schemas exist in `packages/contracts`.
- All seam exports are available from the package index.
- Snapshot and closed-enum tests pass.
- The fake/recorded ModelGateway stub can return schema-valid responses for candidate generation, critic review, held-out judging, and embeddings.
- The team has signed off that any mid-build schema change becomes a cross-track finding requiring coordinated edits.

