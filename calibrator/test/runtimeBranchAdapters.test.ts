import { describe, expect, it } from "vitest";
import { importCodyRuntime, importMelissaRuntime } from "../src/server/importers/runtimeBranchAdapters";

const input = {
  caseId: "fsd-accident-economy",
  comparisonSetId: "fsd-accident-economy-v0",
  comparisonInputHash: "sha256:fixture-fsd-accident-economy-v0",
  comparisonInputPaths: ["case.md", "problem.md"],
};

describe("runtime branch adapters", () => {
  it("does not create a Cody artifact when no direct case export exists", async () => {
    const result = await importCodyRuntime(input);
    expect(result.source).toBe("cody");
    expect(result.artifacts).toEqual([]);
  });

  it("does not create a Melissa artifact when no direct case export exists", async () => {
    const result = await importMelissaRuntime(input);
    expect(result.source).toBe("melissa");
    expect(result.artifacts).toEqual([]);
  });
});
