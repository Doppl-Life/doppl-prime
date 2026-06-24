# Glossary

The single vocabulary — both the **model** terms (doppl, node, stage, stock, the spine) and the **engine-mechanics** terms the running kernel uses. Engine behavior is specified in [`../mechanics/`](../mechanics); the typed shapes in [`../contracts/`](../contracts).

## Model

### Flow

- **Def:** the chain of decisions, folded one immutable node per step.

### Node

- **Def:** one step in a flow: `## Trace` + `## Discovery` + `## Growth` (+ `### Evaluation`) + `## Path`. See [`../contracts/node.md`](../contracts/node.md).

### Stage

- **Def:** `case_study → problem_recovery → doppl`. Each stage is an attempt to breed anti-fragile, useful children from a population — not pick-the-winner.

### Doppl

- **Def:** the amorphous leaf — the unlock / solution / idea. Our name for it.

### Seed

- **Def:** an original, hand-planted case study; the inciting agenome a chain grows from, with no parent (`prev_id: null`).

### Reseed / forest loop

- **Def:** a doppl turned into a fresh case study to start a new island, carrying `prev_id: [[doppl]]`. The one back-edge in the graph; lets a lineage grow past the three-stage spine.

### Stock

- **Def:** persistent domain memory the flow reads from and writes to — admitted discoveries grouped by field. See [`../contracts/stock.md`](../contracts/stock.md).

### Discovery (the tool / the bar)

- **Def:** a one-job kernel function — gather high-signal context (web + stock), clear a bar, write keepers to stock, return. Not a stage; see [`../mechanics/kernel/discovery.md`](../mechanics/kernel/discovery.md). A *find* is anything retrieved; a *discovery* is a find that clears the bar and enters stock.

### Anti-fragile

- **Def:** the bar for a bred child — it should get stronger under variation, not merely survive.

### Consensus-gap

- **Def:** doctrine, not contract — the distance between what is true/useful and what the relevant crowd already sees or prices.

## Core

### Kernel

- **Def:** the reusable operation `generate -> evaluate -> select -> generate
  again`, parameterized by direction, reproduction unit, fitness source, and
  schedule. See [`../mechanics/kernel/engine.md`](../mechanics/kernel/engine.md).

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
  [`../contracts/rating.md`](../contracts/rating.md).

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
  Cost-efficiency/Relevance rating axes — see `../mechanics/kernel/engine.md`.)

### Mechanism Cost

- **Def:** ownership cost from dependencies, glue, abstractions, irreversible
  commitments, or human workflow burden. In the hut it lives as the judge's
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

## Topology

The metaphor that locates the work: where the code lives, what threatens it, where
the inner workshop is, and where the app writes what it produces. Only the garden is
code on the run path; the agarden is the produced artifacts; the hut is upstream of
both.

### The garden

- **Def:** the codebase we want — the cultivated, good code: the running kernel
  (`src/`, `tools/`) and the frozen canon it follows (`contracts/`, `mechanics/`).
  What the hut's decisions venture out into. Distinct from the agarden; the garden is
  code, the agarden is produced artifacts.

### The jungle

- **Def:** the bad legacy code outside the garden — encroaching, calcified surface
  that reinserts itself and drags the work backward. The hut is insulated against it;
  the garden is kept clear of it.

### The hut

- **Def:** the protected inner workspace (`my-docs/the-hut/`) where the model is
  shaped before it freezes into canon. What is decided in the hut is the truth a
  venture carries outward — held authoritative by design so the garden's standing
  assumptions and the jungle's calcified legacy can't muddle a decision while it is
  still wet. A development surface, not a runtime stage: the hut produces no artifacts
  and is absent from the run chain.

### The agarden

- **Def:** the artifact vault (`../agarden`, also the git repo `Doppl-Life/agarden`)
  — where the kernel writes what a run produces: all flow nodes
  (`flow/<slug>/<slug>.md`), all stock (`stock/<slug>.md`), and the ratings ledger
  (`ratings-ledger.json`). An Obsidian vault that is also a git repo. The sink
  ([`../mechanics/kernel/sink.md`](../mechanics/kernel/sink.md)) is its only writer;
  the destination is one config value, `doppl.config.json` → `vault`. Not the garden:
  the garden is code, the agarden is output.

### The Agora

- **Def:** the human-facing app over the agarden. It surfaces nodes for people to
  rate (rater identified by email) and writes each score to the ratings ledger — the
  source that materializes a node's `scores.human` / `scores.n` (see
  [`../contracts/human-ratings-ledger.md`](../contracts/human-ratings-ledger.md)). Its
  job is the judge-vs-human delta: read nodes, collect ratings, update the ledger.
  Pressure, not storage — it holds no artifacts.
