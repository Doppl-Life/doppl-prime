import { randomUUID } from "node:crypto";
import type { NoveltyScore } from "@doppl/contracts";
import type { AppendEventInput, AppendEventResult } from "../../event-store/append.js";
import type { ModelGateway } from "../../model-gateway/gateway.js";
import { cosineDistance } from "./cosine.js";
import { EmbedError, embedCandidate } from "./embed.js";

/**
 * `scoreCandidateNovelty` (P5.2) — embeds a candidate, computes app-
 * level cosine distance against the per-generation comparison set, and
 * persists a NoveltyScore in `novelty.scored`. Happy path only; the
 * degrade edge (retry → lexical fallback → novelty_scoring_degraded) is
 * the U2 extension.
 *
 * `comparisonSet` is the seen-order list of (candidateId, vector) pairs
 * the candidate is compared against. Persisting `comparisonSet` on the
 * NoveltyScore makes replay-side cosine deterministic even though
 * floating-point sums depend on iteration order.
 *
 * Score is the mean cosine distance over the comparison set. Higher =
 * more novel. Range `[0, 2]` (cosine distance bounds). An empty
 * comparison set is the first-candidate boundary value: score 0.
 */

export interface ComparisonEntry {
  candidateId: string;
  vector: readonly number[];
}

export interface ScoreNoveltyInput {
  gateway: ModelGateway;
  appendEvent: (input: AppendEventInput) => Promise<AppendEventResult>;
  candidateId: string;
  candidateText: string;
  runId: string;
  correlationId: string;
  generationId?: string;
  agenomeId?: string;
  /** Other candidates already embedded this generation, in seen order. */
  comparison: readonly ComparisonEntry[];
}

export interface ScoreNoveltyOutput {
  noveltyScore: NoveltyScore;
  vector: number[];
  degraded: false;
}

function meanDistance(target: readonly number[], comparison: readonly ComparisonEntry[]): number {
  if (comparison.length === 0) return 0;
  let sum = 0;
  for (const entry of comparison) {
    sum += cosineDistance(target, entry.vector);
  }
  return sum / comparison.length;
}

export async function scoreCandidateNovelty(input: ScoreNoveltyInput): Promise<ScoreNoveltyOutput> {
  let embedded: Awaited<ReturnType<typeof embedCandidate>>;
  try {
    embedded = await embedCandidate({
      gateway: input.gateway,
      text: input.candidateText,
      runId: input.runId,
      candidateId: input.candidateId,
      correlationId: input.correlationId,
      ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
      ...(input.agenomeId !== undefined ? { agenomeId: input.agenomeId } : {}),
    });
  } catch (err) {
    // Re-throw as EmbedError so the U2 caller can branch on it.
    if (err instanceof EmbedError) throw err;
    throw new EmbedError(`embed failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const score = meanDistance(embedded.vector, input.comparison);

  const noveltyScore: NoveltyScore = {
    id: `nov_${randomUUID()}`,
    candidateId: input.candidateId,
    vector: embedded.vector,
    embeddingModelId: embedded.embeddingModelId,
    dimension: embedded.dimension,
    comparisonSet: input.comparison.map((c) => c.candidateId),
    method: "embedding_cosine_mean",
    score,
    explanation: `Mean cosine distance over ${input.comparison.length} comparators using ${embedded.embeddingModelId}`,
  };

  await input.appendEvent({
    runId: input.runId,
    type: "novelty.scored",
    actor: "selection_controller",
    payload: { novelty: noveltyScore },
    correlationId: input.correlationId,
    candidateId: input.candidateId,
    ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
    ...(input.agenomeId !== undefined ? { agenomeId: input.agenomeId } : {}),
    ...(embedded.response.providerTraceId !== undefined
      ? { langfuseTraceId: embedded.response.providerTraceId }
      : {}),
    ...(embedded.response.langfuseObservationId !== undefined
      ? { langfuseObservationId: embedded.response.langfuseObservationId }
      : {}),
  });

  return { noveltyScore, vector: embedded.vector, degraded: false };
}
