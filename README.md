# Doppl

Doppl evolves ideas the way a population evolves: generate many candidates, apply
selective pressure, breed the survivors into the next round. One engine —
*generation under selection* — run along a spine of stages, scored, and rendered into
portable nodes.

## Where the truth lives

**The garden is canon.** `my-docs/garden/` is where the model is defined and where we
operate from. When the garden and the running kernel (`src/`, `tools/`) disagree, **the
garden wins** — the kernel follows, deliberately. Start there:

- [`my-docs/garden/README.md`](my-docs/garden/README.md) — the hut: how to read the garden.
- [`my-docs/garden/PROPOSAL.md`](my-docs/garden/PROPOSAL.md) — the unified frame. **Read first.**
- [`my-docs/garden/object-model.md`](my-docs/garden/object-model.md) — stages, the node, the flow.
- [`my-docs/garden/engine.md`](my-docs/garden/engine.md) — the generate→select crucible behind each stage.
- [`my-docs/garden/rating-model.md`](my-docs/garden/rating-model.md) — the −5…+5 scoring source of truth.
- [`my-docs/garden/LEXICON.md`](my-docs/garden/LEXICON.md) — the vocabulary.

## The spine

```
case_study → problem_recovery → doppl → (the human's action)
```

A **case_study** is the seed. **problem_recovery** recovers the real problem behind the
surface symptom. A **doppl** is the finished answer — the unlock. Each arrow is one pass of
the crucible (`engine.md`): generate candidates → score (novelty × grounding measurements) →
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
(`rating-model.md`); they are not ratings themselves.

## Run it

```bash
pnpm build          # typecheck + the multi-seed proof board
pnpm proof          # the proof board alone
pnpm proof:export   # replay artifacts under out/proof-board/** (ephemeral, gitignored)
pnpm case-study:lint   # verify seed-visible case material leaks no evaluator-only language
pnpm clear:run-data    # clear local out/** run data
```

The proof board prints one line per seed:
`seed → generated → rejected → Explore keeps → Proof keeps → swap → failed checks`.

## Registers

Durable findings have one home each (see [`AGENTS.md`](AGENTS.md)): build contracts in
`specs/**`, fork decisions in `MEMORY.md`, lessons in `LESSONS_AND_BANGERS.md`, portable moves
in `HEURISTICS.md`, failures in `BUGS_AND_MITIGATIONS.md`, watch items in
`OPERATIONAL_WATCHLIST.md`, terms in `GLOSSARY.md`, invariants in `INVARIANTS.md`.
