---
name: compiler
description: >
  Kernel function. Compile a stage's raw output into a valid node markdown file. The
  "markdown is a programming language" compiler — it emits the program (the node). It renders; it
  does not think.
trigger: >
  After a stage's Growth is produced (the kernel finishes a generate→select pass), to write the
  result as the next node.
kind: kernel function · markdown-as-code · a cheap model is enough
---

# compiler

Takes the kernel's raw stage output and writes a node that conforms to `node-template-draft.md`. It
does not reason — it renders. A small, fast model is enough (Qwen / GLM / a mini tier); save the
strong models for the generate→select work, not the rendering.

## Inputs

- `stage` — `case_study | problem_recovery | doppl`.
- `parent` — the prior node (its frontmatter + its portable synopsis).
- `growth` — the raw result of this stage's work.
- `discovery` — the context bundle `discovery` returned (for `## Discovery`).
- `evaluation` — the judge's per-axis scores + reasoning, plus the boiled-down `scores`.

## Procedure

1. **Frontmatter** — mint a UUIDv4 `id`; set `stage`, `root` (seed id), `prev` (parent id[s]),
   `kernel`, `temporal`, `next` (the next stage, or `null` at a leaf), `scores`.
2. **Headline** — one line summarizing the Growth result. Becomes the next node's Trace synopsis.
3. **`## Trace`** — copy each prior stage's synopsis **verbatim** from `parent`. Never reword, never
   merge, add nothing of your own.
4. **`## Discovery`** — render what `discovery` pulled in (found, not concluded), citing the field.
5. **`## Growth`** — render by stage: a recovery chain (`problem_recovery`) or
   `### Claim` + `### Implications` + `### Opportunities` (`doppl`); add the leaf action surface if
   this is the leaf (`### Skin in the Game` for a problem leaf); then `### Evaluation` from
   `evaluation`.
6. **`## Path`** — the next stage, or `null`.
7. **Emit** the file. Validate it parses and every required part is present.

## Hard rules

- The compiler renders; it does not rewrite. Synopses are copied verbatim.
- `id` is a fresh UUIDv4. Links point at ids, never headlines.
- Humans never see a per-axis form — only the single `scores`. Per-axis lives in `### Evaluation`.

## Reconcile later (jungle)

The kernel emits a `RunTrace` and a `kernel.pepsi-output.v1` projection today. The compiler is the
garden's replacement for that projection: it writes nodes, not the old Pepsi packet.
