# Doppl Constraints

Source PRD: `Doppl_Capstone_Proposal.pdf`

## Phase 0 - Initial Constraints

### Timebox

[locked decision] Showcase target: June 29, 2026.

[locked decision] Build reality: two-week capstone scope. The minimum shippable cut must be credible even if moonshot features do not converge.

### Team

[locked decision] Expected team size: 3-4 engineers.

[proposed recommendation] Work should split into four ownership surfaces: kernel / runtime, selection / ML, verifier council, and demo / observability. With three engineers, kernel and demo should merge under one owner.

### Build Posture

[locked decision] MVP / prototype posture, with safety and correctness rails preserved on load-bearing paths.

### External Dependencies

[research required] LLM provider choice, structured-output guarantees, tool-calling model behavior, pricing, and rate limits need current research.

[research required] Embedding provider / library and vector search approach need research if novelty scoring is in the MVP.

[research required] Any retrieval / prior-art search dependency needs research if critic grounding relies on web or corpus search.

[research required] Neo4j or another graph database should be tested in an early lineage-analysis spike, but not adopted as an MVP runtime dependency until the spike proves it is worth the added surface area.

### Graph Technology

[locked decision] The MVP event log remains the authoritative lineage source.

[locked decision] The architecture must expose a lineage graph projection interface so the dashboard and analysis tools can consume nodes/edges independent of whether the backing read model is SQL, in-memory projection, or Neo4j.

[deferred work] Neo4j as a persistent graph read model is deferred from the MVP runtime.

[research required] The build plan should include an early Neo4j spike that tests ancestry queries, winner-contribution queries, lineage-distance/diversity queries, and dashboard export shape.

### Technology Stack Decisions

[locked decision] Backend/runtime should be TypeScript with a custom Doppl evolution kernel.

[locked decision] Postgres is the required authoritative event store. SQLite is not allowed.

[locked decision] Langfuse Cloud is the MVP LLM observability platform for tracing, cost visibility, prompt/eval support, and framework-agnostic integration.

[locked decision] Self-hosted Langfuse is deferred unless Langfuse Cloud access becomes unavailable or forbidden.

[locked decision] LangGraph may be used as an optional helper for bounded critic/check subflows, but it must not become the authoritative Doppl runtime.

[deferred work] LangSmith is deferred unless the project later adopts LangGraph/LangChain as the dominant application framework.

[locked decision] Simple novelty scoring should use embeddings plus cosine/nearest-neighbor comparison. pgvector is preferred if Postgres integration is straightforward; app-level vector comparison is acceptable at MVP scale.

[proposed recommendation] Use a configurable model registry: lower-cost model tier for most population/critic calls, stronger model tier for final judge/synthesis, and an embedding model for novelty scoring.

[locked decision] Model access must be provider-agnostic. Doppl runtime/domain code should call a model gateway interface rather than direct vendor SDKs.

[locked decision] The model registry must support both direct provider adapters, such as OpenAI and Anthropic/Claude, and routed-provider adapters, such as OpenRouter.

[locked decision] OpenRouter is the primary MVP provider path so the team can route across model providers without rewriting runtime code.

[proposed recommendation] OpenAI should remain a direct provider adapter/fallback because it cleanly covers structured outputs and embeddings for the MVP.

[research required] Codex subscription/product access should be validated separately before treating it as a runtime model provider. Until then, it is not a must-ship provider dependency.

[locked decision] Lineage visualization should use React Flow, fed by the storage-agnostic lineage graph projection.

### Deployment Constraints

[locked decision] The system should support both local demo execution and hosted deployment.

[locked decision] Local-first reliability is required: the team must be able to run the full demo path locally with Postgres and replay data even if hosted deployment is unavailable.

[proposed recommendation] Hosted deployment should be treated as a valuable showcase path, but not the only way to present Doppl.

[production-hardening] Production-grade deployment/rollback, multi-environment operations, and long-term monitoring remain deferred under MVP/prototype posture unless required by the showcase.

### Runtime Budgets

[locked decision] Runtime budgets should be configurable defaults, not hard promises, until provider research is complete.

[proposed recommendation] MVP planning defaults should begin with approximately 20 agenomes, 2-4 generations, and a demo-safe lower override for live runs if latency or cost threatens the showcase.

[locked decision] The live demo path should fit inside the 10-minute showcase window, with replay fallback available.

[research required] Exact cost ceiling, model/provider latency assumptions, rate limits, and concurrency limits must be researched before final architecture locking.

[deferred work] Production SLOs for latency, throughput, and availability are deferred under MVP/prototype posture.

### API And Streaming

[locked decision] The backend should expose REST endpoints for commands/queries and SSE for live run-event streaming.

[locked decision] WebSockets are deferred unless later interactive steering or bidirectional live collaboration becomes necessary.

### Non-Negotiable Safety Rails

[locked decision] The recursive agent loop must be finite by construction: energy budgets, depth limits, spawn caps, timeouts, and kill switches are required.

[locked decision] Metric mutation, if attempted, cannot move the bedrock anchor: executable checks, held-out human judgment, or other non-self-authored validation must remain outside the breeding loop.
