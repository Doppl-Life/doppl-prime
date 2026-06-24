# /tdd brief — s5_final_idea_payoff_screen

## Feature
Build the dedicated **S5 Final-Idea / payoff route screen** at `/runs/:id/final` — the demo headline ("your problem → the final surviving idea"). It **composes already-shipped pieces** into a payoff layout: the `FinalIdeaPanel` (winner card + proof: fitness, energy, critic gauntlet, subtype checks, transfer-evidence label, traces, evidence links) + the **generational-climb** chart (gen-0 → winner Δ, best-fitness per generation). It replaces the FV.1 **interim** mount (which renders `Dashboard` at `/runs/:id/final`) with a real S5 screen, exactly as FV.4 replaced the S2 interim with `S2OrganismView`. Read-only over projections (rule #9); the winner is the kernel-marked `'selected'` candidate (zero new surface — PD.11 bridge); terminal zero-survivors renders honestly (never fabricated); replay-identical (rule #7).

> **Scope note — this is a RE-HOME + COMPOSE, not a rebuild.** `FinalIdeaPanel`, `finalIdeaData` (`selectWinner`/`evidenceRungLabel`/`gatherProof`), `GenerationComparison`/`FitnessOverTime`, `EvidenceRefLink`, the critic/check panels, and the chart selectors are **all already built + tested** (P7.13/PD.7/PD.11 + FV.6). FV.7's net-new is the **S5 route component + its composition + the route re-wiring**. Do NOT re-spec the panel internals — they have their own tests.

## Use case + traceability
- **Task ID:** FV.7
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (frontend dashboard — the **final surviving-idea proof panel**; accessibility shape/label/icon; the dedicated DS screens land per-route), `ARCHITECTURE.md §11` (backend API & flows — the lineage/winner + events projections the screen reads, rebuilt-on-read).
- **Related context:**
  - Phase plan `docs/planning/frontend-v2-phase-plan.md` FV.7 row ("Winner card, generational climb (gen-0 → winner Δ), the gauntlet + judge it survived, transfer check live/replay label, evidence links. Reuse FinalIdeaPanel + the PD.11 finalIdeaRef→selected bridge").
  - **The pattern to mirror (FV.4):** `src/routes/S2OrganismView.tsx:81–100` is a route screen that takes `{runId, runClient, mode?, + injection seams}` and wires data via `useRunObservatory` (`src/routes/useRunObservatory.ts:56–127` → `{ lineage, fold (.events), health, runStatus, store, selectedCandidateId, setSelectedCandidateId }`). S5 follows this shape.
  - **The panel to compose (already built):** `src/panels/FinalIdeaPanel.tsx:28–40` props `{ runId, lineage: LineageGraphProjection, events, runClient: Pick<RunClient,'getCandidate'>, onSelectLineageNode?, mode?, runStatus? }`; it renders the winner card + all proof sections and the graceful no-winner / terminal-zero-survivors states (lines 129–141). Currently mounted inside `Dashboard.tsx:300–312`.
  - **Winner selection (zero new surface — PD.11):** `selectWinner(lineage)` (`src/panels/finalIdeaData.ts:26–28`) returns the `type:'candidate' && status:'selected'` node or `null`; the `'selected'` mark is set by the **kernel/projection** (`GET /runs/:id/lineage`), never the web — the panel displays it verbatim (rule #6 emit-only, no re-rank).
  - **Generational climb (already built):** `deriveGenerationComparison(events)` / `deriveFitnessSeries(events)` (`src/charts/chartData.ts:94–132`) → best fitness per generation; rendered by `GenerationComparison.tsx:59–114` / `FitnessOverTime.tsx:63–161` (rule #4 multi-channel).
  - **Transfer-evidence label (PD.7):** `evidenceRungLabel(mode)` (`finalIdeaData.ts:36–38`) — mode-derived (`live → 'live allowlisted (non-executing)'`, `replay → 'replay-backed'`); the frozen `CheckResult` carries no live/replay discriminator → mode is the sole zero-surface source.
  - **The interim route to replace:** `src/app/routes.tsx:44–57` `FinalRoute` interim-mounts `Dashboard` at `/runs/:id/final`; FV.7 repoints it to `S5FinalIdeaScreen` (FV.1 LESSON 16 pattern — repoint, don't orphan; update the prior router test).
  - Safety: rule #9 (read-only over projections — S5 issues no command/POST; `getCandidate`/`getLineage`/`getEvents` are reads); rule #6 (the winner + scores are kernel/judge-authored; the screen displays verbatim, never re-ranks); rule #7 (replay reconstructs from persisted events, no provider call). **No safety-invariant pin** (read-only display) → not a security-reviewer slice.

## Acceptance criteria (what "done" means)
- [ ] **NEW `S5FinalIdeaScreen` route component** takes `{ runId, runClient, mode?, + the S2-style injection seams }`, wires `lineage` + `fold.events` + `runStatus` via `useRunObservatory` (the tested path; a terminal run forces the final re-fetch so the FINAL graph/winner always render), and **composes** `FinalIdeaPanel` (passing `lineage`, `events`, `runClient`, `mode`, `runStatus`, `onSelectLineageNode`) + the **generational-climb** chart (`GenerationComparison` or `FitnessOverTime`, fed by `fold.events`).
- [ ] **The `/runs/:id/final` route mounts `S5FinalIdeaScreen`** (not the interim `Dashboard`); reachable from the route with `runClient` injected via `useRunClient` (mirrors `S2OrganismView`'s route wrapper, key by run id).
- [ ] **Winner = the kernel-marked `'selected'` node** via `selectWinner(lineage)` (zero new surface); the screen re-ranks nothing (rule #6). **Terminal zero-survivors** (a `run.completed/failed/stopped` with no `'selected'` winner) → `FinalIdeaPanel`'s graceful terminal state, never a fabricated idea.
- [ ] **Generational climb visible:** the screen renders best-fitness-per-generation (gen-0 → winner Δ) from `deriveGenerationComparison`/`deriveFitnessSeries` (REQ-E-001 — improvement is visible).
- [ ] **Transfer-evidence rung label** is mode-derived (`evidenceRungLabel(mode)`, PD.7); **evidence links** render in-tier via `EvidenceRefLink` (rule #9 — never an external href). _(These ride the composed `FinalIdeaPanel`; S5 just passes `mode` + `runClient`.)_
- [ ] **Read-only + replay-identical (rule #9/#7):** S5 issues no POST/command; in `mode='replay'` it renders from the same pure selectors over persisted events.
- [ ] The FV.1 **interim `FinalRoute`** (Dashboard at `/final`) is replaced; the prior **router test** that asserted `/final` mounts Dashboard is **updated** to assert it mounts S5 (keep the suite honest — FV.1 LESSONS 16/17). No contract change (web-local). All `apps/web` unit tests pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
`src/app/routes.tsx` — the `/runs/:id/final` route element becomes `S5FinalIdeaScreen` (replacing the interim `FinalRoute`→`Dashboard`). Confirm the dedicated screen is reachable from the real route (a completed run navigates to `/runs/:id/final` → the winner card + climb render), not just unit-mounted. Precise payoff-layout polish/legibility is the FV.9 `/design-review` pass; FV.7 lands it **wired + composed + correct**.

## Files expected to touch
**New:**
- `src/routes/S5FinalIdeaScreen.tsx` — the dedicated S5 route screen (mirrors `S2OrganismView`: `useRunObservatory` wiring + `FinalIdeaPanel` + the climb chart in a payoff layout).
- `test/unit/routes/S5FinalIdeaScreen.test.tsx`

**Modified:**
- `src/app/routes.tsx` — repoint `/runs/:id/final` from the interim `Dashboard` to `S5FinalIdeaScreen`.
- `test/unit/app/router.test.tsx` — update the `/final` route assertion (now mounts S5).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
S5 tests focus on the **net-new composition + route wiring** — the panel/selector internals are already covered by `test/unit/panels/FinalIdeaPanel.test.tsx` + `charts`/`finalIdeaData` tests (don't duplicate them).

1. **`test_final_route_mounts_s5_screen`** — Asserts: `/runs/:id/final` renders `S5FinalIdeaScreen` (not `Dashboard`). Why: §12 dedicated-screen route (replaces the FV.1 interim). _(router test update.)_
2. **`test_s5_composes_final_idea_panel`** — Asserts: S5 mounts `FinalIdeaPanel` fed by the hook's `lineage` + `events`, passing `mode` + `runStatus` + `runClient` + `onSelectLineageNode`. Why: the winner-card + proof composition.
3. **`test_s5_renders_generational_climb`** — Asserts: S5 renders the generational-climb chart (`GenerationComparison`/`FitnessOverTime`) fed by `fold.events`. Why: gen-0 → winner Δ visible (REQ-E-001).
4. **`test_s5_terminal_zero_survivors_passthrough`** — Asserts: with a terminal run + no `'selected'` winner, S5 (via `FinalIdeaPanel`) shows the graceful terminal state, never a fabricated idea. Why: rule #6 honesty (S5 passes `runStatus`).
5. **`test_s5_read_only_and_replay_parity`** — Asserts: S5 issues no `runClient` command/POST (read-only, rule #9); a `mode='replay'` render produces the winner/climb from the same selectors (rule #7 parity). Why: rule #9/#7.
6. **`test_s5_winner_from_selected_node`** — Asserts: S5 surfaces the `selectWinner(lineage)` `'selected'` candidate (no client-side re-rank). Why: rule #6 — the kernel marks the winner; the screen displays it. _(Light — confirms S5 wires the lineage through; the selector itself is panel-tested.)_

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NONE — all web-local; the `'selected'` winner is kernel/projection-marked (no new surface). No schema-snapshot.
- **Orchestrator doc rows to write hot (Step 9 routing):** an `ARCHITECTURE.md §12` note — the dedicated S5 Final-Idea screen composes the existing `FinalIdeaPanel` + generational-climb chart via `useRunObservatory`, replacing the FV.1 interim; winner via the kernel-marked `'selected'` node (rule #6 emit-only, zero surface). An `apps/web/LESSONS` candidate likely (dedicated payoff screen = compose-shipped-panels + repoint-the-interim-route, mirrors FV.4). Orchestrator writes hot.
- **shared-contract seam model touched?** No.

## Things to flag at Step 2.5
1. **Climb chart — `GenerationComparison` vs `FitnessOverTime`.** My default vote: **`GenerationComparison`** for the payoff (the explicit per-generation best-fitness vs best-novelty bars read as "it climbed"); `FitnessOverTime` (now with the FV.6 mean overlay) is the alternative. Either is already built — pick for legibility; FV.9 polishes. Could show both if the layout wants it.
2. **Data wiring — `useRunObservatory` vs a one-shot terminal fetch.** My default vote: **`useRunObservatory`** (the tested path; on a terminal run its forced final re-fetch lands the complete lineage/events, and live SSE is harmless/idle). A simpler one-shot `getLineage`+`getEvents` is the alternative but adds a new fetch path; reuse the hook for consistency with S2.
3. **Route `mode` for `/runs/:id/final`.** My default vote: **`mode='live'`** default (the winner of a completed live run; the transfer label reads `live allowlisted`). A replay-context final view (label `replay-backed`) is FV.8 (replay scrubber) territory — if trivial, accept an optional `?replay` but don't block FV.7 on it. Flag if the user wants the replay-final label now.
4. **Dashboard's inline `FinalIdeaPanel` mount — keep or drop.** My default vote: **repoint the route to S5 + KEEP** Dashboard's inline mount (Dashboard still mounts at `/launch`; removing it risks churn) — flag the dup as a **Carry-forward de-dup** (consistent with the FV.4 observatory-dup pattern, LESSON 18), not a silent drop. FV.3/later retires Dashboard.

## Dependencies + sequencing
- **Depends on:** FV.1 (`0c670d9`, router + the interim `/final` route), FV.4 (`8e6400d`, `useRunObservatory` + the route-screen pattern), P7.13/PD.7/PD.11 (`FinalIdeaPanel` + `finalIdeaData` + the `finalIdeaRef`→`selected` bridge — all shipped). Backend EXISTS.
- **Backend-independent** of the FB phase → parallel-eligible with the api implementer.
- **Blocks:** nothing hard. FV.8 (replay scrubber) reuses the S5 screen in replay mode; FV.9 polishes layout/a11y.

## Estimated commit count
**1.** One coherent web slice — a dedicated route screen composing already-shipped panels + the route repoint; same code area, no safety invariant, no contract change. Bisectable as one logical unit. The §12 note + the lesson ride the `/orchestrate-end` round commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "a dedicated DS payoff/screen slice COMPOSES already-shipped panels + selectors (FinalIdeaPanel + the climb chart) and REPOINTS the interim route (repoint, don't orphan; update the prior route test) — mirrors the FV.4 re-home pattern; the winner is the kernel-marked `'selected'` node (rule #6 emit-only, zero surface); read-only (rule #9), replay-identical (rule #7)."
- **Architecture-doc note candidate** — §12: the dedicated S5 Final-Idea screen + its composition; winner via the PD.11 `finalIdeaRef`→`selected` bridge.
- **Future TODO — operational** — de-dup Dashboard's inline FinalIdeaPanel mount; a replay-context final-view label (FV.8); payoff-layout legibility polish (FV.9).
