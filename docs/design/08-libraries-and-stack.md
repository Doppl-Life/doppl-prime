# 08 · Canonical Libraries + Stack

> **Purpose:** Lock the front-end stack so the clickable **dummy prototype** is built on the *same* libraries the eventual `apps/web` build will use — every component the design session ships is canon, not throwaway.

**Related:** `01-overview-and-personas.md` · `02-information-architecture-and-screens.md` · `03-design-system-and-tokens.md` · `04-lineage-graph-spec.md` · `05-liveness-and-motion.md` · `06-status-encoding-and-accessibility.md` · `07-data-and-state-model.md` · `09-screens-and-flows.md` · `10-dummy-data-fixtures.md` (cross-link these by filename throughout).

---

## 0 · TL;DR — the canonical stack at a glance

| Concern | Canonical library | Used by (screens / components) | Prototype vs. production |
|---|---|---|---|
| Framework | **React 19 + Vite + TypeScript** | everything (`AppShell` down) | same; prototype targets the exact `apps/web` toolchain |
| Lineage graph | **React Flow `@xyflow/react`** | `LineageGraph` on **S2 · Organism View** / **S6 · Replay Mode** | same lib; prototype feeds it fixtures, prod feeds it `GET /runs/:id/lineage` |
| Graph auto-layout | **Dagre `@dagrejs/dagre`** (ELK alt) | `LineageGraph` generational tiers | same; deterministic layout either way |
| Design kit + primitives | **Tailwind CSS + shadcn/ui (Radix)** + **lucide-react** | all chrome, `StatusBadge`, drawers, modals | same; tokens in `03-design-system-and-tokens.md` |
| Charts | **Recharts** (visx as power-alt) | `FitnessOverTimeChart`, `GenerationComparison` | same; prototype passes static series |
| Liveness / motion | **Framer Motion (`motion`)** | spawn / drain / pulse / cull / fuse / mutate / gen-advance | same; prototype scripts a timeline, prod reacts to SSE |
| REST projections | **TanStack Query** | `RunsHome`, header, inspectors | prototype mocks fetchers; prod hits §11 REST |
| Live events | **sequence-keyed SSE reducer** (custom) + **EventSource / `@microsoft/fetch-event-source`** | `ActivityTicker`, all live deltas | prototype replays a canned event array on a timer; prod connects `GET /runs/:id/stream` |
| View state | **Zustand** | selection, drawer open/close, scrubber, mode | identical |
| Types / validation | **Zod** (from `packages/contracts`) | every projection + event payload | prototype imports the same Zod schemas to type fixtures |
| Fonts | **Inter** (UI) + **JetBrains Mono** (genome text, IDs, energy) | global | identical |

**The one rule that governs this whole doc:** the prototype is *fixture-fed canon*. It uses the production libraries against **dummy data** (see `10-dummy-data-fixtures.md`). Production swaps the data source — not the libraries.

---

## 1 · React 19 + Vite + TypeScript — the framework floor

**Why canonical.** `apps/web` is React 19 + Vite + TS (matches the monorepo). React 19's concurrent rendering + transitions suit a UI that mutates hundreds of nodes as SSE events stream in; Vite gives instant HMR for a fast design loop; TS + Zod give the prototype real type-safety against `packages/contracts` so a screen that compiles against fixtures will compile against the real API.

**Used by.** `AppShell` and every screen **S0–S6**, every canonical component.

**Prototype vs. production.** Same toolchain. The prototype keeps a single `USE_FIXTURES` flag at the data boundary (`07-data-and-state-model.md`); flipping it points the *same* components at the §11 API. No component code changes.

**Do / Don't**
- **Do** write components against typed props derived from Zod schemas, never against `any`.
- **Don't** introduce Next.js, Remix, CRA, or a second bundler — Vite is canonical and the demo is a local SPA (no SSR, no public URL, no auth build — ARCHITECTURE §15).

---

## 2 · React Flow (`@xyflow/react`) — CANONICAL for `LineageGraph`

**Why canonical.** ARCHITECTURE.md §2 and §12 name React Flow as the lineage renderer. The `LineageGraph` is the **heart of S2** — a generational family tree of `generation → agenome → candidate → critic/check/score → winner` with fusion edges crossing from two parents to a child. React Flow gives custom node types, typed edges, zoom/pan/fit-to-view, and a minimap out of the box. Full spec lives in `04-lineage-graph-spec.md`; this section pins the *library choice*.

**Used by.**
- **S2 · Organism View** (live) and **S6 · Replay Mode** (same layout, REPLAY banner).
- Node types map 1:1 to canonical components: `GenerationNode`, `AgenomeNode`, `CandidateNode`, `CriticNode`, `CheckNode`, `ScoreNode`, `WinnerNode`.
- Edge types map to lineage edges: `spawned`, `produced`, `reviewed`, `checked`, `scored`, `culled`, `fused`, `mutated`, `selected` (ARCHITECTURE §10 `LineageGraphProjection`).
- `LineageLegend` decodes node/edge glyphs; `LineagePathTrace` (in `CandidateInspector` / `AgenomeInspector`) highlights an ancestry sub-path *within* the same React Flow instance.

**Layout sketch (React Flow canvas inside S2):**

```
S2 · Organism View  ── LineageGraph (React Flow) ─────────────────────────┐
                                                                          │
 gen 0        gen 1            gen 2              gen 3 (LIVE ◐)           │
 [G0]──spawn──►(A0)──produce──►[C0]──reviewed──►(◐ critic council)        │
   │            ★ eligible        │                                       │
   │            │   ╲ fused       ▼ scored ♔ selected → ───► [WINNER ♔]   │
   └─spawn──►(A1)─────►(child A4 ⚇)──produce──►[C7]──checked──►✓          │
                  ╱(two parents converge — fusion edge)                   │
  [minimap ▢]                                    [zoom −  fit ⤢  + ]      │
└──────────────────────────────────────────────────────────────────────-─┘
```

**Prototype vs. production.** Prototype builds `nodes[]` / `edges[]` from a static `LineageGraphProjection` fixture (carrying a `sequenceThrough` high-water mark, per §10). Production binds the same node/edge arrays to `GET /runs/:id/lineage` + incremental SSE deltas reduced into the store. The node/edge React components are byte-identical between the two.

**Do / Don't**
- **Do** use React Flow custom node types so every node renders its `StatusBadge` (shape + icon + label + color — `06-status-encoding-and-accessibility.md`).
- **Do** carry `sequenceThrough` on the graph so live and replay stay consistent.
- **Don't** swap in Cytoscape, vis-network, D3-force, or react-d3-tree. **React Flow is canonical** — a different graph lib means the prototype is throwaway.
- **Don't** hand-roll fusion as a single edge; render **two `fused` edges converging** on the child `AgenomeNode` (the wow moment — see `05-liveness-and-motion.md`).

---

## 3 · Dagre (`@dagrejs/dagre`) — deterministic generational layout

**Why canonical.** The lineage is a *generational tree* — generations are tiers. Dagre gives a deterministic layered layout (left-to-right or top-down), which keeps the graph legible at projector distance and stable across re-renders as new nodes spawn (no jitter). ELK is the documented alternative for denser graphs; Dagre is the default.

**Used by.** `LineageGraph` only — runs before React Flow paints, assigning `(x,y)` to each node so generations form clean tiers and fusion edges read as crossings between adjacent tiers.

**Layout intent.**
```
rankdir = LR  (or TB)        rank = generation index
gen0 │ gen1 │ gen2 │ gen3
 ◌   │  ◐   │  ★   │  ⚇   ← agenomes within a tier, ranksep keeps tiers apart
```

**Prototype vs. production.** Identical. Layout is a pure function of the node/edge set; given the same fixture or the same API projection, Dagre produces the same coordinates. Prototype can pre-bake coordinates for the canned demo to guarantee a pixel-stable showcase.

**Do / Don't**
- **Do** keep `rankdir` and `nodesep`/`ranksep` as design tokens so the design session can tune tier spacing.
- **Don't** use React Flow's free-form drag as the *primary* layout — Dagre owns placement; manual drag is an inspect-time affordance only.
- **Don't** introduce a force-directed layout — generations must read as ordered tiers, not a blob.

---

## 4 · Tailwind CSS + shadcn/ui (Radix) + lucide-react — the design kit

**Why canonical.** Tailwind drives the token system (`03-design-system-and-tokens.md`) — the dark "bioluminescent lab" palette, projector-legible type scale, spacing — as utility classes and CSS variables. shadcn/ui (copy-in components over Radix primitives) gives accessible, ownable building blocks for the overlay-heavy IA: **Dialog** (S1 launcher modal), **Drawer/Sheet** (`CandidateInspector`, `AgenomeInspector`), **Tabs** (inspector sections), **Tooltip** (node hovers), **Slider** (`ReplayScrubber`, `CapsControl`), **Badge** (`StatusBadge` base). lucide-react supplies the icon set used in the status encoding.

**Used by.**
- `AppShell`, `RunHeader`, `ModeBanner` — chrome + layout via Tailwind.
- `StatusBadge` — Tailwind variants + lucide icon, the colorblind-safe shape+icon+label+color primitive used in *every* node and panel.
- `CandidateInspector` / `AgenomeInspector` — shadcn **Drawer/Sheet** + **Tabs**.
- `RunLauncherForm` (`PromptSourcePicker`, `SubtypeToggle`, `CapsControl`, `ModelProfileSelect`) — shadcn form controls + **Slider** for caps with hard-max.
- `ReplayScrubber` — shadcn **Slider** (seek) + buttons (play/pause/speed).
- `CriticGauntletPanel` / `SubtypeCheckPanel` rows, `EmptyState` / `LoadingState` / `ErrorState` / `DegradedState`.

**Prototype vs. production.** Identical. shadcn components are vendored into the repo, so prototype and production share the *same source files*. Only the data wired into them differs.

**Do / Don't**
- **Do** express the status palette as CSS variables / Tailwind theme tokens so color is never hard-coded in a node.
- **Do** use Radix primitives for all overlays — they give focus-trap, ESC-to-close, and ARIA for free (projector + a11y rules).
- **Don't** pull in MUI, Chakra, Ant, or Bootstrap — they fight the token system and bloat the bundle. shadcn + Tailwind is canonical.
- **Don't** encode status with color alone; the `StatusBadge` always carries shape + icon + label.

---

## 5 · Recharts — `FitnessOverTimeChart` + `GenerationComparison`

**Why canonical.** The generational-improvement claim — *gen N+1 beats gen N* — is proven by a fitness curve that visibly climbs. Recharts is declarative, composable, and good enough at projector scale; visx is the documented power-alternative if a custom render is needed. The charts are evidence, not decoration.

**Used by.**
- `FitnessOverTimeChart` (S2 / S6) — line/area of best & mean fitness per generation, with a gen-0 baseline reference line and a marker on the winning generation.
- `GenerationComparison` (S5 · Final Idea / Payoff, also S2) — grouped bars comparing gen-0 baseline vs. winner across `FitnessScore.components{}`.

**Sketch:**
```
FitnessOverTimeChart                    GenerationComparison (gen0 ▮ vs winner ▮)
 fitness ▲                              grounding   ▮▮▮▮ / ▮▮▮▮▮▮▮▮
 0.9 ┤            ╭──● winner ♔         novelty     ▮▮   / ▮▮▮▮▮▮
 0.6 ┤        ╭──╯                      feasibility ▮▮▮  / ▮▮▮▮▮▮▮
 0.3 ┤── baseline ─ ─ ─ ─ ─            falsifiabl. ▮▮   / ▮▮▮▮▮
     gen0 1   2   3   4 →               (policyVersion: scoring-v3)
```

**Prototype vs. production.** Prototype passes a static `series[]` fixture (see `10-dummy-data-fixtures.md`); production derives the same series from the lineage/score projections. Same chart components, same axes/tokens.

**Do / Don't**
- **Do** always render the **gen-0 baseline** reference so the climb is unmistakable.
- **Do** label `policyVersion` near the chart — fitness is only comparable within one scoring policy (Appendix A `FitnessScore`).
- **Don't** swap to Chart.js / Nivo / ECharts — Recharts (visx alt) is canonical.

---

## 6 · Framer Motion (`motion`) — liveness is the soul

**Why canonical.** Liveness is the product. The emotional arc (seed → bloom → spend → critique → cull → **fuse** → climb → reveal) only lands if the population *visibly* moves. Framer Motion drives the canonical choreography: spawn grow-in, energy drain, critic pulse, cull fade+sink, fusion two-edges-converge, mutation shimmer, generation advance. Full timings/easings in `05-liveness-and-motion.md`; this section pins the library.

**Used by.**
- `LineageGraph` nodes/edges — spawn (scale/opacity in), `active` pulse (`◐` cyan), `culled` fade+sink, `reproduced` fusion-edge converge, `mutated` shimmer.
- `EnergyMeter` / `RunEnergyGauge` — the drain animation (light/charge metaphor).
- `ActivityTicker` — new-event slide-in.
- `GenerationTimeline` — advance transition between generations.
- `CriticNode` / `CriticGauntletPanel` — review pulse while `under_review`.

**Prototype vs. production.** Same library. The prototype drives motion from a **scripted timeline** (a canned event array advanced on a timer) so the showcase is rehearsable and pixel-stable; production triggers the *same* animations from real SSE deltas via the reducer. The animation definitions don't change — only what fires them.

**Do / Don't**
- **Do** gate all motion behind `prefers-reduced-motion`; provide an instant non-animated path (a11y rule).
- **Do** keep motion *meaningful* — every animation maps to a state transition in the status encoding.
- **Don't** add GSAP, react-spring, or Lottie — Framer Motion is canonical, one motion system.
- **Don't** animate for decoration; idle chrome stays calm, the organism is what moves.

---

## 7 · Data layer — TanStack Query + sequence-keyed SSE reducer + Zustand + Zod

The data layer is the seam where "prototype" and "production" diverge — and the *only* seam. See `07-data-and-state-model.md` for the full store shape.

### 7.1 TanStack Query — REST projections
**Why canonical.** Caching, refetch, loading/error states for the read-only REST projections (the §11 query endpoints). Drives the `LoadingState` / `ErrorState` of list and detail views.
**Used by.** `S0 · Runs Home` (`GET /runs`), `RunHeader` + run shell (`GET /runs/:id`), `CandidateInspector` (`GET /runs/:id/candidates/:cid`), `HealthIndicator` (`GET /runs/:id/health`), `ModelProfileSelect` (`GET /model-routes`), `LineageGraph` initial load (`GET /runs/:id/lineage`), Replay (`GET /runs/:id/replay`, `GET /runs/:id/events`).
**Prototype vs. production.** Prototype provides mock `queryFn`s that resolve fixtures (optionally with a fake latency for `LoadingState`); production points the same `useQuery` hooks at fetchers against §11. Query keys are identical.

### 7.2 Sequence-keyed SSE reducer (custom) + EventSource / `@microsoft/fetch-event-source`
**Why canonical.** SSE is delivery-only and non-authoritative (ARCHITECTURE §11); clients resume from `lastEventId` (the event `sequence`). A custom reducer keyed by `sequence` de-dupes, orders, and resyncs after a gap — turning the event stream into the live store that powers every delta. `@microsoft/fetch-event-source` is preferred over raw `EventSource` when headers / POST-style reconnection control are needed; both are acceptable.
**Used by.** `ActivityTicker` (live event feed), all live `LineageGraph` deltas, `GenerationCounter`, `RunEnergyGauge`, `HealthIndicator` (last-event age), `BestIdeaPanel` updates, and the LIVE-mode liveness animations (§6).
**Prototype vs. production.** Prototype feeds the reducer a **canned ordered event array** advanced on a timer (the rehearsable showcase script); production connects `GET /runs/:id/stream` and feeds real events into the *same* reducer. The reducer code is identical — it doesn't know or care about the source. This is what makes the prototype canonical rather than disposable.

### 7.3 Zustand — view state
**Why canonical.** Ephemeral UI state that isn't server data: selected node, which inspector is open (`CandidateInspector` vs `AgenomeInspector`), scrubber position/speed (`ReplayScrubber`), LIVE vs REPLAY mode (`ModeBanner`), graph zoom/filter. Lightweight, no boilerplate.
**Used by.** Selection + drill across `LineageGraph`/inspectors, `ReplayScrubber`, `ModeBanner`, degraded-state flags.
**Prototype vs. production.** Identical.

### 7.4 Zod (from `packages/contracts`) — types + validation
**Why canonical.** ARCHITECTURE Appendix A models (`Agenome`, `CandidateIdea`, `CrossDomainTransferPayload`, `ZeitgeistSynthesisPayload`, `CriticReview`, `CheckResult`, `NoveltyScore`, `FitnessScore`, `EnergyEvent`, `RunCaps`, `LineageGraphProjection`) are defined as Zod schemas in `packages/contracts`. The prototype imports the **same schemas** to type and validate its fixtures — guaranteeing fixture shape == API shape.
**Used by.** Every projection and event payload; fixture authoring in `10-dummy-data-fixtures.md`.
**Prototype vs. production.** Prototype validates fixtures with the schemas at author time; production validates inbound API/SSE payloads at the boundary. Same schemas, same `z.infer<>` types.

**Do / Don't (data layer)**
- **Do** keep all I/O behind the data seam so flipping `USE_FIXTURES` is the *only* change between prototype and production.
- **Do** key the SSE reducer by `sequence` and support resync from `lastEventId`.
- **Don't** reach for Redux/MobX/Recoil/Apollo — TanStack Query + Zustand + a custom SSE reducer is canonical.
- **Don't** let the UI mutate authoritative state by any path other than the two POST commands (§7.6).

---

## 8 · Fonts — Inter + JetBrains Mono

**Why canonical.** Inter is the UI face — high legibility at projector distance for chrome, labels, panels. JetBrains Mono is the monospace face for genome text (`Agenome.systemPrompt`, `personaWeights`), IDs (run/agenome/candidate), and **energy numbers** (`doppl_energy`, estimate/actual) — fixed-width keeps numeric columns aligned in `EnergyMeter` / `RunEnergyGauge` and IDs scannable in inspectors.
**Used by.** Global. Mono specifically in `AgenomeInspector`, `CandidateInspector` payload dumps, `EnergyMeter`/`RunEnergyGauge`, and any node/ID label.
**Prototype vs. production.** Identical (self-hosted or `@fontsource`).
**Do / Don't** — **Do** use mono for anything numeric/identifier/genome-code. **Don't** add a third display font.

---

## 9 · The read-only API surface the prototype mocks

The prototype mocks exactly the ARCHITECTURE §11 surface. The UI **never mutates authoritative state** except via the two POSTs; everything else is a read projection or the SSE stream.

| Method | Endpoint | Feeds | Mocked by (prototype) |
|---|---|---|---|
| `GET` | `/runs` | `S0 · Runs Home` list | `fixtures/runs.json` |
| `POST` | `/runs` | `S1 · Run Launcher` Start (`config`, `caps`) | returns a fake `runId`, then plays the canned event script |
| `GET` | `/runs/:id` | `RunHeader`, run shell | `fixtures/run-{id}.json` |
| `POST` | `/runs/:id/stop` | `StopButton` | flips fixture run status to `stopped` |
| `GET` | `/runs/:id/events` | Replay reconstruction | `fixtures/events-{id}.json` (ordered by `sequence`) |
| `GET` | `/runs/:id/stream` *(SSE)* | live deltas, `ActivityTicker`, liveness | timer replays the canned event array into the SSE reducer |
| `GET` | `/runs/:id/lineage` | `LineageGraph` initial paint | `fixtures/lineage-{id}.json` (`LineageGraphProjection` w/ `sequenceThrough`) |
| `GET` | `/runs/:id/replay` | `S6 · Replay Mode` | `fixtures/replay-{id}.json` |
| `GET` | `/runs/:id/health` | `HealthIndicator` (gen, in-flight, last-event age, caps consumed) | `fixtures/health-{id}.json` |
| `GET` | `/runs/:id/candidates/:cid` | `CandidateInspector` full evidence | `fixtures/candidate-{cid}.json` |
| `GET` | `/model-routes` | `ModelProfileSelect` in `RunLauncherForm` | `fixtures/model-routes.json` |

> **Boundary rule:** only `POST /runs` and `POST /runs/:id/stop` are commands. Everything else is read-only. The prototype must reflect this — reviewers (read-only persona) never see a mutating control.

---

## 10 · Representative dummy data (shape, not exhaustive)

Full fixture set lives in `10-dummy-data-fixtures.md`; these stubs show the canonical shapes (typed by the §7.4 Zod schemas) so screens can be built without a backend.

```jsonc
// GET /runs  → Runs Home (S0)
[
  { "id": "run_7Q2", "title": "Materials × Logistics transfer sprint",
    "status": "live", "generationReached": 3, "mode": "live",
    "bestIdeaPreview": "Apply annealing schedules to last-mile routing",
    "subtypes": ["cross_domain_transfer", "zeitgeist_synthesis"] },
  { "id": "run_5Kp", "title": "Climate-fintech zeitgeist run",
    "status": "completed", "generationReached": 5, "mode": "replay",
    "bestIdeaPreview": "Carbon-debt instruments for SMB lenders" }
]
```

```jsonc
// GET /runs/:id/health  → HealthIndicator (continue-vs-switch signal)
{ "currentGeneration": 3, "candidatesInFlight": 4,
  "lastEventAgeMs": 1200, "capsConsumed": {
    "population": "18/20", "generations": "3/5", "energy": "62%",
    "spawnDepth": "2/3", "toolCalls": "140/300", "wallClockMs": "418000/600000" } }
```

```jsonc
// one SSE frame (sequence-keyed reducer input)
// id: <sequence>  event: candidate.scored
{ "sequence": 482, "runId": "run_7Q2", "type": "candidate.scored",
  "candidateId": "cand_31", "fitness": { "total": 0.81,
    "components": { "grounding": 0.9, "novelty": 0.7, "feasibility": 0.85, "falsification": 0.78 },
    "policyVersion": "scoring-v3", "explanation": "Strong grounding; novelty capped by prior art." } }
```

```jsonc
// GET /runs/:id/candidates/:cid  → CandidateInspector (cross_domain_transfer)
{ "id": "cand_31", "subtype": "cross_domain_transfer", "status": "selected",
  "title": "Annealing schedules → last-mile routing",
  "summary": "Map simulated-annealing temperature decay onto dynamic route re-planning.",
  "claims": ["Reduces re-route thrash", "Bounded compute per tick"],
  "subtypePayload": { "sourceDomain": "metallurgy", "sourceTechnique": "simulated annealing",
    "targetDomain": "logistics", "targetProblem": "last-mile re-routing",
    "transferMapping": "temperature ↦ exploration radius",
    "expectedMechanism": "cooling reduces churn as routes stabilize",
    "executableCheckIdea": "simulate 1k stops, compare vs greedy" },
  "critics": [
    { "mandate": "feasibility", "scores": { "feasibility": 0.85 }, "confidence": 0.8,
      "critique": "Compute bound holds for ≤2k stops.", "evidenceRefs": ["trace:lf_abc"] }
  ],
  "checks": [ { "checkType": "executable_sim", "status": "passed", "score": 0.88,
    "output": "12% fewer re-routes vs greedy", "skipReason": null } ],
  "novelty": { "score": 0.7, "method": "embedding-cosine", "comparisonSet": "gen0..gen2",
    "explanation": "Near-novel; one adjacent prior idea." },
  "fitness": { "total": 0.81, "components": { "grounding":0.9,"novelty":0.7,"feasibility":0.85,"falsification":0.78 },
    "policyVersion": "scoring-v3", "explanation": "Selected as gen-3 winner." },
  "energy": { "eventType": "llm", "estimate": 1200, "actual": 1340, "doppl_energy": 1340 },
  "lineagePath": ["G0","A1","A4(⚇ fused A0×A1)","cand_31"] }
```

> See `10-dummy-data-fixtures.md` for the `zeitgeist_synthesis` payload, the full `Agenome` fixture (for `AgenomeInspector`), `model-routes`, and the canned event-script array that drives the SSE reducer + Framer Motion timeline.

---

## 11 · Master Do / Don't (the canon contract)

**Do**
- Build the prototype on the **exact** libraries above so it graduates into `apps/web`.
- Keep the single data seam (`USE_FIXTURES`) as the *only* difference between prototype and production.
- Type every fixture with the `packages/contracts` Zod schemas (§7.4).
- Render status as shape + icon + label + color everywhere (`StatusBadge`).
- Make LIVE vs REPLAY unmistakable via `ModeBanner` (§6, `06-status-encoding-and-accessibility.md`).
- Respect `prefers-reduced-motion` for all Framer Motion choreography.

**Don't**
- Don't swap the canonical libs: **not** a different graph lib (React Flow only), **not** a different chart lib (Recharts/visx only), **not** a different motion lib (Framer Motion only), **not** a different component kit (Tailwind + shadcn only), **not** Redux/Apollo (TanStack Query + Zustand + custom SSE reducer only).
- Don't add SSR / a second framework / a second bundler — React 19 + Vite SPA is canonical.
- Don't let the UI mutate authoritative state outside `POST /runs` and `POST /runs/:id/stop`.
- Don't give the read-only reviewer persona any mutating control.
- Don't hard-code colors, timings, or spacing — they're tokens (`03-design-system-and-tokens.md`).
- Don't render fusion as one edge — two `fused` edges converge on the child.
```
