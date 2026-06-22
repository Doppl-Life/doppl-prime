import { describe, expect, it } from "vitest";
import { importMichaelMarkdown } from "../src/server/importers/michaelAdapter";

describe("importMichaelMarkdown", () => {
  it("imports the fsd accident economy branch solution as pending when Michael marks it unsolved", async () => {
    const result = await importMichaelMarkdown({
      caseId: "fsd-accident-economy",
      comparisonSetId: "fsd-accident-economy-v0",
      comparisonInputHash: "sha256:fixture-fsd-accident-economy-v0",
      comparisonInputPaths: ["case.md", "problem.md"],
    });

    expect(result.source).toBe("michael");
    expect(result.artifacts[0]).toMatchObject({
      solution_id: "michael-branch-solution-import",
      source_status: "pending",
      source_branch: "michael",
      adapter_version: "michael-markdown-adapter-v0",
      kernel: "michael",
    });
    expect(result.artifacts[0]?.body).toContain("pending rather than solved");
  });
});
