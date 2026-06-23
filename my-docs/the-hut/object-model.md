# Object Model — Stages, Dependencies, the Node

## Two object classes

- **Flow** — the chain of decisions, folded one step at a time into immutable nodes.
- **Stock** — knowledge fields the flow draws from and writes back to (`stock-template.md`).

## The seed

Everything grows from a **case study** — the inciting agenome, the core, the seed, the beginning of
the vine. No node exists without a case study at its root. The case study node is minimal: an id, a
name, `stage: case_study`, `next: problem_recovery`, and the case itself. No Trace, no rubric. It is
just a start; it does not call discovery. Seeding it into the kernel is what turns it into the
evolutionary crucible of the later stages.

## Stages

1. `case_study` — the seed.
2. `problem_recovery` — the recovered actual problem.
3. `doppl` — the amorphous leaf: the unlock, the solution, the idea, or all of them. **`doppl` is the
   name** (amorphous, ours, no baggage). *Pepsi* stays as the **metaphor** we reason with — the
   *perfect Pepsi vs. the perfect Pepsis*: one converged answer, or several distinct ones (a doppl
   population).

The **doppl** is the leaf. After it, the flow points **out of the system** — into the open solution
space, where the human's action is the theory.

## Discovery is a tool, not a stage

Discovery is a tool that `problem_recovery` and `doppl` call — **never the case study** (a seed
doesn't search; it just starts). It is a **round trip**: the stage calls discovery, discovery works,
control returns to the stage, which then finishes. It is not part of the spine — it happens off to
the side, below the line.

On a call, discovery reads the **web** for anything new (writing genuinely new finds into the
**stock field**), reads the **stock field** for what is already known, and hands the pulled-together
result back to the calling stage. Design it as a **modular tool interface**: one verb (`discover`),
pluggable backends — a web-search tool now, a large-scale Karpathian deep-research skill later.
Add-a-tool, don't hardcode. (Skill plumbing: thread #7.)

**Discovery is what was found; Growth is what was concluded.**

## Flow

The doppl flow — one spine, discovery as a side process (`flow.svg`).

The solid line is the spine — the flow: `case_study → problem_recovery → doppl`, then a dotted
pointer **out** into the open solution space (the human's action). **Each spine arrow is the kernel:**
one pass of the generate→select crucible — *an attempt to breed anti-fragile, useful children from a
population* — plus the **compiler** that writes the result into the next node. The nodes are states;
the edges are the kernel at work. Everything below the line is back-and-forth side process —
`problem_recovery` and `doppl` call discovery and get control back; discovery reads the web and
reads/writes the stock field. The spine does **not** run into the stock field.

- No `doppl` without a recovered problem. No problem without a case study.

## The node — four parts

- `## Trace` — accretes. One `### <Stage> · synopsis` per completed prior stage, copied verbatim.
- `## Discovery` — accretes. What discovery pulled in (web + stock field). Found, not concluded.
- `## Growth` — the live work, the current stage at full fidelity. Holds the stage content (a
  problem's recovery chain, or a doppl's `### Claim` + `### Implications` + `### Opportunities`), the
  action surface (`### Skin in the Game` on a problem_recovery node, `### Opportunities` on a doppl),
  an optional `### Sprouts` list (rare, high-novelty side-ideas that aren't the conclusion; pruned by
  hand), and `### Evaluation` — the judge's ground truth (one `#### <axis>` subsection per axis with
  full reasoning, boiled down into `scores.judge`).
- `## Path` — names the next stage, or `null`.

Both stage variants are written out in full in `node-template.md`.

The `# headline` is the one-line Growth result; on fold it becomes the next node's Trace synopsis.

## Portable synopsis

Each stage authors its synopsis once. Downstream nodes copy it verbatim into Trace — never reworded,
never merged. Only the synopsis travels; full thinking stays home.

## Identity

Every node and field has a **UUIDv4** `id` — the durable link key. Names/headlines are separate and
change freely. Each node also carries a `doppelgangers` count — how many near-duplicate ideas were
deduped into it (the one fact dedup destroys; everything else is derived).

## Temporal

Each node carries `temporal` — a **boolean**. `true` = timing-bound. `false` = timeless. Active decay is configured to `0`; the field stays because it is the seam a future time mechanism can attach to. See `rating-model.md`.

## Signals (derived, not stored)

The node graph itself is the lineage memory. Two signals read off it; only one is stored.

- **doppelgangers** (stored) — a per-node count of near-duplicate ideas deduped into it. Powers
  "this keeps coming up" displays, and when it piles up on low-rated ideas, a **process-health
  signal** — the generator is stuck or the fitness is miscalibrated (an autopsy cue).
- **convergence** (derived) — distinct ideas clustering on the same target, found by a query over
  the graph and viewed through **novelty and usefulness**. Never stored; it's a lens you run.

There is no separate lineage ledger — the node graph is the only memory.

## Kernel

Recorded for now: Cody, Melissa, Michael, Dalton. Collapses to `prime` once settled.
