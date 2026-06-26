# Artifact Policy

Doppl's durable artifacts are garden nodes and stock.
The product path is agarden in, agarden out.

The kernel may keep rich process state while a run is happening.
That state is for the inner view and debugging; it is not the outer product artifact.

## Read Order

1. `../agarden/flow/**` - durable surviving nodes.
2. `../agarden/stock/**` - admitted discoveries that support surviving nodes.
3. `ratings-ledger.json` - human ratings for scored nodes.
4. Live run trace - inner process view while selection is happening.

## Artifact Classes

| Class | Paths | Keep? | Why |
| --- | --- | --- | --- |
| Product input nodes | `../agarden/flow/**` | yes | MarkScript nodes the kernel grows from. |
| Product output nodes | `../agarden/flow/**` | yes | Surviving `problem_recovery`, `doppl`, and reseeded `case_study` nodes. |
| Stock | `../agarden/stock/**` | yes | Domain memory read before research and written when used by survivors. |
| Human ratings | `../agarden/ratings-ledger.json` | yes | Human score source for node projections. |
| Runtime trace | memory / event stream | no | Inner process state for the current run. |
| Test fixtures | `test/fixtures/**` | test-only | Deterministic harness data, never product input. |
| Local drill-down output | `out/**` or OS temp dirs | no | Temporary inspection state, not product output. |

Default rule: a product artifact is either a garden node, garden stock, or the ratings ledger.
Everything else must be test-only or temporary.

## Kill Rules

- If a human-facing artifact cannot change a decision in under one minute,
  delete it or demote it to machine trace.
- If an artifact is generated every run and is not a garden node, garden stock,
  a rating, or a live inner trace, stop generating it by default.
- If a report repeats information already visible in stdout or the proof board,
  cut the repeated section unless it supports drill-down.
- If an artifact has no named consumer, action, or regression it can catch, it
  is report theater.
- If human-language fields leak into `src/contracts`, move them to a view or delete them.
- If a filename, command, heading, or doc frame uses conversational process
  language where object-level language would do, rename it before it hardens.
- If deterministic data is needed for tests, put it under a test-only path and
  keep product defaults pointed at the configured agarden.

Rich process data is fine inside the run.
The outer product surface is the garden.
