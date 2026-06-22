# /tdd brief — candidate_state_machine_guard

## Feature
The 4th kernel state machine — the **Candidate** transition guard — completing P3.2. A pure `canTransitionCandidate(from, to) → {allowed:true} | {allowed:false, reason, from, to}` over the `CANDIDATE_TRANSITIONS` table (the §3 candidate spec, incl. the `repairing` edges now live via kernel-018), built on the EXISTING shared `makeTransitionGuard` (kernel-017 — no new guard logic). Decides only; no emit/mutate/IO.

## Use case + traceability
- **Task ID:** P3.2 (completes it — the candidate machine deferred from kernel-017 pending the CandidateStatus +`repairing` amendment).
- **Architecture sections it implements:** `ARCHITECTURE.md §3` (Candidate state machine + the structured-output repair FIX edge).
- **Consumed:** frozen `CandidateStatus` (P0.5 + P0.5-amend, **9** incl. `repairing`, `afaab95`) imported, never redefined (lesson 5); the shared `makeTransitionGuard(table, terminals)` from kernel-017 (`runtime/state/transitionGuard.ts`).
- **Unblocked by:** kernel-018 (`afaab95`) — `repairing` now a valid `CandidateStatus`.
- **Pattern:** identical to kernel-017's Run/Generation/Agenome guards (lesson 33) — this is the 4th table + guard.

## Acceptance criteria (what "done" means)
- [ ] `canTransitionCandidate(from, to)` accepts EXACTLY the §3 candidate edges: created→under_review, under_review→checked, checked→scored, scored→selected, **created→repairing**, **repairing→under_review**, **repairing→invalid**, created→invalid, under_review→rejected, scored→culled. Any other `(from,to)` → rejected.
- [ ] Terminal = {selected, rejected, culled, invalid} → **no outgoing transition accepted** (`reason:'from_terminal'`).
- [ ] **Repair edge** (the kernel-018 unblock): created→repairing ✓, repairing→under_review ✓, repairing→invalid ✓; repairing→checked ✗ (repair returns to under_review, not directly to checked).
- [ ] Built on the EXISTING shared `makeTransitionGuard` (no new guard logic); `CANDIDATE_TRANSITIONS` is a full `Record<CandidateStatus, readonly CandidateStatus[]>` (a future enum member without an entry is a compile error).
- [ ] Guard is **pure** (same `(from,to)` → equal decision; no emit/mutate/IO).
- [ ] All unit tests in `apps/api/test/unit/runtime/state/candidateStateMachine.test.ts` pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — wiring lands in P3.8/P3.10.** Consumed by the structured-output repair edge (P3.8) + the generation loop (P3.10), which call `canTransitionCandidate` before appending a candidate lifecycle event. Exported from `runtime/index.ts` alongside the other 3 guards; first consumers named (lesson 20).

## Files expected to touch
**New:**
- `apps/api/src/runtime/state/candidateStateMachine.ts` — `CANDIDATE_TRANSITIONS` + `canTransitionCandidate` (via the shared helper).
- `apps/api/test/unit/runtime/state/candidateStateMachine.test.ts`

**Modified:**
- `apps/api/src/runtime/index.ts` — export `canTransitionCandidate` (+ the table if the others are exported).

## RED test outline (Step 2 — mirrors the kernel-017 per-machine tests)
1. **`candidate_accepts_every_legal_transition`** — table-drive all 10 §3 edges → `allowed:true` (positive guard).
2. **`candidate_rejects_illegal_transition`** — e.g. created→selected, checked→under_review, under_review→scored → `{allowed:false, reason:'illegal_transition'}`.
3. **`candidate_no_exit_from_terminal`** — each terminal (selected/rejected/culled/invalid) × all targets → `{allowed:false, reason:'from_terminal'}`.
4. **`candidate_repair_edge`** — created→repairing ✓, repairing→under_review ✓, repairing→invalid ✓; repairing→checked ✗.
   - Why: §3 structured-output repair FIX (the kernel-018 unblock; the ≤1 repair budget itself is P3.8).
5. **`candidate_guard_is_pure`** — same `(from,to)` twice → equal decision; no module mutation.

> **Positive-guard discipline (lesson 10):** each reject test leads with a legal-transition positive assertion.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NONE. Consumes frozen `CandidateStatus`; the table + decision are adapter-local. (`repairing` already landed in kernel-018.)
- **Orchestrator doc rows to write hot:** none expected (the lesson-33 pattern + the §3/§5 guard-vs-loop note already banked at kernel-017). Possible "P3.2 COMPLETE" tracker tick at `/orchestrate-end`.
- **§2.5-seam model touched?** No — consumes the frozen enum.

## Things to flag at Step 2.5
1. **Confirm the 10-edge set vs §3** (esp. the repair edges: created→repairing, repairing→{under_review, invalid}; repairing does NOT go directly to checked). My vote: the edge set above is the §3 candidate spec verbatim.
2. **Reuse the shared `makeTransitionGuard` as-is?** My vote: **yes** — no new guard logic; this is the 4th table fed to the existing helper (lesson 5 single-source; lesson 33). If anything about the candidate machine needs a helper change, flag it (it shouldn't — same shape).
3. **Terminal set = {selected, rejected, culled, invalid}** — confirm (created/repairing/under_review/checked/scored are the 5 non-terminals). My vote: yes per §3.

## Dependencies + sequencing
- **Depends on:** kernel-018 (`afaab95`, `repairing` live) ✓ · kernel-017 (shared `makeTransitionGuard`) ✓.
- **Blocks:** P3.8 (repair edge) + P3.10 (generation loop). **Completes P3.2.**

## Estimated commit count
**1.** A focused single-machine slice completing P3.2 (the 4th of 4; same pure-guard pattern, lesson 33). Correctness slice (not a key-safety-rule slice). **security-reviewer in the loop** (invariant-adjacent — terminal-closure totality + edge-exact-vs-§3, consistent with the kernel-017 treatment of the other 3 machines). `feat(runtime)`.

## Lessons-logged candidates anticipated
- None new — applies lesson 33 (the transition-guard pattern) a 4th time. If the candidate machine surfaces a wrinkle the other 3 didn't (it shouldn't — same shape), I route it at Step 9.

## How to invoke
1. **Read this brief** + kernel-017's machines for the pattern (this is the 4th, same shape).
2. **Run `/tdd candidate_state_machine_guard`**.
3. **Step 0/1** — confirm restatement + file list.
4. **Step 2.5** — send the per-test write-up + coverage map; confirm the 10-edge set. (Short cycle — it's a pattern-repeat.)
5. **Step 9** — flag P3.2-COMPLETE; surface anything unexpected.
