import { describe, expect, it } from "vitest";
import { RatingSubmission, SolutionFrontmatter } from "../src/server/vaultSchemas";

describe("vault schemas", () => {
  it("accepts a valid solution frontmatter object", () => {
    expect(
      SolutionFrontmatter.parse({
        artifact_type: "solution",
        case_id: "fsd-accident-economy",
        solution_id: "cody-accident-economy-map",
        title: "Crash Substrate Exposure Map",
        source_type: "kernel",
        kernel: "cody",
        branch: "cody",
        created_at: "2026-06-22T00:00:00.000Z",
      }),
    ).toMatchObject({ solution_id: "cody-accident-economy-map" });
  });

  it("rejects ratings outside the -5 to +5 range", () => {
    expect(() =>
      RatingSubmission.parse({
        case_id: "fsd-accident-economy",
        solution_id: "cody-accident-economy-map",
        score: 6,
        notes: "",
      }),
    ).toThrow();
  });
});
