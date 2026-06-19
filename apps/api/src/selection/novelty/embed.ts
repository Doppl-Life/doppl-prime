import type { ModelGatewayResponse } from "@doppl/contracts";
import type { ModelGateway } from "../../model-gateway/gateway.js";

/**
 * Gateway-routed embedding for the Phase 5 novelty scorer (P5.2). Calls
 * the gateway under role=embedding (Phase 2's direct-OpenAI adapter is
 * the configured route). Returns the authoritative vector that's
 * persisted on NoveltyScore — replay reads that vector and never
 * re-embeds.
 *
 * The embedding model id is sourced from the adapter response so the
 * pinned model name (text-embedding-3-large per Phase 5 D1) lives in
 * the gateway route config, not in this file.
 */

export class EmbedError extends Error {
  constructor(reason: string) {
    super(`embed: ${reason}`);
    this.name = "EmbedError";
  }
}

export interface EmbedCandidateInput {
  gateway: ModelGateway;
  text: string;
  runId: string;
  candidateId: string;
  correlationId: string;
  generationId?: string;
  agenomeId?: string;
}

export interface EmbedCandidateResult {
  vector: number[];
  embeddingModelId: string;
  dimension: number;
  response: ModelGatewayResponse;
}

interface EmbeddingRawShape {
  vector?: unknown;
  embeddingModelId?: unknown;
  dimension?: unknown;
}

function parseEmbeddingResponse(raw: unknown): {
  vector: number[];
  embeddingModelId: string;
  dimension: number;
} {
  if (typeof raw !== "object" || raw === null) {
    throw new EmbedError("embedding response is not an object");
  }
  const shape = raw as EmbeddingRawShape;
  if (!Array.isArray(shape.vector) || shape.vector.some((v) => typeof v !== "number")) {
    throw new EmbedError("embedding response.vector missing or non-numeric");
  }
  if (typeof shape.embeddingModelId !== "string" || shape.embeddingModelId.length === 0) {
    throw new EmbedError("embedding response.embeddingModelId missing");
  }
  if (typeof shape.dimension !== "number" || !Number.isInteger(shape.dimension)) {
    throw new EmbedError("embedding response.dimension missing or non-integer");
  }
  if (shape.vector.length !== shape.dimension) {
    throw new EmbedError(
      `embedding response.vector.length (${shape.vector.length}) ≠ dimension (${shape.dimension})`,
    );
  }
  return {
    vector: shape.vector as number[],
    embeddingModelId: shape.embeddingModelId,
    dimension: shape.dimension,
  };
}

export async function embedCandidate(input: EmbedCandidateInput): Promise<EmbedCandidateResult> {
  const response = await input.gateway.invoke({
    role: "embedding",
    runId: input.runId,
    correlationId: input.correlationId,
    candidateId: input.candidateId,
    ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
    ...(input.agenomeId !== undefined ? { agenomeId: input.agenomeId } : {}),
    input: { text: input.text },
  });
  if (!response.ok) {
    throw new EmbedError(`gateway response not ok: ${response.validationError ?? "unknown"}`);
  }
  const parsed = parseEmbeddingResponse(response.output);
  return { ...parsed, response };
}
