import { z } from "zod";

/**
 * NoveltyScore (ARCHITECTURE.md §8, IMPLEMENTATION_PLAN.md P0.8).
 *
 * `vector` is the persisted authoritative-once-computed embedding, paired
 * with `embeddingModelId` and `dimension` so replay reads the stored
 * vector and never re-embeds (§4 / §9). Runtime invariant
 * vector.length === dimension is documented here and enforced in
 * Phase 5 by the scoring code (not at schema level — keeps the schema
 * cheap).
 */
export const NoveltyScore = z
  .object({
    id: z.string().min(1),
    candidateId: z.string().min(1),
    vector: z.array(z.number()),
    embeddingModelId: z.string().min(1),
    dimension: z.number().int().positive(),
    comparisonSet: z.array(z.string()),
    method: z.string().min(1),
    score: z.number(),
    explanation: z.string(),
  })
  .strict();
export type NoveltyScore = z.infer<typeof NoveltyScore>;
