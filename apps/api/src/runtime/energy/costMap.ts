/**
 * P3.5 — the `doppl_energy` cost map (ARCHITECTURE.md §4). One integer unit; the cost values
 * (`tokensPerUnit:1000, perToolCall:5, perSpawn:50`) are CONFIG-DRIVEN (tunable) — passed in, never
 * hard-coded in the logic. PURE: the loop (P3.10) emits `energy.spent`; this only computes the debit.
 *
 * `AppConfig` (P3.1) does not yet carry an energy cost-map section — `DEFAULT_COST_MAP` is the canonical
 * §4 default here; wiring it into `AppConfig` (so it's operator-tunable) is a P3.1/P3.10 follow-up.
 */

export interface CostMapConfig {
  /** Tokens per 1 `doppl_energy` (the llm divisor). */
  readonly tokensPerUnit: number;
  /** Flat `doppl_energy` per tool call. */
  readonly perToolCall: number;
  /** Flat `doppl_energy` per spawn. */
  readonly perSpawn: number;
}

/** The §4 canonical defaults. */
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
