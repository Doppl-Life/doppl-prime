# /tdd brief — live_projection_refetch_lineage_and_health

## Feature
PD.20 — **DEMO-CRITICAL** (the headline "watch it evolve" live). A live run evolves fully in the backend (user's `ba0206dc`: 118 events → 50-node / 44-edge lineage), but the dashboard renders only **1 node**. Root cause (`apps/web/src/routes/Dashboard.tsx:135-165`): `getLineage`/`getRunHealth` are fetched ONCE in the mount `useEffect` and never re-fetched; only `fold.events` updates live (SSE `onEnvelope`). `<LineageGraph projection={lineage} …/>` renders the STALE projection. PD.15 fixed the SSE event-DROP; the lineage **projection** just isn't rebuilt. Fix = **re-fetch the evolving projections on a live cadence** (debounced on SSE events / generation transitions + always on terminal). Web hat. ZERO contract surface (fetch-cadence only; the API rebuilds-on-read — §9 + apps/api LESSON 57).

## Use case + traceability
- **Task ID:** PD.20 (demo-polish; the live-update headline fix — most demo-critical of the round)
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (dashboard live observatory — folds SSE; the in-flight/live window), `§11` (`GET /runs/:id/lineage`, `/runs/:id/health` — rebuild-on-read), `§10` (lineage projection), `§9` (projections derived/rebuildable), `§17` (demo "watch it evolve").
- **Origin:** user-reported (live run shows 1 node), lead-diagnosed 2026-06-23. Sequenced HIGH (PD.17's run-browser only mitigates via replay-of-completed; LIVE still won't update without this).

## Acceptance criteria (what "done" means)
- [ ] **Lineage re-fetches as the run evolves:** a **debounced** `getLineage(observedRunId)` re-fetch triggered by incoming SSE envelopes (and/or generation-transition events), so the graph grows live; the LineageGraph renders the freshening projection (the server rebuilds-on-read).
- [ ] **Always re-fetch on a terminal envelope** (`run.completed`/`failed`/`stopped`) so the FINAL graph is shown even if debounced updates were coalesced.
- [ ] **`getRunHealth` re-fetches on the same cadence** (the continue-vs-switch signal stays fresh — same one-time-fetch root cause).
- [ ] **Run-state confirmed live:** the run-store already folds SSE for run status (live) — confirm it updates (only the lineage + health projections need the re-fetch; say so). No double-fold.
- [ ] Read-only (rule #2/#3); debounce bounds the fetch rate (no hammering during an event burst); the re-fetch respects the existing `active`/cleanup guard on unmount / `observedRunId` change (no setState-after-unmount, no leak). Replay mode unaffected (a terminal replayed run re-fetches once → the full graph).
- [ ] Test-first: SSE envelopes trigger a debounced `getLineage` re-fetch; a terminal envelope forces a final re-fetch; health re-fetches on the same cadence — via injected runClient + event-source doubles (network-free, the §9/§10 wiring-test pattern).
- [ ] `/preflight` clean (web).

## Wiring / entry point (Step 7.5)
The fix lives in the Dashboard mount `useEffect` (`Dashboard.tsx`) — the `onEnvelope` SSE sink (currently only `setFold`) additionally schedules a debounced `getLineage` + `getRunHealth` re-fetch; a terminal envelope forces an immediate final re-fetch. Confirm the live lineage grows from 1 node to the full graph as generations complete (the demo headline), and that unmount/observed-run-switch cancels pending debounced fetches.

## Files expected to touch
**Modified:** `apps/web/src/routes/Dashboard.tsx` (re-fetch cadence on SSE/terminal); the Dashboard wiring test (`test/unit/routes/dashboardWiring.test.*`). Possibly a small `debounce` util (+ its test) if none exists.

## RED test outline (Step 2)
1. **`sse_events_trigger_debounced_lineage_refetch`** — given live SSE envelopes, `getLineage` is re-called (debounced, >1 total) → the rendered projection updates. RED: `getLineage` called once only. Why: §12/§10 live update.
2. **`terminal_envelope_forces_final_lineage_refetch`** — a `run.completed` envelope forces a final `getLineage` re-fetch → the final graph shows. Why: §17 — the final state must render.
3. **`health_refetches_on_same_cadence`** — `getRunHealth` re-fetches on the live cadence (not one-time). Why: §11/§12.
4. **`refetch_cleanup_on_unmount`** — pending debounced re-fetches are cancelled on unmount / observed-run switch (no setState-after-unmount). Why: robustness/leak.

## Cross-doc invariant impact
- **Model field changes:** none. ZERO contract (fetch-cadence; the API `GET /lineage`/`/health` already rebuild-on-read).
- **Orchestrator doc rows (Step 9):** an ARCH §12 note (the dashboard re-fetches the evolving projections on a live cadence — not a one-time fetch) — orch. Likely an apps/web LESSONS convention candidate (a live projection rendered from a one-time fetch goes stale; re-fetch on the SSE cadence — the rebuild-on-read server makes re-fetch the simplest live update). No cross-doc invariant.

## Things to flag at Step 2.5
1. **Cadence:** debounce-on-every-SSE-envelope vs. re-fetch-on-generation-transitions (coarser, fewer fetches) — my default: debounce on envelopes (~500ms–1s) + force on terminal. Confirm the debounce interval + the terminal-force.
2. **Incremental vs re-fetch:** the lead noted incremental client-side rebuild from `fold.events` is the "ideal" — but the MVP is re-fetch (the server rebuilds-on-read; simplest, correct). Confirm re-fetch (not a client-side lineage rebuild) for this slice.
3. **Health + run-state:** confirm run-state is already live via the store-fold (only lineage+health need the re-fetch); don't double-fold.

## Dependencies + sequencing
- **Depends on:** PD.15 (SSE delivery — events flow) · the existing `getLineage`/`getRunHealth` rebuild-on-read routes.
- **Blocks:** nothing technically, but it's the demo headline — sequence FIRST among the remaining polish slices (after the in-flight PD.17, before PD.18/PD.19).
- **Sequencing:** **NEXT after PD.17** (slice atomicity — PD.17 finishes first); ahead of PD.18/PD.19.

## Estimated commit count
**1.** A web fetch-cadence change + tests. Non-safety (read-only re-fetch); no security-reviewer (no invariant).

## Lessons-logged candidates anticipated
- **Convention candidate (apps/web):** "a live-updating projection rendered from a ONE-TIME fetch goes stale even when the SSE event stream is live (PD.15 fixed delivery, not the projection rebuild); re-fetch the projection on the SSE cadence (debounced + forced on terminal) — the rebuild-on-read API makes re-fetch the simplest correct live update; folding events client-side into the raw feed is NOT the same as rebuilding the projection."

## How to invoke
1. Read this brief + `Dashboard.tsx:135-165` (the one-time fetch + `wireRunStream`/`onEnvelope`), `LineageGraph` (projection vs events props), `runClient.getLineage`/`getRunHealth`.
2. `/tdd live_projection_refetch_lineage_and_health` (web hat; read `apps/web/CLAUDE.md`).
3. Step 0 — confirm: debounced lineage + health re-fetch on SSE/terminal; run-state already live via the store; ZERO contract.
4. Step 2.5 — Q1–Q3 (cadence + re-fetch-vs-incremental + no-double-fold).
5. Step 9 — flag the ARCH §12 note + the LESSONS convention candidate (orch).
