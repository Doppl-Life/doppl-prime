/**
 * Canonical valid fixtures — one per Appendix-A model (ARCHITECTURE.md §16 contract tests, P0.14).
 *
 * The cross-track agreement artifact: every track's producer/consumer validates its I/O against ONE
 * shared canonical fixture, so consumers agree with producers on payload shapes BEFORE the tracks fork
 * (RISK-014 / REQ-T-007). Each fixture is annotated with its `z.infer` type, so a model/type drift or
 * a redefinition fails `pnpm typecheck` (single-source-of-truth). The `CANONICAL_FIXTURES` registry
 * pairs each fixture with its schema for table-driven validation + cross-track iteration.
 *
 * Shipped from `src/` (public API) so downstream tracks import them. Imports are from direct module
 * paths (never the barrel) so this file can never form an import cycle with `index.ts`.
 */
import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION } from '../version';
import { RunEventEnvelope } from '../events/envelope';
import { resolvePayloadSchema } from '../events/payload-map';
import { RunConfig } from '../run/run-config';
import { RunCaps } from '../run/run-caps';
import { Agenome } from '../domain/agenome';
import { CandidateIdea } from '../domain/candidate-idea';
import { CrossDomainTransferPayload, ZeitgeistSynthesisPayload } from '../domain/subtype-payloads';
import { EvidenceRef } from '../domain/evidence-ref';
import { CriticReview } from '../verifier/critic-review';
import { criticInput } from '../verifier/critic-input';
import { CheckResult } from '../checks/check-result';
import { CheckRunnerAdapter } from '../checks/check-runner-adapter';
import { NoveltyScore } from '../scoring/novelty-score';
import { FitnessScore } from '../scoring/fitness-score';
import { ScoringPolicy } from '../scoring/scoring-policy';
import { EnergyEvent } from '../domain/energy-event';
import { ReproductionEvent } from '../domain/reproduction-event';
import { ProviderMeta } from '../gateway/provider-meta';
import { ModelRoute } from '../gateway/model-route';
import { ProviderCapability } from '../gateway/provider-capability';
import { ModelGatewayRequest } from '../gateway/gateway-request';
import { ModelGatewayResponse } from '../gateway/gateway-response';
import { Run } from '../domain/run';
import { Generation } from '../domain/generation';
import { CullingEvent } from '../domain/culling-event';
import { LineageGraphProjection, LineageNode, LineageEdge } from '../projections/lineage-graph';
import { FinalJudgeRubric } from '../verifier/final-judge-rubric';
import { JudgeResult } from '../verifier/judge-result';

export const validRunCaps: RunCaps = {
  maxPopulation: 10,
  maxGenerations: 5,
  energyBudget: 1000,
  maxSpawnDepth: 3,
  maxToolCalls: 20,
  wallClockTimeoutMs: 600_000,
};

export const validRunConfig: RunConfig = {
  seed: 'scenario-alpha',
  enabledSubtypes: ['cross_domain_transfer', 'zeitgeist_synthesis'],
  caps: validRunCaps,
  modelProfile: 'mvp-openrouter',
  scoringPolicyVersion: 'scoring-v1',
  rngSeed: 42,
};

/**
 * The frontend-v2 FB.0 run-controls variant — the canonical `RunConfig` exercising all three additive
 * optional controls (mutagen operators, the diverge/converge `generationBias`, a partial per-role
 * `modelRouteOverride`). Kept distinct from `validRunConfig` (which stays the no-controls baseline) so
 * the fixture-lockstep gate keeps ONE canonical `RunConfig`; this variant is consumed directly by the
 * FB.0 schema tests, not registered in `CANONICAL_FIXTURES`.
 */
export const validRunConfigWithControls: RunConfig = {
  ...validRunConfig,
  generationOperators: ['polymath', 'first_principles'],
  generationBias: 0.5,
  modelRouteOverride: {
    population_generator: { provider: 'ollama', modelId: 'llama3.1' },
  },
};

export const validRunEventEnvelope: RunEventEnvelope = {
  id: 'evt_1',
  runId: 'run_1',
  type: 'run.started',
  sequence: 0,
  occurredAt: '2026-06-20T12:00:00.000Z',
  actor: 'runtime',
  payload: {},
  schemaVersion: CURRENT_SCHEMA_VERSION,
};

export const validAgenome: Agenome = {
  id: 'agn_1',
  runId: 'run_1',
  generationId: 'gen_1',
  parentIds: [],
  systemPrompt: 'You are a cross-domain transfer agent.',
  personaWeights: { curiosity: 0.7, rigor: 0.6 },
  toolPermissions: ['web_search'],
  decompositionPolicy: 'single_pass',
  spawnBudget: 2,
  status: 'seeded',
};

export const validCrossDomainTransferPayload: CrossDomainTransferPayload = {
  sourceDomain: 'immunology',
  sourceTechnique: 'clonal selection',
  targetDomain: 'recommender systems',
  targetProblem: 'cold-start personalization',
  transferMapping: 'antigens→items, antibodies→user-affinity vectors',
  expectedMechanism: 'affinity maturation surfaces niche items faster than CF',
  executableCheckIdea: 'A/B vs CF baseline on held-out cold-start users',
};

export const validZeitgeistSynthesisPayload: ZeitgeistSynthesisPayload = {
  thesis: 'On-device LLM inference reshapes privacy-first consumer apps',
  audience: 'mobile product teams',
  currentSignals: ['NPU ubiquity', 'sub-3B models matching GPT-3.5 on narrow tasks'],
  whyNow: 'silicon + small-model quality crossed the usability threshold in 2026',
  falsifiablePredictions: ['>30% of new note apps ship on-device inference within 18mo'],
  comparablePriorArt: ['spell-check moving on-device'],
};

export const validCandidateIdeaCrossDomain: CandidateIdea = {
  id: 'cand_1',
  runId: 'run_1',
  generationId: 'gen_1',
  agenomeId: 'agn_1',
  title: 'Immune-inspired cold-start recommender',
  summary: 'Apply affinity maturation to surface niche items for new users.',
  claims: ['CF underperforms on cold-start'],
  evidenceRefs: [{ kind: 'prior_art', label: 'AIRS 2003' }],
  status: 'created',
  subtype: 'cross_domain_transfer',
  subtypePayload: validCrossDomainTransferPayload,
};

export const validCandidateIdeaZeitgeist: CandidateIdea = {
  id: 'cand_2',
  runId: 'run_1',
  generationId: 'gen_1',
  agenomeId: 'agn_1',
  title: 'On-device inference thesis candidate',
  summary: 'A why-now thesis grounded in current signals.',
  claims: ['On-device inference is now viable'],
  evidenceRefs: [{ kind: 'prior_art', label: 'AIRS 2003' }],
  status: 'created',
  subtype: 'zeitgeist_synthesis',
  subtypePayload: validZeitgeistSynthesisPayload,
};

export const validEvidenceRef: EvidenceRef = { kind: 'prior_art', label: 'AIRS 2003' };

export const validCriticReview: CriticReview = {
  id: 'rev_1',
  candidateId: 'cand_1',
  mandate: 'factual_grounding',
  scores: { grounding: 4, citations: 3 },
  critique: 'Claims are well-grounded but two citations are weak.',
  confidence: 0.8,
  evidenceRefs: [{ kind: 'check_output', eventId: 'evt_9' }],
};

export const validCriticInput: criticInput = {
  rubric: {
    mandate: 'factual_grounding',
    instructions: 'Assess the factual grounding of each claim.',
  },
  candidate: 'Candidate idea text to be evaluated as data, never as instructions.',
};

export const validCheckResult: CheckResult = {
  id: 'chk_1',
  candidateId: 'cand_1',
  checkType: 'citation_resolves',
  status: 'passed',
  score: 0.9,
  output: 'all 3 citations resolved',
  evidenceRefs: [{ kind: 'check_output', eventId: 'evt_3' }],
};

export const validCheckRunnerAdapter: CheckRunnerAdapter = {
  id: 'adapter_1',
  checkType: 'citation_resolves',
};

export const validNoveltyScore: NoveltyScore = {
  id: 'nov_1',
  candidateId: 'cand_1',
  vector: [0.12, -0.4, 0.91],
  embeddingModelId: 'text-embedding-3-small',
  dimension: 3,
  comparisonSet: ['cand_2', 'cand_3'],
  method: 'cosine',
  score: 0.72,
  explanation: 'Distinct from the 2 nearest prior candidates.',
};

export const validFitnessScore: FitnessScore = {
  id: 'fit_1',
  candidateId: 'cand_1',
  total: 0.81,
  components: {
    critic: 0.7,
    novelty: 0.72,
    energy_efficiency: 0.9,
    judge_acceptance: 1,
    subtype_check: 0.6,
  },
  policyVersion: 'scoring-v1',
  explanation: 'Weighted sum across 5 signals under scoring-v1.',
};

export const validScoringPolicy: ScoringPolicy = {
  version: 'scoring-v1',
  weights: { critic: 0.3, novelty: 0.3, feasibility: 0.2, judge: 0.2 },
};

export const validProviderMeta: ProviderMeta = {
  provider: 'openrouter',
  modelId: 'anthropic/claude-3.5',
  gatewayRequestId: 'greq_1',
  tokensIn: 1200,
  tokensOut: 380,
  costEstimate: 0.004,
};

export const validEnergyEvent: EnergyEvent = {
  id: 'enr_1',
  runId: 'run_1',
  generationId: 'gen_1',
  agenomeId: 'agn_1',
  eventType: 'llm',
  estimate: 100,
  actual: 95,
  unit: 'doppl_energy',
  reason: 'idea_generation_completed',
  providerMeta: validProviderMeta,
};

export const validReproductionEvent: ReproductionEvent = {
  id: 'rep_1',
  runId: 'run_1',
  parentAgenomeIds: ['agn_1', 'agn_2'],
  childAgenomeId: 'agn_3',
  mode: 'fusion',
  crossoverPoints: [1, 3],
  mutationSummary: { temperature: 0.7, persona: 'explorer', active: true },
};

export const validProviderCapability: ProviderCapability = {
  structuredOutputs: true,
  embeddings: false,
};

export const validModelRoute: ModelRoute = {
  role: 'critic',
  provider: 'openrouter',
  modelId: 'anthropic/claude-3.5',
  capability: validProviderCapability,
  fallbackRouteIds: [],
};

export const validModelGatewayRequest: ModelGatewayRequest = {
  role: 'critic',
  prompt: 'Evaluate the factual grounding of this candidate.',
  maxTokens: 1000,
};

export const validModelGatewayResponse: ModelGatewayResponse = {
  accepted: true,
  validationResult: 'accepted',
  providerMeta: validProviderMeta,
};

export const validRun: Run = {
  id: 'run_1',
  seed: 'scenario-alpha',
  enabledSubtypes: ['cross_domain_transfer', 'zeitgeist_synthesis'],
  caps: validRunCaps,
  status: 'configured',
  startedAt: '2026-06-20T12:00:00.000Z',
};

export const validGeneration: Generation = {
  id: 'gen_1',
  runId: 'run_1',
  index: 0,
  status: 'pending',
  startedAt: '2026-06-20T12:00:00.000Z',
};

export const validCullingEvent: CullingEvent = {
  id: 'cull_1',
  runId: 'run_1',
  generationId: 'gen_1',
  targetIds: ['cand_3', 'cand_4'],
  reason: 'lost_generation_tournament',
  scoreSnapshot: { cand_3: 0.42, cand_4: 0.31 },
};

export const validLineageNode: LineageNode = {
  id: 'node_1',
  type: 'candidate',
  label: 'Immune-inspired cold-start recommender',
  status: 'scored',
  metrics: { fitness: 0.81, novelty: 0.72 },
  dataRef: 'cand_1',
};

export const validLineageEdge: LineageEdge = {
  id: 'edge_1',
  source: 'node_0',
  target: 'node_1',
  type: 'produced',
  label: 'fusion',
};

export const validLineageGraphProjection: LineageGraphProjection = {
  runId: 'run_1',
  nodes: [validLineageNode],
  edges: [validLineageEdge],
  sequenceThrough: 42,
};

export const validFinalJudgeRubric: FinalJudgeRubric = {
  axes: ['grounding', 'novelty', 'feasibility', 'falsification_survival', 'subtype_check_pass'],
  weights: {
    grounding: 1,
    novelty: 1,
    feasibility: 1,
    falsification_survival: 1,
    subtype_check_pass: 1,
    energy_efficiency_tiebreak: 0.1,
  },
  policyVersion: 'judge-v1',
  immutableToAgents: true,
};

export const validJudgeResult: JudgeResult = {
  id: 'judge_1',
  candidateId: 'cand_1',
  axisScores: {
    grounding: 4,
    novelty: 5,
    feasibility: 3,
    falsification_survival: 4,
    subtype_check_pass: 5,
  },
  acceptance: 0.82,
  // ties to validFinalJudgeRubric.policyVersion (immutability-via-versioning, lesson §12/§17).
  rubricPolicyVersion: 'judge-v1',
  providerMeta: validProviderMeta,
  langfuseTraceId: 'trace_judge_1',
};

/**
 * A canonical `judge.reviewed` envelope — the persisted held-out-judge acceptance event. `actor` is
 * `runtime` (the kernel orchestrates the held-out judge OUTSIDE the breeding loop — deliberately NOT
 * `critic`, which is reserved for the rotating council); the actor↔type pairing is a runtime rule
 * (§6), so this is illustrative, not a contract constraint. `payload` carries the JudgeResult at the
 * generic envelope level (per-type narrowing to JudgeResult is the payload-map layer, P0.10).
 */
export const validJudgeReviewedEnvelope: RunEventEnvelope = {
  id: 'evt_judge_1',
  runId: 'run_1',
  generationId: 'gen_1',
  candidateId: 'cand_1',
  type: 'judge.reviewed',
  sequence: 7,
  occurredAt: '2026-06-21T12:00:00.000Z',
  actor: 'runtime',
  payload: { ...validJudgeResult },
  schemaVersion: CURRENT_SCHEMA_VERSION,
};

/**
 * CANONICAL_FIXTURES — the table-driven registry pairing each canonical fixture with its schema. The
 * 7 `payload:*` entries pair a high-traffic model fixture with its narrowed payload-map schema
 * (`resolvePayloadSchema(type)`), proving the narrowing accepts the same canonical value as the model.
 */
export const CANONICAL_FIXTURES: ReadonlyArray<{
  name: string;
  schema: z.ZodType;
  value: unknown;
}> = [
  { name: 'RunEventEnvelope', schema: RunEventEnvelope, value: validRunEventEnvelope },
  { name: 'RunConfig', schema: RunConfig, value: validRunConfig },
  { name: 'RunCaps', schema: RunCaps, value: validRunCaps },
  { name: 'Agenome', schema: Agenome, value: validAgenome },
  {
    name: 'CandidateIdea:cross_domain_transfer',
    schema: CandidateIdea,
    value: validCandidateIdeaCrossDomain,
  },
  {
    name: 'CandidateIdea:zeitgeist_synthesis',
    schema: CandidateIdea,
    value: validCandidateIdeaZeitgeist,
  },
  {
    name: 'CrossDomainTransferPayload',
    schema: CrossDomainTransferPayload,
    value: validCrossDomainTransferPayload,
  },
  {
    name: 'ZeitgeistSynthesisPayload',
    schema: ZeitgeistSynthesisPayload,
    value: validZeitgeistSynthesisPayload,
  },
  { name: 'EvidenceRef', schema: EvidenceRef, value: validEvidenceRef },
  { name: 'CriticReview', schema: CriticReview, value: validCriticReview },
  { name: 'criticInput', schema: criticInput, value: validCriticInput },
  { name: 'CheckResult', schema: CheckResult, value: validCheckResult },
  { name: 'CheckRunnerAdapter', schema: CheckRunnerAdapter, value: validCheckRunnerAdapter },
  { name: 'NoveltyScore', schema: NoveltyScore, value: validNoveltyScore },
  { name: 'FitnessScore', schema: FitnessScore, value: validFitnessScore },
  { name: 'ScoringPolicy', schema: ScoringPolicy, value: validScoringPolicy },
  { name: 'EnergyEvent', schema: EnergyEvent, value: validEnergyEvent },
  { name: 'ReproductionEvent', schema: ReproductionEvent, value: validReproductionEvent },
  { name: 'ProviderMeta', schema: ProviderMeta, value: validProviderMeta },
  { name: 'ModelRoute', schema: ModelRoute, value: validModelRoute },
  { name: 'ProviderCapability', schema: ProviderCapability, value: validProviderCapability },
  { name: 'ModelGatewayRequest', schema: ModelGatewayRequest, value: validModelGatewayRequest },
  { name: 'ModelGatewayResponse', schema: ModelGatewayResponse, value: validModelGatewayResponse },
  { name: 'Run', schema: Run, value: validRun },
  { name: 'Generation', schema: Generation, value: validGeneration },
  { name: 'CullingEvent', schema: CullingEvent, value: validCullingEvent },
  {
    name: 'LineageGraphProjection',
    schema: LineageGraphProjection,
    value: validLineageGraphProjection,
  },
  { name: 'LineageNode', schema: LineageNode, value: validLineageNode },
  { name: 'LineageEdge', schema: LineageEdge, value: validLineageEdge },
  { name: 'FinalJudgeRubric', schema: FinalJudgeRubric, value: validFinalJudgeRubric },
  { name: 'JudgeResult', schema: JudgeResult, value: validJudgeResult },
  // the 7 high-traffic payload-map narrowings — same canonical value, narrowed schema.
  {
    name: 'payload:energy.spent',
    schema: resolvePayloadSchema('energy.spent'),
    value: validEnergyEvent,
  },
  {
    name: 'payload:candidate.created',
    schema: resolvePayloadSchema('candidate.created'),
    value: validCandidateIdeaCrossDomain,
  },
  {
    name: 'payload:critic.reviewed',
    schema: resolvePayloadSchema('critic.reviewed'),
    value: validCriticReview,
  },
  {
    name: 'payload:check.completed',
    schema: resolvePayloadSchema('check.completed'),
    value: validCheckResult,
  },
  {
    name: 'payload:novelty.scored',
    schema: resolvePayloadSchema('novelty.scored'),
    value: validNoveltyScore,
  },
  {
    name: 'payload:fitness.scored',
    schema: resolvePayloadSchema('fitness.scored'),
    value: validFitnessScore,
  },
  {
    name: 'payload:judge.reviewed',
    schema: resolvePayloadSchema('judge.reviewed'),
    value: validJudgeResult,
  },
];
