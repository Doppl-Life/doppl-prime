import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { CheckRunnerAdapter } from "../check-runner-adapter.js";

describe(`${spec("§14")} CheckRunnerAdapter (allowlist invariant)`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(CheckRunnerAdapter)).toMatchInlineSnapshot(`
      [
        "capabilities",
        "checkType",
        "description",
        "id",
      ]
    `);
  });

  test("snapshot encodes the no-exec invariant — REQ-S-003", () => {
    const forbidden = /^(exec|execute|cmd|command|run|eval|invoke|spawn)$/i;
    const keys = fieldset(CheckRunnerAdapter);
    expect(keys.some((k) => forbidden.test(k))).toBe(false);
  });

  test("parses a registered adapter shape", () => {
    const a = {
      id: "novelty.prior_art.v1",
      checkType: "novelty_prior_art",
      capabilities: ["web-search", "embedding"],
      description: "look for nearest prior art in the corpus",
    };
    expect(CheckRunnerAdapter.parse(a)).toEqual(a);
  });

  test("rejects any field that would implicate code execution (.strict())", () => {
    expect(() =>
      CheckRunnerAdapter.parse({
        id: "x",
        checkType: "y",
        capabilities: [],
        description: "",
        execute: "rm -rf /",
      }),
    ).toThrow();
  });
});
