# Doppl Architecture Draft

> **Status:** Rough-draft architecture spec for adversarial finalization. Build posture: MVP/prototype.
>
> **Audience:** Doppl engineering team first; capstone reviewers and future Claude Code sessions second.
>
> **Primary implementation constraint:** Two-week Gauntlet capstone with 3-4 engineers and a June 29, 2026 showcase target.
>
> **Companion docs:** `PRODUCT_BRIEF.md`, `USERS.md`, `STAKEHOLDERS.md`, `USER_FLOWS.md`, `DOMAIN_MODEL.md`, `DATA_MODEL.md`, `THREAT_MODEL.md`, `REQUIREMENTS.md`, `CONSTRAINTS.md`, `EVALUATION_CRITERIA.md`, `ASSUMPTIONS.md`, `OPEN_QUESTIONS.md`, `RESEARCH.md`, `DECISIONS.md`, `RISKS.md`, `DIAGRAM_PLAN.md`, `CLAUDE_CODE_HANDOFF.md`.
>
> **Build contract:** This is a first-draft source of truth. Claude Code should read all planning artifacts, run a second-pass gap audit, produce the finalized root `ARCHITECTURE.md`, and only then generate `IMPLEMENTATION_PLAN.md`. Do not implement directly from this rough draft without finalization.

## §1 Executive Summary

Doppl is an experimental agental-evolution system. A human seeds a run, Doppl creates a bounded population of agent genomes ("agenomes"), those agenomes generate candidate ideas, adversarial critics and subtype-specific checks evaluate the ideas, and high-fitness lineages survive, fuse, mutate, and produce later generations. The MVP proof is that later generations produce stronger, more verifiable ideas than earlier generations, with lineage, energy, critic evidence, subtype checks, and fitness changes visible in the dashboard.

The architecture uses a custom TypeScript Doppl kernel, Postgres append-only event log, provider-agnostic model gateway with OpenRouter primary, Langfuse Cloud trace correlation, simple embedding/semantic novelty scoring, REST + SSE APIs, and a React Flow lineage dashboard. Neo4j is deferred from the runtime but must be spiked early as a derived lineage-analysis read model.

## §1A Goals And Non-Goals

### Goals

- Run bounded agental-evolution loops over both supported candidate idea types: `cross_domain_transfer` and `zeitgeist_synthesis`.
- Preserve every important lifecycle decision in an append-only event log.
- Make the organism inspectable: population tree, energy, critic gauntlet, subtype checks, novelty/fitness, culling, fusion, mutation, replay.
- Support both live execution and replay mode.
- Keep model access provider-agnostic with OpenRouter as the primary path.
- Support local-first demo reliability plus hosted deployment.

### Non-Goals

- Production SaaS user accounts, workspaces, admin roles, and long-term operations.
- Open-ended multi-hour autonomous evolution as a must-ship requirement.
- Self-evolving verifier council in MVP.
- In-house fine-tuning flywheel or weight-level model fusion in MVP.
- Neo4j as an authoritative runtime database.
- LangGraph as the authoritative runtime.
- WebSocket-first bidirectional control.
- SQLite.

## §2 Product Definition And Scope

The canonical unit of work is a `CandidateIdea`.

```ts
type CandidateIdeaSubtype = "cross_domain_transfer" | "zeitgeist_synthesis";
```

Both idea types share the same lifecycle:

1. Seed run.
2. Spawn bounded agenome population.
3. Generate candidate ideas.
4. Normalize structured candidate outputs.
5. Run critic council.
6. Run subtype-specific checks where feasible.
7. Compute novelty and fitness.
8. Cull weak lineages.
9. Fuse and mutate strong parents.
10. Repeat until cap or stop condition.
11. Present final surviving idea with replayable evidence.

`cross_domain_transfer` checks emphasize source-domain validity, target-problem fit, mapping quality, prior art, and executable/toy checks where feasible. `zeitgeist_synthesis` checks emphasize current-signal grounding, novelty, timing, coherence, falsifiability, and held-out judgment where feasible.

## §3 Locked Architecture Decisions

| Area | Decision |
|---|---|
| Runtime | Custom TypeScript Doppl kernel |
| Source of truth | Postgres append-only run event log |
| SQLite | Forbidden |
| Model access | Provider-agnostic model gateway and registry |
| Primary model route | OpenRouter |
| Direct fallback | OpenAI adapter/fallback; Anthropic/Claude can be added through same seam |
| Codex subscription access | Research-required; not assumed as runtime provider |
| Observability | Langfuse Cloud plus local event trace metadata |
| Novelty | Simple embedding/semantic-distance score in MVP |
| Graph DB | Neo4j deferred; early spike required |
| Frontend graph | React Flow |
| API | REST commands/queries plus SSE live run-event stream |
| Deployment | Local-first plus hosted |
| Runtime budgets | Configurable defaults; exact values after provider spike |

## §4 System Overview

```text
Operator / Reviewer Browser
  -> Frontend Dashboard (React + React Flow)
  -> Backend API (REST + SSE)
  -> Doppl Runtime Kernel
      -> Postgres Event Store
      -> ModelGateway
          -> OpenRouter primary
          -> Direct provider adapters/fallbacks
      -> Verifier Council
      -> Check Runners
      -> Selection / Scoring / Reproduction
      -> Projection Builders
  -> Langfuse Cloud (trace side channel)
  -> Neo4j Spike (derived lineage export only)
```

The runtime emits authoritative events to Postgres. Dashboard projections and SSE streams are derived from those events. Langfuse Cloud is used for LLM trace/cost/prompt/eval observability, but never for replay truth. Neo4j, if used, consumes lineage projection data and never replaces the event log.

## §4A Subsystem Dependency DAG And Parallelization Seams

```text
shared-contracts
  -> persistence/event-store
  -> model-gateway
  -> runtime-kernel
  -> verifier-council
  -> selection-scoring
  -> reproduction-fusion
  -> projection-builders
  -> backend-api
  -> frontend-dashboard

shared-contracts
  -> observability-adapter
  -> model-gateway

persistence/event-store
  -> projection-builders
  -> frontend-dashboard

persistence/event-store
  -> neo4j-spike
```

### Import Rules

- Domain/runtime modules may import shared contracts and infrastructure ports.
- Domain/runtime modules must not import concrete provider SDKs, frontend code, or dashboard projections.
- Provider adapters may import provider SDKs; runtime code sees only `ModelGateway`.
- Dashboard code reads API/projection outputs and never mutates authoritative state directly.
- Projection builders consume event log records and emit derived read models.
- Neo4j spike consumes exported lineage data and must remain derived.

### Parallel Tracks

- Contracts: event envelope, domain schemas, provider gateway, scoring policy, lineage projection.
- Persistence: Postgres events, migrations, replay reader.
- Model gateway: OpenRouter primary adapter, fallback adapter seam, validation metadata.
- Runtime kernel: run lifecycle, caps, generation loop, energy ledger.
- Verifier/checks: critic council and subtype evidence adapters.
- Selection/scoring: novelty, fitness, culling, parent selection.
- Dashboard: React Flow lineage, charts, replay, evidence panels.
- Observability: Langfuse Cloud correlation and local trace fallback.
- Neo4j spike: sample lineage export and graph queries.

## §5 Domain Model

Core entities:

- `Run`: bounded execution from seed/problem set to terminal state.
- `Generation`: one iteration over a population.
- `Agenome`: serialized agent genome with prompt, persona/value weights, tool permissions, decomposition policy, spawn budget, parentage, mutation metadata.
- `CandidateIdea`: generated idea under shared lifecycle and one subtype.
- `CriticReview`: structured adversarial review.
- `CheckResult`: subtype-specific validation evidence or skipped-check record.
- `NoveltyScore`: simple semantic distance / novelty component.
- `FitnessScore`: policy-versioned score components and total.
- `EnergyEvent`: metered compute/tool/spawn spend.
- `ReproductionEvent`: fusion/crossover/output synthesis/mutation.
- `LineageGraphProjection`: nodes/edges for dashboard and graph analysis.

Key invariants:

- Energy spend cannot exceed assigned caps.
- Recursive spawning cannot exceed depth/population caps.
- Critics/checks emit evidence only; they do not select winners.
- A selected final idea must have lineage, critic evidence, subtype-check evidence, score explanation, and energy history.
- Replay uses persisted events, not fresh model calls.

## §6 Core Module / Service / Contract Architecture

### `contracts`

Owns TypeScript/Zod or JSON Schema definitions for:

- `RunEventEnvelope`
- `RunConfig`
- `Agenome`
- `CandidateIdea`
- `CriticReview`
- `CheckResult`
- `FitnessScore`
- `ModelGatewayRequest/Response`
- `ProviderCapability`
- `LineageGraphProjection`
- `ScoringPolicy`

### `event-store`

Owns Postgres append-only writes, event sequence assignment, replay reads, and projection rebuild inputs.

Rules:

- No historical event mutation.
- All writes schema-validated.
- Transactions wrap state-changing command acceptance and event append where necessary.

### `model-gateway`

Owns provider-agnostic calls for generation, critique, checks, embeddings, and final judge/synthesis.

Responsibilities:

- Route by model role through registry.
- Call OpenRouter primary route.
- Support direct fallback adapters.
- Validate structured outputs.
- Emit provider metadata and Langfuse trace IDs.
- Return accepted or rejected structured result.

### `runtime-kernel`

Owns run state machine, generation loop, cap enforcement, energy ledger, scheduling, and terminal state.

The runtime is the only subsystem allowed to emit authoritative lifecycle decisions such as generation start/completion, culling, reproduction, and run terminal events.

### `verifier-council`

Owns critic mandates and structured review generation. MVP critic mandates:

- factual grounding
- novelty/prior art
- feasibility
- falsification
- subtype-specific critique

### `check-runners`

Own subtype-specific objective/check adapters. Unsafe arbitrary code execution is out of MVP scope unless sandboxed. Checks may return `skipped` with reason.

### `selection-scoring`

Owns scoring policy, novelty score, energy efficiency, culling, parent selection, and final winner explanation.

### `reproduction-fusion`

Owns agenome-level crossover, output-level synthesis, mutation metadata, and child agenome validation.

### `projection-builders`

Own derived current state, dashboard projections, lineage graph projections, and replay summaries.

## §7 Data And State Model

Postgres is authoritative. `run_events` is append-only.

Event envelope:

```ts
type RunEventEnvelope = {
  id: string;
  runId: string;
  generationId?: string;
  agenomeId?: string;
  candidateId?: string;
  type: RunEventType;
  sequence: number;
  occurredAt: string;
  actor: string;
  correlationId?: string;
  langfuseTraceId?: string;
  langfuseObservationId?: string;
  payload: Record<string, unknown>;
  schemaVersion: number;
};
```

Required projections:

- `runs`
- `generations`
- `agenomes`
- `candidate_ideas`
- `critic_reviews`
- `check_results`
- `fitness_scores`
- `embeddings` if pgvector is used
- `lineage_edges`

Run states:

```text
configured -> running -> completing -> completed
configured -> running -> stopping -> stopped
configured -> running -> failed
configured -> cancelled
```

Generation states:

```text
pending -> running -> verifying -> scoring -> reproducing -> completed
pending -> running -> failed
pending -> skipped
```

Candidate states:

```text
created -> under_review -> checked -> scored -> selected
created -> under_review -> rejected
created -> invalid
scored -> culled
```

## §8 User Flows

Primary flows:

1. Configure and start a run.
2. Execute generation lifecycle.
3. Verify candidate ideas.
4. Score, cull, fuse, and mutate.
5. Observe live run.
6. Replay a run.
7. Stop or complete a run.

REST commands handle start/stop/config/read. SSE streams authoritative run events to the dashboard.

Replay must be clearly labeled as replay and must preserve original event order/timestamps.

## §9 Integration Architecture

### Model Registry

```ts
type ModelRole =
  | "population_generator"
  | "critic"
  | "subtype_check"
  | "embedding"
  | "final_judge"
  | "fusion_synthesis";

type ModelRoute = {
  role: ModelRole;
  provider: "openrouter" | "openai" | "anthropic" | "mock";
  modelId: string;
  capabilities: {
    structuredOutputs: boolean;
    toolCalling: boolean;
    embeddings: boolean;
    streaming: boolean;
  };
  fallbackRouteIds: string[];
};
```

OpenRouter is primary. Exact routes remain open until provider spike. Direct OpenAI remains a fallback/specialized adapter, especially for embeddings if OpenRouter route support is insufficient. Anthropic/Claude can be added through the same interface. Codex subscription/product access is research-required and not assumed as a runtime provider.

### Observability

Langfuse Cloud traces LLM calls. Doppl stores trace IDs and model metadata on LLM-related events. If Langfuse Cloud is unavailable, the event log still stores local trace metadata sufficient for demo/debug.

### Embeddings

Novelty scoring should use embeddings plus cosine/nearest-neighbor comparison. pgvector is preferred if setup is quick; app-level cosine is acceptable for MVP scale.

## §10 Automation / Background Jobs

MVP can begin with in-process workers if they still preserve clear job boundaries and idempotency. A queue can be added if needed.

Background execution responsibilities:

- generation execution
- critic fan-out
- subtype check execution
- scoring and reproduction
- projection rebuild
- SSE event delivery

Every job must be idempotent or guarded by state/event sequence checks.

## §11 Frontend Architecture

Frontend should be a React/TypeScript dashboard with:

- operator run configuration panel
- live/replay mode indicator
- React Flow lineage graph
- generation/fitness-over-time charts
- energy per agenome visualization
- candidate idea inspector
- critic gauntlet panel
- subtype check evidence panel
- final surviving idea panel
- run stop control

The dashboard consumes REST projections and SSE events. It never mutates authoritative runtime state directly.

React Flow is locked for MVP lineage graph. Use custom node types for agenomes, candidates, critics/checks, and selected winners. Use a layout helper if needed.

## §12 Backend / API / Indexer Strategy

Recommended endpoints:

```text
POST   /runs
GET    /runs
GET    /runs/:runId
POST   /runs/:runId/stop
GET    /runs/:runId/events
GET    /runs/:runId/stream
GET    /runs/:runId/lineage
GET    /runs/:runId/candidates/:candidateId
GET    /runs/:runId/replay
GET    /model-routes
```

`/runs/:runId/stream` uses SSE. SSE delivery is not authoritative. Clients can recover from disconnect by asking for events after the last seen sequence.

Projection/indexer strategy:

- Build current run projection from events.
- Build lineage graph projection from events.
- Build replay summaries from events.
- Optionally export lineage graph to Neo4j during spike.

## §13 Shared Package / Config Strategy

Recommended repo shape:

```text
apps/
  api/
  web/
packages/
  contracts/
  runtime/
  model-gateway/
  scoring/
  persistence/
  observability/
  test-fixtures/
```

For a smaller team, this can be one workspace/monorepo with package boundaries enforced by imports rather than separate publishable packages.

Config files:

- model registry
- scoring policy
- runtime caps
- provider credentials via environment only
- demo problem sets

## §14 Testing Strategy

Must-have tests:

- domain state machine transitions
- event append/replay reconstruction
- cap enforcement for population/generation/energy/depth/tool/time
- model gateway structured-output validation
- invalid output repair/reject path
- critic/check schema validation
- scoring policy component calculation
- novelty scoring small fixture
- lineage projection rebuild
- SSE disconnect/reconnect or polling fallback
- Langfuse trace ID correlation smoke
- prepared happy-path run
- failed provider/replay fallback run

Demo rehearsals:

- one successful prepared run
- one provider-failure/replay fallback
- one low-cap live run
- final idea evidence walkthrough

## §15 Security And Risk

Trust boundaries:

- browser/API
- API/runtime
- runtime/model gateway
- model gateway/OpenRouter/providers
- runtime/event store
- event store/projections/UI
- runtime/check runners
- Doppl/Langfuse Cloud
- event export/Neo4j spike

Security rules:

- Treat model outputs as untrusted until validated.
- Keep provider keys server-side only.
- Do not persist secrets in prompts, events, traces, or UI payloads.
- Enforce agenome tool permissions in runtime/model gateway, not prompts.
- Check runners are allowlisted adapters.
- Event log is append-only.
- SSE is read-only event delivery; REST commands are write/control path.

MVP simplification:

- Product auth deferred.
- Add thin deployment-level access control if hosted URL is public.

## §16 Deployment And Demo Strategy

Deployment target is both local and hosted, with local-first reliability.

Local path:

- Postgres running locally or containerized.
- API and web app run locally.
- Replay data seeded.
- Langfuse Cloud optional for traces; demo still works if disabled.

Hosted path:

- Hosted API/web/Postgres if time allows.
- Thin access control if publicly exposed.
- Provider credentials in server environment only.

Demo path:

1. Start with prepared or operator-entered prompt.
2. Show live run events through SSE.
3. Show generation improvement.
4. Inspect lineage specialization.
5. Open critic/check evidence.
6. Present final surviving idea.
7. If live run fails or runs long, switch to clearly labeled replay.

## §17 Alternatives Considered

- LangGraph as core runtime: rejected for source-of-truth fit; optional helper only.
- Direct OpenAI primary: changed to OpenRouter primary because model switching is a core requirement.
- LangSmith primary: deferred unless LangChain/LangGraph dominates.
- Self-hosted Langfuse: deferred due operational surface.
- Neo4j runtime/source of truth: rejected for MVP; spike as derived read model.
- SQLite: rejected explicitly.
- WebSocket-first: deferred; REST + SSE locked.
- Advanced DPP/MAP-Elites: deferred.

## §18 Scope Boundaries And Deferred Work

Deferred:

- open-ended multi-hour evolution
- learned bandit/RL allocation
- self-evolving verifier council
- in-house fine-tuning flywheel
- weight-level model fusion
- DPP/MAP-Elites quality-diversity
- production-grade accounts/workspaces/admin/rollback/long-term ops
- WebSocket-first control
- Neo4j runtime dependency
- LangSmith primary observability

Required early spikes:

- OpenRouter structured-output route through `ModelGateway`
- provider fallback capability matrix
- novelty scoring with embeddings and pgvector/app-level comparison
- Neo4j lineage-analysis projection
- Langfuse Cloud trace correlation

## §19 Diagrams

Required diagrams are planned in `DIAGRAM_PLAN.md`:

- system context
- runtime lifecycle
- event/replay model
- provider gateway
- lineage graph/projection
- trust boundaries

## §20 Repo Scaffold

Proposed initial scaffold:

```text
apps/api/src/
  routes/
  runtime/
  workers/
  projections/
apps/web/src/
  routes/
  components/lineage/
  components/run/
packages/contracts/src/
packages/model-gateway/src/
packages/persistence/src/
packages/scoring/src/
packages/observability/src/
packages/test-fixtures/src/
docs/planning/
```

Keep scaffolding pragmatic. If the team moves faster with fewer packages, preserve boundaries through folders and import rules.

## §21 Decision Summary Table

See `DECISIONS.md` Phase 12. The critical decisions are: custom TypeScript kernel, Postgres event log, OpenRouter primary through provider-agnostic gateway, Langfuse Cloud, React Flow, REST + SSE, local-first plus hosted, Neo4j spike/deferred runtime, simple novelty scoring, no SQLite.

## §22 Spec Anchor Index

| Anchor | Topic |
|---|---|
| §1 | Executive Summary |
| §1A | Goals And Non-Goals |
| §2 | Product Definition And Scope |
| §3 | Locked Architecture Decisions |
| §4 | System Overview |
| §4A | Subsystem Dependency DAG |
| §5 | Domain Model |
| §6 | Core Modules |
| §7 | Data And State |
| §8 | User Flows |
| §9 | Integrations |
| §10 | Background Jobs |
| §11 | Frontend |
| §12 | Backend/API |
| §13 | Shared Config |
| §14 | Testing |
| §15 | Security/Risk |
| §16 | Deployment/Demo |
| §17 | Alternatives |
| §18 | Deferred Work |
| §19 | Diagrams |
| §20 | Repo Scaffold |
| §21 | Decision Summary |
| §22 | Anchor Index |
| §23 | Claude Code Review Instructions |

## §23 Claude Code Review Instructions

Claude Code must not implement from this draft directly. It should:

1. Read every file under `docs/planning/` plus `Doppl_Capstone_Proposal.pdf`.
2. Run a second-pass gap audit across requirements, flows, domain model, state machines, failure modes, provider assumptions, trust boundaries, event schemas, replay, tests, deployment, and diagrams.
3. Confirm any load-bearing changes with the human.
4. Produce finalized root `ARCHITECTURE.md`.
5. Only after final architecture is approved, generate `IMPLEMENTATION_PLAN.md`.

