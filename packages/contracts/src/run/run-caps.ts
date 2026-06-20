import { z } from 'zod';

/**
 * RunCaps — the bounded cap set (ARCHITECTURE.md §4/§5, Appendix A). The P3 runtime kernel ENFORCES
 * these caps (key safety rule #1 — caps are kernel-enforced, never prompt-enforced); this slice
 * freezes the SCHEMA only. Each cap is a positive integer; `energyBudget` is in the `doppl_energy`
 * unit (the same unit `EnergyEvent` uses, §4).
 */
export const RunCaps = z.strictObject({
  maxPopulation: z.int().positive(),
  maxGenerations: z.int().positive(),
  energyBudget: z.int().positive(),
  maxSpawnDepth: z.int().positive(),
  maxToolCalls: z.int().positive(),
  wallClockTimeoutMs: z.int().positive(),
});

export type RunCaps = z.infer<typeof RunCaps>;
