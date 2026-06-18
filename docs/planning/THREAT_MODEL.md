# Doppl Threat Model

Source PRD: `Doppl_Capstone_Proposal.pdf`

## Scope

This threat model is sized to the confirmed MVP/prototype posture. It covers the demo/runtime path, provider integration, event log, dashboard, check runners, Langfuse Cloud correlation, and graph projections. Product-level multi-user auth and production operations are deferred unless required by hosting.

## Assets

| Asset | Why It Matters |
|---|---|
| Provider API keys | Unauthorized use can create cost and data exposure |
| Run event log | Source of truth for replay, audit, and demo evidence |
| Candidate ideas and critic evidence | Product output and evaluation surface |
| Scoring policy | Selection pressure and winner legitimacy |
| Model prompts and structured schemas | Control model behavior and output validity |
| Langfuse traces | Useful debug data that may contain prompt/output content |
| Dashboard projections | Reviewer-facing proof surface |
| Check runner adapters | Potential execution/security boundary |

## Trust Boundaries

| Boundary | Threats | Controls |
|---|---|---|
| Browser to API | invalid commands, duplicate starts, unauthorized hosted access | request validation, idempotency, thin deployment access if hosted |
| API to runtime worker | duplicate jobs, terminal-state mutation | state machine guards, idempotency keys, event sequence checks |
| Runtime to ModelGateway | prompt injection, model route mismatch, schema failure | capability matrix, schema validation, prompt isolation |
| ModelGateway to OpenRouter/providers | provider outage, malformed output, cost blowup | caps, retries, fallback routes, repair/reject path |
| Runtime to event store | event loss, non-append mutation | append-only writes, schema validation, transaction boundaries |
| Event store to projections/UI | stale/misleading display | rebuildable projections, sequence tracking, SSE resync |
| Runtime to check runners | unsafe executable checks | adapter allowlist, sandbox requirement before arbitrary execution |
| Doppl to Langfuse Cloud | sensitive prompt/output leakage, external outage | redaction, local trace metadata fallback, no secrets in traces |
| Projection export to Neo4j | graph drift from truth | derived-only export, event log remains authoritative |

## Threats And Mitigations

| ID | Threat | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| T-001 | Agenome prompt attempts to bypass energy/tool caps | medium | high | Runtime enforces caps outside prompts |
| T-002 | Candidate text prompt-injects critic council | medium | medium-high | Critics receive candidate as data; structured rubric; no tool authority |
| T-003 | Model output violates schema | high | high | Strict structured output where supported; Zod/JSON schema validation; repair/reject events |
| T-004 | Provider credentials leak to prompts/events/traces | low-medium | high | Server-only env vars; redaction; secret scanning |
| T-005 | Check runner executes unsafe candidate-proposed code | low-medium | high | No arbitrary code execution in MVP unless sandboxed; approved adapters only |
| T-006 | Scoring policy is altered by agents/critics | low | high | Policy version controlled by runtime/config; agents emit evidence only |
| T-007 | Event log tampering invalidates replay | low | high | Append-only model; no in-place historical edits; audit events for annotations |
| T-008 | SSE drops events and dashboard misleads reviewers | medium | medium | Event log is source of truth; client can resync from last sequence |
| T-009 | Langfuse Cloud outage breaks observability | medium | medium | Local trace metadata in Postgres; demo continues from event log |
| T-010 | Hosted deployment exposed publicly without access gate | medium | medium | Add thin deployment-level access control if hosted URL is public |

## Security Requirements

[locked decision] Treat model outputs as untrusted until validated.

[locked decision] Provider keys never enter prompts, event payloads, Langfuse traces, or frontend responses.

[locked decision] Runtime-enforced caps are required and cannot be controlled by agenome prompt text.

[locked decision] Event log is append-only and authoritative.

[locked decision] Check runners must be allowlisted adapters; arbitrary code execution is deferred unless sandboxed.

## Deferred Production Hardening

[deferred work] Product-level user accounts, workspace roles, admin audit UI, secrets rotation workflows, deployment rollback, production alerts, and long-term monitoring.

[production-hardening] If hosted demo is public, add thin access control before showcase.

