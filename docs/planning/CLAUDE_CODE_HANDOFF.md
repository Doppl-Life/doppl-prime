# Claude Code Handoff

Source PRD: `Doppl_Capstone_Proposal.pdf`

## Goal

Review the Doppl architecture draft and supporting planning artifacts, identify gaps, finalize the architecture, then create `IMPLEMENTATION_PLAN.md` from the user's provided template.

Do not start implementation from this draft package. This package is the handoff from `arch-draft` to the architecture finalization pass.

## Build Posture

MVP/prototype.

Finalize and audit against that posture:

- Deliberate deferral is acceptable.
- Every deferral must be explicit.
- Do not silently expand into production SaaS scope.
- Preserve demo wow factor, narrative clarity, lineage visibility, observability, and replayability as first-class requirements.
- Treat two-week capstone constraints and the June 29, 2026 showcase target as binding planning context.

## Inputs To Read End To End

Read the PRD first:

- `Doppl_Capstone_Proposal.pdf`

Then read every planning artifact:

- `docs/planning/PRODUCT_BRIEF.md`
- `docs/planning/USERS.md`
- `docs/planning/STAKEHOLDERS.md`
- `docs/planning/USER_FLOWS.md`
- `docs/planning/DOMAIN_MODEL.md`
- `docs/planning/DATA_MODEL.md`
- `docs/planning/THREAT_MODEL.md`
- `docs/planning/REQUIREMENTS.md`
- `docs/planning/CONSTRAINTS.md`
- `docs/planning/EVALUATION_CRITERIA.md`
- `docs/planning/ASSUMPTIONS.md`
- `docs/planning/OPEN_QUESTIONS.md`
- `docs/planning/RESEARCH.md`
- `docs/planning/DECISIONS.md`
- `docs/planning/RISKS.md`
- `docs/planning/ARCHITECTURE_OUTLINE.md`
- `docs/planning/ARCHITECTURE_DRAFT.md`
- `docs/planning/DIAGRAM_PLAN.md`
- `docs/planning/CLAUDE_CODE_HANDOFF.md`

If the user provides an `IMPLEMENTATION_PLAN.md` template, read it only after the architecture is finalized.

## Locked Decisions To Preserve

- Doppl is an agent-evolution runtime plus verifier council plus observable demo dashboard.
- The canonical unit of work is `CandidateIdea`.
- MVP supports both `cross_domain_transfer` and `zeitgeist_synthesis`.
- Both idea types share a lifecycle with subtype-specific checks.
- Architecture is for the engineering team first, while preserving demo narrative clarity and observability.
- MVP needs live mode and replay mode.
- Source of truth is a Postgres append-only run event log.
- SQLite is forbidden.
- Runtime is a custom TypeScript Doppl kernel.
- Model access is provider-agnostic.
- OpenRouter is the primary provider path.
- Direct OpenAI fallback is allowed, especially for embeddings or provider-specific structured outputs.
- Anthropic/Claude support should fit the same provider seam.
- Codex subscription/product access is research-required and must not be assumed as a runtime provider.
- Langfuse Cloud is the MVP observability path.
- LangGraph is optional and non-authoritative only.
- LangSmith is deferred unless LangGraph/LangChain becomes dominant.
- Novelty scoring is MVP scope.
- Neo4j is deferred from runtime, but an early spike must test it as a derived lineage-analysis read model.
- React Flow is the lineage/dashboard graph library.
- API strategy is REST commands/queries plus SSE run-event streaming from the start.
- WebSockets are deferred unless bidirectional steering or multi-user collaboration becomes necessary.
- Deployment is local-first plus hosted.

## Second-Pass Gap Audit

Perform a second-pass architecture gap audit before writing the root `ARCHITECTURE.md`.

Look for:

- missing user flows
- missing lifecycle states
- missing failure modes
- missing interfaces or schemas
- unclear source-of-truth boundaries
- unresearched external dependencies
- inconsistent decisions
- overbuilt scope
- missing tests
- missing deployment path and demo fallback
- missing security or trust boundaries
- missing diagram needs
- missing anchors for task planning

Return the audit in this shape:

1. Critical gaps
2. Important gaps
3. Nice-to-have improvements
4. Proposed architecture edits
5. Questions requiring human decision

Ask for human confirmation before changing any load-bearing decision.

## Open Questions To Resolve Or Carry Forward

- Exact OpenRouter model routes by role: population generation, critic council, embeddings, final judge, and synthesis.
- Whether the first direct fallback adapter should be OpenAI only, Anthropic/Claude too, or both.
- Whether Codex subscription/product access has a supported runtime integration path.
- Exact domains or fixed problem set for the minimum shippable demo.
- Held-out idea-quality rubric and who or what applies it.
- Scoring weights for critic scores, subtype checks, novelty, and energy efficiency.
- Objective checks feasible for both idea subtypes inside the capstone window.
- Whether MVP novelty starts with pgvector or app-level cosine comparison.
- Exact event payload fields to persist versus derive.
- Neo4j spike success criteria and sample lineage queries.
- How much of Rule of Cool should be reused versus treated as conceptual reference.
- Whether hosted showcase needs thin deployment-level access control.
- Whether the showcase uses prepared prompt, audience prompt entered by operator, or both.
- Exact population, generation, token, and time defaults after provider spike.

## Required Finalization Outputs

Create these after the gap audit and human confirmation for load-bearing changes:

1. Root `ARCHITECTURE.md`
   - Finalized architecture, not rough draft.
   - Stable anchors for every implementation task.
   - Explicit MVP scope, deferred scope, and risk mitigations.
   - Clear subsystem ownership and source-of-truth boundaries.
   - Diagram references aligned to `docs/planning/DIAGRAM_PLAN.md`.

2. Root `IMPLEMENTATION_PLAN.md`
   - Use the user's provided template if supplied.
   - Every task must reference `ARCHITECTURE.md` anchors.
   - Do not invent architecture while writing tasks.
   - If a task needs missing architecture, stop and flag the gap.
   - Build order should prioritize contracts, event truth, runtime invariants, provider spike, replay, and demo observability before polish.

## Suggested Build Order For The Later Implementation Plan

Use this as planning input, not as a substitute for the user's template:

1. Freeze shared contracts: event envelope, domain schemas, provider gateway, scoring policy, lineage projection.
2. Run provider spike: OpenRouter structured outputs, embeddings path, fallback adapter feasibility, cost/latency caps.
3. Run Neo4j spike: export sample lineage projection and answer explicit lineage-analysis queries.
4. Build Postgres event store and replay reader.
5. Build runtime kernel state machine, caps, energy ledger, and event emission.
6. Build model gateway and structured-output validation.
7. Build verifier council, subtype checks, novelty scoring, fitness policy, selection, and reproduction.
8. Build projections and REST plus SSE API.
9. Build dashboard with React Flow lineage, evidence panels, replay, and Langfuse trace links.
10. Build local-first demo path, hosted path, prepared replay fallback, and rehearsal checks.

## Guardrails

- Do not replace event truth with Langfuse, Neo4j, dashboard state, or provider traces.
- Do not let model outputs select winners directly; critics and checks emit evidence, scoring policy selects.
- Do not let agenome prompt text enforce caps; caps are runtime invariants.
- Do not put provider SDK calls in domain/runtime modules.
- Do not introduce product-level multi-user auth unless showcase deployment requires a thin access gate.
- Do not add SQLite.
- Do not turn Neo4j into the MVP source of truth.
- Do not make WebSockets the default unless a confirmed requirement needs bidirectional live control.

## Final Handoff Prompt

Use this prompt to start the next architecture finalization session:

```text
Use docs/planning/CLAUDE_CODE_HANDOFF.md. Read Doppl_Capstone_Proposal.pdf and every docs/planning artifact end to end. Do not implement. Perform the second-pass architecture gap audit for an MVP/prototype capstone build, ask for confirmation on load-bearing changes, then produce the finalized root ARCHITECTURE.md. After the architecture is finalized, create IMPLEMENTATION_PLAN.md from my provided template, with every task anchored to ARCHITECTURE.md.
```
