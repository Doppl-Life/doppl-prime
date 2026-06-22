# Kernel Glossary

Only terms the kernel actually uses belong here. If the kernel can run without a
term, leave it out.

## Core

### Kernel

- **Def:** the reusable operation `generate -> evaluate -> select -> generate
  again`, parameterized by direction, reproduction unit, fitness source, and
  schedule.

### Direction

- **Def:** the search posture of a run: `divergent`, `convergent`, or an
  oscillating schedule that alternates them.

### Divergent

- **Def:** generation-heavy search. One seed fans out into many candidates.
  Primary danger: redundancy and slop.

### Convergent

- **Def:** selection-heavy search. Many candidates collapse toward the strongest
  candidate or frame. Primary danger: premature consensus.

### Schedule

- **Def:** the per-run or per-generation policy that controls how much selection
  favors novelty, grounding, depth, cost, or other axes.

### Reproduction Unit

- **Def:** the thing that reproduces in a run: thesis, consequence, problem
  frame, solution candidate, or later agenome.

## Fitness

### Novelty

- **Def:** evidence that a candidate reaches somewhere not already covered.
  Preferred signals include source absence, substrate distance, hidden
  dependents, cluster coverage, and nearest-prior distance.

### Grounding

- **Def:** evidence that a candidate lands on something true or testable:
  source support, mechanism clarity, falsifiability, held-out cases, dated
  predictions, or human judgment.

### Decay

- **Def:** fitness erosion over time. A timing-bound thesis decays faster than a
  mechanism-transfer thesis.

### Lens

- **Def:** observer-relative feasibility or fit applied after intrinsic fitness.
  The engine scores what is novel, grounded, and durable; the lens asks whether
  it is worth acting on for this user or build.

### Mechanism Cost

- **Def:** ownership cost introduced by dependencies, glue, abstractions,
  irreversible commitments, or human workflow burden.

## Memory

### Lineage Ledger

- **Def:** append-only memory of candidates, parents, mutations, claimed deltas,
  nearest priors, delta classes, convergence clusters, and watch triggers.
- **See:** [`docs/lineage-ledger.schema.md`](./docs/lineage-ledger.schema.md)

### Claimed Delta

- **Def:** the candidate's explicit answer to "what changed besides wording?"

### Delta Class

- **Def:** classification of a candidate's relationship to prior work:
  `rehash`, `enrichment`, `convergence_signal`, `breakout_seed`, `dead_end`, or
  `unknown`.

### Rehash

- **Def:** same core thesis, same route, no meaningful new delta.

### Enrichment

- **Def:** same cluster or thesis, but with new mechanism, source, constraint,
  prediction, execution path, or synthesis.

### Convergence Signal

- **Def:** independent lineages re-finding the same thesis through different
  routes.

### Breakout Seed

- **Def:** a candidate or cluster deliberately used to escape an exhausted local
  search region.

### Convergence Cluster

- **Def:** a stable group of candidates that point to the same underlying
  attractor.

## Idea patterns

### Substrate Removed

- **Def:** the underlying event, constraint, object, or cost structure that a
  regime change removes or makes load-bearing.

### Dry Riverbed

- **Def:** a branch where the event disappears instead of merely becoming
  cheaper or rarer.

### Adoption Asymmetry

- **Def:** uneven deployment or belief as the thesis: who already lives in the
  future, who does not, and what opens at the boundary.

### Zeitgeist Synthesis

- **Def:** a timing-bound thesis whose mechanism depends on current signals,
  why-now, and falsifiable near-future predictions.

### Cross-Domain Transfer

- **Def:** a mechanism-first thesis where the core pattern transfers from one
  domain to another and timing is incidental.

### Pepsi

- **Def:** an inspectable candidate branch with a named claim, problem-recovery
  chain, implication map, falsifier, mechanism cost, lens fit, and lineage. A
  generated idea is not a Pepsi until it validates as a complete packet.

### Pepsi Output

- **Def:** the `kernel.pepsi-output.v1` human-facing projection built from
  `RunTrace` or an optional local generator. It is public output; evaluator-side
  Pepsi segmentation fixtures are calibration, not this artifact.

## Proof

### Bedrock

- **Def:** an anchor the generator cannot move: executable check, held-out case,
  dated prediction, human judgment, or replayable run evidence.

### Proof Board

- **Def:** default proof surface where stdout shows seed, generated count,
  rejected count, Explore keeps, Proof keeps, swap or rank movement, failed
  checks, and drill-down instructions.

### Regret Sibling

- **Def:** the candidate the other dial would have kept. Regret siblings expose
  whether direction actually changes the run.

### Agora Verdict

- **Def:** a typed human judgment over a surfaced sprout or afrit. The current
  kernel form is the post/verdict contract in `bedrock/signal/` plus the adapter
  in `tools/bedrock-signal.ts`; it is not a running service.

### Sprout

- **Def:** a side idea surfaced mid-run. Judged as process/generativity signal,
  not necessarily as the final answer.

### Afrit

- **Def:** a harvested outcome candidate. Judged as conclusion/actionability
  signal, separate from sprout fitness.
