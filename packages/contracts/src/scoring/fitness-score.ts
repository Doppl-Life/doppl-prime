import { z } from "zod";

/**
 * FitnessScore (ARCHITECTURE.md §8, IMPLEMENTATION_PLAN.md P0.8).
 *
 * `components{}` is intentionally typed as a record-of-number so the
 * decomposed signals (critic scores, subtype-check results, novelty,
 * energy efficiency, held-out-judge acceptance) can be carried by name
 * without a closed schema. `policyVersion` ties a score to a specific
 * ScoringPolicy version so selection is explainable from persisted
 * events.
 */
export const FitnessScore = z
  .object({
    id: z.string().min(1),
    candidateId: z.string().min(1),
    total: z.number(),
    components: z.record(z.string(), z.number()),
    policyVersion: z.string().min(1),
    explanation: z.string(),
  })
  .strict();
export type FitnessScore = z.infer<typeof FitnessScore>;
