# Proposal — the current doppl frame

This is the hut proposal: the model we are shaping before the kernel catches up.

```mermaid
flowchart LR
  cs[case_study] --> pr[problem_recovery] --> dp[doppl]
  pr -. calls .-> disc[discovery]
  dp -. calls .-> disc
  disc <--> stock[stock]
```

## Bedrock

Doppl turns a case study into a recovered problem and then into one or more actionable doppls.

The durable artifact is markdown. A human should be able to read it directly, and a service should be able to parse it into a typed shape.

Every durable object needs one source of truth. Rendered markdown can be an authored artifact, a materialized projection, or both by section, but the contract must say which facts are owned elsewhere.

## Lifecycle

The spine is fixed: `case_study → problem_recovery → doppl`.

`case_study` is the seed. It does not call discovery and it is not scored.

`problem_recovery` recovers the actual problem from the case. It is scored on Growth.

`doppl` is the finished answer, unlock, opportunity, or solution surface. A recovered problem can produce more than one doppl when the answers are genuinely distinct.

After a doppl, the path points out of the system into human action.

## Node

A node is one markdown file with frontmatter and a body.

Growth-stage nodes carry `## Trace`, `## Discovery`, `## Growth`, and `## Path`.

`## Growth` is the scored surface. It contains the current stage's full work and the judge's `### Evaluation`.

Trace copies prior stage synopses verbatim. Discovery records what was found. Path names the next stage.

The node contract lives in [`../../specs/node.md`](../../specs/node.md).

## Discovery And Stock

Discovery is a kernel function with one job: gather context. It reads stock first, reaches outward through a backend only when needed, keeps only what clears the bar, and returns context to the calling stage.

Stock is durable domain memory. It stores admitted discoveries, not raw search output and not conclusions.

Stock has two gates: admission decides whether a find is worth remembering, and enrichment decides whether an admitted discovery is new, merged, or dropped as a rehash.

The stock contract lives in [`../../specs/stock.md`](../../specs/stock.md).

## Engine

Each spine arrow runs the generate→fitness→select→lens crucible.

The engine does not merely pick the best candidate. It breeds a stronger child from a population, rejects no-delta rehashes, and records the trace as the specimen.

The selection dial still matters: diverge favors novelty under a grounding floor; converge favors grounding under a novelty floor.

The second axis is still open. The current engine uses novelty × grounding, but truth × consensus-gap may be the better model. Keep score detail rich enough to test that without rewriting the corpus.

## Lens

Lens stays separate from the judge.

The judge rates worth. The lens asks whether the survivor is actionable for a specific actor, context, or constraint set.

Lens runs after selection and must not contaminate novelty, grounding, or rating.

## Rating

There are two kinds of numbers.

Measurements are `0...1` instrument readings. They carry no judgment.

Ratings are `-5...+5` judgments of worth. Negative means value-subtracting, not merely ineffective.

The judge fills the five-axis evaluation and boils it down to `scores.judge`.

The human gives one slider. Human ratings live in the human ratings ledger, one current rating per `(node_id, rater_id)`, where `rater_id` is email for the demo.

The node stores only the materialized human projection: `scores.human` and `scores.n`.

The rating contract lives in [`../../specs/rating.md`](../../specs/rating.md). The human ratings contract lives in [`../../specs/human-ratings-ledger.md`](../../specs/human-ratings-ledger.md).

## Temporal

`temporal` remains a boolean seam for time-bound ideas.

Active decay is configured to `0`: no score changes with age, and the effective multiplier is `1`.

A future decay mechanism can bolt onto `temporal` without changing the node shape.

## Open

The measurement-to-rating bridge is still real work. We know measurements feed ratings; we have not finished the map.

The second selection axis is still real work. Novelty × grounding may be enough, but truth × consensus-gap may be closer to the thing we actually value.

The human ratings projection runner is intentionally open. The data structure is fixed; the mechanism can be a local command, scheduled job, GitHub Action, or service.
