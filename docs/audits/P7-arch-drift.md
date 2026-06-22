# P7 arch-drift audit — §12 (Frontend dashboard) · §10 (Lineage graph)

**Phase:** 7 (Frontend dashboard) · **Track:** demo · **Run:** round-4 demo→cody integration `/phase-exit P7` (deferred round-3 re-entry).
**Verdict:** **CLEAR (0 DRIFT)** — 2 STALE-DOC notes + 1 AMBIGUOUS (dispositioned below).
**Method:** read ONLY ARCHITECTURE.md §12 + §10; diffed each stated behavior/model against `apps/web/src/**`. Green schema-snapshot tests counted as verified-by-test.

> Note: the `arch-drift-auditor` subagent returned its findings inline rather than writing this file; the orchestrator transcribed them here for the audit trail.

## §10 — Lineage graph & Neo4j spike — VERIFIED
- LineageGraphProjection storage-agnostic (4-field `z.strictObject`, no Neo4j/physical-store field) — `packages/contracts/src/projections/lineage-graph.ts`.
- `LineageNodeType` closed-6, pinned by green snapshot (`entities-lineage-field-sets.test.ts`).
- React Flow maps 6 types → 5 rendered; selected-winner = candidate + `status:'selected'` (NOT a 7th type) — `lineageToFlow.ts`, test `test_lineageToFlow_maps_six_types_to_five`.
- `dataRef` = within-tier pointer; `evidenceRef.tsx` renders `data-*` only, test asserts no `<a>`/`[href]`.
- Stale watermark never replaces newer (`pickFreshestProjection`).

## §12 — Frontend dashboard — VERIFIED
- Status = shape + label + icon + color, never color-alone (`StatusBadge.tsx`, `test_mapping_never_color_alone`).
- Status-map exhaustive over the frozen 9-member GenerationStatus + 9-member CandidateStatus (sv5); `test_drift_reconciliation` iterates both enums.
- `generation.degraded` → `{◓, var(--warning), non-pulse}`; `candidate.repairing` → `{↻, var(--status-review), pulse}` — match the §12 encoding rules; colorTokens are `var(--…)` (no raw hex).
- UI read-only over projections; only writes = the 2 idempotent commands (`startRun`/`stopRun`); SSE non-authoritative, resync by `sequence` from `lastEventId`.
- All §12 panels instantiated in `Dashboard.tsx` (run-config, mode indicator, lineage, fitness/generation charts, energy, candidate inspector, critic gauntlet, subtype checks, final-idea, stop control).

## STALE-DOC notes (code is right; doc lags) — dispositioned
1. **§12 mermaid `RP[replay timeline]` node** has no prose-spec / plan line-item; what was built is the ModeBanner live/replay indicator + `getReplay()` event-fold (the prose §12 requirement). The diagram node is ahead of the prose. → **Arch-doc note** (align/remove the mermaid node); low priority, pre-existing, not introduced by this round.
2. **"sv5 reconcile" labeling.** `generation.degraded` / `candidate.repairing` are schemaVersion-4 enum members (P0.15-amend / P0.5-amend); the web status-map was reconciled to the full sv5 surface at the sv5 integration. Code/tests correctly annotate them as sv4 members. → Informational; no code drift (round-framing label, not a code claim).

## AMBIGUOUS — dispositioned by orchestrator
- **§12 in-flight per-category summary** ("how many agenomes/critics/checks/judge/fusions are working right now, from GET /runs/:id/health"). The web renders only `candidatesInFlight`; the **backend** `run-health.ts` DOES compute `operationsInFlight.byType` per category (incl. `judge` after the round-4 sv5 reconcile). The web-local `RunHealth` schema is unfrozen + the full-breakdown render is the **RunHealth promotion** carry-forward (demo-orch-003, already surfaced to the user). → **Existing approved deferment re-confirmed** (NOT a new deferment, NOT drift); stays in carry-forward for the RunHealth-promotion slice. Backend data is now ready (byType incl. judge), so the remaining work is the web render + the schema promotion at the demo→cody integration.

**Outcome:** §12/§10 code matches the spec; the only gaps are a pre-existing diagram artifact + a tracked deferment. **P7 arch-drift row: PASS / CLEAR.**
