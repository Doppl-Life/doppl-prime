# /tdd brief — run_generation_culling_entities_and_lineage_projection

## Feature
Freeze four shared Appendix-A contracts as a bundle: the run-lifecycle **entities** `Run`, `Generation`, `CullingEvent` (the persisted shape behind the `lineage.culled` event), and the storage-agnostic **`LineageGraphProjection`**. Each is a §2.5-seam shared contract (schema-snapshot required). **NOT a safety slice** — these are plain entity/projection shapes; the rule-#6 `FinalJudgeRubric` (the other half of P0.15) is **split out as its own SOLO slice** and is NOT in this bundle. Bundle is safe per the standing directive (related entity/projection schemas, same package, none touches a safety invariant).

## Use case + traceability
- **Task ID:** P0.15 (Run / Generation / CullingEvent only — `FinalJudgeRubric` deferred to its solo slice) + P0.13 (LineageGraphProjection)
- **Architecture sections it implements:** `ARCHITECTURE.md §3` (core entities — Run/Generation lifecycle; CullingEvent), §8 (CullingEvent is the cull decision's persisted shape; selection decisions explainable from events), §9 (projection watermark — `sequenceThrough` records the `(runId, sequence)` it was built through, discarded/rebuilt when newer events exist), §10 (LineageGraphProjection: storage-agnostic nodes/edges + `sequenceThrough`; React Flow custom node types). Appendix A rows: `Run`/`Generation` (§3), `CullingEvent` (§3/§8), `LineageGraphProjection` (§10).
- **Related context:** P0.15 bullet says the shapes are **reconciled at the tasks-gen gate** — freeze the Zod shapes to MATCH the Appendix-A rows (now canonical). `Run.caps` imports the frozen `RunCaps` (P0.3 — lesson §5, never redefine); `Run.enabledSubtypes[]` reuses the P0.3 `Subtype` enum. `Run.seed` is the **run/problem-scenario seed** — `z.string().min(1)`, binding to `RunConfig.seed` by name (lesson §5). It is **DISTINCT from the RNG seed** (`RunConfig.rngSeed`, int, persisted in `run.configured` for replay rule #7); DOMAIN_MODEL.md defines `Run.seed` as the seed prompt/problem-set. _(Corrected post-Step-2.5: an earlier draft of this line wrongly called `Run.seed` the RNG seed — the implementer caught the conflation against `RunConfig`.)_ `Generation`/`Run` mirror the kernel state machines (§5) — counts/ranges (`enabledSubtypes ≥ 1`, `index` monotonicity) are kernel rules (lesson §6), NOT schema constraints. The `LineageGraphProjection` node `type` union corresponds to the frozen entities (candidate/critic/check/score etc.). Some sub-shapes (`CullingEvent.scoreSnapshot`, node `dataRef`/`metrics`) are under-specified in Appendix A → Step-2.5 questions; GREEN settles them → I update Appendix A.

## Acceptance criteria (what "done" means)
- [ ] **`Run`** is a strict object carrying EXACTLY: `id`, `seed`, `enabledSubtypes[]`, `caps`, `status`, `startedAt`, `completedAt?` — unknown rejected; `completedAt?` omittable; others required. `caps` is the frozen `RunCaps` (imported, not redefined); `enabledSubtypes[]` an array of the P0.3 `Subtype` (count ≥1 is a kernel rule, not enforced here — lesson §6); `seed` per Q1; `startedAt`/`completedAt?` ISO-8601 UTC (`z.iso.datetime()`).
- [ ] **`RunStatus`** is the CLOSED 8-member union `configured | running | completing | completed | stopping | stopped | failed | cancelled` (Appendix A); any other value rejected.
- [ ] **`Generation`** is a strict object carrying EXACTLY: `id`, `runId`, `index`, `status`, `startedAt`, `completedAt?` — `index` a non-negative int; `completedAt?` omittable.
- [ ] **`GenerationStatus`** is the CLOSED 8-member union `pending | running | verifying | scoring | reproducing | completed | failed | skipped` (Appendix A); any other rejected.
- [ ] **`CullingEvent`** is a strict object carrying EXACTLY: `id`, `runId`, `generationId`, `targetIds[]`, `reason`, `scoreSnapshot` — `targetIds[]` an array of `.min(1)` ids; `reason` a non-empty string; `scoreSnapshot` per Q2. This is the persisted shape behind the `lineage.culled` event type (§8).
- [ ] **`LineageGraphProjection`** is a strict object carrying EXACTLY: `runId`, `nodes[]`, `edges[]`, `sequenceThrough` (§10). `sequenceThrough` a non-negative int = the per-run sequence watermark the projection was built through (§9 — rebuildable/discardable when newer events exist).
- [ ] **`LineageNode`** is a strict object carrying EXACTLY: `id`, `type`, `label`, `status?`, `metrics?`, `dataRef` — `type` is the CLOSED 6-member `LineageNodeType` union `generation | agenome | candidate | critic | check | score` (§10); `metrics?`/`status?` per Q3; `dataRef` per Q3.
- [ ] **`LineageEdge`** is a strict object carrying EXACTLY: `id`, `source`, `target`, `type`, `label?` — `source`/`target`/`type` non-empty strings; `label?` omittable.
- [ ] The projection is **storage-agnostic** — it carries no Neo4j/physical-storage field; consumers depend on this shape only (§10).
- [ ] **Schema-snapshot tests (§2.5 gate, per model, tagged `spec(§3)`/`spec(§8)`/`spec(§10)`):** `Run` field-set + `RunStatus`(8), `Generation` field-set + `GenerationStatus`(8), `CullingEvent` field-set, `LineageGraphProjection` field-set + `LineageNode` field-set + `LineageNodeType`(6) + `LineageEdge` field-set — each == frozen snapshot.
- [ ] `z.infer` types + all enums re-exported from the `@doppl/contracts` barrel; all unit tests pass; `/preflight` clean (package-pinned prettier — lesson §14).

## Wiring / entry point (Step 7.5)
Entry point = the `@doppl/contracts` barrel exports the four schemas + their enums (`Run`/`RunStatus`, `Generation`/`GenerationStatus`, `CullingEvent`, `LineageGraphProjection`/`LineageNode`/`LineageNodeType`/`LineageEdge`) + `z.infer` types. Consumed downstream by the **kernel/event-store track (P1/P3 — Run/Generation lifecycle, run.configured/generation.* events)**, the **selection track (P5 — CullingEvent behind lineage.culled)**, and the **projection/frontend tracks (P6/P7 — LineageGraphProjection → React Flow)**. `none — runtime wiring (kernel state machines + the projection builder) lands in P1/P3/P5/P6 by design`. Reachability = barrel-exported + schema-snapshot-covered.

## Files expected to touch
**New:**
- `packages/contracts/src/domain/run.ts` — `Run` + `RunStatus`.
- `packages/contracts/src/domain/generation.ts` — `Generation` + `GenerationStatus`.
- `packages/contracts/src/domain/culling-event.ts` — `CullingEvent`.
- `packages/contracts/src/projections/lineage-graph.ts` — `LineageGraphProjection` + `LineageNode` + `LineageNodeType` + `LineageEdge`.
- `packages/contracts/test/domain/{run,generation,culling-event}.test.ts`
- `packages/contracts/test/projections/lineage-graph.test.ts`
- `packages/contracts/test/__schema-snapshots__/entities-lineage-field-sets.test.ts`

**Modified:**
- `packages/contracts/src/index.ts` — re-export the above.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Per model — positive-guard-first on each (lesson §10):

1. **`run_accepts_valid_and_strict`** *(spec §3)* — full `Run` round-trips (with + without `completedAt`); unknown rejected; each required mandatory; `caps` validates as `RunCaps`; `enabledSubtypes` accepts `Subtype` members + rejects a non-member.
2. **`run_status_closed_8_union`** *(spec §3)* — the 8 members parse; any other rejected.
3. **`generation_accepts_valid_and_strict`** *(spec §3)* — round-trips; `index` non-negative int (negative/float rejected per Q4); unknown rejected.
4. **`generation_status_closed_8_union`** *(spec §3)* — the 8 members parse; other rejected.
5. **`culling_event_accepts_valid_and_strict`** *(spec §8)* — round-trips; `targetIds[]` of `.min(1)` ids (empty-string element rejected); `reason` non-empty; `scoreSnapshot` per Q2 accepts valid + rejects malformed.
6. **`lineage_projection_accepts_valid_and_strict`** *(spec §10)* — full projection round-trips; unknown rejected; `sequenceThrough` non-negative int.
7. **`lineage_node_type_closed_6_union`** *(spec §10)* — `generation`/`agenome`/`candidate`/`critic`/`check`/`score` parse; other rejected.
8. **`lineage_node_and_edge_strict`** *(spec §10)* — `LineageNode` (with + without `status?`/`metrics?`) + `LineageEdge` (with + without `label?`) round-trip; unknown rejected; `dataRef`/`metrics` per Q3.
9. **`lineage_projection_storage_agnostic`** *(spec §10)* — a projection carrying a `neo4j`/physical-storage field is rejected (strict) — consumers depend on the abstract shape only.
10. **`barrel_exports_entities_lineage`** *(spec §2.5)* — all four schemas + their enums re-exported.
11. **`schema_snapshot_entities_lineage`** *(spec §3/§8/§10/§2.5)* — every field-set + every closed union (`RunStatus`8, `GenerationStatus`8, `LineageNodeType`6) == frozen snapshots.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NEW — `Run`/`RunStatus`, `Generation`/`GenerationStatus`, `CullingEvent`, `LineageGraphProjection`/`LineageNode`/`LineageNodeType`/`LineageEdge`.
- **§2.5-seam models touched?** **YES — all four.** RED outline MUST include the per-model schema-snapshots (#11).
- **Orchestrator doc rows to write hot:** the Appendix-A rows already exist (`Run`/`Generation`, `CullingEvent`, `LineageGraphProjection`) — at Step 9 I **fill the under-specified sub-shapes** GREEN settles (`CullingEvent.scoreSnapshot` (Q2), `LineageNode.dataRef`/`metrics` (Q3)) into Appendix A + add the four cross-doc rows to `apps/api/CLAUDE.md`. Confirm the closed-union memberships (RunStatus 8 / GenerationStatus 8 / LineageNodeType 6) match Appendix A exactly — any divergence is a Step-9 flag.

## Things to flag at Step 2.5
1. **`Run.seed` type.** RULED (Step 2.5): `z.string().min(1)` — the run/problem-scenario seed, binding to `RunConfig.seed` by name (lesson §5); DISTINCT from the RNG seed (`RunConfig.rngSeed`, int, used for replay rule #7). Evidence: `RunConfig.seed`'s doc-comment ("the run/problem-scenario seed, distinct from the RNG seed") + DOMAIN_MODEL.md (Run.seed = seed prompt/problem-set).
2. **`CullingEvent.scoreSnapshot` shape (Appendix A under-specifies).** My default vote: an OPEN structured snapshot of the scores that justified the cull — `z.record(z.string(), z.number())` (candidateId/signal → score), inspectable for explainability (§8), not `z.unknown()`. Flag a richer shape (e.g. an array of `{candidateId, total}`) if selection needs per-target detail; whatever GREEN settles I add to Appendix A. The pin is REQUIRED + inspectable (lesson §6/§13 posture).
3. **`LineageNode.dataRef` + `metrics?` shapes (Appendix A under-specifies).** My default vote: `dataRef = z.string().min(1)` (an opaque pointer to the authoritative event/entity — a node references its data by id, resolution is the projection-builder/resolver's job, §9, like `EvidenceRef`); `metrics? = z.record(z.string(), z.number())` (open name→number, omittable); `status? = z.string().min(1)` (open — node status varies by node type, NOT a single closed union). Flag if `dataRef` should be an `EvidenceRef` (richer) or if `status?` should reuse a per-type status union.
4. **`Generation.index` typing.** My default vote: `z.int().nonnegative()` (generation ordinal ≥ 0; monotonicity is a kernel rule, §6). Flag if 1-based.
5. **Closed-union definitions defined once (lesson §5).** My default vote: `RunStatus`, `GenerationStatus`, `LineageNodeType` are each their own exported `z.enum` in the model's file (single-source); `enabledSubtypes` reuses the P0.3 `Subtype` (imported, never redefined). Confirm.
6. **Bundle integrity / commit count.** My default vote: **1 — BUNDLE** (4 related entity/projection schemas, same package, no safety invariant; `FinalJudgeRubric` split out solo). Each model keeps its own red→green + snapshot and stays a coherent Step-2.5 unit. Commit: `feat(contracts): Run/Generation/CullingEvent entities + LineageGraphProjection (P0.15 partial, P0.13)`.

## Dependencies + sequencing
- **Depends on:** P0.3 (`RunCaps` + `Subtype` — landed), P0.8 (scoring shapes that `CullingEvent.scoreSnapshot` snapshots — landed). P0.13 LineageGraph is structurally independent but bundled here (its node types correspond to these entities).
- **Blocks:** P0.14 (contract-test surface needs all P0 models), the kernel (P1/P3), selection (P5), projection/frontend (P6/P7) tracks. **`FinalJudgeRubric` (P0.15 remainder) is the NEXT slice after this — SOLO** (held-out judge immutable-to-agents, rule #6).

## Estimated commit count
**1** — BUNDLE. Four related entity/projection schemas in one cohesive package commit (like the P0.11+P0.12 gateway bundle). Bundle-safe: none touches a key safety rule (#1–#9); the rule-#6 `FinalJudgeRubric` is explicitly carved out to its own SOLO slice. Each model retains its own red→green + schema-snapshot.

## Step-8 reviewer policy
**security-reviewer: phase-boundary** (NOT invariant — no safety rule touched by these entity/projection shapes; the `FinalJudgeRubric` solo slice gets the invariant review). `code-quality-reviewer`: phase-boundary.

## Lessons-logged candidates anticipated
- **Architecture-doc note candidate** — settle `CullingEvent.scoreSnapshot` (Q2) + `LineageNode.dataRef`/`metrics`/`status?` (Q3) shapes in Appendix A once GREEN fixes them.
- **Convention candidate** — likely none new (reuses strict-closed-contract §1, shared-union-once §5, shape-not-kernel-rules §6, authoritative-ref-by-id §13 patterns).

## How to invoke
1. **Read this brief end-to-end.** Q2 (scoreSnapshot) + Q3 (dataRef/metrics) are the load-bearing under-specified shapes; Q1 (seed) + Q5 (unions-once) are the reuse pins.
2. **Run `/tdd run_generation_culling_entities_and_lineage_projection`.**
3. **Step 0/1** — confirm restatement + file list; confirm `RunCaps`/`Subtype` are IMPORTED (not redefined) and `FinalJudgeRubric` is NOT in scope (its own solo slice).
4. **Step 2.5** — send the test-design write-up (per-test `Asserts` + per-acceptance-bullet coverage map) + answers to the questions. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 9** — categorized flags + ship-ask; flag the GREEN-settled sub-shapes so I fill Appendix A.
