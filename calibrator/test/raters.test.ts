import { describe, expect, it } from "vitest";
import { isAllowedRater, normalizeRaterEmail } from "../src/raters";

describe("rater registry", () => {
  it("normalizes casing and whitespace", () => {
    expect(normalizeRaterEmail("  Dalton.Dinderman@Challenger.GauntletAI.com ")).toBe(
      "dalton.dinderman@challenger.gauntletai.com",
    );
  });

  it("accepts any valid email address as a rater", () => {
    expect(isAllowedRater(" MELISSA.HARGIS@CHALLENGER.GAUNTLETAI.COM ")).toBe(true);
    expect(isAllowedRater("not-on-the-list@example.com")).toBe(true);
    expect(isAllowedRater("not-an-email")).toBe(false);
  });
});
