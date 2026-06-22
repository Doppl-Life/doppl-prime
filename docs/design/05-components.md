# Doppl — Component Inventory + Anatomy

> The component contract the design-system kit and the clickable prototype build against: every canonical component's purpose, anatomy, data/props (tied to Appendix-A domain objects), variants, visual states (incl. the status-encoding states), interactions, and an ASCII sketch.

**Related:** [`00-overview.md`](./00-overview.md) (product framing + personas) · [`01-information-architecture.md`](./01-information-architecture.md) (screens S0–S6 + navigation) · [`02-visual-language.md`](./02-visual-language.md) (color/type/motion tokens) · [`03-status-encoding.md`](./03-status-encoding.md) (the colorblind-safe shape+icon+label+color system) · [`04-lineage-graph.md`](./04-lineage-graph.md) (React Flow node/edge spec) · [`06-screens.md`](./06-screens.md) (screen-by-screen wireframes) · [`07-motion-and-liveness.md`](./07-motion-and-liveness.md) (Framer Motion choreography) · [`08-data-and-dummy-fixtures.md`](./08-data-and-dummy-fixtures.md) (prototype fixtures) · Ground truth: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) (§3, §10, §11, §12, Appendix A) · [`../planning/USER_FLOWS.md`](../planning/USER_FLOWS.md) · [`../planning/USERS.md`](../planning/USERS.md).

---

## How to read this doc

- **Canonical names are load-bearing.** Component, screen (S0–S6), status, and library names here match the rest of the package verbatim. The prototype must use these exact names.
- **Props tie to Appendix-A Zod contracts.** Where a prop says `Agenome`, `CandidateIdea`, `FitnessScore`, etc., it is the exact shape from `ARCHITECTURE.md` Appendix A. The prototype uses Zod-inferred TS types from `packages/contracts`; fixtures in [`08-data-and-dummy-fixtures.md`](./08-data-and-dummy-fixtures.md) satisfy them.
- **Every component lists its visual states** using the canonical set: `default · loading · empty · error · degraded · live · replay` (plus component-specific status-encoding states). Not every component has every state; only the applicable ones are listed.
- **Read-only is a global invariant.** Per `ARCHITECTURE.md` §12 + §14, the UI **never mutates authoritative state** except via `POST /runs` and `POST /runs/:id/stop`. Reviewers are strictly read-only. Components that can trigger a mutation are flagged **[MUTATING]** and must be disabled in reviewer context and in REPLAY mode.
- **Two modes, unmistakable.** Every live-capable component has a **LIVE** and a **REPLAY** variant. Live vs replay must be legible at projector distance at a glance (`ModeBanner` + `RunHeader` badge carry the global signal; individual components adjust affordances).

### Status-encoding cheat-sheet (full spec in [`03-status-encoding.md`](./03-status-encoding.md))

Never color alone — always **shape + icon + label + color**.

| Domain | Status | Glyph | Color token | Motion |
|---|---|---|---|---|
| Agenome | `seeded` | ◌ dim ring | `--status-neutral-dim` | none |
| Agenome | `active` | ◐ filled, pulsing | `--status-active` (cyan) | slow pulse |
| Agenome | `spent` | ○ hollow muted | `--status-muted` | none |
| Agenome | `eligible_parent` | ★ | `--status-parent` (blue) | gentle glow |
| Agenome | `reproduced` | ⚇ two-parent glyph | `--status-fuse` (violet) | none |
| Agenome | `mutated` | ∿ | `--status-mutate` (amber) | shimmer |
| Agenome | `failed` | △! dashed | `--status-fail` (red) | none |
| Agenome | `culled` | ✕ faded, sunk | `--status-cull` (gray) | fade+sink on entry |
| Candidate | `created` | ◌ | `--status-neutral-dim` | grow-in |
| Candidate | `under_review` | ◐ pulsing | `--status-active` | pulse |
| Candidate | `checked` | ◑ | `--status-neutral` | none |
| Candidate | `scored` | ◉ | `--status-neutral-bright` | none |
| Candidate | `selected` | ♔ | `--status-win` (gold) | crown glow |
| Candidate | `rejected` | ✕ | `--status-muted` | none |
| Candidate | `culled` | ✕ faded | `--status-cull` | fade+sink |
| Candidate | `invalid` | △ | `--status-fail` (red) | none |
| Check | `passed` | ✓ | `--status-pass` (green) | none |
| Check | `failed` | ✕ | `--status-fail` (red) | none |
| Check | `skipped` | – + reason | `--status-muted` | none |

Fitness/novelty are **meters, not hue alone**. Energy is a **light/charge metaphor that drains**.

---

# Area 1 — Shell

The persistent chrome. Calm, dark, low-chroma so the organism is the only vivid thing on screen.

## `AppShell`

**Purpose.** The outermost frame for every screen S0–S6. Owns global mode signaling, navigation back to S0, the connection-health affordance, and the slot where screen content + overlay inspectors mount.

**Anatomy.**
- **Top rail** — left: Doppl wordmark (→ S0 · Runs Home); center/right: mounts `ModeBanner` when inside a run (S2/S5/S6).
- **Content slot** — the active screen (S0 launcher list, S2 observatory, etc.).
- **Overlay layer** — a stacking context for `CandidateInspector` / `AgenomeInspector` drawers and the `RunLauncherForm` modal (S1).
- **Global connection chip** — SSE/REST connection status (connected · reconnecting · polling-fallback · offline), bottom-left, JetBrains Mono.
- **Toast region** — bottom-right, for transient errors (`provider_call_failed` surfaced, resync notices).

**Data / props.**
```ts
interface AppShellProps {
  mode: 'none' | 'live' | 'replay';     // drives ModeBanner; 'none' on S0/S1
  connection: 'connected' | 'reconnecting' | 'polling' | 'offline';
  isReviewer: boolean;                  // true => hide all [MUTATING] affordances
  children: ReactNode;
  overlay?: ReactNode;                  // inspector drawer / launcher modal
}
```

**Variants.** `operator` (full chrome) · `reviewer` (no New Run CTA reachable, no Stop) · `kiosk/projector` (larger type scale, top rail simplified for showcase).

**Visual states.** `default` · `live` (ModeBanner LIVE present) · `replay` (ModeBanner REPLAY present) · `degraded` (connection chip = reconnecting/polling, amber) · `error` (offline, red chip + toast) · `loading` (initial app boot skeleton).

**Interactions.** Click wordmark → S0. Connection chip hover → tooltip with `lastEventId` / last-event age. Press `Esc` → close top overlay. Reduced-motion: disable ambient background drift.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ◈ Doppl                          ▌ LIVE — Gen 3 / 6 ▐                   │  ← top rail + ModeBanner
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                     [ active screen content slot ]                     │
│                                                                        │
│                          ┌───────────────────────────────────────┐    │
│                          │ overlay layer (inspector drawer)       │    │
│                          └───────────────────────────────────────┘    │
│ ⦿ connected · seq 1284                                      [ toasts ] │
└──────────────────────────────────────────────────────────────────────┘
```

## `RunHeader`

**Purpose.** The always-visible identity + vitals bar for an open run (S2/S5/S6). The single place a viewer confirms *what run, which mode, how far, how healthy, and can I stop it*.

**Anatomy (composite).** `title` · **LIVE/REPLAY badge** (from `ModeBanner` family) · `GenerationCounter` · `RunEnergyGauge` · `HealthIndicator` · `StopButton`.

**Data / props.**
```ts
interface RunHeaderProps {
  run: { id: string; title: string; status: Run['status']; };  // Appendix A: Run
  mode: 'live' | 'replay';
  generation: { current: number; total: number };   // current / RunCaps.maxGenerations
  energy: { spent: number; budget: number };        // doppl_energy / RunCaps.energyBudget
  health: HealthSummary;                             // GET /runs/:id/health
  isReviewer: boolean;
  onStop?: () => void;                               // [MUTATING] POST /runs/:id/stop
}
```

**Variants.** `live` (Stop enabled for operator; pulsing badge) · `replay` (Stop hidden; badge static REPLAY) · `completed` (badge → COMPLETED, Stop → "View Final Idea" link to S5) · `reviewer` (no Stop).

**Visual states.** `default/live` · `replay` · `completed` · `stopping` (Stop shows spinner + "Stopping…", run.status=`stopping`) · `failed` (badge red FAILED, links to partial summary) · `degraded` (HealthIndicator amber).

**Interactions.** Stop → confirm dialog → `POST /runs/:id/stop` (idempotent; disabled when terminal). Hover energy → exact `spent / budget`. Hover generation → per-gen timestamps.

```
┌──────────────────────────────────────────────────────────────────────┐
│ "Climate adaptation transfer"  ▌LIVE▐   Gen 3/6   ⚡▮▮▮▮▮▯▯ 612/1000   │
│                                          ◐ healthy · 4 in-flight · 2s   [ ■ Stop ] │
└──────────────────────────────────────────────────────────────────────┘
```

## `ModeBanner` (LIVE / REPLAY)

**Purpose.** The unmistakable, projector-legible global signal of live-vs-replay. Accessibility-critical: reviewers must never confuse a recording for a live run (`USER_FLOWS.md` Replay failure state).

**Anatomy.** Bold pill: icon + word (`● LIVE` / `⏮ REPLAY`) + optional context suffix (`Gen 3/6` live; "Replaying recorded run" replay). In REPLAY, anchors the `ReplayScrubber` beneath it.

**Data / props.** `{ mode: 'live' | 'replay'; generationLabel?: string; recordedAt?: string }`.

**Variants.** `live` (cyan, soft pulse, "live dot") · `replay` (amber/violet, static, ⏮ icon + persistent banner stripe across full width in S6).

**Visual states.** `live` (pulse; respects reduced-motion → steady dot) · `replay` (persistent, never animates) · `reconnecting` (LIVE pill dims + "reconnecting…" so a stalled live run is not mistaken for healthy live).

```
LIVE:    ▌ ● LIVE — Gen 3/6 ▐            REPLAY: ▌ ⏮ REPLAY — recorded 2026-06-18 ▐
```

---

# Area 2 — Graph (the heart)

The `LineageGraph` is the centerpiece of S2/S6. Library: **React Flow (@xyflow/react)**, auto-layout via **Dagre (@dagrejs/dagre)** (ELK alternative). Full node/edge geometry spec in [`04-lineage-graph.md`](./04-lineage-graph.md); this section is the component contract.

## `LineageGraph`

**Purpose.** Render the living population/family tree from `LineageGraphProjection` (Appendix A, §10): generations as tiers, agenomes within, candidates they produced, critics/checks/scores hanging off candidates, fusion edges crossing from two parents to a child, the winner highlighted. It is the "digital ecosystem getting smarter" made legible.

**Anatomy.**
- React Flow canvas (zoom/pan/fit, minimap, controls).
- **Custom node types:** `GenerationNode` · `AgenomeNode` · `CandidateNode` · `CriticNode` · `CheckNode` · `ScoreNode` · `WinnerNode`.
- **Edge types:** `spawned · produced · reviewed · checked · scored · culled · fused · mutated · selected` (styled per [`04-lineage-graph.md`]).
- Overlaid `LineageLegend`, fit/zoom controls, generation-tier guides.

**Data / props.**
```ts
interface LineageGraphProps {
  projection: LineageGraphProjection;  // { runId, nodes[], edges[], sequenceThrough }
  selectedId?: string;                 // node currently open in an inspector
  focusWinnerId?: string;              // highlight path for S5
  mode: 'live' | 'replay';
  reducedMotion: boolean;
  onSelectNode: (n: { id: string; type: LineageNodeType }) => void;
  onHoverNode?: (id: string | null) => void;
}
```
`projection.nodes[]` = `{ id, type, label, status?, metrics?, dataRef }`; `edges[]` = `{ id, source, target, type, label? }`. `sequenceThrough` is the event high-water mark the graph was built to — surfaced as a subtle watermark so a viewer knows how "fresh" the graph is vs. the live `seq` in `AppShell`.

**Variants.** `live` (nodes animate in via the SSE reducer; spawn/cull/fuse/mutate choreography from [`07-motion-and-liveness.md`]) · `replay` (graph reconstructs to the scrubber's `sequenceThrough`; transitions can be stepped) · `winner-focus` (S5; non-ancestor nodes dim, the winner's `LineagePathTrace` glows).

**Visual states.**
- `default` — laid-out tree, fit to view.
- `loading` — skeleton tiers + shimmer while `GET /runs/:id/lineage` resolves.
- `empty` — gen-0 not yet spawned: a single dim "seed" placeholder + "Population blooming…" (`EmptyState`).
- `live` — incoming nodes grow-in, energy drains on agenomes, critic pulse on candidates under review.
- `replay` — deterministic reconstruction to the current scrub position; no live animation unless playing.
- `degraded` — `DegradedState` variant when `sequenceThrough` lags far behind live `seq` (banner: "graph catching up"), or when `all-culled` (renders the culled tier, faded+sunk, with a "lineage extinct" note).
- `error` — `ErrorState` if the projection fails to load (retry).

**Status-encoding states (per node, via `StatusBadge` on each custom node).** Agenome: seeded/active/spent/eligible_parent/reproduced/mutated/failed/culled. Candidate: created→under_review→checked→scored→selected; rejected/culled/invalid. Check: passed/failed/skipped. (See cheat-sheet.)

**Interactions.**
- **Hover node** → tooltip (label + status + key metric); highlight connected edges; dim the rest.
- **Click `AgenomeNode`** → open `AgenomeInspector` (S4 overlay).
- **Click `CandidateNode`** → open `CandidateInspector` (S3 overlay).
- **Click `CriticNode`/`CheckNode`/`ScoreNode`** → open the parent candidate's inspector scrolled to that evidence section.
- **Click `WinnerNode`** → S5 payoff / focus the winning lineage path.
- **Drill:** double-click a `GenerationNode` → collapse/expand its tier.
- **Zoom/pan/fit:** React Flow controls; minimap for orientation in deep trees.
- **Scrub (replay):** graph follows `ReplayScrubber` position.
- Keyboard: arrow keys move selection between sibling nodes; `Enter` opens inspector.

```
 Gen 0            Gen 1                 Gen 2 (fusion)
 ┌───────┐        ┌───────┐  spawned    ┌───────┐
 │◐ A0   │──────▶ │★ A1   │────────────▶│⚇ A4   │  ⚇ = reproduced (2-parent)
 │seeded │ fused  │parent │             │ child │
 └───┬───┘   ╲    └───┬───┘             └───┬───┘
 produced ╲   ╲   produced               produced
     ▼      ╲   ╲     ▼                      ▼
 ┌───────┐   ╲   ╲ ┌───────┐             ┌───────┐
 │◌ C0   │    ╲   ▶│◉ C2   │── scored ──▶│♔ C7   │  ← WinnerNode (gold)
 │created │    fused│scored │             │selected│
 └───────┘         └──┬────┘             └───────┘
                reviewed│ checked
                   ┌────┴───┐  ┌────────┐
                   │⊘ Critic│  │✓ Check │   CriticNode / CheckNode
                   └────────┘  └────────┘
        [LineageLegend ▾]              [ ⊕ ⊖ ⤢ fit · ▭ minimap ]
```

## `LineageLegend`

**Purpose.** Decode the graph's node shapes, status glyphs, and edge styles — essential for a skeptic reading a projector. Self-contained key so the graph is legible without prior briefing.

**Anatomy.** Collapsible panel: **Nodes** section (one row per node type with its glyph), **Status** section (the agenome/candidate/check glyph set), **Edges** section (line-style swatches for spawned/produced/reviewed/checked/scored/culled/fused/mutated/selected).

**Data / props.** `{ collapsed: boolean; onToggle(): void; highlight?: LineageNodeType | EdgeType }` — `highlight` lets a hovered graph element flash its legend row.

**Variants.** `expanded` (default on first view / projector mode) · `collapsed` (compact tab once oriented).

**Visual states.** `default` · `collapsed` · `highlight` (a row pulses to match a hovered node/edge).

**Interactions.** Click header → collapse/expand. Hover a legend row → highlight all matching nodes/edges in the graph (cross-highlight).

```
┌ Legend ▾ ─────────────────┐
│ NODES                      │
│  ◐ Agenome   ◉ Candidate   │
│  ⊘ Critic    ✓ Check       │
│  Σ Score     ♔ Winner      │
│ STATUS                     │
│  ★ eligible  ⚇ reproduced  │
│  ∿ mutated   ✕ culled      │
│ EDGES                      │
│  ── spawned   ┄┄ culled    │
│  ══ fused     ∿∿ mutated   │
│  →→ selected               │
└────────────────────────────┘
```

## `StatusBadge`

**Purpose.** The atomic, reusable status token used on every node, card, and inspector. Encodes status via **shape + icon + label + color** (never color alone) — the colorblind-safe, projector-legible backbone of the whole UI.

**Anatomy.** `[glyph/shape] [icon] [label text]`, optional trailing metric. Shape is intrinsic to the glyph (◐ ○ ★ ⚇ ∿ △ ✕ ♔ ✓ –).

**Data / props.**
```ts
interface StatusBadgeProps {
  domain: 'agenome' | 'candidate' | 'check' | 'run' | 'generation';
  status: string;        // e.g. 'eligible_parent' | 'under_review' | 'skipped'
  size?: 'sm' | 'md' | 'lg';     // lg for projector
  showLabel?: boolean;           // false in dense graph nodes, true elsewhere
  reason?: string;               // for check 'skipped' → renders "– skipped: <reason>"
  // Live in-flight observability (§4 operation-start markers, §12 working sub-state):
  // when a start marker is seen with NO paired completion, the badge overlays a
  // working/in-flight indicator with the op-type; cleared on the completion event.
  inFlight?: {
    op: 'generating' | 'reviewing' | 'checking' | 'scoring' | 'fusing';
    sinceMs?: number;            // age of the unpaired start marker (for stall hints)
  };
}
```

**Variants.** Per domain × status (see cheat-sheet). `size=lg` for projector. `icon-only` (dense graph) vs `with-label`. Plus an orthogonal **working / in-flight** overlay (any base status can also be "working") driven by `inFlight.op`.

**Working / in-flight sub-state (§4/§12).** Derived from the §4 operation-start markers: when a `*.started` / `generation.verifying|scoring|reproducing` / `candidate.generation_started` / `critic.review_started` / `check.started` / `novelty.scoring_started` / `judge.review_started` / `fusion.started` marker arrives without its paired completion (`candidate.created` / `critic.reviewed` / `check.completed` / `novelty.scored` / `fitness.scored` / `agenome.fused` / `generation.*`), the badge shows a **working** overlay — a soft cyan working-ring + an **op-type indicator**: ⚙ generating · ⊘ reviewing · ✓⋯ checking · Σ⋯ scoring · ⚇ fusing. The overlay **clears on the matching completion event**. A dangling start with no completion is valid (crash/timeout → run failed; replay shows started→failed) — the working overlay then resolves to `failed`, never spins forever. Markers carry the `run/generation/agenome/candidate` correlation IDs; they are persisted, so **replay reproduces the identical working choreography** with no provider call and **no energy debit** (only the underlying op's success debits energy).

**Visual states.** One per canonical status, plus the **working / in-flight** overlay (cyan working-ring + op-type glyph) composable on top of any base status. Animated states (`active`/`under_review`/working pulse, `culled` fade) come from [`07-motion-and-liveness.md`]; all collapse to static under reduced-motion while keeping shape+icon+label (the working overlay degrades to a steady "working: <op>" label).

**Interactions.** Hover → tooltip with full status name + (when working) the in-flight op + age (`since 2s`) + (for `skipped`) the `skipReason`, (for `failed`) the error.

```
◐ active     ★ eligible_parent     ⚇ reproduced     ∿ mutated
△! failed    ✕ culled              ♔ selected       ✓ passed
– skipped: no executable adapter registered
working overlay:  ⟳⚙ generating   ⟳⊘ reviewing   ⟳✓ checking   ⟳Σ scoring   ⟳⚇ fusing
```

## `GenerationTimeline` (stepper)

**Purpose.** A horizontal stepper of generations 0…N with per-generation lifecycle status — the spine of the "it's GENERATIONAL" story and the primary scrub target in replay.

**Anatomy.** Numbered steps (Gen 0 … Gen N), each a node showing generation `status` (pending/running/verifying/scoring/reproducing/completed/failed/skipped/degraded) + a tiny survivor count + best-fitness tick. Connector line fills as generations complete.

**Data / props.**
```ts
interface GenerationTimelineProps {
  generations: Array<Pick<Generation,'id'|'index'|'status'> & {
    survivors: number; bestFitness?: number;
  }>;
  current: number;
  mode: 'live' | 'replay';
  onSelectGeneration?: (index: number) => void;  // replay seek / live focus
}
```

**Variants.** `live` (current step pulses, future steps dim) · `replay` (click any step to seek; current = scrub position).

**Visual states.** `default` · `live` (active step pulsing) · `replay` · `degraded` (a step flagged degraded — partial generation failure, §3) · `failed` (a step red) · `empty` (only Gen 0 pending).

**Interactions.** Click a completed/past step → focus that generation in the graph + (replay) seek scrubber. Hover → tooltip (survivors, best fitness, timestamps).

```
 ● Gen0 ──── ● Gen1 ──── ● Gen2 ──── ◐ Gen3 ┄┄┄ ○ Gen4 ┄┄┄ ○ Gen5
 done        done        done       running    pending     pending
 s:5 f:2.1   s:6 f:2.8   s:4 f:3.4  4 in-flight
```

---

# Area 3 — Panels (the live observatory periphery)

These surround the `LineageGraph` in S2/S6.

## `RunEnergyGauge`

**Purpose.** The run-wide energy budget as a draining charge — the visible "this is finite by construction" signal (`RunCaps.energyBudget`, §5). Lives in `RunHeader`.

**Anatomy.** Charge/battery meter (segments or arc) + numeric `spent / budget` in JetBrains Mono + a thin "burn rate" sparkline.

**Data / props.** `{ spent: number; budget: number; burnRate?: number; mode }` — `doppl_energy` integer units; `budget = RunCaps.energyBudget`.

**Variants.** `live` (drains in real time as `energy.spent` events arrive) · `replay` (reflects scrub position). Thresholds: `nominal` (<70%), `warning` (70–90%, amber), `critical` (>90%, red), `exhausted` (100% → ties to `energy_exhausted` event).

**Visual states.** `default/live` · `replay` · `warning` · `critical` · `exhausted` (gauge empty + "energy exhausted — scoring verified candidates" per §5) · `loading`.

**Interactions.** Hover → exact remaining + projected generations at current burn. Click → opens `EnergyMeter` breakdown by agenome.

```
⚡ ▮▮▮▮▮▮▯▯▯▯  612 / 1000 doppl_energy   ▁▂▃▅▇  (burn)
```

## `EnergyMeter` (per-agenome)

**Purpose.** Energy spent by a single agenome rendered as a charge that drains — the metabolism of one organism. Used on `AgenomeCard` and in `AgenomeInspector`.

**Anatomy.** Small charge bar + `spent` value + breakdown chips by `EnergyEvent.eventType` (`llm` / `tool` / `spawn`), each with estimate vs actual.

**Data / props.**
```ts
interface EnergyMeterProps {
  agenomeId: string;
  events: EnergyEvent[];   // {eventType, estimate, actual, unit:'doppl_energy', reason}
  spentTotal: number;
  mode: 'live' | 'replay';
}
```

**Variants.** `compact` (card) · `detailed` (inspector, with the estimate→actual reconciliation, §4) · `live` (drains) · `replay`.

**Visual states.** `default` · `live` (animated drain on new `energy.spent`) · `empty` (agenome `seeded`, no spend yet) · `spent-out` (agenome `spent`, meter at its lifetime total, muted).

**Interactions.** Hover a breakdown chip → estimate vs actual tooltip. (No `tool`/`spawn` chip if none occurred.)

```
⚡ ▮▮▮▮▯▯  48 doppl_energy
   llm 38 (est 40)  tool 5  spawn 5
```

## `FitnessOverTimeChart`

**Purpose.** THE proof chart — fitness climbing generation over generation. Hammers "round N+1 is genuinely smarter than round N." Library: **Recharts** (visx alternative).

**Anatomy.** Line/area chart: X = generation index, Y = fitness (held-out judge acceptance + total). Series: best-per-gen (bold), mean-per-gen (faint band), gen-0 baseline (dashed reference line). Points are clickable. Optional per-component (stacked) toggle.

**Data / props.**
```ts
interface FitnessOverTimeChartProps {
  series: Array<{ generation: number; best: number; mean: number; baseline?: number }>;
  policyVersion: string;        // ScoringPolicy.version — shown so a skeptic sees the lens
  highlightGeneration?: number;
  mode: 'live' | 'replay';
  onSelectPoint?: (gen: number) => void;
}
```

**Variants.** `total` (default) · `by-component` (stacked: critic / subtype-check / novelty / energy-efficiency / held-out-judge) · `live` (extends as generations complete) · `replay`.

**Visual states.** `default` · `loading` · `empty` ("awaiting Gen 0 scores") · `live` (new point animates in) · `replay` (line drawn to scrub position) · `degraded` (a point flagged — novelty-degraded contributes estimated/absent component, §5; rendered with a striped marker + footnote) · `error`.

**Interactions.** Hover point → tooltip (gen, best, mean, Δ vs prev). Click point → focus that generation in graph + `GenerationComparison`. Toggle total↔by-component. Legend toggles series.

```
fitness ▲                                   ● best
 4 ┤                              ╭──●        ░ mean band
 3 ┤                    ╭───●─────╯
 2 ┤          ╭───●────╯
 1 ┤   ●─────╯
 0 ┤ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  gen-0 baseline (dashed)
   └──┬────┬────┬────┬────┬──▶  Gen 0  1  2  3  4
   policy v0.3
```

## `GenerationComparison`

**Purpose.** Side-by-side "Gen N vs Gen N+1" evidence — the explicit, defensible improvement claim a reviewer can interrogate. Library: **Recharts**.

**Anatomy.** Two-column compare: left gen, right gen. Per-axis bars (the held-out rubric axes: grounding, novelty, feasibility, falsification-survival, subtype-check-pass) + best-candidate title each side + Δ deltas + winner highlight.

**Data / props.**
```ts
interface GenerationComparisonProps {
  left:  { generation: number; bestTitle: string; axes: Record<string, number>; total: number };
  right: { generation: number; bestTitle: string; axes: Record<string, number>; total: number };
  policyVersion: string;
}
```

**Variants.** `adjacent` (N vs N+1, default) · `baseline-vs-winner` (Gen 0 vs final — the S5 summary) · `radar` (alternative axis viz).

**Visual states.** `default` · `loading` · `empty` (need ≥2 scored generations) · `replay`. Per-axis up/down arrows for improved/regressed.

**Interactions.** Pick which two generations. Hover an axis → exact scores + Δ. Click a side's best title → open that `CandidateInspector`.

```
        Gen 0  →  Gen 3        Δ
grounding   2.0  ███▌  4.0    ▲ +2.0
novelty     1.5  ██▍   3.5    ▲ +2.0
feasibility 2.5  ███▏  3.0    ▲ +0.5
falsific.   1.0  ██▌   3.0    ▲ +2.0
subtype ✓   0.5  ███▊  4.5    ▲ +4.0
TOTAL       1.5        3.6    ▲ +2.1
```

## `ActivityTicker`

**Purpose.** The live heartbeat — a streaming feed of `RunEventType` events (SSE) so the room feels the organism working in real time. Shows **both** the §4 operation-start markers and their completions, so the room sees each op *begin* and *finish*, not only finish.

**Anatomy.** Reverse-chron scrolling list; each row = icon (by event type) + `sequence` + actor + short human phrase + relative time. **Start→finish pairing:** start markers (`*.started` / `generation.verifying|scoring|reproducing` / `candidate.generation_started`, etc.) render as "▶ …started" rows; when the paired completion arrives the start row is annotated/collapsed with an elapsed badge (`✓ reviewed · 1.2s`), so a viewer reads each op as a begin→end pair. An unpaired start still pending shows a live ⟳ working glyph; a start that ends in failure (crash/timeout, no completion) resolves to a `started→failed` pair (never dangles). Auto-scroll with pause-on-hover. Filter chips by event family (incl. a "starts/in-flight" filter).

**Data / props.**
```ts
interface ActivityTickerProps {
  events: Array<{ sequence: number; type: RunEventType; actor: string; phrase: string;
                  occurredAt: string;
                  // start↔completion correlation for pairing (§4):
                  pairedSequence?: number;   // the matching start (on a completion) or completion (on a start)
                  isStartMarker?: boolean;   // true for operation-start / in-flight markers
                  elapsedMs?: number }>;     // filled on the completion row once paired
  mode: 'live' | 'replay';
  lastEventId: number;     // SSE resume high-water
  filter?: RunEventType[];
}
```
Fed by the **sequence-keyed SSE reducer** (resync from `lastEventId`), ordered by `sequence` only (§4). Start markers carry the same `run/generation/agenome/candidate` correlation IDs as their completion, are persisted, debit **no energy**, and need no provider call — so **replay reproduces the identical start→finish cadence** (§4/§11/§12).

**Variants.** `live` (auto-scroll, new rows slide in; start rows pulse until paired) · `replay` (rows — starts and completions — appear as the scrubber advances). Density: `comfortable` / `compact`.

**Visual states.** `default/live` · `replay` · `empty` ("waiting for events…") · `paused` (hover) · `in-flight` (one or more unpaired start markers → live ⟳ rows) · `degraded` (gap detected in `sequence` → "resyncing…" chip) · `error` (SSE dropped → "reconnecting", `DegradedState`). Failure events (`provider_call_failed`, `energy_exhausted`, `generation_failed`, `novelty_scoring_degraded`) and `started→failed` dangling pairs render with a warning icon.

**Interactions.** Hover → pause auto-scroll. Click a row → focus/open the related node's inspector (deep-link by `candidateId`/`agenomeId`); the linked node shows its working sub-state if the op is still in flight. Filter chips toggle families (incl. starts/in-flight).

```
┌ Activity ────────────────────────────── ⏸ on hover ┐
│ ✦ #1287  selection   fitness.scored  C7 → 3.6   ✓2s │
│ ▶ #1286  judge       judge.review_started C7    ⟳    │  ← start, in-flight (unpaired)
│ ⚇ #1285  kernel      agenome.fused   A2×A3→A4   ✓4s  │
│ ▶ #1283  kernel      fusion.started  A2×A3      ✓1.3s │  ← paired w/ #1285
│ ✕ #1284  selection   lineage.culled  A1          5s │
│ ▶ #1279  critic      critic.review_started C7    ✓0.9s │
│ ⊘ #1280  critic      critic.reviewed C7 feas 4   9s │
│ ⚡ #1276  kernel      energy.spent    A2 +12     12s │
│ … resyncing from #1273                              │
└─────────────────────────────────────────────────────┘
```

## `BestIdeaPanel`

**Purpose.** The persistent "best-so-far" on S2 — what's currently winning, always visible so the climb has a face. (S5's `FinalIdeaProof` is the full payoff variant.)

**Anatomy.** Card: `♔` selected badge + candidate title + one-line summary + subtype tag + current fitness total + tiny generation provenance ("Gen 3, A4"). "Inspect" → S3; on completion, "Reveal Final Idea" → S5.

**Data / props.**
```ts
interface BestIdeaPanelProps {
  best?: { candidateId: string; title: string; summary: string;
           subtype: CandidateIdea['subtype']; fitnessTotal: number;
           generation: number; agenomeId: string };
  runStatus: Run['status'];
  mode: 'live' | 'replay';
}
```

**Variants.** `live` (updates when a new best is `selected`; brief crown-glow) · `replay` · `final` (run completed → CTA to S5).

**Visual states.** `default` · `empty` ("no survivor yet" — before first `selected`, or all-culled `DegradedState`) · `live` (transition animation on new best) · `final` · `loading`.

**Interactions.** "Inspect" → `CandidateInspector`. "Reveal Final Idea" → S5. Hover fitness → `FitnessBreakdown` mini-popover.

```
┌ Best so far ♔ ───────────────────────────┐
│ "Mycelial routing for grid load-balancing"│
│ cross_domain_transfer · Gen 3 · A4         │
│ fitness 3.6  ▮▮▮▮▮▮▮▯▯▯                     │
│ [ Inspect ]            [ Reveal Final ▸ ]  │
└────────────────────────────────────────────┘
```

## `HealthIndicator`

**Purpose.** The continue-vs-switch-to-replay decision signal for the operator during the 10-minute window (`GET /runs/:id/health`, §11) — the thing Langfuse can't give. Lives in `RunHeader`.

**Anatomy.** Compact status dot + four micro-stats: current generation, candidates in flight, last-event age, caps consumed (% of each cap). Expands to a popover with the full cap breakdown.

**Data / props.**
```ts
interface HealthSummary {
  currentGeneration: number;
  candidatesInFlight: number;
  operationsInFlight: OperationsInFlight;   // §11: agenomes generating, critics reviewing,
                                            // checks running, judge deliberating, fusions
                                            // synthesizing — from unpaired operation-start markers.
                                            // Feeds `LiveActivity`.
  lastEventAgeMs: number;
  capsConsumed: { population: number; generations: number; energy: number;
                  spawnDepth: number; toolCalls: number; wallClockMs: number }; // 0..1 each
}
```

**Variants.** `healthy` (green ◐) · `slowing` (amber — last-event age rising) · `stalled` (red — last-event age past threshold; the "switch to replay" cue) · `near-cap` (a cap ≥90%). `replay` variant shows static health-at-end.

**Visual states.** `default/healthy` · `slowing` (amber) · `stalled` (red, pulsing) · `near-cap` · `degraded` (health endpoint unreachable → "health unknown").

**Interactions.** Hover/click → cap-consumption popover (six bars). The stalled state is the operator's trigger to invoke the fallback ladder (§17).

```
◐ healthy · gen 3 · 4 in-flight · last evt 2s
   ▸ caps:  pop ▮▮▮▮▯ 80%   gen ▮▮▮▯▯ 50%   energy ▮▮▮▮▮▮▯ 61%
            depth ▮▮▯ 30%   tools ▮▮▮▯ 45%   clock ▮▮▮▮▯ 70%
```

## `LiveActivity` (In-Flight summary)

**Purpose.** The real-time **operations-in-flight** window (§4/§11/§12) — a single glanceable surface answering "what is the organism doing *right now*": how many agenomes are generating, critics reviewing, checks running, the judge deliberating, fusions synthesizing. Derived from the unpaired §4 operation-start markers, exposed via `GET /runs/:id/health` (`operationsInFlight`). Complements `HealthIndicator` (vitals/caps) and `ActivityTicker` (the per-event feed): this is the **aggregate in-flight count by op-type**. Lives in the S2/S6 observatory periphery.

**Anatomy.** A compact row of **op-type counters**, each = op icon + label + live count + a working pulse while >0:
- ⚙ **generating** — agenomes producing candidates (`candidate.generation_started` unpaired)
- ⊘ **reviewing** — critics in the gauntlet (`critic.review_started` unpaired)
- ✓⋯ **checking** — subtype checks running (`check.started` unpaired)
- Σ⋯ **scoring** — novelty + fitness in progress (`novelty.scoring_started` unpaired)
- ⚖ **judge deliberating** — held-out judge (`judge.review_started` unpaired)
- ⚇ **fusing** — reproduction-fusion synthesizing (`fusion.started` unpaired)

Optionally expands to list the specific in-flight nodes (deep-linkable). A zero count renders dim (no pulse).

**Data / props.**
```ts
interface OperationsInFlight {        // from GET /runs/:id/health (§11)
  generating: number;   // unpaired candidate.generation_started
  reviewing: number;    // unpaired critic.review_started
  checking: number;     // unpaired check.started
  scoring: number;      // unpaired novelty.scoring_started + fitness pending
  judging: number;      // unpaired judge.review_started
  fusing: number;       // unpaired fusion.started
  // optional drill-down: the correlated nodes currently working
  nodes?: Array<{ op: 'generating'|'reviewing'|'checking'|'scoring'|'judging'|'fusing';
                  agenomeId?: string; candidateId?: string; sinceMs: number }>;
}

interface LiveActivityProps {
  inFlight: OperationsInFlight;       // GET /runs/:id/health, refreshed live from SSE start/finish markers
  mode: 'live' | 'replay';
  onSelectNode?: (id: string) => void;
}
```
Counts are kept live by the same sequence-keyed SSE reducer: a start marker increments its op-type, the paired completion decrements it (the working-sub-state rule, aggregated). Markers are persisted with no energy debit and no provider call, so **replay reproduces the identical in-flight counts** at each scrub position; `GET /runs/:id/health` is the polling fallback.

**Variants.** `live` (counters pulse while >0; tick up on start markers, down on completions) · `replay` (reflects scrub position) · `compact` (icon+count strip for the header rail) / `expanded` (with the per-node drill-down list). `idle` (all zero → "no operations in flight").

**Visual states.** `default/live` · `idle` (all counters zero, dim) · `replay` · `degraded` (health endpoint unreachable → counts derived from SSE only, "from stream" note; or a sequence gap → "resyncing") · `error` (no data). A counter that has been >0 with no completion past a stall threshold tints amber (mirrors `HealthIndicator` slowing/stalled — possible dangling start → run failing).

**Interactions.** Hover a counter → tooltip listing the working nodes + ages. Click (expanded) a node → focus it in `LineageGraph` (it shows its `StatusBadge` working overlay) / open its inspector. In `replay`, counters are read-only at the scrub position.

```
┌ In-Flight  (live) ──────────────────────────────────────────┐
│ ⚙ generating 2   ⊘ reviewing 3   ✓ checking 1               │
│ Σ scoring 0      ⚖ judge 1       ⚇ fusing 1                  │
│   ▸ A4 generating 2s · C7 judge deliberating 1s · A2×A3 fusing│
└──────────────────────────────────────────────────────────────┘
```

---

# Area 4 — Cards

Compact summaries used inside the graph periphery, lists, and inspectors.

## `CandidateCard`

**Purpose.** A scannable summary of one `CandidateIdea` — used in generation lists, "candidates in flight," and as the header of `CandidateInspector`.

**Anatomy.** `StatusBadge` (candidate status) + title + subtype tag (`cross_domain_transfer` / `zeitgeist_synthesis`) + one-line summary + mini metrics row (fitness total, novelty meter, critic pass/fail count, check ✓/✕/– summary) + agenome/gen provenance.

**Data / props.**
```ts
interface CandidateCardProps {
  candidate: Pick<CandidateIdea,'id'|'subtype'|'title'|'summary'|'status'>;
  fitnessTotal?: number;
  novelty?: number;
  criticSummary?: { passed: number; total: number };
  checkSummary?: { passed: number; failed: number; skipped: number };
  generation: number; agenomeId: string;
  onInspect: (id: string) => void;
}
```

**Variants.** By subtype (icon differs) · `compact` (graph hover) / `full` (list) · `selected` (♔ gold border) · `live` / `replay`.

**Visual states.** Every candidate status (`created` → … → `selected`; `rejected`/`culled`/`invalid`) via `StatusBadge`. Plus `under_review` (pulsing), `culled` (faded), `invalid` (△ red). `loading` (skeleton), `live` (grow-in on `candidate.created`).

**Interactions.** Click → `CandidateInspector`. Hover → highlight its node in `LineageGraph`.

```
┌ ◐ under_review ─────────────────────────────┐
│ "Mycelial routing for grid load-balancing"  │
│ cross_domain_transfer · Gen 3 · A4          │
│ fit —   novelty ▮▮▮▮▮▮▯ 0.71  ⊘ 3/5  ✓2 ✕1 –1│
└──────────────────────────────────────────────┘
```

## `AgenomeCard`

**Purpose.** A scannable summary of one `Agenome` — the organism: its status, energy, parentage, and output count. Header of `AgenomeInspector`.

**Anatomy.** `StatusBadge` (agenome status) + agenome id/label (JetBrains Mono) + parentage glyph (gen-0 / 1-parent mutation / 2-parent fusion) + `EnergyMeter` (compact) + candidates-produced count + a persona/specialization micro-tag.

**Data / props.**
```ts
interface AgenomeCardProps {
  agenome: Pick<Agenome,'id'|'status'|'parentIds'|'spawnBudget'>;
  energySpent: number;
  candidatesProduced: number;
  specializationTag?: string;     // derived from personaWeights, for "visible specialization"
  onInspect: (id: string) => void;
}
```

**Variants.** By status (seeded/active/spent/eligible_parent/reproduced/mutated/failed/culled) · `gen-0` (no parents) / `fusion-child` (⚇) / `mutation-child` (∿) · `live` / `replay`.

**Visual states.** Each agenome status via `StatusBadge` (incl. the animated `active` pulse, `culled` fade+sink, `mutated` shimmer, `reproduced` ⚇). `loading` skeleton; `empty` n/a.

**Interactions.** Click → `AgenomeInspector`. Hover → highlight node + its produced candidates + lineage edges in graph.

```
┌ ★ eligible_parent ──────────────────┐
│ A4  ⚇ child of A2 × A3              │
│ ⚡ ▮▮▮▮▯ 48   candidates: 2          │
│ tag: "biomimicry / systems"         │
└──────────────────────────────────────┘
```

---

# Area 5 — Inspectors (overlays on S2 / S6)

`CandidateInspector` (S3) and `AgenomeInspector` (S4) are **drawers/panels over S2/S6**, not separate pages (shadcn/ui Drawer over Radix Dialog). Both are read-only.

## `CandidateInspector` (drawer — S3)

**Purpose.** A candidate's full evidence dossier so a skeptic can defend *why this idea scored what it scored*. The inspectable heart of the credibility claim (`REQ-NF-002`).

**Anatomy (sections, scrollable; tabs or stacked).**
1. **Header** — `CandidateCard` (full) + lineage breadcrumb.
2. **Subtype payload** — `CrossDomainTransferPayload` or `ZeitgeistSynthesisPayload` rendered to its fields (see below).
3. **Critic Gauntlet** — `CriticGauntletPanel` (per-mandate `ReviewRow`s).
4. **Subtype-Check Evidence** — `SubtypeCheckPanel` (`CheckRow`s).
5. **Novelty** — `NoveltyMeter` + method + comparison set + explanation.
6. **Fitness Breakdown** — `FitnessBreakdown` (components bars + total + policyVersion + explanation).
7. **Energy** — `EnergyMeter` (detailed) for the producing agenome's spend on this candidate.
8. **Lineage path** — `LineagePathTrace` (ancestry to gen-0).
9. **Trace links** — `EvidenceRef[]` → Langfuse trace/observation (when present) + raw/normalized output (within Postgres tier).

**Data / props.**
```ts
interface CandidateInspectorProps {
  candidate: CandidateIdea;                 // incl. subtype, subtypePayload, claims[], evidenceRefs[]
  reviews: CriticReview[];                  // one per mandate
  checks: CheckResult[];
  novelty: NoveltyScore;
  fitness: FitnessScore;
  energy: EnergyEvent[];
  lineage: LineagePathTraceData;
  mode: 'live' | 'replay';
  open: boolean; onClose(): void;
  initialSection?: 'critics' | 'checks' | 'novelty' | 'fitness' | 'lineage';
}
```
Loaded from `GET /runs/:id/candidates/:cid`.

**Subtype payload rendering.**
- `cross_domain_transfer` → labeled fields: sourceDomain → targetDomain, sourceTechnique, targetProblem, transferMapping, expectedMechanism, executableCheckIdea (links to the live/replay-backed check, the "execute the transfer live" moment, §7/§17).
- `zeitgeist_synthesis` → thesis, audience, whyNow, currentSignals[] (each with provenance), falsifiablePredictions[], comparablePriorArt[].

**Variants.** Per subtype · `live` (sections fill as `critic.reviewed`/`check.completed`/`fitness.scored` arrive) · `replay` · `winner` (S5 entry point, "execute check live" CTA enabled for transfer).

**Visual states.** `default` · `loading` (per-section skeletons) · `partial/live` (some evidence pending — under_review) · `degraded` (`DegradedState`: novelty-degraded → novelty section flagged estimated/absent; Langfuse-off → trace links show "trace unavailable (local metadata only)") · `error` (candidate fetch failed) · `invalid` (candidate `invalid` → shows repair history / schema-reject reason).

**Interactions.** Tab/scroll between sections. Click a critic `ReviewRow` → expand critique + evidence. Click a check `CheckRow` → expand output. Click an `EvidenceRef` → open trace (new) / raw output. Click lineage ancestor → focus/open that node. Close → back to graph (selection persists, node stays highlighted).

```
┌─ Candidate Inspector  (S3) ───────────────────────── ✕ ┐
│ ◉ scored · "Mycelial routing…"  cross_domain_transfer  │
│ Gen 3 · A4 · seq 1287                                   │
├────────────────────────────────────────────────────────┤
│ ▸ Subtype Payload                                       │
│   source: Fungal networks → target: Power-grid routing  │
│   technique: foraging-based shortest-path reinforcement │
│   mapping: hyphae=lines, nutrient=load, …               │
│   executable check: [ ▶ run live ]  (transfer)          │
│ ▸ Critic Gauntlet      ⊘ grounding 4 · novelty 3 · …    │
│ ▸ Subtype Checks       ✓ target-fit  ✓ mapping  – exec  │
│ ▸ Novelty   ▮▮▮▮▮▮▯ 0.71  (cosine vs 14 prior)          │
│ ▸ Fitness   total 3.6  (policy v0.3)                    │
│ ▸ Energy    ⚡ 48 doppl_energy                            │
│ ▸ Lineage   A0 ▸ A2 ▸ (A2×A3) ▸ A4 ▸ this               │
│ ▸ Traces    ↗ Langfuse · raw output                     │
└──────────────────────────────────────────────────────────┘
```

## `AgenomeInspector` (drawer — S4)

**Purpose.** A genome's full make-up — what kind of organism this is and where it came from. Supports the "visible lineage specialization" claim.

**Anatomy (sections).**
1. **Header** — `AgenomeCard` (full) + status.
2. **System prompt** — `Agenome.systemPrompt` (JetBrains Mono, scrollable, copy).
3. **Persona / value weights** — `personaWeights` (bars/radar).
4. **Tool permissions** — `toolPermissions[]` chips.
5. **Decomposition policy** — `decompositionPolicy` summary.
6. **Spawn budget** — `spawnBudget` (hint) vs effective spawns clamped by caps (§5).
7. **Parentage / lineage** — fusion/mutation lineage with `mutationMeta` (RNG outcomes persisted, §4); `LineagePathTrace`.
8. **Energy spent** — `EnergyMeter` (detailed, by eventType).
9. **Candidates produced** — list of `CandidateCard`s → each → `CandidateInspector`.

**Data / props.**
```ts
interface AgenomeInspectorProps {
  agenome: Agenome;                  // systemPrompt, personaWeights, toolPermissions[],
                                     // decompositionPolicy, spawnBudget, parentIds[0-2],
                                     // mutationMeta?, status
  energy: EnergyEvent[];
  candidates: CandidateCard[];       // produced by this agenome
  lineage: LineagePathTraceData;
  reproduction?: ReproductionEvent;  // mode, crossoverPoints, mutationSummary
  mode: 'live' | 'replay';
  open: boolean; onClose(): void;
}
```

**Variants.** `gen-0` (authored baseline — flag "human-authored seed", §3) · `fusion-child` (shows two parents + crossover points + output_synthesis) · `mutation-child` (∿ shows mutated fields + magnitudes) · `live` / `replay`.

**Visual states.** `default` · `loading` · `live` (energy drains; status transitions seeded→active→spent→eligible_parent→reproduced/culled animate) · `culled` (faded header + "lineage ended at Gen N") · `failed` (△! + failure reason) · `replay`.

**Interactions.** Copy system prompt. Hover a persona weight → exact value. Click a parent → open that `AgenomeInspector` (walk ancestry). Click a produced candidate → `CandidateInspector`. Close → back to graph.

```
┌─ Agenome Inspector  (S4) ─────────────────────── ✕ ┐
│ ★ eligible_parent · A4  ⚇ child of A2 × A3          │
├──────────────────────────────────────────────────────┤
│ ▸ System Prompt   "You are a biomimicry strategist…" │
│ ▸ Persona Weights  rigor ▮▮▮▮▮▯  daring ▮▮▮▮▮▮▮       │
│ ▸ Tools            [web.search] [calc]               │
│ ▸ Decomposition    depth-first, 3 sub-questions       │
│ ▸ Spawn Budget     hint 4 → effective 2 (cap-clamped) │
│ ▸ Parentage        A2 × A3 · crossover @ prompt,tools │
│                    mutated: daring +0.15 (∿)          │
│ ▸ Energy           ⚡ 48  (llm 38 · tool 5 · spawn 5)  │
│ ▸ Candidates (2)   ◉ C7 (selected ♔) · ✕ C5 (culled)  │
└──────────────────────────────────────────────────────┘
```

---

# Area 6 — Evidence sub-components (used inside inspectors)

## `CriticGauntletPanel`

**Purpose.** The adversarial gauntlet a candidate survived — per-mandate reviews from the critic council (§7). Replayable as the S5 "gauntlet it passed."

**Anatomy.** Header (overall pass/fail summary) + one **`ReviewRow`** per `CriticMandate`: `factual_grounding` · `novelty_prior_art` · `feasibility` · `falsification` · `subtype_specific`. Each `ReviewRow` = mandate label + score + confidence meter + critique (expandable) + `EvidenceRef[]` links.

**Data / props.**
```ts
interface CriticGauntletPanelProps {
  reviews: CriticReview[];   // {mandate, scores{}, critique, confidence, evidenceRefs[]}
  mode: 'live' | 'replay';
}
```

**Variants.** `summary` (collapsed rows) / `expanded` · `live` (rows appear as `critic.reviewed` arrives — the "facing critics" beat) · `replay` (re-runs the gauntlet for S5).

**Visual states.** `default` · `loading` (rows pending) · `live` (row-by-row arrival, each pulses then settles) · `partial` (some mandates still pending — under_review) · `degraded` (a critic call failed → row marked "review unavailable") · `error`.

**Interactions.** Click `ReviewRow` → expand critique + evidence. Hover confidence → numeric. Click `EvidenceRef` → trace/prior-art. (Read-only: the candidate text is shown as *data evaluated*, never editable — mirrors the prompt-injection isolation, §7.)

```
┌ Critic Gauntlet  (4/5 mandates positive) ──────────────┐
│ ⊘ factual_grounding   4.0  conf ▮▮▮▮▮▯  ▾                │
│ ⊘ novelty_prior_art   3.0  conf ▮▮▮▮▯▯  ▾                │
│ ⊘ feasibility         4.0  conf ▮▮▮▮▮▮  ▾                │
│ ⊘ falsification       3.5  conf ▮▮▮▮▯▯  ▾                │
│ ⊘ subtype_specific    4.5  conf ▮▮▮▮▮▯  ▾                │
│   └ "Mapping holds for radial grids; weak for meshed."  │
└──────────────────────────────────────────────────────────┘
```

## `SubtypeCheckPanel`

**Purpose.** Objective subtype-check evidence (§7) — the non-LLM grounding, incl. the "execute the transfer live" payoff. Check runners are allowlisted, non-executing-by-default (§14).

**Anatomy.** One **`CheckRow`** per `CheckResult`: checkType + status (`passed` ✓ / `failed` ✕ / `skipped` – with reason) + score? + output (expandable). For transfer, a "run live" affordance on the allowlisted executable check.

**Data / props.**
```ts
interface SubtypeCheckPanelProps {
  checks: CheckResult[];   // {checkType, status, score?, output?, skipReason?, evidenceRefs[]}
  subtype: CandidateIdea['subtype'];
  canExecuteLive?: boolean;   // S5 / prepared-problem transfer only
  mode: 'live' | 'replay';
  onRunLive?: (checkType: string) => void;   // re-runs allowlisted check; replay-backed fallback
}
```

**Variants.** By subtype (transfer checks vs zeitgeist checks) · `live` · `replay` · `executable` (S5 payoff: the run-live button).

**Visual states.** `default` · `loading` · `live` (rows arrive on `check.completed`) · `passed`/`failed`/`skipped` per row · `executing` (live check running — spinner) · `replay-backed` (live unavailable → "showing recorded check result") · `degraded` · `error`.

**Interactions.** Click `CheckRow` → expand output. Click "run live" (executable, prepared problems only) → executes the allowlisted check, animates result; on failure/unavailable, falls back to replay-backed result with a clear label.

```
┌ Subtype Checks  (cross_domain_transfer) ───────────────┐
│ ✓ source_domain_validity   1.0   ▾                      │
│ ✓ target_fit               0.9   ▾                      │
│ ✓ mapping_quality          0.8   ▾                      │
│ – prior_art_check          skipped: no live retrieval ▾ │
│ ▶ executable_toy_check     [ run live ]   (or replay)   │
└──────────────────────────────────────────────────────────┘
```

## `NoveltyMeter`

**Purpose.** The anti-collapse signal — how semantically distinct this candidate is from prior ideas (`NoveltyScore`, §8). A meter, not just hue.

**Anatomy.** Horizontal meter (0–1) + numeric + method label (`cosine` / lexical-fallback) + comparison-set size + expandable explanation.

**Data / props.**
```ts
interface NoveltyMeterProps {
  novelty: NoveltyScore;   // {score, method, comparisonSet, explanation, embeddingModelId}
  degraded?: boolean;      // novelty_scoring_degraded
}
```

**Variants.** `compact` (card chip) / `detailed` (inspector) · `degraded` (estimated/absent).

**Visual states.** `default` · `degraded` (striped fill + "estimated — embedding unavailable", §5) · `loading`. Thresholds: low novelty (<0.3) flagged amber (collapse pressure), high (>0.7) emphasized.

**Interactions.** Hover → method + comparison set. Click → explanation (which neighbors it was compared against).

```
novelty  ▮▮▮▮▮▮▯▯▯▯  0.71   cosine vs 14 prior   ▾
         (degraded: ▦▦▦▦▯▯  ~0.5 estimated)
```

## `FitnessBreakdown`

**Purpose.** *Why* a candidate scored what it scored — the decomposed, policy-versioned `FitnessScore` (§8). The skeptic's primary exhibit.

**Anatomy.** Component bars (`components{}`: critic / subtype-check / novelty / energy-efficiency / **held-out-judge**) + total + `policyVersion` badge + plain-language `explanation`. Optional weight annotations (weights deferred-open, so shown as "structure: equal + energy tiebreak", §7).

**Data / props.**
```ts
interface FitnessBreakdownProps {
  fitness: FitnessScore;   // {total, components{}, policyVersion, explanation}
  judgeScore?: number;     // held-out judge acceptance, surfaced distinctly
  mode: 'live' | 'replay';
}
```

**Variants.** `compact` (popover) / `detailed` (inspector) · `live` (assembles as `fitness.scored` arrives) · `replay`.

**Visual states.** `default` · `loading` (awaiting score) · `degraded` (a component flagged estimated — novelty-degraded contributes a striped bar + footnote) · `error`. The held-out-judge component is visually distinct (it's the bedrock anchor agents can't move, §7).

**Interactions.** Hover a component bar → its raw value + source (which critics/checks/novelty fed it). Click `policyVersion` → policy summary tooltip.

```
┌ Fitness Breakdown  total 3.6  ·  policy v0.3 ─────────┐
│ held-out judge   ▮▮▮▮▮▮▮▯  3.8   ★ anchor             │
│ critic council   ▮▮▮▮▮▮▯▯  3.6                         │
│ subtype checks   ▮▮▮▮▮▮▮▯  3.9                         │
│ novelty          ▮▮▮▮▮▯▯▯  0.71                        │
│ energy efficiency▮▮▮▮▮▮▯▯  (tiebreak)                  │
│ "Strong judge + checks; novelty mid; cheap to run."   │
└────────────────────────────────────────────────────────┘
```

## `LineagePathTrace`

**Purpose.** The ancestry path of a candidate/agenome back to gen-0 — the family tree as a linear trace (the graph shows it spatially; this shows it as a defensible chain).

**Anatomy.** Breadcrumb/vertical chain of ancestors, each = `AgenomeCard` (mini) with the edge type between them (spawned / fused / mutated). Fusion shows the two-parent merge; mutation shows ∿ + mutated fields.

**Data / props.**
```ts
interface LineagePathTraceData {
  path: Array<{ agenomeId: string; status: Agenome['status'];
                edgeFromParent?: 'spawned'|'fused'|'mutated';
                mutationSummary?: string; crossoverPoints?: string[] }>;
}
```

**Variants.** `compact` (inline breadcrumb) / `expanded` (vertical with details) · `winner` (S5 — glows, the surviving line).

**Visual states.** `default` · `loading` · `replay`. Fusion nodes use ⚇, mutation ∿; culled siblings optionally shown faded for contrast.

**Interactions.** Click any ancestor → open its `AgenomeInspector`. Hover an edge → edge-type explanation. (In S5, this is the "generational improvement" spine: gen-0 baseline → winner.)

```
gen0  A0  ◌ seeded
       │ spawned
gen1  A2  ★ eligible_parent
       ╲ fused (× A3)
gen2  A4  ⚇ reproduced  ∿ mutated: daring +0.15
       │ produced
       C7 ♔ selected   ← winner
```

---

# Area 7 — Final-idea / payoff (S5)

## `BestIdeaPanel / FinalIdeaProof`

**Purpose.** The showcase money shot (S5): the winning idea + the full proof it earned its win — the gauntlet it survived (replayable), the executable transfer check (live or replay-backed), and the gen-0→winner generational-improvement summary. `BestIdeaPanel` is the S2 in-flight version; `FinalIdeaProof` is the full S5 payoff.

**Anatomy (S5 layout, top→bottom).**
1. **Winner hero** — ♔ title, summary, subtype, final fitness, "Gen N winner."
2. **Subtype payload** — full transfer/zeitgeist detail.
3. **Gauntlet replay** — `CriticGauntletPanel` (replayable: "Replay the gauntlet").
4. **Executable proof** — `SubtypeCheckPanel` with "Run the transfer live" (or replay-backed) — the §17 payoff.
5. **Generational improvement** — `GenerationComparison` (baseline-vs-winner) + a `FitnessOverTimeChart` thumbnail (gen-0 baseline → winner).
6. **Provenance** — `LineagePathTrace` (winner) + `FitnessBreakdown` + trace links.

**Data / props.**
```ts
interface FinalIdeaProofProps {
  winner: CandidateIdea;
  fitness: FitnessScore;
  reviews: CriticReview[];
  checks: CheckResult[];
  lineage: LineagePathTraceData;
  improvement: { baselineGen: number; winnerGen: number;
                 baselineBest: number; winnerBest: number; series: FitnessSeries };
  canExecuteLive: boolean;     // transfer + prepared problem
  mode: 'live' | 'replay';
  onReplayGauntlet(): void;
  onRunTransferLive?(): void;
}
```

**Variants.** `transfer-winner` (executable check enabled) · `zeitgeist-winner` (falsifiable-predictions emphasis, no executable check) · `live` (just-completed run) · `replay` (S6-sourced payoff).

**Visual states.** `default` · `loading` · `empty` (no survivor — all-culled `DegradedState`: "No idea survived; here is the strongest culled lineage") · `executing` (transfer running) · `replay-backed` (live check unavailable → labeled recorded result) · `degraded` · `error`.

**Interactions.** "Replay the gauntlet" → re-runs `CriticGauntletPanel` from the event log. "Run the transfer live" → executes allowlisted check (prepared problems), animated, replay-backed fallback. Click any evidence → its inspector/trace. "Back to run" → S2/S6.

```
┌─ Final Idea  (S5) ──────────────────────────────────── ┐
│  ♔  "Mycelial routing for grid load-balancing"          │
│      cross_domain_transfer · Gen 3 winner · fitness 3.6 │
├──────────────────────────────────────────────────────────┤
│  ▸ The idea            source→target, mapping, mechanism │
│  ▸ Gauntlet survived   [ ▶ Replay the gauntlet ]         │
│      ⊘×5 mandates · 4/5 positive                         │
│  ▸ Executable proof    [ ▶ Run the transfer live ]       │
│      (or "showing recorded check ✓")                     │
│  ▸ Generational gain   Gen 0 ▮▮ 1.5  →  Gen 3 ▮▮▮▮ 3.6   │
│      ▲ +2.1 on the held-out rubric                       │
│  ▸ Provenance          A0▸A2▸(A2×A3)▸A4▸C7 · traces ↗    │
│                                          [ ◂ Back to run ]│
└──────────────────────────────────────────────────────────┘
```

---

# Area 8 — Replay controls (S6)

## `ReplayScrubber`

**Purpose.** Time-travel over a recorded run (S6) — play/pause/seek/speed, reconstructing every panel from the event log (no live calls, §4). The operator's rehearsal + provider-failure fallback tool (§17).

**Anatomy.** Transport bar: play/pause + seek slider (keyed to `sequence`, the sole ordering key) + speed control (0.5× / 1× / 2× / 4×) + current `sequence` / total + generation tick-marks on the track + "jump to event" markers (selections, fusions, culls). Anchored under the persistent REPLAY `ModeBanner`. (shadcn/ui Slider over Radix.)

**Data / props.**
```ts
interface ReplayScrubberProps {
  totalSequence: number;
  currentSequence: number;
  playing: boolean;
  speed: 0.5 | 1 | 2 | 4;
  markers: Array<{ sequence: number; kind: 'generation'|'selection'|'fusion'|'cull' }>;
  onSeek(seq: number): void;
  onPlayPause(): void;
  onSpeed(s: number): void;
}
```
Drives the `GET /runs/:id/replay` reconstruction; the whole S2 layout re-renders to `currentSequence`.

**Variants.** `default` · `at-start` · `at-end` (playback complete → "Reveal Final Idea" CTA to S5) · `scrubbing` (dragging).

**Visual states.** `default` · `playing` · `paused` · `scrubbing` · `at-start` / `at-end` · `loading` (replay log fetching) · `error` (`ErrorState`: "replay log incomplete", §17 failure state).

**Interactions.** Play/pause (Space). Drag/click track → seek (graph, charts, ticker, energy, panels all reconstruct to that `sequence`). Click a marker → jump to that beat. Speed cycle. Keyboard: ←/→ step by event, Shift+←/→ jump by generation.

```
▌ ⏮ REPLAY ▐
[ ▶/⏸ ]  ├──●───┼────┼──★──┼────⚇──┤  seq 1287 / 2104   speed [1×▾]
            Gen1  Gen2  sel  Gen3 fuse
```

---

# Area 9 — Forms (S1 · operator only) [MUTATING]

## `RunLauncherForm`

**Purpose.** Configure and start a run (S1) — the only place a new run is created (`POST /runs`). Enforces hard-max caps client-side (server re-validates; §5/§14). Operator-only; hidden from reviewers.

**Anatomy (composed sub-components).**
- **`PromptSourcePicker`** — prepared problem set ▢ vs operator-entered live prompt ▢ (§17 / `USER_FLOWS.md`).
- **`SubtypeToggle`** — `cross_domain_transfer` + `zeitgeist_synthesis`, **both on by default**.
- **`CapsControl`** (one per cap, with hard-max enforcement) — `maxPopulation`, `maxGenerations`, `energyBudget`, `maxSpawnDepth`, `maxToolCalls`, `wallClockTimeoutMs`.
- **`ModelProfileSelect`** — model profile (from `GET /model-routes`).
- **Scoring policy version** select (`ScoringPolicy.version`).
- **Start** button + validation summary.

**Data / props.**
```ts
interface RunLauncherFormProps {
  defaults: RunConfig;          // {seed, enabledSubtypes[], caps:RunCaps, modelProfile, scoringPolicyVersion}
  hardMax: RunCaps;             // ceilings; CapsControl cannot exceed (override only LOWERS, §17)
  problemSets: Array<{ id: string; label: string }>;
  modelProfiles: Array<{ id: string; label: string }>;   // GET /model-routes
  scoringPolicies: string[];
  onStart(config: RunConfig): void;   // [MUTATING] POST /runs (idempotent)
}
```

**Variants.** `modal` (over S0/S2) / `full-page` · `live-prompt` vs `prepared` (prompt source switches the input). All disabled in reviewer context.

**Visual states.** `default` · `validating` · `invalid` (cap over hard-max, missing prompt, malformed problem set — inline errors per `USER_FLOWS.md` failure states) · `submitting` (Start → spinner; idempotent guard prevents duplicate runs) · `error` (provider config missing, runtime worker unavailable → `ErrorState` with cause) · `degraded` (model-routes unreachable → defaults only).

**Interactions.** Pick prompt source → relevant input shows. Toggle subtypes (≥1 required). Adjust caps via `CapsControl` sliders/inputs — exceeding hard-max snaps back + shows "max N (hard cap)". Select model profile + policy. Start → confirm if live prompt is sensitive (content-toggle reminder, §13).

```
┌─ New Run  (S1) ───────────────────────────────────────── ✕ ┐
│ Prompt source:  ( ) prepared ▾  (•) live prompt            │
│   ┌──────────────────────────────────────────────────────┐ │
│   │ "How might fungal networks inform power-grid routing?"│ │
│   └──────────────────────────────────────────────────────┘ │
│ Subtypes:  [✓] cross_domain_transfer  [✓] zeitgeist_synth. │
│ Caps (hard-max enforced):                                  │
│   population  [ 20 ]/40   generations [ 6 ]/10             │
│   energy      [1000]/2000 spawn depth [ 3 ]/5             │
│   tool calls  [ 50 ]/100  wall-clock  [10m]/20m           │
│ Model profile [ balanced ▾ ]   Scoring policy [ v0.3 ▾ ]  │
│                                            [ ▶ Start Run ] │
└──────────────────────────────────────────────────────────────┘
```

## `PromptSourcePicker`

**Purpose.** Choose prepared problem set vs operator-entered live prompt (the §17 / open-question demo choice — both supported).

**Anatomy.** Radio pair; "prepared" reveals a problem-set dropdown, "live" reveals a textarea with a "may be shown to audience" hint + content-logging toggle reminder (§13).

**Data / props.** `{ source: 'prepared'|'live'; problemSetId?: string; livePrompt?: string; problemSets[]; onChange() }`.

**Visual states.** `default` · `prepared-selected` · `live-selected` · `invalid` (empty prompt / unset set).

## `SubtypeToggle`

**Purpose.** Enable/disable each candidate subtype; both on by default; ≥1 required.

**Anatomy.** Two labeled switches with subtype icons + one-line descriptions.

**Data / props.** `{ enabled: { cross_domain_transfer: boolean; zeitgeist_synthesis: boolean }; onChange() }`.

**Visual states.** `default (both on)` · `one-on` · `invalid (both off)` — Start disabled.

## `CapsControl` (with hard-max)

**Purpose.** Set one cap with a visible hard ceiling that cannot be exceeded (load-bearing safety, §5/§14; demo override only *lowers*, §17).

**Anatomy.** Label + numeric input/slider + "/ hardMax" suffix + unit + an inline bar showing value-vs-ceiling.

**Data / props.** `{ capKey: keyof RunCaps; value: number; hardMax: number; unit: string; onChange() }`.

**Visual states.** `default` · `at-max` (value = hardMax, capped indicator) · `invalid` (attempted > hardMax → snaps back, red "hard cap" note) · `disabled` (reviewer).

```
generations  [ 6 ] ▮▮▮▮▮▮▯▯▯▯ / 10   (hard cap)
```

## `ModelProfileSelect`

**Purpose.** Pick the model profile (routes from `GET /model-routes`) — population/critic tier vs judge/synthesis tier abstraction.

**Anatomy.** Dropdown of profiles + a read-only summary of the routes it implies (roles → providers/models).

**Data / props.** `{ value: string; profiles: Array<{id,label,routes}>; onChange() }`.

**Visual states.** `default` · `loading` (fetching routes) · `degraded` (routes unreachable → "using local defaults") · `error`.

---

# Area 10 — Feedback / system states

Reusable state components, used by every data-bound surface above. Consistency here is what makes degraded modes legible on a projector.

## `EmptyState`

**Purpose.** A surface with no data yet (pre-Gen-0 graph, no events, no candidates).

**Anatomy.** Centered icon + one-line headline + optional sub-line + optional CTA (operator-only).

**Data / props.** `{ icon; title; description?; action?; isReviewer }`.

**Variants/usage.** Graph "Population blooming…"; Ticker "waiting for events…"; Runs Home "No runs yet — [New Run]"; BestIdeaPanel "No survivor yet."

```
            ◌
   Population blooming…
   waiting for Gen 0 to spawn
```

## `LoadingState`

**Purpose.** Data in flight. Prefer **skeletons matching final layout** over spinners (less jarring on projector), spinner only for actions (Start, run-live).

**Anatomy.** Shimmer skeleton blocks shaped like the target (graph tiers, card rows, chart axes).

**Data / props.** `{ shape: 'graph'|'card'|'chart'|'inspector'|'inline' }`.

## `ErrorState`

**Purpose.** A recoverable failure (fetch failed, replay log incomplete, provider/runtime unavailable on Start).

**Anatomy.** Icon (△) + cause headline + plain explanation + retry/secondary action + (operator) link to fallback ladder.

**Data / props.** `{ title; detail; onRetry?; severity: 'recoverable'|'fatal' }`.

**Usage.** `GET /runs/:id/*` failure; Start failure (missing provider config, worker unavailable — `USER_FLOWS.md`); replay log incomplete (§17).

```
   △  Couldn't load the lineage
   GET /runs/r_42/lineage failed (503)
   [ Retry ]   [ Switch to replay ]
```

## `DegradedState`

**Purpose.** The run continues but evidence is partial — the honest-degradation surface that keeps the demo credible. Doppl's named degraded modes: **novelty-degraded**, **Langfuse-off**, **provider-failure**, **all-culled**.

**Anatomy.** Inline banner/badge (not full takeover) + which capability degraded + what's still trustworthy + what's estimated/missing.

**Data / props.**
```ts
interface DegradedStateProps {
  kind: 'novelty_degraded' | 'langfuse_off' | 'provider_failure' | 'all_culled';
  detail: string;
  mode: 'live' | 'replay';
}
```

**Variants / per-kind behavior.**
| kind | Triggered by | Surface |
|---|---|---|
| `novelty_degraded` | `novelty_scoring_degraded` (§5) | NoveltyMeter striped + FitnessBreakdown footnote "novelty estimated/absent" |
| `langfuse_off` | Langfuse unavailable (§13) | Trace links → "trace unavailable (local metadata only)" |
| `provider_failure` | `provider_call_failed` cluster | RunHeader/HealthIndicator amber; Ticker warning rows; operator prompted toward fallback ladder (§17) |
| `all_culled` | generation `survivors:0` (§3) | Graph shows extinct tier faded+sunk; BestIdeaPanel/FinalIdeaProof "no survivor — strongest culled lineage shown" |

**Visual states.** Each `kind` above; always shows what remains trustworthy (never silently hides). Persistent until resolved; legible at projector distance.

```
⚠ Novelty degraded — embedding unavailable.
  Showing estimated novelty; fitness novelty-component flagged.    [ details ]
```

---

# Cross-cutting requirements (apply to every component)

- **Status encoding:** shape + icon + label + color, never color alone (`03-status-encoding.md`). Meters for fitness/novelty/energy, not hue alone.
- **Two modes:** every live-capable component has LIVE and REPLAY variants; live↔replay is unmistakable (`ModeBanner` + `RunHeader` badge global; components adjust affordances). REPLAY disables all [MUTATING] affordances.
- **Read-only invariant:** only `RunLauncherForm` (Start) and `StopButton` mutate, via `POST` only; both hidden/disabled for reviewers and in replay.
- **Motion is meaningful, not decorative** (`07-motion-and-liveness.md`): spawn grow-in, energy drain, critic pulse, cull fade+sink, fusion two-edges-converge, mutation shimmer, generation advance. All respect `prefers-reduced-motion` (collapse to static while preserving shape+icon+label).
- **Projector legibility:** Inter for UI, JetBrains Mono for genome text / IDs / energy numbers; `size=lg` token paths exist on `StatusBadge`, meters, and headers for kiosk/projector mode.
- **SSE reducer contract:** live components consume the sequence-keyed reducer; ordering by `sequence` only; resync from `lastEventId`; a sequence gap surfaces the `degraded`/resyncing state, never a silent stall.
- **Fixtures:** every component must render from the dummy fixtures in [`08-data-and-dummy-fixtures.md`](./08-data-and-dummy-fixtures.md) with no backend — the prototype is fully clickable offline (replay-style).

---

## Component → screen → data map (quick reference)

| Component | Primary screen(s) | Backend source | Domain object(s) |
|---|---|---|---|
| AppShell · ModeBanner | all / S2,S5,S6 | — / run mode | — |
| RunHeader · RunEnergyGauge · HealthIndicator · StopButton | S2,S5,S6 | `GET /runs/:id`, `/health`; `POST /stop` | Run, RunCaps, HealthSummary, EnergyEvent |
| LineageGraph · LineageLegend · GenerationTimeline | S2,S6 | `GET /runs/:id/lineage`, `/stream` | LineageGraphProjection, Generation |
| StatusBadge | everywhere | — | Agenome/Candidate/Check status enums |
| FitnessOverTimeChart · GenerationComparison | S2,S5,S6 | `GET /runs/:id` projections | FitnessScore, ScoringPolicy, FinalJudgeRubric |
| EnergyMeter | cards, S4 | `/stream`, candidate fetch | EnergyEvent |
| ActivityTicker | S2,S6 | `GET /runs/:id/stream`, `/events` | RunEventEnvelope, RunEventType (incl. operation-start markers) |
| LiveActivity (In-Flight) | S2,S6 | `GET /runs/:id/health` (`operationsInFlight`), `/stream` | HealthSummary, RunEventType (operation-start markers) |
| BestIdeaPanel / FinalIdeaProof | S2 / S5 | `GET /runs/:id`, `/candidates/:cid`, `/replay` | CandidateIdea, FitnessScore, lineage |
| CandidateCard · CandidateInspector | S2 / S3 | `GET /runs/:id/candidates/:cid` | CandidateIdea (+subtype payloads), CriticReview, CheckResult, NoveltyScore, FitnessScore, EnergyEvent |
| AgenomeCard · AgenomeInspector | S2 / S4 | lineage + candidate fetch | Agenome, ReproductionEvent, EnergyEvent |
| CriticGauntletPanel · SubtypeCheckPanel · NoveltyMeter · FitnessBreakdown · LineagePathTrace | S3,S4,S5 | candidate fetch / events | CriticReview, CheckResult, NoveltyScore, FitnessScore, lineage |
| ReplayScrubber | S6 | `GET /runs/:id/replay`, `/events` | RunEventEnvelope (sequence) |
| RunLauncherForm (+ PromptSourcePicker, SubtypeToggle, CapsControl, ModelProfileSelect) | S1 | `POST /runs`, `GET /model-routes` | RunConfig, RunCaps, ModelRoute |
| EmptyState · LoadingState · ErrorState · DegradedState | everywhere | — | (state only) |
