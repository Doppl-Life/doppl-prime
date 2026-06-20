import { z } from 'zod';
import { EvidenceRef } from '../domain/evidence-ref';

/**
 * CriticMandate — the CLOSED 5-member critic-mandate union (ARCHITECTURE.md §7). Each critic operates
 * under exactly one mandate; any other value is rejected.
 */
export const CriticMandate = z.enum([
  'factual_grounding',
  'novelty_prior_art',
  'feasibility',
  'falsification',
  'subtype_specific',
]);

export type CriticMandate = z.infer<typeof CriticMandate>;

/**
 * CriticReview — a critic's structured output (ARCHITECTURE.md §7, Appendix A). Strict 7-field object.
 *
 * KEY SAFETY RULE #6 (critics emit evidence only — anti-reward-hacking): the critic council can
 * NEVER select winners, mutate candidates/lineage, or alter scoring policy. That invariant is pinned
 * STRUCTURALLY here — `z.strictObject` admits exactly the 7 evidence fields, so a `winner` /
 * `selected` / `scoreOverride` / `policyVersion` field is unrepresentable (rejected as unknown), and
 * the field-name schema-snapshot freezes the surface so a future widening fails the §2.5 gate.
 *
 * The schema encodes SHAPE only: `scores` keys are open (the axis set is the §8 ScoringPolicy's
 * concern), and `evidenceRefs` MAY be empty (≥1-evidence is a kernel explainability rule, lesson §6).
 * `confidence` is a definitional [0,1] probability bound (not a kernel-policed cap).
 */
export const CriticReview = z.strictObject({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  mandate: CriticMandate,
  scores: z.record(z.string(), z.number()),
  critique: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(EvidenceRef),
});

export type CriticReview = z.infer<typeof CriticReview>;
