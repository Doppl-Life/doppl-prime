# bedrock/ - proof anchors

**Status:** repo integrity now has a cheap executable gate in
[`../tools/integrity.ts`](../tools/integrity.ts); Agora signal schema + examples live in [`signal/`](./signal/README.md), with a TypeScript adapter at [`../tools/bedrock-signal.ts`](../tools/bedrock-signal.ts).
We are early; this is a **requirements stub plus first signal contract, not a full design.**

Bedrock is the one thing in Doppl that **may not move**: the un-fakeable anchor for
what counts as a "better idea," so the selection loop cannot win by fooling its own
critic. The objective may evolve; bedrock may not. See [`../GLOSSARY.md`](../GLOSSARY.md)
(Bedrock) and [`../specs/fitness-selection.md`](../specs/fitness-selection.md).

## Required direction

- **Executable checks** — assertions that pass/fail without a model's opinion. Even a
  trivial first one (a plumbing invariant, a golden-transcript probe) counts, as long
  as it can go **RED**.
- **Held-out judgment** — judges the breeding/debate loop never sees and cannot author.
- **Falsifiable repro triggers** — every register "bedrock assertion" should eventually
  point at one of these.
- **A correlation gate** — a metric mutation survives only if it keeps tracking bedrock.

## Deliberately NOT defined yet

The full fitness function, the rubric schema, the held-out human panel, and the
ML correlation test. Naming them now would be over-building. Define more bedrock
only when a named kernel result demands it.

## First candidates (sketches)

Two complementary first instances, neither exclusive:

- **Check #1 — repo integrity:** the cheapest possible bedrock — an executable
  check that the canonical package scripts, deploy pages, source files, and
  removed-command references stay aligned. It runs inside `pnpm build` through
  [`../tools/integrity.ts`](../tools/integrity.ts).

- **Check #2 — human judgment via the Agora (schema sketched):** the async channel where the
  kernel surfaces ideas to the Agardeners; each reaction is logged as a falsifiable
  `(context, idea, judgment)` **verdict**. First human-judgment anchor named
  above. Schema + contract: [`signal/`](./signal/README.md). Reward-hack
  defenses (politeness inflation, survivorship bias, Goodhart-on-cool) live in
  [`../BUGS_AND_MITIGATIONS.md`](../BUGS_AND_MITIGATIONS.md); the fork rationale in
  [`../MEMORY.md`](../MEMORY.md).
