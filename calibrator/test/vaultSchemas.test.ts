import { describe, expect, it } from "vitest";
import { RatingFrontmatter, RatingSubmission, SolutionFrontmatter } from "../src/server/vaultSchemas";

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

  it("accepts a garden-native doppl frontmatter object", () => {
    expect(
      SolutionFrontmatter.parse({
        artifact_type: "doppl",
        case_id: "fsd-accident-economy",
        solution_id: "dalton-doppl-leaf",
        title: "Crash Transition Ledger",
        stage: "doppl",
        temporal: true,
        next: "terminal",
        scores: { judge: 4, human: 3, n: 2 },
        source_type: "kernel",
        output_class: "doppl",
      }),
    ).toMatchObject({
      artifact_type: "doppl",
      stage: "doppl",
      output_class: "doppl",
    });
  });

  it("rejects rating submissions outside the 0 to 10 range", () => {
    expect(() =>
      RatingSubmission.parse({
        case_id: "fsd-accident-economy",
        rating_target: "solution",
        solution_id: "cody-accident-economy-map",
        score: -1,
        notes: "",
      }),
    ).toThrow();
    expect(() =>
      RatingSubmission.parse({
        case_id: "fsd-accident-economy",
        rating_target: "solution",
        solution_id: "cody-accident-economy-map",
        score: 11,
        notes: "",
      }),
    ).toThrow();
  });

  it("accepts a problem recovery rating submission", () => {
    expect(
      RatingSubmission.parse({
        case_id: "fsd-accident-economy",
        rating_target: "problem_recovery",
        problem_recovery_id: "pr_fsd_accident_economy",
        node_id: "agarden-node-123",
        score: 4,
        notes: "Recovered the real economic dependency problem.",
      }),
    ).toMatchObject({
      rating_target: "problem_recovery",
      problem_recovery_id: "pr_fsd_accident_economy",
      node_id: "agarden-node-123",
      score: 4,
    });
  });

  it("rejects a rating submission with an invalid reviewer email", () => {
    expect(() =>
      RatingSubmission.parse({
        case_id: "fsd-accident-economy",
        rating_target: "problem_recovery",
        problem_recovery_id: "pr_fsd_accident_economy",
        score: 4,
        reviewer_email: "unknown",
      }),
    ).toThrow();
  });

  it("accepts and normalizes any valid reviewer email", () => {
    expect(
      RatingSubmission.parse({
        case_id: "fsd-accident-economy",
        rating_target: "problem_recovery",
        problem_recovery_id: "pr_fsd_accident_economy",
        score: 4,
        reviewer_email: " MICHAEL.HABERMAS@CHALLENGER.GAUNTLETAI.COM ",
      }),
    ).toMatchObject({
      reviewer_email: "michael.habermas@challenger.gauntletai.com",
    });
  });

  it("accepts stored problem recovery rating frontmatter", () => {
    expect(
      RatingFrontmatter.parse({
        artifact_type: "human_rating",
        rating_id: "rating_problem_recovery",
        rating_target: "problem_recovery",
        case_id: "fsd-accident-economy",
        problem_recovery_id: "pr_fsd_accident_economy",
        score: 10,
        scale_min: 0,
        scale_max: 10,
        submitted_at: "2026-06-22T00:00:00.000Z",
        app_version: "calibrator-v0",
      }),
    ).toMatchObject({
      rating_target: "problem_recovery",
      problem_recovery_id: "pr_fsd_accident_economy",
    });
  });
});
