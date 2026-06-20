// P0.8 — ScoringPolicy: the versioned, decomposed scoring rule (ARCHITECTURE.md §8). SAFETY slice
// (rule #6 — the policy is immutable to agents; it is VERSIONED, never mutated in place). spec(§8):
// STRUCTURE is frozen now ({version, weights, normalization?}); the numeric weight VALUES are the
// ONLY deferred-open piece — the schema pins that `weights` EXISTS as a record, not which keys/values.
import { describe, it, expect } from 'vitest';
import { ScoringPolicy } from '@doppl/contracts';

const validPolicy = {
  version: 'scoring-v1',
  weights: {
    critic: 0.3,
    novelty: 0.25,
    energy_efficiency: 0.15,
    judge_acceptance: 0.2,
    subtype_check: 0.1,
  },
  normalization: 'minmax',
};

describe('ScoringPolicy — versioned scoring rule (spec §8)', () => {
  it('scoring_policy_structure_frozen_weights_open', () => {
    // spec(§8): positive guard first — full policy round-trips; normalization omittable; unknown
    // rejected; version required + non-empty.
    expect(ScoringPolicy.parse(validPolicy)).toEqual(validPolicy);
    const noNorm: Record<string, unknown> = { ...validPolicy };
    delete noNorm.normalization;
    expect(ScoringPolicy.parse(noNorm)).toEqual(noNorm);
    expect(() => ScoringPolicy.parse({ ...validPolicy, bogus: 1 })).toThrow();
    expect(() => ScoringPolicy.parse({ version: '', weights: {} })).toThrow();
    const noVersion: Record<string, unknown> = { ...validPolicy };
    delete noVersion.version;
    expect(() => ScoringPolicy.parse(noVersion)).toThrow();

    // weights: structure frozen (a record), VALUES deferred-open — ANY numeric weight set parses,
    // including an empty map; a non-number weight value is rejected; weights itself is required.
    expect(ScoringPolicy.parse({ ...validPolicy, weights: {} }).weights).toEqual({});
    expect(
      ScoringPolicy.parse({ ...validPolicy, weights: { anything: 9.9, else: -1 } }).weights,
    ).toEqual({ anything: 9.9, else: -1 });
    expect(() => ScoringPolicy.parse({ ...validPolicy, weights: { a: 'x' } })).toThrow();
    const noWeights: Record<string, unknown> = { ...validPolicy };
    delete noWeights.weights;
    expect(() => ScoringPolicy.parse(noWeights)).toThrow();
    // normalization, when present, is a non-empty named method.
    expect(() => ScoringPolicy.parse({ ...validPolicy, normalization: '' })).toThrow();
  });
});
