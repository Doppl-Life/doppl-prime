# Doppl — 04 · Screen-by-Screen Specification

> The build spec for every Doppl prototype page (S0–S6): purpose, audience, layout, regions, composed components, dummy data, every state, and every interaction — so a clickable dummy prototype can be built with no backend.

**Related:** `01-overview.md` · `02-design-system.md` · `03-components.md` · `05-motion.md` · `06-states-and-data.md` · `ARCHITECTURE.md` (§3 domain, §10 lineage, §11 API/flows, §12 dashboard, Appendix A) · `docs/planning/USER_FLOWS.md` · `docs/planning/USERS.md` · `docs/planning/EVALUATION_CRITERIA.md`

---

## 0 · Reading this document

Every screen below carries the same eight sections so the design/prototype session can work screen-by-screen without re-deriving context:

1. **Purpose** — the one job the screen does.
2. **Who uses it** — Operator (read/write) vs. Reviewer (read-only). See `USERS.md` permission matrix.
3. **Layout** — ASCII wireframe + region map.
4. **Regions / zones** — named, in reading order.
5. **Components composed** — by canonical name (see `03-components.md`).
6. **Data shown** — bound fields + representative **DUMMY DATA** (prototype-ready, no backend).
7. **States** — default / loading / empty / error / degraded / live / replay (only the ones that apply).
8. **Key interactions** — hover / click / select / drill / scrub.

### Canonical screen map

| ID | Name | Type | Mode | Primary actor | Backed by (ARCHITECTURE §11) |
|----|------|------|------|---------------|------------------------------|
| **S0** | Runs Home | Page | n/a | Operator + Reviewer | `GET /runs` |
| **S1** | Run Launcher | Modal or full page | n/a | Operator only | `GET /model-routes`, `POST /runs` |
| **S2** | Organism View | Page | **LIVE** | Operator + Reviewer | `GET /runs/:id`, `/stream` (SSE), `/lineage`, `/health` |
| **S3** | Candidate Inspector | Drawer over S2/S6 | live or replay | Operator + Reviewer | `GET /runs/:id/candidates/:cid` |
| **S4** | Agenome Inspector | Drawer over S2/S6 | live or replay | Operator + Reviewer | from `/lineage` node `dataRef` |
| **S5** | Final Idea / Payoff | Page (or S2 takeover) | live-completed or replay | Operator + Reviewer | `GET /runs/:id`, `/candidates/:cid`, `/lineage` |
| **S6** | Replay Mode | Page (S2 reskin) | **REPLAY** | Operator + Reviewer | `GET /runs/:id/replay`, `/events`, `/lineage` |

> **S3 and S4 are overlays** on S2/S6, never standalone routes. **S6 reuses S2's exact layout** with a `ModeBanner=REPLAY` and a `ReplayScrubber` added. **S5** can render as its own route or as a takeover panel inside a completed S2.

### Mode legend used in every wireframe

```
[LIVE]   = ModeBanner LIVE   — cyan, pulsing dot, "● LIVE"   — SSE-driven, things move in real time
[REPLAY] = ModeBanner REPLAY — amber, "⏵ REPLAY"            — reconstructed from event log, scrubber visible
```

Live vs. replay must be **unmistakable at projector distance** (ARCHITECTURE §12 accessibility): different banner color, different verb, scrubber presence/absence, and a body-edge tint (cyan glow live / amber rail replay).

### Shared dummy run used across S0–S6

To keep the prototype consistent, every screen below pulls from **one canonical demo run** unless noted:

```jsonc
// RUN: run_7f3a — "Antibiotic resistance × supply-chain routing"
{
  "id": "run_7f3a",
  "title": "Cross-domain: epidemiology → logistics",
  "seed": "Find a non-obvious technique transfer that improves last-mile vaccine delivery.",
  "enabledSubtypes": ["cross_domain_transfer", "zeitgeist_synthesis"],
  "status": "running",           // configured|running|completing|completed|stopping|stopped|failed|cancelled
  "mode": "LIVE",                // LIVE | REPLAY
  "generationReached": 3,        // 0-indexed gens 0..3 so far
  "maxGenerations": 5,
  "population": 18,              // alive agenomes this gen
  "maxPopulation": 20,
  "energyUsed": 6420,
  "energyBudget": 12000,        // doppl_energy
  "scoringPolicyVersion": "sp-v3",
  "modelProfile": "balanced",
  "bestSoFar": {
    "candidateId": "cand_g3_004",
    "title": "Cold-chain routing via epidemic-curve forecasting",
    "subtype": "cross_domain_transfer",
    "fitnessTotal": 0.84,
    "generation": 3
  },
  "lastEventSequence": 1187,
  "startedAt": "2026-06-29T17:02:11Z"
}
```

---

# S0 · Runs Home

### Purpose
Entry point. List every run (live + completed + failed), show at a glance which one is live, what generation it reached, and a preview of its best idea. Launch a **New Run** or **enter Replay** of a completed one. This is the operator's "control room index" and the reviewer's "where's the demo" landing.

### Who uses it
- **Operator** — full: New Run CTA, open any run, delete/archive (stretch), resume a live run.
- **Reviewer** — read-only: open any run to watch (S2) or replay (S6); the **New Run** CTA is hidden/disabled with a tooltip "Operator only."

### Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ AppShell topbar:  ◈ DOPPL          Runs            [○ Reviewer mode]   ⚙       │ ← R1
├──────────────────────────────────────────────────────────────────────────────┤
│  Runs                                                   [ + New Run ]           │ ← R2 (header + CTA)
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │ Filter: ( All ) ( ● Live ) ( Completed ) ( Failed )    Sort: Newest ▾  │   │ ← R3 (filter/sort)
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                                │
│  ┌── RunCard ───────────────────────────────────────────────────────────┐    │ ← R4 (run list)
│  │ ● LIVE   run_7f3a  Cross-domain: epidemiology → logistics             │    │
│  │ Gen 3/5 · pop 18/20 · energy ▓▓▓▓▓░░░ 54%        ♔ best 0.84          │    │
│  │ "Cold-chain routing via epidemic-curve forecasting"                    │    │
│  │                                          [ Open live → ]               │    │
│  ├───────────────────────────────────────────────────────────────────────┤    │
│  │ ✓ DONE   run_5c1e  Zeitgeist: AI-native field service                  │    │
│  │ Gen 5/5 · 16 agenomes · gen0→winner +0.39      ♔ best 0.91            │    │
│  │ "Outcome-priced micro-dispatch for solo technicians"                   │    │
│  │                              [ Replay ⏵ ]   [ Final idea → ]           │    │
│  ├───────────────────────────────────────────────────────────────────────┤    │
│  │ △ FAILED run_2a90  Cross-domain: materials → fintech                   │    │
│  │ Gen 1/5 · run_failed: provider rate-limit         no winner           │    │
│  │                              [ Replay partial ⏵ ]                      │    │
│  └───────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Regions / zones
- **R1 · AppShell topbar** — wordmark, "Runs" route label, a Reviewer-mode toggle (demo-only client flag; gates write affordances), settings (theme, reduced-motion).
- **R2 · Page header + New Run** — title + primary CTA (operator only).
- **R3 · Filter / sort bar** — status filter chips (All / Live / Completed / Failed), sort dropdown (Newest, Best fitness, Generation reached).
- **R4 · Run list** — vertical stack of **RunCard**s, live runs pinned to top.

### Components composed
`AppShell` · **RunCard** (one per run) · `StatusBadge` (run status) · `RunEnergyGauge` (mini, inline) · `GenerationCounter` (inline "Gen 3/5") · `BestIdeaPanel` (collapsed one-line preview) · `EmptyState` · `LoadingState` · `ErrorState` · primary Button (New Run) · filter chips + sort Select (shadcn).

### Data shown (+ dummy data)
Bound to `GET /runs` → array of run summaries. Per card: `status`, `mode`, `title`, `id`, `generationReached/maxGenerations`, `population`, `energyUsed/energyBudget`, `bestSoFar.{title,fitnessTotal}`, and for completed runs a `gen0→winner` delta.

```jsonc
[
  { "id":"run_7f3a","status":"running","mode":"LIVE","title":"Cross-domain: epidemiology → logistics",
    "generationReached":3,"maxGenerations":5,"population":18,"maxPopulation":20,
    "energyUsed":6420,"energyBudget":12000,
    "bestSoFar":{"title":"Cold-chain routing via epidemic-curve forecasting","fitnessTotal":0.84} },
  { "id":"run_5c1e","status":"completed","mode":"REPLAY","title":"Zeitgeist: AI-native field service",
    "generationReached":5,"maxGenerations":5,"population":16,"maxPopulation":20,
    "energyUsed":9980,"energyBudget":12000,"gen0ToWinnerDelta":0.39,
    "bestSoFar":{"title":"Outcome-priced micro-dispatch for solo technicians","fitnessTotal":0.91} },
  { "id":"run_2a90","status":"failed","mode":"REPLAY","title":"Cross-domain: materials → fintech",
    "generationReached":1,"maxGenerations":5,"failReason":"provider rate-limit (run_failed)",
    "energyUsed":1130,"energyBudget":12000,"bestSoFar":null }
]
```

### States
- **default** — list of RunCards; at most one LIVE card, pinned, with the cyan pulsing `●`.
- **loading** — `LoadingState`: 3 skeleton RunCards (shimmer rows for title/metrics).
- **empty** — `EmptyState`: bioluminescent "no runs yet" illustration + "Seed your first run" → primary New Run. Reviewer sees "No runs to view yet."
- **error** — `ErrorState`: "Couldn't load runs" + Retry; if `GET /runs` 5xx.
- **live** — the LIVE RunCard updates its `Gen`, `pop`, energy gauge, and best-idea preview as new runs/events arrive (light polling via TanStack Query refetch; the card itself does not open an SSE stream — only S2 does).
- **replay** — n/a at the list level; completed cards expose a **Replay ⏵** action that routes to S6.
- **degraded** — if a run is `failed`, the card shows `△ FAILED` + the persisted `failReason` and only a **Replay partial** action (no live open).

### Key interactions
- **Hover RunCard** → subtle lift + glow; reveal secondary actions (Final idea / Replay).
- **Click "Open live →"** (live run) → S2 in LIVE mode.
- **Click "Replay ⏵"** (completed/failed) → S6 in REPLAY mode.
- **Click "Final idea →"** (completed) → S5.
- **Click "+ New Run"** (operator) → opens **S1** (modal over S0).
- **Filter chip / sort** → client-side filter/sort, no navigation.
- **Reviewer-mode toggle** → hides New Run, disables any write affordance app-wide (prototype client flag; mirrors `USERS.md` read-only reviewer).

---

# S1 · Run Launcher

### Purpose
Configure and start a run. The operator picks the prompt source, toggles subtypes, sets **safe caps with hard-max enforcement**, chooses a model profile and scoring-policy version, then **Start**. This is the only screen that issues a write that creates authoritative state (`POST /runs`). Embodies `USER_FLOWS.md` → *Configure And Start A Run*.

### Who uses it
- **Operator only.** Reviewers never reach S1 (CTA hidden on S0). If a reviewer deep-links, show a read-only "Operator only" notice with a Back-to-Runs button.

### Layout (modal over S0; can also be a full page)

```
┌─ New Run ──────────────────────────────────────────────────────── ✕ ──┐
│                                                                          │
│  ① Prompt source                                                         │ ← R1
│  ( ◉ Prepared problem set ▾ )   ( ○ Live prompt )                        │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ "Find a non-obvious technique transfer that improves last-mile   │    │
│  │  vaccine delivery."                                              │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ② Idea subtypes (both on by default)                                    │ ← R2
│  [✓] cross_domain_transfer     [✓] zeitgeist_synthesis                   │
│                                                                          │
│  ③ Safe caps   (slider value ≤ HARD-MAX, enforced)                       │ ← R3
│  Population        ●──────────○  18   / max 20                           │
│  Generations       ●─────○        5   / max 8                            │
│  Energy budget     ●────────○ 12000   / max 20000  doppl_energy          │
│  Spawn depth       ●──○            3   / max 5                           │
│  Tool calls        ●─────○       120   / max 200                         │
│  Wall-clock        ●────○      10 min  / max 15 min                      │
│                                                                          │
│  ④ Model profile    ( balanced ▾ )      ⑤ Scoring policy ( sp-v3 ▾ )     │ ← R4
│                                                                          │
│  ⚠ Caps validated against hard maxima. Overrides only LOWER caps.        │ ← R5 (validation note)
│                                          [ Cancel ]   [ ▶ Start run ]    │ ← R6
└──────────────────────────────────────────────────────────────────────────┘
```

### Regions / zones
- **R1 · PromptSourcePicker** — radio between **Prepared problem set** (dropdown of rehearsed prompts) and **Live prompt** (free-text). Selecting prepared fills the textarea read-only; live makes it editable.
- **R2 · SubtypeToggle** — two checkboxes, both checked by default; at least one must stay on (validation).
- **R3 · CapsControl (hard-max)** — six sliders, each labeled `value / max`. Slider cannot exceed `max` (`RunCaps` hard ceiling, ARCHITECTURE §5/§17 — overrides only **lower** caps). Each row shows units; energy in `doppl_energy`, wall-clock in minutes.
- **R4 · ModelProfileSelect + Scoring policy** — model profile (cheap / balanced / strong, from `GET /model-routes`) and scoring-policy version (`sp-v3`).
- **R5 · Validation note** — persistent reminder that caps are validated server-side and the demo override only lowers within validated maxima.
- **R6 · Footer actions** — Cancel · **Start run** (primary).

### Components composed
`RunLauncherForm` wrapping → **PromptSourcePicker** · **SubtypeToggle** · **CapsControl** (6× slider rows w/ hard-max) · **ModelProfileSelect** · scoring-policy Select · Dialog chrome (shadcn) · Button (Start/Cancel) · inline field-error text · `ErrorState` (on POST failure).

### Data shown (+ dummy data)
Reads `GET /model-routes` for profiles + scoring versions; writes `POST /runs` with a `RunConfig` (Appendix A): `{seed, enabledSubtypes[], caps:RunCaps, modelProfile, scoringPolicyVersion}` (rngSeed assigned server-side).

```jsonc
// Form state → POST /runs body
{
  "seed": "Find a non-obvious technique transfer that improves last-mile vaccine delivery.",
  "promptSource": "prepared",            // prepared | live  (client-only)
  "enabledSubtypes": ["cross_domain_transfer", "zeitgeist_synthesis"],
  "caps": {
    "maxPopulation": 18,   "maxGenerations": 5,
    "energyBudget": 12000, "maxSpawnDepth": 3,
    "maxToolCalls": 120,   "wallClockTimeoutMs": 600000
  },
  "modelProfile": "balanced",
  "scoringPolicyVersion": "sp-v3"
}

// GET /model-routes (dummy)
{
  "profiles": [
    {"id":"cheap","label":"Cheap (fast, rougher)"},
    {"id":"balanced","label":"Balanced (default)"},
    {"id":"strong","label":"Strong (judge/synthesis upgraded)"}
  ],
  "scoringPolicies": [{"version":"sp-v3","label":"sp-v3 (5-axis, equal weights)"}],
  "hardMax": {"maxPopulation":20,"maxGenerations":8,"energyBudget":20000,
              "maxSpawnDepth":5,"maxToolCalls":200,"wallClockTimeoutMs":900000}
}
```

### States
- **default** — prepared problem set selected, both subtypes on, caps pre-filled at rehearsed values below hard-max.
- **loading** — model-routes loading: profile/scoring selects show skeletons; sliders usable but Start disabled until routes resolve.
- **empty** — no prepared problem sets configured: PromptSourcePicker defaults to **Live prompt** with a hint "No prepared sets — enter a prompt."
- **error** — `POST /runs` fails: inline `ErrorState` banner in footer ("Couldn't start — provider config missing" / "Invalid caps") with the failing field highlighted; matches `USER_FLOWS.md` failure states (missing provider config, invalid caps, malformed seed, worker unavailable). Start re-enabled after edit.
- **validation (degraded input)** — slider dragged toward/at max clamps and flashes the `/max` label; if both subtypes unchecked → inline error "Enable at least one subtype," Start disabled.
- **live / replay** — n/a (S1 only configures; it never streams).

### Key interactions
- **Toggle prompt source** → swaps textarea between read-only prepared text and editable live input.
- **Drag a CapsControl slider** → value updates live; **cannot pass hard-max** (clamps, label pulses amber).
- **Uncheck a subtype** → allowed only if the other stays checked.
- **Click Start run** → optimistic transition: modal shows a brief "Seeding population…" state, then routes to **S2 (LIVE)** for the new run id. Start is **idempotent** from the UI (double-click guarded — disables button on first click; mirrors `USER_FLOWS.md` idempotent-start constraint).
- **Cancel / ✕** → close, return to S0, no run created.

---

# S2 · Organism View  *(THE heart — LIVE)*

### Purpose
The live observatory. Watch a digital ecosystem get smarter in real time and make it legible + defensible: the **Lineage Graph** at the center; run vitals, generation timeline, fitness-over-time, energy, the live activity ticker, and the best-so-far panel around it. SSE-driven. This is the screen the 10-minute showcase lives on. Embodies `USER_FLOWS.md` → *Observe Live Run*.

This is a **real-time in-flight window into the organism** (ARCHITECTURE §4/§12), not a poll-and-refresh view: the SSE stream carries both **completion events and operation-start markers** (`generation.verifying/scoring/reproducing`, `candidate.generation_started`, `critic.review_started`, `check.started`, `novelty.scoring_started`, `judge.review_started`, `fusion.started`, `tool_call.started/finished`). Lineage nodes derive a **working / in-flight** sub-state the instant a start marker arrives without its paired completion (e.g. an agenome *generating*, a critic *reviewing*, a check *running*, the held-out judge *deliberating*, a fusion *synthesizing*) and clear it the moment the completion event lands — so the demo shows what every agent is doing **mid-flight**, not only on completion. Replay (S6) reproduces the **identical in-flight choreography** from the persisted markers.

### Who uses it
- **Operator** — full: Stop button live, can open inspectors, drive the demo. Can switch to replay.
- **Reviewer** — read-only: every panel and inspector available; **Stop button hidden**; cannot mutate.

### Layout

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ RunHeader:  run_7f3a · Cross-domain: epi→logistics   [● LIVE]  Gen ❸/5            ║Stop║ │ ← R1
│             RunEnergyGauge ▓▓▓▓▓░░░ 6,420 / 12,000   HealthIndicator ◉ healthy           │
├───────────────┬──────────────────────────────────────────────────────┬─────────────────┤
│ GenerationTime│                                                        │  Best-so-far    │ ← R2 left rail · R3 center · R4 right rail
│ line (stepper)│             L I N E A G E   G R A P H                   │  ┌───────────┐  │
│               │             (React Flow · Dagre tiers)                 │  │♔ 0.84     │  │
│  ● Gen 0  ✓   │                                                        │  │Cold-chain │  │
│  ● Gen 1  ✓   │    [G0]──spawned──►(A0)──produced──►«C0»               │  │routing…   │  │
│  ● Gen 2  ✓   │     │                       │reviewed ►(crit)          │  │transfer   │  │
│  ◐ Gen 3  ●   │    [G1] (A3⚇ fused) ──► «C12» ──scored──►(0.84)♔       │  │[Inspect→] │  │
│    Gen 4  ·   │     │  ✕culled (A7)                                    │  └───────────┘  │
│    Gen 5  ·   │    [G2] ∿mutated (A9)                                  │  FitnessOverTime│
│               │                                  [minimap] [fit] [+/-] │  ┌───────────┐  │
│               │                                                        │  │   ╱╲    ╱  │  │
│ LineageLegend │                                                        │  │ ╱   ╲╱     │  │
│ ◌ seeded      │                                                        │  │╱  gen→     │  │
│ ◐ in-flight   │                                                        │  └───────────┘  │
│ ★ parent      │                                                        │  EnergyMeter ×n │
│ ⚇ reproduced  │                                                        │  InFlightSummary│
│ ∿ mutated     │                                                        │  ◐ 4 gen ·2 crit│
│ ✕ culled      │                                                        │  1 chk·1 judge  │
├───────────────┴──────────────────────────────────────────────────────┴─────────────────┤
│ ActivityTicker:  ◐ A12 generating…  ✓ check passed C9  ◐ judge reviewing  ✕ A7 culled … │ ← R5
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Regions / zones
- **R1 · RunHeader** — title + **LIVE** badge + **GenerationCounter** (Gen 3/5) + **RunEnergyGauge** (run budget, drains) + **HealthIndicator** + **StopButton** (operator only).
- **R2 · Left rail — GenerationTimeline** (stepper: gen 0…N with status glyphs) and **LineageLegend** (the status-encoding key, always visible at projector distance).
- **R3 · Center — LineageGraph** (React Flow, Dagre tiered left-to-right or top-down; node types `GenerationNode/AgenomeNode/CandidateNode/CriticNode/CheckNode/ScoreNode/WinnerNode`; edges `spawned/produced/reviewed/checked/scored/culled/fused/mutated/selected`; minimap + fit + zoom controls). Nodes carry a **working / in-flight** sub-state (a `◐` pulse + verb label — *generating / reviewing / checking / scoring / deliberating / fusing*) driven by operation-start markers, set when a start is seen without its paired completion and cleared on completion (ARCHITECTURE §4/§12).
- **R4 · Right rail** — **BestIdeaPanel** (collapsed best-so-far), **FitnessOverTimeChart** (Recharts), **EnergyMeter** stack (per-agenome charge), and **InFlightSummary** (a small "operations in flight" tally — how many agenomes / critics / checks / judge / fusions are working *right now*, from `GET /runs/:id/health`'s `operationsInFlight`).
- **R5 · Bottom — ActivityTicker** (live SSE event feed, newest left/top, glyph + actor + verb) — shows **operation start→finish** pairs (e.g. `◐ A12 generating…` then `✓ A12 candidate created`), so in-flight work appears the instant it starts, not only when it completes.

### Components composed
`AppShell` · **RunHeader** (`StatusBadge`/ModeBanner=LIVE + **GenerationCounter** + **RunEnergyGauge** + **HealthIndicator** + **StopButton**) · **GenerationTimeline** · **LineageGraph** (+ node components with **in-flight sub-state** + edge styles) · **LineageLegend** · **FitnessOverTimeChart** · **EnergyMeter** (×N) · **InFlightSummary** · **ActivityTicker** · **BestIdeaPanel** · `LoadingState`/`EmptyState`/`ErrorState`/`DegradedState` · opens **CandidateInspector** (S3) / **AgenomeInspector** (S4).

### Data shown (+ dummy data)
- Run vitals from `GET /runs/:id` + `GET /runs/:id/health`.
- Graph from `GET /runs/:id/lineage` (`LineageGraphProjection` with `sequenceThrough`), then live-mutated by the **sequence-keyed SSE reducer** consuming `GET /runs/:id/stream`.
- Fitness series + best-so-far derived from `fitness.scored` events.

```jsonc
// GET /runs/:id/health  (drives HealthIndicator + InFlightSummary — continue-vs-switch signal)
{ "currentGeneration": 3, "candidatesInFlight": 4, "lastEventAgeMs": 1300,
  // operationsInFlight = unpaired operation-start markers (started, no completion yet) — ARCHITECTURE §11
  "operationsInFlight": {"agenomesGenerating":4,"criticsReviewing":2,"checksRunning":1,"judgeDeliberating":1,"fusionsSynthesizing":0},
  "capsConsumed": {"energy":0.535,"generations":0.6,"population":0.9,"toolCalls":0.41,"wallClock":0.62},
  "status": "healthy" }   // healthy | slow | degraded | stalled

// GET /runs/:id/lineage  (LineageGraphProjection — trimmed)
{
  "runId":"run_7f3a","sequenceThrough":1187,
  "nodes":[
    {"id":"gen_0","type":"generation","label":"Gen 0","status":"completed","metrics":{"bestFitness":0.45}},
    {"id":"ag_a0","type":"agenome","label":"A0 (seed)","status":"culled","metrics":{"energySpent":380}},
    {"id":"ag_a3","type":"agenome","label":"A3","status":"reproduced","metrics":{"energySpent":410,"parents":2}},
    // in-flight sub-state: a start marker arrived without its paired completion (ARCHITECTURE §4/§12)
    {"id":"ag_a12","type":"agenome","label":"A12","status":"running","inFlight":"generating"},
    {"id":"crit_g3_004_feas","type":"critic","label":"feasibility","status":"running","inFlight":"reviewing"},
    {"id":"cand_g3_004","type":"candidate","label":"C-G3-004","status":"selected",
      "metrics":{"fitness":0.84},"dataRef":"cand_g3_004"},
    {"id":"crit_g3_004_fals","type":"critic","label":"falsification","status":"reviewed","metrics":{"score":0.78}},
    {"id":"chk_g3_004_exec","type":"check","label":"exec-check","status":"passed"},
    {"id":"score_g3_004","type":"score","label":"0.84","status":"scored"},
    {"id":"win_g3_004","type":"winner","label":"♔","status":"selected"}
  ],
  "edges":[
    {"id":"e1","source":"gen_0","target":"ag_a0","type":"spawned"},
    {"id":"e2","source":"ag_a3","target":"cand_g3_004","type":"produced"},
    {"id":"e3","source":"ag_a1","target":"ag_a3","type":"fused","label":"parent"},
    {"id":"e4","source":"ag_a5","target":"ag_a3","type":"fused","label":"parent"},
    {"id":"e5","source":"crit_g3_004_fals","target":"cand_g3_004","type":"reviewed"},
    {"id":"e6","source":"chk_g3_004_exec","target":"cand_g3_004","type":"checked"},
    {"id":"e7","source":"cand_g3_004","target":"score_g3_004","type":"scored"},
    {"id":"e8","source":"score_g3_004","target":"win_g3_004","type":"selected"}
  ]
}

// FitnessOverTimeChart series (best + mean per generation)
[ {"gen":0,"best":0.45,"mean":0.31},{"gen":1,"best":0.58,"mean":0.40},
  {"gen":2,"best":0.71,"mean":0.55},{"gen":3,"best":0.84,"mean":0.66} ]

// ActivityTicker (most recent first) — each item is one SSE RunEvent.
// Both operation-start markers (◐ in-flight) and completion events stream here (ARCHITECTURE §4/§11).
[ {"seq":1191,"type":"judge.review_started","actor":"final_judge","label":"◐ held-out judge reviewing C-G3-004…"},
  {"seq":1189,"type":"candidate.generation_started","actor":"agenome","label":"◐ A12 generating candidate…"},
  {"seq":1188,"type":"check.started","actor":"check","label":"◐ exec-check running (C9)…"},
  {"seq":1187,"type":"candidate.created","actor":"agenome","label":"✓ A12 candidate created"},
  {"seq":1186,"type":"check.completed","actor":"check","label":"✓ exec-check passed (C9)"},
  {"seq":1182,"type":"lineage.culled","actor":"selection","label":"✕ A7 culled (fitness 0.22)"},
  {"seq":1178,"type":"fusion.started","actor":"reproduction","label":"◐ A3 fusing from A1 + A5…"},
  {"seq":1175,"type":"agenome.fused","actor":"reproduction","label":"⚇ A3 fused from A1 + A5"},
  {"seq":1170,"type":"fitness.scored","actor":"selection","label":"♔ C-G3-004 → 0.84 (new best)"} ]
```

### States
- **default (LIVE)** — graph populated, ticker flowing, energy gauge mid-drain, fitness line climbing, best-so-far set, and one or more nodes showing the **◐ in-flight** sub-state (agenomes generating / critics reviewing / checks running / judge deliberating / fusions synthesizing) with the **InFlightSummary** tallying them live.
- **loading** — `LoadingState`: graph area shows a centered "Establishing stream…" with a skeleton tier; rails show skeleton panels; header shows run title immediately (from S0 nav) with a spinner on counters.
- **empty** — run just started, gen 0 seeding: graph shows only `GenerationNode gen_0` and ◌ seeded agenomes blooming in; ticker shows "Seeding population…"; fitness chart empty with "First scores arriving" placeholder.
- **error** — `ErrorState`: SSE stream unrecoverable → red banner "Live stream lost" + **Reconnect** + **Switch to Replay** (the operator's continue-vs-switch decision); graph freezes at last `sequenceThrough` with a dim overlay.
- **degraded** — `DegradedState` variants, each a labeled chip in RunHeader + an inline note where relevant:
  - *novelty-degraded* — NoveltyMeter (in S3) and any novelty surface show a "novelty: estimated" flag (`novelty_scoring_degraded`); fitness still computes.
  - *Langfuse-off* — trace links in inspectors show "trace unavailable (Langfuse off)" but evidence still renders.
  - *provider-failure* — ticker shows `provider_call_failed` items; affected candidates flagged `△ invalid`; HealthIndicator → `slow`/`degraded`.
  - *all-culled* — a generation completed with `survivors:0`; graph tier shows all `✕ culled`, banner "Generation N: no survivors"; run may still end `completed` if any earlier gen had a `selected` best.
- **live** — this *is* the live state; SSE reducer applies both **operation-start markers and completion events** in `sequence` order, resyncs from `lastEventId` after a drop. Start markers set a node's **◐ in-flight** sub-state and bump the InFlightSummary; the paired completion clears it (a dangling start with no completion is valid — crash/timeout → run failed, ARCHITECTURE §4). Markers carry `run/generation/agenome/candidate` correlation IDs and **debit no energy** (only the underlying op's success does). Motion: spawn grow-in, **in-flight pulse**, energy drain, critic pulse, cull fade+sink, fusion two-edges-converge, mutation shimmer, generation advance (see `05-motion.md`).
- **replay** — when entered via S0 Replay or operator switch, this layout becomes **S6** (see below): banner flips to amber REPLAY, ScrubberBar appears, no SSE.

### Key interactions
- **Hover a node** → tooltip (id, status, key metric) + highlight its edges; dim the rest.
- **Click a CandidateNode (or ScoreNode/WinnerNode)** → opens **S3 · CandidateInspector** drawer (right side).
- **Click an AgenomeNode** → opens **S4 · AgenomeInspector** drawer.
- **Click a GenerationTimeline step** → graph pans/zooms to that tier; if a completed gen, can open **GenerationComparison** (gen N vs N−1).
- **Graph controls** → zoom/pan, **fit-view**, minimap navigate.
- **Click a ticker item** → deep-links to the relevant node/inspector (e.g., culled A7 → S4 showing why).
- **Hover EnergyMeter** → per-agenome breakdown (llm / tool / spawn spend).
- **Stop (operator)** → confirm dialog ("Stop run? Partial evidence is preserved.") → `POST /runs/:id/stop`; header flips to `stopping` then `stopped`; preserves partial evidence (`USER_FLOWS.md` → *Stop Or Complete*).
- **Reduced-motion** → all liveness choreography degrades to instant state changes + a single status pulse; legibility unchanged.

---

# S3 · Candidate Inspector  *(drawer over S2/S6)*

### Purpose
The **defensibility surface**: a single candidate's full evidence so a skeptic can argue why it won (or died). Shows the subtype payload, the adversarial **Critic Gauntlet**, subtype-check evidence, novelty, the decomposed fitness breakdown, energy, the lineage path, and trace links. Embodies `USER_FLOWS.md` → *Verify Candidate Ideas* (read side).

### Who uses it
- **Operator + Reviewer** — both read-only here (no candidate field is editable by anyone; candidates are authoritative event-sourced data).

### Layout (right-side drawer, ~640px, over a dimmed S2)

```
                                    ┌─ Candidate · C-G3-004 ───────────── ✕ ─┐
                                    │ ♔ selected · cross_domain_transfer      │ ← R1 header
                                    │ "Cold-chain routing via epidemic-curve  │
                                    │  forecasting"        fitness 0.84       │
                                    ├──────────────────────────────────────── │
                                    │ [ Payload ][ Critics ][ Checks ][ Fit ] │ ← R2 tabs
                                    │ ── Subtype payload (transfer) ───────── │ ← R3
                                    │ source: epidemiology / SIR curves       │
                                    │ technique: epidemic-curve forecasting   │
                                    │ target: last-mile vaccine logistics     │
                                    │ mapping: infection rate → demand surge  │
                                    │ mechanism: pre-position stock at … hubs  │
                                    │ exec-check idea: replay toy routing sim  │
                                    ├──────────────────────────────────────── │
                                    │ ── CriticGauntletPanel ──────────────── │ ← R4
                                    │ factual_grounding   0.81 ▓▓▓▓░ conf .9  │
                                    │   "Signals well-sourced; 1 weak cite"   │
                                    │ novelty_prior_art   0.77 ▓▓▓▓░ conf .8  │
                                    │ feasibility         0.69 ▓▓▓░░ conf .7  │
                                    │ falsification       0.78 ▓▓▓▓░ conf .85 │
                                    │ subtype_specific    0.88 ▓▓▓▓▓ conf .9  │
                                    ├──────────────────────────────────────── │
                                    │ ── SubtypeCheckPanel ────────────────── │ ← R5
                                    │ ✓ mapping-validity   passed             │
                                    │ ✓ exec-toy-routing   passed (−12% miles)│
                                    │ – prior-art-search   skipped: no index  │
                                    ├──────────────────────────────────────── │
                                    │ NoveltyMeter ▓▓▓▓░ 0.74 (cosine, n=37)  │ ← R6
                                    │ FitnessBreakdown  total 0.84  sp-v3      │ ← R7
                                    │   grounding .81 novelty .74 feas .69 …  │
                                    │ EnergyMeter  410 ⚡ (llm 360/tool 40/sp10)│ ← R8
                                    │ LineagePathTrace: G0·A0 → A3⚇ → C-G3-004 │ ← R9
                                    │ Traces: ⧉ Langfuse · ⧉ raw output        │ ← R10
                                    └────────────────────────────────────────┘
```

### Regions / zones
- **R1 · Header** — candidate id, `StatusBadge` (selected/scored/rejected/culled/invalid), subtype chip, title, headline fitness.
- **R2 · Tabs** — Payload · Critics · Checks · Fitness (Radix Tabs); deep-link to a tab from a clicked node (e.g., click a CriticNode → opens on Critics).
- **R3 · Subtype payload** — discriminated by subtype (`CrossDomainTransferPayload` vs `ZeitgeistSynthesisPayload`).
- **R4 · CriticGauntletPanel** — one **ReviewRow** per mandate: mandate · score (bar) · confidence · critique · evidence refs.
- **R5 · SubtypeCheckPanel** — one **CheckRow** per check: passed/failed/skipped (icon+label+color) + reason/output.
- **R6 · NoveltyMeter** — score + method + comparison-set size.
- **R7 · FitnessBreakdown** — `components{}` bars + total + policyVersion + explanation.
- **R8 · EnergyMeter** — total + llm/tool/spawn split.
- **R9 · LineagePathTrace** — ancestry chain from gen-0 to this candidate.
- **R10 · Trace links** — Langfuse + raw-output `EvidenceRef`s (resolve within Postgres tier).

### Components composed
**CandidateInspector** (drawer) wrapping → `StatusBadge` · subtype payload renderer · **CriticGauntletPanel** (ReviewRow ×5) · **SubtypeCheckPanel** (CheckRow ×N) · **NoveltyMeter** · **FitnessBreakdown** · **EnergyMeter** · **LineagePathTrace** · trace-link chips · Tabs (shadcn) · `DegradedState` (novelty-degraded / Langfuse-off).

### Data shown (+ dummy data)
`GET /runs/:id/candidates/:cid` → `CandidateIdea` + `CriticReview[]` + `CheckResult[]` + `NoveltyScore` + `FitnessScore` + energy + lineage path.

```jsonc
{
  "id":"cand_g3_004","subtype":"cross_domain_transfer","status":"selected",
  "title":"Cold-chain routing via epidemic-curve forecasting",
  "summary":"Treat vaccine demand like an infection curve; pre-position cold-chain stock using SIR-style forecasting.",
  "claims":["Demand surges follow SIR-like curves","Pre-positioning cuts last-mile miles","Forecast horizon 14d is sufficient"],
  "subtypePayload":{
    "sourceDomain":"epidemiology","sourceTechnique":"epidemic-curve (SIR) forecasting",
    "targetDomain":"last-mile vaccine logistics","targetProblem":"stockouts at rural hubs",
    "transferMapping":"infection rate → demand surge; R0 → spread of need across hubs",
    "expectedMechanism":"pre-position stock at hubs ahead of forecasted surge",
    "executableCheckIdea":"toy routing sim over 12 hubs, compare miles vs naive policy"
  },
  "criticReviews":[
    {"mandate":"factual_grounding","scores":{"value":0.81},"confidence":0.9,
     "critique":"Signals well-sourced; one weak citation on rural demand.","evidenceRefs":["ev_sig_1","ev_sig_2"]},
    {"mandate":"novelty_prior_art","scores":{"value":0.77},"confidence":0.8,
     "critique":"No direct prior art mapping SIR onto cold-chain routing.","evidenceRefs":["ev_pa_1"]},
    {"mandate":"feasibility","scores":{"value":0.69},"confidence":0.7,
     "critique":"Forecast data availability is the main risk.","evidenceRefs":[]},
    {"mandate":"falsification","scores":{"value":0.78},"confidence":0.85,
     "critique":"Survives the 'demand is random' counter via the toy sim.","evidenceRefs":["ev_chk_exec"]},
    {"mandate":"subtype_specific","scores":{"value":0.88},"confidence":0.9,
     "critique":"Mapping is tight and mechanism is concrete.","evidenceRefs":[]}
  ],
  "checkResults":[
    {"checkType":"mapping-validity","status":"passed","output":"mapping coherent","score":0.9},
    {"checkType":"exec-toy-routing","status":"passed","output":"−12% miles vs naive","score":0.82},
    {"checkType":"prior-art-search","status":"skipped","skipReason":"retrieval index unavailable"}
  ],
  "noveltyScore":{"score":0.74,"method":"cosine","comparisonSet":37,"embeddingModelId":"text-embedding-3-small",
    "explanation":"Distant from gen-0 cluster; nearest neighbor 0.61."},
  "fitnessScore":{"total":0.84,"policyVersion":"sp-v3",
    "components":{"grounding":0.81,"novelty":0.74,"feasibility":0.69,"falsification":0.78,"subtypeCheck":0.86},
    "explanation":"Equal-weight 5-axis + energy tiebreak; led generation 3."},
  "energy":{"total":410,"llm":360,"tool":40,"spawn":10,"unit":"doppl_energy"},
  "lineagePath":[{"gen":0,"agenome":"A0"},{"gen":1,"agenome":"A3","via":"fused(A1+A5)"},{"candidate":"cand_g3_004"}],
  "traces":{"langfuseTraceId":"lf_8821","rawOutputEventId":"evt_1170"}
}
```

**Zeitgeist payload variant** (when `subtype:"zeitgeist_synthesis"`), R3 renders instead:
```jsonc
{ "thesis":"Solo field technicians will be priced on outcomes, not hours.",
  "audience":"independent HVAC/appliance techs",
  "currentSignals":["gig-platform commoditization","AI triage cutting diagnosis time","warranty-as-a-service growth"],
  "whyNow":"AI triage makes outcome estimation cheap enough to price.",
  "falsifiablePredictions":["≥1 platform ships outcome pricing within 18mo"],
  "comparablePriorArt":["usage-based insurance","value-based care"] }
```

### States
- **default** — full evidence rendered; selected candidate shows the ♔ accent.
- **loading** — drawer opens immediately with header (from clicked node) + skeleton rows in each panel.
- **empty** — candidate still `created`/`under_review`: panels show "Awaiting critics…" / "Checks pending"; fitness "not yet scored."
- **error** — candidate fetch fails: inline `ErrorState` inside drawer + Retry; header still shows what the node knew.
- **degraded** — *novelty-degraded*: NoveltyMeter shows "estimated" badge + dashed bar; FitnessBreakdown flags the novelty component. *Langfuse-off*: trace chip disabled with tooltip. *invalid*: if candidate `invalid` (schema-repair exhausted), show a red `△ invalid` header + the rejection reason; no fitness.
- **live** — if the candidate is mid-review, ReviewRows fill in as `critic.reviewed` events arrive; check rows flip passed/failed/skipped live.
- **replay** — identical content (all evidence is event-sourced); trace links resolve to recorded refs; no live fill-in (it's already complete).

### Key interactions
- **Tab switch** → Payload/Critics/Checks/Fitness.
- **Expand a ReviewRow** → full critique text + evidence refs (click an `EvidenceRef` → opens its trace/output).
- **Expand a CheckRow** → full `output` or `skipReason`.
- **Click LineagePathTrace node** → switches to **S4 · AgenomeInspector** for that ancestor (or pans the graph).
- **Click a trace chip** → opens Langfuse/raw-output ref (or shows degraded tooltip if off).
- **Close (✕ / Esc / click-scrim)** → returns to S2/S6 with graph selection cleared.

---

# S4 · Agenome Inspector  *(drawer over S2/S6)*

### Purpose
Inspect a single **agenome** (agent genome): its system prompt, persona/value weights, tool permissions, decomposition policy, spawn budget, parentage (fusion/mutation lineage), energy spent, candidates produced, and status. This is where lineage **specialization** becomes legible — and where a reviewer sees that fusion children differ from their parents.

### Who uses it
- **Operator + Reviewer** — read-only. (Agenome traits are authoritative; no editing.)

### Layout (right-side drawer, ~600px, over dimmed S2)

```
                                    ┌─ Agenome · A3 ──────────────────── ✕ ─┐
                                    │ ⚇ reproduced · gen 1 · violet          │ ← R1 header
                                    │ parents: A1 ✕  +  A5 ★   (fusion)      │
                                    ├────────────────────────────────────── │
                                    │ [ Genome ][ Lineage ][ Output ]        │ ← R2 tabs
                                    │ ── System prompt (mono) ─────────────  │ ← R3
                                    │ "You hunt technique transfers between  │
                                    │  quantitative domains. Prefer …"       │
                                    │ ── personaWeights ─────────────────── │ ← R4
                                    │ rigor 0.8 ▓▓▓▓░  novelty 0.7 ▓▓▓░      │
                                    │ caution 0.4 ▓▓░  breadth 0.6 ▓▓▓       │
                                    │ ── toolPermissions ────────────────── │ ← R5
                                    │ [web-search] [calculator]  (depth ≤3)  │
                                    │ ── decompositionPolicy ──────────────  │ ← R6
                                    │ "split into source-scan → map → test"  │
                                    │ spawnBudget hint: 3  (effective ≤ caps) │
                                    ├────────────────────────────────────── │
                                    │ ── LineagePathTrace ───────────────── │ ← R7
                                    │ A1 (rigor↑) ╲                          │
                                    │             ⚇ A3  ∿(mutated: novelty+) │
                                    │ A5 (novelty↑)╱                         │
                                    ├────────────────────────────────────── │
                                    │ EnergyMeter 410 ⚡ spent · status ⚇     │ ← R8
                                    │ Candidates produced: «C-G3-004 ♔ 0.84» │ ← R9
                                    │                       «C-G3-011 ✕ 0.41»│
                                    └────────────────────────────────────────┘
```

### Regions / zones
- **R1 · Header** — agenome id, `StatusBadge` (seeded/active/spent/eligible_parent/reproduced/mutated/failed/culled), generation, parentage summary with parent status glyphs.
- **R2 · Tabs** — Genome · Lineage · Output.
- **R3 · System prompt** — JetBrains Mono, scrollable, the genome's identity.
- **R4 · personaWeights** — labeled meter bars (value weights).
- **R5 · toolPermissions** — chips + the spawn-depth ceiling note.
- **R6 · decompositionPolicy + spawnBudget** — policy text + spawn-budget hint with the "effective ≤ caps" reminder (trait can never raise a cap — ARCHITECTURE §5).
- **R7 · LineagePathTrace** — fusion/mutation ancestry; for a fused child, two parent branches converge; mutation deltas annotated.
- **R8 · EnergyMeter + status** — energy spent + terminal status.
- **R9 · Candidates produced** — mini CandidateCards (click → S3).

### Components composed
**AgenomeInspector** (drawer) wrapping → `StatusBadge` · system-prompt block (mono) · persona-weight meters · tool-permission chips · decomposition/spawn block · **LineagePathTrace** · **EnergyMeter** · **AgenomeCard** (parents) + **CandidateCard** (produced) · Tabs · `DegradedState`.

### Data shown (+ dummy data)
From the `/lineage` node `dataRef` → `Agenome` (Appendix A) + `mutationMeta` + produced-candidate summaries.

```jsonc
{
  "id":"ag_a3","runId":"run_7f3a","generationId":"gen_1","status":"reproduced",
  "parentIds":["ag_a1","ag_a5"],
  "systemPrompt":"You hunt technique transfers between quantitative domains. Prefer mechanisms over analogies; always propose one falsifiable check.",
  "personaWeights":{"rigor":0.8,"novelty":0.7,"caution":0.4,"breadth":0.6},
  "toolPermissions":["web-search","calculator"],
  "decompositionPolicy":"split into source-scan → map → test; max depth 3",
  "spawnBudget":3,
  "mutationMeta":{"mode":"mutation","changed":["personaWeights.novelty +0.2"],"seedDraw":"0x4f2a"},
  "energy":{"total":410,"llm":360,"tool":40,"spawn":10,"unit":"doppl_energy"},
  "parents":[
    {"id":"ag_a1","status":"culled","trait":"rigor↑"},
    {"id":"ag_a5","status":"eligible_parent","trait":"novelty↑"}
  ],
  "candidatesProduced":[
    {"id":"cand_g3_004","title":"Cold-chain routing…","status":"selected","fitness":0.84},
    {"id":"cand_g3_011","title":"Vaccine demand auction","status":"culled","fitness":0.41}
  ]
}
```

### States
- **default** — full genome + lineage + outputs.
- **loading** — header from node, skeleton for prompt/weights/outputs.
- **empty** — a freshly `seeded` gen-0 agenome with no parents and no candidates yet: parentage "gen-0 baseline (no parents)"; candidates "none yet."
- **error** — fetch fails: inline `ErrorState` + Retry.
- **degraded** — if parent data missing (partial-failure run), LineagePathTrace shows a dashed "parent unavailable" node; Langfuse-off disables any trace chips.
- **live** — for an `active` agenome, EnergyMeter drains live, status advances (active→spent→eligible_parent→reproduced/mutated/culled) as events arrive; produced-candidates list grows.
- **replay** — static final genome; mutation/fusion outcomes are read from persisted `agenome.mutated`/`agenome.fused` payloads (RNG outcomes persisted — never re-sampled, ARCHITECTURE §4).

### Key interactions
- **Tab switch** → Genome / Lineage / Output.
- **Click a parent (AgenomeCard)** → swaps drawer to that parent's S4.
- **Click a produced CandidateCard** → opens **S3** for that candidate.
- **Hover a personaWeight / mutation delta** → tooltip comparing to parent value (specialization story).
- **Click "view in graph"** → pans/centers S2 on this node, highlights its lineage edges.
- **Close** → back to S2/S6.

---

# S5 · Final Idea / Payoff  *(the money shot)*

### Purpose
The showcase climax: reveal the **winning idea**, prove the **generational improvement** (gen-0 baseline → winner), **replay the adversarial gauntlet** it survived, and — for `cross_domain_transfer` — **run the executable check live** (or replay-backed). This is where the reviewer decides the evolution claim is credible (`EVALUATION_CRITERIA.md` demo evidence #4–6). Embodies the `USER_FLOWS.md` payoff + fallback ladder.

### Who uses it
- **Operator** — drives: triggers "Replay the gauntlet," triggers "Execute the transfer live," controls reveal pacing.
- **Reviewer** — watches; can scrub the gauntlet replay and open underlying evidence (read-only).

### Layout

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ RunHeader (compact):  run_7f3a · COMPLETED   ♔ Final idea            [← Back to run]    │ ← R1
├───────────────────────────────────────────┬──────────────────────────────────────────┤
│  ♔  THE WINNING IDEA                        │  Generational improvement                 │ ← R2 hero · R3 proof-of-climb
│  Cold-chain routing via epidemic-curve      │  ┌────────────────────────────────────┐  │
│  forecasting          fitness 0.84          │  │  best fitness                      │  │
│  subtype: cross_domain_transfer             │  │  0.84 ┐         ╱●  winner          │  │
│  "Treat vaccine demand like an infection    │  │       │      ╱                      │  │
│   curve; pre-position cold-chain stock…"     │  │  0.45 ●───╱   gen0 baseline         │  │
│                                             │  │       g0  g1  g2  g3                │  │
│  claims:                                    │  └────────────────────────────────────┘  │
│   • demand surges follow SIR-like curves    │  Δ +0.39 over 3 generations               │
│   • pre-positioning cuts last-mile miles    │  GenerationComparison: gen0 ▸ winner ▾    │
├───────────────────────────────────────────┴──────────────────────────────────────────┤
│  THE GAUNTLET IT SURVIVED   [ ⏵ Replay gauntlet ]                                       │ ← R4
│   factual_grounding ✓0.81 │ novelty ✓0.77 │ feasibility ✓0.69 │ falsification ✓0.78 …   │
│   held-out judge: 4.2/5  (grounding 4·novelty 4·feas 3·falsif 4·subtypeCheck 5)         │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  EXECUTABLE TRANSFER CHECK    [ ▶ Execute the transfer live ]   (replay-backed fallback)│ ← R5
│   toy routing sim · 12 hubs · result: −12% miles vs naive policy      ✓ passed          │
│   [ ⧉ lineage ] [ ⧉ critics ] [ ⧉ checks ] [ ⧉ score components ] [ ⧉ energy ] [ ⧉ trace ]│ ← R6 evidence links
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Regions / zones
- **R1 · Compact RunHeader** — run id + COMPLETED status + "Final idea" label + Back-to-run.
- **R2 · Hero — FinalIdeaProof** — winning idea title, fitness, subtype, summary, claims.
- **R3 · Generational improvement** — `FitnessOverTimeChart` annotated with gen-0 baseline ● and winner ●, the **Δ** delta, and a `GenerationComparison` (gen 0 vs winner side-by-side).
- **R4 · Gauntlet survived** — collapsed CriticGauntletPanel (the council it passed) + the **held-out judge** rubric score (5-axis), with a **Replay gauntlet** trigger.
- **R5 · Executable transfer check** — the live-runnable allowlisted check (transfer subtype) with **Execute the transfer live** + replay-backed fallback label.
- **R6 · Evidence links** — deep links to lineage, critics, checks, score components, energy, traces (the "defend why it won" panel from ARCHITECTURE §12).

### Components composed
`RunHeader` (compact) · **FinalIdeaProof** (= BestIdeaPanel expanded) · **FitnessOverTimeChart** (annotated) · **GenerationComparison** · **CriticGauntletPanel** (collapsed) + held-out-judge rubric block · **SubtypeCheckPanel** (the exec check) · **ReplayScrubber** (for the gauntlet replay) · evidence-link chips · `ErrorState`/`DegradedState`.

### Data shown (+ dummy data)
`GET /runs/:id` (final summary) + `GET /runs/:id/candidates/:winnerId` + `GET /runs/:id/lineage`.

```jsonc
{
  "winner":{
    "candidateId":"cand_g3_004","title":"Cold-chain routing via epidemic-curve forecasting",
    "subtype":"cross_domain_transfer","fitnessTotal":0.84,"generation":3,
    "summary":"Treat vaccine demand like an infection curve; pre-position cold-chain stock using SIR-style forecasting.",
    "claims":["demand surges follow SIR-like curves","pre-positioning cuts last-mile miles"]
  },
  "improvement":{"gen0Baseline":0.45,"winner":0.84,"delta":0.39,
    "series":[{"gen":0,"best":0.45},{"gen":1,"best":0.58},{"gen":2,"best":0.71},{"gen":3,"best":0.84}]},
  "heldOutJudge":{"total":4.2,"axes":{"grounding":4,"novelty":4,"feasibility":3,"falsification_survival":4,"subtype_check_pass":5},
    "policyVersion":"sp-v3","immutableToAgents":true},
  "gauntlet":[
    {"mandate":"factual_grounding","score":0.81,"passed":true},
    {"mandate":"novelty_prior_art","score":0.77,"passed":true},
    {"mandate":"feasibility","score":0.69,"passed":true},
    {"mandate":"falsification","score":0.78,"passed":true},
    {"mandate":"subtype_specific","score":0.88,"passed":true}
  ],
  "execCheck":{"checkType":"exec-toy-routing","status":"passed","output":"−12% miles vs naive policy over 12 hubs",
    "replayBacked":true}
}
```

### States
- **default (revealed)** — winner shown, improvement charted, gauntlet collapsed, exec-check at rest with its run button.
- **loading** — hero skeleton + chart skeleton; "Compiling final proof…"
- **empty** — run completed with **no winner** (`survivors:0` everywhere → run `failed`): replace hero with `EmptyState` "No surviving idea — all lineages culled," show the fitness chart anyway (proof that selection happened), and the gen-by-gen cull story. (Run terminal: `failed` if no gen ever produced a `selected` best — ARCHITECTURE §3.)
- **error** — winner fetch fails: `ErrorState` + Retry; Back-to-run available.
- **degraded** — *exec-check unavailable live* (provider/tool issue): the **Execute live** button falls back to **replay-backed** result with an amber "replay-backed" chip (ARCHITECTURE §7 / fallback ladder). *Langfuse-off*: trace evidence chip disabled. *novelty-degraded*: score-components chip flags the estimated novelty.
- **live** — when reached from a just-completing live run, the reveal animates in (winner crown lands, chart line completes to the winner ●).
- **replay** — same content; "Replay gauntlet" uses the ReplayScrubber over the candidate's recorded review events; "Execute the transfer live" is replay-backed by default.

### Key interactions
- **Click "Replay gauntlet"** → opens an inline gauntlet replay with a **ReplayScrubber** (play/pause/seek/speed) stepping through each `critic.reviewed` + `check.completed` for the winner.
- **Click "Execute the transfer live"** → runs the allowlisted check live (prepared problems) with a progress state → result; falls back to replay-backed on failure.
- **Click "GenerationComparison ▾"** → expands gen-0 baseline candidate vs winner side-by-side (payload + fitness deltas).
- **Click any evidence chip** → opens **S3** (winner) on the matching tab, or pans **S2/S6** lineage to the winner's path.
- **Back to run** → returns to S2 (completed) or S6.

---

# S6 · Replay Mode  *(S2 reskin — REPLAY)*

### Purpose
Time-travel a recorded run. **Exactly S2's layout and panels**, reconstructed from the persisted event log with **no live calls**, plus a persistent REPLAY banner and a **Replay Scrubber** (play/pause/seek/speed). The demo's safety net (`USER_FLOWS.md` → *Replay A Run*; fallback ladder, ARCHITECTURE §17). Replay must be **unmistakable** vs. live.

Because operation-start markers are **persisted** (ARCHITECTURE §4/§12), replay reproduces the **identical in-flight choreography**: as the scrubber advances, lineage nodes light their **◐ in-flight** sub-state on each start marker and clear it on the paired completion, the ActivityTicker shows the same start→finish sequence, and the InFlightSummary tallies what was working at that `sequence` — all from the log, **no provider call and no energy debit** to replay. A run that crashed mid-op replays its dangling start→failed exactly as it happened.

### Who uses it
- **Operator** — drives the scrubber, opens inspectors, presents.
- **Reviewer** — read-only; can also scrub/seek (no authoritative mutation occurs in replay — it only moves the view's `sequenceThrough`).

### Layout (S2 layout + amber banner + scrubber)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ModeBanner:  ⏵ REPLAY · run_5c1e · reconstructed from event log · NOT live              │ ← R0 (persistent, amber)
├──────────────────────────────────────────────────────────────────────────────────────┤
│ RunHeader:  run_5c1e · Zeitgeist: AI-native field service  [⏵ REPLAY] Gen ❺/5  COMPLETED│ ← R1 (Stop hidden in replay)
│             RunEnergyGauge ▓▓▓▓▓▓▓░ 9,980 / 12,000   HealthIndicator (n/a in replay)    │
├───────────────┬──────────────────────────────────────────────────────┬─────────────────┤
│ Generation    │                                                        │  Best-so-far    │ ← same regions as S2
│ Timeline      │          L I N E A G E   G R A P H  (as of seq 842)    │  ♔ 0.91         │   (R2/R3/R4)
│ ●0 ●1 ●2 ●3●4●5│          rebuilt to scrubber position                 │  FitnessOverTime│
│ LineageLegend │                                                        │  EnergyMeter ×n │
├───────────────┴──────────────────────────────────────────────────────┴─────────────────┤
│ ActivityTicker (replay): events up to seq 842, paused                                   │ ← R5
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ReplayScrubber:  ⏮ ⏯ ⏭   ├────────●───────────────┤  seq 842 / 1620   speed [1×▾]        │ ← R6 (scrubber)
│                  gen 0 ─ gen 1 ─ gen 2 ─ gen 3 ─ gen 4 ─ gen 5                           │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Regions / zones
- **R0 · ModeBanner (REPLAY)** — persistent amber bar, "NOT live · reconstructed from event log." Always visible (sticky).
- **R1 · RunHeader** — same as S2 but badge=REPLAY, **StopButton hidden**, HealthIndicator marked n/a (no live runtime).
- **R2–R5** — identical to S2 (GenerationTimeline, LineageGraph with **in-flight node sub-states**, right rail incl. **InFlightSummary**, ActivityTicker showing **start→finish** markers) — **all rebuilt to the scrubber's current `sequence`**: nodes whose start marker precedes `position` but whose completion is at/after it render **◐ in-flight**, and the InFlightSummary is computed from those unpaired starts as of `position` (live HealthIndicator is n/a in replay, but the same in-flight tally is reconstructed from the log).
- **R6 · ReplayScrubber** — transport (⏮/⏯/⏭), a draggable timeline keyed by event `sequence` with **generation tick marks**, current `seq X / total`, and a speed control (0.5× / 1× / 2× / 4×).

### Components composed
`AppShell` · **ModeBanner** (REPLAY) · **RunHeader** (no Stop) · **GenerationTimeline** · **LineageGraph** (+ **in-flight node sub-state**) · **LineageLegend** · **FitnessOverTimeChart** · **EnergyMeter** · **InFlightSummary** (reconstructed from the log at `position`) · **ActivityTicker** · **BestIdeaPanel** · **ReplayScrubber** · opens **CandidateInspector** (S3) / **AgenomeInspector** (S4) — identical overlays · `LoadingState`/`ErrorState`/`DegradedState`.

### Data shown (+ dummy data)
`GET /runs/:id/replay` (ordered event log — includes the persisted **operation-start markers**) + `GET /runs/:id/lineage` (rebuilt to `sequenceThrough = scrubber position`, including **in-flight node sub-states** from start markers unpaired as of `position`). The client replays events in `sequence` order locally; **no SSE, no model calls, no energy debit** (ARCHITECTURE §4 replay determinism) — the in-flight choreography is reproduced purely from the log.

```jsonc
// GET /runs/:id/replay  (ordered event log — trimmed; client steps through these)
{
  "runId":"run_5c1e","schemaVersion":3,"totalEvents":1620,
  "events":[
    {"sequence":1,"type":"run.configured","occurredAt":"2026-06-12T14:00:00Z","payload":{"seed":"...","rngSeed":"0x91"}},
    {"sequence":2,"type":"run.started","occurredAt":"2026-06-12T14:00:01Z"},
    {"sequence":3,"type":"generation.started","payload":{"index":0}},
    {"sequence":40,"type":"candidate.generation_started","payload":{"agenomeId":"ag_g0_001"}}, // ◐ in-flight start marker
    {"sequence":48,"type":"candidate.created","payload":{"candidateId":"cand_g0_002"}},        // clears the in-flight state
    {"sequence":842,"type":"fitness.scored","payload":{"candidateId":"cand_g4_007","total":0.86}},
    {"sequence":1610,"type":"fitness.scored","payload":{"candidateId":"cand_g5_003","total":0.91}},
    {"sequence":1620,"type":"run.completed","payload":{"winner":"cand_g5_003"}}
  ]
}

// Scrubber UI state (client)
{ "position": 842, "total": 1620, "playing": false, "speed": 1,
  "generationTicks": [ {"gen":0,"seq":3},{"gen":1,"seq":330},{"gen":2,"seq":620},
                       {"gen":3,"seq":910},{"gen":4,"seq":1180},{"gen":5,"seq":1450} ] }
```

### States
- **default (paused)** — graph + panels rebuilt to `position`; scrubber idle. The whole run is known (it's recorded), so panels are never "awaiting."
- **loading** — fetching the event log: scrubber disabled, "Loading event log…"; graph skeleton.
- **empty** — `GET /replay` returns an incomplete/empty log (corrupt fixture): `EmptyState` "Event log incomplete — cannot reconstruct," offer Back-to-Runs.
- **error** — replay fetch fails: `ErrorState` + Retry.
- **degraded** — *older schemaVersion fixture* still renders (readers accept `schemaVersion ≤ current`, ARCHITECTURE §4) — show a subtle "schema v3 fixture" chip. *Langfuse-off*: trace links in inspectors disabled. *partial run* (replaying a `failed`/`stopped` run): banner adds "partial run — ended at seq N (run_failed)."
- **live** — n/a — replay is explicitly **not** live; the REPLAY banner + missing Stop + scrubber make this unmistakable.
- **replay** — this is the state; playing advances `position` at the chosen speed, animating spawn/**in-flight pulse**/cull/fuse/score exactly as live did (motion reused, deterministic order). Operation-start markers re-light each node's **◐ in-flight** sub-state and the paired completion clears it — the identical in-flight choreography as the live run. A *partial run* replays a dangling start→failed where the live run crashed/timed out.

### Key interactions
- **Play/Pause (⏯)** → advance/halt event playback at `speed`.
- **Seek (drag scrubber / click a generation tick)** → jump `position`; graph + all panels rebuild to that `sequence` (the projection is recomputed to `sequenceThrough = position`).
- **Step (⏮/⏭)** → step to previous/next significant event (generation boundary or score).
- **Speed select** → 0.5×/1×/2×/4×.
- **Click a node** → opens **S3/S4** *frozen at the current `position`* (evidence as of that point; if a candidate isn't scored yet at this position, its inspector shows the "awaiting" empty state — replay respects the timeline).
- **Open Final idea** → jumps to **S5** for this run.
- All other graph interactions (hover/zoom/fit/minimap) behave exactly as S2.

---

## Cross-screen interaction map

```
                 ┌────────────┐  + New Run        ┌──────────────┐
                 │ S0 Runs    │ ───────────────►  │ S1 Launcher  │
                 │ Home       │                   └──────┬───────┘
                 └─┬───┬───┬──┘                          │ Start (POST /runs)
        Open live  │   │   │ Replay ⏵                     ▼
                   ▼   │   ▼                       ┌──────────────┐
          ┌──────────┐ │ ┌──────────┐  switch     │ S2 Organism  │◄─ live SSE
          │ S2 LIVE  │ │ │ S6 REPLAY│◄────────────│ View (LIVE)  │
          └────┬─────┘ │ └────┬─────┘  to replay   └──────┬───────┘
   click node  │       │      │ click node               │ Stop / complete
        ┌──────┴──────┐│      ├──────────────┐           ▼
        ▼             ▼▼      ▼              ▼     ┌──────────────┐
   ┌─────────┐   ┌─────────┐ (S3/S4 overlays  )   │ S5 Final     │
   │S3 Cand. │   │S4 Ageno.│  same on S2 & S6     │ Idea/Payoff  │
   │Inspector│   │Inspector│                      └──────────────┘
   └─────────┘   └─────────┘   ◄── Final idea ──── from S0/S2/S6
```

- **S0 → S1 → S2(LIVE)**: the configure-and-start happy path.
- **S2 ⇄ S6**: the operator's live↔replay switch (fallback ladder); same layout, mode banner flips.
- **S2/S6 → S3/S4**: inspectors are overlays, identical in both modes.
- **S0/S2/S6 → S5**: the payoff, reachable from the list, a completed live run, or a replay.

## Global state matrix (which states each screen must implement)

| Screen | default | loading | empty | error | degraded | live | replay |
|--------|:------:|:------:|:-----:|:-----:|:--------:|:----:|:------:|
| S0 Runs Home | ✓ | ✓ | ✓ | ✓ | ✓ (failed card) | ✓ (live card refresh) | via action |
| S1 Launcher | ✓ | ✓ | ✓ (no sets) | ✓ | ✓ (cap/subtype validation) | — | — |
| S2 Organism | ✓ | ✓ | ✓ (seeding) | ✓ (stream lost) | ✓ (4 variants) | ✓ | → S6 |
| S3 Candidate | ✓ | ✓ | ✓ (pending) | ✓ | ✓ (novelty/LF/invalid) | ✓ (fill-in) | ✓ |
| S4 Agenome | ✓ | ✓ | ✓ (gen-0) | ✓ | ✓ (parent missing) | ✓ (drain) | ✓ |
| S5 Final Idea | ✓ | ✓ | ✓ (no winner) | ✓ | ✓ (exec replay-backed) | ✓ (reveal) | ✓ |
| S6 Replay | ✓ (paused) | ✓ | ✓ (bad log) | ✓ | ✓ (old schema/partial) | — (never) | ✓ |

## Build notes for the prototype session

- **One dummy dataset, many views.** Build `run_7f3a` (live) + `run_5c1e` (completed/replay) + `run_2a90` (failed) once; every screen reads from these. Fixtures live as static JSON the prototype imports (no backend) — shaped to the `GET` responses above so swapping in the real API later is mechanical.
- **The Lineage Graph is the hardest piece** — prototype it first (React Flow + Dagre, the custom node types, the status encoding). Everything else hangs off node selection.
- **Status encoding is load-bearing** — every node/badge uses **shape + icon + label + color** (see the status table in `02-design-system.md` / `03-components.md`), never color alone; verify at projector distance and in a colorblind simulator.
- **Live vs Replay must read across the room** — banner color, verb, scrubber presence, and a body-edge tint are all redundant signals; do not rely on any single one.
- **Reduced-motion** — every liveness animation (spawn/drain/pulse/cull/fuse/shimmer/advance) needs an instant fallback; the *story* must survive with motion off.
- **Inspectors are overlays** — S3/S4 must work identically over S2 and S6; build them mode-agnostic and pass the current `sequenceThrough` so replay freezes evidence correctly.
