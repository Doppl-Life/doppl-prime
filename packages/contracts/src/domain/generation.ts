import { z } from "zod";

/**
 * Generation (DOMAIN_MODEL.md §163-171, ARCHITECTURE.md §3,
 * IMPLEMENTATION_PLAN.md P0.15). State machine includes `degraded` for
 * the partial-failure edge documented in ARCHITECTURE.md §3 (running →
 * degraded → verifying when ≥1 candidate reached `created`).
 */

export const GenerationStatusValues = [
  "pending",
  "running",
  "degraded",
  "verifying",
  "scoring",
  "reproducing",
  "completed",
  "failed",
  "skipped",
] as const;

export const GenerationStatus = z.enum(GenerationStatusValues);
export type GenerationStatus = z.infer<typeof GenerationStatus>;

export const Generation = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    index: z.number().int().nonnegative(),
    status: GenerationStatus,
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
  })
  .strict();
export type Generation = z.infer<typeof Generation>;
