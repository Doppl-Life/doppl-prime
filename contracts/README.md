# Contracts

The MarkScript contracts for the model — what each durable artifact must contain so a human can read it and a parser can recover it. The **model** is defined in the hut ([`my-docs/the-hut/**`](../my-docs/the-hut)); a contract here is where a hut decision lands once it is deliberately frozen into the kernel. `MEMORY.md` records fork decisions.

> Not to be confused with the kernel's **boundary contracts** — the runtime module-I/O packets — which live beside their code at [`src/contracts/`](../src/contracts/README.md). These are *model artifact* contracts; those are *runtime boundary* contracts.

## Defined in the hut (canon)

The engine and evaluation contracts currently live in the hut, which is canon:

- [`my-docs/the-hut/engine.md`](../my-docs/the-hut/engine.md) — the generate/evaluate/select
  runtime, the dial, fitness measurements, decay, caps, lineage, and the trace boundary.
- [`my-docs/the-hut/rating-model.md`](../my-docs/the-hut/rating-model.md) — the −5…+5 rating, the two raters, and the zero-decay temporal seam.
- [`my-docs/the-hut/object-model.md`](../my-docs/the-hut/object-model.md) — stages, the node, the
  stock, and the signals.

No contract files are frozen yet. When a hut contract is frozen, add it here.

## Draft MarkScript contracts

These are working contracts, not frozen kernel contracts yet:

- [`node.md`](./node.md) — the markdown node file shape.
- [`run-trace.md`](./run-trace.md) — the machine trace for one engine pass and compiler handoff.
- [`projection.md`](./projection.md) — the field-by-field map from `RunTrace` to a compiled node.
- [`rating.md`](./rating.md) — the rating scale, judge evaluation, human score projection, and temporal policy.
- [`human-ratings-ledger.md`](./human-ratings-ledger.md) — the human rating source and projection contract.
- [`stock.md`](./stock.md) — the stock field source/projection contract.

If a new doctrine affects how the kernel runs or is judged, freeze it here. If it only records
why we chose a fork, put it in [`../MEMORY.md`](../MEMORY.md).
