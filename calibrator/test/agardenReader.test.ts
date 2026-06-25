import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    expect(recovery?.source_path).toBe(
      "flow/when-the-crashes-dont-come-575845a4/actuarial-collapse-in-specialty-auto-reinsurance-59cd965f/actuarial-collapse-in-specialty-auto-reinsurance-59cd965f.md",
    );

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
    expect(doppl?.source_path).toBe(
      "flow/when-the-crashes-dont-come-575845a4/actuarial-collapse-in-specialty-auto-reinsurance-59cd965f/frequency-to-probability-underwriting-cliff-1bce2c97/frequency-to-probability-underwriting-cliff-1bce2c97.md",
    );
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

  it("attaches ratings-ledger entries to matching aGarden nodes", async () => {
    const agardenRoot = await mkdtemp(join(tmpdir(), "agarden-reader-"));
    const caseRoot = join(agardenRoot, "flow/case-a");
    await mkdir(join(caseRoot, "problem-recovery"), { recursive: true });
    await writeFile(
      join(caseRoot, "case-a.md"),
      `---
id: case-a
stage: case_study
name: Case A
---
# Case A
`,
      "utf8",
    );
    await writeFile(
      join(caseRoot, "problem-recovery/node-pr.md"),
      `---
id: node-pr
stage: problem_recovery
name: Problem Recovery
kernel: dalton
---
# Problem Recovery

prev: [[case-a]]
`,
      "utf8",
    );
    await writeFile(
      join(agardenRoot, "ratings-ledger.json"),
      JSON.stringify(
        [
          {
            node_id: "node-pr",
            ratings: [
              {
                rater_id: "dalton.dinderman@challenger.gauntletai.com",
                score: 5,
                rate_date: "2026-06-24T16:00:00.000Z",
              },
            ],
          },
        ],
        null,
        2,
      ),
      "utf8",
    );

    const index = await readAgardenIndex(agardenRoot);
    expect(index.cases[0]?.source_paths).toEqual(["flow/case-a/case-a.md"]);
    expect(index.cases[0]?.problem_recoveries[0]?.source_path).toBe("flow/case-a/problem-recovery/node-pr.md");
    expect(index.cases[0]?.problem_recoveries[0]?.human_ratings).toEqual([
      expect.objectContaining({
        rating_id: "rating_node-pr_dalton_dinderman_challenger_gauntletai_com",
        rating_target: "problem_recovery",
        problem_recovery_id: "node-pr",
        reviewer_email: "dalton.dinderman@challenger.gauntletai.com",
        score: 5,
      }),
    ]);
  });
});
