import { z } from "zod";

/**
 * CullingEvent (DOMAIN_MODEL.md §120, ARCHITECTURE.md §3,
 * IMPLEMENTATION_PLAN.md P0.15). Models the explainable selection-side
 * lineage removal that a `lineage.culled` event carries.
 */
export const CullingEvent = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    generationId: z.string().min(1),
    targetIds: z.array(z.string().min(1)).min(1),
    reason: z.string().min(1),
    scoreSnapshot: z.record(z.string(), z.number()),
  })
  .strict();
export type CullingEvent = z.infer<typeof CullingEvent>;
