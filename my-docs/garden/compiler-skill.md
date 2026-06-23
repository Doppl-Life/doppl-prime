---
name: compiler
description: >
  Kernel function. Compile a stage's raw output into a valid node markdown file. The
  "markdown is a programming language" compiler — it emits the program (the node). It renders; it
  does not think.
trigger: >
  After a stage's Growth is produced and the judge has evaluated it, to write the result as the next
  node.
kind: kernel function · markdown-as-code · a cheap model is enough
---

# compiler

Takes the kernel's raw stage output plus the judge's evaluation and writes a node that conforms to
`node-template.md`. It does not reason — it renders. A small, fast model is enough (Qwen / GLM /
a mini tier); save the strong models for generate→select and for the judge, not the rendering.

## Inputs

- `stage` — `case_study | problem_recovery | doppl`.
- `parent` — the prior node (its frontmatter + its portable synopsis).
- `growth` — the raw result of this stage's work.
- `discovery` — the context bundle `discovery` returned (for `## Discovery`).
- `evaluation` — from the judge: a per-axis justification for each rubric axis, the boiled-down
  `judge` score, and `temporal`.

## Inputs contract

- **`temporal` comes from the judge.** It is a judgment (is this timing-bound?), emitted as the
  judge's final output just before compile. The compiler never guesses it.
- **Human scores are absent at birth.** A node is compiled judge-only: `scores: { judge, human: null, n: 0 }`. The human number is materialized later from the human ratings ledger (`rating-model.md`), never by the compiler.

## Procedure

1. **Frontmatter** — mint a UUIDv4 `id`; set `stage`, `root` (seed id), `prev` (parent id[s]),
   `kernel`, `temporal` (from the judge), `next` (fixed by stage:
   `case_study → problem_recovery → doppl → null`), `scores: { judge, human: null, n: 0 }`.
2. **Headline** — one line summarizing the Growth result. Becomes the next node's Trace synopsis.
3. **`## Trace`** — copy each prior stage's synopsis **verbatim** from `parent`. Never reword, never
   merge, add nothing.
4. **`## Discovery`** — render what `discovery` pulled in (found, not concluded), citing the field.
5. **`## Growth`** — by stage: a recovery chain (`problem_recovery`) or
   `### Claim` + `### Implications` + `### Opportunities` (`doppl`). On a `problem_recovery` node add
   `### Skin in the Game` (the validation nudges). Then `### Evaluation`, rendered as one
   `#### <axis> <score>` subsection per rubric axis, each carrying the judge's full justification —
   not capped at a sentence.
6. **`## Path`** — the next stage, or `null` at a doppl.
7. **Emit** the file. Validate it parses and every required part is present.

## Hard rules

- The compiler renders; it does not rewrite. Synopses are copied verbatim.
- `id` is a fresh UUIDv4. Links point at ids, never headlines.
- Humans never see a per-axis form — only the single `scores.human`. Per-axis lives in `### Evaluation`.

## Reconcile later (jungle)

The kernel emits a `RunTrace`. The old `kernel.pepsi-output.v1` projection has been burned; the
compiler is its replacement: it writes nodes, not the old Pepsi packet.
