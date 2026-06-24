# /tdd brief — lineage_declutter_node_inspector

## Feature
Resolve the user's live-demo pain: the lineage graph currently renders **every** node type (critic/check/score as inline nodes) → cluttered + unnavigable. FV.5a makes the organism graph a **CLEAN agenome+candidate backbone** and moves the critic/check/score/fitness detail into the **node-click inspector drawer**. Two coupled halves (the detail MOVES, so they ship together): **(A)** `lineageToFlow` filters out `criticCheck` + `score` nodes (keeping agenome + candidate + the generation backbone) and drops their incident edges; **(B)** `LineageGraph` gains an `onNodeClick` prop (the FV.4 carry-forward gap) → S2 wires node-click → the `InspectorDrawer` (FV.4's empty slot) renders the EXISTING structured panels keyed by the clicked node: a **candidate** → `CandidateInspector` (idea/subtype/transfer) + a **fitness breakdown** (derived from `fitness.scored` events — the score detail that left the graph) + `CriticGauntletPanel` + `SubtypeCheckPanel`; an **agenome** → a basic summary (status/parentage/energy from the node). Read-only (rule #9); the inspector re-ranks nothing (rule #6 emit-only); ZERO contract change (all panels + selectors already exist).

> **Scope note — mostly COMPOSE + a graph filter.** `CandidateInspector`, `CriticGauntletPanel`, `SubtypeCheckPanel`, `EvidenceRefLink`, `getCandidate`, the `InspectorDrawer` slot, `selectedCandidateId`/`setSelectedCandidateId`, and the `deriveReviewsByCandidate`/`deriveChecksByCandidate` selectors are ALL shipped. Net-new = the `lineageToFlow` filter+edge handling, the `LineageGraph.onNodeClick` prop + S2 wiring, the drawer content router, the fitness subsection, and a thin agenome summary.

## Use case + traceability
- **Task ID:** FV.5 (sub-slice FV.5a — structured inspector; the deep-telemetry additions land in FV.5b later)
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (frontend dashboard — the React-Flow lineage graph + the candidate inspector + critic-gauntlet + subtype-check panels; accessibility shape/label/icon), `ARCHITECTURE.md §10` (projections — the lineage-graph projection the flow maps; read-only/derived).
- **Related context:**
  - **The user finding (Carry-forward, lead-relayed 2026-06-24):** the demo graph renders critic/check/score inline → clutter; the FV organism graph must be the agenome+candidate backbone only, with the detail in the node-click inspector (matches the DS organism-view kit: clean tiered graph + a hero candidate; everything else in the drawer).
  - **(A) The graph layer:** `src/lineage/lineageToFlow.ts:69–107` maps the 6 `LineageNodeType` → 5 React-Flow types (`agenome`/`candidate`/`criticCheck`[critic+check]/`score`/`selectedWinner` + generation backbone); edges map 1:1 from `projection.edges` with a dangling-edge filter (`:95–104`). `LineageNode` = `{id, type, label, status?, dataRef, metrics?}` (no `parents` field — re-bridge derives from `projection.edges`). FV.5a filters nodes to exclude `criticCheck` + `score` + drops their incident edges.
  - **(B) The node-click gap:** `src/lineage/LineageGraph.tsx:21–25` has NO `onNodeClick`/`onSelect` prop (the FV.4 carry-forward gap); `src/routes/S2OrganismView.tsx:135–138` mounts `InspectorDrawer` with `selectedId={obs.selectedCandidateId}` + `onClose` but **no children** (the empty FV.4 slot); `src/routes/useRunObservatory.ts:41–49` exposes `selectedCandidateId`/`setSelectedCandidateId`.
  - **(C) The panels to compose (all shipped):** `CandidateInspector` (`src/panels/CandidateInspector.tsx:18–22` — props `{runId, candidateId, runClient: Pick<RunClient,'getCandidate'>}`; fetches `getCandidate(runId, candidateId)`); `CriticGauntletPanel` (`:21–25` — props `{events, candidateId, onSelectEvidence?}`; `deriveReviewsByCandidate(events).get(candidateId)`); `SubtypeCheckPanel` (`:21–24` — props `{events, candidateId}`; `deriveChecksByCandidate(events).get(candidateId)`). The `dataRef` of a candidate node == its `candidateId` (the `getCandidate` arg; mirrors `FinalIdeaPanel.tsx:111`).
  - **Fitness (the score detail that leaves the graph):** the `score` nodes carried the fitness viz; after the drop, the candidate inspector gains a fitness-breakdown subsection derived from `fitness.scored` events for the candidate (reuse the `FinalIdeaPanel`/`finalIdeaData` `winnerFitness` pattern — total + components, read verbatim, rule #6).
  - **Agenome summary:** `src/components/ds/AgenomeCard.tsx:9–121` renders status/parentage/energy from a node summary; a thin agenome-node inspector reuses this from the lineage node (`node.metrics` — no new API; deep persona/system-prompt/tools detail needs a `getAgenome` API → deferred).
  - Safety: rule #9 (read-only — node-click sets view state, no command/POST), rule #6 (the inspector DISPLAYS critic/check/fitness verbatim — never re-ranks or re-derives a verdict), rule #7 (the panels are pure over events/getCandidate — replay-identical). **No safety-invariant pin** → not a security-reviewer slice.

## Acceptance criteria (what "done" means)
- [ ] **(A) Declutter:** `lineageToFlow` excludes `criticCheck` + `score` nodes → the flow nodes are agenome + candidate (+ the generation backbone) ONLY; edges incident to a dropped node are removed so no dangling/broken edges remain; the agenome→candidate backbone stays connected. A param (e.g. `dropTypes` / a constant) keeps it testable.
- [ ] **(B) Node-click wiring:** `LineageGraph` gains an `onNodeClick?: (nodeId, dataRef, nodeType) => void` prop wired to React-Flow's node click; `S2OrganismView` passes it → sets the selected node → opens the `InspectorDrawer`.
- [ ] **(C) Candidate inspector:** clicking a CANDIDATE node renders, in the drawer, `CandidateInspector` (via `getCandidate(runId, dataRef)`) + a **fitness breakdown** (total + components from `fitness.scored` events, verbatim — rule #6) + `CriticGauntletPanel` + `SubtypeCheckPanel` (both keyed by the candidate's `dataRef`).
- [ ] **(C) Agenome inspector:** clicking an AGENOME node renders a basic summary (status + parentage + energy from the node's data — no new API). The deep agenome detail (persona/system-prompt/tools) is a flagged later slice.
- [ ] **Drawer close + empty state:** the drawer's existing open/close + "select a node" placeholder (FV.4) are preserved; selecting a different node swaps content.
- [ ] **Read-only + rule #6:** node-click sets view state only (no command/POST — rule #9); the inspector displays critic/check/fitness VERBATIM and re-ranks nothing (rule #6 emit-only); replay-identical (the panels are pure over events/getCandidate).
- [ ] No contract change (web-local). All `apps/web` unit tests pass; `/preflight` clean. The prior `lineageToFlow`/`LineageGraph` tests that asserted the old 6→5 mapping are UPDATED for the declutter (keep the suite honest).

## Wiring / entry point (Step 7.5)
`src/routes/S2OrganismView.tsx` — `LineageGraph` (decluttered) + its `onNodeClick` → the selection state → the `InspectorDrawer` content router. Confirm a real run rendered at `/runs/:id`: the graph shows only agenome+candidate nodes, and clicking a candidate opens the drawer with its idea + fitness + critic gauntlet + subtype checks — reachable from the production route, not just unit-mounted. (Pixel/legibility polish = FV.9.)

## Files expected to touch
**New:**
- `src/components/run/NodeInspectorContent.tsx` — the drawer content router (keyed by node type → the candidate composition or the agenome summary).
- `src/panels/candidateFitness.ts` (+ a small render) — the pure fitness-breakdown selector for a candidateId (or extend `CandidateInspector` with the subsection; Step-2.5 Q2).
- `test/unit/components/run/NodeInspectorContent.test.tsx`
- (extend) `test/unit/lineage/lineageToFlow.test.ts`, `test/unit/routes/S2OrganismView.test.tsx`

**Modified:**
- `src/lineage/lineageToFlow.ts` — filter `criticCheck` + `score` + drop incident edges.
- `src/lineage/LineageGraph.tsx` — add the `onNodeClick` prop + wire React-Flow node click.
- `src/routes/S2OrganismView.tsx` — wire node-click → selection → drawer content (router).
- `src/routes/useRunObservatory.ts` — IF a unified selected-node (vs `selectedCandidateId` only) is needed for agenome selection (Step-2.5 Q4).
- `src/panels/CandidateInspector.tsx` — the fitness subsection (if not a separate component).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
1. **`test_lineage_to_flow_drops_critic_check_score`** — Asserts: the flow nodes contain agenome + candidate (+ backbone) only; no `criticCheck`/`score` node. Why: §12 declutter.
2. **`test_lineage_to_flow_drops_incident_edges_no_dangling`** — Asserts: edges to/from dropped nodes are removed; no edge references a missing node; the agenome→candidate backbone edges remain. Why: §10 graph integrity.
3. **`test_lineage_graph_onnodeclick_fires`** — Asserts: clicking a flow node fires `onNodeClick(nodeId, dataRef, nodeType)`. Why: the FV.4 carry-forward gap.
4. **`test_s2_candidate_click_opens_candidate_inspector`** — Asserts: clicking a candidate node opens the drawer with `CandidateInspector` (title via `getCandidate(dataRef)`) + the fitness breakdown + critic gauntlet + subtype checks. Why: §12 the detail moved to the inspector.
5. **`test_candidate_fitness_breakdown_verbatim`** — Asserts: the fitness subsection shows `fitness.scored` total + components for the candidate, read verbatim (no recompute). Why: rule #6 (score is authoritative) + the score detail isn't lost.
6. **`test_s2_agenome_click_opens_agenome_summary`** — Asserts: clicking an agenome node opens the drawer with the agenome status/parentage/energy summary (from node data, no new API). Why: every node clickable; no dead clicks.
7. **`test_node_click_read_only`** — Asserts: node-click + inspector render issue NO `runClient` command/POST (startRun/stopRun/startDemoRun not called). Why: rule #9 read-only.
8. **`test_inspector_swaps_and_closes`** — Asserts: selecting a different node swaps content; close returns to the placeholder. Why: drawer UX preserved.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NONE — all web-local; the projection + panels are unchanged. No schema-snapshot.
- **Orchestrator doc rows to write hot (Step 9 routing):** an `ARCHITECTURE.md §12` note — the organism graph is decluttered to the agenome+candidate backbone (critic/check/score filtered at `lineageToFlow`), with the critic/check/score/fitness detail in the node-click `InspectorDrawer` (composing the existing panels; rule #6 emit-only). An `apps/web/LESSONS` candidate (declutter at the flow layer + node-click→drawer composition; fitness moves to the candidate inspector when score nodes drop). Orchestrator writes hot.
- **Shared-contract seam model touched?** No.

## Things to flag at Step 2.5
1. **Edge re-bridge — are criticCheck/score leaf nodes?** Confirm at Step 1 against `projection.edges`. My default vote: `criticCheck`/`score` are LEAF nodes (a candidate's reviews/checks/score hang off it with no outgoing edges) → just FILTER the nodes + DROP their incident edges (no incoming→outgoing re-bridge needed; the agenome→candidate backbone is independent). If they DO have outgoing edges, re-bridge incoming→outgoing. Flag what Step 1 finds.
2. **Fitness subsection — in CandidateInspector or a sibling?** My default vote: a pure `candidateFitness(events, candidateId)` selector (reuse the `winnerFitness` pattern — total + components verbatim) rendered as a subsection of the candidate composition (a sibling section in `NodeInspectorContent`, not buried in `CandidateInspector`'s fetch). Keeps `CandidateInspector` (which fetches the idea) separate from the events-derived fitness. Flag.
3. **Agenome inspector depth.** My default vote: a BASIC agenome summary (status/parentage/energy from the lineage node — reuse `AgenomeCard`'s display logic, no new API) so agenome clicks aren't dead. The deep detail (persona weights / system prompt / tools / "failed attempts not debited") needs a new `getAgenome(runId, agenomeId)` API → a flagged later slice (FV.5b or a backend slice). Flag if the user wants the deep agenome detail now (it'd add a backend surface).
4. **Selection state shape.** My default vote: a unified `selectedNode: {dataRef, type} | null` in the hook (replacing/extending `selectedCandidateId`) so the drawer routes on `type`; OR keep `selectedCandidateId` + add `selectedAgenomeId`. Prefer the unified `selectedNode` (cleaner routing). Update the FV.4/FV.5 wiring + tests accordingly. Flag.

## Dependencies + sequencing
- **Depends on:** FV.4 (`8e6400d`, the S2 shell + `InspectorDrawer` slot + `selectedCandidateId` + the LineageGraph mount), the shipped panels (P7.x `CandidateInspector`/`CriticGauntletPanel`/`SubtypeCheckPanel` + `criticData`/`checkData`), `getCandidate`. Backend EXISTS.
- **Backend-independent** of the FB phase → parallel-eligible with the api implementer.
- **Blocks:** **FV.5b** (adds FB.6 raw-reasoning + FB.7 tool-calls + FB.8 judge-rationale to THIS inspector once those land) + FV.9 (polish). Resolves the lead-relayed user demo-clutter finding.

## Estimated commit count
**1–2.** One coherent web slice (the declutter + the node-click inspector are coupled — the detail moves from graph to drawer, so they ship together). May land as 2 commits: (a) the `lineageToFlow` declutter + edge handling + its tests, (b) the `onNodeClick` + drawer content composition + fitness subsection. No safety invariant, no contract change. The §12 note + the lesson ride the `/orchestrate-end` round commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "declutter a graph at the FLOW-MAP layer (filter node types + drop their incident edges; keep the backbone connected) rather than at the projection (the projection stays complete/authoritative — §10); the filtered detail MOVES to the node-click drawer by COMPOSING the existing per-candidate panels (rule #6 emit-only display, keyed by the node's dataRef); when a derived node type (score) drops, its data (fitness) moves to the inspector as an events-derived subsection (verbatim, never recomputed)."
- **Architecture-doc note candidate** — §12: the decluttered organism graph (agenome+candidate backbone) + the node-click inspector composition; the lineage projection stays complete, the declutter is presentation-only.
- **Future TODO — operational** — FV.5b deep telemetry (FB.6/7/8) into this inspector; a `getAgenome` API for the deep agenome detail; FV.9 legibility/a11y polish.
