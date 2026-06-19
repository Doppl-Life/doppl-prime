# PRD 05: Demo And Observability

## Purpose

Make the system visible, rehearsable, and trustworthy: projections, REST/SSE, dashboard, replay fixtures, health signals, trace metadata, and the demo fallback ladder.

## Spec Anchors

- `ARCHITECTURE.md §9` projections and persistence boundary
- `ARCHITECTURE.md §11` API and SSE
- `ARCHITECTURE.md §12` frontend dashboard
- `ARCHITECTURE.md §13` observability
- `ARCHITECTURE.md §16-17` tests and demo path
- `IMPLEMENTATION_PLAN.md P6`, P7, PD

## Owner Surface

Demo / observability.

## Consumes

All frozen contracts, event-store readers, projection outputs, REST/SSE endpoints, trace metadata, run health, and replay fixtures.

## Produces

- Derived projections and current-state read models.
- REST commands and query endpoints.
- SSE event stream with sequence-keyed resume.
- React dashboard and proof panels.
- Local trace metadata fallback.
- Prepared replay capture/seed pipeline.
- Demo runbook and rehearsal scripts.

## Requirements

- Build projections only from `run_events`; never mutate historical events.
- Expose create run, stop run, get run state, get events, stream events, get lineage, replay run, health/progress, and inspect candidate.
- Treat SSE as delivery only; resume by last seen per-run sequence.
- Validate all server payloads through shared contracts.
- Dashboard writes only through create-run and stop-run commands.
- Show run config, live/replay mode, lineage tree, fitness charts, energy per agenome, candidate inspector, critic gauntlet, subtype-check evidence, final proof panel, health, diagnostics, and stop control.
- Keep live/replay mode visible and unambiguous.
- Resolve every evidence link inside persisted events/projections.
- Preserve local-first boot: migrate, seed replay fixture, start API/web.
- Provide prepared replay dump and seed scripts with pinned `schemaVersion`.
- Provide manual fallback ladder: low-cap live, prepared known-good run, labeled replay.
- Keep Langfuse non-authoritative and optional.

## Non-Goals

- Hosted deployment as the demo of record.
- Adding demo-only event types.
- Querying models, embeddings, or web during replay.
- Treating frontend state, SSE, Langfuse, or Neo4j as source of truth.

## Handoffs

- From kernel: event stream, health, run state, replay reader.
- From verifier: evidence refs and critic/check payloads.
- From selection: novelty/fitness/culling/reproduction events and final-survivor inputs.
- To operator/audience: visible proof that the organism improved or a truthful terminal explanation when it did not.

## Exit Gate

- Playwright smoke can start a local run or loaded replay, fold events, open final proof, and resolve all evidence links.
- Replay state equals projection-at-run-end over canonical serialization.
- Demo can run locally with Langfuse and hosted providers unavailable.
- Provider failure can be rehearsed into a labeled replay fallback.
- Dashboard never hides failure events, schema rejections, degraded novelty, or no-survivor terminal states.
- The demo introduces no new Appendix-A model or event type.

