# /tdd brief — in_process_single_active_run_worker

## Feature
An in-process async worker inside `apps/api` that is the generation loop's production caller: it picks up a `configured` run, appends `run.started` (configured→running, guard-validated), drives `runGenerationLoop` (which now terminalizes via P3.11), beats the worker-alive heartbeat (LESSONS §60) each iteration, **serializes to one active run at a time** (kernel-enforced — a second active run is rejected; read-only replays coexist), and is **idempotent by the per-run sequence watermark** (a re-entered step that already produced its events is a no-op — never double-appends, never double-debits energy). No external queue; append-only via P3.3; reads ordered-by-sequence.

## Use case + traceability
- **Task ID:** P3.12
- **Architecture sections it implements:** `ARCHITECTURE.md §5` ("Workers & concurrency (resolved): single in-process async worker inside `apps/api`; every job is idempotent, guarded by event-sequence checks (no external queue — deferred). MVP serializes to one active run at a time (kernel-enforced); replay is read-only and viewable concurrently with a live run") + `§3` (the `run.started` lifecycle transition configured→running) + `§4` (per-run monotonic `sequence` as the idempotency/ordering key).
- **Related context:** P3.10 `runGenerationLoop` + `GenerationLoopDeps` (`generationLoop.ts:107`) — the worker constructs deps + calls it; P3.11 `classifyRunTerminal` wired at the loop exit (`62f80a1`) — the worker inherits run-terminalization; P6.10/§60 `createHeartbeat`/`isWorkerAlive` (`apps/api/src/runtime/heartbeat.ts`) — the worker wires the beat (a SIDE signal, NOT a run_event — rule #2, no heartbeat registry member); P6.6/§56 `routes/runs.ts` — the REST POST already appends `run.configured` + holds an in-memory `activeRunId`/`isActive` 409 hint (the worker's guard is the kernel-authoritative one the REST hint mirrors); LESSONS §26 (append path = advisory-lock per-run sequence), §30/§55 (read-only narrowed store type), §48 (kill switch already in the loop), §64 (loop = pure orchestration over injected seams).

<!-- REQ IDs derive from §5/§3/§4 via the Spec Anchor Index. -->

## Acceptance criteria (what "done" means)
- [ ] `runWorker(deps)` executes `runGenerationLoop` for one run end-to-end — it is the loop's first **production** caller (closes the P3.10/P3.11 "tested-but-not-worker-wired" reachability deferral).
- [ ] The worker appends **`run.started`** (configured→running) through the append path (P3.3), **guard-validated** via `canTransitionRun` (P3.2), as the first thing it does for a `configured` run — and only for a `configured` run (a run already `running`/terminal is not re-started: run-level idempotency).
- [ ] **Single active run (kernel-enforced):** `activeRunGuard` rejects starting a second run while one is active — "active" = a non-terminal run derived from the authoritative log (a `configured`/`running`/`completing`/`stopping` run with no terminal event), not just an in-memory flag. A read-only replay does **not** count as active (it never executes / appends).
- [ ] **Idempotent by sequence watermark:** before a step appends its events the worker checks the per-run watermark (max persisted `sequence` / the step's already-present events); a re-entered step that already produced its events is a **no-op** — never a double-append and never a double `energy.spent` debit (rule #8). Idempotency keys off the persisted sequence, not an in-memory counter.
- [ ] A **worker-alive heartbeat** is emitted each loop iteration via the `createHeartbeat` primitive (LESSONS §60) to an injected sink (consumed by `isWorkerAlive` / the P6.8 `/health` surfacing) — it is a **side signal, NOT a `run_event`** (rule #2; no heartbeat member in the 41-type registry).
- [ ] The worker **never mutates** authoritative events — it only appends new ones through P3.3 and reads ordered-by-sequence (reads via a narrowed store type so writes-other-than-append are unreachable, LESSONS §55).
- [ ] The worker is **timer-free + deterministic in test** — the clock (`now`) + the heartbeat sink + the operator-stop signal are all injected (no ambient `Date.now`/`setInterval`), so the integration test drives it against real Postgres without wall-clock flakiness.
- [ ] All unit tests in `apps/api/test/unit/runtime/worker/*.test.ts` pass.
- [ ] Integration test (real Postgres) in `apps/api/test/integration/runtime/run-worker.test.ts` passes — worker drives a `configured` run through `run.started` → generations → a P3.11 terminal, end-to-end via the real append path; a second concurrent start is rejected; a re-run is a no-op.
- [ ] `/preflight` clean (incl. `format:check` — LESSONS §50/§61).

## Wiring / entry point (Step 7.5)
The worker (`runWorker`) is `runGenerationLoop`'s **production caller** — this slice closes that reachability gap. **The worker's OWN production caller — the REST POST `/runs` trigger that fires `runWorker` after appending `run.configured`, plus the POST `/runs/:id/stop` → injected `operatorStop` wiring — is DEFERRED to demo/Phase D**: `routes/` is **demo-track territory** (the §2.5 subsystem split — kernel owns `runtime/`, demo owns `routes/`+`projections/`), and the kernel→cody merge is deferred to track-completion, so editing `routes/runs.ts` from the kernel track now would create a cross-track merge conflict. Name the seam explicitly: `routes/runs.ts` POST handler calls `runWorker({runId, …})` (fire-and-forget async) after the `run.configured` append; the stop endpoint sets the `operatorStop` flag the worker injected into the loop. This mirrors the established kernel pattern (the loop was "tested-but-not-worker-wired" → this slice wires it; the worker is "tested-but-not-REST-wired" → Phase D wires it). The integration test exercises `runWorker` directly (the real production behavior), so the worker is fully covered; only the thin REST trigger is deferred.

## Files expected to touch
**New:**
- `apps/api/src/runtime/worker/runWorker.ts` — `runWorker(deps)`: active-run guard → `run.started` → construct `GenerationLoopDeps` + heartbeat → `runGenerationLoop` → (loop terminalizes via P3.11). Injected clock/heartbeat-sink/operatorStop.
- `apps/api/src/runtime/worker/idempotency.ts` — the sequence-watermark idempotency guard (read watermark; skip a step whose events already exist; no double-append/double-debit).
- `apps/api/src/runtime/worker/activeRunGuard.ts` — pure kernel-authoritative single-active-run decision over the log (a non-terminal run exists ⇒ reject a new start).
- `apps/api/test/unit/runtime/worker/{runWorker,idempotency,activeRunGuard}.test.ts`
- `apps/api/test/integration/runtime/run-worker.test.ts`

**Modified:**
- `apps/api/src/runtime/index.ts` — barrel-export `runWorker` + the guard/idempotency primitives.
- `apps/api/src/runtime/loop/generationLoop.ts` — add an optional `onIteration?: () => void` to `GenerationLoopDeps`, called at the top of each generation iteration (default undefined → no-op; existing loop tests unaffected). The worker passes `onIteration: () => heartbeat.beat()` (Step-2.5 resolution — explicit hook, not a side-effecting clock).

**Explicitly NOT touched (cross-track / deferred):** `apps/api/src/routes/runs.ts` (demo territory — the REST→worker trigger is Phase D). If implementation needs to touch it, **STOP and flag at Step 2.5** (it's a cross-track edit → likely a Finding to me, not a silent change).

## RED test outline (Step 2)
`activeRunGuard.test.ts` (pure):
1. **`rejects_start_when_nonterminal_run_exists`** — log has a `configured`/`running` run with no terminal ⇒ guard rejects a new start. Why: §5 single-active-run.
2. **`allows_start_when_all_runs_terminal`** — every prior run has a terminal event ⇒ guard allows. Why: §5.
3. **`replay_is_not_active`** — a read-only replay (no execution/append) does not register as active. Why: §5 ("replay viewable concurrently").

`idempotency.test.ts` (pure):
4. **`step_already_in_log_is_noop`** — a step whose events are present at/below the watermark is skipped (returns no-op, appends nothing). Why: §5 idempotent-by-sequence.
5. **`fresh_step_executes`** — a step with no persisted events runs. Why: §5.
6. **`no_double_energy_debit_on_reentry`** — re-entering a step that already emitted `energy.spent` does NOT emit a second `energy.spent`. Why: rule #8 + §5.

`runWorker.test.ts`:
7. **`emits_run_started_guard_validated`** — worker on a `configured` run appends exactly one `run.started` (configured→running, `canTransitionRun`-legal) before any generation. Why: §3 + P3.2.
8. **`does_not_restart_running_or_terminal_run`** — worker on a `running`/terminal run appends NO second `run.started` (run-level idempotency). Why: §5 + §3 terminal-immutability.
9. **`drives_generation_loop`** — worker calls `runGenerationLoop` with constructed deps (faked seams/gateway) → generations run → P3.11 terminal reached. Why: wiring (loop's production caller).
10. **`beats_heartbeat_each_iteration_side_signal`** — the worker calls `beat()` per iteration to the injected sink; assert NO `run_event` of any heartbeat kind is appended (it's a side signal, rule #2 / LESSONS §60). Why: rule #2 + the heartbeat lesson.
11. **`reads_are_append_only`** — the worker's store handle exposes append + ordered read only; no update/delete reachable (narrowed type, LESSONS §55). Why: rule #2.

Integration `run-worker.test.ts` (real Postgres):
12. **`worker_runs_configured_run_end_to_end`** — seed `run.configured` → `runWorker` → `run.started` + generations + a single P3.11 run-terminal, all via the real append path, sequence-ordered. Why: entry point + §H.
13. **`second_concurrent_start_rejected_and_rerun_is_noop`** — starting a 2nd run while one is active ⇒ rejected; re-invoking the worker on an already-terminal run ⇒ no new events (idempotent). Why: §5.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** `run.started` already in the frozen `RunEventType` registry. The worker emits no new event type; the heartbeat is a side signal (no registry member). No Appendix-A model + no schema bump.
- **Orchestrator doc rows to write hot (Step 9 routing):** none required (cross-doc invariant = none). **Architecture-doc note candidate** (→ cody via lead at track-completion merge; parked in ledger §I — NOT a hot edit): §5 — "the kernel worker is `runGenerationLoop`'s production caller (emits `run.started`, beats the side-signal heartbeat, enforces single-active-run from the log, idempotent by sequence watermark); the REST→worker trigger + stop wiring is demo/Phase-D territory." Flag at Step 9.
- **§2.5-seam model touched?** **No.**

> **Orchestrator territory** — flag at Step 9 categorized; I write hot. The §5 arch note is cody-bound → parked in ledger §I (kernel→cody merge deferred). Do NOT hot-edit `ARCHITECTURE.md` or `routes/runs.ts` this round.

## Things to flag at Step 2.5
1. **Heartbeat = side-signal, never a `run_event`. RESOLVED at Step 2.5: explicit `onIteration` hook.** Wire `createHeartbeat({now, intervalMs, emit})` (heartbeat.ts, LESSONS §60); the worker beats via a new optional `onIteration?: () => void` on `GenerationLoopDeps` (called at the top of each generation iteration, default no-op) — NOT a side-effecting clock (which would conflate timekeeping with liveness + couple beat cadence to the loop's `now()`-call-sites). Assert NO heartbeat run_event is appended (rule #2 — the 41-type registry has no heartbeat member).
2. **Idempotency mechanism (the crux).** My default vote: read the per-run **sequence watermark** (max `sequence` via `readByRun`) + the set of already-present step events; a step whose events exist is skipped (no-op). Note the loop's `appendEvent` currently uses an in-memory `eventSeq` counter starting at 0 each call (`generationLoop.ts:210`) — a naive re-run would regenerate colliding ids; the idempotency guard must key off the **persisted** sequence/events, not the in-memory counter. **TRUE mid-flight resume of a partially-run generation is DEFERRED** (P3.13 forward-fails a crashed run rather than resuming — its acceptance says so); MVP idempotency = run-level (don't re-start/re-run a started/terminal run) + step-level no-double-append/debit on re-entry. Flag if you see a cleaner mechanism.
3. **Single-active-run: kernel-authoritative guard vs the REST in-memory hint.** My default vote: `activeRunGuard` is the **authoritative** decision derived from the log (a non-terminal run exists ⇒ reject); the REST `activeRunId`/`isActive` (P6.6 / LESSONS §56) is the API-layer fast-path that MIRRORS it — do NOT build a second divergent rule (that lesson already re-validates against the log). Replays never count as active.
4. **REST→worker trigger wiring deferred to demo/Phase D (territory + merge safety).** My default vote: deliver `runWorker` as kernel-territory, tested standalone end-to-end; defer the `routes/runs.ts` POST→`runWorker` trigger + stop→`operatorStop` wiring to demo/Phase D (routes/ is demo territory; the kernel→cody merge is deferred — a mid-round routes edit risks a cross-track conflict). The worker is reachable from the REST start *at integration*, a documented deferral (same shape as the loop's). **If you believe the trigger should be wired now, raise it — it's a load-bearing cross-track call (→ me → lead), not a silent decision.**
5. **`run.started` ownership.** My default vote: the worker owns `run.started` (configured→running) — the REST POST only appends `run.configured`; the worker appends `run.started` when it picks the run up. Guard-validated through `canTransitionRun`.

## Dependencies + sequencing
- **Depends on:** P3.10 (`runGenerationLoop`), P3.11 (loop now terminalizes — `62f80a1`), P3.3 (append path), P6.10 / LESSONS §60 (heartbeat primitive), P0.15 (frozen `Run`/`RunStatus`).
- **Blocks:** P3.13 (crash-forward runs at boot BEFORE the worker accepts new work — it relies on the single-active-run guard starting from a clean no-active-run state; and reuses P3.11's `classifyRunTerminal`).

## Estimated commit count
**1.** One cohesive slice — the worker + its two supporting primitives (`activeRunGuard`, `idempotency`) are one logical unit (the worker uses both; they're meaningless apart from it). Not a safety-invariant *pin* per se, but it touches rule-#8 (no double-debit) + kernel-enforced concurrency, so it stays its own slice/commit (SOLO, per the round sequence) — never bundled with P3.11 or P3.13. If the active-run-guard / idempotency primitives warrant separate red→green cycles for bisectability, you MAY split into ≤2 commits — flag at Step 2.5.

## Lessons-logged candidates anticipated
- **Convention candidate** — "the in-process worker is the loop's production caller + the owner of `run.started`; single-active-run + idempotency are derived from the authoritative log (watermark/non-terminal-run scan), never an in-memory flag alone (the REST hint mirrors, the kernel guard decides)."
- **Convention candidate** — "the worker-alive heartbeat is a LESSONS §60 side signal threaded into the worker loop, never a `run_event` (rule #2); injected clock/sink keep it timer-free + test-deterministic."
- **Architecture-doc note candidate** — §5 worker behavior + the kernel/demo territory split for the REST→worker trigger (→ cody at the track-completion merge; ledger-parked).

## How to invoke
1. **Read this brief end-to-end** + `ARCHITECTURE.md §5` (workers & concurrency) + `generationLoop.ts` (`GenerationLoopDeps`/`GenerationLoopResult`) + `heartbeat.ts` (§60) + `routes/runs.ts` (the existing run.configured + activeRunId hint — for the seam, NOT to edit) + LESSONS §26/§48/§55/§56/§60/§64.
2. **Run `/tdd in_process_single_active_run_worker`** in the implementer session.
3. **Step 0 (Restate)** — confirm against the Feature line.
4. **Step 1 (Identify files)** — confirm against Files expected to touch; note `routes/runs.ts` is OFF-LIMITS this round.
5. **Step 2.5 (test review pause)** — ping back with answers to the 5 design questions (esp. the idempotency mechanism + the REST-wiring deferral). Don't proceed to Step 4 until sign-off.
6. **Step 9 (summarize)** — flag the §5 arch-doc note (cody-bound, ledger-parked); confirm NO Appendix-A row; the worker's REST-trigger deferral; the anticipated convention lessons. After this lands → P3.13 crash-forward (the kernel track's last feature slice).
