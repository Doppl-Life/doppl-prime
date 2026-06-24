import { describe, expect, test } from 'vitest';
import type { RunCaps, RunConfig } from '@doppl/contracts';
import { applyDemoCapOverride } from '../../../../src/runtime/demo/demo-cap-override';
import { createFallbackLadder } from '../../../../src/runtime/demo/fallback-ladder';

/**
 * PD.4 — operator-driven three-rung fallback ladder (ARCHITECTURE.md §17): rung 1 low-cap-live (mode
 * live) → rung 2 prepared known-good run (mode live) → rung 3 labeled replay (mode replay). A PURE
 * in-memory controller: rungs advance ONLY on an explicit operator call (no timer / subscription /
 * auto-fallback — the operator owns stage timing); it holds NO authoritative run state and takes no
 * write capability (switching mutates nothing — each rung's run stays append-only/replayable, rule #2).
 */

const MAXIMA: RunCaps = {
  maxPopulation: 20,
  maxGenerations: 10,
  energyBudget: 100_000,
  maxSpawnDepth: 5,
  maxToolCalls: 200,
  wallClockTimeoutMs: 600_000,
};

const DEMO_OVERRIDES: Partial<RunCaps> = { maxPopulation: 4, maxGenerations: 3 };

const PREPARED_CONFIG: RunConfig = {
  seed: 'prepared-scenario',
  enabledSubtypes: ['cross_domain_transfer'],
  caps: MAXIMA,
  modelProfile: 'default',
  scoringPolicyVersion: 'scoring-v1',
  rngSeed: 1,
};

function makeLadder() {
  return createFallbackLadder({
    maxima: MAXIMA,
    demoOverrides: DEMO_OVERRIDES,
    preparedRunConfig: PREPARED_CONFIG,
    replayRunId: 'recorded-run-123',
  });
}

describe('createFallbackLadder — operator-driven, manual-advance, no authoritative state (spec §17, rule #2)', () => {
  // spec(§17) — a fresh ladder starts at rung 1 (low-cap-live, mode live).
  test('test_starts_at_rung_1_live', () => {
    const active = makeLadder().active();
    expect(active.kind).toBe('low-cap-live');
    expect(active.mode).toBe('live');
  });

  // spec(§17) — operator advance() walks the three rungs in order: low-cap-live(live) → prepared(live)
  // → replay(replay); rung 3 is unambiguously labeled replay.
  test('test_advance_steps_1_to_2_to_3', () => {
    const ladder = makeLadder();
    expect(ladder.active().kind).toBe('low-cap-live');
    const r2 = ladder.advance();
    expect(r2.kind).toBe('prepared');
    expect(r2.mode).toBe('live');
    const r3 = ladder.advance();
    expect(r3.kind).toBe('replay');
    expect(r3.mode).toBe('replay');
  });

  // spec(§17) — manual stage timing: with no operator call the active rung never changes, and the
  // controller exposes NO auto-transition seam (its surface is exactly {active, advance, select}).
  test('test_manual_only_no_auto_advance', () => {
    const ladder = makeLadder();
    expect(ladder.active().kind).toBe('low-cap-live');
    expect(ladder.active().kind).toBe('low-cap-live'); // stable across reads — no auto-advance
    expect(Object.keys(ladder).sort()).toEqual(['active', 'advance', 'select']);
  });

  // spec(§17) — operator-driven: any rung is directly selectable (live failed → jump straight to replay),
  // not only forward-stepped.
  test('test_operator_can_jump_to_any_rung', () => {
    const ladder = makeLadder();
    const r = ladder.select('replay');
    expect(r.kind).toBe('replay');
    expect(ladder.active().kind).toBe('replay');
  });

  // rule #2 — switching rungs performs ZERO authoritative writes: the factory takes no event-store /
  // write capability (arity 1 = config only), and a prior rung's descriptor is unchanged after a switch.
  test('test_switch_does_not_mutate_prior_rung', () => {
    expect(createFallbackLadder.length).toBe(1); // config only — no store/write dependency
    const ladder = makeLadder();
    const rung1Before = ladder.active();
    ladder.advance(); // → prepared
    const rung1After = ladder.select('low-cap-live');
    expect(rung1After).toEqual(rung1Before); // descriptor unchanged across the switch
  });

  // spec(§17) — end-of-ladder is a CLAMP, not a wrap or throw: advance() while active==replay keeps the
  // operator on replay (no silent jump back to a live rung mid-demo). Pins the just-decided clamp choice.
  test('test_advance_at_replay_stays_at_replay', () => {
    const ladder = makeLadder();
    ladder.select('replay');
    expect(ladder.advance().kind).toBe('replay');
    expect(ladder.active().kind).toBe('replay');
  });

  // spec(§17) — the two modules compose: rung-1 descriptor caps are produced via applyDemoCapOverride
  // and are route-acceptable (each ≤ maxima).
  test('test_rung_1_caps_are_lowered_via_override', () => {
    const ladder = makeLadder();
    const rung1 = ladder.active();
    if (rung1.kind !== 'low-cap-live') throw new Error('expected rung 1');
    expect(rung1.caps).toEqual(applyDemoCapOverride(MAXIMA, DEMO_OVERRIDES));
    for (const key of Object.keys(MAXIMA) as (keyof RunCaps)[]) {
      expect(rung1.caps[key]).toBeLessThanOrEqual(MAXIMA[key]);
    }
  });
});
