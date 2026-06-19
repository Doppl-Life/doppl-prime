import { z } from "zod";

/**
 * ScoringPolicy — STRUCTURE is frozen here; numeric weight VALUES are
 * the only deferred-open contract values per ARCHITECTURE.md §8. Phase 5
 * (P5.1) freezes the concrete weights when fitness scoring lands.
 */
export const ScoringPolicy = z
  .object({
    version: z.string().min(1),
    weights: z.record(z.string(), z.number()),
    normalization: z.string().optional(),
  })
  .strict();
export type ScoringPolicy = z.infer<typeof ScoringPolicy>;
