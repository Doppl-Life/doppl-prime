# Rating Model — the single source of truth for scoring

All scoring lives here. If scoring happens anywhere else, it conforms to this — or it is the jungle.

## The scale: −5 to +5

One scale for everything. **Negative is not "it doesn't work" — it is "even if it works, it's bad."**
Cut off your head to cure a headache: maximally effective, maximally wrong. That is a −5.

- **Positive** — real contribution (a sprout).
- **0** — neutral.
- **Negative** — value-subtracting: harmful, disproportionate, misleading, regressive (a weed).

## Two raters, two shapes

- **Human — one number.** A single slider, −5…+5: a gut snapshot of the whole node. Never five axes.
- **Judge — the full rubric.** Scores every axis, records them with reasoning, and boils them to a
  single −5…+5 to compare. `delta = judge − human`.

The node's `scores: { judge, human, n }` are the two single numbers. The judge's per-axis detail and
reasoning live on the node in `## Evaluation` — the ground truth for that node — and in the ledger.

## The five axes (judge only)

Each runs −5…+5, oriented so higher is better, so they sum.

| axis | +5 | 0 | −5 |
|---|---|---|---|
| **Novelty** | genuinely new ground | incremental | derivative — re-treads served ground, dressed as new |
| **Grounding** | testable, sourced, mechanism-clear | unsupported but honest | misleading — fake support or a false mechanism |
| **Worth the squeeze** | lots of juice, little squeeze | fair trade | blood from a stone — works, but the cost (money, time, effort, energy, dependencies) is absurd |
| **Lens fit** | matters sharply for this actor | indifferent | actively wrong for this actor |
| **Falsifiability** | a sharp, named falsifier | none offered | immunized — built to dodge any test |

**Falsifiability runs hot toward 0.** Most claims sit at 0 (no falsifier) or positive (has one).
Negative is **rare** — reserved only for a claim *engineered to be irrefutable* (motte-and-bailey,
unfalsifiable by design), which resists correction and is worse than silence. If you're scoring it
negative, it had to actively dodge testing.

## Decay (zeitgeist only)

Decay is a time factor, not an axis. It applies only when `temporal: true` (zeitgeist — true because
of the moment): the effective score erodes toward negative as the moment passes, and can
**reinvigorate** when a new signal re-validates it. When `temporal: false` (transfer), there is no
decay — a mechanism is solved or it isn't.

`temporal` is a boolean on the node. It is the only piece of the old `subtype` worth keeping.

## Who marks it

Humans rate `problem_recovery` and the leaf. **Discovery is not rated** — it is gated by admission
(find vs. discovery), not scored. The human surface that writes the ledger is the **Assay / Agora**
surface. Each rating is one append-only row; `scores` are a recomputed projection. `n` = number of
human raters. `delta` is computed at display, never stored.

## Verdicts: dead

`dead / obvious / interesting / investigate / keeper` is replaced by the single −5…+5 human score. It
still lives in the kernel (`tools/judgments.ts`, `tools/assay.ts`) — jungle, reconciled later.
