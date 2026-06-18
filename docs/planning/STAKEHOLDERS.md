# Doppl Stakeholders

Source PRD: `Doppl_Capstone_Proposal.pdf`

## Phase 3 - Stakeholders

| Stakeholder | Cares About | Would Reject If | Evidence Needed | Architecture Must Address |
|---|---|---|---|---|
| Engineering team | Clear build boundaries, feasible two-week scope, stable domain model, ownership surfaces, deterministic enough demo path | The architecture is inspirational but not buildable; ownership surfaces overlap; hidden complexity lands late | Sectioned implementation-facing design, state model, interfaces, runtime lifecycle, failure modes, and explicit deferrals | Kernel/runtime, verifier, selection, persistence, dashboard, and demo harness boundaries |
| Demo / observability owner | Watchable organism, narrative clarity, replayability, low demo risk | The dashboard is ornamental, slow, or unable to explain why an idea won | Population tree, energy telemetry, critic gauntlet replay, generation comparison, fallback replay mode | Event model, streaming/replay APIs, dashboard states, demo stop conditions |
| Capstone evaluator / audience | Credible proof that Doppl evolves better ideas, not just that an LLM wrote a clever answer | No visible selection pressure; no measurable generation improvement; no verification evidence | Fitness-over-time, lineage, critic results, subtype checks, best idea evidence | Evaluation criteria, scoring provenance, auditability, demo flow |
| Kernel / runtime owner | Agenome schema, bounded execution, lifecycle orchestration, fusion/mutation, energy accounting | Runtime allows runaway recursion, loses lineage, or cannot reproduce runs | Run lifecycle, energy ledger, state transitions, generation orchestration | Runtime state machine, caps, event logging, persistence contracts |
| Selection / ML owner | Fitness computation, diversity / novelty, parent selection, allocation strategy, stretch path to learned control | Fitness is opaque or hard-coded in a way that blocks iteration | Score components, selection interfaces, extension points for bandits/novelty models | Fitness model, policy interfaces, data captured for later learning |
| Verifier council owner | Critic integrity, grounding, objective checks, anti-reward-hacking | Critics are easy to fool; candidate evidence is not inspectable; checks are unsafe | Structured critic outputs, check results, held-out validation boundaries | Critic schemas, check runner safety, trust boundaries |
| Product / narrative owner | The "agents that breed agents" story lands in 10 minutes | The audience sees a generic agent dashboard | Clear lifecycle labels, visible reproduction, strong final payoff | Demo script support, dashboard information hierarchy, replayable gauntlet |

### Stakeholder Priority

[locked decision] The architecture document is for the engineering team first. It must be build-ready, implementation-facing, and explicit about ownership boundaries.

[locked decision] The demo audience is a major stakeholder. The architecture must preserve wow factor, narrative clarity, observability, and credible proof surfaces as first-class requirements rather than late UI polish.

