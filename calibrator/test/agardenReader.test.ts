import { describe, expect, it } from "vitest";
import { defaultAgardenRoot } from "../src/server/vaultPaths";
import { readAgardenIndex } from "../src/server/agardenReader";

describe("readAgardenIndex", () => {
  it("reads top-level aGarden case studies into the calibrator index", async () => {
    const index = await readAgardenIndex(defaultAgardenRoot);
    expect(index.source_kind).toBe("agarden");
    expect(index.cases.map((item) => item.case_id)).toEqual(expect.arrayContaining([
      "fsd-ownership-unwind-0caef8e3",
      "houston-baggage-claim-complaints-57251c2c",
      "when-the-crashes-dont-come-575845a4",
    ]));
    expect(index.cases.map((item) => item.title)).toContain("Houston Baggage Claim Complaints");
  });

  it("recursively attaches judgeable problem recoveries and doppls under their root case", async () => {
    const index = await readAgardenIndex(defaultAgardenRoot);
    const crashCase = index.cases.find((item) => item.case_id === "when-the-crashes-dont-come-575845a4");
    expect(crashCase?.problem_recoveries.map((item) => item.node_id)).toContain(
      "actuarial-collapse-in-specialty-auto-reinsurance-59cd965f",
    );
    expect(crashCase?.solutions.map((item) => item.node_id)).toContain(
      "frequency-to-probability-underwriting-cliff-1bce2c97",
    );

    const recovery = crashCase?.problem_recoveries.find(
      (item) => item.node_id === "actuarial-collapse-in-specialty-auto-reinsurance-59cd965f",
    );
    expect(recovery).toMatchObject({
      case_id: "when-the-crashes-dont-come-575845a4",
      problem_recovery_id: "actuarial-collapse-in-specialty-auto-reinsurance-59cd965f",
      title: "Actuarial Collapse in Specialty Auto Reinsurance",
      parent_ids: ["when-the-crashes-dont-come-575845a4"],
      ledger_path: "ratings-ledger.json",
      source_type: "kernel",
      source_status: "imported",
      scores: { judge: 2, human: null, n: 0 },
    });

    const doppl = crashCase?.solutions.find(
      (item) => item.node_id === "frequency-to-probability-underwriting-cliff-1bce2c97",
    );
    expect(doppl).toMatchObject({
      case_id: "when-the-crashes-dont-come-575845a4",
      solution_id: "frequency-to-probability-underwriting-cliff-1bce2c97",
      stage: "doppl",
      parent_ids: ["actuarial-collapse-in-specialty-auto-reinsurance-59cd965f"],
      ledger_path: "ratings-ledger.json",
      source_type: "kernel",
      source_status: "imported",
    });
  });

  it("keeps empty cases visible even before they have generated children", async () => {
    const index = await readAgardenIndex(defaultAgardenRoot);
    const houstonCase = index.cases.find((item) => item.case_id === "houston-baggage-claim-complaints-57251c2c");
    expect(houstonCase).toMatchObject({
      title: "Houston Baggage Claim Complaints",
      problem_recoveries: [],
      solutions: [],
    });
  });
});
