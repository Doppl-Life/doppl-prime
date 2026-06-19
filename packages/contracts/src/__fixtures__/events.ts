/**
 * Canonical per-RunEventType payload fixtures — the cross-track CANON.
 *
 * When the kernel writes an `agenome.fused` event, its payload must
 * match the fixture shape here. These fixtures are the §2.5 freeze-
 * verification reference: every fixture must parse successfully through
 * its matching RunEventPayloadMap entry, and every fixture's redacted
 * form must still parse (the redaction round-trip property).
 *
 * Fixtures cite typed schemas to stay aligned with field-set changes:
 * any rename in an Appendix-A model surfaces here as a compile error.
 */

import type { z } from "zod";
import type { RunEventType } from "../events/event-type.js";
import type { RunEventPayloadMap } from "../events/payloads/per-type-map.js";
import type { RunConfig } from "../run/run-config.js";

type Fixtures = {
  [T in z.infer<typeof RunEventType>]: z.input<(typeof RunEventPayloadMap)[T]>;
};

const validConfig: z.input<typeof RunConfig> = {
  seed: "operator-seed-prompt",
  enabledSubtypes: ["cross_domain_transfer", "zeitgeist_synthesis"],
  caps: {
    maxPopulation: 8,
    maxGenerations: 5,
    energyBudget: 10_000,
    maxSpawnDepth: 3,
    maxToolCalls: 50,
    wallClockTimeoutMs: 600_000,
  },
  modelProfile: "default",
  scoringPolicyVersion: "v1",
  rngSeed: "deterministic-seed-1",
};

const seedAgenome = {
  id: "ag_1",
  runId: "run_1",
  generationId: "gen_0",
  parentIds: [],
  systemPrompt: "you are an agent",
  personaWeights: { boldness: 0.5 },
  toolPermissions: [],
  decompositionPolicy: "default",
  spawnBudget: 3,
  status: "seeded" as const,
};

const xdomainCandidate = {
  id: "cand_1",
  runId: "run_1",
  generationId: "gen_1",
  agenomeId: "ag_1",
  title: "Transfer selection pressure to MoE routing",
  summary: "Apply biological diversity-preserving sampling to expert routing",
  claims: ["increases robustness", "reduces collapse"],
  evidenceRefs: [{ kind: "trace" as const, eventId: "evt_5" }],
  status: "created" as const,
  subtype: "cross_domain_transfer" as const,
  subtypePayload: {
    sourceDomain: "biology",
    sourceTechnique: "diversity-preserving selection",
    targetDomain: "ML",
    targetProblem: "MoE routing collapse",
    transferMapping: "selection pressure -> expert load balance",
    expectedMechanism: "preserve gradient diversity across experts",
  },
};

const criticReview = {
  id: "rev_1",
  candidateId: "cand_1",
  mandate: "factual_grounding" as const,
  scores: { accuracy: 0.8 },
  critique: "evidence partial",
  confidence: 0.7,
  evidenceRefs: [],
};

const checkResult = {
  id: "ck_1",
  candidateId: "cand_1",
  checkType: "novelty_prior_art",
  status: "passed" as const,
  score: 0.85,
  evidenceRefs: [],
};

const noveltyScore = {
  id: "nv_1",
  candidateId: "cand_1",
  vector: [0.1, 0.2, 0.3],
  embeddingModelId: "text-embedding-3-small",
  dimension: 3,
  comparisonSet: ["cand_2"],
  method: "app-cosine",
  score: 0.42,
  explanation: "moderate",
};

const fitnessScore = {
  id: "ft_1",
  candidateId: "cand_1",
  total: 0.71,
  components: { novelty: 0.42, critic: 0.8, judge: 0.7 },
  policyVersion: "v1",
  explanation: "evidence-supported",
};

const cullingEvent = {
  id: "cull_1",
  runId: "run_1",
  generationId: "gen_1",
  targetIds: ["ag_5"],
  reason: "weak fitness vs cohort",
  scoreSnapshot: { ag_5: 0.09 },
};

const energyEvent = {
  id: "en_1",
  runId: "run_1",
  generationId: "gen_1",
  agenomeId: "ag_1",
  eventType: "llm" as const,
  estimate: 100,
  actual: 98,
  unit: "doppl_energy" as const,
  reason: "critic call",
};

const reproductionEvent = {
  id: "rp_1",
  runId: "run_1",
  parentAgenomeIds: ["ag_1", "ag_2"],
  childAgenomeId: "ag_3",
  mode: "fusion" as const,
  crossoverPoints: ["systemPrompt"],
  mutationSummary: "blended persona",
};

export const eventFixtures: Fixtures = {
  "run.configured": { config: validConfig },
  "run.started": { startedAt: "2026-06-19T12:00:00.000Z" },
  "run.completed": {
    completedAt: "2026-06-19T13:00:00.000Z",
    terminalSummary: "8 candidates evaluated, winner cand_1",
  },
  "run.failed": {
    completedAt: "2026-06-19T13:00:00.000Z",
    reason: "wall-clock timeout",
  },
  "run.stopped": {
    completedAt: "2026-06-19T13:00:00.000Z",
    reason: "operator kill switch",
  },
  "generation.started": { index: 0 },
  "generation.completed": {
    completedAt: "2026-06-19T12:30:00.000Z",
    candidateCount: 8,
  },
  "agenome.spawned": { agenome: seedAgenome },
  "agenome.fused": { reproduction: reproductionEvent },
  "agenome.mutated": {
    reproduction: { ...reproductionEvent, mode: "mutation_only" as const },
  },
  "agenome.reproduced": { reproduction: reproductionEvent },
  "candidate.created": { candidate: xdomainCandidate },
  "critic.reviewed": { review: criticReview },
  "check.completed": { result: checkResult },
  "novelty.scored": { novelty: noveltyScore },
  "fitness.scored": { fitness: fitnessScore },
  "lineage.culled": { culling: cullingEvent },
  "energy.spent": { energy: energyEvent },
  provider_call_failed: {
    reason: "OpenRouter 5xx",
    routeId: "openrouter:gpt-4o",
    retryable: true,
  },
  output_schema_rejected: {
    reason: "candidate failed schema validation after one repair attempt",
    validationError: "missing field 'claims'",
    role: "population_generator",
  },
  candidate_invalidated: { candidateId: "cand_1", reason: "duplicate of cand_2" },
  energy_exhausted: { reason: "budget consumed", spent: 10_000, budget: 10_000 },
  generation_failed: { reason: "all candidates rejected", failedState: "verifying" },
  reproduction_aborted_insufficient_parents: {
    reason: "only 1 eligible_parent in gen_1",
    parentCount: 1,
  },
  novelty_scoring_degraded: {
    reason: "embedding provider 5xx after retry",
    fallbackMethod: "lexical-overlap",
  },
};
