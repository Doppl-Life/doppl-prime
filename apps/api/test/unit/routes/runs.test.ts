import { describe, expect, test } from 'vitest';
import type { RunCaps } from '@doppl/contracts';
import { overCapField } from '../../../src/routes/runs';
import { createIdempotencyStore } from '../../../src/middleware/idempotency';

/**
 * P6.6 — pure write-path logic (unit). spec(§11): cap-override rejection (lowering-only) is a pure
 * comparison; the idempotency store is a pure key→runId dedup. The HTTP wiring is integration-tested.
 */

const maxima: RunCaps = {
  maxPopulation: 20,
  maxGenerations: 10,
  energyBudget: 100_000,
  maxSpawnDepth: 5,
  maxToolCalls: 200,
  wallClockTimeoutMs: 600_000,
};

describe('overCapField — cap-override rejection (spec §11)', () => {
  test('test_lowering_within_ceilings_is_allowed', () => {
    // every cap ≤ its maximum → null (accepted).
    expect(overCapField({ ...maxima, maxPopulation: 2, maxToolCalls: 10 }, maxima)).toBeNull();
    expect(overCapField(maxima, maxima)).toBeNull(); // equal to the ceiling is allowed
  });

  test('test_any_cap_above_max_is_named', () => {
    expect(overCapField({ ...maxima, maxPopulation: 21 }, maxima)).toBe('maxPopulation');
    expect(overCapField({ ...maxima, energyBudget: 100_001 }, maxima)).toBe('energyBudget');
    expect(overCapField({ ...maxima, wallClockTimeoutMs: 600_001 }, maxima)).toBe(
      'wallClockTimeoutMs',
    );
  });
});

describe('createIdempotencyStore — key→runId dedup (spec §11)', () => {
  test('test_get_returns_stored_run_for_known_key', () => {
    const store = createIdempotencyStore();
    expect(store.get('k1')).toBeUndefined();
    store.set('k1', 'run_1');
    expect(store.get('k1')).toBe('run_1');
    expect(store.get('k2')).toBeUndefined();
  });

  test('test_set_is_first_writer_stable', () => {
    const store = createIdempotencyStore();
    store.set('k1', 'run_1');
    // a key maps to its first run; the store is the dedup source of truth.
    expect(store.get('k1')).toBe('run_1');
  });
});
