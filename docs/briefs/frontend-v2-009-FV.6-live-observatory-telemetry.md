# /tdd brief — live_observatory_telemetry

## Feature
Wire the remaining **live-telemetry panels** into the FV.4 S2 Organism 3-pane shell so the room sees the organism working in real time: the **ActivityTicker** (kernel RunEvent feed off the SSE fold), the **HealthIndicator** (the §11 continue-vs-switch cockpit gauge), and the run-wide **RunEnergyGauge** (the "finite by construction" draining charge), plus rendering the already-derived-but-unrendered **mean-fitness series** in FitnessOverTime. All fed by **pure event-derived selectors** over the observatory hook's `fold.events` + `health` projection — read-only over projections (rule #9), replay-identical from persisted events (rule #7, the selectors are pure → no provider call).

> **Scope note (FV.4 already landed part of the planning-doc FV.6 line).** FV.4 (`8e6400d`) already mounts `AgentRoster` (roster), `FitnessOverTime` (peak series), and `EnergyPanel` (per-agenome) in the shell. FV.6's genuine **delta** is the three not-yet-mounted DS telemetry components (ActivityTicker, HealthIndicator, RunEnergyGauge) + the **mean** series overlay. Do NOT rebuild the roster/charts FV.4 shipped.

## Use case + traceability
- **Task ID:** FV.6
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (frontend dashboard — the live panel vocabulary; status uses shape/label/icon in addition to color, projector-legible), `ARCHITECTURE.md §11` (run-health signal — current generation / candidates-in-flight / last-event-age / caps-consumed; the continue-vs-switch-to-replay cue), `ARCHITECTURE.md §10` (projections — rebuilt-on-read; read-only over projections, rule #2/#9).
- **Related context:**
  - Phase plan `docs/planning/frontend-v2-phase-plan.md` FV.6 row ("ActivityTicker (kernel event feed off the SSE fold), agent roster (per-agenome status from lineage), RunEnergyGauge, HealthIndicator, fitness climb").
  - **The shell to extend (FV.4):** `apps/web/src/routes/S2OrganismView.tsx` — LEFT rail (`StopControl` + `AgentRoster`), CENTER (`LineageGraph` + chartStrip: `FitnessOverTime` + `EnergyPanel`), RIGHT (`InspectorDrawer`). The doc comment already names "polished placement = FV.6". The live wiring is `useRunObservatory` (`apps/web/src/routes/useRunObservatory.ts`) returning `{ fold: FoldState (.events: RunEventEnvelope[]), health: RunHealth | null, lineage, runStatus, store, ... }`.
  - **DS components to mount (FV.0, pure-presentational):** `apps/web/src/components/ds/ActivityTicker.tsx` (`events: TickerEvent[]`, `mode?`, `maxRows?`, `title?`); `apps/web/src/components/ds/HealthIndicator.tsx` (`health: HealthSummary`, `status?: HealthStatus`, `showCaps?`, `mode?`); `apps/web/src/components/ds/RunEnergyGauge.tsx` (`spent: number`, `budget: number`, `mode?`).
  - **Existing data sources (reuse — do NOT re-derive):** `energyBudgetProgress(events)` → `{ budget: number|null, spent, fraction, exhausted }` (`apps/web/src/panels/energyData.ts`); `deriveFitnessSeries(events)` → `FitnessSeriesPoint[]` carrying `.mean` per generation (`apps/web/src/charts/chartData.ts`); `RunHealth` web-local shape `{ runId, currentGeneration, candidatesInFlight, lastEventAt: string|null, capsConsumed }` (`apps/web/src/data/health.ts`).
  - Safety: rule #9 (web is read-only over projections — telemetry never mutates state, never POSTs); rule #2 (projections are derived/rebuildable — the health STATUS is a client-side display threshold; the underlying signal + the exhaustion/terminal decisions stay the kernel's/API's); rule #7 (replay renders identically — the selectors are pure over persisted `fold.events`, no provider call). **No safety-invariant pin** (this is a read-only display slice) → not a solo/security-reviewer slice.

## Acceptance criteria (what "done" means)
- [ ] **`deriveTickerEvents(events)` (NEW, pure)** maps `fold.events` (`RunEventEnvelope[]`) → `TickerEvent[]` ordered by **`sequence` ascending** (the sole ordering key — never re-sorted by `occurredAt`), reading `type`/`sequence`/`occurredAt` **verbatim**; an unknown/unmapped event `type` still yields a row (the component renders a fallback glyph), never throws; `[]` → `[]`.
- [ ] **ActivityTicker mounted** in S2OrganismView fed by `deriveTickerEvents(obs.fold.events)`, with `mode` threaded (live vs replay affordance).
- [ ] **`toHealthSummary(health, nowMs)` (NEW, pure)** maps `RunHealth | null` → the component's `HealthSummary` (`currentGeneration`, `candidatesInFlight`, `lastEventAgeMs = nowMs − Date.parse(lastEventAt)` when `lastEventAt` present, `capsConsumed`); `null` health → a safe empty summary (no crash, no NaN).
- [ ] **`deriveHealthStatus(summary)` (NEW, pure)** thresholds `lastEventAgeMs` → a `HealthStatus` (`healthy`/`slowing`/`slow`/`degraded`/`stalled`); absent `lastEventAgeMs` (run not yet producing) → a sane default (NOT `stalled`). **HealthIndicator mounted** fed by `toHealthSummary` + `deriveHealthStatus`.
- [ ] **RunEnergyGauge mounted** fed by `energyBudgetProgress(obs.fold.events)` → `spent` + `budget`; an unknown budget (`null`, no `run.configured` seen yet) renders safely (gauge shows empty, never NaN — pass `budget ?? 0`).
- [ ] **Mean-fitness series rendered:** `FitnessOverTime` renders the `mean` series alongside `best` (consuming the existing `FitnessSeriesPoint.mean` + the `MEAN_FITNESS_SERIES` theme) — closes the P7 "defined-but-unrendered" reachability finding.
- [ ] **Read-only + replay-identical (rule #9/#7):** the telemetry derivations never mutate store state and never POST; in `mode='replay'` the panels render from the same pure selectors over persisted `fold.events` (no provider call, no new fetch beyond the FV.4 read path).
- [ ] No contract change (all web-local; `RunHealth` stays web-local). All `apps/web` unit tests pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
`apps/web/src/routes/S2OrganismView.tsx` — the three DS telemetry components mount in the live 3-pane shell, fed by the existing `useRunObservatory` hook + the new pure selectors; `FitnessOverTime` gains the mean series. Confirm a run rendered through the real S2 route shows the ActivityTicker feed growing on the SSE cadence, the HealthIndicator reflecting `getRunHealth`, and the RunEnergyGauge draining — i.e. the panels are reachable from the production `/runs/:id` route, not just unit-mounted. (Precise visual placement/legibility is the FV.9 `/design-review` pass; FV.6 lands them wired + correct.)

## Files expected to touch
**New:**
- `apps/web/src/routes/observatoryTelemetry.ts` — pure selectors: `deriveTickerEvents(events)`, `toHealthSummary(health, nowMs)`, `deriveHealthStatus(summary)` (colocated with `useRunObservatory`; the telemetry-shaping layer the view consumes).
- `apps/web/test/unit/routes/observatoryTelemetry.test.ts`

**Modified:**
- `apps/web/src/routes/S2OrganismView.tsx` — mount ActivityTicker + HealthIndicator + RunEnergyGauge; thread `mode`.
- `apps/web/src/charts/FitnessOverTime.tsx` — render the mean series (consume `FitnessSeriesPoint.mean` + `MEAN_FITNESS_SERIES`).
- `apps/web/test/unit/routes/S2OrganismView.test.tsx` — extend: telemetry mounted + mode-threaded.
- `apps/web/test/unit/charts/FitnessOverTime.test.tsx` — mean series rendered (extend if present; else add).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Pure selectors in `apps/web/test/unit/routes/observatoryTelemetry.test.ts`; wiring in the route/chart test files:

1. **`test_ticker_events_preserve_sequence_order`** — Asserts: `deriveTickerEvents` orders rows by `sequence` ascending and reads `type`/`occurredAt` verbatim — never re-sorts by `occurredAt`. Why: §12 ticker / sequence is the sole ordering key.
2. **`test_ticker_unknown_event_type_renders`** — Asserts: an envelope with an unmapped `type` still yields a `TickerEvent` (no throw; component falls back to a neutral glyph). Why: defensive — the feed never crashes on a new event type.
3. **`test_ticker_empty_events_empty_feed`** — Asserts: `[]` → `[]` (the component then shows "waiting for events…"). Why: empty-state honesty.
4. **`test_health_summary_maps_run_health`** — Asserts: `toHealthSummary(health, nowMs)` maps `currentGeneration`/`candidatesInFlight`/`capsConsumed` and computes `lastEventAgeMs = nowMs − Date.parse(lastEventAt)`. Why: §11 health surface.
5. **`test_health_summary_null_safe`** — Asserts: `toHealthSummary(null, nowMs)` returns a safe empty summary (no crash, no NaN). Why: the hook's `health` is `null` until the first fetch resolves.
6. **`test_health_status_thresholds`** — Asserts: `deriveHealthStatus` maps representative `lastEventAgeMs` values across the buckets → `healthy`/`slowing`/`slow`/`degraded`/`stalled` (incl. boundary values). Why: §11 continue-vs-switch cue.
7. **`test_health_status_no_last_event_default`** — Asserts: absent `lastEventAgeMs` (run not yet producing) → the sane default (NOT `stalled`). Why: a just-started run isn't stalled.
8. **`test_energy_gauge_unknown_budget_safe`** — Asserts: with no `run.configured` event, `energyBudgetProgress` → `budget: null`; the wiring passes `budget ?? 0` so RunEnergyGauge renders without NaN/divide-by-zero. Why: §12 + the gauge's `budget>0` guard.
9. **`test_fitness_mean_series_rendered`** — Asserts: `FitnessOverTime` renders a mean-series datum (from `deriveFitnessSeries(...).mean`) in addition to the peak. Why: closes the P7 reachability finding (mean defined-but-unrendered).
10. **`test_s2_mounts_telemetry_live_and_replay`** — Asserts: `S2OrganismView` mounts ActivityTicker + HealthIndicator + RunEnergyGauge fed by the hook, with `mode` threaded (a `mode='replay'` render shows the replay affordance, e.g. ticker "replaying"). Why: Step-7.5 wiring (reachable from the route) + rule #7 replay parity.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NONE — all web-local; `RunHealth` stays a web-local schema (its eventual promote-to-frozen-contract is a carried integration item, not this slice). No schema-snapshot.
- **Orchestrator doc rows to write hot (Step 9 routing):** an `ARCHITECTURE.md §12/§11` note — the live-telemetry panel vocabulary (ActivityTicker/HealthIndicator/RunEnergyGauge) fed by the SSE fold + the health projection via pure selectors; the health STATUS is a client-side display threshold (the kernel owns exhaustion/terminal). A `apps/web/LESSONS` convention candidate (telemetry = pure event-derived selectors; never re-derive/reorder by occurredAt; client-side health-status threshold). Orchestrator writes hot.
- **shared-contract seam model touched?** No.

## Things to flag at Step 2.5
1. **Health-status thresholds + the no-event default (LOAD-BEARING display constants).** My default vote: `lastEventAgeMs` < 3s → `healthy`, < 8s → `slowing`, < 20s → `slow`, < 60s → `degraded`, ≥ 60s → `stalled`; absent last-event (run just started, none folded yet) → **`healthy`** (NOT `stalled` — a fresh run isn't stalled). Tunable constants (not contract); they mirror the §11 ~10-minute-window cockpit intent. Ping back if the user wants different cutoffs.
2. **Ticker phrase richness — machine-truth vs narration.** My default vote: a **minimal honest** mapping — `sequence` + canonical `type` + `occurredAt` verbatim, `actor` from the envelope's actor/role field when present; let the component fall back to `type` for the phrase. A richer per-type phrase (e.g. "ag_a3 fused from ag_a0 + ag_a2") needs payload fields not uniformly present → defer to a follow-up rather than fabricate prose. Keep FV.6 machine-truthful.
3. **Telemetry placement in the 3-pane shell.** My default vote: LEFT rail gains HealthIndicator + RunEnergyGauge as cockpit gauges (under "Run controls", above the roster); ActivityTicker as a full-height panel (LEFT-rail bottom or a slim strip). Exact visual placement/legibility is the FV.9 `/design-review` pass — FV.6 just lands them **wired + rendering + correct**, not pixel-final. Don't block on placement.
4. **Mean-fitness series — include here or split?** My default vote: **include** — it's tiny, pure, closes the P7 reachability finding, and is literally "fitness climb" in the FV.6 definition. If it complicates `FitnessOverTime`'s render beyond a few lines, split it into a trailing commit in the same slice.
5. **`now` injection for deterministic tests.** My default vote: keep `toHealthSummary(health, nowMs)` + `deriveHealthStatus(summary)` **pure** (inject `nowMs`); the view passes `Date.now()` at render. The DS components' own relative-time display already reads `Date.now()` internally (presentational — fine, not under test here).

## Dependencies + sequencing
- **Depends on:** FV.4 (`8e6400d`, the S2 3-pane shell + `useRunObservatory`), FV.0 (`9a6be17`, the DS ActivityTicker/HealthIndicator/RunEnergyGauge ports). Backend EXISTS (`getEvents`/`getLineage`/`getRunHealth`; `energyBudgetProgress`/`deriveFitnessSeries` selectors).
- **Backend-independent** of FB.3/FB.4 → parallel-eligible with the api implementer (different code area).
- **Blocks:** nothing hard. Sibling to FV.5 (node-inspector). FV.9 polishes placement/a11y. FV.5's deep telemetry (FB.6/7/8) is additive and does not depend on FV.6.

## Estimated commit count
**1.** One coherent web telemetry slice — pure selectors + shell wiring + the mean-series overlay; same code area, no safety invariant, bisectable as one logical unit. The mean-series render may split into a trivial trailing commit if it complicates `FitnessOverTime` (Step-2.5 Q4). No contract change → the §12/§11 note + the lesson ride the `/orchestrate-end` round commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "live-telemetry panels are fed by PURE event-derived selectors over `fold.events` (machine-truth: sequence-ordered, verbatim payload reads, never re-derive/reorder by `occurredAt`); the run-health STATUS is a client-side threshold over last-event-age — the underlying signal + the exhaustion/terminal decisions stay the kernel's/API's (rule #2 projection-derived, rule #9 read-only)."
- **Architecture-doc note candidate** — §12/§11: the ActivityTicker/HealthIndicator/RunEnergyGauge panel vocabulary fed by the SSE fold + the health projection; health-status thresholding is display-only.
- **Future TODO — operational** — tune the health-status thresholds + enrich ticker phrases post-demo; a mean/novelty series overlay toggle; promote `RunHealth` to a frozen contract at the FB→cody merge (carried).
