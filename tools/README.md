# Doppl Kernel Tools

Use `pnpm serve` unless you need a specific artifact.

Surface boundary: the viewer is a microscope, not the specimen. Reviewer-facing pages may show problem framing, candidate Pepsis, tactics, evidence, and verdict controls. They must not render private QA metaphors, design-principle labels, conversation shorthand, or slide-branding as if those are what the reviewer came to inspect.

Control boundary: a clean control can see the real scenario packet: prior conversation, things tried, candidate attempts, constraints, and neutral summaries. It must not see prior verdicts, kernel scores, selected winners, solution keys, Pepsi maps, or meta-guidance about what the assay thinks is interesting. Context is evidence; downstream selection is leakage.

| Surface | Command | Owns |
| --- | --- | --- |
| Local viewer | `pnpm serve` | Owns port 4317 by default: frees it first, then serves one localhost hub, one nav, `/api/trace`, Assay, Microscope, Architecture, static Architecture v2, Review Digest. |
| Default proof | `pnpm build` | Typecheck plus compact multi-fixture proof board. |
| Proof only | `pnpm proof` | Compact proof board without typecheck. |
| Deploy HTML | `pnpm publish:html` | Direct-renders the same view functions into committed `published/*.html` and ignored `published/index.html`. |
| Deploy static server | `pnpm serve:static` | Serves only `published/**` for Render/static smoke tests. |
| Case-study leakage lint | `pnpm case-study:lint` | Validates seed-visible case packets do not leak evaluator-only solution language. |
| Case-study corpus | no direct command | Typed loader for `case-studies/**`; seed paths read only `case-study.md`, judge paths can read `solution.md`; subtype metadata lives in `tools/case-study-manifest.ts`. |
| Source radar | no direct command | Typed source recipes, source outcome snapshot, decay rules, and resolved benchmark calibration. |
| Least-action calibration | no direct command | Typed mechanism-economy fixtures, prompt packaging, weighted fitness components, chart projection, scoring, and six-gate calibration. |
| Knowledge-space boundary | no direct command | Typed memory packet/collapse contracts, provenance guards, visibility rules, and replay-safe invariants. |
| Crucible calibration | no direct command | Typed belief-revision protocol, archetypes, anti-herding judge checks, and baseline-vs-mutagen calibration. |
| Skill lineage | `node --experimental-strip-types tools/skill-lineage.ts` | No-dependency registry check for `skills/LINEAGE.md`. External skill expressions are optional and not part of the kernel contract. |
| Bedrock signal | no direct command | Typed Agora post/verdict schema, polarity map, validators, and agreement-label adapter. |

Canonical sources:

- Trace truth: `src/trace.ts` via `buildRunTrace()`.
- View nav: `tools/view-nav.ts`.
- Live server: `tools/serve.ts`.
- Deploy publisher: `tools/publish.ts`.
- Case-study corpus boundary: `tools/case-study-corpus.ts`.
- Judgment agreement math: `tools/agreement.ts`.
- Source radar knowledge: `tools/source-radar.ts`.
- Least-action calibration: `tools/least-action.ts`.
- Knowledge-space boundary: `tools/knowledge-space.ts`.
- Crucible calibration: `tools/crucible.ts`.
- Skill-lineage drift check: `tools/skill-lineage.ts`.
- Bedrock signal contract: `tools/bedrock-signal.ts`.
- Static design fork: `tools/microscope/architecture-v2.html`; it is not derived from `/api/trace`.

Deleted surfaces stay deleted unless a named consumer returns: hub scripts,
`tools/assay-local.ts`, `tools/microscope/digest.ts`,
`tools/microscope/report.ts`, `tools/microscope/walkthrough.ts`.

Assay, Review, Microscope, and Architecture are local UI renderers behind
`pnpm serve`, not standalone package scripts. `pnpm serve` is the only local UI
front door.
