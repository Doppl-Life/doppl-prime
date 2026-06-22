import { z } from "zod";

const IsoDateString = z.string().min(1);

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
  artifact_type: z.literal("solution"),
  case_id: z.string().min(1),
  solution_id: z.string().min(1),
  title: z.string().min(1),
  source_type: z.enum(["kernel", "manual", "unknown"]),
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

export const RatingSubmission = z.object({
  case_id: z.string().min(1),
  solution_id: z.string().min(1),
  score: z.number().int().min(-5).max(5),
  notes: z.string().default(""),
  reviewer_email: z.string().email().optional().or(z.literal("")),
  reviewer_name: z.string().optional(),
});

export const RatingFrontmatter = z.object({
  artifact_type: z.literal("human_rating"),
  rating_id: z.string().min(1),
  rating_target: z.literal("solution"),
  case_id: z.string().min(1),
  solution_id: z.string().min(1),
  score: z.number().int().min(-5).max(5),
  scale_min: z.literal(-5),
  scale_max: z.literal(5),
  reviewer_email: z.string().optional(),
  reviewer_name: z.string().optional(),
  submitted_at: IsoDateString,
  app_version: z.literal("calibrator-v0"),
});

export type CaseFrontmatter = z.infer<typeof CaseFrontmatter>;
export type ProblemFrontmatter = z.infer<typeof ProblemFrontmatter>;
export type SolutionFrontmatter = z.infer<typeof SolutionFrontmatter>;
export type RatingSubmission = z.infer<typeof RatingSubmission>;
export type RatingFrontmatter = z.infer<typeof RatingFrontmatter>;
