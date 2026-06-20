import { z } from 'zod';

/**
 * ScoringPolicy — the versioned, decomposed scoring rule (ARCHITECTURE.md §8, Appendix A line 476).
 * Strict 3-field object.
 *
 * KEY SAFETY RULE #6 (scoring policy immutable to agents): a policy is identified by `version` and is
 * VERSIONED, never mutated in place — every `FitnessScore` it produces carries a `policyVersion`
 * binding it to this exact policy (anti-reward-hacking; agents cannot move the fitness anchor).
 *
 * STRUCTURE is frozen now; the numeric weight VALUES in `weights` are the ONLY deferred-open contract
 * piece (§8) — the schema pins that `weights` exists as a name→number record, NOT which keys/values
 * (later policy versions fill them in). `normalization` is an optional named method.
 */
export const ScoringPolicy = z.strictObject({
  version: z.string().min(1),
  weights: z.record(z.string(), z.number()),
  normalization: z.string().min(1).optional(),
});

export type ScoringPolicy = z.infer<typeof ScoringPolicy>;
