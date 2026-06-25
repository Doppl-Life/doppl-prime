import { describe, expect, it } from "vitest";
import { importMichaelMarkdown } from "../src/server/importers/michaelAdapter";

describe("importMichaelMarkdown", () => {
  it("marks the Michael branch solution unavailable when the branch no longer carries a local solution artifact", async () => {
    const result = await importMichaelMarkdown({
      caseId: "fsd-accident-economy",
      comparisonSetId: "fsd-accident-economy-v0",
      comparisonInputHash: "sha256:fixture-fsd-accident-economy-v0",
      comparisonInputPaths: ["case.md", "problem.md"],
    });

    expect(result.source).toBe("michael");
    expect(result.artifacts[0]).toMatchObject({
      solution_id: "michael-branch-solution-import",
      source_status: "unavailable",
      source_branch: "michael",
      adapter_version: "michael-markdown-adapter-v0",
      kernel: "michael",
    });
    expect(result.artifacts[0]?.body).toContain("No solution artifact was found");
  });
});
