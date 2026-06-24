import type { CriticReview } from '@doppl/contracts';

/**
 * Rotating critic-council fitness component (P5.5 critic half, ARCHITECTURE.md §7/§8).
 *
 * Pure read-only aggregation of a candidate's persisted `CriticReview` set into one named
 * fitness-component value + explanation. Critic reviews are EVIDENCE INPUTS ONLY (KEY SAFETY RULE #6):
 * this returns a number for `ScoringPolicy` to weight downstream (P5.6) — it never picks winners,
 * mutates anything, or carries a scoring-policy field. It reads ONLY the numeric `scores` + `confidence`
 * and NEVER the free-text `critique` / candidate text (rule #5/#6 alignment), so critic/candidate text
 * can never move a fitness component. Deterministic + order-independent → replay-reconstructable from the
 * persisted `critic.reviewed` events.
 *
 * Formula: confidence-weighted mean of per-review means (Σ confidenceᵢ·meanᵢ / Σ confidenceᵢ), where a
 * review's mean is the arithmetic mean of its `scores` record values. Reviews with an empty `scores`
 * record do NOT contribute (a critic that emitted no numeric scores shouldn't inject a fabricated 0) but
 * are still counted in `reviewCount`. Boundaries: no contributing review → value 0 (absence, keyed off
 * `contributingReviewCount`, not a silent "averaged 0"); all-zero-confidence → plain mean of per-review
 * means (the information isn't discarded). No normalization — range-scaling is `ScoringPolicy`'s job.
 */
/**
 * The assumed per-score maximum of a critic's numeric `scores` (the 0–{@link CRITIC_SCORE_MAX} scale). The
 * `CriticReview.scores` record is an OPEN `z.number()` (the contract pins shape only, lesson §6) and the
 * mandate prompts do not enforce a numeric scale, so the critic-council fitness component value can be any
 * non-negative magnitude. The SCORER (P5.6) divides the value by this max to bring it onto the [0,1] scale
 * the other components use, mirroring the held-out judge's 0–5 axis scale — so a critic emitting larger
 * raw numbers cannot dominate the weighted fitness average.
 */
export const CRITIC_SCORE_MAX = 5;

export interface CriticScoresResult {
  value: number;
  /** Total reviews supplied (lets P5.6 tell "0 reviews" from "reviews averaging 0"). */
  reviewCount: number;
  /** Reviews that contributed a per-review mean (non-empty `scores`) — absence is keyed off this. */
  contributingReviewCount: number;
  explanation: string;
}

interface Contribution {
  mandate: string;
  mean: number;
  confidence: number;
}

function meanOfValues(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function criticScores(reviews: readonly CriticReview[]): CriticScoresResult {
  const reviewCount = reviews.length;

  // Per-review means — only reviews with a non-empty scores record contribute.
  const contributions: Contribution[] = [];
  for (const review of reviews) {
    const values = Object.values(review.scores);
    if (values.length === 0) {
      continue;
    }
    contributions.push({
      mandate: review.mandate,
      mean: meanOfValues(values),
      confidence: review.confidence,
    });
  }
  const contributingReviewCount = contributions.length;

  if (contributingReviewCount === 0) {
    const reason =
      reviewCount === 0
        ? 'no critic reviews — component absent'
        : `${reviewCount} critic review(s) present but no numeric scores — component absent`;
    return { value: 0, reviewCount, contributingReviewCount, explanation: reason };
  }

  // Confidence-weighted mean of per-review means; all-zero-confidence falls back to the plain mean.
  const confidenceSum = contributions.reduce((sum, c) => sum + c.confidence, 0);
  const value =
    confidenceSum === 0
      ? meanOfValues(contributions.map((c) => c.mean))
      : contributions.reduce((sum, c) => sum + c.confidence * c.mean, 0) / confidenceSum;

  const perReview = contributions
    .map((c) => `${c.mandate}(mean ${c.mean}, confidence ${c.confidence})`)
    .join('; ');
  const note = confidenceSum === 0 ? ' [all-zero-confidence → plain mean]' : '';
  const excluded = reviewCount - contributingReviewCount;
  const excludedNote = excluded > 0 ? ` (${excluded} review(s) excluded: no numeric scores)` : '';
  const explanation =
    `Critic-council component ${value} = confidence-weighted mean of ${contributingReviewCount} ` +
    `contributing review(s)${note}: ${perReview}${excludedNote}.`;

  return { value, reviewCount, contributingReviewCount, explanation };
}
