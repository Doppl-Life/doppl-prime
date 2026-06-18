# Doppl Diagram Plan

Source PRD: `Doppl_Capstone_Proposal.pdf`

> **Anchors track `ARCHITECTURE.md`, not the draft.** The "Spec anchors" below were remapped from `ARCHITECTURE_DRAFT.md` section numbers to the finalized `ARCHITECTURE.md` `§` anchors (incl. draft §4A → §2.5) per `docs/gap-audits/anchor-remap.md`. The 7 P0 diagrams are embedded as Mermaid in `ARCHITECTURE.md`; P1/P2 remain planned here.

## Full-Scope Architecture Diagram

Purpose:

Show Doppl as a complete agent-evolution system: operator and reviewers observe a live/replayable run, the backend controls a custom evolution kernel, Postgres records authoritative events, model providers are accessed through a gateway, Langfuse provides trace observability, and graph analysis remains derived.

Must show:

- Operator/reviewer browser
- React dashboard with React Flow lineage graph
- REST commands and queries
- SSE run-event stream
- Backend API
- Custom TypeScript Doppl runtime kernel
- Verifier council, check runners, scoring, selection, and reproduction modules
- Postgres append-only `run_events` as source of truth
- Derived projections for dashboard, replay, and lineage
- ModelGateway with OpenRouter primary and direct provider fallback seam
- Langfuse Cloud trace side channel with local trace IDs
- Neo4j spike/export as derived lineage-analysis read model
- Local-first and hosted deployment paths

Spec anchors:

- `ARCHITECTURE.md` §2, §2.5, §4, §5, §6, §9, §11, §12, §14, §17, §19
- `DATA_MODEL.md`
- `DECISIONS.md`
- `RISKS.md`

Priority:

P0.

Recommended format:

Mermaid flowchart in the finalized `ARCHITECTURE.md`, with a polished version optional for the demo deck.

## Sub-Diagrams

### 1. Run Lifecycle Sequence

Purpose:

Clarify how a seed becomes generations of agenomes, candidate ideas, critic evidence, checks, scores, culls, fusions, mutations, and final replayable output.

Must show:

- `run.configured`
- `run.started`
- `generation.started`
- `agenome.spawned`
- candidate creation
- critic council review
- subtype-specific checks
- novelty scoring
- fitness scoring
- culling
- fusion and mutation
- generation completion
- run completion, failure, or stop
- replay path from events without fresh model calls

Spec anchors:

- `ARCHITECTURE.md` §3, §4, §5, §7, §16
- `USER_FLOWS.md`
- `DOMAIN_MODEL.md`
- `DATA_MODEL.md`

Priority:

P0.

Recommended format:

Mermaid sequence diagram plus a compact lifecycle state diagram if space allows.

### 2. Event Truth And Replay Model

Purpose:

Make the source-of-truth boundary impossible to miss.

Must show:

- Runtime emits authoritative events.
- Postgres `run_events` assigns monotonic per-run sequences.
- Projections are rebuildable.
- Dashboard snapshots, lineage graph, and replay summaries are derived.
- SSE is a delivery channel, not source of truth.
- Langfuse and Neo4j are not authoritative.

Spec anchors:

- `ARCHITECTURE.md` §4, §9, §11, §12, §14
- `DATA_MODEL.md`
- `THREAT_MODEL.md`

Priority:

P0.

Recommended format:

Mermaid flowchart or data-flow diagram.

### 3. Model Gateway And Provider Routing

Purpose:

Show how Doppl stays provider-agnostic while using OpenRouter as the primary provider path.

Must show:

- Runtime role requests: generation, critique, check support, embeddings, final judge, synthesis
- Model registry and provider capability matrix
- OpenRouter primary adapter
- Direct OpenAI fallback adapter
- Anthropic/Claude adapter seam
- structured-output validation
- repair/reject path
- Langfuse trace correlation
- provider metadata persisted into events
- Codex subscription/runtime integration as research-required, not assumed

Spec anchors:

- `ARCHITECTURE.md` §6, §19
- `DECISIONS.md` ADR-004
- `RESEARCH.md`
- `RISKS.md` RISK-004, RISK-005

Priority:

P0.

Recommended format:

Mermaid component diagram or flowchart.

### 4. Lineage Graph Projection And Neo4j Spike

Purpose:

Separate the product lineage view from the deferred graph database path while keeping lineage analysis easy to add.

Must show:

- `LineageGraphProjection` nodes and edges
- React Flow consuming the projection
- Neo4j spike consuming the same logical graph export
- Neo4j query examples: ancestors of winner, parent contribution, critic kill patterns, lineage distance/diversity
- Event log remains authoritative
- Spike exit decision feeds data model finalization

Spec anchors:

- `ARCHITECTURE.md` §9, §10, §18, §19
- `DATA_MODEL.md`
- `DECISIONS.md` ADR-007
- `OPEN_QUESTIONS.md` OQ-009

Priority:

P0.

Recommended format:

Mermaid flowchart plus optional graph sketch for demo narrative.

### 5. Dashboard Data Plane

Purpose:

Anchor the "wow" dashboard in real evidence paths rather than UI ornamentation.

Must show:

- REST run commands and read endpoints
- SSE live run-event stream
- projection rebuild/resync using last sequence
- React Flow lineage graph
- evidence panels for critics, checks, novelty, fitness, energy, and provider traces
- replay timeline
- final idea proof panel
- prepared replay fallback for showcase

Spec anchors:

- `ARCHITECTURE.md` §11, §12, §17
- `USER_FLOWS.md`
- `EVALUATION_CRITERIA.md`
- `RISKS.md` RISK-007, RISK-011

Priority:

P0.

Recommended format:

Mermaid flowchart for data plane, plus optional UI annotation diagram during product/design work.

### 6. Trust Boundaries And Threat Model

Purpose:

Show where untrusted inputs, model outputs, secrets, provider calls, traces, and check runners cross boundaries.

Must show:

- Browser to API
- API to runtime worker
- Runtime to ModelGateway
- ModelGateway to OpenRouter/providers
- Runtime to event store
- Event store to projections/UI
- Runtime to check runners
- Doppl to Langfuse Cloud
- Event export to Neo4j spike
- server-side provider keys
- redaction before persistence/tracing
- allowlisted checks and no arbitrary code execution in MVP

Spec anchors:

- `ARCHITECTURE.md` §14
- `THREAT_MODEL.md`
- `RISKS.md`

Priority:

P0.

Recommended format:

Mermaid flowchart with trust-boundary labels.

### 7. Parallel Build Dependency DAG

Purpose:

Help the engineering team split work without drifting contracts.

Must show:

- shared contracts first
- event store
- model gateway
- runtime kernel
- verifier/checks
- scoring/reproduction
- projection builders
- backend API
- frontend dashboard
- observability adapter
- Neo4j spike
- merge points and import direction rules

Spec anchors:

- `ARCHITECTURE.md` §2.5, §16
- `ARCHITECTURE_OUTLINE.md`

Priority:

P1.

Recommended format:

Mermaid flowchart or dependency graph.

### 8. Deployment And Demo Topology

Purpose:

Keep the showcase path resilient by making local, hosted, provider, observability, and replay fallbacks visible.

Must show:

- local-first stack
- hosted path
- Postgres
- backend worker/API
- web dashboard
- OpenRouter/provider calls
- Langfuse Cloud
- prepared replay fallback
- lower live-demo caps
- optional thin access control if public URL is exposed

Spec anchors:

- `ARCHITECTURE.md` §17
- `CONSTRAINTS.md`
- `RISKS.md` RISK-004, RISK-012, RISK-015
- `THREAT_MODEL.md` T-010

Priority:

P1.

Recommended format:

Mermaid deployment flowchart.

### 9. Scoring, Novelty, And Verifier Pipeline

Purpose:

Show how candidate quality is judged without pretending the MVP has perfect ground truth.

Must show:

- candidate normalized structured output
- critic mandates
- subtype-specific checks
- skipped-check records
- embedding/semantic novelty
- energy efficiency
- policy-versioned component scoring
- final judge/synthesis role
- fixed scoring policy controlled by runtime/config
- agents and critics emit evidence only

Spec anchors:

- `ARCHITECTURE.md` §7, §8, §14, §16
- `DOMAIN_MODEL.md`
- `DATA_MODEL.md`
- `EVALUATION_CRITERIA.md`
- `RISKS.md` RISK-001, RISK-002

Priority:

P1.

Recommended format:

Mermaid flowchart with score component table in prose.

### 10. Repo Scaffold And Package Boundaries

Purpose:

Give implementation tasks a visual map of where contracts, runtime, provider adapters, API, UI, projections, observability, and spikes belong.

Must show:

- `apps/web`
- `apps/api`
- `packages/contracts`
- runtime/domain modules
- provider adapters
- persistence/migrations
- projection builders
- observability adapter
- spike folder for Neo4j
- import direction rules

Spec anchors:

- `ARCHITECTURE.md` §2.5
- `ARCHITECTURE_OUTLINE.md`

Priority:

P2.

Recommended format:

Directory tree plus dependency arrows.
