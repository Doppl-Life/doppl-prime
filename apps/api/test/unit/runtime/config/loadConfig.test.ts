import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../../../src/runtime/config/loadConfig';
import type { AppConfig, LoadConfigInput } from '../../../../src/runtime/config/loadConfig';
import { DEFAULT_COST_MAP } from '../../../../src/runtime/energy/costMap';

/**
 * P3.1 boot config loader (ARCHITECTURE.md §5/§15/§14, KEY SAFETY RULE #4 credential boundary).
 *
 * `loadConfig({ env, fileSources })` composes the canonical validators (validateRunConfig P0.3,
 * loadModelRegistry + assertProviderCredentials P2.2) + scoring-policy/caps/problem-set Zod validation
 * into a single deep-frozen immutable AppConfig. Fail-fast field-pointing errors; defaults < file < env
 * precedence; credentials env-only + never echoed (path+code errors). Pure over injected sources
 * (IO — file read + process.env — is the boot caller's job, LESSON 4).
 */

// Low-entropy non-secret credential markers (mirrors registry.test; clears the secrets guard).
const VALID_ENV: Record<string, string | undefined> = {
  OPENROUTER_API_KEY: 'or-key',
  OPENAI_API_KEY: 'oai-key',
  DATABASE_URL: 'postgres://localhost/db',
};

function load(overrides: Partial<LoadConfigInput> = {}): AppConfig {
  return loadConfig({
    env: { ...VALID_ENV, ...(overrides.env ?? {}) },
    fileSources: overrides.fileSources ?? {},
  });
}

describe('loadConfig — valid composition + immutability (§5)', () => {
  // spec(§5) — a valid env + (empty → all-defaults) file set returns a composed AppConfig with all five
  // parts present; the returned object is deep-frozen (positive guard).
  test('loadConfig_valid_returns_frozen_appconfig', () => {
    const cfg = load();
    expect(cfg.runConfig).toBeDefined();
    expect(cfg.registry).toBeDefined();
    expect(cfg.scoringPolicy).toBeDefined();
    expect(cfg.caps).toBeDefined();
    expect(Array.isArray(cfg.problemSets)).toBe(true);
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  // spec(§5) — the AppConfig is DEEP-frozen: a mutation attempt on a nested field throws (ESM strict)
  // and nested objects/arrays are frozen too — downstream kernel code cannot mutate boot config.
  test('loadConfig_appconfig_is_immutable', () => {
    const cfg = load();
    expect(Object.isFrozen(cfg.caps)).toBe(true);
    expect(Object.isFrozen(cfg.runConfig)).toBe(true);
    expect(Object.isFrozen(cfg.problemSets)).toBe(true);
    expect(() => {
      (cfg.caps as { maxPopulation: number }).maxPopulation = 999;
    }).toThrow();
  });
});

describe('loadConfig — fail-fast field-pointing (§15)', () => {
  // spec(§15) — an invalid config source aborts boot with a field-pointing error (path), no partial
  // config returned.
  test('loadConfig_invalid_source_fails_fast_field_pointing', () => {
    expect(load().scoringPolicy).toBeDefined(); // positive guard
    expect(() => load({ fileSources: { scoringPolicy: { version: '', weights: {} } } })).toThrow(
      /version/,
    );
  });

  // spec(caps) — a RunCaps default that's out of bounds (non-positive) aborts boot (RunCaps violation),
  // naming the offending cap.
  test('loadConfig_runcaps_defaults_out_of_bounds_rejected', () => {
    expect(load().caps.maxPopulation).toBeGreaterThan(0); // positive guard
    expect(() => load({ fileSources: { caps: { energyBudget: 0 } } })).toThrow(/energyBudget/);
  });
});

describe('loadConfig — required env fail-fast (§14)', () => {
  // spec(§14) — a missing required credential var aborts boot naming the VAR (via
  // assertProviderCredentials), never starting partially.
  test('loadConfig_missing_required_env_names_var', () => {
    expect(() => load()).not.toThrow(); // positive guard
    expect(() => load({ env: { OPENROUTER_API_KEY: undefined } })).toThrow(/OPENROUTER_API_KEY/);
  });
});

describe('loadConfig — precedence defaults < file < env (§15)', () => {
  // spec(§15) — for an overridable key set in all three layers, env wins over file over defaults; an
  // array override REPLACES (not merges).
  test('loadConfig_precedence_env_over_file_over_defaults', () => {
    const defaultPop = load().caps.maxPopulation;
    const fileOnly = load({ fileSources: { caps: { maxPopulation: 20 } } });
    expect(fileOnly.caps.maxPopulation).toBe(20); // file beats defaults
    expect(fileOnly.caps.maxPopulation).not.toBe(defaultPop);

    const fileAndEnv = load({
      fileSources: { caps: { maxPopulation: 20 } },
      env: { DOPPL_MAX_POPULATION: '30' },
    });
    expect(fileAndEnv.caps.maxPopulation).toBe(30); // env beats file

    // array replaced, not merged: a file enabledSubtypes replaces the default set wholesale.
    const arr = load({
      fileSources: { runConfig: { enabledSubtypes: ['cross_domain_transfer'] } },
    });
    expect(arr.runConfig.enabledSubtypes).toEqual(['cross_domain_transfer']);
  });

  // spec(§14) rule #4 — the env→config projection is a CLOSED explicit allowlist, NOT a prefix sweep:
  // a non-allowlisted env key (incl. a secret-shaped one) is NEVER projected into AppConfig — so no
  // future env var can inject itself (or a secret) into config by naming convention.
  test('loadConfig_env_projection_is_closed_allowlist', () => {
    const cfg = load({
      env: {
        DOPPL_NOT_A_REAL_KNOB: 'should-not-appear',
        DOPPL_SECRET_X: 'env-injection-marker',
        SOME_OTHER_VAR: 'also-ignored',
      },
    });
    const serialized = JSON.stringify(cfg);
    expect(serialized).not.toContain('should-not-appear');
    expect(serialized).not.toContain('env-injection-marker');
    expect(serialized).not.toContain('also-ignored');
  });
});

describe('loadConfig — credential boundary (rule #4 / LESSON 26+27)', () => {
  // spec(§14) rule #4 — the returned AppConfig carries NO credential value anywhere (creds are env-only,
  // consumed by assertProviderCredentials + never merged into a config object).
  test('loadConfig_no_credential_in_config_object', () => {
    const cfg = load({
      env: {
        OPENROUTER_API_KEY: 'router-cred-marker',
        OPENAI_API_KEY: 'openai-cred-marker',
        DATABASE_URL: 'db-cred-marker',
      },
    });
    const serialized = JSON.stringify(cfg);
    expect(serialized).not.toContain('router-cred-marker');
    expect(serialized).not.toContain('openai-cred-marker');
    expect(serialized).not.toContain('db-cred-marker');
  });

  // spec(§14) rule #4 / LESSON 26 — a config source whose offending value is secret-shaped aborts with a
  // path-pointing error that names the field path but NEVER echoes the value.
  test('loadConfig_error_does_not_echo_secret', () => {
    const leaky = 'caller-config-secret-value';
    const err = (() => {
      try {
        load({ fileSources: { scoringPolicy: { version: 'v1', weights: { grounding: leaky } } } });
        return undefined;
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err).toBeDefined();
    expect(err?.message).toContain('weights'); // the field path — debuggable
    expect(err?.message).not.toContain(leaky); // the value — never echoed
  });
});

describe('loadConfig — cost map composition (§4/§5) [kernel-027]', () => {
  // spec(§4/§5) — an empty file set boots on the DEFAULT_COST_MAP defaults layer; config.costMap
  // deep-equals the canonical default (by value — Zod parse returns a fresh object, not the same ref).
  test('loadConfig_composes_costmap_from_defaults', () => {
    expect(load().costMap).toEqual(DEFAULT_COST_MAP);
  });

  // spec(§5) — defaults < file: a partial file override merges over the defaults (siblings preserved).
  test('costmap_file_overrides_merge_over_defaults', () => {
    const cfg = load({ fileSources: { costMap: { tokensPerUnit: 500 } } });
    expect(cfg.costMap).toEqual({ tokensPerUnit: 500, perToolCall: 5, perSpawn: 50 });
  });

  // spec(§5) — the composed cost map is DEEP-frozen like the rest of AppConfig; mutation throws (ESM
  // strict) — the loop (P3.10) gets one immutable handle.
  test('costmap_is_deep_frozen', () => {
    const cfg = load();
    expect(cfg.costMap).toEqual(DEFAULT_COST_MAP); // positive guard — fails loud if costMap is absent
    // (Object.isFrozen(undefined)===true + mutating undefined throws would otherwise pass vacuously).
    expect(Object.isFrozen(cfg.costMap)).toBe(true);
    expect(() => {
      (cfg.costMap as { tokensPerUnit: number }).tokensPerUnit = 999;
    }).toThrow();
  });

  // spec(§4/§15) rule #4 / LESSON 26 — an invalid cost-map aborts boot fast: tokensPerUnit is a divisor
  // (0/negative illegal), perToolCall nonnegative; the error names the field path but NEVER echoes the
  // value (a distinctive bad value stays out of the message).
  test('invalid_costmap_rejected_at_boot', () => {
    expect(load().costMap.tokensPerUnit).toBeGreaterThan(0); // positive guard
    expect(() => load({ fileSources: { costMap: { tokensPerUnit: 0 } } })).toThrow(/cost-map/);
    expect(() => load({ fileSources: { costMap: { perToolCall: -1 } } })).toThrow(/cost-map/);
    // no-value-echo: a distinctive invalid value (non-int) names the path, not the value.
    const leaky = 'costmap-secret-marker';
    const err = (() => {
      try {
        load({ fileSources: { costMap: { tokensPerUnit: leaky } } });
        return undefined;
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err?.message).toContain('tokensPerUnit'); // the field path — debuggable
    expect(err?.message).not.toContain(leaky); // the value — never echoed
  });
});
