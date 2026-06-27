# Doppl — Product Overview for Designers

> **Purpose:** Your orienting first read. What Doppl is, the story it tells, the feeling it must produce on stage, and the vocabulary you'll see in every other doc in this package. Read this before anything else.

**Related:** [`01-personas-and-jobs.md`](01-personas-and-jobs.md) · [`02-information-architecture.md`](02-information-architecture.md) · [`03-screens/`](03-screens/) (S0–S6) · [`04-components.md`](04-components.md) · [`05-status-encoding.md`](05-status-encoding.md) · [`06-motion-and-liveness.md`](06-motion-and-liveness.md) · [`07-visual-language.md`](07-visual-language.md) · [`08-data-shapes-and-dummy-data.md`](08-data-shapes-and-dummy-data.md) · [`09-accessibility-and-projector.md`](09-accessibility-and-projector.md)
> Ground truth (do not contradict): [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) (esp. §3, §10, §11, §12, Appendix A) · [`../planning/USER_FLOWS.md`](../planning/USER_FLOWS.md) · [`../planning/USERS.md`](../planning/USERS.md) · [`../planning/EVALUATION_CRITERIA.md`](../planning/EVALUATION_CRITERIA.md)

---

## 1. What Doppl is (in design-relevant terms)

**Doppl is an agental-evolution runtime that you _watch_.** It is not a chatbot, not a single agent, not a dashboard for one model's output. It is a **living ecosystem getting smarter in real time**, and the entire product is the experience of seeing that happen and being able to _trust_ it.

A human seeds a run with a problem. Doppl spawns a **bounded population** of little agent "genomes" (we call them **agenomes**). Those agenomes generate **candidate ideas**. An adversarial **critic council**, a held-out **judge**, and objective **checks** score every candidate. Weak lineages are **culled** (they go dark). Strong agenomes become eligible parents, **fuse** in pairs to make children, and **mutate**. The next generation is measurably _better_ than the last. A **fitness-over-time** chart climbs. Lineages visibly **specialize**. At the end, the single best surviving idea is revealed — and it can **replay** the exact adversarial gauntlet it survived, and (for transfer ideas) **run a check live**.

> **The one-line product thesis (from ARCHITECTURE.md):**
> *"It's not the agent — it's the kernel that breeds the agents; the event log is the truth, and the held-out judge is the floor the organism cannot lift."*

The product **IS the process.** A designer's instinct might be to surface a polished final answer; resist it. The polished final answer is the _least_ interesting thing here. The interesting thing — the thing nobody has seen before — is the **generational climb**: round N+1 is genuinely smarter than round N, and you can prove it.

### What the UI's job actually is

Two jobs, in tension, both non-negotiable:

1. **Make it legible and unforgettable** — a non-technical person across a projector-lit room watches a digital organism bloom, struggle, breed, and improve, and _gets it_ in 10 minutes without a tour guide.
2. **Make it inspectable and defensible** — a skeptic can click into the winning idea and reconstruct, from real evidence, _why it won_: which critics it survived, which checks passed, how novel it is, what it cost in energy, who its ancestors were.

The visual system has to serve both at once: **calm chrome, vivid organism.** The frame stays quiet and high-contrast; the life inside it is bioluminescent and in motion.

### What the UI is NOT allowed to do

The dashboard is a **read view of an append-only event log.** It **never mutates authoritative state.** The only things that change the world are two POST commands (start a run, stop a run). Everything else — lineage, energy, scores, fusion, culling — is the runtime emitting events that the UI _renders_. Design accordingly: the UI is a **window onto a living process**, not a control panel that drives it. (See ARCHITECTURE.md §2.5, §11, §12.)

---

## 2. The narrative & the "agents that breed agents" hook

This is the story arc the demo tells, beat by beat. Every screen exists to land one or more of these beats. (Screens referenced by their canonical IDs — full specs in [`03-screens/`](03-screens/).)

| Beat | What the audience sees | Where it lives |
|---|---|---|
| **Seed** | The operator drops in a problem (live from the room, or prepared). The arena is empty, expectant. | **S1 · Run Launcher** → **S2 · Organism View** empty state |
| **Bloom** | The population spawns — agenome nodes grow in, glowing, each a slightly different genome. | **S2 · Organism View**, `LineageGraph` gen-0 tier |
| **Spend** | Agenomes burn **energy** producing candidate ideas. Energy is light that _drains_. | `EnergyMeter` per node, `RunEnergyGauge`, `ActivityTicker` |
| **Gauntlet** | Each candidate faces the **critic council** + **checks** + the **held-out judge**. Critics pulse as they review. | `CriticGauntletPanel`, `SubtypeCheckPanel`, critic/check nodes |
| **Death** | Weak candidates are rejected; weak lineages are **culled** — nodes fade and visually _sink_. | `LineageGraph` cull animation, `StatusBadge` |
| **Breeding** | Two strong parents **fuse** — two edges converge into one child — and children **mutate** (a shimmer). | `LineageGraph` fusion edges, `LineagePathTrace` |
| **The climb** | The **fitness-over-time** chart steps up, generation over generation. This is the money moment. | `FitnessOverTimeChart`, `GenerationComparison`, `GenerationTimeline` |
| **Specialization** | Different lineages visibly diverge — different traits, different strengths, different critic verdicts. | `LineageGraph` clustering, `AgenomeInspector` |
| **Payoff** | The single best surviving idea is revealed, replays its gauntlet, and (for transfer) runs an executable check live. | **S5 · Final Idea / Payoff**, `FinalIdeaProof` |

### The hook to hammer: GENERATIONAL, not a tournament

The single most important thing the design must communicate — and the thing most likely to be misread — is this:

> **Doppl is NOT a one-round bake-off.** It is **generational evolution.** Generation N+1 is _bred from_ the survivors of generation N, and it is _measurably better_.

A one-round tournament picks the best of a fixed pool. Doppl does something categorically different: it makes the _next_ pool out of the _winners_ of the last one, and proves the new pool is smarter. If a viewer walks away thinking "oh, it just ran a bunch of agents and picked the best one," **the design has failed.** Every layout decision — the left-to-right generational tiers in the `LineageGraph`, the stepped `FitnessOverTimeChart`, the `GenerationCounter`, the `GenerationComparison`, the fusion edges crossing _between_ generations — exists to make "this generation came FROM that one, and BEATS it" impossible to miss.

---

## 3. The two idea subtypes (one shared lifecycle)

Every candidate idea is one of exactly two subtypes. They share **one lifecycle** (created → under_review → checked → scored → selected, with reject/cull/invalid branches), so the chrome around them is identical — but their _payloads_ and _checks_ differ, and the design must make each one feel distinct and inspectable. (ARCHITECTURE.md §3, §7; Appendix A.)

### `cross_domain_transfer` — "steal a trick from domain A, apply it to problem B"

> Map a known **technique** from a **source domain** onto a **target problem** in a different domain.

Payload fields (`CrossDomainTransferPayload`):
`sourceDomain` · `sourceTechnique` · `targetDomain` · `targetProblem` · `transferMapping` · `expectedMechanism` · `executableCheckIdea?`

This is the subtype that gets the **"run the check live"** payoff moment — for prepared problems, the winning transfer's allowlisted check actually executes on stage (with replay-backed fallback). Design should give transfer candidates a clear **A → B mapping** visual motif (two domains, an arrow, a mechanism).

**Dummy example:**
```
subtype:          cross_domain_transfer
title:            "Annealing schedules for warehouse pick-path routing"
sourceDomain:     metallurgy
sourceTechnique:  simulated annealing (controlled cooling to escape local minima)
targetDomain:     logistics
targetProblem:    minimize picker walking distance in a dynamic warehouse
transferMapping:  temperature → willingness to accept a worse route early;
                  cooling     → tighten as the shift progresses
expectedMechanism: escapes greedy local optima that fixed heuristics get stuck in
executableCheckIdea: run on a 50-bin toy warehouse, compare path length vs. greedy
```

### `zeitgeist_synthesis` — "a sharp thesis fitted to right-now signals"

> A **thesis / framing** built from current signals, with a stated audience, a "why now," falsifiable predictions, and prior art.

Payload fields (`ZeitgeistSynthesisPayload`):
`thesis` · `audience` · `currentSignals[]` · `whyNow` · `falsifiablePredictions[]` · `comparablePriorArt[]`

This subtype leans on **retrieval-grounded signals** and **falsifiability**. Design should give it a **thesis-forward** motif (a bold claim up top, the supporting signals and the falsifiable predictions as evidence below).

**Dummy example:**
```
subtype:        zeitgeist_synthesis
title:          "The 'quiet calendar' productivity backlash"
thesis:         Teams will start defaulting meetings to async-by-design as a status signal.
audience:       mid-market SaaS ops leaders
currentSignals: ["3 unicorns publicized 'no-meeting weeks'", "calendar-blocking tools +40% MoM",
                 "remote-fatigue think-pieces trending"]
whyNow:         post-RTO fatigue + tooling maturity hit at the same time
falsifiablePredictions: ["≥2 major HR platforms ship 'async-default' by Q4",
                         "meeting-hours-per-IC drops in published 2026 reports"]
comparablePriorArt: ["GitLab async handbook", "Basecamp 'group chat is toxic'"]
```

Both subtypes are **equal must-ship.** Neither is the "real" one. Design them as siblings.

---

## 4. The emotional arc / the wow

The feeling, in order, is the deliverable. If the screens are correct but the _feeling_ is flat, the design is wrong.

```
  SEED            BLOOM           STRUGGLE          BREED            CLIMB           PAYOFF
   │                │                │                │               │                │
 a quiet        the arena       energy drains,    two parents     the fitness     the winner
 prompt,        fills with      critics pulse,    FUSE, a child    chart STEPS     revealed,
 anticipation   living, glowing weak ones go      shimmers into    UP, gen over    replays its
                nodes            DARK and sink     being           gen             gauntlet, runs
   │                │                │                │               │            a check LIVE
   └─ calm ───────► wonder ───────► tension ───────► fascination ──► conviction ──► payoff
```

- **Wonder** at the bloom — it's _alive_, it's many, it's moving.
- **Tension** at the gauntlet and the culling — things _die_; survival is earned, not given.
- **Fascination** at fusion — two things become a third; lineages branch and merge.
- **Conviction** at the climb — the chart going up, generation by generation, is the emotional climax. This is where "I get it" happens.
- **Payoff** at the reveal — and crucially, the reveal is _backed by evidence_, so conviction doesn't collapse into "nice text."

**Liveness is the soul.** Things must visibly **spawn, spend, die, fuse, and climb.** A static tree that just _appears_ fully formed kills the entire premise. (Motion spec: [`06-motion-and-liveness.md`](06-motion-and-liveness.md). Respect `prefers-reduced-motion` — meaning must survive without animation.)

---

## 5. What success looks like on stage

The showcase is **June 29, 2026**, in a room, on a projector, in a **10-minute window**, driven by one **operator** in front of **read-only reviewers**. (EVALUATION_CRITERIA.md "Demo Evidence"; USERS.md.)

Success = the demo shows all six of these, legibly, from across the room:

1. A **seed prompt** (from the room, or a prepared equivalent).
2. A **population tree** where agenomes spawn, spend energy, face critics, and **die or survive.**
3. Later generations **climbing** on the fitness-over-time chart.
4. A **best surviving idea.**
5. A **replay of the adversarial gauntlet** that idea passed.
6. For transfer prompts, an **executable / objective check** running where feasible.

And the **defensibility test**: a skeptic in the audience can ask "why did _that_ idea win?" and the operator can click into **S3 · Candidate Inspector** / **S5 · Final Idea** and show real critic reviews, check results, novelty, a fitness breakdown, and lineage — not vibes.

### The reliability reality (design must accommodate it)

Live LLM/tool calls are slow and can fail. The architecture has a rehearsed **fallback ladder** the operator drives manually (ARCHITECTURE.md §17):

```
(1) live, low-cap run   →  (2) prepared known-good run   →  (3) clearly-labeled REPLAY
        risky                       safe & rehearsed              bulletproof
```

This means **live vs. replay must be unmistakable at a glance** (a persistent `ModeBanner` — see [`05-status-encoding.md`](05-status-encoding.md)), and the operator needs a continue-vs-switch signal at all times (`HealthIndicator`: current gen, candidates in flight, last-event age, caps consumed). The audience must **never** be confused about whether they're watching something happen now or watching a recording — confusing the two destroys credibility.

---

## 6. The design north-star

> **Legible + Unforgettable + Defensible.**

Every design decision is graded against these three. Pin them above your monitor.

| Pillar | The question it answers | What it demands of the design |
|---|---|---|
| **Legible** | Can a non-expert across a room understand what's happening, right now, without help? | Big type. Status by **shape + icon + label + color**, never color alone. One unmistakable focal point per moment. The generational story readable at a glance. |
| **Unforgettable** | Will someone describe this to a friend tomorrow? | Liveness. The bloom, the cull, the fusion, the climb. A bioluminescent organism, not a BI dashboard. Motion that _means_ something. |
| **Defensible** | When a skeptic asks "why?", is there real evidence one click away? | Every claim drills to evidence. Critic reviews, check outputs, novelty math, fitness components, lineage ancestry — all inspectable, all traceable to persisted events. |

**Tie-breaker when pillars conflict:** legibility on the projector wins for the _shared_ surfaces (S0, S2, S5); defensibility depth lives in the _drill-in_ surfaces (S3, S4) where the operator goes on demand. Never sacrifice legibility of the main stage for evidence density — push the density into the inspectors.

**Aesthetic direction (a starting point — the design team refines):** a dark **"evolutionary observatory / bioluminescent lab."** Deep background, glowing living nodes, **energy rendered as light/charge that drains**, the lineage rendered as a growing organism. High-contrast, projector-legible. Calm chrome, vivid organism. Fonts: **Inter** for UI (projector-legible), **JetBrains Mono** for genome text, IDs, and energy numbers. (Full visual language: [`07-visual-language.md`](07-visual-language.md).)

---

## 7. Glossary — the domain nouns you will keep seeing

These are the words on the walls. Use these exact names everywhere so the docs cross-reference cleanly. (Authoritative definitions: ARCHITECTURE.md §3 + Appendix A.)

| Term | What it is (designer's-eye) | Where it shows up |
|---|---|---|
| **Run** | One end-to-end evolution session: a seed + caps + config, producing many generations. The top-level unit. Has a lifecycle: `configured → running → completing → completed` (or `stopping/stopped`, `failed`, `cancelled`). | **S0 · Runs Home** (the list), **S2** header (`RunHeader`) |
| **Generation** | One round of the population. Generation 0 is the human-authored baseline; each later generation is **bred from** the previous one's survivors. The unit the climb is measured across. | `GenerationCounter`, `GenerationTimeline`, tiers in `LineageGraph`, `GenerationComparison` |
| **Agenome** | An **agent genome** — one individual in the population. Has a system prompt, persona/value weights, tool permissions, a decomposition policy, a spawn budget (hint), 0–2 parents, energy, and a status. It _produces_ candidate ideas. Think "an organism with DNA," not "a chat session." | `AgenomeCard`, `AgenomeInspector` (**S4**), agenome nodes in `LineageGraph` |
| **Candidate (Candidate Idea)** | The unit of work an agenome produces — one of the two subtypes (§3). It runs the gauntlet and gets scored. The thing that lives, dies, or wins. | `CandidateCard`, `CandidateInspector` (**S3**), candidate nodes |
| **Critic Gauntlet** | The adversarial **critic council**: multiple critics, each with a distinct **mandate** (`factual_grounding`, `novelty_prior_art`, `feasibility`, `falsification`, `subtype_specific`), each emitting a structured review (score + confidence + critique + evidence). Critics emit **evidence only** — they never pick winners. | `CriticGauntletPanel` (rows of `ReviewRow`), critic nodes |
| **Held-out Judge** | A **frozen, separate** judge outside the breeding loop that applies a **fixed rubric** to decide "gen N+1 beats gen N." It is **immutable to the agents** — the bedrock anchor the organism cannot game. This is the credibility floor. | `FitnessBreakdown` (its acceptance score), **S5** proof |
| **Fitness** | The decomposed score for a candidate: `{ total, components{}, policyVersion, explanation }`. Components include critic scores, check results, novelty, energy efficiency, and the held-out judge's acceptance score. **Always show the breakdown, never a bare number** — defensibility lives here. | `FitnessBreakdown`, `FitnessOverTimeChart` |
| **Novelty** | An anti-collapse signal: how semantically different a candidate is from others (embedding cosine distance). Prevents the population from converging on one idea. Shown as a **meter**, not just a hue. Can be **degraded** (estimated/absent) and must say so. | `NoveltyMeter`, `FitnessBreakdown` component |
| **Energy** | The metabolic budget, in one integer unit (`doppl_energy`). Agenomes **spend** it generating, calling tools, and spawning. Rendered as **light/charge that drains.** It's both a hard cap (run can't exceed budget) and a fitness component (efficiency). | `EnergyMeter` (per-agenome), `RunEnergyGauge` (run budget), `ActivityTicker` |
| **Fusion** | **Two-parent reproduction.** Two strong agenomes combine (crossover of prompts/personas/tools + output-level synthesis) into a child. **Fusion prefers distant lineages** (anti-collapse). The signature "breeding" moment — visually, **two edges converge into one child.** | fusion edges in `LineageGraph`, `LineagePathTrace`, **S4** parentage |
| **Mutation** | A child agenome's traits change within allowed bounds. The other half of reproduction. Visually a **shimmer / amber accent** on the new node. | `mutated` status, `LineageGraph`, `AgenomeInspector` |
| **Cull** | Removing weak lineages from contention. A culled agenome/candidate **goes dark and visually sinks/fades** — it's clearly _gone_, but stays in the tree as ancestry. Death is part of the story. | `lineage.culled`, `StatusBadge` culled state, `LineageGraph` |
| **Lineage** | The family/population tree itself: generations as tiers, agenomes within, candidates they produced, critics/checks/scores hanging off candidates, and **fusion edges crossing between parents and children.** The organism made visible. | **`LineageGraph`** (React Flow) — the heart of **S2** |
| **Replay** | Re-watching a recorded run reconstructed purely from the persisted event log — **no fresh model calls.** Same panels as live, plus time-travel controls (play/pause/seek/speed). The demo's safety net. Must be **unmistakably** marked as not-live. | **S6 · Replay Mode**, `ReplayScrubber`, `ModeBanner` |

### A few supporting terms you'll also hit

| Term | Quick gloss |
|---|---|
| **Check** | An objective, subtype-specific validation that `passed` / `failed` / `skipped (+reason)`. Non-executing for MVP except allowlisted ones (the live transfer check). `SubtypeCheckPanel`. |
| **Subtype** | Which of the two kinds a candidate is: `cross_domain_transfer` or `zeitgeist_synthesis` (§3). |
| **Caps** | Hard limits on a run: population, generations, energy budget, spawn depth, tool calls, wall-clock. **Enforced by the runtime, never by prompt; agents can't raise them.** `CapsControl` with hard-max. |
| **Eligible parent** | An agenome whose candidate reached a fitness score — it can now be selected to reproduce. A status worth highlighting (★). |
| **Event log** | The append-only source of truth. Everything the UI shows is a **projection** of it. The UI never writes to it. |
| **SSE** | The live event stream the dashboard subscribes to. Drives all the liveness in S2. Resumes from `lastEventId` on disconnect. |
| **Projection** | A derived read model (e.g. `LineageGraphProjection`) built from the event log up to a `sequenceThrough` high-water mark. What the UI actually binds to. |
| **Operator** | The single human who configures/starts/stops a run and drives the demo. Power user. (USERS.md primary user.) |
| **Reviewer** | The read-only showcase audience judging credibility. Cannot mutate anything. (USERS.md secondary user.) |

---

## 8. The screen map at a glance

Full specs live in [`03-screens/`](03-screens/); here's the orientation. The Inspectors (S3/S4) are **overlays** on S2/S6, not separate pages; S6 reuses S2's layout reskinned for replay.

```
 S0 · Runs Home ───"New Run"──► S1 · Run Launcher ──Start──► S2 · Organism View (LIVE)
      │                                                            │   ▲
      │                                                            │   │ drill in
      └──"Replay" a completed run──► S6 · Replay Mode             ▼   │
                  (= S2 layout + persistent REPLAY banner    S3 · Candidate Inspector (drawer)
                     + ReplayScrubber)                       S4 · Agenome Inspector   (drawer)
                                                                    │
                                              run completes / "see winner"
                                                                    ▼
                                                         S5 · Final Idea / Payoff
                                                    (the money shot: winner + replayable
                                                     gauntlet + live/replay-backed check
                                                     + gen-0 → winner improvement summary)
```

| ID | Name | One-line role | Audience |
|---|---|---|---|
| **S0** | Runs Home | Entry; list live + completed runs; "New Run"; enter Replay. | Operator |
| **S1** | Run Launcher | Configure + start: prompt source, subtype toggles, safe-caps (hard-max), model profile, scoring policy. | Operator |
| **S2** | Organism View | **The heart.** Live observatory: `LineageGraph` center, surrounded by header, timeline, fitness chart, energy, activity ticker, best-so-far. SSE-driven. | Both |
| **S3** | Candidate Inspector | Drawer over S2/S6: one candidate's full evidence (payload, gauntlet, checks, novelty, fitness, energy, lineage, traces). | Operator (shown to reviewers) |
| **S4** | Agenome Inspector | Drawer over S2/S6: one genome (prompt, weights, tools, policy, budget, parentage, energy, candidates, status). | Operator |
| **S5** | Final Idea / Payoff | The showcase money shot: winner + replayable gauntlet + executable/replay-backed check + gen-0→winner summary. | Both (climax) |
| **S6** | Replay Mode | S2 reskinned: persistent REPLAY banner + `ReplayScrubber` (play/pause/seek/speed); reconstructed from the event log. | Both |

---

## 9. Non-negotiables (carry these into every screen)

A short list of constraints that override aesthetic preference. Violating any of these breaks the product, not just the polish.

1. **Live vs. Replay is unmistakable at a glance** — persistent `ModeBanner`, distinct treatment, never ambiguous on a projector.
2. **Status is encoded by shape + icon + label + color** — never color alone (colorblind-safe, projector-legible). See [`05-status-encoding.md`](05-status-encoding.md).
3. **The generational story is the hero** — the climb and the bred-from-survivors relationship must be impossible to misread as a one-round tournament.
4. **Every claim drills to real evidence** — no bare scores; defensibility is one click away.
5. **The UI never mutates authoritative state** except via the two POST commands (start/stop). It is a window, not a control panel.
6. **Liveness is meaningful, not decorative** — spawn/spend/die/fuse/climb are real signals; respect `prefers-reduced-motion` (meaning survives without motion).
7. **Operator control + reviewer read-only** — reviewers can inspect everything but mutate nothing.
8. **Degraded states are first-class** — novelty-degraded, Langfuse-off, provider-failure, all-culled all have honest, designed states. The system tells the truth when something is off.

> Next read: [`01-personas-and-jobs.md`](01-personas-and-jobs.md) for who we're designing for and the jobs each screen must do, then [`02-information-architecture.md`](02-information-architecture.md) for how the screens fit together.
