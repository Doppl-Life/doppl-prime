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
| Grow into the vault | `pnpm grow [fixture] [vault]` | Runs a seed end-to-end (discovery → engine → compile) and writes contract-shaped nodes + stock to the configured vault via the sink. |
| Source radar | no direct command | Typed source recipes, source outcome snapshot, decay rules, and resolved benchmark calibration (discovery backends). |
| Least-action calibration | no direct command | Typed mechanism-economy fixtures, prompt packaging, weighted fitness components, scoring, and calibration. |
| Knowledge-space boundary | no direct command | Typed memory packet/collapse contracts, provenance guards, and replay-safe invariants. |
| Crucible calibration | no direct command | Typed belief-revision protocol, archetypes, and anti-herding judge checks. |

Canonical sources:

- Trace truth: `src/trace.ts` via `buildRunTrace()`.
- The engine contract: [`mechanics/kernel/engine.md`](../mechanics/kernel/engine.md).
- The output sink + destination config: `src/io/sink.ts`, `doppl.config.json` ([`mechanics/kernel/sink.md`](../mechanics/kernel/sink.md)).
- Judgment agreement math: `tools/agreement.ts`.
- Source radar knowledge: `tools/source-radar.ts`.
- Least-action calibration: `tools/least-action.ts`.
- Knowledge-space boundary: `tools/knowledge-space.ts`.
- Crucible calibration: `tools/crucible.ts`.

The proof board and rendered nodes are projections of the trace; they are not the trace.
