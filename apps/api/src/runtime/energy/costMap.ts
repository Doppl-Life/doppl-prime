import { z } from 'zod';

/**
 * P3.5 — the `doppl_energy` cost map (ARCHITECTURE.md §4). One integer unit; the cost values
 * (`tokensPerUnit:1000, perToolCall:5, perSpawn:50`) are CONFIG-DRIVEN (tunable) — passed in, never
 * hard-coded in the logic. PURE: the loop (P3.10) emits `energy.spent`; this only computes the debit.
 *
 * `CostMapConfigSchema` is the single source (LESSON 5): `CostMapConfig` derives from it via `z.infer`,
 * and the boot-config loader (P3.1, `loadConfig`) validates the merged `defaults < file` cost-map
 * through it into the deep-frozen `AppConfig.costMap` (kernel-027, P3.10a). `DEFAULT_COST_MAP` is the
 * canonical §4 `defaults` layer.
 */
export const CostMapConfigSchema = z.strictObject({
  /** Tokens per 1 `doppl_energy` — the llm divisor (POSITIVE int; 0 illegal). */
  tokensPerUnit: z.int().positive(),
  /** Flat `doppl_energy` per tool call (nonnegative int; a free tool is conceivable). */
  perToolCall: z.int().nonnegative(),
  /** Flat `doppl_energy` per spawn (nonnegative int). */
  perSpawn: z.int().nonnegative(),
});
export type CostMapConfig = z.infer<typeof CostMapConfigSchema>;

/** The §4 canonical defaults (the `defaults` layer of the boot-config merge — single source). */
export const DEFAULT_COST_MAP: CostMapConfig = {
  tokensPerUnit: 1000,
  perToolCall: 5,
  perSpawn: 50,
};

/**
 * llm cost = `ceil(tokens / tokensPerUnit)`. CEIL (a partial unit costs 1) is conservative — it never
 * UNDER-debits, so the cap enforcer fails closed correctly. Integer `doppl_energy`.
 */
export function energyForLlm(tokens: number, config: CostMapConfig): number {
  return Math.ceil(tokens / config.tokensPerUnit);
}

/** Flat tool-call cost (no token variance). */
export function energyForTool(config: CostMapConfig): number {
  return config.perToolCall;
}

/** Flat spawn cost (no token variance). */
export function energyForSpawn(config: CostMapConfig): number {
  return config.perSpawn;
}
