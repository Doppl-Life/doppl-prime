import { z } from "zod";

export const SubtypeName = z.enum(["cross_domain_transfer", "zeitgeist_synthesis"]);
export type SubtypeNameT = z.infer<typeof SubtypeName>;

export const EvidenceKind = z.enum(["trace", "check_output", "prior_art", "signal", "raw_output", "other"]);
export const EvidenceRef = z
  .object({
    kind: EvidenceKind,
    eventId: z.string().min(1).optional(),
    uri: z.string().min(1).optional(),
    label: z.string().optional(),
    langfuseObservationId: z.string().min(1).optional(),
  })
  .passthrough();
export type EvidenceRefT = z.infer<typeof EvidenceRef>;

export const CandidateStatus = z.enum([
  "created",
  "under_review",
  "checked",
  "scored",
  "selected",
  "rejected",
  "culled",
  "invalid",
]);

const candidateBase = {
  id: z.string().min(1),
  runId: z.string().min(1),
  generationId: z.string().min(1),
  agenomeId: z.string().min(1),
  title: z.string().min(1).optional(),
  summary: z.string().optional(),
  explanation: z.string().optional(),
  claims: z.array(z.string()).default([]),
  evidenceRefs: z.array(EvidenceRef).default([]),
  status: CandidateStatus,
};

export const CandidateIdea = z
  .object({
    ...candidateBase,
    subtype: SubtypeName,
    subtypePayload: z.unknown().optional(),
  })
  .passthrough();
export type CandidateIdeaT = z.infer<typeof CandidateIdea>;

export const AgenomeStatus = z.enum([
  "seeded",
  "active",
  "spent",
  "eligible_parent",
  "failed",
  "reproduced",
  "culled",
]);
export const Agenome = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    generationId: z.string().min(1),
    parentIds: z.array(z.string()).default([]),
    systemPrompt: z.string().optional(),
    personaWeights: z.record(z.string(), z.number()).default({}),
    toolPermissions: z.array(z.string()).default([]),
    decompositionPolicy: z.string().optional(),
    spawnBudget: z.number().int().nonnegative().optional(),
    mutationMeta: z.record(z.string(), z.unknown()).optional(),
    status: AgenomeStatus,
  })
  .passthrough();
export type AgenomeT = z.infer<typeof Agenome>;

export const CriticMandate = z.enum([
  "factual_grounding",
  "novelty_prior_art",
  "feasibility",
  "falsification",
  "subtype_specific",
]);
export const CriticReview = z
  .object({
    id: z.string().min(1),
    candidateId: z.string().min(1),
    mandate: CriticMandate,
    scores: z.record(z.string(), z.number()).default({}),
    critique: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    evidenceRefs: z.array(EvidenceRef).default([]),
  })
  .passthrough();
export type CriticReviewT = z.infer<typeof CriticReview>;

export const CheckStatus = z.enum(["passed", "failed", "skipped", "running", "pending"]);
export const CheckResult = z
  .object({
    id: z.string().min(1),
    candidateId: z.string().min(1).optional(),
    status: CheckStatus,
    evidenceRefs: z.array(EvidenceRef).default([]),
  })
  .passthrough();
export type CheckResultT = z.infer<typeof CheckResult>;

export const FitnessScore = z
  .object({
    id: z.string().min(1),
    candidateId: z.string().min(1),
    total: z.number(),
    components: z.record(z.string(), z.number()).default({}),
    policyVersion: z.string().optional(),
    explanation: z.string().optional(),
  })
  .passthrough();
export type FitnessScoreT = z.infer<typeof FitnessScore>;

export const NoveltyScore = z
  .object({
    id: z.string().min(1),
    candidateId: z.string().min(1),
    score: z.number().optional(),
  })
  .passthrough();
export type NoveltyScoreT = z.infer<typeof NoveltyScore>;

export const RunCaps = z
  .object({
    maxPopulation: z.number().int().positive(),
    maxGenerations: z.number().int().positive(),
    energyBudget: z.number().int().positive(),
    maxSpawnDepth: z.number().int().positive(),
    maxToolCalls: z.number().int().positive(),
    wallClockTimeoutMs: z.number().int().positive(),
  })
  .passthrough();
export type RunCapsT = z.infer<typeof RunCaps>;

export const RunConfig = z
  .object({
    seed: z.string().min(1),
    enabledSubtypes: z.array(SubtypeName).min(1),
    caps: RunCaps,
    modelProfile: z.string().min(1),
    scoringPolicyVersion: z.string().min(1),
    rngSeed: z.string().min(1),
    problemText: z.string().optional(),
    problemTitle: z.string().optional(),
  })
  .passthrough();
export type RunConfigT = z.infer<typeof RunConfig>;

export const RunEventTypeValues = [
  "run.configured",
  "run.started",
  "run.completed",
  "run.failed",
  "run.stopped",
  "generation.started",
  "generation.completed",
  "agenome.spawned",
  "agenome.fused",
  "agenome.mutated",
  "agenome.reproduced",
  "candidate.created",
  "critic.reviewed",
  "check.completed",
  "novelty.scored",
  "fitness.scored",
  "lineage.culled",
  "energy.spent",
  "provider_call_failed",
  "output_schema_rejected",
  "candidate_invalidated",
  "energy_exhausted",
  "generation_failed",
  "reproduction_aborted_insufficient_parents",
  "novelty_scoring_degraded",
] as const;
export const RunEventType = z.enum(RunEventTypeValues);
export type RunEventTypeT = z.infer<typeof RunEventType>;

export const RunEventEnvelope = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    generationId: z.string().min(1).optional(),
    agenomeId: z.string().min(1).optional(),
    candidateId: z.string().min(1).optional(),
    type: z.string().min(1),
    sequence: z.number().int().nonnegative(),
    occurredAt: z.string().min(1),
    actor: z.string().min(1),
    correlationId: z.string().min(1).optional(),
    payload: z.unknown(),
    schemaVersion: z.number().int().positive(),
  })
  .passthrough();
export type RunEventEnvelopeT = z.infer<typeof RunEventEnvelope>;

export const RunStatus = z.enum([
  "configured",
  "running",
  "completed",
  "stopped",
  "failed",
  "cancelled",
  "stalled",
  "unknown",
]);

export const ModelRole = z.string();
export type ModelRoleT = z.infer<typeof ModelRole>;

export const ScoringPolicy = z.record(z.string(), z.unknown());
export type ScoringPolicyT = z.infer<typeof ScoringPolicy>;

export const LineageNodeType = z.enum(["agenome", "candidate", "critic_review", "check_result", "scoring"]);
export const LineageNode = z
  .object({
    id: z.string().min(1),
    type: LineageNodeType,
    label: z.string().optional(),
    status: z.string().optional(),
    metrics: z.record(z.string(), z.number()).optional(),
  })
  .passthrough();
export type LineageNodeT = z.infer<typeof LineageNode>;

export const LineageEdge = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    type: z.string().optional(),
    label: z.string().optional(),
  })
  .passthrough();
export type LineageEdgeT = z.infer<typeof LineageEdge>;

export const LineageGraphProjection = z
  .object({
    nodes: z.array(LineageNode),
    edges: z.array(LineageEdge),
  })
  .passthrough();
export type LineageGraphProjectionT = z.infer<typeof LineageGraphProjection>;

export const RunHealth = z
  .object({
    runId: z.string().min(1),
    status: RunStatus,
    currentGeneration: z.number().int().nonnegative().nullable().optional(),
    candidatesInFlight: z.number().int().nonnegative(),
    lastEventAt: z.string().nullable().optional(),
    eventCount: z.number().int().nonnegative().optional(),
    sequenceThrough: z.number().int().optional(),
    capsConsumed: z.record(z.string(), z.number()).default({}),
    lastHeartbeatMs: z.number().nullable().optional(),
  })
  .passthrough();
export type RunHealth = z.infer<typeof RunHealth>;

export const RunListEntry = z
  .object({
    runId: z.string().min(1),
    caseId: z.string().optional(),
    caseTitle: z.string().optional(),
    child: z.string().nullable().optional(),
    candidates: z.number().optional(),
    generations: z.number().optional(),
    hasModelCalls: z.boolean().optional(),
  })
  .passthrough();
export type RunListEntry = z.infer<typeof RunListEntry>;

export const RunListResponse = z.object({ runs: z.array(RunListEntry) }).passthrough();
export type RunListResponse = z.infer<typeof RunListResponse>;

export const EventsListResponse = z
  .object({
    runId: z.string().min(1),
    events: z.array(z.unknown()),
    sequenceThrough: z.number().int().optional(),
  })
  .passthrough();
export type EventsListResponse = z.infer<typeof EventsListResponse>;

export const ModelRoutesResponse = z
  .object({
    routes: z.array(z.record(z.string(), z.unknown())).default([]),
  })
  .passthrough();
export type ModelRoutesResponse = z.infer<typeof ModelRoutesResponse>;
