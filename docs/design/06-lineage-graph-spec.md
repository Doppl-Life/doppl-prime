# 06 · Lineage Graph Spec (React Flow — canonical)

The deep, build-ready spec for **LineageGraph**, the living family-tree at the heart of **S2 · Organism View** / **S6 · Replay Mode** — the visual that makes "an ecosystem getting smarter in real time" legible and unforgettable.

**Related:** `01-overview-and-principles.md` · `02-design-system-kit.md` · `03-screens-S0-S6.md` · `04-components-catalog.md` · `05-status-encoding-and-motion.md` · `07-charts-and-evidence-panels.md` · `08-replay-and-states.md` · `09-dummy-data-fixtures.md`
**Architecture ground truth:** `ARCHITECTURE.md` §10 (lineage graph + `LineageGraphProjection`), §3 (domain + state machines), §11 (`GET /runs/:id/lineage`), §12 (dashboard), Appendix A.

---

## 0 · Canonical stack (non-negotiable)

> **LineageGraph is built on React Flow (`@xyflow/react`). This is locked (`ARCHITECTURE.md` §19: "React Flow, not Cytoscape/D3").**
> **Auto-layout is Dagre (`@dagrejs/dagre`)** — generations become tiers. **ELK (`elkjs`) is the alternative**, swappable behind the same `layoutGraph()` seam, but Dagre is the default and the prototype target.

| Concern | Library | Notes |
|---|---|---|
| Graph canvas, nodes, edges, zoom/pan/fit, minimap, controls | **`@xyflow/react`** (React Flow v12) | Custom `nodeTypes` + `edgeTypes` registries |
| Auto-layout (tiered, generational) | **`@dagrejs/dagre`** | `rankdir: 'TB'` default (top→bottom tiers); `'LR'` toggle |
| Animation / liveness | **Framer Motion (`motion`)** | Node spawn/cull/fuse/mutate; camera moves use React Flow's `setCenter`/`fitView` |
| Styling / tokens | **Tailwind + shadcn/ui** | Node chrome = Tailwind utility classes bound to design tokens |
| Icons / glyphs | **`lucide-react`** | Plus the canonical status glyphs (◌ ◐ ○ ★ ⚇ ∿ △ ✕ ♔ ✓ –) |
| Fonts | **Inter** (labels) · **JetBrains Mono** (IDs, energy numbers, genome text) | Projector-legible |
| Live data | **sequence-keyed SSE reducer** → `LineageGraphProjection` (TanStack Query for the REST seed) | `sequenceThrough` is the high-water mark |
| View state | **Zustand** | selection, focus/isolate, filters, layout direction, camera intent |

The graph **never mutates authoritative state** (`ARCHITECTURE.md` §12). It renders a derived projection and routes clicks to **CandidateInspector** / **AgenomeInspector** (read-only overlays).

---

## 1 · What the graph is

The LineageGraph is the **population / family tree** of one run. It is the projection `LineageGraphProjection` (`ARCHITECTURE.md` §10, Appendix A):

```ts
LineageGraphProjection {
  runId: string
  nodes: { id, type, label, status?, metrics?, dataRef }[]
  edges: { id, source, target, type, label? }[]
  sequenceThrough: number   // event high-water mark this graph was built to
}
```

- **Tiers = generations.** Gen-0 at the top, each later generation a row beneath it. The tree visibly grows downward as the run advances.
- **Within a tier:** the agenomes of that generation, and the candidates each produced.
- **Hanging off candidates:** the critics that reviewed them, the checks that ran, and the score. These are *evidence sub-nodes* (collapsible — see §7.4).
- **Crossing tiers:** `spawned`, `fused` (the special two-parent edge), `mutated` edges that connect a parent generation to its children.
- **`sequenceThrough`** is shown subtly in the graph footer (`seq ≤ 1842`) so a skeptic can confirm the view's recency, and is the join key against the **ActivityTicker** and **GenerationTimeline**.

```
            LineageGraph (S2 center) — Dagre TB, generations as tiers
┌──────────────────────────────────────────────────────────────────────────┐
│  GEN 0  ▏ [G0·a0 ★]    [G0·a1 ✕]    [G0·a2 ○]                              │  ← GenerationNode band (left rail label)
│         ▏    │ produced     ╲ culled                                        │
│         ▏  (c0·001 ♔?)      (c0·004 ✕)                                      │
│  ───────╋────┼──────────────────────────────────── spawned / fused ───────│
│  GEN 1  ▏ [G1·a4 ⚇]◀═══fused═══[G0·a0 ★]+[G0·a2]   [G1·a5 ∿]◀∿mutated     │
│         ▏    │                                          │                   │
│         ▏  (c1·011)        (c1·013 ♔)                  (c1·017)            │
│  ───────╋──────────────────────────────────────────────────────────────── │
│  GEN 2  ▏ [G2·a9 ⚇] [G2·a10 ⚇]              [WINNER ♔ c2·031]              │
│         ▏                                                                    │
│         ▏  ◐ critic pulse · ○ energy drain · ✕ fade+sink (live)            │
└──────────────────────────────────────────────────────────────────────────┘
  [fit] [zoom −/+] [LR/TB] [minimap ▣]            footer: LIVE · seq ≤ 1842
```

---

## 2 · Node types

Seven custom React Flow node types are registered in `nodeTypes`. All share a base shell (`<NodeShell>`) that supplies the bioluminescent card chrome, the **StatusBadge** (shape + icon + label + color — never color alone, `05-status-encoding-and-motion.md`), the focus ring, the **working / in-flight overlay** (§2.0), and the click→Inspector affordance. Node sizes below are the *Dagre layout box* (React Flow needs explicit `width`/`height` for clean ranking).

> **Status encoding rule (load-bearing):** every status is **shape + icon + label + color**. The glyphs below are canonical and colorblind-safe; color is reinforcement, never the only signal.

### 2.0 `WorkingOverlay` — the per-node in-flight sub-state (operation-start markers)

> **Load-bearing liveness:** the dashboard shows *exactly what each agent is doing in-flight*, not only what it finished (`ARCHITECTURE.md` §4 "Live in-flight observability", §12 "Real-time in-flight window", §13). Beyond completion events, the SSE stream carries the canonical **operation-start markers** (`ARCHITECTURE.md` §4/§11, Appendix A `RunEventType`); the `<NodeShell>` derives a transient **working / in-flight** sub-state when it sees a *start* marker for the node **without** its paired completion, and **clears it on the completion event**.

This sub-state is **orthogonal to** the persisted `*.status` lifecycle field (`Agenome.status`, `CandidateIdea.status`) — it is a derived, transient overlay (not a new status value), so it never contradicts the §2.x status encodings. While in-flight, a node renders an **op-type glyph** (what it is doing) on top of its existing **active pulse**; on the completion event the overlay is removed and the status badge reflects the now-advanced lifecycle state.

| Node | Start marker (sets working) | Paired completion (clears working) | Op-type glyph + sub-label |
|---|---|---|---|
| `AgenomeNode` | `candidate.generation_started` (on its agenome) | `candidate.created` | ◌→◐ "generating" |
| `CandidateNode` | `critic.review_started` | `critic.reviewed` | ◐ "reviewing" |
| `CandidateNode` | `check.started` | `check.completed` | ⏿ "checking" |
| `CandidateNode` | `novelty.scoring_started` | `novelty.scored` | ∆ "scoring novelty" |
| `CandidateNode` | `judge.review_started` (held-out judge) | `fitness.scored` | ⚖ "judging" |
| `AgenomeNode` (child) | `fusion.started` | `agenome.fused` | ⚇ "fusing" |
| any (tool-using op) | `tool_call.started` | `tool_call.finished` | ⚙ "tool call" |
| `GenerationNode` | `generation.verifying` / `generation.scoring` / `generation.reproducing` | `generation.completed` (or next phase marker) | phase icon (§2.1) |

**Correlation:** each marker carries the `run/generation/agenome/candidate` correlation IDs (`ARCHITECTURE.md` §4), so the reducer routes a start/clear pair to the exact node by ID — no guessing. The reducer is the same **sequence-keyed SSE reducer** that builds the projection; it maintains a per-node `inFlightOps` set keyed by op-type, sets the overlay on a start, and removes the op on its paired completion.

**Markers are persisted and replay-faithful, energy-free.** These markers are authoritative events in the closed `RunEventType` enum (`ARCHITECTURE.md` Appendix A), so **replay reproduces the identical in-flight choreography** — yet they need **no provider call to replay** and **do not debit energy** (only the underlying op's success does, `ARCHITECTURE.md` §4 Energy). In replay, the overlay is driven by the **ReplayScrubber** position (not SSE, §6.6, `08-replay-and-states.md`): scrubbing past a start sets working, past its completion clears it.

**Dangling start = legible failure.** A start with no paired completion is **valid** (crash/timeout → run failed; `ARCHITECTURE.md` §4): the working overlay persists, then the node resolves to `failed △!` when the terminal/`provider_call_failed` event arrives — replay shows the same started→failed sequence. A working overlay must never be left silently spinning forever; a stale-start age (from `GET /runs/:id/health`, §9 freshness dot) tips it toward the degraded/failed rendering.

> **Schema note:** adding these markers to the closed `RunEventType` enum is a `schemaVersion` bump — fixtures (`09-dummy-data-fixtures.md`) must be re-recorded (`ARCHITECTURE.md` §4).

### 2.1 `GenerationNode` — the tier band

| Property | Value |
|---|---|
| Role | A tier header / band marker (NOT a normal node — rendered as a left-rail label + faint horizontal divider, or a React Flow `group` node spanning the tier width) |
| Size | full tier width × 36px band |
| Shows | `GEN N`, generation status (`pending/running/verifying/scoring/reproducing/completed/failed/skipped`), survivor count, mini "gen avg fitness" pip |
| Status encoding | `running ◐ cyan pulse` · `verifying` (magnifier icon) · `scoring` (scale icon) · `reproducing ⚇ violet` · `completed ✓ green` · `failed △! red` · `skipped – gray` |
| In-flight (§2.0) | The generation phase markers `generation.verifying` / `generation.scoring` / `generation.reproducing` (`ARCHITECTURE.md` §4) set the band's **working overlay** (phase icon + pulse) as the tier enters that phase; cleared by the next phase marker or `generation.completed` |
| Hover | Tooltip: gen index, started/completed `occurredAt`, candidate count, best fitness this gen, "→ jump GenerationComparison" |
| Selected | Highlights the whole tier (dims other tiers to 35%) — a fast "show me only this generation" |
| Dummy | `{ id:'gen-0', type:'generation', data:{ index:0, status:'completed', survivors:1, avgFitness:0.41 } }` |

### 2.2 `AgenomeNode` — a genome in the population

The most numerous node (~20 per run target, `ARCHITECTURE.md` §1). Carries the **EnergyMeter** (per-agenome) inline.

| Property | Value |
|---|---|
| Size | 200 × 92 |
| Anatomy | Top row: status glyph + short label `G1·a4` (JetBrains Mono) + subtype affinity dot(s). Middle: one-line persona summary (Inter, truncated). Bottom: **EnergyMeter** (charge bar that DRAINS) + `12/50 ⚡` (JetBrains Mono) + candidate-count chip `×3`. |
| Shows | `Agenome.status`, energy spent/budget, # candidates produced, parentage hint (fusion/mutation badge), subtype lean |
| Status encoding (7-state, `ARCHITECTURE.md` §3) | `seeded ◌ dim` · `active ◐ cyan pulsing` · `spent ○ muted` · `eligible_parent ★ blue` · `reproduced ⚇ violet (two-parent glyph)` · `mutated ∿ amber` · `failed △! red dashed border` · `culled ✕ gray, faded + sunk` |
| Reproduction badge | `⚇` (fused, violet) or `∿` (mutated, amber) in the top-right corner when this genome is a child |
| Hover | Tooltip: full status, `personaWeights` top-3, `toolPermissions[]`, `spawnBudget` hint vs effective, energy spent, parent IDs, candidate IDs |
| Click | Opens **AgenomeInspector** (drawer, `S4`) — system prompt, persona/value weights, tool permissions, decomposition policy, spawn budget, parentage, energy, candidates, status |
| Selected | Blue focus ring; "Isolate lineage" affordance appears (§5.3) |
| In-flight (§2.0) | On `candidate.generation_started` shows the **working overlay** ("generating" glyph + active pulse) until `candidate.created`; on `fusion.started` (child) shows "fusing" (⚇) until `agenome.fused` |
| Live | `active` → energy bar animates downward on each `energy.spent`; `culled` → fade + sink (§6.4) |
| Dummy | `{ id:'G1-a4', type:'agenome', data:{ label:'G1·a4', status:'reproduced', energySpent:38, energyBudget:50, candidateCount:2, parentIds:['G0-a0','G0-a2'], reproMode:'fusion', personaTop:['contrarian','systems'], subtypeLean:'cross_domain_transfer' } }` |

### 2.3 `CandidateNode` — a candidate idea

| Property | Value |
|---|---|
| Size | 220 × 80 |
| Anatomy | Top: status glyph + candidate ID `c1·013` + **subtype pill** (`XFER` teal for `cross_domain_transfer` / `ZEIT` amber for `zeitgeist_synthesis`). Middle: `title` (Inter, 1 line, truncated). Bottom-right: **FitnessBreakdown** spark (`total` as a tiny meter) + **NoveltyMeter** pip. |
| Shows | `CandidateIdea.status`, subtype, title, fitness total (meter), novelty (meter), evidence-present indicators (mini ✓/✕/– cluster for checks) |
| Status encoding (`ARCHITECTURE.md` §3) | `created` (faint) → `under_review ◐ pulsing` → `checked` → `scored` → `selected ♔ gold` ; `rejected ✕` ; `culled` (faded) ; `invalid △ red` |
| Subtype encoding | Pill text + shape + color (never color alone): `XFER` rounded-square teal, `ZEIT` pill amber |
| Hover | Tooltip: title, summary (2 lines), subtype, fitness `total` + top component, novelty score, "critics: 4 · checks: 2✓1–" |
| Click | Opens **CandidateInspector** (drawer, `S3`) — subtype payload, Critic Gauntlet, Subtype-Check Evidence, Novelty, Fitness Breakdown, Energy, Lineage path, trace links |
| Selected | Gold-tinted ring if `selected`; reveals the candidate's critic/check sub-nodes if collapsed (§7.4) |
| In-flight (§2.0) | Shows the **working overlay** per active op-type marker: `critic.review_started`→"reviewing" (until `critic.reviewed`), `check.started`→"checking" (until `check.completed`), `novelty.scoring_started`→"scoring novelty" (until `novelty.scored`), `judge.review_started`→"judging" (until `fitness.scored`); multiple may overlap (the overlay shows the dominant op-glyph + an `×N` in-flight count) |
| Live | `under_review` pulses while critics run; on `fitness.scored` the fitness meter fills with a brief shimmer |
| Dummy | `{ id:'c1-013', type:'candidate', data:{ label:'c1·013', status:'selected', subtype:'cross_domain_transfer', title:'Slime-mold routing → datacenter cache eviction', fitnessTotal:0.78, novelty:0.66, checks:{passed:2,failed:0,skipped:1}, criticCount:4 } }` |

### 2.4 `CriticNode` — one critic review (evidence sub-node)

Hangs off a CandidateNode; one per `CriticReview.mandate`. Small by design (high count).

| Property | Value |
|---|---|
| Size | 132 × 48 |
| Anatomy | Mandate icon + abbreviated mandate label (`GND`/`NOV`/`FEAS`/`FALS`/`SUB`) + score chip (0–5) + confidence pip |
| Shows | `CriticReview.mandate` (closed union: `factual_grounding` `novelty_prior_art` `feasibility` `falsification` `subtype_specific`), `scores{}`, `confidence` |
| Status encoding | Score 0–5 rendered as a 5-segment meter (not hue alone); low score = △ caution tint; high = solid. Confidence = pip fill. |
| Hover | Tooltip: full mandate, score, confidence, first line of `critique`, evidenceRef count |
| Click | Opens **CandidateInspector** scrolled/anchored to that mandate's **ReviewRow** in **CriticGauntletPanel** |
| Collapsed default | Yes — critic sub-nodes hidden until the candidate is selected/hovered or "Expand evidence" is toggled (§7.4) |
| Dummy | `{ id:'cr-013-feas', type:'critic', data:{ mandate:'feasibility', score:3, confidence:0.7 } }` |

### 2.5 `CheckNode` — one subtype-check result (evidence sub-node)

| Property | Value |
|---|---|
| Size | 132 × 48 |
| Anatomy | Check-type label + pass/fail/skip glyph + score (if any) |
| Shows | `CheckResult.checkType`, `status` (passed/failed/skipped), `score?`, `skipReason?` |
| Status encoding (`ARCHITECTURE.md` §7) | `passed ✓ green` · `failed ✕ red` · `skipped – gray + reason` |
| Hover | Tooltip: check type, status, score, `skipReason` if skipped, output excerpt |
| Click | Opens **CandidateInspector** → **SubtypeCheckPanel** at that **CheckRow** |
| Special | The winner's executable transfer check is the **"execute live"** demo moment (`ARCHITECTURE.md` §7, `05`/`08` docs) — a CheckNode on the WinnerNode that can re-run live (or replay-backed). |
| Dummy | `{ id:'ck-013-exec', type:'check', data:{ checkType:'executable_transfer', status:'passed', score:0.81 } }` |

### 2.6 `ScoreNode` — the fitness verdict (evidence sub-node)

| Property | Value |
|---|---|
| Size | 156 × 56 |
| Anatomy | `total` as a prominent meter + the dominant component label + `policyVersion` tag (JetBrains Mono) |
| Shows | `FitnessScore.total`, top of `components{}`, `policyVersion`, hint of `explanation` |
| Status encoding | Meter fill (not hue alone); policy version always shown so a skeptic sees the scoring contract version |
| Hover | Tooltip: all `components{}` as mini bars, total, policyVersion, `explanation` first line |
| Click | Opens **CandidateInspector** → **FitnessBreakdown** (components{} bars + total + policyVersion + explanation) |
| Dummy | `{ id:'sc-013', type:'score', data:{ total:0.78, top:'novelty', policyVersion:'v0.3', components:{ grounding:0.7, novelty:0.66, feasibility:0.6, falsification:0.8, energy_eff:0.9 } } }` |

### 2.7 `WinnerNode` — the surviving best idea

A CandidateNode promoted to hero status; the visual destination of the whole run and the anchor for **S5 · Final Idea / Payoff**.

| Property | Value |
|---|---|
| Size | 280 × 120 (largest) |
| Anatomy | `♔` crown glyph + gold aura + title (2 lines) + the full mini evidence row (critics summary, checks ✓/✕/–, fitness total meter, novelty meter) + "Replay gauntlet ▷" affordance |
| Shows | The `selected` winning `CandidateIdea` + its proof at a glance |
| Status encoding | `selected ♔ gold`, persistent gold aura (the one node allowed a steady glow rather than a pulse) |
| Hover | Tooltip: "Winner of Gen N · beat gen-0 baseline by +X on held-out judge" |
| Click | Opens **CandidateInspector**; a secondary CTA jumps to **S5 / FinalIdeaProof / BestIdeaPanel** |
| Live | On `fitness.scored` that crowns it: camera glides to it (§6.6), aura blooms |
| Dummy | `{ id:'c2-031', type:'winner', data:{ label:'c2·031', title:'Mycelial backpressure → API rate-limit fairness', subtype:'cross_domain_transfer', fitnessTotal:0.91, novelty:0.74, checks:{passed:3,failed:0,skipped:0}, judgeDelta:'+0.50 vs gen-0' } }` |

---

## 3 · Edge types

Nine custom edge types in `edgeTypes`. Each is **shape/dash + color + (optional) label** so meaning survives a projector and colorblindness. Edge `type` maps 1:1 to `LineageGraphProjection.edges[].type` (`ARCHITECTURE.md` §10).

| Edge type | Connects | Visual | Color (token) | Label | Animated (live) |
|---|---|---|---|---|---|
| `spawned` | parent generation → child agenome (population seeding) | thin solid, small arrow | `--edge-spawn` slate | — | brief flow dash on spawn |
| `produced` | agenome → candidate | solid, medium | `--edge-produce` cyan | — | flow dash while `under_review` |
| `reviewed` | candidate → critic | hairline dotted | `--edge-review` indigo | — | pulse while critic runs |
| `checked` | candidate → check | hairline dashed | `--edge-check` teal | — | — |
| `scored` | candidate → score | hairline solid | `--edge-score` gray | — | brief on `fitness.scored` |
| `culled` | agenome/candidate → (tombstone) | dashed, fading, droops downward | `--edge-cull` muted gray | `culled` | fade+sink with node |
| **`fused`** | **two parents → one child** (the marquee edge) | **two converging glowing strands that braid into one before reaching the child; violet, thicker; double-stroke** | `--edge-fuse` violet | `fused` | **two-edges-converge animation (§6.5)** |
| `mutated` | single parent → child | wavy/sine `∿` stroke, shimmering | `--edge-mutate` amber | `mutated` | shimmer (§6.5) |
| `selected` | score/candidate → winner highlight | bold solid + glow | `--edge-select` gold | `selected` | glow bloom when crowned |

### 3.1 The fusion edge (special — the "it's the kernel that breeds the agents" moment)

Fusion is the structural heart (`ARCHITECTURE.md` §8, `ReproductionEvent.mode = fusion`). It MUST read instantly as **two parents → one child**, distinct from ordinary spawning.

- Rendered as a **custom React Flow edge** that takes **two source handles** (parent A, parent B) converging on **one target handle** (child). Implement as a custom edge component that draws two bezier strands meeting at a midpoint, then a single braided strand to the child.
- **Violet, double-stroked, glowing**; label `fused`; the child AgenomeNode carries the `⚇` two-parent glyph.
- On hover: tooltip shows `parentAgenomeIds[]`, `crossoverPoints`, `mutationSummary` (from `ReproductionEvent`), and "parent distance: 0.62" (fusion prefers distant lineages, `ARCHITECTURE.md` §8).
- **Degenerate case** (`<2` parents → `mutation_only`, `ARCHITECTURE.md` §3): falls back to a single `mutated` edge — never render a fake second parent.

```
   [G0·a0 ★]                [G0·a2 ★]
        ╲                      ╱
         ╲ ═══(violet glow)══ ╱     ← two strands converge
          ╲╲                ╱╱
           ╲╲══ braided ══╱╱
                 ║ fused
              [G1·a4 ⚇]              ← child with two-parent glyph
```

### 3.2 Edge labels & legend

Edge meanings live in **LineageLegend** (always-visible, collapsible panel in the graph corner) so a reviewer never has to decode a color. The legend mirrors this table: glyph + dash sample + word, grouped as **Lineage** (spawned/fused/mutated/selected) and **Evidence** (produced/reviewed/checked/scored/culled).

---

## 4 · Layout — Dagre (canonical)

> **Dagre is the canonical layout engine.** Generations are **ranks/tiers**; the graph is acyclic by construction (lineage points forward in time; `reproduction → next-generation` is a runtime handoff, not a graph cycle — `ARCHITECTURE.md` §2.5).

### 4.1 Layout contract

```ts
// layoutGraph(): pure, deterministic, swappable (Dagre default, ELK alt)
function layoutGraph(
  nodes: RFNode[],
  edges: RFEdge[],
  opts: { direction: 'TB' | 'LR'; collapseEvidence: boolean }
): { nodes: RFNode[]; edges: RFEdge[] }
```

Dagre config (default):

| Param | Value | Why |
|---|---|---|
| `rankdir` | `'TB'` (top→bottom) default; `'LR'` toggle | Tiers read as "time flows down" on a projector; LR for very tall runs |
| `ranker` | `'tight-tree'` | Compact tiers, stable for ~20 agenomes |
| `nodesep` | 28 | Within-tier spacing |
| `ranksep` | 96 | Between-generation spacing (room for fusion braids + edge labels) |
| `edgesep` | 14 | — |
| Node sizes | per §2 (explicit `width`/`height`) | Dagre needs box sizes to rank cleanly |

**Rank pinning:** generation index pins rank — all agenomes of gen N share a rank; their candidates sit a half-rank below within the same tier band (use a sub-rank or post-Dagre y-offset so candidates cluster under their agenome). Evidence sub-nodes (critic/check/score) are laid out *only when expanded*; collapsed, they don't enter Dagre at all (keeps the tree clean and fast — §7.4, §8).

**Determinism:** layout is a pure function of `(nodes, edges, direction, collapseEvidence)`. Same projection ⇒ same coordinates ⇒ stable replay & stable diffs. Layout runs in a worker-friendly pure call; never depends on wall-clock or render order.

### 4.2 Incremental layout under live growth

The graph grows as SSE events arrive. To avoid the whole tree "jumping" every event:

- New nodes are appended; **re-run Dagre debounced (~250ms)** or batch per `generation.completed`.
- Use Framer Motion layout animation so nodes **glide** from old → new coordinates rather than teleport.
- Keep the camera intent stable (don't auto-fit on every event; see §6.6 for the intentional camera moves).
- Persist the last layout in Zustand keyed by `sequenceThrough` so a resync (SSE reconnect) re-lays-out only the delta.

---

## 5 · Interactions

| Interaction | Trigger | Behavior |
|---|---|---|
| **Pan** | drag canvas / arrow keys | React Flow default; inertia off (projector calm) |
| **Zoom** | scroll / `+ −` controls / pinch | `minZoom 0.2`, `maxZoom 2`; zoom-to-cursor |
| **Fit** | `fit` button / `f` key | `fitView({ padding: 0.2, duration: 600 })` — eased, not instant |
| **Minimap** | bottom-right `MiniMap` | Node colors mirror status; click-to-jump; toggle with `m` |
| **Layout toggle** | `TB/LR` segmented control | re-runs `layoutGraph` with new direction, animated |
| **Hover** | node/edge | Radix **Tooltip** (shadcn) with the per-type tooltip content (§2/§3); 150ms delay; dismiss on leave |
| **Click node** | node body | Opens the matching **Inspector** (Candidate→S3, Agenome→S4); ScoreNode/CriticNode/CheckNode deep-link into the relevant Inspector panel/row |
| **Select** | click (single) | Sets Zustand `selectedNodeId`; focus ring; reveals contextual affordances (Isolate lineage, Expand evidence) |
| **Drill / expand evidence** | candidate "▾ evidence" / global "Expand evidence" | Mounts critic/check/score sub-nodes for that candidate (or all); re-layouts (§7.4) |
| **Focus / isolate lineage** | node menu "Isolate lineage" / `i` | Dims everything except the selected node's **ancestry + descendants** (the `LineagePathTrace`); the rest drops to 12% opacity. Mirrors **LineagePathTrace** in CandidateInspector |
| **Filter by status** | LineageLegend chips / filter bar | Toggle visibility/dimming of nodes by status (e.g. hide `culled`, spotlight `eligible_parent ★`) |
| **Filter by subtype** | `XFER` / `ZEIT` toggles | Dim/hide the other subtype's candidates — "show me only cross-domain transfers" |
| **Jump from sibling panel** | click a row in GenerationTimeline / ActivityTicker / FitnessOverTimeChart | Camera centers + selects the corresponding node (`setCenter` + select) |
| **Reduced motion** | OS setting | All animations degrade to instant state changes; camera moves become immediate `setCenter` (no easing) |

### 5.1 Selection model

Single-select drives the Inspectors. Multi-select is **not** in MVP. Selection is in **Zustand** (`selectedNodeId`, `focusedLineageId`, `filters`, `expandedCandidateIds`, `layoutDirection`) so it survives SSE re-renders and is shared with the Timeline/Ticker.

### 5.2 Read-only guarantee

There are **no** drag-to-connect, node-create, or node-delete affordances. React Flow is configured `nodesDraggable={false}` (layout is authoritative), `nodesConnectable={false}`, `elementsSelectable={true}`. The graph is an observatory, not an editor (`ARCHITECTURE.md` §12, §14 — UI never mutates authoritative state).

### 5.3 Isolate-lineage = the "defend the winner" tool

Selecting the **WinnerNode** and hitting **Isolate lineage** dims the population to just the winner's ancestry (gen-0 baseline → fusions → mutations → winner). This is the skeptic's tool and the `LineagePathTrace` made spatial — "show me exactly which agenomes bred this idea."

---

## 6 · Live animation choreography (Framer Motion)

> Motion is **meaningful, never decorative** (`ARCHITECTURE.md` §12 accessibility). Each animation maps to a real `RunEventType`. All respect `prefers-reduced-motion` (degrade to instant). Detailed easing tokens live in `05-status-encoding-and-motion.md`; this section binds them to the graph.

| Choreography | Triggering event | Motion | Duration | Notes |
|---|---|---|---|---|
| **Working overlay on** (§2.0) | any operation-start marker (`candidate.generation_started`, `critic.review_started`, `check.started`, `novelty.scoring_started`, `judge.review_started`, `fusion.started`, `tool_call.started`, generation phase markers) | op-type glyph fades + scales in (opacity 0→1, scale 0.8→1); the existing **active pulse** begins/continues (opacity 0.6↔1 loop) | 200ms in, then pulse loop | derived per-node, keyed by correlation IDs; the live "what is this agent doing right now" signal |
| **Working overlay off** (§2.0) | the paired completion (`candidate.created`, `critic.reviewed`, `check.completed`, `novelty.scored`, `fitness.scored`, `agenome.fused`, `tool_call.finished`, `generation.completed`) | op-type glyph fades + scales out; pulse stops (or continues only if other ops still in-flight); status badge cross-fades to the now-advanced lifecycle state | 200ms `easeOut` | clears exactly the op that completed; a node with multiple in-flight ops keeps pulsing until the last clears |
| **Spawn grow-in** | `agenome.spawned` / `candidate.created` | scale 0.6→1, opacity 0→1, slight upward settle | 350ms `easeOut` | new node "blooms" into the tier |
| **Energy drain** | `energy.spent` | EnergyMeter bar shrinks left; brief charge-spark; number ticks (JetBrains Mono) | 250ms | the light/charge metaphor that DRAINS |
| **Critic pulse** | `critic.reviewed` (and while `under_review`) | candidate node + `reviewed` edges pulse cyan (opacity 0.6↔1) | 1.2s loop until checked | the gauntlet "working" feel |
| **Cull fade + sink** | `lineage.culled` / candidate `culled` | opacity→0.15, translateY +18, desaturate, `culled` edge droops | 500ms `easeIn` | weak lineages "go dark" and sink |
| **Fusion converge** | `agenome.fused` | two parent strands draw inward and braid; child scales in at the braid point with `⚇` | 700ms staged (strands 0–450ms, child 350–700ms) | THE money animation (§3.1) |
| **Mutation shimmer** | `agenome.mutated` | `∿` edge shimmer sweep amber; child has a brief glint | 500ms | distinct from fusion |
| **Generation advance (camera)** | `generation.completed` → next `generation.started` | camera glides down to the new tier (`setCenter` to tier centroid, eased) + new GenerationNode band slides in | 800ms `easeInOut` | the "round N+1" reveal |
| **Winner crown** | `fitness.scored` that selects the best | WinnerNode `♔` pops, gold aura blooms, camera glides to it | 900ms | leads into S5 payoff |

### 6.1 Liveness budget

At ~20 agenomes × several candidates × evidence sub-nodes, do **not** animate everything simultaneously. Rules:
- Only nodes/edges **in the current viewport** animate fully; off-screen state changes apply instantly.
- Pulsing (critic) is capped to candidates currently `under_review` (typically the active generation only).
- Collapsed evidence sub-nodes don't animate (they aren't mounted — §7.4).
- A global "calm chrome, vivid organism" rule: chrome (header, panels) never animates during organism motion.

### 6.2 The working / in-flight choreography — start → working → cleared (§2.0)

The per-node working sub-state is its own small Framer-Motion lifecycle, distinct from the discrete spawn/cull/fuse animations above because it is **open-ended** (it lasts as long as the op is in-flight, not a fixed duration):

1. **start** — an operation-start marker arrives over SSE (`ARCHITECTURE.md` §4/§11). The reducer adds the op to the node's `inFlightOps` set; the **WorkingOverlay** mounts (`AnimatePresence`), its op-type glyph scales/fades in (200ms), and the node's active pulse loop runs.
2. **working** — the overlay persists while the op is in-flight; the active pulse loops (capped to in-viewport nodes per §6.1). No fixed duration — bounded only by the real op (and the run's caps/timeouts, `ARCHITECTURE.md` §5).
3. **cleared** — the paired completion event arrives; the reducer removes that op from `inFlightOps`; the overlay's `exit` runs (200ms fade/scale-out); if the set is now empty the pulse stops and the StatusBadge cross-fades to the advanced lifecycle state.

**Driven by SSE markers live; by the scrubber in replay.** Live, the choreography is driven purely by the SSE markers + completion events (`ARCHITECTURE.md` §4/§11) — never by a client timer. In **replay** (`08-replay-and-states.md`, §6.6) the identical choreography is **reproduced** from the persisted markers as the **ReplayScrubber** crosses each start/completion `sequence` — because the markers are persisted and replay-faithful (`ARCHITECTURE.md` §12), the fallback demo looks identical to live. Scrubbing **backward** un-applies in reverse: crossing back past a completion re-arms working, past a start removes it (the reducer is a pure function of events `≤ sequence`).

**Reduced motion:** the overlay still appears/clears (it is meaningful state, not decoration) but mounts/unmounts **instantly** with no scale/fade and no pulse — the op-type glyph + "working" label carry the signal (`prefers-reduced-motion`, §6, `ARCHITECTURE.md` §12).

### 6.6 Camera intent (not auto-fit spam)

The camera is **directed**, like a documentary. It moves only on: generation-advance, winner-crown, jump-from-sibling-panel, and explicit fit/isolate. It does **not** re-fit on every spawn (that would induce motion sickness on a projector). Replay (S6) drives the same camera moves off the scrubber position (`08-replay-and-states.md`).

---

## 7 · Density, collapsing & legibility

### 7.1 The count problem

A full run: ~20 agenomes, each 1–3 candidates, each candidate up to 5 critics + several checks + 1 score. Fully expanded that's potentially 200+ nodes — illegible on a projector. The graph defaults to **collapsed evidence**.

### 7.4 Three zoom-of-detail levels

| Level | Shows | Default |
|---|---|---|
| **L1 · Population** | Generations + agenomes + fusion/mutation/spawn edges only | the live default & projector default |
| **L2 · Candidates** | + candidates (`produced` edges) | auto when a generation is `verifying`/`scoring`, or on agenome select |
| **L3 · Evidence** | + critics/checks/score for a candidate (`reviewed`/`checked`/`scored` edges) | only for the selected/expanded candidate, or "Expand all evidence" |

Switching levels re-runs `layoutGraph` (animated). Evidence nodes are mounted/unmounted, not just hidden, so Dagre and React Flow stay fast (§8). A persistent **detail-level segmented control** (`L1 L2 L3`) sits next to the layout toggle.

### 7.5 Projector legibility

- Minimum on-canvas label size respects projector distance; labels hide below `zoom 0.5` (show only glyph + status), reappear above.
- High-contrast node chrome on the deep "evolutionary observatory" background; status glyphs are large.
- LineageLegend always reachable; nothing is color-only.

---

## 8 · Performance (~20-agenome populations)

Target: smooth on a laptop driving a projector, 10-minute live run, SSE-driven.

| Concern | Approach |
|---|---|
| Node count | L1/L2/L3 collapsing (§7.4) keeps mounted nodes typically <60; evidence mounted only on demand |
| Re-render storms | `nodeTypes`/`edgeTypes` defined **once** (module scope, not inline) — the classic React Flow perf trap. Memoize every custom node (`React.memo`); read node data via stable refs |
| Layout cost | Dagre on ~60 nodes is <10ms; debounce re-layout (~250ms) and prefer batching per `generation.completed`; layout is a pure function, cacheable by `sequenceThrough` |
| SSE volume | The **sequence-keyed SSE reducer** coalesces bursts; apply node/edge deltas, not full-graph replacement; React Flow `applyNodeChanges`/`applyEdgeChanges` for diffs |
| Animation cost | Animate only in-viewport nodes (§6.1); cap concurrent pulses; use transform/opacity (GPU) not layout-thrashing props; Framer Motion `layout` only where needed |
| Minimap | Lightweight node-color function; no per-frame recompute |
| Reconnect/resync | On SSE reconnect, resume from `lastEventId`/`sequence`; re-fetch `GET /runs/:id/lineage` seed if the gap is large, then resume the delta stream; re-layout only the delta |
| Memory | Unmount evidence sub-nodes when collapsed; cap ActivityTicker buffer separately (not in the graph) |

**Hard guardrail:** if node count ever spikes (e.g. "Expand all evidence" on a big run), warn and keep L1 as the safe default. The graph must never stutter during the live demo — degrade detail before dropping frames.

---

## 9 · Empty / loading / error / degraded / live / replay states

The graph participates in the canonical state set (`08-replay-and-states.md`); here is its graph-local rendering. All use the shared **EmptyState / LoadingState / ErrorState / DegradedState** components inside the graph canvas region.

| State | Graph rendering |
|---|---|
| **Loading** | Skeleton tiers (faint generation bands) + shimmer; "Reconstructing lineage…"; LoadingState centered |
| **Empty** (run configured, gen-0 not yet spawned) | A single faint gen-0 band with "Seeding population…" and the seed prompt echoed; EmptyState |
| **Live** | **ModeBanner = LIVE**; nodes animate per §6; footer `LIVE · seq ≤ N`; HealthIndicator-driven freshness dot near the footer (last-event age) |
| **Replay** | **ModeBanner = REPLAY** (unmistakable, persistent); graph state reconstructed at the **ReplayScrubber** position; camera/animations driven by scrub, not SSE; footer `REPLAY · seq ≤ N` (`S6`) |
| **Error** (lineage fetch failed) | ErrorState in canvas: "Couldn't load lineage" + retry; keep header/panels alive |
| **Degraded · novelty** (`novelty_scoring_degraded`) | NoveltyMeter pips on candidates show a "estimated/absent" hatch; a DegradedState ribbon: "Novelty degraded — fitness computed with novelty flagged" |
| **Degraded · provider** (`provider_call_failed` surge) | Affected agenomes/candidates show `failed △!`; DegradedState ribbon names the failing role; graph still renders everything that reached `created` |
| **Degraded · Langfuse off** | trace-link affordances in node tooltips disabled with "traces unavailable"; graph otherwise unaffected (non-authoritative) |
| **All culled** (zero survivors) | All agenomes `✕` faded+sunk; a DegradedState: "No survivors this generation" — but the tree still stands (legible failure) |

**LIVE vs REPLAY must be unmistakable at a glance** (`ARCHITECTURE.md` §12 accessibility): banner color/label + footer + animation source differ. A reviewer must never confuse a recorded run for a live one.

---

## 10 · Representative dummy data (~3-generation run)

A complete, prototype-ready fixture for a `cross_domain_transfer`-leaning run. Full fixtures live in `09-dummy-data-fixtures.md`; this is the graph slice. The story: gen-0 baseline (1 survivor) → gen-1 fuses two parents + one mutation → gen-2 produces the **winner**, beating the gen-0 baseline on the held-out judge.

### 10.1 Nodes (`LineageGraphProjection.nodes`, abbreviated)

```jsonc
[
  // ── GEN 0 ──
  { "id": "gen-0", "type": "generation", "label": "GEN 0", "status": "completed",
    "metrics": { "survivors": 1, "avgFitness": 0.41 } },
  { "id": "G0-a0", "type": "agenome", "label": "G0·a0", "status": "eligible_parent",
    "metrics": { "energySpent": 44, "energyBudget": 50, "candidateCount": 1 },
    "dataRef": "agenome:G0-a0" },                                  // ★ blue
  { "id": "G0-a1", "type": "agenome", "label": "G0·a1", "status": "culled",
    "metrics": { "energySpent": 50, "energyBudget": 50, "candidateCount": 1 } }, // ✕
  { "id": "G0-a2", "type": "agenome", "label": "G0·a2", "status": "eligible_parent",
    "metrics": { "energySpent": 39, "energyBudget": 50, "candidateCount": 1 } }, // ★
  { "id": "c0-001", "type": "candidate", "label": "c0·001", "status": "scored",
    "metrics": { "fitnessTotal": 0.41, "novelty": 0.52, "subtype": "cross_domain_transfer" },
    "dataRef": "candidate:c0-001" },
  { "id": "c0-004", "type": "candidate", "label": "c0·004", "status": "culled",
    "metrics": { "fitnessTotal": 0.22, "novelty": 0.30, "subtype": "zeitgeist_synthesis" } },

  // ── GEN 1 ──
  { "id": "gen-1", "type": "generation", "label": "GEN 1", "status": "completed",
    "metrics": { "survivors": 2, "avgFitness": 0.63 } },
  { "id": "G1-a4", "type": "agenome", "label": "G1·a4", "status": "reproduced",
    "metrics": { "energySpent": 38, "energyBudget": 50, "candidateCount": 2,
                 "parentIds": ["G0-a0","G0-a2"], "reproMode": "fusion" } },        // ⚇ violet
  { "id": "G1-a5", "type": "agenome", "label": "G1·a5", "status": "mutated",
    "metrics": { "energySpent": 41, "energyBudget": 50, "candidateCount": 1,
                 "parentIds": ["G0-a0"], "reproMode": "mutation_only" } },          // ∿ amber
  { "id": "c1-011", "type": "candidate", "label": "c1·011", "status": "rejected",
    "metrics": { "fitnessTotal": 0.48, "novelty": 0.40, "subtype": "cross_domain_transfer" } },
  { "id": "c1-013", "type": "candidate", "label": "c1·013", "status": "selected",
    "metrics": { "fitnessTotal": 0.78, "novelty": 0.66, "subtype": "cross_domain_transfer",
                 "title": "Slime-mold routing → datacenter cache eviction" },
    "dataRef": "candidate:c1-013" },                                               // ♔ gen-1 best
  { "id": "c1-017", "type": "candidate", "label": "c1·017", "status": "scored",
    "metrics": { "fitnessTotal": 0.59, "novelty": 0.71, "subtype": "zeitgeist_synthesis" } },

  // ── GEN 2 ──
  { "id": "gen-2", "type": "generation", "label": "GEN 2", "status": "completed",
    "metrics": { "survivors": 2, "avgFitness": 0.84 } },
  { "id": "G2-a9", "type": "agenome", "label": "G2·a9", "status": "reproduced",
    "metrics": { "energySpent": 36, "energyBudget": 50, "candidateCount": 1,
                 "parentIds": ["G1-a4","G1-a5"], "reproMode": "fusion" } },         // ⚇
  { "id": "G2-a10", "type": "agenome", "label": "G2·a10", "status": "spent",
    "metrics": { "energySpent": 50, "energyBudget": 50, "candidateCount": 1 } },    // ○
  { "id": "c2-031", "type": "winner", "label": "c2·031", "status": "selected",
    "metrics": { "fitnessTotal": 0.91, "novelty": 0.74, "subtype": "cross_domain_transfer",
                 "title": "Mycelial backpressure → API rate-limit fairness",
                 "judgeDelta": "+0.50 vs gen-0" },
    "dataRef": "candidate:c2-031" },                                               // ♔ WINNER

  // ── evidence sub-nodes for the winner (mounted at L3) ──
  { "id": "cr-031-gnd",  "type": "critic", "label": "GND",  "status": "checked",
    "metrics": { "mandate": "factual_grounding", "score": 4, "confidence": 0.8 } },
  { "id": "cr-031-nov",  "type": "critic", "label": "NOV",  "status": "checked",
    "metrics": { "mandate": "novelty_prior_art", "score": 4, "confidence": 0.7 } },
  { "id": "cr-031-feas", "type": "critic", "label": "FEAS", "status": "checked",
    "metrics": { "mandate": "feasibility", "score": 4, "confidence": 0.75 } },
  { "id": "cr-031-fals", "type": "critic", "label": "FALS", "status": "checked",
    "metrics": { "mandate": "falsification", "score": 5, "confidence": 0.7 } },
  { "id": "cr-031-sub",  "type": "critic", "label": "SUB",  "status": "checked",
    "metrics": { "mandate": "subtype_specific", "score": 4, "confidence": 0.8 } },
  { "id": "ck-031-exec", "type": "check", "label": "exec-transfer", "status": "passed",
    "metrics": { "checkType": "executable_transfer", "score": 0.81 } },            // ✓ "execute live"
  { "id": "ck-031-prior","type": "check", "label": "prior-art", "status": "passed",
    "metrics": { "checkType": "prior_art_distance", "score": 0.74 } },             // ✓
  { "id": "sc-031", "type": "score", "label": "fitness", "status": "scored",
    "metrics": { "total": 0.91, "policyVersion": "v0.3", "top": "falsification",
                 "components": { "grounding": 0.8, "novelty": 0.74,
                                 "feasibility": 0.78, "falsification": 1.0, "energy_eff": 0.88 } } }
]
```

### 10.2 Edges (`LineageGraphProjection.edges`, abbreviated)

```jsonc
[
  // gen-0 population + production
  { "id": "e1", "source": "gen-0", "target": "G0-a0", "type": "spawned" },
  { "id": "e2", "source": "gen-0", "target": "G0-a1", "type": "spawned" },
  { "id": "e3", "source": "gen-0", "target": "G0-a2", "type": "spawned" },
  { "id": "e4", "source": "G0-a0", "target": "c0-001", "type": "produced" },
  { "id": "e5", "source": "G0-a1", "target": "c0-004", "type": "produced" },
  { "id": "e6", "source": "c0-004", "target": "G0-a1", "type": "culled", "label": "culled" },

  // gen-0 → gen-1 reproduction
  { "id": "e7", "source": "G0-a0", "target": "G1-a4", "type": "fused", "label": "fused" },   // parent A
  { "id": "e8", "source": "G0-a2", "target": "G1-a4", "type": "fused", "label": "fused" },   // parent B → SAME child = the two-parent braid
  { "id": "e9", "source": "G0-a0", "target": "G1-a5", "type": "mutated", "label": "mutated" },

  // gen-1 production + selection
  { "id": "e10", "source": "G1-a4", "target": "c1-011", "type": "produced" },
  { "id": "e11", "source": "G1-a4", "target": "c1-013", "type": "produced" },
  { "id": "e12", "source": "G1-a5", "target": "c1-017", "type": "produced" },
  { "id": "e13", "source": "c1-013", "target": "c1-013", "type": "selected", "label": "selected" },

  // gen-1 → gen-2 reproduction (fusion of two gen-1 survivors)
  { "id": "e14", "source": "G1-a4", "target": "G2-a9", "type": "fused", "label": "fused" },
  { "id": "e15", "source": "G1-a5", "target": "G2-a9", "type": "fused", "label": "fused" },
  { "id": "e16", "source": "gen-2", "target": "G2-a10", "type": "spawned" },

  // gen-2 winner + evidence (L3)
  { "id": "e17", "source": "G2-a9", "target": "c2-031", "type": "produced" },
  { "id": "e18", "source": "c2-031", "target": "cr-031-gnd",  "type": "reviewed" },
  { "id": "e19", "source": "c2-031", "target": "cr-031-nov",  "type": "reviewed" },
  { "id": "e20", "source": "c2-031", "target": "cr-031-feas", "type": "reviewed" },
  { "id": "e21", "source": "c2-031", "target": "cr-031-fals", "type": "reviewed" },
  { "id": "e22", "source": "c2-031", "target": "cr-031-sub",  "type": "reviewed" },
  { "id": "e23", "source": "c2-031", "target": "ck-031-exec", "type": "checked" },
  { "id": "e24", "source": "c2-031", "target": "ck-031-prior","type": "checked" },
  { "id": "e25", "source": "c2-031", "target": "sc-031",      "type": "scored" },
  { "id": "e26", "source": "sc-031", "target": "c2-031",      "type": "selected", "label": "selected" }
]
```

> **Fusion read-out:** edges `e7+e8` (two parents → `G1-a4`) and `e14+e15` (two parents → `G2-a9`) are the two fusion events. The custom `fused` edge component detects that **two edges target the same child** and renders the converging braid (§3.1); the child shows `⚇`. Edge `e9` is the lone `mutated` (`∿`) edge.

### 10.3 Projection envelope

```jsonc
{ "runId": "run-7f3a", "sequenceThrough": 1842, "nodes": [ /* §10.1 */ ], "edges": [ /* §10.2 */ ] }
```

This fixture, loaded into a React Flow + Dagre prototype with the `nodeTypes`/`edgeTypes` of §2–§3, renders the full 3-generation organism — gen-0 baseline → two fusions + a mutation → the crowned winner `c2·031` — with no backend.

---

## 11 · Component contract (for the design-system kit)

The graph is delivered as **LineageGraph** + a small family, all in `04-components-catalog.md`. Props are derived from `LineageGraphProjection` + view state:

```tsx
<LineageGraph
  projection={LineageGraphProjection}      // nodes/edges/sequenceThrough
  mode="live" | "replay"                    // drives ModeBanner + animation source
  detailLevel="L1" | "L2" | "L3"
  layoutDirection="TB" | "LR"
  filters={{ status?: AgenomeStatus[]; subtype?: Subtype[] }}
  selectedNodeId={string | null}
  focusedLineageId={string | null}          // isolate-lineage
  onSelectNode={(node) => void}             // → open Inspector (S3/S4)
  onJumpRequest={(nodeId) => void}          // from Timeline/Ticker/Chart
/>
```

Siblings: **LineageLegend** (edge/node key), **MiniMap** (React Flow), **DetailLevelControl** (`L1 L2 L3`), **LayoutDirectionToggle** (`TB/LR`), and the node/edge component set registered in `nodeTypes`/`edgeTypes`. The graph emits selection up; the parent (S2/S6 shell) owns the Inspectors and Zustand view state.

---

## 12 · Cross-references

- **Screens & shell:** `03-screens-S0-S6.md` (S2 Organism View, S6 Replay — graph placement, RunHeader, surrounding panels).
- **Status & motion tokens:** `05-status-encoding-and-motion.md` (the canonical glyph/shape/color table + easing curves this doc binds to).
- **Components:** `04-components-catalog.md` (LineageGraph, StatusBadge, EnergyMeter, NoveltyMeter, FitnessBreakdown, the Inspectors).
- **Evidence panels (Inspector contents):** `07-charts-and-evidence-panels.md` (CriticGauntletPanel, SubtypeCheckPanel, FitnessBreakdown, FitnessOverTimeChart, GenerationComparison).
- **Replay & states:** `08-replay-and-states.md` (ReplayScrubber drives §6 camera/animation; the full state matrix).
- **Fixtures:** `09-dummy-data-fixtures.md` (the full run fixture this graph slice belongs to).
- **In-flight observability (§2.0/§6.2):** `ARCHITECTURE.md` §4 ("Live in-flight observability" — the operation-start markers), §11 (SSE carries markers + `GET /runs/:id/health` operations-in-flight), §12 ("Real-time in-flight window" — per-node working sub-state), §13 (three layers: events · kernel logs/health · Langfuse), Appendix A `RunEventType` (the canonical marker set).
- **Ground truth:** `ARCHITECTURE.md` §10 (`LineageGraphProjection`), §3 (state machines + status unions), §8 (fusion/mutation/cull), §11 (`GET /runs/:id/lineage`), §12 (read-only dashboard), Appendix A (`Agenome`, `CandidateIdea`, `CriticReview`, `CheckResult`, `NoveltyScore`, `FitnessScore`, `ReproductionEvent`, `CullingEvent`, `LineageGraphProjection`).
