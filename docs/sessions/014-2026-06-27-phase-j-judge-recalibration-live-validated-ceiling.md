# Session 014 — Phase J judge recalibration: built, live-validated, at the judge's ceiling

> **Status (2026-06-27):** **Everything is on `main`** (PR-only flow; no stranded branches). Phase J (judge
> recalibration mvp-3 → v4) is **built end-to-end and live-validated** behind the Slice-Js `criteriaSource`
> seam — **nothing is flipped.** v4 **un-flattened the held-out judge** (spread 0.26 → 0.55) and **crushes the
> gamed probe** (0.42 → 0.09); it has reached the judge model's natural discrimination ceiling. What remains is
> **Michael's calibration-policy decision + the flip sign-off** (`docs/planning/phase-j-v4-decision-package.md`),
> then **Phase B + Phase C** (still to build). Living plan = `docs/planning/coevolution-climb-plan.md`.

## 0. RESUME — do this first
1. Read `docs/planning/phase-j-v4-decision-package.md` (the Michael decision surface) + plan §0/§7-J/§10.
2. **Get Michael's decisions (D-a..D-d):** strict-ladder vs substantive validation · spread threshold (0.55 vs
   ~0.50) · review the v4 criteria text (`apps/api/test/eval/criteria-v4.ts`) · the flip sign-off.
3. **On sign-off → J7 flip (separate solo commit):** move `JUDGE_AXIS_CRITERIA_V4` text into
   `src/verifier/judge/judge-core.ts` (replace `JUDGE_AXIS_CRITERIA`), bump `rubric.ts` `policyVersion` mvp-3 →
   `final-judge-v4`, re-record the 6 mvp-3 fixtures, keep frozen contract-immutability tests green UNEDITED.
4. **Then BUILD Phase B → Phase C** (the remaining phases — §6 below + plan §7-C). This is "continue building."

## 1. What shipped this session (all on `main`, PRs #15–#26)
- **Branch consolidation (#15–#21 + cleanup):** merged the 3 open Path-A PRs (#15 Phase-A honest gate + #16 HG1
  weak-seed + #17 Finding-A tool-gating) + the stranded plan/handoff/layer docs (#18). Deleted all dead/merged
  local branches + 2 dead worktrees; gitignored junk (`docs/learn-site/`, `image.png`). Every remaining branch
  is ahead-0. **PR-only to main; never `git push origin main`.**
- **v4 composition chosen (user-approved):** (#4) earn-from-zero criteria + (#3) min-aggregation (sequenced,
  unused — criteria alone sufficed) + (#2) gold-set-as-frozen-reference + (#1) floor/ladder framing + (#6)
  judge-variance as the Phase-C diverge→converge signal. #5 Elo = stretch lever.
- **Phase J built (#19–#26):**
  - **Js — criteria-injection seam (#19):** `loadJudgeCriteria` + `buildJudgeInstruction`/
    `buildComparativeJudgeInstruction` + `criteriaSource?` threaded through both judge runners + verify-seam +
    composeRuntime (default = frozen `JUDGE_AXIS_CRITERIA`, byte-identical). Lets a v4 criteria be A/B'd WITHOUT
    flipping the live default (the `rubricSource` seam couldn't reach the criteria string).
  - **J0 — gold set signed off (#20):** `docs/planning/phase-j-gold-set-draft.md` — 15 candidates, 3 problems
    (`readmissions`/`recycling`/`ai-coding-value`) × 5 tiers (weak/mediocre/good/excellent/**gamed**).
    Human-RATIFIED first pass (not judge-derived). Gold-set sign-off ≠ judge-flip sign-off.
  - **J1 — typed fixture (#21):** `apps/api/test/eval/gold-set/gold-set.ts` (`goldCandidateIdea()` builds a real
    `CandidateIdea`). The (#2) frozen reference. Middle tiers refined twice for consistency (#25 mediocre + good;
    this session good RE-restored to genuinely-rich — see §3).
  - **J2 — discrimination harness (#21, made robust #24/#25):** `test/eval/discrimination.ts` (pure gate =
    monotone + spread≥0.55 + gap≥0.08 + gamed<mediocre + **adjacent-tier range-overlap**) + `averageRuns` over
    K live runs (`DOPPL_EVAL_RUNS`, default 3 — kills the judge's ±0.03 noise). LIVE harness
    `test/eval/judge-calibration.eval.ts` (key-gated `.eval.ts`, run via `pnpm -C apps/api test:eval` with
    `vitest.eval.config.ts` #23). Keyless metric logic non-vacuously green (gold targets PASS; flat FAILS).
  - **J3 — v4 criteria (#22, reinforced #26), LIVE-VALIDATED:** `test/eval/criteria-v4.ts`.

## 2. The live result (the headline) — v4 un-flattened the judge, at its ceiling
Live held-out judge over the 15-candidate gold set, **averaged over 3 runs** each:

| tier | mvp-3 | v4 |
|---|---|---|
| weak | 0.487 | 0.167 |
| mediocre | 0.604 | 0.309 |
| good | 0.620 | 0.364* |
| excellent | 0.744 | 0.716 |
| **gamed** | 0.424 | **0.087** |
| **spread** | **0.258** | **0.549** |

`*` measured BEFORE this session's good-tier re-restoration (the good candidates were too austere → ~0.36).
**Findings:** (a) v4 doubled the spread and **crushed gamed to 0.09** — the anti-reward-hacking goal, decisively
met. (b) **The judge model caps excellent ~0.72 and floors weak ~0.17 regardless of criteria** — the
"assign-earned-scores" reinforcement (#26) sharpened the bottom but couldn't lift the top. So **~0.55 is this
judge's maximum spread**; the strict 0.55 threshold sits exactly at the ceiling (0.549 = 0.001 short). The only
lever to widen it is a STRONGER judge model (D8, separate A/B), not more criteria tuning (= overfitting).

## 3. The good-tier error (owned + fixed this session)
A prior over-refinement made the "good" gold candidates too austere (one named anchor + a vague directional
prediction) → the judge scored them ~0.36, collapsing into mediocre (the gap/overlap gate misses). Corrected:
restored the good tier to **genuinely-rich** candidates (TWO named anchors + a specific comparative prediction +
one soft spot → target ~0.64–0.66, cleanly between mediocre 0.44 and excellent 0.88). This is an objective
quality fix, NOT tuned to judge scores (anti-circularity holds). It fixes the gap/overlap but NOT the spread
(spread = excellent − weak, instrument-bounded). 22 keyless eval tests green.

## 4. The decision package (Michael owns — rule #6)
`docs/planning/phase-j-v4-decision-package.md`. The strict gate misses on **spread (0.549<0.55, at the ceiling)**
and **the middle gap (the good-tier error, now fixed)**. The strict-ladder vs substantive-validation question is
the literal blocker. **Recommendation:** accept the SUBSTANTIVE bar (v4 un-flattens + crushes gamed = the
project goal: better ideas score higher so generations climb), ratify spread ≥ 0.50 (matching the judge's real
range), review the criteria text, and sign off the flip. NOT done: the flip (D-d), J4 full probes P1–P5
(hardening), J4b min-aggregation (not needed).

## 5. NEXT after the flip — the remaining phases (continue building)
- **Phase B — cultural mirror:** `trailEntropy(notes)` pure primitive + floor in `selection/knowledge/`, wired
  read-only into the retriever digest (plan §6 / §7-C). No behavior change yet.
- **Phase C — coupled controller + diverge→converge anneal:** C0 `annealedDivergence(progress, judgeImproving)`
  + **(#6) judge score-VARIANCE across a generation as the converge/diverge signal** (high variance = the judge
  can separate → converge; low = diverge — resolves the D5 thrash; now that v4 makes variance meaningful) · C1
  `couplingMode` (anti-phase + hysteresis) · C2 stigmergic ratchet · C3 `coupled` strategy + `/eval` bake-off on
  the v4 judge. Plan §7-C.

## 6. Dev recipes
- **Live judge-calibration eval:** `cd apps/api && OPENROUTER_API_KEY=… pnpm test:eval` (avg of 3 runs; set
  `DOPPL_EVAL_RUNS=1` for a quick single-run check). mvp-3 BASELINE + v4 blocks log tier means [min–max] +
  spread/gap/gamed/GATE. The v4 test ASSERTS the gate (currently red — by design, pending the D-a/D-b decision).
- **Keyless preflight (Phase-J eval):** `pnpm -C apps/api vitest run test/eval` (gold-set well-formedness +
  discrimination metric logic; no provider). Full unit: `pnpm -C apps/api vitest run` (996+ green).
- **Regenerate the gold fixture:** the `scratchpad/gen_gold_set_v3.py` generator merges the workflow outputs →
  `gold-set.ts`. The corpus is canonical in `gold-set.ts`; the doc is the human-review surface.

## 7. Safety carry-forward (unchanged invariants)
Caps kernel-enforced (#1) · append-only authoritative (#2) · no arb exec (#3) · secrets env-only scrubbed at the
boundary (#4) · model output untrusted DATA (#5) · **held-out judge + scoring policy immutable to agents (#6 —
v4 lives behind the Js seam; the flip is versioned + Michael-signed-off only)** · replay no providers (#7) ·
energy = success-only (#8) · Postgres-only, SDKs behind the gateway (#9). pgvector NOT installed (lexical).
The OpenRouter API key is the operator's — Claude never enters it into a command (credential boundary).
