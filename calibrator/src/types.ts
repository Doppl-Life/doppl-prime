export interface CalibratorSolution {
  case_id: string;
  solution_id: string;
  title: string;
  source_type: "kernel" | "manual" | "unknown";
  output_class?: "candidate" | "pepsi" | "possible_pepsi" | "many_pepsis";
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
  solutions: CalibratorSolution[];
}

export interface CalibratorIndex {
  generated_at: string;
  cases: CalibratorCase[];
}

export interface RatingSubmitResponse {
  ratingId: string;
  relativePath: string;
}
