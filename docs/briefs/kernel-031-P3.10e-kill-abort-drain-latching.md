# /tdd brief — kill_abort_drain_latching

## Feature
**P3.10 sub-slice (e) — the loop's KILL/ABORT path (the last P3.10 slice, capstone SAFETY).** The generation loop now enforces the FULL cap set per iteration (energyBudget via `cumulativeSpend` + wall-clock via `enforceWallClock` + the count caps) and detects operator-stop; on a breach/stop it drives the kernel kill switch (`planKillSwitch`, P3.4) and EXECUTES the plan: append the §3-legal terminal events (incl. the sv5 `run.cancelled`/`generation.skipped`), **DRAIN-then-terminalize** the kill-EXCLUDED states (completing→completed, stopping→stopped, degraded→verifying→failed), under a **LATCHING halt** (the kill stays armed through the drain — a drained transient hits its terminal under the still-active kill, never re-arms into new productive work), record `generation_failed` on a per-stage abort, and write the partial terminal summary. Completes P3.10 bullets 7/8 + the §H/§C carry-forwards (drain-then-terminalize, latching halt). SAFETY (rule #1 caps kernel-enforced).

## Use case + traceability
- **Task ID:** P3.10 sub-slice (e) — P3.10 bullets 7 (caps reached → end via terminal classification) + 8 (per-stage deadline/wall-clock/kill aborts the generation to failed → generation_failed). Folds the deferred 10d→10e energyBudget ENFORCEMENT + the lead-endorsed §H carry-forwards.
- **Architecture sections it implements:** `ARCHITECTURE.md §5` (the kill switch — "operator stop or any cap breach drives {any non-terminal}→failed/stopped, halts scheduling, drains in-flight calls, writes a partial terminal summary"; "energy exhaustion mid-generation: stop scheduling new work, let in-flight calls drain, emit energy_exhausted + partial summary, score the candidates already verified") + `§3` (the legal terminal transitions the kill drives) + `§4` (the terminal events). Key safety rule #1 (caps kernel-enforced, the kill switch is the enforcement actuator), #2 (every kill transition is a persisted terminal event).
- **Why:** 10b bounded the loop by maxGenerations/maxPopulation (the natural termination). 10d emitted energy.spent (the accounting). 10e adds the ABORT path: the energyBudget/wall-clock/operator-stop breaches that halt mid-run, executed through the P3.4 kill switch (built but with no production caller yet — 10e is its first consumer). The drain + latching are the §H load-bearing guards (lead-endorsed): "every non-terminal reaches terminal under kill" must hold end-to-end, and the kill is a LATCHING halt (not a one-shot edge) so a drained transient can't re-arm.
- **Pattern:** the loop's per-iteration guard gains the full cap check (`cumulativeSpend(energy.spent events, scope) ≥ energyBudget` + `enforceWallClock(now()-startedAt, caps)` + the count caps) + an operator-stop check; on breach/stop → `planKillSwitch(trigger, runStatus, generations)` → execute (append `plan.run.terminalEvent` + each `plan.generations[].terminalEvent`) → drain the EXCLUDED in-flight states → latch.

## Acceptance criteria (what "done" means)
- [ ] **energyBudget enforcement:** before scheduling new productive work, the loop folds `cumulativeSpend(events, {kind:'run', id:runId})` (the energy.spent ACTUAL, P3.5) and if `≥ caps.energyBudget` triggers a `cap_breach{dimension:'energyBudget'}` kill (the deferred 10d→10e item). The energy exhaustion path stops scheduling new work, drains in-flight, and records the breach + partial summary (§5).
- [ ] **wall-clock enforcement:** the loop checks `enforceWallClock(now() - run.startedAt, caps)` (injected `now()` — replay-safe, no ambient clock) each iteration; a breach triggers `cap_breach{dimension:'wallClockTimeoutMs'}` (the exclusive-deadline semantics from P3.4).
- [ ] **operator-stop:** an injected operator-stop signal triggers `operator_stop` → `planKillSwitch`.
- [ ] **kill-plan execution:** the loop calls `planKillSwitch(trigger, runStatus, generations)` and appends the plan's terminal events through the append path — `plan.run.terminalEvent` (run.cancelled for configured→cancelled / run.stopped / run.failed) + each `plan.generations[].terminalEvent` (generation.skipped for pending→skipped / generation_failed). The sv5 events (run.cancelled / generation.skipped) are now NAMED by the plan (kernel-026) — assert they're emitted (not null).
- [ ] **drain-then-terminalize the EXCLUDED states:** `planKillSwitch` EXCLUDES already-terminalizing/transient states (completing/stopping/degraded — no direct kill-edge). The loop DRAINS them to terminal: `completing→completed`, `stopping→stopped`, `degraded→verifying→failed` — each guard-validated, each its recording event/marker. After the kill, NO generation/run is left non-terminal (the "every non-terminal reaches terminal under kill" invariant holds end-to-end).
- [ ] **LATCHING halt:** the kill is a latching flag, not a one-shot edge. Once set: (a) the loop schedules NO new productive work (no new generation, no new candidate gen); (b) in-flight states drain UNDER the still-active kill — a drained `degraded→verifying` then hits `verifying→failed` under the latch (NOT re-arming into new productive work or stalling mid-drain); (c) a drained state can never re-arm. Pin this explicitly.
- [ ] **generation_failed on per-stage abort:** a per-stage deadline/wall-clock/kill that aborts the current generation state records `generation_failed` (bullet 8).
- [ ] **partial terminal summary:** the kill records the `KillPlanSummary` (reason, runFrom, runTo, generationsTerminated) — the partial evidence preserved (§5). [Note: the FULL run-terminal classification — completed-if-ever-selected vs failed — is P3.11; 10e records the kill's partial summary, not the run-terminal verdict.]
- [ ] All kill/drain transitions guard-validated (`canTransitionRun`/`canTransitionGeneration`) before append (rule #2); all via the append path. Full suite green; `/preflight` clean (incl `format:check`, LESSON 40).
- [ ] **Out of scope (named):** run-terminal classification (completed/failed verdict over the whole run) = P3.11 · the worker that drives the loop = P3.12 · crash-forward = P3.13 · candidate.generation_started marker · successor-population threading.

## Wiring / entry point (Step 7.5)
Extends `runGenerationLoop` (the 10b/10c/10d entry, runtime barrel) — the cap-check + kill-execution + drain are internal to the loop. `planKillSwitch` (P3.4) gets its FIRST production caller here. The injected `now()` (wall-clock) + operator-stop signal are loop deps. No new exported entry.

## Files expected to touch
**Modified (runtime):**
- `apps/api/src/runtime/loop/generationLoop.ts` — the full cap-check (energyBudget via cumulativeSpend + wall-clock via enforceWallClock + count caps) + operator-stop + planKillSwitch execution + drain-then-terminalize + the latching-kill flag + generation_failed-on-abort + partial summary.
- (If sizable, extract `apps/api/src/runtime/loop/killDrain.ts` per the tracker P3.10 file plan — confirm at Step 2.5.)
**Tests:**
- `apps/api/test/unit/runtime/loop/generationLoop.test.ts` (extend) — the breach/stop/kill/drain/latching cases below, with faked clock + injected stop + faked energy.spent accumulation.

## RED test outline (Step 2)
1. **`energy_budget_breach_triggers_kill`** — cumulativeSpend(energy.spent) reaching energyBudget → cap_breach kill; no new productive work scheduled after; partial summary recorded. Why: §5 / rule #1.
2. **`wall_clock_breach_triggers_kill`** — injected now() past startedAt+wallClockTimeoutMs → cap_breach{wallClockTimeoutMs} kill (exclusive deadline). Why: §5 / rule #1.
3. **`operator_stop_triggers_kill`** — injected stop → operator_stop kill plan executed. Why: §5.
4. **`kill_plan_emits_named_sv5_terminals`** — configured→cancelled emits `run.cancelled`; pending→skipped emits `generation.skipped` (the sv5 events, not null); running→failed emits generation_failed/run.failed. Why: §4 + rule #2 (kernel-026 sv5).
5. **`drain_then_terminalize_excluded_states`** — completing→completed, stopping→stopped, degraded→verifying→failed all reach terminal under the kill (no non-terminal left). Why: §H carry-forward / "every non-terminal reaches terminal".
6. **`latching_halt_no_rearm`** — after kill, a drained degraded→verifying then hits verifying→failed under the STILL-ACTIVE kill (no new generation/candidate work scheduled; no re-arm; no mid-drain stall). Why: the load-bearing latching guard (lead).
7. **`generation_failed_on_per_stage_abort`** — a kill mid-stage records generation_failed for the aborted generation. Why: bullet 8.
8. **`all_transitions_guard_validated`** — every kill/drain transition passes canTransitionRun/Generation before append; an illegal forced transition is rejected. Why: rule #2 / P3.2.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **NONE (Appendix-A).** Consumes frozen contracts (RunStatus/GenerationStatus terminals, the kill events, KillPlan from P3.4) — no field change.
- **Architecture-doc note (→ cody via lead):** §5 — the loop's kill execution = planKillSwitch + drain-then-terminalize the excluded states under a latching halt (pairs with the kernel-022 cody-bound §5 kill-mapping note already in the ledger). Flag at Step 9.

## Things to flag at Step 2.5
1. **`energy_exhausted` representation.** Confirm at Step 1: is `energy_exhausted` a distinct RunEventType member, OR is the energyBudget breach recorded as `run.failed`/the killSwitch terminal with a reason? (If §5's "emit energy_exhausted" needs a registry event that's ABSENT, that's a Finding → me, kernel-026-style — but likely it's the kill terminal + a reason, no new event.) My default: the kill terminal (run.failed) carries the breach; no new event.
2. **Latching-kill representation.** A boolean latch threaded through the loop iteration vs a kill-state object. My vote: a latch flag the per-iteration guard checks first (armed → no new work, drain only). Confirm.
3. **File extraction** (killDrain.ts) vs in-loop.
4. **Injected now() + operator-stop deps** — confirm the loop deps gain `now()` (already anticipated in 10b) + an operator-stop signal (a checked flag/callback).
5. **Partial summary vs run-terminal.** Confirm 10e records the kill's KillPlanSummary (partial evidence) and the run-terminal verdict (completed-if-ever-selected vs failed) is P3.11 (not here).

## Dependencies + sequencing
- **Depends on:** 10b/10c/10d loop · P3.4 caps/kill-switch (planKillSwitch/enforceWallClock/enforceCap — first production caller) · P3.5 energy (cumulativeSpend, for the energyBudget fold over energy.spent — now emitted by 10d) · kernel-026 sv5 (run.cancelled/generation.skipped named) — all done. **No `git merge cody`** (10d pulled the scrub fix already).
- **Blocks:** P3.11 (run-terminal classification reads the kill's partial summary + the terminal history) · P3.12 (worker) · P3.13 (crash-forward).
- **Sequencing:** the LAST P3.10 sub-slice. **SAFETY** (rule #1) — security-reviewer policy = **invariant** (confirm: the kill is latching not one-shot; every non-terminal reaches terminal under kill; no re-arm into productive work after kill; caps fail-closed; all transitions guard-validated). After this lands GREEN, P3.10 is COMPLETE → `/phase-exit P2` (P2.3/P2.8 now unblocked by the observability merge) + `/phase-exit P3` close the track.

## Estimated commit count
**1** (+ optional killDrain.ts extraction, same commit). `feat(runtime)`. The kill path is one cohesive SAFETY concern — it CANNOT split (killing without draining the excluded states strands them non-terminal, unsafe). Isolated from feature work (10b/10c) by design.

## Lessons-logged candidates anticipated
- **Convention candidate (likely):** "the kill switch is a LATCHING halt executed by the loop — drain-then-terminalize the kill-EXCLUDED states under the still-active latch so 'every non-terminal reaches terminal under kill' holds end-to-end, and a drained transient never re-arms" (extends LESSON 38 caps+kill). Route at Step 9 if distinct.

## How to invoke
1. Read this brief + `ARCHITECTURE.md §5` (kill switch + energy exhaustion) + the kill switch (`planKillSwitch`/`KillPlan`, P3.4) + the loop (`generationLoop.ts`) + LESSON 38 (caps+kill pure decisions).
2. Run `/tdd kill_abort_drain_latching`.
3. Step 1 — confirm the `energy_exhausted` representation (flag #1).
4. Step 2.5 — send the per-test write-up; load-bearing confirms: #1 energy_exhausted representation · #2 latching-kill · #5 partial-summary-vs-P3.11 boundary.
5. Step 9 — flag the §5 kill-execution arch note; confirm NO Appendix-A row; the likely latching-kill lesson. P3.10 COMPLETE after this → I dispatch `/phase-exit P2` + `/phase-exit P3`.
