import { describe, expect, it } from 'vitest';
import {
  adaptiveMutationFraction,
  isFitnessImproving,
  noveltySpread,
  DEFAULT_ADAPTIVE_PARAMS,
} from '../../../../src/selection/reproduction/convergence';

describe('convergence (experiment, fitness-aware adaptive controller / E3)', () => {
  it('noveltySpread: identical vectors → 0, orthogonal → ~1, <2 vectors → 0', () => {
    expect(noveltySpread([[1, 0, 0]])).toBe(0);
    expect(noveltySpread([])).toBe(0);
    expect(
      noveltySpread([
        [1, 0],
        [1, 0],
      ]),
    ).toBeCloseTo(0, 5);
    expect(
      noveltySpread([
        [1, 0],
        [0, 1],
      ]),
    ).toBeCloseTo(1, 5);
  });

  it('exploits (low mutation) when fitness is improving, explores (high mutation) when stuck', () => {
    const healthySpread = DEFAULT_ADAPTIVE_PARAMS.diversityFloor + 0.1; // above the collapse floor
    expect(adaptiveMutationFraction(healthySpread, true)).toBeCloseTo(
      DEFAULT_ADAPTIVE_PARAMS.exploitFraction,
      5,
    );
    expect(adaptiveMutationFraction(healthySpread, false)).toBeCloseTo(
      DEFAULT_ADAPTIVE_PARAMS.exploreFraction,
      5,
    );
    // exploit < explore (winning → converge onto the lineage; stuck → diversify)
    expect(adaptiveMutationFraction(healthySpread, true)).toBeLessThan(
      adaptiveMutationFraction(healthySpread, false),
    );
  });

  it('forces a recovery burst when the population collapses below the diversity floor — even while exploiting', () => {
    const collapsed = DEFAULT_ADAPTIVE_PARAMS.diversityFloor - 0.05;
    // even when "improving" (which would normally exploit/converge), a collapse forces recovery mutation.
    expect(adaptiveMutationFraction(collapsed, true)).toBeGreaterThanOrEqual(
      DEFAULT_ADAPTIVE_PARAMS.recoveryFraction,
    );
  });

  it('isFitnessImproving: true only when the current gen best exceeds the prior by > epsilon', () => {
    const best = new Map<number, number>([
      [0, 0.6],
      [1, 0.75],
      [2, 0.751],
    ]);
    const eps = 0.005;
    expect(isFitnessImproving(best, 1, eps)).toBe(true); // 0.75 > 0.6 + eps
    expect(isFitnessImproving(best, 2, eps)).toBe(false); // 0.751 ≈ 0.75 (within eps) → stuck
    expect(isFitnessImproving(best, 0, eps)).toBe(false); // no prior gen → explore by default
  });
});
