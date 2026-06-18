# Doppl Research

Research date: 2026-06-18

## Research Questions

| ID | Question | Why It Matters | Decision It Informs | Status |
|---|---|---|---|---|
| RQ-001 | Which model/provider path best supports structured agent, critic, and scoring outputs? | Doppl depends on machine-validated LLM outputs; invalid output corrupts the organism loop. | Provider/model adapter, structured output strategy, validation. | researched |
| RQ-002 | Which model path is cost-safe enough for population-scale agent loops? | A run can multiply calls across agenomes, critics, and checks. | Model tiering, caps, replay defaults. | researched, cost ceiling still open |
| RQ-003 | Which embedding/vector approach should power MVP novelty scoring? | Simple novelty scoring is now must-ship. | Embedding provider, pgvector/app-level comparison. | researched |
| RQ-004 | Does Langfuse fit Doppl's observability needs? | We need LLM traces, cost/latency, prompt/eval metadata, and correlation to run events. | Observability platform decision. | researched |
| RQ-005 | Is self-hosted Langfuse realistic for the capstone MVP? | Self-hosting may add more operational surface than it saves. | Hosted vs self-hosted observability decision. | researched |
| RQ-006 | Should LangGraph be core runtime or optional helper? | Doppl has a dynamic evolutionary runtime rather than a fixed workflow. | Orchestration decision. | researched |
| RQ-007 | How should pgvector be used for MVP novelty scoring? | We already require Postgres; pgvector may avoid a separate vector store. | Data/storage decision. | researched |
| RQ-008 | How should Neo4j be evaluated as a lineage-analysis read model? | Lineage analysis will matter, but adopting a graph DB too early adds risk. | Graph spike scope, projection boundary. | researched |
| RQ-009 | Which frontend graph library is the best MVP fit for lineage visualization? | The demo needs a watchable population tree. | Dashboard visualization decision. | researched |
| RQ-010 | How should Doppl stay model-provider agnostic, including OpenRouter and direct providers? | The team wants to switch models/providers without rewriting the runtime. | Model adapter boundary, model registry, provider fallback strategy. | researched |

## Findings

### R-001 - Structured LLM Outputs

Question: Which model/provider path best supports structured agent, critic, and scoring outputs?

Findings:

- OpenAI Structured Outputs ensure responses adhere to a supplied JSON Schema, which directly supports Doppl's need for schema-validated agenomes, candidate ideas, critic reviews, check results, and score records.
- OpenAI recommends Structured Outputs over JSON mode where possible because JSON mode only guarantees valid JSON, not schema adherence.
- OpenAI's docs say Structured Outputs are available in latest large language models and recommend starting new projects with `gpt-5.5`.
- Anthropic also documents structured-output support and strict tool schemas, but mixing providers in MVP adds adapter and trace complexity.

Sources:

- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/models
- https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/increase-consistency
- https://docs.anthropic.com/en/api/models-list

Impact:

- The architecture should define provider adapters, but the MVP should start with one primary provider path that supports strict structured outputs.
- Every LLM output entering the event log should pass schema validation and either be accepted, repaired through a controlled path, or rejected with a failure event.

Decision Implication:

[updated recommendation] Use a provider-agnostic model adapter and registry as the load-bearing architecture. OpenRouter should be the primary MVP provider path because it gives routed access to multiple models/providers, while direct OpenAI remains an adapter behind the same interface for embeddings, fallback, or provider-specific capabilities.

Remaining Risk:

- Project-level rate limits and account access are not known.
- A secondary non-OpenAI critic may improve evaluator diversity later, but should not block the first build.

### R-002 - Model Cost And Tiering

Question: Which model path is cost-safe enough for population-scale agent loops?

Findings:

- OpenAI's current model docs position `gpt-5.5` as the flagship model for complex reasoning and coding, with `gpt-5.4 mini` / `gpt-5.4 nano` called out for lower-latency/lower-cost workloads.
- Current OpenAI pricing lists `gpt-5.5` standard short-context pricing at $5.00 input / $30.00 output per 1M tokens, `gpt-5.4` at $2.50 / $15.00, and `gpt-5.4-mini` at $0.75 / $4.50.
- OpenAI Batch/Flex pricing can be lower, but live demo workloads should not depend on batch completion.
- OpenAI docs say model tool calls and built-in tools may have extra costs, including web search and hosted shell/code interpreter.

Sources:

- https://developers.openai.com/api/docs/models
- https://developers.openai.com/api/docs/models/gpt-5.5
- https://developers.openai.com/api/docs/pricing

Impact:

- Do not run every population, critic, and check call through the flagship model by default.
- Use model tiering: cheaper/faster model for most agenome generation and critic passes, stronger model for final judge/synthesis or selected high-value checks.
- Preserve configurable budgets and lower live-demo overrides.

Decision Implication:

[proposed recommendation] Use a configurable model registry with low-cost/default tiers for population/critic calls and stronger tiers for final synthesis, held-out judge, or demo-critical reruns. The registry should primarily use OpenRouter-style routed model IDs while preserving direct provider adapter entries for fallback and provider-specific capabilities.

Remaining Risk:

- Exact cost ceiling still needs the team's budget and provider account limits.
- Token estimates require a prototype run.

### R-003 - Embeddings And Novelty Scoring

Question: Which embedding/vector approach should power MVP novelty scoring?

Findings:

- OpenAI embeddings are designed to measure relatedness between text strings and are used for search, clustering, recommendations, anomaly detection, and classification.
- OpenAI's embedding API supports `text-embedding-ada-002`, `text-embedding-3-small`, and `text-embedding-3-large`, with optional dimensions.
- `pgvector-node` supports Node/TypeScript usage with Postgres, including enabling the vector extension, inserting vector values, and nearest-neighbor queries.

Sources:

- https://developers.openai.com/api/docs/guides/embeddings
- https://developers.openai.com/api/reference/resources/embeddings/methods/create
- https://github.com/pgvector/pgvector-node/blob/master/README.md

Impact:

- Postgres + pgvector is a good MVP fit because Postgres is already required.
- Candidate idea summaries can be embedded and compared against prior candidates in the same run/generation to produce a simple novelty score.
- For very small MVP datasets, app-level cosine comparison remains an acceptable fallback if pgvector setup slows the team down.

Decision Implication:

[proposed recommendation] Use OpenAI embeddings plus pgvector for novelty scoring if setup is straightforward; otherwise compute cosine similarity in app code and keep the storage contract ready for pgvector.

Remaining Risk:

- Embedding model cost and account limits should be checked against the team's project budget.
- The scoring formula and comparison set still need to be locked.

### R-004 - Langfuse Observability

Question: Does Langfuse fit Doppl's observability needs?

Findings:

- Langfuse provides LLM tracing, nested call traces, cost and latency tracking, datasets/evaluations/scores, metrics queries, and prompt management.
- Langfuse has JS/TS tracing support and LangChain integration, and it can trace framework-agnostic OpenAI-compatible calls.
- Langfuse's strengths match Doppl's need to correlate product events with LLM calls: candidate generation, critic review, objective check, final synthesis, and replay evidence.

Sources:

- https://github.com/langfuse/langfuse-docs/blob/main/content/docs/index.mdx
- https://github.com/langfuse/langfuse-docs/blob/main/langfuse-docs/components/home/feature-tabs/data.ts
- https://github.com/langfuse/langfuse-docs/blob/main/content/guides/cookbook/js_langfuse_sdk.mdx

Impact:

- Doppl should store Langfuse trace/span IDs on event-log records for LLM-related work.
- Langfuse should not be the source of truth for product lineage; it is an observability side channel.

Decision Implication:

[locked decision] Use Langfuse Cloud for MVP observability unless access becomes unavailable or forbidden.

Remaining Risk:

- Langfuse Cloud availability and account setup must be verified.
- If Langfuse is unavailable during demo, Doppl's own event log must still preserve enough trace-like metadata.

### R-005 - Self-Hosted Langfuse

Question: Is self-hosted Langfuse realistic for the capstone MVP?

Findings:

- Langfuse supports self-hosting for testing/low-scale deployments through local/VM Docker Compose and production-scale deployments through Kubernetes/Helm, cloud Terraform options, or Railway.
- The documented Docker Compose stack includes Langfuse web/worker plus Postgres, ClickHouse, MinIO, and Redis.
- This is viable, but it is a meaningful operational stack for a two-week capstone.

Sources:

- https://github.com/langfuse/langfuse-docs/blob/main/content/self-hosting/index.mdx
- https://github.com/langfuse/langfuse-docs/blob/main/langfuse-docs/content/integrations/no-code/langflow.mdx

Impact:

- Self-hosting Langfuse should not be part of the critical MVP path unless required.
- The Doppl event log should retain minimal local trace metadata so the demo does not fail if Langfuse is unreachable.

Decision Implication:

[locked decision] Langfuse Cloud for MVP; self-hosting deferred or optional spike only.

Remaining Risk:

- If hosted external services are forbidden for showcase, this decision changes.

### R-006 - LangGraph Runtime Fit

Question: Should LangGraph be core runtime or optional helper?

Findings:

- LangGraph is a low-level orchestration framework/runtime for long-running, stateful agents, with durable execution, streaming, persistence/checkpointing, time travel/branching, and human-in-the-loop support.
- LangGraph is excellent for fixed or semi-fixed stateful agent workflows, but Doppl's core loop is a dynamic population/evolution runtime with custom lineage, energy accounting, culling, fusion, mutation, replay, and scoring.

Sources:

- https://docs.langchain.com/oss/javascript/langgraph/overview
- https://docs.langchain.com/oss/javascript/langgraph/use-graph-api
- https://docs.langchain.com/oss/javascript/langgraph/streaming

Impact:

- LangGraph should not be the authoritative source of truth or runtime state machine.
- It may still be useful for bounded verifier/check subflows if it reduces implementation effort.

Decision Implication:

[proposed recommendation] Custom Doppl kernel as authoritative runtime; LangGraph optional/non-authoritative helper.

Remaining Risk:

- If verifier/check workflows become complex enough, a LangGraph adapter may become useful, but it should still emit Doppl events.

### R-007 - Neo4j Lineage Read Model

Question: How should Neo4j be evaluated as a lineage-analysis read model?

Findings:

- Neo4j's JavaScript driver connects to Neo4j from Node/TypeScript and runs Cypher queries against nodes and relationships.
- Neo4j naturally models parent/child, fusion, produced, scored, and culled relationships.
- The main MVP risk is operational scope, not technical fit.

Sources:

- https://github.com/neo4j/docs-drivers/blob/dev/javascript-manual/modules/ROOT/pages/index.adoc
- https://github.com/neo4j/docs-drivers/blob/dev/javascript-manual/modules/ROOT/pages/connect.adoc
- https://github.com/neo4j/docs-drivers/blob/dev/javascript-manual/modules/ROOT/partials/quickstart.adoc

Impact:

- Keep Postgres event log authoritative.
- Define a lineage graph projection contract now.
- Run an early spike that projects sample events into Neo4j and tests ancestry, winner contribution, critic-kill, and lineage-distance queries.

Decision Implication:

[locked decision] Neo4j remains deferred from MVP runtime but gets an early spike and drop-in read-model seam.

Remaining Risk:

- If lineage analysis becomes central to selection, Neo4j may need promotion sooner.

### R-008 - React Flow For Lineage Visualization

Question: Which frontend graph library is the best MVP fit for lineage visualization?

Findings:

- React Flow provides TypeScript-friendly node/edge state, custom nodes and edges, fit view, controls, zoom/pan/drag interaction, and application-specific graph UIs.
- The API maps cleanly onto Doppl's `LineageGraphProjection` of nodes and edges.

Sources:

- https://reactflow.dev/learn/advanced-use/typescript
- https://reactflow.dev/examples/styling/turbo-flow

Impact:

- React Flow is a strong default for MVP lineage visualization because it is React-native and supports custom node/edge visuals without building canvas interaction from scratch.
- If graph size grows large, revisit Cytoscape/D3/performance tradeoffs.

Decision Implication:

[locked decision] Use React Flow for MVP lineage tree/dashboard visualization.

Remaining Risk:

- Layout quality for dynamic trees may require a layout helper such as Dagre/ELK or custom positioning.

### R-009 - Provider-Agnostic Model Adapter And OpenRouter

Question: How should Doppl stay model-provider agnostic, including OpenRouter and direct providers?

Findings:

- OpenRouter provides a unified API for access to hundreds of models through one endpoint, including fallback/routing support.
- OpenRouter documentation shows model selection with `provider/model` identifiers, plus TypeScript SDK support.
- OpenRouter supports structured JSON output with a `json_schema` response format and `strict: true` in its TypeScript SDK examples.
- OpenRouter can be used with tool-style agent calls in its agent SDK, including models such as `~anthropic/claude-sonnet-latest`.

Sources:

- https://openrouter.ai/docs
- https://openrouter.ai/docs/client-sdks/typescript
- https://openrouter.ai/docs/guides/features/structured-outputs
- https://openrouter.ai/docs/cookbook/get-started/migrate-to-openrouter

Impact:

- Doppl should not import provider SDKs directly inside domain/runtime logic.
- The runtime should depend on a `ModelGateway` / `ModelAdapter` interface that accepts a Doppl-level request and returns validated structured outputs plus telemetry metadata.
- The model registry should support direct provider entries such as OpenAI and Anthropic, plus routed provider entries such as OpenRouter.
- Provider capabilities must be explicit: structured output support, tool calling, streaming, embeddings, cost metadata, retry behavior, and trace correlation.
- Codex subscription/product access should not be treated as a runtime model API unless a supported integration path is confirmed; it can be a later execution adapter or operator workflow, not a must-ship provider dependency.

Decision Implication:

[locked decision] The architecture must be model-provider agnostic through a provider adapter and model registry. OpenRouter is the primary MVP provider path; direct OpenAI and Anthropic/Claude can be added through the same seam as fallback or provider-specific adapters.

Remaining Risk:

- Feature parity differs by provider/model, especially for strict structured outputs, tool calling, embeddings, and trace metadata.
- OpenRouter pricing/rate limits/model availability can vary by routed model and must be checked during provider spike.
- Codex subscription access needs separate feasibility validation and should not be assumed as an API model provider.

## Research Summary

[locked decision] Provider architecture: model-provider agnostic adapter and model registry.

[locked decision] Primary provider path: OpenRouter.

[proposed recommendation] First direct provider adapter/fallback: OpenAI with structured outputs and embeddings.

[proposed recommendation] Model tiering: lower-cost model for most population/critic calls; stronger model for final judge/synthesis.

[locked decision] Observability: Langfuse Cloud, with local event-log trace fallback.

[locked decision] Authoritative runtime and event log stay custom Doppl/Postgres, not LangGraph or Langfuse.

[locked decision] Neo4j remains deferred from runtime but must be spiked early as a lineage-analysis read model.

[locked decision] React Flow is the MVP lineage visualization default.
