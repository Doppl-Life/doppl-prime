# Rating Inventory — measurements vs ratings, and the map between them

The confusion this file should kill: there are two *kinds* of number in this system, and they are
not the same thing.

## Two kinds of number

- **Measurements** — `0…1`. Raw instrument readings: cosine similarity, token-overlap ratios, hit
  rates. A tool computes them; they carry no judgment. 0.7 similarity is just 0.7 similarity.
- **Ratings** — `−5…+5`. A judgment of worth: good, neutral, or actively bad. This is what we care
  about, and what the judge and humans produce.

**The job is the map.** Measurements (`0…1`) get translated *into* ratings (`−5…+5`). A novelty
rating of +4 might be computed from a low similarity measurement; a grounding rating of −5
("misleading") is a judgment no single instrument can make alone. Instruments feed the rating; they
are not the rating. This is the "map what we want onto what it will be."

## The measurements (`0…1` instruments, `src/`)

Tools, not verdicts — they should be **mapped into** the −5…+5 rating, never shown as-is:

- novelty / grounding fitness and their 7 sub-components (token-overlap and keyword ratios)
- lens score and directional score (weighted blends of the above)
- decay factor (a 0…1 time multiplier)
- selection floors (0.35 / 0.25) and Pareto fronts (an ordinal ranking)

## The ratings that already exist (`−5…+5`, `tools/source-radar.ts`)

The discovery / source layer already rates on −5…+5 (its lenses, hit +3 / trap −3, resolved
benchmarks). So our scale is **not new** — this layer already speaks it. The only mismatch is with
the `0…1` core.

## The verdict (`tools/judgments.ts`) — being retired

`dead < obvious < interesting < investigate < keeper` is an ordinal rating we've replaced with the
single −5…+5 human slider.

## What to decide (the real questions)

1. **The map.** For each `0…1` instrument, which −5…+5 rating does it inform, and how? (similarity →
   novelty; signal strength → grounding; …) The instruments stay `0…1`; only the rating is `−5…+5`.
2. **Decay.** Two half-life tables exist (180/730 and 14/3650/60). Pick one, zeitgeist-only.
3. **Verdict → slider.** Finish retiring the ordinal verdict.
