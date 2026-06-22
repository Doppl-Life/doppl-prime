# /tdd brief — sv5_projection_reconcile

## Feature
Reconcile the demo backend projections (built at sv2) to the integrated **sv5** contract surface — all **ADDITIVE** (the demo CONSUMES the new events/statuses, emits none). Three projection surfaces gain sv5 handling: (1) **current-state reducer (P6.2)** — a new `judge.reviewed`→`JudgeResult` branch (else the held-out judge's authoritative output folds to a no-op) plus the four new sv5 **terminal** event transitions (`run.cancelled`, `generation.skipped`, `agenome.failed`, `candidate.rejected`); (2) **lineage-graph (P6.3)** — the judge result rendered as a `score`-type node (closed-6 `LineageNodeType` has no `judge`); (3) **run-health (P6.8)** — the `judge.review_started`↔`judge.reviewed` in-flight pairing (previously excluded as "sv3-reconcile"). The sv4 statuses `GenerationStatus:'degraded'` / `CandidateStatus:'repairing'` have **no dedicated event type** (kernel-internal §3 state-machine states) — the projection adds **no** transition for them; their display coverage is the web status-map's job (demo-029).

## Use case + traceability
- **Task ID:** P6.2 (current-state), P6.3 (lineage), P6.8 (run-health) — sv5-reconcile extension of all three.
- **Architecture sections it implements:** `ARCHITECTURE.md §9` (current-state projection over the canonical set), `§10` (LineageGraphProjection), `§11` (run-health runtime signal). Consumes the frozen `§4` event model (the 4 new terminal `RunEventType` members + `judge.reviewed`←`JudgeResult` per-type payload map) and the `§7` held-out-judge `JudgeResult` shape — both frozen in `packages/contracts` (sv5), CONSUMED read-only here.
- **Related context:** the merge `da6ef82` landed cody-sv5 into track/demo (`CURRENT_SCHEMA_VERSION=5`). LESSONS §51 (pure ordered fold), §53 (reducer injected into the fold — the event→entity-transition map grounded in the FROZEN status enums), §54 (lineage = pure transform; render-graph drops dangling edges; non-node concepts encoded as status/metric on the closed node-type set — judge→`score`), §58 (run-health = count-based unpaired markers). The current-state, run-health code already carry explicit `sv3-reconcile`/`judge EXCLUDED` breadcrumbs at the exact extension points.

## Acceptance criteria (what "done" means)
- [ ] **`judge.reviewed` projects the `JudgeResult`** verbatim into a new `CurrentState.judgeResults: Record<string, JudgeResult>` row keyed by `JudgeResult.id` (mirrors `noveltyScores`/`fitnessScores` — payload validated at the append boundary, read VERBATIM, rule #7 never re-judged). `emptyCurrentState()` seeds it.
- [ ] **The four new sv5 terminals move the affected entity to its frozen terminal status:** `run.cancelled`→ run `'cancelled'`; `generation.skipped`→ generation `'skipped'`; `agenome.failed`→ agenome `'failed'`; `candidate.rejected`→ candidate `'rejected'` (mirrors `candidate_invalidated`→`'invalid'`).
- [ ] **`degraded`/`repairing` add NO reducer transition** — no event type carries them (kernel-internal §3 states); a test documents that an event stream cannot drive a generation/candidate to those statuses through the projection (they remain reachable only via the frozen enum, surfaced by the web status-map demo-029).
- [ ] **Lineage:** each `JudgeResult` yields one `type:'score'` node (`label` carries `acceptance`; `metrics.acceptance`; `dataRef`=`JudgeResult.id`) + a guarded structural edge `candidate → judge` (`type:'judged_by'`, `struct:`-prefixed id, emitted only when both endpoint nodes exist — dangling-edge guard, LESSONS §54).
- [ ] **Run-health:** `judge` joins `OPERATION_PAIRS` as `['judge.review_started','judge.reviewed']` so an unpaired `judge.review_started` counts as one operation-in-flight and pairs to zero on `judge.reviewed`; the `sv3-reconcile`/`judge EXCLUDED` comments are removed.
- [ ] **Idempotent re-fold preserved** (re-applying the same sv5 event sets the same keyed row — never double-counts) and **replay-equivalence preserved** (the new branches are pure folds over the persisted log, import no provider — rule #7; the existing replay-summary state-equivalence test stays green).
- [ ] All affected unit tests pass (`apps/api/test/unit/projections/{current-state,lineage-graph}.test.ts`); run-health is `apps/api/test/integration/routes/run-health.test.ts` (real-Postgres path — keep it on the real store, no mocks) OR its unit-level builder test if present; **both unit + integration counts reported**; `/preflight` clean.

## Wiring / entry point (Step 7.5)
**No new route — the new reducer branches compose into already-wired build paths.** `judge.reviewed` + the 4 terminals fold through the existing composed `currentStateReducer` (`lifecycleReducer`/`entitiesReducer`); the judge `score` node rides `buildLineageGraph`; the judge pairing rides `buildRunHealth`. These are reached in production via the existing **P6.7 GET read endpoints** (`GET /runs/:id`, `/lineage`) and **P6.8 `GET /runs/:id/health`** — each rebuilds-on-read from `readByRun`. Confirm at Step 7.5 that the new branches are exercised through `buildCurrentState`/`buildLineageGraph`/`buildRunHealth`, not just a bare reducer call.

## Files expected to touch
**Modified:**
- `apps/api/src/projections/reducers/state.ts` — add `judgeResults: Record<string, JudgeResult>` to `CurrentState` + `emptyCurrentState()`; import `JudgeResult`.
- `apps/api/src/projections/reducers/lifecycle.ts` — `run.cancelled`→`'cancelled'` (RUN_TRANSITIONS); `generation.skipped`→`'skipped'` (GENERATION_TRANSITIONS); `agenome.failed`→ agenome `'failed'` (new branch).
- `apps/api/src/projections/reducers/entities.ts` — `judge.reviewed`→ store `JudgeResult`; `candidate.rejected`→ candidate status `'rejected'`.
- `apps/api/src/projections/lineage-graph.ts` — judge `score` node + guarded `judged_by` edge.
- `apps/api/src/projections/run-health.ts` — add `judge` to `OPERATION_PAIRS`; drop the sv3-exclusion comments.
- Tests: `apps/api/test/unit/projections/{current-state,lineage-graph}.test.ts`, `apps/api/test/integration/routes/run-health.test.ts` (+ unit run-health builder test if one exists).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
In `apps/api/test/unit/projections/current-state.test.ts`:
1. **`test_judge_reviewed_projects_judge_result`** — Asserts: a `judge.reviewed` event with a valid `JudgeResult` payload yields `state.judgeResults[id]` equal to the payload VERBATIM. Why: §4 per-type payload map (`judge.reviewed`←`JudgeResult`) + rule #7 (read-back, never re-judge).
2. **`test_sv5_terminals_set_terminal_status`** — Asserts: `run.cancelled`→run `'cancelled'`, `generation.skipped`→generation `'skipped'`, `agenome.failed`→agenome `'failed'`, `candidate.rejected`→candidate `'rejected'`. Why: §3 terminal state machines / §9 projection of terminal status.
3. **`test_degraded_repairing_have_no_event_transition`** — Asserts: no event type folds a generation to `'degraded'` or a candidate to `'repairing'` (the reducer leaves status unchanged) — documents the kernel-internal §3 nature. Why: §3 (those statuses are state-machine-internal; no `RunEventType` carries them).
4. **`test_sv5_refold_idempotent`** — Asserts: re-applying a judge.reviewed / terminal event sets the same row (no duplicate/double-count). Why: §9 idempotent re-fold (LESSONS §53).

In `apps/api/test/unit/projections/lineage-graph.test.ts`:
5. **`test_judge_renders_as_score_node`** — Asserts: a `JudgeResult` in current-state yields a `type:'score'` node (no 7th `judge` type) with `metrics.acceptance` + `dataRef`=id. Why: §10 closed-6 `LineageNodeType` (LESSONS §54 — encode non-node concepts as status/metric).
6. **`test_judge_edge_guarded_and_prefixed`** — Asserts: a `candidate → judge` `judged_by` edge is emitted only when the candidate node exists, with a `struct:`-prefixed unique id. Why: §10 dangling-edge guard + unique-edge-id (LESSONS §54).

In `apps/api/test/integration/routes/run-health.test.ts` (real Postgres):
7. **`test_judge_in_flight_pairing`** — Asserts: an unpaired `judge.review_started` counts 1 operation-in-flight under `byType.judge`; adding the `judge.reviewed` pairs it to 0. Why: §11 run-health unpaired-marker counting (LESSONS §58).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none to any frozen Appendix-A contract. `CurrentState` gains `judgeResults` — but `CurrentState` is an **apps/api-INTERNAL** read shape (documented in `state.ts`), NOT an Appendix-A model → no cross-doc table row, no schema-snapshot.
- **Orchestrator doc rows to write hot (Step 9 routing):** none expected. `JudgeResult` + the per-type payload map (`judge.reviewed`←`JudgeResult`) are already in the `apps/api/CLAUDE.md` cross-doc table (landed with the merge). Flag at Step 9 only if a genuine new invariant surfaces.
- **§2.5-seam (shared-contract) model touched?** No — this slice CONSUMES frozen `JudgeResult`/`RunEventType`/status enums read-only; it defines no Appendix-A shape. No schema-snapshot test required here (the contract snapshots live in `packages/contracts` and are green).

## Things to flag at Step 2.5
1. **`judge.reviewed` home — a new `judgeResults` row, or project onto the candidate?** My default vote: **a new `judgeResults: Record<id, JudgeResult>` row** mirroring `noveltyScores`/`fitnessScores` (the judge↔candidate link is by `candidateId`, queryable; never a duplicate authoritative copy — rule #6).
2. **`degraded`/`repairing` reducer handling — add a transition or not?** My default vote: **no transition** — no `RunEventType` carries them (verified against the sv5 registry); they're kernel-internal §3 states. Add the documenting test (#3) so the decision is pinned, not silent.
3. **Judge lineage node type.** My default vote: **`score`** (closed-6 `LineageNodeType` has no `judge`; the judge is an acceptance score — like fitness). Edge `candidate → judge` typed `judged_by`.
4. **`candidate.rejected` vs `culled`/`invalid`.** My default vote: **a distinct `'rejected'` terminal** via the entities reducer (mirrors `candidate_invalidated`→`'invalid'`); `rejected` is already a frozen `CandidateStatus` value.

## Dependencies + sequencing
- **Depends on:** the merge `da6ef82` (sv5 contracts in tree — landed); P6.2/P6.3/P6.8 sv2 surfaces (shipped).
- **Blocks:** the demo→cody integration preflight (this is the sv5 reconcile that must be green before the integration merge back).
- **Parallel with:** demo-029 (web status-map sv5) — independent code area, no shared file.

## Estimated commit count
**1.** One logical unit — "teach the demo projections about sv5" — across three tightly-coupled projection surfaces, all ADDITIVE, none touching a safety invariant (pure derived read-model folds; no new authoritative write, the held-out judge's authority/immutability is untouched — we only PROJECT its emit-only output). Bundle per the standing bundle-where-safe directive. (If the implementer prefers, current-state+lineage can split from run-health, but one `feat(projections): sv5 reconcile` commit is the clean default.)

## Lessons-logged candidates anticipated
- **Convention candidate** — "An sv-skew projection reconcile is ADDITIVE-only when the downstream consumes-not-emits: new event types → keyed rows / terminal transitions; new internal-only statuses (no event) → no reducer transition, display-layer covers them; pin the no-transition decision with a test."
- **Architecture-doc note candidate** — clarify (§9/§3) that `degraded`/`repairing` are state-machine-internal statuses with no `RunEventType`, so the projection never surfaces them (only the kernel's live worker would, out of band).
