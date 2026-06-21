# /tdd brief — current_state_projection

## Feature
The concrete **current-state projection** over the canonical table set, built **on top of P6.1's `buildProjection`** (inject a reducer; do not re-fold by hand). It folds the closed `RunEventType` stream into current-state rows for `runs`, `generations`, `agenomes`, `candidate_ideas`, `critic_reviews`, `check_results`, `fitness_scores`, `novelty_scores`, `lineage_edges`: terminal/failure events move the affected run/generation/agenome into their correct terminal status; re-fold is **idempotent** (applying the same event twice / rebuilding never double-counts); `novelty_scores` reads the **persisted** vector + `embeddingModelId` + `dimension` from the `novelty.scored` payload and **never re-embeds** (rule #7, embeddings authoritative-once-computed). Any materialized `dashboard_snapshots` is rebuildable + watermark-tagged + **never read as a source of truth**.

## Use case + traceability
- **Task ID:** P6.2 (current-state projection over the canonical table set)
- **Architecture sections it implements:** `ARCHITECTURE.md §9` (the canonical projection/table set — `runs`/`generations`/`agenomes`/`candidate_ideas`/`critic_reviews`/`check_results`/`fitness_scores`/`novelty_scores`/`lineage_edges`/`embeddings`/`dashboard_snapshots`; **embeddings authoritative-once-computed** — persisted vector read back, never recomputed; any cached projection carries the `(runId, sequence)` watermark and is never authoritative).
- **Related context:** key safety rules **#2** (projections derived + rebuildable, never authoritative) and **#7** (no re-embed / no provider calls on the rebuild path). **Builds on P6.1** (`demo-001`, `7d2c6ec`): `buildProjection(events, reducer, initialState) → WatermarkedProjection<S>` + `canonicalize` + the schemaVersion/gap guards — this slice supplies the **reducer + initial state**, it does NOT re-implement the fold. Consumes the frozen status enums (`RunStatus`/`GenerationStatus`/`AgenomeStatus`/`CandidateStatus`/`CheckStatus`) + entity contracts (`Run`/`Generation`/`Agenome`/`CandidateIdea`/`CriticReview`/`CheckResult`/`NoveltyScore`/`FitnessScore`/`CullingEvent`) frozen in P0. **Integration slice** uses the real `append`/`readByRun` on the testcontainers harness (no mocks on the truth-log path).

## Acceptance criteria (what "done" means)
- [ ] A current-state reducer, **injected into P6.1's `buildProjection`**, folds the closed `RunEventType` stream into current-state rows for all 9 entities (`runs`, `generations`, `agenomes`, `candidate_ideas`, `critic_reviews`, `check_results`, `fitness_scores`, `novelty_scores`, `lineage_edges`)
- [ ] `novelty_scores` current-state reads the **persisted** `vector` + `embeddingModelId` + `dimension` from the `novelty.scored` payload verbatim and **never re-embeds** (no embedder/provider import — embeddings authoritative-once-computed, rule #7)
- [ ] Terminal/failure events (`run.failed`, `run.stopped`, `energy_exhausted`, `generation_failed`, etc.) move the affected run/generation/agenome into their **correct terminal status** (using the frozen status enums)
- [ ] **Idempotent re-fold:** applying the same event twice (or rebuilding from the log) does NOT double-count or duplicate rows — rows are keyed by id and set, not appended/incremented
- [ ] A non-current-state event (e.g. an operation-start / in-flight marker) folds to a **no-op** for the current-state rows rather than corrupting or rejecting the projection
- [ ] If `dashboard_snapshots` is materialized it is rebuildable from events + carries the `(runId, sequence)` watermark + is **never read as a source of truth** (materialization itself may defer — see Step-2.5 Q5; the never-authoritative posture is pinned regardless)
- [ ] The reducer/projection imports no `ModelGateway`/provider/embedding (rule #7, no-import structural test) and folds purely from the persisted log
- [ ] Unit tests (in-memory fixtures) **and** integration tests (testcontainers, real `append`/`readByRun`) pass; **both counts reported**; `/preflight` clean

## Wiring / entry point (Step 7.5)
**none — wiring lands in P6.7.** The current-state projection is consumed by the **P6.7 read endpoints** (`GET /runs`, `/runs/:id`, candidate projection) which serve it fresh-when-stale via P6.1's watermark/staleness; the **run-health** signal (P6.8) also derives from it. In THIS slice it's exercised against fixtures + the real `append`/`readByRun` on testcontainers. So: *first consumer — P6.7 read endpoints + P6.8 health; exercised now against the real event store.*

## Files expected to touch
**New:**
- `apps/api/src/projections/current-state.ts` — the current-state shape (typed per-entity record keyed by id) + the reducer + initial state, composed for `buildProjection`
- `apps/api/src/projections/reducers/` — per-entity-family reducer modules (one fold concern each), composed by `current-state.ts`
- `apps/api/test/unit/projections/current-state.test.ts` — per-entity fold + terminal-state + idempotency + no-reembed unit tests
- `apps/api/test/integration/projections/current-state.test.ts` — testcontainers (real PG): fold over the real appended log + rebuild-idempotent

**Modified:** none expected (consumes P6.1's `buildProjection` + the frozen contracts; **import, never re-fold/redefine**). If a needed status enum or entity type isn't exported from `@doppl/contracts`, flag at Step 9 (shared file).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

**Unit — `apps/api/test/unit/projections/current-state.test.ts`** (`spec(§9)`):
1. **`test_folds_each_entity_type`** — a fixture event stream produces correct current-state rows for all 9 entities (run.configured→run, generation.started→generation, candidate.created→candidate, critic.reviewed→critic_review, check.completed→check_result, novelty.scored→novelty_score, fitness.scored→fitness_score, reproduction/cull→lineage_edges, agenome events→agenome). Why: §9 canonical set. *(Positive guard.)*
2. **`test_terminal_events_move_to_terminal_state`** — `run.failed`/`run.stopped`→run terminal; `generation_failed`→generation terminal; `energy_exhausted`→affected run/agenome terminal (frozen status enums). Why: §9 terminal handling.
3. **`test_idempotent_refold`** — folding the same events twice (and a full rebuild) yields the identical current-state (keyed-by-id set; no double-count/dupe). Why: §9 idempotent rebuild.
4. **`test_novelty_reads_persisted_vector_no_reembed`** — `novelty.scored`→novelty_score row carries the persisted `vector`/`embeddingModelId`/`dimension` verbatim; no embedder/provider imported/called. Why: rule #7 authoritative-once-computed.
5. **`test_non_current_state_event_is_noop`** — an operation-start / in-flight marker folds to a no-op for current-state rows (no corruption, no reject). Why: §9 closed-stream tolerance.
6. **`test_projection_imports_no_provider`** — structural: the current-state module imports no `ModelGateway`/provider/embedding. Why: rule #7 (positive-guarded).

**Integration — `apps/api/test/integration/projections/current-state.test.ts`** (testcontainers, real PG):
7. **`test_fold_over_real_appended_log`** — append a realistic multi-entity event sequence via the **real** writer, `readByRun`, fold → correct current-state + `sequenceThrough`. Why: §9 over the real authoritative log.
8. **`test_rebuild_idempotent_over_real_log`** — re-fold from the real log → identical current-state (canonical-serialization equal). Why: §9 rebuildable + idempotent.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none** (consumes frozen entity/status contracts + P6.1's framework; defines an `apps/api`-internal current-state shape, not an Appendix-A model).
- **§2.5-seam touched?** No (consumes frozen models read-only; the current-state shape is `apps/api`-internal).
- **Orchestrator doc rows to write hot (Step 9):** possibly a **LESSONS** entry (the current-state reducer pattern over the P6.1 framework — keyed-by-id idempotent set, terminal-state transition map, no-reembed). I author hot. No cross-doc model row (no new contract).

## Things to flag at Step 2.5
1. **Current-state shape.** My default vote: a typed object `{runs: Record<id,RunRow>, generations: Record<id,…>, …}` keyed by id per entity family — set-by-id makes idempotency structural. Flag if you'd prefer a flat keyed map or a different shape.
2. **Reducer organization.** My default vote: **per-entity-family reducer modules** in `reducers/` (each owns its event→row folds), composed by `current-state.ts` into the single reducer passed to `buildProjection` — keeps each entity's logic isolated + unit-testable. Flag if you'd prefer one switch.
3. **Event→entity transition map (esp. terminal/failure).** My default vote: an **explicit map** from `RunEventType` to its entity transition; terminal/failure events set the affected entity's terminal status from the frozen enums (no ad-hoc strings). Confirm the terminal-event set (run.failed/stopped, energy_exhausted, generation_failed, candidate_invalidated, reproduction_aborted_insufficient_parents, …) maps to the right entity + status.
4. **No-reembed guard.** My default vote: the novelty reducer copies the persisted `vector`/`embeddingModelId`/`dimension` from the payload verbatim; pinned by a no-provider-import test + a value-equality test (stored vector === payload vector). Confirm.
5. **`dashboard_snapshots` materialization scope.** My default vote: **defer materialization** — P6.2 ships the in-memory current-state fold (watermark-tagged via `buildProjection`); persisting it to a `dashboard_snapshots` cache table is a later concern (P6.7 read-path / a caching slice). The tracker bullet is conditional ("when materialized"). Pin the never-authoritative posture; don't build the cache table here. Confirm the scope boundary.

## Dependencies + sequencing
- **Depends on:** **P6.1** (`buildProjection` + watermark/`canonicalize` — `7d2c6ec`, merged on this branch), P0 frozen entity/status contracts. **No live P3/P5 events needed** (fixtures via the real writer). Independent of the apps/web slices.
- **Blocks:** P6.3 (lineage projection — same framework), P6.4 (replay-summary), P6.7 (read endpoints serve this), P6.8 (health derives from it).

## Estimated commit count
**1.** Feature slice (concrete current-state reducers over the P6.1 framework). One coherent unit; **kept atomic, not bundled with P6.3/P6.4** — P6.2 is already large (9 entity reducers + terminal handling + idempotency), P6.3 touches the `LineageGraphProjection` §2.5 seam (needs its own schema-snapshot), and P6.4 is a replay-determinism slice (standalone per the brief-template pitfall). **Not a safety-invariant slice** (read-side derived projection; the rule-#7 no-reembed/no-provider property is structural, pinned by RED #4/#6). **Step-8 reviewers:** security-reviewer policy=invariant → not mandatory (no rule newly implemented); code-quality=phase-boundary.

## Lessons-logged candidates anticipated
- **Convention candidate** — "a concrete projection = a reducer injected into the P6.1 fold (never a hand-rolled fold): current-state rows keyed by id + set (idempotent re-fold), an explicit `RunEventType`→entity-transition map for terminal/failure states from the frozen enums, novelty read-back of the persisted vector (no re-embed, rule #7), non-current-state events fold to no-op."
- **Architecture-doc note candidate** — none anticipated (consumes §9; defines no model).
- **Future TODO — operational** — `dashboard_snapshots` materialization + cache-invalidation (deferred here) lands with the P6.7 read path; named.

## How to invoke
> The demo-observability (apps/api) implementer session is already oriented — skip `/session-start`; jump to `/tdd`. Confirm cwd is `apps/api/`.

1. **Read this brief end-to-end** — note it **builds on P6.1's `buildProjection`** (inject a reducer; do not re-fold) and runs integration tests against the **real** event store (testcontainers).
2. **Run `/tdd current_state_projection`.**
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 2.5** — answer the 5 design questions (esp. Q3 terminal-transition map + Q5 dashboard_snapshots scope), send the write-up + per-acceptance-bullet coverage map.
5. **Step 9** — surface the LESSONS candidate; flag any missing `@doppl/contracts` export (shared file).
