# Doppl

Doppl evolves ideas the way a population evolves: generate many candidates, apply
selective pressure, breed the survivors into the next round. One engine —
*generation under selection* — run along a spine of stages, scored, and rendered into
portable nodes.

**PSaaS — Problem-Solving as a Service.** Consulting has always been this; the
infrastructure was just unscalable and unreproducible. Doppl makes it so.

## Where the truth lives

**The model is frozen into `src/contracts/` (typed shapes) and `src/mechanics/` (kernel behavior);**
`my-docs/the-hut/` holds what is still being decided. When canon and the running kernel
(`src/kernel/`) disagree, canon wins — the kernel follows, deliberately. Map:

- [`my-docs/the-hut/README.md`](my-docs/the-hut/README.md) — start here: how to read the hut.
- [`my-docs/the-hut/PROPOSAL.md`](my-docs/the-hut/PROPOSAL.md) — the unified frame. **Read first.**
- [`src/contracts/node.md`](src/contracts/node.md) — stages, the node, the flow.
- [`src/mechanics/engine.md`](src/mechanics/engine.md) — the generate→select crucible behind each stage.
- [`src/contracts/rating.md`](src/contracts/rating.md) — the −5…+5 scoring source of truth.
- [`my-docs/GLOSSARY.md`](my-docs/GLOSSARY.md) — the vocabulary.

## The spine

```
case_study → problem_recovery → doppl → (the human's action)
```

A **case_study** is the seed. **problem_recovery** recovers the real problem behind the
surface symptom. A **doppl** is the finished answer — the unlock. Each arrow is one pass of
the crucible (`src/mechanics/engine.md`): generate candidates → score (novelty × grounding measurements) →
select survivors under a diverge/converge dial → lens. A problem may yield more than one
doppl.

## The Architecture

Doppl's product loop is nodes in, nodes out:

```text
agarden flow/stock -> kernel trace and agenomes -> agarden flow/stock
```

The configured agarden vault is the durable source and sink.
The local default is `../agarden`, but the path is configurable in `doppl.config.json`.
If the configured vault is missing, product commands should fail loudly.

Inputs are MarkScript nodes from `flow/`.
A seed is a `case_study` node with `prev_id: null`.
A reseeded case study is the same stage with `prev_id` pointing at the doppl that produced it.

Outputs are surviving nodes written back to `flow/` and admitted stock written to `stock/`.
The kernel's in-memory trace, event stream, candidate pool, and agenomes are inner runtime state, not durable outer artifacts.

See [`my-docs/ARCHITECTURE.md`](my-docs/ARCHITECTURE.md).

## The kernel

The engine lives in `src/kernel/`, grouped by the spine (`engine/`, `model/`, `discovery/`,
`compile/`, `sink/`, `trace/`, `projection/`, `server/`):

- `src/kernel/boundary.ts` — runtime boundary contracts.
- `src/kernel/engine/run-kernel.ts` — the generate-under-selection loop.
- `src/kernel/trace/event-store.ts` — the live trace/event projection.
- `src/kernel/sink/vault-sink.ts` — the writer for agarden flow nodes.

Fitness keeps **novelty and grounding** as separate 0–1 measurements, never collapsed before
selection. **Decay** is the engine's time axis: a `temporal` (zeitgeist) idea decays on a
180-day half-life; a transfer (timeless) idea does not. Feasibility is a **lens** applied
after selection. These 0–1 measurements map into the judge's −5…+5 **ratings**
(`src/contracts/rating.md`); they are not ratings themselves.

## Run it

```bash
pnpm build          # typecheck + lint + tests + web build
pnpm kernel:run     # run the kernel CLI
pnpm kernel:serve   # serve the dashboard and kernel HTTP API
pnpm web:build      # build the React dashboard
```

The product target is configured in `doppl.config.json` (`vault`, local default `../agarden`).
The sink ([`src/mechanics/sink.md`](src/mechanics/sink.md)) is the only writer.

## Registers

Durable findings have one home each (see [`AGENTS.md`](AGENTS.md)): build contracts in
`src/contracts/**`, fork decisions in `MEMORY.md`, lessons in `LESSONS_AND_BANGERS.md`, portable moves
in `HEURISTICS.md`, failures in `BUGS_AND_MITIGATIONS.md`, watch items in
`OPERATIONAL_WATCHLIST.md`, terms in `GLOSSARY.md`, invariants in `INVARIANTS.md`.
