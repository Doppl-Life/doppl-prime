import { describe, expect, test } from 'vitest';
import { RunCaps } from '@doppl/contracts';
import { applyDemoCapOverride } from '../../../../src/runtime/demo/demo-cap-override';

/**
 * PD.4 — demo cap-override helper (ARCHITECTURE.md §17 demo override "only LOWERS caps within validated
 * maxima"; KEY SAFETY RULE #1 — the override can never RAISE a cap). The route + kernel remain the
 * authoritative enforcer; this helper is a convenience that produces a route-acceptable LOWERED RunCaps
 * and shares the EXACT `> maxima` boundary with the route's `overCapField` (the two layers must agree).
 */

const MAXIMA: RunCaps = {
  maxPopulation: 20,
  maxGenerations: 10,
  energyBudget: 100_000,
  maxSpawnDepth: 5,
  maxToolCalls: 200,
  wallClockTimeoutMs: 600_000,
};

describe('applyDemoCapOverride — only-lowers within validated maxima (spec §17, rule #1)', () => {
  // spec(§17) — each overridden field is lowered to its override value; every non-overridden field
  // stays at the maximum (no silent drift on untouched caps).
  test('test_lowers_each_overridden_cap', () => {
    const result = applyDemoCapOverride(MAXIMA, { maxPopulation: 4, maxGenerations: 3 });
    expect(result).toEqual({
      ...MAXIMA,
      maxPopulation: 4,
      maxGenerations: 3,
    });
  });

  // spec(§17) + rule #1 — an override that would RAISE a cap is rejected (throws, naming the field);
  // the helper can never emit a RunCaps with any field above maxima.
  test('test_rejects_override_that_raises_a_cap', () => {
    expect(() => applyDemoCapOverride(MAXIMA, { maxPopulation: 21 })).toThrow(/maxPopulation/);
  });

  // spec(§17) — boundary parity with the route's `overCapField`: `== maxima` is accepted (a no-op,
  // not a raise); only strictly `> maxima` is rejected. The two defense layers agree on the boundary.
  test('test_accepts_override_equal_to_ceiling', () => {
    const result = applyDemoCapOverride(MAXIMA, { maxPopulation: 20 });
    expect(result.maxPopulation).toBe(20);
  });

  // spec(§4) — RunCaps fields are positive ints; a non-positive override is rejected (an invalid cap
  // can never be produced), naming the field.
  test('test_rejects_non_positive_override', () => {
    expect(() => applyDemoCapOverride(MAXIMA, { maxToolCalls: 0 })).toThrow(/maxToolCalls/);
    expect(() => applyDemoCapOverride(MAXIMA, { maxSpawnDepth: -1 })).toThrow(/maxSpawnDepth/);
  });

  // spec(§4) — the helper emits a valid frozen-contract object (parses cleanly as RunCaps).
  test('test_output_validates_as_RunCaps', () => {
    const result = applyDemoCapOverride(MAXIMA, { maxPopulation: 2, energyBudget: 1_000 });
    expect(RunCaps.safeParse(result).success).toBe(true);
  });
});
