# 07 · Design System Kit — Doppl

**Purpose:** The foundational design-system spec (tokens, status-encoding primitive, iconography, theming, motion vocabulary) that the design session builds **first**, before any screen or the clickable prototype — so every `S0–S6` screen and every canonical component renders from one shared, colorblind-safe, projector-legible token layer.

**Related:** `01-overview.md` · `02-personas.md` · `03-information-architecture.md` · `04-screens.md` · `05-components.md` · `06-lineage-graph.md` · `08-motion-and-liveness.md` · `09-accessibility-and-projector.md` · `10-prototype-plan.md` · ground truth: `../../ARCHITECTURE.md` (§3, §10, §11, §12, Appendix A) · `../planning/USER_FLOWS.md` · `../planning/USERS.md` · `../planning/EVALUATION_CRITERIA.md`

> **Doppl in one line (design framing):** an agental-evolution runtime you *watch* — a population of **agenomes** breeds **candidate ideas**, an adversarial **critic council + held-out judge + objective checks** score them, weak lineages are **culled**, strong PAIRS **fuse** and **mutate** into later generations that *measurably beat* earlier ones. The product **is** the process. This kit's job: make "a digital ecosystem getting smarter in real time" **legible and unforgettable** on a projector in a 10-minute showcase, and **inspectable** enough that a skeptic can defend why the winner won.

> **Visual north star:** a dark **evolutionary observatory / bioluminescent lab**. Calm chrome, vivid organism. Deep near-black canvas; living nodes that *glow*; **energy rendered as light/charge that drains**; the LineageGraph as a growing family tree. **Liveness is the soul** — things visibly spawn, spend, face critics, die, fuse, and climb. **LIVE vs REPLAY is unmistakable at a glance.**

---

## 0 · How to consume this kit

1. **Tokens are the contract.** Build them as CSS custom properties + a Tailwind `@theme` mapping (see §1.7). Everything downstream references token names (`--color-status-active`, `--energy-glow`, `--motion-cull-ms`), never raw hex. A design refinement = change one token, the whole system follows.
2. **Status is a primitive, not a color.** The `StatusBadge` (§5) encodes **shape + icon + label + color** for every lifecycle status in `../../ARCHITECTURE.md` §3. Never color alone. This is the single most reused atom in the product.
3. **shadcn/ui + Radix** supply the accessible primitives (Dialog/Drawer/Tabs/Tooltip/Slider/Badge/Popover); this kit themes them. **lucide-react** supplies icons (§6). **Tailwind CSS** is the utility layer.
4. **All values here are a *starting palette*** the design team refines. Hex/px/ms are concrete on purpose so the prototype can be built immediately with no backend (dummy data is embedded throughout the package).

---

## 1 · Design Tokens

Token tiers: **(a) primitive/raw scales** (the palette) → **(b) semantic tokens** (role-named, theme-swappable) → **(c) component tokens** (where a component needs its own knob). Components consume **(b)/(c)** only.

### 1.1 Color — the dark observatory base

The base is a cool, desaturated near-black with a faint blue-violet bias (the "lab at night"). Chrome is calm and low-chroma so the **organism's status colors and energy glow are the only saturated things on screen** — the eye goes straight to what's alive.

| Semantic token | Hex | OKLCH (canonical) | Role |
|---|---|---|---|
| `--bg-void` | `#070A12` | `oklch(0.13 0.018 265)` | App backdrop behind everything (S2 graph canvas) |
| `--bg-base` | `#0B0F1A` | `oklch(0.16 0.02 265)` | AppShell background |
| `--bg-surface` | `#111726` | `oklch(0.20 0.022 263)` | Cards, panels (CandidateCard, AgenomeCard) |
| `--bg-surface-2` | `#18202F` | `oklch(0.24 0.022 262)` | Raised surfaces, drawers (CandidateInspector/AgenomeInspector) |
| `--bg-overlay` | `#1E2738` | `oklch(0.28 0.024 262)` | Popovers, tooltips, dropdowns |
| `--bg-scrim` | `rgba(4,6,12,0.72)` | — | Modal/drawer backdrop scrim |
| `--border-subtle` | `#1F2A3D` | `oklch(0.27 0.025 260)` | Hairline dividers, card borders |
| `--border-strong` | `#33405A` | `oklch(0.38 0.035 260)` | Focus-adjacent, emphasized edges |
| `--fg-default` | `#E6ECF7` | `oklch(0.93 0.012 260)` | Primary text |
| `--fg-muted` | `#9AA7BE` | `oklch(0.72 0.02 260)` | Secondary/label text |
| `--fg-faint` | `#5C6880` | `oklch(0.52 0.022 260)` | Disabled, ghosted, culled labels |
| `--fg-on-accent` | `#06080E` | `oklch(0.13 0.01 265)` | Text on bright accent fills |

**Brand / interactive accent** (the "living cyan" — used for active life, primary CTAs, focus rings):

| Token | Hex | OKLCH | Role |
|---|---|---|---|
| `--accent` | `#3BE3D0` | `oklch(0.83 0.13 184)` | Primary CTA, links, focus ring, `active` agenome |
| `--accent-hover` | `#5FECDC` | `oklch(0.87 0.12 184)` | Hover |
| `--accent-press` | `#22C2B1` | `oklch(0.74 0.13 184)` | Active/press |
| `--accent-soft` | `rgba(59,227,208,0.14)` | — | Tinted fills, selected rows |
| `--ring` | `#3BE3D0` | — | Focus ring (2px, +2px offset) |

> **Why cyan, not the usual blue?** `eligible_parent` is **blue** (§1.3) and `reproduced` is **violet** — reserving cyan for *interactive + alive* keeps the status family unambiguous against the chrome.

### 1.2 Semantic feedback colors (non-status chrome)

| Token | Hex | OKLCH | Role |
|---|---|---|---|
| `--info` | `#5AA9FF` | `oklch(0.72 0.13 255)` | Informational banners, hints |
| `--success` | `#3FD17A` | `oklch(0.79 0.16 152)` | Positive system state (config valid) |
| `--warning` | `#F4B650` | `oklch(0.81 0.14 78)` | Caution, degraded, caps near max |
| `--danger` | `#F2545B` | `oklch(0.66 0.20 22)` | Errors, hard-cap breach, stop confirm |
| `--danger-soft` | `rgba(242,84,91,0.15)` | — | Error backgrounds |

### 1.3 STATUS palette — the colorblind-safe core (paired with shape + icon, see §5)

Every status below **always** ships with its shape + icon + label (the §5 `StatusBadge`). Color is the *fourth* redundant channel, never the only one. Hues are spaced for deuteranopia/protanopia separation; **shape + glyph are the primary discriminators** so the system survives full grayscale (the projector-fallback test).

**Agenome status** (`../../ARCHITECTURE.md` §3 state machine: `seeded → active → spent → eligible_parent → reproduced`; plus `mutated`, `failed`, `culled`):

| Status | Color token | Hex | Shape | Glyph | Motion signature |
|---|---|---|---|---|---|
| `seeded` | `--status-seeded` | `#6B7790` | dim ring `◌` | `Circle` (40% opacity) | faint fade-in |
| `active` | `--status-active` | `#3BE3D0` (cyan) | pulsing disc `◐` | `CircleDot` | **breathing pulse** (§4) |
| `spent` | `--status-spent` | `#7E8AA3` | hollow `○` | `CircleSlash` | dims, glow drained |
| `eligible_parent` | `--status-eligible` | `#5AA9FF` (blue) | star `★` | `Star` | gentle shimmer |
| `reproduced` | `--status-reproduced` | `#B98CFF` (violet) | two-parent `⚇` | `GitMerge` | two edges converge |
| `mutated` | `--status-mutated` | `#F4B650` (amber) | wave `∿` | `Sparkles` / `Waves` | amber **shimmer** |
| `failed` | `--status-failed` | `#F2545B` (red) | triangle `△!` (dashed) | `TriangleAlert` | quick shake, dashed border |
| `culled` | `--status-culled` | `#46506688` (gray, faded) | sunk `✕` | `X` | **fade + sink** (§4), drops a tier |

**Candidate status** (`created → under_review → checked → scored → selected`; `rejected`, `culled`, `invalid`):

| Status | Color token | Hex | Shape | Glyph | Notes |
|---|---|---|---|---|---|
| `created` | `--status-created` | `#9AA7BE` | dot `·` | `Circle` | just born, neutral |
| `under_review` | `--status-review` | `#3BE3D0` | pulsing `◐` | `Loader` (spin) / `ScanSearch` | in the gauntlet |
| `checked` | `--status-checked` | `#5AA9FF` | check-in-ring | `ShieldCheck` | checks done |
| `scored` | `--status-scored` | `#7FB2FF` | gauge | `Gauge` | fitness assigned |
| `selected` | `--status-selected` | `#FFCA3A` (gold) | crown `♔` | `Crown` | **the winner glow** |
| `rejected` | `--status-rejected` | `#8A6A6A` | `✕` | `X` | failed review |
| `culled` | `--status-culled` | `#465066` | faded | `X` | scored-then-cut |
| `invalid` | `--status-invalid` | `#F2545B` | `△` | `TriangleAlert` | schema/repair failure |

**Check status** (`../../ARCHITECTURE.md` §7 `CheckResult.status`):

| Status | Color token | Hex | Shape | Glyph |
|---|---|---|---|---|
| `passed` | `--check-passed` | `#3FD17A` (green) | filled check | `CircleCheck` |
| `failed` | `--check-failed` | `#F2545B` (red) | filled cross | `CircleX` |
| `skipped` | `--check-skipped` | `#7E8AA3` (gray) | dash `–` + reason | `MinusCircle` |

> **Skipped always shows its `skipReason`** inline (architecture requires "skipped w/ reason"). The `SubtypeCheckPanel` `CheckRow` renders `– skipped · <reason>` — never a bare gray dash.

**Run / generation health** (drives `HealthIndicator`, `RunHeader`):

| Token | Hex | Meaning |
|---|---|---|
| `--health-healthy` | `#3FD17A` | candidates flowing, last-event age low |
| `--health-degraded` | `#F4B650` | `novelty_scoring_degraded`, Langfuse-off, partial failure |
| `--health-stalled` | `#F2545B` | last-event age high, provider failures, caps near breach |

**Working / in-flight op-type indicator** (the live observatory layer — `../../ARCHITECTURE.md` §4 "Live in-flight observability" · §12 "Real-time in-flight window"). When the dashboard sees an **operation-start marker without its paired completion**, the affected node enters a **working / in-flight** sub-state *layered on top of* its existing `active` / `under_review` status (it does **not** replace the status). The op-type below tells the room *exactly what that agent is doing right now*; the underlying-op completion event clears it. These derive purely from persisted markers — they carry **no energy debit** and **need no provider call to replay**, so replay reproduces the identical in-flight choreography. A dangling start with no completion is valid (crash/timeout → run failed; replay shows started→failed).

| Op-type sub-state | Driven by start → cleared on | Color token | Hex | Shape | Glyph | Label |
|---|---|---|---|---|---|---|
| `generating` | `candidate.generation_started` → `candidate.created` (also `generation.verifying`/`scoring`/`reproducing` for the phase badge) | `--working-generating` | `#3BE3D0` (cyan) | spinning arc `◜` | `Loader` (spin) | "generating…" |
| `reviewing` | `critic.review_started` → `critic.reviewed`; `judge.review_started` → `fitness.scored` | `--working-reviewing` | `#5AA9FF` (blue) | scanning sweep `⊙` | `ScanSearch` | "reviewing…" |
| `checking` | `check.started` → `check.completed` | `--working-checking` | `#3FD17A` (green) | running gauge `◴` | `Activity` | "checking…" |
| `scoring` | `novelty.scoring_started` → `novelty.scored`; `generation.scoring` phase | `--working-scoring` | `#B98CFF` (violet) | filling gauge `◵` | `Gauge` | "scoring…" |
| `fusing` | `fusion.started` → `agenome.fused` | `--working-fusing` | `#F4B650` (amber) | converging `⧓` | `GitMerge` | "fusing…" |

> Hues reuse the colorblind-safe status spacing (deutan/protan separation) and **shape + glyph + label are the primary discriminators** — color is the fourth redundant channel. All five share the **working pulse** motion (`--motion-working-pulse-ms`, §1.9) so an in-flight node reads as *alive and busy* at a glance, distinct from the idle `active` breathing pulse. The `tool_call.started` / `tool_call.finished` pair drives the same indicator on any node using a tool (energy-metered only on the tool's success, per `../../ARCHITECTURE.md` §4). The live count of how many nodes are in each op-type feeds the **in-flight summary** (`GET /runs/:id/health`).

### 1.4 Fitness, novelty & energy — *meters, not just hue*

These are **never** communicated by color alone — they are **filled meters / charge bars** with numeric labels (JetBrains Mono). Color grades the fill; the *length* is the truth.

| Token | Hex | Use |
|---|---|---|
| `--meter-track` | `#1A2233` | empty meter channel |
| `--fitness-low` | `#F2545B` | fitness fill 0–1.5 (of 5) |
| `--fitness-mid` | `#F4B650` | fitness fill 1.5–3.5 |
| `--fitness-high` | `#3FD17A` | fitness fill 3.5–5 |
| `--novelty-fill` | `#B98CFF` | NoveltyMeter (violet = "distance/diversity") |
| `--energy-full` | `#3BE3D0` | EnergyMeter / RunEnergyGauge full charge |
| `--energy-mid` | `#7FB2FF` | half-drained |
| `--energy-low` | `#F4B650` | nearly empty (budget warning) |
| `--energy-empty` | `#3A465E` | drained track |
| `--energy-glow` | `0 0 12px rgba(59,227,208,0.55)` | the "charge" bloom that shrinks as energy drains |

> The **5-axis 0–5 held-out-judge rubric** (`grounding, novelty, feasibility, falsification_survival, subtype_check_pass`, `../../ARCHITECTURE.md` §7) renders as a 5-bar `FitnessBreakdown`. The `total` and `policyVersion` always sit beside the bars (mono).

### 1.5 Lineage edge colors (LineageGraph — `../../ARCHITECTURE.md` §10 edge types)

The graph's edges are typed; each gets a distinct stroke style + color so the family tree reads at projector distance (detail in `06-lineage-graph.md`).

| Edge type | Token | Hex | Stroke |
|---|---|---|---|
| `spawned` | `--edge-spawned` | `#5C6880` | thin solid |
| `produced` | `--edge-produced` | `#3BE3D0` | solid, cyan |
| `reviewed` | `--edge-reviewed` | `#5AA9FF` | dotted, blue |
| `checked` | `--edge-checked` | `#3FD17A` | dotted, green |
| `scored` | `--edge-scored` | `#7FB2FF` | dashed |
| `culled` | `--edge-culled` | `#465066` | dashed, faded |
| `fused` | `--edge-fused` | `#B98CFF` | **thick, violet, two→one** |
| `mutated` | `--edge-mutated` | `#F4B650` | wavy/dashed, amber |
| `selected` | `--edge-selected` | `#FFCA3A` | **thick gold, glowing** |

### 1.6 Typography

Two families. **Inter** for all UI text (projector-legible at distance). **JetBrains Mono** for *machine truth*: genome text (system prompts, persona weights), IDs, sequence numbers, energy numbers, fitness/novelty values, `policyVersion`, traces. The mono/sans split itself signals "this is data the system computed" vs "this is chrome."

```
--font-ui:   "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
--font-mono: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace;
```

**Type scale** (projector-tuned — note the *floor*: nothing meaningful below 14px; the showcase is read from across a room):

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `--text-display` | 40 / 46px | 700 | S5 FinalIdeaProof headline, payoff |
| `--text-h1` | 30 / 38px | 700 | RunHeader title, screen titles |
| `--text-h2` | 24 / 32px | 600 | Panel headers (BestIdeaPanel, FitnessOverTimeChart) |
| `--text-h3` | 19 / 28px | 600 | Card titles (CandidateCard title) |
| `--text-body-lg` | 17 / 26px | 400 | Inspector body, summaries |
| `--text-body` | 15 / 23px | 400 | Default body, labels |
| `--text-label` | 14 / 20px | 500 | Form labels, badge labels (UPPERCASE for status) |
| `--text-caption` | 13 / 18px | 400 | Captions, timestamps (the *minimum* on screen) |
| `--text-mono-lg` | 16 / 24px | 500 | Energy gauge numbers, fitness totals |
| `--text-mono` | 14 / 21px | 400 | IDs, sequence, genome fields, JSON |
| `--text-mono-sm` | 12 / 18px | 400 | Dense trace/JSON only — NOT for projector-critical info |

> **Projector rule baked in:** ActivityTicker, RunHeader, GenerationCounter, status labels, and the FitnessOverTimeChart axis labels use `--text-body` or larger. `--text-mono-sm` is reserved for inspector deep-dives the operator reads up close, never the live story on the wall.

### 1.7 Spacing, radii, sizing

8px base grid (with a 4px half-step for dense mono rows).

```
--space-0: 0      --space-1: 4px    --space-2: 8px    --space-3: 12px
--space-4: 16px   --space-5: 24px   --space-6: 32px   --space-7: 48px
--space-8: 64px   --space-9: 96px
```

| Radius | Value | Use |
|---|---|---|
| `--radius-sm` | 6px | badges, chips, inputs |
| `--radius-md` | 10px | cards, buttons (base `--radius`) |
| `--radius-lg` | 14px | panels, drawers |
| `--radius-xl` | 20px | modals (RunLauncherForm), big surfaces |
| `--radius-full` | 9999px | meters, pills, agenome node rings |

Node sizing (LineageGraph, see `06-lineage-graph.md`): `--node-agenome: 64px`, `--node-candidate: 48px`, `--node-critic/check/score: 36px`, `--node-winner: 80px`, `--node-gen-tier-gap: 140px`.

### 1.8 Elevation & glow (the bioluminescent layer)

Dark UIs read depth through **glow + subtle borders**, not heavy drop shadows. Two elevation channels: a **chrome shadow** (calm) and an **organism glow** (alive).

| Token | Value | Use |
|---|---|---|
| `--elev-0` | none | flush with base |
| `--elev-1` | `0 1px 2px rgba(0,0,0,0.4)` | cards |
| `--elev-2` | `0 6px 20px rgba(0,0,0,0.45)` | drawers, popovers |
| `--elev-3` | `0 16px 48px rgba(0,0,0,0.55)` | modals |
| `--glow-active` | `0 0 16px 2px rgba(59,227,208,0.45)` | `active` agenome / `under_review` candidate |
| `--glow-winner` | `0 0 28px 4px rgba(255,202,58,0.55)` | `selected` candidate / WinnerNode |
| `--glow-fusion` | `0 0 20px 3px rgba(185,140,255,0.5)` | fusion convergence moment |
| `--glow-danger` | `0 0 14px 2px rgba(242,84,91,0.45)` | `failed` / cap breach |
| `--glow-energy` | `0 0 12px rgba(59,227,208,0.55)` | charge bloom (scales with remaining energy) |

> **Glow is meaningful, not decorative.** Only *living/important* things glow: active life, the winner, fusion, danger, energy. Dead/`culled`/`spent` things lose glow (the visual law of the observatory: light = life).

### 1.9 Motion tokens — the liveness vocabulary (Framer Motion)

Motion is **the soul** and must be **meaningful, never decorative** — and **must respect `prefers-reduced-motion`** (§3.3). Every liveness beat maps to a named token so the prototype's choreography is consistent. Durations tuned to read on a projector (slightly slower than a desktop app — the room needs time to see it happen).

| Token | Duration | Easing | Liveness beat |
|---|---|---|---|
| `--motion-spawn-ms` | 420ms | `cubic-bezier(0.34,1.56,0.64,1)` (overshoot) | node **grows in** when an agenome/candidate spawns |
| `--motion-pulse-ms` | 1600ms (loop) | `ease-in-out` | `active`/`under_review` **breathing pulse** |
| `--motion-working-pulse-ms` | 1100ms (loop) | `ease-in-out` | **working pulse** — faster, busier beat for a node in a `generating`/`reviewing`/`checking`/`scoring`/`fusing` in-flight sub-state (§1.3); set on an unpaired operation-start marker, cleared on its completion event |
| `--motion-energy-drain-ms` | 700ms | `ease-out` | EnergyMeter charge **drops** on `energy.spent` |
| `--motion-critic-pulse-ms` | 500ms | `ease-out` | CriticNode **flashes** as a ReviewRow lands |
| `--motion-cull-ms` | 600ms | `ease-in` (fade + translateY +24px) | weak lineage **fades and sinks** |
| `--motion-fusion-ms` | 900ms | `ease-in-out` | two parent edges **converge** into a child |
| `--motion-mutate-ms` | 700ms | `ease-in-out` | amber **shimmer** sweep across a mutated node |
| `--motion-gen-advance-ms` | 800ms | `ease-in-out` | camera/tier **shifts** as generation N+1 appears |
| `--motion-chart-climb-ms` | 600ms | `ease-out` | FitnessOverTimeChart line **draws upward** |
| `--motion-fast` | 150ms | `ease-out` | hover, focus, micro-interactions |
| `--motion-base` | 240ms | `ease-out` | drawer/modal open, tab switch |
| `--motion-slow` | 380ms | `ease-in-out` | panel reveals |

> Full choreography (spawn → spend → review → cull → fuse → mutate → climb → reveal) lives in `08-motion-and-liveness.md`; this kit owns the **tokens** it draws from.

### 1.10 Z-layers

```
--z-base: 0          (canvas, content)
--z-graph-controls: 10  (React Flow minimap, zoom controls, LineageLegend)
--z-sticky: 20       (RunHeader, GenerationTimeline stepper)
--z-ticker: 25       (ActivityTicker overlay rail)
--z-drawer: 40       (CandidateInspector / AgenomeInspector)
--z-modal: 50        (RunLauncherForm modal, Stop confirm)
--z-popover: 60      (Tooltip, dropdown, NoveltyMeter explanation)
--z-banner: 70       (ModeBanner — LIVE/REPLAY must sit ABOVE everything)
--z-toast: 80        (ephemeral system toasts)
```

> **ModeBanner is the top z-layer on purpose** — LIVE vs REPLAY can never be occluded (an accessibility/credibility invariant: reviewers must never mistake replay for live).

---

## 2 · Status-Encoding System as a reusable primitive

This is the heart of the kit. The architecture mandates (`../../ARCHITECTURE.md` §12, §3): **shape + icon + label + color, never color alone**, colorblind-safe, projector-legible.

### 2.1 `StatusBadge` spec

```
<StatusBadge
  kind="agenome | candidate | check | health"
  status={...}              // the canonical status string
  size="sm | md | lg"       // lg = projector / RunHeader
  variant="chip | dot | full"  // dot = on graph node, full = label visible
  pulse?={boolean}          // active/under_review breathe
/>
```

A `full` badge is a horizontal token row:

```
┌─────────────────────────────────────┐
│  [shape+icon]  LABEL          color  │   shape ← primary discriminator
└─────────────────────────────────────┘     icon  ← reinforces meaning
   ◐ (cyan, pulsing)  ACTIVE              label ← survives grayscale + distance
                                          color ← 4th redundant channel
```

ASCII of the agenome status family (what the prototype must render):

```
◌  SEEDED          dim ring,    gray     no glow
◐  ACTIVE          pulsing disc cyan      glow-active   (breathing)
○  SPENT           hollow ring  slate     glow drained
★  ELIGIBLE        star         blue      faint shimmer
⚇  REPRODUCED      merge glyph  violet    glow-fusion
∿  MUTATED         wave         amber      shimmer sweep
△! FAILED          dashed tri   red        glow-danger  (dashed border)
✕  CULLED          sunk X       faded gray  (no glow, dropped a tier)
```

### 2.2 Rules (enforced by the primitive, not by each caller)

- **Never** render a status with color only. If a surface can't fit a label (tiny graph node), it MUST show shape + icon **and** expose the label on hover/focus tooltip (`mcp`-free, pure Radix Tooltip).
- **Shape is the first discriminator** so the system passes the grayscale test (print the screen black-and-white → still readable). Validate every status pair in grayscale during design review.
- **`skipped` and `failed` always carry their reason/error** (`skipReason`, `error`) — required by `../../ARCHITECTURE.md` §7.
- **`pulse` only on truly-live states** (`active`, `under_review`) and only in LIVE mode or during replay playback (paused replay = no pulse, so "is it moving?" answers "live or playing").

### 2.3 Dummy data the prototype can render

```jsonc
// representative status fixtures (no backend needed)
[
  { "id": "ag_0_alpha", "kind": "agenome",  "status": "active",          "label": "Agenome α · gen0" },
  { "id": "ag_2_delta", "kind": "agenome",  "status": "reproduced",      "label": "Agenome δ · gen2", "parents": ["ag_1_beta","ag_1_gamma"] },
  { "id": "ag_1_zeta",  "kind": "agenome",  "status": "culled",          "label": "Agenome ζ · gen1" },
  { "id": "cand_2_07",  "kind": "candidate","status": "selected",        "label": "Winner · transfer" },
  { "id": "cand_2_03",  "kind": "candidate","status": "under_review",    "label": "Candidate · zeitgeist" },
  { "id": "chk_2_07_a", "kind": "check",    "status": "passed",          "label": "mapping-quality" },
  { "id": "chk_2_03_b", "kind": "check",    "status": "skipped",         "label": "executable-check", "skipReason": "no allowlisted adapter" }
]
```

---

## 3 · Theming

### 3.1 Dark = default (the demo of record)

The showcase runs in dark. Tokens above ARE the dark theme. The architecture's local-first dark observatory is the canonical surface (`../../ARCHITECTURE.md` §12, §17).

### 3.2 Light & high-contrast (defined, deferred)

- **`high-contrast` (must-honor seam):** required by `../../ARCHITECTURE.md` §12 ("a high-contrast theme"). Override tokens: `--bg-base → #000`, `--fg-default → #FFF`, `--border-subtle → #4A5872`, status colors bumped to their most-saturated stops, **all glows replaced by 2px solid rings** (glow can wash out on cheap projectors). Toggled from AppShell; persists in Zustand view state.
- **`light` (deferred):** the bioluminescent metaphor is dark-native; light is a stretch. Reserve the token structure (every semantic token has a light value slot) but the prototype ships dark + high-contrast only.

### 3.3 Reduced motion

`@media (prefers-reduced-motion: reduce)` and an in-app toggle: pulses (including the **working pulse**) become a **static glow ring** — the in-flight node still reads as busy via its static op-type shape + glyph + label (§1.3); spawn/cull crossfades replace translate+scale, the chart **snaps** to its final shape, fusion shows a **static two→one edge** instead of animating convergence. Meaning is preserved via the static status encoding (§2) — motion is always *additive*, never the sole signal.

### 3.4 Tailwind + shadcn/ui wiring (canonical, Tailwind v4 `@theme`)

The kit ships as CSS variables mapped into Tailwind so shadcn/ui primitives pick them up automatically (per shadcn v4 theming). Illustrative only:

```css
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));

:root, .dark {                /* dark is default; .dark kept for shadcn parity */
  --background: #0B0F1A;  --foreground: #E6ECF7;
  --card: #111726;        --card-foreground: #E6ECF7;
  --popover: #1E2738;     --popover-foreground: #E6ECF7;
  --primary: #3BE3D0;     --primary-foreground: #06080E;
  --muted: #18202F;       --muted-foreground: #9AA7BE;
  --border: #1F2A3D;      --input: #18202F;  --ring: #3BE3D0;
  --destructive: #F2545B;
  /* status + organism tokens (Doppl-specific, consumed by StatusBadge/LineageGraph) */
  --status-active: #3BE3D0;  --status-eligible: #5AA9FF;  --status-reproduced: #B98CFF;
  --status-mutated: #F4B650; --status-failed: #F2545B;    --status-culled: #465066;
  --status-selected: #FFCA3A;
  /* working / in-flight op-type indicators (§1.3) — layered on active/under_review */
  --working-generating: #3BE3D0; --working-reviewing: #5AA9FF; --working-checking: #3FD17A;
  --working-scoring: #B98CFF;    --working-fusing: #F4B650;
  --energy-full: #3BE3D0;    --novelty-fill: #B98CFF;
  --radius: 10px;
}

@theme inline {
  --color-background: var(--background);  --color-foreground: var(--foreground);
  --color-card: var(--card);              --color-primary: var(--primary);
  --color-muted: var(--muted);            --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);          --color-ring: var(--ring);
  --color-destructive: var(--destructive);
  --color-status-active: var(--status-active);
  --color-status-selected: var(--status-selected);
  /* …rest of the status + organism family… */
  --radius-md: var(--radius);
}
```

shadcn/ui → Doppl component mapping:

| shadcn/Radix primitive | Doppl component(s) | Notes |
|---|---|---|
| `Dialog` | RunLauncherForm modal, Stop confirm | trap focus, `--z-modal` |
| `Drawer` / `Sheet` | CandidateInspector, AgenomeInspector | right-side overlay on S2/S6, `--z-drawer` |
| `Tabs` | Inspector sections (Gauntlet / Checks / Fitness / Lineage) | keyboard arrow nav |
| `Tooltip` | StatusBadge label-on-hover, NoveltyMeter explanation | required when label hidden |
| `Slider` | ReplayScrubber, CapsControl | hard-max enforced on Caps (§5 of `05-components.md`) |
| `Badge` | StatusBadge base | extended with shape+icon |
| `Popover` | FitnessBreakdown explanation, model-route detail | `--z-popover` |
| `Progress` | EnergyMeter, NoveltyMeter, FitnessBreakdown bars | themed as charge/meter |
| `Switch` | SubtypeToggle, content-logging toggle, reduced-motion | |
| `Select` | ModelProfileSelect, PromptSourcePicker | |

---

## 4 · Motion signatures (reference card)

Quick map from event → token → what the room sees. (Full spec: `08-motion-and-liveness.md`.)

| Run event (`../../ARCHITECTURE.md` §4 / Appendix A) | Token | Visible beat |
|---|---|---|
| `agenome.spawned`, `candidate.created` | `--motion-spawn-ms` | node grows in (overshoot) |
| `energy.spent` | `--motion-energy-drain-ms` | EnergyMeter charge drops, glow shrinks |
| `critic.reviewed` | `--motion-critic-pulse-ms` | CriticNode flash, ReviewRow slides into CriticGauntletPanel |
| `check.completed` | `--motion-fast` | CheckRow ✓/✕/– stamps in |
| `novelty.scored` / `fitness.scored` | `--motion-fast` | NoveltyMeter / FitnessBreakdown bars fill |
| `lineage.culled` | `--motion-cull-ms` | node fades + sinks, edge dashes to gray |
| `agenome.fused` / `reproduced` | `--motion-fusion-ms` | two parent edges converge, child blooms violet |
| `agenome.mutated` | `--motion-mutate-ms` | amber shimmer sweep |
| `generation.completed` → next | `--motion-gen-advance-ms` | tier shift, chart climbs |
| `selected` winner | `--glow-winner` + `--motion-base` | WinnerNode gold bloom, BestIdeaPanel updates |

---

## 5 · Iconography (lucide-react mapping)

One icon per concept, used everywhere that concept appears (badge, node, panel header, ticker). Stroke width `1.75`, sized to text. `aria-hidden` when paired with a text label; `aria-label` when standalone.

| Concept | lucide icon | Appears in |
|---|---|---|
| Run (live) | `Radio` / `Activity` | S0 RunsHome row, RunHeader LIVE badge |
| Run (replay) | `History` / `Rewind` | ModeBanner REPLAY, S6 |
| Generation | `Layers` | GenerationCounter, GenerationTimeline tier |
| Agenome | `Dna` | AgenomeCard, AgenomeNode, AgenomeInspector |
| Candidate idea | `Lightbulb` | CandidateCard, CandidateNode |
| `cross_domain_transfer` | `ArrowLeftRight` / `Shuffle` | subtype tag, SubtypeToggle |
| `zeitgeist_synthesis` | `Telescope` / `TrendingUp` | subtype tag, SubtypeToggle |
| Critic | `Gavel` / `ShieldQuestion` | CriticNode, CriticGauntletPanel header |
| Critic mandate · grounding | `BookCheck` | ReviewRow (`factual_grounding`) |
| Critic mandate · novelty/prior-art | `Fingerprint` | ReviewRow (`novelty_prior_art`) |
| Critic mandate · feasibility | `Wrench` | ReviewRow (`feasibility`) |
| Critic mandate · falsification | `FlaskConical` | ReviewRow (`falsification`) |
| Critic mandate · subtype-specific | `Crosshair` | ReviewRow (`subtype_specific`) |
| Held-out judge | `Scale` | FinalIdeaProof, FitnessBreakdown (judge axis) |
| Check (objective) | `ClipboardCheck` | CheckNode, SubtypeCheckPanel |
| Check passed / failed / skipped | `CircleCheck` / `CircleX` / `MinusCircle` | CheckRow |
| Execute-transfer-live | `Play` / `Terminal` | S5 live-check button |
| Novelty | `Fingerprint` | NoveltyMeter |
| Fitness / score | `Gauge` / `Trophy` | ScoreNode, FitnessOverTimeChart, FitnessBreakdown |
| Generation comparison | `GitCompareArrows` | GenerationComparison |
| Energy | `Zap` / `BatteryCharging` | EnergyMeter, RunEnergyGauge, EnergyEvent ticker rows |
| Fusion / reproduce | `GitMerge` | fused edge, reproduced badge |
| Mutation | `Sparkles` / `Waves` | mutated badge/edge |
| Cull | `Skull` / `X` | culled badge, ticker |
| Winner / selected | `Crown` | WinnerNode, FinalIdeaProof |
| Lineage path | `GitBranch` / `Workflow` | LineagePathTrace, LineageGraph |
| Caps / safety | `ShieldAlert` / `Gauge` | CapsControl, HealthIndicator |
| Stop / kill switch | `Square` (filled) / `OctagonX` | StopButton |
| Health | `HeartPulse` | HealthIndicator |
| Last-event age | `Clock` | HealthIndicator |
| Activity feed | `ListTree` / `Rss` | ActivityTicker |
| Trace link (Langfuse) | `ExternalLink` / `ScrollText` | evidence trace links |
| Replay controls | `Play`/`Pause`/`SkipForward`/`Gauge` | ReplayScrubber |
| Degraded / warning | `TriangleAlert` | DegradedState banners |
| Empty / loading / error | `Inbox` / `Loader` / `CircleAlert` | EmptyState / LoadingState / ErrorState |
| New run | `Plus` / `Sparkle` | S0 "New Run" CTA |
| Model profile | `Cpu` / `Boxes` | ModelProfileSelect |
| Prompt source | `FileText` (prepared) / `PenLine` (live) | PromptSourcePicker |

---

## 6 · System states baked into the kit (default / loading / empty / error / degraded / live / replay)

Every data surface in the package must support these. The kit supplies the shared `EmptyState / LoadingState / ErrorState / DegradedState` shells + the `ModeBanner`.

| State | Token cues | Pattern |
|---|---|---|
| **default** | full color, glow on live items | normal render |
| **loading** | `--fg-muted`, skeleton at `--bg-surface-2`, `Loader` spin (`--motion-fast`) | skeleton mirrors final layout (no jump) |
| **empty** | `--fg-faint`, centered `Inbox` icon | "No runs yet — start one" + primary CTA (S0) |
| **error** | `--danger`, `--danger-soft` bg, `CircleAlert` | message + retry; never blocks the rest of the dashboard |
| **degraded** | `--health-degraded`, `TriangleAlert`, dashed border | named variants below |
| **live** | `--accent` LIVE badge (`Radio`, pulsing), ActivityTicker streaming | `--z-banner` ModeBanner |
| **replay** | `--info` REPLAY banner (`History`), persistent, ReplayScrubber visible | `--z-banner`; pulses pause when scrubber paused |

**DegradedState named variants** (each maps to a real architecture failure event so the prototype mirrors truth):

| Variant | Event (`../../ARCHITECTURE.md` §4/§5) | UI |
|---|---|---|
| novelty-degraded | `novelty_scoring_degraded` | NoveltyMeter shows `~estimated` + amber flag, fitness still computes |
| Langfuse-off | local-only warning (§13) | trace links show "trace unavailable (local)" not broken links |
| provider-failure | `provider_call_failed` | ticker red row; HealthIndicator → stalled; operator nudge to fallback ladder |
| all-culled / zero-survivors | `generation.completed{survivors:0}` | generation tier renders all-faded; run can still complete if a prior best exists |
| caps near max | `HealthIndicator` caps-consumed | RunEnergyGauge → `--energy-low`, caps meter amber |

**ModeBanner ASCII (the non-negotiable LIVE/REPLAY signal):**

```
LIVE:   ┌────────────────────────────────────────────────┐
        │ ● LIVE   gen 2/4   ⚡ 1,840/3,000   ♥ healthy   │   accent, pulsing dot
        └────────────────────────────────────────────────┘
REPLAY: ┌────────────────────────────────────────────────┐
        │ ⟲ REPLAY · run #a3f2 · recorded 2026-06-18      │   info blue, persistent
        │   ◁◁  ▷  ▷▷    [============●——]  1.0×  seq 1240 │   ReplayScrubber
        └────────────────────────────────────────────────┘
```

---

## 7 · Token quick-reference (Tailwind-style table for the design team to refine)

The single sheet a designer tweaks. All concrete values are a **starting palette**.

```
COLOR / CHROME            COLOR / STATUS (shape+icon partner in §2)
bg-void        #070A12    status-seeded     #6B7790  ◌ Circle
bg-base        #0B0F1A    status-active      #3BE3D0  ◐ CircleDot   (pulse)
bg-surface     #111726    status-spent       #7E8AA3  ○ CircleSlash
bg-surface-2   #18202F    status-eligible    #5AA9FF  ★ Star
bg-overlay     #1E2738    status-reproduced  #B98CFF  ⚇ GitMerge
border-subtle  #1F2A3D    status-mutated     #F4B650  ∿ Sparkles
border-strong  #33405A    status-failed      #F2545B  △! TriangleAlert
fg-default     #E6ECF7    status-culled      #465066  ✕ X (faded)
fg-muted       #9AA7BE    status-selected    #FFCA3A  ♔ Crown (gold glow)
fg-faint       #5C6880    check-passed       #3FD17A  ✓ CircleCheck
accent         #3BE3D0    check-failed       #F2545B  ✕ CircleX
info           #5AA9FF    check-skipped      #7E8AA3  – MinusCircle (+reason)
success        #3FD17A
warning        #F4B650    METERS (length = truth, not hue)
danger         #F2545B    fitness-low/mid/high  #F2545B/#F4B650/#3FD17A
                          novelty-fill          #B98CFF
SPACING 4·8·12·16·24·32·48·64·96    energy full/mid/low   #3BE3D0/#7FB2FF/#F4B650
RADII   sm6 md10 lg14 xl20 full     energy-glow  0 0 12px rgba(59,227,208,.55)

TYPE  display40 h1·30 h2·24 h3·19 body-lg17 body15 label14 caption13
      mono-lg16 mono14 mono-sm12   ui=Inter  mono=JetBrains Mono   floor=13px

MOTION (ms)  spawn420 pulse1600 energy-drain700 critic-pulse500 cull600
             fusion900 mutate700 gen-advance800 chart-climb600
             fast150 base240 slow380   (all respect prefers-reduced-motion)

GLOW  active 0 0 16px rgba(59,227,208,.45)   winner 0 0 28px rgba(255,202,58,.55)
      fusion 0 0 20px rgba(185,140,255,.5)   danger 0 0 14px rgba(242,84,91,.45)

Z  base0 graph-ctrl10 sticky20 ticker25 drawer40 modal50 popover60 banner70 toast80
```

---

## 8 · Accessibility & projector rules — baked into the tokens

These are invariants from `../../ARCHITECTURE.md` §12 and `../planning/EVALUATION_CRITERIA.md` (the dashboard is a *first-class acceptance surface shown to a room*). The kit enforces them so screens inherit them for free; full audit in `09-accessibility-and-projector.md`.

- **Shape + icon + label + color, always.** Status is never color-only (§2). Validate every status in **grayscale** (the projector test).
- **Contrast:** body text ≥ 7:1 on its surface, large text/labels ≥ 4.5:1. Status colors chosen against `--bg-surface`/`--bg-surface-2` to clear AA-large; high-contrast theme clears AAA.
- **Type floor 13px**, projector-critical text ≥ 15px (§1.6). RunHeader, GenerationCounter, ActivityTicker, chart axes use ≥ body.
- **Focus visible:** 2px `--ring` + 2px offset on every interactive element; never removed. Drawers/modals trap focus (Radix).
- **Motion meaningful + reduced-motion honored** (§1.9, §3.3). No purely decorative motion.
- **LIVE vs REPLAY unmistakable:** ModeBanner at `--z-banner` (top), distinct color (accent vs info), distinct icon (`Radio` vs `History`), distinct word — three redundant channels.
- **Color-independent meters** for fitness/novelty/energy (length + number, §1.4).
- **Hit targets** ≥ 40×40px (projector + possible touch); graph nodes expose a larger invisible hit area than their visible glyph.

---

## 9 · Hand-off checklist for the design session

Build, in order, before any screen:

1. CSS-variable token layer (§1) + Tailwind `@theme` map (§3.4) — dark default + high-contrast override.
2. `StatusBadge` primitive (§2) for all four `kind`s, with grayscale + reduced-motion verified.
3. lucide icon map (§5) wired one-icon-per-concept.
4. Shared state shells: `EmptyState / LoadingState / ErrorState / DegradedState` + `ModeBanner` (§6).
5. Meter atoms: `EnergyMeter`, `RunEnergyGauge`, `NoveltyMeter`, `FitnessBreakdown` bars (length-first, §1.4).
6. Motion-token Framer config (§1.9) so liveness is centralized, not per-component.
7. Themed shadcn/ui primitives (§3.4 table) ready for `05-components.md` to compose.

Then proceed to `04-screens.md` (S0–S6) and `05-components.md`, which assume this kit exists.
