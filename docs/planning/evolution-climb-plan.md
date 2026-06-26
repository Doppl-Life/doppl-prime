# Evolution CLIMB plan — make each generation's best reliably beat the last

> **Status:** **WAVE 1 COMPLETE + live-validated** (Steps 1–3 committed). Wave 2 (judge, rule-#6 sign-off)
> is next session. From the 22-agent fan-out adversarial analysis (`wf_cf51573d-3b1`, 2026-06-25) + n=3 live
> validation. Branch `experiment/mutagen-dynamics` (off cody), nothing pushed. North star (user/Michael):
> **each generation's best fitness reliably BETTER than the last.**

## ✅ WAVE 1 LIVE VALIDATION RESULT (n=3, fusion_only, pop6×5gen) — the data Wave 2 needs

| | prior (elitism only) | Wave 1 stack (elitism + calibrated critics + directed fusion) |
|---|---|---|
| per-gen best peaks | ~0.637, all fell back | **0.716–0.735 (band lifted ~+0.10)** |
| critic_scores component | **CONSTANT 0** (15% drag) | **25–28 distinct, 0.50–0.77, sd ~0.05** ✅ Step 2 win |
| directed fusion | n/a | **FIRES** — directedAxis recorded (grounding×24/novelty×4/falsification×2) ✅ Step 3 |
| advancementCount (gens beating the running champion) | ~0 | **0–1 / 4 — still NO monotonic climb** |

**Verdict:** Wave 1 did its job — it **lifted the band ~0.10** (critic_scores went from a flat-0 drag to real
discrimination) and the **drive fires** (directed fusion targets the weakest judged axis). But the per-gen
best still bounces, and the validation **isolated the remaining ceiling to the JUDGE**: `judge_acceptance`
(the dominant 46%) compresses to only **5–6 distinct values, capped at 0.68** — it cannot separate the top
candidates, so even a genuinely-better directed offspring scores the same as the champion → no advancement.
This is exactly the workflow's prediction: **Wave 1 is necessary, and it proves Wave 2 (the judge) is the
required next lever** — the data now JUSTIFIES Michael's rule-#6 sign-off (the climb is judge-gated, not
skippable). Runs: seed42 `2fc2a682`, seed7 `a57687df`, seed99 `6567c364`.

## The decisive diagnosis (all 4 design proposals scored 0/3 climb votes — same reason)

No SINGLE lever climbs. Three binding constraints must ALL be hit — **ratchet + drive + gradient**:
1. **RATCHET missing** — genome-elitism re-GENERATES a fresh candidate for the carried elite each gen, so
   its score re-rolls (live-confirmed: 0.605/0.589/0.606/0.627/0.589) → the peak never locks.
2. **DRIVE missing** — reproduction is mean-reverting (`E[offspring] ≤ max(parent)`); fuse blends to the
   mean, mutate drifts.
3. **GRADIENT flat at the top** — judge_acceptance (46% of weight) central-tendency-compresses the GOOD
   candidates (absolute integer 0-5, in isolation); critic_scores (~15%) is a CONSTANT 0 live (drags +
   compresses); subtype_check is a near-constant ~1.0 dilutant.

n=3 de-noise confirms: neither control nor elitism climbs; elitism only shrinks+stabilizes the peak→final
drop (−0.036 vs −0.049). Elitism is necessary-but-not-sufficient.

## Evidence-backed corrections to the working hypotheses

- **The skipped checks are ~0 gradient ("correctness-theater" for the climb).** `allowlisted_executable` is a
  constant-PASS placeholder (3/3→4/4 = still ~1.0). `prior_art` is novelty-vs-an-EXTERNAL 4-entry corpus
  (binary, fires only on a rare duplicate), NOT idea-to-idea novelty. Worth a one-line fix to remove the
  misleading skip; won't steepen anything. Real signal needs the deferred P4.11 execution harness.
- **Novelty IS broken but fixing it (as scalar fitness) FIGHTS the climb.** The comparison set resets every
  generation + the first candidate each gen gets a free `novelty=1.0` order artifact. BUT novelty summed into
  scalar fitness is a diversity pressure ANTAGONISTIC to a monotone best-fitness climb. **Resolution (user):
  DECOUPLE — fitness = this generation's QUALITY (not tied to a converging elite); novelty = a SEPARATE
  diverge/CULLING pressure** (prune reworded siblings — every agenome shares one model, so convergence is
  cheap). Then both work. Tune AFTER Wave 1 lands the climb. Idea-to-idea novelty is already its own weight-1
  embedding component (separate from prior_art).
- **The 2 "not reviewed" critics (falsification/subtype_specific) = K=3-of-5 ROTATION by design, not a bug.**
- **Mutations "stopped" = fusion_only (the control) was used in every elitism run** (mutationFraction 0 → 0
  mutations by design); they fire ~⅓–⅔ under mutate_lens/adaptive. Default strategy is fusion_only. Wave 1
  Step 3 must compose with mutation (run a mutating strategy for the diverge phase).

## WAVE 1 — no rule-#6 sign-off; this is where the climb is born

### STEP 1 — Lock the peak candidate  [STARTED]
- **DONE + committed (`0f4141e`):** the pure `reigningChampion` ledger (`runtime/loop/championLedger.ts`,
  7 unit tests) — cross-gen peak scored-∧-unculled candidate + its agenome; reuses
  `partialSummary.bestScoredSurvivor`; replay-stable; fails closed. The loop emits it as `bestSoFar` on
  `generation.completed` (the non-decreasing best-so-far floor + the measurement scaffold). Additive, never
  gates the loop. (NOTE: best-so-far alone is the trivial running-max line — NOT the climb proof. The proof
  is `bestFreshThisGen` + `advancementCount` vs a random-restart control.)
- **NEXT (the fuller carry — the subtle kernel piece):** carry the champion CANDIDATE as a non-regenerating
  eligible parent so directed reproduction (Step 3) breeds against a LOCKED target. Mechanism: re-present the
  champion (its persisted candidate+score) in the next gen WITHOUT gateway.generate / new fitness re-score,
  added to the eligible-parent set; gate by config `hallOfFameCarry` (default 0 = HEAD-identical). Kernel
  safety-invariant slice — isolate it. Pins: replay state-equivalence (re-derive from championLedger, no
  provider rule #7, no fabricated decision rule #2); the carrier slot counts vs maxPopulation (rule #1); the
  carried champion must NOT enter the score-seam novelty accumulator (silent scoring change); no re-score, no
  energy debit (rule #8). Files: `successor-threading.ts`, `generationLoop.ts` (processAgenome skip-generate
  branch + the pop clamp ~:905), `configSchema.ts`/`loadConfig.ts`/`composeRuntime.ts`.

### STEP 2 — Critic-score calibration  [de-flatten the 15% + mint the per-axis weakness signal]
critic_scores is a CONSTANT 0 live (it sits in the normalized-average denominator → drags + compresses).
(a) `composeRuntime.ts` → pass `activeCount: 5` to `createVerifySeam` (all 5 mandates every gen — also fixes
the "not reviewed" the user saw). (b) `run-council.ts` `MANDATE_INSTRUCTIONS` → anchored 0-5 per-axis score
+ full-range/differentiate mandate (the judge's mvp-2 treatment). (c) `critic-call.ts` `CriticModelOutput.
scores` → fixed-key sub-axis record, prompt-required but schema-tolerant with **repair≤1** (NOT hard-required
— that strict-rejects → null review → value 0 again). Re-record `fixtures/replay/demo-recorded-001.json`.
Metric: spread among the TOP-2/3 (not population sd); sd UP not just mean; contributing-review-count not down.
Rule-#6: UNTOUCHED (critic prompts = council config, emit-only). `/eval`, not `/tdd`.

### STEP 3 — Directed reproduction  [the DRIVE engine; elite paired with a FIT partner]
`reproduce-seam.projectSuccessorParents` → fold `judge.reviewed.axisScores` → `weakestAxis = argmin` over the
closed `FinalJudgeAxis` enum. Thread `directedWeakness` → successor → reproduce → `fuse.ts`: replace the
blend-to-mean `SYNTHESIS_INSTRUCTION` with "keep each parent's strengths, REPAIR the named weak axis" in the
TRUSTED system msg (axis names from the immutable enum), numeric weakness appended into the existing
`wrapUntrusted` USER block as DATA. Record the targeted axis into `ReproductionEvent.mutationSummary` (open
record → no contract bump). **CRITICAL:** pair the elite with a FIT partner, NOT `selectDistantPair`'s
most-distant (which drags the elite toward a weak partner = today's bounce). Distant-pair stays for
EXPLORATION slots only. Converts `E[offspring]` from `≤max(parent)` to positive drift on a targeted axis.
Metric: `advancementCount>0` at gen≥1 + positive `bestFreshThisGen` slope vs fusion_only AND random-restart.
Goodhart guard: measure NET total + an independent signal. Rule-#6: brushes-but-doesn't-touch (READS judge
OUTPUT; judge byte-identical) — FLAG for review, pin judge byte-identical. `/tdd` the argmin fold; `/eval`
the drift. Rule #5: axis NAMES trusted-system, numeric weakness wrapUntrusted DATA (two channels).

## WAVE 2 — Michael's sign-off REQUIRED; build LAST

### STEP 4 — Judge top-end discrimination  [the dominant 46%]
Absolute integer 0-5 in isolation → central tendency → top compresses (~0.19 range). **REJECT** proposal-2's
subtract-only comparative formula (rank-1 penalty = exactly 0 → can't lift the winner). Present Michael two
CORRECTED options via `AskUserQuestion`:
- **Option A (lighter, first):** widen per-axis scale 0-5 → 0-10. `policyVersion mvp-2→mvp-3` + coherent
  `scoringPolicyVersion`. Low blast radius.
- **Option B (heavier):** TRUE comparative judge — peer context breaks central tendency + lets the WINNER's
  absolute axes spread UP (floor preserved, acceptance still RUNNER-computed, model supplies only ordinal +
  per-axis inputs). Needs the multi-blob rule-#5 isolation seam (`candidate-as-data.ts`) + hoist the judge out
  of the per-candidate loop (`verify-seam.ts:136`) + fixture re-record.
BUILD LAST so Wave-1's measured residual top-flatness tells you exactly how much sign-off to spend (Wave 1
alone may climb → Step 4 reduces to Option A). Rule-#6: DIRECTLY TOUCHED — sign-off + policyVersion bump;
acceptance stays runner-computed; pin the FLOOR test (a uniformly weak gen must NOT manufacture a high best).

## Build order + the honest metric
WAVE 1 (no sign-off): Step 1 (ratchet, isolated kernel slice) → Step 2 (gradient floor + per-axis signal) →
Step 3 (drive). 2 before 3 so the gradient 3 reads is de-noised; 1 before both. WAVE 2 (sign-off gate): Step
4, Option A first. **Success metric throughout: `bestFreshThisGen` slope + `advancementCount` vs a
random-restart control — NEVER the running-max line.**

## Live experiment harness (reuse)
`DOPPL_GATEWAY=live DOPPL_MUTATION_STRATEGY=<s> DOPPL_ELITE_COUNT=<n> DOPPL_SEED_FIXTURE= pnpm -C apps/api
start` → POST a run (pop6, 5 gens, ER-patient-flow, seed 42/7/99). Scratchpad scripts:
`elitism-bakeoff*.sh` + `elitism-report.py` (per-gen trajectory + carry-forward evidence). Docker `doppl-pg`.

## Separate: RESEARCH TOOLS (idea QUALITY, not the gradient directly; user wants fixed — after climb)
- `x_search`: 100% empty (17/17) — broken.
- `youtube_search`: returns a text SUMMARY, not videos/transcripts. User wants: agent picks a video → fetch
  its TRANSCRIPT → read → in PARALLEL across multiple videos.
- `fetch_url`: SSRF guard blocks redirects → agents can't read full articles they find (ties to the [high]
  TOCTOU residual). Agents are limited to web_search snippets (they DO use them — candidates cite real URLs).
- Shared knowledge space (stigmergy / pgvector) — design LOCKED in `docs/planning/shared-knowledge-space.md`;
  build deferred until after the climb.
