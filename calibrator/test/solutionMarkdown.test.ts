import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { writeImportedSolution } from "../src/server/importers/solutionMarkdown";

describe("writeImportedSolution", () => {
  it("writes normalized solution markdown with comparison provenance", async () => {
    const vaultRoot = join(tmpdir(), `calibrator-import-${Date.now()}`);
    await mkdir(join(vaultRoot, "cases/fsd-case/solutions"), { recursive: true });

    const path = await writeImportedSolution(vaultRoot, {
      case_id: "fsd-case",
      solution_id: "michael-imported",
      title: "Imported Michael Output",
      source_type: "kernel",
      comparison_set_id: "fsd-case-v0",
      comparison_input_hash: "sha256:fixture",
      comparison_input_paths: ["case.md", "problem.md"],
      source_status: "imported",
      source_branch: "michael",
      source_commit: "abc123",
      adapter_version: "test-adapter-v0",
      adapter_notes: "Imported from branch markdown.",
      kernel: "michael",
      branch: "michael",
      output_class: "doppl",
      phase: "solution_discovery",
      created_at: "2026-06-22T00:00:00.000Z",
      body: "# Imported\n\nBody.",
    });

    const written = await readFile(path, "utf8");
    expect(written).toContain("artifact_type: solution");
    expect(written).toContain("stage: doppl");
    expect(written).toContain("next: terminal");
    expect(written).toContain("output_class: doppl");
    expect(written).toContain("comparison_set_id: fsd-case-v0");
    expect(written).toContain("source_status: imported");
    expect(written).toContain("source_commit: abc123");
    expect(written).toContain("adapter_version: test-adapter-v0");
    expect(written).toContain("# Imported");
  });
});
