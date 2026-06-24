# skills/ - skill lineage registry

Skills are reusable mutation strategies. Track parent, mutation, evidence,
status, and promotion history in `LINEAGE.md`.

Executable skill storage is optional. Lineage is mandatory.

## Storage split

A skill file (`SKILL.md` + optional scripts) is an **expression** that a runtime
discovers and runs. The kernel does not depend on a specific runtime skill path.
It owns the lineage.

What outlives any single expression is the **lineage**: who its parent was, what
mutation produced it, what evidence promoted it, and whether it still earns its
status. So:

- **Expression** -> runtime-discovered `SKILL.md` files, or
  `skills/<name>/SKILL.md` when the kernel owns the executable copy.
- **Lineage** -> [`LINEAGE.md`](./LINEAGE.md).
- **Self-description** -> a `lineage:` block in each skill's own frontmatter.

The registry, not the storage location, is the durable object.

## Lineage frontmatter convention

Every skill under selection carries this block (runtime loaders ignore unknown keys):

```yaml
lineage:
  id: rule-of-cool          # stable lineage id
  parent: null              # parent lineage id, or null for a gen-0 root
  generation: 0             # 0 = ancestral seed
  mutation: null            # one line: what changed from the parent (null for roots)
  stratum: "Lalpha"         # OBSERVED, not enforced — where it has tended to express
  status: stable            # coined | working | stable | deprecated
  bedrock: []               # verdict/evidence refs that promoted or pruned it
```

`stratum` is an **observation, not a partition.** Do not pre-carve an L1-L2 /
L2-L3 / L3-L4 / Lalpha skill taxonomy. Let families emerge from runs and record
the convergence when the same strategy keeps reappearing. Premature taxonomy is
the enemy.

## How a skill evolves (mutation · divergence · convergence)

- **Mutation** — a child skill with `parent` set and a one-line `mutation`. Generation += 1.
- **Divergence (fork)** — two children of one parent specialize in different directions; both get
  rows, same parent, different `mutation`.
- **Convergence** — two *unrelated* lineages independently arrive at the same
  strategy (the uncle-questioner, the falsifier-audit, the harness-runner).
  Note it: convergence is the signal to **promote** to a shared skill.
- **Death** — a skill that stops earning is marked `deprecated` (point to its successor); the file
  may be pruned, the lineage row stays.

## The loop that closes with the Agora

This is why the registry matters: **the Agora's verdicts select on skills, not just on ideas.**

```
skill expresses ──► produces ideas in a run ──► Agora posts (sprout/afrit)
        ▲                                              │
        │                                       verdicts logged
        │                                              │
        └──── promote / mutate / deprecate ◄───── attribute verdict
              (recorded in LINEAGE.md bedrock col)    to source skill
```

A skill whose ideas keep earning strong ratings ([rating-model](../contracts/rating.md))
earns the right to spawn mutated children and gets more energy budget; one whose ideas draw
negative ratings starves toward `deprecated`. A skill can be a strong **sprouter** (great
process/generativity) but bear weak **doppls** (poor conclusions) — those are different
fitnesses, so a skill's evidence should track them separately.

**Gate before propagate:** a new/mutated skill is promoted only if its verdicts correlate with
bedrock — otherwise it's [memetic cancer](../BUGS_AND_MITIGATIONS.md), archived not promoted.

## Status

The registry and frontmatter convention exist; the verdict-to-lineage adapter
does not. Start by hand: when a run produces a reusable skill, add a
`LINEAGE.md` row and a `lineage:` block. Automate only once there are enough
verdicts to bother.

Current drift check:

```bash
node --experimental-strip-types tools/skill-lineage.ts
```
