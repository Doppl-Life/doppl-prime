import { z } from 'zod';

/**
 * NoveltyScore — the authoritative novelty measurement of a candidate (ARCHITECTURE.md §8, Appendix
 * A line 475). Strict 9-field object; `novelty.scored` is the authoritative home for novelty.
 *
 * KEY SAFETY RULE #7 (replay calls no providers): `vector` is the authoritative-ONCE-COMPUTED
 * persisted embedding (a required float array), and its provenance — `embeddingModelId` + `dimension`
 * — is required too. Replay reconstructs novelty by READING the stored vector, never re-embedding
 * (§4/§9). So `vector` is NOT optional; weakening it would break replay determinism.
 *
 * The schema encodes SHAPE only: `vector.length === dimension` is a kernel relationship (lesson §6),
 * not a schema constraint; `method` is an open string (cosine day-one, pgvector later); `score`
 * bounds are a scoring concern.
 */
export const NoveltyScore = z.strictObject({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  vector: z.array(z.number()),
  embeddingModelId: z.string().min(1),
  dimension: z.int().positive(),
  comparisonSet: z.array(z.string().min(1)),
  method: z.string().min(1),
  score: z.number(),
  explanation: z.string().min(1),
});

export type NoveltyScore = z.infer<typeof NoveltyScore>;
