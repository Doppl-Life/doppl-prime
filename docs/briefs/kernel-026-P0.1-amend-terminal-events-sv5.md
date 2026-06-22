# /tdd brief — terminal_event_registry_amendment_sv5

## Feature
The **terminal-event registry amendment** (P0.1-amend, sv4→5) — add the 4 reachable-terminal events the full audit found missing so every §3 terminal is rule-#2 replayable: **`run.cancelled`** (configured→cancelled), **`generation.skipped`** (pending→skipped), **`agenome.failed`** (active→failed), **`candidate.rejected`** (under_review→rejected). `RunEventType` 37→41, `CURRENT_SCHEMA_VERSION` 4→5. Update the P3.4 killSwitch to name the two it owns (`run.cancelled`/`generation.skipped`, replacing `terminalEvent:null`). §19 freeze-amendment playbook. **User-ratified kernel-owned scoped exception** (same terms as the degraded/repairing amendments).

## Use case + traceability
- **Task ID:** P0.1-amend (RunEventType registry) + the P3.4 killSwitch null-mapping fix. (User-RATIFIED the full 4-event amendment per the kernel-003 §H audit; lead coordinates the cross-track sv4→5 announce + cody merge.)
- **Architecture sections it implements:** `ARCHITECTURE.md §4` (closed `RunEventType` registry — "no failure path in §3/§5 is unrepresentable", RISK-006) + `§3` (the four state machines' terminals) + `§5` (kill switch). Key safety rule #2 (every lifecycle decision is a persisted, replayable event).
- **Why (the audit):** the closed registry had NO recording event for 4 reachable terminals — `RunStatus.cancelled`, `GenerationStatus.skipped`, `AgenomeStatus.failed`, `CandidateStatus.rejected` — so those terminals couldn't be persisted/replayed (rule #2 gap). The other terminals are event-backed or projected (selected = scored ∧ ¬lineage.culled, §8; culled = lineage.culled; invalid = candidate_invalidated; reproduced = agenome.reproduced).
- **Emission map (`candidate.rejected` — CORRECTED, lead-confirmed; verifier RETIRED):** the verifier council/judge are evidence-only (rule #6) and NEVER emit a candidate verdict. The `under_review→rejected` transition is the **KERNEL's own** (`runtime/state/candidateStateMachine.ts`, P3.2). `candidate.rejected` emission is the **RUNTIME's (P3), driven on SELECTION's (P5) verdict** (which aggregates verifier evidence + judge acceptance into a reject decision) — **DEFERRED: defined-but-not-yet-emitted for MVP**, designed into the P3↔P5 runtime↔selection seam later (NOT a P3.10 must-wire). `agenome.failed` emission is the loop's (P3.10, agenome active→failed). This slice ADDS all 4 to the registry; the kernel wires ONLY the killSwitch's two (run.cancelled, generation.skipped). **No cross-track blessing gate — the amendment is fully kernel-internal.**
- **Pattern:** the §19 freeze-amendment playbook, 4th application (after operation-start markers P0.1-amend, GenerationStatus degraded, CandidateStatus repairing): update tests/snapshot to the new expectation → RED against the old contract → amend → GREEN. Additive + backward-compatible.

## Acceptance criteria (what "done" means)
- [ ] `RunEventType` adds exactly 4 members — `run.cancelled`, `generation.skipped`, `agenome.failed`, `candidate.rejected` — → **41** total (was 37). Grouped sensibly (run.cancelled with the run.* lifecycle; generation.skipped with generation.*; agenome.failed + candidate.rejected with the failure/terminal events). **Closure preserved** — an unlisted type is still rejected.
- [ ] `CURRENT_SCHEMA_VERSION` 4 → **5**; the version-history comment records the bump (v5 = the 4 terminal events). Readers accept `schemaVersion ≤ 5`.
- [ ] The 4 new events are **low-traffic** → they fall through to the generic JSONB payload (NO `HIGH_TRAFFIC_PAYLOAD_MAP` entry — the payload-map is unchanged).
- [ ] The RunEventType member-set snapshot is **re-recorded** (37→41) and the `event-type.test.ts` closure/count test updated to 41; schemaVersion-pinned fixtures move 4→5 via `CURRENT_SCHEMA_VERSION` (older-version fixtures, if any pin a literal, stay unchanged — backward-compat).
- [ ] **P3.4 killSwitch updated** (`apps/api/src/runtime/caps/killSwitch.ts`): `runEventFor` returns `run.cancelled` for `to==='cancelled'` (was `null`); the generation event mapping returns `generation.skipped` for `to==='skipped'` (was `null`). The doc comment's "STATUS-ONLY → terminalEvent:null (registry gap escalated)" note is updated (the gap is now closed for these two). The killSwitch's per-state-dispositions tests updated: `configured→cancelled` now carries `terminalEvent: run.cancelled`; `pending→skipped` now carries `terminalEvent: generation.skipped`.
- [ ] **Out of scope (registry-add only, emission elsewhere):** `agenome.failed` (loop P3.10, agenome active→failed) + `candidate.rejected` (RUNTIME P3 on SELECTION P5 verdict — DEFERRED, defined-but-not-yet-emitted MVP) — added to the registry, NOT emitted/wired by the kernel this slice. The killSwitch maps run+generation only (no agenome/candidate plan), so it doesn't reference these two.
- [ ] **Backward-compat (§19):** v1..v4 envelopes still validate; the amendment is purely additive (closure + RISK-006 preserved). Full suite green; `/preflight` clean (incl `format:check` — lesson 40).

## Wiring / entry point (Step 7.5)
**Contract amendment + the killSwitch null-fix it directly enables.** The killSwitch (P3.4, already wired into the kill path's design) now names `run.cancelled`/`generation.skipped` instead of null. `agenome.failed` + `candidate.rejected` emission lands later: `agenome.failed` in P3.10 (loop, agenome active→failed); `candidate.rejected` is the RUNTIME's on SELECTION's verdict (P3↔P5 seam) — DEFERRED (defined-but-not-yet-emitted MVP). No new kernel entry point — the registry is consumed by the append-path validation (P1.3) + the killSwitch + future emitters.

## Files expected to touch
**Modified (contract):**
- `packages/contracts/src/events/event-type.ts` — +4 members (37→41) + doc-comment count/breakdown + amendment note.
- `packages/contracts/src/version.ts` — `CURRENT_SCHEMA_VERSION` 4→5 + version-history.
- The RunEventType member-set snapshot + `packages/contracts/test/events/event-type.test.ts` (count/closure 37→41) — re-record/update (confirm exact snapshot file at Step 1, per the kernel-016/018/020 amendment pattern; likely `test/__schema-snapshots__/*`).
- `packages/contracts/src/test-fixtures/index.ts` — moves to sv5 via `CURRENT_SCHEMA_VERSION` (verify; no literal-4 pins left dangling).

**Modified (runtime):**
- `apps/api/src/runtime/caps/killSwitch.ts` — `runEventFor` cancelled→`run.cancelled`; generation mapping skipped→`generation.skipped`; doc-comment update.
- `apps/api/test/unit/runtime/caps/killSwitch.test.ts` — the two terminalEvent expectations (cancelled, skipped) flip from null to the new events.

If the snapshot/closure tests live in additional files, flag at Step 2.5.

> **VALIDATED FILE SURFACE (from the kernel-026 first attempt's Step-2.5, decouple-deferred — use this next round, no re-discovery):** amend `event-type.ts` (+4 grouped) + `version.ts` (=5, history). Tests touched: `packages/contracts/test/events/event-type.test.ts` (41-member + closure + FAILURE_TERMINAL→9), `test/__schema-snapshots__/field-sets.test.ts` (`EVENT_TYPE_SNAPSHOT` 37→41 + `CURRENT_SCHEMA_VERSION` 4→5), `test/events/envelope.test.ts` (schemaVersion-window accepts 1..5 + `current_schema_version_is_5` — the version-bump surface kernel-020 also touched), `test/.../fixtures-valid.test.ts` (sv5 via the constant — no literal-4 pins, grep-confirmed). Runtime: `killSwitch.ts` (`runEventFor` cancelled→`run.cancelled`; gen mapping skipped→`generation.skipped` + doc) + `killSwitch.test.ts` (2 dispositions null→named). The Step-2.5 test design + design-Q answers (killSwitch wires only the 2; 41-count/closure; snapshot re-record; payload-map unchanged — HIGH_TRAFFIC still 7) were all confirmed-sound — re-run can go fast to GREEN.

## RED test outline (Step 2 — §19 playbook: set the new expectation → RED → amend → GREEN)
1. **`run_event_type_has_41_members_incl_new_terminals`** — the 4 new members present; total 41; an unlisted type still rejected (closure). Why: §4 registry completeness / RISK-006.
2. **`current_schema_version_is_5`** — `CURRENT_SCHEMA_VERSION === 5`; readers accept ≤5, reject 6. Why: §4 schemaVersion handling.
3. **`member_set_snapshot_re_recorded`** — the RunEventType field-set snapshot equals the 41-member set (the §2.5-seam schema-snapshot, tagged `spec(§4)`). Why: cross-track contract surface.
4. **`backward_compat_v1_to_v4_envelopes_validate`** — an envelope at schemaVersion 1..4 still validates (additive amendment). Why: §19 backward-compat.
5. **`killswitch_cancelled_names_run_cancelled`** — `configured→cancelled` plan now carries `terminalEvent: 'run.cancelled'` (not null). Why: §5 + rule #2 (the cancelled terminal is now replayable).
6. **`killswitch_skipped_names_generation_skipped`** — `pending→skipped` plan now carries `terminalEvent: 'generation.skipped'` (not null). Why: §5 + rule #2.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** `RunEventType` 37→**41** (+4 terminal events); `CURRENT_SCHEMA_VERSION` 4→**5**. **This is a §2.5-seam (shared-contract) change** — include the re-recorded member-set schema-snapshot (test 3).
- **Orchestrator doc rows to write hot (Step 9 routing):** the `apps/api/CLAUDE.md` cross-doc rows — `RunEventEnvelope` schemaVersion→5 + `RunEventType`→41 (incl. the 4 new) + the payload-map note (4 new = generic payload). **`ARCHITECTURE.md` Appendix-A `RunEventType` + schemaVersion rows → cody (lead, at the merge).**
- **Cross-track:** the sv4→5 schemaVersion bump is a frozen-shared-contract change → the lead announces sv4→5 + the 4 events to verifier/selection/demo so they re-record the member-set snapshot (additive, non-urgent), + coordinates the cody merge. **No blessing gate** — `candidate.rejected` emission is kernel-internal/deferred (the verifier is evidence-only/rule #6 + RETIRED); the amendment is kernel-internal, NOT cross-track-gated.

## Things to flag at Step 2.5
1. **Scope: killSwitch wires ONLY run.cancelled + generation.skipped.** My default vote: **yes** — the killSwitch maps run+generation (no agenome/candidate in its KillPlan), so `agenome.failed` (loop P3.10) + `candidate.rejected` (runtime-on-selection-verdict, deferred) are registry-adds only here. Confirm you do NOT extend the KillPlan to agenomes in this slice (that's a P3.10 decision if ever).
2. **Member grouping + the 41-count.** My default vote: run.cancelled in the run.* lifecycle block; generation.skipped in generation.*; agenome.failed + candidate.rejected in the failure/terminal block. Confirm the closure/count test asserts 41.
3. **Snapshot/fixture re-record surface.** My default vote: re-record the RunEventType member-set snapshot + the count test; fixtures move via `CURRENT_SCHEMA_VERSION` (no literal-4 pins). Flag if a fixture/snapshot pins a literal version that needs an explicit bump.
4. **spec-lint amendment override.** This amends a frozen/ticked contract (P0.1) → `spec-lint brief` may FAIL the unticked-checkbox check (the known amendment false-positive, kernel-016/018/020). Documented-override applies; I've stamped it in the dispatch.

## Dependencies + sequencing
- **Depends on:** the user's ratification (done) ✓ · P3.4 killSwitch (kernel-022 `dac730d`, the null-mappings to flip) ✓ · the audit (kernel-003 §H) ✓. Authored AFTER P3.5 (done `bf99d59`) + P3.9 (done) per the lead.
- **Blocks:** P3.10 (the loop emits `run.cancelled`/`generation.skipped`/`agenome.failed` + consumes the killSwitch's now-named events) + the DEFERRED `candidate.rejected` emission (RUNTIME P3 on SELECTION P5 verdict — P3↔P5 seam, MVP defined-but-not-yet-emitted). **Unblocks the sv4→5 cody merge** (lead-coordinated, kernel-internal — no blessing gate).

## Estimated commit count
**1.** SOLO freeze-amendment of a frozen shared contract (registry closure + schemaVersion) — its OWN commit, never bundled (the §19 amendment pattern, like kernel-016/018/020). **security-reviewer in the loop** (policy: invariant — registry closure + RISK-006): confirm closure preserved (unlisted still rejected), additive/backward-compat (v1..v4 validate), and the killSwitch null→event flip doesn't alter the per-state DISPOSITION (only the named event). `feat(contracts)` (the amendment lives in `packages/contracts`; the killSwitch edit rides it as the directly-enabled consumer, OR split a `feat(runtime)` follow-on if you prefer — your call at Step 9, but one logical amendment is fine since the killSwitch fix is the amendment's reason-for-being).

## Lessons-logged candidates anticipated
- **Architecture-doc note** — Appendix-A RunEventType→41 + schemaVersion→5 (cody, via the lead).
- **Convention candidate (maybe)** — "a reachable state-machine terminal needs a recording event (rule #2) — audit ALL terminals vs the registry, not one gap at a time" (extends the lesson 35/36 cross-track-amendment discipline). Route at Step 9 if it lands as a distinct principle.

## How to invoke
1. **Read this brief** + the kernel-020 amendment (the §19 playbook + the snapshot/fixture re-record mechanics) + the current `killSwitch.ts` (`runEventFor` / generation mapping).
2. **Run `/tdd terminal_event_registry_amendment_sv5`** (Step 0 may skip re-lint per the dispatch stamp / documented amendment override).
3. **Step 0/1** — confirm restatement + the exact snapshot/fixture files.
4. **Step 2.5** — send the per-test write-up + coverage map; the load-bearing confirmations are #1 (killSwitch wires only the 2) + #2 (41-count/closure).
5. **Step 9** — flag the cross-doc rows (schemaVersion→5, RunEventType→41) + that emission of agenome.failed (loop P3.10) / candidate.rejected (runtime-on-selection-verdict, deferred) is NOT wired here. I route the CLAUDE.md rows + flag the lead to announce sv4→5.
