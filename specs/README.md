# Kernel Specs

Specs are frozen build contracts. The **model** is defined in the garden
([`my-docs/garden/**`](../my-docs/garden)); a spec is where a garden decision lands once it is
deliberately frozen into the kernel. `MEMORY.md` records fork decisions. Anything else is
source material only while it is being mined.

## Current contracts

The engine and evaluation contracts currently live in the garden, which is canon:

- [`my-docs/garden/engine.md`](../my-docs/garden/engine.md) — the generate/evaluate/select
  runtime, the dial, fitness measurements, decay, caps, lineage, and the trace boundary.
- [`my-docs/garden/rating-model.md`](../my-docs/garden/rating-model.md) — the −5…+5 rating, the two raters, and the zero-decay temporal seam.
- [`my-docs/garden/object-model.md`](../my-docs/garden/object-model.md) — stages, the node, the
  stock, and the signals.

No spec files are frozen yet. When a garden contract is frozen, add it here.

## Draft MarkScript specs

These are working contracts, not frozen kernel contracts yet:

- [`node.md`](./node.md) — the markdown node file shape.
- [`rating.md`](./rating.md) — the rating scale, judge evaluation, human score projection, and temporal policy.
- [`human-ratings-ledger.md`](./human-ratings-ledger.md) — the human rating source and projection contract.
- [`stock.md`](./stock.md) — the stock field source/projection contract.

If a new doctrine affects how the kernel runs or is judged, freeze it here. If it only records
why we chose a fork, put it in [`../MEMORY.md`](../MEMORY.md).
