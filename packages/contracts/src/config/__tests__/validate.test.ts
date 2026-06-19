import { describe, expect, test } from "vitest";
import { spec } from "../../testing/spec-tag.js";
import { ConfigValidationError, validateBootConfig } from "../validate.js";

const defaults = {
  seed: "default-seed",
  enabledSubtypes: ["cross_domain_transfer", "zeitgeist_synthesis"],
  caps: {
    maxPopulation: 4,
    maxGenerations: 3,
    energyBudget: 1_000,
    maxSpawnDepth: 2,
    maxToolCalls: 10,
    wallClockTimeoutMs: 60_000,
  },
  modelProfile: "default",
  scoringPolicyVersion: "v1",
  rngSeed: "default-rng",
};

describe(`${spec("§15")} validateBootConfig`, () => {
  test("parses a valid defaults-only config", () => {
    expect(validateBootConfig({ defaults })).toEqual(defaults);
  });

  test("file overrides defaults", () => {
    const out = validateBootConfig({
      defaults,
      fromFile: { modelProfile: "file-profile" },
    });
    expect(out.modelProfile).toBe("file-profile");
  });

  test("env overrides file (precedence: defaults < file < env)", () => {
    const out = validateBootConfig({
      defaults,
      fromFile: { modelProfile: "file-profile" },
      fromEnv: { modelProfile: "env-profile" },
    });
    expect(out.modelProfile).toBe("env-profile");
  });

  test("nested caps merge deeply (single field override preserves siblings)", () => {
    const out = validateBootConfig({
      defaults,
      fromEnv: { caps: { maxPopulation: 32 } },
    });
    expect(out.caps.maxPopulation).toBe(32);
    expect(out.caps.maxGenerations).toBe(defaults.caps.maxGenerations);
    expect(out.caps.energyBudget).toBe(defaults.caps.energyBudget);
  });

  test("throws ConfigValidationError naming the first invalid field path", () => {
    let err: unknown;
    try {
      validateBootConfig({
        defaults,
        fromEnv: { caps: { maxPopulation: 0 } },
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigValidationError);
    const e = err as ConfigValidationError;
    expect(e.field).toBe("caps.maxPopulation");
  });

  test("throws when rngSeed is missing", () => {
    const { rngSeed, ...partial } = defaults;
    void rngSeed;
    expect(() => validateBootConfig({ defaults: partial })).toThrow(ConfigValidationError);
  });

  test("throws on negative cap with a meaningful field path", () => {
    let err: unknown;
    try {
      validateBootConfig({
        defaults,
        fromEnv: { caps: { wallClockTimeoutMs: -1 } },
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigValidationError);
    expect((err as ConfigValidationError).field).toBe("caps.wallClockTimeoutMs");
  });
});
