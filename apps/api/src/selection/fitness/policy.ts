import type { ScoringPolicy } from '@doppl/contracts';
import { JUDGE_ACCEPTANCE_KEY } from '../components/judge-acceptance';

/**
 * applyScoringPolicy (P5.6, ARCHITECTURE.md §8) — the pure weighted-sum core of the fitness scorer.
 *
 * `total = Σ policy.weights[k] · componentValues[k]` over the UNION of weight keys + component keys. A
 * component with no matching weight contributes 0 (recorded for explainability); a weight key with no
 * matching component contributes 0 against a value of 0 — never `weight · undefined → NaN` (a NaN total
 * would silently corrupt the fitness anchor in P5.7 cull/parent-selection). The immutable `ScoringPolicy`
 * is authoritative (rule #6): a specified-but-unrecognized `normalization` FAILS FAST (throws) rather
 * than being silently ignored. Deterministic, no IO — replay recomputes from persisted values.
 */
export interface Contribution {
  value: number;
  weight: number;
  contribution: number;
}

export interface ScoringResult {
  /** The raw weighted sum `Σ weightₖ·valueₖ`. The fitness scorer (P5.6) divides this by {@link weightSum}
   * to obtain the [0,1] normalized weighted AVERAGE it persists as `FitnessScore.total`. */
  total: number;
  /** `Σ weightₖ` over the policy's RECOGNIZED component weights (weight keys with a matching component
   * value) — the divisor for the normalized weighted average. A weight key with no matching component
   * does NOT contribute to the divisor (it would otherwise deflate the average toward 0 for a signal that
   * was never produced). 0 when no recognized component is weighted (the scorer maps that to a defined 0). */
  weightSum: number;
  contributions: Record<string, Contribution>;
}

export function applyScoringPolicy(
  componentValues: Record<string, number>,
  policy: ScoringPolicy,
): ScoringResult {
  if (policy.normalization !== undefined) {
    // No normalization method is implemented for MVP — a policy directive is never silently ignored.
    throw new Error(`unsupported normalization method: ${policy.normalization}`);
  }

  const keys = new Set([...Object.keys(policy.weights), ...Object.keys(componentValues)]);
  const contributions: Record<string, Contribution> = {};
  let total = 0;
  let weightSum = 0;
  for (const key of keys) {
    const value = componentValues[key] ?? 0;
    const weight = policy.weights[key] ?? 0;
    const contribution = weight * value;
    contributions[key] = { value, weight, contribution };
    total += contribution;
    // Only a weight applied to a PRODUCED component counts toward the average's divisor (a weight key
    // with no matching component value contributed nothing to `total`, so it must not deflate the mean).
    if (key in componentValues) weightSum += weight;
  }

  return { total, weightSum, contributions };
}

/** Stable component-key constants — P5.7/P5.11 + the policy weights agree on these (no key drift). */
export const NOVELTY_KEY = 'novelty';
export const ENERGY_EFFICIENCY_KEY = 'energy_efficiency';
export const CRITIC_SCORES_KEY = 'critic_scores';
export const SUBTYPE_CHECK_KEY = 'subtype_check';
export { JUDGE_ACCEPTANCE_KEY };
