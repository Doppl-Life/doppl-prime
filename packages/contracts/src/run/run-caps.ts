import { z } from "zod";

/**
 * RunCaps — the closed set of hard limits that every run is configured
 * against. Every cap is enforced fail-closed by the runtime kernel; the
 * schema rejects non-positive or non-integer values at boot so an invalid
 * config never reaches the runtime (ARCHITECTURE.md §4/§5/§15, REQ-NF-001).
 *
 * `energyBudget` is in doppl_energy — the same unit EnergyEvent uses.
 */
export const RunCaps = z
  .object({
    maxPopulation: z.number().int().positive(),
    maxGenerations: z.number().int().positive(),
    energyBudget: z.number().int().positive(),
    maxSpawnDepth: z.number().int().positive(),
    maxToolCalls: z.number().int().positive(),
    wallClockTimeoutMs: z.number().int().positive(),
  })
  .strict();
export type RunCaps = z.infer<typeof RunCaps>;
