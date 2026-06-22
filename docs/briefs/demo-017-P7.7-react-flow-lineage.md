# /tdd brief — react_flow_lineage_tree

## Feature
The **React Flow lineage tree** — the §12 dashboard centerpiece. Renders the storage-agnostic **`LineageGraphProjection`** (P0.13: nodes{id,type,label,status?,metrics?,dataRef} + edges{id,source,target,type,label?} + sequenceThrough) as a React Flow graph with **five custom node types** (agenome · candidate · critic/check · score · selected-winner), each using the shared **accessible status primitive** (shape+label+icon+color, P7.3). Node positions come from a **deterministic layout helper** (Dagre LR generational tiers — the same projection lays out identically each render) when the projection carries no coordinates. The graph **updates incrementally** as `sequenceThrough` advances; each node's **`dataRef`** is the link target later panels (inspector/evidence/final-idea) consume. It **derives a per-node working / in-flight sub-state** when an operation-start marker is seen without its paired completion and clears it on the completion event (the derivation **deferred from P7.2**, LESSONS §2), surfacing a **live activity feed** (start→finish) so the audience sees what each agenome/critic/check/judge/fusion is doing — **replay reproduces the same liveness** (§4/§12). The **deterministic core is TDD'd** (projection→flow mapping · layout determinism · in-flight derivation · dangling-edge drop); the **visuals are PORTED** from the prototype's `ui_kits/organism-view` (design reference — its SVG/Dagre-LR recreation of the canonical React-Flow graph: generational tiers L→R, fusion braids, gold ♔ winner).

## Use case + traceability
- **Task ID:** P7.7 (React Flow lineage tree with five custom node types + layout helper)
- **Architecture sections it implements:** `ARCHITECTURE.md §10` (storage-agnostic `LineageGraphProjection`; consumers depend on the projection shape, not physical storage), `§12` (the lineage panel; five custom node types; accessible/projector-legible; the live in-flight window), `§4` (operation-start markers ↔ completions pairing for the in-flight sub-state; sequence sole ordering → replay reproduces liveness).
- **Related context:** **Builds on P7.1** (`runClient.getLineage` → `LineageGraphProjection`, Zod-validated) + **P7.2** (the run-store feeds the event stream; the in-flight derivation was **explicitly deferred to this slice**, LESSONS §2) + **P7.3** (the `StatusBadge`/`status-map` accessible primitive). Consumes the frozen `LineageGraphProjection` (P0.13) + the closed 6-member `LineageNodeType` (generation/agenome/candidate/critic/check/score) read-only. The producer (P6.3, LESSONS §30) already drops dangling edges + encodes winner = candidate status `'selected'`; the renderer mirrors that defensively. **Design-touching** — port the prototype's `organism-view` visual vocabulary (NOT a `.jsx` import — TS-strict port, LESSONS §3). Unit-first for the deterministic core; the full render is covered by the P7.15 Playwright smoke.

## Acceptance criteria (what "done" means)
- [ ] A pure **`lineageToFlow(projection)`** maps the `LineageGraphProjection` → React Flow `{nodes, edges}` **without assuming any physical store** (§10): the closed 6 `LineageNodeType` render as the **five custom node types** — critic+check collapse to one **critic/check** type; **selected-winner** = a `candidate` node whose `status==='selected'` (LESSONS §30); `generation` is the tier backbone. Each node carries the accessible status primitive (shape+label+icon+color, P7.3) and its `dataRef` as the link target.
- [ ] A node's **`dataRef`** is preserved as the React Flow node's link target (the value inspector/evidence/final-idea panels consume); an **edge with a missing endpoint is DROPPED** (React Flow breaks on a dangling edge — defensive mirror of LESSONS §30).
- [ ] A **deterministic layout helper** (`layout(nodes, edges)`, Dagre LR) assigns positions when the projection carries none: the **same projection → the same positions each render** (pinned by equality on two runs); generational tiers flow left→right.
- [ ] The graph **updates incrementally** as the projection's **`sequenceThrough` advances** (a higher-watermark projection re-renders the added/changed nodes/edges); a stale projection is not shown over a newer one.
- [ ] **In-flight sub-state derivation (deferred from P7.2):** a pure derivation over the run-event stream marks a node **working / in-flight** when an **operation-start marker** (e.g. `critic.review_started`, `check.started`, `candidate.generation_started`, `novelty.scoring_started`, `fusion.started`, `judge.review_started`, `tool_call.started`) is seen **without its paired completion**, and **clears it on the completion** event; a **live activity feed** lists start→finish. **Replay reproduces the identical liveness** (sequence sole ordering — the derivation is a pure fold, no wall-clock).
- [ ] The view makes **spawn / survival / fusion / mutation / generation-improvement legible** (REQ-UX-001, REQ-E-002): edges typed (spawned/produced/fused/mutated/selected) per the projection's open `LineageEdge.type`.
- [ ] Adherence-clean (`var()` tokens, no raw hex/px); **no `apps/api` import** (rule #6); status is shape+label+icon never color-alone (rule #4); React Flow + the layout lib added as deps (flag at Step 9 — manifest change).
- [ ] Unit tests pass (the deterministic core; happy-dom for the component mount); **count reported**; `/preflight` (web) clean.

## Wiring / entry point (Step 7.5)
**none — mounted by the P7.14 shell.** P7.7 provides the `LineageGraph` component + the pure `lineageToFlow` mapping + the `layout` helper + the in-flight derivation. The shell (P7.14) mounts `LineageGraph` on the run screen, feeding it `runClient.getLineage(runId)` + the live run-store event stream. Exercised now against the `multiNodeLineage` fixture + a seeded event stream. So: *first consumer — the P7.14 shell; `dataRef` link targets are consumed by the P7.10 candidate-inspector / P7.12 evidence / P7.13 final-idea panels.*

## Files expected to touch
**New:**
- `apps/web/src/lineage/LineageGraph.tsx` — the React Flow graph component (renders `lineageToFlow` output + the 5 node types + the live activity feed)
- `apps/web/src/lineage/lineageToFlow.ts` — pure `LineageGraphProjection` → React Flow `{nodes, edges}` mapping (6 node types → 5 rendered; winner=candidate+selected; drop dangling edges)
- `apps/web/src/lineage/nodeTypes.tsx` — the five custom node types (agenome/candidate/critic-check/score/selected-winner), each via the shared `StatusBadge`/`status-map`
- `apps/web/src/lineage/layout.ts` — the deterministic Dagre-LR layout helper
- `apps/web/src/lineage/inFlight.ts` — the pure per-node in-flight derivation (operation-start marker without paired completion) + the activity feed
- `apps/web/test/unit/lineage/{lineageToFlow,layout,inFlight}.test.ts` + `LineageGraph.test.tsx`

**Modified:**
- `apps/web/package.json` — add `@xyflow/react` (v12, React 19-compatible) + the Dagre layout lib (`@dagrejs/dagre`); lockfile (flag the manifest change at Step 9)

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
**(happy-dom + the `multiNodeLineage` fixture + a seeded event stream; `spec(§10)`/`spec(§12)`/`spec(§4)`):**
1. **`test_lineageToFlow_maps_six_types_to_five`** — the 6 `LineageNodeType` map to the 5 rendered types (critic+check → critic/check; candidate+`status==='selected'` → selected-winner; generation = backbone); each node carries its status spec + `dataRef`. *(Positive guard.)* Why: §10/§12.
2. **`test_lineageToFlow_drops_dangling_edges`** — an edge with a missing source/target endpoint is dropped (no React Flow break). Why: LESSONS §30 defensive.
3. **`test_layout_is_deterministic`** — `layout()` on the same projection yields identical positions across two runs (no coordinates in the projection → deterministic Dagre LR). Why: §12 "same projection lays out the same way".
4. **`test_graph_updates_on_sequenceThrough_advance`** — a higher-`sequenceThrough` projection re-renders added/changed nodes; a lower/stale watermark does not replace a newer view. Why: §10 incremental + watermark.
5. **`test_inflight_marks_node_on_unpaired_marker`** — an operation-start marker with no paired completion marks its node in-flight; the completion clears it; the activity feed lists start→finish. Why: §4/§12 live window (deferred P7.2 derivation).
6. **`test_inflight_replay_equivalent`** — the in-flight derivation is a pure fold over `sequence` (no wall-clock) — replaying the same stream reproduces the identical liveness. Why: §4 sequence sole ordering.
7. **`test_status_accessible_not_color_alone`** — each node type renders shape+label+icon via the shared primitive (not color alone). Why: rule #4 / §12.
8. **`test_no_apps_api_import`** — structural (rule #6, positive-guarded).

## Cross-doc invariant impact
- **Model field changes:** none (consumes the frozen `LineageGraphProjection` + `LineageNodeType` read-only; defines no Appendix-A model). **§2.5-seam:** none (consumer side — the producer P6.3 owns conformance).
- **Orchestrator doc rows (Step 9):** a likely LESSONS entry (the React-Flow lineage: 6→5 node-type mapping, deterministic Dagre layout, the in-flight derivation resolving the P7.2 deferral, dangling-edge drop). **Manifest change** (`@xyflow/react` + Dagre) — flag at Step 9; not a cross-doc invariant. I author the lesson hot.

## Things to flag at Step 2.5
1. **Layout library — Dagre vs ELK.** My default vote: **`@dagrejs/dagre`** (LR) — the prototype's choice (`organism-view/data.jsx` = "Dagre LR"), deterministic, lightweight, React-Flow's canonical pairing. ELK is heavier (web-worker) — defer unless Dagre can't express the tiers. Confirm Dagre.
2. **React Flow package/version.** My default vote: **`@xyflow/react` v12** (the React 19-compatible successor to `react-flow-renderer`/`reactflow`). Pull the version-correct API from Context7 (`@xyflow/react` v12) before wiring — custom `nodeTypes`, controlled `nodes`/`edges`, `fitView`. Confirm the package.
3. **In-flight derivation location.** My default vote: a **pure `deriveInFlight(events)`** helper in `lineage/` consuming the same `RunEventType` op-start markers (start↔completion pairing, like P6.8's run-health but per-node not count) — the store (P7.2) feeds the events, the lineage derives in-flight from them (keeps the store's fold idempotent + mode-agnostic, LESSONS §2). Confirm vs folding in-flight into the run-store.
4. **Deterministic-core-TDD vs visuals-ported split.** My default vote: unit-pin the pure core (mapping/layout/in-flight/dangling-drop + the component mounts with the 5 node types); the pixel-level visuals (braids, winner styling) are PORTED from the prototype + covered by the P7.15 Playwright smoke, not unit assertions. Confirm the split (so we don't over-pin pixels).

## Dependencies + sequencing
- **Depends on:** **P0.13** (`LineageGraphProjection`/`LineageNodeType` — frozen), **P7.1** (`getLineage` — `38749ac`/round-1), **P7.2** (run-store + the deferred in-flight derivation, LESSONS §2), **P7.3** (status primitive). The producer P6.3 (`lineage-graph.ts`) shipped round-1. Design-touching (prototype `organism-view` in place).
- **Blocks:** **P7.9** (energy panel links to lineage nodes), **P7.10/P7.12/P7.13** (inspector/evidence/final-idea consume `dataRef` link targets), **P7.14** (shell mounts it), **P7.15** (Playwright smoke traverses start→live→final-idea-links). Also unblocks **P6.11** (the Neo4j spike — "only after the React-Flow path works").

## Estimated commit count
**1.** One focused feature (the lineage graph + its deterministic core). Large but a single logical unit (not bundle-splittable — the mapping/layout/in-flight/node-types are one coherent slice). Not safety-invariant (read-only projection render; rule #2 holds — consumes a derived projection, never authoritative). Step-8: code-quality phase-boundary; security-reviewer optional (no secret, no mutation, `dataRef`/ids rendered as link targets not concatenated).

## Lessons-logged candidates anticipated
- **Convention candidate** — "the React-Flow lineage renders the storage-agnostic `LineageGraphProjection` via a PURE `lineageToFlow` mapping (the closed 6 `LineageNodeType` → 5 rendered: critic+check merge, selected-winner = candidate+`status:selected` per LESSONS §30, generation = backbone; drop dangling edges defensively); a deterministic Dagre-LR `layout` (same projection → same positions); the in-flight sub-state is a PURE fold over the op-start↔completion markers (resolving the P7.2 deferral, LESSONS §2) — replay reproduces the liveness (sequence sole ordering, no wall-clock); the deterministic core is TDD'd, the visuals are PORTED from the prototype (LESSONS §3), no `.jsx` import; `@xyflow/react` v12 for React 19."
- **Future TODO — operational** — ELK/web-worker layout for very large graphs (Dagre is fine for the demo scale); virtualization if node counts explode (deferred).

## How to invoke
> web session oriented — `/tdd`. cwd `apps/web/`. Stage only `apps/web/...` (incl. package.json/lockfile for the new web deps). Skim the prototype `ui_kits/organism-view/{LineageGraph,data}.jsx` (design ref — port, don't import) + pull `@xyflow/react` v12 + `@dagrejs/dagre` API from Context7.
1. **Run `/tdd react_flow_lineage_tree`.**
2. **Step 2.5** — answer the 4 questions (esp. Q1 Dagre, Q3 in-flight location, Q4 TDD/visual split), send the write-up + coverage map (each acceptance bullet → its test).
3. **Step 9** — surface the LESSONS candidate + the manifest change (the two new deps).
