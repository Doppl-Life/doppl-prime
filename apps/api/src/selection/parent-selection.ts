import type { SeededRng } from "../runtime/rng.js";
import type { CullableCandidate } from "./cull.js";

/**
 * Parent selection (P5.7, D5). Top-K by multiplicative
 * `fitness × novelty × energy_efficiency`. Ties resolved deterministically:
 *   1. lexicographic on `(fitness.total, normalizedNovelty, candidateId)`
 *   2. final tie-break via `rng.choose`
 *
 * The seeded RNG is the per-run master so replay reproduces the same
 * top-K parent set without re-sampling.
 *
 * `K = max(2, floor(maxPopulation / 2))` is the default budget when the
 * caller doesn't pass `k` — matches §8's "half the population becomes
 * parents" heuristic.
 */

export interface RankableCandidate extends CullableCandidate {
  noveltyScore: number;
  energyEfficiency: number;
}

export interface SelectParentsInput {
  candidates: readonly RankableCandidate[];
  k: number;
  rng: SeededRng;
}

interface RankedEntry {
  candidate: RankableCandidate;
  weight: number;
}

const NOVELTY_DISTANCE_MAX = 2;

function normalizedNovelty(score: number): number {
  return Math.min(1, Math.max(0, score / NOVELTY_DISTANCE_MAX));
}

export function selectParents(input: SelectParentsInput): RankableCandidate[] {
  if (input.k <= 0 || input.candidates.length === 0) return [];

  const entries: RankedEntry[] = input.candidates.map((c) => {
    const novNorm = normalizedNovelty(c.noveltyScore);
    return {
      candidate: c,
      weight: c.fitness.total * novNorm * c.energyEfficiency,
    };
  });

  // Stable lexicographic sort: weight (desc), fitness.total (desc),
  // normalizedNovelty (desc), candidateId (asc). RNG tiebreak only
  // when ALL of those agree.
  entries.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    if (b.candidate.fitness.total !== a.candidate.fitness.total) {
      return b.candidate.fitness.total - a.candidate.fitness.total;
    }
    const aNov = normalizedNovelty(a.candidate.noveltyScore);
    const bNov = normalizedNovelty(b.candidate.noveltyScore);
    if (bNov !== aNov) return bNov - aNov;
    return a.candidate.candidateId.localeCompare(b.candidate.candidateId);
  });

  // If selecting the boundary between the k-th and (k+1)-th positions
  // splits a true tie (same weight + fitness + novelty + … and even
  // candidateId would need to differ, which is impossible — but allow
  // for caller-supplied dup ids in tests), use rng.choose to pick.
  const top: RankableCandidate[] = [];
  let i = 0;
  while (top.length < input.k && i < entries.length) {
    const remaining = input.k - top.length;
    const cur = entries[i];
    if (!cur) break;
    // Collect run of equal-weight entries starting at i
    let j = i;
    while (j < entries.length) {
      const next = entries[j];
      if (!next) break;
      if (
        next.weight === cur.weight &&
        next.candidate.fitness.total === cur.candidate.fitness.total &&
        normalizedNovelty(next.candidate.noveltyScore) ===
          normalizedNovelty(cur.candidate.noveltyScore) &&
        next.candidate.candidateId === cur.candidate.candidateId
      ) {
        j += 1;
      } else break;
    }
    const runLen = j - i;
    if (runLen <= remaining) {
      for (let k = i; k < j; k += 1) {
        const entry = entries[k];
        if (entry) top.push(entry.candidate);
      }
      i = j;
    } else {
      // Need to pick `remaining` from a run of `runLen` ties.
      const pool = entries.slice(i, j).map((e) => e.candidate);
      while (top.length < input.k && pool.length > 0) {
        const picked = input.rng.choose(pool);
        top.push(picked);
        const idx = pool.indexOf(picked);
        if (idx >= 0) pool.splice(idx, 1);
      }
      break;
    }
  }
  return top;
}
