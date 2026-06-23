# /tdd brief — final_idea_winner_projection_bridge

## Feature
Surface the kernel's already-decided final-idea winner in the projections: a new pure current-state reducer marks the candidate whose id == `run.completed`'s `finalIdeaRef` as `status:'selected'`. This is a §10-conformance bug fix — the kernel records the winner (`run.completed.finalIdeaRef`, `terminalClassifier.ts:155`) but **no projection ever produced the `'selected'` candidate status** that `lineage-graph` (→ web `selectWinner`), `replay-summary`, and the PD.7 final-idea panel all read. Today every real/recorded completed run is winnerless; only hand-set fixtures show a winner. ZERO new contract surface (`CandidateStatus` already includes `'selected'`).

## Use case + traceability
- **Task ID:** PD.11 (new — the §12-winner projection bridge; prerequisite to PD.8a)
- **Architecture sections it implements:** `ARCHITECTURE.md §10` (lineage projection — "the selected winner is a candidate node carrying status `'selected'`"), `§3` (candidate lifecycle `… scored → selected`), `§9` (projections derived/rebuildable + replay state-equivalence), `§12`/`§17` (the §12 final-idea surface + the demo headline "your problem → final surviving idea").
- **Related context:**
  - **Blocking Finding** (orch-verified, lead-decided **option b**): `IMPLEMENTATION_PLAN.md` "Currently in progress" + handoff `docs/team-handoffs/phase-d-001` + ledger `docs/sessions/phase-d-006`. This brief IS that decided fix — do NOT re-escalate.
  - **LESSON §68** (`apps/api/LESSONS.md`): `finalIdeaRef` = top-`total` `fitness.scored ∧ ¬lineage.culled` survivor, tie-break lowest sequence; "P5's authoritative `candidate.selected` supersedes by candidateId join" — there is **no `candidate.selected` event type** today, so this kernel-derived `finalIdeaRef` is the authoritative MVP signal the bridge surfaces.
  - **LESSONS §53/§54/§55/§62** (`apps/api/LESSONS.md`): §53 reducer injected into the fold; §54 lineage = pure transform (winner = candidate status `'selected'`); §55 replay-summary = pure rule-#7 surface; §62 a status with no event carries no reducer transition — but here the winner status DOES have an authoritative event signal (`run.completed.finalIdeaRef`), so it warrants a derivation.
  - **The winner already flows everywhere off `candidate.status`:** `lineage-graph.ts:73` builds the candidate node `status: candidate.status`; web `finalIdeaData.ts:27` `selectWinner` = `nodes.find(type==='candidate' && status==='selected')`; `replay-summary.ts:73-77` `findSelectedCandidate` scans `candidateIdeas[*].status==='selected'`; `run-health.ts` treats `'selected'` as terminal (correctly excludes the winner from in-flight). **So one upstream reducer mark lights up all three surfaces — the projection files need NO change.**

## Acceptance criteria (what "done" means)
- [ ] A run whose `candidate.created` carries a NON-`'selected'` status (e.g. `'scored'`) and whose `run.completed` payload carries `finalIdeaRef: <that candidate id>` folds (via `buildCurrentState`) to that candidate having `status:'selected'` — derived from the event, never hand-set.
- [ ] That same run's `buildLineageGraph(...)` emits the winner candidate node with `status:'selected'` (so web `selectWinner` finds it) — proven against the REAL `finalIdeaRef` path, not a pre-set payload.
- [ ] That same run's `buildReplaySummary(...).digest.selectedCandidateId` == the `finalIdeaRef` candidate id — derived, not hand-set.
- [ ] **No fabrication:** `run.completed` with NO `finalIdeaRef` in the payload → NO candidate is marked `'selected'` (`selectedCandidateId` stays null; PD.7 renders terminal zero-survivors). `run.failed` (carries no `finalIdeaRef`) → likewise no winner.
- [ ] **Defensive:** a `finalIdeaRef` referencing a non-materialized candidate id is a no-op (no crash, no phantom node).
- [ ] **Idempotent re-fold:** re-applying the log yields exactly one `'selected'` candidate (the bridge is a pure SET, not an accumulate).
- [ ] **Replay state-equivalence preserved (rule #7):** the mark lives in the shared `currentStateReducer`, so `canonicalize(buildReplaySummary(events).state) === canonicalize(buildCurrentState(events).state)` holds on a real-`finalIdeaRef` run, with zero provider calls on the replay path (the existing `test_replay_imports_no_provider` stays green).
- [ ] Existing projection tests (`current-state` / `lineage-graph` / `replay-summary` / `run-health` / `lineage-export`) stay green — their hand-set `status:'selected'` fixtures + no-`finalIdeaRef` `run.completed` rows make the new reducer a no-op for them.
- [ ] All unit tests in `apps/api/test/unit/projections/` pass.
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
The new `winnerReducer` is wired into the composed `currentStateReducer` REDUCERS array in `apps/api/src/projections/current-state.ts` (appended LAST so it sees the fully-materialized candidate rows when `run.completed` folds). It is therefore reached by **`buildCurrentState`** — the single fold every consumer goes through: `buildLineageGraph` (→ web `selectWinner` / the PD.7 `FinalIdeaPanel`), `buildReplaySummary` (replay digest), and `GET /runs/:id` + `GET /runs/:id/replay` read endpoints. **No new route, no new exported API surface** — confirm the reducer is in the REDUCERS array (not just unit-exercised), so a real boot/read renders the winner.

## Files expected to touch
**New:**
- `apps/api/src/projections/reducers/winner.ts` — `winnerReducer(state, event)`: on `event.type === 'run.completed'`, read `finalIdeaRef` from the (validated, JSON-plain) payload; if it's a non-empty string AND `state.candidateIdeas[finalIdeaRef]` exists, SET that row's `status` to `'selected'`; else return state unchanged. Pure, no IO, imports only contracts types + `./state`.
- `apps/api/test/unit/projections/winner.test.ts` — the reducer's direct contract (or fold these into `current-state.test.ts` — see Step 2.5 Q3).

**Modified:**
- `apps/api/src/projections/current-state.ts` — import `winnerReducer`, append it to `REDUCERS` (last).
- `apps/api/test/unit/projections/lineage-graph.test.ts` — add ONE end-to-end test: a real-`finalIdeaRef` run (candidate status NOT pre-set) → winner node `status:'selected'`.
- `apps/api/test/unit/projections/replay-summary.test.ts` — add ONE end-to-end test: `digest.selectedCandidateId` derived from `run.completed.finalIdeaRef` (candidate status NOT pre-set).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `apps/api/test/unit/projections/winner.test.ts` (reducer-level):

1. **`test_run_completed_marks_finalIdeaRef_candidate_selected`** — a fold of `candidate.created{status:'scored'}` … `run.completed{finalIdeaRef: cand_id}` → `candidateIdeas[cand_id].status === 'selected'`.
   - Asserts: the bridge DERIVES `'selected'` from the kernel signal (status not pre-set).
   - Why: §10 "winner = candidate node status `'selected'`"; §3 `scored → selected`; the headline (§17). Positive guard (LESSON §10 — lead with the success case so RED isn't vacuous).
2. **`test_no_finalIdeaRef_marks_no_winner`** — `run.completed` with `{}` (or no `finalIdeaRef`) payload → NO candidate is `'selected'`.
   - Asserts: no fabrication (PD.7 terminal zero-survivors path stays honest).
   - Why: rule #6 emit-only / never invent a winner; §3.
3. **`test_run_failed_marks_no_winner`** — `run.failed` over the same candidates → no `'selected'`.
   - Asserts: a failed run is winnerless.
   - Why: §3 terminal classification (`run.failed` carries `no_scored_survivor`, no `finalIdeaRef`).
4. **`test_finalIdeaRef_to_absent_candidate_is_noop`** — `run.completed{finalIdeaRef:'ghost'}` with no `ghost` candidate → no crash, no new row, no `'selected'`.
   - Asserts: defensive no-op (mirrors `candidate_invalidated`/`candidate.rejected` `existing===undefined` guard, `entities.ts`).
   - Why: robustness — a malformed/stale ref folds to a no-op, never crashes the rebuild.
5. **`test_idempotent_refold_single_selected`** — folding the log twice (or re-applying `run.completed`) yields exactly one `'selected'`.
   - Asserts: idempotent SET (P6.1 contract).
   - Why: §9 rebuildable/idempotent fold.

End-to-end (added to the existing files):

6. **`lineage-graph.test.ts :: test_finalIdeaRef_run_yields_selected_winner_node`** — a real-`finalIdeaRef` run → `buildLineageGraph` candidate node `status:'selected'` (the surface web `selectWinner` reads).
   - Why: §10 + the web winner path (`finalIdeaData.ts:27`).
7. **`replay-summary.test.ts :: test_finalIdeaRef_run_digest_selected`** — `digest.selectedCandidateId` == `finalIdeaRef`, AND `canonicalize(replay.state) === canonicalize(captured.state)` on that run.
   - Why: §9/§16 replay state-equivalence (rule #7) preserved by the shared reducer.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** `CandidateStatus` already includes `'selected'` (frozen P0.5 enum: created/repairing/under_review/checked/scored/**selected**/rejected/culled/invalid). `CurrentState` shape is **unchanged** (the bridge sets an existing field to an existing enum value; it does NOT add `RunRow.finalIdeaRef`).
- **Orchestrator doc rows to write hot (Step 9 routing):** none expected. (The `CandidateIdea` cross-doc row in `apps/api/CLAUDE.md` already names `'selected'` as a lifecycle status — no edit.) If anything, a possible **Architecture-doc note** clarifying that the MVP `'selected'` status is DERIVED by the projection from `run.completed.finalIdeaRef` (no `candidate.selected` event yet) — flag it, orch decides.
- **§2.5-seam (shared-contract) model touched?** No. `CurrentState`/the reducers are apps/api-INTERNAL (not Appendix-A); no schema-snapshot test needed. ZERO new contract surface.

## Things to flag at Step 2.5
1. **Where does the mark live?** (a) a NEW dedicated `winnerReducer` appended to the current-state REDUCERS, vs (b) inline in `lifecycleReducer`'s `run.completed` branch. My default vote: **(a) dedicated reducer** — keeps `lifecycleReducer` scoped to run/gen/agenome status, matches the per-concern reducer composition (LESSONS §53), and reads cleanly as "winner derivation." Append it LAST so the candidate row is already materialized when `run.completed` folds.
2. **Mark regardless of the candidate's current status?** The kernel's `finalIdeaRef` is by construction a `scored ∧ ¬culled` survivor (`terminalClassifier`), so the winner's stored status is `'scored'`. Default vote: **mark whenever the candidate exists** (trust the authoritative kernel signal; don't second-guess it with a `¬culled` guard) — simpler, and a culled/invalid winner would be a kernel bug to surface loudly, not silently hide. Flag if you'd prefer a defensive "only overwrite a non-terminal status."
3. **Test placement** — dedicated `winner.test.ts` vs folding the reducer tests into `current-state.test.ts`. Default vote: **dedicated `winner.test.ts`** for the reducer contract + the two end-to-end assertions in the existing `lineage-graph`/`replay-summary` files (so each projection's file proves its own surface).
4. **Migrate the existing hand-set `status:'selected'` fixtures to the real path?** The existing `lineage-graph`/`replay-summary`/`run-health` fixtures pre-set `status:'selected'` on the candidate payload (the "hand-built winner" the Finding describes). Default vote: **leave them as-is** (they validly test the READ path) and ADD new real-`finalIdeaRef` tests alongside — don't churn passing tests. Flag if you'd rather convert one canonical fixture to the real path.

## Dependencies + sequencing
- **Depends on:** PD.7 (shipped `1277cd1` — the final-idea panel); `terminalClassifier` emitting `run.completed.finalIdeaRef` (shipped, kernel-merged); the frozen `CandidateStatus` `'selected'` (P0.5).
- **Blocks:** **PD.8a** (brief `phase-d-013`) acceptance #2 — the creds-free e2e smoke asserts a real `'selected'` winner renders end-to-end; it needs this bridge to pass. The captured replay fixture PD.8a records will then contain a derivable winner.

## Estimated commit count
**1.** One focused logical unit (a pure reducer + its wiring + tests), same code area (`projections/`), no cross-doc invariant. Touches the winner/selection surface (rule-#6-adjacent) but introduces **no agent-writable authority** — it purely surfaces the kernel's already-decided `finalIdeaRef` — so it is not a safety-invariant slice that must stand alone for that reason; it's atomic simply because it's one unit. **Run the `security-reviewer` at Step 8** anyway (policy = `invariant`; this is the most reward-hacking-tempting surface — confirm the bridge adds no path for an agent to influence the winner and never fabricates one).

## Lessons-logged candidates anticipated
- **Convention candidate** — "an MVP lifecycle status with no dedicated event but a derivable authoritative signal (winner `'selected'` ← `run.completed.finalIdeaRef`) is surfaced by a pure current-state reducer that reads the signal, NOT by a downstream projection re-deriving it — single source, all read-surfaces light up at once (extends LESSONS §53/§54/§62; the converse of the §62 'no event → no transition' rule — there IS an event signal here)."
- **Architecture-doc note candidate** — §10/§12: clarify that the `'selected'` candidate status is projection-DERIVED from `run.completed.finalIdeaRef` for the MVP (until P5's authoritative `candidate.selected` exists), so consumers know the winner is kernel-decided, not projection-invented (rule #6).
- **Future TODO — operational** — when P5's authoritative `candidate.selected` event lands, the bridge defers to it by candidateId join (LESSONS §68) — the reducer becomes "prefer the authoritative event, fall back to `finalIdeaRef`."

## How to invoke
1. Read this brief end-to-end (don't skip Step 2.5 — answer Q1–Q4 or take defaults).
2. Run `/tdd final_idea_winner_projection_bridge` in the implementer session.
3. Step 0 (Restate) — confirm it matches the Feature line (a reducer that marks the `finalIdeaRef` candidate `'selected'`; zero contract surface).
4. Step 1 (Identify files) — confirm against "Files expected to touch."
5. Step 2.5 — ping back with Q1–Q4 answers (or defaults).
6. Step 8 — run `security-reviewer` (invariant policy; winner surface).
7. Step 9 — surface anything beyond the anticipated lessons-logged candidates.
