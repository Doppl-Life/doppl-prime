# Kernel Artifact Policy

Visibility is not volume, and human readability is not part of the kernel
contract. `src/` emits machine-clean process facts. `tools/microscope/`
translates those facts into derived human views.

The default proof path should minimize process, not create an archive chore.
Prefer one command and one glance when the domain allows it; when it does not,
use the smallest credible proof surface. `pnpm build` typechecks and prints the
multi-seed proof board directly to stdout:
`seed -> generated -> rejected -> Explore keeps -> Proof keeps -> swap -> failed checks`.
Files are for replay and investigation after the human already knows what happened.

## Read Order

1. `pnpm build` - default proof. Typecheck plus compact multi-seed board.
2. `pnpm serve` - local judging/viewing front door. Builds traces once, renders
   Assay, Microscope, Architecture, Review, and the static Architecture v2
   artifact together, and saves verdict clicks to the local judgment ledger.
3. `pnpm publish:html` - committed deploy pages under `published/**`.
4. `pnpm serve:static` - static deploy smoke server over `published/**`.
5. `pnpm proof:export` - optional replay output under `out/proof-board/**`.
6. `run-trace.json` - machine trace. Use it for tooling, replay, comparison, or
   contract debugging when `pnpm proof:export` has created it.

## Artifact Classes

| Class | Paths | Keep? | Why |
| --- | --- | --- | --- |
| Source contracts | `src/contracts/index.ts`, `contracts/README.md` | yes | Load-bearing boundary definitions. |
| Fixture inputs | `fixtures/*.json` | yes | Reproducible seed material. |
| Microscope tools | `tools/microscope/**` | no by default | Human translation layer; keep only while useful. |
| Assay tools | `tools/assay.ts`, `fixtures/assay/**`, `fixtures/controls/**`, `ASSAY.md` | yes | Outcome surface for judging whether runs create useful discovery material. |
| Judgment tools | `tools/judgments.ts`, `tools/assay-report.ts`, `tools/serve.ts` | yes | Local path from human verdicts to durable evidence and digest. |
| Local judgment ledger | `records/assay-judgments/*.jsonl` | no by default | Personal/team local verdict events; promote only by explicit decision. |
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
- If human-language fields leak into `src/contracts`, move them to
  `tools/microscope` or delete them.
- If a filename, command, heading, or doc frame uses conversational process
  language where object-level language would do, rename it before it hardens.
- If the kernel behavior changes materially, the first viewport of any default
  microscope view must expose the new RunTrace facts before selector details and
  explain the reading order, terms, and current conclusion.
- If a visibility surface needs another URL, command, or memory trick to find
  the conclusion, make the default surface link it or demote the surface.

Rich data is fine. Mandatory human reading is the scarce resource.

The principle is "best process is no process." One-button proof is a design
pressure, not a literal law.
