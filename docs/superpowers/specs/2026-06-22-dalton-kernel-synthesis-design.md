# Dalton Kernel Synthesis Design

## Purpose

Build a real Doppl kernel on branch `dalton`, starting from `origin/main` and synthesizing the strongest ideas from the existing Cody, Melissa, Michael, calibrator, and knowledge-space work.

The first milestone is a deterministic end-to-end kernel loop that produces inspectable artifacts, trace events, lineage, and markdown-vault exports without requiring live model calls or private API keys. Live provider calls and hosted deployment can layer onto the same boundaries after the fixture loop is reliable.

## Context

The memory bank and handoff define Doppl as an evolutionary runtime for agent scaffolds. The load-bearing rules are:

- Evaluate parent artifacts individually before checking pair compatibility.
- Use individual parent fitness to weight inheritance.
- Treat problem recovery as a first-class artifact, not hidden scratch work.
- Keep held-out proof separate from breeding fitness.
- Preserve object-level outputs: artifact text, critic verdicts, fitness records, compatibility rationale, inheritance weights, and final exports.
- Use a `KnowledgeGateway` boundary so memory can later be backed by Neo4j, vectors, JSON fixtures, or another store without coupling storage to generation logic.
- Never expose OpenRouter keys to client code or committed artifacts.

Branch study summary:

- Cody contributes event ownership discipline, cap enforcement, replay-safe orchestration, and strict runtime boundaries.
- Melissa contributes fuller TypeScript app structure, verifier/selection/reproduction coverage, novelty scoring, and demo endpoint shape.
- Michael contributes assay/proof-board clarity, explicit breeding-unit vocabulary, and compact kernel specs around divergence/convergence.
- `mh-doppl-spike/kernel-rebuild` contributes `memoryMode`, `KnowledgeGateway`, cited memory injection, and replay from persisted knowledge events.
- `doppl-prime/calibrator` defines the markdown-vault review contract for problem recoveries and solutions.

## Scope

### In Scope For The First Complete Slice

- Create a TypeScript kernel package or app module in `doppl-prime`.
- Define shared contracts for the kernel loop.
- Load a markdown case study input.
- Select a knowledge packet through a fixture-backed `KnowledgeGateway`.
- Produce a problem recovery artifact.
- Produce candidate solution artifacts.
- Run deterministic critic/check evaluation per candidate.
- Compute inspectable fitness components.
- Select parents based on individual candidate fitness.
- Check pair compatibility separately from parent fitness.
- Produce a child artifact through weighted fusion.
- Record a durable run trace.
- Export calibrator-compatible markdown-vault artifacts.
- Add tests for the loop, problem recovery, trace, fitness, fusion, knowledge replay, and vault export.
- Add a human-readable local inspection surface, either CLI proof board first or web dashboard if the server shell is already in place.

### Deferred From The First Slice

- Live OpenRouter generation.
- Postgres event store.
- Langfuse integration.
- Neo4j runtime storage.
- Full React Flow dashboard polish.
- Railway deployment.
- Multi-user auth.

These are deferred implementation layers, not alternate architectures.

## Architecture

The first kernel should use one canonical run object:

```text
KernelRun
  seed case
  run config
  selected knowledge packet
  problem recovery
  candidate artifacts
  critic verdicts
  fitness records
  selection result
  compatibility record
  fused child artifact
  events
  vault export manifest
```

Views, CLI reports, JSON fixtures, and markdown exports must project from this object or from its event trace. They must not invent facts not present in the run.

### Modules

`packages/contracts`

- Runtime schemas and TypeScript types.
- No provider SDKs, file writes, or runtime orchestration.
- Contracts cover `CaseStudy`, `KnowledgePacket`, `ProblemRecovery`, `CandidateSolution`, `CriticVerdict`, `FitnessRecord`, `PairCompatibility`, `InheritanceWeights`, `FusionResult`, `RunEvent`, and `VaultExportManifest`.

`apps/api` or `apps/kernel`

- Kernel orchestration.
- Fixture-backed generation/evaluation providers.
- Knowledge gateway port plus JSON adapter.
- Vault export writer.
- CLI or API entrypoint for running fixtures.

`apps/web` or dashboard surface

- Reads run output and displays object-level evidence.
- First dashboard can be read-only fixture/replay mode.
- It should show the case, memory packet, problem recovery, candidates, critics, fitness, fusion, and exported markdown paths.

`calibration-vault`

- Receives generated markdown files in a shape the calibrator can ingest without lossy rewriting.
- Problem recovery and solution artifacts are separate review targets.

## Data Flow

```text
case study markdown
-> parse case packet
-> request/select knowledge packet
-> emit knowledge events
-> recover problem
-> generate candidate solutions
-> evaluate each candidate with critic/check fixtures
-> score each candidate
-> select individual parent candidates
-> check selected pair compatibility
-> calculate inheritance weights from individual fitness
-> fuse child artifact
-> emit run trace
-> export markdown-vault files
-> inspect through proof board or dashboard
```

Replay must use persisted knowledge packet events rather than asking the gateway again.

## Fitness And Fusion Rules

Fitness uses visible components rather than one opaque score:

- novelty
- grounding
- mechanism clarity
- mechanism cost
- critic pressure
- evidence quality
- optional subtype checks

The first implementation can use weighted sums, but it must preserve component scores and rejected-candidate rationales.

Fusion is not a 50/50 average unless parent fitness is equal. The kernel must:

- evaluate parent A and parent B independently
- store each parent candidate fitness
- compute pair compatibility as a separate record
- compute inheritance weights from individual parent fitness
- state what the child inherited from each parent
- state the mutation or synthesis delta

## Knowledge Boundary

The kernel imports a `KnowledgeGateway` port:

```text
selectPacket(request) -> KnowledgePacket
```

The first adapter reads JSON packet fixtures. Later adapters may read the knowledge-space export, Neo4j, vector indexes, or a server service. Kernel generation logic may consume cited packet slices, but it must not import a database driver directly.

Events:

- `knowledge.packet_requested`
- `knowledge.packet_selected`
- `knowledge.item_injected`
- `knowledge.replay_used`

## Vault Export

Each run exports markdown files with frontmatter and stable IDs:

- case reference
- problem recovery artifact
- solution artifacts for each candidate and child
- trace summary
- provenance and knowledge citation summary
- optional comparison manifest

Problem recovery and solution artifacts must be separately rateable by the calibrator.

## Error Handling

Fixture mode should be deterministic and fail loudly on malformed inputs.

Expected failures:

- missing case file
- invalid case markdown/frontmatter
- no knowledge packet for target case
- invalid candidate fixture
- critic/check fixture mismatch
- zero eligible parents
- incompatible selected pair
- vault export write failure

Zero eligible parents should produce a terminal trace and partial export rather than crashing after useful artifacts exist.

## Testing

Focused tests should cover:

- contract parsing
- case markdown loading
- knowledge gateway packet selection
- replay without fresh retrieval
- problem recovery artifact creation
- candidate generation from fixture inputs
- critic verdict and fitness scoring
- individual parent selection before compatibility
- weighted inheritance, including an `80` vs `40` score producing a `2:1` prior
- child fusion metadata
- run trace event order
- vault markdown export shape

## Success Criteria

The first complete slice is done when a developer can run one command in `doppl-prime` and get:

- a deterministic Doppl run from a case study
- inspectable JSON trace
- problem recovery artifact
- parent and child solution artifacts
- critic verdicts and fitness records
- weighted fusion metadata
- calibrator-compatible markdown exports
- passing tests

The result should be honest fixture mode, not a fake live model demo.
