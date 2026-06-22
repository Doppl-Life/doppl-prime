import type { ImportAdapterResult, ImportAdapterInput } from "./importTypes";
import { readGitRefCommit, readGitRefText } from "./gitRef";

const ADAPTER_VERSION = "michael-markdown-adapter-v0";

function isPendingSolution(markdown: string): boolean {
  return /pending and unsolved/i.test(markdown) || /solution unknown/i.test(markdown);
}

export async function importMichaelMarkdown(input: ImportAdapterInput): Promise<ImportAdapterResult> {
  const sourceBranch = "michael";
  const sourceRef = "origin/michael";
  const sourceCommit = await readGitRefCommit(sourceRef);
  const sourcePath = `case-studies/${input.caseId}/solution.md`;
  const sourceMarkdown = await readGitRefText(sourceRef, sourcePath);

  if (!sourceMarkdown) {
    return {
      source: "michael",
      artifacts: [
        {
          case_id: input.caseId,
          solution_id: "michael-branch-solution-import",
          title: "Michael Branch Solution Import",
          body: [
            "# Michael Branch Solution Import",
            "",
            `No solution artifact was found at \`${sourcePath}\` on \`${sourceRef}\`.`,
          ].join("\n"),
          source_type: "kernel",
          comparison_set_id: input.comparisonSetId,
          comparison_input_hash: input.comparisonInputHash,
          comparison_input_paths: input.comparisonInputPaths,
          source_status: "unavailable",
          source_branch: sourceBranch,
          source_commit: sourceCommit,
          adapter_version: ADAPTER_VERSION,
          adapter_notes: "No Michael branch solution markdown was available for this case.",
          kernel: "michael",
          branch: sourceBranch,
          run_id: `import-${input.caseId}`,
          generation_id: "branch-markdown",
          agenome_id: "michael-kernel-assay",
          candidate_id: "branch-solution-md",
          output_class: "candidate",
          phase: "solution_discovery",
          subtype: "branch_solution",
          created_at: new Date().toISOString(),
        },
      ],
    };
  }

  const pending = isPendingSolution(sourceMarkdown);
  return {
    source: "michael",
    artifacts: [
      {
        case_id: input.caseId,
        solution_id: "michael-branch-solution-import",
        title: pending ? "Michael Branch Pending Solution" : "Michael Branch Imported Solution",
        body: [
          pending ? "# Michael Branch Pending Solution" : "# Michael Branch Imported Solution",
          "",
          pending
            ? "The Michael branch has an explicit solution artifact for this case, but it marks the case as pending rather than solved."
            : "Imported directly from the Michael branch solution markdown.",
          "",
          "## Source Markdown",
          "",
          sourceMarkdown.trim(),
        ].join("\n"),
        source_type: "kernel",
        comparison_set_id: input.comparisonSetId,
        comparison_input_hash: input.comparisonInputHash,
        comparison_input_paths: input.comparisonInputPaths,
        source_status: pending ? "pending" : "imported",
        source_branch: sourceBranch,
        source_commit: sourceCommit,
        adapter_version: ADAPTER_VERSION,
        adapter_notes: pending
          ? "Imported from Michael branch markdown; this case is explicitly pending and unsolved there."
          : "Imported from Michael branch solution markdown.",
        kernel: "michael",
        branch: sourceBranch,
        run_id: `import-${input.caseId}`,
        generation_id: "branch-markdown",
        agenome_id: "michael-kernel-assay",
        candidate_id: "branch-solution-md",
        output_class: "candidate",
        phase: "solution_discovery",
        subtype: "branch_solution",
        created_at: new Date().toISOString(),
      },
    ],
  };
}
