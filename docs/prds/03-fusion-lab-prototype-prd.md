# PRD 03: Fusion Lab Prototype

## Prototype Question

Can Doppl make reproduction feel real: two parent agenomes combine through weighted inheritance, producing a child whose proposal and scores can be compared against both parents?

## Audience Moment

Within 10 seconds, a viewer should understand that fusion is not prompt concatenation. Parent traits, critic evidence, and fitness pressure produce an offspring with visible inherited strengths and tradeoffs.

## User Workflow

- Browse the mutagen pool.
- Drag or click agenomes into Parent A and Parent B slots.
- See parent proposals, scores, and critic verdicts.
- See the fusion ratio and inheritance logic.
- Compare the child proposal, inherited traits, and yield against both parents.

## Required Data / Events

- `agenome.spawned`
- `agenome.fused`
- `agenome.mutated`
- `candidate.created`
- `critic.reviewed`
- `fitness.scored`
- `novelty.scored`
- `ReproductionEvent`
- `LineageGraphProjection`

## Acceptable Fixture

The current prototype can use saved model batches for all pairwise parent combinations. The UI must disclose that no model calls happen in the browser demo.

## Convincing Demo Bar

- Parent selection is physically and visually obvious.
- Parent outputs are meaningfully different.
- Fusion ratio and inheritance logic explain the child.
- The child is not always better; comparison must preserve tradeoffs.
- Scores and yield make the child evaluation concrete.

## Falsification Bar

This prototype fails if fusion looks like a random generator, if inherited traits are decorative labels, or if the child always wins without evidence.

## Graduation Path

Connect parent sockets to real lineage state and reproduction events. Later versions should allow replaying why parents were eligible, why the ratio was chosen, what mutation occurred, and whether the child improved the generation.

