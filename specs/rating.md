# Rating Contract

How nodes are scored, so the judge's and the human's numbers mean the same thing.

## Two kinds of number

- **Measurement** — `0…1`. A raw instrument reading (cosine similarity, token-overlap ratios,
  component scores). No judgment. Computed by the engine. `0.7` is just `0.7`.
- **Rating** — `−5…+5`. A judgment of worth. Negative is not "it doesn't work" — it is "even if
  it works, it's bad" (value-subtracting). `0` is neutral; positive is real contribution.

Measurements are not ratings. They map *into* ratings.

## The map (measurement → rating)

A `0…1` measurement detects **presence**, so it maps to the **positive band only**:

```
rating = round(measurement × 5)        // 0 → 0, 0.5 → +3 (rounded), 1 → +5
```

A measurement can never produce a negative rating, because no single instrument can detect
harm. **Negative ratings are judge-only** — a judgment that an idea is misleading or
value-subtracting, which the generative judge makes and an instrument cannot.

## What gets scored

A node is scored on its **Growth** — the live work of its stage (the recovered problem, or the
doppl), not the whole document. `problem_recovery` and the `doppl` folded from it are scored
separately, so a chain carries a score per stage and progress is the trajectory along it.

Discovery is not scored — it is gated by a signal bar (see the discovery contract), not rated.

## The judge — full rubric + temporal

The judge (the held-out scorer) is the last pass before the compiler. It scores every axis with
justification, boils them to a single `−5…+5`, and emits `temporal`.

The five axes, each `−5…+5`, higher is better, so they combine:

| axis | reads | instrument (deterministic bridge) |
| --- | --- | --- |
| **Novelty** | reaches something not already covered | `round(novelty × 5)` |
| **Grounding** | lands on something true / testable | `round(grounding × 5)` |
| **Falsifiability** | states what would make it wrong (mostly 0+; negative only for a claim engineered to dodge any test) | `round(components.falsifiability × 5)` |
| **Cost-efficiency** | value vs. the all-in cost to own it (money, time, effort, dependencies) | judge-only (no instrument yet → 0) |
| **Relevance** | matters for the current actor / lens | judge-only (no instrument yet → 0) |

`scores.judge` = `round(mean(axes))`, clamped to `−5…+5`.

**Deterministic bridge vs. generative judge.** Until the generative judge (its own contract)
exists, a deterministic bridge fills Novelty / Grounding / Falsifiability from the engine's
measurements per the map above, sets Cost-efficiency / Relevance to `0`, and can never assign a
negative (instruments detect presence, not harm). The generative judge replaces the bridge,
writes per-axis reasoning, and is the only thing that assigns negatives. The axis weights stay
open — start equal-weighted.

## The human — one number

A single `−5…+5` slider: a gut read of the whole node. Never five axes (asking a human to fill
five axes will not happen in practice). Appended to the ratings ledger, one row per rater:

```
{ node_id: UUIDv4, rater_id: string, score: int −5..+5, ts: ISO8601 }
```

`scores.human` is a projection of the ledger: the mean of `score`, with `n` = rater count. At
birth a node is judge-only: `human: null, n: 0`. `delta` (judge − human) is computed at
display, never stored.

> Open: the ledger's home — a JSONL file or a small table. The row shape above is the contract;
> the store is TBD.

## Temporal (decay)

The judge sets `temporal` (boolean). Decay is a time factor applied after scoring, to
zeitgeists only, and only **toward zero**:

- `true` = zeitgeist (timing-bound): a positive score fades toward `0` as its moment passes and
  floors at `0`. Decay never turns a positive into a negative.
- `false` = transfer (timeless): no decay.
- A negative score does not decay — poison stays poison.
- **Reinvigoration:** when circumstances re-validate a faded zeitgeist, it can be rechecked and
  rise again.

The engine's decay factor (a `0…1` time multiplier on the directional score, 180-day half-life
for zeitgeists) is the measurement layer; this is the rating-layer rule it must respect.

## The only scales

`0…1` measurements and `−5…+5` ratings. `temporal` is a boolean. There is no other scale. The
old ordinal verdict (`dead/obvious/interesting/investigate/keeper`) is retired in favor of the
single `−5…+5` human slider.
