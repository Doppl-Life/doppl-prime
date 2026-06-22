/**
 * allocate (P5.11, ARCHITECTURE.md §8/§5) — heuristic spawn allocation for the successor generation.
 *
 * Each parent's heuristic weight = `fitness.total × novelty × energy-efficiency` (MVP — learned
 * bandit/RL and a learned value model are explicitly OUT of scope). The weights are normalized to the
 * remaining population headroom and turned into INTEGER spawn slots via the largest-remainder method
 * (floor each proportional share, distribute the leftover to the largest fractional remainders,
 * deterministic tie-break by canonical agenome id).
 *
 * KEY SAFETY RULE #1: the allocation is a HINT — `Σ spawns ≤ remainingPopulation`, and it NEVER raises a
 * cap. The kernel is the authoritative enforcer (it re-clamps to `min(remaining caps)`); a heuristic that
 * would request more headroom than exists is normalized into it, never beyond. Pure + deterministic; a
 * degenerate all-zero-weight (or empty) pool → 0 spawns (no NaN/divide-by-zero/negative — a zero-fitness
 * population does not spawn a full next generation).
 */
export interface AllocationParent {
  agenomeId: string;
  /** The parent's best-candidate FitnessScore.total. */
  fitness: number;
  /** The consumed persisted novelty value (never re-embedded — rule #7). */
  novelty: number;
  /** The P5.4 energy-efficiency component value. */
  energyEfficiency: number;
}

export type Allocation = Array<{ agenomeId: string; spawns: number }>;

export function allocate(
  parents: readonly AllocationParent[],
  remainingPopulation: number,
): Allocation {
  const budget = Math.max(0, Math.floor(remainingPopulation));
  const weights = parents.map((p) => ({
    agenomeId: p.agenomeId,
    weight: Math.max(0, p.fitness * p.novelty * p.energyEfficiency),
  }));
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);

  // Degenerate boundary — no basis to allocate (empty pool / all-zero weights / no headroom).
  if (parents.length === 0 || totalWeight === 0 || budget === 0) {
    return parents.map((p) => ({ agenomeId: p.agenomeId, spawns: 0 }));
  }

  // Largest-remainder: floor the proportional shares, then hand the leftover to the largest remainders.
  const slots = weights.map((w) => {
    const share = (w.weight / totalWeight) * budget;
    const floor = Math.floor(share);
    return { agenomeId: w.agenomeId, spawns: floor, remainder: share - floor };
  });
  const allocated = slots.reduce((sum, s) => sum + s.spawns, 0);
  const leftover = budget - allocated; // in [0, parents.length)

  const order = [...slots].sort((a, b) =>
    b.remainder !== a.remainder
      ? b.remainder - a.remainder
      : a.agenomeId < b.agenomeId
        ? -1
        : a.agenomeId > b.agenomeId
          ? 1
          : 0,
  );
  for (let i = 0; i < leftover; i += 1) {
    order[i]!.spawns += 1;
  }

  // Return in input order.
  return parents.map((p) => ({
    agenomeId: p.agenomeId,
    spawns: slots.find((s) => s.agenomeId === p.agenomeId)!.spawns,
  }));
}
