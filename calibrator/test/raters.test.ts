import { describe, expect, it } from "vitest";
import { ALLOWED_RATERS, isAllowedRater, normalizeRaterEmail } from "../src/raters";

describe("rater registry", () => {
  it("exports the deduped allow-list", () => {
    expect(ALLOWED_RATERS).toHaveLength(63);
    expect(new Set(ALLOWED_RATERS).size).toBe(ALLOWED_RATERS.length);
  });

  it("normalizes casing and whitespace", () => {
    expect(normalizeRaterEmail("  Dalton.Dinderman@Challenger.GauntletAI.com ")).toBe(
      "dalton.dinderman@challenger.gauntletai.com",
    );
  });

  it("recognizes allow-listed raters only", () => {
    expect(isAllowedRater(" MELISSA.HARGIS@CHALLENGER.GAUNTLETAI.COM ")).toBe(true);
    expect(isAllowedRater("not-on-the-list@example.com")).toBe(false);
  });
});
