import { z } from "zod";

/**
 * Agenome — an agent's heritable trait bundle, persisted as a node in the
 * lineage graph (ARCHITECTURE.md §3, IMPLEMENTATION_PLAN.md P0.4).
 *
 * `parentIds` length is NOT schema-enforced (0 for gen-0 seeds, usually 2
 * for fusion offspring); runtime clamps the count. `spawnBudget` is a hint
 * integer; runtime also clamps. `personaWeights` is conservatively typed
 * as a record-of-number — ARCHITECTURE.md §3 does not pin specific keys.
 */

export const AgenomeStatusValues = [
  "seeded",
  "active",
  "spent",
  "eligible_parent",
  "failed",
  "reproduced",
  "culled",
] as const;

export const AgenomeStatus = z.enum(AgenomeStatusValues);
export type AgenomeStatus = z.infer<typeof AgenomeStatus>;

export const Agenome = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    generationId: z.string().min(1),
    parentIds: z.array(z.string().min(1)),
    systemPrompt: z.string(),
    personaWeights: z.record(z.string(), z.number()),
    toolPermissions: z.array(z.string()),
    decompositionPolicy: z.string(),
    spawnBudget: z.number().int().nonnegative(),
    mutationMeta: z.record(z.string(), z.unknown()).optional(),
    status: AgenomeStatus,
  })
  .strict();
export type Agenome = z.infer<typeof Agenome>;
