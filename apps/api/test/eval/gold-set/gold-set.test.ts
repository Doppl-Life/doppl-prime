import { describe, expect, test } from 'vitest';
import { CandidateIdea } from '@doppl/contracts';
import {
  GOLD_SET,
  GoldSetEntry,
  TARGET_BANDS,
  goldCandidateIdea,
  goldProblemIds,
  HONEST_TIER_ORDER,
} from './gold-set';

/**
 * Phase J — J1 well-formedness of the signed-off gold set. KEYLESS (no provider) — runs in CI. These pin
 * that the corpus is structurally valid, drives REAL CandidateIdeas, and is internally consistent with the
 * D10 thresholds, so the J2 discrimination gate is measuring against sound ground truth.
 */

const ALL_TIERS = ['weak', 'mediocre', 'good', 'excellent', 'gamed'];

describe('gold set — structure', () => {
  test('test_has_15_entries_all_valid', () => {
    // positive guard (lesson 10): a vanished/empty export fails loudly.
    expect(GOLD_SET.length).toBe(15);
    for (const entry of GOLD_SET) {
      expect(GoldSetEntry.safeParse(entry).success).toBe(true);
    }
  });

  test('test_three_distinct_problems_each_with_all_five_tiers', () => {
    expect(goldProblemIds()).toHaveLength(3);
    for (const problemId of goldProblemIds()) {
      const tiers = GOLD_SET.filter((e) => e.problemId === problemId)
        .map((e) => e.tier)
        .sort();
      expect(tiers).toEqual([...ALL_TIERS].sort());
    }
  });

  test('test_every_entry_constructs_a_valid_candidate_idea', () => {
    for (const entry of GOLD_SET) {
      const candidate = goldCandidateIdea(entry);
      expect(CandidateIdea.safeParse(candidate).success).toBe(true);
      expect(candidate.subtype).toBe(entry.subtype);
      expect(candidate.id).toBe(`gold:${entry.problemId}:${entry.tier}`);
    }
  });
});

describe('gold set — score consistency with the judge math + D10 thresholds', () => {
  test('test_targetAcceptance_equals_sum_of_axes_over_50', () => {
    for (const entry of GOLD_SET) {
      const sum = Object.values(entry.targetAxisScores).reduce((a, b) => a + b, 0);
      expect(entry.targetAcceptance).toBeCloseTo(sum / 50, 6);
    }
  });

  test('test_honest_tier_targets_land_in_their_D10_bands', () => {
    for (const entry of GOLD_SET) {
      if (entry.tier === 'gamed') continue;
      const [lo, hi] = TARGET_BANDS[entry.tier];
      expect(entry.targetAcceptance).toBeGreaterThanOrEqual(lo);
      expect(entry.targetAcceptance).toBeLessThanOrEqual(hi);
    }
  });

  test('test_gamed_targets_strictly_below_the_mediocre_floor', () => {
    const mediocreFloor = Math.min(
      ...GOLD_SET.filter((e) => e.tier === 'mediocre').map((e) => e.targetAcceptance),
    );
    const gamed = GOLD_SET.filter((e) => e.tier === 'gamed');
    expect(gamed.length).toBeGreaterThan(0);
    for (const entry of gamed) {
      expect(entry.targetAcceptance).toBeLessThan(mediocreFloor);
    }
  });

  test('test_honest_ladder_means_are_strictly_increasing', () => {
    const means = HONEST_TIER_ORDER.map((tier) => {
      const xs = GOLD_SET.filter((e) => e.tier === tier).map((e) => e.targetAcceptance);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    });
    for (let i = 1; i < means.length; i += 1) {
      expect(means[i]).toBeGreaterThan(means[i - 1]!);
    }
  });
});
