# Lexicon — the terms we've made load-bearing

When we land on a term that's *right*, it goes here. This is how we give the madness legitimacy: a
shared, precise vocabulary the team can build against. Add to it whenever a good term appears.

## Category

- **PSaaS** — Problem-Solving as a Service. The category Doppl inhabits. Consulting has always been PSaaS; the infrastructure was just unscalable, unreproducible, and artisanal. Doppl makes it so: one engine, many problems, reproducible lineage.

## Structure

- **flow** — the chain of decisions, folded one immutable node per step.
- **stock** — persistent knowledge the flow reads from and writes to (the knowledge fields).
- **node** — one step in a flow: `## Trace` + `## Discovery` + `## Growth` (+ `### Evaluation`) + `## Path`.
- **stage** — `case_study` → `problem_recovery` → `doppl`. Each stage is *an attempt to breed
  anti-fragile, useful children from a population* — not pick-the-winner.
- **doppl** — the amorphous leaf: the unlock / solution / idea. Our name for it.
- **Pepsi** — the *metaphor* for one-vs-many doppls (the perfect Pepsi vs. the perfect Pepsis). Not a
  schema term.
- **seed** — an original, hand-planted case study; the inciting agenome a chain grows from, with no parent (`prev_id: null`).
- **reseed / forest loop** — a doppl turned into a fresh case study to start a new island, carrying `prev_id: [[doppl]]`. The one back-edge in the graph; it lets a lineage grow past the three-stage spine.

## Discovery & stock

- **discovery** — a one-job tool: gather high-signal context (web + stock), clear a bar, write
  keepers to stock, return. Not a stage.
- **find / discovery (the bar)** — a *find* is anything retrieved; a *discovery* is a find that
  clears the signal bar and enters the stock.
- **sprout** — a rare, high-novelty side-idea that emerges while breeding a child but isn't the
  conclusion. Kept in `## Growth`; pruned by hand if it turns out dumb.

## Rating

- **measurement (`0–1`)** — an instrument reading (cosine similarity, ratios). No judgment.
- **rating (`−5…+5`)** — a judgment of worth. The *map* turns measurements into ratings.
- **the five axes** — Novelty, Grounding, Falsifiability, Cost-efficiency, Relevance (judge-scored).
- **temporal** — judge-set boolean; `true` means timing-bound, `false` means timeless.
- **decay** — currently configured to `0`; the effective multiplier is `1`, so scores do not change with age.
- **consensus-gap** — doctrine, not contract: the distance between what is true/useful and what the relevant crowd already sees or prices.

## Memory & signals

- **doppelgangers** — a count on a node: how many near-duplicate ideas were deduped into it. The one
  fact dedup destroys; everything else is derived.
- **convergence** — distinct ideas clustering on the same target. *Derived* (a query over the node
  graph), never stored; viewed through **novelty and usefulness**.
- **process-health signal** — observability on the generator. Converging on low-rated ideas (the
  "autopsy") means the generator is stuck or the fitness is miscalibrated.
- **anti-fragile** — the bar for a bred child: it should get *stronger* under variation, not merely
  survive.
