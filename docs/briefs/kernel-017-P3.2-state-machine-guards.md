# /tdd brief — state_machine_transition_guards

## Feature
The four kernel state-machine transition guards (Run / Generation / Candidate / Agenome) — **pure** decisions over `(currentStatus, requestedTarget) → {allowed} | {allowed:false, reason}` enforcing exactly the §3 closed transition sets (incl. every resolved FIX edge), with **no exit from any terminal state**. Guards never emit events or mutate state (the loop/appender do that). Built on a single shared `makeTransitionGuard(table, terminals)` helper (§5 single-source) + one per-machine transition table that IS the spec; status unions imported from `@doppl/contracts` (never redefined).

## Use case + traceability
- **Task ID:** P3.2
- **Architecture sections it implements:** `ARCHITECTURE.md §3` (the four state machines + resolved-edge rules: zero-survivors, partial-failure/degraded, structured-output repair, degenerate reproduction, per-state→failed), §5 (kernel ownership of lifecycle decisions).
- **Consumed frozen contracts (imported, never redefined — lesson §5):** `RunStatus` (P0.15, 8) · `GenerationStatus` (P0.15+amend, **9** incl. `degraded`) · `CandidateStatus` (P0.5, 8) · `AgenomeStatus` (P0.4, 7).
- **Unblocked by:** kernel-016 (`GenerationStatus` +`degraded`, `a1da497`) — the `running→degraded→verifying` edge is now representable.

## Acceptance criteria (what "done" means)
- [ ] One pure guard per machine — `canTransitionRun/Generation/Candidate/Agenome(from, to) → {allowed:true} | {allowed:false, reason}` — accepting ONLY the §3 transitions below; any other `(from,to)` pair is rejected.
- [ ] **Run** accepts exactly: configured→running, running→completing, completing→completed, running→stopping, stopping→stopped, running→failed, configured→cancelled. Terminal = {completed, stopped, failed, cancelled} → **no outgoing transition accepted**.
- [ ] **Generation** accepts exactly: pending→running, running→verifying, verifying→scoring, scoring→reproducing, reproducing→completed, **scoring→completed** (zero-survivors), **running→degraded**, **degraded→verifying** (partial-failure), **{running,verifying,scoring,reproducing}→failed** (per-state deadline/wall-clock/kill), pending→skipped. Terminal = {completed, failed, skipped}.
- [ ] **Candidate** accepts exactly: created→under_review, under_review→checked, checked→scored, scored→selected, **created→repairing**, **repairing→under_review**, **repairing→invalid**, created→invalid, under_review→rejected, scored→culled. Terminal = {selected, rejected, culled, invalid}.
- [ ] **Agenome** accepts exactly: seeded→active, active→spent, spent→eligible_parent, active→failed, eligible_parent→reproduced, eligible_parent→culled. Terminal = {failed, reproduced, culled}.
- [ ] **No energy-spend re-entry (rule #8-adjacent):** no transition from `spent | failed | culled` reaches `active` (the only energy-spending status) — pinned explicitly.
- [ ] **Guards are pure:** given `(from, to)` they return a decision; they perform NO event emit, NO state mutation, NO IO. Same inputs → same output.
- [ ] **Every terminal state rejects ALL targets** with a distinct `from_terminal` reason (vs `illegal_transition` for a non-terminal disallowed pair).
- [ ] `degraded` is handled as a first-class generation status (a valid `to` from `running` and a valid `from` to `verifying`), distinct from `failed`/`running`.
- [ ] All unit tests in `apps/api/test/unit/runtime/state/*.test.ts` pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — wiring lands in P3.10.** The guards are consumed by the generation-loop orchestration (P3.10) + the repair edge (P3.8) + caps/kill terminal drives (P3.4), which call `canTransition*` before appending a lifecycle event. This slice lands the pure guards + tables; first consumers named (P3.4/P3.8/P3.10) — lesson 20 explicit-deferral, no silent unwired gap.

## Files expected to touch
**New:**
- `apps/api/src/runtime/state/transitionGuard.ts` — shared `makeTransitionGuard(table, terminals)` + the `TransitionDecision` result type (§5 single-source of the guard logic).
- `apps/api/src/runtime/state/runStateMachine.ts` — `RUN_TRANSITIONS` table + `canTransitionRun`.
- `apps/api/src/runtime/state/generationStateMachine.ts` — `GENERATION_TRANSITIONS` (incl. degraded edges) + `canTransitionGeneration`.
- `apps/api/src/runtime/state/candidateStateMachine.ts` — `CANDIDATE_TRANSITIONS` (incl. repair edges) + `canTransitionCandidate`.
- `apps/api/src/runtime/state/agenomeStateMachine.ts` — `AGENOME_TRANSITIONS` + `canTransitionAgenome`.
- `apps/api/test/unit/runtime/state/{run,generation,candidate,agenome}StateMachine.test.ts` (+ a `transitionGuard.test.ts` for the shared helper if Q1=shared).

**Modified:**
- `apps/api/src/runtime/index.ts` (or the area barrel) — export the guards (create if absent).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Per machine (`{machine}StateMachine.test.ts`):
1. **`{machine}_accepts_every_legal_transition`** — table-drive every legal `(from,to)` above → `allowed:true`. (Positive guard — lesson §10.)
2. **`{machine}_rejects_illegal_transition`** — a representative non-terminal disallowed pair (e.g. Run `configured→completed`, Generation `pending→completed`, Candidate `created→selected`, Agenome `seeded→eligible_parent`) → `{allowed:false, reason:'illegal_transition'}`.
3. **`{machine}_no_exit_from_terminal`** — for EACH terminal status, every target → `{allowed:false, reason:'from_terminal'}`.

Targeted edge tests:
4. **`generation_degraded_partial_failure_edge`** — `running→degraded` ✓ and `degraded→verifying` ✓; `degraded→running` ✗.
   - Why: §3 partial-failure FIX edge (the kernel-016 unblock).
5. **`generation_zero_survivors_edge`** — `scoring→completed` ✓ (zero-survivors) alongside `scoring→reproducing` ✓.
   - Why: §3 zero-survivors FIX.
6. **`generation_per_state_failed_edges`** — each of running/verifying/scoring/reproducing →failed ✓; pending→failed ✗ (pending only →running/skipped).
   - Why: §3 per-state deadline/kill abort.
7. **`candidate_repair_edge`** — created→repairing ✓, repairing→under_review ✓, repairing→invalid ✓; repairing→checked ✗.
   - Why: §3 structured-output repair (≤1; the budget itself is P3.8).
8. **`agenome_no_energy_spend_reentry`** — spent→active ✗, failed→active ✗, culled→active ✗ (no path back to the energy-spending status).
   - Why: rule #8-adjacent (no energy spend after spent|failed|culled).
9. **`agenome_spent_to_eligible_parent_allowed`** — spent→eligible_parent ✓ (the fitness-score precondition is a P3.10 kernel gate, NOT this pure guard — see Q4).
   - Why: §3 + lesson §6 (guard encodes transition shape; semantic precondition is the kernel's).
10. **`guards_are_pure`** — calling a guard twice with the same `(from,to)` returns an equal decision; no module-level mutation observable.
    - Why: P3.2 "guards never emit/mutate."

> **Positive-guard discipline (lesson §10):** every reject test leads with a legal-transition positive assertion.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NONE. Consumes the four frozen status unions; the transition tables + `TransitionDecision` are adapter-local (not Appendix-A).
- **Orchestrator doc rows to write hot:** likely a **convention candidate** (the transition-guard pattern: pure (from,to)→decision over a per-machine table + shared builder; terminal vs illegal reasons; semantic preconditions stay in the kernel per §6). Possible §3/§5 arch-note if the loop-vs-guard responsibility split needs pinning. I route at Step 9.
- **§2.5-seam model touched?** No — consumes the status unions (no extend/define). Tests assert against the frozen enums (consumer-agreement).

## Things to flag at Step 2.5
1. **Shared `makeTransitionGuard` helper vs 4 hand-written guards?** My vote: **shared helper** over a per-machine `Record<Status, readonly Status[]>` table + a `Set` of terminals — single-sources the guard logic (§5; the just-applied deepMerge/zod-errors principle), each table IS the readable spec. 4 hand-written guards would duplicate the lookup/terminal logic 4×.
2. **Reason shape — `{allowed:false, reason}` with a closed reason code + from/to echo?** My vote: **closed reason `'illegal_transition' | 'from_terminal'`** + `from`/`to` echoed (statuses are enum values, NOT payload — safe to name; helps the kernel log a precise rejection). Discriminated `{allowed:true} | {allowed:false, reason, from, to}`.
3. **Terminal handling — distinct `from_terminal` reason vs absence-from-table?** My vote: **distinct `from_terminal`** — a transition attempted FROM a terminal state is a meaningfully different error than a wrong non-terminal pair (the kernel may treat them differently — e.g. a from-terminal attempt is a likely bug). Pin both reasons.
4. **Agenome `eligible_parent` fitness-score precondition — in the guard or the kernel?** My vote: **kernel (P3.10), NOT this guard** — "eligible only after a candidate reached a fitness score" depends on run state beyond `(from,to)`, so per lesson §6 the pure guard allows `spent→eligible_parent` as a valid SHAPE and the fitness-score gate is a documented P3.10 precondition. Acceptance bullet #9 pins this split. (Flag if you'd rather model it here — but a pure (from,to) guard structurally can't see the fitness score.)
5. **`degraded` placement / re-entry — can a generation re-enter `degraded`?** My vote: `running→degraded→verifying` only (degraded is the one-shot partial-failure intermediate); `verifying→degraded` and `degraded→running` are NOT accepted. Confirm against §3 (which shows only `running→degraded` and `degraded→verifying`).

## Dependencies + sequencing
- **Depends on:** P0.4/P0.5/P0.15(+amend) frozen status unions ✓ (all landed; the degraded amendment `a1da497` unblocks the generation machine).
- **Blocks:** P3.4 (caps/kill terminal drives), P3.8 (repair edge), P3.9 (seed agenome seeded→active), P3.10 (generation loop orchestration) — all call the guards.

## Estimated commit count
**1 — bundled (the 4 machines, one cohesive "kernel state machines" unit, matching the tracker task; same pure-guard pattern applied 4×, shared test harness).** Pure deterministic guards — NOT a key-safety-rule slice (caps/redaction/allowlist/injection/judge/replay/energy-LEDGER are the safety slices; transition guards are correctness). But the agenome no-energy-re-entry + terminal-closure are **invariant-adjacent** → **security-reviewer in the loop** (review: terminal closure totality for Run/Generation, the no-spent/failed/culled→active pin, and that no unsafe transition is representable). `feat(runtime)`.

## Lessons-logged candidates anticipated
- **Convention candidate** — the transition-guard pattern: pure `(from,to)→decision` over a per-machine table + a shared builder; `from_terminal` vs `illegal_transition`; semantic preconditions (fitness-score gate) stay in the kernel (§6), not the pure guard.
- **Architecture-doc note (§3/§5)** — the guard-vs-loop responsibility split (guards decide; the loop emits + the appender persists; the fitness-score precondition is a loop gate).

## How to invoke
1. **Read this brief end-to-end** — Q1 (shared helper) + Q4 (fitness-score precondition split) shape the surface; confirm Q5 (degraded one-shot) against §3.
2. **Run `/tdd state_machine_transition_guards`**.
3. **Step 0/1** — confirm restatement + the file list (5 src + tests).
4. **Step 2.5** — send the per-test `Asserts: <invariant> (§anchor)` write-up + coverage map; take defaults or ping back.
5. **Step 9** — surface anything beyond the anticipated candidates.
