# /tdd brief — run_store_reducer_resync

## Feature
The client-side **run store**: a single reducer that folds `RunEventEnvelope` events into view state **keyed strictly by per-run `sequence`** (idempotent — re-applying a seen sequence is a no-op), wired to P7.1's `sseStream` for live deltas and to `runClient` for **sequence-keyed resync** (on SSE disconnect, fetch events after `lastEventId` and apply in order, reaching the same view a fresh load would) with **polling fallback** if streaming stalls. Failure events are **retained + surfaced** (partial evidence stays visible), and the store carries a **live-vs-replay mode** flag for downstream indicators **without changing fold semantics** (replay-sourced and live events fold identically). Design-agnostic state layer — no UI/styling (the panels that render this state are P7.3+).

## Use case + traceability
- **Task ID:** P7.2 (run event store / view-state reducer with sequence-keyed resync)
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (the dashboard folds the SSE stream into view state — the live in-flight window — and resyncs from the last `sequence`; never mutates authoritative state), `§11` (SSE delivery-only; resume from `lastEventId`; polling/replay fallback).
- **Related context:** key safety rules **#2** (UI read-only; SSE non-authoritative — resync from `sequence`, never treat the stream as truth) and **#9** (read-only over projections; no `apps/api` import). **Builds on P7.1** (`demo-003`, `38749ac`): consumes `sseStream` (sequence-ordered/deduped delivery + `lastEventId`) + `runClient` (validated REST reads) + the `errors.ts` typed errors. Consumes frozen `RunEventEnvelope`/`RunEventType` (P0.1) via the `contracts.ts` seam. **Design-agnostic** — this is the state model the P7.3+ panels render; it ships no UI. **Unit-only** (pure reducer + injected client/stream doubles).

## Acceptance criteria (what "done" means)
- [ ] A single reducer folds `RunEventEnvelope` events into view state **keyed strictly by per-run `sequence`**; folding is **idempotent** — re-applying an already-seen `sequence` is a no-op (no double-count)
- [ ] On SSE disconnect the store **resyncs** by requesting events after the last applied `sequence` (`lastEventId`) via `runClient` and applies them in `sequence` order, reaching **the same view state a fresh full load would produce**
- [ ] If live streaming stalls/fails the store **degrades to polling** the REST projections/events (or replay) without losing already-applied state
- [ ] **Failure events** (`provider_call_failed`, `output_schema_rejected`, `candidate_invalidated`, `energy_exhausted`, `generation_failed`, `reproduction_aborted_insufficient_parents`, `novelty_scoring_degraded`) are **retained + surfaced**, never silently dropped — partial evidence stays visible (REQ-O-002)
- [ ] **Replay-sourced and live events fold identically** — the store carries a `mode` (live | replay) for downstream indicators **without changing fold semantics**
- [ ] The store imports no `apps/api` internals (rule #9) and never mutates authoritative state (read/fold only); SSE is non-authoritative (resync reaches the same state — drop-and-resync equivalent to an uninterrupted stream)
- [ ] The `sinceSequence` resync cursor is numeric-guarded (the P7.1 [low] deferred here): a non-numeric/negative cursor is rejected before a fetch
- [ ] Unit tests pass (pure reducer + injected `sseStream`/`runClient` doubles); **count reported**; `/preflight` (web) clean

## Wiring / entry point (Step 7.5)
**none — wiring lands in P7.3+ panels + the P7.14 dashboard shell.** The run store is the state model the panels subscribe to (mode indicator P7.4, lineage P7.7, charts/evidence panels P7.8+); the live SSE + REST wiring it orchestrates connects to the real backend at integration. Exercised now against injected `sseStream`/`runClient` doubles + fixtures. So: *first consumers — the P7.3+ panels (subscribe to the store) + the P7.14 shell (mounts it); real backend wiring at integration.*

## Files expected to touch
**New:**
- `apps/web/src/state/reducer.ts` — the pure fold: `(viewState, RunEventEnvelope) → viewState`, keyed by sequence, idempotent
- `apps/web/src/state/runStore.ts` — the store: subscribes to `sseStream`, applies the reducer, exposes view state + `mode`, orchestrates resync/polling fallback
- `apps/web/src/state/resync.ts` — sequence-keyed resync (fetch-after-lastEventId + apply in order) + polling fallback
- `apps/web/test/unit/state/{reducer,runStore,resync}.test.ts`

**Modified:** none expected (consumes P7.1's `sseStream`/`runClient`/`errors` + frozen contracts). If a needed `RunEventType` member isn't exported, flag at Step 9 (it is — P0.1).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

**`apps/web/test/unit/state/reducer.test.ts`** (`spec(§12)`):
1. **`test_folds_events_keyed_by_sequence`** — a fixture event stream folds into view state; entity statuses reflect the latest applied event. Why: §12 fold. *(Positive guard.)*
2. **`test_refold_idempotent_by_sequence`** — re-applying an already-seen `sequence` is a no-op (no double-count); folding the same events twice == once. Why: §12 idempotent.
3. **`test_failure_events_retained_and_surfaced`** — each of the 7 failure event types is retained + surfaced in view state, not dropped. Why: REQ-O-002 partial evidence.
4. **`test_live_and_replay_fold_identically`** — the same events with `mode=live` vs `mode=replay` produce identical fold results (mode is carried, not folded). Why: §12 replay-equivalence.

**`apps/web/test/unit/state/resync.test.ts`** (`spec(§11)`):
5. **`test_resync_from_last_event_id_reaches_same_state`** — after applying through `sequence` N, a resync fetch-after-N + apply reaches the same state as an uninterrupted stream / fresh full load. Why: §11 resume-from-lastEventId.
6. **`test_polling_fallback_preserves_state`** — when the injected stream signals stall/fail, the store polls via `runClient` and applies without losing already-applied state. Why: §11 polling fallback.
7. **`test_since_sequence_cursor_numeric_guarded`** — a non-numeric/negative `sinceSequence` is rejected before a fetch (P7.1 [low] consumed). Why: defense-in-depth on the resync cursor.

**`apps/web/test/unit/state/runStore.test.ts`** (`spec(§12)`):
8. **`test_store_applies_sse_deltas_non_authoritative`** — the store folds injected `sseStream` deltas into view state; dropping the stream + resyncing reaches the same state (SSE non-authoritative). Why: §12/rule #2.
9. **`test_store_no_apps_api_import`** — structural: `src/state` imports nothing from `apps/api`. Why: rule #9 (positive-guarded).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none** (read-only consumer; folds frozen `RunEventEnvelope`; defines an `apps/web`-internal view-state, not an Appendix-A model).
- **§2.5-seam touched?** No (consumes frozen models read-only).
- **Orchestrator doc rows to write hot (Step 9):** possibly an `apps/web` **LESSONS** entry (the client run-store fold/resync conventions — extends §1) if it surfaces something new beyond §1. I author hot.

## Things to flag at Step 2.5
1. **View-state shape + relationship to the backend current-state.** My default vote: the store folds events into a **client view-state focused on live rendering** — per-entity-id latest status + the in-flight/activity derivation (§12: operation-start markers → working sub-state, cleared by completions) + the retained failure list — NOT a re-implementation of P6.2's 9-entity backend reducer. For detailed entity data the panels fetch the REST projections (`runClient`). The equivalence contract is "same events (live or resync) → same view-state" (self-consistent idempotent fold). Flag if you'd rather mirror the backend current-state shape exactly.
2. **Initial state — seed from the REST projection, or fold all events?** My default vote: support both but make the **fold the source of truth** — initial load folds `GET /runs/:id/events` (or seeds from the current-state projection then applies SSE deltas); "fresh full load" = fold all events. Keep the fold idempotent so seed+deltas == full-fold. Confirm the seed approach.
3. **In-flight window derivation scope.** My default vote: derive the §12 in-flight sub-state (a node "working" until its completion event clears it) + an activity feed **in this slice** (it's pure state, feeds P7.4+ indicators) — but render NOTHING (no UI). Flag if you'd rather defer the in-flight derivation to a later slice and keep P7.2 to entity-status folding only.
4. **Polling-fallback trigger + cadence.** My default vote: the store exposes a fold + a resync/poll orchestration where the **trigger is injected** (the test drives stall/fail); a real interval/backoff cadence is wired at integration. Keep the cadence injectable (no real timers in unit tests). Confirm.

## Dependencies + sequencing
- **Depends on:** **P7.1** (`sseStream`/`runClient`/`errors` — `38749ac`), P0.1 (frozen `RunEventEnvelope`/`RunEventType`). **Design-agnostic — NOT gated on the design-system prototype.** Independent of the apps/api slices.
- **Blocks:** P7.4 (mode indicator — reads `mode`), P7.3+ panels (subscribe to the store), P7.14 (shell mounts it).

## Estimated commit count
**1.** Feature slice (client state layer). One coherent unit (reducer + store + resync). **Not a safety-invariant slice** (read-only fold; rule-#2/#9 postures structural, pinned by RED #8/#9). **Step-8 reviewers:** security-reviewer = optional (the trust boundary was P7.1; this is the fold on already-validated events) — run if you judge the resync/polling path warrants it; code-quality = phase-boundary.

## Lessons-logged candidates anticipated
- **Convention candidate (extends apps/web §1)** — "the client run-store folds validated events keyed by `sequence` (idempotent); resync fetches after `lastEventId` and reaches the same state as a fresh fold (SSE non-authoritative); failure events are retained not dropped; `mode` (live|replay) is carried, never folded (identical fold semantics); the in-flight window is derived state, not stored truth."

## How to invoke
> The `demo-web-implementer` session is oriented (P7.1 ran in it) — skip `/session-start`; jump to `/tdd`. cwd `apps/web/`.

1. **Read this brief end-to-end** — design-agnostic (no UI/styling — that's P7.3+); built on P7.1's seam; unit-only against injected doubles. Note the **two-impl staging rule** still holds (stage only `apps/web/...`, never `-A`).
2. **Run `/tdd run_store_reducer_resync`.**
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 2.5** — answer the 4 design questions (esp. Q1 view-state shape + Q3 in-flight derivation scope), send the write-up + per-acceptance-bullet coverage map.
5. **Step 9** — surface any LESSONS candidate beyond §1.
