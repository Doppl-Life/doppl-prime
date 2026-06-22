# Kernel Specs

Specs are the build contracts. Memory records decisions. Anything else is
source material only while it is being mined.

## Files

- [`runtime-kernel.md`](./runtime-kernel.md) - the core generate/evaluate/select
  runtime, modes, caps, lineage, and trace boundary.
- [`fitness-selection.md`](./fitness-selection.md) - novelty, grounding, decay,
  regret siblings, Pareto risks, and tripwires.
- [`pepsi-output.md`](./pepsi-output.md) - what a Pepsi is, the public output
  projection, generator boundary, and the packet every output must expose.
- [`assay-corpus.md`](./assay-corpus.md) - case-study roles, withheld solutions,
  source radar, validation, and the human verdict loop.
- [`artifacts-deploy.md`](./artifacts-deploy.md) - serve/publish/static surfaces
  and generated artifact ownership.

If a new doctrine affects how the kernel runs or is judged, add it here. If it
only records why we chose a fork, put it in [`../MEMORY.md`](../MEMORY.md).
