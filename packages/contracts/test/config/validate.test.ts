// P0.3 — pure boot config validation. spec(§15): config Zod-validated at startup; precedence
// defaults < file < env; fail-fast with a field-identifying error. The validator is PURE over its
// `sources` arg — file/env READING happens at the boot layer (env-less contracts package, §9).
import { describe, it, expect } from 'vitest';
import { validateRunConfig } from '@doppl/contracts';

const validCaps = {
  maxPopulation: 10,
  maxGenerations: 5,
  energyBudget: 100000,
  maxSpawnDepth: 4,
  maxToolCalls: 50,
  wallClockTimeoutMs: 600000,
};

const baseConfig = {
  seed: 'scenario-alpha',
  enabledSubtypes: ['cross_domain_transfer'],
  caps: validCaps,
  modelProfile: 'mvp-default',
  scoringPolicyVersion: 'v1',
  rngSeed: 42,
};

describe('validateRunConfig — pure merge + validate (spec §15)', () => {
  it('validate_applies_precedence_defaults_lt_file_lt_env', () => {
    // spec(§15): per top-level field, env overrides file overrides defaults.
    const result = validateRunConfig({
      defaults: { ...baseConfig, modelProfile: 'from-defaults', scoringPolicyVersion: 'd' },
      file: { modelProfile: 'from-file', scoringPolicyVersion: 'f' },
      env: { modelProfile: 'from-env' },
    });
    expect(result.modelProfile).toBe('from-env'); // env wins
    expect(result.scoringPolicyVersion).toBe('f'); // file wins over defaults
    expect(result.seed).toBe('scenario-alpha'); // only defaults provides it
  });

  it('validate_deep_merges_nested_caps', () => {
    // spec(§15): nested objects deep-merge across layers — a layer overriding ONE cap keeps the
    // other five from the lower layer (config layering is field-level, not wholesale replace).
    const result = validateRunConfig({
      defaults: baseConfig, // full caps
      file: { caps: { maxGenerations: 99 } }, // override ONE cap (partial caps)
      env: {},
    });
    expect(result.caps.maxGenerations).toBe(99); // overridden by file
    expect(result.caps.maxPopulation).toBe(10); // preserved from defaults
    expect(result.caps.energyBudget).toBe(100000); // preserved from defaults
    // arrays REPLACE wholesale (not concat/deep-merge): a higher layer's array wins outright.
    const arrResult = validateRunConfig({
      defaults: {
        ...baseConfig,
        enabledSubtypes: ['cross_domain_transfer', 'zeitgeist_synthesis'],
      },
      file: {},
      env: { enabledSubtypes: ['cross_domain_transfer'] },
    });
    expect(arrResult.enabledSubtypes).toEqual(['cross_domain_transfer']);
  });

  it('validate_merge_does_not_pollute_prototype', () => {
    // defense-in-depth (§14 posture): a __proto__/constructor key in a config source must not
    // pollute Object.prototype during the deep merge, and the result keeps a clean prototype.
    const malicious = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"hacked":1}}',
    ) as Record<string, unknown>;
    const result = validateRunConfig({ defaults: baseConfig, file: malicious, env: {} });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).hacked).toBeUndefined();
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result).toEqual(baseConfig); // the bogus keys are ignored, config is unchanged
  });

  it('validate_throws_field_identifying_error_on_invalid', () => {
    // spec(§15): an invalid merged field fails fast with the offending path in the message.
    expect(() =>
      validateRunConfig({
        defaults: baseConfig,
        file: { caps: { ...validCaps, maxPopulation: -1 } },
        env: {},
      }),
    ).toThrow(/maxPopulation/);
  });

  it('validate_returns_typed_runconfig_on_valid', () => {
    // spec(§15): a valid merge returns a parsed RunConfig.
    const result = validateRunConfig({ defaults: baseConfig, file: {}, env: {} });
    expect(result).toEqual(baseConfig);
  });

  it('validate_is_pure_no_io', () => {
    // spec(§15): pure over `sources` — a process.env var matching a config field has no effect
    // (§9 boundary-loads principle: file/env reading lives at the boot layer, not in contracts).
    process.env.modelProfile = 'tampered-from-process-env';
    try {
      const result = validateRunConfig({ defaults: baseConfig, file: {}, env: {} });
      expect(result.modelProfile).toBe('mvp-default'); // from sources.defaults, never process.env
    } finally {
      delete process.env.modelProfile;
    }
  });
});
