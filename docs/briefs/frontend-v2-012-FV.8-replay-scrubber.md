# /tdd brief — replay_scrubber_step_timeline

## Feature
Add a **step scrubber** to the S2 organism view in REPLAY mode: a slider over the persisted event timeline that re-folds `events[0..N]` client-side so the room can **step through a recorded run** and watch the organism evolve. The fold-derived telemetry (ActivityTicker + the fitness/energy charts) renders **as of step N**. Built entirely on the existing pure fold — **no new server call, no provider call** (rule #7 — the scrubber re-folds persisted events in the browser); read-only (rule #9). The amber/hatched/static replay framing is **already done** (ModeBanner + ActivityTicker), so FV.8 is the scrubber + its wiring.

> **Scope note — replay infra already exists.** The `/runs/:id/replay` route, `mode='replay'` threading, the full-events fetch (`useRunObservatory` → `getEvents`), the **pure** `foldEvents` reduce, the ModeBanner amber-hatch "REPLAY · recorded run · no live calls" banner, and the ActivityTicker "replaying" affordance are all shipped (FV.4/FV.6). FV.8's net-new is the **scrubber control + the prefix-fold render wiring** (replay-mode-only).

## Use case + traceability
- **Task ID:** FV.8
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (frontend dashboard — the replay timeline + the "replay reproduces the identical in-flight choreography" surface), `ARCHITECTURE.md §11` (backend API & flows — the persisted `getEvents` list the scrubber folds; replay reads recorded events, no providers).
- **Related context:**
  - Phase plan `docs/planning/frontend-v2-phase-plan.md` FV.8 row ("Replay entry S0→S2 in REPLAY mode (amber/hatched/static); step scrubber over persisted events (getReplay/getEvents)").
  - **The pure fold (the scrubber's foundation):** `src/data/sseStream.ts:23–48` — `foldEvents(envelopes, initial)` is a pure `reduce` over `applyEnvelope`; `FoldState = { lastSequence, events }`. So `foldEvents(events.slice(0, N))` deterministically yields the state AT step N — exactly what a scrubber needs. No append-only limitation.
  - **The hook exposes the raw events:** `src/routes/useRunObservatory.ts:41–46,97–100` — `obs.fold.events` is the full persisted list (fetched via `getEvents` on mount); the scrubber re-folds a PREFIX of it with no refetch.
  - **The shell to extend:** `src/routes/S2OrganismView.tsx:81–140` (the 3-pane; mode-threaded). The fold-derived panels: `ActivityTicker` (via `deriveTickerEvents(fold.events)`, `src/routes/observatoryTelemetry.ts`), `FitnessOverTime`/`EnergyPanel` (via `deriveFitnessSeries`/`energyBudgetProgress` over `fold.events`). These rewind cleanly under a prefix fold.
  - **Replay framing (already complete):** `ModeBanner` replay state (`src/components/feedback/ModeBanner.tsx:70–99`, amber hatch + static "REPLAY"); `ActivityTicker` replay affordance (`src/components/ds/ActivityTicker.tsx:72–114`, "replaying" + static amber dot).
  - **S0 replay entry (exists):** `RunCard` "⏮" Replay action → `/runs/:id/replay` (`src/components/run/RunCard.tsx:81–84`, `RunsHomeScreen.tsx:92–93`).
  - Safety: rule #7 (replay reconstructs from persisted events — the scrubber re-folds client-side, NO provider/embedding/web call, no refetch); rule #9 (read-only — the scrubber is pure view state, no command/POST). **No safety-invariant pin** (read-only display) → not a security-reviewer slice.

## Acceptance criteria (what "done" means)
- [ ] **NEW pure `foldAtStep(events, n)`** = `foldEvents(events.slice(0, n))` — the FoldState as of step `n`; `n=0` → empty fold, `n=events.length` → the full fold; pure/deterministic (same input → same output).
- [ ] **NEW `ReplayScrubber` control** (pure presentational): a range slider + a "step N of M" readout; props `{ totalSteps, value, onChange }`; accessible (a labeled `<input type="range">`, keyboard-steppable).
- [ ] **S2OrganismView in `mode='replay'`** mounts the `ReplayScrubber` and, when the user scrubs to step `N < M`, renders the **fold-derived panels** (ActivityTicker + FitnessOverTime + EnergyPanel) against `foldAtStep(fold.events, N)` instead of the full fold; at `N = M` (default) the full run shows.
- [ ] **Replay-only:** in `mode='live'` no scrubber renders and the panels consume the live fold unchanged (zero behavior change to the live path).
- [ ] **Default = full run:** entering replay positions the scrubber at the END (max index) so the complete recorded run shows first; scrubbing BACK steps through it.
- [ ] **Rule #7 / #9:** scrubbing re-folds persisted events **client-side only** — it issues NO `getEvents`/provider/command call (asserted); the scrubber holds pure view state, mutates nothing.
- [ ] **Lineage graph (honest scope):** the `LineageGraph` receives the prefix events so its **in-flight overlay** reflects step N; its **node structure** stays the full API-projected `obs.lineage` (per-step node-set reconstruction is out of scope — a flagged honest limitation, FV.9/later). No contract change (web-local). All `apps/web` unit tests pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
`src/routes/S2OrganismView.tsx` — in replay mode the scrubber mounts in the shell and drives the fold-derived panels via `foldAtStep`. Confirm a recorded run opened at `/runs/:id/replay` shows the scrubber, and dragging it back re-renders the ticker/charts at the earlier step — reachable from the real replay route, not just unit-mounted. (Pixel placement/legibility is the FV.9 `/design-review` pass.)

## Files expected to touch
**New:**
- `src/routes/replayScrubber.ts` — the pure `foldAtStep(events, n)` selector (colocated with `useRunObservatory`/`observatoryTelemetry`).
- `src/components/run/ReplayScrubber.tsx` — the slider + step-readout control (pure presentational).
- `test/unit/routes/replayScrubber.test.ts` + `test/unit/components/run/ReplayScrubber.test.tsx`

**Modified:**
- `src/routes/S2OrganismView.tsx` — replay-mode scrubber state + the prefix-fold render of the fold-derived panels.
- `test/unit/routes/S2OrganismView.test.tsx` — extend: scrubber mounts in replay, absent in live, scrubbing rewinds the fold-derived panels.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
1. **`test_fold_at_step_prefix`** — Asserts: `foldAtStep(events, n)` == `foldEvents(events.slice(0,n))`; `n=0` → empty fold, `n=len` → full fold. Why: §12 step timeline over the pure fold.
2. **`test_fold_at_step_pure_deterministic`** — Asserts: same `(events, n)` → byte-identical FoldState; no mutation of the input. Why: rule #7 determinism.
3. **`test_replay_scrubber_renders_step_readout`** — Asserts: `ReplayScrubber` renders the slider + "step N of M"; `onChange` fires with the new index. Why: the control contract.
4. **`test_scrubber_only_in_replay_mode`** — Asserts: `S2OrganismView` mode='replay' mounts the scrubber; mode='live' does NOT. Why: replay-only scope.
5. **`test_scrub_rewinds_fold_derived_panels`** — Asserts: scrubbing to N < M renders the ActivityTicker (and fold-derived charts) with events[0..N] only (fewer rows than the full run). Why: §12 step-through.
6. **`test_scrubber_defaults_to_full_run`** — Asserts: entering replay positions the scrubber at max (full run shown). Why: the default-position contract.
7. **`test_scrub_no_refetch_no_provider`** — Asserts: scrubbing triggers NO `runClient.getEvents`/command call (the fold is re-derived client-side). Why: rule #7 (no provider on replay) + rule #9 (read-only).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NONE — all web-local; the scrubber re-folds the existing persisted events. No schema-snapshot.
- **Orchestrator doc rows to write hot (Step 9 routing):** an `ARCHITECTURE.md §12` note — the replay scrubber re-folds `events[0..N]` client-side (the pure `foldEvents` reduce) to render the organism at step N, replay-mode-only, no provider call (rule #7); the fold-derived panels rewind, the lineage node-structure stays full (flagged limitation). An `apps/web/LESSONS` candidate (prefix-fold scrubber = pure `foldEvents` over an event slice; replay-only; no refetch). Orchestrator writes hot.
- **Shared-contract seam model touched?** No.

## Things to flag at Step 2.5
1. **Which panels rewind under the scrubber?** My default vote: the **fold-derived** panels (ActivityTicker + FitnessOverTime + EnergyPanel — all pure over `fold.events`) rewind via `foldAtStep`; the `LineageGraph` gets the prefix events (its in-flight overlay rewinds) but keeps the full API-projected node structure (`obs.lineage`). Full per-step lineage node reconstruction would need a fold→lineage derivation that doesn't exist → out of scope (honest limitation, FV.9/later). Flag if the user wants the graph nodes to step too.
2. **Scrubber active only in replay?** My default vote: **yes** — render the scrubber only in `mode='replay'`; a live run is streaming (scrubbing a live fold is out of scope; the live path is unchanged). Flag.
3. **Control type + placement.** My default vote: a native `<input type="range">` + a mono "step N / M" readout (accessible, keyboard-steppable, reduced-motion-safe), mounted in the S2 shell banner row or a slim strip. Pixel placement/legibility → FV.9 `/design-review`. Flag.
4. **Default position + "play".** My default vote: default at the END (full run shown); scrub BACK to step through. No auto-play/animation in FV.8 (a play button is optional FV.9 polish) — keep it a manual scrubber. Flag if auto-play is wanted now.

## Dependencies + sequencing
- **Depends on:** FV.4 (`8e6400d`, S2 + `useRunObservatory` + `fold.events`), FV.6 (`479c2f1`, the fold-derived telemetry panels + the ticker replay affordance), the pure `foldEvents` (P7/FV.4). Backend EXISTS (`getEvents`; replay calls no providers — rule #7).
- **Backend-independent** of the FB phase → parallel-eligible with the api implementer.
- **Blocks:** nothing. FV.9 polishes placement/a11y + the replay-final label (carried from FV.7).

## Estimated commit count
**1.** One coherent web slice — a pure prefix-fold selector + a scrubber control + the replay-mode wiring; same code area, no safety invariant, no contract change. The §12 note + the lesson ride the `/orchestrate-end` round commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "a replay step-scrubber re-folds `events[0..N]` with the existing PURE `foldEvents` reduce (no new server call, no provider — rule #7) and conditionally renders the fold-derived panels at step N; replay-mode-only (the live path is untouched); the projection-derived lineage node-structure stays full (a fold-prefix rewinds the in-flight overlay, not the API-projected node set — honest limitation)."
- **Architecture-doc note candidate** — §12: the client-side replay scrubber over the pure fold; replay reproduces the in-flight choreography step-by-step with no provider call.
- **Future TODO — operational** — auto-play; per-step lineage node reconstruction (a fold→lineage derivation); the replay-final-label (FV.7 carry); placement/a11y polish (FV.9).
