import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { ScoringPolicy } from "../scoring-policy.js";

describe(`${spec("§8")} ScoringPolicy (structure frozen, weight values deferred-open)`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(ScoringPolicy)).toMatchInlineSnapshot(`
      [
        "normalization",
        "version",
        "weights",
      ]
    `);
  });

  test("accepts any record-of-number for weights (values deliberately deferred-open)", () => {
    expect(
      ScoringPolicy.parse({
        version: "v1",
        weights: { a: 0.4, b: 0.3, c: 0.3 },
      }),
    ).toBeDefined();
  });

  test("accepts an optional normalization label", () => {
    expect(
      ScoringPolicy.parse({
        version: "v1",
        weights: {},
        normalization: "softmax",
      }),
    ).toBeDefined();
  });

  test("rejects non-numeric weight values", () => {
    expect(() => ScoringPolicy.parse({ version: "v1", weights: { a: "high" } })).toThrow();
  });
});
