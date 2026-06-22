import { z } from 'zod';
import type { ModelGateway } from '../../model-gateway';

/**
 * embed — the SOLE gateway-touching novelty function (P5.2, ARCHITECTURE.md §8/§9).
 *
 * Routes a candidate summary through the ModelGateway `embedding` role (port-only — no provider SDK,
 * KEY SAFETY RULE #9 / forbidden-pattern #2) and returns the authoritative-once-computed vector +
 * provenance. The cosine/score math (`cosine.ts`) is pure over this persisted vector, so replay reads
 * it back and never re-embeds (rule #7). Retry / lexical fallback / `novelty_scoring_degraded` is NOT
 * here — `embed` surfaces a DEFINED failure that the P5.3 degrade path wraps.
 */

/**
 * The embedding role's structured-output shape. NOT an Appendix-A contract — it is the gateway's
 * structured output for the `embedding` role — so selection defines it locally and passes it as the
 * request `schema`, then parses `response.output` with it (LESSONS §23 consumer discipline). Frozen
 * `ModelGatewayResponse.output` is `z.unknown()`, so this `safeParse` is the narrowing boundary.
 */
const EmbeddingResponseSchema = z.object({
  vector: z.array(z.number()),
  embeddingModelId: z.string().min(1),
  dimension: z.number().int().positive(),
});

export type EmbedResult =
  | { ok: true; vector: number[]; embeddingModelId: string; dimension: number }
  | { ok: false; reason: 'embedding_response_rejected' | 'embedding_response_malformed' };

export interface EmbedDeps {
  gateway: ModelGateway;
}

export async function embed(summary: string, deps: EmbedDeps): Promise<EmbedResult> {
  const response = await deps.gateway.call({
    role: 'embedding',
    prompt: summary,
    schema: EmbeddingResponseSchema,
  });

  if (!response.accepted) {
    // Defined failure — NOT a silent zero vector, NOT a secret-leaking throw. P5.3 wraps this.
    return { ok: false, reason: 'embedding_response_rejected' };
  }

  const parsed = EmbeddingResponseSchema.safeParse(response.output);
  if (!parsed.success) {
    // Structural narrowing failure (`output` is `z.unknown()`). Unreachable via the P2.9 stub;
    // exercised by the real P2.6 embedding adapter.
    return { ok: false, reason: 'embedding_response_malformed' };
  }

  // `dimension = vector.length` is authoritative — the vector IS the embedding, its length IS the
  // dimension (no separate gateway-reported-dimension equality guard).
  return {
    ok: true,
    vector: parsed.data.vector,
    embeddingModelId: parsed.data.embeddingModelId,
    dimension: parsed.data.vector.length,
  };
}
