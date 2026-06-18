# Doppl Architecture Decisions

Source PRD: `Doppl_Capstone_Proposal.pdf`

## Phase 12 - Locked Decision Summary

| Area | Decision | Status | Rationale | Fallback |
|---|---|---|---|---|
| Planning mode | Expanded planning artifacts | Locked | Doppl has multiple high-risk surfaces that need separate planning detail. | Keep artifacts concise but preserve open questions for `/arch-finalize`. |
| Build posture | MVP/prototype | Locked | Two-week capstone and showcase target; optimize for credible demo and explicit deferrals. | Promote hardening only if needed for demo correctness. |
| Runtime | Custom TypeScript Doppl kernel | Locked | Evolution loop needs custom control over population, energy, lineage, scoring, fusion, mutation, and replay. | Use LangGraph only for bounded non-authoritative subflows if useful. |
| Source of truth | Postgres append-only event log | Locked | Replay, auditability, lineage, and demo evidence depend on durable event history. | Over-persist JSON events early; normalize projections later. |
| SQLite | Forbidden | Locked | User explicitly disallowed SQLite. | None. |
| Model access | Provider-agnostic model gateway + registry | Locked | Doppl must switch models/providers without domain/runtime rewrites. | Ship one provider behind the gateway if time is tight. |
| Primary provider path | OpenRouter | Locked | OpenRouter supports routed multi-provider model access and aligns with model-switching goals. | Fall back to direct provider adapters if OpenRouter capability/rate limits block demo. |
| Direct provider fallback | OpenAI adapter/fallback | Locked | OpenAI has strong structured-output and embedding support. | Add direct Anthropic/Claude adapter through same interface if useful. |
| Codex subscription access | Research-required, not assumed as runtime provider | Locked | Avoids depending on unsupported product-surface assumptions. | Treat Codex as development/operator tool unless supported runtime integration is proven. |
| Observability | Langfuse Cloud with Doppl event correlation | Locked | Provides LLM traces/cost/eval visibility while Postgres remains product truth. | Store minimal local trace metadata if Langfuse Cloud is unavailable. |
| Novelty scoring | Simple embedding/semantic-distance score in MVP | Locked | Gives visible anti-collapse pressure without advanced ML scope. | App-level cosine or temporary heuristic if pgvector slows setup. |
| Advanced quality-diversity | Deferred | Locked | DPP/MAP-Elites/niche maps are too much for first proof. | Revisit after simple loop works. |
| Lineage graph | Storage-agnostic projection first | Locked | Keeps dashboard and analysis decoupled from storage engine. | Promote graph DB as derived read model if spike proves value. |
| Neo4j | Deferred runtime dependency; early spike required | Locked | Lineage analysis matters, but runtime should not carry extra DB before proof. | Add Neo4j read model if spike validates it. |
| Dashboard graph library | React Flow | Locked | Fast React/TypeScript path for custom node/edge lineage UI. | Cytoscape.js or D3 if layout/performance needs outgrow React Flow. |
| Deployment | Local-first plus hosted | Locked | Showcase should not depend on cloud path alone. | Run local demo with replay if hosted deployment fails. |
| Runtime budgets | Configurable defaults; exact values after provider spike | Locked | Avoid inventing cost/latency numbers before model tests. | Conservative lower live-demo override. |

### Remaining Open Verification

[open question] Exact OpenRouter model routes by role: population generation, critic council, embeddings, final judge, synthesis.

[open question] Whether the direct fallback adapter should be OpenAI only or include Anthropic/Claude in the first build.

[open question] Whether Codex subscription/product access has a supported runtime integration path.

[open question] Exact scoring rubric, weights, and objective checks.

[open question] Whether novelty scoring starts with pgvector or app-level cosine.

[open question] Exact Neo4j spike success criteria and sample lineage queries.

[open question] Rule of Cool reuse depth.

[open question] Thin access control for hosted showcase.

[open question] Demo prompt strategy and exact runtime budget defaults.

## Phase 11 - Architecture Decision Discovery

## ADR-001 - Planning Mode And Build Posture

Status: Locked

### Context

Doppl is a two-week capstone with an ambitious agent-evolution concept and a June 29, 2026 showcase. The architecture must be deep enough for a 3-4 engineer team, but scoped to a credible MVP/prototype.

### Options Considered

| Option | Pros | Cons | Build Risk | Demo Risk | Security/Data Risk | PRD Alignment |
|---|---|---|---|---|---|---|
| Compact planning | Fastest artifact set | Too thin for evolution/runtime/verifier/dashboard complexity | High | High | Medium | Weak |
| Default planning | Balanced docs | Less explicit split for many complex surfaces | Medium | Medium | Medium | Good |
| Expanded planning | Explicit artifacts for product, users, flows, domain, requirements, constraints, risks, research, decisions | More planning ceremony | Low-medium | Low | Low | Strong |

### Recommendation

Use Expanded planning mode and MVP/prototype build posture.

### Decision

[locked decision] Expanded planning mode.

[locked decision] MVP/prototype build posture.

### Rationale

The system has many high-risk surfaces, but the delivery target is a capstone demo rather than production operations.

### Tradeoffs

Expanded docs cost time up front, but reduce implementation ambiguity.

### Fallback

If planning becomes too heavy, keep artifact set but make unresolved details explicit for `/arch-finalize`.

### What Would Change This Decision

A new production deployment requirement, compliance requirement, or larger team/time horizon.

### Related Requirements

REQ-O-005, REQ-DEF-005

### Related Architecture Anchors

§1, §14 _(ARCHITECTURE.md; remapped from draft §1, §15 — see docs/gap-audits/anchor-remap.md)_

## ADR-002 - Runtime Ownership: Custom Doppl Kernel

Status: Locked

### Context

Doppl's core is a dynamic evolutionary runtime with populations, energy accounting, scoring, culling, fusion, mutation, lineage, and replay. This does not map cleanly to a fixed workflow graph as the authoritative state machine.

### Options Considered

| Option | Pros | Cons | Build Risk | Demo Risk | Security/Data Risk | PRD Alignment |
|---|---|---|---|---|---|---|
| Custom Doppl kernel | Exact control over population dynamics, event log, caps, lineage | More custom implementation | Medium | Low | Low | Strong |
| LangGraph as core runtime | Durable graph execution, streaming, checkpoints | Runtime semantics may fight dynamic evolution; source-of-truth ambiguity | Medium-high | Medium | Medium | Partial |
| Simple scripts | Fast first prototype | Weak replay/state/caps/ownership | High | High | High | Weak |

### Recommendation

Use a custom TypeScript Doppl kernel as the authoritative runtime.

### Decision

[locked decision] Custom TypeScript Doppl kernel owns run lifecycle, caps, energy, scoring, culling, fusion, mutation, event emission, and replay truth.

[locked decision] LangGraph may be used only as an optional non-authoritative helper for bounded subflows.

### Rationale

The weird part is the organism. The architecture should put custom control there and keep vendor/framework orchestration outside the authoritative state path.

### Tradeoffs

The team writes more runtime code, but avoids bending Doppl into an ill-fitting abstraction.

### Fallback

Use LangGraph inside verifier/check adapters if those subflows become easier to express as graphs.

### What Would Change This Decision

If a prototype shows LangGraph can model population dynamics, lineage, replay, and caps without source-of-truth ambiguity.

### Related Requirements

REQ-F-001 through REQ-F-012, REQ-NF-001, REQ-I-007

### Related Architecture Anchors

§2, §5 _(ARCHITECTURE.md; remapped from draft §3, §4, §6)_

## ADR-003 - Source Of Truth: Postgres Append-Only Event Log

Status: Locked

### Context

Live + replay mode, auditability, lineage visualization, and demo evidence require durable event history. SQLite is explicitly forbidden.

### Options Considered

| Option | Pros | Cons | Build Risk | Demo Risk | Security/Data Risk | PRD Alignment |
|---|---|---|---|---|---|---|
| Postgres append-only event log | Durable, queryable, supports projections and pgvector | Requires schema discipline | Medium | Low | Low | Strong |
| Current rows only | Simpler CRUD | Weak replay/audit/lineage evidence | Medium | High | Medium | Weak |
| SQLite local store | Simple local setup | Explicitly disallowed; weaker hosted path | Low | Medium | Medium | Rejected |
| Neo4j as source of truth | Natural graph traversal | Adds operational surface, weak event replay semantics | High | Medium | Medium | Partial |

### Recommendation

Use Postgres append-only event log as authoritative source of truth with derived projections.

### Decision

[locked decision] Postgres is required.

[locked decision] SQLite is forbidden.

[locked decision] Append-only run events are authoritative; dashboard, current state, and graph projections are derived.

### Rationale

Replay and trust matter more than CRUD simplicity. Postgres also keeps room for pgvector and hosted/local parity.

### Tradeoffs

Event-sourcing discipline adds implementation complexity.

### Fallback

Over-persist JSON event payloads early, then normalize projections later.

### What Would Change This Decision

Only a hard infrastructure constraint that makes Postgres unavailable, which currently conflicts with user direction.

### Related Requirements

REQ-D-001 through REQ-D-008, REQ-T-003

### Related Architecture Anchors

§3, §4, §9 _(ARCHITECTURE.md; remapped from draft §5, §7, §11)_

## ADR-004 - Model Access: Provider-Agnostic Gateway With OpenRouter Primary

Status: Locked

### Context

Doppl must switch models/providers in and out, including OpenRouter, OpenAI, Anthropic/Claude, and possibly Codex-related surfaces if feasible. Runtime code should not be vendor-coupled.

### Options Considered

| Option | Pros | Cons | Build Risk | Demo Risk | Security/Data Risk | PRD Alignment |
|---|---|---|---|---|---|---|
| OpenRouter primary through gateway | Multi-provider routing, easier model switching, one primary route | Capability differences across routed models | Medium | Low-medium | Medium | Strong |
| Direct OpenAI primary | Clean structured outputs + embeddings | More vendor-coupled; less model-switching flexibility | Low | Low | Medium | Good |
| Direct Anthropic primary | Strong reasoning/tool use | Embeddings and strict schema path may require more care | Medium | Medium | Medium | Good |
| Provider SDKs in domain code | Fast initially | Locks runtime to vendors and makes switching painful | High | Medium | High | Weak |

### Recommendation

Use a provider-agnostic model gateway and registry, with OpenRouter as the primary MVP provider path and direct provider adapters as fallback/specialized routes.

### Decision

[locked decision] Model access is provider-agnostic.

[locked decision] OpenRouter is primary for MVP.

[locked decision] OpenAI remains a direct adapter/fallback, especially for embeddings or provider-specific structured-output needs.

[research required] Codex subscription/product access must be validated before it can be treated as a runtime provider.

### Rationale

The organism should be able to evolve across models as easily as it evolves agenomes. A gateway keeps the Doppl kernel independent from vendor APIs.

### Tradeoffs

The adapter capability matrix adds work: structured outputs, tools, embeddings, streaming, cost metadata, and trace IDs must be normalized.

### Fallback

Ship with OpenRouter only behind the gateway if time is tight; add direct OpenAI fallback if OpenRouter capability gaps block structured output or embeddings.

### What Would Change This Decision

If OpenRouter cannot reliably provide structured outputs or rate limits for the demo, the primary route may switch to direct OpenAI while preserving the gateway.

### Related Requirements

REQ-I-001, REQ-I-008, REQ-I-009, REQ-I-010, REQ-I-011

### Related Architecture Anchors

§6, §11 _(ARCHITECTURE.md; remapped from draft §8, §9, §10)_

## ADR-005 - Observability: Langfuse Cloud Plus Doppl Event Correlation

Status: Locked

### Context

Doppl needs LLM observability for agent generation, critic reviews, checks, cost, latency, and prompt/eval metadata. The event log remains product truth.

### Options Considered

| Option | Pros | Cons | Build Risk | Demo Risk | Security/Data Risk | PRD Alignment |
|---|---|---|---|---|---|---|
| Langfuse Cloud | Fastest trace/cost/eval visibility; framework-agnostic | External service dependency | Low | Low-medium | Medium | Strong |
| Self-hosted Langfuse | More control | Adds Postgres/ClickHouse/MinIO/Redis stack | High | Medium | Medium | Good |
| LangSmith | Strong LangChain/LangGraph ecosystem | Less aligned if LangGraph not core; hosted dependency | Medium | Medium | Medium | Partial |
| Doppl-only tracing | No external dependency | Rebuild observability; weaker LLM tooling | Medium | Medium | Low | Partial |

### Recommendation

Use Langfuse Cloud for MVP; correlate Doppl event IDs with Langfuse trace/span IDs and preserve local trace metadata fallback.

### Decision

[locked decision] Langfuse Cloud for MVP.

[locked decision] Langfuse is not authoritative for lineage or replay; Postgres events are.

### Rationale

Langfuse fits the framework-agnostic model gateway, gives trace/cost/eval visibility, and avoids LangGraph/LangChain lock-in.

### Tradeoffs

External observability can fail; Doppl must still demo from local event data.

### Fallback

Store minimal local trace metadata in Postgres; defer or self-host Langfuse only if showcase constraints require it.

### What Would Change This Decision

Langfuse Cloud unavailable, privacy constraints, or no account/API access.

### Related Requirements

REQ-I-006, REQ-T-006

### Related Architecture Anchors

§13 _(ARCHITECTURE.md; remapped from draft §10, §13)_

## ADR-006 - Novelty Scoring: Simple Embeddings First

Status: Locked

### Context

Mode collapse is a core Doppl risk. The team promoted simple novelty scoring into MVP but deferred advanced quality-diversity algorithms.

### Options Considered

| Option | Pros | Cons | Build Risk | Demo Risk | Security/Data Risk | PRD Alignment |
|---|---|---|---|---|---|---|
| Simple embedding similarity | Practical anti-collapse signal, explainable enough | Imperfect novelty proxy | Medium | Low | Low | Strong |
| LLM novelty judge only | Easy if models already integrated | Subjective, costly, critic gaming risk | Low | Medium | Medium | Medium |
| DPP/MAP-Elites | Strong quality-diversity story | Too much algorithmic scope | High | Medium | Low | Strong stretch |
| No novelty score | Simpler | Mode collapse risk | Low | High | Low | Weak |

### Recommendation

Use simple embeddings/cosine or nearest-neighbor novelty score in MVP.

### Decision

[locked decision] Simple novelty scoring is MVP scope.

[locked decision] Advanced quality-diversity methods remain deferred.

### Rationale

A thin novelty component gives the organism visible anti-collapse pressure without turning the capstone into an ML research implementation.

### Tradeoffs

Novelty may reward weirdness without usefulness, so it must be only one component of fitness.

### Fallback

If pgvector slows setup, compute novelty in application code over small candidate sets.

### What Would Change This Decision

If embeddings are unavailable or too slow/costly, use a temporary lexical/LLM-judge novelty component and preserve the score interface.

### Related Requirements

REQ-I-003, REQ-DEF-006

### Related Architecture Anchors

§8 _(ARCHITECTURE.md; remapped from draft §9)_

## ADR-007 - Lineage Graph: Projection First, Neo4j Spike Early

Status: Locked

### Context

Lineage analysis will be important, but Neo4j as a runtime dependency adds another database. The event log should remain authoritative.

### Options Considered

| Option | Pros | Cons | Build Risk | Demo Risk | Security/Data Risk | PRD Alignment |
|---|---|---|---|---|---|---|
| Postgres-derived graph projection | Fast MVP, no extra runtime DB | More work for complex graph queries | Low | Low | Low | Strong |
| Neo4j read model | Strong lineage/ancestry/diversity queries | Extra setup and sync concerns | Medium-high | Medium | Medium | Strong future |
| Neo4j source of truth | Natural graph model | Conflicts with event replay/audit | High | Medium | Medium | Partial |

### Recommendation

Use storage-agnostic lineage graph projection for MVP and spike Neo4j early.

### Decision

[locked decision] Neo4j is deferred from MVP runtime.

[locked decision] Early Neo4j lineage-analysis spike is required.

[locked decision] Graph projections are derived and never authoritative.

### Rationale

This keeps the MVP build focused while preserving a clean path to deeper lineage analysis.

### Tradeoffs

Some graph analysis may be awkward until Neo4j is promoted.

### Fallback

If Neo4j spike proves high value and low cost, add it as a derived read model.

### What Would Change This Decision

If selection/scoring requires graph traversal that becomes painful in Postgres projections.

### Related Requirements

REQ-D-006, REQ-D-007, REQ-I-005, REQ-DEF-007

### Related Architecture Anchors

§9, §10 _(ARCHITECTURE.md; remapped from draft §7, §12)_

## ADR-008 - Dashboard Graph Visualization: React Flow Default

Status: Locked

### Context

The dashboard must show a watchable population tree, energy, fitness, lineage changes, and replay. The graph UI is part of the proof, not decoration.

### Options Considered

| Option | Pros | Cons | Build Risk | Demo Risk | Security/Data Risk | PRD Alignment |
|---|---|---|---|---|---|---|
| React Flow | React/TS-friendly, custom nodes/edges, interaction built in | May need layout helper | Low | Low | Low | Strong |
| Cytoscape.js | Strong graph analysis/rendering | Less React-native | Medium | Low | Low | Good |
| D3 custom graph | Maximum visual control | More implementation work | High | Medium | Low | Good |

### Recommendation

Use React Flow for MVP lineage visualization, with a layout helper if needed.

### Decision

[locked decision] React Flow for MVP graph visualization.

### Rationale

It gives rich node/edge interaction quickly and maps naturally to a lineage projection.

### Tradeoffs

Large graphs or specialized layouts may eventually need Cytoscape/D3.

### Fallback

Use Cytoscape.js if React Flow layout/performance is inadequate.

### What Would Change This Decision

If the dashboard needs graph-scale analytics or complex layout beyond React Flow's comfortable range.

### Related Requirements

REQ-F-013, REQ-UX-001, REQ-E-002

### Related Architecture Anchors

§12 _(ARCHITECTURE.md; unchanged from draft §12)_

## ADR-009 - Demo Reliability: Local-First Plus Hosted

Status: Locked

### Context

The showcase needs a reliable demo, but hosted deployment is valuable. The user confirmed both local and hosted, with no SQLite.

### Options Considered

| Option | Pros | Cons | Build Risk | Demo Risk | Security/Data Risk | PRD Alignment |
|---|---|---|---|---|---|---|
| Local-first plus hosted | Reliable fallback and shareable deployment | Two run modes to verify | Medium | Low | Medium | Strong |
| Hosted only | Clean audience access | Cloud/provider failure can sink demo | Medium | High | Medium | Good |
| Local only | Simplest reliable path | Less polished/shareable | Low | Medium | Low | Partial |

### Recommendation

Support both, with local-first reliability.

### Decision

[locked decision] Full demo path must run locally with Postgres and replay data.

[locked decision] Hosted deployment is supported but not the only demo path.

### Rationale

The capstone demo should not be hostage to cloud deployment or provider latency.

### Tradeoffs

Requires environment discipline and rehearsals in both modes if hosted is pursued.

### Fallback

Use local demo plus replay if hosted deployment is unavailable.

### What Would Change This Decision

If the showcase requires hosted-only access.

### Related Requirements

REQ-O-005, REQ-E-005

### Related Architecture Anchors

§17 _(ARCHITECTURE.md; remapped from draft §14)_

## ADR-010 - API Streaming: REST Plus SSE

Status: Locked

### Context

Doppl needs live run visibility for the dashboard, but frontend commands are occasional: create run, stop run, inspect run, replay run. The UI does not need continuous bidirectional control in the MVP.

### Options Considered

| Option | Pros | Cons | Build Risk | Demo Risk | Security/Data Risk | PRD Alignment |
|---|---|---|---|---|---|---|
| REST + polling | Simplest | Less live organism feel | Low | Medium | Low | Good |
| REST + SSE | Live event stream over HTTP; simpler than WebSockets | One-way stream only | Medium-low | Low | Low | Strong |
| WebSocket-first | Full bidirectional live control | More state, reconnect, ordering, auth, backpressure complexity | Medium-high | Medium | Medium | Possible future |

### Recommendation

Use REST for commands/queries and SSE for live run-event streaming.

### Decision

[locked decision] REST + SSE from the start.

[locked decision] WebSockets deferred.

### Rationale

Doppl's runtime naturally emits append-only events. SSE maps directly to that model and gives the dashboard a live feel without full socket complexity.

### Tradeoffs

If the UI later needs interactive steering or collaborative live controls, SSE may not be enough.

### Fallback

Use polling against projections if SSE causes implementation issues; add WebSockets only if bidirectional control becomes required.

### What Would Change This Decision

Need for continuous UI-to-runtime commands, multi-user collaboration, or low-latency bidirectional steering.

### Related Requirements

REQ-F-015, REQ-DEF-009

### Related Architecture Anchors

§11, §12 _(ARCHITECTURE.md; remapped from draft §8, §11, §12)_
