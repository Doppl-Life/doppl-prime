import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { CRITIC_INPUT_DELIMITER, CriticInput } from "../critic-input.js";

describe(`${spec("§14")} CriticInput (prompt-injection isolation seam)`, () => {
  test("field-name set is frozen — distinct trusted vs untrusted fields", () => {
    expect(fieldset(CriticInput)).toMatchInlineSnapshot(`
      [
        "trustedRubric",
        "untrustedCandidate",
      ]
    `);
  });

  test("CRITIC_INPUT_DELIMITER is exported and stable", () => {
    expect(CRITIC_INPUT_DELIMITER).toBe("<<<CANDIDATE>>>");
  });

  test("accepts both fields", () => {
    expect(CriticInput.parse({ trustedRubric: "rubric", untrustedCandidate: "candidate" })).toEqual(
      { trustedRubric: "rubric", untrustedCandidate: "candidate" },
    );
  });

  test("rejects fields that would collapse the isolation (e.g., a single 'prompt' field)", () => {
    expect(() => CriticInput.parse({ prompt: "combined" })).toThrow();
    expect(() =>
      CriticInput.parse({
        trustedRubric: "ok",
        untrustedCandidate: "ok",
        prompt: "extra",
      }),
    ).toThrow();
  });
});
