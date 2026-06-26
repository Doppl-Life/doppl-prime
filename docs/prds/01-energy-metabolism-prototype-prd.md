# PRD 01: Energy Metabolism Prototype

## Prototype Question

Can Doppl make bounded evolutionary pressure legible: finite energy enters a run, agenomes spend it productively, weak or redundant lineages are culled, and surviving evidence feeds reproduction?

## Audience Moment

Within 10 seconds, a viewer should understand that Doppl is not an infinite chat loop. It is a bounded organism with metabolism: every useful action spends scarce energy, every lineage competes under constraints, and the kernel decides what survives.

## User Workflow

- View a case entering the run.
- See a fixed run energy budget.
- Inspect individual agenomes with energy, fitness, and novelty.
- Follow culling and fusion pressure through the graph.
- Inspect the child agenome and its candidate artifact.

## Required Data / Events

- `run.configured`, `run.started`
- `generation.started`, `generation.completed`
- `agenome.spawned`, `agenome.fused`, `agenome.mutated`
- `candidate.created`
- `energy.spent`
- `lineage.culled`
- `fitness.scored`, `novelty.scored`
- `energy_exhausted`, `run_failed`, `run_completed`

## Acceptable Fixture

The current prototype may use saved Jack superyacht data and hand-shaped energy values. It must clearly mark fixture data and avoid implying that browser state is authoritative.

## Convincing Demo Bar

- Energy visibly constrains the run.
- Agenomes have differentiated roles and measurable output.
- Culling is explained by evidence, not arbitrary deletion.
- Fusion looks like a consequence of pressure, not a button press.
- The child is better because of inherited useful traits and prior blind spots.

## Falsification Bar

This prototype fails if users interpret energy as decorative scoring, cannot tell why any lineage was culled, or believe agents can raise caps by asking for more budget.

## Graduation Path

Replace fixture values with event-derived energy and score data from the runtime kernel. The final version should be a live projection of `run_events`, preserving the same graph language while making every bar, edge, and culling reason replayable.

