// P0.3 — Subtype union + RunConfig strict schema. spec(§4): Appendix A RunConfig row + the closed
// Subtype union; rngSeed is the per-run seed persisted in run.configured for deterministic replay.
import { describe, it, expect } from 'vitest';
import { RunConfig, Subtype } from '@doppl/contracts';

const validCaps = {
  maxPopulation: 10,
  maxGenerations: 5,
  energyBudget: 100000,
  maxSpawnDepth: 4,
  maxToolCalls: 50,
  wallClockTimeoutMs: 600000,
};

const validConfig = {
  seed: 'scenario-alpha',
  enabledSubtypes: ['cross_domain_transfer', 'zeitgeist_synthesis'],
  caps: validCaps,
  modelProfile: 'mvp-default',
  scoringPolicyVersion: 'v1',
  rngSeed: 42,
};

const REQUIRED_CONFIG_KEYS = [
  'seed',
  'enabledSubtypes',
  'caps',
  'modelProfile',
  'scoringPolicyVersion',
  'rngSeed',
] as const;

describe('Subtype — closed candidate-subtype union (spec §4)', () => {
  it('subtype_accepts_both_members_rejects_others', () => {
    // spec(§4): exactly {cross_domain_transfer, zeitgeist_synthesis}; any other value rejected.
    expect(Subtype.parse('cross_domain_transfer')).toBe('cross_domain_transfer');
    expect(Subtype.parse('zeitgeist_synthesis')).toBe('zeitgeist_synthesis');
    expect(() => Subtype.parse('other')).toThrow();
    expect(() => Subtype.parse('')).toThrow();
  });
});

describe('RunConfig — strict run-config schema (spec §4)', () => {
  it('run_config_accepts_valid', () => {
    // spec(§4): a full config parses and round-trips (Appendix A field set).
    expect(RunConfig.parse(validConfig)).toEqual(validConfig);
  });

  it('run_config_requires_rngSeed', () => {
    // spec(§4): rngSeed is required so the per-run seed is persistable in run.configured for replay.
    const clone: Record<string, unknown> = { ...validConfig };
    delete clone.rngSeed;
    expect(() => RunConfig.parse(clone)).toThrow();
  });

  it('run_config_enabledSubtypes_min_one_and_closed', () => {
    // spec(§4): at least one enabled subtype; array members are the closed Subtype union.
    expect(() => RunConfig.parse({ ...validConfig, enabledSubtypes: [] })).toThrow();
    expect(() => RunConfig.parse({ ...validConfig, enabledSubtypes: ['nope'] })).toThrow();
  });

  it('run_config_strict_unknown_and_missing', () => {
    // spec(§4): strictObject — unknown field rejected; each required field is mandatory.
    expect(() => RunConfig.parse({ ...validConfig, bogus: 1 })).toThrow();
    for (const f of REQUIRED_CONFIG_KEYS) {
      const clone: Record<string, unknown> = { ...validConfig };
      delete clone[f];
      expect(() => RunConfig.parse(clone), `missing ${f}`).toThrow();
    }
  });
});
