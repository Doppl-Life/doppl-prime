import type { ImportAdapterInput, ImportAdapterResult, ImportSource } from "./importTypes";
import { readGitRefCommit, readGitRefText } from "./gitRef";

const ADAPTER_VERSION = "runtime-branch-provenance-adapter-v0";

interface RuntimeBranchConfig {
  source: Extract<ImportSource, "cody" | "melissa">;
  ref: string;
  solutionId: string;
  title: string;
  kernel: string;
}

const BRANCHES: Record<Extract<ImportSource, "cody" | "melissa">, RuntimeBranchConfig> = {
  cody: {
    source: "cody",
    ref: "origin/cody",
    solutionId: "cody-branch-solution-import",
    title: "Cody Branch Imported Solution",
    kernel: "cody",
  },
  melissa: {
    source: "melissa",
    ref: "origin/melissa",
    solutionId: "melissa-branch-solution-import",
    title: "Melissa Branch Imported Solution",
    kernel: "melissa",
  },
};

async function importRuntimeBranch(
  input: ImportAdapterInput,
  config: RuntimeBranchConfig,
): Promise<ImportAdapterResult> {
  const sourceCommit = await readGitRefCommit(config.ref);
  const directSolutionPath = `case-studies/${input.caseId}/solution.md`;
  const directSolution = await readGitRefText(config.ref, directSolutionPath);
  const hasDirectSolution = Boolean(directSolution?.trim());

  if (!hasDirectSolution) {
    return {
      source: config.source,
      artifacts: [],
    };
  }

  return {
    source: config.source,
    artifacts: [
      {
        case_id: input.caseId,
        solution_id: config.solutionId,
        title: hasDirectSolution ? `${config.title} Solution` : `${config.title} Provenance`,
        body: [
          `# ${config.title}`,
          "",
          `Imported direct branch solution markdown from \`${directSolutionPath}\`.`,
          "",
          "## Import Status",
          "",
          "This artifact can be rated as an imported branch solution.",
          "",
          "## Direct Solution Markdown",
          "",
          directSolution!.trim(),
        ].join("\n"),
        source_type: "kernel",
        comparison_set_id: input.comparisonSetId,
        comparison_input_hash: input.comparisonInputHash,
        comparison_input_paths: input.comparisonInputPaths,
        source_status: "imported",
        source_branch: config.source,
        source_commit: sourceCommit,
        adapter_version: ADAPTER_VERSION,
        adapter_notes: `Imported from ${config.source} branch solution markdown.`,
        kernel: config.kernel,
        branch: config.source,
        run_id: `import-${input.caseId}`,
        generation_id: "branch-runtime-provenance",
        agenome_id: `${config.source}-runtime`,
        candidate_id: "branch-solution-md",
        output_class: "candidate",
        phase: "solution_discovery",
        subtype: "runtime_branch",
        created_at: new Date().toISOString(),
      },
    ],
  };
}

export function importCodyRuntime(input: ImportAdapterInput): Promise<ImportAdapterResult> {
  return importRuntimeBranch(input, BRANCHES.cody);
}

export function importMelissaRuntime(input: ImportAdapterInput): Promise<ImportAdapterResult> {
  return importRuntimeBranch(input, BRANCHES.melissa);
}
