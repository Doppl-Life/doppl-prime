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
| Case-study leakage lint | `pnpm case-study:lint` | Validates seed-visible case packets leak no evaluator-only solution language. |
| Clear local run data | `pnpm clear:run-data` | Removes disposable `out/**`. |
| Case-study corpus | no direct command | Typed loader for `case-studies/**`; seed paths read only `case-study.md`, judge paths can read `solution.md`. |
| Source radar | no direct command | Typed source recipes, source outcome snapshot, decay rules, and resolved benchmark calibration (discovery backends). |
| Least-action calibration | no direct command | Typed mechanism-economy fixtures, prompt packaging, weighted fitness components, scoring, and calibration. |
| Knowledge-space boundary | no direct command | Typed memory packet/collapse contracts, provenance guards, and replay-safe invariants. |
| Crucible calibration | no direct command | Typed belief-revision protocol, archetypes, and anti-herding judge checks. |
| Skill lineage | `node --experimental-strip-types tools/skill-lineage.ts` | No-dependency registry check for `skills/LINEAGE.md`. |

Canonical sources:

- Trace truth: `src/trace.ts` via `buildRunTrace()`.
- The engine contract: [`my-docs/the-hut/engine.md`](../my-docs/the-hut/engine.md).
- Case-study corpus boundary: `tools/case-study-corpus.ts`.
- Judgment agreement math: `tools/agreement.ts`.
- Source radar knowledge: `tools/source-radar.ts`.
- Least-action calibration: `tools/least-action.ts`.
- Knowledge-space boundary: `tools/knowledge-space.ts`.
- Crucible calibration: `tools/crucible.ts`.
- Skill-lineage drift check: `tools/skill-lineage.ts`.

The proof board and rendered nodes are projections of the trace; they are not the trace.
