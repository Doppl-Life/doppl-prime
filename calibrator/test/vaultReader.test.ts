import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { defaultVaultRoot } from "../src/server/vaultPaths";
import { readVaultIndex } from "../src/server/vaultReader";

describe("readVaultIndex", () => {
  it("loads fsd-accident-economy with seed and imported/provenance solutions", async () => {
    const index = await readVaultIndex(defaultVaultRoot);
    const item = index.cases.find((caseItem) => caseItem.case_id === "fsd-accident-economy");
    expect(item?.title).toBe("When the Crashes Don't Come");
    expect(item?.solutions.map((solution) => solution.solution_id).sort()).toEqual([
      "cody-accident-economy-map",
      "cody-runtime-branch-import",
      "dalton-fsd-accident-economy-001__solution",
      "melissa-accident-economy-map",
      "melissa-runtime-branch-import",
      "michael-accident-economy-assay",
      "michael-branch-solution-import",
    ]);
    expect(item?.problem_recoveries.map((problem) => problem.problem_recovery_id)).toContain(
      "pr_fsd_accident_economy_fixture",
    );
    expect(item?.problem_recoveries.map((problem) => problem.problem_recovery_id)).toContain(
      "dalton-fsd-accident-economy-001__problem_recovery",
    );
    expect(index.comparison_sets[0]).toMatchObject({
      comparison_set_id: "fsd-accident-economy-v0",
      status: "fixture_only",
    });
    expect(item?.solutions[0]).toMatchObject({
      comparison_set_id: "fsd-accident-economy-v0",
      source_status: "fixture",
      adapter_version: "calibrator-comparison-v0",
    });
    expect(item?.solutions[0]?.human_ratings).toEqual([]);
  });

  it("attaches rating markdown to the matching solution", async () => {
    const vaultRoot = join(tmpdir(), `calibrator-vault-${Date.now()}`);
    const caseRoot = join(vaultRoot, "cases/fsd-case");
    await mkdir(join(vaultRoot, "comparison-sets"), { recursive: true });
    await mkdir(join(caseRoot, "solutions"), { recursive: true });
    await mkdir(join(caseRoot, "ratings"), { recursive: true });
    await writeFile(
      join(vaultRoot, "comparison-sets/fsd-case-v0.md"),
      [
        "---",
        "artifact_type: comparison_set",
        "comparison_set_id: fsd-case-v0",
        "case_id: fsd-case",
        "title: FSD Case Comparison",
        "status: fixture_only",
        "input_hash: sha256:fixture",
        "input_paths: []",
        "adapter_version: test-adapter-v0",
        "---",
        "",
        "# Comparison",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(caseRoot, "case.md"),
      [
        "---",
        "artifact_type: case",
        "case_id: fsd-case",
        "title: FSD Case",
        "source_paths: []",
        "visibility: internal",
        "---",
        "",
        "# Case",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(caseRoot, "problem.md"),
      [
        "---",
        "artifact_type: problem",
        "case_id: fsd-case",
        "rating_target: context_only",
        "source: fixture",
        "---",
        "",
        "# Problem",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(caseRoot, "solutions/cody.md"),
      [
        "---",
        "artifact_type: solution",
        "case_id: fsd-case",
        "solution_id: cody",
        "title: Cody Solution",
        "source_type: kernel",
        "comparison_set_id: fsd-case-v0",
        "source_status: fixture",
        "adapter_version: test-adapter-v0",
        "kernel: cody",
        "judge_score: 3",
        "---",
        "",
        "# Solution",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(caseRoot, "ratings/rating.md"),
      [
        "---",
        "artifact_type: human_rating",
        "rating_id: rating_fixture",
        "rating_target: solution",
        "case_id: fsd-case",
        "solution_id: cody",
        "score: 5",
        "verdict: keeper",
        "phase: solution_discovery",
        "target_kind: solution",
        "scale_min: -5",
        "scale_max: 5",
        "submitted_at: 2026-06-22T12:00:00.000Z",
        "app_version: calibrator-v0",
        "---",
        "",
        "## Notes",
        "",
        "Excellent.",
      ].join("\n"),
      "utf8",
    );

    const index = await readVaultIndex(vaultRoot);
    expect(index.cases[0]?.solutions[0]?.human_ratings).toMatchObject([
      {
        rating_id: "rating_fixture",
        score: 5,
        verdict: "keeper",
        body: "## Notes\n\nExcellent.",
      },
    ]);
  });

  it("indexes canonical run markdown as problem recovery and solution artifacts", async () => {
    const vaultRoot = join(tmpdir(), `calibrator-vault-run-${Date.now()}`);
    const caseRoot = join(vaultRoot, "cases/fsd-accident-economy");
    await mkdir(join(vaultRoot, "comparison-sets"), { recursive: true });
    await mkdir(join(caseRoot, "runs"), { recursive: true });
    await mkdir(join(caseRoot, "ratings"), { recursive: true });

    await writeFile(
      join(caseRoot, "case.md"),
      [
        "---",
        "artifact_type: case",
        "case_id: fsd-accident-economy",
        "title: FSD Accident Economy",
        "source_paths: []",
        "visibility: internal",
        "---",
        "",
        "# Case",
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
        "# Problem",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(caseRoot, "runs/run.md"),
      [
        "---",
        "artifact_type: kernel_case_run",
        "case_id: fsd-accident-economy",
        "run_artifact_id: run_fixture",
        "source_type: kernel",
        "source_status: imported",
        "kernel: cody",
        "source_mapping_version: cody-runtime-importer-v1",
        "problem_recovery_title: Runtime Problem Recovery",
        "solution_title: Runtime Solution",
        "created_at: 2026-06-22T00:00:00.000Z",
        "---",
        "",
        "# Trace",
        "",
        "Step one.",
        "",
        "# Case Study",
        "",
        "Case body.",
        "",
        "# Discovery",
        "",
        "Discovery body.",
        "",
        "# Problem Recovery",
        "",
        "Recovered problem body.",
        "",
        "# Solution",
        "",
        "Solution body.",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(caseRoot, "ratings/problem-rating.md"),
      [
        "---",
        "artifact_type: human_rating",
        "rating_id: rating_problem",
        "rating_target: problem_recovery",
        "case_id: fsd-accident-economy",
        "problem_recovery_id: run_fixture__problem_recovery",
        "score: 4",
        "scale_min: -5",
        "scale_max: 5",
        "submitted_at: 2026-06-22T12:00:00.000Z",
        "app_version: calibrator-v0",
        "---",
        "",
        "Good recovery.",
      ].join("\n"),
      "utf8",
    );

    const index = await readVaultIndex(vaultRoot);
    expect(index.cases[0]?.problem_recoveries[0]).toMatchObject({
      problem_recovery_id: "run_fixture__problem_recovery",
      run_artifact_id: "run_fixture",
      title: "Runtime Problem Recovery",
      body: "Recovered problem body.",
      human_ratings: [{ rating_id: "rating_problem", score: 4 }],
    });
    expect(index.cases[0]?.solutions[0]).toMatchObject({
      solution_id: "run_fixture__solution",
      title: "Runtime Solution",
    });
  });
});
