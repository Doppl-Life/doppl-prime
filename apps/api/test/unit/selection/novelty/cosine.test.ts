import { describe, expect, test } from 'vitest';
import {
  cosineSimilarity,
  noveltyFromSimilarities,
  noveltyScoreOf,
} from '../../../../src/selection/novelty/cosine';

/**
 * Pure cosine + novelty math (P5.2). Deterministic over persisted vectors so replay recomputes the
 * score without re-embedding (KEY SAFETY RULE #7). spec(§8) novelty = nearest-neighbour distance.
 */
describe('cosine + novelty math (pure, replay-faithful)', () => {
  // 1 — spec(§8): cosine similarity of identical vectors is 1.
  test('cosine_identical_is_1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 12);
  });

  // 2 — spec(§8): orthogonal vectors have cosine similarity 0.
  test('cosine_orthogonal_is_0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  // 3 — spec(§8): a zero-norm vector yields a defined similarity 0, never NaN (replay-faithful boundary).
  test('cosine_zero_vector_is_0_not_nan', () => {
    const s = cosineSimilarity([0, 0, 0], [1, 2, 3]);
    expect(Number.isNaN(s)).toBe(false);
    expect(s).toBe(0);
  });

  // 4 — spec(§8): unequal-length vectors reject (one run shares one embedding model → one dimension).
  test('cosine_dimension_mismatch_rejects', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });

  // 5 — spec(§8): novelty score = 1 − max similarity over the comparison set (anti-collapse distance).
  test('novelty_is_one_minus_max_similarity', () => {
    // v identical to one neighbour (sim 1), orthogonal to the other (sim 0) → 1 − max(1,0) = 0.
    expect(
      noveltyScoreOf(
        [1, 0],
        [
          [1, 0],
          [0, 1],
        ],
      ),
    ).toBe(0);
    // explicit similarities: 1 − max(0.2, 0.7, 0.5) = 0.3.
    expect(noveltyFromSimilarities([0.2, 0.7, 0.5])).toBeCloseTo(0.3, 12);
  });

  // 6 — spec(§8): an empty comparison set → score 1.0 (first candidate is maximally novel; no fabricated neighbour).
  test('novelty_empty_comparison_is_1', () => {
    expect(noveltyScoreOf([1, 2, 3], [])).toBe(1);
    expect(noveltyFromSimilarities([])).toBe(1);
  });

  // 7 — spec(§8): the score is identical under any permutation of a fixed comparison set.
  test('novelty_order_independent', () => {
    const v = [0.3, 0.4, 0.5];
    const set = [
      [1, 0, 0],
      [0, 1, 0],
      [0.3, 0.4, 0.5],
    ];
    const reversed = [...set].reverse();
    expect(noveltyScoreOf(v, set)).toBe(noveltyScoreOf(v, reversed));
  });
});
