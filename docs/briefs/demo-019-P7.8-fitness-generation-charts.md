# /tdd brief — fitness_generation_charts

## Feature
The **fitness-over-time + generation-comparison charts** (§12). (1) **FitnessOverTime** plots `FitnessScore.total` (and components when shown) across generations so generation-over-generation improvement is visible (REQ-E-001); (2) **GenerationComparison** contrasts generations on the scored metrics derived from `fitness.scored` / `novelty.scored` events. Both encode series with **patterns / markers / labels in addition to color** (colorblind-safe + projector-legible, §12), render **meaningfully with zero/partial data** (early in a run), and **update as new score events fold in** — never blocking on the full run completing. The **pure series selectors are TDD'd**; the SVG render is the visual layer.

## Use case + traceability
- **Task ID:** P7.8 (fitness-over-time + generation-comparison charts)
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (the charts panel; colorblind/projector-legible — series via pattern+marker+label, not color alone; renders with partial data), `§4` (the series derive from the `fitness.scored`/`novelty.scored` event payloads).
- **Related context:** **Builds on P7.2** (the run-store / event stream) + **P7.3** (tokens/accessible conventions) + frozen `FitnessScore`/`NoveltyScore` (P0.8). **Data source note:** the P7.2 run-store `ViewState` is LEAN — it tracks per-entity latest **status**, NOT score **values** — so the charts derive their series from the `fitness.scored`/`novelty.scored` **EVENTS** (via `runClient.getEvents`/`getReplay`, Zod-validated through the frozen contracts), NOT from the lean `ViewState`. Unit-first for the pure selectors; the SVG render is light-asserted (no pixel pins).

## Acceptance criteria (what "done" means)
- [ ] A pure **`deriveFitnessSeries(events)`** extracts `FitnessScore.total` (+ `components` when shown) per generation from the `fitness.scored` event payloads (validated via the frozen `FitnessScore`), yielding an ordered-by-generation series (REQ-E-001)
- [ ] A pure **`deriveGenerationComparison(events)`** contrasts generations on the scored metrics from `fitness.scored` / `novelty.scored` payloads (e.g. best/mean fitness + novelty per generation)
- [ ] **FitnessOverTime** + **GenerationComparison** render the series encoding **pattern + marker + label in addition to color** (colorblind-safe, projector-legible — never color alone, rule #4 / §12)
- [ ] Both charts **render meaningfully with zero/partial data** (no run yet → an empty/affordance state; one generation → renders; they never throw or blank on partial data) and **update as new score events fold in** (re-derive on the event list growing)
- [ ] The series are sourced from the **events / projections only** (the dashboard never recomputes scores — it reads the persisted `FitnessScore`/`NoveltyScore` from the event payloads, never re-deriving fitness)
- [ ] Adherence-clean (`var()` tokens via `chartTheme`, no raw hex; chart geometry/scale numerics exempt as non-styling); no `apps/api` import (rule #6); no secret
- [ ] Unit tests pass (pure selectors + light component asserts, happy-dom); **count reported**; `/preflight` (web) clean

## Wiring / entry point (Step 7.5)
**none — mounted by the P7.14 shell.** P7.8 provides the two chart components + the pure series selectors + `chartTheme`. The shell (P7.14) mounts them on the run screen, feeding the event list (`runClient.getEvents`/the run-store stream). Exercised now against a seeded `fitness.scored`/`novelty.scored` event fixture. So: *first consumer — the P7.14 shell; data flows from the events at integration.*

## Files expected to touch
**New:**
- `apps/web/src/charts/chartData.ts` — the pure selectors `deriveFitnessSeries(events)` + `deriveGenerationComparison(events)` (validated via frozen contracts; zero/partial-safe) — the TDD'd core (mirrors the P7.5/P7.6/P7.7 pure-logic split; flag if you'd rather inline)
- `apps/web/src/charts/FitnessOverTime.tsx` — the line/series chart
- `apps/web/src/charts/GenerationComparison.tsx` — the grouped/comparison chart
- `apps/web/src/charts/chartTheme.ts` — token-based series styling (colors via `var()`, the pattern/marker/label vocabulary)
- `apps/web/test/unit/charts/{chartData,FitnessOverTime,GenerationComparison}.test.{ts,tsx}`

**Modified:** none expected (consumes P7.2/P7.3 + frozen contracts). **If you choose a charting lib (Q1), `package.json` + lockfile change → flag at Step 9.**

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
**(happy-dom + a seeded fitness.scored/novelty.scored event fixture; `spec(§12)`/`spec(§4)`):**
1. **`test_deriveFitnessSeries_orders_by_generation`** — extracts `FitnessScore.total` (+ components) per generation from `fitness.scored` payloads, ordered by generation. *(Positive guard.)* Why: REQ-E-001.
2. **`test_deriveGenerationComparison_contrasts_metrics`** — contrasts generations on fitness/novelty metrics from `fitness.scored`/`novelty.scored`. Why: §12.
3. **`test_selectors_zero_and_partial_data`** — zero events → empty series (no throw); one generation → renders a single point/bar. Why: §12 partial-data.
4. **`test_selectors_read_persisted_scores_no_recompute`** — the series read the persisted `FitnessScore.total`/`NoveltyScore.score` verbatim from the payloads (validated via the frozen schema), never re-deriving fitness. Why: §4 / authoritative-once-computed.
5. **`test_charts_encode_beyond_color`** — each series carries a pattern/marker + a text label, not color alone (assert the non-color channel is present). Why: rule #4 / §12 colorblind/projector.
6. **`test_charts_render_partial_data`** — the components render an empty/affordance state with zero data + a meaningful chart with one generation (no throw/blank). Why: §12.
7. **`test_no_apps_api_import`** — structural (rule #6, positive-guarded).

## Cross-doc invariant impact
- **Model field changes:** none (consumes frozen `FitnessScore`/`NoveltyScore` read-only). **§2.5-seam:** none.
- **Orchestrator doc rows (Step 9):** likely none beyond apps/web §1–§5. A possible chart-data-derivation convention if it generalizes (P7.9 energy panel will reuse the events-derived-series pattern). I author hot if it surfaces. **If a charting lib is added → manifest flag at Step 9 (not a cross-doc invariant).**

## Things to flag at Step 2.5
1. **Render approach — hand-rolled SVG vs a charting lib.** My default vote: **hand-rolled SVG** (consistent with the prototype's SVG approach, full `var()`-token + colorblind-pattern control, NO new dep) for these two simple charts (a line series + a grouped comparison). Escalate to **recharts** only if the axis/scale/tick math proves heavy — if you add it, flag the manifest change at Step 9. Confirm.
2. **Data source.** My default vote: the charts derive from the `fitness.scored`/`novelty.scored` **events** (via `runClient.getEvents`/`getReplay`) — the lean P7.2 `ViewState` does NOT retain score values (status only), so a pure `chartData` selector over the event list is the source; the live update wires to the run-store stream at P7.14. Confirm (vs extending the store to retain score events — out of scope, keeps the store lean).
3. **Components shown.** My default vote: FitnessOverTime plots `total` by default with components (the `FitnessScore.components` open record) toggle-able; GenerationComparison shows best+mean fitness + novelty per generation. Confirm the default metric set (don't over-build).

## Dependencies + sequencing
- **Depends on:** **P0.8** (`FitnessScore`/`NoveltyScore` — frozen), **P7.2** (run-store/event stream), **P7.3** (tokens/accessible). Independent of P7.7 (no lineage dependency). Independent of `apps/api`.
- **Blocks:** **P7.14** (shell mounts the charts). Shares the events-derived-series pattern with **P7.9** (energy panel).

## Estimated commit count
**1.** Feature slice (two charts + theme + the pure selectors). Not safety-invariant (read-only render of persisted scores; the UI never recomputes fitness — rule #6-adjacent: the held-out judge/scoring is authoritative, the dashboard only displays). Step-8: code-quality phase-boundary; security-reviewer optional (no secret, no mutation, read-only).

## Lessons-logged candidates anticipated
- **Convention candidate (maybe)** — "dashboard charts derive their series from a PURE selector over the `fitness.scored`/`novelty.scored` events (the lean run-store `ViewState` holds status not score values), reading the persisted `FitnessScore`/`NoveltyScore` verbatim (never recomputing — the scoring is authoritative); series encode pattern+marker+label beyond color (colorblind/projector); render partial-data-safe." Likely banked when P7.9 reuses it.

## How to invoke
> web session oriented — `/tdd`. cwd `apps/web/`. Stage only `apps/web/...` (+ package.json/lockfile only if you add a charting lib). (Round-3 web slice 3 — continuous roll, after P7.7.)
1. **Run `/tdd fitness_generation_charts`.**
2. **Step 2.5** — answer the 3 questions (esp. Q1 render approach, Q2 data source), send the write-up + coverage map.
3. **Step 9** — surface any chart-derivation convention + a charting-lib manifest change if you add one.
