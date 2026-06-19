import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { RunCaps } from "../run-caps.js";

describe(`${spec("§4")} RunCaps`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(RunCaps)).toMatchInlineSnapshot(`
      [
        "energyBudget",
        "maxGenerations",
        "maxPopulation",
        "maxSpawnDepth",
        "maxToolCalls",
        "wallClockTimeoutMs",
      ]
    `);
  });

  test("parses with all positive ints", () => {
    const c = {
      maxPopulation: 8,
      maxGenerations: 5,
      energyBudget: 10_000,
      maxSpawnDepth: 3,
      maxToolCalls: 50,
      wallClockTimeoutMs: 600_000,
    };
    expect(RunCaps.parse(c)).toEqual(c);
  });

  test("rejects zero on any cap", () => {
    expect(() =>
      RunCaps.parse({
        maxPopulation: 0,
        maxGenerations: 5,
        energyBudget: 10_000,
        maxSpawnDepth: 3,
        maxToolCalls: 50,
        wallClockTimeoutMs: 600_000,
      }),
    ).toThrow();
  });

  test("rejects negatives", () => {
    expect(() =>
      RunCaps.parse({
        maxPopulation: -1,
        maxGenerations: 5,
        energyBudget: 10_000,
        maxSpawnDepth: 3,
        maxToolCalls: 50,
        wallClockTimeoutMs: 600_000,
      }),
    ).toThrow();
  });

  test("rejects non-integers", () => {
    expect(() =>
      RunCaps.parse({
        maxPopulation: 1.5,
        maxGenerations: 5,
        energyBudget: 10_000,
        maxSpawnDepth: 3,
        maxToolCalls: 50,
        wallClockTimeoutMs: 600_000,
      }),
    ).toThrow();
  });

  test("rejects extra fields (.strict())", () => {
    expect(() =>
      RunCaps.parse({
        maxPopulation: 8,
        maxGenerations: 5,
        energyBudget: 10_000,
        maxSpawnDepth: 3,
        maxToolCalls: 50,
        wallClockTimeoutMs: 600_000,
        bogus: 1,
      }),
    ).toThrow();
  });
});
