# Doppl Assumptions

Source PRD: `Doppl_Capstone_Proposal.pdf`

## Phase 0 - Initial Assumptions

[proposed recommendation] The system can use a small fixed suite of seed problems for development and demo rehearsal, even if the showcase begins with a live prompt.

[proposed recommendation] "Approximately 20 agenomes" is a target for the minimum shippable cut, but the architecture should let the demo operator lower population size when provider latency or budget makes that necessary.

[proposed recommendation] The first build should privilege inspectable evidence over raw agent sophistication. A simpler loop with excellent lineage, scoring, and replay will be more compelling than a large opaque loop.

[proposed recommendation] Classical ML controls can begin as simple explicit policies, then become learned bandits / value models only if the inner loop is stable.

[proposed recommendation] The Rule of Cool seed skill is available as conceptual input, but its exact implementation details are not yet available in this repo.

[locked decision] The MVP assumes a single demo operator / admin and read-only reviewers, rather than multi-user team workspaces.

[locked decision] Meaningful runs persist enough event/state data to replay population tree, energy spend, critic gauntlet, scores, and final idea evidence.

[locked decision] Run events are the authoritative source of truth; current state and dashboard views are derived projections.

[locked decision] MVP anti-collapse work uses simple novelty scoring, while advanced quality-diversity methods remain deferred.

[locked decision] MVP lineage specialization is an evidence/dashboard feature based on persisted lineage traits and score patterns, not a promise of emergent species-level behavior.

[locked decision] Neo4j is deferred as an MVP runtime dependency, but the architecture should make it easy to add as a lineage-analysis read model.

[locked decision] SQLite is not allowed; Postgres is the required event-store baseline.

[locked decision] Langfuse Cloud is the MVP LLM observability tool; LangGraph is optional/non-authoritative; LangSmith is deferred unless LangChain/LangGraph becomes dominant.

[locked decision] The project targets both local and hosted operation, but local demo reliability wins if there is a tradeoff.

## Phase 8 - Scope Inferences (posture: MVP/prototype)

| Inference | Why It Matters | Classification | Architecture Impact |
|---|---|---|---|
| Seeded/rehearsable runs are required. | Live prompts are exciting but demo acceptance cannot depend on randomness or provider timing. | must-handle | Add prepared problem sets, run replay, and demo-safe configuration. |
| Runtime caps and kill switch are correctness requirements. | Recursive spawning can blow cost and time budgets. | must-handle | Enforce caps in runtime, not only UI; add stop/cancel state transitions. |
| LLM outputs need structured validation and safe repair/rejection. | Invalid model output cannot corrupt event log or scoring. | must-handle | Define schemas for agenomes, candidates, critic reviews, check results, and scores. |
| Replay must reconstruct from Postgres events without new model calls. | Replay is the demo safety net and audit surface. | must-handle | Persist all dashboard-relevant event payloads and projection inputs. |
| Provider failures must preserve partial evidence. | A failed run should still be explainable and replayable up to failure. | must-handle | Add failed events, retry/timeout policy, and partial terminal summaries. |
| Doppl event IDs should correlate with Langfuse trace/span IDs. | Debugging requires joining product lineage to LLM traces. | must-handle | Store trace IDs on LLM-related events and candidate/critic/check records. |
| A demo fallback path is required. | The showcase has a fixed window and live LLM latency is uncertain. | must-handle | Support replay, prepared runs, lower cap overrides, and clear live/replay labeling. |
| Operator controls are required, but full product auth is not. | The demo needs start/stop/configure controls; multi-user administration is not the capstone proof. | simplification | Single operator/admin role; defer product-level accounts/workspaces. |
| Happy path, cap failure, replay, and invalid-output tests are required. | These are the paths most likely to break the organism claim. | must-handle | Build test fixtures and smoke scripts around event log and runtime state machine. |
| Production-grade deployment/rollback and long-term operations are not MVP scope. | They would steal time from the organism and demo evidence. | production-hardening | Flag as deferred; keep local-first and hosted-demo support. |
| Neo4j should be tested early but not adopted by default. | Lineage analysis matters, but adding another database too early increases risk. | research required | Add early spike; maintain storage-agnostic lineage projection. |
| LangGraph should not own Doppl runtime state. | Doppl's dynamic evolutionary loop does not map cleanly to a fixed workflow graph as source of truth. | simplification | Custom kernel owns run lifecycle; LangGraph optional for bounded subflows only. |
| Simple novelty scoring belongs in MVP; advanced quality-diversity does not. | Mode collapse is core risk; advanced algorithms are not required for the first proof. | must-handle / deferred | Add simple semantic novelty score; defer DPP/MAP-Elites. |

## Phase 9 - Assumptions

| ID | Assumption | Category | Why It Matters | Validation Path | Fallback |
|---|---|---|---|---|---|
| A-001 | Single demo operator plus read-only reviewers is enough for MVP. | users/permissions | Avoids auth/workspace scope creep. | Confirm showcase flow and deployment needs. | Add thin deployment access gate without product-level roles. |
| A-002 | Local-first demo reliability is more important than hosted polish. | deployment/demo | Prevents cloud/deploy issues from sinking showcase. | Rehearse full local run with Postgres and replay data. | Present local app; hosted remains optional. |
| A-003 | Postgres can support the authoritative append-only event log and derived graph projections. | data/storage | Determines persistence and replay architecture. | Build early event-log + replay fixture. | Keep event log in Postgres but tune projection schema or add graph read model. |
| A-004 | A storage-agnostic lineage graph projection is enough for MVP dashboard and early analysis. | graph/data | Avoids adopting Neo4j too early while preserving future path. | Run early Neo4j spike against sample lineage events. | Promote Neo4j to derived read model if SQL/projection queries are painful. |
| A-005 | Langfuse can satisfy MVP LLM observability needs. | observability/integration | Traces must join Doppl events to provider behavior. | Spike Langfuse trace correlation with agent + critic calls. | Use direct OpenTelemetry/local trace records; reconsider LangSmith if LangGraph dominates. |
| A-006 | LangGraph is useful at most for bounded subflows, not as authoritative runtime. | architecture/orchestration | Doppl's dynamic evolutionary lifecycle needs custom kernel control. | Re-evaluate during critic/check implementation if graph orchestration reduces complexity. | Use LangGraph only inside verifier/check adapters, or omit entirely. |
| A-007 | Simple novelty scoring is feasible in the MVP using embeddings or equivalent semantic similarity. | ML/scoring | Anti-collapse signal is now must-ship. | Spike embeddings and nearest-neighbor scoring over candidate summaries. | Use heuristic lexical/LLM-judge novelty temporarily, while keeping score component interface. |
| A-008 | Prepared problem sets plus replay can preserve demo credibility even if live providers are slow. | demo/evaluation | Live run risk is high with LLM latency. | Rehearse one happy path and one fallback replay. | Use replay-first demo with clearly labeled live moments. |
| A-009 | Rule of Cool can seed design without requiring direct code port. | product/mechanics | The proposal names it as Gen-0 inspiration, but implementation access is not confirmed. | Locate/read the skill if available and decide what to port. | Use it as conceptual reference only; create Doppl seed agenomes from scratch. |
| A-010 | The team can build must-ship scope in TypeScript within the capstone timebox. | team/timebox | Stack choice and scope depend on velocity. | Confirm team skill set and create implementation plan slices. | Reduce population size/generation count; lean harder on replay and prepared runs. |
| A-011 | Provider-agnostic model access is required from the start, with OpenRouter as the primary MVP provider path. | integration/provider | Doppl should be able to switch OpenRouter routes, OpenAI, Anthropic/Claude, and future providers without runtime rewrites. | Spike OpenRouter through the gateway, plus at least one direct provider fallback if time allows. | Ship with OpenRouter behind the interface, but keep all domain/runtime code adapter-agnostic. |
| A-012 | Codex subscription/product access may not be a supported runtime API provider. | integration/provider | Avoids basing runtime design on an unavailable product surface. | Validate available Codex integration surfaces separately. | Treat Codex as a development/operator tool, not a model provider, unless proven otherwise. |
