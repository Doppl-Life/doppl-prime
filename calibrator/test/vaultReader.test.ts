import { describe, expect, it } from "vitest";
import { defaultVaultRoot } from "../src/server/vaultPaths";
import { readVaultIndex } from "../src/server/vaultReader";

describe("readVaultIndex", () => {
  it("loads fsd-accident-economy with three seed solutions", async () => {
    const index = await readVaultIndex(defaultVaultRoot);
    const item = index.cases.find((caseItem) => caseItem.case_id === "fsd-accident-economy");
    expect(item?.title).toBe("When the Crashes Don't Come");
    expect(item?.solutions.map((solution) => solution.solution_id).sort()).toEqual([
      "cody-accident-economy-map",
      "melissa-accident-economy-map",
      "michael-accident-economy-assay",
    ]);
  });
});
