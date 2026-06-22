# Skill Lineage

Kernel-owned registry for reusable mutation strategies. It records pedigree,
mutation, status, and evidence. It is not the storage location for
runtime-specific `SKILL.md` files.

Expression files can live wherever a runtime discovers them. The kernel depends
on the lineage ids and operator meanings, not those runtime paths.

## Roster

| Lineage id | Gen | Parent | Mutation | Stratum | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `rule-of-cool` / `breakthrough` | 0 | none | gen-0 seed; phenotype renamed Rule of Cool -> Breakthrough on 2026-06-18, lineage id conserved | witness/reframe | stable | progenitor skill; no verdict ledger evidence yet |
| `breakout` | 1 | `rule-of-cool` | valence flip toward divergent-up: drop the feasibility filter, raise variance, hunt the frame-breaking branch | ideation | coined | sibling of `blindside`; no verdict ledger evidence yet |
| `blindside` | 1 | `rule-of-cool` | valence flip toward divergent-down: hunt the non-obvious failure mode, buried assumption, or opportunity cost | ideation/deliberation | coined | sibling of `breakout`; no verdict ledger evidence yet |
| `first-principles` | 1 | `rule-of-cool` | basis transform: discard inherited frames, expose invariants, reconstruct from what must be true | foundations/ideation | coined | subtract-then-reconstruct fork; no verdict ledger evidence yet |
| `constraint-injection` | 1 | `rule-of-cool` | scarcity operator: add the productive constraint that forces specificity, taste, and testability | ideation/design/execution | coined | productive-scarcity fork; no verdict ledger evidence yet |
| `polymath` | 1 | `rule-of-cool` | domain transfer: import a proven mechanism from another field to crack this one | ideation | coined | promoted from the older transfer-hunter archetype; no verdict ledger evidence yet |
| `addition-by-subtraction` | 1 | `rule-of-cool` | convergent best-add -> convergent best-cut: highest-leverage removal | ideation/design/editing | coined | via-negativa sibling of `breakthrough`; no verdict ledger evidence yet |

## Frontmatter Convention

Each runtime expression can carry this block:

```yaml
lineage:
  id: rule-of-cool
  parent: null
  generation: 0
  mutation: null
  stratum: "Lalpha"
  status: stable
  bedrock: []
```

`stratum` is observed, not enforced. Do not pre-carve a taxonomy; let families
emerge when repeated runs show the same operator winning.

## Operator Map

| Operator | Children | Use |
| --- | --- | --- |
| `valence-flip` | `breakout`, `blindside`, `addition-by-subtraction` | keep the skeleton, flip whether the move hunts upside or downside |
| `basis-transform` | `first-principles` | remove inherited frames and reconstruct from invariants |
| `scarcity-operator` | `constraint-injection` | add pressure that improves specificity and taste |
| `domain-transfer` | `polymath` | transfer a mechanism across domains |

The catalog is open. Add an operator only when repeated runs need a name for a
winning mutation, not because the map looks incomplete.

## Convergence Watch

Promote a watched move only when unrelated runs re-create it and verdicts justify
the added surface.

- `clarifying-questioner`: asks the question that prevents the wrong build.
- `falsifier-audit`: writes the cheap check that can make the claim fail.
- `harness-runner`: runs an experiment and emits a comparable trace.
- `collapse-distill`: folds a dead artifact into a register, spec, or skill.
- `why-now-tester`: applies the +/-5-year test, dated signals, why-now recovery,
  and falsifiable prediction for `zeitgeist_synthesis`.
- `unlock-cluster-mapper`: maps a large unlock in breadth, groups branches by
  substrate removed, takes fertile branches deep, then synthesizes convergence.

None are promoted yet.

## Evidence Loop

Skills are selected by verdicts over outputs, not by whether the lineage story is
interesting.

```text
skill expresses -> produces candidates -> verdicts logged -> promote/mutate/deprecate
```

Track sprout evidence and afrit evidence separately. A skill can be generative
while producing weak final answers, or boring while producing strong final
answers.

Gate before propagate: a mutated skill is promoted only if verdicts correlate
with bedrock. Otherwise it stays an experiment.
