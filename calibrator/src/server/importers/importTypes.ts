export type ImportSource = "michael" | "cody" | "melissa";

export interface ImportedSolutionArtifact {
  case_id: string;
  solution_id: string;
  title: string;
  body: string;
  source_type: "kernel" | "manual" | "unknown";
  comparison_set_id: string;
  comparison_input_hash: string;
  comparison_input_paths: string[];
  source_status: "fixture" | "imported" | "live_run" | "pending" | "unavailable";
  source_branch: string;
  source_commit: string;
  adapter_version: string;
  adapter_notes: string;
  kernel?: string;
  branch?: string;
  run_id?: string;
  generation_id?: string;
  agenome_id?: string;
  candidate_id?: string;
  output_class?: "candidate" | "pepsi" | "possible_pepsi" | "many_pepsis";
  phase?: "research_discovery" | "problem_discovery" | "solution_discovery";
  subtype?: string;
  judge_score?: number;
  fitness_score?: number;
  created_at: string;
}

export interface ImportAdapterInput {
  caseId: string;
  comparisonSetId: string;
  comparisonInputHash: string;
  comparisonInputPaths: string[];
}

export interface ImportAdapterResult {
  source: ImportSource;
  artifacts: ImportedSolutionArtifact[];
}

export type ImportAdapter = (input: ImportAdapterInput) => Promise<ImportAdapterResult>;
