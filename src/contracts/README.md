# Boundary Contracts

Human-readable boundary inventory for the kernel prototype.

Typed source of truth: [`./index.ts`](./index.ts). Use this inventory to scan
factory boundaries without reading code.

These are the kernel's **runtime boundary** contracts (module-I/O packets). The
model's **artifact** contracts (node, stock, rating, …) live separately at
[`contracts/`](../../contracts/README.md).

## Current boundaries

| Module | Enters from | Input contract | Output contract | Exits to |
| --- | --- | --- | --- | --- |
| `generate` | `FixtureSeedStore` | `SeedFixture` (`kernel.seed-fixture.v2`) | `CandidatePool` (`kernel.candidate-pool.v2`) | `fitness` |
| `fitness` | `generate` | `CandidatePool` (`kernel.candidate-pool.v2`) | `ScoredCandidatePool` (`kernel.scored-candidate-pool.v2`) | `select` |
| `select` | `fitness` | `ScoredCandidatePool + SelectionSchedule` (`kernel.selection-input.v2`) | `SelectionComparison` (`kernel.selection-comparison.v2`) | `lens` |
| `lens` | `select` | `ScoredCandidatePool + SelectionComparison` (`kernel.lens-input.v1`) | `LensResult[]` (`kernel.lens-result.v1`) | `trace` |
| `trace` | `lens` | `KernelRun + LensResult[]` | `RunTrace` (`kernel.run-trace.v2`) | `ProofBoard` |

`SeedFixture` contains the seed, source packets, and operators. `CandidatePool`
contains the kept candidates — each carrying its own lineage (parent, generation,
operator, delta) — plus the no-delta `rejected` children. `FitnessScore` contains novelty, grounding, decay, component details, and
scoring provenance. Feasibility stays in `LensResult`, outside `FitnessScore`.

## Rule

Every new boundary gets a contract before it gets clever implementation. The
contract says what crosses the boundary, where it came from, where it goes, and what
goal check proves it behaved.
