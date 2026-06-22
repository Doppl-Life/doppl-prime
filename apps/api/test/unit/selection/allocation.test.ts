import { describe, expect, test } from 'vitest';
import { allocate } from '../../../src/selection/allocation';
import type { AllocationParent } from '../../../src/selection/allocation';

function parent(
  agenomeId: string,
  fitness: number,
  novelty: number,
  energyEfficiency: number,
): AllocationParent {
  return { agenomeId, fitness, novelty, energyEfficiency };
}

function total(allocation: ReturnType<typeof allocate>): number {
  return allocation.reduce((sum, a) => sum + a.spawns, 0);
}

function spawnsOf(allocation: ReturnType<typeof allocate>, id: string): number {
  return allocation.find((a) => a.agenomeId === id)?.spawns ?? 0;
}

/**
 * allocate (P5.11, §8/§5) — heuristic spawn allocation. weight = fitness × novelty × energy-efficiency;
 * largest-remainder integer slots normalized to the remaining population headroom. Σ ≤ remaining (rule
 * #1 — allocation is a HINT, never raises a cap). Pure; degenerate all-zero → 0.
 */
describe('allocate — heuristic + caps-clamp', () => {
  // 1 — spec(§8): a higher-weight (fitness×novelty×energy) parent gets ≥ a lower-weight parent.
  test('allocate_heuristic_weight', () => {
    const allocation = allocate([parent('high', 0.9, 0.9, 0.9), parent('low', 0.1, 0.1, 0.1)], 10);
    expect(spawnsOf(allocation, 'high')).toBeGreaterThanOrEqual(spawnsOf(allocation, 'low'));
  });

  // 2 — KEY SAFETY RULE #1: Σ allocation never exceeds the remaining population headroom.
  test('allocate_clamped_to_remaining_caps', () => {
    const allocation = allocate(
      [parent('a', 0.8, 0.8, 0.8), parent('b', 0.6, 0.6, 0.6), parent('c', 0.4, 0.4, 0.4)],
      5,
    );
    expect(total(allocation)).toBeLessThanOrEqual(5);
  });

  // 3 — KEY SAFETY RULE #1 boundary: pathologically large weights still yield Σ ≤ remaining.
  test('allocate_never_exceeds_cap_even_with_huge_weights', () => {
    const allocation = allocate([parent('a', 1e9, 1e9, 1e9), parent('b', 1e9, 1e9, 1e9)], 3);
    expect(total(allocation)).toBeLessThanOrEqual(3);
  });

  // 4 — degenerate boundary: every weight 0 (or empty pool) → all 0, no NaN/divide-by-zero/negative.
  test('allocate_all_zero_weights_boundary', () => {
    const zero = allocate([parent('a', 0, 0.5, 0.5), parent('b', 0.5, 0, 0.5)], 10);
    expect(total(zero)).toBe(0);
    for (const a of zero) {
      expect(Number.isNaN(a.spawns)).toBe(false);
      expect(a.spawns).toBeGreaterThanOrEqual(0);
    }
    expect(allocate([], 10)).toEqual([]);
  });

  // 5 — replay (§8 derivable): same (parents, remaining) → identical allocation.
  test('allocate_deterministic', () => {
    const parents = [
      parent('a', 0.7, 0.3, 0.9),
      parent('b', 0.2, 0.8, 0.5),
      parent('c', 0.6, 0.6, 0.6),
    ];
    expect(allocate(parents, 7)).toEqual(allocate(parents, 7));
  });

  // 6 — purity: allocate does not mutate its inputs.
  test('allocate_does_not_mutate_inputs', () => {
    const parents = [parent('a', 0.7, 0.3, 0.9), parent('b', 0.2, 0.8, 0.5)];
    const snapshot = structuredClone(parents);
    allocate(parents, 5);
    expect(parents).toEqual(snapshot);
  });
});
