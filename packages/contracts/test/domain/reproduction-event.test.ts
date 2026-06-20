// P0.9 — ReproductionEvent: a breeding event with PERSISTED RNG outcomes (ARCHITECTURE.md §8/§3).
// SAFETY-relevant (rule #7 replay-determinism). spec(§4/§8): `crossoverPoints` + `mutationSummary`
// are the REQUIRED persisted RNG outcomes — replay reconstructs the child from the STORED outcomes
// and never re-samples. `mode` closes the breeding modes; mutation_only is the degenerate <2-parent
// fallback (§3). Counts (parentAgenomeIds 0–2) are kernel-enforced (§6), not the schema.
import { describe, it, expect } from 'vitest';
import { ReproductionEvent, ReproductionMode } from '@doppl/contracts';

const validReproduction = {
  id: 'rep_1',
  runId: 'run_1',
  parentAgenomeIds: ['agn_p1', 'agn_p2'],
  childAgenomeId: 'agn_child',
  mode: 'fusion',
  crossoverPoints: [2, 5, 9],
  mutationSummary: { systemPrompt: 'tightened', temperature: 0.4, explorerWeight: true },
};

const REQUIRED_KEYS = [
  'id',
  'runId',
  'parentAgenomeIds',
  'childAgenomeId',
  'mode',
  'crossoverPoints',
  'mutationSummary',
] as const;

const MODES = ['fusion', 'crossover', 'output_synthesis', 'mutation_only'] as const;

describe('ReproductionEvent — breeding with persisted RNG outcomes (spec §8)', () => {
  it('reproduction_event_accepts_valid_and_strict', () => {
    // spec(§8): positive guard first (lesson §10) — full event round-trips; unknown rejected; each
    // required field mandatory (ALL 7 required — no optionals).
    expect(ReproductionEvent.parse(validReproduction)).toEqual(validReproduction);
    expect(() => ReproductionEvent.parse({ ...validReproduction, bogus: 1 })).toThrow();
    for (const k of REQUIRED_KEYS) {
      const clone: Record<string, unknown> = { ...validReproduction };
      delete clone[k];
      expect(() => ReproductionEvent.parse(clone), `missing ${k}`).toThrow();
    }
    expect(REQUIRED_KEYS).toHaveLength(7);
    // parentAgenomeIds count (0–2) is a kernel rule, NOT a schema constraint — 0/1/2/3 all parse;
    // mutation_only legitimately has <2 parents (degenerate fallback, §3).
    for (const parents of [[], ['a'], ['a', 'b'], ['a', 'b', 'c']]) {
      expect(
        ReproductionEvent.parse({ ...validReproduction, parentAgenomeIds: parents })
          .parentAgenomeIds,
      ).toEqual(parents);
    }
    expect(() => ReproductionEvent.parse({ ...validReproduction, childAgenomeId: '' })).toThrow();
    expect(() =>
      ReproductionEvent.parse({ ...validReproduction, parentAgenomeIds: [''] }),
    ).toThrow();
  });

  it('reproduction_mode_closed_4_union', () => {
    // spec(§8/§3): mode is the closed 4-member union; mutation_only = the degenerate <2-parent
    // fallback; any other value rejected.
    for (const m of MODES) {
      expect(ReproductionMode.parse(m)).toBe(m);
      expect(ReproductionEvent.parse({ ...validReproduction, mode: m }).mode).toBe(m);
    }
    expect(MODES).toHaveLength(4);
    expect(() => ReproductionMode.parse('cloning')).toThrow();
    expect(() => ReproductionMode.parse('')).toThrow();
    expect(() => ReproductionEvent.parse({ ...validReproduction, mode: 'cloning' })).toThrow();
  });

  it('reproduction_rng_outcomes_persisted', () => {
    // spec(§4/§8, rule #7): crossoverPoints + mutationSummary are REQUIRED persisted RNG outcomes —
    // omitting either is rejected (so replay reads stored outcomes and never re-samples). An empty
    // crossoverPoints is legitimate (mutation_only has none); the FIELD presence is the pin.
    for (const k of ['crossoverPoints', 'mutationSummary'] as const) {
      const clone: Record<string, unknown> = { ...validReproduction };
      delete clone[k];
      expect(() => ReproductionEvent.parse(clone), `rule #7 requires ${k}`).toThrow();
    }
    // crossoverPoints: array of integer splice indices; [] ok (mutation_only); non-int rejected.
    expect(
      ReproductionEvent.parse({ ...validReproduction, crossoverPoints: [] }).crossoverPoints,
    ).toEqual([]);
    expect(() =>
      ReproductionEvent.parse({ ...validReproduction, crossoverPoints: [1.5] }),
    ).toThrow();
    expect(() =>
      ReproductionEvent.parse({ ...validReproduction, crossoverPoints: ['a'] }),
    ).toThrow();
    // mutationSummary: trait → concrete RNG outcome (string|number|boolean); {} ok; nested rejected.
    expect(
      ReproductionEvent.parse({ ...validReproduction, mutationSummary: {} }).mutationSummary,
    ).toEqual({});
    expect(() =>
      ReproductionEvent.parse({ ...validReproduction, mutationSummary: { trait: { nested: 1 } } }),
    ).toThrow();
    expect(() =>
      ReproductionEvent.parse({ ...validReproduction, mutationSummary: { trait: [1, 2] } }),
    ).toThrow();
  });
});
