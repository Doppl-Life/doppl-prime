# Phase J — v4 Judge Recalibration: Decision Package (for Michael)

> **One line:** v4 **un-flattened the held-out judge** (spread 0.26 → 0.55) and **crushes the gamed probe**
> (0.09, far below everything) — the recalibration works and has reached the judge model's natural
> discrimination ceiling. Two calibration-policy decisions + the rule-#6 flip sign-off are yours. **Nothing has
> been flipped** — v4 lives behind the Slice-Js `criteriaSource` seam; `DEFAULT_JUDGE_RUBRIC` is still mvp-3.

## 1. The result (live held-out judge over the 15-candidate gold set, each averaged over 3 runs)

| tier | mvp-3 BASELINE | v4 | gold target |
|---|---|---|---|
| weak | 0.487 | **0.167** | ~0.24 |
| mediocre | 0.604 | 0.309 | ~0.44 |
| good | 0.620 | 0.364 | ~0.64 |
| excellent | 0.744 | **0.716** | ~0.88 |
| **gamed** ⚠ | 0.424 | **0.087** | < mediocre |
| **spread** (exc−weak) | **0.258** | **0.549** | ≥0.55 |
| gamed < mediocre | 0.42 < 0.60 ✓ | **0.09 < 0.31 ✓✓** | — |
| monotone ladder | yes | **yes** | — |

**Read:** mvp-3 compresses everything into 0.42–0.74 (the HG2 flatness — the judge can't tell quality apart).
v4 spreads from 0.087 (gamed) to 0.716 (excellent) — a **2× wider** band of real discrimination, the ladder is
monotone, and the **gamed candidates (verbose, buzzword-dense, no real evidence) are crushed to 0.09** — the
anti-reward-hacking goal, decisively met.

## 2. The structural finding: we are at the judge model's ceiling
The judge **floors weak at ~0.17 and caps excellent at ~0.72** — it will not assign 8+/axis even when the
criteria explicitly tell it to (the "assign earned scores" reinforcement lifted the *bottom* — sharpening
weak/gamed — but not the top). So **~0.55 is the maximum spread this judge model + these criteria produce.** The
only lever that would widen it further is a **stronger `final_judge` model** (decision D8 — a separate A/B,
NOT a criteria change), or accepting the judge's real range. Further criteria tuning = overfitting to 15
examples (the plan's explicit non-goal).

## 3. Where v4 falls just short of the STRICT gate (and why each is policy, not engineering)
The strict gate = monotone + spread≥0.55 + inter-tier gap≥0.08 + gamed<mediocre + no adjacent-tier range
overlap. v4 passes monotone + gamed-crushed decisively. It misses on:
1. **spread 0.549 < 0.55** — a **0.001** miss, *at the judge's ceiling*. The 0.55 threshold came from the
   aspirational human gold targets (excellent 0.88 − weak 0.24 = 0.64); the live judge maxes ~0.55. → **D-b.**
2. **mediocre↔good gap + overlap** — driven by the "good" gold candidates being **mislabeled too austere** (a
   prior over-refinement of mine: one anchor + a vague prediction → judge scored them ~0.36, collapsing into
   mediocre). **Fixed this session** by restoring genuinely-good candidates (two named anchors + a specific
   prediction). This does NOT change the spread (spread = excellent − weak).

## 4. The decisions (yours, Michael — rule #6)
- **D-a — what does "v4 validated" mean?** The STRICT 4-tier ladder (clean weak<mediocre<good<excellent with
  daylight, incl. the fuzzy mediocre/good split) vs the SUBSTANTIVE bar (un-flattens + ranks roughly by quality
  + crushes gamed). The project goal — *better ideas score higher so generations climb under selection* — needs
  the substantive bar, which v4 clears decisively. The strict ladder demands fine middle-grading the system
  doesn't require and the judge can't quite produce. **Rec: accept the substantive bar.**
- **D-b — spread threshold.** Keep 0.55 (aspirational, ~0.001 beyond the judge's ceiling) or ratify ~0.50 to
  match the judge's real range (still 2× the mvp-3 effective spread). **Rec: 0.50.** With D-b=0.50 + the good
  fix, v4 passes the strict gate too (no overfitting — it's recalibrating the threshold to the instrument).
- **D-c — the v4 criteria TEXT.** Review `apps/api/test/eval/criteria-v4.ts` (`JUDGE_AXIS_CRITERIA_V4`):
  earn-from-zero bands + per-axis count-the-evidence sub-criteria + anti-cheap-signal clause + the
  assign-earned-scores reinforcement. This is the rule-#6 surface that would replace `JUDGE_AXIS_CRITERIA`.
- **D-d — the flip (J7).** On sign-off: move the v4 text into `src/verifier/judge/judge-core.ts`, bump
  `rubric.ts` `policyVersion` mvp-3 → `final-judge-v4`, re-record the 6 mvp-3 fixtures, keep the frozen
  contract-immutability tests green UNEDITED — a SEPARATE final solo commit. **Not done; awaits your sign-off.**

## 5. Sign-off artifacts (the 5-piece package)
1. **Criteria diff** — mvp-3 `JUDGE_AXIS_CRITERIA` (`judge-core.ts`) vs v4 (`test/eval/criteria-v4.ts`).
2. **Before/after live data** — §1 above (reproduce: `OPENROUTER_API_KEY=… pnpm -C apps/api test:eval`).
3. **The gold set** — `apps/api/test/eval/gold-set/gold-set.ts` + `docs/planning/phase-j-gold-set-draft.md`.
4. **Reward-hacking result** — gamed crushed 0.42 → 0.09 (the load-bearing anti-reward-hacking check; the gamed
   tier IS probe P-style coverage). ⚠ the full P1–P5 probe suite (J4) is still TODO as a hardening pass.
5. **Ceiling analysis** — §2 above (the spread is instrument-bounded, not criteria-bounded).

## 6. What is NOT done
- The flip (D-d) — awaits sign-off.
- J4 full reward-hacking probes P1–P5 (the gamed tier covers the spirit; the explicit suite is a hardening TODO).
- J4b (#3 min-dominated aggregation) — not needed unless you want a different validation; v4 criteria alone
  achieved the discrimination.
- D8 (stronger judge model A/B) — the only remaining lever to widen spread past ~0.55, if D-a/D-b demand it.

**Recommendation in one line:** accept the **substantive validation** (v4 un-flattens + crushes gamed), ratify
**spread ≥ 0.50**, review the criteria text, and sign off the flip — then Phase B/C climb the recalibrated judge.
