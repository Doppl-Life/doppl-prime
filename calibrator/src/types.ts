export interface CalibratorRating {
  rating_id: string;
  rating_target: "solution" | "problem_recovery";
  case_id: string;
  solution_id?: string;
  problem_recovery_id?: string;
  score: number;
  verdict?: "dead" | "obvious" | "interesting" | "investigate" | "keeper";
  reviewer_email?: string;
  reviewer_name?: string;
  submitted_at: string;
  app_version: "calibrator-v0";
  body: string;
}

export interface CalibratorSolution {
  case_id: string;
  solution_id: string;
  title: string;
  stage?: "doppl";
  temporal?: boolean;
  next?: "terminal" | null;
  scores?: {
    judge?: number;
    human?: number;
    n?: number;
  };
  source_type: "kernel" | "manual" | "unknown";
  comparison_set_id?: string;
  comparison_input_hash?: string;
  comparison_input_paths?: string[];
  source_status?: "fixture" | "imported" | "live_run" | "pending" | "unavailable";
  source_branch?: string;
  source_commit?: string;
  source_mapping_version?: string;
  adapter_version?: string;
  adapter_notes?: string;
  output_class?: "candidate" | "doppl" | "pepsi" | "possible_pepsi" | "many_pepsis";
  phase?: "research_discovery" | "problem_discovery" | "solution_discovery";
  subtype?: string;
  kernel?: string;
  branch?: string;
  run_id?: string;
  generation_id?: string;
  agenome_id?: string;
  candidate_id?: string;
  judge_score?: number;
  fitness_score?: number;
  created_at?: string;
  body: string;
  human_ratings: CalibratorRating[];
}

export interface CalibratorProblemRecovery {
  case_id: string;
  problem_recovery_id: string;
  title: string;
  stage?: "problem_recovery";
  temporal?: boolean;
  next?: "doppl" | "terminal" | null;
  scores?: {
    judge?: number;
    human?: number;
    n?: number;
  };
  source_type: "kernel" | "manual" | "unknown";
  source_status?: "fixture" | "imported" | "live_run" | "pending" | "unavailable";
  source_branch?: string;
  source_commit?: string;
  source_mapping_version?: string;
  adapter_version?: string;
  adapter_notes?: string;
  kernel?: string;
  branch?: string;
  run_id?: string;
  run_artifact_id?: string;
  created_at?: string;
  trace?: string;
  discovery?: string;
  case_study?: string;
  body: string;
  human_ratings: CalibratorRating[];
}

export interface CalibratorCase {
  case_id: string;
  title: string;
  visibility: string;
  source_paths: string[];
  body: string;
  problem: {
    body: string;
    source: string;
  };
  problem_recoveries: CalibratorProblemRecovery[];
  solutions: CalibratorSolution[];
}

export interface CalibratorComparisonSet {
  comparison_set_id: string;
  case_id: string;
  title: string;
  status: "fixture_only" | "mixed" | "imported" | "live_run";
  input_hash: string;
  input_paths: string[];
  adapter_version: string;
  body: string;
}

export interface CalibratorIndex {
  generated_at: string;
  comparison_sets: CalibratorComparisonSet[];
  cases: CalibratorCase[];
}

export interface RatingSubmitResponse {
  ratingId: string;
  relativePath: string;
}
