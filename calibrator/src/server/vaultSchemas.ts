import { z } from "zod";
import { normalizeRaterEmail } from "../raters";

const IsoDateString = z.preprocess((value) => {
  if (value instanceof Date) return value.toISOString();
  return value;
}, z.string().min(1));

const RatingTarget = z.enum(["solution", "problem_recovery"]);
const Verdict = z.enum(["dead", "obvious", "interesting", "investigate", "keeper"]);
const SourceType = z.enum(["kernel", "manual", "unknown"]);
const SourceStatus = z.enum(["fixture", "imported", "live_run", "pending", "unavailable"]);
const ScoresProjection = z
  .object({
    judge: z.number().min(-5).max(10).optional(),
    human: z.number().min(-5).max(10).optional(),
    n: z.number().int().min(0).optional(),
  })
  .optional();
const ReviewerEmail = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return normalizeRaterEmail(value);
}, z.string().email().optional().or(z.literal("")));

export const CaseFrontmatter = z.object({
  artifact_type: z.literal("case"),
  case_id: z.string().min(1),
  title: z.string().min(1),
  source_paths: z.array(z.string().min(1)).default([]),
  visibility: z.string().min(1).default("internal"),
  created_at: IsoDateString.optional(),
});

export const ProblemFrontmatter = z.object({
  artifact_type: z.literal("problem"),
  case_id: z.string().min(1),
  rating_target: z.literal("context_only"),
  source: z.string().min(1),
});

export const SolutionFrontmatter = z.object({
  artifact_type: z.enum(["solution", "doppl"]).default("solution"),
  case_id: z.string().min(1),
  solution_id: z.string().min(1),
  title: z.string().min(1),
  stage: z.literal("doppl").optional(),
  temporal: z.boolean().optional(),
  next: z.enum(["terminal"]).nullable().optional(),
  scores: ScoresProjection,
  source_type: SourceType,
  comparison_set_id: z.string().min(1).optional(),
  comparison_input_hash: z.string().min(1).optional(),
  comparison_input_paths: z.array(z.string().min(1)).default([]),
  source_status: SourceStatus.optional(),
  source_branch: z.string().min(1).optional(),
  source_commit: z.string().min(1).optional(),
  source_mapping_version: z.string().min(1).optional(),
  adapter_version: z.string().min(1).optional(),
  adapter_notes: z.string().min(1).optional(),
  output_class: z.enum(["candidate", "doppl", "pepsi", "possible_pepsi", "many_pepsis"]).optional(),
  phase: z.enum(["research_discovery", "problem_discovery", "solution_discovery"]).optional(),
  subtype: z.string().min(1).optional(),
  kernel: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  generation_id: z.string().min(1).optional(),
  agenome_id: z.string().min(1).optional(),
  candidate_id: z.string().min(1).optional(),
  judge_score: z.number().optional(),
  fitness_score: z.number().optional(),
  created_at: IsoDateString.optional(),
});

export const ProblemRecoveryFrontmatter = z.object({
  artifact_type: z.literal("problem_recovery"),
  case_id: z.string().min(1),
  problem_recovery_id: z.string().min(1),
  title: z.string().min(1),
  stage: z.literal("problem_recovery").optional(),
  temporal: z.boolean().optional(),
  next: z.enum(["doppl", "terminal"]).nullable().optional(),
  scores: ScoresProjection,
  source_type: SourceType,
  source_status: SourceStatus.optional(),
  source_branch: z.string().min(1).optional(),
  source_commit: z.string().min(1).optional(),
  source_mapping_version: z.string().min(1).optional(),
  adapter_version: z.string().min(1).optional(),
  adapter_notes: z.string().min(1).optional(),
  kernel: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  run_artifact_id: z.string().min(1).optional(),
  created_at: IsoDateString.optional(),
});

export const KernelCaseRunFrontmatter = z.object({
  artifact_type: z.literal("kernel_case_run"),
  case_id: z.string().min(1),
  run_artifact_id: z.string().min(1),
  source_type: SourceType,
  source_status: SourceStatus.optional(),
  source_branch: z.string().min(1).optional(),
  source_commit: z.string().min(1).optional(),
  source_mapping_version: z.string().min(1).optional(),
  adapter_version: z.string().min(1).optional(),
  adapter_notes: z.string().min(1).optional(),
  kernel: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  problem_recovery_title: z.string().min(1).optional(),
  solution_title: z.string().min(1).optional(),
  created_at: IsoDateString.optional(),
});

export const ComparisonSetFrontmatter = z.object({
  artifact_type: z.literal("comparison_set"),
  comparison_set_id: z.string().min(1),
  case_id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["fixture_only", "mixed", "imported", "live_run"]),
  input_hash: z.string().min(1),
  input_paths: z.array(z.string().min(1)).default([]),
  adapter_version: z.string().min(1),
  created_at: IsoDateString.optional(),
});

export const RatingSubmission = z
  .object({
    case_id: z.string().min(1),
    rating_target: RatingTarget.default("solution"),
    solution_id: z.string().min(1).optional(),
    problem_recovery_id: z.string().min(1).optional(),
    node_id: z.string().min(1).optional(),
    score: z.number().int().min(0).max(10),
    notes: z.string().default(""),
    reviewer_email: ReviewerEmail,
    reviewer_name: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.rating_target === "solution" && !value.solution_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["solution_id"],
        message: "solution_id is required",
      });
    }
    if (value.rating_target === "problem_recovery" && !value.problem_recovery_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["problem_recovery_id"],
        message: "problem_recovery_id is required",
      });
    }
  });

export const RatingFrontmatter = z
  .object({
    artifact_type: z.literal("human_rating"),
    rating_id: z.string().min(1),
    rating_target: RatingTarget,
    case_id: z.string().min(1),
    solution_id: z.string().min(1).optional(),
    problem_recovery_id: z.string().min(1).optional(),
    score: z.number().int().min(-5).max(10),
    verdict: Verdict.optional(),
    phase: z.enum(["problem_discovery", "solution_discovery"]).optional(),
    target_kind: RatingTarget.optional(),
    scale_min: z.union([z.literal(-5), z.literal(0)]),
    scale_max: z.union([z.literal(5), z.literal(10)]),
    reviewer_email: z.string().optional(),
    reviewer_name: z.string().optional(),
    submitted_at: IsoDateString,
    app_version: z.literal("calibrator-v0"),
  })
  .superRefine((value, ctx) => {
    if (value.rating_target === "solution" && !value.solution_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["solution_id"],
        message: "solution_id is required",
      });
    }
    if (value.rating_target === "problem_recovery" && !value.problem_recovery_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["problem_recovery_id"],
        message: "problem_recovery_id is required",
      });
    }
  });

export type CaseFrontmatter = z.infer<typeof CaseFrontmatter>;
export type ProblemFrontmatter = z.infer<typeof ProblemFrontmatter>;
export type SolutionFrontmatter = z.infer<typeof SolutionFrontmatter>;
export type ProblemRecoveryFrontmatter = z.infer<typeof ProblemRecoveryFrontmatter>;
export type KernelCaseRunFrontmatter = z.infer<typeof KernelCaseRunFrontmatter>;
export type ComparisonSetFrontmatter = z.infer<typeof ComparisonSetFrontmatter>;
export type RatingSubmission = z.infer<typeof RatingSubmission>;
export type RatingFrontmatter = z.infer<typeof RatingFrontmatter>;
