import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImportedSolutionArtifact } from "./importTypes";
import { caseRoot } from "../vaultPaths";

function toYamlValue(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `\n${value.map((item) => `  - ${toYamlValue(item)}`).join("\n")}`;
  }
  if (typeof value === "string" && /^[a-zA-Z0-9_:@./ -]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function frontmatterYaml(frontmatter: Record<string, unknown>): string {
  return Object.entries(frontmatter)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${toYamlValue(value)}`)
    .join("\n");
}

export async function writeImportedSolution(
  vaultRoot: string,
  artifact: ImportedSolutionArtifact,
): Promise<string> {
  const solutionsRoot = join(caseRoot(vaultRoot, artifact.case_id), "solutions");
  await mkdir(solutionsRoot, { recursive: true });
  const outputPath = join(solutionsRoot, `${artifact.solution_id}.md`);
  const frontmatter = {
    artifact_type: "solution",
    case_id: artifact.case_id,
    solution_id: artifact.solution_id,
    title: artifact.title,
    source_type: artifact.source_type,
    comparison_set_id: artifact.comparison_set_id,
    comparison_input_hash: artifact.comparison_input_hash,
    comparison_input_paths: artifact.comparison_input_paths,
    source_status: artifact.source_status,
    source_branch: artifact.source_branch,
    source_commit: artifact.source_commit,
    adapter_version: artifact.adapter_version,
    adapter_notes: artifact.adapter_notes,
    output_class: artifact.output_class,
    phase: artifact.phase,
    subtype: artifact.subtype,
    kernel: artifact.kernel,
    branch: artifact.branch,
    run_id: artifact.run_id,
    generation_id: artifact.generation_id,
    agenome_id: artifact.agenome_id,
    candidate_id: artifact.candidate_id,
    judge_score: artifact.judge_score,
    fitness_score: artifact.fitness_score,
    created_at: artifact.created_at,
  };
  await writeFile(
    outputPath,
    ["---", frontmatterYaml(frontmatter), "---", "", artifact.body.trim(), ""].join("\n"),
    "utf8",
  );
  return outputPath;
}
