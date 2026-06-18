# Doppl Architecture Outline

Source PRD: `Doppl_Capstone_Proposal.pdf`

## Phase 13 - Section-By-Section Architecture Planning

### Architecture Posture

[locked decision] Expanded planning mode, MVP/prototype build posture.

[locked decision] Engineering team is the primary audience. Demo wow factor, narrative clarity, and observability are first-class requirements.

### Planned Architecture Sections

| Section | Purpose | Responsibilities | Key Contracts | Failure Modes / Tests |
|---|---|---|---|---|
| §1 Executive Summary | Explain Doppl in build-ready terms | State product, posture, timebox, proof target | Build posture, acceptance proof | Reviewer misunderstands organism claim; test through demo script review |
| §1A Goals & Non-Goals | Bound the MVP | Must-ship vs stretch/deferred | Scope table | Scope creep; audit against requirements |
| §2 Product Definition and Scope | Translate PRD into implementation scope | Candidate idea prey types, shared lifecycle, demo goals | CandidateIdea subtype contract | Both prey types drift into separate products; coverage table |
| §3 Locked Decisions | Make baseline explicit | Summarize ADRs | Decision summary | Hidden assumptions; ADR audit |
| §4 System Overview | Show runtime shape | Custom kernel, model gateway, Postgres event log, projections, dashboard, Langfuse | System context diagram | Framework/vendor coupling; architecture review |
| §4A Subsystem Dependency DAG | Define parallel build seams | Import direction, independent tracks, merge points | Shared schemas/interfaces | Parallel teams block each other; contract-first tests |
| §5 Domain Model | Define nouns/states/invariants | Run, Generation, Agenome, CandidateIdea, CriticReview, CheckResult, FitnessScore, events | Domain schemas, state machines | Invalid transitions; state-machine tests |
| §6 Core Module / Service / Contract Architecture | Define backend modules | Runtime kernel, energy ledger, generation executor, verifier, selection, reproduction, event store | Module interfaces | Module leakage; unit/contract tests |
| §7 Data and State Model | Define persistence/replay | Append-only events, projections, graph read model, pgvector/novelty | Event schemas, projection schemas | Replay drift; projection rebuild tests |
| §8 User Flows | Define operator/reviewer UX flows | Configure/start, observe, replay, stop | API and UI flow contracts | Demo ambiguity; E2E smoke |
| §9 Integration Architecture | Define model/provider/tool integrations | ModelGateway, OpenRouter primary, direct fallback adapters, Langfuse, embeddings | Provider capability matrix | Provider failure/schema mismatch; adapter tests |
| §10 Automation / Background Jobs | Define async execution | Run worker, generation jobs, critic/check jobs, projection builder | Job contracts, idempotency keys | Duplicate/missing events; worker tests |
| §11 Frontend Architecture | Define dashboard | React app, React Flow lineage, run controls, charts, evidence panels, replay mode | LineageGraphProjection API | Dashboard ornamental/stale; Playwright smoke |
| §12 Backend / API Strategy | Define API boundary | REST/stream endpoints, run commands, read models, replay endpoints | API DTOs | API/UI drift; API contract tests |
| §13 Shared Package / Config Strategy | Define cross-cutting types/config | Shared schemas, model registry, scoring policy, env config | Zod/JSON schemas, config files | Contract drift; schema validation tests |
| §14 Testing Strategy | Define verification plan | Unit, contract, integration, replay, fixture, demo rehearsals | Test matrix | False confidence; CI/smoke gates |
| §15 Security and Risk | Define trust boundaries | Prompt/tool boundaries, secrets, model outputs, check runner, event log | Validation rules, secret rules | Prompt injection/tool abuse; negative tests |
| §16 Deployment and Demo Strategy | Define local/hosted/demo paths | Local-first Postgres, hosted path, replay fallback, Langfuse Cloud | Docker/env/deploy contracts | Showcase failure; rehearsal checklist |
| §17 Alternatives Considered | Preserve tradeoffs | LangGraph core, direct OpenAI primary, Neo4j runtime, LangSmith, SQLite | ADR references | Re-litigation; decision trace |
| §18 Scope Boundaries and Deferred Work | Keep cuts visible | Moonshot and production-hardening deferrals | Deferred table | Silent scope loss; finalize audit |
| §19 Diagrams | Plan visual artifacts | Context, runtime flow, event/replay, lineage, provider gateway | Diagram plan | Missing diagram evidence; diagram review |
| §20 Repo Scaffold | Propose repo shape | Apps/packages/modules | Directory contract | Scattered implementation; scaffold review |
| §21 Decision Summary Table | Quick reviewer reference | Locked decisions | ADR links | Missing baseline; audit |
| §22 Spec Anchor Index | Downstream task anchors | Stable section anchors | Anchor index | Tasks cannot bind to spec; anchor check |
| §23 Claude Code Review Instructions | Handoff inside draft | Gap audit instructions | Handoff link | Premature implementation; handoff check |

### Subsystem Dependency DAG

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

model-gateway
  -> verifier-council
  -> selection-scoring

model-gateway
  -> runtime-kernel
```

### Import Direction Rules

[locked decision] Domain/runtime modules may import shared contracts and infrastructure ports, but not concrete provider SDKs, frontend code, or dashboard projections.

[locked decision] Provider adapters may import provider SDKs, but domain/runtime code only sees `ModelGateway` and capability metadata.

[locked decision] Dashboard code reads backend APIs/projections and never writes authoritative runtime state directly.

[locked decision] Projection builders consume event log records and emit derived read models; they do not mutate historical events.

[locked decision] Neo4j spike consumes exported/projection lineage data and must not become authoritative.

### Parallel Build Tracks

| Track | Can Start After | Owns | Integrates At |
|---|---|---|---|
| Shared contracts | Immediately | Domain schemas, event schemas, provider interfaces, scoring policy shapes | All tracks |
| Persistence/event store | Shared event schema draft | Postgres events, migrations, replay reader | Runtime + projections |
| Model gateway | Shared provider interfaces | OpenRouter primary adapter, direct fallback seam, structured-output validation | Runtime + verifier |
| Runtime kernel | Shared domain/event contracts | run lifecycle, generation loop, caps, energy ledger | Event store + model gateway |
| Verifier/checks | Candidate/critic/check schemas + model gateway | critic council, subtype checks, evidence records | Scoring |
| Selection/scoring/reproduction | Candidate/check/score schemas | novelty score, fitness policy, cull/select/fuse/mutate | Runtime next generation |
| Dashboard/projections | Event/projection contracts | React Flow graph, charts, replay UI | Backend API/projection builder |
| Langfuse observability | Model gateway event metadata | trace/span correlation, trace fallback fields | Model gateway + event log |
| Neo4j spike | Sample lineage event export | ancestry/diversity/winner-contribution query spike | Data model decision |

### Shared Contracts To Freeze First

[locked decision] `RunEvent` envelope and event type registry.

[locked decision] `Agenome` schema.

[locked decision] `CandidateIdea` schema with subtype payloads.

[locked decision] `CriticReview`, `CheckResult`, and `FitnessScore` schemas.

[locked decision] `ModelGateway` request/response and provider capability metadata.

[locked decision] `LineageGraphProjection` nodes/edges contract.

[locked decision] `ScoringPolicy` shape and policy-version metadata.

### Integration Merge Points

[proposed recommendation] Runtime owner owns final integration of event store, model gateway, verifier, and selection loop.

[proposed recommendation] Demo/observability owner owns integration of projections, dashboard, Langfuse trace links, and replay mode.

[proposed recommendation] Selection/ML owner owns scoring policy and novelty scoring integration.

[proposed recommendation] Verifier owner owns critic/check schemas and evidence quality.

### Open Section-Planning Questions

[locked decision] Backend API should use REST commands/queries plus SSE run-event streaming from the start.

[open question] Which package structure should be assumed: monorepo with `apps/web`, `apps/api`, `packages/contracts`, or a smaller single-app structure?

[open question] Should job execution use an in-process worker first, or a queue library from the beginning?
