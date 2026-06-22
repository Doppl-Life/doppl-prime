import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RunCaps } from '@doppl/contracts';
import { enforceCap, enforceWallClock } from '../../../../src/runtime/caps/capEnforcer';

/**
 * P3.4 cap enforcement (ARCHITECTURE.md §5 / §15 REQ-NF-001, KEY SAFETY RULE #1 — caps are
 * kernel-enforced, never prompt-enforced; an agenome trait can never raise a cap). PURE fail-closed
 * decisions; caps come ONLY from `RunConfig.caps`. The loop (P3.10) emits the cap-breach event.
 */

const CAPS: RunCaps = {
  maxPopulation: 8,
  maxGenerations: 5,
  energyBudget: 1000,
  maxSpawnDepth: 3,
  maxToolCalls: 20,
  wallClockTimeoutMs: 60_000,
};

const ENFORCER_SRC = fileURLToPath(
  new URL('../../../../src/runtime/caps/capEnforcer.ts', import.meta.url),
);

describe('enforceCap (P3.4 — rule #1 fail-closed)', () => {
  test('enforce_cap_allows_under_and_at_ceiling', () => {
    // spec(§5): the cap is the INCLUSIVE ceiling — consumed+requested < cap and === cap are allowed.
    expect(enforceCap('maxToolCalls', 10, 5, CAPS)).toEqual({ allowed: true }); // 15 < 20
    expect(enforceCap('maxToolCalls', 18, 2, CAPS)).toEqual({ allowed: true }); // 20 === 20 (at ceiling)
  });

  test('enforce_cap_fails_closed_over_ceiling', () => {
    // spec(§5) spec(§15): consumed+requested === cap+1 → denied (fail-closed) with the breach detail.
    expect(enforceCap('maxToolCalls', 18, 3, CAPS)).toEqual({
      allowed: false,
      reason: 'cap_exceeded',
      dimension: 'maxToolCalls',
      cap: 20,
      consumed: 18,
      requested: 3,
    }); // 21 === cap+1
  });

  test('enforce_cap_fails_closed_across_all_count_dimensions', () => {
    // rule #1: every count dimension fails closed at cap+1 (TOTALITY — not just one dimension).
    expect(enforceCap('maxPopulation', 8, 1, CAPS).allowed).toBe(false);
    expect(enforceCap('maxGenerations', 5, 1, CAPS).allowed).toBe(false);
    expect(enforceCap('energyBudget', 1000, 1, CAPS).allowed).toBe(false);
    expect(enforceCap('maxSpawnDepth', 3, 1, CAPS).allowed).toBe(false);
    expect(enforceCap('maxToolCalls', 20, 1, CAPS).allowed).toBe(false);
  });

  test('enforce_cap_reads_caps_only_from_runcaps_arg', () => {
    // rule #1 (structural, lesson §9/§11/§27): the ceiling comes ONLY from the RunCaps arg — lowering the
    // arg lowers the ceiling; with the original caps the same (consumed,requested) is allowed. The
    // signature (dimension, consumed, requested, caps) is the WHOLE input — no agenome/trait/spawnBudget
    // path can raise a cap by shape (asserted below by the absence of those tokens in the module source).
    const lowered: RunCaps = { ...CAPS, maxToolCalls: 5 };
    expect(enforceCap('maxToolCalls', 5, 1, lowered).allowed).toBe(false); // 6 > 5 (lowered ceiling)
    expect(enforceCap('maxToolCalls', 5, 1, CAPS).allowed).toBe(true); // 6 <= 20 — only the arg decides
    const src = readFileSync(ENFORCER_SRC, 'utf8');
    expect(src).not.toMatch(/agenome|spawnBudget|\btrait/i); // no trait input path by shape
  });
});

describe('enforceWallClock (P3.4 — injected clock)', () => {
  test('enforce_wall_clock_injected_elapsed', () => {
    // spec(§5): elapsedMs >= wallClockTimeoutMs → denied; < → allowed. `elapsedMs` is INJECTED (the caller
    // measures the clock); the enforcer reads no Date (pure, like the P3.6 no-ad-hoc-clock discipline).
    // The deadline is EXCLUSIVE (=== timeout is out of time), unlike the inclusive count ceilings.
    expect(enforceWallClock(59_999, CAPS)).toEqual({ allowed: true });
    expect(enforceWallClock(60_000, CAPS).allowed).toBe(false); // === timeout → denied
    expect(enforceWallClock(60_001, CAPS).allowed).toBe(false);
    expect(readFileSync(ENFORCER_SRC, 'utf8')).not.toMatch(/\bDate\b|Date\.now/); // no clock read
  });
});
