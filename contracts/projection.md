# Projection Contract

A compiled node is a projection of a [`RunTrace`](./run-trace.md). This doc is the field-by-field map: for every durable part of a node, it names the source of truth, who owns it, and how the compiler is allowed to produce it.

It owns the **edges**, not the nodes. The node shape is owned by [`node.md`](./node.md); the trace by [`run-trace.md`](./run-trace.md); the externally-owned facts by [`rating.md`](./rating.md), [`human-ratings-ledger.md`](./human-ratings-ledger.md), and [`stock.md`](./stock.md). This doc must reference those contracts, never restate them. When a node field's source is unclear, this is where the question is answered or recorded as open.

## Scope

This contract covers **growth-stage compiled nodes** (`problem_recovery`, `doppl`): the nodes the compiler renders from a `RunTrace`.

The seed (`case_study`) is **authored, not compiled**. It has no run, no trace, and no projection. Its fields (`id`, `name`, `next`) come from the author. An original seed renders `prev_id: null`; a case study **reseeded** from a doppl carries `prev_id: [[doppl-id]]` but is still not engine-compiled — it is spawned from a leaf, not bred by a run. Everything below is about what the compiler may do, so it does not apply to the case study.

## Provenance vocabulary

Every node target draws from its source in exactly one mode. The mode is the contract the compiler must satisfy.

- `render_verbatim` — copy the source text exactly; never reword, merge, or summarize.
- `render` — format the source into markdown shape; reshape the container, never the meaning.
- `derive` — compute the value from trace inputs by a fixed rule (no judgment).
- `mint` — the compiler originates the node `id`: kebab-case the headline, append an 8-char short id, then freeze it.
- `fixed_by_stage` — determined by the stage discriminant, not read from the trace.
- `birth_empty` — written empty at compile time, materialized later by a separate job.

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
  | { mode: 'birth_empty'; materialized_by: string };

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
| `id` | minted from `RunTrace.selection.compiled_candidate.headline` (kebab + 8-char id), frozen | `mint` | compiler-skill.md |
| `stage` | `RunTrace.identity.stage` | `render` | run-trace.md |
| `kernel` | `RunTrace.identity.kernel` | `render` | run-trace.md |
| `temporal` | `RunTrace.judge.result.temporal` | `render` | rating.md |
| `next` | `NextOf<stage>` | `fixed_by_stage` | node.md |
| `scores.judge` | `RunTrace.judge.result.judge` | `render` | rating.md |
| `scores.human` | `null` at birth | `birth_empty` | human-ratings-ledger.md |
| `scores.n` | `0` at birth | `birth_empty` | human-ratings-ledger.md |
| `doppelgangers` | `0` at birth | `birth_empty` | node-graph dedup pass |

Lineage is not a frontmatter field: `root` is gone (recover it by walking `prev_id`) and the parent link lives in the body (see below). The judge fields (`temporal`, `scores.judge`) originate in the judge pass; `rating.md` owns their meaning, the trace only attaches them. `scores.human` and `scores.n` are born empty and filled later by the human-ratings projection job; `doppelgangers` is born `0` and incremented by the dedup pass over the node graph — same born-empty-then-materialized shape, none of it computed by the compiler.

## Body projection

| node section | source | mode | owner |
| --- | --- | --- | --- |
| `# Headline` | `RunTrace.selection.compiled_candidate.headline` | `render` | run-trace.md |
| `prev_id` line | `RunTrace.inputs.parent_nodes[last]` (immediate parent; `null` if empty) | `derive` | node.md |
| `## Trace` | `RunTrace.inputs.trace_synopses` | `render_verbatim` | run-trace.md |
| `## Discovery` | `RunTrace.inputs.discovery` | `render` | run-trace.md |
| `## Growth` | `RunTrace.selection.compiled_candidate` (`growth`, `claim`, …) | `render` | run-trace.md |
| `### Evaluation` | `RunTrace.judge.result.evaluation` | `render` | rating.md |
| `## Path` | `NextOf<stage>` (mirrors frontmatter `next`) | `fixed_by_stage` | node.md |

`prev_id` is the first body line after the headline: the immediate parent only — the last entry of the spine-ordered `parent_nodes` — rendered as an Obsidian wikilink (`[[slug-id]]`), or `null` at the seed. Because the trace now keys node refs as `SlugId` (see `run-trace.md`), the compiler copies the parent id straight through — there is no id translation. `## Trace` is the only `render_verbatim` body section: prior-stage synopses copied exactly from `trace_synopses`, in spine order, never reworded. `## Discovery` renders what discovery returned (found, not concluded) and cites the stock field; the stock field itself is owned by `stock.md`, but the node only ever renders the discovery payload already captured in the trace inputs. `## Growth` and the headline render the **compiled candidate** — the single survivor handed forward by selection, not the candidate pool.

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
- **Externally-owned, compiler renders:** headline and Growth (generate→select), the judge's `### Evaluation` / `scores.judge` / `temporal` (judge), prior synopses (upstream nodes), discovery findings (discovery), and the `prev_id` parent link (`parent_nodes`). The compiler may not invent any of these.
- **Externally-owned, written after compile:** `scores.human` and `scores.n` (human-ratings projection job, `human-ratings-ledger.md`), and `doppelgangers` (the node-graph dedup pass).

## Open

- **The dedup pass has no spec yet.** `doppelgangers` is born `0` and materialized later by a pass over the node graph, but that pass — like the human-ratings projection runner — has no written contract. When it lands, give it a spec and point the `doppelgangers` materializer at it.
