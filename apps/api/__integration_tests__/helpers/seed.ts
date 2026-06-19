import type { RunEventEnvelope } from "@doppl/contracts";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { type AppendEventInput, appendEvent } from "../../src/event-store/append.js";

/**
 * Small in-process projection fold useful for state-equivalence tests.
 * Aggregates over the event stream without inspecting payload schemas,
 * so it can be applied to either the live append path or a replayed
 * stream without diverging on payload-detail handling.
 */
export interface RunEndProjection {
  runId: string;
  totalEvents: number;
  finalSequence: number;
  byType: Record<string, number>;
  byActor: Record<string, number>;
  eventTypes: string[];
}

function emptyProjection(runId: string): RunEndProjection {
  return {
    runId,
    totalEvents: 0,
    finalSequence: -1,
    byType: {},
    byActor: {},
    eventTypes: [],
  };
}

export function foldIntoProjection(projection: RunEndProjection, env: RunEventEnvelope): void {
  projection.totalEvents += 1;
  projection.finalSequence = env.sequence;
  projection.byType[env.type] = (projection.byType[env.type] ?? 0) + 1;
  projection.byActor[env.actor] = (projection.byActor[env.actor] ?? 0) + 1;
  projection.eventTypes.push(env.type);
}

const validRunConfig = {
  seed: "operator-seed",
  enabledSubtypes: ["cross_domain_transfer"],
  caps: {
    maxPopulation: 4,
    maxGenerations: 3,
    energyBudget: 1_000,
    maxSpawnDepth: 2,
    maxToolCalls: 10,
    wallClockTimeoutMs: 60_000,
  },
  modelProfile: "default",
  scoringPolicyVersion: "v1",
  rngSeed: "rng-1",
};

const fixtureAgenome = {
  id: "ag_seed",
  runId: "PLACEHOLDER",
  generationId: "gen_0",
  parentIds: [],
  systemPrompt: "you are an agent",
  personaWeights: {},
  toolPermissions: [],
  decompositionPolicy: "default",
  spawnBudget: 2,
  status: "seeded" as const,
};

const fixtureCandidate = {
  id: "cand_1",
  runId: "PLACEHOLDER",
  generationId: "gen_0",
  agenomeId: "ag_seed",
  subtype: "cross_domain_transfer" as const,
  title: "t",
  summary: "s",
  claims: [],
  evidenceRefs: [],
  status: "created" as const,
  subtypePayload: {
    sourceDomain: "a",
    sourceTechnique: "b",
    targetDomain: "c",
    targetProblem: "d",
    transferMapping: "e",
    expectedMechanism: "f",
  },
};

const fixtureReview = {
  id: "rev_1",
  candidateId: "cand_1",
  mandate: "factual_grounding" as const,
  scores: { accuracy: 0.8 },
  critique: "ok",
  confidence: 0.7,
  evidenceRefs: [],
};

const fixtureCheck = {
  id: "ck_1",
  candidateId: "cand_1",
  checkType: "novelty_prior_art",
  status: "passed" as const,
  score: 0.85,
  evidenceRefs: [],
};

const fixtureNovelty = {
  id: "nv_1",
  candidateId: "cand_1",
  vector: [0.1, 0.2, 0.3],
  embeddingModelId: "text-embedding-3-small",
  dimension: 3,
  comparisonSet: [],
  method: "app-cosine",
  score: 0.42,
  explanation: "moderate",
};

const fixtureFitness = {
  id: "ft_1",
  candidateId: "cand_1",
  total: 0.7,
  components: { novelty: 0.42, critic: 0.8 },
  policyVersion: "v1",
  explanation: "evidence",
};

const fixtureCulling = {
  id: "cull_1",
  runId: "PLACEHOLDER",
  generationId: "gen_0",
  targetIds: ["ag_other"],
  reason: "low fitness",
  scoreSnapshot: { ag_other: 0.05 },
};

const fixtureEnergy = {
  id: "en_1",
  runId: "PLACEHOLDER",
  generationId: "gen_0",
  agenomeId: "ag_seed",
  eventType: "llm" as const,
  estimate: 10,
  actual: 9,
  unit: "doppl_energy" as const,
  reason: "critic",
};

/**
 * Builds a representative ~10-event run via the real `appendEvent` path
 * while computing an in-memory `RunEndProjection` so the test can compare
 * "captured during write" against "rebuilt from replay".
 */
export async function buildSampleRun(
  db: NodePgDatabase,
  runId: string,
  variants: { includeSecretInPayload?: boolean; includeFailureEvent?: boolean } = {},
): Promise<RunEndProjection> {
  const projection = emptyProjection(runId);

  const sequence: Array<{ input: AppendEventInput; type: string; actor: string }> = [
    {
      input: {
        runId,
        type: "run.configured",
        actor: "operator",
        payload: { config: validRunConfig },
      },
      type: "run.configured",
      actor: "operator",
    },
    {
      input: {
        runId,
        type: "run.started",
        actor: "runtime",
        payload: { startedAt: "2026-06-19T12:00:00.000Z" },
      },
      type: "run.started",
      actor: "runtime",
    },
    {
      input: {
        runId,
        type: "generation.started",
        actor: "runtime",
        payload: { index: 0 },
      },
      type: "generation.started",
      actor: "runtime",
    },
    {
      input: {
        runId,
        type: "agenome.spawned",
        actor: "runtime",
        payload: { agenome: { ...fixtureAgenome, runId } },
      },
      type: "agenome.spawned",
      actor: "runtime",
    },
    {
      input: {
        runId,
        type: "candidate.created",
        actor: "agenome",
        payload: { candidate: { ...fixtureCandidate, runId } },
      },
      type: "candidate.created",
      actor: "agenome",
    },
    {
      input: {
        runId,
        type: "critic.reviewed",
        actor: "critic",
        payload: { review: fixtureReview },
      },
      type: "critic.reviewed",
      actor: "critic",
    },
    {
      input: {
        runId,
        type: "check.completed",
        actor: "check_runner",
        payload: { result: fixtureCheck },
      },
      type: "check.completed",
      actor: "check_runner",
    },
    {
      input: {
        runId,
        type: "novelty.scored",
        actor: "selection_controller",
        payload: { novelty: fixtureNovelty },
      },
      type: "novelty.scored",
      actor: "selection_controller",
    },
    {
      input: {
        runId,
        type: "fitness.scored",
        actor: "selection_controller",
        payload: { fitness: fixtureFitness },
      },
      type: "fitness.scored",
      actor: "selection_controller",
    },
    {
      input: {
        runId,
        type: "lineage.culled",
        actor: "selection_controller",
        payload: { culling: { ...fixtureCulling, runId } },
      },
      type: "lineage.culled",
      actor: "selection_controller",
    },
    {
      input: {
        runId,
        type: "energy.spent",
        actor: "runtime",
        payload: {
          energy: {
            ...fixtureEnergy,
            runId,
            reason: variants.includeSecretInPayload
              ? "tool call with token=secret_should_be_redacted_xxxxxxxxxx"
              : "tool call",
          },
        },
      },
      type: "energy.spent",
      actor: "runtime",
    },
  ];

  if (variants.includeFailureEvent) {
    sequence.push({
      input: {
        runId,
        type: "provider_call_failed",
        actor: "runtime",
        payload: { reason: "openrouter 5xx", retryable: true },
      },
      type: "provider_call_failed",
      actor: "runtime",
    });
  }

  for (const step of sequence) {
    const result = await appendEvent(db, step.input);
    // Mirror the projection fold using the writer's confirmed sequence.
    projection.totalEvents += 1;
    projection.finalSequence = result.sequence;
    projection.byType[step.type] = (projection.byType[step.type] ?? 0) + 1;
    projection.byActor[step.actor] = (projection.byActor[step.actor] ?? 0) + 1;
    projection.eventTypes.push(step.type);
  }

  return projection;
}
