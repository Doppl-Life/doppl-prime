# Assay Corpus Spec

## Purpose

The assay asks whether a kernel run makes a case more useful to a human. It is
not a benchmark leaderboard and not a transcript archive.

The corpus exists to test:

- discovery: did the run notice something non-obvious?
- problem recovery: did it find the real pressure point?
- solution search: did it propose a useful next move after recovery?
- segmentation: did it choose one Pepsi or many Pepsis correctly?
- leakage control: did it succeed without reading the answer key?

## Case Roles

Each case can have:

- `case-study.md`: generator-visible context.
- `solution.md`: judge/evaluator-visible answer key.
- fixture JSON: kernel seed and authored candidate packets.
- control JSON: clean-agent baseline with no kernel context.
- Pepsi segmentation JSON: evaluator-side expected segmentation.

Generator-visible material may include context, constraints, source summaries,
and the prompt. It must not include the known solution when one exists.

Judge-visible material may include the withheld solution, target problem
recovery, expected segmentation, and evaluator notes.

## Leakage Rule

The generator can read the case. The judge can read the solution. The same role
cannot read both unless the run is explicitly testing evaluator behavior.

Leakage turns evaluation into answer coaching. If a case requires the solution to
generate a plausible answer, it is not a valid withheld-solution assay case.

## Case Subtypes

### Cross-Domain Transfer

A mechanism transfers from one domain to another. Timing is incidental.

Discriminator: if the mechanism would still work five years earlier or five
years later, it is probably cross-domain transfer.

The packet must name:

- source domain.
- target domain.
- transferred mechanism.
- constraint that changes during transfer.
- why the analogy is not superficial.

### Zeitgeist Synthesis

Timing is load-bearing. Current signals matter.

Discriminator: if moving the case five years earlier or later breaks the thesis,
it is probably zeitgeist synthesis.

The packet must name:

- dated signals.
- why-now mechanism.
- near-future falsifier.
- expected decay/refresh window.
- what consensus has not priced yet.

## Problem Recovery

Problem recovery is a first-class stage, not a flourish.

A case should preserve:

- stated complaint.
- visible failed solution.
- deleted assumption.
- hidden variable.
- actual problem.
- why the known solution works, when known.

The superyacht cases are the reference pattern:

- drone privacy: the drone is a delivery mechanism; footage value is the target.
- waterline intrusion: the yacht had security, but the perimeter omitted the
  waterline/tender path.
- connectivity continuity: the expensive satellite substrate changed, but the
  owner expectation of uninterrupted land-like service did not.

Raw expert transcripts do not belong in the live project once their constraints,
cases, and solution boundaries are captured.

## Controls

The clean-agent control is a baseline answer with no kernel machinery and no
surrounding doctrine.

Use controls to ask:

- did the kernel surface anything the clean agent missed?
- did it recover the problem more sharply?
- did generation 2 improve or just paraphrase?
- did the clean agent beat the kernel?

A control can beat the kernel. That is evidence, not embarrassment.

## Source Radar

Source radar is a seed feeder, not the kernel.

Pipeline:

```text
harvest -> normalize -> classify/enrich -> score/rank -> seed or benchmark
```

Candidate seed shape:

```json
{
  "source": "HN | YC RFS | Product Hunt | Polymarket | Kalshi | expert transcript | vendor corpus",
  "url": "optional",
  "subtype": "cross_domain_transfer | zeitgeist_synthesis | problem_recovery | unknown",
  "problem_recovery": "summary of stated complaint and hidden variable",
  "why_it_might_matter": "novelty/grounding hook",
  "lens_score": "observer-relative score"
}
```

Solved examples backfill benchmark/case studies. Unsolved examples feed
opportunity discovery.

Prediction-market or trading-adjacent sources are read-only validation inputs.
The kernel may analyze and rank. It must not auto-trade.

## Validation Means

Allowed validation rails:

- withheld solutions.
- clean-agent controls.
- human verdicts.
- dated predictions.
- public source checks.
- paper measurement of market theses.
- reality-clock follow-up.
- generated vs realized comparison.

Validation can be lightweight. It cannot be imaginary.

## Expert Source Privacy

Expert material should be distilled into shareable cases and fixtures.

Keep:

- constraints that matter.
- solution logic.
- why naive solutions fail.
- category boundaries.
- privacy/access restrictions.
- evaluator-only answer keys.

Cut:

- raw transcripts after distillation.
- named clients, vendors, or owners unless explicitly public and needed.
- conversational filler.
- business deal talk.
- source details that cannot be shown in demos.

## Win Condition

The first useful bar stays human:

After five cases, did the run surface at least three to five entries a human
marks `interesting`, `investigate`, or `keeper`?

Kernel scores nominate. Human verdicts are bedrock.

## Tripwires

- A generator can read a solution file.
- Raw source becomes operational authority.
- A case has no hidden variable or known failure mode.
- A solved example is mixed with unsolved opportunity data without labels.
- Market validation turns into auto-action.
- The assay optimizes for pretty prose instead of human verdicts.
