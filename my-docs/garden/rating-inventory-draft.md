# Rating Inventory — every scoring system, garden + jungle

The point of this file: before we reconcile the kernel, know *every* place a number gets assigned, on
what scale, so the garden's `−5…+5` model lands cleanly. `rating-model-draft.md` is the canon; this is
the map of what exists.

## A. Garden (canon) — all `−5…+5`

- **Rubric**, five axes, judge-filled: Novelty · Grounding · Falsifiability · Worth-the-squeeze · Lens fit.
- **Judge single** — boil-down of the five.
- **Human single** — one gut slider.
- **delta** — judge − human (derived, not stored).
- **Decay** — time modifier, **zeitgeist only**; erodes the score, can reinvigorate. Not a fixed scale.
- (Not ratings: `n`, `discoveries`, `finds_screened` are counts; `temporal` is a boolean; the
  find→discovery admission is a gate.)

## B. Jungle — core kernel (`src/`), all `0…1`

| system | file | scale | notes |
|---|---|---|---|
| Novelty fitness | `src/fitness.ts` | 0…1 | weights: sourceAbsence .5 / substrateDistance .3 / hiddenDependents .2 |
| Grounding fitness | `src/fitness.ts` | 0…1 | signalStrength .4 / mechanismClarity .25 / falsifiability .25 − riskPenalty .1 |
| 7 component sub-scores | `src/fitness.ts` | 0…1 each | the inputs to the two axes |
| Decay factor | `src/fitness.ts` | 0…1 mult | half-lives **180d** zeitgeist / **730d** else |
| Lens score | `src/lens.ts` | 0…1 | demoFit .35 / evidenceFit .3 / scopeFit .2 / riskFit .15; pass ≥ **0.55** |
| Directional score | `src/select.ts` | 0…1 | primary .7 / secondary .2 / balance .1 |
| Decay-adjusted score | `src/select.ts` | 0…1 | directional × decay factor |
| Selection floors | `src/select.ts` | 0…1 | diverge **0.35** (grounding) / converge **0.25** (novelty); keep = 3 |
| Pareto front | `src/select.ts` | ordinal | front 1, 2, 3… before scalar ranking |

## C. Jungle — discovery / source layer (`tools/source-radar.ts`), already `−5…+5`

| system | scale | notes |
|---|---|---|
| Discovery lens score | **−5…+5** | 3 lenses: capstone-demo-fit, arbitrage, build-moat. hit = **+3**, trap = **−3** |
| effectiveDiscoveryScore | −5…+5 | lensScore × decayFactor |
| Decay half-lives | days | **14d** zeitgeist / **3650d** transfer / **60d** neither |
| Score thresholds | mixed | expireFloor 1, expireMinAgeDays 21, minVolumeToJudge 3, refreshMinRaw 4, refreshDrop 1 |
| resolvedBenchmarks | −5…+5 | calibration bands +4..+5 / +1..+3 / <=0 vs came-true rate |
| Source outcome metrics | rates | volume, hits, traps, hitRate 0…1, trapRate 0…1, avgScore (−5…+5) |

## D. Jungle — human verdicts (`tools/judgments.ts`, `tools/assay.ts`, `tools/assay-report.ts`)

- **Verdict scale** — ordinal 5-point: `dead < obvious < interesting < investigate < keeper`.

## Conflicts to settle (before any jungle reconciliation)

1. **Two scales.** Core kernel is `0…1`; the discovery layer and the garden are `−5…+5`. Our scale
   already matches the discovery layer — the only real mismatch is the `0…1` core. Decide: lift the
   core to `−5…+5`, or keep `0…1` internally and map at the boundary.
2. **Two decay systems, neither zeitgeist-only.** `fitness.ts` (180/730) vs `source-radar.ts`
   (14/3650/60). The garden says decay applies to zeitgeists only. Pick one half-life table and the
   zeitgeist-only rule.
3. **Verdict vs slider.** The garden replaced the ordinal verdict with the single `−5…+5` human
   score; the jungle still runs verdicts in three files. They cannot both be true after reconcile.
