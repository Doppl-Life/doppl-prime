// P0.3 — RunCaps: strict positive-integer cap set. spec(§4): ARCHITECTURE.md §4 / Appendix-A cap
// SCHEMA (the cap set the P3 kernel will enforce per §5 — this slice freezes the schema only, so
// §5 enforcement is not tagged here).
import { describe, it, expect } from 'vitest';
import { RunCaps } from '@doppl/contracts';

const validCaps = {
  maxPopulation: 10,
  maxGenerations: 5,
  energyBudget: 100000,
  maxSpawnDepth: 4,
  maxToolCalls: 50,
  wallClockTimeoutMs: 600000,
};

const CAP_FIELDS = [
  'maxPopulation',
  'maxGenerations',
  'energyBudget',
  'maxSpawnDepth',
  'maxToolCalls',
  'wallClockTimeoutMs',
] as const;

describe('RunCaps — strict positive-integer cap set (spec §4)', () => {
  it('run_caps_accepts_valid', () => {
    // spec(§4): all 6 caps as positive integers parse and round-trip.
    expect(RunCaps.parse(validCaps)).toEqual(validCaps);
  });

  it('run_caps_rejects_nonpositive_or_noninteger', () => {
    // spec(§4): 0, negative, and non-integer are rejected for every cap (schema fail-fast).
    for (const f of CAP_FIELDS) {
      for (const bad of [0, -1, 1.5]) {
        expect(() => RunCaps.parse({ ...validCaps, [f]: bad }), `${f}=${bad}`).toThrow();
      }
    }
  });

  it('run_caps_strict_unknown_and_missing', () => {
    // spec(§4): strictObject — an unknown field is rejected; each required cap is mandatory.
    expect(() => RunCaps.parse({ ...validCaps, bogus: 1 })).toThrow();
    for (const f of CAP_FIELDS) {
      const clone: Record<string, unknown> = { ...validCaps };
      delete clone[f];
      expect(() => RunCaps.parse(clone), `missing ${f}`).toThrow();
    }
  });
});
