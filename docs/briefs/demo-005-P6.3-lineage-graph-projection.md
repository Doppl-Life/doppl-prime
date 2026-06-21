# /tdd brief — lineage_graph_projection

## Feature
The **lineage-graph projection builder** (`apps/api`): derives the storage-agnostic, frozen **`LineageGraphProjection`** (`runId`, `nodes[]`, `edges[]`, `sequenceThrough`) from the P6.2 current-state projection — nodes from the entity rows (the 6 frozen `LineageNodeType` values), edges from the `lineage_edges` rows (parent→child reproduction relationships). `sequenceThrough` carries through as the watermark; each node's `dataRef` is a **Postgres-tier pointer only** (eventId / entity id, never an external store). The builder's output **conforms to the frozen P0.13 contract** (producer-conformance), so the same projection feeds React Flow (P7.7) and the derived Neo4j export (P6.11).

## Use case + traceability
- **Task ID:** P6.3 (LineageGraphProjection with sequenceThrough)
- **Architecture sections it implements:** `ARCHITECTURE.md §10` (consumers depend on the storage-agnostic `LineageGraphProjection` — nodes/edges + `sequenceThrough` — not on physical storage; the same projection feeds React Flow + the derived Neo4j export; `dataRef` resolves within the authoritative tier), `§9` (derived/rebuildable projection; the `(runId, sequence)` watermark).
- **Related context:** key safety rules **#2** (derived/rebuildable, never authoritative) and **#7** (no provider calls — pure derivation). **Builds on P6.2** (`demo-004`, `ef43fca`): derive from the `CurrentState` rows (agenomes, candidate_ideas, critic_reviews, check_results, fitness_scores, novelty_scores, lineage_edges) — the events were already folded there; this is a pure transform `CurrentState → LineageGraphProjection` (the watermark carries through). Consumes the **frozen** `LineageGraphProjection`/`LineageNode`/`LineageEdge`/`LineageNodeType` (P0.13).

> **Drift corrections (orchestrator pre-orient).** The tracker's P6.3 file line says `packages/contracts/src/lineage-graph-projection.ts (NEW)` — but the contract **already exists, frozen**, at `packages/contracts/src/projections/lineage-graph.ts` (P0.13), with its **field-name snapshot** (`packages/contracts/test/projections/lineage-graph.test.ts` + `__schema-snapshots__/entities-lineage-field-sets.test.ts`) and a `validLineageGraphProjection` **CANONICAL_FIXTURE** (P0.14). So this slice **does NOT create the contract or its snapshot** — it IMPORTS the frozen contract and adds a **producer-conformance** test (builder output `safeParse`s against `LineageGraphProjection`). And `LineageNodeType` is the **closed 6** (`generation`/`agenome`/`candidate`/`critic`/`check`/`score`) — there is **no "winner" node type**; the selected winner is a `candidate`/`score` node carrying a selected `status?` (the frontend renders it specially), not a 7th type.

## Acceptance criteria (what "done" means)
- [ ] The builder derives a `LineageGraphProjection` from the P6.2 current-state: **nodes** for the rendered set using the **frozen closed-6 `LineageNodeType`** (generation/agenome/candidate/critic/check/score), **edges** from the `lineage_edges` rows (parent→child)
- [ ] `sequenceThrough` equals the current-state watermark it was built through (carries through from the P6.2 `WatermarkedProjection`) — the staleness/rebuild key
- [ ] Each node's `dataRef` is a **Postgres-tier pointer only** (eventId / authoritative entity id) — never an external URI/store (pinned)
- [ ] The selected winner is represented as a `candidate`/`score` node with a selected `status?` (NOT a new node type) — consistent with the closed-6 enum
- [ ] **Producer-conformance:** the builder output `safeParse`s against the frozen `LineageGraphProjection` (and structurally matches the `validLineageGraphProjection` CANONICAL_FIXTURE shape) — the §2.5-seam producer check (consumers = React Flow P7.7 + Neo4j export P6.11)
- [ ] Pure derivation: no `ModelGateway`/provider/embedding import (rule #7); deterministic for the same current-state (byte-stable via the L27 `canonicalize` if materialized)
- [ ] Empty/partial runs produce a valid (possibly empty `nodes`/`edges`) projection, not an error
- [ ] Unit tests (in-memory current-state fixtures) **and** an integration test (testcontainers: append events → buildCurrentState → lineage projection) pass; **both counts reported**; `/preflight` clean

## Wiring / entry point (Step 7.5)
**none — wiring lands in P6.7.** The lineage projection is served by **`GET /runs/:id/lineage`** (P6.7 read endpoint, fresh-when-stale via the watermark) and consumed by **React Flow (P7.7)** + the **derived Neo4j export (P6.11)**. Exercised now against fixtures + the real `append`/`buildCurrentState` on testcontainers. So: *first consumer — P6.7 `/lineage` endpoint → P7.7 React Flow + P6.11 export.*

## Files expected to touch
**New:**
- `apps/api/src/projections/lineage-graph.ts` — the builder: `buildLineageGraph(currentState) → LineageGraphProjection` (nodes from entity rows, edges from lineage_edges, sequenceThrough carried through; dataRef = Postgres-tier pointer)
- `apps/api/test/unit/projections/lineage-graph.test.ts` — node/edge derivation + dataRef + conformance unit tests
- `apps/api/test/integration/projections/lineage-graph.test.ts` — testcontainers: append → buildCurrentState → lineage projection

**Modified:**
- `apps/api/src/projections/index.ts` — barrel export the lineage builder

**Do NOT touch:** `packages/contracts/**` (the LineageGraphProjection contract + its snapshot are frozen, P0.13/P0.14 — import only).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

**Unit — `apps/api/test/unit/projections/lineage-graph.test.ts`** (`spec(§10)`):
1. **`test_derives_nodes_for_closed_six_types`** — a current-state fixture (generation/agenome/candidate/critic/check/score entities) yields nodes of the correct frozen `LineageNodeType`. Why: §10 node set. *(Positive guard.)*
2. **`test_derives_edges_from_lineage_edges`** — `lineage_edges` rows (parent→child) become `LineageEdge`s (source/target/type). Why: §10 parent/lineage edges.
3. **`test_sequence_through_carries_watermark`** — `result.sequenceThrough` == the current-state watermark. Why: §9/§10 staleness key.
4. **`test_dataref_is_postgres_tier_pointer`** — every node `dataRef` is a non-empty authoritative pointer (eventId/entity id), never an external URI. Why: §10 dataRef within the authoritative tier.
5. **`test_winner_is_candidate_node_with_selected_status`** — the selected winner is a candidate/score node with a selected `status?`, NOT a new node type (closed-6 holds). Why: §10 / closed `LineageNodeType`.
6. **`test_output_conforms_to_frozen_contract`** — `LineageGraphProjection.safeParse(output).success` is true; the shape matches the `validLineageGraphProjection` CANONICAL_FIXTURE structure. Why: §2.5-seam producer-conformance (P0.13).
7. **`test_empty_run_yields_valid_empty_projection`** — an empty/partial current-state yields a valid projection (empty nodes/edges), not an error. Why: §10 robustness.
8. **`test_builder_imports_no_provider`** — structural: the module imports no `ModelGateway`/provider/embedding. Why: rule #7 (positive-guarded).

**Integration — `apps/api/test/integration/projections/lineage-graph.test.ts`** (testcontainers, real PG):
9. **`test_lineage_over_real_appended_log`** — append a multi-entity + reproduction event sequence via the real writer → `buildCurrentState` → `buildLineageGraph`; assert nodes/edges/sequenceThrough + contract-conformance. Why: §10 over the real authoritative log.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none** — the `LineageGraphProjection` contract is frozen (P0.13); this slice is a **producer** of it, defining no new model.
- **§2.5-seam touched?** **Yes — as a PRODUCER** of the frozen `LineageGraphProjection` (projection→frontend·neo4j). No contract CHANGE → no new snapshot needed (P0.13's field-name snapshot stands). The producer-conformance test (RED #6) is the §2.5 check that the builder's output matches the frozen shape. No `apps/api/CLAUDE.md` cross-doc row needed (no new/changed contract).
- **Orchestrator doc rows to write hot (Step 9):** possibly a **LESSONS** entry (deriving a frozen Appendix-A projection as a pure transform of current-state + producer-conformance). I author hot.

## Things to flag at Step 2.5
1. **Derive-from-current-state vs fold-events-directly.** My default vote: **derive from the P6.2 `CurrentState`** (a pure transform: entity rows→nodes, lineage_edges→edges, watermark carried through) — DRY (events already folded in P6.2), and `lineage_edges` already exist there. Flag if you'd rather give P6.3 its own lineage reducer via `buildProjection` (independent re-fold).
2. **`dataRef` content.** My default vote: the node's `dataRef` = the entity's authoritative Postgres pointer (its source eventId or entity id) — an opaque within-tier ref (EvidenceRef-style, §10). Confirm the exact pointer (eventId vs entity id).
3. **Winner representation.** My default vote: the selected winner = a `candidate` (and/or `score`) node carrying a selected `status?` value — NOT a 7th node type (the frozen `LineageNodeType` is closed-6). The frontend (P7.7) renders the winner specially off that status. Confirm.
4. **critic/check node granularity.** My default vote: one node per critic_review and per check_result (type `critic`/`check`), edged to their candidate — matching the §10 rendered set. Flag if you'd prefer aggregating critics/checks per candidate.
5. **Node `metrics?` population.** My default vote: populate `metrics?` from the relevant scores (fitness total / novelty score) on candidate/score nodes for the dashboard, keeping it an open `record<string,number>`; keep it minimal (the panels can read more via the candidate projection). Confirm scope.

## Dependencies + sequencing
- **Depends on:** **P6.2** (`CurrentState` — `ef43fca`), P6.1 (`buildProjection`/watermark, indirectly), P0.13 (frozen `LineageGraphProjection`). **No live P3/P5 events needed** (fixtures via the real writer).
- **Blocks:** P6.7 (`GET /runs/:id/lineage`), P6.11 (Neo4j export), P7.7 (React Flow lineage tree).

## Estimated commit count
**1.** Feature slice (lineage projection producer). Kept **atomic** (not bundled — it's a distinct §2.5-seam producer with its own conformance test; P6.4 replay is standalone). **Not a safety-invariant slice** (read-side derived projection; rule-#7 no-provider is structural, pinned by RED #8). **Step-8 reviewers:** security-reviewer policy=invariant → not mandatory; code-quality=phase-boundary.

## Lessons-logged candidates anticipated
- **Convention candidate** — "derive a frozen Appendix-A projection (LineageGraphProjection) as a PURE transform of the current-state projection (not a re-fold): nodes from entity rows using the closed node-type enum, edges from lineage_edges, watermark carried through; pin producer-conformance (output safeParses the frozen contract); dataRef is an authoritative within-tier pointer only; the 'winner' is a status on a node, not a new type."
- **Architecture-doc note candidate** — none anticipated (consumes §10; the contract is frozen).

## How to invoke
> The demo-observability (apps/api) implementer session is oriented — skip `/session-start`; jump to `/tdd`. cwd `apps/api/`.

1. **Read this brief end-to-end** — note the drift corrections (contract is FROZEN at `projections/lineage-graph.ts`; closed-6 node types; producer-conformance not a new snapshot) and that it **derives from P6.2's current-state** (pure transform).
2. **Run `/tdd lineage_graph_projection`.**
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 2.5** — answer the 5 design questions (esp. Q1 derive-from-current-state + Q3 winner-as-status), send the write-up + per-acceptance-bullet coverage map.
5. **Step 9** — surface the LESSONS candidate.
