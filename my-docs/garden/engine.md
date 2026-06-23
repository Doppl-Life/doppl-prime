# The Engine — the generate→select crucible (promoted from the kernel)

The hut names the spine — `case_study → problem_recovery → doppl` — and says *each spine
arrow is the kernel: one pass of the generate→select crucible* (`object-model.md`). This file
is that crucible written down, so the hut holds enough to regrow it when the jungle burns.

**Promoted, not imported.** This is the distilled contract of `src/generate.ts`,
`src/fitness.ts`, `src/select.ts`, `src/lens.ts`, `src/trace.ts` — the mechanism, in the
garden's dialect. The jungle code is the origin; this doc is the authority. When they
disagree, this wins (rule of the hut).

## What one spine arrow does

One arrow = one pass of the crucible over a population:

```
generate candidates → score them (measurements) → select survivors (dial) → lens (feasibility)
```

It does **not** pick the best candidate. It **breeds a stronger child** from the population
(`object-model.md`, `LEXICON.md`). The bar is anti-fragility: a child that gets stronger
under variation. The compiler then writes the survivor into the next node; the judge's
−5…+5 rating (`rating-model.md`) is a separate pass layered on the same survivor.

## The dial: diverge ↔ converge

One knob, two postures.

- **diverge** (r-like) — many cheap children, broad search. Priority axis **novelty**;
  grounding is a floor, not the goal.
- **converge** (K-like) — few invested children, refined near the best. Priority axis
  **grounding**; novelty is the floor.

A run dials between them; the schedule *is* the application.

## Measurements (0–1) — the two axes

These are **measurements**, not ratings (`rating-inventory.md`): instrument readings clamped
to `[0,1]`, rounded to 3 decimals. They feed the judge's −5…+5 rating; they are never shown
as a verdict. Novelty and grounding stay **separate** — never collapsed to one number before
selection has made the tradeoff visible.

**Novelty** = weighted sum of three 0–1 components:

| component | weight | reading |
| --- | --- | --- |
| sourceAbsence | 0.50 | fraction of candidate tokens absent from the seed (new-vs-known ratio) |
| substrateDistance | 0.30 | same ratio over `substrate + operator` text |
| hiddenDependents | 0.20 | density of dependency language (depends/downstream/supply/market/…) + claim/delta count |

**Grounding** = weighted sum minus a penalty:

| component | weight | reading |
| --- | --- | --- |
| signalStrength | 0.40 | evidence count + evidence token density + named-signal hits (market/policy/deployment/…) |
| mechanismClarity | 0.25 | mechanism length + causal markers (if/because/when/removes/…) |
| falsifiability | 0.25 | checkable markers (will/predict/measure/reprice/digits) + claims + evidence |
| riskPenalty | −0.10 | hedge words (might/could/speculative/…) + an unsupported-claim penalty when evidence is empty |

Both are deterministic text/source signals on purpose: **novelty must not be model
self-grading** (it must point at absence-from-record); **grounding must point outside the
prose**. Swap in a richer scorer only when it has a named consumer and clearer failure
detection.

> Reconciliation: the garden's five judge axes (`rating-model.md`) are −5…+5 *ratings*.
> These two 0–1 *measurements* map **into** Novelty and Grounding. Falsifiability,
> Cost-efficiency, and Relevance are judge-only ratings with no engine instrument yet —
> open: build instruments or leave judge-only.

## Selection aim

The selector contract is `novelty × grounding`. The project aim is larger: surface true, non-obvious, actionable implications.

Consensus-gap names part of that aim. It is useful doctrine, but not a typed axis until we can define consensus among whom, against what record, and measured how.

## Decay — stubbed to zero

Decay is configured to `0` for now. The engine keeps `temporal` as metadata, but active decay is a no-op: `decay = 0`, `decayFactor = 1`, and selection scores do not change with age.

- **temporal: true** — timing-bound, eligible for a future decay mechanism.
- **temporal: false** — timeless, not eligible for decay.

The future mechanism can bolt onto this seam by replacing `decay = 0` with a named time function. Until then, no half-life table is active in the garden.

## Selection — Pareto front, then directional rank, under floors

Per dial, a `SelectionSchedule`: `{ keep:3, priorityAxis, floorAxis, floor }`.

| dial | priority | floor axis | floor |
| --- | --- | --- | --- |
| diverge | novelty | grounding | 0.35 |
| converge | grounding | novelty | 0.25 |

Procedure:

1. **Pareto fronts first** — rank candidates by non-domination over (novelty × grounding).
   Front 1 = the frontier nothing beats on both axes. This preserves the two-axis tension
   *before* any scalar collapse.
2. **Floor gate** — drop anything whose floor-axis measurement is below the floor.
3. **Directional score** = `priority·0.7 + secondary·0.2 + balanceBonus·0.1`, where
   `balanceBonus = 1 − |novelty − grounding|` (rewards candidates strong on both).
4. **Decay-adjust** — currently no-op because `decayFactor = 1`.
5. **Rank** by front, then decay-adjusted score, then the priority axis; **keep top 3**.

**The regret sibling.** Every run computes both dials on the *same scored pool* and emits a
cross-dial contrast per survivor: `stable` (both dials kept it), `replaced` (the other dial
would swap it for X), or `dropped`. This is what proves the dial actually changes the run.
A no-swap result is allowed data, not failure — the tripwire is whether the consequence is
still visible.

## Generate — operators, lineage, no-delta rejection

A candidate is bred by a **reproduction operator** applied to a source packet. Each child
carries lineage: `parent`, `generation`, `operatorId`, and an explicit **delta** (what
changed besides wording). Packets with no delta are **rejected before scoring** — rehash never
reaches fitness.

> Reconciliation: this is the jungle's `LineageLedger`. The garden replaces the separate
> ledger with *the node graph is the memory* — `doppelgangers` (a stored count of deduped
> near-duplicates) + `convergence` (a derived query). The **delta-on-every-child** rule
> survives; the separate ledger schema does not.

## Caps — finite by construction

`{ maxGenerations: 2, maxChildrenPerParent: 2, maxPopulation: 12 }`. Generation N+1 only
expands from *selected* parents, capped per parent and against remaining population slots.
Recursion is earned: don't deepen until a depth-1 pass produces a judgeable survivor.

## Lens — feasibility, after selection

Lens stays separate from the judge. The judge rates worth; the lens asks whether the selected survivor is actionable for a specific actor, context, or constraint set.

The lens is observer-relative feasibility scored *after* selection (demoFit/evidenceFit/scopeFit/riskFit → 0–1, pass ≥ 0.55), and it must never contaminate novelty, grounding, or rating. *"A hedge fund and a capstone team weigh the same true idea oppositely."*

## Reproduction units — what reproduces is pluggable

The crucible does not bake in one breeding unit. The thing that reproduces can be a
**thesis** (a claim), a **consequence** (an implication branch), a **problem-frame** (a
recovered pressure point), a **solution-candidate**, or — left as a seam, not a dependency —
an **agenome** (an agent scaffold). The garden's stages are this seam made concrete:
`problem_recovery` breeds problem-frames, `doppl` breeds solution-candidates. A run says which
unit it breeds; a child always states its delta.

**Operators come from mutagen skills.** A child is bred by a named operator
(`breakthrough`, `addition-by-subtraction`, `breakout`, `blindside`, `first-principles`,
`constraint-injection`, `polymath`). The engine records *which* operator produced each child
but never requires a specific external skill loader to run. The durable kernel-owned record is
`skills/LINEAGE.md`; skill expressions themselves are optional inputs.

## Open and deferred (carried so the burn doesn't erase the question)

- **Pareto crowding.** Weighted sums miss candidates on a concave frontier. If runs repeatedly
  strand "interesting but never selected" candidates a human marks as keepers, add crowding
  distance to preserve branch diversity. Don't build it until the simple selector visibly loses
  useful candidates.
- **Energy caps.** Today's caps are structural (generations, children/parent, population). The
  deferred layer is budgeted cost — output tokens, tool calls, wall-clock, money — with a
  lineage that overruns its budget dying or pausing, never borrowing invisible compute.
- **Mechanism cost.** Named in the old contract as a fitness component, never implemented in
  the instruments. In the garden it lives as the judge's **Cost-efficiency** rating axis, not
  an engine measurement — unless a named consumer needs it scored upstream.

## The trace is the spine

One pass emits an ordered machine trace: `generate → fitness → select → lens`, each step
naming its inputs, decision, and goal-checks. Every human surface (node, board, viewer) is a
**projection** of that trace — the trace is the specimen. The compiler (`compiler-skill.md`)
is the garden's projection writer: it turns a pass's survivor + the judge's evaluation into a
node, replacing the old `kernel.pepsi-output.v1` packet.
