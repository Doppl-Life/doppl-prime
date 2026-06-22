# Runtime Kernel Spec

## Contract

The kernel is one operation:

```text
seed -> generate candidates -> evaluate -> select survivors -> generate again
```

Every mode is a configuration of that loop. Do not create a second engine for a
new surface.

## Reproduction Units

The thing that reproduces is pluggable:

- `thesis`: a claim about the world.
- `consequence`: an implication branch from a thesis.
- `problem-frame`: a recovered hidden variable or real pressure point.
- `solution-candidate`: a concrete intervention after the problem is recovered.
- `agenome`: future agent/scaffold reproduction. Keep the seam, but do not make
  the current kernel depend on it.

A run must say which unit it is breeding. A child must say what changed besides
wording.

## Modes

### Divergent Discovery

Use when the job is to find branches, substrates, hidden dependents, weird
constraints, and opportunity seeds.

- Dial: generation high, selection light.
- Enemy: redundant near-copies and confident slop.
- Output: candidate theses, consequence branches, source-radar seeds, sprouts.
- Fitness emphasis: novelty first, grounding still visible.

### Convergent Problem Recovery

Use when the job is to collapse symptoms into the actual pressure point.

- Dial: generation constrained, selection hard.
- Enemy: premature consensus around the stated complaint.
- Output: hidden variable, deleted assumption, actual problem, falsifier.
- Fitness emphasis: grounding first, novelty as "not the visible framing."

### Oscillating Solution Search

Use when the job is to find what someone should do.

- Dial: alternate divergence and convergence.
- Enemy: solving before problem recovery.
- Output: interventions, strategies, warnings, protocols, tests.
- Fitness emphasis: grounding and mechanism cost, with novelty kept inspectable.

The "perfect Pepsi" vs "perfect Pepsis" choice is a dial decision. If one
hidden variable governs the case, converge. If multiple logics govern different
branches, split the case and converge each branch.

## Current TypeScript Boundary

The runtime truth is `RunTrace`, built by `src/trace.ts` through
`buildRunTrace()`.

The engine files are canonical:

- `src/contracts/index.ts`
- `src/trace.ts`
- `src/generate.ts`
- `src/fitness.ts`
- `src/select.ts`
- `src/lens.ts`

Views, reports, and deploy pages are projections. They may not assemble their own
parallel truth.

## Data Shape

The kernel should keep these concepts explicit even when the implementation names
are smaller:

- `SeedFixture`: source packet, starting thesis/problem, generation caps, and
  expected visibility constraints.
- `CandidateIdea`: generated child with parent id, generation, title, thesis,
  mechanism, claimed delta, source support, and checks.
- `CandidateScores`: novelty, grounding, decay, lens fit, mechanism cost, and
  failed checks.
- `SelectionResult`: survivors, rejected candidates, score explanation, and the
  regret sibling the other dial would have kept when available.
- `RunTrace`: seed, generated pool, rejected pool, selected pool, generation
  events, lens projection, and view metadata.

Names can evolve, but those facts cannot disappear.

## Generation Rules

- Generate from selected parents, not from arbitrary view state.
- Bound generation by max generations, max children per parent, max population,
  wall time, and tool/spend caps.
- Reject no-delta children before they can win by prose.
- Preserve source packet lineage so a human can inspect where a branch came
  from.
- Prefer fixture-authored child packets until live generation has a clear
  consumer and a cheap failure mode.

## Selection Rules

- Select from the same candidate pool when proving diverge vs converge behavior,
  unless the test explicitly names generation as the variable.
- Do not hide direction inside prompts. Direction belongs in the schedule.
- Keep novelty and grounding visible through selection.
- Apply decay in the engine.
- Apply feasibility/lens after intrinsic fitness.

## Energy And Caps

Finite-by-construction is part of the runtime spec, not a deployment detail.

- Current caps: generation depth, population, children per parent, and selected
  survivors.
- Future caps: output token budget, tool-call budget, wall-clock budget, and
  money budget.
- Energy units are allowed as an internal accounting model, but they must map to
  measurable cost. A reasonable first proxy is output-token cost plus tool-call
  count.
- Negative balance means a lineage dies or pauses. It does not borrow invisible
  compute.

## Mutation Library

Mutagen skills are generation operators, not storage. Skill expressions are
optional runtime inputs; the durable kernel-owned record is `skills/LINEAGE.md`.

The runtime can use these operators when they are available:

- breakthrough/rule-of-cool: add a high-leverage branch.
- addition-by-subtraction: delete the highest-leverage obstruction.
- breakout: escape the local frame.
- blindside: find the hidden failure mode.
- first-principles: reduce to invariants.
- constraint-injection: make the branch specific.
- polymath: import a mechanism from another domain.

The kernel should record which operator produced a child. It should not require a
specific external skill loader to run the proof board.

## Tripwires

- A view produces a fact not present in `RunTrace`.
- A new mode owns a separate generator/evaluator/select loop.
- A child has no claimed delta.
- Diverge vs converge cannot be compared on the same pool.
- A run can spend unbounded compute.
- A lens changes intrinsic fitness instead of filtering or re-ranking it.
