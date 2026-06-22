import { describe, expect, it } from "vitest";
import { importCodyRuntime, importMelissaRuntime } from "../src/server/importers/runtimeBranchAdapters";

const input = {
  caseId: "fsd-accident-economy",
  comparisonSetId: "fsd-accident-economy-v0",
  comparisonInputHash: "sha256:fixture-fsd-accident-economy-v0",
  comparisonInputPaths: ["case.md", "problem.md"],
};

describe("runtime branch adapters", () => {
  it("imports Cody runtime provenance as unavailable when no direct case export exists", async () => {
    const result = await importCodyRuntime(input);
    expect(result.source).toBe("cody");
    expect(result.artifacts[0]).toMatchObject({
      solution_id: "cody-runtime-branch-import",
      source_status: "unavailable",
      adapter_version: "runtime-branch-provenance-adapter-v0",
      kernel: "cody",
    });
    expect(result.artifacts[0]?.body).toContain("absence of a direct exported solution");
  });

  it("imports Melissa runtime provenance as unavailable when no direct case export exists", async () => {
    const result = await importMelissaRuntime(input);
    expect(result.source).toBe("melissa");
    expect(result.artifacts[0]).toMatchObject({
      solution_id: "melissa-runtime-branch-import",
      source_status: "unavailable",
      adapter_version: "runtime-branch-provenance-adapter-v0",
      kernel: "melissa",
    });
    expect(result.artifacts[0]?.body).toContain("absence of a direct exported solution");
  });
});
