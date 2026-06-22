# Doppl

Doppl is an experimental **agental-evolution runtime**. A human seeds a run, Doppl spawns a bounded population of agents that generate candidate ideas, an adversarial critic council evaluates them, and the strongest lineages survive, fuse, mutate, and produce later generations.

The goal: show that a later generation produces stronger, more verifiable ideas than an earlier one — with lineage, energy, critic evidence, and fitness all visible in a live, replayable dashboard.

This is a two-week Gauntlet capstone (MVP/prototype). Showcase: **June 29, 2026**.

## Where to look

- `ARCHITECTURE.md` — the design contract / source of truth.
- `IMPLEMENTATION_PLAN.md` — the spec-anchored build plan.
- `docs/` — planning artifacts and gap audits.
- `kernel/` — deterministic Dalton kernel fixture loop.

## Dalton Kernel Fixture

Run the deterministic fixture kernel:

```bash
npm test
npm run kernel:run
```

The command writes markdown-vault artifacts, `trace.json`, and replayable `events.jsonl` under `kernel/out/vault/`.
It also writes a browser-readable proof board to `kernel/out/proof-board/index.html`.

Refresh the committed static preview:

```bash
npm run kernel:publish
```

The static preview index is written to `published/index.html`; the kernel proof board is written to `published/kernel/`.

## Status

Early. This README is a placeholder — add to it as the project takes shape.
