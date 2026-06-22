# The Node — one shape, two stage variants

Every non-seed node has the same four parts: `## Trace` · `## Discovery` · `## Growth` (with
`### Evaluation` inside) · `## Path`. The frontmatter is identical too. **Only two things change by
stage** — the content of `## Growth`, and the leaf action surface. The seed is different and minimal
(`case-study-template-draft.md`).


|                                              | `problem_recovery`                                | `doppl`                                                |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| Growth content                               | the recovery chain (surface → … → actual problem) | `### Claim` + `### Implications` + `### Opportunities` |
| leaf action surface (only if it is the leaf) | `### Skin in the Game`                            | Opportunities already is it                            |
| `next`                                       | `doppl`                                   | `null`                                     |


`next` is fixed by stage: `case_study → problem_recovery`, `problem_recovery → doppl`, `doppl → null`.

Both variants are shown in full below, so the writer knows exactly what each must contain.

## Variant A — a `problem_recovery` node

```markdown
---
id: 4d1e8f0a-2b3c-4d5e-8f90-1a2b3c4d5e6f   # UUIDv4
stage: problem_recovery
root: 7c3a9b12-4f5e-4a01-9c2d-1e6b8a0f3d44     # the seed case_study id
prev: [7c3a9b12-4f5e-4a01-9c2d-1e6b8a0f3d44]
kernel: melissa                  # [optional] Cody | Melissa | Michael | Dalton | prime
temporal: false                  # true = zeitgeist (decays) · false = transfer (timeless)
next: doppl                      # deterministic by stage: problem_recovery → doppl
scores: { judge: 3, human: -2, n: 4 }   # single -5..+5 each. projection of the ratings ledger.
---

# Refined-supply access is the real battery constraint

## Trace

### Case study · synopsis

Battery supply is read as a raw-materials scarcity story.

## Discovery

### Refining bottleneck

Refining capacity, not raw lithium, is the binding constraint.  → field: battery-supply

### Offtake lock

Yuan-denominated offtake pulls supply off the spot market.  → field: battery-supply

## Growth — Problem recovery

surface complaint → deleted assumption → hidden variable → actual problem → candidate response

### Skin in the Game            <!-- on a problem_recovery node · real-world-first validation nudges -->

- who to talk to · the cheap quick real-world tests that risks time/money/ego · what would change your mind

### Evaluation                  <!-- judge's ground truth; humans get one slider, not this -->

#### Novelty +3

Reframes off the consensus scarcity story — from "raw lithium is scarce" to "refined-supply access is the bind." Room here to lay out why that reframe isn't already priced in.

#### Grounding +2

Sourced; mechanism plausible. Drop the refining-capacity and offtake receipts here as they firm up.

#### Worth the squeeze +1

Needs primary research to confirm the offtake lock; until then the cost of certainty is high.

#### Lens fit +3

Actionable for the allocator lens — it points at instruments, not just a thesis.

#### Falsifiability +2

Falsifier named: if refined-supply spreads don't widen as AV demand rises, the frame is wrong.

## Path

next: doppl
```

## Variant B — a `doppl` node (leaf)

```markdown
---
id: a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d   # UUIDv4
stage: doppl
root: 7c3a9b12-4f5e-4a01-9c2d-1e6b8a0f3d44
prev: [4d1e8f0a-2b3c-4d5e-8f90-1a2b3c4d5e6f]   # the problem_recovery node
kernel: melissa
temporal: false
next: null
scores: { judge: 4, human: 3, n: 6 }
---

# Own the refining bottleneck, not the lithium

## Trace

### Case study · synopsis

Battery supply is read as a raw-materials scarcity story.

### Problem recovery · synopsis

The real constraint is access to refined supply under yuan-locked offtake — not raw scarcity.

## Discovery

### Refining bottleneck

Refining capacity, not raw lithium, is the binding constraint.  → field: battery-supply

### Offtake lock

Yuan-denominated offtake pulls supply off the spot market.  → field: battery-supply

## Growth — Doppl

### Claim

The unlock is refining capacity + offtake position, not extraction.

### Implications

- loses substrate: lithium miners priced on raw scarcity · wins: refiners, offtake holders, toll-processors

### Opportunities

- where to deploy, who to back, what to build / short / hedge

### Evaluation                  <!-- judge's ground truth; humans get one slider, not this -->

#### Novelty +2

The refining/offtake unlock is a real reframe, though parts are becoming visible to the market.

#### Grounding +3

Refining-capacity and yuan-offtake mechanics are sourced; one dated signal.

#### Worth the squeeze +4

Investable via liquid instruments — low ownership burden for the exposure it buys.

#### Lens fit +3

Fits a capital-allocator lens; points at deployable positions.

#### Falsifiability +1

Falsifier named but soft; tighten the dated test.

## Path

null
```
