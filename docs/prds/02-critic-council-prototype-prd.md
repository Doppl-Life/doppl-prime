# PRD 02: Critic Council Prototype

## Prototype Question

Can Doppl show that candidate ideas are disciplined by adversarial evidence, subtype checks, and an immutable held-out judge rather than by vibes or agent self-certification?

## Audience Moment

Within 10 seconds, a viewer should understand: the candidate is untrusted data, several critics pressure it from different angles, and the held-out judge applies a fixed rubric that agents cannot move.

## User Workflow

- Select a candidate artifact under review.
- Inspect each critic mandate and score.
- See evidence, failure modes, and unresolved risks.
- Follow critic outputs into the held-out judge.
- Read a defensible verdict.

## Required Data / Events

- `candidate.created`
- `critic.reviewed`
- `check.completed`
- `fitness.scored`
- `candidate_invalidated`
- `output_schema_rejected`
- held-out judge metadata and rubric version
- `EvidenceRef`

## Acceptable Fixture

The current prototype may use hand-shaped critic scores against the Jack case. It must preserve the role distinction: critic evidence is separate from final selection, and candidate text must never be treated as instructions.

## Convincing Demo Bar

- Each critic has a clear mandate.
- The falsification critic can name how the answer could fail.
- Subtype-specific checks are visible.
- The held-out judge uses a stable rubric.
- The verdict links back to the evidence that justified it.

## Falsification Bar

This prototype fails if users think critics are just personas generating comments, if the final judge feels mutable by the agent, or if the verdict cannot be traced to concrete evidence.

## Graduation Path

Back every critic card with `CriticReview`, `CheckResult`, and held-out judge events. Evidence links should resolve through Postgres-backed projections, and replay should show the same reviews without fresh model calls.

