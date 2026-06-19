import { z } from "zod";

/**
 * ReproductionEvent (ARCHITECTURE.md §3/§8, IMPLEMENTATION_PLAN.md P0.9).
 *
 * `mode: "mutation_only"` exists for the degenerate <2-parent fallback
 * documented in §3 (when fewer than 2 eligible parents are available,
 * the runtime emits a single-parent mutation_only reproduction).
 */

export const ReproductionModeValues = [
  "fusion",
  "crossover",
  "output_synthesis",
  "mutation_only",
] as const;

export const ReproductionMode = z.enum(ReproductionModeValues);
export type ReproductionMode = z.infer<typeof ReproductionMode>;

export const ReproductionEvent = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    parentAgenomeIds: z.array(z.string().min(1)),
    childAgenomeId: z.string().min(1),
    mode: ReproductionMode,
    crossoverPoints: z.array(z.string()),
    mutationSummary: z.string(),
  })
  .strict();
export type ReproductionEvent = z.infer<typeof ReproductionEvent>;
