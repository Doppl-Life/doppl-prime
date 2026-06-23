import { describe, expect, test } from 'vitest';
import {
  DEFAULT_STALE_THRESHOLD_MS,
  healthFreshness,
  isStale,
} from '../../../../src/components/demo/runHealthStale';

/**
 * PD.6 — the pure continue-vs-switch staleness logic (ARCHITECTURE.md §13). `nowMs` is INJECTED (no
 * Date.now() inside) → deterministic. Health is stale when the last event is absent or older than the
 * threshold relative to `nowMs`.
 */

const NOW = 1_700_000_000_000;
/** Build a fixed ISO timestamp from a fixed ms (deterministic — never Date.now()). */
const iso = (ms: number) => new Date(ms).toISOString();

describe('runHealthStale (PD.6 — staleness, §13)', () => {
  // §13 — absent health (no last-event time) is flagged stale.
  test('is_stale_true_when_absent', () => {
    expect(isStale(null, NOW)).toBe(true);
  });

  // §13 — a last-event older than the threshold (relative to the injected now) is stale.
  test('is_stale_true_when_older_than_threshold', () => {
    expect(isStale(iso(NOW - DEFAULT_STALE_THRESHOLD_MS - 1), NOW)).toBe(true);
  });

  // fresh health within the threshold → continue (not stale).
  test('is_stale_false_when_recent', () => {
    expect(isStale(iso(NOW - 1_000), NOW)).toBe(false);
  });

  // the 3-way freshness the badge renders: absent (null) / stale (old) / healthy (recent).
  test('health_freshness_three_way', () => {
    expect(healthFreshness(null, NOW)).toBe('absent');
    expect(healthFreshness(iso(NOW - DEFAULT_STALE_THRESHOLD_MS - 1), NOW)).toBe('stale');
    expect(healthFreshness(iso(NOW - 1_000), NOW)).toBe('healthy');
  });
});
