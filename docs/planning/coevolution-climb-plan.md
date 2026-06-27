# Coevolution Climb — implementation plan (two-channel reproduction dynamics)

> **One-line goal:** make each generation's best *held-out-judge* fitness reliably beat the last and surface
> the single best-quality winning idea — by treating reproduction (genetic) and the knowledge base (cultural
> / stigmergic) as **two coordinated optimizers**, and by steering every explore/exploit decision off the one
> signal agents cannot game (the held-out judge), not the blended `total`.
>
> **This doc is the durable resume surface for this work.** It is written to survive multiple sessions and
> context compactions. On resume: read §0 (resume pointer) → §10 (progress tracker) → the active phase in §6/§7.
> Sibling/precursor doc: [`evolution-climb-plan.md`](./evolution-climb-plan.md) (Wave 1/2 + the ratchet, and
> the **CLIMB REFRAME** — read §3.4 here for why that matters). KB design: [`shared-knowledge-space.md`](./shared-knowledge-space.md).

---

## 0. RESUME POINTER (update this every session)

- **Status:** PLAN AUTHORED. **Phase A code-complete + green (A1+A2+A3); awaiting PR/merge.**
- **Date authored:** 2026-06-27.
- **Branch/PR state:** work lands to `main` via GitHub PRs (NEVER `git push origin main`; the team uses PRs —
  branch off `main` → push branch → `gh pr create --base main` → user merges). Ask before any push. **Active
  branch: `feature/coevolution-phase-a-honest-gate` (off `main`); A1 = `41afe08`, A2+A3 next commit. NOT pushed.**
- **Where we are:** Phase A code-complete + green; **PR #15 open to `main`** (awaiting merge). D1 DECIDED:
  weak-seed demo + harder-problem `/eval`. **Next concrete step (the "Headroom Gate" — must pass before Phase
  B/C): (1) build the weak-seed capability ("give the climb room"), (2) run a live headroom check on a weak
  seed with the Phase-A stack to confirm the bounce shrinks AND a real climb exists to couple for.** Only if
  the climb is real do we proceed to Phase B/C. See §6 "Headroom Gate" + §8.
- **Driver:** user/Michael makes the load-bearing calls (default cadence, eliteCount, headroom/problem choice).

---

## 1. The goal and the two-channel framing

**Goal (user's words):** increase fitness over generations to surface the best-quality winning idea.

**The reframe that drives the whole design:** Doppl is not one optimizer with a mutation knob. It is **two
optimizers stacked on the same population**:

1. **Genetic (Darwinian)** — mutation + fusion rewrite the *genome* (persona weights, tool permissions);
   traits are inherited child←parent. Controlled by the mutation strategy + elitism + the hall-of-fame ratchet.
2. **Cultural (Lamarckian / stigmergic)** — at generation time an agenome *retrieves prior agents' research
   notes* from the KB and ideates with them as background DATA. A good "trail" spreads across the population
   **without anyone breeding**. Steered by the `generationBias` near/far dial (near = follow the trail /
   exploit; far = anti-retrieve / explore).

Today these channels **share no state** (the genetic controller reads `noveltySpread`; the cultural channel
reads a static `generationBias` scalar set once at boot). So they can accidentally *both exploit* (genes
converge + near-retrieval → premature inbred collapse) or *both explore* (mutation burst + far-retrieval →
nothing consolidates before the energy cap). **The central thesis of this plan: coordinate the two channels so
the organism always exploits in one while exploring in the other, and gate every "commit to exploit" decision
on the held-out judge.**

---

## 2. Safety invariants that bound ALL work here (non-negotiable)

Every change in this plan must preserve these. They are the reason several "obvious" shortcuts are off-limits.

- **Rule #6 (anti-reward-hacking):** the held-out judge, its rubric (`final-judge-mvp-3`), and the scoring
  policy (`mvp-2`) are **immutable to agents**. We may *read* `judge_acceptance` (a persisted fitness
  component) to steer dynamics; we may **never** let any agent move/swap the judge, and nothing may read
  candidate/critique TEXT into a score. Judge runs outside the breeding loop; excluded from per-run model overrides.
- **Rule #7 (replay):** every new dial must be a **pure function of already-persisted values** (genIndex,
  persisted `fitness.scored.components`, persisted novelty vectors, the persisted note-id set + note-fold,
  persisted retrieval direction). No live/clock/RNG read that isn't persisted. The per-slot reproduction
  decision stays recorded in `ReproductionEvent.mode`; retrieval direction stays persisted on
  `candidate.generation_started` (lesson §107). **Target: no `CURRENT_SCHEMA_VERSION` bump** — everything we
  need is already in the log. Pin with a replay-equivalence test (lesson §55).
- **Rule #1 (caps kernel-enforced):** mutation/fusion/offspring counts and energy stay kernel-bounded. New
  dials are HINTS clamped by the kernel; they never raise a cap.
- **Rule #2 (append-only log authoritative):** projections derived, never authoritative; emit only via the
  append path / seam `ctx.append`.
- **Rule #5 (candidate text is DATA):** retrieved notes + candidate text reach the model only as
  sentinel-wrapped DATA, never instructions.

---

## 3. The grounded problem (what's actually blocking the climb)

### 3.1 The fitness formula (what we're climbing)
`FitnessScore.total` ∈ [0,1] = normalized weighted average over 5 components (`selection/fitness/`):

| component | wired weight (`mvp-2`) | rewards | agent-visible? |
|---|---|---|---|
| `judge_acceptance` | **3** (≈46%) | held-out judge quality | **NO** (the un-hackable anchor) |
| `novelty` | 1 | embedding-distance from peers (anti-collapse) | **yes** |
| `critic_scores` | 1 | in-loop critic council quality | **yes** |
| `subtype_check` | 1 | deterministic subtype checks | partial |
| `energy_efficiency` | 0.5 | frugality `1/(1+spend)` | yes |

So **~31% of `total` is agent-visible** (`novelty + critic_scores`) and movable *without getting better*.

### 3.2 The three documented failure modes
1. **The 0.70→0.57 bounce** = *elitism-starvation*. Blending fusion has `E[offspring] ≤ max(parent)` — find a
   peak, reproduction mean-reverts off it. The one primitive that beats this is **directed repair** (fuse
   *toward* the anchor's judge-weakest axis), already plumbed (`directed.ts` → `fuse.ts`).
2. **Over-exploration surfaced a *lower* peak** (`convergence.ts` E2 lesson) — pure diversity is punished by
   the judge. Neither pure-explore nor pure-exploit wins.
3. **Judge central-tendency** (the *primary* plateau, `rubric.ts`) — when the judge clusters axis scores at
   the scale middle, `judge_acceptance` compresses and the dominant weight can't separate the top candidates.
   No deterministic knob fully fixes it.

### 3.3 The load-bearing bug (the "honest gate" target)
The `adaptive` controller's explore/exploit switch (`isFitnessImproving`, `convergence.ts:96`) reads best
**`total`** per generation (`reproduce-seam.ts:193-200`). Because `total` is ~31% agent-visible, a noisy uptick
in critic/novelty flips `improving → true` → the controller drops mutation to `exploitFraction` (0.15) → the
whole population **converges on a decoy peak the held-out judge never blessed.** Fix in §7 Phase-A Slice A1.

### 3.4 ⚠ THE CEILING CAVEAT (must stay honest about this)
The precursor work (`evolution-climb-plan.md` → CLIMB REFRAME, 2026-06-26) established, with live + analytic
checks, that **for the current demo problem the climb is ceiling-bound, not algorithm-bound**: a hand-crafted
EXCELLENT answer scores ~0.74 (the judge reserves 9–10 for "genuinely rare"), gen 0 already starts ~0.69, and
`advancementCount` was statistically indistinguishable from random restarts. **There is almost no headroom to
climb on that problem.**

**Implication for this plan (do not forget this):**
- **Phase A (#3 honest gate + #6 judge-keyed anti-regression) is valuable REGARDLESS of headroom** — it makes
  the existing dynamics *honest* and *non-regressive* (prevents decoy lock-in, holds the peak). Ship it.
- **Phase B/C (coupling, #1/#2) only *visibly* pays off when there is real headroom.** Building elaborate
  coupling to climb a flat landscape is exactly the trap the reframe warns against. So **Phase C is gated on a
  headroom decision** (see §9 Decision D1): a *harder problem* or a *weak seed* that gives the climb room to be
  measured. Validate Phase B/C on a headroom-bearing problem via `/eval`, not the maxed demo problem.

### 3.5 File map (where everything lives)
- Mutation strategy + lens: `apps/api/src/runtime/loop/mutagenStrategy.ts` (`DEFAULT_MUTATION_STRATEGY`,
  `strategyParams`, `agenomeLens`).
- The adaptive controller: `apps/api/src/selection/reproduction/convergence.ts`
  (`adaptiveMutationFraction`, `isFitnessImproving`, `noveltySpread`, `DEFAULT_ADAPTIVE_PARAMS`).
- The reproduce seam (where the controller is driven): `apps/api/src/selection/seams/reproduce-seam.ts`.
- Per-slot r/K decision: `apps/api/src/selection/reproduction/mutationSlot.ts`.
- Offspring assembly: `apps/api/src/selection/successor.ts` (`assembleSuccessor`, `mostDistantPartner`).
- Mutation/fusion mechanics: `apps/api/src/selection/reproduction/{mutate,fuse,directed,reproduce}.ts`.
- Elitism + successor population: `apps/api/src/selection/seams/successor-threading.ts`
  (`createSuccessorThreading`, `rankEligibleByFitness`, `rehome`).
- The ratchet (champion-as-parent): `apps/api/src/runtime/loop/championLedger.ts` (`reigningChampion`),
  `withChampionParent` in `generationLoop.ts`.
- Stigmergy: `apps/api/src/boot/knowledgeRetriever.ts` (`createKnowledgeRetriever`, `directionForBias`),
  `apps/api/src/selection/knowledge/retrieve.ts`, `apps/api/src/projections/research-notes.ts`,
  `apps/api/src/runtime/loop/generationBias.ts`.
- Boot wiring (where strategy/elite/HoF/retrieval are composed): `apps/api/src/boot/composeRuntime.ts`.
- Config defaults + env knobs: `apps/api/src/runtime/config/loadConfig.ts` + `configSchema.ts` + `envSchema.ts`.

### 3.6 Current state of the machinery (what already exists on `main`)
| mechanism | exists? | default | keyed on | notes |
|---|---|---|---|---|
| `adaptive` strategy (controller) | yes | **OFF** (`fusion_only`) | — | controller reads `improving` only when on |
| `improving` signal | yes | — | **`total`** (contaminated) | the §3.3 bug |
| elitism (`eliteCount`) | yes | **1** | **`total`** | gen-scoped; carries best survivor genome unchanged |
| hall-of-fame ratchet (`hallOfFameCarry`) | yes | **0 (OFF)** | **`total`** | champion as breeding PARENT; reframe showed it cuts the drop 0.030→0.006 |
| directed repair | yes | ON (when fusing) | judge weakest axis | the upward drive that beats `E[offspring]≤max(parent)` |
| comparative judge mvp-3 (0–10) | yes | ON | — | Wave 2; the immutable anchor |
| KB in-run retrieval / stigmergy | yes | ON (self-gates on notes) | — | near/far via static `generationBias`; lexical (pgvector NOT installed) |
| channel coupling (shared state) | **NO** | — | — | the gap Phase C fills |

---

## 4. The feature catalog (the 8 breakthroughs, dispositioned)

Status legend: **BUILD** = on the roadmap now · **LEVER** = build only when evidence calls for it · **RESEARCH** = open problem, not a near-term ship.

| # | name | status | confidence | what it does | depends on |
|---|---|---|---|---|---|
| 3 | **Honest gate** | BUILD (Phase A) | high | drive `improving` off persisted `judge_acceptance` over a window, not `total` | step-1 flip to `adaptive` |
| 6 | **Judge-keyed anti-regression + ratchet on** | BUILD (Phase A) | high | rank elites/champion by `judge_acceptance` (fallback total); turn the ratchet on by default | — |
| 2 | **Stigmergic ratchet** (cross-gen handoff) | BUILD (Phase B/C, the prize) | med | far-scouted notes this gen → next gen's near-retrievable trail + directed-repair target | #1 substrate |
| 1 | **Anti-phase coupling** | BUILD (Phase C substrate) | med | one shared `{spread, trailEntropy, judgeImproving}` state drives BOTH mutationFraction AND near/far, anti-phased | trailEntropy primitive |
| 7 | **Per-agenome portfolio desync** | LEVER | med-high | push each agenome near/far by its own distance to the trail centroid (portfolio, not pendulum); ~zero new cost | #1 |
| 4 | **Pheromone decay** | LEVER | med | weight KB retrieval by note recency so the first trail doesn't autocatalytically lock | observe lock-in first |
| 5 | **Lethal-mutation lane** | LEVER | low-med | a few slots get unbounded(-within-allowlist) macro-jumps to escape a basin | evidence of basin-stuck + headroom |
| 8 | **Judge central-tendency war declaration** | RESEARCH | low (partial fix only) | detect joint-convergence plateau → dual escape | the hardest problem; no deterministic guarantee |

---

## 5. Sequencing logic (why this order)

- **#3 and #6 are Phase A** because they make the *existing* (already-built but default-off / total-keyed)
  dynamics turn on AND become honest. They pay off regardless of the ceiling caveat (§3.4). They are also the
  prerequisite correctness layer: turning on `adaptive` (step 1) without #3 would hand the explore/exploit
  wheel to a gameable signal — *worse* than today in that one respect. **Step-1 flip + #3 are one matched move.**
- **#1 is the substrate for #2.** The "stigmergic ratchet" (#2) — far-scouting this gen seeding near-exploit
  next gen — is *emergent from* the anti-phase coupling (#1). The user's stated priority was "#2, maybe #1";
  the true dependency is #1→#2. So **Phase C = the `coupled` strategy = #1 (substrate) + #2 (the payoff)**, and
  we build the minimal #1 first, then #2 on top. If coupling proves unstable (limit cycle, §8 risk), we fall
  back to #1-without-#2 or to Phase A only.
- **Phase B is a thin bridge:** the `trailEntropy` primitive (the cultural mirror of `noveltySpread`) + its
  floor. It's the one new measurement #1 needs. Small, pure, independently testable. (Kept separate so Phase C
  is just "wire the two scalars into one controller.")
- **#7/#4/#5/#8 are levers** — deploy only when `/eval` or live runs show the specific failure each addresses.
  Building them blind is speculative. #7 is the most likely to graduate (cheap, seam already exists).

---

## 6. Phased roadmap (ordering + exit criteria)

### Phase A — Honest, non-regressive dynamics (BUILD NOW)
Turn the existing machinery on and make it judge-honest. Three slices:
- **A1 — Honest gate + adaptive default.** Flip `DEFAULT_MUTATION_STRATEGY → 'adaptive'`; gate `improving` on
  `judge_acceptance` over a window. (§7 detail.)
- **A2 — Judge-keyed anti-regression.** Rank elitism + champion by `judge_acceptance` (fallback `total` on the
  judge-degrade path). Keep the surfaced/terminal winner as `total` (the official fitness) — out of scope here.
- **A3 — Ratchet on by default.** `DOPPL_HALL_OF_FAME_CARRY` default `0 → 1` (the reframe already validated its
  peak-holding win). Update affected config/default tests; re-check the demo e2e (may need fixture re-record).
- **Exit criteria:** full `apps/api` preflight green; a replay-equivalence test pins the new dials replay
  byte-identically (rule #7); a recorded-gateway run shows the controller commits to exploit ONLY on a
  judge-component rise; PR merged to `main`.

### Headroom Gate — "give the climb room" + the headroom check (BUILD after A; BLOCKS Phase B/C)
The ceiling caveat (§3.4) means Phase B/C must NOT be built until we've shown a real climb exists to couple
*for*. Two steps, in order:
- **HG1 — Weak-seed capability ("give the climb room").** Author a `WEAK_SEED_SET` (agenome templates whose
  personas produce deliberately low-effort/surface answers so gen 0 scores ~0.4, not ~0.69) and a boot
  selector (`DOPPL_SEED_PROFILE=default|weak`, default → `DEFAULT_SEED_SET`). Seed set is a boot config
  (`loadConfig` `fileSources.seedSet ?? DEFAULT_SEED_SET`), not per-run, so this is an env-gated preset. Pure,
  TDD-able config; **no cost.** (A harder *problem* for the `/eval` bake-off is the sibling lever — pick a
  problem the model is bad at on the first try; that's data/config, not code.)
- **HG2 — The headroom check (LIVE — costs $, needs the OpenRouter key + user go).** Boot the worker with the
  weak seed + Phase-A stack, run live (`DOPPL_GATEWAY=live`, small pop×gens, low energy cap) on the demo
  problem (and/or the harder problem). **Pass criteria:** (a) gen-0 best fitness is genuinely low (~0.4), (b)
  best fitness *climbs* materially over generations (a real 0.4→0.7+ trajectory, not a 0.05 bounce), (c) the
  honest gate + ratchet visibly hold/grow the peak (peak-to-final drop small). **If it climbs → proceed to
  Phase B/C. If it flat-lines → STOP; the coupling won't help, and the work is a demo-framing problem, not an
  algorithm problem.** This is the cheap de-risk that decides the whole Phase B/C investment.

### Phase B — The cultural mirror (BUILD after the Headroom Gate passes)
- **B1 — `trailEntropy(notes)`** pure primitive in `selection/knowledge/` (mean pairwise Jaccard-complement
  now; cosine when notes carry vectors — `retrieve.ts` auto-upgrades) + a `trailEntropyFloor`.
- **Exit criteria:** unit-tested pure fn; wired read-only into a digest the retriever can see; no behavior
  change yet (the scalar is computed but not yet steering). PR merged.

### Phase C — The coupled controller (BUILD after B; GATED on Decision D1 headroom)
- **C1 — `couplingMode({geneticSpread, trailEntropy, judgeImproving, bias})`** pure fn returning BOTH the
  genetic `mutationFraction` AND the cultural near/far direction, anti-phased (invariant: never both-exploit
  unless the energy-cap "bank progress" arm fires). `generationBias` non-neutral stays the operator override
  that pins direction + disables coupling (preserves FB.4 semantics).
- **C2 — The stigmergic ratchet (#2):** when culture runs `far` this gen, tag the scouted note region so next
  gen's directed-repair fusion preferentially targets candidates grounded in those notes (cross-gen handoff).
- **C3 — Add `coupled` as the 5th strategy**; gate the default flip behind a `/eval` bake-off
  (`coupled` vs `adaptive` vs `fusion_only`) on a **headroom-bearing problem/seed** (D1).
- **Exit criteria:** `/eval` bake-off shows `coupled` ≥ `adaptive` on surfaced peak on a headroom problem,
  with no limit-cycle thrash (hysteresis holds); replay-equivalence pinned; PR merged.

### Levers (build on evidence)
- **#7 portfolio desync** — when a single global near/far swing shows high variance / cohort thrash.
- **#4 pheromone decay** — when logs show the earliest trail autocatalytically locking.
- **#5 lethal-mutation lane** — when `/eval` shows basin-stuck on a rugged, headroom-bearing problem.
- **#8 central-tendency escape** — research track; only with judge-rubric appetite (rule #6 sign-off needed for
  any rubric touch).

---

## 7. Per-phase implementation detail

### Phase A — Slice A1 (Honest gate + adaptive default) — THE FIRST BUILD
**Files:** `mutagenStrategy.ts`, `convergence.ts`, `reproduce-seam.ts`, config/default tests.

1. **Default flip:** `mutagenStrategy.ts` — `DEFAULT_MUTATION_STRATEGY: 'fusion_only' → 'adaptive'`. This
   activates the bidirectional controller (elitism is already default 1).
2. **New windowed judge trigger** in `convergence.ts`:
   - `isJudgeAcceptanceImproving(bestJudgeByGenIndex, currentGenIndex, epsilon, window)` → `true` iff the
     current gen's best `judge_acceptance` exceeds `max(best over gens [cur-window, cur-1]) + epsilon`. No
     prior window data → `false` (explore by default). Pure; keep `isFitnessImproving` for fallback.
   - Add `exploitWindow` to `AdaptiveParams` (default **2**); env override `DOPPL_EXPLOIT_WINDOW`.
3. **Drive it in `reproduce-seam.ts`:** fold a parallel `bestJudgeByGenIndex` from
   `fitness.scored.components.judge_acceptance` (the payload already carries it). Pass
   `isJudgeAcceptanceImproving(...)` as `improving` to `adaptiveMutationFraction`. **Fallback:** if NO
   generation has a present `judge_acceptance` component (full judge-degrade), fall back to the total-based
   `isFitnessImproving` so the controller still functions (never silently freezes).
4. **Tests (TDD):** (a) honest-gate unit — a gen where `total` rises but `judge_acceptance` is flat → controller
   stays in explore; where judge rises over the window → exploit. (b) window robustness — a one-gen judge spike
   doesn't flip exploit. (c) fallback — judge absent everywhere → total-based path. (d) replay-equivalence
   (lesson §55). (e) update `loadConfig` default test: `mutationStrategy` default `'adaptive'`.
5. **Risk to manage:** flipping the default changes the recorded demo e2e's worker run (adaptive mutates) →
   may break event-count assertions or need a fixture re-record. Check `test/integration/demo/*` early.

### Phase A — Slice A2 (Judge-keyed anti-regression)
- `successor-threading.ts:rankEligibleByFitness` — rank by `components.judge_acceptance` (desc), tie-break
  `total` desc, then id asc; **fallback to `total`** when the judge component is absent for a candidate.
- `championLedger.ts:reigningChampion` — same judge-keyed ranking (consistent with elitism). ⚠ `reigningChampion`
  composes `bestScoredSurvivor` which ALSO feeds the terminal/surfaced winner — **do NOT change the surfaced
  winner** (keep terminal = `total`). Either parameterize `bestScoredSurvivor` or add a judge-keyed sibling used
  only by the ratchet-parent path. Decide at build time (Decision D4).
- Tests: a decoy genome (high total, low judge) is NOT carried as elite/champion when an honest genome (lower
  total, higher judge) exists; terminal winner unchanged.

### Phase A — Slice A3 (Ratchet on by default)
- `loadConfig.ts:parseHallOfFameCarry` default `0 → 1` (and update the doc-comment + the env-drift/default tests).
- Update tests asserting `hallOfFameCarry` default 0.
- Re-validate the demo e2e end-to-end.

### Phase B / C detail
Sketched in §6; expand into per-slice detail when Phase A lands (keep this doc updated). The key new code:
`trailEntropy` (Phase B), `couplingMode` + `directionForState` replacing `directionForBias` (C1), the
note-region tag + directed-repair bias (C2), the `coupled` strategy enum member (C3).

---

## 8. Validation strategy

- **Unit / replay (every slice):** TDD; pin each new dial as a **pure fn of persisted values** with a
  replay-equivalence test (lesson §55) — recorded run replays byte-identically, no provider.
- **`/eval` (the climb signal):** the held-out 5-axis rubric harness, gen N vs N+1. Use it to confirm: (A1) the
  bounce shrinks once the gate is honest; (Phase C) `coupled` ≥ `adaptive` on surfaced peak.
- **Live bake-off (Phase A close + Phase C):** n=3 seeds × {`fusion_only`, `adaptive`(+gate), `coupled`},
  small pop×gens, low energy cap. Metrics: surfaced peak, peak-to-final drop (the ratchet metric, target keep
  ≤0.006 like the reframe run), distinct judge values (separation), `advancementCount` vs random-restart H(n)−1.
  ⚠ **Run the climb-sensitive bake-offs on a HEADROOM-BEARING problem/seed (Decision D1), not the maxed demo
  problem** — else you're measuring noise in a 0.05 band.
- **Demo safety:** the recorded demo e2e + replay fixtures must stay green (re-record if a default flip changes
  the worker's event log; replay of *existing* fixtures is unaffected — it re-folds a static log).

---

## 9. Decision log / open questions (the user/Michael owns these)

- **D1 — Headroom / problem selection (BLOCKS Phase C's payoff).** The demo problem is ceiling-bound (§3.4).
  To make the coupling's climb *visible/measurable*, pick a **weak seed** (gen 0 starts ~0.4 so there's room —
  the reframe's recommended demo path) or a **harder problem** with real first-try headroom. ***Status: DECIDED
  (user, 2026-06-27)*** — **weak-seed for the demo + a harder problem for the `/eval` bake-off.** The weak-seed
  capability ("give the climb room") is the ENABLER for the headroom check below — it must be built first.
  Corollary: do NOT raise the ceiling by recalibrating the judge rubric (rule #6 / reward-hacking risk); create
  headroom by seed/problem only.
- **D2 — Default cadence.** Flip to `adaptive` first (Phase A) and prove the gate+ratchet win before paying for
  coupling — OR jump to `coupled`? **Recommendation:** staged (Phase A first). *Status: DECIDED — staged (per
  user, 2026-06-27).*
- **D3 — eliteCount vs freshness.** `eliteCount=1 + ratchet=1` (monotone peak, fresh pool) vs `eliteCount 2–3`
  (harder ratchet, staleness risk). **Recommendation:** `eliteCount=1 + ratchet=1`. *Status: OPEN (default to rec).*
- **D4 — Surfaced winner key.** Keep the terminal/surfaced winning idea ranked by `total` (the official
  fitness) while making only the *breeding* anti-regression judge-keyed? **Recommendation:** yes — surface by
  `total`, breed/carry by judge. *Status: OPEN (default to rec; revisit if it feels incoherent in practice).*
- **D5 — Exploit window length + epsilon.** Start `window=2`, `improveEpsilon=0.005`; tune via `/eval`
  (`DOPPL_EXPLOIT_WINDOW` env). *Status: OPEN (start at rec).*
- **D6 — trailEntropyFloor calibration.** Mirror `diversityFloor` (~0.26) to start; recalibrate when notes
  carry vectors (pgvector NOT installed → lexical Jaccard for now). *Status: OPEN.*

---

## 10. PROGRESS TRACKER (the resume checklist — update every session)

Phase A — Honest, non-regressive dynamics
- [x] **A1** Honest gate + `adaptive` default flip (convergence.ts + reproduce-seam.ts + mutagenStrategy.ts) — `41afe08`
- [x] **A2** Judge-keyed elitism (`rankEligibleByFitness` judge-keyed, total fallback; exported + unit-pinned).
  NOTE: champion ratchet (`reigningChampion`) left **total-keyed** per D4 (it feeds the surfaced winner via
  `bestScoredSurvivor`); judge-keying it is deferred (entangled with surfacing — see D4).
- [x] **A3** Ratchet on by default (`DOPPL_HALL_OF_FAME_CARRY` 0→1, clamped to maxPopulation)
- [x] **A-validate** full apps/api preflight green (956 unit + 199 integration); demo e2e green; replay covered by
  the existing recorded-run replay tests (now exercising the adaptive+ratchet path). `/eval` bounce check =
  pending a live run. **Remaining: open the Phase-A PR (ask first).**

Headroom Gate (BLOCKS Phase B/C — D1 decided: weak-seed demo + harder-problem eval)
- [ ] **HG1** Weak-seed capability — `WEAK_SEED_SET` + `DOPPL_SEED_PROFILE` boot selector (pure config, no cost)
- [ ] **HG2** Live headroom check — weak seed + Phase-A stack; confirm a real climb exists (else STOP, don't build B/C)

Phase B — Cultural mirror
- [ ] **B1** `trailEntropy(notes)` pure primitive + floor (selection/knowledge) · PR merged

Phase C — Coupled controller (GATED on D1)
- [ ] **C1** `couplingMode` / `directionForState` (anti-phase, operator override preserved)
- [ ] **C2** Stigmergic ratchet — far-scout note tag → next-gen directed-repair target (#2)
- [ ] **C3** `coupled` strategy enum + `/eval` bake-off gate · PR merged

Levers (evidence-gated)
- [ ] **#7** per-agenome portfolio desync
- [ ] **#4** pheromone decay
- [ ] **#5** lethal-mutation lane
- [ ] **#8** central-tendency escape (research)

---

## 11. Changelog (append-only; newest last)

- **2026-06-27** — Plan authored. Grounded in a multi-agent research+design workflow (`wrfhaywp3`) + first-hand
  code reads. Reconciled the 8 candidate breakthroughs with the existing (default-off, total-keyed) machinery
  and the CLIMB REFRAME ceiling caveat. User priority: build #3 + #6 (Phase A), then #2 (+#1 substrate) as
  Phase B/C, levers on evidence. Decision D2 = staged. Build starting on Phase A.
- **2026-06-27 (later)** — Phase A built + green (A1 `41afe08`, A2+A3 `0b28c4e`); **PR #15** open to `main`.
  User decided **D1 = weak-seed demo + harder-problem eval** and confirmed the "give the climb room" lever
  (seed/problem, NOT judge recalibration). Added the **Headroom Gate** (HG1 weak-seed capability + HG2 live
  headroom check) as the hard gate before any Phase B/C work. Next: HG1 (pure code, no cost), then HG2 (live, $).
