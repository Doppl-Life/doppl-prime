import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { RunConfig } from "../run-config.js";

const validConfig = {
  seed: "operator-prompt",
  enabledSubtypes: ["cross_domain_transfer", "zeitgeist_synthesis"],
  caps: {
    maxPopulation: 8,
    maxGenerations: 5,
    energyBudget: 10_000,
    maxSpawnDepth: 3,
    maxToolCalls: 50,
    wallClockTimeoutMs: 600_000,
  },
  modelProfile: "default",
  scoringPolicyVersion: "v1",
  rngSeed: "deterministic-seed-1",
};

describe(`${spec("§4")} RunConfig`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(RunConfig)).toMatchInlineSnapshot(`
      [
        "caps",
        "enabledSubtypes",
        "modelProfile",
        "rngSeed",
        "scoringPolicyVersion",
        "seed",
      ]
    `);
  });

  test("parses a valid config", () => {
    expect(RunConfig.parse(validConfig)).toEqual(validConfig);
  });

  test("requires rngSeed (deterministic replay invariant)", () => {
    const { rngSeed, ...without } = validConfig;
    void rngSeed;
    expect(() => RunConfig.parse(without)).toThrow();
  });

  test("requires at least one enabled subtype", () => {
    expect(() => RunConfig.parse({ ...validConfig, enabledSubtypes: [] })).toThrow();
  });

  test("rejects unknown subtype names", () => {
    expect(() =>
      RunConfig.parse({ ...validConfig, enabledSubtypes: ["mystery_subtype"] }),
    ).toThrow();
  });

  test("rejects extra root fields (.strict())", () => {
    expect(() => RunConfig.parse({ ...validConfig, bogus: 1 })).toThrow();
  });
});
