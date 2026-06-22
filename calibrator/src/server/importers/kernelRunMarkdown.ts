import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { caseRoot } from "../vaultPaths";
import { frontmatterYaml } from "./solutionMarkdown";
import { KernelRunImportArtifact, KernelRunImportFile } from "./kernelRunContract";
import type { KernelRunImportArtifactInput } from "./kernelRunContract";

function textBlockToMarkdown(value: string | string[] | undefined): string {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value.map((item, index) => `${index + 1}. ${item.trim()}`).join("\n");
  }
  return value.trim();
}

function section(title: string, body: string | string[] | undefined): string[] {
  const markdown = textBlockToMarkdown(body);
  if (!markdown) return [];
  return [`# ${title}`, "", markdown, ""];
}

export function renderKernelRunMarkdown(input: KernelRunImportArtifactInput): string {
  const artifact = KernelRunImportArtifact.parse(input);
  const frontmatter = {
    artifact_type: "kernel_case_run",
    case_id: artifact.case_id,
    run_artifact_id: artifact.run_artifact_id,
    source_type: artifact.source_type,
    source_status: artifact.source_status,
    source_branch: artifact.source_branch,
    source_commit: artifact.source_commit,
    source_mapping_version: artifact.source_mapping_version,
    adapter_version: artifact.adapter_version,
    adapter_notes: artifact.adapter_notes,
    kernel: artifact.kernel,
    branch: artifact.branch,
    run_id: artifact.run_id,
    problem_recovery_title: artifact.problem_recovery.title,
    solution_title: artifact.solution?.title,
    created_at: artifact.created_at,
  };
  const body = [
    ...section("Trace", artifact.trace),
    ...section("Case Study", artifact.case_study),
    ...section("Discovery", artifact.discovery),
    ...section("Problem Recovery", artifact.problem_recovery.body),
    ...section("Solution", artifact.solution?.body),
  ].join("\n");

  return ["---", frontmatterYaml(frontmatter), "---", "", body.trim(), ""].join("\n");
}

export async function writeKernelRunArtifact(
  vaultRoot: string,
  input: KernelRunImportArtifactInput,
): Promise<string> {
  const artifact = KernelRunImportArtifact.parse(input);
  const runsRoot = join(caseRoot(vaultRoot, artifact.case_id), "runs");
  await mkdir(runsRoot, { recursive: true });
  const outputPath = join(runsRoot, `${artifact.run_artifact_id}.md`);
  await writeFile(outputPath, renderKernelRunMarkdown(artifact), "utf8");
  return outputPath;
}

export async function importKernelRunFile(inputPath: string, vaultRoot: string): Promise<string[]> {
  const raw = await readFile(inputPath, "utf8");
  const parsed = KernelRunImportFile.parse(JSON.parse(raw));
  const artifacts = Array.isArray(parsed) ? parsed : [parsed];
  const outputPaths: string[] = [];
  for (const artifact of artifacts) {
    outputPaths.push(await writeKernelRunArtifact(vaultRoot, artifact));
  }
  return outputPaths;
}
