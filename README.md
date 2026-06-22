# Doppl

Doppl is an experimental **agental-evolution runtime**. A human seeds a run, Doppl spawns a bounded population of agents that generate candidate ideas, an adversarial critic council evaluates them, and the strongest lineages survive, fuse, mutate, and produce later generations.

The goal: show that a later generation produces stronger, more verifiable ideas than an earlier one — with lineage, energy, critic evidence, and fitness all visible in a live, replayable dashboard.

This is a two-week Gauntlet capstone (MVP/prototype). Showcase: **June 29, 2026**.

## Where to look

- `ARCHITECTURE.md` — the design contract / source of truth.
- `IMPLEMENTATION_PLAN.md` — the spec-anchored build plan.
- `docs/` — planning artifacts and gap audits.
- `calibrator/` — vault-first human calibration workbench.
- `published/calibrator/` — read-only static export of the calibrator.

## Published preview

The `calibration` branch can deploy the committed `published/` folder with GitHub Pages.

- Preview index: `published/index.html`
- Calibrator preview: `published/calibrator/index.html`

Run `npm --prefix calibrator run export:static` before committing changes that should appear in the static preview.

## Status

Early. This README is a placeholder — add to it as the project takes shape.
