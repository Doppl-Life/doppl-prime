import { describe, expect, test } from 'vitest';
import {
  jaccardSimilarity,
  lexicalNoveltyScore,
} from '../../../../src/selection/novelty/lexical-fallback';

/**
 * Deterministic lexical novelty (P5.3) — the secondary method when embedding fails. Pure over summary
 * text (token-set Jaccard), so the degrade path is replay-faithful (rule #7): replay recomputes the
 * identical estimate from persisted summaries, never calling a provider.
 */
describe('lexical fallback novelty (token-set Jaccard)', () => {
  // 1 — spec(§8): identical token sets → Jaccard 1 → novelty 0.
  test('lexical_identical_summaries_is_0_novelty', () => {
    expect(jaccardSimilarity('alpha beta gamma', 'gamma beta alpha')).toBe(1);
    expect(lexicalNoveltyScore('alpha beta', ['alpha beta'])).toBe(0);
  });

  // 2 — spec(§8): disjoint token sets → Jaccard 0 → novelty 1.
  test('lexical_disjoint_summaries_is_1_novelty', () => {
    expect(jaccardSimilarity('alpha beta', 'gamma delta')).toBe(0);
    expect(lexicalNoveltyScore('alpha beta', ['gamma delta'])).toBe(1);
  });

  // 3 — spec(§8): empty comparison → 1.0 (first-candidate boundary; mirrors cosine).
  test('lexical_empty_comparison_is_1', () => {
    expect(lexicalNoveltyScore('alpha beta', [])).toBe(1);
  });

  // 4 — rule #7: deterministic + order-independent over a fixed comparison set (replay-faithful).
  test('lexical_deterministic_order_independent', () => {
    const summary = 'alpha beta gamma';
    const set = ['alpha delta', 'beta gamma epsilon', 'zeta eta'];
    const reversed = [...set].reverse();
    expect(lexicalNoveltyScore(summary, set)).toBe(lexicalNoveltyScore(summary, reversed));
  });
});
