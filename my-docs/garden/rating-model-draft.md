# Rating Model — the single source of truth for scoring

How nodes are scored, so judge and human numbers mean the same thing.

## What gets scored

A node is scored on its **Growth** — the live work of its stage (the recovered problem, or the
doppl), not the whole document. A `problem_recovery` node and the `doppl` folded from it are scored
separately, so a chain carries a score per stage and progress is the trajectory along the chain.

**Discovery is not scored** — it is gated by a signal bar (`discovery-skill-draft.md`), not rated.

## The scale: −5 to +5

One scale. **Negative is not "it doesn't work" — it is "even if it works, it's bad."** Cut off your
head to cure a headache: maximally effective, maximally wrong. That is a −5. Positive = real
contribution (sprout); 0 = neutral; negative = value-subtracting (weed).

## Two raters, two shapes

- **Human — one number.** A single slider, −5…+5: a gut snapshot of the whole node. Never five axes.
- **Judge — the full rubric + temporal.** Scores every axis with justification, boils them to a
single −5…+5, and emits `temporal`. The judge is the last pass before the compiler.

## The five axes (judge)

Each runs −5…+5, higher is better, so they sum:

- **Novelty** — reaches something not already covered.
- **Grounding** — lands on something true / testable.
- **Falsifiability** — states what would make it wrong. (Mostly 0 or positive; negative is rare —
reserved for a claim engineered to dodge any test.)
- **Worth the squeeze** — the all-in cost to own it (money, time, effort, energy, dependencies),
scored as efficiency: cheap = +, ruinous = −.
- **Lens fit** — matters for the current actor / lens.

On the node these live in `### Evaluation` as one `#### <axis> <score>` subsection each, carrying the
judge's full reasoning — not capped at a sentence. The single `scores.judge` is their boil-down.

## Temporal (decay)

The judge sets `temporal` (boolean).

`true` = zeitgeist (timing-bound: decays over time, can reinvigorate).

`false` = transfer (timeless: no decay).

Decay is a time factor applied after scoring, to zeitgeists only, and it **only decays toward zero**:

- A positive zeitgeist score fades toward 0 as its moment passes, and floors at 0. Decay never turns a sprout into a weed.
- A negative score does not decay — it's already bad; poison stays poison.
- **Reinvigoration:** when circumstances re-validate a faded zeitgeist, it can be rechecked and rise again.

(The only scales in the system are `0–1` measurements and `−5…+5` ratings; `temporal` is a boolean. There is no other scale.)

## Where the numbers live

- **Judge** writes the node: `### Evaluation`, `scores.judge`, `temporal`. Runs once, at generation.
- **Humans** append to the **ratings ledger** — one row per rater per node:
`{ node_id, rater_id, score: -5..+5, ts }`. One score, because the human gives one slider.
- The node's `scores.human` is a recomputed **projection** of that ledger: the mean of `score`, with
`n` = rater count. **At birth a node is judge-only: `human: null, n: 0`.**
- `delta` (judge − human) is computed at display, never stored.

> Open: the ledger's home — a JSONL file (lean; matches the existing `judgments.jsonl`) or a small
> DB. The row shape above is the contract; the store is TBD.

## Verdicts: dead

`dead / obvious / interesting / investigate / keeper` is replaced by the single −5…+5 human slider.
It still lives in the kernel — jungle, reconciled later.