# Session 013 — coevolution climb: Path A shipped, HG2 verdict, judge-recalibration pivot

> **Status (2026-06-27):** Path A (honest dynamics + 2 bug fixes + weak-seed) is **3 open PRs** (#15/#16/#17).
> The HG2 live headroom check is **done** → the verdict is that the **held-out judge is the binding ceiling,
> not the evolutionary algorithm.** Michael's strategic call: **build Phase B/C anyway AND recalibrate the
> judge (mvp-3 → v4)** to create real headroom, plus a dynamically-intelligent **diverge→converge anneal.**
> **Living plan = `docs/planning/coevolution-climb-plan.md` (read §0 + §7-J + §10).** This doc is the session
> narrative; the plan doc is the authority.

## 0. RESUME — do this first
1. **Merge PRs #15, #16, #17 to `main`** (Michael; PR-only flow — see `memory/pr-workflow-to-main.md`).
2. `git checkout main && git pull --ff-only origin main`; fold this doc + the plan-doc updates onto `main` if
   they didn't ride a PR (they were committed on a feature/experiment branch this session).
3. **Phase J (judge recalibration) is the next build** — but it's BLOCKED on Michael's inputs (J0): the gold-set
   **target thresholds** (D10) + **corpus problems** (D9) + the **criteria-only-vs-exemplars** call (D7). Get
   those, then build the gold set (J1) → harness (J2) → v4 criteria (J3) → probes (J4) → fixtures (J5) →
   live re-check + sign-off (J6) → flip (J7). Full design: plan §7-J.

## 1. What shipped this session — Path A (3 open PRs, all green)
- **PR #15** `feature/coevolution-phase-a-honest-gate` — Phase A:
  - **Honest gate (#3):** the `adaptive` controller's explore→exploit switch now reads the persisted
    `judge_acceptance` component over a 2-gen window (the un-hackable signal), not the blended `total` (~31%
    agent-visible) — so a noisy critic/novelty uptick can't lock the population on a decoy peak. Default
    `DEFAULT_MUTATION_STRATEGY` flipped `fusion_only → adaptive` (mutation ON for all runs).
    (`convergence.ts`, `reproduce-seam.ts`, `mutagenStrategy.ts`.)
  - **Judge-keyed elitism (#6):** `rankEligibleByFitness` ranks by `judge_acceptance` (total fallback) so
    anti-regression preserves judge-rewarded genomes, not total-inflated decoys. Surfaced winner stays `total`.
  - **Ratchet on (#6):** `DOPPL_HALL_OF_FAME_CARRY` default `0 → 1`.
  - **Finding-B crash fix (`7376625`):** the ratchet breeds the champion, but the loop threaded the next
    population with `eligibleParents` (champion-excluded) → `applyReproduction` couldn't reconstruct a
    champion-bred offspring → throw → worker silently **orphaned the run** (the live "hang"). Fix: hoist
    `reproduceParents` and pass it as the `nextPopulation` reconstruction pool. Non-vacuous unit regression test.
- **PR #16** `feature/headroom-weak-seed` — HG1: `WEAK_SEED_SET` (4 deliberately weak personas) + a
  `DOPPL_SEED_PROFILE=weak` boot selector. Pure config.
- **PR #17** `feature/tool-permission-gating` — Finding A: the tool-orchestrating gateway offered the full
  tool allowlist to every agenome regardless of `toolPermissions`; now it offers only the agenome-permitted
  tools (threaded through `GenerateOptions.toolPermissions`). Weak seeds (`[]`) are now tool-less.

## 2. The HG2 headroom check — the verdict
Two live runs (pop 4 × 4 gens, `DOPPL_GATEWAY=live DOPPL_SEED_PROFILE=weak`, PORT=3100):
- **Run 1** (ER problem, weak seed, before the fixes): **crashed/orphaned** at the gen2→gen3 boundary →
  surfaced Findings A + B (above). Trajectory before the crash: gen-0 **0.69**, total **declining**.
- **Run 2** (hard prediction-market problem, tool-less weak seed, both fixes): **completed cleanly, 0 tool
  calls.** Total climbed **0.60 → 0.67 → 0.64 → 0.68**, but the **held-out judge stayed FLAT ~0.53**
  (best-judge/gen 0.52/0.54/0.56/0.54). Winner: a gen-3 idea, total 0.68 / judge 0.54.

**Interpretation:** the total climbs via the **agent-visible** components (novelty/critic); the **judge — the
46%-weight anti-reward-hacking anchor — sees no quality improvement.** The weak persona doesn't even tank gen-0
much (0.60, not 0.40) — the model is competent on anything. **So the binding constraint is the judge's
inability to discriminate incremental quality, not the algorithm.** A coupling that climbs the total harder
would still leave the judge flat. (Reconfirms the CLIMB REFRAME with clean evidence.)

## 3. The pivot (Michael, 2026-06-27)
> "Build phase B and C still, then recalibrate the judge and rubric. Also a diverge-then-converge strategy —
> diverge for breadth before converging as ideas get better, dynamically intelligent."

This *resolves* the tension: the judge ceiling is exactly *why* B/C looked pointless, so **recalibrating the
judge creates the headroom B/C climbs.** New phase order (plan §6):
1. Merge Path A (#15/#16/#17).
2. **Phase J — judge recalibration mvp-3 → v4** (the rule-#6 enabler). §4 below + plan §7-J.
3. **Phase B** — cultural mirror (`trailEntropy`).
4. **Phase C** — coupled controller (#1 anti-phase + #2 stigmergic ratchet) **+ the diverge→converge anneal**.

## 4. Phase J — judge recalibration (the comprehensive design)
*(From design workflow `w55uj1gep`. The judge is the rule-#6 anchor — the single most sensitive change. SOLO,
gold-set-gated, Michael-sign-off slice; default flip is a separate final commit.)*

**Principle (non-negotiable): discriminate MORE, never be more generous.** Reward what's *expensive to fake*
(named checkable evidence, a concrete falsifiable prediction with a number/threshold, a buildable mechanism);
penalize what's *cheap to fake* (confident tone, verbosity, buzzwords, unfalsifiable grand claims). The
structural anti-hacking floor stays byte-identical (runner-computed acceptance, peer-invariant, rule-#5
candidate isolation).

**The edit (one source string):** `JUDGE_AXIS_CRITERIA` in `judge-core.ts` (composed into both the single and
comparative judge paths — single edit, no drift). Three changes: (1) **re-anchor bands** so the competent
region spreads (`4–7` working band by sub-criteria passed) and the top is reachable-but-earned (`8–9` for
genuinely strong, not "reserved for rare") — the typical competent idea anchors LOWER (~4); (2) **per-axis
yes/no sub-criteria** (the mechanical spread engine: grounding = count of named checkable sources;
falsification = a concrete falsifiable prediction; feasibility = a concrete buildable mechanism); (3) an
**anti-cheap-signal clause** (length/confidence ≠ evidence). Keep the skeptical-critic mandate. **Defer**
few-shot exemplars (highest reward-hacking surface) and a stronger judge model (second-order A/B).

**Version:** `rubric.ts` `policyVersion` mvp-3 → `final-judge-v4`; axes/weights/immutability UNCHANGED; no schema bump.

**Gold set (NEW):** `apps/api/test/eval/gold-set/` — a **human-labeled** corpus (Michael, NOT judge-derived —
anti-circularity), ≥3 distinct problems × {weak,mediocre,good,excellent,gamed}, targets pinned 0–10.

**Validation:** `judge-calibration.eval.ts` (judge-key-gated; eval-tested, not unit) — monotone tier
separation (gap ≥~0.08), spread ≥~0.55, excellent ≈0.85+, within-tier < inter-tier, a monotonicity ladder
(same idea at 0→1→3 evidence levels rises). Baseline on mvp-3 first. **Reward-hacking probes P1–P5** (terse-
evidenced > verbose-confident; falsifiable > grand; sourced > sourceless; injection-resistant) — **every gamed
probe strictly below the mediocre floor; weak still 0.2–0.35** (a recalibration that lifts the floor as much as
the ceiling has FAILED).

**Go/no-go (each blocks the next):** gold set → baseline mvp-3 → author v4 (inject via `rubricSource`, default
NOT flipped) → discrimination passes → probes pass → frozen contract-immutability tests green UNEDITED →
re-record the 6 `final-judge-mvp-3` fixtures at v4 + keyless preflight + demo-e2e replay green → live HG2
re-check (climbable band, both ends) → **Michael sign-off** (5-artifact package) → flip default
(separate final solo commit).

## 5. Phase C — the diverge→converge anneal (Michael's idea, the missing time-axis)
The controller has **three axes** that compose: *fitness*-reactive (the honest gate — exists), *cross-channel*
(coupling #1+#2), and **progress** (the anneal — NEW). `annealedDivergence(progress, judgeImproving)` where
`progress = genIndex/maxGenerations`: **diverge early** (breadth), **converge late** (refine), but
**dynamically** — *delay* convergence while the judge is still improving, *converge sooner* once it plateaus.
Folds into `couplingMode({progress, geneticSpread, trailEntropy, judgeImproving, bias})` (plan §7-C). Pure over
persisted `genIndex` + the judge trend → replay-safe. The static `generationBias` dial becomes the operator
baseline/override.

## 6. Open decisions (Michael owns — plan §9 D7–D11)
- **D10 (BLOCKS the gold set):** target thresholds — excellent ≈0.85+, weak ≈0.2–0.35, inter-tier gap ≈0.08,
  spread ≥~0.55, gamed strictly below mediocre. Need Michael's numbers.
- **D9:** gold-set corpus — which ≥3 problems/domains.
- **D7:** v4 criteria-only (rec) vs +few-shot exemplars.
- **D8:** also A/B a stronger `final_judge` model? (rec: instruction first.)
- **D11 (the strategic call):** does the discriminate-not-be-generous gate satisfy D1's original "no judge
  shortcut" prohibition? (rec: yes — it makes the judge HARDER to game, not easier.)

## 7. Dev recipes
- **Live run (the HG2 method):** `DOPPL_GATEWAY=live DOPPL_SEED_PROFILE=weak DOPPL_MAX_POPULATION=4
  DOPPL_MAX_GENERATIONS=4 DOPPL_ENERGY_BUDGET=200000 DOPPL_WALL_CLOCK_MS=1800000 DOPPL_RNG_SEED=7 PORT=3100
  pnpm -C apps/api start` (bg) → `curl -X POST localhost:3100/runs -d '{"seed":"<problem>"}'` → poll Postgres
  `run_events` for a terminal event + the per-gen `fitness.scored` trajectory → kill the server when done.
  Tool-less weak seeds make ~0 tool calls (fast/cheap). Docker `doppl-pg` must be up. Restarting the API
  SIGTERMs the prior :PORT instance (exit 143, benign).
- **Trajectory query:** `SELECT generation_id, max((payload->>'total')::numeric) best_total,
  max((payload->'components'->>'judge_acceptance')::numeric) best_judge FROM run_events WHERE run_id='…' AND
  type='fitness.scored' GROUP BY 1 ORDER BY 1;`
- **Preflight:** `pnpm -C apps/api lint && pnpm -C apps/api typecheck && pnpm -C apps/api test` (+ integration
  via `vitest.integration.config.ts`; Docker `doppl-pg` required). Run from `apps/api` (root `vitest` isn't on PATH).

## 8. Safety carry-forward (unchanged invariants)
Caps kernel-enforced (#1) · append-only authoritative (#2) · no arb exec (#3) · secrets env-only scrubbed at
the boundary (#4) · model output untrusted → wrapUntrusted DATA (#5) · **held-out judge + scoring policy
immutable to agents (#6 — Phase J changes it ONLY under versioning + the discrimination gate + Michael
sign-off)** · replay calls no providers (#7) · energy = successful spend only (#8) · Postgres-only, SDKs behind
the gateway (#9). pgvector NOT installed (retrieval is lexical Jaccard).
