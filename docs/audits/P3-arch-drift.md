# P3 arch-drift audit — §3 (domain model & lifecycle state machines) + §5 (runtime kernel)

**Phase:** P3 (Runtime kernel) — slices P3.11 (terminal classification), P3.12 (worker), P3.13 (crash-forward)
**Branch:** track/kernel
**Date:** 2026-06-22
**Auditor:** arch-drift-auditor (claude-sonnet-4-6)

---

## Anchors audited

| # | Anchor | File(s) |
|---|---|---|
| A1 | §3 Run state machine: `configured→running→completing→completed`, `running→stopping→stopped`, `running→failed`, `configured→cancelled`; terminal = `completed\|stopped\|failed\|cancelled`; no exit from terminal | `runtime/state/runStateMachine.ts`, `runtime/terminal/terminalClassifier.ts` |
| A2 | §3 Terminal classification: `completed` iff any generation produced a `selected` best-so-far (`fitness.scored ∧ ¬lineage.culled`); `failed` iff no scored survivor | `runtime/terminal/terminalClassifier.ts`, `runtime/terminal/partialSummary.ts` |
| A3 | §3 Transient statuses `completing`/`stopping` carry NO event (Q4/§62) | `runtime/terminal/terminalClassifier.ts:71` |
| A4 | §5 `energy_exhausted` is mid-flight, NOT a run-terminal; after it the classifier emits the REAL terminal (completed if a survivor was verified before exhaustion, else failed) | `runtime/caps/killSwitch.ts:89`, `runtime/terminal/terminalClassifier.ts:52-61`, `runtime/loop/generationLoop.ts:276-321` |
| A5 | §5 Crash recovery: `running→run.failed{crash}`; `configured→run.cancelled{crash}` (configured→failed is §3-illegal) | `runtime/recovery/crashForward.ts` |
| A6 | §5 Crash-forward: never resumes; already-terminal untouched; idempotent; pure/deterministic | `runtime/recovery/crashForward.ts` |
| A7 | §5 Worker: single-active-run serialization (kernel-enforced over the authoritative log); MVP one active run at a time; replay is read-only and viewable concurrently | `runtime/worker/runWorker.ts`, `runtime/worker/activeRunGuard.ts` |
| A8 | §5 Worker idempotency: keyed off persisted log/sequence watermark (not in-memory counter); every job idempotent via event-sequence checks | `runtime/worker/idempotency.ts`, `runtime/worker/runWorker.ts:100-105` |
| A9 | §5 Worker appends `run.started` (configured→running), guard-validated; owned by the worker (the loop's production caller) | `runtime/worker/runWorker.ts:107-118` |
| A10 | §5 Kill switch: `{any non-terminal} → failed/stopped`, halts scheduling, drains in-flight, writes partial terminal summary | `runtime/caps/killSwitch.ts`, `runtime/loop/killDrain.ts` |
| A11 | §5 Energy exhaustion: stop scheduling new work, let in-flight calls drain, emit `energy_exhausted` + partial summary, score the candidates already verified | `runtime/loop/generationLoop.ts:273-321`, `runtime/caps/killSwitch.ts:83-93` |
| A12 | §3 Run-terminal: no double-emit on already-terminal run (rule #2 immutability) | `runtime/terminal/terminalClassifier.ts:74-81`, `runtime/terminal/terminalClassifier.ts:120-129` |
| A13 | Deferred: REST POST /runs trigger, crash-forward boot-sequence call, Langfuse export — Phase-D bootstrap territory | IMPLEMENTATION_PLAN.md Carry-forward |

---

## Per-anchor verdict table

| Anchor | Contract statement | Code behavior | Verdict | Evidence |
|---|---|---|---|---|
| A1 | Run SM: `configured→running→completing→completed`, `running→stopping→stopped`, `running→failed`, `configured→cancelled`; terminal set = `{completed,stopped,failed,cancelled}`; no exit | `RUN_TRANSITIONS` table exactly matches; `RUN_TERMINALS = {completed,stopped,failed,cancelled}`; terminals have empty outgoing edge lists | VERIFIED (code + test) | `runtime/state/runStateMachine.ts:9-25`; `apps/api/test/unit/runtime/terminal/terminalClassifier.test.ts` `terminal_transition_is_guard_validated` |
| A2 | `completed` iff any `fitness.scored ∧ ¬lineage.culled`; `failed` iff none; `finalIdeaRef` = top-total survivor, tie-broken by lowest sequence | `classifyRunTerminal` steps: existing-terminal no-op → crash → operator/non-energy kill → `bestScoredSurvivor` (top-total, tie-break lowest sequence); culled candidates excluded via `culledCandidateIds` (both envelope `candidateId` and payload `targetIds[]`) | VERIFIED (code + test) | `terminalClassifier.ts:150-160`; `partialSummary.ts:30-77`; tests `completed_when_scored_survivor_exists`, `final_idea_is_best_scored_survivor_deterministic`, `scored_then_culled_is_not_a_survivor` |
| A3 | `completing`/`stopping` are transient (no event; §4/Q4) | `TRANSIENT_INTERMEDIATES` constant at line 71; `runTerminalPath` routes through them silently (no append call for the intermediate); tests assert `running→completed` path = `['completing','completed']` | VERIFIED (code + test) | `terminalClassifier.ts:71`, `terminalClassifier.ts:173-179`; test `terminal_transition_is_guard_validated` |
| A4 | `energy_exhausted` is mid-flight: excluded from real-terminal set; classifier falls through to scored-survivor rule; a pre-exhaustion survivor → `run.completed` | `RUN_TERMINAL_EVENT_STATUS` at line 56 maps only `run.completed/failed/stopped/cancelled` — `energy_exhausted` is explicitly absent; the energy-kill path falls through to step 4; tests cover both completed-after-exhaustion and failed-after-exhaustion | VERIFIED (code + test) | `terminalClassifier.ts:52-61`, `terminalClassifier.ts:141-161`; tests `energy_exhausted_then_classify_emits_real_terminal_completed`, `energy_exhausted_then_classify_emits_real_terminal_failed` |
| A5 | `running→run.failed{crash}`; `configured→run.cancelled{crash}` (configured→failed illegal) | `crashForward` calls `crashFromStatus` to distinguish `running` vs `configured`; running path reuses `classifyRunTerminal(crashed:true)` → `run.failed{crash}`; configured path hard-codes `status='cancelled', terminalEvent='run.cancelled'`; both guard-validated via `runTerminalPath` | VERIFIED (code + test) | `crashForward.ts:48-95`; tests `running_run_marked_failed_crash`, `configured_run_marked_cancelled_crash` |
| A6 | Crash-forward: no resume, no provider/model calls, already-terminal untouched, idempotent, deterministic | Import-ban test confirms no model-gateway/provider/fetch/Math.random/Date.now import; appends ONLY the run terminal; `isRunTerminal` skip for already-terminal; idempotent re-run appends nothing; deterministic test covers identical logs → identical results | VERIFIED (code + test) | `crashForward.ts:59-60`; `crashForward.test.ts` tests `never_resumes_no_provider_no_nonterminal_event`, `terminal_run_untouched`, `idempotent_rerun_is_noop`, `deterministic_over_log` |
| A7 | MVP one active run at a time, kernel-enforced over the authoritative log; replay (terminal) never active | `activeRunGuard` derives terminal flag from `isRunTerminal(log)` (checked against `RUN_TERMINAL_EVENTS` derived from `RUN_TERMINALS` set — same source as P3.11; energy_exhausted not in set → still active); replayed run is terminal in log → never active | VERIFIED (code + test) | `activeRunGuard.ts:14-21`, `runWorker.ts:87-96`; tests `rejects_start_when_nonterminal_run_exists`, `allows_start_when_all_runs_terminal`, `rejects_second_run_while_one_active` |
| A8 | Idempotency keyed off persisted log; no double-start, no double energy debit | `stepAlreadyRecorded` checks the PERSISTED log (not an in-memory counter); worker checks `run.configured` present + `run.started` absent before starting; `guardStep` returns `run:false / already_recorded` for duplicate steps | VERIFIED (code + test) | `idempotency.ts:27-46`; `runWorker.ts:100-105`; test `does_not_restart_running_or_terminal_run` |
| A9 | Worker appends `run.started` (configured→running), guard-validated | `canTransitionRun('configured','running')` checked; `run.started` appended before loop; `actor:'runtime'`, `payload:{from:'configured',to:'running'}` | VERIFIED (code + test) | `runWorker.ts:107-118`; test `emits_run_started_guard_validated` (sequence before first `generation.started` asserted) |
| A10 | Kill switch drives `{non-terminal}→failed/stopped`; halts scheduling; drains; writes partial summary | `planKillSwitch` maps each non-terminal run/generation status to its §3-legal terminal; `executeKillAndDrain` appends those + drains transient states (`completing→completed`, `stopping→stopped`, `degraded→verifying→failed`); latching halt: `break` stops scheduling; returns `partialSummary` | VERIFIED (code + test) | `killSwitch.ts:111-145`, `killDrain.ts:37-91`; generation loop `cap/kill tests` |
| A11 | Energy exhaustion: stop scheduling new work; let in-flight drain; emit `energy_exhausted` + partial summary; score candidates already verified | Kill check runs at the TOP of each generation (before new work starts); an energyBudget cap_breach triggers `executeKillAndDrain` which appends `energy_exhausted` (via `runEventFor`→`'energy_exhausted'`); the kill plan's `partialSummary` is the kill evidence; then classifyRunTerminal falls through to the scored-survivor rule — candidates scored in PRIOR completed generations ARE eligible | VERIFIED (code) | `generationLoop.ts:273-321`, `killSwitch.ts:83-93`, `killDrain.ts:46-61` |
| A12 | No double-emit: already-terminal run → no-op (terminalEvent null) | `existingRunTerminal` scans for any real run-terminal event; if found, returns `{status:existing, terminalEvent:null}`; executor only appends when `verdict.terminalEvent !== null` | VERIFIED (code + test) | `terminalClassifier.ts:74-81`, `terminalClassifier.ts:120-129`; test `already_terminal_run_admits_no_reclassification` |
| A13 | Deferred: REST POST /runs trigger, crash-forward boot call, Langfuse export | Worker source comment at line 30-32 explicitly states deferral; crash-forward comment at line 21-23 confirms; no Phase-D bootstrap code present (correct — deferred) | EXPECTED-DEFERRAL (not drift) | `runWorker.ts:30-32`, `crashForward.ts:21-23` |

---

## Detailed findings

### DRIFT findings

None.

### STALE-DOC notes

None. §3/§5 spec text and code are aligned.

### Ambiguous items

None.

---

## Test coverage summary (spec-tagged tests observed)

All P3.11/P3.12/P3.13 test files carry `spec(§3)` / `spec(§5)` annotations on individual test cases. The following are the key coverage points:

**P3.11 (terminalClassifier.test.ts):**
- `completed_when_scored_survivor_exists` — spec(§3)
- `failed_when_no_scored_survivor` — spec(§3)
- `final_idea_is_best_scored_survivor_deterministic` — spec(§3) + rule #7
- `scored_then_culled_is_not_a_survivor` — spec(§3) + §54/§63
- `energy_exhausted_then_classify_emits_real_terminal_completed` — spec(§5:210)
- `energy_exhausted_then_classify_emits_real_terminal_failed` — spec(§5:210)
- `operator_stop_classifies_stopped` — spec(§5)
- `operator_stop_of_configured_classifies_cancelled` — spec(§5/§4)
- `crash_classifies_failed_crash` — spec(§5)
- `terminal_verdict_is_replay_stable` — rule #7
- `already_terminal_run_admits_no_reclassification` — spec(§3) terminal-immutability + P3.2
- `terminal_transition_is_guard_validated` — P3.2 guard backstop
- Integration: `loop_exit_emits_single_run_terminal` (real PG) — spec(§3/§4) + rule #2

**P3.12 (runWorker.test.ts, activeRunGuard.test.ts, idempotency.test.ts):**
- `emits_run_started_guard_validated` — spec(§3 + P3.2)
- `does_not_restart_running_or_terminal_run` — spec(§5 + §3)
- `drives_generation_loop` — wiring
- `rejects_second_run_while_one_active` — spec(§5)
- `beats_heartbeat_each_iteration_side_signal` — rule #2 + §60
- `reads_are_append_only` — rule #2/§55
- `rejects_start_when_nonterminal_run_exists` — spec(§5)
- `allows_start_when_all_runs_terminal` — spec(§5)
- Integration: `run-terminal.test.ts` (real PG) — spec(§3/§4) + rule #2

**P3.13 (crashForward.test.ts, crash-forward.integration.test.ts):**
- `running_run_marked_failed_crash` — spec(§5:212)
- `configured_run_marked_cancelled_crash` — spec(§5 + P3.2/§48)
- `terminal_run_untouched` — spec(§5)
- `multiple_runs_recovered_independently` — spec(§5)
- `never_resumes_no_provider_no_nonterminal_event` — spec(§5 no-resume) + rule #7
- `deterministic_over_log` — spec(§5 deterministic) + rule #7
- `idempotent_rerun_is_noop` — idempotency
- `crash_terminal_guard_validated_via_append_path` — spec(§5 + rule #2 + P3.2)
- Integration: `recovers_nonterminal_runs_end_to_end`, `clean_slate_for_worker` (real PG)

---

## Notes

1. The `bestScoredSurvivor` tie-break uses LOWEST sequence (deterministic / replay-stable). §3 only specifies "the best-so-far survivor" as `finalIdeaRef`; the tie-break policy is an implementation choice documented in LESSONS §68. Code is right, spec is intentionally silent — not drift.

2. Energy exhaustion handling: §5 says "score the candidates already verified." The implementation achieves this by checking energy at the TOP of the next generation (not mid-generation), so by the time the kill fires, the prior generation's score seam has already run and its `fitness.scored` events are in the log. This is a correct implementation of the spec's intent.

3. Crash-forward maps `configured→cancelled` (not `configured→failed`). This is the documented LESSONS §48 / §72 rule (configured→failed is §3-illegal). The spec §5 says "marks any non-terminal run `failed`" — but this is the §3-override for configured runs (the legal edge wins). This is not drift; it's the correct per-status mapping that LESSONS §72 documents as the intended interpretation.

