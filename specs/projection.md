# Projection Contract

A compiled node is a projection of a [`RunTrace`](./run-trace.md). This doc is the field-by-field map: for every durable part of a node, it names the source of truth, who owns it, and how the compiler is allowed to produce it.

It owns the **edges**, not the nodes. The node shape is owned by [`node.md`](./node.md); the trace by [`run-trace.md`](./run-trace.md); the externally-owned facts by [`rating.md`](./rating.md), [`human-ratings-ledger.md`](./human-ratings-ledger.md), and [`stock.md`](./stock.md). This doc must reference those contracts, never restate them. When a node field's source is unclear, this is where the question is answered or recorded as open.

## Scope

This contract covers **growth-stage compiled nodes** (`problem_recovery`, `doppl`): the nodes the compiler renders from a `RunTrace`.

The seed (`case_study`) is **authored, not compiled**. It has no run, no trace, and no projection. Its fields (`id`, `name`, `next`) come from the author. Everything below is about what the compiler may do, so it does not apply to the seed.

## Provenance vocabulary

Every node target draws from its source in exactly one mode. The mode is the contract the compiler must satisfy.

- `render_verbatim` — copy the source text exactly; never reword, merge, or summarize.
- `render` — format the source into markdown shape; reshape the container, never the meaning.
- `derive` — compute the value from trace inputs by a fixed rule (no judgment).
- `mint` — the compiler originates the value (only the node `id`).
- `fixed_by_stage` — determined by the stage discriminant, not read from the trace.
- `birth_empty` — written empty at compile time, materialized later by another spec.
- `open` — the node requires this field but the trace has no source for it yet.

### Type contract

```ts
type TracePath = `RunTrace.${string}`;

type SpecRef =
  | 'run-trace.md'
  | 'node.md'
  | 'rating.md'
  | 'human-ratings-ledger.md'
  | 'stock.md'
  | 'compiler-skill.md';

type Provenance =
  | { mode: 'render_verbatim'; from: TracePath }
  | { mode: 'render'; from: TracePath }
  | { mode: 'derive'; from: TracePath; rule: string }
  | { mode: 'mint' }
  | { mode: 'fixed_by_stage' }
  | { mode: 'birth_empty'; materialized_by: SpecRef }
  | { mode: 'open'; note: string };

type NodeTarget =
  | { surface: 'frontmatter'; field: string }
  | { surface: 'body'; section: string };

type ProjectionEntry = {
  target: NodeTarget;
  provenance: Provenance;
  owner: SpecRef;
};

type ProjectionLedger = ProjectionEntry[];
```

## Frontmatter projection

| node field | source | mode | owner |
| --- | --- | --- | --- |
| `id` | compiler mints; recorded at `RunTrace.compile.output.node_id` | `mint` | compiler-skill.md |
| `stage` | `RunTrace.identity.stage` | `render` | run-trace.md |
| `root` | `RunTrace.inputs.parent_nodes[0]` | `derive` (spine root = first ancestor) | run-trace.md |
| `prev` | `RunTrace.inputs.parent_nodes` | `derive` (ancestry, root first) | run-trace.md |
| `kernel` | `RunTrace.identity.kernel` | `render` | run-trace.md |
| `temporal` | `RunTrace.judge.result.temporal` | `render` | rating.md |
| `next` | `NextOf<stage>` | `fixed_by_stage` | node.md |
| `scores.judge` | `RunTrace.judge.result.judge` | `render` | rating.md |
| `scores.human` | `null` at birth | `birth_empty` | human-ratings-ledger.md |
| `scores.n` | `0` at birth | `birth_empty` | human-ratings-ledger.md |
| `doppelgangers` | none — not carried by the trace | `open` | node.md |

The judge fields (`temporal`, `scores.judge`) originate in the judge pass; `rating.md` owns their meaning, the trace only attaches them. `scores.human` and `scores.n` are born empty and filled later by the human-ratings projection job, never by the compiler.

## Body projection

| node section | source | mode | owner |
| --- | --- | --- | --- |
| `# Headline` | `RunTrace.selection.compiled_candidate.headline` | `render` | run-trace.md |
| `## Trace` | `RunTrace.inputs.trace_synopses` | `render_verbatim` | run-trace.md |
| `## Discovery` | `RunTrace.inputs.discovery` | `render` | run-trace.md |
| `## Growth` | `RunTrace.selection.compiled_candidate` (`growth`, `claim`, …) | `render` | run-trace.md |
| `### Evaluation` | `RunTrace.judge.result.evaluation` | `render` | rating.md |
| `## Path` | `NextOf<stage>` (mirrors frontmatter `next`) | `fixed_by_stage` | node.md |

`## Trace` is the only `render_verbatim` body section: prior-stage synopses copied exactly from `trace_synopses`, in spine order, never reworded. `## Discovery` renders what discovery returned (found, not concluded) and cites the stock field; the stock field itself is owned by `stock.md`, but the node only ever renders the discovery payload already captured in the trace inputs. `## Growth` and the headline render the **compiled candidate** — the single survivor handed forward by selection, not the candidate pool.

## Machine-only — does not render into the node

These trace parts are the generation record, not the artifact. They stay in the `RunTrace` and must not appear in the node:

- `RunTrace.generate` — the full candidate pool and rejected no-delta children.
- `RunTrace.fitness` — novelty/grounding measurements per candidate.
- `RunTrace.selection.decisions` and `RunTrace.selection.regret_siblings` — Pareto fronts, directional scores, cross-dial contrast.
- `RunTrace.lens` — observer-relative feasibility. Lives in the trace; a future viewer may surface it, the node does not.
- every candidate other than `compiled_candidate`.

A viewer that wants audit detail reads the trace. The node carries only the survivor's projection.

## Compiler-owned vs externally-owned

- **Compiler-owned:** the node `id` (mint), markdown formatting, and the stage-fixed `next` / `## Path`. Nothing here is a judgment.
- **Externally-owned, compiler renders:** headline and Growth (generate→select), the judge's `### Evaluation` / `scores.judge` / `temporal` (judge), prior synopses (upstream nodes), discovery findings (discovery). The compiler may not invent any of these.
- **Externally-owned, written after compile:** `scores.human` and `scores.n`, materialized by the human-ratings projection job (`human-ratings-ledger.md`).

## Open

- **`doppelgangers` has no trace source.** `node.md` requires it on every growth-stage node, but `RunTrace` and `CompilerHandoff` do not carry a dedup count. Either the compiler gets a dedup input outside the trace, or the trace gains a field, or the node frontmatter drops it to a derived/later-materialized value. Decide in the hut first; do not let the compiler invent it.
- **`root` + `prev` vs `parent_nodes`.** The node stores ancestry as two fields (`root`, `prev`); the trace carries one ordered `parent_nodes`. This doc derives both from `parent_nodes`. If the node moves to a single `parent_nodes` field, the two `derive` rows collapse to one `render`.
