# Doppl — User Flows, Step by Step

One-line purpose: the 7 canonical Doppl flows as concrete, screen-by-screen, state-by-state walkthroughs a designer can turn into a clickable prototype without a backend.

Related: [`00-overview.md`](./00-overview.md) · [`01-design-system.md`](./01-design-system.md) · [`02-screens.md`](./02-screens.md) · [`04-components.md`](./04-components.md) · [`05-lineage-graph.md`](./05-lineage-graph.md) · [`06-motion-and-liveness.md`](./06-motion-and-liveness.md) · [`07-states-and-data.md`](./07-states-and-data.md) · ground truth: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) (§3, §10, §11, §12, Appendix A) · [`../planning/USER_FLOWS.md`](../planning/USER_FLOWS.md) · [`../planning/USERS.md`](../planning/USERS.md) · [`../planning/EVALUATION_CRITERIA.md`](../planning/EVALUATION_CRITERIA.md)

---

## How to read this doc

Each flow follows the same template so the design session can lift it directly into screens and prototype transitions:

- **Trigger** — what starts the flow.
- **Actors** — Operator (power user; start/stop/configure/inspect) and/or Reviewer (read-only; secondary, showcase audience). Single operator, no multi-user auth in MVP.
- **ASCII flow diagram** — the happy path with branch points.
- **Step table** — `Step · Operator/System action · Screen + key components · State`.
- **What's on screen** — region-by-region detail with representative DUMMY DATA.
- **Success state · Failure / edge states · Fallback ladder** — including the live→replay safety net the demo depends on.

**Canonical screens referenced:** S0 Runs Home · S1 Run Launcher · S2 Organism View · S3 Candidate Inspector (overlay) · S4 Agenome Inspector (overlay) · S5 Final Idea / Payoff · S6 Replay Mode.

**The cardinal rule (ARCHITECTURE.md §12):** the UI **never mutates authoritative state** except via `POST /runs` and `POST /runs/:id/stop`. Everything else is read-only projection (REST) + live event delivery (SSE). Reviewers can do neither POST — they only watch and inspect.

**Live vs Replay must be unmistakable at a glance** (`ModeBanner`, projector rule): a cyan LIVE pill with a pulsing dot vs. an amber REPLAY banner that spans the full width.

### Shared dummy run used throughout

To keep examples coherent, all flows reference the same fictional run:

```
runId:        run_7f3a9c
title:        "Cut customer-onboarding time for a fintech app"
subtypes:     [cross_domain_transfer, zeitgeist_synthesis]   (both on)
caps:         maxPopulation 12 · maxGenerations 5 · energyBudget 8000 doppl_energy
              maxSpawnDepth 3 · maxToolCalls 40 · wallClockTimeoutMs 600000 (10m)
modelProfile: "balanced" (cheap gen/critic · strong judge/synthesis)
scoringPolicy: v3
seed (RNG):   0x5EED42
```

Winning idea (used in flows 5 & 7):

```
candidateId: cand_g4_017
gen:         4
subtype:     cross_domain_transfer
title:       "Airport fast-track lanes → tiered KYC onboarding"
fitness:     0.87 (policy v3) · novelty 0.71 · energyEfficiency 0.66
lineage:     ag_g0_03  ⨯  ag_g2_11  →(fused) ag_g3_05  →(mutated) ag_g4_02 → cand_g4_017
```

---

## Flow 1 — Configure & Start a Run

> Maps to USER_FLOWS.md "Configure And Start A Run" and ARCHITECTURE.md §11 `POST /runs`.

**Trigger:** Operator clicks **New Run** on **S0 · Runs Home** (or "Run again" from a completed run to clone its config).
**Actor:** Operator only (Reviewer cannot start runs — the CTA is hidden / disabled for read-only).

### Flow diagram

```
[S0 Runs Home] --New Run--> [S1 Run Launcher]
        |                          |
        |                  fill RunLauncherForm
        |                          |
        |              PromptSourcePicker -> SubtypeToggle -> CapsControl
        |                          |             (hard-max clamp)
        |                          v
        |                  [Validate caps] --invalid--> inline ErrorState on field
        |                          | valid
        |                          v
        |                  click Start  --> POST /runs (idempotent)
        |                          |
        |              201 created  |  4xx/5xx
        |                          v         \--> toast ErrorState, stay on S1
        +------------------> [S2 Organism View · LoadingState -> LIVE]
```

### Step table

| Step | Operator / System action | Screen + key components | State |
|---|---|---|---|
| 1 | Operator clicks **New Run** | S0 → S1 transition; `RunLauncherForm` mounts | default |
| 2 | Choose prompt source (prepared set OR live prompt) | S1 · `PromptSourcePicker` | default |
| 3 | Confirm subtype toggles (both ON by default) | S1 · `SubtypeToggle` (cross_domain_transfer, zeitgeist_synthesis) | default |
| 4 | Review / adjust safe caps | S1 · `CapsControl` (6 caps) with **hard-max** enforcement | default → clamped if over max |
| 5 | Pick model profile + see scoring policy version | S1 · `ModelProfileSelect` (reads `GET /model-routes`) | default |
| 6 | Click **Start** | System validates caps → `POST /runs` | LoadingState (button → spinner, "Seeding population…") |
| 7 | System creates run + gen-0, seeds RNG, emits `run.configured`/`run.started` | navigate to S2 | live (LoadingState until first SSE event) |

### What's on screen — S1 · Run Launcher

```
┌─ S1 · Run Launcher ──────────────────────────────────────────────┐
│  ← Back to Runs                                  policy: v3        │
│                                                                    │
│  RUN TITLE  [ Cut customer-onboarding time for a fintech app    ]  │
│                                                                    │
│  PROMPT SOURCE   (PromptSourcePicker)                              │
│   ( ) Prepared problem set  ▸ [ Fintech onboarding ▾ ]            │
│   (•) Live prompt           ▸ [ multiline textarea ............ ]  │
│       └ "Sensitive content? disable external logging" [toggle]    │
│                                                                    │
│  IDEA SUBTYPES   (SubtypeToggle — both on by default)             │
│   [✓] cross_domain_transfer     [✓] zeitgeist_synthesis           │
│                                                                    │
│  SAFE CAPS   (CapsControl · hard-max in muted text on each)       │
│   Population        [ 12 ]  (max 24)   ▓▓▓▓▓░░░                    │
│   Generations       [  5 ]  (max  8)   ▓▓▓░░░░░                    │
│   Energy budget     [8000]  (max 20000) doppl_energy              │
│   Spawn depth       [  3 ]  (max  4)                               │
│   Tool calls        [ 40 ]  (max 80)                               │
│   Wall-clock        [ 10 ] min (max 15)                           │
│                                                                    │
│  MODEL PROFILE   (ModelProfileSelect)  [ Balanced ▾ ]            │
│      cheap: gpt-4o-mini · judge: claude-sonnet · embed: t-e-3-sm   │
│                                                                    │
│                         [ Cancel ]      [  ▶ Start Run  ]          │
└──────────────────────────────────────────────────────────────────┘
```

- **Region: header** — back link to S0, current `scoringPolicy` version badge (read-only; the operator does not edit weights — numeric weights are deferred-open in §8).
- **Region: PromptSourcePicker** — radio between prepared set (dropdown of curated problems — the rehearsed fallback corpus) and a live free-text prompt. The **content-logging toggle** (ARCHITECTURE.md §13, Q3) appears under the live option so a sensitive audience prompt isn't shipped to Langfuse.
- **Region: SubtypeToggle** — two checkboxes, both checked by default; at least one must stay checked (un-checking the last shows an inline ErrorState).
- **Region: CapsControl** — six numeric inputs, each annotating its **hard-max**. Typing above max **clamps on blur** with a brief amber "clamped to max 24" micro-note. Caps are enforced in the kernel, never by prompt text — the UI just mirrors the contract.
- **Region: ModelProfileSelect** — reads `GET /model-routes`; shows the role→model mapping read-only.
- **Region: footer** — Cancel (→ S0) and Start (primary).

### States for S1

| State | Trigger | Appearance |
|---|---|---|
| default | form mounted | all fields editable, Start enabled |
| clamped | value > hard-max on blur | field snaps to max + amber micro-note |
| invalid | empty title / no subtype / non-numeric cap | red field border + inline message, Start disabled |
| loading | Start clicked, awaiting `POST /runs` | Start → spinner "Seeding population…", form locked |
| error | 4xx/5xx from `POST /runs` | toast `ErrorState`: "Couldn't start run — providers unavailable. Retry / Use prepared run." Form stays filled |
| degraded | provider config missing at validate | banner: "Embeddings key missing — novelty will run in degraded (lexical) mode." Start still allowed |

### Success state
A run is **active, bounded, visible, and streaming**. The app routes to **S2 · Organism View** with the LIVE badge; first SSE events (`run.started`, `generation.started`) flip S2 from LoadingState to the live observatory.

### Failure / edge states (from USER_FLOWS.md)
- **Missing provider configuration** → blocking validation before `POST`; offer "Use prepared run" (jumps to flow 7 replay).
- **Invalid caps** → inline field errors, Start disabled.
- **Malformed seed / problem set** → toast on the PromptSourcePicker.
- **Runtime worker unavailable** → `POST` 503; toast + "switch to prepared replay."
- **Idempotency:** double-click Start must NOT create two runs (idempotency key / terminal-state guard, §11). UI disables Start the instant it's pressed.

### Fallback ladder (configure phase)
`Live prompt, full caps` → `Live prompt, LOW caps (e.g. pop 6 / gen 3)` → `Prepared problem set` → `Labeled replay of a known-good run (S6)`. The launcher exposes the first three directly; the fourth is one click via S0 → Replay.

---

## Flow 2 — Observe Live (the main loop)

> Maps to USER_FLOWS.md "Observe Live Run" and "Execute Generation Lifecycle." This is the heart of the showcase — **S2 · Organism View**, SSE-driven.

**Trigger:** A run is active (just started in flow 1, or re-opened from S0).
**Actors:** Operator (drives, can Stop, can drill) **and** Reviewer (read-only — watches, can drill into inspectors, cannot Stop).

### Flow diagram (the generational loop, as the audience sees it)

```
            ┌──────────────────── per generation ────────────────────┐
[seed] ---> [BLOOM: agenomes spawn] --> [SPEND: energy drains] -->     |
            [GAUNTLET: critics pulse on candidates] -->               |
            [CHECKS: subtype checks pass/fail/skip] -->               |
            [SCORE: fitness bars fill] -->                            |
            [CULL: weak nodes fade + sink] -->                        |
            [FUSE: two parent edges converge into a child] -->        |
            [MUTATE: child shimmers] --> [generation.completed] ------+--> next gen
                                                                       |
   Fitness-over-time chart climbs gen 0 -> 1 -> 2 ...  -----------------+
                                                                       v
                                              [caps reached] --> run.completed --> S5
```

### Step table

| Step | System event (SSE) | What animates on S2 | Components touched | State |
|---|---|---|---|---|
| 1 | `generation.started{gen:0}` | `GenerationTimeline` advances to tier 0; `GenerationCounter` = "Gen 0/5" | RunHeader, GenerationTimeline | live |
| 2 | `agenome.spawned` ×N | `AgenomeNode`s grow-in (Framer spawn) under the GenerationNode | LineageGraph | live |
| 3 | `candidate.created` | `CandidateNode`s pop under their agenome | LineageGraph, ActivityTicker | live |
| 4 | `energy.spent` | per-agenome `EnergyMeter` drains; `RunEnergyGauge` ticks down | EnergyMeter, RunEnergyGauge | live |
| 5 | `critic.reviewed` | `CriticNode` pulses on the candidate; candidate → `under_review(◐)` | LineageGraph, StatusBadge | live |
| 6 | `check.completed` | `CheckNode` shows ✓/✕/– | LineageGraph | live |
| 7 | `novelty.scored` / `fitness.scored` | `ScoreNode` fills; `FitnessOverTimeChart` plots the gen point | FitnessOverTimeChart, FitnessBreakdown (in node) | live |
| 8 | `lineage.culled` | weak `CandidateNode`/`AgenomeNode` fade + sink (cull motion) | LineageGraph | live |
| 9 | `agenome.fused` | two parent edges converge into a new child `AgenomeNode` (next tier) | LineageGraph (fused edge) | live |
| 10 | `agenome.mutated` | child node shimmers (mutation motion), `∿` glyph | LineageGraph | live |
| 11 | `generation.completed{best}` | `BestIdeaPanel` updates "best so far"; timeline tier done | BestIdeaPanel | live |
| 12 | repeat 1–11 until caps | chart climbs visibly gen→gen | FitnessOverTimeChart, GenerationComparison | live |
| 13 | `run.completed` | "View Final Idea" CTA glows | RunHeader → S5 | live→complete |

### What's on screen — S2 · Organism View (full layout)

```
┌─ S2 · Organism View ─────────────────────────────────────────────────────────────┐
│ RunHeader: "Cut onboarding time…"  ● LIVE  | Gen 2/5 | ⚡5,210/8,000 | ♥ healthy | [■ Stop] │
├──────────────┬───────────────────────────────────────────────┬───────────────────┤
│ GenerationTimeline (stepper, left rail)                       │  Best-so-far       │
│  ● Gen0 done  │                                               │  ┌─ BestIdeaPanel ─┐│
│  ● Gen1 done  │            LINEAGE GRAPH (React Flow)         │  │ "Airport fast-  ││
│  ◐ Gen2 live  │   ┌gen0┐    ┌gen1┐     ┌gen2 (live)┐        │  │  track → KYC"   ││
│  ○ Gen3       │   │◯◯◯ │--->│★ ◐ │--->│ ⚇ ∿ ◐ ◐    │        │  │ fit 0.81 ▲      ││
│  ○ Gen4       │   │◯◯  │    │✕ ✕ │    │ (in flight)│        │  │ [Inspect →]     ││
│               │   └────┘    └────┘     └────────────┘        │  └─────────────────┘│
│  LineageLegend│        minimap ▢  · zoom/pan/fit ⊕⊖⤢         │                     │
├──────────────┴───────────────────────────────────────────────┤  EnergyMeter panel │
│ FitnessOverTimeChart (Recharts)        ActivityTicker (SSE)   │  ag_g2_11 ⚡▓▓▓░ 62%│
│   0.9│              ╭─●(g2 0.81)        12:04 critic reviewed  │  ag_g2_07 ⚡▓░░░ 18%│
│   0.6│        ╭─●(g1)                   12:04 cand created     │  ag_g2_02 ⚡▓▓▓▓ 90%│
│   0.3│  ●(g0)                           12:03 ag fused ⚇      │  HealthIndicator:   │
│      └───────────────────────           12:03 cull ✕         │  3 in flight·age 2s │
│        g0   g1   g2                                            │  caps 65% consumed  │
└───────────────────────────────────────────────────────────────┴───────────────────┘
```

- **Region: RunHeader** — title · `ModeBanner` LIVE pill (cyan, pulsing dot) · `GenerationCounter` "Gen 2/5" · `RunEnergyGauge` "⚡5,210/8,000" draining · `HealthIndicator` (♥ healthy / ⚠ lagging / ✖ stalled) · `StopButton` (operator-only; hidden for Reviewer).
- **Region: GenerationTimeline (left rail)** — vertical stepper, one node per generation; done (●), live (◐ pulsing), upcoming (○). Click a past gen to scope the graph/chart to it.
- **Region: LineageGraph (center, dominant)** — React Flow, Dagre left-to-right tiers (one tier = one generation). Node types `GenerationNode / AgenomeNode / CandidateNode / CriticNode / CheckNode / ScoreNode / WinnerNode`; edges `spawned / produced / reviewed / checked / scored / culled / fused / mutated / selected`. Carries `sequenceThrough` (the high-water event mark it was built to). `LineageLegend` decodes glyphs. Minimap + zoom/pan/fit controls.
- **Region: FitnessOverTimeChart (bottom-left)** — Recharts line, one point per generation's best (and/or mean). The money curve: it climbs. `GenerationComparison` is the gen-N-vs-gen-N+1 companion (reachable via timeline or a tab).
- **Region: ActivityTicker (bottom-center)** — live SSE feed, newest on top, glyph + actor + verb + target. Click a row to drill to that node/inspector.
- **Region: EnergyMeter panel (right)** — per-agenome charge bars draining; `RunEnergyGauge` is the run-level twin in the header.
- **Region: HealthIndicator detail (right)** — current gen, candidates in flight, last-event age, caps consumed — reads `GET /runs/:id/health`; this is the **continue-vs-switch-to-replay** signal.
- **Region: BestIdeaPanel (right top)** — running "best surviving idea," updates each `generation.completed`.

### States for S2

| State | Trigger | Appearance |
|---|---|---|
| loading | run opened, no events yet | skeleton graph + "Seeding population…" `LoadingState`; LIVE pill present |
| live | SSE flowing | full liveness choreography; `last-event age` small |
| empty | run started but gen-0 produced 0 candidates | `EmptyState` in graph: "No candidates yet — agenomes spawning" |
| error | SSE 5xx / fatal | `ErrorState` over graph: "Lost run stream. Retry / Switch to replay" |
| degraded | `novelty_scoring_degraded` / Langfuse-off / provider-failure / all-culled | `DegradedState` badge in header + scoped banner (see Flow 5 degraded matrix) |
| live (reconnecting) | SSE drops | header dot turns amber "reconnecting…"; reducer resyncs from `lastEventId` (resync, no double-counting) |
| replay | opened from completed run via S6 | identical layout, amber REPLAY banner + ReplayScrubber (Flow 7) |

### Liveness reconnection detail (the SSE reducer)
S2 binds to `GET /runs/:id/stream` (EventSource). The **sequence-keyed SSE reducer** holds the last applied `sequence`. On disconnect it shows an amber "reconnecting" dot and on reconnect resends `lastEventId`; events ≤ last applied are ignored (idempotent). If reconnection fails past a threshold, the HealthIndicator goes ✖ stalled and the operator gets a **"Switch to replay"** affordance — this is the live→replay fallback ladder in action.

### Success state
Reviewers watch agents **spawn, spend energy, face critics, survive or die, fuse, mutate, and improve generation over generation** — and the fitness curve visibly climbs. Legible on a projector at distance.

### Failure / edge states
- **Dashboard lags / disconnects** → reconnecting state + resync; if persistent → HealthIndicator stalled → suggest replay.
- **Runtime vs UI divergence** → projections re-fetched from REST (`GET /runs/:id/lineage`) keyed to `sequenceThrough`; the event log stays source of truth.
- **All-culled in a generation** → DegradedState "Generation N: 0 survivors" (the kernel still completes the gen; if any earlier gen had a selected best, the run can still end `completed`).
- **Visuals fail to explain why an idea won** → mitigated by the inspectors (Flows 3–4) and S5 proof.

### Fallback ladder (observe phase)
`Live SSE` → `Live, polling REST projections (last sequence)` → `Labeled replay (S6)`. The HealthIndicator drives which rung the operator is on; the switch to replay is always one click and is **visually unmistakable** (amber banner).

---

## Flow 3 — Inspect a Candidate

> Maps to USER_FLOWS.md "Verify Candidate Ideas." Surface: **S3 · Candidate Inspector**, a drawer overlay on S2 (or S6 in replay). Reads `GET /runs/:id/candidates/:cid`.

**Trigger:** Operator or Reviewer clicks a `CandidateNode` in the LineageGraph, a `CandidateCard`, an ActivityTicker row, or the BestIdeaPanel "Inspect →".
**Actors:** Operator + Reviewer (both read-only here — inspection mutates nothing).

### Flow diagram

```
[S2 LineageGraph] --click CandidateNode--> [S3 Candidate Inspector drawer slides in from right]
        |                                          |
        |                           tabs: Payload | Gauntlet | Checks | Score | Lineage | Trace
        |                                          |
        |                          click a CriticNode in graph -> deep-link to Gauntlet tab/row
        |                                          |
        |                          "View source agenome" -> [S4 Agenome Inspector] (Flow 4)
        |                                          |
        +<-------- close / Esc / click backdrop ---+   (S2 keeps streaming underneath)
```

### Step table

| Step | Action | Screen + components | State |
|---|---|---|---|
| 1 | Click a candidate node | S2 → S3 drawer slides in over S2 (S2 dimmed but still live) | loading (skeleton) |
| 2 | Fetch `/candidates/:cid` resolves | drawer fills; default tab = **Payload** | default |
| 3 | Read subtype payload | `CandidateInspector` → subtype-specific payload block | default |
| 4 | Open **Critic Gauntlet** tab | `CriticGauntletPanel` (one `ReviewRow` per mandate) | default |
| 5 | Open **Checks** tab | `SubtypeCheckPanel` (`CheckRow` per check) | default |
| 6 | Open **Score** tab | `NoveltyMeter` + `FitnessBreakdown` (component bars, total, policyVersion, explanation) | default |
| 7 | Open **Lineage** tab | `LineagePathTrace` (ancestry to this candidate) | default |
| 8 | Open **Trace** tab | Langfuse trace links (or local-trace note if Langfuse off) | default / degraded |
| 9 | "View source agenome" | hands off to **S4 Agenome Inspector** (Flow 4) | — |
| 10 | Esc / backdrop / close | drawer slides out, S2 still live | — |

### What's on screen — S3 · Candidate Inspector (cross_domain_transfer example)

```
┌─ S2 (dimmed, still LIVE) ───────────┬─ S3 · Candidate Inspector ───────────────────┐
│  …lineage graph keeps animating…    │ cand_g4_017  ♔ selected · gen 4              │
│                                     │ cross_domain_transfer        [ View agenome ]│
│                                     ├──────────────────────────────────────────────┤
│                                     │ [Payload] Gauntlet  Checks  Score  Lineage  Trace
│                                     │                                              │
│                                     │ ▸ Title "Airport fast-track → tiered KYC"   │
│                                     │ ▸ Summary  Map airport security tiering onto │
│                                     │   onboarding: pre-vetted users skip steps…   │
│                                     │ ▸ Claims                                     │
│                                     │    • cuts median onboarding from 9m → 3m     │
│                                     │    • reuses existing risk score as "TSA-Pre" │
│                                     │ ─ CrossDomainTransferPayload ─               │
│                                     │   sourceDomain   air travel security         │
│                                     │   sourceTechnique  trusted-traveler tiering  │
│                                     │   targetDomain   fintech onboarding          │
│                                     │   targetProblem  slow KYC for all users      │
│                                     │   transferMapping  risk tier ↔ vetting lane  │
│                                     │   expectedMechanism  fewer steps for low-risk│
│                                     │   executableCheckIdea  simulate 1k users…    │
└─────────────────────────────────────┴──────────────────────────────────────────────┘
```

**Critic Gauntlet tab** (`CriticGauntletPanel` → `ReviewRow` per `CriticMandate`):

```
 CRITIC GAUNTLET  (5 mandates · candidate text is DATA, not instructions)
 ┌ mandate ──────────────┬ score ┬ conf ┬ critique ───────────────── evidence ─┐
 │ factual_grounding     │ 4/5 ▓▓▓▓░│ 0.82│ "TSA-Pre analogy is sound…"    [2 ↗]│
 │ novelty_prior_art     │ 4/5 ▓▓▓▓░│ 0.74│ "No direct prior art in KYC"  [1 ↗]│
 │ feasibility           │ 3/5 ▓▓▓░░│ 0.69│ "Needs regulator sign-off"    [3 ↗]│
 │ falsification         │ 4/5 ▓▓▓▓░│ 0.71│ "Survived: false-positive risk"[1 ↗]│
 │ subtype_specific      │ 5/5 ▓▓▓▓▓│ 0.88│ "Mapping is tight & testable" [2 ↗]│
 └───────────────────────┴───────┴──────┴─────────────────────────────────────┘
```

**Checks tab** (`SubtypeCheckPanel` → `CheckRow`):

```
 SUBTYPE CHECKS
  ✓ source_domain_validity   passed   "tiering is a real TSA mechanism"
  ✓ mapping_quality          passed   score 0.83
  ✓ prepared_toy_executable  passed   "sim: 9m→3.2m median (1000 users)"   [output ↗]
  – live_regulatory_check    skipped  reason: "no allowlisted adapter (non-executing MVP)"
```

**Score tab** (`NoveltyMeter` + `FitnessBreakdown`):

```
 NOVELTY   ▓▓▓▓▓▓▓░░░  0.71   method: cosine vs 38 prior candidates
 FITNESS  (policy v3)  TOTAL ▓▓▓▓▓▓▓▓▓░ 0.87
   critic            ▓▓▓▓▓▓▓▓░░ 0.80
   subtype_check     ▓▓▓▓▓▓▓▓▓░ 0.90
   novelty           ▓▓▓▓▓▓▓░░░ 0.71
   energy_efficiency ▓▓▓▓▓▓░░░░ 0.66
   held_out_judge    ▓▓▓▓▓▓▓▓▓░ 0.88
 explanation: "Strong judge + subtype-check; novelty mid; efficient."
```

### States for S3

| State | Trigger | Appearance |
|---|---|---|
| loading | drawer opening | skeleton rows per tab |
| default | data loaded | tabs populated |
| empty (per tab) | e.g. checks all skipped | `EmptyState`: "All checks skipped — see reasons" with CheckRows still listing reasons |
| zeitgeist variant | subtype = zeitgeist_synthesis | Payload shows `ZeitgeistSynthesisPayload` (thesis, audience, currentSignals[], whyNow, falsifiablePredictions[], comparablePriorArt[]) |
| invalid candidate | status `invalid` | red `△` header chip, payload shows the repair-failure reason |
| rejected | status `rejected` | gray `✕` header chip, "rejected at review" |
| degraded (trace) | Langfuse off | Trace tab shows "External tracing off — local trace IDs only" note |
| replay | opened from S6 | identical content from persisted events; amber REPLAY banner persists behind |

### Success state
A skeptic can read the **full evidence chain** — subtype payload, every critic mandate's score/confidence/critique/evidence, each subtype check's pass/fail/skip+reason, novelty, the decomposed fitness with policy version + explanation, the lineage path, and the trace links — and **defend why this candidate scored what it did**.

### Failure / edge states
- **Critic output invalid** → ReviewRow shows "review unavailable (schema-rejected)" rather than a fake score.
- **Check dependency failed / unsafe / infeasible** → CheckRow `skipped` with explicit reason (never silently dropped).
- **Heavy critic disagreement** → the FitnessBreakdown explanation surfaces it; the held-out judge axis is the tie-anchor.

### Fallback ladder
S3 reads a **REST projection** (`/candidates/:cid`), so it works identically in live and replay; if the live fetch fails, the same candidate is inspectable from the replay log (S6) with no behavioral difference.

---

## Flow 4 — Inspect an Agenome / Trace Lineage

> Maps to USER_FLOWS.md "Execute Generation Lifecycle" (the producing agent) + the lineage story. Surface: **S4 · Agenome Inspector**, drawer overlay on S2/S6. Lineage from `GET /runs/:id/lineage` (`LineageGraphProjection`).

**Trigger:** Click an `AgenomeNode`, an `AgenomeCard`, or "View source agenome" from S3; or click along a `LineagePathTrace`.
**Actors:** Operator + Reviewer (read-only).

### Flow diagram

```
[S2 AgenomeNode] --click--> [S4 Agenome Inspector drawer]
        |                          |
        |              tabs: Genome | Traits | Tools | Lineage | Energy | Candidates
        |                          |
        |          click a parentId in Lineage --> graph re-centers on that ancestor
        |                          |            (highlight fused/mutated edges)
        |          "trace to winner" --> graph highlights full LineagePathTrace
        |                          |
        +<------- close / Esc -----+   (S2 still streaming)
```

### Step table

| Step | Action | Screen + components | State |
|---|---|---|---|
| 1 | Click agenome node | S4 drawer over S2 | loading |
| 2 | Read genome identity | `AgenomeInspector` header (id, status glyph, gen) | default |
| 3 | **Genome** tab | system prompt (JetBrains Mono), persona/value weights | default |
| 4 | **Tools** tab | `toolPermissions[]`, decompositionPolicy, spawnBudget hint | default |
| 5 | **Lineage** tab | `parentIds[0–2]`, fusion/mutation metadata, `LineagePathTrace` | default |
| 6 | Click a parent | graph re-centers on ancestor; fused/mutated edges highlight | default |
| 7 | **Energy** tab | `EnergyMeter` history (estimate vs actual `doppl_energy`) | default |
| 8 | **Candidates** tab | list of `CandidateCard`s this genome produced → click → S3 | default |
| 9 | "Trace to winner" | graph paints the ancestry path gen-0 → winner | highlight |

### What's on screen — S4 · Agenome Inspector (a fused, mutated child)

```
┌─ S4 · Agenome Inspector ─────────────────────────────────────────┐
│ ag_g3_05   ⚇ reproduced · ∿ mutated · gen 3        [ status: spent ]│
│ parents:  ag_g0_03  ⨯  ag_g2_11   (fusion · distant lineages)     │
├──────────────────────────────────────────────────────────────────┤
│ [Genome] Traits  Tools  Lineage  Energy  Candidates               │
│                                                                    │
│ SYSTEM PROMPT  (JetBrains Mono)                                    │
│  "You are a transfer specialist. Find a mechanism in an           │
│   unrelated domain and map it precisely onto the target…"         │
│                                                                    │
│ PERSONA / VALUE WEIGHTS                                            │
│   novelty-seeking  ▓▓▓▓▓▓▓░  0.74                                  │
│   rigor            ▓▓▓▓▓░░░  0.58                                  │
│   contrarian       ▓▓▓░░░░░  0.31                                  │
│                                                                    │
│ MUTATION META (∿)  field: persona.novelty +0.12 · seed 0x5EED42   │
│ FUSION META (⚇)    crossover: prompt¾ from ag_g2_11, tools∪ both  │
└──────────────────────────────────────────────────────────────────┘
```

**Lineage tab** (the family-tree story — `LineagePathTrace`):

```
 LINEAGE PATH (gen0 → this genome → winner)
   ag_g0_03 ★eligible ─┐
                        ⨯ fused (distant) → ag_g3_05 ∿mutated → ag_g4_02 → cand_g4_017 ♔
   ag_g2_11 ★eligible ─┘
   [ Trace to winner ]   [ Re-center graph here ]
```

**Energy tab** (`EnergyMeter` ledger — estimate vs actual):

```
 ENERGY SPENT  ⚡ 410 doppl_energy  (of run 8,000)
   llm   gen call   est 120 / act 132
   tool  retrieval  est  10 / act  10
   spawn child      est  50 / act  50
   (failed/retried attempts: NOT debited — energy = productive spend)
```

### States for S4

| State | Trigger | Appearance |
|---|---|---|
| loading | drawer opening | skeleton |
| default | data loaded | all tabs populated |
| gen-0 genome | `parentIds=[]` | Lineage tab: "Seed genome — no parents (gen 0)" `EmptyState` |
| mutation-only child | `<2` eligible parents | Fusion meta replaced by "mutation-only reproduction (1 survivor)" |
| status: culled | agenome culled | header `✕` faded; "culled at gen N — outscored" |
| status: failed | agenome failed | header `△!` red dashed; "failed: provider timeout ×2" |
| replay | from S6 | identical from persisted seed/outcomes (RNG never re-sampled); REPLAY banner persists |

### Success state
The reviewer sees **meaningful lineage specialization** — distinct traits, mutation summaries, score patterns, critic feedback — and can **trace any agenome's ancestry to the winner**, seeing fusion across distant lineages and mutation as concrete, persisted events (not vibes).

### Failure / edge states
- **Fusion produced an invalid agenome** → that node carries `△` and "fusion rejected (schema-invalid) — fell back to mutation-only."
- **Agenome failed to produce structured output** → status failed with the repair/reject trail.
- **Lineage divergence vs UI** → re-fetch `/lineage` keyed to `sequenceThrough`.

### Fallback ladder
Lineage + agenome detail are REST projections, identical live vs replay; RNG outcomes are persisted, so the replayed lineage is **bit-stable** with the live one (state-equivalence contract, §4).

---

## Flow 5 — Score · Cull · Fuse · Mutate (as the audience sees it)

> Maps to USER_FLOWS.md "Score, Cull, Fuse, And Mutate" — the selection controller's work, rendered as the emotional core of the showcase. Not a separate screen: it is **choreography on S2** plus the inspectors. This is the "it's GENERATIONAL, not a one-round tournament" beat.

**Trigger:** A generation finishes verification (`generation` state → `scoring`).
**Actors:** Operator + Reviewer watch; the **selection controller** acts (UI never selects winners).

### Flow diagram (one generation's selection beat)

```
verifying done
     │
     ▼
[SCORE]  novelty.scored + fitness.scored  --> ScoreNodes fill, FitnessBreakdown bars grow
     │                                          FitnessOverTimeChart plots this gen's best
     ▼
[CULL]   lineage.culled  --> weak CandidateNode/AgenomeNode  fade + SINK (gravity)
     │                       StatusBadge ✕ gray, ActivityTicker "culled ✕"
     ▼
[SELECT PARENTS]  ★ eligible_parent glyphs light up (blue) on survivors
     │
     ▼
[FUSE]   agenome.fused  --> TWO parent edges CONVERGE into one child node (violet ⚇)
     │                       "distant lineage" tag if parents are far in idea-space
     ▼
[MUTATE] agenome.mutated --> child node SHIMMERS, ∿ amber glyph, trait-delta chip
     │
     ▼
generation.completed{best}  --> BestIdeaPanel updates; GenerationComparison gains a column
     │
     ▼
next generation tier appears  (the chart step is higher than last gen — the WOW)
```

### Step table — the visible selection sequence

| Step | SSE event | Audience-visible moment | Components + status encoding |
|---|---|---|---|
| 1 | `novelty.scored` | NoveltyMeter on each candidate fills | `NoveltyMeter` (meter, not hue) |
| 2 | `fitness.scored` | FitnessBreakdown bars grow; chart plots the gen | `FitnessBreakdown`, `FitnessOverTimeChart` |
| 3 | `lineage.culled` | weak nodes fade + sink, go dark | candidate `culled` (faded), agenome `culled(✕ gray, sunk)` |
| 4 | (selection) | survivors glow as eligible parents | agenome `eligible_parent(★ blue)` |
| 5 | `agenome.fused` | two edges converge → child | agenome `reproduced(⚇ violet, two-parent glyph)`; edge type `fused` |
| 6 | `agenome.mutated` | child shimmers | agenome `mutated(∿ amber)`; edge type `mutated` |
| 7 | `generation.completed` | best-so-far updates, comparison column added | `BestIdeaPanel`, `GenerationComparison` |
| 8 | next `generation.started` | new tier; the curve steps UP | `GenerationTimeline`, `FitnessOverTimeChart` |

### What's on screen — the cull→fuse moment (close-up)

```
   gen2 (scoring)                         gen3 (forming)
 ┌────────────────────┐
 │ cand_g2_04 fit .81 │★ eligible_parent ─┐
 │ cand_g2_09 fit .77 │★ eligible_parent ─┤⨯ FUSE
 │ cand_g2_02 fit .34 │✕ culled (sinking) │      ⚇
 │ cand_g2_07 fit .29 │✕ culled (faded)   │   ┌──────────────┐
 └────────────────────┘                   └──>│ ag_g3_05 ⚇∿  │ shimmer
   ActivityTicker:                            │ child of      │
   12:06 ✕ culled cand_g2_07 (fit 0.29)       │ g2_04 ⨯ g2_09 │
   12:06 ★ eligible ag_g2_11                  │ distant lineage│
   12:06 ⚇ fused → ag_g3_05                   └──────────────┘
   12:06 ∿ mutated ag_g3_05 (+novelty 0.12)
```

### GenerationComparison (the "N+1 beats N" proof)

```
 GENERATION COMPARISON
            gen0   gen1   gen2   gen3   gen4
 best fit   0.34   0.55   0.71   0.81   0.87  ▲ climbing
 mean fit   0.21   0.39   0.58   0.69   0.78
 novelty    0.40   0.52   0.63   0.68   0.71
 survivors    2      3      3      2      1(♔)
 [ Diff gen3 → gen4 ]  shows trait & critic deltas
```

### States for this flow

| State | Trigger | Appearance |
|---|---|---|
| live (normal) | survivors exist, fusion happens | full cull/fuse/mutate choreography |
| degraded: novelty-degraded | `novelty_scoring_degraded` | NoveltyMeter shows hatched "estimated" fill + amber "lexical fallback" tag; FitnessBreakdown flags novelty as estimated |
| degraded: all-culled | generation 0 survivors | "Gen N: 0 survivors — no offspring" banner; if a prior gen had a selected best, run can still complete; else heads to `failed` |
| degenerate fusion | `<2` eligible parents | edge labeled "mutation-only (1 survivor)"; single parent → child, ⚇ replaced by ∿ only |
| energy-exhausted mid-gen | `energy_exhausted` | "Energy budget spent — scoring verified candidates so far"; RunEnergyGauge empty; partial selection still shown |
| reduced-motion | OS setting | cull = fade only (no sink), fuse = edge highlight (no convergence sweep), mutate = static ∿ chip |

### Success state
The room **sees selection happen**: weak lineages die, strong **pairs fuse** into children, mutation specializes them, and the next generation's bar on the chart is **measurably higher**. The contrast hammered home: this is generational, not a single tournament.

### Failure / edge states (from USER_FLOWS.md)
- **No candidates survive** → all-culled degraded state above.
- **Score policy missing/invalid** → blocking ErrorState (can't score) — surfaces before fusion.
- **Fusion invalid** → falls back to mutation-only with a visible note.
- **Generation/budget cap reached** → no next tier; run proceeds to Stop/Complete (Flow 6) → S5.

### Fallback ladder
Every selection decision is **explainable from persisted events** (`novelty.scored`, `fitness.scored`, `lineage.culled`, `agenome.fused`, `agenome.mutated`), so the entire cull/fuse/mutate beat **replays identically** in S6 — including the RNG outcomes — for the rehearsed-fallback demo.

---

## Flow 6 — Stop or Complete a Run

> Maps to USER_FLOWS.md "Stop Or Complete A Run." Surfaces: **S2 RunHeader StopButton** (operator command via `POST /runs/:id/stop`) → **S5 Final Idea / Payoff**.

**Trigger:** (a) operator presses **Stop**; or (b) a cap is reached (generations / energy / wall-clock); or (c) all lineages fail; or (d) best idea selected and loop ends.
**Actor:** Operator (Stop is operator-only, a **hard control path**, not best-effort UI state). Reviewer cannot Stop.

### Flow diagram

```
                 ┌── (a) operator clicks ■ Stop ──> confirm dialog ──> POST /runs/:id/stop
[S2 LIVE] -------┤
                 ├── (b) cap reached (gen/energy/wall-clock) ──┐
                 ├── (c) all lineages failed ──────────────────┤ kernel emits terminal event
                 └── (d) loop ends, best selected ─────────────┘
                                                               │
                                  run.stopped / run.completed / run_failed
                                                               │
                            cancel outstanding work · finalize · select best · summary
                                                               │
                                  ┌── completed / stopped-with-survivor ──> [S5 Final Idea]
                                  └── failed (no survivor) ──────────────> S2 ErrorState + "Replay"
```

### Step table

| Step | Action / event | Screen + components | State |
|---|---|---|---|
| 1 | Operator clicks **Stop** | S2 RunHeader `StopButton` → confirm `Dialog` | confirming |
| 2 | Confirm | `POST /runs/:id/stop` (idempotent, terminal-state guard) | loading ("Stopping — draining in-flight…") |
| 3 | Kernel cancels outstanding work safely, drains in-flight | S2 HealthIndicator → "stopping"; ticker "drain" | live→stopping |
| 4 | Kernel finalizes gen/run state, selects best surviving idea, writes summary | RunHeader badge → STOPPED/COMPLETED | terminal |
| 5a | `run.completed` / `run.stopped` (survivor exists) | "View Final Idea" CTA glows → S5 | complete |
| 5b | `run_failed` (no scored survivor ever) | S2 `ErrorState`: "Run failed — no surviving idea. Replay a prepared run." | failed |

### What's on screen — Stop confirm + finalize

```
┌─ Stop this run? ──────────────────────────────┐
│  Gen 3/5 · ⚡5,980/8,000 · 2 candidates in flight │
│  In-flight work will drain safely; partial      │
│  evidence is preserved and replayable.          │
│                                                 │
│           [ Keep running ]   [ ■ Stop run ]     │
└─────────────────────────────────────────────────┘

  After stop:  RunHeader → "● STOPPED · Gen 3 · best fit 0.81"  [ View Final Idea → ]
```

### States for S6/stop

| State | Trigger | Appearance |
|---|---|---|
| confirming | Stop clicked | modal Dialog with current run snapshot |
| stopping | POST accepted | header "stopping…", StopButton disabled, ticker shows drain |
| completed | caps reached / loop ended, survivor exists | green ● COMPLETED badge, "View Final Idea" CTA |
| stopped | operator stop, survivor exists | amber ● STOPPED badge, partial summary, "View Final Idea" |
| failed | no scored survivor ever | red ● FAILED badge, ErrorState, "Replay" CTA |
| cap-reason chip | which cap fired | small chip: "stopped: max generations" / "energy budget" / "wall-clock 10m" |
| crash-forward | restart found a non-terminal run | run marked FAILED `{reason:"crash"}` with partial summary; operator falls back to replay |

### Success state
Run ends **cleanly** with replayable evidence and an explicit final status; if a survivor exists, the operator lands on **S5** to deliver the payoff.

### Failure / edge states
- **Work continues after stop** → must not happen (hard kill switch); UI shows "stopping" until terminal event confirms.
- **Partial data lost** → partial summary preserves verified candidates (energy-exhaustion path still scores what was verified).
- **Best idea undeterminable** → FAILED state with replay fallback.
- **Double-stop** → idempotent; second press no-ops on the terminal-state guard.

### Fallback ladder
If the **live** run fails or is stopped without a satisfying payoff during the showcase, the operator immediately switches to a **labeled replay** (Flow 7) of a known-good run — the rehearsed safety net. The stop path itself never depends on UI state.

---

## Flow 7 — Replay a Run

> Maps to USER_FLOWS.md "Replay A Run." Surface: **S6 · Replay Mode** = S2's layout reskinned with a persistent REPLAY banner + a `ReplayScrubber`. Reconstructs from the event log (`GET /runs/:id/replay`) — **no live model calls**.

**Trigger:** Operator opens a completed/partial run from S0 "Replay," or **switches to replay mid-showcase** when live execution runs long or fails (the demo's safety net).
**Actors:** Operator (drives scrubber) + Reviewer (watches; can drill inspectors). Replay **cannot mutate** historical records.

### Flow diagram

```
[S0 Runs Home] --Replay a completed run--> [S6 Replay Mode]  (amber REPLAY banner top, full-width)
        |                                          |
        |              GET /runs/:id/replay -> rebuild projections from event log
        |                                          |
        |   ReplayScrubber:  ⏮ ◀◀  ▶/⏸  ▶▶ ⏭   [====●========]  speed 1× 2× 4×
        |                                          |
        |   seek to sequence S  -> graph/chart/energy/ticker reconstruct to sequenceThrough=S
        |                                          |
        |   pause -> open S3/S4 inspectors (same as live, from persisted events)
        |                                          |
        +-- "Execute the transfer live" (S5) -> re-run allowlisted check OR replay-backed result
```

### Step table

| Step | Action | Screen + components | State |
|---|---|---|---|
| 1 | Open run from S0 in Replay | S0 → S6; `ModeBanner` REPLAY (amber, full-width) | replay-loading |
| 2 | System loads event log + rebuilds projections | S6 = S2 layout; `ReplayScrubber` mounts at sequence 0 | replay |
| 3 | Press ▶ play | events apply in order (original timestamps preserved), graph animates | replay-playing |
| 4 | Adjust speed 1×/2×/4× | playback rate changes; liveness choreography preserved | replay |
| 5 | Seek/scrub to a moment | all panels reconstruct to that `sequenceThrough` | replay |
| 6 | Pause + inspect | open S3/S4 from persisted events (identical to live) | replay-paused |
| 7 | Jump to payoff | "Final Idea" → S5; "Execute transfer live" re-runs allowlisted check (prepared) | replay |

### What's on screen — S6 · Replay Mode

```
┌════════════ ⏪ REPLAY — historical run, no live calls · run_7f3a9c · completed ════════════┐
├─ RunHeader: "Cut onboarding time…"  Gen 4/5 (at scrub) | ⚡6,410/8,000 | replaying ────────┤
│  …identical S2 layout: LineageGraph · FitnessOverTimeChart · EnergyMeter · ActivityTicker… │
│   (graph reconstructed to sequenceThrough = 1,284)                                          │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│  ReplayScrubber                                                                              │
│   ⏮  ◀◀   ▶/⏸   ▶▶  ⏭     [====================●===============]   seq 1284 / 1610          │
│   speed:  ( )0.5×  (•)1×  ( )2×  ( )4×          jump: ⟦Gen0⟧⟦Gen2⟧⟦Cull⟧⟦Fusion⟧⟦Winner⟧   │
└════════════════════════════════════════════════════════════════════════════════════════════┘
```

- **Region: ModeBanner (top, full-width, amber)** — REPLAY is unmistakable; persists behind every drawer (S3/S4) so a reviewer can never confuse replay for live.
- **Region: body** — **byte-for-byte the S2 layout** (LineageGraph, charts, energy, ticker, BestIdeaPanel) reconstructed to the scrubber's `sequenceThrough`.
- **Region: ReplayScrubber (bottom)** — play/pause, step, seek bar over the per-run `sequence` axis (not wall-clock), speed control, and **bookmark jumps** to narrative beats (Gen boundaries, first cull, first fusion, winner reveal) for tight demo control.

### States for S6

| State | Trigger | Appearance |
|---|---|---|
| replay-loading | replay opened | "Reconstructing from event log…" `LoadingState`; banner already amber |
| replay (paused) | default after load | scrubber at a position, nothing animating |
| replay-playing | ▶ | choreography plays at chosen speed |
| seeking | dragging scrubber | panels rebuild to target sequence (scrub-to-state) |
| empty | event log thin/missing for a range | `EmptyState`: "No events in this range" |
| error | replay log incomplete/corrupt | `ErrorState`: "Replay log incomplete — pick another run" |
| degraded (annotation) | demo annotations present | annotations rendered as a SEPARATE labeled layer (never mixed into authoritative events) |

### Success state
The team presents a **credible run even if live LLM/tool calls are slow or unavailable** — same lineage, energy, critics, scores, and payoff, with original ordering and timestamps preserved, and **replay is unmistakable** at a glance.

### Failure / edge states (from USER_FLOWS.md)
- **Event log incomplete** → ErrorState, suggest another run.
- **Replay diverges from original scoring** → must not happen: replay reads persisted seed/outcomes/vectors and **recomputes only deterministic math** (state-equivalence contract, §4). Any divergence is a bug, not a UI state.
- **Reviewers confuse replay for live** → prevented by the full-width amber banner + scrubber + "no live calls" label.
- **Replay mutating history** → impossible; replay is read-only; annotations are a separate layer.

### Fallback ladder (the full ladder, summarized)
```
1. Live prompt, full caps            (Flow 1/2, best case)
2. Live prompt, LOW caps             (pop 6 / gen 3 — finishes fast)
3. Prepared problem set, live        (rehearsed inputs)
4. Labeled REPLAY of known-good run  (Flow 7 — guaranteed payoff)
```
The operator can drop down a rung at any time; the HealthIndicator (`GET /runs/:id/health`: current gen, candidates in flight, last-event age, caps consumed) is the **continue-vs-switch** signal, and the switch to S6 is always one click and visually unmistakable.

### The "execute the transfer live" payoff (S5, reachable from live OR replay)
For a `cross_domain_transfer` winner on a **prepared** problem, S5 re-runs the winner's **allowlisted** subtype check live (`REQ-E-003`) — the audience sees the transfer actually execute (e.g., the onboarding simulation: "9m → 3.2m median over 1000 users"). If live execution is risky, the **replay-backed** stored check output is shown instead, with the same evidence. This is the climax; both inspectors (S3/S4) and the GenerationComparison stand behind it as defensible proof.

---

## Cross-flow cheat sheet

| Flow | Primary screen(s) | Mutating call? | Reviewer can do it? | Key components |
|---|---|---|---|---|
| 1 Configure & Start | S1 | `POST /runs` | No (operator only) | RunLauncherForm, PromptSourcePicker, SubtypeToggle, CapsControl, ModelProfileSelect |
| 2 Observe Live | S2 | none (SSE/REST read) | Yes (watch + drill) | LineageGraph, FitnessOverTimeChart, EnergyMeter, ActivityTicker, RunHeader, HealthIndicator, BestIdeaPanel |
| 3 Inspect Candidate | S3 (overlay) | none | Yes | CandidateInspector, CriticGauntletPanel, SubtypeCheckPanel, NoveltyMeter, FitnessBreakdown, LineagePathTrace |
| 4 Inspect Agenome | S4 (overlay) | none | Yes | AgenomeInspector, LineagePathTrace, EnergyMeter, LineageGraph (re-center) |
| 5 Score·Cull·Fuse·Mutate | S2 (choreography) | none | Yes (watch) | LineageGraph (fused/mutated edges), FitnessBreakdown, GenerationComparison, StatusBadge |
| 6 Stop / Complete | S2 → S5 | `POST /runs/:id/stop` | No (operator only) | StopButton, RunHeader, FinalIdeaProof |
| 7 Replay | S6 (= S2) | none | Yes (operator scrubs) | ModeBanner, ReplayScrubber, all S2 components |

**Status encoding is constant across all flows** (colorblind-safe, shape+icon+label+color): agenome seeded `◌` / active `◐` cyan / spent `○` / eligible_parent `★` blue / reproduced `⚇` violet / mutated `∿` amber / failed `△!` red dashed / culled `✕` gray sunk; candidate created→under_review `◐`→checked→scored→selected `♔` gold, rejected `✕`, culled faded, invalid `△` red; check passed `✓` green / failed `✕` red / skipped `–` gray+reason. See [`01-design-system.md`](./01-design-system.md) and [`04-components.md`](./04-components.md) for the canonical tokens; [`05-lineage-graph.md`](./05-lineage-graph.md) for node/edge rendering; [`06-motion-and-liveness.md`](./06-motion-and-liveness.md) for the spawn/drain/cull/fuse/mutate choreography; [`07-states-and-data.md`](./07-states-and-data.md) for the dummy SSE event fixtures that drive a backend-free prototype.
