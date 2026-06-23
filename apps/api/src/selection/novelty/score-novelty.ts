import { randomUUID } from "node:crypto";
import type { NoveltyScore } from "@doppl/contracts";
import type { AppendEventInput, AppendEventResult } from "../../event-store/append.js";
import type { ModelGateway } from "../../model-gateway/gateway.js";
import { cosineDistance } from "./cosine.js";
import { EmbedError, embedCandidate } from "./embed.js";
import { charNGramSet, jaccardDistance } from "./lexical-fallback.js";

/**
 * `scoreCandidateNovelty` (P5.2 + P5.3) — embeds a candidate, computes
 * app-level cosine distance against the per-generation comparison set,
 * and persists a NoveltyScore in `novelty.scored`. On embedding failure
 * after a bounded retry, falls back to character-3-gram Jaccard
 * distance and emits exactly one `novelty_scoring_degraded` event for
 * the affected candidate. Never blocks the scoring state.
 *
 * `comparisonSet` is the seen-order list of (candidateId, vector, text)
 * triples the candidate is compared against. Embedded comparators
 * supply vector; lexical fallback uses text. Replay reads the persisted
 * score directly — no recomputation needed.
 */

export interface ComparisonEntry {
  candidateId: string;
  vector: readonly number[];
  text: string;
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
  /** Override embed retries (default 1). Setting 0 means no retry. */
  retryMax?: number;
}

export type ScoreNoveltyOutput =
  | { noveltyScore: NoveltyScore; vector: number[]; degraded: false }
  | { noveltyScore: NoveltyScore; vector: number[]; degraded: true; reason: string };

function meanCosineDistance(
  target: readonly number[],
  comparison: readonly ComparisonEntry[],
): number {
  // Skip comparators whose dimension doesn't match the target. The
  // lexical-fallback path below emits a placeholder vector of [0]
  // (dimension 1) when embedding fails; that entry would crash
  // cosine with "dimension mismatch" the moment the next candidate
  // succeeds with a real 1536-dim embedding. Filtering here keeps
  // novelty scoring resilient to any mixed-dim comparison set.
  const sameDim = comparison.filter((c) => c.vector.length === target.length);
  if (sameDim.length === 0) return 0;
  let sum = 0;
  for (const entry of sameDim) {
    sum += cosineDistance(target, entry.vector);
  }
  return sum / sameDim.length;
}

function meanJaccardDistance(target: string, comparison: readonly ComparisonEntry[]): number {
  if (comparison.length === 0) return 0;
  const targetSet = charNGramSet(target);
  let sum = 0;
  for (const entry of comparison) {
    sum += jaccardDistance(targetSet, charNGramSet(entry.text));
  }
  return sum / comparison.length;
}

async function tryEmbedWithRetry(
  input: ScoreNoveltyInput,
  retryMax: number,
): Promise<Awaited<ReturnType<typeof embedCandidate>>> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= retryMax) {
    try {
      return await embedCandidate({
        gateway: input.gateway,
        text: input.candidateText,
        runId: input.runId,
        candidateId: input.candidateId,
        correlationId:
          attempt === 0 ? input.correlationId : `${input.correlationId}_retry_${attempt}`,
        ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
        ...(input.agenomeId !== undefined ? { agenomeId: input.agenomeId } : {}),
      });
    } catch (err) {
      lastErr = err;
      attempt += 1;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new EmbedError(`unknown embed failure: ${String(lastErr)}`);
}

const LEXICAL_MODEL_ID = "lexical_char3gram_jaccard";
const RETRY_MAX_DEFAULT = Number(process.env.DOPPL_NOVELTY_RETRY_MAX ?? "1");

export async function scoreCandidateNovelty(input: ScoreNoveltyInput): Promise<ScoreNoveltyOutput> {
  const retryMax = input.retryMax ?? RETRY_MAX_DEFAULT;

  let embedded: Awaited<ReturnType<typeof embedCandidate>> | null = null;
  let degradeReason: string | null = null;

  try {
    embedded = await tryEmbedWithRetry(input, retryMax);
  } catch (err) {
    degradeReason =
      err instanceof Error
        ? `embed_failed_after_retry:${err.message}`
        : "embed_failed_after_retry:unknown";
  }

  let noveltyScore: NoveltyScore;
  let vector: number[];

  if (embedded) {
    // OpenAI text embeddings cluster same-topic candidates tightly —
    // observed mean cosine distance for a typical evolutionary run
    // lands in [0, 0.5], not the theoretical [0, 2] cosine range.
    // Scale by 2 and clamp so a "very different" candidate (~0.5
    // raw mean) registers as ~1.0 novelty instead of being squashed
    // into the dim band. Without this, novelty contributes almost
    // nothing to fitness because the realistic signal is squeezed
    // into the bottom 25% of its nominal range.
    const rawMean = meanCosineDistance(embedded.vector, input.comparison);
    const score = Math.min(1, rawMean * 2);
    noveltyScore = {
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
    vector = embedded.vector;
  } else {
    // Degrade path. Emit novelty_scoring_degraded once, then compute
    // lexical Jaccard. NoveltyScore.vector is a placeholder [0] under
    // dimension 1 — the lexical method does not produce a numeric
    // embedding. Replay reads `score` directly.
    await input.appendEvent({
      runId: input.runId,
      type: "novelty_scoring_degraded",
      actor: "selection_controller",
      payload: {
        reason: degradeReason ?? "embed_failed",
        fallbackMethod: LEXICAL_MODEL_ID,
      },
      correlationId: input.correlationId,
      candidateId: input.candidateId,
      ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
      ...(input.agenomeId !== undefined ? { agenomeId: input.agenomeId } : {}),
    });
    const score = meanJaccardDistance(input.candidateText, input.comparison);
    noveltyScore = {
      id: `nov_${randomUUID()}`,
      candidateId: input.candidateId,
      vector: [0],
      embeddingModelId: LEXICAL_MODEL_ID,
      dimension: 1,
      comparisonSet: input.comparison.map((c) => c.candidateId),
      method: LEXICAL_MODEL_ID,
      score,
      explanation: `Lexical fallback (char 3-gram Jaccard); ${input.comparison.length} comparators`,
    };
    vector = [0];
  }

  await input.appendEvent({
    runId: input.runId,
    type: "novelty.scored",
    actor: "selection_controller",
    payload: { novelty: noveltyScore },
    correlationId: input.correlationId,
    candidateId: input.candidateId,
    ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
    ...(input.agenomeId !== undefined ? { agenomeId: input.agenomeId } : {}),
    ...(embedded?.response.providerTraceId !== undefined
      ? { langfuseTraceId: embedded.response.providerTraceId }
      : {}),
    ...(embedded?.response.langfuseObservationId !== undefined
      ? { langfuseObservationId: embedded.response.langfuseObservationId }
      : {}),
  });

  if (embedded) {
    return { noveltyScore, vector, degraded: false };
  }
  return {
    noveltyScore,
    vector,
    degraded: true,
    reason: degradeReason ?? "embed_failed",
  };
}
