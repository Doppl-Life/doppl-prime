# Doppl Kernel

Doppl Kernel is a TypeScript runtime for generation under selection: a run can
diverge, converge, or oscillate; fitness is novelty x grounding; decay lives in
the engine; lenses apply after selection.

The current artifact is a runnable proof board, trace contract, fixture corpus,
and local/deploy views that make selection behavior visible against real ideas.

## Read order

1. **[`AGENTS.md`](./AGENTS.md)** — operating rules for the kernel.
2. **[`SPINE.md`](./SPINE.md)** — the conceptual heart. One kernel, two directions, the
   two-axis fitness, decay as the time axis, lens on top. *Start here.*
3. **[`INVARIANTS.md`](./INVARIANTS.md)** — rules that must survive implementation
   changes.
4. **[`specs/`](./specs/README.md)** — build contracts for runtime, fitness,
   Pepsi output, assay corpus, and deploy surfaces.
5. **[`SPEC.md`](./SPEC.md)** — the build plan: the artifact, the core abstractions,
   canonical contracts, settled decisions, and open questions.
6. **[`ARTIFACTS.md`](./ARTIFACTS.md)** — proof surfaces, generated-output policy,
   and artifact kill rules.
7. **[`ASSAY.md`](./ASSAY.md)** — outcome-oriented discovery assay: stages, default
   cases, win condition, and feedback scale.
8. **[`OPERATIONAL_WATCHLIST.md`](./OPERATIONAL_WATCHLIST.md)** — process traps and
   convergence signals to monitor while the kernel runs.
9. **[`BUGS_AND_MITIGATIONS.md`](./BUGS_AND_MITIGATIONS.md)** — mistakes and
   mitigations the kernel should not relearn.
10. **[`HEURISTICS.md`](./HEURISTICS.md)** — portable moves and traps for runs.
11. **[`MEMORY.md`](./MEMORY.md)** — active fork decisions that still constrain
    this kernel.
12. **[`LESSONS_AND_BANGERS.md`](./LESSONS_AND_BANGERS.md)** — short durable
    lessons carried forward.
13. **[`docs/lineage-ledger.schema.md`](./docs/lineage-ledger.schema.md)** — the
   machine-readable delta/lineage memory contract for future runs.
14. **[`GLOSSARY.md`](./GLOSSARY.md)** — local terms used by the kernel.

The kernel lives in `src/`. Human-facing views live in `tools/microscope/` and
are disposable unless they prove reusable. Views project the trace; they do not
become the trace.

## The one line

We didn't find another feature. We found that everything already built is **one engine
wearing different masks**, and the masks are *dial settings*, not separate machines.

## Status

Runnable TypeScript prototype started. Current slice proves:

- multiple seed fixtures run through the same proof board
- source packets generate children through named reproduction operators
- no-delta packets are rejected before fitness
- generated children carry lineage, delta, parent, and generation
- novelty and grounding are computed from seed/candidate/source text, not required fixture scores
- bounded generation 2 expands fixture-authored child packets from selected candidates under caps
- decay is an engine time factor; feasibility is a post-selection lens
- the same generated pool supports diverge vs. converge selection

## What To Do

Run `pnpm build` when you want the default proof. It typechecks and prints the compact
multi-seed board:
`seed -> generated -> rejected -> Explore keeps -> Proof keeps -> swap -> failed checks`.

Run `pnpm proof:export` only when you need replay artifacts under `out/proof-board/**`.

Run `pnpm serve` when you want the local front door. It builds the trace once
per fixture, renders Assay, Microscope, Architecture, and the static
Architecture v2 artifact from one localhost surface, and saves verdict clicks
automatically to `records/assay-judgments/judgments.jsonl`.

Run `pnpm case-study:lint` after editing case packets. It verifies seed-visible
case material does not leak evaluator-only solution language.

`pnpm serve` is the only local UI entry point. Assay, Microscope, Architecture,
Architecture v2, and Review are renderers behind that server, not separate
package scripts.

## Publishing pages to the deployed hub

`out/**` is ephemeral and gitignored, so those pages never reach the deploy. To
surface the HTML views on the live site, run `pnpm publish:html`: it renders the
same Assay, Microscope, Architecture, and static Architecture v2 surfaces used by
`pnpm serve` directly into committed `published/*.html`, and writes an ignored
`published/index.html` deploy hub.

Deployment config should run `pnpm publish:html` and serve only `published/**`
through `pnpm serve:static`. Local judgment consensus is intentionally
local-only until the team decides to promote a ledger.
