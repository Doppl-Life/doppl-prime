import { z } from 'zod';

/**
 * FitnessScore — the policy-versioned, decomposed fitness of a candidate (ARCHITECTURE.md §8,
 * Appendix A line 476). Strict 6-field object; `fitness.scored` references the novelty it consumed.
 *
 * KEY SAFETY RULE #6 (scoring immutability-via-versioning): `policyVersion` is REQUIRED and typed
 * IDENTICALLY to `ScoringPolicy.version` (both `z.string().min(1)`), binding each score to the exact
 * policy that produced it — so a score is forever explainable against its policy and a policy is never
 * mutated in place. A FitnessScore without `policyVersion` is rejected.
 *
 * EXACTLY 6 fields (no `noveltyScoreId`): novelty is referenced as a named `components` signal, and
 * the record-level `fitness.scored ↔ novelty.scored` link is the event-payload layer's job (P0.10).
 * `components` is an open name→number record (the signal set evolves with policy versions, lesson §6)
 * carrying the decomposed signals (critic scores, subtype-check, novelty, energy efficiency, held-out
 * judge acceptance) so every selection decision is explainable from persisted events (§8).
 */
export const FitnessScore = z.strictObject({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  total: z.number(),
  components: z.record(z.string(), z.number()),
  policyVersion: z.string().min(1),
  explanation: z.string().min(1),
});

export type FitnessScore = z.infer<typeof FitnessScore>;
