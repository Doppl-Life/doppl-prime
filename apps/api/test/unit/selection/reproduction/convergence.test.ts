import { describe, expect, it } from 'vitest';
import {
  adaptiveMutationFraction,
  noveltySpread,
  DEFAULT_ADAPTIVE_PARAMS,
} from '../../../../src/selection/reproduction/convergence';

describe('convergence (experiment, adaptive controller)', () => {
  it('noveltySpread: identical vectors → 0, orthogonal → ~1, <2 vectors → 0', () => {
    expect(noveltySpread([[1, 0, 0]])).toBe(0); // single → no spread
    expect(noveltySpread([])).toBe(0);
    expect(
      noveltySpread([
        [1, 0],
        [1, 0],
      ]),
    ).toBeCloseTo(0, 5); // identical → distance 0
    expect(
      noveltySpread([
        [1, 0],
        [0, 1],
      ]),
    ).toBeCloseTo(1, 5); // orthogonal → distance 1
    // mixed: one identical pair + one orthogonal pair → between 0 and 1
    const s = noveltySpread([
      [1, 0],
      [1, 0],
      [0, 1],
    ]);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it('adaptiveMutationFraction is BIDIRECTIONAL around target (converged→more mutation, diverse→less)', () => {
    const p = DEFAULT_ADAPTIVE_PARAMS;
    // at target → base
    expect(adaptiveMutationFraction(p.targetSpread)).toBeCloseTo(p.base, 5);
    // converged (below target) → above base (inject divergence)
    expect(adaptiveMutationFraction(p.targetSpread - 0.1)).toBeGreaterThan(p.base);
    // diverse (above target) → below base (consolidate via fusion)
    expect(adaptiveMutationFraction(p.targetSpread + 0.1)).toBeLessThan(p.base);
    // monotonic: more converged → more mutation
    expect(adaptiveMutationFraction(0.1)).toBeGreaterThan(adaptiveMutationFraction(0.3));
  });

  it('adaptiveMutationFraction clamps to [min, max]', () => {
    expect(adaptiveMutationFraction(-100)).toBe(DEFAULT_ADAPTIVE_PARAMS.max); // extreme convergence
    expect(adaptiveMutationFraction(100)).toBe(DEFAULT_ADAPTIVE_PARAMS.min); // extreme divergence
  });
});
