# Doppl Requirements

Source PRD: `Doppl_Capstone_Proposal.pdf`

## Phase 0 - Initial Requirements Extract

### Explicit PRD Requirements

[locked decision] The MVP must support both idea prey types named by the PRD: cross-domain transfer and zeitgeist synthesis.

[locked decision] The minimum shippable cut must run a single-generation or small multi-step loop on a fixed problem set.

[locked decision] The system must spawn approximately 20 agenomes in the minimum shippable cut, subject to final phase sizing.

[locked decision] Agenomes must support serialized traits: system prompt, persona / value weights, tool permissions, decomposition policy, and spawn budget.

[locked decision] The system must implement fusion reproduction at two levels: agenome-level crossover and output-level synthesis.

[locked decision] The system must run a critic council with distinct adversarial mandates, including factual grounding, novelty / prior art, feasibility, and falsification.

[locked decision] The system must include at least one objective check per domain where possible, for example an executable cross-domain transfer check that can be scored pass/fail.

[locked decision] The system must cull, mutate, and re-run surviving lineages so generation N+1 can be compared against generation N.

[locked decision] The system must show that generation N+1 measurably beats generation N on a held-out idea-quality rubric.

[locked decision] The system must include an instrumented dashboard showing population tree, energy per agent, and fitness over generations.

[locked decision] The system must enforce cost and termination rails through hard energy caps, depth limits, spawn limits, and budget allocation controls.

### Implied Requirements

[proposed recommendation] Runs should be reproducible enough for demo rehearsal: persist run inputs, agenome definitions, critic outputs, scores, and lineage events.

[proposed recommendation] The fitness score should be decomposed into components rather than stored as an opaque scalar, so reviewers can inspect why a lineage survived.

[proposed recommendation] The verifier council should use structured outputs to make scoring auditable and compatible with downstream visualization.

[proposed recommendation] The runtime should treat LLM/tool spend as first-class metered events, even if real provider cost tracking is approximate in the MVP.

[proposed recommendation] The demo should include a seeded fixed problem set or rehearsal mode to avoid live-demo randomness becoming the acceptance bottleneck.

[locked decision] The system must separate the breeding loop from dashboard rendering so the live UI can replay a known run if live generation is slow or fails.

[locked decision] The MVP must support both live execution and replayable run mode.

[locked decision] The run event log must be append-only and authoritative for replay, auditability, and dashboard projections.

### Stretch / Moonshot Requirements

[deferred work] Multi-generational open-ended evolution for hours.

[deferred work] Learned spawn allocation through bandit / RL control.

[locked decision] A simple novelty score using embeddings or equivalent semantic distance is in MVP scope to reduce mode-collapse risk.

[deferred work] Advanced novelty pressure using DPP, MAP-Elites, or deeper quality-diversity methods remains stretch/deferred.

[deferred work] Self-improving verifier council where critic agenomes themselves evolve.

[deferred work] In-house fine-tuning flywheel and open-weight model merging / weight-level fusion.

## Phase 6 - Requirements

### Functional Requirements

| ID | Requirement | Source | Priority | Acceptance Signal | Related Flow |
|---|---|---|---|---|---|
| REQ-F-001 | The system shall create bounded Doppl runs from a seed prompt or fixed problem set. | explicit - PRD "A human supplies only the seed"; user-confirmed live + replay mode | must-ship | Operator can start a run and see a persisted run record with configured caps. | Configure And Start A Run |
| REQ-F-002 | The MVP shall support both `cross_domain_transfer` and `zeitgeist_synthesis` candidate idea subtypes. | explicit - PRD "two prey"; user-confirmed "both" | must-ship | Run configuration and candidate records support both subtypes. | Configure And Start A Run; Verify Candidate Ideas |
| REQ-F-003 | The system shall represent an agenome as serialized prompt/persona/tool/decomposition/spawn-budget traits. | explicit - PRD "serialized {system-prompt + persona/value-weights + tool permissions + decomposition policy + spawn budget}" | must-ship | Seed and child agenomes persist those trait fields or explicit MVP equivalents. | Execute Generation Lifecycle |
| REQ-F-004 | The runtime shall spawn a bounded population of agenomes for a run/generation. | explicit - PRD "spawn ~20 agenomes"; user-confirmed bounded lifecycle | must-ship | A configured run creates a population within cap limits. | Configure And Start A Run; Execute Generation Lifecycle |
| REQ-F-005 | Agenomes shall generate candidate ideas that are normalized into a shared candidate schema. | user-confirmed Phase 1 mechanics | must-ship | Candidate idea records share lifecycle fields and subtype-specific payloads. | Execute Generation Lifecycle |
| REQ-F-006 | The verifier council shall run structured critic reviews with distinct mandates. | explicit - PRD "factual grounding, novelty/prior-art, feasibility, falsification" | must-ship | Candidate idea has stored critic reviews for configured mandates. | Verify Candidate Ideas |
| REQ-F-007 | The system shall run subtype-specific checks where feasible and record skipped checks with reasons. | explicit - PRD "one objective check per domain"; user-confirmed subtype-specific checks | must-ship | Candidate has check results or explicit skip records keyed by subtype. | Verify Candidate Ideas |
| REQ-F-008 | The system shall compute decomposed fitness scores from critic reviews, subtype checks, novelty/diversity signals if present, and energy efficiency. | explicit - PRD "fitness function"; user-confirmed decomposed/auditable scoring | must-ship | Fitness record includes total, components, policy version, and explanation. | Score, Cull, Fuse, And Mutate |
| REQ-F-009 | The selection controller shall cull weak lineages and select parent agenomes for reproduction. | explicit - PRD "cull, mutate, re-run"; "winning means surviving adversarial scrutiny" | must-ship | Culling and parent-selection events are persisted with reasons. | Score, Cull, Fuse, And Mutate |
| REQ-F-010 | The system shall implement fusion reproduction using agenome-level crossover and/or output-level synthesis. | explicit - PRD "Fusion ships at two levels" | must-ship | Child agenome records include parent IDs and fusion/mutation metadata. | Score, Cull, Fuse, And Mutate |
| REQ-F-011 | The runtime shall create at least one successor generation when caps allow. | explicit - PRD "Show generation N+1 measurably beats generation N" | must-ship | A completed generation can produce a next generation with child agenomes. | Score, Cull, Fuse, And Mutate |
| REQ-F-012 | The operator shall be able to stop a run and preserve partial evidence. | inferred from MVP demo safety and bounded runtime | must-ship | Stop action moves run to terminal state and keeps replayable events. | Stop Or Complete A Run |
| REQ-F-013 | The dashboard shall display live run state, lineage, energy, critic status, scores, and best surviving idea. | explicit - PRD "Instrumented dashboard"; user-confirmed observability first-class | must-ship | Reviewers can follow the organism lifecycle from the UI. | Observe Live Run |
| REQ-F-014 | The dashboard shall replay persisted runs without fresh LLM calls. | user-confirmed live + replay mode; source-of-truth decision | must-ship | Completed run can be replayed from event log only. | Replay A Run |
| REQ-F-015 | The backend shall expose REST endpoints for run commands/queries and SSE for live run-event streaming. | user-confirmed Phase 13 API shape | must-ship | Dashboard can start/stop/read runs via REST and subscribe to live run events through SSE. | Configure And Start A Run; Observe Live Run |

### Non-Functional Requirements

| ID | Requirement | Source | Priority | Acceptance Signal | Related Flow |
|---|---|---|---|---|---|
| REQ-NF-001 | The runtime shall enforce finite execution through hard caps on population size, generations, energy/tokens, spawn depth, tool calls, and wall-clock time. | explicit - PRD "hard energy caps, depth limits"; user-confirmed load-bearing invariant | must-ship | Attempts to exceed caps are rejected or stopped by runtime. | Execute Generation Lifecycle; Stop Or Complete A Run |
| REQ-NF-002 | The system shall favor inspectable evidence over opaque automation. | user-confirmed engineering-first plus demo observability | must-ship | Key lifecycle decisions are visible through stored events and dashboard projections. | Observe Live Run; Replay A Run |
| REQ-NF-003 | The MVP shall avoid unstated latency, throughput, and availability guarantees. | PRD timebox; no explicit budgets provided | must-ship | Architecture records performance budgets as open constraints rather than invented numbers. | All flows |
| REQ-NF-004 | The implementation shall be modular enough for 3-4 engineers to own kernel/runtime, selection/ML, verifier council, and demo/observability surfaces. | explicit - PRD team ownership table; user-confirmed engineering team first | must-ship | Architecture assigns clear boundaries and interfaces for each surface. | All flows |
| REQ-NF-005 | The system should degrade to replay mode when live provider latency/failure threatens the showcase. | user-confirmed live + replay mode | must-ship | Operator can select a previous run and present it clearly as replay. | Replay A Run |

### Data Requirements

| ID | Requirement | Source | Priority | Acceptance Signal | Related Flow |
|---|---|---|---|---|---|
| REQ-D-001 | The append-only run event log shall be the authoritative source of truth. | user-confirmed Phase 5 source-of-truth model | must-ship | Current projections can be rebuilt from events. | All flows |
| REQ-D-002 | The system shall persist run configuration, generation state, agenomes, candidate ideas, critic reviews, check results, fitness scores, energy events, culling events, reproduction events, and terminal summaries. | inferred from replay requirement and domain model | must-ship | Replay and audit can reconstruct the run lifecycle. | Replay A Run |
| REQ-D-003 | Dashboard projections shall be derived read models and never authoritative state. | user-confirmed Phase 5 invariants | must-ship | UI-only projection loss does not corrupt run history. | Observe Live Run; Replay A Run |
| REQ-D-004 | Candidate ideas shall preserve subtype and evidence references. | user-confirmed both prey types with subtype checks | must-ship | Each candidate can be filtered and evaluated by subtype. | Verify Candidate Ideas |
| REQ-D-005 | Historical run facts shall not be edited in place. | user-confirmed append-only source of truth | must-ship | Corrections/annotations are stored separately or as new events. | Replay A Run |
| REQ-D-006 | The lineage model shall expose nodes/edges through a storage-agnostic read-model interface so a graph database can be added later without rewriting the runtime. | user-confirmed Neo4j deferral with easy drop-in path | must-ship | Dashboard and analysis code consume lineage graph projections through an interface, not direct SQL table assumptions. | Observe Live Run; Replay A Run |
| REQ-D-007 | The build plan shall include an early Neo4j lineage-analysis spike before the event/data model hardens. | user-confirmed "spike somewhere very early" | must-ship | Spike answers whether Neo4j should remain deferred, become a read-model projection, or shape lineage query contracts. | Score, Cull, Fuse, And Mutate; Replay A Run |
| REQ-D-008 | Postgres shall be the authoritative event store; SQLite shall not be used. | user-confirmed "no sqlite" | must-ship | Architecture and build plan use Postgres for durable event/state persistence. | All flows |

### Security And Safety Requirements

| ID | Requirement | Source | Priority | Acceptance Signal | Related Flow |
|---|---|---|---|---|---|
| REQ-S-001 | Agenomes shall not bypass assigned tool permissions, energy caps, depth caps, or survival criteria. | explicit - PRD "metabolism is the safety rail"; user-confirmed invariants | must-ship | Runtime rejects unauthorized tool/cap actions. | Execute Generation Lifecycle |
| REQ-S-002 | Critic agents and check runners shall not mutate candidate content, lineage, or score policy directly. | inferred from verifier integrity risk | must-ship | Verifiers only emit structured evidence records. | Verify Candidate Ideas |
| REQ-S-003 | Check runners shall not execute arbitrary unsafe code. | inferred from objective-check risk | must-ship | Checks run only through approved adapters/sandboxes. | Verify Candidate Ideas |
| REQ-S-004 | Secrets and provider credentials shall not be exposed to agenome prompts, critic prompts, dashboard clients, or event logs. | inferred from LLM/tool integration baseline | must-ship | No persisted prompt/event payload contains provider secrets. | All flows |
| REQ-S-005 | Product-level multi-user auth is deferred unless deployment constraints require thin access control. | user-confirmed single operator/read-only reviewers | deferred | If required, add deployment-level gate without changing product role model. | Configure And Start A Run; Observe Live Run |

### UX And Demo Requirements

| ID | Requirement | Source | Priority | Acceptance Signal | Related Flow |
|---|---|---|---|---|---|
| REQ-UX-001 | The dashboard shall make the "agents that breed agents" story legible. | explicit - PRD demo narrative; user-confirmed wow factor and clarity | must-ship | Audience can identify spawn, survival, fusion, mutation, and generation improvement. | Observe Live Run |
| REQ-UX-002 | The UI shall distinguish live execution from replay. | user-confirmed live + replay mode | must-ship | Replay screen clearly indicates replay status and original timestamps/order. | Replay A Run |
| REQ-UX-003 | The dashboard shall support inspection of the final surviving idea and the critic gauntlet it passed. | explicit - PRD "replays the adversarial gauntlet" | must-ship | Final idea panel links to critic reviews, checks, lineage, and score components. | Observe Live Run; Replay A Run |
| REQ-UX-004 | The operator shall be able to configure caps without bypassing hard maximums. | inferred from operator role and safety rails | must-ship | UI allows safe cap choices and rejects invalid settings. | Configure And Start A Run |

### Operational Requirements

| ID | Requirement | Source | Priority | Acceptance Signal | Related Flow |
|---|---|---|---|---|---|
| REQ-O-001 | The system shall support a rehearsable prepared problem set. | inferred from demo risk; PRD fixed problem set minimum cut | must-ship | Operator can run a prepared problem set before showcase. | Configure And Start A Run |
| REQ-O-002 | The system shall preserve enough partial state when dependencies fail to explain what happened. | inferred from live provider risk | must-ship | Failed runs remain inspectable and replayable up to failure. | Stop Or Complete A Run; Replay A Run |
| REQ-O-003 | The system shall provide a hard stop / kill path for active runs. | inferred from recursive spawning risk | must-ship | Operator stop or runtime cap cancels outstanding work and finalizes status. | Stop Or Complete A Run |
| REQ-O-004 | Production deployment/rollback, long-term observability, and user administration are out of MVP scope unless required by the showcase environment. | MVP/prototype posture | deferred | Handoff lists these as production-hardening deferrals. | All flows |
| REQ-O-005 | The system shall support both local demo execution and hosted deployment, with local-first reliability. | user-confirmed "both" | must-ship | Team can run the full demo path locally with Postgres/replay data and optionally present hosted deployment. | All flows |

### Integration Requirements

| ID | Requirement | Source | Priority | Acceptance Signal | Related Flow |
|---|---|---|---|---|---|
| REQ-I-001 | The system shall integrate with at least one LLM provider capable of structured agent/critic outputs. | explicit - AI as primitive; inferred from agenome/critic loop | must-ship | Runtime can call provider and validate structured output. | Execute Generation Lifecycle; Verify Candidate Ideas |
| REQ-I-002 | Retrieval/search integration for grounding and prior-art checks is research-required before locking. | explicit - PRD "ground critics in retrieval"; current provider not chosen | research required | Research doc identifies approach or fallback. | Verify Candidate Ideas |
| REQ-I-003 | The MVP shall include simple novelty scoring using embeddings or equivalent semantic distance over candidate idea summaries. | explicit - PRD novelty scoring; user-confirmed promotion to MVP | must-ship | Fitness score includes a `novelty_score` component or documented fallback if embeddings are unavailable. | Score, Cull, Fuse, And Mutate |
| REQ-I-004 | Learned bandit/RL allocation is stretch, with simple heuristic allocation required for MVP. | explicit - PRD "multi-armed bandit / RL"; user-confirmed recommendation | stretch | MVP uses deterministic/heuristic allocation based on fitness, novelty, and energy efficiency; learned allocation remains optional. | Score, Cull, Fuse, And Mutate |
| REQ-I-005 | Neo4j/graph database integration is deferred from MVP runtime but must be evaluated through an early spike for lineage analysis. | user-confirmed graph tech decision | research required | Spike compares event-log-derived graph projections against Neo4j ancestry/diversity queries. | Replay A Run |
| REQ-I-006 | Langfuse Cloud shall be used for MVP LLM observability unless access becomes unavailable or forbidden. | user-confirmed stack recommendation | must-ship | LLM calls emit traces/cost/prompt metadata to Langfuse Cloud or documented local-compatible fallback. | Execute Generation Lifecycle; Verify Candidate Ideas |
| REQ-I-007 | LangGraph shall remain optional and non-authoritative if used. | user-confirmed stack recommendation | must-ship | Core run state, caps, lineage, and replay do not depend on LangGraph checkpoints as source of truth. | All flows |
| REQ-I-008 | The runtime shall use a provider-agnostic model gateway rather than calling provider SDKs directly from domain logic. | user-confirmed model-adapter agnostic goal | must-ship | Agenome, critic, check, embedding, and judge calls route through adapter interfaces. | Execute Generation Lifecycle; Verify Candidate Ideas |
| REQ-I-009 | The model registry shall support direct providers and routed providers such as OpenRouter. | user-confirmed OpenRouter/provider switching goal | must-ship | A model can be configured by role, provider, model id, capability flags, and fallback policy. | All flows |
| REQ-I-010 | OpenRouter shall be the primary MVP provider path and shall be evaluated early through the model gateway. | user-confirmed OpenRouter primary; researched OpenRouter docs | must-ship | Spike demonstrates structured-output calls through OpenRouter for at least one generator/critic path and records capability gaps. | Verify Candidate Ideas |
| REQ-I-011 | Codex subscription/product-surface access shall not be assumed as an API provider until feasibility is validated. | user-confirmed interest in Codex subscriptions; architecture safety inference | research required | Handoff keeps Codex-subscription integration as a research item, not a runtime dependency. | All flows |

### Testing Requirements

| ID | Requirement | Source | Priority | Acceptance Signal | Related Flow |
|---|---|---|---|---|---|
| REQ-T-001 | Test fixtures shall cover a deterministic small run from seed through final summary. | inferred from replay/demo risk | must-ship | Automated test or scripted smoke creates replayable run events. | All flows |
| REQ-T-002 | Tests shall verify cap enforcement for energy, generation count, population size, depth, tool calls, and stop. | explicit safety rails; inferred correctness invariant | must-ship | Cap-violation tests fail closed. | Execute Generation Lifecycle; Stop Or Complete A Run |
| REQ-T-003 | Tests shall verify event-log replay reconstructs dashboard-relevant state. | user-confirmed append-only event log and replay | must-ship | Projection rebuilt from events matches expected run state. | Replay A Run |
| REQ-T-004 | Tests shall verify invalid structured outputs from agents/critics are rejected or repaired safely. | inferred from LLM structured-output risk | must-ship | Invalid outputs do not corrupt candidate/review state. | Execute Generation Lifecycle; Verify Candidate Ideas |
| REQ-T-005 | Demo rehearsal shall include at least one successful prepared run and one failure/replay fallback path. | inferred from showcase risk | must-ship | Team can rehearse both happy path and fallback. | Observe Live Run; Replay A Run |
| REQ-T-006 | Tests shall correlate Doppl event IDs with observability trace IDs for LLM-related work. | user-confirmed Phase 8 inference | must-ship | A test or smoke run shows candidate/critic/check events can be joined to Langfuse traces. | Execute Generation Lifecycle; Verify Candidate Ideas |

### Acceptance / Evaluation Requirements

| ID | Requirement | Source | Priority | Acceptance Signal | Related Flow |
|---|---|---|---|---|---|
| REQ-E-001 | The demo shall show generation-over-generation improvement. | explicit - PRD "Show generation N+1 measurably beats generation N" | must-ship | Fitness-over-time or comparison view shows later generation outperforming earlier baseline. | Observe Live Run; Replay A Run |
| REQ-E-002 | The demo shall show visible lineage specialization or lineage change using trait, mutation, score, and critic-pattern evidence. | explicit - PRD "lineages visibly specialize"; user-confirmed promotion to MVP | must-ship | Dashboard labels or highlights lineage differences such as high novelty / weak feasibility or strong grounding / low originality. | Observe Live Run |
| REQ-E-003 | The final idea shall be presented with replayable critic evidence and subtype-check evidence. | explicit - PRD "replays the adversarial gauntlet"; user-confirmed observability | must-ship | Final idea evidence panel can be shown live or in replay. | Observe Live Run; Replay A Run |
| REQ-E-004 | The demo shall make cost/energy scarcity visible as a selection pressure. | explicit - PRD "compute scarcity is the environment" | must-ship | Dashboard shows energy per agenome and/or budget depletion. | Observe Live Run |
| REQ-E-005 | The demo may combine live execution and replay as long as the mode is clear. | user-confirmed live + replay mode | must-ship | Audience can tell which parts are live and which are replayed. | Replay A Run |

### Deferred Requirements

| ID | Requirement | Source | Priority | Acceptance Signal | Related Flow |
|---|---|---|---|---|---|
| REQ-DEF-001 | Open-ended multi-generational runs for hours. | explicit - PRD "Ambitious version"; user-confirmed recommendation | deferred | Listed as stretch/post-MVP unless completed after must-ship loop. | Execute Generation Lifecycle |
| REQ-DEF-002 | Self-evolving verifier council. | explicit - PRD "critics themselves evolve" | deferred | Handoff records as moonshot, not must-ship. | Verify Candidate Ideas |
| REQ-DEF-003 | In-house fine-tuning flywheel. | explicit - PRD "fine-tuning our own in-house model" | deferred | Handoff records as moonshot, not must-ship. | Score, Cull, Fuse, And Mutate |
| REQ-DEF-004 | Open-weight model merging / weight-level fusion. | explicit - PRD "weight-level fusion" | deferred | Handoff records as moonshot, not must-ship. | Score, Cull, Fuse, And Mutate |
| REQ-DEF-005 | Production-grade user accounts, workspaces, audit admin, deploy rollback, and long-term operations. | MVP/prototype posture | deferred | Handoff flags as production-hardening deferral. | All flows |
| REQ-DEF-006 | Advanced quality-diversity search using DPP, MAP-Elites, or niche maps. | explicit - PRD "DPP/quality-diversity, MAP-Elites-style niches"; user-confirmed recommendation | deferred | Simple novelty scoring remains MVP; advanced anti-collapse algorithms remain stretch/post-MVP. | Score, Cull, Fuse, And Mutate |
| REQ-DEF-007 | Neo4j as a production/runtime dependency. | user-confirmed deferred but easy drop-in replacement | deferred | MVP keeps event log authoritative and graph storage optional; early spike determines future adoption path. | Observe Live Run; Replay A Run |
| REQ-DEF-008 | LangSmith as the primary LLM observability/evaluation platform. | user-confirmed stack recommendation | deferred | Reconsider only if LangGraph/LangChain becomes the dominant framework. | All flows |
| REQ-DEF-009 | WebSocket-first live control. | user-confirmed REST + SSE choice | deferred | Revisit if Doppl needs bidirectional steering, collaboration, or low-latency continuous UI control. | Observe Live Run |

### Requirement Questions Still Open

[open question] The exact held-out idea-quality rubric is still not locked.

[open question] The exact scoring weights across critic, subtype-check, simple novelty, and energy-efficiency components are still not locked.

[open question] Exact OpenRouter model routes for population generation, critic council, embeddings, and final judge remain research-required.

[open question] Exact latency, cost ceiling, and availability targets are not stated in the PRD and should not be invented.

[open question] The Neo4j spike still needs concrete success criteria and example lineage queries.
