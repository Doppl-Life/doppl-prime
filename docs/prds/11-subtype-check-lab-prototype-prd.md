# PRD 11: Subtype Check Lab Prototype

## Prototype Question

Can Doppl evaluate both required candidate subtypes with subtype-specific checks that produce structured evidence, including honest skipped/degraded outcomes?

## Audience Moment

Within 10 seconds, a viewer should understand that `cross_domain_transfer` and `zeitgeist_synthesis` are not scored by one generic rubric. Each subtype has its own evidence obligations.

## User Workflow

- Select a candidate subtype.
- Inspect required check dimensions.
- Run or view subtype checks.
- See pass, fail, skipped, and degraded states.
- Compare evidence quality across subtypes.

## Required Data / Events

- `CandidateIdea`
- `CrossDomainTransferPayload`
- `ZeitgeistSynthesisPayload`
- `CheckResult`
- `EvidenceRef`
- `check.completed`
- allowlisted `CheckRunnerAdapter` metadata
- retrieval/source evidence

## Acceptable Fixture

Use two saved candidates, one for each subtype, with precomputed check results. Execution-requiring checks may be marked skipped with a clear reason.

## Convincing Demo Bar

- Cross-domain transfer checks source validity, target fit, mapping quality, prior art, and executable-check idea.
- Zeitgeist synthesis checks current signals, timing, novelty, coherence, and falsifiability.
- Skipped checks are visible and penalizable.
- Evidence links are inspectable.
- No arbitrary code execution is implied.

## Falsification Bar

This prototype fails if subtype labels are decorative, if skipped checks look like passes, or if users cannot tell what evidence each subtype requires.

## Graduation Path

Connect to real check runners behind the allowlist registry. Production should route checks from candidate subtype automatically and persist all results as `check.completed` events.

