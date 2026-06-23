# AGENTS.md

## The hut is canon

`my-docs/the-hut/` defines the model and is where we operate from. When the
hut and the running kernel (`src/`, `tools/`, `specs/`) disagree, **the hut wins**;
the kernel follows, deliberately. Change the decision in the hut first; the kernel
catches up as its own planned step. "It's still in the kernel" is not an argument for keeping
a concept the hut has cut.

The hut is canon but **provisional** — live until we freeze it on purpose. Do not let it
quietly grow back into what the old kernel assumed.

## Working rules

- Do not change `src/**` kernel semantics unless the user explicitly asks. (The hut being
  canon tells you *what* to build toward; it is not standing permission to rewrite the engine.)
- Trace truth: `src/trace.ts` via `buildRunTrace()`. Every human surface is a projection of
  the trace; the trace is the specimen.
- `out/**` is disposable drill-down output.
- Specs live under `specs/**`; the model lives in `my-docs/the-hut/**`; durable kernel
  decisions live in `MEMORY.md`.
- This branch is Doppl. Do not qualify it with migration tracks, compatibility branches, or
  derivative paths.
- After a cleanup pass, remove the cleanup machinery unless it enforces a durable contract.
  Temporary scans, lists of dead names, and one-off guards do not survive the cleanup they
  enabled.

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
| The model (stages, node, rating, engine, vocabulary) | `my-docs/the-hut/**` |
| Build contract or evaluation doctrine | `specs/**` |
| Active fork or ownership decision | `MEMORY.md` |
| Durable lesson or banger | `LESSONS_AND_BANGERS.md` |
| Portable move or trap | `HEURISTICS.md` |
| Reward hack or confirmed failure | `BUGS_AND_MITIGATIONS.md` |
| Operational watch item | `OPERATIONAL_WATCHLIST.md` |
| Kernel invariant | `INVARIANTS.md` |
| Term definition | `GLOSSARY.md` |
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

For case-study edits, run `pnpm case-study:lint` to confirm seed-visible material leaks no
evaluator-only language.
