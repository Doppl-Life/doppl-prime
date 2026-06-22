# /tdd brief — run_terminal_classification

## Feature
Classify a run's terminal verdict from the persisted event log — `completed` iff **any** generation ever produced a scored survivor (the best-so-far becomes the final idea, recorded on `run.completed`), `failed` iff **no** generation produced a scored survivor, `stopped`/`cancelled` on operator-stop/kill (carrying the P3.10e `KillPlanSummary`), and `failed{reason:"crash"}` for a crash-detected non-terminal run (the handoff P3.13 calls at boot). The verdict is a **pure, replay-stable** decision over the persisted log; a thin executor appends the single terminal event through the append path, guard-validated through the P3.2 run state machine.

## Use case + traceability
- **Task ID:** P3.11
- **Architecture sections it implements:** `ARCHITECTURE.md §3` (the run-terminal-classification rule — "end `completed` if **any** generation ever produced a `selected` best-so-far (that is the final idea); end `failed` only if **no** generation ever produced a scored survivor") + `§5` (the kill switch "drives {any non-terminal}→failed/stopped … writes a partial terminal summary"; "crash-forward … marks any non-terminal run `failed` (`run.failed{reason:"crash"}`) with a partial summary") + `§4` (the terminal events + per-run `sequence` as sole ordering key).
- **Related context:** P3.10e `executeKillAndDrain`/`KillPlanSummary` (`apps/api/src/runtime/loop/killDrain.ts` + `caps/killSwitch.ts`) — the kill path already returns the partial `KillPlanSummary` and explicitly **defers the run-terminal VERDICT to P3.11** (`generationLoop.ts:123`, `killDrain.ts:35`); the P3.2 run state machine (`runStateMachine.ts` — `canTransitionRun`, `RUN_TERMINALS`); the loop's existing survivor projection `resolveEligibleParents` (`fitness.scored ∧ ¬lineage.culled`, `generationLoop.ts:177`); apps/api LESSONS §48 (caps/kill = pure decisions, loop emits), §54/§63 (`selected = scored ∧ ¬culled`; audit terminals vs the registry), §30/§55 (replay-path structural purity), §62 (a status with no event type gets no fold branch).

<!-- REQ IDs derive from §3/§5 via the Spec Anchor Index. -->

## Acceptance criteria (what "done" means)
- [ ] `classifyRunTerminal(input)` returns **`completed`** when ≥1 candidate across the whole run reached `fitness.scored` and was **not** `lineage.culled` (a scored survivor); the verdict carries `finalIdeaRef` (the best-so-far candidateId) and the terminal event `run.completed`.
- [ ] Returns **`failed`** with `reason:"no_scored_survivor"` + a partial summary when **no** generation ever produced a scored survivor; terminal event `run.failed`.
- [ ] Returns **`stopped`** (operator stop of a running run) or **`cancelled`** (operator stop of a not-yet-running `configured` run) when given a P3.10e `KillPlanSummary` operator-stop trigger, carrying the partial summary (consistent with the kill switch, §5); terminal event `run.stopped` / `run.cancelled`.
- [ ] Returns **`failed`** with `reason:"crash"` + a partial summary for a crash-detected non-terminal run (the P3.13 boot caller passes `crashed:true`); terminal event `run.failed`.
- [ ] `finalIdeaRef` is the **top-`total` `fitness.scored` survivor**, tie-broken by **lowest `sequence`** — deterministic so the same log always yields the same final idea (replay-stable).
- [ ] The verdict reads **only persisted events** — `classifyRunTerminal` is PURE (no provider/embedding/web call, no `Math.random`/`Date.now`, no store write); the same persisted log always yields the **same** terminal verdict (byte-stable). Pinned structurally (import-ban) AND behaviorally (determinism).
- [ ] The thin executor appends **exactly one** terminal event through the append path (P3.3) — never an in-place edit — and **guard-validates** the transition through `canTransitionRun` before appending (an illegal/forced mapping is never appended; mirrors `executeKillAndDrain`).
- [ ] Once classified terminal, the run admits **no further transitions** — re-classifying / re-emitting on an already-terminal run is a no-op (rejected by `canTransitionRun` `from_terminal`, P3.2); no duplicate terminal event.
- [ ] Wiring: `runGenerationLoop` emits its run-terminal event at exit via the classifier + append path (it already captures `killSummary`); see Wiring.
- [ ] All unit tests in `apps/api/test/unit/runtime/terminal/terminalClassifier.test.ts` pass.
- [ ] Integration test (real Postgres) in `apps/api/test/integration/runtime/run-terminal.test.ts` passes (loop-exit emits the terminal through the real append path).
- [ ] `/preflight` clean (incl. `format:check` — LESSONS §50/§61).

## Wiring / entry point (Step 7.5)
Two layers (mirrors `planKillSwitch` pure-decision + `executeKillAndDrain` executor):
1. **Pure decision** — `classifyRunTerminal(...)` in `terminalClassifier.ts` (no IO) + `buildPartialTerminalSummary(...)` in `partialSummary.ts` (no IO). Reusable by both callers below.
2. **Executor / entry point** — `runGenerationLoop`'s **exit** (`apps/api/src/runtime/loop/generationLoop.ts`): after the generation loop finishes (happy path) or after `executeKillAndDrain` (kill path), call `classifyRunTerminal` over the run's persisted log (+ the captured `killSummary`), guard-validate via `canTransitionRun`, and append the single terminal event via the loop's existing `appendEvent`. The loop today emits **no** run-level terminal event (confirmed: zero `run.*` literals) and has **no** production caller yet — so this is the seam the comment at `generationLoop.ts:123` reserved.

The **crash** path's boot caller is **P3.13** (`crashForward.ts`) — out of scope here; P3.11 only delivers the pure `classifyRunTerminal(crashed:true)` branch P3.13 will call. The run-START transition (`configured→running`, `run.started`) is the worker/REST's (P3.12), **not** P3.11.

## Files expected to touch
**New:**
- `apps/api/src/runtime/terminal/terminalClassifier.ts` — `classifyRunTerminal(input) → RunTerminalVerdict` (pure decision) + the `RunTerminalVerdict` type.
- `apps/api/src/runtime/terminal/partialSummary.ts` — `buildPartialTerminalSummary(log, killSummary?) → PartialTerminalSummary` (pure; composes the `KillPlanSummary` + the scored-survivor history).
- `apps/api/test/unit/runtime/terminal/terminalClassifier.test.ts`
- `apps/api/test/integration/runtime/run-terminal.test.ts`

**Modified:**
- `apps/api/src/runtime/loop/generationLoop.ts` — call the classifier + append the terminal event at loop exit (entry point).
- `apps/api/src/runtime/index.ts` — barrel-export `classifyRunTerminal` / `buildPartialTerminalSummary` / the types (so P3.12/P3.13 import them).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `apps/api/test/unit/runtime/terminal/terminalClassifier.test.ts` (lead with a positive `classifyRunTerminal(validLog)` guard so the suite fails loudly if the export vanishes — LESSONS §10):

1. **`completed_when_scored_survivor_exists`** — a log with a `fitness.scored` candidate not `lineage.culled` → `{status:'completed', terminalEvent:'run.completed', finalIdeaRef}`. Why: §3:163 (completed iff any selected best-so-far).
2. **`failed_when_no_scored_survivor`** — a log with generations but no scored survivor → `{status:'failed', terminalEvent:'run.failed', reason:'no_scored_survivor', partialSummary}`. Why: §3:163 (failed iff none).
3. **`final_idea_is_best_scored_survivor_deterministic`** — multiple scored survivors → `finalIdeaRef` = highest `fitness.scored.total`, tie-broken by lowest `sequence`. Why: §3:163 + replay-stability (rule #7).
4. **`scored_then_culled_is_not_a_survivor`** — a candidate with `fitness.scored` AND `lineage.culled` is excluded → does not by itself yield `completed`. Why: §3:163 + LESSONS §54/§63 (`selected = scored ∧ ¬culled`).
5. **`operator_stop_classifies_stopped`** — running run + `KillPlanSummary{reason:'operator_stop', runTo:'stopping'}` → `{status:'stopped', terminalEvent:'run.stopped', partialSummary}` preserving partial evidence. Why: §5:206.
6. **`operator_stop_of_configured_classifies_cancelled`** — `configured` run + operator-stop kill summary (`runTo:'cancelled'`) → `{status:'cancelled', terminalEvent:'run.cancelled'}`. Why: §5/§4 (sv5 `run.cancelled`).
7. **`crash_classifies_failed_crash`** — `crashed:true` over a non-terminal run → `{status:'failed', terminalEvent:'run.failed', reason:'crash', partialSummary}`. Why: §5:212 (crash-forward; handoff P3.13).
8. **`terminal_verdict_is_replay_stable`** — same persisted log → byte-identical verdict; PURE (import-ban: the transitive import list is only `@doppl/contracts` + relative runtime modules + `import type`; no provider/store-write symbol, no `Math.random(`/`Date.now(`/`fetch(`). Why: rule #7/#2, LESSONS §30/§55.
9. **`already_terminal_run_admits_no_reclassification`** — a run already terminal (e.g. `completed`) → the executor appends no further terminal event (`canTransitionRun(terminal, …)` = `from_terminal`); no duplicate. Why: §3 terminal-immutability + P3.2.
10. **`terminal_transition_is_guard_validated`** — the executor validates `canTransitionRun(from,to)` before append (running→failed legal; a from-terminal mapping rejected) — never a forced/illegal append. Why: P3.2 guard backstop (mirrors `executeKillAndDrain`).

Integration `apps/api/test/integration/runtime/run-terminal.test.ts` (real Postgres):

11. **`loop_exit_emits_single_run_terminal`** — drive `runGenerationLoop` (faked seams) on a happy-path run that yields a scored survivor → exactly one `run.completed` with `finalIdeaRef` is appended via the real append path; no in-place edit; sequence-ordered. Why: entry point + §H (every run reaches a persisted terminal) + safety rule #2.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** `run.completed`/`run.failed`/`run.stopped`/`run.cancelled` all already in the frozen `RunEventType` registry (sv5, 41-member); all four are **low-traffic → generic JSONB payload** (no `HIGH_TRAFFIC_PAYLOAD_MAP` entry) so the partial-summary / `finalIdeaRef` payloads need **no** Appendix-A model and **no** schema bump. `RunStatus`/`Run` consumed unchanged (frozen P0.15).
- **Orchestrator doc rows to write hot (Step 9 routing):** none required (cross-doc invariant = none). **Architecture-doc note candidate** (→ cody via lead at track-completion merge; parked in ledger §I, NOT a hot edit — kernel→cody merge is deferred): §5 — "the kernel's run-terminal classifier derives the verdict purely from the persisted log (scored-survivor projection), emits the single terminal event guard-validated through P3.2, and is replay-stable." Flag at Step 9.
- **§2.5-seam (shared-contract) model touched?** **No** — no Appendix-A model's field set changes; no schema-snapshot test needed.

> **Orchestrator territory** — flag at Step 9 categorized; the orchestrator writes hot. The kernel→cody merge is DEFERRED to track-completion, so the §5 arch note is **parked in ledger §I**, applied at that merge (do NOT hot-edit cody-bound `ARCHITECTURE.md` this round).

## Things to flag at Step 2.5
1. **Final-idea selection without the P5 selection track.** §3:163's completed condition names a "`selected` best-so-far," but selection (P5) is **not in the kernel track** and there is **no `candidate.selected` event** — the kernel's only available survivor signal is `fitness.scored ∧ ¬lineage.culled`. My default vote: **derive the best-so-far = the top-`total` `fitness.scored` survivor (tie-break lowest `sequence`), record its candidateId as `finalIdeaRef` on `run.completed`** — replay-derivable now; P5's authoritative `candidate.selected` (P3↔P5 seam) supersedes/consumes later by candidateId. Alternative: record only "a survivor exists" and defer `finalIdeaRef` to P5. Rationale for the default: §3 makes terminal classification the **kernel's** job, the survivor projection already exists (`resolveEligibleParents`), and a replay-stable final idea is strictly more useful for the demo than a deferred null.
2. **Pure decision + thin executor, or fold it all into the loop?** My default vote: **pure `classifyRunTerminal` (no IO) + caller-emits** — mirrors `planKillSwitch`/`executeKillAndDrain` and lets **both** the loop (now) and P3.13 crash-forward (later) reuse the same decision. Keeps replay-purity provable by the import-ban test.
3. **Wiring home — `runGenerationLoop` exit vs the P3.12 worker.** My default vote: **wire the terminal emission into `runGenerationLoop`'s exit** (it already captures `killSummary`, owns `appendEvent`, and the comment at `:123` reserved this seam); the P3.12 worker then just calls the loop. The `configured→running` start transition stays the worker/REST's, not P3.11's.
4. **The `completing`/`stopping` intermediate has no event type.** The registry has `run.completed`/`run.stopped` but **no** `run.completing`/`run.stopping` marker. My default vote: **emit ONLY the terminal event**; treat `completing`/`stopping` as a transient passed THROUGH (`canTransitionRun` validated, status-only, no event — consistent with the registry + LESSONS §62/§63 "a status with no event type gets no fold branch"), exactly as `executeKillAndDrain` appends `run.completed` validating `completing→completed`.
5. **`reason` vocabulary — fixed set, never reflected.** My default vote: a **closed** reason set — `failed` → `"no_scored_survivor"` | `"crash"`; `stopped`/`cancelled` carry the `KillPlanSummary.reason` (`operator_stop` / `cap_breach:<dim>` / `wall_clock_timeout`). No free-form / reflected reason string (mirrors the kill switch's fixed reasons).

## Dependencies + sequencing
- **Depends on:** P3.10 (the generation loop + `KillPlanSummary`, landed `201dfe3`), P3.2 (run state machine `canTransitionRun`, landed `087f2b1`), P3.3 (append path, satisfied by P1.3), P0.15 (frozen `Run`/`RunStatus`).
- **Blocks:** P3.12 (worker — the loop's production caller, which surfaces the terminal verdict) + P3.13 (crash-forward — calls `classifyRunTerminal(crashed:true)` at boot).

## Estimated commit count
**1.** Standalone. The slice touches the run-terminal lifecycle decision **and** the replay-stability rule (#7/#2) — per the template pitfall "Replay-determinism slices are authored standalone, never bundled with feature work." The two NEW files (`terminalClassifier.ts` + `partialSummary.ts`) + the loop-exit wiring are one logical unit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "run-terminal classification is a PURE decision over the persisted log (scored-survivor projection) + a thin append-path executor (mirrors `planKillSwitch`/`executeKillAndDrain`); replay-stable by construction (no provider/RNG/clock/store-write in scope — import-ban + determinism pins)."
- **Convention candidate** — "the kernel's MVP `selected` best-so-far = the top `fitness.scored ∧ ¬culled` survivor (tie-break lowest sequence); P5's authoritative `candidate.selected` supersedes by candidateId — the kernel never blocks on the absent selection track."
- **Architecture-doc note candidate** — §5 run-terminal classifier behavior (→ cody at the track-completion merge; parked in ledger §I).

## How to invoke
1. **Read this brief end-to-end** + `ARCHITECTURE.md §3` (line ~163 terminal-classification rule) + `§5` (kill switch + crash-forward) + `killSwitch.ts`/`killDrain.ts` (`KillPlanSummary`) + `runStateMachine.ts` (`canTransitionRun`) + `generationLoop.ts` (`resolveEligibleParents` + the `:123` reserved seam) + LESSONS §48/§54/§63/§30/§55/§62.
2. **Run `/tdd run_terminal_classification`** in the implementer session.
3. **Step 0 (Restate)** — confirm against the Feature line.
4. **Step 1 (Identify files)** — confirm against Files expected to touch.
5. **Step 2.5 (test review pause)** — ping back with answers to the 5 design questions (or take defaults). Don't proceed to Step 4 until sign-off.
6. **Step 9 (summarize)** — flag the §5 arch-doc note (cody-bound, ledger-parked); confirm NO Appendix-A row; surface the anticipated convention lessons. After this lands → P3.12 worker (SOLO) next.
