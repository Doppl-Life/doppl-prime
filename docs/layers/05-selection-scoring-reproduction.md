# Selection, Scoring & Reproduction

## Executive summary

This layer is the "classical-ML half" of the organism: once the LLM agents have produced candidate ideas and the verifier council + held-out judge have measured them, *this* layer decides which lineages survive and how the next generation is bred. It does three things. **Scoring** turns five separate measurements — critic scores, subtype-check pass rate, novelty, energy efficiency, and the held-out judge's acceptance — into one policy-versioned `FitnessScore` number on a common 0–1 scale. **Novelty** embeds each candidate's summary into a vector and measures how different it is from everything seen before, creating anti-collapse pressure so the population doesn't converge on one idea. **Reproduction** culls the weakest lineages, then breeds the survivors via two-level fusion (gene-splice + an LLM that synthesizes two parents' prompts) plus bounded mutation, preferring to mate *distant* lineages.

The layer is deliberately not in charge of anything authoritative about lifecycle. It computes numbers and *proposes* — it never moves the held-out judge's score (it reads acceptance verbatim, safety rule #6), never raises a population cap (it clamps to the kernel's headroom, rule #1), and never re-runs an LLM on replay (all randomness and provider outputs are persisted, rule #7). The kernel owns state transitions, energy, and seeds; this layer hands back populations and emits domain events through an injected append port. Three thin "seams" (`createScoreSeam`, `createReproduceSeam`, `createSuccessorThreading`) wire its pure functions into the P3 generation loop.

**The "climb" mechanics (newer).** A stack of selection pressures was added to make each generation's best fitness reliably beat the last. **Elitism** carries the top-K survivors *unchanged* into the next generation (default 1, ON). A **truncation cull** kills at least the weakest ⅓ of lineages every generation (ON), so weak ideas reliably die and the population converges. **Directed reproduction** reads the held-out judge's weakest axis for a parent and rewrote the fusion prompt from "merge the two parents" to "out-perform both and repair the weakness." An optional **convergence controller** dials mutation *up* when the population is stuck and *down* when a lineage is clearly winning. Honest framing: for the current test problem these mechanisms *hold the peak* (they cut the peak-to-final fitness drop from 0.030 to 0.006) rather than climb past a ceiling — the climb is **ceiling-bound, not algorithm-bound** (the hand-crafted best answer caps near ~0.74). The companion **ratchet / hall-of-fame champion** lives in the runtime loop ([03](03-runtime-kernel.md)) and defaults OFF.

## Responsibilities

- **Compute the decomposed fitness score** — normalize five components to [0,1], weight them by an immutable `ScoringPolicy`, and emit one `fitness.scored` per candidate (`apps/api/src/selection/fitness/score-fitness.ts:136`).
- **Compute novelty** — embed a candidate summary (the only gateway call in scoring), cosine-compare against prior candidates, emit `novelty.scored`; degrade to a deterministic lexical method on embed failure (`apps/api/src/selection/novelty/score-novelty.ts:73`).
- **Cull weak lineages** — relative-to-generation threshold with a hard population floor, emitting at most one `lineage.culled` (`apps/api/src/selection/cull.ts:97`).
- **Breed the next generation** — heuristic allocation of spawn slots, two-level fusion (crossover + output synthesis), bounded mutation, distant-lineage preference (`apps/api/src/selection/successor.ts:98`, `reproduction/fuse.ts:139`, `reproduction/mutate.ts:142`).
- **Provide a replay reconstructor** — rebuild every bred child from its persisted `ReproductionEvent`, with no gateway and no RNG (`apps/api/src/selection/reproduction/reproduce.ts:100`).

What it is **NOT** accountable for:
- It does **not** judge or re-score candidates against the rubric — it *consumes* `JudgeResult.acceptance` verbatim (rule #6).
- It does **not** own lifecycle/state/energy/seeds/generation-minting — those are the kernel's (LESSONS §77). It returns populations + flags; the kernel transitions agenome status and debits energy.
- It does **not** enforce caps — it emits clamped *hints*; the kernel is the authoritative enforcer (rule #1, LESSONS §80).
- It does **not** import a provider SDK — only the `ModelGateway` port (rule #9, LESSONS §9-equivalent forbidden-pattern #2).
- It emits **no** `energy.spent` event — its operation-start markers are no-debit (rule #8).

## Key components

| Component | What it does | Where |
|-----------|--------------|-------|
| `scoreFitness` | Composes the 5 normalized components under the immutable policy → one `fitness.scored`; the normalized weighted *average* (the "scale fix") | `apps/api/src/selection/fitness/score-fitness.ts:136` |
| `applyScoringPolicy` | Pure weighted-sum core: `Σ wₖ·valueₖ` + recognized-weight divisor; throws on unsupported `normalization` | `apps/api/src/selection/fitness/policy.ts:32` |
| `judgeAcceptance` | Reads `JudgeResult.acceptance` verbatim (rule #6); enforces the full-5-axis + `immutableToAgents` load gate | `apps/api/src/selection/components/judge-acceptance.ts:88` |
| `criticScores` / `energyEfficiency` | Numeric-only aggregates of persisted reviews / energy events (never read text) | `apps/api/src/selection/components/critic-scores.ts:50`, `energy-efficiency.ts:21` |
| `scoreNovelty` | Embed → cosine vs priors → `novelty.scored`, or lexical degrade → `novelty_scoring_degraded` | `apps/api/src/selection/novelty/score-novelty.ts:73` |
| `cull` | Relative `mean − k·stddev` cull with a `minSurvivors` floor → at most one `lineage.culled` | `apps/api/src/selection/cull.ts:97` |
| `fuse` / `applyFusion` | Two-level fusion (crossover + gateway synthesis); replay rebuilds bit-exact from the event | `apps/api/src/selection/reproduction/fuse.ts:139` |
| `mutate` / `applyMutation` | Bounded trait perturbation; live persists outcomes, replay re-applies them (no RNG) | `apps/api/src/selection/reproduction/mutate.ts:142` |
| `assembleSuccessor` | Heuristic allocation → anchored per-slot `reproduce`; anti-extinction fallback | `apps/api/src/selection/successor.ts:98` |
| `allocate` | `fitness × novelty × energy-efficiency` weights → integer spawn slots (largest-remainder) | `apps/api/src/selection/allocation.ts:28` |
| `createScoreSeam` / `createReproduceSeam` / `createSuccessorThreading` | Wire the pure fns into the P3 loop's injected ports | `apps/api/src/selection/seams/{score-seam,reproduce-seam,successor-threading}.ts` |

## Interfaces & contracts

**Frozen contracts consumed/produced** (all from `@doppl/contracts`, never redefined — LESSONS §5):

| Contract | Role here |
|----------|-----------|
| `FitnessScore` `{id, candidateId, total, components, policyVersion, explanation}` | **Produced** by `scoreFitness` → `fitness.scored`. `policyVersion` binds each score to its exact policy (rule #6). |
| `ScoringPolicy` `{version, weights, normalization?}` | **Injected** immutable input; `weights` is an open name→number record (the only deferred-open contract values). |
| `NoveltyScore` (9-field, requires `vector`+`embeddingModelId`+`dimension`) | **Produced** by `scoreNovelty` → `novelty.scored` (happy path only). The required vector is the rule-#7 replay home. |
| `JudgeResult` (`acceptance`, `axisScores`, `rubricPolicyVersion`) | **Consumed** verbatim by `judgeAcceptance` via candidateId join. Never produced here — that's the verifier's. |
| `FinalJudgeRubric` (`axes`, `weights`, `policyVersion`, `immutableToAgents`) | **Injected**; the load gate asserts full-5-axis set + `immutableToAgents===true`. |
| `CullingEvent` (`targetIds`, `reason`, `scoreSnapshot`) | **Produced** by `cull` → `lineage.culled` (explicit `.parse` — not high-traffic). |
| `ReproductionEvent` (`mode`, `crossoverPoints`, `mutationSummary`) | **Produced** by fusion/mutation → `agenome.fused` / `agenome.reproduced`. The persisted RNG outcomes are the rule-#7 replay home. |
| `Agenome` (11-field child genome) | **Produced** as bred children (validated via `Agenome.parse`). |

**The injected ports (runtime seams)** — defined in the kernel, implemented here:
- `ScoreSeam = (candidates, ctx) => Promise<void>` (`apps/api/src/runtime/loop/generationLoop.ts:171`) — `ctx` carries `{runId, generationId, append}`.
- `ReproduceSeam = (ctx) => Promise<void>` (`generationLoop.ts:172`) — `ctx` additionally carries `parents`, `scoredEvents`, the kernel-computed `spawnBudget` (rule #1 clamp bound, `generationLoop.ts:162`), and an unused `outcomes` source.
- `nextPopulation(args) => readonly Agenome[]` hook (`generationLoop.ts:214`) — args carry `{completedGenerationId, eligibleParents, log, maxPopulation}`.

**The emit seam** — `SelectionEmitter` (`apps/api/src/selection/reproduction/degenerate.ts:29`) is exactly `Omit<RunEventEnvelope, 'sequence' | 'occurredAt'>` → `{sequence}`, structurally identical to `EventStore.append` (LESSONS §20/§81). Every event leaves this layer through it — never a direct event-table write (rule #2/#4).

**Expects from others:** the verify seam has already appended `critic.reviewed` / `check.completed` / `judge.reviewed` / `energy.spent` for each candidate *before* the score seam runs; the score seam reads them back from the log (`apps/api/src/selection/seams/score-seam.ts:82`).

## Data & state

This layer holds **no persistent state of its own** — all state lives in the append-only `run_events` log and is read back via `readByRun`. The only in-memory state is per-call working data.

Key data structures:
- **`FitnessScore.components`** — an open `name→number` record carrying the five *normalized* signals under the keys `novelty`, `energy_efficiency`, `critic_scores`, `subtype_check`, `judge_acceptance` (`apps/api/src/selection/fitness/policy.ts:60-64`). Persisting the normalized values makes `total` reconstructable from the score alone.
- **`fitness.scored ↔ novelty/judge` linkage** — by `candidateId` join + the named `components.novelty` / `components.judge_acceptance` signals, *never* a duplicate authoritative copy (`novelty.scored` and `judge.reviewed` remain the authoritative homes — LESSONS §13).
- **`ReproductionEvent.mutationSummary`** — a `record<string, string|number|boolean>` holding every RNG outcome (per-key persona deltas, spawnBudget delta, tool toggles, crossover choices, and for fusion the synthesis output + child generation id). This is what replay reads instead of re-sampling.
- **In-seam novelty accumulator** — the cosine comparison set is built up live as each candidate scores (`apps/api/src/selection/seams/score-seam.ts:88`), so candidate N is compared against candidates 1..N-1 of this generation.

Events this layer emits: `novelty.scoring_started`, `novelty.scored`, `novelty_scoring_degraded`, `fitness.scored`, `lineage.culled`, `fusion.started`, `agenome.fused`, `agenome.reproduced`, `reproduction_aborted_insufficient_parents` — all with `actor: 'selection_controller'`.

## Dependencies

- **Depends on** `packages/contracts` (frozen Zod models — the only domain types it knows) and the `ModelGateway` *port* (`apps/api/src/model-gateway/port.ts`, re-exported at `model-gateway/index.ts:8`) for the `embedding` and `fusion_synthesis` roles. It depends on the **runtime** only for *type* surfaces it implements (`ScoreSeam`, `ReproduceSeam`, `NextPopulationArgs`, `clampSpawnBudget`) and reads the persisted log via the `EventStore` port's `readByRun` — never a provider SDK, never a projection (rule #9, LESSONS §9 forbidden-pattern #2). See `apps/api/CLAUDE.md` layer-direction: `selection → runtime → {event-store, model-gateway(port)} → contracts`.
- **Used by** the **runtime kernel's generation loop**, which injects the three seams and calls them in order: verify → **score** → cull (inside score) → **reproduce** → **successor-threading**. The boot root (`main.ts`) wires the real seams and single-sources one immutable judge rubric to both the verifier and selection so the candidateId-join policyVersions match (ARCHITECTURE.md §8 "Boot composition").

## How it works (flow)

```
 P3 generation loop (per generation)
   │
   ├─ verify seam  (not this layer — appends critic.reviewed / judge.reviewed / energy.spent)
   │
   ├─ SCORE SEAM  createScoreSeam            score-seam.ts:72
   │    read persisted evidence ONCE  ───────────────► readByRun     :82
   │    for each candidate:
   │      scoreNovelty  ─embed(gateway)─► cosine vs priors ─► novelty.scored  score-novelty.ts:73
   │        └ embed fails ► lexical jaccard ► novelty_scoring_degraded
   │      compose 5 components (energyEff, criticScores, judgeAcceptance, subtype, novelty)
   │      scoreFitness  ─► normalized weighted average ─► fitness.scored        score-fitness.ts:136
   │    after all candidates:
   │      cull  ─► mean−k·stddev w/ floor ─► (≤1) lineage.culled                cull.ts:97
   │
   ├─ REPRODUCE SEAM  createReproduceSeam     reproduce-seam.ts:136
   │    projectSuccessorParents (best-candidate weights from log)               :66
   │    remainingPopulation = min(ctx.spawnBudget, maxPopulation)  ◄ rule #1    :145
   │    assembleSuccessor:                                                      successor.ts:98
   │      allocate (fitness×novelty×energyEff → integer slots)                  allocation.ts:28
   │      per slot: reproduce([anchor, mostDistantPartner])                     reproduce.ts:58
   │        ≥2 distinct ► fuse (crossover + gateway synthesis) ► agenome.fused  fuse.ts:139
   │        1 distinct  ► mutate ► agenome.reproduced                           degenerate.ts:50
   │        0 distinct  ► reproduction_aborted_insufficient_parents             degenerate.ts:83
   │
   └─ SUCCESSOR THREADING  nextPopulation hook   successor-threading.ts:61
        applyReproduction(pool, event) per agenome.fused/reproduced  ◄ no rng/gateway (rule #7)
        rehome to gen N+1 (status 'seeded', spawnBudget clamped)               :47
        ► loop clamps the returned set to maxPopulation
```

**Scoring math (the "scale fix").** Each component is brought onto [0,1] *before* weighting (`apps/api/src/selection/fitness/score-fitness.ts:146-152`): novelty/energy/subtype are already 0–1; the held-out judge's raw 0–`maxValue` acceptance is divided by `maxValue` (`judgeEntry`, `score-fitness.ts:115`) and the unbounded critic magnitude by `CRITIC_SCORE_MAX=5` (`criticEntry`, `score-fitness.ts:128`), both clamped. Then `total = Σ wₖ·normₖ / Σ wₖ` — a normalized weighted *average* in [0,1] (`score-fitness.ts:175`). The divisor only counts weights for *produced* components (`policy.ts:53`) so a never-emitted signal doesn't deflate the mean. A zero weight-sum maps to a defined 0, never a NaN (`score-fitness.ts:175`).

**Novelty = 1 − max similarity** (`apps/api/src/selection/novelty/cosine.ts:40`) — nearest-neighbour distance. First candidate (empty comparison set) → 1.0 (maximally novel). A zero-norm vector → similarity 0, never NaN (`cosine.ts:29`).

**Cull is relative, with a floor.** An agenome's lineage strength is its best candidate's `total`; it's culled when that best is strictly below `mean − k·stddev` of the generation's best-total distribution (`apps/api/src/selection/cull.ts:121`). The cull is clamped so at least `minSurvivors` eligible agenomes remain (`cull.ts:139`) — the organism must survive to breed (fusion needs ≥2 parents). Terminal/unscored agenomes are skipped (`cull.ts:84`); nothing culled → no event (`cull.ts:150`).

**Reproduction dispatches by distinct-parent count** (`apps/api/src/selection/reproduction/reproduce.ts:58`): ≥2 → fusion, exactly 1 → mutation-only, 0 → abort. Two references to the same id count as one parent (no self-fusion, `reproduce.ts:46`).

## Design decisions & rationale

- **Decomposed, policy-versioned fitness** (ARCHITECTURE.md §8). Rather than one opaque score, fitness is a transparent weighted average of named components, each persisted, each explained in `FitnessScore.explanation` (`score-fitness.ts:207`). Every selection decision is "explainable from persisted events" (§8). The policy's numeric weights are deliberately deferred-open in the contract — structure frozen, values tunable.
- **The normalized-average over a raw weighted sum** is a corrected design (the "scale fix" noted throughout `score-fitness.ts`): a raw 0–25 judge metric summed with 0–1 components would dominate. Normalizing first keeps the judge a comparably-weighted anchor, not a decorative term (rule #6).
- **App-level cosine day-one** (§8) — MVP scale is tiny, so novelty compares in-process; pgvector indexing is a deferred optimization layered on the authoritative event-stored vectors. Learned bandit/RL allocation and a learned value model are explicitly **out of scope** (REQ-DEF-010); allocation is the heuristic `fitness × novelty × energy-efficiency` (`allocation.ts:35`).
- **Two-level fusion + distant-lineage preference** (§8, REQ-F-010). Crossover splices structured traits deterministically; output synthesis is an LLM merge of two parents' prompts. Fusion prefers the most-distant eligible pair (`selectDistantPair`, `parent-distance.ts:37`) as an explicit anti-collapse force. A rejected synthesis output gracefully degrades to crossover-only (`fuse.ts:183`), mirroring the novelty degrade.
- **Replay-split pattern** (LESSONS §75): every stochastic/provider op has a `live` path that persists outcomes and an `apply*` path that reconstructs zero-RNG / zero-gateway — structurally (no gateway parameter in the replay signature). `fuse`/`applyFusion` and `mutate`/`applyMutation` share one reconstructor each so live and replayed children are identical by construction.
- **Anti-extinction fallback** (`successor.ts:137`) was added after a live demo-blocker: a non-empty pool whose heuristic weights all collapsed to zero (e.g. every parent's novelty degraded) would produce zero offspring *and* zero events — a silent extinction. The fallback anchors the single best parent for one slot.

## Safety & invariants

- **Rule #6 (held-out judge immutable; scoring policy-versioned).** Mechanism: `judgeAcceptance` reads `JudgeResult.acceptance` *verbatim* and never re-derives it from `axisScores` (`apps/api/src/selection/components/judge-acceptance.ts:127` + the doc-comment at `:38`). The component carries no rubric/weights/override field and exposes no path to invoke or mutate the judge. The acceptance reaches fitness only by `candidateId` join (`score-seam.ts:126`). Additionally, the **load gate** `assertImmutableRubricLoaded` (`judge-acceptance.ts:61`) enforces the two properties the Zod schema can't (LESSONS §17/§40): the full 5-axis set (`FinalJudgeAxis.options` completeness) and `immutableToAgents===true`, failing *closed* (throws) on a misconfigured anchor. `scoreFitness` binds `policyVersion = policy.version` (`score-fitness.ts:184`) — each score is forever tied to its exact immutable policy. The fitness components read **only numbers**, never candidate/critic free-text (`critic-scores.ts:56` reads `scores`/`confidence` only — LESSONS §78), so text can never move a fitness component (rule #5/#6 alignment).
- **Rule #7 (replay calls no providers).** Mechanism is *structural*, not guarded. The scoring math (`cosine.ts`, `lexical-fallback.ts`) and the cull are pure with no gateway/RNG/clock in scope — replay re-derives novelty by reading the *persisted* `NoveltyScore.vector` back through the same functions (`cosine.ts:5` doc). For reproduction, every RNG outcome is captured in the frozen `ReproductionEvent` (`crossoverPoints` + `mutationSummary`); `applyFusion` (`fuse.ts:234`) and `applyMutation` (`mutate.ts:159`) take **no gateway parameter** — re-sampling is impossible, not flag-guarded (LESSONS §47/§75). The `reproduce` seam takes an **injected per-run numeric seed** (`reproduce-seam.ts:34`), distinct from the kernel's OutcomeSource — the seed only re-derives the *live* stream; replay reads outcomes.
- **Rule #1 (caps kernel-enforced, never raised).** Mechanism: `allocate` normalizes weights into the remaining-population headroom and never raises it (`allocation.ts:11` doc); the reproduce seam clamps to `min(ctx.spawnBudget, maxPopulation)` (`reproduce-seam.ts:145`); mutation's `spawnBudget` stays a non-negative-int hint clamped non-negative (`mutate.ts:91`); successor-threading clamps each child via the kernel's single-source `clampSpawnBudget` (`successor-threading.ts:57`). Selection *proposes*; the kernel bounds (LESSONS §80).
- **Rule #8 (energy = successful productive spend only).** Mechanism: this layer emits **no** `energy.spent` — its operation-start markers (`novelty.scoring_started`, `fusion.started`) carry generic payloads and no debit (`score-novelty.ts:80`, `fuse.ts:145`). `energyEfficiency`'s input is typed `EnergyEvent[]`, which has no failure member, so failed attempts contribute zero *structurally* (`energy-efficiency.ts:8` doc).
- **Rule #2/#4 (append-only via the writer; redaction at the boundary).** Mechanism: every event leaves through the injected `SelectionEmitter`/`ctx.append` — never a direct `run_events` write. Non-high-traffic events (`lineage.culled`, `agenome.fused`, `agenome.reproduced`) are validated with an explicit `.parse` before emit (`cull.ts:154`, `fuse.ts:204`) because the append path's `validateEventPayload` falls to the generic schema for them.
- **Rule #5 (model output untrusted; candidate text is data).** Mechanism: the fusion synthesis call passes parent prompts as sentinel-wrapped DATA via the frozen `wrapUntrusted` in a *user* message, with the instruction in the *system* message — never interpolated (`fuse.ts:160-172`). The synthesis output is untrusted until `SynthesisSchema.safeParse` passes; a rejected output is discarded, never persisted (`fuse.ts:183`).

## Gotchas & sharp edges

- **JSONB drops key order — provenance must be canonicalized.** `mutate`'s `mutationSummary` round-trips through Postgres `jsonb`, which does not preserve object key order. `reconstructChild` therefore builds `mutationMeta` from a **sorted-key** view (`mutate.ts:112-121`) so `applyMutation(persisted)` matches `applyMutation(live)` — otherwise state-equivalence breaks for every mutated child (LESSONS §83). `fuse.ts` uses fixed-order `FUSED_FIELDS` for the same reason.
- **Degraded novelty: value vs vector come from different sources.** The reproduce seam reads the novelty *value* from `fitness.scored.components.novelty` (populated on **both** happy and degrade paths), but the embedding *vector* only from `novelty.scored` (happy path only) (`reproduce-seam.ts:66` doc). This is a corrected demo-blocker: sourcing the value from `novelty.scored` zeroed a degraded parent's allocation weight and, when *all* parents degraded, collapsed the pool to zero spawns — a silent extinction (`reproduce-seam.ts:58-64`).
- **`spawnBudget` source bug, now fixed.** The reproduce seam clamps to `ctx.spawnBudget` (kernel-computed `min(maxPopulation, remaining-energy headroom)`), **not** its own raw `maxPopulation` (`reproduce-seam.ts:140` comment, "BUG 1 (run 6b714273)"). The old behavior minted a fresh full-cap batch every generation (runaway growth). `deps.maxPopulation` is now only a belt-and-suspenders ceiling.
- **`allocate` builds an `order` array but its mutation is incidental.** `allocate` sorts a copy by remainder and increments `order[i].spawns` for leftovers (`allocation.ts:62-64`), but `order` holds references to the same slot objects, so the increment lands on `slots`; the return then looks up `slots` by id (`allocation.ts:67-70`). Correct, but the double-structure is non-obvious.
- **Fail-loud replay integrity.** `reconstructFusedChild` throws on a corrupted/tampered persisted event (missing `childGenerationId` / `synthesisOutput`) rather than coercing `String(undefined)` into the child (`fuse.ts:109-118`, LESSONS §76). `successor-threading` throws on a `completedGenerationId` not matching the loop's `<runId>-gen<N>` scheme (`successor-threading.ts:31`) rather than mis-homing a child.
- **The score seam's `rows` snapshot predates its own `novelty.scored` emits** — intentional. The cosine comparison set accumulates in-seam (`score-seam.ts:80-88`); a future component reading this generation's novelty from `rows` would miss it and need its own post-loop re-read.
- **Successor threading uses two id derivations.** It reconstructs children from the *current* generation's reproduction events but re-homes them to gen N+1 via a regex on the generation-id string (`successor-threading.ts:25`). This couples selection to the kernel loop's id convention; the fail-loud guard catches drift.
- **UNVERIFIED:** the energy-efficiency `value = 1/(1+spend)` creates a "do-nothing → max efficiency" incentive; the code comment says this is "mitigated downstream — P5.6 combines efficiency with achievement" (`energy-efficiency.ts:13`), but I did not find a test asserting that a zero-spend candidate cannot win on efficiency alone — it relies on the policy weights, which are deferred-open.
- **No DRIFT found** between ARCHITECTURE.md §8 and the code. The arch wiring note (§8, P5↔P3) describes the three seams, the score-path order, the injected seed, and the caps-clamp exactly as implemented. The one nuance the arch glosses: §8 says reproduce "allocates (caps-clamped hint)" using `maxPopulation`, but the code now clamps to the tighter `ctx.spawnBudget` (a strengthening, not a contradiction — documented in the bug comment).

## Connects to

- **[00-contracts-event-model.md](00-contracts-event-model.md)** — every type here (`FitnessScore`, `NoveltyScore`, `ReproductionEvent`, `CullingEvent`, `JudgeResult`, `Agenome`, `ScoringPolicy`, `FinalJudgeRubric`) is a frozen contract imported from `@doppl/contracts`.
- **[01-persistence-event-store.md](01-persistence-event-store.md)** — reads evidence back via `readByRun`; emits through `EventStore.append` (the `SelectionEmitter` shape). All events land in the append-only `run_events` log.
- **[02-model-gateway-providers.md](02-model-gateway-providers.md)** — the only provider contact: the `embedding` role (`embed`, `novelty/embed.ts:34`) and the `fusion_synthesis` role (`fuse.ts:160`).
- **[03-runtime-kernel.md](03-runtime-kernel.md)** — the kernel's generation loop injects the three seam ports and the `nextPopulation` hook, owns lifecycle/state/energy/seed/generation-minting, and clamps the populations this layer proposes. Handoff points: `ScoreSeam`/`ReproduceSeam`/`NextPopulationArgs` (`generationLoop.ts:171-214`), `clampSpawnBudget`.
- **[04-verifier-council-checks.md](04-verifier-council-checks.md)** — produces the `critic.reviewed` / `check.completed` / `judge.reviewed` events this layer consumes as fitness components (the verify seam runs before the score seam).
- **[06-projections-read-models.md](06-projections-read-models.md)** — folds this layer's `fitness.scored` / `novelty.scored` / `lineage.culled` / reproduction events into the lineage graph and current-state projections.
- **[10-cross-cutting-safety.md](10-cross-cutting-safety.md)** — the home of safety rules #1, #2, #4, #5, #6, #7, #8 this layer enforces.
- System spine: [OVERVIEW.md](OVERVIEW.md).
