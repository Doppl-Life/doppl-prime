# Proposal — the current doppl frame

This is the hut proposal: the model we are shaping before the kernel catches up.

```mermaid
flowchart LR
  cs[case_study] --> pr[problem_recovery] --> dp[doppl]
  dp -. reseed .-> cs
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

A doppl may also be **reseeded** as a fresh `case_study` — the forest loop — starting a new island that links back to the doppl via `prev_id`. This is the one back-edge in the graph; it does not change the three-stage spine. An original seed has no parent (`prev_id: null`); a reseeded case study carries `prev_id: [[doppl]]`.

## Node

A node is one markdown file with frontmatter and a body.

Growth-stage nodes carry `## Trace`, `## Discovery`, `## Growth`, and `## Path`.

`## Growth` is the scored surface. It contains the current stage's full work and the judge's `### Evaluation`.

Trace copies prior stage synopses verbatim. Discovery records what was found. Path names the next stage.

The node contract lives in [`../../src/contracts/node.md`](../../src/contracts/node.md).

## Discovery And Stock

Discovery is a kernel function with one job: gather context. It reads stock first, reaches outward through a backend only when needed, keeps only what clears the bar, and returns context to the calling stage.

Stock is durable domain memory. It stores admitted discoveries, not raw search output and not conclusions.

Stock has two gates: admission decides whether a find is worth remembering, and enrichment decides whether an admitted discovery is new, merged, or dropped as a rehash.

The stock contract lives in [`../../src/contracts/stock.md`](../../src/contracts/stock.md).

## Engine

Each spine arrow runs the generate→fitness→select→lens crucible.

The engine does not merely pick the best candidate. It breeds a stronger child from a population, rejects no-delta rehashes, and records the trace as the specimen.

The selection dial still matters: diverge favors novelty under a grounding floor; converge favors grounding under a novelty floor.

## Selection Aim

The engine is not looking for novelty for its own sake. It is trying to surface true, non-obvious, actionable implications.

For now, `novelty × grounding` is the measurable selector. Novelty is the proxy for "not already in the visible record"; grounding is the proxy for "not merely clever."

Consensus-gap names a goal we may later learn to measure, but it is not a typed contract yet.

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

The rating contract lives in [`../../src/contracts/rating.md`](../../src/contracts/rating.md). The human ratings contract lives in [`../../src/contracts/human-ratings-ledger.md`](../../src/contracts/human-ratings-ledger.md).

## Temporal

`temporal` remains a boolean seam for time-bound ideas.

Active decay is configured to `0`: no score changes with age, and the effective multiplier is `1`.

A future decay mechanism can bolt onto `temporal` without changing the node shape.

## Open

The measurement-to-rating bridge is still real work. We know measurements feed ratings; we have not finished the map.

The human ratings projection runner is intentionally open. The data structure is fixed; the mechanism can be a local command, scheduled job, GitHub Action, or service.
