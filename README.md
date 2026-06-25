# Doppl

Doppl evolves ideas the way a population evolves: generate many candidates, apply
selective pressure, breed the survivors into the next round. One engine —
*generation under selection* — run along a spine of stages, scored, and rendered into
portable nodes.

**PSaaS — Problem-Solving as a Service.** Consulting has always been this; the
infrastructure was just unscalable and unreproducible. Doppl makes it so.

## Where the truth lives

**The model is frozen into `contracts/` (typed shapes) and `mechanics/` (kernel behavior);**
`my-docs/the-hut/` holds what is still being decided. When canon and the running kernel
(`src/`, `tools/`) disagree, canon wins — the kernel follows, deliberately. Map:

- [`my-docs/the-hut/README.md`](my-docs/the-hut/README.md) — start here: how to read the hut.
- [`my-docs/the-hut/PROPOSAL.md`](my-docs/the-hut/PROPOSAL.md) — the unified frame. **Read first.**
- [`contracts/node.md`](contracts/node.md) — stages, the node, the flow.
- [`mechanics/kernel/engine.md`](mechanics/kernel/engine.md) — the generate→select crucible behind each stage.
- [`contracts/rating.md`](contracts/rating.md) — the −5…+5 scoring source of truth.
- [`my-docs/GLOSSARY.md`](my-docs/GLOSSARY.md) — the vocabulary.

## The spine

```
case_study → problem_recovery → doppl → (the human's action)
```

A **case_study** is the seed. **problem_recovery** recovers the real problem behind the
surface symptom. A **doppl** is the finished answer — the unlock. Each arrow is one pass of
the crucible (`mechanics/kernel/engine.md`): generate candidates → score (novelty × grounding measurements) →
select survivors under a diverge/converge dial → lens. A problem may yield more than one
doppl.

## The kernel

The engine lives in `src/`:

- `src/contracts/index.ts` — the machine contracts.
- `src/trace.ts` — `buildRunTrace()`, the canonical pipeline. The trace is the specimen.
- `src/generate.ts` · `src/fitness.ts` · `src/select.ts` · `src/lens.ts` — the crucible.

Fitness keeps **novelty and grounding** as separate 0–1 measurements, never collapsed before
selection. **Decay** is the engine's time axis: a `temporal` (zeitgeist) idea decays on a
180-day half-life; a transfer (timeless) idea does not. Feasibility is a **lens** applied
after selection. These 0–1 measurements map into the judge's −5…+5 **ratings**
(`contracts/rating.md`); they are not ratings themselves.

## Run it

```bash
pnpm build          # typecheck + the multi-seed proof board
pnpm proof          # the proof board alone
pnpm grow           # grow a seed end-to-end into the vault (flow/ + stock/)
pnpm proof:export   # replay artifacts under out/proof-board/** (ephemeral, gitignored)
pnpm clear:run-data    # clear local out/** run data
```

`pnpm grow <node-slug>` runs a node through discovery → engine → compile and writes contract-shaped
markdown to the vault named in `doppl.config.json` (`vault`, default `../agarden`). The sink
([`mechanics/kernel/sink.md`](mechanics/kernel/sink.md)) is the only writer. Pass a vault path as the
2nd arg to override, e.g. `pnpm grow my-node ../other-vault`.

The proof board prints one line per seed:
`seed → generated → rejected → Explore keeps → Proof keeps → swap → failed checks`.

## Registers

Durable findings have one home each (see [`AGENTS.md`](AGENTS.md)): build contracts in
`contracts/**`, fork decisions in `MEMORY.md`, lessons in `LESSONS_AND_BANGERS.md`, portable moves
in `HEURISTICS.md`, failures in `BUGS_AND_MITIGATIONS.md`, watch items in
`OPERATIONAL_WATCHLIST.md`, terms in `GLOSSARY.md`, invariants in `INVARIANTS.md`.
