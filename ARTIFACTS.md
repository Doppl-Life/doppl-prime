# Kernel Artifact Policy

Visibility is not volume, and human readability is not part of the kernel
contract. `src/` emits machine-clean process facts; nodes and the proof board
translate those facts into derived human views.

The default proof path should minimize process, not create an archive chore.
Prefer one command and one glance when the domain allows it. `pnpm build`
typechecks and prints the multi-seed proof board directly to stdout:
`seed -> generated -> rejected -> Explore keeps -> Proof keeps -> swap -> failed checks`.
Files are for replay and investigation after the human already knows what happened.

## Read Order

1. `pnpm build` - default proof. Typecheck plus compact multi-seed board.
2. `pnpm proof` - the proof board alone.
3. `pnpm proof:export` - optional replay output under `out/proof-board/**`.
4. `run-trace.json` - machine trace. Use it for tooling, replay, comparison, or
   contract debugging when `pnpm proof:export` has created it.

## Artifact Classes

| Class | Paths | Keep? | Why |
| --- | --- | --- | --- |
| Source contracts | `src/contracts/index.ts` | yes | Load-bearing boundary definitions. |
| The model | `my-docs/the-hut/**` | yes | Canon: the engine, rating, object model, vocabulary. |
| Fixture inputs | `fixtures/*.json` | yes | Reproducible seed material. |
| Case-study corpus | `case-studies/**` | yes | The seeds; `case-study.md` is seed-visible, `solution.md` is judge-only. |
| Generated run output | `out/**` | no | Ephemeral inspection output; regenerate with `pnpm proof:export`. |
| Promoted proof | `records/<slug>/...` | only by decision | Keep when a run becomes evidence for a design decision or regression. |

Default rule: do not preserve generated output just because it exists. Promote a
run only when the board or trace names a behavior we intend to compare against later.

## Kill Rules

- If a human-facing artifact cannot change a decision in under one minute,
  delete it or demote it to machine trace.
- If an artifact is generated every run but is not read for three meaningful
  runs, stop generating it by default.
- If a report repeats information already visible in stdout or the proof board,
  cut the repeated section unless it supports drill-down.
- If an artifact has no named consumer, action, or regression it can catch, it
  is report theater.
- If human-language fields leak into `src/contracts`, move them to a view or delete them.
- If a filename, command, heading, or doc frame uses conversational process
  language where object-level language would do, rename it before it hardens.
- If the kernel behavior changes materially, the default human surface must expose
  the new RunTrace facts before selector details.

Rich data is fine. Mandatory human reading is the scarce resource.

The principle is "best process is no process." One-button proof is a design
pressure, not a literal law.
