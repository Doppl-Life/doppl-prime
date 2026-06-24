import { z } from 'zod';
import { Subtype } from '../domain/subtype';
import { RunCaps } from './run-caps';
import { GenerationOperator } from './generation-operator';
import { ModelRouteOverride } from './model-route-override';

/**
 * RunConfig — the per-run configuration (ARCHITECTURE.md §4, Appendix A). Strict (unknown keys
 * rejected). `rngSeed` is REQUIRED so the per-run PRNG seed is persistable in `run.configured` for
 * deterministic replay (§4); `seed` is the run/problem-scenario seed (distinct from the RNG seed).
 * At least one `Subtype` must be enabled.
 *
 * frontend-v2 FB.0 (schemaVersion 5→6) adds three OPTIONAL, additive run-control fields the launcher
 * introduces. All three are GENERATION inputs (KEY SAFETY RULE #5 DATA, rule-#6-safe) — they bias what
 * agenomes PRODUCE, and are NEVER scoring/judge levers or caps (rule #1/#6); runtime honors them in
 * FB.1–FB.4. The ScoringPolicy/FinalJudgeRubric/FinalJudgeAxis judge anchor is untouched by them:
 *  - `generationOperators` — selected mutagen skills, composed into the generation prompt as isolated DATA (FB.3).
 *  - `generationBias` — the diverge(+)/converge(−) dial in [-1, +1], 0 neutral; a recorded generation hint.
 *  - `modelRouteOverride` — a partial per-role `{provider, modelId}` override; allowlist-clamped at runtime (FB.2).
 */
export const RunConfig = z.strictObject({
  seed: z.string().min(1),
  enabledSubtypes: z.array(Subtype).min(1),
  caps: RunCaps,
  modelProfile: z.string().min(1),
  scoringPolicyVersion: z.string().min(1),
  rngSeed: z.int().nonnegative(),
  generationOperators: z.array(GenerationOperator).min(1).optional(),
  generationBias: z.number().min(-1).max(1).optional(),
  modelRouteOverride: ModelRouteOverride.optional(),
});

export type RunConfig = z.infer<typeof RunConfig>;
