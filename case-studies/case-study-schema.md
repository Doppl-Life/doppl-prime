# Case Study Schema

This schema defines the information needed to describe a case study clearly and consistently. It is intentionally simple: the case study should explain the situation, the person or group affected, the surrounding conditions, what was tried, what solution emerged, and whether someone else could reproduce the result.

Case studies should separate evaluator-only targets from generated outputs. In withheld-solution prompts, the agenome should produce two artifacts in order: `problem_recovery` first, then `solution_generation`. The evaluator version stores the target answer in `evaluation_focus` and `solution`.

## Case Study

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `title` | string | Yes | Short human-readable title for the case study. |
| `summary` | text | Yes | Brief overview of the case study in three to six sentences. |
| `source` | object | Recommended | Where the case came from and how close the writeup is to the original material. |
| `visibility` | object | Recommended | Confidentiality, anonymization, and public-use rules for the case. |
| `problem` | object | Yes | The problem being studied. |
| `purpose` | object | Yes | Why this case study exists and what it is meant to show. |
| `constraints` | list<object> | Yes | Important limits, requirements, or tradeoffs. |
| `failed_attempts` | list<object> | Recommended | Prior approaches that did not work or were insufficient. |
| `user` | object | Yes | The person, group, or role affected by the problem. |
| `environment` | object | Yes | The context in which the problem and solution exist. |
| `solution` | object | Yes | The resulting answer, design, intervention, or recommendation. |
| `evaluation_focus` | object | Optional | Evaluator-only targets for scoring problem recovery and solution generation, especially the hidden variable, actual problem, and frame recovery target. |
| `reproducible` | object | Yes | Whether and how the case study can be reproduced. |
| `validator` | object | Optional | Domain expert, reviewer, or stakeholder who can judge whether the case and solution are plausible. |
| `open_questions` | list<string> | Recommended | Missing facts, follow-up questions, or uncertainties that would improve the case study. |
| `notes` | text | Optional | Extra context that does not fit elsewhere. |

## Generated Output Contract

Withheld-solution prompts should ask the agenome to generate two outputs in this order.

### Problem Recovery

Problem Recovery translates the symptom report into the actual problem before any solution is proposed. The user's complaint is treated as evidence. Any user-proposed fix, status quo process, or obvious requirement is treated as a claim to examine, not as a binding instruction.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `observed_situation` | text | Yes | What is happening in the case before interpretation. |
| `stated_problem_or_symptom` | text | Yes | The complaint, request, or obvious framing presented by the source. |
| `source_proposed_solution_or_assumption` | text | Recommended | Any implied solution, requirement, or inherited process the source appears to assume. |
| `deleted_assumptions` | list<string> | Recommended | Assumptions, requirements, or process parts the system chooses not to optimize prematurely. |
| `actual_problem` | text | Yes | The causal problem that should be solved. |
| `hidden_variable` | text | Recommended | The non-obvious factor that changes what the problem is. |
| `solution_class` | text | Recommended | The type of intervention implied by the recovered problem. |
| `confidence_and_open_questions` | list<string> | Recommended | Uncertainties or checks that would improve confidence in the recovered frame. |

### Solution Generation

Solution Generation is the second judged output. It may include sprouts, afrits, or a single proposed intervention, but it should explicitly build from Problem Recovery rather than from the surface complaint alone. Use the existing `solution` fields below for the generated structure.

## Source

The `source` section records where the case study came from and how much transformation happened between the original material and the structured writeup.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | enum | Yes | One of `interview`, `transcript`, `field_note`, `article`, `internal_document`, `expert_recollection`, `synthetic`, `other`. |
| `origin` | text | Recommended | Short description of the original source, such as the interview, document, or conversation that produced the case. |
| `source_file` | string | Optional | File path, link, or identifier for the original source, if available. |
| `derived_by` | string | Optional | Person, team, or process that converted the source into this case study. |
| `fidelity` | enum | Recommended | One of `raw`, `lightly_cleaned`, `summarized`, `heavily_synthesized`, `synthetic`. |
| `source_notes` | text | Optional | Important caveats about transcript quality, missing context, interpretation, or source reliability. |

## Visibility

The `visibility` section explains how the case study can be shared and what must be hidden or anonymized.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `level` | enum | Yes | One of `public`, `internal`, `confidential`, `restricted`, `unknown`. |
| `anonymized` | boolean | Recommended | Whether names, companies, identifying details, or sensitive facts have been changed or removed. |
| `public_summary_allowed` | boolean | Recommended | Whether a short public-facing summary may be shown outside the team. |
| `sensitive_details` | list<string> | Optional | Details that should not be exposed, such as names, locations, technical vulnerabilities, or private business context. |
| `sharing_notes` | text | Optional | Any additional handling rules, caveats, or approvals needed before sharing. |

## Problem

The `problem` section explains what is wrong, missing, painful, confusing, expensive, risky, or unresolved.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `statement` | text | Yes | Plain-language description of the problem. |
| `background` | text | Recommended | Context someone needs before the problem makes sense. |
| `why_it_matters` | text | Yes | Why the problem is worth solving. |
| `current_state` | text | Recommended | How things work before the solution. |
| `impact` | text | Recommended | Consequences of leaving the problem unsolved. |
| `scope` | text | Recommended | What is included and excluded from this case study. |

## Purpose

The `purpose` section explains what the case study is trying to demonstrate or learn.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `goal` | text | Yes | Main goal of the case study. |
| `questions` | list<string> | Recommended | Questions the case study should answer. |
| `success_criteria` | list<string> | Recommended | Conditions that would make the case study successful. |
| `audience` | string | Optional | Who the case study is meant to inform. |

## Constraints

The `constraints` section records limits that shaped the solution.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | Short name for the constraint. |
| `description` | text | Yes | What the constraint is. |
| `type` | enum | Recommended | One of `time`, `budget`, `technical`, `legal`, `ethical`, `organizational`, `data`, `user`, `other`. |
| `rationale` | text | Recommended | Why the constraint exists and what makes it real, such as legal exposure, safety risk, user behavior, physics, policy, or domain practice. |
| `effect` | text | Recommended | How the constraint changed the solution or process. |

## Failed Attempts

The `failed_attempts` section records approaches that were tried before or considered and rejected.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | Name or short label for the attempt. |
| `approach` | text | Yes | What was tried. |
| `outcome` | text | Yes | What happened. |
| `why_it_failed` | text | Yes | Why it did not solve the problem well enough. |
| `lesson` | text | Recommended | What the failure taught. |

## User

The `user` section describes who experiences the problem or benefits from the solution.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name_or_role` | string | Yes | Person, persona, group, or role. |
| `goals` | list<string> | Yes | What the user is trying to accomplish. |
| `needs` | list<string> | Recommended | What the user needs from a solution. |
| `pain_points` | list<string> | Recommended | Specific frustrations or blockers. |
| `level_of_expertise` | string | Optional | Relevant experience level or background. |

## Environment

The `environment` section describes the surrounding context.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `setting` | text | Yes | Where the case takes place: team, product, market, workflow, classroom, organization, etc. |
| `tools_or_systems` | list<string> | Recommended | Tools, platforms, datasets, policies, or systems involved. |
| `inputs` | list<string> | Recommended | Information available at the start. |
| `external_factors` | list<string> | Optional | Market, timing, social, technical, or organizational factors. |
| `assumptions` | list<string> | Recommended | Assumptions the case study depends on. |

## Solution

The `solution` section describes what was produced or recommended.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `summary` | text | Yes | Short explanation of the solution. |
| `details` | markdown | Yes | The actual solution, artifact, plan, design, recommendation, or answer. |
| `why_this_solution` | text | Recommended | Why this solution fits the problem and constraints. |
| `tradeoffs` | list<string> | Recommended | What the solution gives up or risks. |
| `expected_outcome` | text | Recommended | What should happen if the solution works. |
| `next_steps` | list<string> | Optional | Concrete follow-up actions. |

## Evaluation Focus

The `evaluation_focus` section explains what the case should test beyond whether the final answer matches the known solution. It is especially useful for public cases where the answer may be present in model pretraining, because the benchmark can still score whether the system identifies the real problem and hidden variable before generating ideas.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `stated_problem_or_symptom` | text | Recommended | The complaint, request, or obvious frame that the system should not treat as final. |
| `actual_problem` | text | Recommended | The evaluator's target for what the system should recover as the real problem. |
| `deleted_assumptions` | list<string> | Optional | Requirements, status quo processes, or proposed fixes a strong answer should question or remove. |
| `hidden_variable` | text | Recommended | The non-obvious causal factor, constraint, behavior, representation, or timing issue that changes what the real problem is. |
| `frame_recovery_target` | text | Recommended | What a strong system should realize before proposing a solution. |
| `generated_idea_target` | text | Recommended | What kind of solution, protocol, intervention, or artifact the system should then generate. |
| `scoring_notes` | list<string> | Optional | How to score frame recovery, constraint handling, novelty, operational fit, and validation plan quality. |

## Reproducible

The `reproducible` section explains whether someone else could recreate the case study or verify the result.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `is_reproducible` | boolean | Yes | Whether the case study can be reproduced. |
| `reproducibility_level` | enum | Recommended | One of `exact`, `approximate`, `manual`, `not_reproducible`, `unknown`. |
| `steps` | list<string> | Recommended | Steps needed to recreate the case study. |
| `required_inputs` | list<string> | Recommended | Inputs, files, prompts, data, or context needed. |
| `expected_result` | text | Recommended | What a reproducer should expect to see. |
| `known_variability` | text | Optional | Reasons a repeated attempt might differ. |

## Validator

The `validator` section identifies who can judge whether the case study and proposed solution are realistic.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name_or_role` | string | Recommended | Domain expert, customer, stakeholder, evaluator, or reviewer role. |
| `relationship_to_case` | text | Recommended | Why this person or group is qualified to evaluate the case. |
| `can_validate` | list<string> | Recommended | Aspects they can judge, such as domain plausibility, operational fit, legal risk, user value, or solution novelty. |
| `validation_method` | enum | Optional | One of `interview`, `survey`, `rubric_review`, `async_feedback`, `live_review`, `unknown`. |
| `notes` | text | Optional | Caveats about evaluator bias, availability, or limits of their expertise. |

## Minimal Example

```yaml
title: Reducing review queue overload
summary: >
  A review team was overwhelmed by incoming cases and needed a way to choose
  what to inspect first. The case study compares the status quo with a proposed
  triage method designed around urgency, uncertainty, and user impact.
problem:
  statement: The team cannot review every case quickly enough.
  why_it_matters: Delayed high-risk cases create user harm and operational debt.
purpose:
  goal: Identify a more defensible triage process.
  questions:
    - Which cases should be inspected first?
    - What signals should determine priority?
constraints:
  - name: Limited reviewer time
    type: time
    description: Humans can only inspect a small fraction of cases each day.
    rationale: Reviewer capacity is fixed by staffing and shift coverage.
failed_attempts:
  - name: First-in-first-out queue
    approach: Review cases in arrival order.
    outcome: Simple to operate but missed urgent cases.
    why_it_failed: Arrival time did not reflect risk or importance.
user:
  name_or_role: Review operations lead
  goals:
    - Reduce backlog
    - Catch urgent cases earlier
environment:
  setting: Internal review workflow
  tools_or_systems:
    - Case queue
    - Reviewer dashboard
solution:
  summary: Prioritize cases by urgency, uncertainty, and potential impact.
  details: >
    Create a queue score that combines severity signals, confidence gaps,
    affected-user count, and time sensitivity.
reproducible:
  is_reproducible: true
  reproducibility_level: approximate
  steps:
    - Gather a sample of past cases.
    - Score them with the proposed triage factors.
    - Compare ordering against the original queue.
open_questions:
  - Which historical cases should be treated as the validation set?
```
