# /tdd brief — contract_reconciliation_merge_cody_p016

## Feature
Reconcile the cross-track schemaVersion collision: **merge cody into track/kernel**, UNION the three independent contract changes (cody's P0.16 judge seam + the kernel's `degraded`/`repairing` status amendments) onto ONE monotonic version line — **judge = v3, degraded+repairing fold to v4**, `CURRENT_SCHEMA_VERSION = 4` — re-record the merged member-set snapshots + fixtures, and green the full contracts + apps/api suite. Additive: every status/event addition is unchanged + correct; only the version NUMBERS linearize. **User-ratified scoped contract exception** (extended to cover this reconciliation).

## Use case + traceability
- **Task ID:** P0.16-reconcile (cross-track contract reconciliation of cody's P0.16 with the kernel's P0.15-amend + P0.5-amend; the FRESH impl's first slice; user-greenlit).
- **Context:** routing ledger `docs/sessions/kernel-003-…-routing-ledger.md` **§G** (the collision + resolution) — read it first. The kernel forked at the Phase-0 freeze (RunEventType 36, schemaVersion 2); cody advanced with **P0.16** (judge-output seam — `judge.reviewed` event 36→37 + `JudgeResult`, `CURRENT_SCHEMA_VERSION`→3); the kernel's round-2 amendments claimed v3 (`degraded`, kernel-016) + v4 (`repairing`, kernel-018) off the v2 base → version-number collision (6 conflicts).
- **Architecture sections:** `ARCHITECTURE.md §4` (event model / schemaVersion / closed RunEventType), §3 (status enums), §7 (judge — cody's P0.16). No NEW behavior — this UNIONs two tracks' frozen-contract additions onto one version line.
- **Lead-confirmed merged surface:** RunEventType **37** (incl. `judge.reviewed`) + GenerationStatus **9** (+`degraded`) + CandidateStatus **9** (+`repairing`) + `JudgeResult`; `CURRENT_SCHEMA_VERSION = 4` (v2=markers, **v3=judge P0.16**, **v4=degraded+repairing**).

## Acceptance criteria (what "done" means)
- [ ] `git merge cody` into track/kernel completed; all 6 conflicts resolved by **UNION** (no side's change dropped).
- [ ] `CURRENT_SCHEMA_VERSION === 4`; version-history comment linearized: v1 base, v2 operation-start markers, **v3 judge (P0.16)**, **v4 degraded+repairing (kernel amendments)**.
- [ ] **RunEventType = 37 closed members** incl. `judge.reviewed` (cody's P0.16 addition retained; the kernel never touched RunEventType — take cody's).
- [ ] **GenerationStatus = 9** (incl. `degraded`) AND **CandidateStatus = 9** (incl. `repairing`) — both kernel additions retained.
- [ ] **`JudgeResult`** (cody's P0.16) present + intact; its tests + payload-map narrowing (if P0.16 added one for `judge.reviewed`) retained.
- [ ] Member-set **snapshots re-recorded** to the UNION (RunEventType 37, GenerationStatus 9, CandidateStatus 9, JudgeResult field-set); every snapshot test green.
- [ ] **Fixtures re-stamped** to `schemaVersion 4`; envelope acceptance asserts `≤ 4` (1/2/3/4 all parse; 0/neg/non-int reject); the P1.8 replay ceiling rejects `> 4`.
- [ ] **Backward-compat preserved:** closure intact on all three enums (RunEventType/GenerationStatus/CandidateStatus still reject unknown); older-schemaVersion fixtures still validate.
- [ ] **LESSONS / CLAUDE union:** keep BOTH sides' rows + lessons; **watch for lesson-number collisions** (if cody carries a lesson at a number the kernel also used — e.g. another track's §29+ — renumber the LATER one to the next free slot, never reuse/clobber; fix the index + any cross-refs). Flag at Step 2.5 if a collision exists.
- [ ] **Full suite GREEN across both packages** — contracts (kernel's 166 + cody's judge tests, merged) AND apps/api (145 unit / 20 integration); `/preflight` clean.
- [ ] **No regression:** the apps/api state machines (P3.2) + event-store still green against the merged contracts (CandidateStatus 9 / GenerationStatus 9 already consumed; RunEventType 37 + JudgeResult are additive).

## Wiring / entry point (Step 7.5)
**none — a contract reconciliation/merge** (no new runtime wiring). It unblocks the clean kernel→cody merge (the lead runs that after this lands GREEN). The judge seam's first kernel consumer is P4/P5 (verifier/selection — judge load path); the degraded/repairing statuses are consumed by the P3.2 state machines (already shipped).

## Procedure (the load-bearing part — conflict resolution by UNION)
1. **Read** the ledger §G + skim cody's P0.16 (the judge seam: `judge.reviewed`, `JudgeResult`, its snapshot + version bump).
2. `git merge cody` into track/kernel (also resolves the stale-fork drift in IMPLEMENTATION_PLAN/ARCHITECTURE — take cody's authoritative copies, then re-apply nothing kernel-side beyond what's below).
3. **Resolve the 6 conflicts by UNION:**
   - `packages/contracts/src/version.ts` → `CURRENT_SCHEMA_VERSION = 4` + linearized history comment.
   - member-set snapshot(s) → all members from both sides (RunEventType 37, GenerationStatus 9, CandidateStatus 9, JudgeResult field-set).
   - `events/envelope.test.ts` → schemaVersion acceptance window `≤ 4`.
   - fixtures (`test-fixtures/*`) → `schemaVersion 4`; ensure JudgeResult + the new statuses have valid fixtures.
   - `apps/api/CLAUDE.md` → keep both sides' cross-doc rows (kernel: GenerationStatus 9 / CandidateStatus 9 / schemaVersion 4; cody: RunEventType 37 / judge.reviewed / JudgeResult) — final schemaVersion row = 4.
   - `apps/api/LESSONS.md` → keep both sides' lessons; **renumber on collision** (see acceptance).
4. **Re-record** snapshots + fixtures; run the FULL suite (contracts + apps/api unit + integration) to green.
5. `/preflight` clean.

## RED test outline (Step 2)
This is a merge-reconciliation — the "RED" is the post-merge conflicted/mismatched tree (won't compile / snapshots mismatch); GREEN is the linearized + re-recorded + all-suite-green state. The tests are the UNION of both sides' existing tests. Pin explicitly:
1. **`schema_version_is_4_linearized`** — `CURRENT_SCHEMA_VERSION === 4`; envelope accepts 1/2/3/4, rejects 0/non-int.
2. **`run_event_type_37_includes_judge_reviewed`** — RunEventType has 37 members incl. `judge.reviewed`; closure rejects unknown.
3. **`generation_status_9_candidate_status_9`** — both at 9 (degraded, repairing present); closure intact.
4. **`judge_result_intact`** — cody's `JudgeResult` schema + its tests pass post-merge.
5. **member-set snapshots** — all four (RunEventType / GenerationStatus / CandidateStatus / JudgeResult) match the merged frozen snapshot.
6. **full-suite-green** — contracts (merged count) + apps/api 145 unit / 20 integration; no P3.2/event-store regression.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes/reconciles the docs)
- **Model field changes:** the UNION itself (RunEventType 37, GenerationStatus 9, CandidateStatus 9, JudgeResult, schemaVersion 4) — but these are RECONCILED from both sides, not new. After the merge, the apps/api CLAUDE rows already reflect 9/9/v4 (kernel side); ensure RunEventType 37 + JudgeResult rows (cody side) are present in the merged CLAUDE.
- **Orchestrator (me) at Step 9:** verify the CLAUDE/LESSONS union is clean (no dropped rows, no lesson-number collision); the cross-doc table reflects the full merged surface. ARCHITECTURE/IMPLEMENTATION_PLAN come from cody (authoritative post-merge) — I reconcile any remaining kernel-side ledger items into them via the lead.
- **§2.5-seam:** all three enums + JudgeResult are §2.5 seams — the merged member-set snapshots ARE the pins. The lead does the clean kernel→cody merge after this + propagates.

## Things to flag at Step 2.5
1. **The conflict-resolution plan** — confirm UNION for each of the 6 conflicts (esp. version.ts→4, snapshots→all-members). My vote: union exactly as the Procedure lists.
2. **LESSONS number collision?** — after merging cody, does cody carry any lesson at a number the kernel also uses (§29–33)? If yes, renumber the later one + fix the index/cross-refs; if no, straight union. Report which.
3. **JudgeResult payload-map / event narrowing** — did P0.16 add a `judge.reviewed`→`JudgeResult` narrowing in the payload-map? If so, retain it intact (don't let the merge drop it). Confirm.
4. **Any apps/api breakage from RunEventType 37 / JudgeResult?** — should be none (additive), but run the full apps/api suite to confirm the event-store + state machines are green against the merged contracts.

## Dependencies + sequencing
- **Depends on:** cody @ P0.16 (the merge source) + track/kernel @ `c2d5565` (the round-2 seal). User-ratified.
- **Blocks:** the clean kernel→cody merge (lead runs it post-GREEN) + ALL further kernel work (P3.4+) — the reconciliation must land before the safety slices so they build on the unified contract. **This is the fresh impl's FIRST slice; then P3.4.**

## Estimated commit count
**1 — SOLO reconciliation** (a contract merge; never bundled). It's the user-ratified scoped contract exception (extended). **security-reviewer in the loop** (invariant — verify closure preserved on all three enums post-merge, no member dropped, schemaVersion monotonic, JudgeResult intact, backward-compat). `merge` + `fix(contracts)` (or a merge commit + a reconciliation commit — implementer's call on the cleanest git shape; flag at Step 2.5).

## Lessons-logged candidates anticipated
- **§19 extension (bank post-reconciliation):** a shared monotonic contract counter (`CURRENT_SCHEMA_VERSION`) bumped INDEPENDENTLY in parallel tracks off the same base COLLIDES at merge even when payload changes are disjoint — serialize cross-track version bumps through the integration owner (or number-by-track + linearize at merge). The reconciliation = a UNION + version-linearize (judge=v3, kernel-statuses fold to v4). I bank this at Step 9.

## How to invoke
1. **Read this brief + the ledger §G + skim cody's P0.16** (the judge seam).
2. **Run `/tdd contract_reconciliation_merge_cody_p016`** (or treat as a guided merge-reconcile — the suite is the spec).
3. **Step 0/1** — confirm the merged-surface target (37 events / 9+9 statuses / JudgeResult / v4) + the 6-conflict UNION plan.
4. **Step 2.5** — send the conflict-resolution plan + the re-record list + the LESSONS-collision report; take defaults or ping back.
5. **Step 9** — flag the reconciliation done + the merged surface; I verify the CLAUDE/LESSONS union + flag the lead for the clean kernel→cody merge.
