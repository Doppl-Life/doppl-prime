import { z } from "zod";
import { SubtypeName } from "../domain/subtype-payloads.js";
import { RunCaps } from "./run-caps.js";

/**
 * RunConfig — the operator-supplied configuration that drives a single
 * run. `rngSeed` is REQUIRED so the per-run seed is persisted in
 * `run.configured` for deterministic replay (ARCHITECTURE.md §4, RNG
 * capture). `enabledSubtypes` must contain at least one subtype.
 */
export const RunConfig = z
  .object({
    seed: z.string().min(1),
    enabledSubtypes: z.array(SubtypeName).min(1),
    caps: RunCaps,
    modelProfile: z.string().min(1),
    scoringPolicyVersion: z.string().min(1),
    rngSeed: z.string().min(1),
    /** Human-readable problem statement — curated prompt's `prompt` body
     *  or the operator-typed text. Optional for backward compat with
     *  fixtures recorded before this field existed. */
    problemText: z.string().min(1).optional(),
    /** Human-readable problem title — curated prompt's `title` or a
     *  short summary of the operator prompt. Optional for the same reason. */
    problemTitle: z.string().min(1).optional(),
  })
  .strict();
export type RunConfig = z.infer<typeof RunConfig>;
