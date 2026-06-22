# Pepsi Output Spec

## Definition

A Pepsi is a candidate output worth inspecting after the kernel has recovered a
problem, implication, or action path.

It is not "any generated idea." It has survived enough selection to make a human
ask whether it should be preserved, investigated, or used.

The word comes from the "perfect Pepsi" lesson: sometimes the right output is
one converged answer; sometimes the right output is several distinct Pepsis
because the unlock has multiple governing logics.

## Output Classes

- `sprout`: side idea found during the run. Judged as generativity/process
  signal.
- `afrit`: harvested outcome. Judged as conclusion/actionability signal.
- `pepsi`: inspectable candidate branch with a named problem or implication.
- `regretSibling`: candidate the other dial would have kept.
- `implicationBranch`: second-order consequence from a thesis.
- `dryRiverbed`: branch where an event disappears, not just gets cheaper.
- `substrateRemoved`: branch naming the underlying thing made obsolete or
  load-bearing.
- `adoptionAsymmetry`: branch where uneven deployment or belief is the thesis.
- `latentAsset`: underpriced resource, capability, data, attention, or
  relationship made valuable by the shift.

Sprout/afrit belongs to bedrock signal. Pepsi belongs to assay output and human
inspection. They can overlap, but they answer different questions.

## Canonical Projection

`RunTrace` remains process truth. It explains what the kernel generated,
scored, selected, rejected, and checked.

`kernel.pepsi-output.v1` is the canonical human-facing output projection. It is
what Assay renders first and what `pnpm publish:html` snapshots into
`published/assay.html`.

Pepsi Output can be produced two ways:

- deterministic fallback from selected `RunTrace` candidates.
- optional executable generator configured with `DOPPL_PEPSI_GENERATOR`.

The generator receives JSON on stdin and returns `PepsiOutput` JSON on stdout.
Its request contains `RunTrace` plus seed-visible case context only: seed id,
public title/subtype/status, seed case-study path, and seed markdown byte count.
It must not receive `solution.md`, evaluator-side Pepsi segmentation fixtures,
known-solution or known-answer markers, or judge-only case material.

If the generator is unset, exits nonzero, times out, emits malformed JSON, or
emits invalid `kernel.pepsi-output.v1`, the system falls back to deterministic
assembly and exposes the generator status in `PepsiOutput.status`.

`pnpm pepsi:generator-check` is the durable harness for this boundary. It proves
absent, failed, malformed, timed-out, valid, and contaminated generator paths.
A contaminated request must be rejected before the configured executable is
spawned.

## Calibration Fixtures

`fixtures/pepsi-segmentation/*.json` uses
`kernel.pepsi-segmentation.v1`. Those files are evaluator-side calibration and
reference data, not public output and not generator input.

The shared validator keeps this split explicit:

- `assertPepsiSegmentation()` validates calibration fixtures.
- `assertPepsiOutput()` validates public output packets.

Do not render segmentation fixtures as the canonical public Pepsi surface.

## Required Packet

Every `PepsiPacket` must expose:

- `title`: compact label.
- `claim`: the thing being asserted.
- `subtype`: cross-domain transfer, zeitgeist synthesis, problem recovery,
  consequence, strategy, warning, protocol, product, or test.
- `sourceContext`: case/source/seed context, with restricted details removed.
- `problemRecovery.surfaceComplaint`: the visible problem.
- `problemRecovery`: stated symptom, deleted assumption, hidden variable,
  actual problem, and candidate response.
- `implicationMap`: what disappears, what gets cheaper, who wins, who loses,
  second-order effects.
- `noveltyBasis`: why this is not already covered.
- `groundingBasis`: source support, mechanism, held-out answer, dated signal, or
  human verdict.
- `falsifier`: what would make it wrong or uninteresting.
- `mechanismCost`: complexity, dependency, workflow, or access burden.
- `lensFit`: why this matters for the current lens.
- `lineage`: parent, generation, operator, claimed delta, nearest prior.
- `humanJudgment`: dead, obvious, interesting, investigate, or keeper when a human
  has judged it.

If a packet cannot fill these fields, it can still be a candidate. It is not yet
a Pepsi.

## One Pepsi vs Many Pepsis

Use one Pepsi when:

- one hidden variable explains the case.
- branches are variants of the same mechanism.
- the human needs one action or falsification test.

Use many Pepsis when:

- different mechanisms govern different winners.
- the umbrella claim is too broad to evaluate directly.
- each branch has its own losers, winners, falsifier, and adoption boundary.
- forcing one answer would hide useful disagreement.

The FSD unlock is the reference case: accident economy, enforcement economy,
mobility/time, ownership unwind, and adoption asymmetry are not just synonyms.
They are different Pepsis under one umbrella.

## Problem Recovery Chain

A strong Pepsi should show the chain:

```text
surface complaint -> deleted assumption -> hidden variable -> actual problem -> candidate response
```

Examples:

- Drone privacy: not "stop the drone"; protect the value of the footage before
  capture.
- Yacht waterline intrusion: not "add guards"; the perimeter excluded the
  waterline and tender access path.
- Starlink yacht connectivity: not "cheaper internet"; continuity expectation
  survived while the expensive VSAT substrate collapsed.
- GLP-1 snacks: not "people eat less"; impulse calories, portioning, and pantry
  economics change unevenly.

## Implication Map

A Pepsi should not stop at the first claim. It should map consequences:

- what business model loses its substrate.
- what maintenance or compliance chore disappears.
- what new constraint becomes binding.
- where money, time, attention, risk, or trust moves.
- who adopts first and who is trapped by old assumptions.
- what new failure mode the solution creates.

Explicit "where does the money go / picks-and-shovels" move.

## Segmentation Standard

The assay should distinguish:

- `candidate`: generated idea not yet promoted.
- `pepsi`: promoted branch with the required packet.
- `possiblePepsi`: branch under an umbrella case that may deserve its own lane.
- `manyPepsis`: an umbrella output where plural branches are the point.

Do not manufacture plurality. A single-Pepsi case should stay single.
Do not flatten plurality. A many-Pepsis case should expose its distinct logics.

In code, the public distinction is packet completeness, not fixture status. A
candidate becomes a public Pepsi only when it validates as `PepsiPacket`.

## Human Verdicts

Verdicts are bedrock signals:

- `dead`: not useful.
- `obvious`: true or plausible but already visible.
- `interesting`: worth thinking about.
- `investigate`: worth a follow-up search, split, or falsification test.
- `keeper`: strong enough to preserve.

The kernel nominates. The human verdict decides whether a Pepsi becomes memory,
a fixture, a spec change, or trash.

## Tripwires

- A Pepsi is just a restated surface complaint.
- A many-Pepsis case is forced into one headline.
- A one-Pepsi case is padded into fake branches.
- The implication map names winners but no losers, or effects but no mechanism.
- Restricted source details leak into a demo packet.
- Known-solution or known-answer markers appear in generator input.
- The packet lacks a falsifier.
