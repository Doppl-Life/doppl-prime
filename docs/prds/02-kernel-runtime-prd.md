# PRD 02: Kernel Runtime

## Purpose

Build the authoritative runtime spine: append-only event store, ModelGateway integration, run/generation state machine, cap enforcement, energy accounting, and crash-forward behavior.

## Spec Anchors

- `ARCHITECTURE.md §4` event source of truth
- `ARCHITECTURE.md §5` runtime kernel
- `ARCHITECTURE.md §6` ModelGateway
- `ARCHITECTURE.md §9` persistence and projections boundary
- `ARCHITECTURE.md §14-15` safety and operational constraints
- `IMPLEMENTATION_PLAN.md P1`, P2, P3

## Owner Surface

Kernel / runtime.

## Consumes

All Phase 0 contracts, especially `RunEventEnvelope`, `RunEventType`, `RunConfig`, `RunCaps`, `Agenome`, `CandidateIdea`, `EnergyEvent`, reproduction/culling events, and ModelGateway contracts.

## Produces

- Authoritative lifecycle events.
- Event-store append/read/replay primitives.
- ModelGateway port and adapters.
- Runtime worker and run state transitions.
- Energy ledger events.
- Crash-forward terminal events.

## Requirements

- Append events transactionally with per-run monotonic `sequence`.
- Reject writes that fail Zod validation or redaction.
- Provide replay reads ordered only by `(run_id, sequence)`.
- Start one active run at a time for MVP.
- Spawn bounded populations of agenomes from a run seed.
- Enforce `maxPopulation`, `maxGenerations`, `energyBudget`, `maxSpawnDepth`, `maxToolCalls`, and `wallClockTimeoutMs` in code.
- Treat agenome spawn budgets as hints clamped by global caps.
- Route all model, embedding, retrieval, critic, and judge calls through ModelGateway.
- Validate structured model outputs as accept, repair once, or reject with event.
- Persist provider metadata, trace IDs, retrieval results, embeddings, RNG seeds, and concrete mutation/fusion outcomes needed for replay.
- On process restart, mark non-terminal runs failed with a crash reason rather than attempting idempotent resume.

## Failure Paths

- Provider failure emits `provider_call_failed`.
- Schema rejection emits `output_schema_rejected`.
- Candidate invalidation emits `candidate_invalidated`.
- Cap exhaustion emits `energy_exhausted` or terminal failure as appropriate.
- Insufficient parents emits `reproduction_aborted_insufficient_parents`.
- Partial generation failure proceeds if survival threshold is met; total failure reaches terminal state.

## Handoffs

- To verifier: schema-valid candidates, evidence refs, and ModelGateway access.
- To selection: persisted review/check/novelty/energy inputs and current generation state.
- To demo: event stream, replay reader, state/projection inputs, health data.

## Exit Gate

- A fake-gateway run can move through seed, spawn, candidate creation, verification handoff, scoring handoff, reproduction, and terminal state.
- Replay from stored events reconstructs state without model calls.
- Cap and kill-switch tests prove prompt text cannot raise limits.
- Event ordering tests prove `occurredAt` never determines replay order.
- Secrets do not appear in persisted events or trace metadata.

