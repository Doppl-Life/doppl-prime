# Session demo-004 — sv5 projection reconcile (judge.reviewed + 4 terminals + judge lineage/health)

**Date:** 2026-06-22
**Track:** demo · **Area:** backend (`apps/api`) · **Phase:** 6 (projections, API & observability) — sv5-reconcile extension of P6.2/P6.3/P6.8
**Role:** implementer (demo-observability-implementer)
**Predecessor:** [demo-003](demo-003-2026-06-22-phase6-complete-sse-observability-neo4j.md) (round-3 — Phase 6 complete)
**Successor:** _(next backend session)_
**Round:** 4 (demo→cody integration; sealed at this `/session-end` + the orchestrator's `/orchestrate-end`)

## Why this session existed
Round-4 is the demo→cody integration. The cody→track/demo merge (`da6ef82`) landed the integrated **sv5** contract surface (`CURRENT_SCHEMA_VERSION=5`): the held-out-judge output (`judge.reviewed`←`JudgeResult`, sv3/P0.16), the sv4 internal statuses (`GenerationStatus:'degraded'` / `CandidateStatus:'repairing'`), and four new sv5 terminal `RunEventType` members (`run.cancelled` / `generation.skipped` / `agenome.failed` / `candidate.rejected`). The demo's three read-projections were built at sv2 and silently no-op'd the new events. This session reconciles them — **ADDITIVE only** (the demo CONSUMES the new events/statuses, emits none) — and closes the long-standing "sv3/P0.16 reconcile = demo→cody-merge item."

## What was built

### Files modified
- `apps/api/src/projections/reducers/state.ts` — added `judgeResults: Record<string, JudgeResult>` to `CurrentState` + seeded it in `emptyCurrentState()`; imported `JudgeResult`. (`CurrentState` is an apps/api-INTERNAL read shape, not an Appendix-A contract.)
- `apps/api/src/projections/reducers/lifecycle.ts` — `run.cancelled`→run `'cancelled'` (RUN_TRANSITIONS), `generation.skipped`→generation `'skipped'` (GENERATION_TRANSITIONS), new `agenome.failed`→agenome `'failed'` branch (mirrors the `agenome.reproduced` update-or-materialize pattern, preserving the existing generation identity).
- `apps/api/src/projections/reducers/entities.ts` — `judge.reviewed`→ store the `JudgeResult` VERBATIM keyed by id in `judgeResults` (mirrors `noveltyScores`/`fitnessScores`; rule #7 read-back, never re-judged); `candidate.rejected`→ candidate `'rejected'` (mirrors `candidate_invalidated`→`'invalid'`; envelope `candidateId`, no-op if the candidate isn't materialized).
- `apps/api/src/projections/lineage-graph.ts` — each `JudgeResult` renders as a closed-set `type:'score'` node (`label` carries acceptance, `metrics.acceptance`, `dataRef`=`JudgeResult.id`) + a guarded `candidate → judge` `'judged_by'` edge via the existing `linkStructural` (`struct:`-prefixed id; dropped when the candidate node is absent — dangling-edge guard, LESSONS §54).
- `apps/api/src/projections/run-health.ts` — `judge` joins `OPERATION_PAIRS` as `['judge.review_started','judge.reviewed']`; the prior `sv3-reconcile` / `judge EXCLUDED` comments removed.
- Tests: `test/unit/projections/current-state.test.ts` (+4), `test/unit/projections/lineage-graph.test.ts` (+2), `test/integration/routes/run-health.test.ts` (+1, real Postgres).

### Commit this session
- `bb2d75c` feat(projections): sv5 reconcile — judge.reviewed + 4 terminals + judge lineage/health (P6.2/P6.3/P6.8)

## Decisions made
- **`judge.reviewed` home = a new `judgeResults` row** (not projected onto the candidate) — mirrors `noveltyScores`/`fitnessScores`; the judge↔candidate link stays queryable by `candidateId`, never a duplicate authoritative copy (rule #6). _(Step-2.5 flag #1, default vote)_
- **`degraded`/`repairing` add NO reducer transition** — no `RunEventType` carries them (verified against the closed 41-member sv5 registry); they are kernel-internal §3 state-machine states, surfaced only by the live worker out-of-band and by the web status-map (demo-029). Pinned by `test_degraded_repairing_have_no_event_transition`, exhaustive over all 41 `RunEventType.options`. _(Step-2.5 flag #2, default vote)_
- **Judge lineage node = `score`** (the closed-6 `LineageNodeType` has no `judge`; the judge is an acceptance score, like fitness — LESSONS §54), edge `candidate → judge` typed `'judged_by'`. _(Step-2.5 flag #3, default vote)_
- **`candidate.rejected` = a distinct `'rejected'` terminal** via the entities reducer (mirrors `candidate_invalidated`; `'rejected'` is already a frozen `CandidateStatus`), not folded into `culled`/`invalid`. _(Step-2.5 flag #4, default vote)_
- **`agenome.failed` = a new lifecycle branch** (not a transition-table entry) — it's an agenome-keyed update like `agenome.spawned`/`agenome.reproduced`, so it follows that update-or-materialize shape rather than the run/generation transition maps.

## Decisions explicitly NOT made (deferred)
- **Live-producer emission of the new terminals (P3/integration):** the kill switch emits `run.cancelled`/`generation.skipped` (named in the sv5 contract), while `agenome.failed`/`candidate.rejected` are "loop P3.10 emission, deferred" per the frozen contract. The projection CONSUMES all four ahead of the live producer (same build-ahead posture as P6.1/P6.10) — exercised vs. synthetic event streams here; a real run drives them when the P3 worker/kill-switch emission lands. Not a wiring gap on the read side.
- **Web display of `degraded`/`repairing`** — the web status-map's job (demo-029, parallel slice, independent code area).

## TDD compliance
**Clean — no violations.** Every test was written first (Step 2) and reviewed at Step 2.5 before GREEN. RED confirmed for the right reason: 5 of the 6 new unit tests failed on the missing `judgeResults` field / unhandled `run.cancelled` / absent judge node+edge; `test_degraded_repairing_have_no_event_transition` is a documenting guard that is green by design (no event type produces those statuses) and stays green through the implementation; the integration `test_judge_in_flight_pairing` went RED→GREEN against real Postgres. No after-the-fact tests; no safety-critical skip.

## Cross-doc invariant audit (multi-track — memory check)
**No frozen Appendix-A model field changed this session.** `CurrentState` gained `judgeResults`, but `CurrentState` is an apps/api-INTERNAL read shape (documented in `state.ts`), NOT an Appendix-A contract → no cross-doc table row, no schema-snapshot. Flagged at Step 9; the orchestrator confirmed "Cross-doc invariant: NONE." `judge.reviewed`←`JudgeResult` + the per-type payload map are already in the `apps/api/CLAUDE.md` cross-doc table (landed with the `da6ef82` merge). No drift.

## Reachability
- **judge.reviewed + the 4 terminals** (current-state reducer) — reachable from `buildServer` (prod Fastify) → `GET /runs/:id` / `/lineage` / `/candidates/:cid` (`routes/runs-read.ts`) + `GET /runs/:id/health` (`routes/run-health.ts`), each rebuilding-on-read from `readByRun` via the composed `currentStateReducer`. Unit tests exercise the composed `buildCurrentState`/`buildLineageGraph` (not bare reducer calls).
- **judge `score` node + `judged_by` edge** — reachable via `buildLineageGraph` at `runs-read.ts` `GET /lineage`.
- **judge pairing** — reachable via `buildRunHealth` at `run-health.ts` `GET /runs/:id/health`; the integration test exercises this path end-to-end through the real server.
- No tested-but-unwired gaps on the read side. (Producer-side emission of the terminals is the named P3 deferral above, not a read-projection wiring gap.)

## Open follow-ups
Step-9 categorized list (all routed hot to the orchestrator during the session; recorded here for the round):
- **Convention candidate** → orchestrator banking as `apps/api` LESSONS §62: "an sv-skew projection reconcile is ADDITIVE-only when the downstream consumes-not-emits — new event types → keyed rows / terminal transitions; new internal-only statuses (no event) → NO reducer transition, pin with a test."
- **Architecture-doc note** → orchestrator's round §3 edit: clarify §9/§3 that `degraded`/`repairing` are state-machine-internal statuses with no `RunEventType`, so the projection never surfaces them (only the live worker would, out of band).
- **Cross-doc invariant change** → NONE (confirmed; `CurrentState` is apps/api-internal).
- **Carry-forward** → this slice CLOSES the "sv3/P0.16 reconcile = demo→cody-merge item"; the orchestrator deletes it + ticks the P6.2/P6.3/P6.8 sv5 portions at `/orchestrate-end`. Unblocks the demo→cody integration preflight.
- **Future TODO (producer-side, belongs to P3):** live-worker/kill-switch emission of the four sv5 terminals — the projection consumes them ahead (see Decisions NOT made).

## Preflight status
- **My code area is CLEAN** — `apps/api`: lint ✓ / format:check ✓ / typecheck ✓; unit **365**, integration **79** (both GREEN). `format:check` caught 2 of my own test files in the per-slice gate (LESSONS §61) and they were normalized in-slice before the commit.

## Phase status
**Phase 6 sv5-reconcile portion COMPLETE** (P6.2/P6.3/P6.8 sv5 extensions). Phase 6 was already gate-CLEAR at round 3; this round adds the additive sv5 consumption needed for the demo→cody integration merge-back.

## Suite deltas (this session)
- apps/api unit: **359 → 365** (+6: 4 current-state, 2 lineage-graph).
- apps/api integration: **78 → 79** (+1: judge in-flight pairing, real Postgres).
