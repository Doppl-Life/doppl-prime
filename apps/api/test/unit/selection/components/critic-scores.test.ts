import { describe, expect, test } from 'vitest';
import { CANONICAL_FIXTURES, CriticReview } from '@doppl/contracts';
import { criticScores } from '../../../../src/selection/components/critic-scores';

/** A valid CriticReview with the given scores + confidence (text/mandate are aggregation-irrelevant). */
function review(
  scores: Record<string, number>,
  confidence: number,
  overrides: Partial<CriticReview> = {},
): CriticReview {
  return {
    id: `rev_${confidence}_${Object.keys(scores).join('-')}`,
    candidateId: 'cand_1',
    mandate: 'factual_grounding',
    scores,
    critique: 'some critique text',
    confidence,
    evidenceRefs: [],
    ...overrides,
  };
}

/**
 * Critic-council fitness component (P5.5 critic half, §7/§8). Pure read-only aggregation of a
 * candidate's CriticReview set into one named component value — evidence-only (rule #6), never reads
 * critique/candidate text (rule #5), deterministic + replay-reconstructable from persisted events.
 */
describe('criticScores — rotating critic-council fitness component', () => {
  // 1 — spec(§8): value == confidence-weighted mean of per-review means for a known 2-review set.
  test('critic_scores_aggregates_per_formula', () => {
    // r1 mean=3 conf=1; r2 mean=5 conf=0.5 → (1*3 + 0.5*5)/(1+0.5) = 5.5/1.5.
    const { value } = criticScores([review({ a: 2, b: 4 }, 1), review({ a: 5, b: 5 }, 0.5)]);
    expect(value).toBeCloseTo(5.5 / 1.5, 12);
  });

  // 2 — spec(§8): a single review's contribution is the mean of its scores-record values.
  test('critic_scores_per_review_mean_of_scores', () => {
    const { value } = criticScores([review({ grounding: 4, citations: 3 }, 1)]);
    expect(value).toBeCloseTo(3.5, 12);
  });

  // 3 — spec(§7): a higher-confidence review pulls the value toward its mean more than a lower one.
  test('critic_scores_confidence_weighted', () => {
    // low confidence on the high-score review → value near the low-score review's mean (2).
    const lowWeightHigh = criticScores([review({ s: 2 }, 1), review({ s: 10 }, 0.01)]).value;
    // equal confidence → plain mean of means (6).
    const equal = criticScores([review({ s: 2 }, 1), review({ s: 10 }, 1)]).value;
    expect(lowWeightHigh).toBeLessThan(equal);
    expect(lowWeightHigh).toBeLessThan(3);
  });

  // 4 — rule #5/#6: identical numeric scores+confidence but different critique text → identical value.
  test('critic_scores_independent_of_critique_text', () => {
    const a = criticScores([review({ s: 4 }, 0.9, { critique: 'AAA grounded well' })]);
    const b = criticScores([review({ s: 4 }, 0.9, { critique: 'ZZZ totally different prose' })]);
    expect(a.value).toBe(b.value);
  });

  // 5 — P5.5 boundary: empty set → defined value + reviewCount 0 + contributingReviewCount 0 +
  // absence flagged (not a silent 0).
  test('critic_scores_empty_set_defined_boundary', () => {
    const result = criticScores([]);
    expect(Number.isNaN(result.value)).toBe(false);
    expect(result.value).toBe(0);
    expect(result.reviewCount).toBe(0);
    expect(result.contributingReviewCount).toBe(0);
    expect(result.explanation).toMatch(/no critic review/i);
  });

  // 6 — degenerate-denominator boundary: all confidence 0 → defined value (plain mean), no NaN/div0.
  test('critic_scores_all_zero_confidence_no_nan', () => {
    const result = criticScores([review({ s: 2 }, 0), review({ s: 4 }, 0)]);
    expect(Number.isNaN(result.value)).toBe(false);
    // plain mean of per-review means = (2+4)/2 = 3 (information not discarded).
    expect(result.value).toBeCloseTo(3, 12);
  });

  // 7 — Q4 boundary: a review with empty scores {} is EXCLUDED from the value but counted + noted.
  test('critic_scores_empty_scores_record_deterministic', () => {
    // r1 contributes (mean 4, conf 1); r2 has empty scores → excluded from value, still counted.
    const result = criticScores([review({ s: 4 }, 1), review({}, 1)]);
    expect(result.value).toBeCloseTo(4, 12);
    expect(result.reviewCount).toBe(2);
    expect(result.contributingReviewCount).toBe(1);
    expect(result.explanation).toMatch(/no numeric scores|excluded/i);
  });

  // 8 — §8: reviewCount equals the input length (lets P5.6 tell "0 reviews" from "reviews averaging 0").
  test('critic_scores_reviewCount_reported', () => {
    expect(criticScores([review({ s: 1 }, 1), review({ s: 2 }, 1)]).reviewCount).toBe(2);
    expect(criticScores([]).reviewCount).toBe(0);
  });

  // 9 — §8 explainability: explanation enumerates each review's mandate + per-review mean + confidence.
  test('critic_scores_explanation_enumerates_mandate_and_contribution', () => {
    const { explanation } = criticScores([
      review({ grounding: 4 }, 0.8, { mandate: 'feasibility' }),
    ]);
    expect(explanation).toContain('feasibility');
    expect(explanation).toContain('4');
    expect(explanation).toContain('0.8');
  });

  // 10 — replay-reconstructable: permuting the review set yields the identical value (commutative).
  test('critic_scores_deterministic_order_independent', () => {
    const set = [review({ s: 2 }, 1), review({ s: 5 }, 0.5), review({ s: 8 }, 0.3)];
    const reversed = [...set].reverse();
    expect(criticScores(set).value).toBe(criticScores(reversed).value);
  });

  // 11 — purity: criticScores does not mutate the input array or any review object.
  test('critic_scores_does_not_mutate_input', () => {
    const set = [review({ s: 2 }, 1), review({ s: 5 }, 0.5)];
    const snapshot = structuredClone(set);
    criticScores(set);
    expect(set).toEqual(snapshot);
  });

  // 12 — §2.5 frozen-seam conformance: the canonical CriticReview fixture parses + aggregates.
  test('critic_scores_reviews_validate_against_CriticReview', () => {
    const fixture = CANONICAL_FIXTURES.find((f) => f.name === 'CriticReview');
    expect(fixture).toBeDefined();
    const parsed = CriticReview.parse(fixture!.value);
    const result = criticScores([parsed]);
    expect(result.reviewCount).toBe(1);
    expect(Number.isNaN(result.value)).toBe(false);
  });

  // 13 — disambiguation: reviews present but ALL with empty scores → absence (contributingReviewCount 0),
  // NOT "averaged 0" — P5.6 keys absence off contributingReviewCount===0, not value. (case (c) ≠ case (b))
  test('critic_scores_all_empty_scores_is_absence_not_zero', () => {
    const result = criticScores([review({}, 1), review({}, 0.5)]);
    expect(result.reviewCount).toBe(2);
    expect(result.contributingReviewCount).toBe(0);
    expect(result.value).toBe(0);
    expect(Number.isNaN(result.value)).toBe(false);
    expect(result.explanation).toMatch(/no numeric scores/i);
  });
});
