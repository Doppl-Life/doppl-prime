import type { ImportAdapterInput, ImportAdapterResult, ImportSource } from "./importTypes";
import { readGitRefCommit, readGitRefText } from "./gitRef";

const ADAPTER_VERSION = "runtime-branch-provenance-adapter-v0";

interface RuntimeBranchConfig {
  source: Extract<ImportSource, "cody" | "melissa">;
  ref: string;
  solutionId: string;
  title: string;
  kernel: string;
  capabilityPaths: string[];
  notes: string;
}

const BRANCHES: Record<Extract<ImportSource, "cody" | "melissa">, RuntimeBranchConfig> = {
  cody: {
    source: "cody",
    ref: "origin/cody",
    solutionId: "cody-runtime-branch-import",
    title: "Cody Runtime Branch Import",
    kernel: "cody",
    capabilityPaths: [
      "apps/api/src/runtime/loop/generationLoop.ts",
      "apps/api/src/verifier/judge/rubric.ts",
      "apps/api/src/verifier/isolation/candidate-as-data.ts",
      "apps/api/src/projections/lineage-export.ts",
    ],
    notes:
      "Cody has runtime, candidate isolation, judge, and projection machinery, but no direct case-specific solution export for this case yet.",
  },
  melissa: {
    source: "melissa",
    ref: "origin/melissa",
    solutionId: "melissa-runtime-branch-import",
    title: "Melissa Runtime Branch Import",
    kernel: "melissa",
    capabilityPaths: [
      "apps/api/src/runtime/generation-loop.ts",
      "apps/api/src/runtime/demo/demo-run-config.ts",
      "apps/api/src/selection/fitness/policy.ts",
      "apps/api/src/verifier/judge/run-judge.ts",
    ],
    notes:
      "Melissa has problem-threaded generation and scoring machinery, but no direct case-specific solution export for this case yet.",
  },
};

async function sourceExcerpt(ref: string, path: string): Promise<string> {
  const text = await readGitRefText(ref, path);
  if (!text) return `### ${path}\n\nUnavailable in branch.`;
  return [`### ${path}`, "", "```ts", text.trim().split("\n").slice(0, 80).join("\n"), "```"].join("\n");
}

async function importRuntimeBranch(
  input: ImportAdapterInput,
  config: RuntimeBranchConfig,
): Promise<ImportAdapterResult> {
  const sourceCommit = await readGitRefCommit(config.ref);
  const directSolutionPath = `case-studies/${input.caseId}/solution.md`;
  const directSolution = await readGitRefText(config.ref, directSolutionPath);
  const hasDirectSolution = Boolean(directSolution?.trim());
  const excerpts = await Promise.all(config.capabilityPaths.map((path) => sourceExcerpt(config.ref, path)));

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
          hasDirectSolution
            ? `Imported direct branch solution markdown from \`${directSolutionPath}\`.`
            : config.notes,
          "",
          "## Import Status",
          "",
          hasDirectSolution
            ? "This artifact can be rated as an imported branch solution."
            : "This artifact should not be rated as a final solution. It records branch capability and the absence of a direct exported solution for this case.",
          "",
          ...(hasDirectSolution ? ["## Direct Solution Markdown", "", directSolution!.trim(), ""] : []),
          "## Capability Evidence",
          "",
          ...excerpts,
        ].join("\n"),
        source_type: "kernel",
        comparison_set_id: input.comparisonSetId,
        comparison_input_hash: input.comparisonInputHash,
        comparison_input_paths: input.comparisonInputPaths,
        source_status: hasDirectSolution ? "imported" : "unavailable",
        source_branch: config.source,
        source_commit: sourceCommit,
        adapter_version: ADAPTER_VERSION,
        adapter_notes: hasDirectSolution
          ? `Imported from ${config.source} branch solution markdown.`
          : config.notes,
        kernel: config.kernel,
        branch: config.source,
        run_id: `import-${input.caseId}`,
        generation_id: "branch-runtime-provenance",
        agenome_id: `${config.source}-runtime`,
        candidate_id: hasDirectSolution ? "branch-solution-md" : "no-direct-case-export",
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
