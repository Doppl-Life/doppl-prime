# 09 · Demo Storyboard — the 10-minute showcase

**Purpose:** The Jun-29-2026 showcase rendered as a frame-by-frame UX storyboard — the narrative spine every Doppl screen, component, and motion choice serves. Use it to verify that the design-system kit and clickable prototype can *perform this story on a projector in ten minutes*, live or replayed, without anyone in the room mistaking which is which.

**Related:** `01-product-and-personas.md` · `02-design-language.md` · `03-information-architecture.md` · `04-screens-overview.md` · `05-lineage-graph.md` · `06-components-library.md` · `07-status-and-motion.md` · `08-data-and-states.md` · `10-accessibility-and-projector.md` · `11-dummy-data-fixtures.md` — ground truth: `../../ARCHITECTURE.md` (§3 domain, §5 kernel, §10 lineage, §11 API/flows, §12 dashboard, §17 demo strategy, Appendix A) · `../planning/USER_FLOWS.md` · `../planning/USERS.md` · `../planning/EVALUATION_CRITERIA.md`.

---

## 0. How to read this doc

This is the **canonical run-of-show**. Each beat below is a *frame*: a fixed point the room should remember. Every frame is specified with the same six fields so the prototype can be built directly from it:

| Field | Means |
|---|---|
| **On screen** | The literal visual — regions, panels, what is moving |
| **Screen / components** | Canonical `S#` screen + the exact components in play (see `04-screens-overview.md`, `06-components-library.md`) |
| **Operator action** | What the Operator (primary persona) physically does |
| **Audience takeaway** | The single sentence the Reviewer / showcase audience should leave the frame believing |
| **Motion** | The choreography that makes liveness legible (see `07-status-and-motion.md`) |
| **Fallback note** | Where this frame sits on the fallback ladder (§ Stage safety) |

**The one contrast to hammer, every frame:** Doppl is **GENERATIONAL, not a one-round tournament**. Round N+1 is *genuinely smarter* than round N — and we can prove it. If a frame doesn't advance "it got smarter across generations," it is decoration and should be cut from the demo path.

**Architecture sentence the story dramatizes** (ARCHITECTURE.md §0): *"It's not the agent — it's the kernel that breeds the agents; the event log is the truth, and the held-out judge is the floor the organism cannot lift."*

**Two personas in the room** (`01-product-and-personas.md`, USERS.md):
- **Operator** — drives. Seeds, starts, scrubs, drills, stops. The only actor who can mutate run state (via `POST /runs`, `POST /runs/:id/stop`). Power user; wants control + deep evidence on demand.
- **Reviewer / showcase audience** — read-only. Judges credibility from the projector. Needs the story legible at distance and evidence on demand. Cannot mutate anything.

---

## 1. The 10-minute budget (run-of-show clock)

The showcase fits inside a **10-minute window** with replay fallback if live runs long (EVALUATION_CRITERIA.md). The narrative has **four acts** mapping to the four required demo beats. Times are the *target spine*; the Operator paces against the **HealthIndicator** (last-event age, candidates-in-flight, caps-consumed) to decide continue-vs-switch.

```
 0:00 ┌─────────────────────────────────────────────────────────────────────┐
      │  ACT I · SEED              S0 → S1 → S2                  ~1:30        │
 1:30 ├─────────────────────────────────────────────────────────────────────┤
      │  ACT II · WATCH IT LIVE    S2 (bloom · energy · critics · cull · fuse)│
      │                                                          ~3:30        │
 5:00 ├─────────────────────────────────────────────────────────────────────┤
      │  ACT III · GENERATIONS     S2 (fitness climbs · lineages specialize)  │
      │            CLIMB                                          ~2:30        │
 7:30 ├─────────────────────────────────────────────────────────────────────┤
      │  ACT IV · PAYOFF           S5 (winner · replay gauntlet · live check) │
      │                                                          ~2:30        │
10:00 └─────────────────────────────────────────────────────────────────────┘
```

> **Budget rule:** Acts I–III run on a **low-cap live run** (small population, few generations) so they finish *inside the clock*. Act IV's "execute the transfer live" is the one moment we deliberately spend latency on; if the live run never reached a winner, Act IV runs from a **labeled replay** (§ Stage safety). The full demo path is rehearsed end-to-end (ARCHITECTURE.md §16 rehearsals, §17 fallback ladder).

---

## 2. The cast — what each thing represents on screen

So the prototype renders the right glyphs, here is the canonical status encoding the storyboard relies on (full spec: `07-status-and-motion.md`). **Status is shape + icon + label + color — never color alone** (colorblind-safe, projector-legible; ARCHITECTURE.md §12 accessibility).

| Thing | States the audience will watch happen | Glyph / encoding |
|---|---|---|
| **Agenome** (a genome that breeds ideas) | seeded → active → spent → eligible_parent → reproduced / mutated / failed / culled | `◌` dim · `◐` pulsing cyan · `○` muted · `★` blue · `⚇` violet (two-parent) · `∿` amber · `△!` red dashed · `✕` gray sunk |
| **Candidate idea** (the unit of work) | created → under_review → checked → scored → selected / rejected / culled / invalid | `◐` pulsing · `♔` gold (selected) · `✕` · faded · `△` red |
| **Check** (objective/subtype) | passed / failed / skipped | `✓` green · `✕` red · `–` gray + reason |
| **Energy** | a charge that **drains** as agenomes spend | light/charge meter, JetBrains Mono numbers |
| **Fitness / novelty** | meters, not just hue | filled bars |

Aesthetic (`02-design-language.md`): **dark "evolutionary observatory / bioluminescent lab."** Calm chrome, vivid organism. Glowing living nodes; energy as light; the LineageGraph as a growing organism. The chrome stays quiet so the *organism* is the only thing the eye tracks.

---

## ACT I · SEED

> *"A human asks one question. Watch what happens to it."*

### Frame 1 — Runs Home: the menu of life

| | |
|---|---|
| **On screen** | A dark **S0 · Runs Home**. A list of runs: live ones with a pulsing LIVE badge + generation reached + best-idea preview; completed ones with a final-idea title and "Replay" affordance. A bright **"New Run"** CTA top-right. |
| **Screen / components** | **S0 · Runs Home** → `AppShell`, run-list rows (each a compact `RunHeader` echo: title + `StatusBadge` + `GenerationCounter` + best-idea preview), **"New Run"** CTA, per-row **Enter Replay** action. |
| **Operator action** | Lands here, says one line — *"This is Doppl. Every row is a population we bred."* Clicks **New Run**. |
| **Audience takeaway** | "This product is a *runtime you watch* — runs are living things with histories, not chat sessions." |
| **Motion** | Live-run rows have a slow cyan breathing pulse on their LIVE badge; everything else is still. The eye is drawn to the one living thing. |
| **Fallback note** | Ladder-agnostic. If demoing pure replay, the Operator instead clicks a completed row's **Enter Replay** and skips to Frame 4-bis. |

```
 S0 · RUNS HOME
 ┌───────────────────────────────────────────────────────────────────────┐
 │  DOPPL                                              [ + New Run ]       │
 ├───────────────────────────────────────────────────────────────────────┤
 │  ● LIVE   Catalyst Sprint        gen 3/5   best: "Annealing for rosters"│
 │  ○ done   Cold-Chain Logistics   gen 5/5   best: "Stigmergy reorder"  ▷ │
 │  ○ done   Demo — Prepared #1     gen 4/4   best: "Phyllotaxis panels" ▷ │
 │  △ failed Live attempt 14:02     gen 1/5   (provider timeout)           │
 └───────────────────────────────────────────────────────────────────────┘
        ▷ = Enter Replay        ● = pulsing LIVE badge
```

### Frame 2 — Run Launcher: set the bounds, plant the seed

| | |
|---|---|
| **On screen** | **S1 · Run Launcher** opens (full page for the demo; modal variant exists). A **PromptSourcePicker** toggles *Prepared problem set* vs *Live prompt*. **SubtypeToggle** shows both `cross_domain_transfer` and `zeitgeist_synthesis` **on by default**. A **CapsControl** grid with hard-max ceilings. **ModelProfileSelect** + scoring-policy version. A big **Start** button. |
| **Screen / components** | **S1 · Run Launcher** → `RunLauncherForm` = `PromptSourcePicker` + `SubtypeToggle` + `CapsControl` (hard-max enforced) + `ModelProfileSelect`; scoring-policy version field; **Start** primary CTA. |
| **Operator action** | Picks a source. **Two scripted options** (USER_FLOWS "Configure & start"; EVALUATION_CRITERIA demo evidence #1): (a) *take a seed from the room* — types it into the Live prompt field; or (b) *prepared problem set* for a guaranteed-good run. Leaves both subtypes on. Sets **low caps** (small population, few generations) so Acts I–III fit the clock. Clicks **Start**. |
| **Audience takeaway** | "It's bounded by construction — they can't make it run away, and the *room's* question is the seed." |
| **Motion** | When the Operator drags a CapsControl slider past its hard-max, it **snaps back** with a brief red shake + inline "hard max: N" — visibly *un-bypassable* (ARCHITECTURE.md §5, §17: override only *lowers* within validated maxima). Start button fills with a charge sweep on press. |
| **Fallback note** | **Rung 1 (live low-cap):** Live prompt + low caps. **Rung 2 (prepared):** if rehearsal flagged provider risk, pick Prepared problem set here — same screen, no story change. |

```
 S1 · RUN LAUNCHER
 ┌─────────────────────────────── New Run ───────────────────────────────┐
 │ PROMPT SOURCE   ( ● Live prompt ) ( ○ Prepared set )                    │
 │ ┌───────────────────────────────────────────────────────────────────┐ │
 │ │ "How might a mid-size hospital cut ER wait times this winter?"     │ │  ← seed from the room
 │ └───────────────────────────────────────────────────────────────────┘ │
 │ IDEA SUBTYPES   [✓] cross_domain_transfer   [✓] zeitgeist_synthesis    │  ← both on by default
 │ SAFE CAPS                                                               │
 │   population   [■■■■□□□□] 12   (hard max 20)                            │
 │   generations  [■■■■■□□□]  5   (hard max  8)                            │
 │   energy       [■■■□□□□□] 6000 doppl_energy  (hard max 12000)          │
 │   depth 3  ·  tool-calls 40  ·  wall-clock 8:00                         │
 │ MODEL PROFILE  [ demo-balanced ▾ ]      SCORING POLICY  [ v3 ▾ ]        │
 │                                                   [   ▷ START RUN   ]   │
 └────────────────────────────────────────────────────────────────────────┘
```

> **Dummy seed prompts (rehearsed set; `11-dummy-data-fixtures.md`):**
> - *Live-ish:* "How might a mid-size hospital cut ER wait times this winter?"
> - *Prepared transfer:* "Apply a technique from materials science to employee scheduling." (sets up the executable check payoff)
> - *Prepared zeitgeist:* "What's an under-priced thesis about small-business AI adoption right now?"

### Frame 3 — The cut to the observatory

| | |
|---|---|
| **On screen** | The Launcher dissolves into **S2 · Organism View**. The **RunHeader** snaps in: run title, a **LIVE** badge (`ModeBanner`), **GenerationCounter** at *gen 0*, a full **RunEnergyGauge**, a green **HealthIndicator**, a **Stop** button. The center stage — the **LineageGraph** canvas — is still nearly empty: just a single **GenerationNode** tier for gen 0. |
| **Screen / components** | **S2 · Organism View** → `RunHeader` (title + `ModeBanner`=LIVE + `GenerationCounter` + `RunEnergyGauge` + `HealthIndicator` + `StopButton`) · `LineageGraph` (React Flow, Dagre top-down tiers) · `LineageLegend` · `GenerationTimeline` · `FitnessOverTimeChart` (empty) · `EnergyMeter`s (none yet) · `ActivityTicker` (first events) · `BestIdeaPanel` (empty state). |
| **Operator action** | Nothing — just lets it breathe for one beat. Points at the **LIVE** badge: *"This is happening right now."* |
| **Audience takeaway** | "We're about to watch a live system, not a slideshow." |
| **Motion** | RunHeader components stagger-in. The **RunEnergyGauge** sits full and faintly glowing — the charge that's about to be spent. ActivityTicker prints `run.started` then `generation.started`. |
| **Fallback note** | If on **Rung 3 (labeled replay)**, the badge reads **REPLAY** in the unmistakable replay treatment (orange persistent `ModeBanner`) and a `ReplayScrubber` is docked — see Frame 4-bis. |

---

## ACT II · WATCH IT LIVE

> *"The population blooms, spends its energy, faces critics, and the weak go dark. Then strong PAIRS fuse."*

This act is **the heart** (S2). It is SSE-driven: a sequence-keyed reducer applies live events, and Framer Motion choreographs each kind so the audience *reads* the biology. The Operator narrates; the screen does the work.

### Frame 4 — The bloom

| | |
|---|---|
| **On screen** | Gen-0 **AgenomeNode**s grow into the canvas — a bounded population (~12) blooming around the gen-0 GenerationNode tier. Each starts `seeded` (`◌` dim), then flips `active` (`◐` pulsing cyan). Tiny **EnergyMeter**s ride each node, full and bright. The **ActivityTicker** scrolls `agenome.spawned … candidate.created …`. The **RunEnergyGauge** in the header begins to tick down. |
| **Screen / components** | **S2** → `LineageGraph` (`GenerationNode`, `AgenomeNode`, `CandidateNode` types) · `EnergyMeter` (per-agenome) · `RunEnergyGauge` · `ActivityTicker` · `GenerationTimeline` (gen 0 active). |
| **Operator action** | *"Twelve agent genomes just woke up. Each one is going to propose an idea — and each idea costs energy."* |
| **Audience takeaway** | "A *whole population* is working in parallel — and it's metered. Nothing is free." |
| **Motion** (`07-status-and-motion.md`) | **Spawn = grow-in** (scale 0→1 with a soft bloom). **Active = pulse** (cyan breathing). **Energy drain** = each EnergyMeter's charge visibly recedes as `energy.spent` events arrive; the header `RunEnergyGauge` mirrors it. CandidateNodes sprout from their AgenomeNode on `candidate.created`. |
| **Fallback note** | Same on all rungs; on replay it's reconstructed from the event log at scrubber speed. |

```
 S2 · ORGANISM VIEW — the bloom (gen 0)
 ┌── RunHeader ───────────────────────────────────────────────────────────┐
 │ Hospital ER · ● LIVE · gen 0 · energy ▮▮▮▮▮▮▮▯ 5180/6000 · ♥ healthy · ⏹│
 ├──────────────────────────┬─────────────────────────────────────────────┤
 │  FITNESS OVER TIME        │            LINEAGE GRAPH                     │
 │  (empty — gen 0)          │   [GEN 0]                                    │
 │   5│                      │     ◐A1▮▮▮  ◐A2▮▮▯  ◐A3▮▮▮  ◐A4▮▯▯           │
 │   0└─────────             │      └c    └c       └c,c    └c               │
 ├──────────────────────────┤     ◐A5▮▮▯  ◐A6▮▮▮  ◌A7    ◐A8▮▮▯  …(12)     │
 │  ACTIVITY TICKER          │                                             │
 │  14:21:02 agenome.spawned │   ◐ = active(pulse)  ◌ = seeded  ▮ = energy  │
 │  14:21:03 candidate.creat │   c = candidate sprouting                    │
 │  14:21:03 energy.spent 40 │                                             │
 ├──────────────────────────┴─────────────────────────────────────────────┤
 │  BEST SO FAR: — (no scored candidate yet)                               │
 └──────────────────────────────────────────────────────────────────────────┘
```

### Frame 5 — The gauntlet: critics close in

| | |
|---|---|
| **On screen** | **CriticNode**s and **CheckNode**s appear hanging off CandidateNodes via `reviewed` / `checked` edges. CandidateNodes flip to `under_review` (`◐` pulsing). The Operator clicks one candidate → the **CandidateInspector** drawer slides over S2, revealing the **CriticGauntletPanel**: one **ReviewRow** per mandate (factual_grounding / novelty_prior_art / feasibility / falsification / subtype_specific) with score + confidence + critique + evidence, plus a **SubtypeCheckPanel** of CheckRows. |
| **Screen / components** | **S2 + S3 · Candidate Inspector** (drawer over S2) → `CandidateCard` → `CandidateInspector` = subtype payload + `CriticGauntletPanel` (`ReviewRow` ×5 mandates) + `SubtypeCheckPanel` (`CheckRow`) + `NoveltyMeter` + `FitnessBreakdown` + `EnergyMeter` + `LineagePathTrace` + trace links. `CriticNode` / `CheckNode` / `ScoreNode` on the graph. |
| **Operator action** | Drills into one candidate: *"Every idea is interrogated by an adversarial critic council — grounding, novelty, feasibility, falsification — plus an objective check. This is the evidence a skeptic can audit."* |
| **Audience takeaway** | "Ideas don't win on vibes — there's *structured, inspectable evidence* behind every survival." |
| **Motion** | **Critic pulse** — CriticNodes pulse as they "review"; the edge to the candidate flashes on `critic.reviewed`. The drawer slides in from the right over a dimmed-but-still-live S2 (the organism keeps moving behind it). |
| **Fallback note** | Identical live vs replay — the Inspector reads persisted evidence either way (ARCHITECTURE.md §4: candidate evidence is event-stored). Strong frame to use even on Rung 3. |

```
 S3 · CANDIDATE INSPECTOR  (drawer over S2)
 ┌──────────────────────────────────────────── candidate C-A3-1 ──────────┐
 │ ◐ under_review · cross_domain_transfer · "Annealing for ER triage"      │
 │ PAYLOAD  source: metallurgy/simulated annealing → target: triage queue │
 │          mapping: temperature ≈ acceptable wait-variance …             │
 │ ── CRITIC GAUNTLET ──────────────────────────────────────────────────  │
 │  factual_grounding   ▮▮▮▮▯ 3.8  conf .82  "queueing claim is sound…"    │
 │  novelty_prior_art   ▮▮▮▮▮ 4.5  conf .77  "no close prior art found…"   │
 │  feasibility         ▮▮▮▯▯ 3.1  conf .69  "needs staffing data…"        │
 │  falsification       ▮▮▮▮▯ 3.6  conf .74  "survives the null test…"     │
 │  subtype_specific    ▮▮▮▮▯ 3.9  conf .80  "mapping is coherent…"        │
 │ ── SUBTYPE CHECKS ───────────────────────────────────────────────────  │
 │  ✓ mapping_coherence  passed   · – executable_toy  skipped (no adapter) │
 │ NOVELTY ▮▮▮▮▯ 0.71   FITNESS (pending scoring)   ENERGY ▮▮▯ 240 spent   │
 │ LINEAGE  gen0·A3 ▸ this        [ open trace ↗ ]                         │
 └──────────────────────────────────────────────────────────────────────────┘
```

### Frame 6 — The weak go dark

| | |
|---|---|
| **On screen** | The Operator closes the drawer. Scores resolve: **ScoreNode**s attach via `scored` edges, **FitnessBreakdown** bars fill. Then the **cull** lands: low-fitness AgenomeNodes + their candidates fade and **sink** (`culled` → `✕` gray, faded/sunk) with `culled` edges marking them. The population visibly *thins*. The **ActivityTicker** prints `fitness.scored … lineage.culled`. |
| **Screen / components** | **S2** → `ScoreNode`, `FitnessBreakdown`, `lineage.culled` edges, `StatusBadge` transitions on `AgenomeNode`/`CandidateNode`, `ActivityTicker`. |
| **Operator action** | *"Selection is brutal. The weak lineages are culled — and you can see exactly why from their fitness breakdown."* (Optionally re-opens Inspector on a culled one to show low components.) |
| **Audience takeaway** | "There is real *selection pressure*. Death is visible and explained — not hidden." |
| **Motion** | **Cull = fade + sink** — culled nodes desaturate, drop in z-order, and settle dimmer at the bottom of their tier (still present for audit, clearly dead). This is the emotional low before the fusion lift. |
| **Fallback note** | All rungs identical. On replay, scrub speed can be slowed here for drama. |

### Frame 7 — Pairs FUSE (the money mechanic of Act II)

| | |
|---|---|
| **On screen** | Survivors flip to `eligible_parent` (`★` blue). Then the signature moment: **two parent AgenomeNodes** in gen 0, then **two `fused` edges converge** onto a single new child **AgenomeNode** in the gen-1 tier (the two-parent `⚇` violet glyph). Immediately after, some children shimmer `mutated` (`∿` amber). The **GenerationCounter** ticks to **gen 1**; the **GenerationTimeline** advances a step. |
| **Screen / components** | **S2** → `LineageGraph` `fused` + `mutated` edges; `AgenomeNode` status `eligible_parent`→`reproduced`; new gen-1 `GenerationNode` tier; `GenerationCounter`; `GenerationTimeline`. Optionally **S4 · Agenome Inspector** to show parentage. |
| **Operator action** | *"This is the part that isn't a tournament. The two strongest, **most distant** lineages **fuse** — crossover plus a synthesis of their reasoning — and the child mutates. Generation one is literally bred from generation zero."* Clicks the child → **S4 · Agenome Inspector**. |
| **Audience takeaway** | "**This is breeding, not ranking.** The next generation is *built from* the winners — that's the whole thesis." |
| **Motion** | **Fusion = two-edges-converge** — two glowing edges animate from both parents and merge into the child as it grows-in (the single most important animation in the demo). **Mutation = shimmer** — an amber ripple over the mutated child. **Generation advance** — the timeline step lights and the camera fits the new tier. |
| **Fallback note** | All rungs identical. This frame is *the* reason replay must be event-faithful — fusion edges come straight from `agenome.fused` payloads (ARCHITECTURE.md §4, §8). |

```
 S4 · AGENOME INSPECTOR  (drawer over S2)
 ┌──────────────────────────────────────────── agenome G1-04 (⚇ child) ───┐
 │ reproduced · gen 1 · mode: fusion (+mutation)                          │
 │ PARENTAGE   ⚇ parents: gen0·A3  ✕  gen0·A9   (distant lineages)        │
 │ SYSTEM PROMPT  "You are a transfer specialist who maps physical-…"     │
 │ PERSONA WEIGHTS  rigor .7 · daring .8 · concision .4                   │
 │ TOOL PERMISSIONS  [web_search] [calc]      DECOMP POLICY  depth-2      │
 │ MUTATION  ∿ persona.daring +0.2 ; added tool calc   (RNG-seeded)      │
 │ SPAWN BUDGET 3 (hint)   ENERGY SPENT 0 (new)   CANDIDATES 0 (pending)  │
 └──────────────────────────────────────────────────────────────────────────┘
```

---

## ACT III · GENERATIONS CLIMB

> *"Round two is smarter than round one — and here is the chart that proves it."*

### Frame 8 — The fitness chart rises

| | |
|---|---|
| **On screen** | Acts II's bloom→cull→fuse loop repeats for gen 1 → gen 2 → … but now the **FitnessOverTimeChart** is the focal point: a line (best + median per generation) **stepping upward** generation over generation. The **GenerationCounter** climbs. The **BestIdeaPanel** updates its best-so-far title as a new generation tops the prior. |
| **Screen / components** | **S2** → `FitnessOverTimeChart` (Recharts; best + median series, gen-0 baseline marked) · `GenerationCounter` · `GenerationTimeline` · `BestIdeaPanel`. |
| **Operator action** | *"Watch the floor rise. This is the acceptance proof — a later generation produces stronger surviving ideas than an earlier one, scored by a **held-out judge** the agents can't touch."* (EVALUATION_CRITERIA acceptance proof; ARCHITECTURE.md §7 held-out judge.) |
| **Audience takeaway** | "The improvement is **measured and monotonic-ish**, not asserted. Gen N+1 > gen N." |
| **Motion** | The chart line **draws in** as each generation completes; the newest point gets a brief glow. The gen-0 baseline stays pinned as a reference rule so the *climb* is unmistakable. |
| **Fallback note** | All rungs. On Rung 3 the chart is the most projector-legible single asset — lead with it if time is short. |

```
 FITNESS OVER TIME  (S2 panel — the acceptance proof)
   5 ┤                                   ● best 4.4 (gen 3)
     │                         ●─────────
   4 ┤               ●─────────   median climbing
     │       ●───────
   3 ┤───────  ← gen-0 baseline (held-out judge, fixed rubric)
     │   ○ median
   2 ┤
     └──┬───────┬───────┬───────┬────────
       gen0    gen1    gen2    gen3
```

### Frame 9 — Lineages specialize

| | |
|---|---|
| **On screen** | The LineageGraph, now several tiers deep, shows **visibly different branches** — some lineages skew `cross_domain_transfer`, some `zeitgeist_synthesis`; persona weights and tool-permission patterns differ down a branch. A **GenerationComparison** view (gen 0 vs gen N) sits beside the chart. Hovering/selecting a branch traces its **LineagePathTrace**. |
| **Screen / components** | **S2** → `LineageGraph` (deep tiers, `WinnerNode` not yet) · `GenerationComparison` (Recharts) · `LineagePathTrace` · `LineageLegend` · optional `S4 · Agenome Inspector` to contrast two cousins' traits. |
| **Operator action** | Hovers two sibling branches: *"They didn't converge to one answer — lineages **specialized**. This branch became transfer-experts; this one chases the zeitgeist. That's the novelty pressure working against mode collapse."* (ARCHITECTURE.md §8 novelty/anti-collapse; EVALUATION_CRITERIA lineage specialization is MVP scope.) |
| **Audience takeaway** | "It's not one lucky idea — it's an **ecosystem diversifying**, with the differences inspectable." |
| **Motion** | On branch hover, the path **highlights** root-to-leaf and dims the rest; GenerationComparison bars animate between gen-0 and gen-N. Reduced-motion: highlight is a static outline + dim, no animation. |
| **Fallback note** | All rungs. |

---

## ACT IV · PAYOFF

> *"Here is the winner. Here is the gauntlet it survived. And — for transfer — watch it actually run."*

### Frame 10 — The reveal

| | |
|---|---|
| **On screen** | Transition to **S5 · Final Idea / Payoff** — the money shot. Center: the **winning CandidateIdea** (`♔` gold `WinnerNode` highlighted back on the graph), its title, summary, claims, subtype payload. A **FinalIdeaProof** panel laces together: the lineage path from gen-0 to winner, the critic gauntlet it passed, the subtype-check evidence, the FitnessBreakdown, energy spent, and the **generational-improvement summary** (gen-0 baseline → winner). |
| **Screen / components** | **S5 · Final Idea / Payoff** → `FinalIdeaProof` / `BestIdeaPanel` (winner) · `WinnerNode` on `LineageGraph` · `FitnessBreakdown` · `LineagePathTrace` · links into `CriticGauntletPanel` + `SubtypeCheckPanel` · `GenerationComparison` (gen0→winner). |
| **Operator action** | *"This idea won. Not because it was first — because it out-survived everything across three generations. Let me prove it."* |
| **Audience takeaway** | "There *is* a winner, and its pedigree is fully traceable." |
| **Motion** | The winner node pulls forward with a gold glow; the `LineagePathTrace` from gen-0 lights up edge-by-edge like a current flowing from ancestor to champion. |
| **Fallback note** | If the live run didn't finish, this is where **Rung 3** takes over seamlessly — S5 from a labeled replay looks identical (S6 banner + scrubber). |

```
 S5 · FINAL IDEA / PAYOFF
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  ♔ WINNER · gen 3 · cross_domain_transfer                                  │
 │  "Simulated-annealing triage: cool the queue, don't freeze it"            │
 │  claims: 1) wait-variance ↓ 22% in toy model  2) staffing-neutral …      │
 │ ── PEDIGREE ────────────────────────────────────────────────────────────  │
 │  gen0·A3 ──┐                                                              │
 │            ⚇ fuse → gen1·G4 ─∿mut→ gen2·H2 ──────▶ ♔ gen3·W1            │
 │  gen0·A9 ──┘                                                              │
 │ ── PROOF ───────────────────────────────────────────────────────────────  │
 │  GAUNTLET  grounding 4.2 · novelty 4.5 · feasibility 3.9 · falsif 4.0     │
 │  CHECK     ✓ executable_toy  passed   [ ▶ RUN IT LIVE ]                   │
 │  FITNESS   total 4.41 (policy v3)   ENERGY 980 doppl_energy               │
 │  IMPROVEMENT  gen-0 best 3.0  →  winner 4.41   (+47%, held-out judge)     │
 └──────────────────────────────────────────────────────────────────────────┘
```

### Frame 11 — Replay the gauntlet

| | |
|---|---|
| **On screen** | The Operator re-opens the winner's **CandidateInspector** / **CriticGauntletPanel** and steps through the adversarial reviews it survived — each ReviewRow with its critique + confidence + evidence refs + trace links. Optionally enters **S6 · Replay Mode** to *re-run the moment of judgment* with the **ReplayScrubber**. |
| **Screen / components** | **S5 → S3** (gauntlet replay) and/or **S6 · Replay Mode** → `ReplayScrubber` (play/pause/seek/speed) · persistent **REPLAY** `ModeBanner` · `CriticGauntletPanel` · `SubtypeCheckPanel` · trace links (Langfuse, if enabled). |
| **Operator action** | *"A skeptic asks: why this idea? Here's every critic that tried to kill it and failed — replayed from the event log, no new model calls, fully auditable."* |
| **Audience takeaway** | "I can **defend why the winner won** — the evidence is replayable and tamper-evident." |
| **Motion** | If in S6, the scrubber timeline shows event density; scrubbing animates the gauntlet forming around the candidate. The REPLAY banner is **persistent and unmistakable** (orange, top-edge) so no one confuses it for live. |
| **Fallback note** | This frame is **inherently replay** even in a live demo — it reconstructs from persisted events (ARCHITECTURE.md §4 replay determinism). Always available. |

### Frame 12 — Execute the transfer LIVE (the wow)

| | |
|---|---|
| **On screen** | For a `cross_domain_transfer` winner with an allowlisted check, the Operator clicks **▶ RUN IT LIVE** on the FinalIdeaProof. The **SubtypeCheckPanel** runs the winning idea's allowlisted executable check *right now*; a **CheckRow** transitions `– skipped`/idle → running → **`✓ passed`** (green) with concrete `output`. |
| **Screen / components** | **S5** → `SubtypeCheckPanel` (`CheckRow` live execution) · `FinalIdeaProof` · result `output` rendered (numbers/JetBrains Mono). |
| **Operator action** | *"And this is a transfer idea — so we don't just claim it works. Watch it run."* Clicks **Run it live**; waits ~a few seconds; the check goes green. (EVALUATION_CRITERIA demo evidence #6; ARCHITECTURE.md §7 "execute the transfer live", §17 demo path.) |
| **Audience takeaway** | "The system's best idea **objectively checks out, live, in front of me.**" |
| **Motion** | The CheckRow shows a determinate progress sweep, then a satisfying green `✓` snap + the `output` counting in. This is the final emotional peak. |
| **Fallback note** | **The one frame with explicit per-frame fallback:** if the live check is slow or the provider/sandbox is unavailable, the Operator falls back to the **replay-backed** check result (same green `✓`, sourced from the persisted `check.completed` event) — labeled, and visually identical except the REPLAY banner. Rehearsed both ways (ARCHITECTURE.md §16). |

### Frame 13 — Land it / Stop

| | |
|---|---|
| **On screen** | Back to **S2/S5** header. If the run is still live, the Operator presses **Stop**; the kill switch drives a clean terminal state and a partial/final summary; RunHeader shows `completed`/`stopped`. The **BestIdeaPanel** holds the winner. Return to **S0** shows the run now in the completed list with its best-idea preview and a Replay affordance. |
| **Screen / components** | **S2** → `StopButton` (`POST /runs/:id/stop`, idempotent) · `RunHeader` terminal `StatusBadge` · `BestIdeaPanel` · back to **S0 · Runs Home**. |
| **Operator action** | *"Stop is a hard control path, not a UI nicety — and the whole run is now replayable forever."* Closes the loop. |
| **Audience takeaway** | "Bounded, controllable, and **preserved** — they can replay this exact run any time." |
| **Motion** | Stop press → energy gauge freezes mid-charge, LIVE badge resolves to a terminal `StatusBadge`, organism stills. Calm landing. |
| **Fallback note** | Stop is reliable on all rungs; replay runs simply have no live Stop (already terminal). |

---

## Stage safety — the fallback ladder (operator-driven, rehearsed)

The showcase must survive LLM latency and provider failure inside a 10-minute window. The ladder is **manual, not automatic** — the Operator controls stage timing — and the override only **lowers** caps within validated maxima (ARCHITECTURE.md §17; USER_FLOWS live/replay fallback; EVALUATION_CRITERIA replay fallback).

```
 RUNG 1  LIVE, LOW-CAP            default opening — real run, small caps so it fits the clock
    │     decide with HealthIndicator (last-event age ↑, candidates-in-flight = 0, caps consumed)
    ▼
 RUNG 2  PREPARED, KNOWN-GOOD     operator switches to a rehearsed prepared problem-set run
    │     same S1→S2 flow; no story change; still "live" execution of a vetted seed
    ▼
 RUNG 3  LABELED REPLAY           clearly-labeled REPLAY of a recorded run (S6)
          persistent REPLAY ModeBanner + ReplayScrubber; reconstructs from event log; NO model calls
```

**The continue-vs-switch signal — `HealthIndicator`** (ARCHITECTURE.md §11 `GET /runs/:id/health`): current generation, **candidates in flight**, **last-event age**, **caps consumed**. This is the one runtime read Langfuse can't give the Operator. Design it to be glanceable from the stage:

| Health state | Encoding | Operator read |
|---|---|---|
| Healthy | `♥` green, recent last-event age | stay on current rung |
| Slow | `♥` amber, last-event age climbing | warn, prep next rung |
| Stalled | `△` red, last-event age stale / 0 in flight | drop a rung now |

**Live vs replay must be UNMISTAKABLE at a glance** (accessibility rule, `10-accessibility-and-projector.md`): LIVE = cyan pulsing `ModeBanner` in `RunHeader`; REPLAY = persistent **orange** top-edge `ModeBanner` + docked `ReplayScrubber`. Never ambiguous, even at projector distance, even for a colorblind viewer (shape + label + position back the color).

### Frame 4-bis — Entering on replay (Rung 3 cold open)

If the room's network is hostile from the start, the entire storyboard runs from **S6 · Replay Mode**: from **S0**, the Operator clicks a completed run's **Enter Replay**; **S2's layout** loads under a persistent REPLAY banner with a **ReplayScrubber**. Every frame above (4–13, except the literal live Stop) plays identically by scrubbing the event log at chosen speed. The Operator narrates the *same script*; only the banner differs. This is why S6 reuses S2's exact layout — **one observatory, two time modes.**

```
 S6 · REPLAY MODE  (S2 layout + replay chrome)
 ┌── RunHeader · ▮ REPLAY ▮ (orange, persistent) ─────────────────────────┐
 │ Cold-Chain Logistics · gen 5/5 · ⏪ scrubbing                           │
 ├──────────────────────────┬─────────────────────────────────────────────┤
 │  …same panels as S2…      │   …same LineageGraph, time-travelled…       │
 ├──────────────────────────┴─────────────────────────────────────────────┤
 │  REPLAY SCRUBBER  ⏮ ⏯ ⏭   ●──────────────○────  seq 0 ── 1,204   1×▾   │
 └──────────────────────────────────────────────────────────────────────────┘
```

---

## States checklist per frame (so the prototype covers every condition)

For each S2/S5 frame, the kit must render these states (full spec: `08-data-and-states.md`). The storyboard relies on **degraded** states *not* breaking the narrative.

| State | Where it shows up in the demo | Encoding |
|---|---|---|
| **default / live** | Acts I–III on Rung 1 | cyan LIVE `ModeBanner`, SSE-driven |
| **replay** | Frame 11, Frame 4-bis, Rung 3 | orange persistent REPLAY banner + `ReplayScrubber` |
| **loading** | Frame 3 cut-in before first events | `LoadingState`: skeleton graph + "awaiting first events" |
| **empty** | Frame 4 pre-bloom; `BestIdeaPanel` before first score | `EmptyState`: "no scored candidate yet" |
| **error** | provider hard-fail mid-Act-II | `ErrorState`: banner + "switch to prepared/replay" prompt → Rung 2/3 |
| **degraded — novelty** | embedding/novelty failure | `DegradedState`: NoveltyMeter flagged *estimated/absent*, FitnessBreakdown notes it; story continues |
| **degraded — Langfuse off** | observability side-channel down | trace links show "trace unavailable (local only)"; no narrative impact |
| **degraded — provider** | retries exhausted on one agenome | that lineage `failed` (`△!`), generation proceeds if ≥1 candidate reached `created` |
| **degraded — all culled** | a generation with zero survivors | `generation.completed{survivors:0}`; run still completes if any prior gen had a winner |

> **Degraded-but-legible is a design requirement:** the showcase claim survives a novelty outage, a Langfuse outage, and a single-lineage provider failure (ARCHITECTURE.md §5 degrade paths). Only an *all-providers* failure forces a rung drop.

---

## Cross-references

| To build… | See |
|---|---|
| The screens named here (S0–S6) in detail | `04-screens-overview.md` |
| The LineageGraph node/edge types + Dagre layout | `05-lineage-graph.md`, ARCHITECTURE.md §10 |
| Every component (RunHeader, ActivityTicker, CriticGauntletPanel, ReplayScrubber, …) | `06-components-library.md` |
| Status glyphs + the motion choreography (spawn/drain/pulse/cull/fuse/mutate) | `07-status-and-motion.md` |
| Default / loading / empty / error / degraded / live / replay states | `08-data-and-states.md` |
| Projector + colorblind rules, live-vs-replay distinction | `10-accessibility-and-projector.md` |
| Dummy runs/agenomes/candidates/events to drive the clickable prototype | `11-dummy-data-fixtures.md` |
| Ground-truth flows behind each act | `../planning/USER_FLOWS.md`, ARCHITECTURE.md §11, §17 |
