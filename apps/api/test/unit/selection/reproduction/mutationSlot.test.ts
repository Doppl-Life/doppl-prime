import { describe, expect, it } from 'vitest';
import { isMutationSlot } from '../../../../src/selection/reproduction/mutationSlot';

describe('isMutationSlot (experiment r/K decision)', () => {
  it('fraction 0 → fusion, fraction 1 → mutation, single parent → always mutation', () => {
    expect(isMutationSlot(0, 123, 2)).toBe(false);
    expect(isMutationSlot(1, 123, 2)).toBe(true);
    expect(isMutationSlot(0, 123, 1)).toBe(true); // one parent → mutation regardless of fraction
  });

  it('is deterministic over the slot seed (replay-stable) + roughly tracks the fraction', () => {
    expect(isMutationSlot(0.5, 999, 2)).toBe(isMutationSlot(0.5, 999, 2)); // same seed → same decision
    let mutations = 0;
    for (let slot = 0; slot < 600; slot += 1) if (isMutationSlot(1 / 3, slot, 2)) mutations += 1;
    expect(mutations).toBeGreaterThan(120); // ~1/3 of 600 = 200; loose bounds (no flake)
    expect(mutations).toBeLessThan(280);
  });
});
