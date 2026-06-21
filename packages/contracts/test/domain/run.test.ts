// P0.15(partial) — Run: the run-lifecycle entity (ARCHITECTURE.md §3, Appendix A). Plain entity
// shape (NOT a safety slice). spec(§3): strict 7-field object; `caps` reuses the frozen RunCaps and
// `enabledSubtypes` the P0.3 Subtype (imported, never redefined — lesson §5); count/range invariants
// (enabledSubtypes ≥1) are kernel rules (lesson §6), not schema constraints.
import { describe, it, expect } from 'vitest';
import { Run, RunStatus } from '@doppl/contracts';

const validCaps = {
  maxPopulation: 10,
  maxGenerations: 5,
  energyBudget: 1000,
  maxSpawnDepth: 3,
  maxToolCalls: 20,
  wallClockTimeoutMs: 600_000,
};

const validRun = {
  id: 'run_1',
  seed: 'scenario-alpha',
  enabledSubtypes: ['cross_domain_transfer', 'zeitgeist_synthesis'],
  caps: validCaps,
  status: 'configured',
  startedAt: '2026-06-20T12:00:00.000Z',
  completedAt: '2026-06-20T12:30:00.000Z',
};

const RUN_REQUIRED = ['id', 'seed', 'enabledSubtypes', 'caps', 'status', 'startedAt'] as const;

const RUN_STATUSES = [
  'configured',
  'running',
  'completing',
  'completed',
  'stopping',
  'stopped',
  'failed',
  'cancelled',
] as const;

describe('Run — run-lifecycle entity (spec §3)', () => {
  it('run_accepts_valid_and_strict', () => {
    // spec(§3): positive-guard-first (lesson §10) — full Run round-trips (with + without the optional
    // completedAt); unknown rejected; each required field mandatory.
    expect(Run.parse(validRun)).toEqual(validRun);
    const noCompleted: Record<string, unknown> = { ...validRun };
    delete noCompleted.completedAt;
    expect(Run.parse(noCompleted)).toEqual(noCompleted);
    expect(() => Run.parse({ ...validRun, bogus: 1 })).toThrow();
    for (const k of RUN_REQUIRED) {
      const clone: Record<string, unknown> = { ...validRun };
      delete clone[k];
      expect(() => Run.parse(clone), `missing ${k}`).toThrow();
    }
    // caps validates as the frozen RunCaps — a non-positive cap is rejected (imported, not redefined).
    expect(() => Run.parse({ ...validRun, caps: { ...validCaps, maxPopulation: 0 } })).toThrow();
    // enabledSubtypes accepts P0.3 Subtype members; a non-member is rejected (single-source union).
    expect(
      Run.parse({ ...validRun, enabledSubtypes: ['cross_domain_transfer'] }).enabledSubtypes,
    ).toEqual(['cross_domain_transfer']);
    expect(() => Run.parse({ ...validRun, enabledSubtypes: ['nope'] })).toThrow();
    // seed is a non-empty opaque string (Q1) — an empty seed is rejected.
    expect(() => Run.parse({ ...validRun, seed: '' })).toThrow();
  });

  it('run_status_closed_8_union', () => {
    // spec(§3): RunStatus is the closed 8-member lifecycle union; any other value is rejected.
    for (const s of RUN_STATUSES) {
      expect(RunStatus.parse(s)).toBe(s);
      expect(Run.parse({ ...validRun, status: s }).status).toBe(s);
    }
    expect(RUN_STATUSES).toHaveLength(8);
    expect(() => RunStatus.parse('paused')).toThrow();
    expect(() => RunStatus.parse('')).toThrow();
    expect(() => Run.parse({ ...validRun, status: 'paused' })).toThrow();
  });
});
