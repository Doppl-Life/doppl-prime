/**
 * Consolidated field-name-set snapshot harness (ARCHITECTURE.md §2.5/§16 — P0.14). The cross-track
 * regression gate: a pure field-name extractor + the frozen field-set per §2.5 shared model. A
 * consolidated test asserts each live model's field-set === its frozen snapshot here, so any
 * added/removed/renamed field on any shared contract is caught BEFORE the parallel tracks fork.
 *
 * Shipped from `src/` (not test-only) so a downstream track's contract tests can reuse the extractor.
 * Pure data + one pure function — no schema imports (so it can never form an import cycle with the
 * barrel). The per-slice `*-field-sets.test.ts` files remain as-is; this is the single shared gate.
 */

/**
 * objectFieldNames — the SORTED own field-name set of a Zod object / strictObject schema's `.shape`.
 * Zod v4 preserves `.shape` through a `.superRefine` (so CheckResult / ModelGateway{Request,Response}
 * work directly). For a discriminated union, pass a variant (`schema.options[i]`).
 */
export function objectFieldNames(schema: { shape: Record<string, unknown> }): string[] {
  return Object.keys(schema.shape).sort();
}

/**
 * FIELD_SET_SNAPSHOTS — the frozen field-name set per §2.5 shared object model (CandidateIdea = the
 * shared top-level set of both discriminated variants). Editing a model's fields without updating its
 * entry here fails the consolidated snapshot test — the mechanical cross-track regression gate.
 */
export const FIELD_SET_SNAPSHOTS: Record<string, readonly string[]> = {
  RunEventEnvelope: [
    'id',
    'runId',
    'generationId',
    'agenomeId',
    'candidateId',
    'type',
    'sequence',
    'occurredAt',
    'actor',
    'correlationId',
    'langfuseTraceId',
    'langfuseObservationId',
    'payload',
    'schemaVersion',
  ],
  RunConfig: [
    'seed',
    'enabledSubtypes',
    'caps',
    'modelProfile',
    'scoringPolicyVersion',
    'rngSeed',
    // frontend-v2 FB.0 (sv5→6) — 3 additive OPTIONAL run-control fields (generation inputs, rule-#6-safe).
    'generationOperators',
    'generationBias',
    'modelRouteOverride',
  ],
  RunCaps: [
    'maxPopulation',
    'maxGenerations',
    'energyBudget',
    'maxSpawnDepth',
    'maxToolCalls',
    'wallClockTimeoutMs',
  ],
  Agenome: [
    'id',
    'runId',
    'generationId',
    'parentIds',
    'systemPrompt',
    'personaWeights',
    'toolPermissions',
    'decompositionPolicy',
    'spawnBudget',
    'mutationMeta',
    'status',
  ],
  CandidateIdea: [
    'id',
    'runId',
    'generationId',
    'agenomeId',
    'subtype',
    'title',
    'summary',
    'claims',
    'evidenceRefs',
    'status',
    'subtypePayload',
  ],
  CrossDomainTransferPayload: [
    'sourceDomain',
    'sourceTechnique',
    'targetDomain',
    'targetProblem',
    'transferMapping',
    'expectedMechanism',
    'executableCheckIdea',
  ],
  ZeitgeistSynthesisPayload: [
    'thesis',
    'audience',
    'currentSignals',
    'whyNow',
    'falsifiablePredictions',
    'comparablePriorArt',
  ],
  EvidenceRef: ['kind', 'eventId', 'uri', 'label', 'langfuseObservationId'],
  CriticReview: [
    'id',
    'candidateId',
    'mandate',
    'scores',
    'critique',
    'confidence',
    'evidenceRefs',
  ],
  criticInput: ['rubric', 'candidate'],
  CheckResult: [
    'id',
    'candidateId',
    'checkType',
    'status',
    'score',
    'output',
    'skipReason',
    'evidenceRefs',
    'error',
  ],
  CheckRunnerAdapter: ['id', 'checkType', 'subtype', 'label'],
  NoveltyScore: [
    'id',
    'candidateId',
    'vector',
    'embeddingModelId',
    'dimension',
    'comparisonSet',
    'method',
    'score',
    'explanation',
  ],
  FitnessScore: ['id', 'candidateId', 'total', 'components', 'policyVersion', 'explanation'],
  ScoringPolicy: ['version', 'weights', 'normalization'],
  EnergyEvent: [
    'id',
    'runId',
    'generationId',
    'agenomeId',
    'eventType',
    'estimate',
    'actual',
    'unit',
    'reason',
    'providerMeta',
  ],
  ReproductionEvent: [
    'id',
    'runId',
    'parentAgenomeIds',
    'childAgenomeId',
    'mode',
    'crossoverPoints',
    'mutationSummary',
  ],
  ProviderMeta: [
    'provider',
    'modelId',
    'gatewayRequestId',
    'tokensIn',
    'tokensOut',
    'costEstimate',
  ],
  ModelRoute: ['role', 'provider', 'modelId', 'capability', 'fallbackRouteIds'],
  ProviderCapability: ['structuredOutputs', 'embeddings', 'toolCalling', 'streaming'],
  // frontend-v2 FB.4 (sv7→8): +samplingParams{temperature?} — the generation dial's executed sampling.
  ModelGatewayRequest: ['role', 'prompt', 'messages', 'schema', 'maxTokens', 'samplingParams'],
  ModelGatewayResponse: [
    'accepted',
    'output',
    'validationResult',
    'providerMeta',
    'langfuseTraceId',
    'rejection',
  ],
  Run: ['id', 'seed', 'enabledSubtypes', 'caps', 'status', 'startedAt', 'completedAt'],
  Generation: ['id', 'runId', 'index', 'status', 'startedAt', 'completedAt'],
  CullingEvent: ['id', 'runId', 'generationId', 'targetIds', 'reason', 'scoreSnapshot'],
  LineageGraphProjection: ['runId', 'nodes', 'edges', 'sequenceThrough'],
  LineageNode: ['id', 'type', 'label', 'status', 'metrics', 'dataRef'],
  LineageEdge: ['id', 'source', 'target', 'type', 'label'],
  FinalJudgeRubric: ['axes', 'weights', 'policyVersion', 'immutableToAgents'],
  JudgeResult: [
    'id',
    'candidateId',
    'axisScores',
    'acceptance',
    'rubricPolicyVersion',
    'providerMeta',
    'langfuseTraceId',
    'axisRationales',
  ],
  // frontend-v2 FB.6 — deep-telemetry capture of a successful generation LLM call (high-traffic model);
  // FB.4 (sv7→8) added samplingParams (the executed dial temperature).
  LlmCallTelemetry: [
    'id',
    'runId',
    'generationId',
    'agenomeId',
    'role',
    'rawResponse',
    'rawReasoning',
    'providerMeta',
    'truncated',
    'samplingParams',
  ],
};
