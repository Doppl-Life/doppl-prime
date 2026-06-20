// P0.8 — FitnessScore: the policy-versioned decomposed fitness (ARCHITECTURE.md §8). SAFETY slice
// (rule #6 scoring immutability-via-versioning / anti-reward-hacking). spec(§8): `policyVersion` is
// REQUIRED and binds the score to the exact ScoringPolicy.version that produced it — a policy is
// versioned, never mutated in place, so a score is forever explainable against its policy.
import { describe, it, expect } from 'vitest';
import { FitnessScore, ScoringPolicy } from '@doppl/contracts';

const validFitness = {
  id: 'fit_1',
  candidateId: 'cand_1',
  total: 0.81,
  components: {
    critic: 0.7,
    novelty: 0.72,
    energy_efficiency: 0.9,
    judge_acceptance: 1,
    subtype_check: 0.6,
  },
  policyVersion: 'scoring-v1',
  explanation: 'Weighted sum across 5 signals under scoring-v1.',
};

const REQUIRED_KEYS = [
  'id',
  'candidateId',
  'total',
  'components',
  'policyVersion',
  'explanation',
] as const;

describe('FitnessScore — policy-versioned decomposed fitness (spec §8)', () => {
  it('fitness_score_accepts_valid_and_strict', () => {
    // spec(§8): positive guard first (lesson §10) — full 6-field score round-trips; unknown rejected;
    // each required field mandatory. EXACTLY 6 fields (no noveltyScoreId — Q3; novelty is a component).
    expect(FitnessScore.parse(validFitness)).toEqual(validFitness);
    expect(() => FitnessScore.parse({ ...validFitness, bogus: 1 })).toThrow();
    // a dedicated noveltyScoreId field is NOT part of the frozen set (Q3 — the link is P0.10's job).
    expect(() => FitnessScore.parse({ ...validFitness, noveltyScoreId: 'nov_1' })).toThrow();
    for (const k of REQUIRED_KEYS) {
      const clone: Record<string, unknown> = { ...validFitness };
      delete clone[k];
      expect(() => FitnessScore.parse(clone), `missing ${k}`).toThrow();
    }
    expect(REQUIRED_KEYS).toHaveLength(6);
  });

  it('fitness_policyVersion_required_binds_policy', () => {
    // spec(§8/§3, rule #6): policyVersion is REQUIRED — a FitnessScore without it is rejected — and is
    // typed IDENTICALLY to ScoringPolicy.version (both z.string().min(1)), so a score binds to the
    // exact policy that produced it. Weakening this to optional would be a safety regression.
    const noVersion: Record<string, unknown> = { ...validFitness };
    delete noVersion.policyVersion;
    expect(() => FitnessScore.parse(noVersion)).toThrow();
    expect(() => FitnessScore.parse({ ...validFitness, policyVersion: '' })).toThrow();
    // identical typing: the same version string is valid for BOTH FitnessScore.policyVersion and
    // ScoringPolicy.version (the binding), and '' is rejected by both.
    const v = 'scoring-v7';
    expect(FitnessScore.parse({ ...validFitness, policyVersion: v }).policyVersion).toBe(v);
    expect(ScoringPolicy.parse({ version: v, weights: {} }).version).toBe(v);
    expect(() => ScoringPolicy.parse({ version: '', weights: {} })).toThrow();
  });

  it('fitness_components_decomposed', () => {
    // spec(§8): components is an open name→number record carrying the decomposed signals (critic,
    // subtype-check, novelty, energy-efficiency, held-out-judge acceptance) so selection is
    // explainable from persisted events; keys open (Q4 — evolves with policy versions, lesson §6).
    expect(FitnessScore.parse({ ...validFitness, components: {} }).components).toEqual({});
    expect(() => FitnessScore.parse({ ...validFitness, components: { critic: 'x' } })).toThrow();
    expect(() => FitnessScore.parse({ ...validFitness, components: 'notrecord' })).toThrow();
    expect(FitnessScore.parse({ ...validFitness, total: -1.2 }).total).toBe(-1.2); // permissive (Q9)
    expect(() => FitnessScore.parse({ ...validFitness, total: 'high' })).toThrow();
  });
});
