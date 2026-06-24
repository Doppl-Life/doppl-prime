# AGENTS.md

## Canon and the hut

The frozen model lives in two homes: `contracts/**` (typed MarkScript artifact shapes) and
`mechanics/**` (kernel behavior — engine, discovery, compiler). Vocabulary is `my-docs/GLOSSARY.md`.
`my-docs/the-hut/` is the **proposal space** — where unfrozen decisions are still being shaped.

When canon (contracts/mechanics) and the running kernel (`src/`, `tools/`) disagree, **canon wins**;
the kernel follows, deliberately. Change the decision in canon first; the kernel catches up as its
own planned step. "It's still in the kernel" is not an argument for keeping a concept canon has cut.

The hut is **provisional** — live until a decision freezes out into contracts/mechanics. Do not let
it quietly grow back toward what the kernel assumes, and do not leave a hut draft beside a frozen
contract.

## The thing is the thing (no history in canon)

Canon — `contracts/`, `mechanics/`, the model — states what **is**, in present tense. It never narrates
what was. Do not write "the old X", "burned", "replaced the old", "no longer", "formerly", "promoted
from", "reconcile later (jungle)", or name a removed/dead concept to warn against it — naming a dead
thing sends the next agent hunting for it, which is the exact harm. If you feel the urge to explain a
change, you are writing history: stop, and describe the present. The only home for *why* a decision was
made is `my-docs/MEMORY.md`; kernel↔canon reconciliation is a present-tense task, never a catalog of
old concepts.

## Working rules

- Do not change `src/**` kernel semantics unless the user explicitly asks. (Canon tells you
  *what* to build toward; it is not standing permission to rewrite the engine.)
- Trace truth: `src/trace.ts` via `buildRunTrace()`. Every human surface is a projection of
  the trace; the trace is the specimen.
- `out/**` is disposable drill-down output.
- Contracts live under `contracts/**`, kernel behavior under `mechanics/kernel/**`, unfrozen proposals in
  `my-docs/the-hut/**`; durable kernel decisions live in `my-docs/MEMORY.md`.
- This branch is Doppl. Do not qualify it with migration tracks, compatibility branches, or
  derivative paths.
- After a cleanup pass, remove the cleanup machinery unless it enforces a durable contract.
  Temporary scans, lists of dead names, and one-off guards do not survive the cleanup they
  enabled.
- Cut to the safety net; the human holds the ledger. Scale cut-depth to reversibility, not
  human refactor-pain: where git + `pnpm proof` cover a change, burn hard ("if you don't have
  to put anything back, you didn't cut enough"). This is safe because the labor is split —
  **you delete, the human commits.** The agent makes reversible cuts; the human owns
  stage/commit/unstage/reset, which is the net (see Shell and tools). Never burn irreversible
  or external side-effects this way. Full move in [`HEURISTICS.md`](HEURISTICS.md).

## Duplicate surfaces

Do not create shadow hubs, duplicate servers, planning archives, or parallel instruction
files that compete with the hut or the named registers below. The hut owns the model;
the registers own the kernel's operating reality. One home per fact.

## Scope boundary

Do not import product application architecture, docs, or repository assumptions unless the
user explicitly asks.

## First-principles guardrail

For strategic, architectural, spec, product-direction, or abstraction-setting work, do not
treat existing repo assumptions as bedrock. Treat them as evidence to test against current
goals, kernel behavior, the hut, and explicit user intent.

Use the `first-principles` mutagen skill actively for this class of work: reduce the problem
to invariants, name the provisional assumption you are rejecting or depending on, and only
then branch into implementation or documentation.

Do not trigger a full rethink for narrow mechanical edits unless the edit depends on an
unvalidated product or architecture premise. If first-principles reasoning would send the work
in a materially different direction than the repo appears to assume, pause and ask the user.

Log only important, interesting, actionable, or actioned-on corrections in the appropriate
register. Do not memorialize every merely true assumption.

## Registers

Log durable findings in one home:

| Finding | File |
| --- | --- |
| Typed artifact shape (node, rating, stock, trace, projection) | `contracts/**` |
| Kernel behavior (engine, discovery, compiler) | `mechanics/kernel/**` |
| Term / vocabulary | `my-docs/GLOSSARY.md` |
| Unfrozen proposal | `my-docs/the-hut/**` |
| Active fork or ownership decision | `my-docs/MEMORY.md` |
| Durable lesson or banger | `my-docs/LESSONS_AND_BANGERS.md` |
| Portable move or trap | `my-docs/HEURISTICS.md` |
| Reward hack or confirmed failure | `my-docs/BUGS_AND_MITIGATIONS.md` |
| Operational watch item | `my-docs/OPERATIONAL_WATCHLIST.md` |
| Kernel invariant | `my-docs/INVARIANTS.md` |
| How to run/use the kernel | `README.md` or `tools/README.md` |

Do not dump transient debug notes into registers. One idea, one home.

## Skills and mutations

Skill expressions are external and optional. The kernel-owned surface is the lineage registry
at `skills/LINEAGE.md`, checked by `tools/skill-lineage.ts`.

Use mutagen skills when the work is creative or strategic:

- `breakthrough` / `rule-of-cool`: best 10x addition.
- `addition-by-subtraction`: highest-leverage removal.
- `breakout`: escape the frame.
- `blindside`: find the non-obvious failure mode.
- `first-principles`: reduce to invariants.
- `constraint-injection`: force specificity.
- `polymath`: borrow a solved mechanism from another domain.

## Shell and tools

- Prefer `rtk` commands for shell work.
- Use `rg`/`rtk grep` for search.
- Use CodeGraph before broad semantic navigation.
- Run `codegraph sync .` after meaningful edits.
- Never stage, unstage, commit, or reset unless explicitly told.
- Never read, diff, print, validate, or edit real env/secret files.

## Checks

Default verification for tooling changes:

```bash
pnpm typecheck
pnpm build
pnpm proof
```
