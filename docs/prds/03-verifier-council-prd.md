# PRD 03: Verifier Council

## Purpose

Evaluate candidates through structured critics, subtype checks, retrieval grounding, and the held-out final judge. The verifier council creates evidence; it never chooses winners or mutates lineages.

## Spec Anchors

- `ARCHITECTURE.md §6` gateway and retrieval grounding
- `ARCHITECTURE.md §7` verifier council and held-out judge
- `ARCHITECTURE.md §14` prompt injection and check-runner safety
- `IMPLEMENTATION_PLAN.md P4`

## Owner Surface

Verifier council.

## Consumes

`CandidateIdea`, subtype payloads, `EvidenceRef`, `CriticReview`, `CheckResult`, ModelGateway contracts, held-out judge configuration, and retrieval corpus contracts.

## Produces

- `critic.reviewed` events.
- `check.completed` events.
- Held-out judge evidence referenced by scoring.
- Persisted retrieval/prior-art evidence.

## Requirements

- Implement closed critic mandates: factual grounding, novelty/prior art, feasibility, falsification, and subtype-specific review.
- Keep critic output structured and schema-validated.
- Persist all evidence references inside the Postgres/event/projection tier.
- Implement check-runner allowlist with no arbitrary code execution for MVP.
- Support both required subtypes equally: `cross_domain_transfer` and `zeitgeist_synthesis`.
- Persist retrieval and web-search results into originating events so replay does not re-call the web.
- Keep held-out `final_judge` outside the breeding loop with an immutable fixed rubric.
- Treat candidate text as data, never as instructions to critics, tools, or scoring policy.

## Non-Goals

- Selecting winners.
- Changing scoring weights.
- Mutating candidates, agenomes, or lineage.
- Executing arbitrary transferred code.
- Depending on Langfuse as an evidence store.

## Handoffs

- To selection: complete structured review/check/judge evidence plus degraded/skipped statuses where appropriate.
- To demo: evidence references that resolve in inspector and proof panels.
- To kernel: failure and schema-rejection events for runtime bookkeeping.

## Exit Gate

- Every critic mandate can produce a valid `CriticReview`.
- Every subtype can produce valid pass/fail/skipped `CheckResult` evidence.
- Held-out judge output is immutable to agents and available to scoring.
- Prompt-injection tests show candidate text cannot alter reviewer roles, tools, caps, or rubric.
- Replay of verifier evidence requires no web calls or model calls.

