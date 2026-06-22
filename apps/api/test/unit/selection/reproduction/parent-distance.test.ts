import { describe, expect, test } from 'vitest';
import {
  parentDistance,
  selectDistantPair,
} from '../../../../src/selection/reproduction/parent-distance';
import type { FusionParent } from '../../../../src/selection/reproduction/parent-distance';
import { validAgenome } from '@doppl/contracts';
import type { Agenome } from '@doppl/contracts';

function parent(agenomeId: string, vector: readonly number[] | undefined): FusionParent {
  const agenome: Agenome = { ...validAgenome, id: agenomeId };
  // Omit noveltyVector entirely when absent (exactOptionalPropertyTypes forbids `: undefined`).
  return vector === undefined ? { agenome } : { agenome, noveltyVector: vector };
}

/**
 * parentDistance + selectDistantPair (P5.9, §8) — distant-lineage anti-collapse. Distance = 1 − cosine
 * over the PERSISTED novelty vectors (reuse P5.2 cosine.ts); pure, never re-embeds (rule #7). A
 * missing vector (degraded novelty) → a defined max-distance boundary, never NaN/throw.
 */
describe('parentDistance + selectDistantPair — distant-lineage preference', () => {
  // 1 — spec(§8): distance = 1 − cosine; identical vectors → 0, orthogonal → 1.
  test('distance_is_one_minus_cosine', () => {
    expect(parentDistance([1, 2, 3], [1, 2, 3])).toBeCloseTo(0, 12);
    expect(parentDistance([1, 0], [0, 1])).toBeCloseTo(1, 12);
  });

  // 2 — spec(§8): from a pool the MOST distant pair is selected (anti-collapse force).
  test('distant_pair_selected', () => {
    // near = [1,0,0,..]≈[1,0.01,..]; far = orthogonal. The far pair (near, far) is most distant.
    const pool = [
      parent('p_a', [1, 0, 0, 0, 0, 0, 0, 0]),
      parent('p_b', [1, 0.01, 0, 0, 0, 0, 0, 0]), // very close to p_a
      parent('p_c', [0, 0, 0, 0, 0, 0, 0, 1]), // orthogonal to both
    ];
    const [x, y] = selectDistantPair(pool, 1);
    const ids = [x.agenome.id, y.agenome.id].sort();
    expect(ids).toContain('p_c'); // the orthogonal one must be in the most-distant pair
  });

  // 3 — degraded-novelty robustness (Q1): a parent with NO novelty vector → defined max distance 1.0,
  // never NaN/throw.
  test('distance_missing_vector_boundary', () => {
    const d = parentDistance(undefined, [1, 2, 3]);
    expect(Number.isNaN(d)).toBe(false);
    expect(d).toBe(1);
    expect(parentDistance(undefined, undefined)).toBe(1);
  });

  // 4 — rule #7: parentDistance is pure over the vectors — there is no gateway/embed in its signature.
  test('distance_no_gateway_pure', () => {
    // structural: parentDistance takes only vectors; calling it twice is identical + side-effect-free.
    expect(parentDistance([0.3, 0.4], [0.3, 0.4])).toBe(parentDistance([0.3, 0.4], [0.3, 0.4]));
  });
});
