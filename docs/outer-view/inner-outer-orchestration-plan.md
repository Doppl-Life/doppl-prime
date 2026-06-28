# Inner / Outer Orchestration Plan

Working branch: `dalton-outer-view`

## Goal

From localhost, an operator should be able to launch a case-study bloom from `/agarden`, watch the inner organism run unfold at `/runs/:runId`, and watch the Agarden map grow as completed inner runs promote selected outputs into outer artifacts:

`case_study -> problem_recovery -> doppl`

This must preserve separation of concerns. The outer view should not become a second inner kernel, and the inner run launcher should not become campaign-aware.

## Separation Of Concerns

| Surface / Module | Responsibility | Should Not Do |
| --- | --- | --- |
| `/launch` | Launch exactly one inner organism run through `POST /runs`. | Manage case-study blooms, campaign traversal, or Agarden artifact promotion. |
| `/runs/:runId` | Inspect one inner run: agenomes, candidates, fitness, energy, generation flow, final selection. | Decide outer parent-child structure or persist Agarden nodes. |
| `/agarden` | Start and observe an outer campaign: case study, problem recoveries, Doppls, map growth. | Own model-provider secrets, directly mutate inner run state, or fabricate winners. |
| `POST /runs` | Validate a `RunConfig`, append `run.configured`, start one worker. | Know why the run exists in an outer campaign. |
| `POST /outer-campaigns` | Create an outer campaign, persist the root case-study artifact, and start the first child inner run. | Duplicate all `/runs` validation/start logic long-term. |
| `outerCampaignOrchestrator` | Server-side campaign brain: promote completed child-run winners, decide next stage, start next child run, enforce campaign caps. | Run the inner evolutionary loop itself. |
| `MarkScript compiler` | Convert root inputs and selected inner winners into Agarden-displayable markdown nodes. | Change frozen kernel contracts or re-score candidates. |
| `/bloom` read projection | Return current Agarden map state from imported artifacts, campaign artifacts, and fallback live projections. | Be the long-term hidden owner of orchestration side effects. |

## Important Contract Finding: Problem Recovery Is Not Yet A Kernel Output Type

As of this branch, the inner kernel's canonical generated object is still `CandidateIdea`.

The relevant contract/runtime facts are:

- `packages/contracts/src/domain/candidate-idea.ts` defines the generated unit as `CandidateIdea`.
- `apps/api/src/runtime/loop/candidateContent.ts` derives the model-output schema from `CandidateIdea`.
- `apps/api/src/runtime/loop/generationLoop.ts` appends `candidate.created`, scores candidates, and terminalizes runs with `run.completed.finalIdeaRef`.
- There is no frozen `ProblemRecovery` contract and no separate `problem_recovery.created` event today.

That means the current outer bridge is doing stage compilation:

`selected CandidateIdea + childRun.stage -> problem_recovery or doppl MarkScript artifact`

This is acceptable for the localhost vertical slice, but only if the child run is configured/prompted with the correct stage intent. Otherwise a `problem_recovery` artifact is just a generic selected candidate relabeled after the fact.

Implementation implication:

- The outer orchestrator owns **stage intent**.
- The inner kernel owns **candidate generation/selection**.
- The MarkScript compiler owns **Agarden display shape**.
- The next correctness upgrade is to pass explicit stage framing into child runs so the same `CandidateIdea` contract can be used to generate recovered-problem candidates for `problem_recovery` runs and solution candidates for `doppl` runs.

## Current State

Implemented so far:

- `POST /outer-campaigns` exists.
- It persists `outer_campaigns`, root `outer_campaign_artifacts`, and first `outer_campaign_child_runs`.
- It starts the first child inner run by appending `run.configured` and calling `onRunConfigured`.
- Root case-study artifacts are compiled through MarkScript.
- `/bloom` reads campaign artifacts as first-class outer nodes.
- `/bloom` currently performs an opportunistic promotion sync before returning the map.
- The promotion sync detects terminal child runs, folds current state, finds the selected winner, compiles MarkScript, and persists a promoted outer artifact.
- A shared inner-run start command now backs both ordinary run starts and outer campaign child-run starts, reducing validation/start drift.

This is a useful localhost vertical slice, but it is not yet the final orchestration architecture.

## Target Architecture

### 1. Keep `/launch` Inner-Only

`/launch` remains the generic single-run entry point. It should continue to use `POST /runs` and navigate to `/runs/:runId`.

This keeps inner-kernel work testable and reusable without Agarden assumptions.

### 2. Keep `/agarden` Campaign-Only

The Agarden grow panel should start blooms through `POST /outer-campaigns`, not `POST /runs`.

`/agarden` receives campaign metadata and active child-run IDs. It may link to `/runs/:runId` for source proof, but the map itself is driven by outer campaign artifacts.

### 3. Extract A Shared Inner-Run Start Service

Today, `POST /runs` and `POST /outer-campaigns` both know how to validate/start a run. That risks drift.

Create an API-internal command service such as:

`startInnerRunFromConfig({ config, actor, idempotencyKey?, source? })`

It should own:

- `RunConfig` validation/defaulting
- cap-max enforcement
- model-route override allowlist enforcement
- `run.configured` append
- optional idempotency
- `onRunConfigured` trigger

`POST /runs` and `outerCampaignOrchestrator` should both call this service.

### 4. Add `outerCampaignOrchestrator`

The orchestrator is the server-side owner of outer growth.

Responsibilities:

- Read active campaigns.
- Read child-run state.
- Detect terminal child runs.
- Promote selected winners through the MarkScript compiler.
- Decide next stage:
  - root case-study child run completes -> promote selected problem recovery.
  - problem recovery promoted -> start Doppl child run.
  - Doppl child run completes -> promote selected Doppl.
  - optional later: Doppl leaf -> reseeded case-study island.
- Enforce campaign caps:
  - max outer nodes
  - max child runs
  - max depth
  - max energy/tool budget when available
  - stopped/cancelled state
- Be idempotent across server restarts.

The orchestrator should not call model providers directly. It only starts inner runs and consumes their persisted events.

### 5. Move `/bloom` Back Toward Read-Only

The current `/bloom` promotion sync is acceptable as a localhost bridge. Long-term, promotion should happen in the orchestrator loop, and `/bloom` should simply read materialized campaign artifacts.

This matters because a GET endpoint with hidden write side effects is surprising and harder to reason about.

### 6. Keep MarkScript As The Display Boundary

Agarden expects durable markdown nodes. The kernel produces inner event ingredients.

The correct translation is:

`selected inner winner + source metrics + parent outer artifact -> MarkScript outer artifact`

The compiler should remain the only place that knows how to map `CandidateIdea`, `FitnessScore`, `NoveltyScore`, and `JudgeResult` into Agarden node sections.

## Recommended Implementation Order

1. Keep current local vertical slice intact.
2. Extract shared inner-run start command from `POST /runs`. **Done.**
3. Update `POST /outer-campaigns` to use the shared command. **Done.**
4. Move promotion sync into an explicit `outerCampaignOrchestrator` service.
5. Add next-stage planning:
   - `problem_recovery` promotion starts a Doppl child run.
   - Doppl child run completion promotes a Doppl artifact.
6. Add idempotency tests so orchestrator reruns cannot duplicate artifacts or child runs.
7. Add UI campaign status/progress in `/agarden`.
8. Later: replace polling with a campaign stream.

## Open Design Decisions

- Whether the first orchestrator should run:
  - opportunistically on `/bloom` and `/outer-campaigns/:id`, or
  - as an interval worker in API boot.
- Whether campaign child runs should be single-winner first, or support `keep > 1` immediately.
- How soon outer artifact events should graduate into shared frozen contracts instead of API-local tables.
- Whether `/launch` should offer a link to start an Agarden campaign, while still not becoming campaign-aware itself.

## Current Recommendation

Use API-local campaign tables and a server-side orchestrator first. Do not change frozen shared contracts yet.

This gives us the localhost end-to-end behavior quickly while preserving clean boundaries:

- inner contracts stay stable;
- `/launch` stays inner-only;
- `/agarden` becomes the outer campaign surface;
- the orchestrator owns stage progression;
- MarkScript owns display compilation.
