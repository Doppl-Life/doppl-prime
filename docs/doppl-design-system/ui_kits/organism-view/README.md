# UI Kit — Organism View (S2)

The centerpiece Doppl screen: a **real-time window into the kernel runtime**. A fixture-driven recreation
of the live S2 "Organism View" where the room watches the population evolve.

Open **`index.html`**.

## What it shows (all streaming off one timeline)

- **RunHeader** — wordmark, run title (`run_7f3a`), `ModeBanner` (LIVE → COMPLETE), generation counter, and
  the draining `RunEnergyGauge`.
- **Lineage graph** (`LineageGraph.jsx`) — the living family tree. Agenomes spawn, **fuse** (two parents →
  one child, converging violet braid), **mutate** (amber dashed), and **cull** (fade + sink). The gold
  **winner** blooms off its parent at the end.
- **Agent roster** (`AgentRoster.jsx`) — the per-agent readout: every agenome in the population, *what it's
  doing right now* (derived from the latest event with that actor), and its **energy draw** as a live meter.
- **Kernel activity** (`ActivityTicker`) — the reverse-chron event heartbeat.
- **Runtime health** (`HealthIndicator`) — generation, candidates in flight, caps consumed.
- **Critic gauntlet + held-out judge** (`CriticGauntletPanel`) — rows arrive as critics review; the frozen,
  immutable-to-agents judge anchors the bottom.
- **Fitness sparkline** — best-fitness-per-generation climbing above the gen-0 baseline.

## How it's driven

Everything is a pure function of a single integer **`step`** (0…18), advanced on a 1.1s timer — exactly how
production drives the same components off the sequence-keyed SSE reducer (`GET /runs/:id/stream`). Play /
pause / restart / scrub via the timeline. Scrubbing backward flips the mode banner to REPLAY (static), so
"is it live?" is always answerable.

- `data.jsx` — the canonical fixture + canned event timeline (`window.DopplKit`). Source of truth:
  `uploads/10-dummy-data-fixtures.md` (`run_7f3a`). Swap this for the real API to go live; the components
  don't change.
- `LineageGraph.jsx` / `AgentRoster.jsx` — kit-local screen pieces (exported to `window`).
- All telemetry panels come from the design-system bundle (`window.DopplDesignSystem_352b49`), not
  re-implemented here.

> Recreation, not redesign — composed from the design-system primitives. Fitness/critic/judge values are all
> normalized **0–1** (see the scale note in the root `readme.md`).
