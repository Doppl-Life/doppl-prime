import { randomUUID } from "node:crypto";
import type { FitnessScore, NoveltyScore, ScoringPolicy } from "@doppl/contracts";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AppendEventInput, AppendEventResult } from "../../event-store/append.js";
import { criticScoreForCandidate } from "../components/critic-scores.js";
import { energyEfficiencyForAgenome } from "../components/energy-efficiency.js";
import { judgeAcceptanceForCandidate } from "../components/judge-acceptance.js";
import { subtypeCheckScoreForCandidate } from "../components/subtype-checks.js";
import { type FitnessComponents, applyPolicy } from "./policy.js";

/**
 * `scoreFitness` (P5.6) — composes critic + subtype + novelty +
 * judge_acceptance + energy_efficiency into a single FitnessScore.
 * Emits exactly one `fitness.scored` event per candidate. Idempotent
 * under the same policyVersion (re-scoring yields the same total; the
 * id may differ).
 *
 * Novelty is referenced (not duplicated) — the consumer reads the
 * persisted NoveltyScore from `novelty.scored`. Selection treats the
 * critic/check/judge evidence as inputs only; nothing here mutates the
 * evidence or the rotating critic outputs.
 */

const NOVELTY_DISTANCE_MAX = 2; // cosine distance max; D4 maps to [0, 1] via /2

export interface ScoreFitnessInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  appendEvent: (input: AppendEventInput) => Promise<AppendEventResult>;
  runId: string;
  candidateId: string;
  agenomeId: string;
  novelty: NoveltyScore;
  policy: ScoringPolicy;
  correlationId: string;
  generationId?: string;
}

export interface ScoreFitnessOutput {
  fitness: FitnessScore;
  components: FitnessComponents;
}

function normalizeNovelty(score: number): number {
  return Math.min(1, Math.max(0, score / NOVELTY_DISTANCE_MAX));
}

export async function scoreFitness(input: ScoreFitnessInput): Promise<ScoreFitnessOutput> {
  const [critic, subtypeCheck, judgeAcceptance, energyEfficiency] = await Promise.all([
    criticScoreForCandidate({
      db: input.db,
      runId: input.runId,
      candidateId: input.candidateId,
    }),
    subtypeCheckScoreForCandidate({
      db: input.db,
      runId: input.runId,
      candidateId: input.candidateId,
    }),
    judgeAcceptanceForCandidate({
      db: input.db,
      runId: input.runId,
      candidateId: input.candidateId,
    }),
    energyEfficiencyForAgenome({
      db: input.db,
      runId: input.runId,
      agenomeId: input.agenomeId,
    }),
  ]);

  const components: FitnessComponents = {
    critic,
    subtype_check: subtypeCheck,
    novelty: normalizeNovelty(input.novelty.score),
    judge_acceptance: judgeAcceptance,
    energy_efficiency: energyEfficiency,
  };

  const applied = applyPolicy(input.policy, components);

  const fitness: FitnessScore = {
    id: `fit_${randomUUID()}`,
    candidateId: input.candidateId,
    total: applied.total,
    components: applied.componentTotals,
    policyVersion: input.policy.version,
    explanation: applied.explanation,
  };

  await input.appendEvent({
    runId: input.runId,
    type: "fitness.scored",
    actor: "selection_controller",
    payload: { fitness },
    correlationId: input.correlationId,
    candidateId: input.candidateId,
    agenomeId: input.agenomeId,
    ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
  });

  return { fitness, components };
}
