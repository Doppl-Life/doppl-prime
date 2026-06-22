# Session demo-002 — Run-health projection + GET /runs/:id/health (P6.8)

- **Date:** 2026-06-21
- **Phase:** Phase 6 (Projections, API & observability) — demo track, `apps/api` — round 2
- **Role:** demo-observability-implementer (backend / `apps/api`)
- **Branch:** `track/demo` (shared worktree with demo-web-implementer)
- **Predecessor:** `demo-001-2026-06-21-projections-serve-layer.md`
- **Successor session:** `demo-003-2026-06-22-phase6-complete-sse-observability-neo4j.md`

## Why this session existed

Round 2 of the demo-track backend (continuous-roll). Added the **runtime-signal endpoint** so the
operator can judge continue-vs-switch-to-replay within the demo window: a read-only run-health
projection derived purely from the event log + `GET /runs/:id/health` on the P6.6 Fastify server. The
round closed at the **ACTION context-cycle threshold** after P6.8; P6.9 (SSE) was abandoned clean at
Step-0/RED (nothing committed) and carries to round 3.

## What was built
- **P6.8 run-health projection + endpoint** — commit `c0a8d23`.

### Files created
- `apps/api/src/projections/run-health.ts` — `buildRunHealth(events)` + `RunHealth`/`CapUsage`/`CapsConsumed` types. Derives status, generationCount, candidatesInFlight (non-terminal), operationsInFlight (count-based unpaired markers), lastEventAt, capsConsumed (clamped to ceiling) — purely from the folded log (no provider).
- `apps/api/src/routes/run-health.ts` — `GET /runs/:id/health` (rebuild-on-read; unknown→404; read-only).
- `apps/api/test/unit/projections/run-health.test.ts` — pairing / caps-clamp / candidates / null-caps unit tests.
- `apps/api/test/integration/routes/run-health.test.ts` — endpoint tests (testcontainers + Fastify inject).

### Files modified
- `apps/api/src/server.ts` — register the health route on `buildServer`.
- `apps/api/src/projections/index.ts` — barrel export `run-health`.

## Decisions made
- **operations-in-flight = count-based unpaired markers** (`count(*_started) − count(completion)`, clamped ≥0). Pairing map: candidate.generation_started↔candidate.created · critic↔reviewed · check↔completed · novelty↔scored · fusion.started↔agenome.fused · tool_call.started↔finished. Generation phase-markers (verifying/scoring/reproducing) excluded (durable GenerationStatus, already in current-state).
- **caps-consumed clamped** `min(consumed, ceiling)` — never over-reports vs the enforced `RunCaps` (read from `run.configured`); null if no caps configured.
- **candidatesInFlight** = candidates whose status ∉ {selected,rejected,culled,invalid}.
- **RunHealth shape apps/api-internal** (named `CapsConsumed`, not a `Record`, for ergonomic typed access).

## Decisions explicitly NOT made (deferred)
- **judge in-flight pairing** (`judge.review_started`↔`judge.reviewed`, sv3/P0.16 absent on track/demo) — EXCLUDED from operations-in-flight; **sv3-reconcile** (lead-ratified deferral to the demo→cody merge; orchestrator escalating the contract-sync).
- **failed/aborted-op decrement** — a start whose completion never comes (provider_call_failed) stays counted under pure count-based pairing (matches the literal "unpaired" spec). Accepted MVP; a failure-decrement is a cheap future refinement if it reads misleading.
- **Promote RunHealth to a shared contract** — only if the P7.14 health panel needs a pinned shape.

## TDD compliance
**Clean.** P6.8 was test-first (unit 5/5 RED confirmed on the missing symbol before GREEN; integration via real PG + Fastify inject). Two GREEN-phase fixes (named `CapsConsumed` type for typecheck; valid `CriticReview` payload for the high-traffic completion append) — both test-driven, no post-hoc test writing.

## Cross-doc invariant audit
**Clean.** P6.8 added no frozen Appendix-A model fields (derives from the log; consumes `RunCaps` read-only). `RunHealth`/`CapUsage`/`CapsConsumed` are apps/api-internal (Step-9 noted; not a contract). Orchestrator's LESSONS §34 (run-health) hot edit present in the shared tree.

## Reachability
- **buildRunHealth → GET /runs/:id/health** registered on `buildServer`, exercised via Fastify inject — WIRED (HTTP).
- First consumers: the operator (continue-vs-replay) + P7.14 health panel + P7.4 live-RunStatus seam — at integration (named, deferred).

## Open follow-ups
- **judge pairing → sv3-reconcile** (orchestrator escalating the judge.reviewed contract-sync).
- **failed-op-in-flight decrement** — cheap refinement, deferred.
- **P6.9 (SSE run-event stream) carried to round 3** — abandoned clean at the ACTION cycle (Step-0/RED only, no commit, no source written; brief demo-014 stands; task #14 set back to pending/unclaimed). A fresh impl re-does it from the brief.
- (Round-1 carry-forwards from demo-001 remain as recorded: §14/bodyLimit/IDs-opaque consumed; P3/P4/P5 integration-reconciles.)

## How to use what was built
- `buildRunHealth(events)` → the runtime signal (pure, from `readByRun`).
- `GET /runs/:id/health` → the same, served fresh-on-read; 404 on unknown run.
