import { z } from 'zod';
import { Subtype } from '../domain/subtype';
import { RunCaps } from './run-caps';

/**
 * RunConfig — the per-run configuration (ARCHITECTURE.md §4, Appendix A). Strict (unknown keys
 * rejected). `rngSeed` is REQUIRED so the per-run PRNG seed is persistable in `run.configured` for
 * deterministic replay (§4); `seed` is the run/problem-scenario seed (distinct from the RNG seed).
 * At least one `Subtype` must be enabled.
 */
export const RunConfig = z.strictObject({
  seed: z.string().min(1),
  enabledSubtypes: z.array(Subtype).min(1),
  caps: RunCaps,
  modelProfile: z.string().min(1),
  scoringPolicyVersion: z.string().min(1),
  rngSeed: z.int().nonnegative(),
});

export type RunConfig = z.infer<typeof RunConfig>;
