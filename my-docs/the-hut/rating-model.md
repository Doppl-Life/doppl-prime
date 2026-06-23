# Rating Model — the single source of truth for scoring

How nodes are scored, so judge and human numbers mean the same thing.

## What gets scored

A node is scored on its **Growth** — the live work of its stage (the recovered problem, or the
doppl), not the whole document. A `problem_recovery` node and the `doppl` folded from it are scored
separately, so a chain carries a score per stage and progress is the trajectory along the chain.

**Discovery is not scored** — it is gated by a signal bar (`discovery-skill.md`), not rated.

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
- **Cost-efficiency** — the all-in cost to own it (money, time, effort, energy, dependencies),
scored as efficiency: cheap = +, ruinous = −.
- **Relevance** — matters for the current actor. The lens remains a separate post-selection feasibility pass.

On the node these live in `### Evaluation` as one `#### <axis> <score>` subsection each, carrying the
judge's full reasoning — not capped at a sentence. The single `scores.judge` is their boil-down.

## Temporal

The judge sets `temporal` (boolean).

`true` = timing-bound, eligible for future decay.

`false` = timeless.

Decay is configured to `0` for now. Active effect: none. The score does not change with age.

- `temporal: true` preserves the seam for a later time function.
- `temporal: false` remains ineligible for decay.
- Future decay, if added, bolts onto this field rather than changing the rating shape.

(The only scales in the system are `0–1` measurements and `−5…+5` ratings; `temporal` is a boolean. There is no other scale.)

## Where the numbers live

- **Judge** writes the node: `### Evaluation`, `scores.judge`, `temporal`. Runs once, at generation.
- **Humans** write to the **human ratings ledger** — one current rating per `(node_id, rater_id)`, where `rater_id` is the rater's email for the demo: `{ node_id, ratings: [{ rater_id, score: -5..+5, rate_date }] }`. One score, because the human gives one slider.
- The node's `scores.human` is a materialized **projection** of that ledger: the mean of current `score` values, rounded to one decimal place, with `n` = current rater count. **At birth a node is judge-only: `human: null, n: 0`.**
- A projection runner recomputes `scores.human` and `scores.n` from the ratings ledger and writes them back into node frontmatter. The mechanism is open for now; the data shape is the contract.
- `delta` (judge − human) is computed at display, never stored.
