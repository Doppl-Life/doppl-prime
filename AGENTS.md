# AGENTS.md

## Working rules

- Do not change `src/**` kernel semantics unless the user explicitly asks.
- Trace truth: `src/trace.ts` via `buildRunTrace()`.
- Local viewer: `pnpm serve`.
- Deploy pages: `pnpm publish:html`.
- `published/**` is the committed deploy page surface; `published/index.html`
  is generated at build time and ignored.
- `out/**` is disposable drill-down output.
- Specs live under `specs/**`; memory lives in `MEMORY.md`. Historical source is
  not authority unless a named kernel artifact still needs it.
- After a cleanup pass, remove the cleanup machinery unless it enforces a
  durable contract. Temporary scans, lists of dead names, and one-off guards do
  not survive the cleanup they enabled.

## Duplicate surfaces

Do not create shadow hubs, duplicate servers, planning archives, or parallel
instruction files that compete with the named surfaces above.

## Scope boundary

Do not import product application architecture, docs, or repository assumptions
unless the user explicitly asks.

## Registers

Log durable findings in one home:

| Finding | File |
| --- | --- |
| Build contract or evaluation doctrine | `specs/**` |
| Active fork or ownership decision | `MEMORY.md` |
| Durable lesson or banger | `LESSONS_AND_BANGERS.md` |
| Portable move or trap | `HEURISTICS.md` |
| Reward hack or confirmed failure | `BUGS_AND_MITIGATIONS.md` |
| Operational watch item | `OPERATIONAL_WATCHLIST.md` |
| Lineage/delta schema change | `docs/lineage-ledger.schema.md` |
| Term definition | `GLOSSARY.md` |
| How to run/use the kernel | `README.md` or `tools/README.md` |

Do not dump transient debug notes into registers. One idea, one home.

## Skills and mutations

Skill expressions are external and optional. The kernel-owned surface is the
lineage registry at `skills/LINEAGE.md`, checked by `tools/skill-lineage.ts`.

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
pnpm publish:html
```

For viewer changes, start `pnpm serve` and verify the canonical routes. For deploy
changes, start `pnpm serve:static` and verify `published/**` routes.
