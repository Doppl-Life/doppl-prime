# Doppl — Personas + Jobs-to-be-Done

Purpose: define exactly who uses the Doppl dashboard, what each person needs to *see* and *do*, and which canonical screens/components serve every job — so the design-system kit and clickable prototype can be built without re-deriving intent.

Related: [`00-overview.md`](./00-overview.md) · [`02-information-architecture.md`](./02-information-architecture.md) · [`03-screens.md`](./03-screens.md) · [`04-components.md`](./04-components.md) · [`05-lineage-graph.md`](./05-lineage-graph.md) · [`06-status-and-motion.md`](./06-status-and-motion.md) · [`07-visual-language.md`](./07-visual-language.md) · [`08-dummy-data.md`](./08-dummy-data.md)

---

## 0 · The one-sentence framing the personas exist to serve

Doppl is **an agent-evolution runtime you WATCH**: a human seeds a run, a bounded population of **agenomes** breeds candidate ideas, an adversarial **Critic Gauntlet** + held-out judge + objective **Subtype-Checks** score them, weak lineages are **culled**, strong pairs **FUSE** and **mutate** into later generations that *measurably beat* earlier ones. **The product IS the process** — "it's not the agent, it's the kernel that breeds the agents." Every persona decision below is in service of one job for the whole product: make *a digital ecosystem getting smarter in real time* **legible and unforgettable** in a 10-minute showcase, and **inspectable** enough that a skeptic can defend why the winning idea won.

There are exactly **two human personas**. Everything else in the system (agenome agents, critic agents, check runners, selection controller, runtime worker) is a **non-human actor** the personas *observe* — never a user of the UI.

---

## 1 · Persona A — The Operator (primary)

> *"I am about to stand in front of a room and claim my agents got smarter. I need to start the run, keep it inside 10 minutes, never let it look stalled, and be able to prove every claim if challenged — and if the live run wobbles, I switch to replay before anyone notices."*

### 1.1 Snapshot

| Attribute | Value |
|---|---|
| Who | Capstone team member running the June 29, 2026 showcase; also the developer who built Doppl |
| Role conflation (MVP) | Operator **is** the admin. No separate admin role. (`USERS.md` §Operators/Admins) |
| Count | **Single operator.** No multi-user auth, no workspace membership, no team admin in MVP. |
| Permission | **Read + write.** Can create/configure/start/stop runs and inspect *everything*. |
| Skill level | Power user. Knows the domain model (agenomes, fitness components, caps) cold. |
| Device / context | Driving a laptop wired to a **projector**; the audience sees what the operator sees. High-stakes, time-boxed, live. |
| Emotional state | Performing under pressure. Wants *calm chrome, vivid organism* — no surprises, instant legibility, a visible escape hatch (replay). |

### 1.2 Goals (in priority order)

1. **Start a bounded run** against a live audience prompt *or* a prepared problem set, with **hard-max caps** that guarantee it can't run away on cost or time.
2. **Drive the live narrative**: seed → bloom → spend → critics → cull → **FUSE** → climb → reveal — so the room *feels* the generational improvement.
3. **Read run health at a glance** and decide *continue-vs-switch-to-replay* without squinting (the `HealthIndicator` is the operator's cockpit gauge).
4. **Inspect any candidate or agenome on demand** when a skeptic asks "why did *that* win?" — drill to the `CriticGauntletPanel`, `SubtypeCheckPanel`, `FitnessBreakdown`, `LineagePathTrace`.
5. **Land the payoff**: reveal the winning idea, **replay the gauntlet it survived**, and (for `cross_domain_transfer`) **run the executable check live**.
6. **Have a guaranteed fallback**: a labeled `REPLAY` of a known-good run when live LLM latency/provider failure threatens the window.

### 1.3 Context & constraints the design must respect

- **10-minute window.** Every interaction is on the critical path of a live show. No multi-step ceremony to start; no buried controls; Stop must be reachable in one click.
- **Latency is the enemy.** LLM/tool calls are slow and can fail. The UI must *never look dead* during legitimate waiting — `ActivityTicker` + heartbeat + in-flight counts make "working" visible (see `06-status-and-motion.md`).
- **Caps are a hard rail, not a suggestion.** The UI surfaces caps and consumption but **cannot bypass HARD-MAX** (`CapsControl` enforces; backend re-validates). The operator *configures within* the ceiling.
- **The UI never mutates authoritative state** except via `POST /runs` and `POST /runs/:id/stop`. Everything else is a read projection (`ARCHITECTURE.md` §11/§12).
- **Live vs. replay must be unmistakable** even from the back of the room — the `ModeBanner` and `RunHeader` LIVE/REPLAY badge are non-negotiable.

### 1.4 Pain points (what ruins the operator's day)

| Pain | Where the design answers it |
|---|---|
| Live demo stalls / looks frozen | `HealthIndicator` (last-event age, candidates in flight) + `ActivityTicker` liveness + `LoadingState`/`DegradedState` |
| Runaway cost / time | `CapsControl` HARD-MAX in `RunLauncherForm`; `RunEnergyGauge` draining toward budget; `GenerationCounter` vs maxGenerations |
| "Why did this idea win?" with no answer | `CandidateInspector` → `CriticGauntletPanel` + `FitnessBreakdown` + `SubtypeCheckPanel` + `LineagePathTrace` |
| Can't tell if I'm live or replaying | `ModeBanner` (full-width) + RunHeader LIVE/REPLAY badge + `ReplayScrubber` only present in S6 |
| Provider fails mid-show | Fallback ladder: low-cap live → prepared run → labeled `REPLAY` (S6); `DegradedState` for provider-failure |
| Accidentally starting two runs | `POST /runs` is idempotent from the UI's perspective; Start button disables + shows pending state |
| Scores look opaque / hand-wavy | `FitnessBreakdown` shows `components{}` bars + total + `policyVersion` + explanation; novelty via `NoveltyMeter` |

### 1.5 What the Operator must SEE

- **Run cockpit at all times** (`RunHeader`): title, **LIVE/REPLAY badge**, `GenerationCounter` (e.g. `Gen 4 / 6`), `RunEnergyGauge` (e.g. `61% spent`), `HealthIndicator`, `StopButton`.
- **The organism breathing** (`LineageGraph` in S2): nodes spawning, energy draining, critic pulses, **cull fade+sink**, **fusion two-edges-converge**, mutation shimmer, generation tiers advancing.
- **The proof it's working** (`FitnessOverTimeChart` + `GenerationComparison`): the line climbing gen-over-gen — the single most important truth claim.
- **The pulse** (`ActivityTicker`): live SSE events scrolling so "alive" is never in doubt.
- **The current leader** (`BestIdeaPanel`): best-so-far idea, updating as selection happens.
- **On demand, the full evidence** for any node (`CandidateInspector` / `AgenomeInspector`).

### 1.6 What the Operator must DO

| Action | Component / Screen | Write or Read |
|---|---|---|
| Create + configure a run | `RunLauncherForm` (PromptSourcePicker, SubtypeToggle, `CapsControl`, ModelProfileSelect) on **S1 · Run Launcher** | **WRITE** (`POST /runs`) |
| Start the run | Start button, S1 | **WRITE** |
| Stop the run | `StopButton` in `RunHeader`, S2 | **WRITE** (`POST /runs/:id/stop`) |
| Watch live | **S2 · Organism View** (SSE-driven) | Read |
| Drill into a candidate | click `CandidateNode`/`CandidateCard` → `CandidateInspector` (S3 overlay) | Read |
| Drill into an agenome | click `AgenomeNode`/`AgenomeCard` → `AgenomeInspector` (S4 overlay) | Read |
| Enter replay | from **S0 · Runs Home** (completed run) or toggle into **S6 · Replay Mode** | Read |
| Scrub time | `ReplayScrubber` (play/pause/seek/speed), S6 | Read |
| Reveal the payoff | **S5 · Final Idea / Payoff** → `FinalIdeaProof`, replay gauntlet, run executable check | Read (replays/re-runs evidence) |

### 1.7 Success vs. failure states

**Success** — A run completes (or hits a clean demo stop) with: visible lineage, energy accounting, critic outcomes, subtype checks, and **improved generation-over-generation fitness**; the operator reveals the best idea and defends it from evidence on screen. *(matches `USERS.md` success state + `EVALUATION_CRITERIA.md` demo evidence list)*

**Failure** — The run stalls, exceeds budget, produces **opaque scores**, fails to show improvement, or the operator **cannot explain the final idea**. Design must make each failure *recoverable or invisible*: stalls masked by replay fallback; budget bounded by hard caps; scores always decomposed; explanation always one click away.

---

## 2 · Persona B — The Reviewer / Showcase Audience (secondary, read-only)

> *"I'm being told these agents evolved. Prove it. Show me that generation N+1 is genuinely better than N — not just one impressive paragraph — and let me check the receipts on the winner."*

### 2.1 Snapshot

| Attribute | Value |
|---|---|
| Who | Capstone judges + showcase room; technically literate skeptics who don't know Doppl's internals |
| Count | Many (audience), but all **read-only**, all viewing the **operator's projected screen** (no personal session in MVP) |
| Permission | **Read-only.** Cannot start/stop/configure; cannot edit prompts, scores, lineage, or checks. |
| Device / context | Watching a **projector** from a distance. Cannot interact directly; the operator drills on their behalf. |
| Emotional state | Skeptical by default. Wants to be *convinced*, then *able to verify*. Allergic to "impressive text with no evidence of selection." |

### 2.2 Goals

1. **Judge the core claim's credibility**: did a later generation produce *stronger surviving ideas* than an earlier one? (the acceptance proof, `EVALUATION_CRITERIA.md`).
2. **Follow the story on a projector**: see agents spawn, spend energy, face critics, die or survive, **fuse**, mutate, and climb — legibly, from a distance.
3. **See the contrast**: this is **GENERATIONAL**, not a one-round tournament — round N+1 is *genuinely smarter* than round N.
4. **Get evidence on demand**: when curious/skeptical, see *why* the winner survived — the gauntlet it passed, the check it ran, the fitness components.
5. **Trust live vs. replay honesty**: never be fooled into thinking a replay is live.

### 2.3 What the Reviewer must SEE (legibility is the whole job)

- **The climbing line** — `FitnessOverTimeChart` is the reviewer's *headline evidence*; it must be readable across a room.
- **The side-by-side** — `GenerationComparison` makes "N+1 beats N" concrete (gen-0 baseline → winner).
- **The living tree** — `LineageGraph` with the `LineageLegend` always visible so node/edge meaning is self-explanatory; **fusion edges** and **cull fades** tell the selection story visually.
- **Unmistakable mode** — `ModeBanner` LIVE vs REPLAY at a glance (shape+icon+label+color, not color alone).
- **The payoff with receipts** — `FinalIdeaProof` (S5): the winning idea + replayable gauntlet + executable transfer check + generational-improvement summary.

### 2.4 What the Reviewer must (be able to) DO — *via the operator*

The reviewer **does not interact directly** in MVP (single operator, projector). Their "actions" are *requests the operator executes*:

| Reviewer intent | Operator action that serves it | Surface |
|---|---|---|
| "Show me why this won." | Operator opens `CandidateInspector` | S3 overlay |
| "Compare gen 1 vs gen 5." | Operator focuses `GenerationComparison` / `GenerationTimeline` | S2 |
| "Replay that gauntlet." | Operator triggers gauntlet replay | S5 `FinalIdeaProof` |
| "Run the transfer check for real." | Operator triggers the executable check | S5 |
| "Is this live?" | Always answered by `ModeBanner` (no action needed) | global |

> **Open question (do not design as fact):** whether reviewers may submit a *live seed prompt* during the showcase or only watch the operator submit it (`USERS.md`, `USER_FLOWS.md`). Design the `RunLauncherForm` PromptSourcePicker to *accept a live operator-entered prompt* either way; reviewer-submitted prompts are **out of MVP scope** unless promoted.

### 2.5 Success vs. failure states

**Success** — The reviewer can articulate *how generation N+1 improved over N* and *why the final idea survived*, from what's on screen (`USERS.md`).

**Failure** — The reviewer sees **only impressive text output** with no visible evidence of selection, verification, or lineage. Design countermeasure: never show a winning idea without its `FinalIdeaProof`; never show a score without its `FitnessBreakdown`; never show the tree without its `LineageLegend`.

---

## 3 · Permission boundary (write vs. read-only) — the hard line

```
                         ┌──────────────────────────────────────────────┐
   OPERATOR (write)      │  POST /runs            (create + configure)   │
   ─ the only writer ──▶ │  POST /runs/:id/stop   (stop)                 │
                         └──────────────────────────────────────────────┘
                                          │  everything else is READ
                                          ▼
   BOTH PERSONAS (read)   GET /runs · /runs/:id · /runs/:id/events
                          GET /runs/:id/stream (SSE) · /runs/:id/lineage
                          GET /runs/:id/replay · /runs/:id/candidates/:cid
                          GET /runs/:id/health · /model-routes
```

Design rules that fall out of this (cross-ref `ARCHITECTURE.md` §11/§12, `USERS.md` permission matrix):

- **The UI NEVER mutates authoritative state** except the two POSTs. No optimistic edits to scores, lineage, or candidates — ever.
- **Reviewer = read-only.** In a multi-session future, write affordances (`RunLauncherForm`, `StopButton`) would be hidden/disabled for reviewers. In MVP there is **one operator and a projector**, so this is enforced by *who holds the laptop*, not by auth.
- **Caps cannot be bypassed in the UI.** `CapsControl` clamps to HARD-MAX; the backend re-validates on `POST /runs`.
- **Replay cannot mutate history.** `ReplayScrubber` reconstructs from the event log; no live calls, no writes (`USER_FLOWS.md` Replay constraints).
- **Single-operator MVP scope (explicit):** no multi-user auth, no workspace membership, no role switching, no durable team admin. The operator *is* the admin. (`USERS.md` scope simplification; `EVALUATION_CRITERIA.md` deferred work.) The prototype should **not** build login/role screens.

---

## 4 · Jobs-to-be-Done → Screens & Components map

Each row is a concrete job phrased as the persona would phrase it, mapped to the canonical screen(s) and the components that serve it. (Flows from `USER_FLOWS.md`; screens/components are canonical — see `03-screens.md`, `04-components.md`.)

| # | Job (as the persona says it) | Persona | Screen(s) | Key components | Write? |
|---|---|---|---|---|---|
| J1 | "Let me pick a prompt, set safe caps, and start a run." | Operator | **S1 · Run Launcher** | `RunLauncherForm` → PromptSourcePicker, SubtypeToggle, `CapsControl`(hard-max), ModelProfileSelect; Start | **W** `POST /runs` |
| J2 | "Show me the population come alive after I seed." | Operator + Reviewer | **S2 · Organism View** | `LineageGraph` (spawn grow-in), `ActivityTicker`, `RunHeader` | R |
| J3 | "Keep me confident it's not frozen." | Operator | S2 | `HealthIndicator` (last-event age, in-flight, caps consumed), `ActivityTicker`, heartbeat | R `GET /health` |
| J4 | "Show energy being spent and the budget draining." | Operator + Reviewer | S2 | `RunEnergyGauge` (run budget), `EnergyMeter` (per-agenome) | R |
| J5 | "Show me a candidate's full receipts — why is it any good?" | Both (operator drills) | **S3 · Candidate Inspector** (overlay) | `CandidateInspector` → `CriticGauntletPanel` (ReviewRow), `SubtypeCheckPanel` (CheckRow), `NoveltyMeter`, `FitnessBreakdown`, `LineagePathTrace`, trace links | R `GET /candidates/:cid` |
| J6 | "Show me a genome — its prompt, traits, tools, parentage." | Both (operator drills) | **S4 · Agenome Inspector** (overlay) | `AgenomeInspector` → systemPrompt, personaWeights, toolPermissions, decompositionPolicy, spawnBudget, parentIds (fusion/mutation), `EnergyMeter`, status | R |
| J7 | "Show weak lineages dying and strong pairs FUSING." | Reviewer (story) | S2 | `LineageGraph` cull fade+sink + fusion two-edges-converge + mutation shimmer; `StatusBadge` | R |
| J8 | "Prove later generations beat earlier ones." | Reviewer (core claim) | S2 / S5 | `FitnessOverTimeChart`, `GenerationComparison`, `GenerationTimeline` | R |
| J9 | "Tell me the current best idea." | Operator + Reviewer | S2 | `BestIdeaPanel` | R |
| J10 | "Stop the run cleanly." | Operator | S2 | `StopButton` in `RunHeader` | **W** `POST /runs/:id/stop` |
| J11 | "Reveal the winner and let me defend it." | Both | **S5 · Final Idea / Payoff** | `FinalIdeaProof` / `BestIdeaPanel`, replayable Critic Gauntlet, `FitnessBreakdown`, gen-0→winner summary | R |
| J12 | "Run the transfer's executable check live." | Operator (payoff) | S5 | `SubtypeCheckPanel` (executable `CheckRow`), `CheckNode` | R (re-runs/replays check) |
| J13 | "Replay a completed run safely (no live calls)." | Both | **S6 · Replay Mode** | `ModeBanner`(REPLAY), `ReplayScrubber`, S2 layout reused | R `GET /replay` |
| J14 | "Never let me confuse live and replay." | Both | global | `ModeBanner`, RunHeader LIVE/REPLAY badge | R |
| J15 | "See all my runs and jump into one." | Operator | **S0 · Runs Home** | run list (status, generation reached, best-idea preview), New Run CTA, Enter Replay | R `GET /runs` |
| J16 | "Switch to the fallback when live wobbles." | Operator | S0 → S1(low-cap) → S6 | fallback ladder: low-cap live → prepared run → labeled `REPLAY`; `DegradedState` | mixed |
| J17 | "Understand what every node/edge means." | Reviewer | S2 / S6 | `LineageLegend` (always visible), `StatusBadge` | R |
| J18 | "Recover gracefully when something degrades." | Operator | any | `DegradedState` (novelty-degraded, Langfuse-off, provider-failure, all-culled), `ErrorState`, `EmptyState`, `LoadingState` | R |

### 4.1 Flow → job coverage (cross-check against `USER_FLOWS.md`'s 7 flows)

| `USER_FLOWS.md` flow | Jobs covered | Primary screen |
|---|---|---|
| Configure & start a run | J1 | S1 |
| Execute generation (live) | J2, J3, J4 | S2 |
| Verify candidates (critics + checks) | J5 | S3 |
| Score / cull / fuse / mutate | J7, J8 | S2 |
| Observe live | J2–J4, J7–J9, J17 | S2 |
| Replay | J13, J14, J16 | S6 |
| Stop / complete | J10, J11, J12 | S2 → S5 |

Every flow has at least one job and one screen. No flow is orphaned; no canonical screen is unused.

---

## 5 · Representative dummy personas + dummy session (for the prototype)

Use these so the clickable prototype reads as real without a backend. (Fuller fixtures live in [`08-dummy-data.md`](./08-dummy-data.md).)

### 5.1 Operator profile (single-operator MVP — no auth screen)

```json
{
  "operator": {
    "displayName": "Dee R.",
    "role": "operator",
    "permissions": ["create_run", "stop_run", "configure_run", "inspect_all"],
    "isAdmin": true,
    "session": "single-operator (no multi-user auth in MVP)"
  }
}
```

### 5.2 A run as the Operator would see it on S0 · Runs Home

```text
RUNS HOME                                                   [ + New Run ]
────────────────────────────────────────────────────────────────────────
●LIVE  run_7f3a  "Cut last-mile delivery cost 30%"      Gen 4/6  ⚡61%  ▶ open
       best so far: "Ant-colony pheromone routing → courier dispatch"
────────────────────────────────────────────────────────────────────────
✓DONE  run_91c2  "B2B fintech wedge for Gen-Z"          Gen 6/6  ⚡100% ⟲ replay
       winner: "Payroll-streaming as a trust primitive"   fitness 0.71→0.89
────────────────────────────────────────────────────────────────────────
✓DONE  run_4d8e  "Reduce ER triage time"                Gen 5/6  ⚡88%  ⟲ replay
       winner: "Queueing-theory triage from airline ops"  fitness 0.55→0.82
────────────────────────────────────────────────────────────────────────
△FAIL  run_22b0  "Open-ended live prompt"               Gen 2/6  ⚡40%  ⟲ replay
       all lineages culled at gen 2 — see DegradedState(all-culled)
```

### 5.3 What the Reviewer reads on S2 (the convince-me view), in prose-wireframe

```text
┌─ RunHeader ─────────────────────────────────────────────────────────────┐
│ "Cut last-mile delivery cost 30%"   ● LIVE   Gen 4/6   ⚡ 61% spent   ♥ ok │ [ STOP ]
├──────────────┬───────────────────────────────────────────┬───────────────┤
│ Generation   │            LINEAGE GRAPH (React Flow)       │ FitnessOverTime│
│ Timeline     │   gen0 → gen1 → gen2 → gen3 → [gen4 ◐]      │   0.89 ┐╱      │
│  ●0 ●1 ●2 ●3 │   ★parent ⚇fused ∿mutated ✕culled ♔selected│   0.71 ┘       │
│  ◐4  ○5 ○6   │   [LineageLegend pinned bottom-left]        │  ▲ climbing    │
├──────────────┴───────────────────────────────────────────┴───────────────┤
│ ActivityTicker:  ⚇ a3+a7 → child a12 fused · ✕ a5 culled · ♔ c81 selected │
├───────────────────────────────────────────────────────────────────────────┤
│ BestIdeaPanel:  "Ant-colony pheromone routing → courier dispatch"  f=0.84  │
└───────────────────────────────────────────────────────────────────────────┘
```

The reviewer's three convince-me beats are all on this one screen: **the climbing chart** (claim), **the living tree with fusion/cull glyphs** (mechanism), **the best idea** (payoff) — with the `LIVE` badge guaranteeing it's real.

---

## 6 · Design principles that fall directly out of these personas

1. **Two audiences, one screen.** S2 must satisfy the operator's *control + depth* and the reviewer's *legibility from a distance* simultaneously — calm chrome, vivid organism.
2. **Liveness is the soul.** If the operator can't *feel* the run breathing (spawn/spend/cull/fuse/climb), the reviewer won't believe it. Motion is meaningful, never decorative (respect reduced-motion — see `06-status-and-motion.md`).
3. **Evidence is always one click deep.** No claim (winner, score, survival) is ever shown without a path to its receipts (`CandidateInspector`, `FitnessBreakdown`, `FinalIdeaProof`).
4. **Status never relies on color alone.** Shape + icon + label + color, colorblind-safe, projector-legible (`StatusBadge`, `LineageLegend`).
5. **Live vs. replay is sacred.** `ModeBanner` + RunHeader badge make it unmistakable; reviewer trust collapses if a replay reads as live.
6. **The UI is a witness, not an author.** Read-only by default; only two POSTs ever write. The runtime event log is the source of truth.
7. **Build for the single operator.** No auth/role/workspace scaffolding in the prototype — design the read-only/write split as a *future* concern, enforced today by who holds the laptop.
