# Session 008 — Mutagen-dynamics experiment + judge recalibration; NEXT = elitism / culling-visibility / directed reproduction

**Date:** 2026-06-25 · **Branch:** `experiment/mutagen-dynamics` (off `cody`) · **NOTHING pushed** (push only on user OK).

> **READ-FIRST on resume.** This session (a) finished the five live-run problems on `cody`, then (b) ran a
> full **mutagen-dynamics bake-off** at Michael's direction to decide B2 (the mutation policy), which
> produced a **negative-but-valuable** result: the reproduction operators don't move surfaced-node fitness
> because the **held-out judge was saturated** (no selection gradient). I recalibrated the judge (it now
> discriminates), which exposed the **real** climb-killer: **no elitism + regressive reproduction** (the
> loop finds a good idea and throws it away each generation). Culling works mechanically but is only *half*
> of selection. NEXT = elitism (highest leverage), culling visibility, directed reproduction, then re-run
> the mutagen variants with a real gradient and land the winner to `cody`.

---

## A. Branch / commit state (NOTHING pushed)

- **`cody`** carries the completed five-problems work (this session's first half):
  - `792f04f` fix(runtime): raise boot caps for tool-use (maxToolCalls 64→600, energy 1000→12000, wall 10→20min) + `DOPPL_MAX_TOOL_CALLS`/`DOPPL_WALL_CLOCK_MS` env knobs (B1)
  - `baff7f7` fix(web): launcher cap defaults for research (B1)
  - `3c18105` perf(tooluse): concurrent per-turn tool execs (B1-ideal)
  - `86d39ff` fix(web): lineage declutter pass-1 — label truncation, drop edge text, smoothstep (B5)
  - `b03ba19` docs: session 007 (from the prior session)
- **`experiment/mutagen-dynamics`** (off `cody`, 4 commits on top):
  - `db50b8a` E1 — parameterized substrate (`DOPPL_MUTATION_STRATEGY`); makes mutation FIRE
  - `b36380a` E2 — adaptive bidirectional controller (novelty-spread driven)
  - `6cbfd78` E3 — **fitness-aware** controller (exploit when winning, explore when stuck, diversity floor)
  - `9953097` — **held-out judge recalibration** (rule #6 anchor; mvp-1→mvp-2)
- **B4 (prior-art threading) DEFERRED** (reverted last session — circular grounding; needs independent retrieval).
- All test suites green at each commit (api 834 unit; typecheck/lint/format clean).

## B. The five problems (recap — all on `cody`, validated)

B1 run-failure (cap_breach:maxToolCalls=64) → caps raised + env knobs **(done, live-validated:** a fresh run
completed, culling fired every gen, past the old 64-call cliff). B1-ideal parallel tool exec **(done,
security-reviewed)**. B3 culling **(done — was a B1 symptom)**. B5 graph declutter **pass-1 done** (browser was
DOWN → pixel-tuning deferred). B4 deferred. **B2 (mutation) → became the experiment below.**

## C. The mutagen-dynamics experiment (Michael's reframe of B2)

Michael's model: mutation = mutagen *lenses* applied differentially; convergence/divergence is **emergent**
(bidirectional adaptive pressure), not a preset dial; r/K = cheap-many vs expensive-few, energy-governed.
He authorized a paid live bake-off ("spend until clear view").

**Substrate (E1–E3):** `DOPPL_MUTATION_STRATEGY` ∈ {`fusion_only`(=HEAD control) | `mutate_static` | `mutate_lens` | `adaptive`}.
- E1: per-slot seeded **r/K split** in `successor.ts:~165` (`isMutationSlot`, `selection/reproduction/mutationSlot.ts`) makes mutation fire; the **mutagen lens** lives in `personaWeights.lens.<operator>` (heritable — `mutate` drifts it, `fuse` crossover unions it; seeds carry distinct lenses; `runtime/loop/mutagenStrategy.ts` `agenomeLens`). Lens applied at generation in `generationLoop.ts` (`buildPopulationRequest`).
- E2/E3: `selection/reproduction/convergence.ts` — novelty-spread measure + **fitness-aware** controller (improving→exploit/low-mutation, stuck→explore/high-mutation, diversity floor forces recovery). Wired in `reproduce-seam.ts`.
- Config flows via `AppConfig.mutationStrategy` (loadConfig reads `DOPPL_MUTATION_STRATEGY`).

**Results (ER-patient-flow problem, pop 6, rngSeed-varied, mvp-openrouter / scoring-v1):**
- **Round 1 (3 gens, n=1):** `mutate_lens` looked like a +16% winner (0.813 vs ~0.70). **It was NOISE.**
- **Confirmatory (5 gens, n=3/variant):** ALL variants TIE (`fusion_only` 0.7175 / `mutate_lens` 0.7145 / `adaptive` 0.709, ±0.02). Round-1's 0.813 did NOT replicate. **Mutagen dynamics do NOT beat plain fusion on fitness.** Fitness is FLAT across generations in every variant.
- **Why (the real finding):** the **held-out judge was saturated** — central-tendency bias: `grounding` axis was *literally always 4.00* (sd 0.00); all axes clustered 3–4; acceptance ~0.75 for everything (the ×3 dominant weight) → **no fitness gradient** → no reproduction strategy can climb. The one discriminating signal (embedding novelty, range .13–1.0, weight ×1) was outvoted.

## D. Judge recalibration (`9953097`) — the result

Rewrote `JUDGE_INSTRUCTION` (`verifier/judge/judge-call.ts`): explicit per-level anchors (0=absent…5=exceptional-rare),
strict full-range + weakness-hunting mandate, per-axis criteria. **Rule #6 preserved** (still the immutable
held-out anchor: frozen const, runner-computed acceptance, agent-unwritable; bumped rubric `policyVersion`
final-judge-mvp-1→**mvp-2**, immutability-via-versioning). Rule #5 intact (candidate-independent system text).
Axes/weights unchanged. Only test touched: `rubric.test.ts` version pin.

**Judge-gradient experiment (3 variants × seed42 × 5 gens, new judge):**
- Judge is now **more discriminating**: `grounding` varies 2–4 (was always 4); 1s/2s appear; acceptance range 11–20/25 (was 17–20, width 3→7); fitness floor dropped 0.538→0.413. **A genuine improvement — KEEPER.**
- **But fitness STILL doesn't climb.** Smoking gun: `fusion_only` trajectory `0.553→0.678→0.699→0.591→0.573` — it **reached 0.699 at gen2 then LOST it** (→0.57). The population found a good idea and threw it away.

## E. THE CURRENT BOTTLENECK (the climb-killers) — verified

1. **NO ELITISM.** `selection/seams/successor-threading.ts`: gen N+1 = the completed generation's **offspring only**. The best parent is NOT carried forward → peaks are lost (the 0.70→0.57 drop). *This is the #1 fix.*
2. **Regressive reproduction.** `fuse` blends toward the mean; `mutate` drifts randomly → offspring rarely beat the best parent.
3. **Culling is only HALF of selection (Michael's flag).** Culling WORKS (verified: gen0 culls 1/4, gens1-4 cull 2/6 each — weakest-⅓ truncation, floor-2 survivors, detailed reasons in `lineage.culled`). It correctly removes the weak — but without elitism the survivors get diluted by regressive offspring. **Visibility issue:** culled nodes DO render faded-gray (`nodeTypes.tsx` opacity 0.55) but it's too subtle / lost in graph clutter (B5 pixel-tuning deferred — browser was down) / the user may not have re-run since culling started working. Cull (remove weak) + elitism (keep best) are the two halves; only the cull half exists today.

**Synthesis:** a discriminating judge is NECESSARY but NOT SUFFICIENT. The hill now exists (judge gradient), but the organism slides back down it every generation (no elitism + regressive reproduction). That's why no mutagen strategy mattered.

## F. NEXT WORK (prioritized — Michael endorsed these directions)

1. **ELITISM (do first — highest leverage, smallest change).** Carry the top-1–2 scored survivors UNCHANGED into gen N+1 (modify `successor-threading.ts` / the successor population assembly). With the new judge's gradient + elitism, the loop should finally hold its peaks and climb. Re-run + check the trajectory climbs.
2. **CULLING VISIBILITY.** Make culled nodes prominent (clearer than opacity 0.55 — a "CULLED" badge / strikethrough / removal animation) + finish the B5 lineage pixel-tuning (needs a working browser — chrome ext timed out this session). Confirm the user can SEE culling + elitism in the demo.
3. **DIRECTED REPRODUCTION.** Make `fuse`/`mutate` IMPROVE on parents' judged weaknesses (thread the critic/judge feedback into the fusion synthesis prompt) rather than blend/drift.
4. **STRONGER JUDGE GRADIENT** (if needed after elitism). The mvp-2 judge helped but is still modest; a **relative/comparative** judge (rank candidates against each other) spreads scores far more reliably than absolute scoring — bigger change, touches the rule-#6 anchor + per-candidate isolation, so design carefully.
5. **SCALE.** Bigger population (12–18) × more generations (8–10) so selection compounds.
6. **RE-RUN the mutagen variants** WITH elitism + the gradient — only THEN is "do the lens/adaptive dynamics matter?" a meaningful question (today there's no hill to climb, so they tie by construction).
7. **LAND to `cody`** once the loop demonstrably climbs: the judge recalibration + elitism + the winning mutation strategy (default). **The judge change is the rule-#6 anchor — get Michael's explicit sign-off before landing it to `cody`.** Also add the mutagen-trail lineage viz (nice-to-have).

## G. Safety / carry-forward

- **Judge change = rule #6 anchor.** Done as a *developer* recalibration (version-bumped, immutability machinery intact). Landing to `cody` needs Michael's explicit OK.
- **[high] TOCTOU residual** in `createSafeHttpGet` (from the tool-use epic) still open — documented MVP residual, close before any hosted deploy.
- Experiment code is gated by `DOPPL_MUTATION_STRATEGY` (default `fusion_only` = byte-identical to HEAD), so it's inert unless explicitly enabled.

## H. Demo / run mechanics

- Docker `doppl-pg` up; `.env` at `cody` root (caps already raised: energy 12000, maxToolCalls 600, wall 20min).
- Live run: `DOPPL_GATEWAY=live DOPPL_MUTATION_STRATEGY=<strategy> DOPPL_SEED_FIXTURE= pnpm -C apps/api start` (no hot-reload — restart per code change). Web dev: `pnpm -C apps/web dev` (:5173, proxies `/api`→:3000).
- Bake-off / analysis scripts + reports are in the session scratchpad: `bakeoff*.sh`, `confirm*.{sh,py}`, `judge-*.{sh,py}`, and the `*-report.txt` outputs (transient — not committed).
- Run config used across the experiment: ER-patient-flow problem, pop 6, maxGen 5, energy 12000, maxToolCalls 600, mvp-openrouter, scoring-v1, rngSeed ∈ {42,7,99}.

---

## I. RESUME PROMPT (paste into a fresh session)

```
Resume the Doppl mutagen/evolution investigation on the `experiment/mutagen-dynamics` worktree
(/Users/dreddy/Documents/GauntletAI/Capstone, branch experiment/mutagen-dynamics off cody — verify with
`git -C ... branch --show-current`). NOTHING is pushed. Collaborator "Michael" drives the evolutionary-design
calls. Demo: Docker doppl-pg up; .env at cody root (caps raised); `DOPPL_GATEWAY=live
DOPPL_MUTATION_STRATEGY=<strategy> DOPPL_SEED_FIXTURE= pnpm -C apps/api start` (no hot-reload).

FIRST read docs/sessions/008-2026-06-25-mutagen-experiment-judge-elitism.md (canonical orient) — Sections E/F
are the work. The mutagen bake-off proved the reproduction operators DON'T move fitness because the loop can't
climb. The held-out judge was saturated (FIXED, mvp-2, now discriminates). The real climb-killers are NO
ELITISM + regressive reproduction; culling works but is only half of selection. Do, in order:

1. (ELITISM — do first) Carry the top-1–2 scored survivors UNCHANGED into the next generation
   (selection/seams/successor-threading.ts + the successor assembly). TDD the deterministic part. Re-run live
   (fusion_only + adaptive, seed 42, 5 gens) and confirm the best-fitness TRAJECTORY now climbs + holds (today
   it hits ~0.70 then falls — the 0.70→0.57 drop is the smoking gun).
2. (CULLING VISIBILITY) Culling fires + is meaningful (verified: 2/6 culled per gen) but the user can't SEE it
   — make culled nodes prominent (clearer than opacity 0.55) + finish the B5 lineage pixel-tuning via /browse
   or the chrome ext (was DOWN last session — retry; if still down, do the layout heuristics blind + note it).
3. (DIRECTED REPRODUCTION) Make fuse/mutate improve on parents' judged weaknesses (feed critic/judge feedback
   into the fusion synthesis) rather than blend/drift.
4. (STRONGER GRADIENT, if needed) Consider a relative/comparative judge (ranks candidates) — bigger change,
   rule-#6 anchor, design carefully.
5. (SCALE) bigger pop × more gens so selection compounds.
6. (RE-RUN) the mutagen variants WITH elitism + gradient — only then does "do the dynamics matter?" mean anything.
7. (LAND) once the loop demonstrably climbs, bring the judge recalibration + elitism + winning strategy to cody.
   The judge change is the rule-#6 anchor — get Michael's EXPLICIT sign-off before landing it.

Mode: autonomous, /tdd discipline, commit per fix to experiment/mutagen-dynamics (full preflight). Michael
authorized paid live experimentation ("spend until clear view") — run replicates (n≥3) to de-noise; round-1's
n=1 signal was noise. Security carry-forward: the [high] resolve→connect TOCTOU in createSafeHttpGet is a
documented MVP residual (close before hosted deploy).
```
