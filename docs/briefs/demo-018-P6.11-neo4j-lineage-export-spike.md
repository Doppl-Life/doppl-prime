# /tdd brief — neo4j_lineage_export_spike

## Feature
The **Neo4j lineage-export spike** (timeboxed throwaway, week-2 — the React-Flow path P7.7 has landed `f290d6d`). Two artifacts: (1) a **TDD'd `lineage-export.ts`** — a **pure, derived-only, read-only** transform of the P6.3 `LineageGraphProjection` into a Neo4j-importable / dashboard-export shape (carries the `sequenceThrough` watermark; **never writes back** to `run_events` or any projection — rule #2); and (2) a **throwaway `spikes/neo4j/lineage-queries.ipynb`** notebook that documents the **four Cypher query shapes** over the export (ancestors-of-winner · parent-contribution · critic-kill patterns · lineage distance/diversity). The export is the real deliverable; the notebook is **exploratory + throwaway** — **never a runtime dependency, must never block the demo** (the runtime path works with the notebook absent).

## Use case + traceability
- **Task ID:** P6.11 (Neo4j spike — timeboxed throwaway notebook over a derived lineage export)
- **Architecture sections it implements:** `ARCHITECTURE.md §10` (lineage graph; the same projection feeds React Flow AND the derived Neo4j export — consumers depend on the projection shape, not physical storage), `§9` (derived + read-only; never authoritative).
- **Related context:** key safety rule #2 (the export is DERIVED + read-only — never writes `run_events`/projections; a projection is never authoritative). **Builds on P6.3** (`buildLineageGraph` → `LineageGraphProjection`, the export's INPUT — landed). Gate satisfied: "runs only after the React-Flow demo path works" → P7.7 `f290d6d`. This is the LESSONS §30 secondary-projection pattern (a PURE TRANSFORM of an existing projection — carry the watermark, never re-fold). The **notebook is an exploratory spike** (per the brief template: mark exploratory, throw away — NOT `/tdd`'d).

## Acceptance criteria (what "done" means)
- [ ] `lineageToExport(projection)` is a **pure transform** of the `LineageGraphProjection` → a Neo4j-importable / dashboard-export shape (a node/edge list with labels + the typed edges), carrying the **`sequenceThrough` watermark** through (never re-folding the event log — LESSONS §30)
- [ ] The export is **derived-only + read-only**: the module imports nothing from the event-store writer / `run_events` / drizzle, and the spike **never writes back** into `run_events` or any projection (rule #2 — structural import-ban pin)
- [ ] The export shape is **storage-agnostic** (no Neo4j-specific runtime coupling leaks into `apps/api` — it emits a neutral structure the notebook imports; §10)
- [ ] The export carries enough to express the **four query shapes** (ancestors-of-winner, parent-contribution, critic-kill, lineage distance/diversity) — i.e. genealogy edges + node types/status/metrics survive the transform
- [ ] **Throwaway notebook** `spikes/neo4j/lineage-queries.ipynb` documents the four Cypher query shapes over the export structure (exploratory — the demo path does NOT depend on it; live Neo4j execution is out-of-scope/optional since the spike must never block the demo)
- [ ] Unit tests pass for `lineage-export.ts` (pure transform; the notebook is NOT unit-tested — exploratory); **count reported**; `/preflight` clean (the `.ipynb` is excluded from lint/type/test)

## Wiring / entry point (Step 7.5)
**none — a throwaway spike, not a runtime path.** `lineage-export.ts` is a derived export consumed only by the throwaway notebook (+ optionally a future dashboard "export lineage" action). It is **never** wired into the runtime/demo loop (the architecture's hard constraint: the spike is never a runtime dependency). So: *no production entry point — exercised by its unit test + the exploratory notebook; the runtime works with the notebook absent.*

## Files expected to touch
**New:**
- `apps/api/src/projections/lineage-export.ts` — the pure `lineageToExport(projection)` derived export (watermark carried; read-only; storage-agnostic)
- `apps/api/test/unit/projections/lineage-export.test.ts`
- `spikes/neo4j/lineage-queries.ipynb` — the throwaway notebook documenting the four Cypher query shapes (exploratory)

**Modified:** none expected (consumes the P6.3 `LineageGraphProjection` read-only).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN. **Confirm `spikes/**` + `**/*.ipynb` are excluded from eslint/tsc/vitest** (so the throwaway notebook doesn't trip `/preflight`); if not, add the ignore (flag at Step 9).

## RED test outline (Step 2)
**(pure transform over the `multiNodeLineage` fixture; `spec(§10)`/`spec(§9)`):**
1. **`test_export_is_pure_transform_carries_watermark`** — `lineageToExport(projection)` yields a node/edge export carrying the same `sequenceThrough` (no re-fold; transform of the projection only). *(Positive guard.)* Why: §10 / LESSONS §30.
2. **`test_export_preserves_query_shape_data`** — the export retains genealogy edges + node types/status/metrics so the four query shapes are expressible (e.g. ancestors-of-winner traverses parent edges to the `selected` candidate). Why: §10.
3. **`test_export_is_read_only_no_append_import`** — structural: `lineage-export.ts` imports nothing from the event-store writer / `run_events` / drizzle (never writes back). Why: rule #2.
4. **`test_export_storage_agnostic`** — the export is a neutral node/edge structure (no Neo4j-driver/physical-store coupling in `apps/api`). Why: §10 storage-agnostic.

## Cross-doc invariant impact
- **Model field changes:** none (consumes the frozen `LineageGraphProjection` read-only; the export shape is `apps/api`-internal, not an Appendix-A model). **§2.5-seam:** none.
- **Orchestrator doc rows (Step 9):** possibly a small LESSONS note (derived throwaway export = pure transform, read-only, never wired). I author hot if it recurs; likely just reinforces LESSONS §30.

## Things to flag at Step 2.5
1. **Export shape.** My default vote: a neutral `{nodes:[{id,labels,props}], edges:[{id,source,target,type,props}], sequenceThrough}` JSON the notebook loads + `LOAD`/`UNWIND`s into Neo4j — storage-agnostic, no Neo4j driver in `apps/api`. Confirm (vs a Cypher-string emitter).
2. **Notebook executability.** My default vote: the `.ipynb` **documents** the four Cypher query shapes over the export structure (markdown + Cypher cells), validated against the export shape — **live Neo4j execution is out-of-scope** (no Neo4j instance in the build env; the spike must never block the demo + the runtime works without it). Confirm doc-only vs requiring a live run.
3. **`spikes/` + `.ipynb` preflight exclusion.** My default vote: confirm `spikes/**` + `**/*.ipynb` are outside the eslint/tsc/vitest globs (the throwaway must not trip `/preflight`); add the ignore if missing (flag at Step 9). Confirm.

## Dependencies + sequencing
- **Depends on:** **P6.3** (`buildLineageGraph`/`LineageGraphProjection` — landed) + the **P7.7 React-Flow path** (`f290d6d` — the gate "only after the React-Flow demo path works" is satisfied). Derived-only; no live runtime needed.
- **Blocks:** nothing (throwaway spike — never a runtime dependency). Closes Phase 6.

## Estimated commit count
**1.** The `lineage-export.ts` (TDD'd pure transform) + the throwaway notebook in one commit. Not safety-invariant (derived + read-only; rule #2 holds — never writes back, structural import-ban pin). Step-8: code-quality phase-boundary; security-reviewer optional (read-only derived export, no secret, no mutation). **Note:** this is the last Phase-6 slice → after it lands, `/phase-exit P6` is in scope (orchestrator-dispatched).

## Lessons-logged candidates anticipated
- **Convention candidate (maybe)** — "a derived export for an external tool (Neo4j) is a PURE, read-only TRANSFORM of an existing projection (LESSONS §30 pattern — carry the watermark, never re-fold, structural no-append-import), storage-agnostic (no external-driver coupling in `apps/api`); the spike notebook is throwaway + never a runtime dependency (the demo path works with it absent)." Likely just reinforces §30 — I author only if it adds something.
- **Future TODO — operational** — live Neo4j execution + a dashboard "export lineage" action are hosted/post-demo (the export function is ready; wiring is deferred).

## How to invoke
> obs (apps/api) session oriented — `/tdd`. cwd `apps/api/`. Stage only `apps/api/...` + `spikes/neo4j/...` (NEVER apps/web). (Round-3 obs slice 3 — the gated Neo4j spike, now unblocked by P7.7; closes Phase 6.)
1. **Run `/tdd neo4j_lineage_export_spike`.**
2. **Step 2.5** — answer the 3 questions (esp. Q2 doc-only notebook, Q3 preflight exclusion), send the write-up + coverage map.
3. **Step 9** — confirm the `spikes/` preflight exclusion + surface any LESSONS note. After this lands, I dispatch `/phase-exit P6`.
