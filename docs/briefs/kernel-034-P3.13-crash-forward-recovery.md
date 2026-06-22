# /tdd brief — crash_forward_recovery_at_boot

## Feature
At boot, before the worker accepts new work, the kernel reads the event log and **forward-fails every orphaned non-terminal run** to its §3-legal terminal with `reason:"crash"` — `running → run.failed{crash}`, `configured → run.cancelled{crash}` (the never-started edge; `configured→failed` is illegal per P3.2) — each with a partial summary, appended through the normal append path (guard-validated, sequence-ordered, replayable). It **never resumes** a crashed run (true resume is deferred; replay/prepared runs are the fallback), leaves already-terminal runs untouched, is **idempotent** (a re-run appends nothing) and **deterministic** over the log. This gives P3.12's single-active-run guard a clean no-active-run state. **The kernel track's last feature slice.**

## Use case + traceability
- **Task ID:** P3.13
- **Architecture sections it implements:** `ARCHITECTURE.md §5` ("Crash recovery (resolved — MVP): crash-forward. On restart the kernel reads the event log, marks any non-terminal run `failed` (`run.failed{reason:"crash"}`) with a partial summary; the operator falls back to a prepared/replay run. True idempotent resume is deferred") + `§3` (the legal run terminal edges) + `§4` (terminal events appended through the per-run sequence).
- **Related context:** P3.11 `classifyRunTerminal(crashed:true)` → `run.failed{reason:crash}` + `runTerminalPath(from, terminal)` guard-validation + `buildPartialTerminalSummary` (`62f80a1`; P3.11 explicitly deferred the non-`running` crash edge to P3.13 — `runTerminalPath('configured','failed')` is `null`); P3.12 `isRunTerminal(log)` (over `RUN_TERMINALS`) + the injected `listRunIds` dep pattern + the "recovery runs before the worker accepts new work → clean no-active-run state" acceptance (`b9dfeda`); P3.2 `canTransitionRun`/`RUN_TERMINALS` (`runStateMachine.ts`); LESSONS §48 (kill switch — "§5's blanket phrasing does NOT map 1:1; map each non-terminal to its §3-LEGAL terminal"), §55 (narrowed read-only store type), §70 (worker = clean-slate precondition; log-derived concurrency).

<!-- REQ IDs derive from §5/§3/§4 via the Spec Anchor Index. -->

## Acceptance criteria (what "done" means)
- [ ] `crashForward(deps)` enumerates runs (injected `listRunIds`, same pattern as P3.12) and, for each **non-terminal** run (`isRunTerminal(log)` false), appends ITS §3-legal crash terminal: `running → run.failed{reason:"crash"}`; `configured → run.cancelled{reason:"crash"}` (the never-started run — `configured→failed` is illegal, so the only legal edge; reason still `crash`). Each carries a partial summary.
- [ ] An **already-terminal** run is left untouched — no re-fail, no duplicate terminal event (idempotent skip via `isRunTerminal`).
- [ ] **Never resumes:** crash-forward appends ONLY the run-terminal event — it never re-executes a generation, never calls a provider/embedding/RNG, never appends a non-terminal lifecycle event (forward-fail only; §5 "true resume deferred").
- [ ] The crash-forward terminal is appended through the **normal append path** (P3.3) so it is per-run sequence-ordered + replayable; the transition is **guard-validated** via `runTerminalPath`/`canTransitionRun` (P3.2) — never a forced illegal transition.
- [ ] **Deterministic over the log:** the same crashed-state log always yields the same recovery events (PURE — import-ban: no provider/store-write/`Math.random`/`Date.now`/`fetch`; reads only persisted events + appends).
- [ ] **Idempotent re-run:** running `crashForward` again after recovery appends nothing (the terminal it wrote makes the run terminal → skipped).
- [ ] After crash-forward, **every run is terminal** → P3.12's single-active-run guard starts from a clean no-active-run state (the §5 ordering: recovery before the worker accepts work).
- [ ] All unit tests in `apps/api/test/unit/runtime/recovery/crashForward.test.ts` pass.
- [ ] Integration test (real Postgres) in `apps/api/test/integration/runtime/crash-forward.test.ts` passes.
- [ ] `/preflight` clean (incl. `format:check`).

## Wiring / entry point (Step 7.5)
`crashForward(deps)` is tested standalone (drives recovery over a real-PG log). **Its production caller — the app boot sequence that runs `crashForward` BEFORE the worker accepts work — is DEFERRED to integration/Phase D** (the bootstrap that wires the worker's REST trigger also wires crash-forward-at-boot; same territory deferral as P3.12's worker, since the bootstrap/`routes` layer is demo/Phase-D territory and the kernel→cody merge is deferred). Name the seam: `bootstrap → crashForward({listRunIds, eventStore}) → (then) worker accepts work`. The integration test exercises `crashForward` directly against real PG; barrel-exported for the boot caller. The /phase-exit reachability audit will note crash-forward's production caller as the deferred Phase-D boot wiring (acceptable explicit deferral, same shape as the loop→worker→REST chain).

## Files expected to touch
**New:**
- `apps/api/src/runtime/recovery/crashForward.ts` — `crashForward(deps)`: enumerate via injected `listRunIds` → per non-terminal run, derive the log status (configured vs running) → map to the legal crash terminal (`running→run.failed{crash}` / `configured→run.cancelled{crash}`) → guard-validate via `runTerminalPath` → append via P3.3. Reuses `classifyRunTerminal(crashed:true)` for the `running` verdict + `buildPartialTerminalSummary`.
- `apps/api/test/unit/runtime/recovery/crashForward.test.ts`
- `apps/api/test/integration/runtime/crash-forward.test.ts`

**Modified:**
- `apps/api/src/runtime/index.ts` — barrel-export `crashForward`.

**Explicitly NOT touched:** `apps/api/src/runtime/terminal/terminalClassifier.ts` (P3.11 — crashForward layers the per-status mapping ON TOP, additive; do NOT edit the classifier). `routes/` (demo territory). If you need to touch either, **STOP and flag at Step 2.5**.

## RED test outline (Step 2)
`crashForward.test.ts` (faked `listRunIds` + per-run log; lead with a positive guard, LESSONS §10):
1. **`running_run_marked_failed_crash`** — a non-terminal `running` run (`run.started`, no terminal) → exactly one `run.failed{reason:"crash"}` + partial summary, guard-validated (`running→failed`). Why: §5:212.
2. **`configured_run_marked_cancelled_crash`** — a never-started `configured` run (`run.configured`, no `run.started`) → `run.cancelled{reason:"crash"}` (`configured→failed` illegal; `configured→cancelled` is the only legal edge). Why: §5 + P3.2/LESSONS §48.
3. **`terminal_run_untouched`** — a run with a real terminal already → NO new event (idempotent skip). Why: §5 ("left untouched").
4. **`multiple_runs_recovered_independently`** — a mix (terminal + running + configured) → only the two non-terminal runs get their crash terminal; the terminal one untouched. Why: §5.
5. **`never_resumes_no_provider_no_nonterminal_event`** — crash-forward appends ONLY run-terminal events; no generation re-execution, no non-terminal lifecycle append, no provider/RNG/clock (import-ban). Why: §5 (no resume) + rule #7.
6. **`deterministic_over_log`** — same crashed-state log → byte-identical recovery events. Why: §5 deterministic + rule #7.
7. **`idempotent_rerun_is_noop`** — re-running crash-forward after recovery → no new events (the appended terminal makes the run terminal → skipped). Why: idempotency.
8. **`crash_terminal_guard_validated_via_append_path`** — the terminal is appended through P3.3 (sequence-ordered) and `runTerminalPath`-validated; an illegal transition is never forced. Why: §5 + rule #2 + P3.2.

Integration `crash-forward.test.ts` (real Postgres):
9. **`recovers_nonterminal_runs_end_to_end`** — seed a `running` run (no terminal) + a `configured` run + a terminal run via the real append path → `crashForward` appends `run.failed{crash}` + `run.cancelled{crash}` for the two non-terminal, leaves the terminal untouched, all sequence-ordered. Why: §5/§H.
10. **`clean_slate_for_worker`** — after crash-forward, `isRunTerminal` is true for every run (P3.12's guard starts clean — the §5 recovery-before-worker ordering). Why: §5 + P3.12.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** `run.failed`/`run.cancelled` already in the frozen `RunEventType` registry; `reason:"crash"` is a generic JSONB payload value (low-traffic, no `HIGH_TRAFFIC_PAYLOAD_MAP` entry). No Appendix-A model + no schema bump.
- **Orchestrator doc rows to write hot (Step 9 routing):** none required. **Architecture-doc note candidate** (→ cody via lead at track-completion merge; ledger §I-parked — NOT a hot edit): §5 — "crash-forward maps each orphaned non-terminal run to its §3-legal crash terminal (`running→run.failed{crash}`, `configured→run.cancelled{crash}` — never a blanket →failed, per LESSONS §48), run-level, deterministic + idempotent, appended via P3.3; boot-wired before the worker accepts work (Phase-D)." Flag at Step 9.
- **§2.5-seam model touched?** **No.**

> **Orchestrator territory** — flag at Step 9; the §5 arch note is cody-bound → ledger §I (kernel→cody merge deferred). Do NOT hot-edit `ARCHITECTURE.md`/`terminalClassifier.ts`/`routes/` this round.

## Things to flag at Step 2.5
1. **Per-status crash-terminal mapping (the crux).** My default vote: crashForward maps each non-terminal run's LOG-observable status to its §3-legal crash terminal — `running → run.failed{reason:"crash"}` (the spec's case, via `classifyRunTerminal(crashed:true)`); `configured → run.cancelled{reason:"crash"}` (never-started; `configured→failed` is illegal per P3.2, so `cancelled` is the only legal edge — exactly LESSONS §48 "§5's blanket phrasing doesn't map 1:1"). `completing`/`stopping` are NOT log-observable (transient, no event — Q4) so they don't arise. crashForward OWNS this mapping (layers on top of the P3.11 classifier; does NOT edit `terminalClassifier.ts`). Confirm — or, if you'd rather generalize `classifyRunTerminal` to per-status (edits the P3.11 file), raise it.
2. **`configured → cancelled{crash}` disposition.** My default vote: a never-started `configured` run IS terminalized (→`run.cancelled{reason:"crash"}`), NOT left for the worker — because P3.12's `isRunTerminal(configured)=false` means leaving it would make the worker's single-active-run guard see it as active and block new runs (violating the §5 "clean no-active-run state"). `reason:"crash"` (not operator) disambiguates the cancel. Alternative: a distinct reason (`"abandoned_on_recovery"`). Vote: terminalize → cancelled, reason `crash`.
3. **Run-level only, or drain the crashed run's GENERATIONS too?** My default vote: **run-level terminal only** for MVP (the spec's explicit scope — `run.failed{crash}`; the run terminal gates the worker's clean slate + the projections). Generation-level drain on crash (reuse `executeKillAndDrain`) is a follow-up — the generations under a crash-failed run are moot for the demo + replay derives from the run terminal. Flag if you see a reason to drain generations now.
4. **Boot-caller wiring deferred to Phase D.** My default vote: `crashForward` tested standalone; the boot-sequence call (run crash-forward BEFORE the worker accepts work) deferred to integration/Phase D (same territory pattern as the worker's REST trigger). The phase-exit reachability audit notes it.
5. **`listRunIds` reuse.** My default vote: the same injected `listRunIds` dep as P3.12 (runtime can't import projections; the caller/integration test supplies the real drizzle impl). Reuse the P3.12 pattern verbatim.

## Dependencies + sequencing
- **Depends on:** P3.11 (`classifyRunTerminal`/`runTerminalPath`/`buildPartialTerminalSummary` — `62f80a1`), P3.12 (`isRunTerminal` + the injected `listRunIds` pattern — `b9dfeda`), P3.2 (`canTransitionRun`/`RUN_TERMINALS`), P3.3 (append path), P0.15 (frozen `Run`/`RunStatus`).
- **Blocks:** nothing in the kernel track — this is the **last feature slice**. After it lands → `/phase-exit P2` + `/phase-exit P3` close the kernel track (the last of the 5 build tracks).

## Estimated commit count
**1.** One cohesive composition slice (crashForward + its tests). Not bundled — the track's last feature slice, its own commit. It reuses P3.11/P3.12 primitives + adds the per-status crash-terminal mapping; one logical unit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "crash-forward maps each orphaned non-terminal run to its §3-LEGAL crash terminal per the log-observable status (`running→run.failed{crash}`, `configured→run.cancelled{crash}`) — never a blanket →failed (the state machine forbids `configured→failed`); extends LESSONS §48's per-state-disposition to boot recovery."
- **Convention candidate** — "crash-forward is the worker's clean-slate precondition: it runs before the worker accepts work and terminalizes EVERY non-terminal run (so P3.12's single-active-run guard starts clean), forward-fail only (no resume), idempotent + deterministic + append-only."
- **Architecture-doc note candidate** — §5 crash-forward behavior + the boot-before-worker ordering (→ cody at the merge; ledger-parked).

## How to invoke
1. **Read this brief end-to-end** + `ARCHITECTURE.md §5` (crash recovery) + `terminalClassifier.ts` (`classifyRunTerminal(crashed:true)`/`runTerminalPath` — to REUSE, not edit) + `runStateMachine.ts` (`RUN_TERMINALS`/`canTransitionRun`) + the P3.12 worker's `isRunTerminal` + injected-`listRunIds` pattern + LESSONS §48/§55/§70.
2. **Run `/tdd crash_forward_recovery_at_boot`** in the implementer session.
3. **Step 0 (Restate)** — confirm against the Feature line.
4. **Step 1 (Identify files)** — confirm against Files expected to touch; `terminalClassifier.ts` + `routes/` are OFF-LIMITS.
5. **Step 2.5 (test review pause)** — ping back with answers to the 5 design questions (esp. the per-status crash-terminal mapping). Don't proceed to Step 4 until sign-off.
6. **Step 9 (summarize)** — flag the §5 arch-doc note (cody-bound, ledger-parked); confirm NO Appendix-A row; the boot-caller Phase-D deferral; the convention lessons. **After this lands → I dispatch `/phase-exit P2` + `/phase-exit P3` to close the kernel track.**
