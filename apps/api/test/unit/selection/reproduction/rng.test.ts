import { describe, expect, test } from 'vitest';
import { createRng } from '../../../../src/selection/reproduction/rng';

/**
 * Deterministic seeded PRNG (P5.8) — the live mutation sampling source. Same seed → identical
 * sequence, so the live path is reproducible; replay never re-runs it (rule #7). Pure, no
 * Math.random/Date.now (LESSONS §24).
 */
describe('createRng — deterministic seeded PRNG', () => {
  // 1 — rule #7: same seed → identical sequence (replayable).
  test('rng_same_seed_same_sequence', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 10 }, () => a.nextFloat());
    const seqB = Array.from({ length: 10 }, () => b.nextFloat());
    expect(seqA).toEqual(seqB);
  });

  // 2 — distinct seeds produce different sequences (a real randomness source).
  test('rng_different_seeds_differ', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.nextFloat());
    const seqB = Array.from({ length: 10 }, () => b.nextFloat());
    expect(seqA).not.toEqual(seqB);
  });

  // 3 — nextInt(n) ∈ [0, n) integer (bounded selection).
  test('rng_nextInt_in_range', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng.nextInt(5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
    }
  });

  // 4 — pick(arr) always returns an array member (bounded selection).
  test('rng_pick_returns_member', () => {
    const rng = createRng(99);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i += 1) {
      expect(arr).toContain(rng.pick(arr));
    }
  });
});
