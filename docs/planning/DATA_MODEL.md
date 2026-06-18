# Doppl Data Model

Source PRD: `Doppl_Capstone_Proposal.pdf`

## Purpose

[locked decision] Doppl uses Postgres as the authoritative persistence layer. The source of truth is an append-only run event log. Current-state tables, dashboard projections, lineage graph projections, and Neo4j exports are derived read models.

## Authoritative Event Store

### Event Envelope

Every authoritative lifecycle event should use this envelope shape:

```ts
type RunEventEnvelope = {
  id: string;
  runId: string;
  generationId?: string;
  agenomeId?: string;
  candidateId?: string;
  type: RunEventType;
  sequence: number;
  occurredAt: string;
  actor: "operator" | "runtime" | "agenome" | "critic" | "check_runner" | "selection_controller" | "system";
  correlationId?: string;
  langfuseTraceId?: string;
  langfuseObservationId?: string;
  payload: Record<string, unknown>;
  schemaVersion: number;
};
```

[locked decision] `sequence` is monotonic per run and is used for replay ordering and SSE resume.

[locked decision] `payload` may begin as JSONB for MVP speed, but high-value fields should be promoted into projections once stable.

### Required Event Types

| Event Type | Purpose | Must Persist |
|---|---|---|
| `run.configured` | Operator configured a run | seed, prey types, caps, model profile, scoring policy |
| `run.started` | Runtime accepted the run | timestamps, worker metadata |
| `generation.started` | Generation execution began | generation index, population target |
| `agenome.spawned` | Seed or child agenome created | agenome traits, parent IDs, mutation/fusion metadata |
| `energy.spent` | Metered compute/tool/spawn cost | amount, unit, reason, provider metadata |
| `candidate.created` | Agenome emitted candidate idea | subtype, title, summary, claims, raw/normalized output refs |
| `critic.reviewed` | Critic produced structured review | mandate, scores, critique, evidence refs, trace IDs |
| `check.completed` | Subtype check completed or skipped | check type, status, score, output, skip reason |
| `novelty.scored` | Candidate novelty score computed | comparison set, method, score, explanation |
| `fitness.scored` | Candidate fitness computed | policy version, components, total, explanation |
| `lineage.culled` | Candidate/lineage removed | reason, score snapshot |
| `agenome.fused` | Child created from parents | parent IDs, crossover/output-synthesis summary |
| `agenome.mutated` | Mutation applied | mutation summary, fields changed |
| `generation.completed` | Generation reached terminal state | summary, best candidate IDs |
| `run.completed` | Run produced final summary | final candidate, status, evidence refs |
| `run.failed` | Run failed | reason, recoverability, partial summary |
| `run.stopped` | Operator/runtime stopped run | stop reason, partial summary |

## Core Tables

| Table | Role | Notes |
|---|---|---|
| `runs` | Current run projection | Derived from events; stores status, caps, seed summary, active generation |
| `run_events` | Authoritative event log | Append-only; sequence ordered per run |
| `generations` | Generation projection | Derived state and aggregate metrics |
| `agenomes` | Agenome projection | Stores latest agenome traits and parentage summary |
| `candidate_ideas` | Candidate projection | Shared fields plus subtype payload JSON |
| `critic_reviews` | Review projection | Structured reviews for filtering/inspection |
| `check_results` | Subtype check projection | Objective or skipped check evidence |
| `fitness_scores` | Score projection | Policy-versioned decomposed score |
| `embeddings` | Novelty vectors | Candidate summary embeddings if pgvector is used |
| `lineage_edges` | Graph projection | Parent/child, produced, culled, selected, scored edges |
| `dashboard_snapshots` | Optional replay/read optimization | Derived and rebuildable |

## Candidate Idea Shape

```ts
type CandidateIdea = {
  id: string;
  runId: string;
  generationId: string;
  agenomeId: string;
  subtype: "cross_domain_transfer" | "zeitgeist_synthesis";
  title: string;
  summary: string;
  claims: string[];
  evidenceRefs: EvidenceRef[];
  status: "created" | "under_review" | "checked" | "scored" | "selected" | "rejected" | "culled" | "invalid";
  subtypePayload: CrossDomainTransferPayload | ZeitgeistSynthesisPayload;
};
```

## Subtype Payloads

```ts
type CrossDomainTransferPayload = {
  sourceDomain: string;
  sourceTechnique: string;
  targetDomain: string;
  targetProblem: string;
  transferMapping: string;
  expectedMechanism: string;
  executableCheckIdea?: string;
};

type ZeitgeistSynthesisPayload = {
  thesis: string;
  audience: string;
  currentSignals: string[];
  whyNow: string;
  falsifiablePredictions: string[];
  comparablePriorArt: string[];
};
```

## Model And Trace Metadata

[locked decision] LLM-related events store provider route metadata, model role, model ID, model gateway request ID, Langfuse trace/observation IDs when available, token/cost estimates when available, and structured-output validation result.

[locked decision] Provider credentials and raw secrets are never persisted.

## Lineage Graph Projection

```ts
type LineageGraphProjection = {
  runId: string;
  nodes: Array<{
    id: string;
    type: "generation" | "agenome" | "candidate" | "critic" | "check" | "score";
    label: string;
    status?: string;
    metrics?: Record<string, number>;
    dataRef: string;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: "spawned" | "produced" | "reviewed" | "checked" | "scored" | "culled" | "fused" | "mutated" | "selected";
    label?: string;
  }>;
  sequenceThrough: number;
};
```

[locked decision] React Flow consumes this projection. Neo4j spike consumes the same logical nodes/edges and may add query-specific labels/properties, but Neo4j is never authoritative in MVP.

## Replay Rules

[locked decision] Replay rebuilds from `run_events` ordered by `(run_id, sequence)`.

[locked decision] Replay must not call model providers, check runners, or embedding providers.

[locked decision] A run is replayable even if Langfuse Cloud is unavailable.

## Data Questions Remaining

[open question] Exact scoring component weights and policy shape.

[open question] Whether pgvector is used from day one or app-level cosine starts the first novelty spike.

[open question] Exact event payload fields after provider/model spike.

