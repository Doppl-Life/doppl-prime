# PRD 00: System MVP

## Purpose

Doppl Prime must demonstrate an agent-evolution runtime where a human seeds a run, bounded agenomes produce candidate ideas, critics and checks generate evidence, selection preserves stronger lineages, reproduction fuses and mutates survivors, and the dashboard proves that a later generation outperforms an earlier one against a held-out fixed rubric.

The product promise is not "agents generate ideas." It is "the kernel breeds agents, preserves the evidence trail, and proves improvement through replayable events."

## Spec Anchors

- `ARCHITECTURE.md §1` goals and non-goals
- `ARCHITECTURE.md §2` system context
- `ARCHITECTURE.md §2.5` ownership surfaces and DAG
- `ARCHITECTURE.md §3` lifecycle
- `ARCHITECTURE.md §16-17` demo path and reliability
- `IMPLEMENTATION_PLAN.md` all phase acceptance criteria

## Users

- **Operator:** starts/stops runs, selects prepared or live prompts, chooses fallback rung during demo.
- **Audience:** watches lineage, evidence, energy, and improvement unfold.
- **Engineer:** implements one ownership surface without redefining shared contracts.

## MVP Outcomes

- Start a bounded run from a case-study problem or operator-entered prompt.
- Emit every lifecycle, evidence, score, reproduction, and terminal decision to the append-only event log.
- Show live and replay modes from the same event/projection semantics.
- Produce a final surviving idea with traceable lineage, critic evidence, check evidence, novelty/fitness score, energy spend, and held-out judge result.
- Demonstrate that later generations improve over earlier ones using the fixed held-out rubric.
- Fall back to a prepared replay without misleading the audience about live vs replay mode.

## Non-Goals

- Production SaaS multi-tenant hardening.
- Hosted-first deployment.
- Arbitrary code execution by check runners.
- Neo4j as runtime dependency.
- SQLite.
- Full idempotent crash resume. MVP uses crash-forward and replay fallback.
- Agents changing the held-out judge rubric, hard caps, or event schema.

## Hard Invariants

- Postgres `run_events` is the source of truth.
- Replay reads stored events only.
- `sequence` is the only ordering key for replay and SSE resume.
- Caps are enforced in code by the kernel, never by prompt text.
- Verifier council emits structured evidence only; it does not pick winners.
- The held-out judge and fixed rubric sit outside the breeding loop.
- Secrets are scrubbed before persistence and trace emission.
- No PRD may add authoritative state outside the event log.

## Prototype Mapping

The five prototypes can guide audience-facing proof moments:

- Energy/metabolism maps to caps, budgets, and productive energy spend.
- Critic council maps to structured reviews, checks, and held-out judge evidence.
- Selection views map to novelty/fitness and generation comparison.
- Fusion lab maps to parent selection, crossover, mutation, and lineage.
- Trace/replay views map to event-sourced replay and final proof links.

They are not architectural sources of truth.

## Final Acceptance

- A local-first demo boots through migrate, seed replay fixture, and start commands.
- A live or prepared run reaches a terminal state with at least one best-so-far final idea or a correctly surfaced no-survivor terminal explanation.
- Dashboard panels show run config, live/replay mode, lineage, fitness over time, energy per agenome, candidate inspector, critic gauntlet, subtype checks, final proof panel, run health, and stop control.
- Prepared replay can reconstruct the same projection state from stored events without model/web/embedding calls.
- The whole team can trace every PRD requirement back to `ARCHITECTURE.md` anchors and implementation phase tasks.

