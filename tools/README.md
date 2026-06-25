# Doppl Kernel Tools

`pnpm proof` is the default surface — the compact multi-seed proof board.

Control boundary: a clean control can see the real scenario packet — prior conversation,
things tried, candidate attempts, constraints, neutral summaries. It must not see prior
verdicts, kernel scores, selected winners, or solution keys. Context is evidence; downstream
selection is leakage.

| Surface | Command | Owns |
| --- | --- | --- |
| Default proof | `pnpm build` | Typecheck + compact multi-seed proof board. |
| Proof only | `pnpm proof` | The proof board without typecheck. |
| Proof export | `pnpm proof:export` | Writes replay artifacts under `out/proof-board/**` (ephemeral, gitignored). |
| Clear local run data | `pnpm clear:run-data` | Removes disposable `out/**`. |
| Grow into the vault | `pnpm grow <node-slug> [vault]` | Runs a node end-to-end (discovery → engine → compile) and writes contract-shaped nodes + stock to the configured vault via the sink. |

Canonical sources:

- Trace truth: `src/trace.ts` via `buildRunTrace()`.
- The engine contract: [`mechanics/kernel/engine.md`](../mechanics/kernel/engine.md).
- The output sink + destination config: `src/io/sink.ts`, `doppl.config.json` ([`mechanics/kernel/sink.md`](../mechanics/kernel/sink.md)).
- The discovery + source-quality contract: [`mechanics/kernel/discovery.md`](../mechanics/kernel/discovery.md).

The proof board and rendered nodes are projections of the trace; they are not the trace.
