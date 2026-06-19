/**
 * Heuristic allocation helpers (P5.11). MVP allocation is multiplicative
 * `fitness × novelty × energy_efficiency` — Phase 5 ships the
 * normalization + budget-clamping primitives; the actual ranking is
 * done by `selectParents` (U6), and the reproduction split by
 * `reproduceWithFallback` (U9).
 *
 * This file exists primarily for:
 *  - `allocateSuccessorBudget`: largest-remainder integer distribution
 *    of a total budget over per-parent allocation weights. Used when a
 *    future iteration wants to give the strongest parent more children
 *    than the next-strongest — the MVP successor assembler uses a
 *    uniform 2/3 fusion + 1/3 mutation split (D6) instead.
 *  - `clampBudget`: guarantee the successor budget never exceeds
 *    `maxPopulation` (P5.11 invariant — allocation never raises a cap).
 */

export function clampBudget(rawBudget: number, maxPopulation: number): number {
  if (!Number.isFinite(rawBudget)) return 0;
  if (rawBudget <= 0) return 0;
  return Math.min(Math.floor(rawBudget), Math.max(0, Math.floor(maxPopulation)));
}

export function normalizeWeights(weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    if (weights.length === 0) return [];
    return weights.map(() => 1 / weights.length);
  }
  return weights.map((w) => w / sum);
}

/**
 * Largest-remainder allocation: distribute `budget` integers across
 * the items proportional to `weights`. Sum of returned ints equals
 * `budget` exactly. Ties resolved by stable original order.
 */
export function allocateSuccessorBudget(weights: readonly number[], budget: number): number[] {
  if (weights.length === 0 || budget <= 0) return weights.map(() => 0);
  const normalized = normalizeWeights(weights);
  const exact = normalized.map((p) => p * budget);
  const floors = exact.map((x) => Math.floor(x));
  const remainders = exact.map((x, i) => ({ remainder: x - (floors[i] ?? 0), index: i }));
  let allocated = floors.reduce((a, b) => a + b, 0);
  // Sort by remainder desc (stable on index asc).
  remainders.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const result = [...floors];
  let i = 0;
  while (allocated < budget && i < remainders.length) {
    const slot = remainders[i];
    if (slot) {
      result[slot.index] = (result[slot.index] ?? 0) + 1;
      allocated += 1;
    }
    i += 1;
  }
  return result;
}
