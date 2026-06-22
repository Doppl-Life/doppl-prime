import { describe, expect, test } from 'vitest';
import type { ScoringPolicy } from '@doppl/contracts';
import { applyScoringPolicy } from '../../../../src/selection/fitness/policy';

/**
 * applyScoringPolicy (P5.6, §8) — pure weighted sum of component values under the immutable
 * ScoringPolicy weights. total = Σ weights[k]·values[k] over the policy weight keys; a component with
 * no policy weight is recorded for explainability but does not move the total. Deterministic, no IO.
 */
describe('applyScoringPolicy — pure weighted sum + contributions', () => {
  // 1 — spec(§8): total = Σ wᵢ·vᵢ for known components + weights.
  test('weighted_sum_basic', () => {
    const policy: ScoringPolicy = { version: 'v1', weights: { a: 0.5, b: 2 } };
    const { total } = applyScoringPolicy({ a: 4, b: 1 }, policy);
    expect(total).toBeCloseTo(0.5 * 4 + 2 * 1, 12); // 4
  });

  // 2 — spec(§8): a component value with no policy weight → weight 0, contribution 0, total unaffected.
  test('unweighted_component_zero_contribution', () => {
    const policy: ScoringPolicy = { version: 'v1', weights: { a: 1 } };
    const { total, contributions } = applyScoringPolicy({ a: 3, orphan: 99 }, policy);
    expect(total).toBeCloseTo(3, 12);
    expect(contributions.orphan).toEqual({ value: 99, weight: 0, contribution: 0 });
  });

  // 3 — spec(§8): normalization undefined → raw weighted sum (MVP).
  test('normalization_undefined_is_raw_weighted_sum', () => {
    const policy: ScoringPolicy = { version: 'v1', weights: { a: 1, b: 1 } };
    expect(applyScoringPolicy({ a: 2, b: 3 }, policy).total).toBeCloseTo(5, 12);
  });

  // 4 — rule #6: a specified-but-unrecognized normalization → throws (a policy directive is never
  // silently ignored; the policy is authoritative).
  test('normalization_unsupported_throws', () => {
    const policy: ScoringPolicy = { version: 'v1', weights: { a: 1 }, normalization: 'softmax' };
    expect(() => applyScoringPolicy({ a: 1 }, policy)).toThrow();
  });

  // 5 — spec(§8): contributions returns {value, weight, contribution} per component key.
  test('contributions_breakdown_per_component', () => {
    const policy: ScoringPolicy = { version: 'v1', weights: { a: 0.5, b: 2 } };
    const { contributions } = applyScoringPolicy({ a: 4, b: 1 }, policy);
    expect(contributions.a).toEqual({ value: 4, weight: 0.5, contribution: 2 });
    expect(contributions.b).toEqual({ value: 1, weight: 2, contribution: 2 });
  });

  // 6 — NaN/boundary: a policy weight key with NO matching component (open weights — §7 allows non-axis
  // keys like the energy-efficiency tiebreak) contributes 0 and yields a FINITE total, never w*undefined
  // → NaN (a NaN total silently corrupts the fitness anchor in P5.7 cull/parent-selection).
  test('policy_weight_without_component_is_zero_not_nan', () => {
    const policy: ScoringPolicy = { version: 'v1', weights: { a: 1, tiebreak: 0.1 } };
    const { total, contributions } = applyScoringPolicy({ a: 3 }, policy);
    expect(Number.isNaN(total)).toBe(false);
    expect(total).toBeCloseTo(3, 12);
    expect(contributions.tiebreak).toEqual({ value: 0, weight: 0.1, contribution: 0 });
  });
});
