# Doppl Evaluation Criteria

Source PRD: `Doppl_Capstone_Proposal.pdf`

## Phase 0 - Initial Evaluation Criteria

### Acceptance Proof

[locked decision] The minimum acceptance proof is that a later generation produces stronger surviving ideas than an earlier generation on a held-out idea-quality rubric.

[locked decision] The proof must be visible in the demo through lineage, critic judgments, energy spend, and fitness-over-time.

### Demo Evidence

[locked decision] The June 29, 2026 live demo should show:

1. A seed prompt from the room or a prepared equivalent.
2. A population tree where agents spawn, spend energy, face critics, and either die or survive.
3. Later generations climbing on a fitness-over-time chart.
4. A best surviving idea.
5. A replay of the adversarial gauntlet the idea passed.
6. For transfer prompts, an executable or objective check where feasible.

### Runtime Budget Evaluation

[locked decision] Demo run budgets should use configurable defaults, with exact numbers finalized after provider/model research.

[locked decision] The live demo should fit inside the 10-minute showcase window and have replay fallback if live execution runs long.

### Reviewer Risks

[open question] The exact held-out rubric is not yet defined.

[locked decision] The demo architecture should support live execution plus replay mode. The final demo may combine live execution with replay if provider latency or failures threaten the showcase.

[open question] The exact problem domains for objective checks are not yet locked.

### Stakeholder Priority

[locked decision] The architecture should satisfy the engineering team first while treating demo wow factor, narrative clarity, and observability as first-class acceptance criteria.

### Stretch Promotion Decisions

[locked decision] Simple novelty scoring is now MVP scope because mode collapse is a core Doppl risk and a thin semantic-distance score provides a visible, useful anti-collapse signal.

[locked decision] Visible lineage specialization is now MVP scope as a dashboard/evidence feature. The MVP does not need to prove deep species emergence, but it should show meaningful lineage differences through traits, mutation summaries, score patterns, and critic feedback.

[deferred work] Learned bandit/RL allocation, open-ended hours-long runs, self-evolving verifier council, in-house fine-tuning, weight-level model fusion, and production-grade account/workspace administration remain stretch/deferred.
