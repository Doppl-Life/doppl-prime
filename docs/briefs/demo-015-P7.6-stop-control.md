# /tdd brief — run_stop_control

## Feature
The operator **run stop control** (sibling of the P7.5 run-config panel): a button that issues the **idempotent `POST /runs/:id/stop`** (via the already-shipped `runClient.stopRun`) and derives its enabled/terminal state **from store state, never optimistic guessing**. Repeated clicks or a click after the run already reached a terminal state are no-ops that don't error and don't change the terminal outcome (terminal-state guard, REQ-O-003). After a stop the dashboard keeps showing the preserved partial evidence up to the stop point (stopping is non-destructive — the store's `failures` + entity views are untouched). A command failure (network/API) surfaces an accessible error message and stays retry-safe because the command is idempotent.

## Use case + traceability
- **Task ID:** P7.6 (run stop control — idempotent kill path)
- **Architecture sections it implements:** `ARCHITECTURE.md §11` (idempotent `POST /runs/:id/stop`; terminal-state guard — REQ-O-003), `§12` (accessible run-control surface; preserved partial evidence after stop — REQ-F-012/REQ-O-002).
- **Related context:** key safety rule #2 (the UI mutates authoritative state ONLY via the contract commands — `stopRun` is one of the two writes; the API + kernel are the authoritative idempotency/terminal guard, never re-implemented client-side). **Builds on P7.1** (`runClient.stopRun` = `POST /runs/:id/stop` — ALREADY SHIPPED in runClient.ts:55/110, **no client change this slice**) + **P7.2** (the run-store `ViewState.entities[runId].status` carries the latest run-level `RunEventType`) + **P7.3** (accessible status conventions: shape+label+icon, `var()` tokens). Unit-only (happy-dom + injected runClient + a seeded store/view state).

## Acceptance criteria (what "done" means)
- [ ] Clicking Stop issues the **idempotent `POST /runs/:id/stop`** via `runClient.stopRun(runId)`; the click handler does not re-implement the dedup/terminal guard (the API owns it — §11)
- [ ] The control is **disabled/relabeled once the run is in a terminal state**, derived from **store state** (`ViewState.entities[runId].status` ∈ the run-terminal event-type set `{run.completed, run.failed, run.stopped}`) — **never optimistic local guessing**; before the authoritative terminal event folds in, the control does NOT flip itself to terminal
- [ ] **Repeated clicks / a click after terminal are safe:** a second click while a stop is in flight or after the run is terminal does not error and does not start a second/contradictory command (idempotent + disabled-when-terminal); retry after a failure is allowed and idempotent
- [ ] **Non-destructive:** issuing stop does not clear or mutate the store's `failures[]` or `entities` — preserved partial evidence up to the stop point remains rendered (REQ-F-012/REQ-O-002)
- [ ] A command failure (rejected `stopRun` / `TransportError`) surfaces an **inline accessible error** (programmatically associated, not color-alone) and the control remains retry-safe
- [ ] Adherence-clean (`var()` tokens, no raw hex/px); no `apps/api` import (rule #6); no secret in client; status encoded shape+label+icon (rule #4)
- [ ] Unit tests pass (happy-dom + injected runClient); **count reported**; `/preflight` (web) clean

## Wiring / entry point (Step 7.5)
**none — mounted by the P7.14 shell.** P7.6 provides the `StopControl` component + the pure run-terminal classifier; the route mount (placing the control on the run screen, subscribed to the live store) wires in the P7.14 shell. Exercised now against an injected `runClient` (fake `stopRun`) + a seeded `ViewState`/store. So: *first consumer — the P7.14 shell; Stop calls the real `runClient.stopRun` against the live store at integration.*

## Files expected to touch
**New:**
- `apps/web/src/components/run/StopControl.tsx` — the stop button: store-derived enabled/terminal state, idempotent `stopRun` dispatch, in-flight + error states (the tracker names `src/panels/StopControl.tsx`; the established layout is `components/run/` per P7.5 — flag at 2.5 if you disagree)
- `apps/web/src/components/run/runControl.ts` — the pure run-control logic: `isRunTerminal(status: RunEventType): boolean` (classifies `{run.completed, run.failed, run.stopped}`) + the derive-control-state helper (idle/in-flight/terminal/error → label+disabled), mirroring P7.5's `runConfigForm.ts` split
- `apps/web/test/unit/components/run/StopControl.test.tsx` (+ unit for the pure `runControl` classifier/state helper)

**Modified:** none expected (`runClient.stopRun` already exists; consumes P7.2 store state + P7.3 tokens + frozen `RunEventType` read-only).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
**(happy-dom + injected runClient + seeded ViewState; `spec(§11)`/`spec(§12)`):**
1. **`test_stop_issues_idempotent_post_stop`** — clicking Stop calls `runClient.stopRun(runId)` exactly once per click intent (POST /runs/:id/stop); the handler doesn't re-implement dedup. Why: §11 idempotent kill path. *(Positive guard.)*
2. **`test_terminal_state_disables_from_store`** — with `entities[runId].status` ∈ `{run.completed,run.failed,run.stopped}` the control is disabled/relabeled (e.g. "Stopped"/"Completed"); with a non-terminal status (`run.configured`/`run.started`) it is enabled "Stop". Why: §11 terminal-state guard, store-derived.
3. **`test_no_optimistic_terminal`** — after a click, before any `run.stopped` event folds in, the control does NOT show itself terminal (an in-flight/"Stopping…" disabled state is OK; the authoritative terminal comes only from the folded event). Why: "never optimistic guessing".
4. **`test_repeated_click_after_terminal_safe`** — a click when already terminal (or a second click in flight) does not call `stopRun` again / does not error. Why: REQ-O-003 idempotent + disabled-when-terminal.
5. **`test_stop_is_non_destructive`** — issuing stop does not clear `failures[]`/`entities` in the rendered view (partial evidence preserved). Why: REQ-F-012/REQ-O-002.
6. **`test_command_failure_accessible_error_retry_safe`** — a rejected `stopRun` surfaces an inline programmatically-associated error; a subsequent retry re-issues the idempotent command. Why: §12 a11y + retry-safe.
7. **`test_isRunTerminal_classifier`** — (unit) `isRunTerminal` is true for exactly the 3 run-terminal types, false for lifecycle/marker/non-run types. Why: pure-logic pin.
8. **`test_no_apps_api_import`** — structural (rule #6, positive-guarded).

## Cross-doc invariant impact
- **Model field changes:** none (consumes frozen `RunEventType` read-only via the P7.1 `contracts.ts` seam). **§2.5-seam:** none.
- **Orchestrator doc rows (Step 9):** likely none beyond apps/web §1–§3 (applies the conventions). Possible new convention candidate (see below) — I author hot if it surfaces.

## Things to flag at Step 2.5
1. **Run-terminal source — last run-level event type vs a derived RunStatus.** My default vote: derive terminal from `ViewState.entities[runId].status` ∈ `{run.completed,run.failed,run.stopped}` (the 3 run-terminal `RunEventType` members — note `run.cancelled` is NOT an event type, only a status-map domain value, so it's out of scope here). The store's entity status IS the latest run-level event type (run-level events carry only `runId`, so they resolve to the run entity). Confirm vs reading a `Run.status` projection.
2. **In-flight stop representation.** My default vote: a local "Stopping…" disabled state WHILE the `stopRun` promise is pending, cleared when it resolves; the authoritative terminal still comes only from the folded `run.stopped` event (never mark terminal optimistically). There is no `run.stopping` event type, so this in-flight state is purely a local command-status, not a run-status guess. Confirm.
3. **File placement + pure-logic split.** My default vote: `components/run/StopControl.tsx` + `components/run/runControl.ts` (mirroring P7.5's panel + `runConfigForm.ts` split), NOT the tracker's `src/panels/StopControl.tsx`. Confirm the layout (the tracker path predates the established `components/run/` convention).

## Dependencies + sequencing
- **Depends on:** **P7.1** (`runClient.stopRun` — already shipped), **P7.2** (run-store `ViewState`), **P7.3** (tokens/accessible conventions), frozen `RunEventType` (P0.1). Independent of `apps/api`. Sibling of P7.5 (run-control family).
- **Blocks:** P7.14 (shell mounts it on the run screen, wired to the live store).

## Estimated commit count
**1.** Feature slice (the stop control + pure run-control helper). Not safety-invariant (the command is a contract write whose idempotency/terminal guard is enforced authoritatively by the API+kernel; the UI does not re-implement it). Step-8: code-quality phase-boundary; security-reviewer optional (no secret, the only mutation is the contract `POST /stop`).

## Lessons-logged candidates anticipated
- **Convention candidate** (possible) — "run-control terminal/disabled state is derived from store state (the latest run-level `RunEventType`), never optimistically guessed; the UI issues the idempotent contract command and lets the API own dedup/terminal — the only authoritative terminal is the folded `run.stopped/completed/failed` event; stop is non-destructive (partial evidence retained)."
- Otherwise likely none beyond apps/web §1–§3.

## How to invoke
> web session oriented — `/tdd`. cwd `apps/web/`. Stage only `apps/web/...`. (Round-3 web slice 1 — continuous roll; sibling of P7.5.)
1. **Run `/tdd run_stop_control`.**
2. **Step 2.5** — answer the 3 questions (esp. Q1 run-terminal source + Q2 in-flight representation), send the write-up + coverage map (each acceptance bullet → its test).
3. **Step 9** — surface the convention candidate if it materializes.
