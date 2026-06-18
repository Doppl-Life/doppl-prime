# Doppl Risks

Source PRD: `Doppl_Capstone_Proposal.pdf`

## Phase 0 - Initial Risk Areas

### Technical Risks

[locked decision] Fitness without ground truth is the core technical risk. If critics are weak, evolution may optimize for fooling critics rather than producing good ideas.

[locked decision] Mode collapse is a major risk. The population may converge on a safe mediocre genome unless diversity pressure and lineage mixing are explicit.

[locked decision] Recursive cost blowup is a major risk. The metabolism must be enforced as a runtime invariant, not just a design metaphor.

[locked decision] Demo latency is a major risk. The architecture must support a credible path to visible progress within the live showcase window.

### Product / Reviewer Risks

[locked decision] The product fails if reviewers cannot see the difference between "an agent generated an idea" and "a population evolved toward better ideas."

[locked decision] The product fails if the best final idea cannot be defended through critic evidence, grounding, or objective checks.

[locked decision] The product fails if the dashboard is ornamental rather than evidentiary.

### Scope Risks

[locked decision] The moonshot items may not converge in the two-week capstone. They must be modeled as stretch work unless they become necessary for the minimum acceptance proof.

## Phase 14 - Security, Risk, And Failure Modes

### Risk Register

| ID | Risk | Category | Severity | Likelihood | Mitigation | Fallback | Test / Validation | Must Appear In Architecture |
|---|---|---|---|---|---|---|---|---|
| RISK-001 | Critic council rewards plausible slop instead of good ideas. | product/ML | high | medium | Structured rubric, distinct critic mandates, subtype checks, held-out/final judge path, evidence provenance. | Mark candidate rejected/uncertain; rely on prepared verified runs. | Fixture with weak/hallucinated idea should fail critic/check policy. | yes |
| RISK-002 | Reward hacking through mutable metrics or critic drift. | ML/security | high | medium | MVP uses fixed scoring policy version; metric mutations deferred; bedrock checks cannot be moved by agents. | Disable metric mutation entirely. | Test that agents/critics cannot alter scoring policy or validation anchors. | yes |
| RISK-003 | Recursive spawning or model calls exceed budget/time. | operational/cost | high | high | Runtime-enforced energy, generation, population, depth, tool-call, and wall-clock caps. | Kill run, finalize partial evidence, replay prior run. | Cap-enforcement tests and stop/kill smoke. | yes |
| RISK-004 | Provider outage/rate limit breaks live demo. | integration/demo | high | medium | Replay mode, prepared runs, lower live caps, provider gateway, local event fallback. | Replay known-good run with clear label. | Rehearse provider-failure fallback. | yes |
| RISK-005 | OpenRouter routed model lacks strict structured output behavior for a chosen route. | integration/data | high | medium | Capability matrix per model route, schema validation, repair/reject path, direct provider fallback. | Switch route/provider for schema-critical calls. | Provider-adapter spike with structured-output tests. | yes |
| RISK-006 | Event log missing data needed for replay/audit. | data/demo | high | medium | Persist all lifecycle decisions, raw/normalized model outputs, score components, trace IDs, and lineage events. | Over-persist JSON early; backfill projections if possible. | Replay rebuild tests from event log only. | yes |
| RISK-007 | Dashboard becomes ornamental and not evidentiary. | product/demo | high | medium | UI consumes projections from event log; final idea panel links to lineage, critics, checks, scores, energy. | Use tabular evidence/replay panel if graph UI lags. | Demo script review and Playwright smoke. | yes |
| RISK-008 | Prompt injection or candidate content manipulates critics/tools. | security/model | medium-high | medium | Treat model outputs as untrusted data; schema validation; tool permission allowlists; critic context separation. | Disable risky tools; use prepared/offline checks. | Prompt-injection fixtures against critic/check prompts. | yes |
| RISK-009 | Secrets leak into prompts, events, traces, or dashboard. | security | high | low-medium | Provider keys server-only; redaction before event/trace persistence; no secrets in schemas/prompts. | Rotate credentials; remove traces/events if possible. | Secret scanning / redaction tests. | yes |
| RISK-010 | Check runner executes unsafe code. | security | high | low-medium | Approved adapters only; no arbitrary code execution in MVP unless sandboxed; record skipped unsafe checks. | Use non-executable toy checks or critic evidence. | Unsafe check request should be rejected. | yes |
| RISK-011 | SSE stream loses events or diverges from replay. | data/frontend | medium | medium | SSE is delivery channel only; event log is authoritative; client can resync from `lastEventId` or replay endpoint. | Fall back to polling/reload projection. | Disconnect/reconnect stream smoke. | yes |
| RISK-012 | Langfuse Cloud unavailable during demo. | observability/demo | medium | medium | Store Doppl event IDs, provider metadata, model IDs, token estimates locally. | Continue demo from Postgres event log; upload traces later. | Run with Langfuse disabled. | yes |
| RISK-013 | Neo4j spike distracts from MVP. | scope | medium | medium | Timebox spike and keep Neo4j derived/non-authoritative. | Defer after interface is proven. | Spike exit criteria. | yes |
| RISK-014 | Team splits across surfaces before contracts are stable. | execution | high | medium | Freeze shared schemas/interfaces first; contract tests. | Merge under runtime owner temporarily. | Contract test suite and architecture review. | yes |
| RISK-015 | Hosted deployment consumes too much time. | demo/scope | medium | medium | Local-first reliability; hosted optional path. | Local demo with replay. | Local full rehearsal before hosted polish. | yes |

### Trust Boundaries

| Boundary | What Crosses It | Controlled By | Validation | What Can Go Wrong | Logs / Auditability | Secrets / Sensitive Data | Mitigation |
|---|---|---|---|---|---|---|---|
| Browser -> API | run commands, config, stop requests | operator/browser, backend | request schema, cap max validation | invalid caps, duplicate starts, unauthorized command | command events, API logs | no provider keys | REST validation and idempotency |
| API -> Runtime worker | run jobs, generation commands | backend/runtime | state-machine checks | duplicate/missing work | event log | no provider keys in payloads | idempotency keys and terminal-state checks |
| Runtime -> ModelGateway | prompts, schemas, model role requests | runtime/model adapter | schema construction, model capability checks | prompt injection, route mismatch | event log + Langfuse trace IDs | provider keys server-side only | provider adapter boundary, redaction |
| ModelGateway -> OpenRouter/providers | model requests/responses | adapter/external provider | response schema validation | malformed output, latency, cost, rate limits | Langfuse + local metadata | provider API keys | retries, repair/reject path, caps |
| Runtime -> Event store | authoritative events | runtime/persistence | event schema, append-only constraints | missing/corrupt events | Postgres event log | no secrets | transactions, validation, replay tests |
| Event store -> Projections/UI | read models, graph nodes/edges | projection builder/frontend | projection schema | stale/incorrect dashboard | rebuild logs | no secrets | event log source of truth, resync |
| Runtime -> Check runners | check inputs, candidate evidence | verifier/check subsystem | allowlist and input schema | unsafe execution, unreliable checks | check result events | no provider keys unless adapter needs them | sandbox/adapter-only checks, skipped-check records |
| Doppl -> Langfuse Cloud | traces, spans, prompts/outputs metadata | observability adapter/external Langfuse | redaction and trace metadata schema | sensitive data leak, external outage | Langfuse + local trace IDs | no secrets | minimize sensitive payloads, local fallback |
| Event export -> Neo4j spike | lineage graph nodes/edges | spike script/graph DB | projection schema | graph drift from truth | export logs | no secrets | derived-only, never authoritative |

### Security Decisions

[locked decision] Treat every model output as untrusted until schema-validated.

[locked decision] Provider credentials remain server-side and never enter prompts, event payloads, traces, or dashboard responses.

[locked decision] Prompt/tool permissions are part of the agenome but enforced by runtime/model gateway allowlists, not by prompt instruction alone.

[locked decision] Check runners are adapter-based; arbitrary code execution is out of MVP scope unless sandboxed and explicitly approved.

[locked decision] Event log immutability is a security and auditability requirement.

[locked decision] SSE is a read channel for event delivery; REST commands remain the write/control path.

### MVP Security Simplifications

[scope simplification] Product-level multi-user auth, workspaces, and admin roles are deferred.

[production-hardening] If hosted deployment exposes the app publicly, add thin deployment-level access control before showcase.

[production-hardening] Full secrets rotation workflows, audit admin, production alerting, and rollback are deferred unless required by hosting environment.

