# Doppl User And System Flows

Source PRD: `Doppl_Capstone_Proposal.pdf`

## Phase 4 - User And System Flows

### Flow: Configure And Start A Run

Actor: Demo operator

Trigger: Operator wants to run Doppl against a live prompt or prepared problem set.

Preconditions:

- Runtime service is available.
- LLM/tool providers are configured.
- Default caps are present for population size, generations, energy, depth, tool calls, and wall-clock time.

Steps:

1. Operator selects live prompt or prepared problem set.
2. Operator selects idea prey mode: both types enabled by default.
3. Operator reviews or adjusts safe caps.
4. Operator starts the run.
5. System creates a run record and initial generation.
6. Runtime seeds the starting population of agenomes.
7. Dashboard begins reading live run events.

System Responsibilities:

- Validate caps before start.
- Persist run configuration.
- Emit a run-created event.
- Make the run replayable from the beginning.

Success State:

- A run is active, visible, bounded, and streaming events to the dashboard.

Failure States:

- Missing provider configuration.
- Invalid caps.
- Seed/problem set is malformed.
- Runtime worker unavailable.

Data Touched:

- Run, run configuration, generation, agenomes, event log.

Security / Lifecycle Constraints:

- Operator cannot bypass hard maximum caps.
- Run starts must be idempotent from the UI perspective to avoid accidental duplicate runs.

### Flow: Execute Generation Lifecycle

Actor: Runtime worker, agenome agents, selection controller

Trigger: A run has an active generation ready to execute.

Preconditions:

- Run is active.
- Generation has a population.
- Energy budget and tool permissions are assigned.

Steps:

1. Runtime schedules agenome execution.
2. Agenome agents generate candidate ideas.
3. Runtime records energy spend for reasoning, tools, and spawning.
4. Candidate ideas are normalized into the shared candidate schema.
5. Runtime emits candidate-created and energy-spent events.
6. Generation waits for critic and subtype check completion.

System Responsibilities:

- Enforce energy, depth, spawn, time, and tool caps.
- Persist candidate ideas and energy events.
- Keep lineage links from agenome to output.

Success State:

- Generation has candidate ideas ready for verification.

Failure States:

- Agenome fails to produce structured output.
- Provider timeout or rate limit.
- Energy exhausted before useful output.
- Runtime kills runaway execution.

Data Touched:

- Agenome, candidate idea, energy event, lineage event, generation state.

Security / Lifecycle Constraints:

- Agenomes cannot alter scores, lineage, caps, or survival criteria.
- Tool calls must be permissioned and metered.

### Flow: Verify Candidate Ideas

Actor: Critic agents, check runners

Trigger: Candidate ideas are ready for evaluation.

Preconditions:

- Candidate idea has a subtype.
- Critic mandates are configured.
- Subtype-specific checks are available or explicitly skipped with reason.

Steps:

1. Critic council receives candidate idea and relevant context.
2. Critics emit structured reviews for grounding, novelty, feasibility, falsification, and subtype-relevant concerns.
3. Check runners execute feasible subtype checks.
4. System stores critic reviews and check results.
5. Candidate idea becomes ready for fitness scoring.

System Responsibilities:

- Keep critic output structured and inspectable.
- Record provenance for evidence and checks.
- Separate self-generated claims from external or held-out evidence.

Success State:

- Candidate has enough evidence for scoring and reviewer inspection.

Failure States:

- Critic output invalid.
- Retrieval/check dependency fails.
- Check is unsafe or infeasible.
- Critics disagree heavily and no tie-break rule exists.

Data Touched:

- Candidate idea, critic review, check result, evidence reference, event log.

Security / Lifecycle Constraints:

- Critic agents cannot mutate candidate content or lineage.
- Check runners cannot execute arbitrary unsafe code.
- Held-out validation anchors cannot be moved by evolving agents.

### Flow: Score, Cull, Fuse, And Mutate

Actor: Selection controller

Trigger: Candidate verification completes for a generation.

Preconditions:

- Candidate ideas have critic reviews and subtype check results.
- Fitness scoring policy is configured.
- Parent selection policy is configured.

Steps:

1. Selection controller computes decomposed fitness scores.
2. Controller compares candidates within the generation.
3. Weak lineages are culled.
4. Strong parent agenomes are selected.
5. Fusion creates child agenomes through crossover and/or output-level synthesis.
6. Mutation changes selected child traits within allowed boundaries.
7. Runtime creates the next generation if caps allow.

System Responsibilities:

- Preserve score components.
- Persist culling, parent selection, fusion, mutation, and child lineage events.
- Stop cleanly when generation/budget caps are reached.

Success State:

- Next generation exists with child agenomes linked to parents, or run completes with a best surviving idea.

Failure States:

- No candidates survive.
- Score policy is missing or invalid.
- Fusion produces invalid agenomes.
- Generation cap or budget cap prevents continuation.

Data Touched:

- Fitness score, culling event, reproduction event, agenome, lineage event, generation state.

Security / Lifecycle Constraints:

- Metric mutation, if implemented, cannot redefine bedrock validation anchors.
- Score calculation must be auditable and replayable.

### Flow: Observe Live Run

Actor: Demo operator, read-only reviewers, dashboard client

Trigger: A run is active or recently completed.

Preconditions:

- Dashboard can read run state and event stream.

Steps:

1. Dashboard displays run status and current generation.
2. Dashboard renders population tree and lineage events.
3. Dashboard shows energy spend per agenome.
4. Dashboard displays candidate ideas and critic gauntlet status.
5. Dashboard charts fitness-over-time.
6. Dashboard highlights the current best surviving idea.

System Responsibilities:

- Stream or poll authoritative run events.
- Make the evolution story legible without editing runtime truth.
- Keep UI state consistent with persisted events.

Success State:

- Reviewers can see agents spawn, spend energy, face critics, survive/die, fuse, mutate, and improve over generations.

Failure States:

- Dashboard lags or disconnects.
- Runtime state and UI state diverge.
- Visuals fail to explain why an idea won.

Data Touched:

- Run state, generation state, event log, dashboard projections.

Security / Lifecycle Constraints:

- Dashboard is read-only for reviewers.
- Runtime event log remains source of truth.

### Flow: Replay A Run

Actor: Demo operator, read-only reviewers, dashboard client

Trigger: Operator wants to rehearse, recover from live provider failure, or explain a completed run.

Preconditions:

- Completed or partial run has persisted event data.

Steps:

1. Operator selects a previous run.
2. Dashboard loads event log and projections.
3. Dashboard replays lineage, energy, critic outcomes, scores, and final payoff.
4. Operator can pause/inspect candidate evidence and critic gauntlet.

System Responsibilities:

- Persist enough events to reconstruct the run.
- Clearly distinguish replay from live execution.
- Preserve original timestamps and event ordering.

Success State:

- The team can present a credible run even if live LLM/tool calls are slow or unavailable.

Failure States:

- Event log incomplete.
- Replay diverges from original scoring.
- Reviewers confuse replay for live execution.

Data Touched:

- Run, event log, dashboard projections, persisted reviews/checks/scores.

Security / Lifecycle Constraints:

- Replay cannot mutate historical run records.
- Any edited demo annotations must be separate from authoritative events.

### Flow: Stop Or Complete A Run

Actor: Demo operator, runtime worker

Trigger: Budget/generation/time cap is reached, all lineages fail, best idea is selected, or operator manually stops.

Preconditions:

- Run is active.

Steps:

1. Runtime detects stop condition or operator presses stop.
2. Runtime cancels outstanding work safely.
3. Runtime finalizes generation/run state.
4. System selects best surviving idea if one exists.
5. System stores final summary and emits run-completed or run-failed event.

System Responsibilities:

- Stop bounded work reliably.
- Preserve partial evidence.
- Make final state explicit.

Success State:

- Run ends cleanly with replayable evidence and clear final status.

Failure States:

- Work continues after stop.
- Partial data is lost.
- Final best idea cannot be determined.

Data Touched:

- Run status, generation status, candidate status, event log, final summary.

Security / Lifecycle Constraints:

- Stop is a hard control path, not best-effort UI state.

### Requirement Coverage

| Requirement | Covered By |
|---|---|
| Spawn bounded agenome population | Configure And Start A Run; Execute Generation Lifecycle |
| Support both prey types | Configure And Start A Run; Verify Candidate Ideas |
| Shared lifecycle with subtype checks | Execute Generation Lifecycle; Verify Candidate Ideas |
| Critic council verification | Verify Candidate Ideas |
| Objective/subtype checks | Verify Candidate Ideas |
| Energy accounting and caps | Configure And Start A Run; Execute Generation Lifecycle; Observe Live Run |
| Culling, fusion, mutation | Score, Cull, Fuse, And Mutate |
| Generation-over-generation improvement | Score, Cull, Fuse, And Mutate; Observe Live Run |
| Instrumented dashboard | Observe Live Run |
| Demo reliability and replay | Replay A Run; Stop Or Complete A Run |

### Flow Questions Still Open

[open question] Should the showcase start from a live audience prompt, a prepared prompt, or offer both with operator choice?

[open question] What exact problem sets should be available for rehearsal and fallback?

[open question] What level of real-time streaming is needed versus polling persisted events?

