# Doppl Prime PRDs

This folder turns `ARCHITECTURE.md` and `IMPLEMENTATION_PLAN.md` into modular product requirements documents for a 3-4 engineer build. The PRDs are intentionally arranged around the architecture's ownership surfaces and the implementation plan's phase gates, not around every subsystem box.

## Adversarial Audit Of The PRD Split

The earlier "major parts" split was directionally right, but too loose for parallel execution. Against `ARCHITECTURE.md §2.5` and `IMPLEMENTATION_PLAN.md`, the robust setup needs these corrections:

- **Phase 0 is a forced serial gate, not just one module.** All parallel work waits on frozen Zod contracts, closed enums, contract tests, and the ModelGateway stub.
- **Verifier and selection must stay separate.** The verifier council emits evidence only; selection/scoring decides fitness and parents. Combining them would blur a load-bearing architecture boundary.
- **Demo reliability is a first-class acceptance surface.** Phase D is optional only in the sense that it must not add contract surface; it is not optional for a June 29 showcase.
- **Model gateway is a shared seam, not a standalone ownership surface.** It belongs with kernel/runtime integration unless the team explicitly assigns a separate implementer.
- **Event log authority must appear in every PRD.** Any PRD that creates authoritative state outside `run_events` is wrong.
- **The prototype page is inspiration, not source of truth.** Use prototypes to shape demo moments, but requirements come from `ARCHITECTURE.md`, Appendix A, and `IMPLEMENTATION_PLAN.md`.

## PRD Set

| PRD | Owner Surface | Implementation Phases | Purpose |
|---|---|---|---|
| `00-system-mvp-prd.md` | Whole team | All | Shared product promise, non-goals, final acceptance |
| `01-contract-freeze-prd.md` | Contract lead, whole-team review | P0 | Freeze Appendix-A contracts before parallel work starts |
| `02-kernel-runtime-prd.md` | Kernel / runtime | P1, P2, P3 | Event store, ModelGateway integration, runtime loop, caps, energy |
| `03-verifier-council-prd.md` | Verifier council | P4 | Critics, checks, retrieval grounding, held-out judge |
| `04-selection-reproduction-prd.md` | Selection / ML | P5 | Novelty, fitness, culling, parent choice, fusion/mutation |
| `05-demo-observability-prd.md` | Demo / observability | P6, P7, PD | Projections, API/SSE, dashboard, replay fallback, runbook |

## Working Agreement

1. Approve `00` and `01` together before implementation forks.
2. Every PRD must name the contracts it consumes and produces.
3. A cross-track handoff is accepted only when both producer and consumer can point to the same schema, event type, fixture, or endpoint.
4. Replay is always from stored events only. No PRD may require fresh model calls, embeddings, web search, or RNG sampling during replay.
5. Hosted deploy is a stretch seam. The demo of record is local-first with a prepared replay fallback.

## Red Flags During Review

- A PRD defines a new Appendix-A model instead of consuming `packages/contracts`.
- A PRD lets critic output select winners directly.
- A PRD orders events by `occurredAt` instead of per-run `sequence`.
- A PRD treats Langfuse, Neo4j, SSE, or frontend state as authoritative.
- A PRD adds demo-only event types or bypasses the normal run state machine.
- A PRD has no failure path for provider failure, schema rejection, no survivors, or replay fallback.

