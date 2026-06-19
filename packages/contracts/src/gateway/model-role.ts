import { z } from "zod";

/**
 * ModelRole — the closed 6-member union of roles the model gateway can
 * route to. Per ARCHITECTURE.md §9, every gateway request names exactly
 * one role; the registry resolves role -> ModelRoute.
 */
export const ModelRoleValues = [
  "population_generator",
  "critic",
  "subtype_check",
  "embedding",
  "final_judge",
  "fusion_synthesis",
] as const;

export const ModelRole = z.enum(ModelRoleValues);
export type ModelRole = z.infer<typeof ModelRole>;
