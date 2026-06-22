import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { importKernelRunFile, writeKernelRunArtifact } from "../src/server/importers/kernelRunMarkdown";
import { readVaultIndex } from "../src/server/vaultReader";

async function seedVault(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "calibrator-kernel-run-"));
  const caseRoot = join(root, "cases", "fsd-accident-economy");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(caseRoot, { recursive: true }));
  await writeFile(
    join(caseRoot, "case.md"),
    [
      "---",
      "artifact_type: case",
      "case_id: fsd-accident-economy",
      "title: FSD Accident Economy",
      "---",
      "",
      "# Case",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(caseRoot, "problem.md"),
    [
      "---",
      "artifact_type: problem",
      "case_id: fsd-accident-economy",
      "rating_target: context_only",
      "source: fixture",
      "---",
      "",
      "# Stated context",
      "",
    ].join("\n"),
    "utf8",
  );
  return root;
}

describe("kernel run importer", () => {
  it("writes canonical run markdown from the kernel JSON contract", async () => {
    const vaultRoot = await seedVault();
    const outputPath = await writeKernelRunArtifact(vaultRoot, {
      schema_version: "calibrator-kernel-run-v1",
      case_id: "fsd-accident-economy",
      run_artifact_id: "dalton-fsd-run-001",
      source_status: "live_run",
      kernel: "dalton",
      branch: "dalton",
      run_id: "run_001",
      source_commit: "abc123",
      trace: ["case loaded", "problem recovered", "doppl drafted"],
      discovery: "The crash economy has revenue dependencies that can break when crashes decline.",
      problem_recovery: {
        title: "Crash Economy Demand Shock",
        body: "The recovered problem is institutional exposure to fewer crash events.",
      },
      solution: {
        title: "Exposure Ledger",
        body: "Map institutions by crash-linked revenue and plan transition pathways.",
      },
    });

    const written = await readFile(outputPath, "utf8");
    expect(written).toContain("artifact_type: kernel_case_run");
    expect(written).toContain("problem_recovery_title: Crash Economy Demand Shock");
    expect(written).toContain("solution_title: Exposure Ledger");
    expect(written).toContain("# Trace");
    expect(written).toContain("1. case loaded");
    expect(written).toContain("# Problem Recovery");
    expect(written).toContain("# Doppl");

    const index = await readVaultIndex(vaultRoot);
    const importedCase = index.cases[0];
    expect(importedCase.problem_recoveries[0]).toMatchObject({
      problem_recovery_id: "dalton-fsd-run-001__problem_recovery",
      title: "Crash Economy Demand Shock",
      run_id: "run_001",
    });
    expect(importedCase.solutions[0]).toMatchObject({
      solution_id: "dalton-fsd-run-001__solution",
      title: "Exposure Ledger",
      stage: "doppl",
      kernel: "dalton",
    });
  });

  it("imports a single JSON file through the CLI helper", async () => {
    const vaultRoot = await seedVault();
    const inputPath = join(vaultRoot, "kernel-output.json");
    await writeFile(
      inputPath,
      JSON.stringify({
        schema_version: "calibrator-kernel-run-v1",
        case_id: "fsd-accident-economy",
        run_artifact_id: "dalton-fsd-run-002",
        trace: "single trace paragraph",
        problem_recovery: {
          body: "Recovered problem text.",
        },
      }),
      "utf8",
    );

    const paths = await importKernelRunFile(inputPath, vaultRoot);
    expect(paths).toHaveLength(1);
    const written = await readFile(paths[0], "utf8");
    expect(written).toContain("run_artifact_id: dalton-fsd-run-002");
    expect(written).toContain("# Problem Recovery");
    expect(written).not.toContain("# Doppl");
  });
});
