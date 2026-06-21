import { z } from 'zod';

/**
 * FinalJudgeAxis — the CLOSED 5-axis judging set (ARCHITECTURE.md §7/§8). The MVP held-out rubric is a
 * 5-axis 0–5 scale; this freezes the axis NAMES so an agent can never add/remove a judging axis (KEY
 * SAFETY RULE #6, anti-reward-hacking). The set mirrors the `/eval` held-out-rubric harness. Any other
 * axis name is rejected.
 */
export const FinalJudgeAxis = z.enum([
  'grounding',
  'novelty',
  'feasibility',
  'falsification_survival',
  'subtype_check_pass',
]);

export type FinalJudgeAxis = z.infer<typeof FinalJudgeAxis>;

/**
 * FinalJudgeRubric — the held-out judge's fixed rubric (ARCHITECTURE.md §7/§8/§14, Appendix A). Strict
 * 4-field object — the BEDROCK FITNESS ANCHOR the organism cannot move (KEY SAFETY RULE #6).
 *
 * The immutability anchor is pinned BY SHAPE, stacking four legs so a future widening fails the §2.5
 * field-name snapshot mechanically:
 *  - `axes` is an array of the CLOSED FinalJudgeAxis — no agent can introduce a judging axis.
 *  - `immutableToAgents` is `z.literal(true)` — the flag cannot be set false or omitted at the boundary.
 *  - `policyVersion` is REQUIRED and typed identically to `ScoringPolicy.version` (`z.string().min(1)`)
 *    — immutability-via-versioning (lesson §12): the rubric is never mutated in place, a new version
 *    supersedes; no shared `PolicyVersion` symbol (P0.8 ruled YAGNI).
 *  - the strict object admits no mutation/override/authority field (`mutable` / `editableBy` /
 *    `scoreOverride` / `weightOverride` / `agentWritable` … are unrepresentable — lesson §9).
 *
 * STRUCTURE is frozen; the numeric `weights` VALUES are the ONLY deferred-open scoring piece (§7,
 * lesson §6) — an OPEN name→number record (keys open so the §7 energy-efficiency tiebreak, a NON-axis
 * weight, fits; sibling to `ScoringPolicy.weights`). The 0–5 per-axis SCALE is how the judge APPLIES
 * the rubric at runtime — NOT a rubric field, so there is no `scale` / `min` / `max`.
 */
export const FinalJudgeRubric = z.strictObject({
  axes: z.array(FinalJudgeAxis),
  weights: z.record(z.string(), z.number()),
  policyVersion: z.string().min(1),
  immutableToAgents: z.literal(true),
});

export type FinalJudgeRubric = z.infer<typeof FinalJudgeRubric>;
