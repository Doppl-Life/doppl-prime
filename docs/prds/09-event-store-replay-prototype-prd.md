# PRD 09: Event Store / Replay Truth Prototype

## Prototype Question

Can Doppl prove that the append-only event log is the truth and replay can rebuild the same state without fresh model calls, embeddings, web retrieval, or RNG sampling?

## Audience Moment

Within 10 seconds, a viewer should understand that live mode and replay mode use the same events. Replay is not a simulation; it is a deterministic read of stored truth.

## User Workflow

- Inspect a run's ordered event stream.
- Toggle between live fold and replay fold.
- See per-run sequence numbers and event types.
- Verify projection state equivalence.
- Inspect failure/degraded events instead of losing them.

## Required Data / Events

- `RunEventEnvelope`
- closed `RunEventType`
- per-run `sequence`
- `schemaVersion`
- replay reader
- projection snapshot / canonical serialization
- persisted RNG seeds/outcomes, embeddings, retrieval results

## Acceptable Fixture

Use a committed replay fixture under `fixtures/replay/<runId>.json` with ordered events and pinned `schemaVersion`.

## Convincing Demo Bar

- Event order is visibly sequence-based.
- Replay never appears to call models or tools.
- Projection equivalence is explicit.
- Failure events remain visible.
- Schema-version mismatch has a clear re-record instruction.

## Falsification Bar

This prototype fails if replay is just a saved screen recording, if event order depends on timestamps, or if replay silently omits failed/rejected/degraded events.

## Graduation Path

Wire to the production event store, replay reader, and projection builders. This prototype should become the trust/debug surface for all demo and production runs.

