# /tdd brief — run_list_replay_browser

## Feature
PD.17 — a **run-list / replay browser** panel (web). `GET /runs` + `runClient.listRuns` exist (reconciled PD.15) but render NOWHERE — the dashboard shows only `observedRunId` (set by the initial runId / a new start / the fallback-ladder replay rung). Add a panel that lists past runs and lets the operator **click any run → observe it in REPLAY mode** (via the existing `Dashboard` `onReplay`/`getReplay` pattern). The user's #1 demo-polish ask. Web hat. ZERO contract surface.

## Use case + traceability
- **Task ID:** PD.17 (demo-polish; activates the PD.15 reconciled-but-unused `listRuns`/`getReplay`)
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (dashboard — read-only over projections; run browsing + replay), `§11` (`GET /runs`, `GET /runs/:id/replay`), `§17` (local-first demo — browse/replay past runs).
- **Origin:** user demo-polish round (hands-on testing, 2026-06-23 via lead). Several completed runs already exist to browse; the dashboard can only show one.

## Acceptance criteria (what "done" means)
- [ ] A run-list panel renders `GET /runs` via `runClient.listRuns()` (→ `{runs:[summary]}`); each entry shows the runId + status (colorblind-safe shape+label, §12 rule #4), newest-first or stable order.
- [ ] Clicking a run sets `observedRunId` to that run **in REPLAY mode** — reuse the existing `Dashboard` `onReplay(runId)` path (the shell remounts the store in replay; `getReplay`/`getEvents` already wired). The currently-observed run is visually indicated.
- [ ] Read-only over projections (rule #2); never mutates authoritative state; SSE/replay resync unaffected (rule #3). NO new API route (consumes existing `GET /runs` + `GET /runs/:id/replay`).
- [ ] Empty/loading/error states handled (zero runs → a clear empty state; a failed `listRuns` → a non-fatal error affordance, never a crash).
- [ ] Test-first: a `RunListPanel` unit test (renders the summaries, click → `onReplay` called with the runId) + the wiring (Dashboard mounts it, click switches the observed run). The mocked e2e or the real smoke covers the browse→replay path.
- [ ] `/preflight` clean (web).

## Wiring / entry point (Step 7.5)
The panel mounts in the `Dashboard` shell (`routes/Dashboard.tsx`), calling `runClient.listRuns()` on mount and `onReplay(runId)` (the existing replay-switch path that `FallbackLadderPanel` already uses) on click → `setObservedRunId` in replay mode. Confirm the click→replay path drives the existing observed-run machinery (no new store/SSE wiring).

## Files expected to touch
**New:** `apps/web/src/components/.../RunListPanel.tsx` (+ its unit test).
**Modified:** `apps/web/src/routes/Dashboard.tsx` (mount the panel + wire `onReplay`/observed-run switch); possibly the Dashboard test.

## RED test outline (Step 2)
1. **`run_list_panel_renders_summaries`** — given `listRuns` returns N summaries, the panel renders N entries with runId + status. RED: panel absent. Why: §12.
2. **`run_list_click_switches_observed_run_replay`** — clicking an entry calls `onReplay(runId)` (→ the Dashboard sets `observedRunId` in replay mode). RED: no handler. Why: §12/§11 replay browse.
3. **`run_list_empty_and_error_states`** — zero runs → empty state; `listRuns` rejects → non-fatal affordance. Why: robustness.

## Cross-doc invariant impact
- **Model field changes:** none. ZERO contract (consumes existing routes; `RunSummary` is the web-local type from PD.15).
- **Orchestrator doc rows (Step 9):** possibly an ARCH §12 one-line note (the dashboard browses + replays past runs via the run-list). No cross-doc invariant.

## Things to flag at Step 2.5
1. Panel placement + the observed-run indicator (which run is being viewed).
2. Replay-mode switch: confirm `onReplay` is the right existing entry (vs. a fresh path) — reuse, don't reinvent.
3. Order/format of the list (status badges via the existing status-map, §12 rule #4).

## Dependencies + sequencing
- **Depends on:** PD.15 (`listRuns`/`getReplay` reconciled) · the existing `Dashboard` `onReplay`/observed-run machinery.
- **Blocks:** nothing (demo-polish); part of the pre-merge polish round.
- **Sequencing:** first polish slice (the user's #1 ask).

## Estimated commit count
**1.** A web panel + Dashboard wiring + tests. Non-safety (read-only browse); no security-reviewer (no invariant).

## Lessons-logged candidates anticipated
- Likely none new (standard read-only panel; reuses the §12 patterns).

## How to invoke
1. Read this brief + `Dashboard.tsx` (observedRunId/onReplay), `runClient.ts` (listRuns/getReplay), `FallbackLadderPanel` (the onReplay precedent).
2. `/tdd run_list_replay_browser` (web hat; read `apps/web/CLAUDE.md`).
3. Step 0 — confirm: a run-list panel + click→replay via the existing onReplay; ZERO contract; no new route.
4. Step 2.5 — Q1–Q3.
5. Step 9 — flag any ARCH §12 note (orch).
