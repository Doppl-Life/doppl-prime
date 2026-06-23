# Kernel Case-Study Corpus

Case-study directories contain case packets only.

Each case folder must contain exactly:

- `case-study.md` — the model-visible problem world: object-level facts, actors,
  constraints, relevant history, and open uncertainty.
- `solution.md` — the reference artifact. If the real answer is unknown, it can
  say only that.

Do not put methodology, rubrics, source ledgers, classification rationales,
evaluator coaching, scoring notes, "strong answer should" language, or
known-answer hints beside case packets.

Seed/generation paths read only `case-study.md`. Judge/reference paths may also
read `solution.md`.

The seed carries no classification field — the corpus surfaces title and status
only. Time-decay is the judge's `temporal`, set on later nodes, not on the seed.

Run `pnpm case-study:lint` after editing case packets.
