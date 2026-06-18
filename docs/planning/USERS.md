# Doppl Users And Actors

Source PRD: `Doppl_Capstone_Proposal.pdf`

## Phase 2 - Users And Actors

### Primary User

- Role: Demo operator / capstone team member.
- Goal: Seed, run, observe, and stop Doppl during development and the June 29, 2026 showcase.
- Context: The operator needs a reliable way to show that agent populations evolve better candidate ideas over generations.
- Pain points: Live demo uncertainty, LLM latency, scoring ambiguity, runaway costs, and difficulty explaining why a candidate won.
- Workflow: Select or enter seed prompt; choose idea type or allow both; configure budget/generation caps; start run; watch execution; inspect lineage and critic evidence; stop or replay; present best surviving idea.
- Success state: A run completes or reaches demo stop condition with visible lineage, energy accounting, critic outcomes, subtype checks, and improved generation-over-generation fitness.
- Failure state: The run stalls, exceeds budget, produces opaque scores, fails to show improvement, or cannot explain the final idea.

### Secondary Users

[locked decision] Read-only reviewers / showcase audience are secondary users.

- Goal: Understand what Doppl did and judge whether the evolution claim is credible.
- Context: They may not know the implementation internals and need evidence on screen.
- Workflow: Watch live dashboard or replay; inspect generation comparison; review best idea and critic gauntlet.
- Success state: They can tell how generation N+1 improved over generation N and why the final idea survived.
- Failure state: They see only impressive text output without evidence of selection, verification, or lineage.

### Operators / Admins

[locked decision] In the MVP, the demo operator is also the admin. No separate admin user role is required.

[scope simplification] Multi-user auth, workspace membership, and durable team administration are out of MVP scope unless later required by the capstone environment.

### Non-Human Actors

[locked decision] Agenome agents generate candidate ideas and may request tool calls within assigned permissions and energy budgets.

[locked decision] Critic agents evaluate candidate ideas against distinct mandates such as factual grounding, novelty / prior art, feasibility, and falsification.

[locked decision] Check runners execute subtype-specific validation where feasible, including cross-domain toy checks or structured zeitgeist evidence checks.

[locked decision] Selection controller computes fitness, culls weak lineages, chooses parents, and triggers fusion/mutation.

[locked decision] Runtime worker executes generations, tracks energy, persists lineage events, and enforces termination rails.

[locked decision] Dashboard client reads run state, lineage, energy events, critic output, check results, and final idea evidence.

[research required] External LLM providers, embedding services, retrieval/search APIs, and any execution sandbox need provider-specific constraints researched before final architecture locking.

### Permission Matrix

| Actor | Can Do | Cannot Do | Risk |
|---|---|---|---|
| Demo operator | Create runs, choose seed/problem set, configure caps, start/stop/replay runs, inspect all run evidence | Bypass hard runtime caps; mutate historical records silently; give agents unrestricted tools | Operator mistakes can ruin the live demo or hide evidence |
| Read-only reviewer | View dashboard/replay and inspect final evidence | Start/stop runs; edit prompts, scores, lineage, or checks | If too much is hidden, reviewer trust collapses |
| Agenome agent | Generate candidate ideas, request allowed tools, spend assigned energy | Exceed energy/tool/depth caps; modify scores; choose its own survival criteria; access secrets | Reward hacking, tool abuse, runaway recursion |
| Critic agent | Review assigned candidate ideas and emit structured critique/scores | See hidden hold-out rubric if configured; alter candidate lineage; spend unbounded tokens | Weak or collusive critics create false fitness |
| Check runner | Run approved subtype-specific checks and return structured evidence | Execute arbitrary unsafe code; modify run state beyond check result | Objective checks can become a security and determinism risk |
| Selection controller | Compute fitness, cull, select parents, trigger fusion/mutation | Ignore required score components; move bedrock validation anchors; exceed generation limits | Bad selection pressure optimizes the wrong behavior |
| Runtime worker | Orchestrate generation lifecycle, persist events, enforce caps | Run without kill switch; drop audit events silently | Failure here breaks the organism claim |
| Dashboard client | Read and visualize run state | Mutate authoritative runtime state | Ornamental or stale visualization can mislead reviewers |
| External LLM / tools | Return model outputs, embeddings, retrieval results, or tool data | Become source of truth without recorded provenance | Latency, cost, hallucination, rate limits, and provider failure |

### User Questions Still Open

[open question] Whether reviewers should be able to submit a live seed prompt during the showcase or only watch the operator submit it.

[open question] Whether any authentication is required by the deployment environment, even if product-level multi-user auth is out of MVP scope.

