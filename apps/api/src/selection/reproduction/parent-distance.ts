import type { Agenome } from '@doppl/contracts';
import { cosineSimilarity } from '../novelty/cosine';
import { createRng } from './rng';

/**
 * parentDistance + selectDistantPair (P5.9, ARCHITECTURE.md §8) — the distant-lineage anti-collapse
 * force.
 *
 * Distance over the PERSISTED novelty embedding vectors (`1 − cosineSimilarity`, reusing P5.2
 * `cosine.ts`) — pure, never re-embeds (KEY SAFETY RULE #7: replay reuses the persisted vectors). A
 * parent with NO novelty vector (degraded-novelty path) yields a defined MAX distance (1.0) — neither
 * artificially preferred nor a crash — never `NaN`/throw. Fusion prefers the most distant eligible pair
 * (anti-collapse), equal-distance ties broken deterministically by `createRng(seed)`.
 */
export interface FusionParent {
  agenome: Agenome;
  /** The candidate's persisted novelty vector (undefined if novelty degraded — see the boundary). */
  noveltyVector?: readonly number[];
}

export function parentDistance(
  a: readonly number[] | undefined,
  b: readonly number[] | undefined,
): number {
  if (a === undefined || b === undefined) {
    return 1; // defined max distance — a missing vector can't be measured, never NaN.
  }
  return 1 - cosineSimilarity(a, b);
}

/**
 * selectDistantPair — the most distant eligible pair from the pool. Iterates pairs in a canonical
 * (index) order; a strictly-greater distance wins, an equal distance is broken by a seeded coin so the
 * choice is deterministic + replay-reproducible. Requires ≥2 parents (the reproduction orchestrator
 * guarantees this; <2 is P5.10's degenerate path).
 */
export function selectDistantPair(
  parents: readonly FusionParent[],
  seed: number,
): [FusionParent, FusionParent] {
  if (parents.length < 2) {
    throw new Error('selectDistantPair requires at least 2 parents');
  }
  const rng = createRng(seed);
  let best: [FusionParent, FusionParent] = [parents[0]!, parents[1]!];
  let bestDistance = -Infinity;
  for (let i = 0; i < parents.length; i += 1) {
    for (let j = i + 1; j < parents.length; j += 1) {
      const a = parents[i]!;
      const b = parents[j]!;
      const distance = parentDistance(a.noveltyVector, b.noveltyVector);
      if (distance > bestDistance || (distance === bestDistance && rng.nextFloat() < 0.5)) {
        bestDistance = distance;
        best = [a, b];
      }
    }
  }
  return best;
}
