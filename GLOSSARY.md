# Kernel Glossary

Engine-mechanics terms the running kernel uses. The **model** vocabulary (doppl, node, stage,
stock, the spine) lives in the garden — see [`my-docs/garden/LEXICON.md`](my-docs/garden/LEXICON.md).
Only terms the kernel actually uses belong here.

## Core

### Kernel

- **Def:** the reusable operation `generate -> evaluate -> select -> generate
  again`, parameterized by direction, reproduction unit, fitness source, and
  schedule. See [`my-docs/garden/engine.md`](my-docs/garden/engine.md).

### Direction

- **Def:** the search posture of a run: `divergent`, `convergent`, or an
  oscillating schedule that alternates them.

### Divergent

- **Def:** generation-heavy search (r-like). One seed fans out into many
  candidates. Primary danger: redundancy and slop.

### Convergent

- **Def:** selection-heavy search (K-like). Many candidates collapse toward the
  strongest candidate or frame. Primary danger: premature consensus.

### Schedule

- **Def:** the per-run or per-generation policy that controls how much selection
  favors novelty vs. grounding. Encoded as `{ keep, priorityAxis, floorAxis, floor }`.

### Reproduction Unit

- **Def:** the thing that reproduces in a run: thesis, consequence, problem
  frame, solution candidate, or later agenome. Pluggable; not baked into the kernel.

## Fitness

### Measurement

- **Def:** a `0–1` instrument reading (cosine similarity, token-overlap ratios). No
  judgment. Measurements map *into* ratings; they are not ratings.

### Rating

- **Def:** a `−5…+5` judgment of worth (the judge's and the human's output). See
  [`my-docs/garden/rating-model.md`](my-docs/garden/rating-model.md).

### Novelty

- **Def:** measurement that a candidate reaches somewhere not already covered.
  Components: source absence, substrate distance, hidden dependents. Never pure
  model self-grading.

### Grounding

- **Def:** measurement that a candidate lands on something true or testable:
  signal strength, mechanism clarity, falsifiability, minus a risk penalty.

### Decay

- **Def:** fitness erosion over time, an engine time-axis factor. A `temporal`
  (zeitgeist) idea decays on a 180-day half-life; a transfer (timeless) idea does
  not decay.

### Temporal

- **Def:** the boolean time-decay axis of an idea. `true` = zeitgeist (decays,
  can reinvigorate); `false` = transfer (timeless). The one survivor of the old
  `subtype`.

### Lens

- **Def:** observer-relative feasibility or fit applied after intrinsic fitness.
  The engine scores what is novel, grounded, and durable; the lens asks whether it
  is worth acting on for this user. (Open: may fold into the judge's
  Cost-efficiency/Relevance rating axes — see `engine.md`.)

### Mechanism Cost

- **Def:** ownership cost from dependencies, glue, abstractions, irreversible
  commitments, or human workflow burden. In the garden it lives as the judge's
  Cost-efficiency rating axis.

## Memory and signals

The node graph is the lineage memory; there is no separate ledger.

### Doppelgangers

- **Def:** a stored per-node count of near-duplicate ideas deduped into it. The one
  fact dedup destroys. A rising count on a low-rated idea is a process-health signal.

### Convergence

- **Def:** distinct lineages arriving at the same target. *Derived* — a query over
  the node graph, never stored — read through novelty and usefulness.

### Rehash / Enrichment

- **Def:** a candidate (or a discovery into the stock) that adds no real delta is a
  **rehash** (dropped); one that adds new mechanism, source, constraint, prediction,
  or synthesis is **enrichment** (kept/merged).

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

- **Def:** a timing-bound thesis whose mechanism depends on current signals and
  why-now. Maps to `temporal: true`.

### Cross-Domain Transfer

- **Def:** a mechanism-first thesis where the pattern transfers between domains and
  timing is incidental. Maps to `temporal: false`.

### Pepsi (the metaphor)

- **Def:** the reasoning metaphor for one-vs-many doppls — the perfect Pepsi (one
  converged answer) vs. the perfect Pepsis (several distinct ones). Not a schema term;
  the artifact is the doppl.

## Proof

### Bedrock

- **Def:** an anchor the generator cannot move: executable check, held-out case,
  dated prediction, human judgment, or replayable run evidence.

### Proof Board

- **Def:** the default proof surface. Stdout shows seed, generated count, rejected
  count, Explore keeps, Proof keeps, swap or rank movement, and failed checks.

### Regret Sibling

- **Def:** the candidate the other dial would have kept from the same pool. Exposes
  whether direction actually changes the run.

### Sprout

- **Def:** a rare, high-novelty side-idea surfaced mid-run that isn't the
  conclusion. Kept on the node for later; pruned by hand.
