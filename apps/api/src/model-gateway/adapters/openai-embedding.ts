import type { ModelGatewayRequest, ModelRoute } from "@doppl/contracts";
import OpenAI from "openai";
import { GatewayConfigError } from "../errors.js";
import type { Adapter, AdapterResult } from "../gateway.js";

/**
 * Direct-OpenAI embedding adapter (P2.6). Per ARCHITECTURE.md §9
 * embeddings are pinned to direct OpenAI behind the gateway seam — the
 * "OpenRouter-only" fallback path still needs an OpenAI key for
 * embeddings, or the app-level-cosine path that needs no embeddings at
 * all.
 *
 * The adapter does NOT compute novelty (that's Phase 5 selection). It
 * just returns an authoritative vector — the kernel persists it into
 * `novelty.scored` so replay reads the stored vector without re-embedding.
 */

interface OpenAILike {
  embeddings: {
    create: (params: { model: string; input: string | string[] }) => Promise<{
      data: { embedding: number[]; index: number }[];
      model: string;
      usage?: { total_tokens?: number };
    }>;
  };
}

export interface OpenAIEmbeddingAdapterOptions {
  env: { OPENAI_API_KEY?: string | undefined };
  openaiFactory?: (opts: { apiKey: string }) => OpenAILike;
}

function inputToTexts(input: unknown): { texts: string[]; isBatch: boolean } {
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.text === "string") {
      return { texts: [obj.text], isBatch: false };
    }
    if (Array.isArray(obj.texts) && obj.texts.every((t) => typeof t === "string")) {
      return { texts: obj.texts as string[], isBatch: true };
    }
  }
  throw new GatewayConfigError(
    "OpenAI embedding adapter: request.input must be { text: string } or { texts: string[] }",
  );
}

export function createOpenAIEmbeddingAdapter(options: OpenAIEmbeddingAdapterOptions): Adapter {
  const apiKey = options.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new GatewayConfigError(
      "OpenAI embedding adapter: OPENAI_API_KEY is not set (required for the openai-embedding provider)",
    );
  }
  const factory =
    options.openaiFactory ??
    (((opts) => new OpenAI({ apiKey: opts.apiKey })) as (opts: {
      apiKey: string;
    }) => OpenAILike);
  const client = factory({ apiKey });

  return {
    async invoke(route: ModelRoute, request: ModelGatewayRequest): Promise<AdapterResult> {
      const { texts, isBatch } = inputToTexts(request.input);
      const response = await client.embeddings.create({
        model: route.modelId,
        input: isBatch ? texts : (texts[0] ?? ""),
      });
      const sorted = [...response.data].sort((a, b) => a.index - b.index);
      const vectors = sorted.map((d) => d.embedding);
      const firstVector = vectors[0] ?? [];
      const dimension = firstVector.length;
      const totalTokens = response.usage?.total_tokens ?? 0;
      const energy = Math.max(1, Math.ceil(totalTokens / 1000));
      const rawOutput = isBatch
        ? { vectors, embeddingModelId: route.modelId, dimension }
        : { vector: firstVector, embeddingModelId: route.modelId, dimension };
      return {
        rawOutput,
        energyEstimate: energy,
        energyActual: energy,
      };
    },
  };
}
