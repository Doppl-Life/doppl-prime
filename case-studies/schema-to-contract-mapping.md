# Schema → Contract Mapping

Defines how a case-study markdown packet maps onto Doppl's contracts so the PRD 06 graduation path ("promote case packets into first-class run seed records") has a concrete target. Today these packets are **fixtures** (`docs/prds/06-case-study-intake-prototype-prd.md`); this mapping is the bridge from the markdown schema (`case-study-schema.md`, snake_case prose) to the Zod/camelCase contracts in `ARCHITECTURE.md` Appendix A.

## Three destinations

Each schema field lands in exactly one of three places. The agent-visible/evaluator-only split is the load-bearing boundary (PRD 06; §7 prompt-injection isolation; §14 held-out-judge immutability).

1. **Agent-visible seed** — assembled into the run seed packet the agenomes see.
2. **Evaluator-only** — held out of every generation prompt; consumed only by the held-out `final_judge`.
3. **Generated output** — produced by the agenome at run time, not authored in the packet.

## Agent-visible seed → `RunConfig` / seed packet

The case packet becomes the structured `seed` of a `RunConfig` (Appendix A: `RunConfig{seed, enabledSubtypes[], caps, modelProfile, scoringPolicyVersion, rngSeed}`). Proposed seed sub-shape (`CaseSeed`) — fields below are **proposed**, since contracts are governed and frozen; field names are camelCase to match Appendix A.

| Case-study field | Seed field (`CaseSeed`) | Notes |
| --- | --- | --- |
| `title` | `title` | Case label. |
| `summary` | `summary` | Short overview. |
| `problem.statement` / `background` / `why_it_matters` / `current_state` / `impact` / `scope` | `problem{...}` | Core problem framing. |
| `purpose.goal` / `questions` / `success_criteria` / `audience` | `purpose{...}` | Keep success criteria behavioral, not solution-revealing (see leakage check). |
| `constraints[]` | `constraints[]` | Hard limits the solution must respect; feed `feasibility` checks. |
| `failed_attempts[]` | `failedAttempts[]` | Treated as data, not requirements. |
| `user.*` | `user{...}` | Affected person/role. |
| `environment.*` | `environment{...}` | Setting, tools, inputs, external factors, assumptions. |
| `subtype` (`subtype-index.md`) | `RunConfig.enabledSubtypes[]` + candidate `subtype` | Routes subtype-specific checks (§7, PRD 11). |
| `source.type` / `fidelity` | `seed.provenance{...}` | `source_file` / links are **withheld** when previews reveal the answer (per case `Source Notes`). |
| `visibility.*` | seed redaction/sharing policy | Drives the §14 redaction filter and content-logging toggle (§13). |

## Evaluator-only → held-out judge inputs (never in prompts)

| Case-study field | Contract destination | Notes |
| --- | --- | --- |
| `evaluation_focus.stated_problem_or_symptom` | `final_judge` target | The frame the system should not treat as final. |
| `evaluation_focus.actual_problem` | `final_judge` target | Problem Recovery gate target. |
| `evaluation_focus.deleted_assumptions` | `final_judge` target | Assumptions a strong answer removes. |
| `evaluation_focus.hidden_variable` | `final_judge` target | Frame-recovery gate target. |
| `evaluation_focus.frame_recovery_target` | `final_judge` target | Maps to the (proposed) `frame_recovery` axis; today the Problem Recovery gate. |
| `evaluation_focus.generated_idea_target` | `final_judge` target | Expected solution class. |
| `evaluation_focus.scoring_notes` | `final_judge` rubric notes | Per-case scoring guidance. |
| `solution.*` | reference answer (evaluator-only) | The withheld known answer; never in a generation prompt. |
| `validator.*` | review metadata | Who can judge plausibility. |

Boundary realization: agent-visible fields come from `*-withheld-solution.md`; evaluator-only fields come from `*-with-solution.md`. The intake harness must guarantee no evaluator-only field is interpolated into a generation prompt (PRD 06 falsification bar; §7 candidate-as-data isolation).

## Generated output → `CandidateIdea` + Problem Recovery stage

| Generated artifact | Contract destination |
| --- | --- |
| `problem_recovery` packet | Shared upstream stage output (harness-side today; see `ALIGNMENT.md` flagged proposal for promoting into the runtime). Gates scoring per `evaluation-rubric.md`. |
| `solution_generation` (`solution.*` shape) | `CandidateIdea` (`ARCHITECTURE.md` §3, Appendix A), with the subtype payload (`CrossDomainTransferPayload` for this corpus). |

## Field-convention bridge

The markdown schema uses snake_case section names (`why_it_matters`, `name_or_role`); Appendix A contracts use camelCase (`whyItMatters`, `nameOrRole`). The intake importer owns this rename. Where a markdown section has no Appendix-A home (e.g. `problem_recovery` fields, `frame_recovery_target`), the destination is the harness/eval layer until the `ALIGNMENT.md` proposal is adopted.

## Open items for the importer

- `CaseSeed` is a proposed shape; freezing it is a governed Appendix-A change, not an implementer edit.
- Leakage check: `purpose.success_criteria` and `problem.*` must be scanned so the withheld solution direction does not leak into the visible seed (PRD 06).
- `reproducible.*` and `open_questions` are authoring/QA metadata, not run-seed inputs.
