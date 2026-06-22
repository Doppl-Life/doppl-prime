# /tdd brief — energy_per_agenome_panel

## Feature
The **energy-per-agenome panel** (§12) — displays `doppl_energy` spend per agenome (derived from `energy.spent`/`EnergyEvent` events), making cost/energy scarcity legible as a selection pressure (REQ-E-004). Reflects **rule #8 — success-only spend**: only `energy.spent` events debit; failed/retried/repaired attempts (`provider_call_failed`, `output_schema_rejected`) do NOT add to an agenome's energy total. Shows progress against the run's `energyBudget` cap and surfaces `energy_exhausted` distinctly. Per-agenome rows link to that agenome's lineage node (the P7.7 `dataRef`) so energy is traceable to outcome. Reuses the P7.8 events-derived-selector pattern (LESSONS §6).

## Use case + traceability
- **Task ID:** P7.9 (energy-per-agenome panel — successful productive spend only)
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (the energy panel; accessible/projector-legible), `§5` (energy ledger — success-only debit, `energy_exhausted`), `§4` (the series derive from `energy.spent`/`EnergyEvent` payloads + `RunCaps.energyBudget`).
- **Related context:** key safety rule **#8 (energy = successful productive spend only)** — the panel MUST count only `energy.spent` and exclude failure events. **Builds on P7.2** (run-store/event stream) + **P7.3** (tokens/accessible) + **P7.7** (lineage node `dataRef` link targets) + frozen `EnergyEvent` (P0.9) + `RunCaps` (P0.3). Same events-derived pattern as P7.8 (LESSONS §6) — a pure selector over the events; the lean ViewState holds status not energy values. Unit-first.

## Acceptance criteria (what "done" means)
- [ ] A pure **`deriveEnergyByAgenome(events)`** sums `EnergyEvent.actual` (`unit: doppl_energy`) per `agenomeId` from `energy.spent` events (validated via the frozen `EnergyEvent`), yielding per-agenome totals (REQ-E-004)
- [ ] **Rule #8 success-only:** the selector counts ONLY `energy.spent`; `provider_call_failed` / `output_schema_rejected` (and any non-`energy.spent` type) add NOTHING to an agenome's total — pinned by a test that seeds failures + asserts they don't debit
- [ ] Shows **progress against `RunCaps.energyBudget`** (per-run cap from `run.configured`) and surfaces **`energy_exhausted`** as a distinct state when that event is present
- [ ] Per-agenome rows **link to the agenome's lineage node** (the P7.7 `dataRef` target) and its candidate(s) so energy is traceable to outcome
- [ ] Adherence-clean (`var()` tokens, no raw hex; bar/meter geometry numerics exempt); status via the shared primitive (shape+label+icon, rule #4); no `apps/api` import (rule #6); no secret
- [ ] Unit tests pass (pure selector + light component asserts, happy-dom); **count reported**; `/preflight` (web) clean

## Wiring / entry point (Step 7.5)
**none — mounted by the P7.14 shell.** P7.9 provides the `EnergyPanel` + the pure `deriveEnergyByAgenome` selector. The shell (P7.14) mounts it, feeding the event list + the lineage `dataRef` link targets. Exercised now against a seeded `energy.spent`/failure event fixture + `run.configured` (for `energyBudget`). So: *first consumer — the P7.14 shell; rows link to P7.7 lineage nodes at integration.*

## Files expected to touch
**New:**
- `apps/web/src/panels/EnergyPanel.tsx` — the panel (per-agenome rows + budget progress + energy_exhausted state)
- `apps/web/src/panels/energyData.ts` — the pure `deriveEnergyByAgenome(events)` + `energyBudgetProgress` selectors (mirrors the P7.8 chartData split)
- `apps/web/test/unit/panels/{energyData,EnergyPanel}.test.{ts,tsx}`

**Modified:**
- `apps/web/src/data/contracts.ts` — add `EnergyEvent` to the re-export seam (consumed read-only — like P7.8's FitnessScore/NoveltyScore; `RunCaps` already in the seam). The "Consumed read-only" table-row extension is the orchestrator's Step-9 hot-write.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
**(happy-dom + a seeded energy.spent/failure/run.configured fixture; `spec(§12)`/`spec(§5)`/`spec(§4)`):**
1. **`test_derive_energy_by_agenome_sums_actual`** — sums `EnergyEvent.actual` per `agenomeId` from `energy.spent`. *(Positive guard.)* Why: REQ-E-004.
2. **`test_failures_do_not_debit_energy`** — `provider_call_failed`/`output_schema_rejected` events add nothing to any agenome's total (success-only). Why: rule #8 / §5.
3. **`test_budget_progress_and_exhausted`** — progress is computed against `RunCaps.energyBudget` (from `run.configured`); an `energy_exhausted` event surfaces the distinct state. Why: §5.
4. **`test_rows_link_to_lineage_node`** — each agenome row carries the lineage-node link target (the `dataRef`/agenomeId the P7.7 graph uses). Why: §12 traceability.
5. **`test_no_apps_api_import`** — structural (rule #6, positive-guarded).

## Cross-doc invariant impact
- **Model field changes:** none (consumes frozen `EnergyEvent`/`RunCaps` read-only). **§2.5-seam:** none.
- **Orchestrator doc rows (Step 9):** the `data/contracts.ts` "Consumed read-only" table row gains `EnergyEvent` (§4/§5) — my hot-write (like P7.8). Otherwise apps/web §1–§6 cover it.

## Things to flag at Step 2.5
1. **Energy total = `actual` only (not `estimate`).** My default vote: sum `EnergyEvent.actual` (the reconciled spend), never `estimate` — `actual` is the authoritative post-call debit (rule #8). Confirm.
2. **`energy_exhausted` source.** My default vote: surface the distinct exhausted state from the `energy_exhausted` event (a failure/terminal type in the registry), not by comparing total≥budget client-side (the kernel owns the exhaustion decision — don't re-derive it). Confirm.
3. **Lineage link shape.** My default vote: the row links by `agenomeId` (the lineage node's `dataRef`/id the P7.7 graph resolves) — a plain id the shell wires to the graph at integration; don't import the lineage component. Confirm.

## Dependencies + sequencing
- **Depends on:** **P0.9** (`EnergyEvent`), **P0.3** (`RunCaps`), **P7.2** (run-store), **P7.3** (tokens), **P7.7** (lineage `dataRef` link targets — `f290d6d`). Independent of `apps/api`. Reuses the P7.8 events-derived pattern (LESSONS §6).
- **Blocks:** P7.14 (shell mounts it).

## Estimated commit count
**1.** Feature slice (panel + pure selector). **Reflects a safety invariant (rule #8 success-only) but does NOT implement it** — the kernel is the authoritative energy ledger; the panel only DISPLAYS the success-only totals (counting `energy.spent`, excluding failures). The success-only DISPLAY is pinned by `test_failures_do_not_debit_energy`. Not a kernel safety slice → bundleable-class, but solo here (one coherent panel). Step-8: code-quality phase-boundary; security-reviewer optional (read-only, no secret/mutation).

## Lessons-logged candidates anticipated
- Likely **covered by LESSONS §6** (events-derived pure selector + read-verbatim). Possible delta: "the energy panel DISPLAYS rule-#8 success-only by counting `energy.spent` + excluding failure events — the kernel is the authoritative ledger, the UI never re-derives the debit." I author hot if it adds beyond §6.

## How to invoke
> web session oriented — `/tdd`. cwd `apps/web/`. Stage only `apps/web/...`. (Round-3 web slice 4 — continuous roll, after P7.8; reuses the LESSONS §6 events-derived pattern.)
1. **Run `/tdd energy_per_agenome_panel`.**
2. **Step 2.5** — answer the 3 questions (esp. Q1 actual-not-estimate, Q2 energy_exhausted source), send the write-up + coverage map.
3. **Step 9** — surface the contracts-seam extension (I write the row) + any delta beyond LESSONS §6.
