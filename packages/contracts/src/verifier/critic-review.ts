import { z } from "zod";
import { EvidenceRef } from "../domain/evidence-ref.js";

/**
 * Critic-side contracts (ARCHITECTURE.md §7, IMPLEMENTATION_PLAN.md P0.6).
 * Critics emit EVIDENCE only — these shapes deliberately carry no
 * winner-selection or policy-mutation field. Adding such a field would
 * break the §2.5 snapshot, which is the intended alarm.
 */

export const CriticMandateValues = [
  "factual_grounding",
  "novelty_prior_art",
  "feasibility",
  "falsification",
  "subtype_specific",
] as const;

export const CriticMandate = z.enum(CriticMandateValues);
export type CriticMandate = z.infer<typeof CriticMandate>;

export const CriticReview = z
  .object({
    id: z.string().min(1),
    candidateId: z.string().min(1),
    mandate: CriticMandate,
    scores: z.record(z.string(), z.number()),
    critique: z.string(),
    confidence: z.number().min(0).max(1),
    evidenceRefs: z.array(EvidenceRef),
  })
  .strict();
export type CriticReview = z.infer<typeof CriticReview>;
