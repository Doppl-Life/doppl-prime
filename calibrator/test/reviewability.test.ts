import { describe, expect, it } from "vitest";
import { canSubmitRating, reviewMode, reviewModeLabel } from "../src/reviewability";
import type { CalibratorSolution } from "../src/types";

function solution(source_status: CalibratorSolution["source_status"]): CalibratorSolution {
  return {
    case_id: "case",
    solution_id: `solution-${source_status}`,
    title: "Solution",
    source_type: "kernel",
    source_status,
    body: "Body",
    human_ratings: [],
  };
}

describe("reviewability", () => {
  it("treats imported and live run artifacts as primary rating targets", () => {
    expect(reviewMode(solution("imported"))).toBe("primary");
    expect(reviewMode(solution("live_run"))).toBe("primary");
    expect(canSubmitRating(solution("imported"))).toBe(true);
    expect(canSubmitRating(solution("live_run"))).toBe(true);
  });

  it("keeps fixture, pending, unavailable, and unknown artifacts audit-only", () => {
    expect(reviewMode(solution("fixture"))).toBe("audit");
    expect(reviewMode(solution("pending"))).toBe("audit");
    expect(reviewMode(solution("unavailable"))).toBe("audit");
    expect(reviewMode(solution(undefined))).toBe("audit");
    expect(canSubmitRating(solution("fixture"))).toBe(false);
    expect(reviewModeLabel(solution("unavailable"))).toBe("unavailable");
  });
});
