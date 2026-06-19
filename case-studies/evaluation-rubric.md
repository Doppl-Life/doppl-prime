# Case Study Evaluation Rubric

Case studies are judged on two outputs, in order:

1. **Problem Recovery** - did the system recover the actual problem from the symptom report?
2. **Solution Generation** - did the system generate a useful intervention for that recovered problem?

The point is not to decide whether the user's complaint is "real." The complaint is evidence. The trap is treating the complaint, proposed fix, or existing process as the problem definition.

## One Scoring Model (Reconciliation With §7)

This rubric and Doppl's held-out judge (`ARCHITECTURE.md` §7, `FinalJudgeRubric` in Appendix A) are a single scoring model, not two competing scales:

- **Problem Recovery is a gating pre-stage.** It is scored 0–4 (below) and gates Solution Generation; it does not contribute its own axis to the held-out judge total.
- **Solution Generation is scored on the §7 held-out-judge axes** — `grounding`, `novelty`, `feasibility`, `falsification_survival`, `subtype_check_pass`, each 0–5 — applied by the frozen `final_judge` outside the breeding loop.
- **`subtype_check_pass`** binds to the case's subtype (`subtype-index.md`): `cross_domain_transfer` checks for this corpus.

The one axis this rubric exercises that the §7 judge does not yet have is **frame recovery**. For now it lives here as the Problem Recovery gate; promoting it into `FinalJudgeRubric` as a `frame_recovery` axis is the flagged proposal in `ALIGNMENT.md`.

## Complaint Rule

When people say something is wrong, listen. When they say how to solve it, treat that as data, not as a requirement.

This benchmark should reward systems that translate:

> This is happening.
> This is what someone thinks the problem is.
> This is what the problem actually is.
> Here is the solution.

## Useful Subset Of The Algorithm

For Doppl case studies, the useful part of the Musk-style algorithm is:

1. **Question every requirement** - trace each "must" to a person, reason, constraint, or observed fact.
2. **Delete inherited assumptions** - remove proposed fixes, status quo processes, and constraints that are not actually binding.
3. **Simplify and optimize only after recovery** - once the real problem is named, solve that smaller target.

Acceleration and automation are intentionally out of scope for this rubric.

## Output 1: Problem Recovery

The generated answer should include a Problem Recovery packet before any solution:

| Field | What It Tests |
| --- | --- |
| `observed_situation` | What is happening in the case, before interpretation. |
| `stated_problem_or_symptom` | The complaint, request, or obvious framing. |
| `source_proposed_solution_or_assumption` | Any solution, requirement, or frame implied by the source. |
| `deleted_assumptions` | Requirements or process parts the system refuses to optimize too early. |
| `actual_problem` | The causal problem that should be solved. |
| `hidden_variable` | The non-obvious factor that changes the frame. |
| `solution_class` | The kind of intervention implied by the recovered problem. |
| `confidence_and_open_questions` | What remains uncertain and what should be checked. |

### Problem Recovery Score

| Score | Meaning |
| --- | --- |
| 0 | Repeats the stated problem or proposed fix. |
| 1 | Notices the stated framing may be incomplete, but stays vague. |
| 2 | Names a plausible hidden variable, but does not clearly reformulate the problem. |
| 3 | Recovers the actual problem and explains why the obvious frame is low leverage. |
| 4 | Recovers the actual problem, deletes false requirements, names the hidden variable, and defines a testable target for solution generation. |

## Output 2: Solution Generation

After Problem Recovery, the system should generate the solution, sprout, or fruit:

| Field | What It Tests |
| --- | --- |
| `summary` | The proposed intervention in plain language. |
| `details` | How it works, who does what, and where it enters the workflow. |
| `why_this_solution` | Why it fits the recovered problem rather than the stated symptom. |
| `constraints` | How it handles hard limits from the case. |
| `tradeoffs` | What it gives up, risks, or depends on. |
| `validation_plan` | How a human or domain expert could test plausibility. |

### Solution Score (held-out judge, §7 axes)

Solution Generation is scored by the frozen held-out judge on five axes, each 0–5 (`FinalJudgeRubric`, Appendix A):

| Axis | What It Tests |
| --- | --- |
| `grounding` | Claims are factually grounded and the mechanism is real. |
| `novelty` | Non-obvious in the useful way versus prior art and the stated fix. |
| `feasibility` | Operationally plausible; respects the hard constraints from the case. |
| `falsification_survival` | Survives the falsification critic; failure modes are addressed. |
| `subtype_check_pass` | Passes the subtype-specific checks (`cross_domain_transfer` for this corpus; see `subtype-index.md`). |

Holistic reference mapping onto the axes above: 0 = generic, impossible, unsafe, or violates a hard constraint; 1 = mainly optimizes the stated symptom; 2 = addresses part of the hidden variable but is operationally weak; 3 = fits the recovered problem, respects constraints, and is plausible; 4–5 = fits the recovered problem, is non-obvious in the useful way, handles tradeoffs, and gives a credible validation path.

## Gating Rules

- If Problem Recovery is 0 or 1, cap every Solution Generation axis at 2 even if the answer sounds clever.
- If the solution violates a hard constraint, cap `feasibility` (and therefore the overall) at 2.
- If the answer names the known solution but cannot explain the recovered problem, do not give full credit.
- Reward equivalent mechanisms, not only exact historical matches.
- The held-out judge and rubric are immutable to agents (§7/§14). Score Problem Recovery and Solution Generation separately before discussing overall quality.
