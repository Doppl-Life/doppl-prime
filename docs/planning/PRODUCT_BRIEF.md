# Doppl Product Brief

Source PRD: `Doppl_Capstone_Proposal.pdf`

## Phase 0 - PRD Intake

### Product In One Sentence

[locked decision] Doppl is an experimental agental-evolution system that starts from a seed prompt, runs a bounded population of agent-genomes through adversarial evaluation, selection, fusion, and mutation, and visibly demonstrates later generations producing stronger, more verifiable ideas than earlier ones.

### What The Product Is

[locked decision] Doppl is a capstone-scale agent evolution environment. The main product is the process: a population of agent genomes competes under compute scarcity, is judged by adversarial critics and objective checks, then reproduces through fusion and mutation so later generations can outperform earlier ones.

[locked decision] The system must make the evolutionary loop inspectable. A reviewer should be able to watch population lineage, energy use, critic outcomes, fitness changes, and the final surviving idea.

### What The Product Is Not

[locked decision] Doppl is not a single fixed agent, a static prompt workflow, or a SaaS pipeline around existing APIs.

[locked decision] Doppl is not an unbounded recursive autonomous system. Energy budgets, depth limits, spawn caps, and termination conditions are load-bearing even under MVP/prototype posture.

[scope simplification] The two-week cut is not required to prove fully open-ended self-improvement, weight-level model fusion, or durable fine-tuning of an in-house model.

### Primary Problem

[locked decision] Current agent systems are usually hand-built artifacts: humans design prompts, tools, decomposition, and verification loops, then agents execute the frozen scaffold. Doppl asks whether the scaffold itself can be put under selection pressure.

[locked decision] The target problem is idea generation where "good idea" lacks a cheap unit-testable ground truth. Doppl must manufacture a practical fitness signal from adversarial verification, objective checks where possible, and held-out judgment.

### Primary User

[proposed recommendation] The primary user is the demo operator / capstone team member who seeds a problem and runs the organism during the June 29, 2026 showcase.

[proposed recommendation] The primary evaluator is the capstone reviewer / audience, who needs visible proof that generation N+1 improves on generation N and that the system is not just producing confident slop.

### Core Workflow

[locked decision] The core workflow is:

1. A human supplies a seed prompt or fixed problem.
2. The system spawns a bounded population of agenomes.
3. Each agenome spends energy on reasoning, tool calls, and possible spawning.
4. Candidate ideas face a critic council with mandates such as factual grounding, novelty / prior art, feasibility, and falsification.
5. Available objective checks score or validate domain-specific claims.
6. Weak lineages are culled; high-fitness parents fuse and mutate.
7. A later generation is run and compared against an earlier generation.
8. The dashboard shows lineage, energy, critic outcomes, and fitness-over-time.
9. The demo ends with the best surviving idea and a replayable explanation of the adversarial gauntlet it passed.

### Confirmed Planning Mode

[locked decision] Expanded planning mode. The project needs separate planning artifacts because it has multiple high-risk subsystems: evolution runtime, verifier council, ML / selection controls, stateful lineage tracking, dashboard, and a hard showcase target.

### Confirmed Build Posture

[locked decision] MVP / prototype posture. The architecture should optimize for a credible, instrumented, repeatable capstone demo by June 29, 2026, with explicit deferrals for production hardening and moonshot work.

