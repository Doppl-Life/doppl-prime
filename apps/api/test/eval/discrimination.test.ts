import { describe, expect, test } from 'vitest';
import { GOLD_SET, type GoldTier } from './gold-set/gold-set';
import { averageRuns, computeDiscrimination, passesGate, type ScoredEntry } from './discrimination';

/**
 * Phase J — J2 discrimination metric logic, KEYLESS + non-vacuous (lesson §94). The gold set's OWN target
 * labels pass the gate (the corpus is internally consistent); a FLAT distribution — mvp-3's failure mode —
 * FAILS it; a gamed leak FAILS it. The flat-fails / leak-fails cases are what make the gate meaningful: it
 * measures discrimination, it does not rubber-stamp.
 */

/** Score the gold set by its TARGET acceptances — the keyless mirror standing in for a perfect judge. */
function goldTargets(): ScoredEntry[] {
  return GOLD_SET.map((e) => ({
    problemId: e.problemId,
    tier: e.tier,
    acceptance: e.targetAcceptance,
  }));
}

describe('passesGate — the gold-set targets pass their own gate (keyless mirror)', () => {
  test('test_gold_targets_pass', () => {
    const report = computeDiscrimination(goldTargets());
    const gate = passesGate(report);
    expect(gate.failures).toEqual([]);
    expect(gate.pass).toBe(true);
    // sanity on the headline numbers
    expect(report.monotone).toBe(true);
    expect(report.spread).toBeGreaterThanOrEqual(0.55);
    expect(report.gamedBelowMediocre).toBe(true);
  });
});

describe('passesGate — fails on the failure modes it is meant to catch (non-vacuous)', () => {
  test('test_flat_distribution_fails_like_mvp3', () => {
    // Every candidate ~0.53 regardless of tier — the observed mvp-3 plateau.
    const flat: ScoredEntry[] = GOLD_SET.map((e) => ({
      problemId: e.problemId,
      tier: e.tier,
      acceptance: 0.53,
    }));
    const gate = passesGate(computeDiscrimination(flat));
    expect(gate.pass).toBe(false);
    // a flat judge has no monotonicity and no spread
    expect(gate.failures.some((f) => f.includes('monotone'))).toBe(true);
    expect(gate.failures.some((f) => f.includes('spread'))).toBe(true);
  });

  test('test_gamed_leak_fails_the_gate', () => {
    // Honest tiers calibrated, but a gamed candidate scores like good (the reward-hacking leak v4 must close).
    const leaky = goldTargets().map((s) => (s.tier === 'gamed' ? { ...s, acceptance: 0.66 } : s));
    const gate = passesGate(computeDiscrimination(leaky));
    expect(gate.pass).toBe(false);
    expect(gate.failures.some((f) => f.includes('reward-hacking leak'))).toBe(true);
  });

  test('test_non_monotone_fails_the_gate', () => {
    // Invert good and mediocre so the ladder is no longer increasing.
    const swap: Record<string, number> = { mediocre: 0.66, good: 0.44 };
    const inverted = goldTargets().map((s) =>
      swap[s.tier] !== undefined ? { ...s, acceptance: swap[s.tier]! } : s,
    );
    const gate = passesGate(computeDiscrimination(inverted));
    expect(gate.pass).toBe(false);
    expect(gate.failures.some((f) => f.includes('monotone'))).toBe(true);
  });

  test('test_missing_a_tier_is_not_monotone', () => {
    const noExcellent = goldTargets().filter((s) => s.tier !== 'excellent');
    const report = computeDiscrimination(noExcellent);
    expect(report.monotone).toBe(false);
    expect(report.spread).toBeNull();
    expect(passesGate(report).pass).toBe(false);
  });
});

describe('computeDiscrimination — per-tier stats', () => {
  test('test_pools_tiers_across_problems', () => {
    const report = computeDiscrimination(goldTargets());
    // 3 problems → n=3 per tier.
    for (const tier of ['weak', 'mediocre', 'good', 'excellent', 'gamed'] as GoldTier[]) {
      expect(report.tierStats[tier]?.n).toBe(3);
    }
  });
});

describe('range-overlap is the gated separability check (not within-tier band)', () => {
  test('test_clean_targets_have_no_overlap', () => {
    expect(computeDiscrimination(goldTargets()).adjacentOverlaps).toEqual([]);
  });

  test('test_a_mediocre_outlier_into_good_range_overlaps_and_fails', () => {
    // One mediocre candidate scores up into the good range (0.70 > good's 0.66) — ranges overlap.
    const overlapping = goldTargets().map((s, i) =>
      s.tier === 'mediocre' && i % 5 === 1 ? { ...s, acceptance: 0.7 } : s,
    );
    const report = computeDiscrimination(overlapping);
    expect(report.adjacentOverlaps.some((o) => o.lower === 'mediocre' && o.upper === 'good')).toBe(
      true,
    );
    expect(passesGate(report).failures.some((f) => f.includes('overlap'))).toBe(true);
  });

  test('test_a_wide_but_non_overlapping_tier_still_passes', () => {
    // A tier wider than the smallest mean-gap but whose range does NOT cross into a neighbor must still PASS
    // (this is exactly what the old within-tier-band gate wrongly failed).
    const wideGood: ScoredEntry[] = [
      { problemId: 'a', tier: 'weak', acceptance: 0.2 },
      { problemId: 'b', tier: 'weak', acceptance: 0.22 },
      { problemId: 'c', tier: 'weak', acceptance: 0.24 },
      { problemId: 'a', tier: 'mediocre', acceptance: 0.4 },
      { problemId: 'b', tier: 'mediocre', acceptance: 0.42 },
      { problemId: 'c', tier: 'mediocre', acceptance: 0.44 },
      { problemId: 'a', tier: 'good', acceptance: 0.56 }, // wide band (0.56–0.74) but above mediocre.max 0.44
      { problemId: 'b', tier: 'good', acceptance: 0.66 },
      { problemId: 'c', tier: 'good', acceptance: 0.74 },
      { problemId: 'a', tier: 'excellent', acceptance: 0.84 }, // above good.max 0.74
      { problemId: 'b', tier: 'excellent', acceptance: 0.86 },
      { problemId: 'c', tier: 'excellent', acceptance: 0.88 },
      { problemId: 'a', tier: 'gamed', acceptance: 0.1 },
      { problemId: 'b', tier: 'gamed', acceptance: 0.12 },
      { problemId: 'c', tier: 'gamed', acceptance: 0.14 },
    ];
    const report = computeDiscrimination(wideGood);
    expect(report.maxWithinTierBand).toBeCloseTo(0.18, 6); // genuinely wide
    expect(report.adjacentOverlaps).toEqual([]); // but no range overlap
    expect(passesGate(report).pass).toBe(true); // → PASSES the robust gate
  });
});

describe('averageRuns — stabilizes the non-deterministic judge', () => {
  test('test_averages_each_candidate_across_runs', () => {
    const runA: ScoredEntry[] = [{ problemId: 'a', tier: 'good', acceptance: 0.4 }];
    const runB: ScoredEntry[] = [{ problemId: 'a', tier: 'good', acceptance: 0.6 }];
    const avg = averageRuns([runA, runB]);
    expect(avg).toHaveLength(1);
    expect(avg[0]?.acceptance).toBeCloseTo(0.5, 6);
  });

  test('test_single_run_is_identity', () => {
    const run = goldTargets();
    const avg = averageRuns([run]);
    expect(avg).toHaveLength(run.length);
    expect(passesGate(computeDiscrimination(avg)).pass).toBe(true);
  });
});
