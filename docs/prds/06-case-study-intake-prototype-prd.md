# PRD 06: Case Study Intake / Withheld-Solution Harness Prototype

## Prototype Question

Can Doppl ingest a case study in a way that is fair to agents, useful to evaluators, and honest about withheld solution information?

## Audience Moment

Within 10 seconds, a viewer should understand that agents see the problem, constraints, and allowed context, while evaluator-only solution targets stay hidden until scoring.

## User Workflow

- Create or select a case study.
- Enter problem statement, context, constraints, and success criteria.
- Add withheld solution notes and evaluator anchors separately.
- Validate whether the case is suitable for Doppl.
- Start a run from the visible case packet.

## Required Data / Events

- `RunConfig`
- `run.configured`
- case id, title, prompt, context, constraints, evaluator anchor
- access boundary between agent-visible and evaluator-only fields
- redaction / prompt-injection isolation checks

## Acceptable Fixture

Use the existing case-study markdown packets and saved Jack superyacht case data. It is acceptable for the first UI to load fixture cases rather than support full authoring.

## Convincing Demo Bar

- The withheld solution boundary is explicit.
- Users can preview exactly what agents will see.
- Evaluator-only anchors are visibly excluded from prompts.
- Case quality checks flag missing constraints, vague goals, or solution leakage.
- Run start uses the sanitized agent-visible packet.

## Falsification Bar

This prototype fails if users cannot tell what agents see, if withheld solution text can leak into generation prompts, or if arbitrary problem statements produce untestable runs.

## Graduation Path

Promote case packets into first-class run seed records. The production version should support imports from markdown, Google Sheets, and manual entry while preserving the same visibility boundary.

