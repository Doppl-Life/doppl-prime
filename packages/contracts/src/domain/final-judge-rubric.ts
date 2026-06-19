import { z } from "zod";

/**
 * FinalJudgeRubric — the held-out judge's fixed 5-axis 0-5 rubric
 * (ARCHITECTURE.md §7, IMPLEMENTATION_PLAN.md P0.15). IMMUTABLE TO AGENTS
 * (security invariant §14): metric mutation cannot move this bedrock
 * anchor. Axes and scale are pinned at the schema level via z.tuple of
 * literals and z.literal(0)/z.literal(5); the only flexible component is
 * `weights`, which is policy-versioned (start equal + small
 * energy-efficiency tiebreak per §7) and the only deferred-open piece of
 * the scoring contract.
 */

export const FINAL_JUDGE_AXES = [
  "grounding",
  "novelty",
  "feasibility",
  "falsification_survival",
  "subtype_check_pass",
] as const;

export const FinalJudgeRubric = z
  .object({
    version: z.string().min(1),
    axes: z.tuple([
      z.literal("grounding"),
      z.literal("novelty"),
      z.literal("feasibility"),
      z.literal("falsification_survival"),
      z.literal("subtype_check_pass"),
    ]),
    scaleMin: z.literal(0),
    scaleMax: z.literal(5),
    weights: z.record(z.string(), z.number()),
  })
  .strict();
export type FinalJudgeRubric = z.infer<typeof FinalJudgeRubric>;
