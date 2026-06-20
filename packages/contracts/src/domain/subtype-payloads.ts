import { z } from 'zod';

/**
 * The two breeding-subtype payloads (ARCHITECTURE.md §3, Appendix A / DATA_MODEL.md). Each candidate
 * `subtype` carries a distinct, strict payload; `CandidateIdea` correlates the two structurally via a
 * discriminated union. These schemas pin field SHAPE only (non-empty strings + string arrays) — never
 * generative quality, which the critics/judge assess downstream.
 */

/**
 * CrossDomainTransferPayload — a technique transplanted from a source domain into a target problem.
 * `executableCheckIdea` is optional (not every transfer proposes a runnable check).
 */
export const CrossDomainTransferPayload = z.strictObject({
  sourceDomain: z.string().min(1),
  sourceTechnique: z.string().min(1),
  targetDomain: z.string().min(1),
  targetProblem: z.string().min(1),
  transferMapping: z.string().min(1),
  expectedMechanism: z.string().min(1),
  executableCheckIdea: z.string().min(1).optional(),
});

export type CrossDomainTransferPayload = z.infer<typeof CrossDomainTransferPayload>;

/**
 * ZeitgeistSynthesisPayload — a "why now" thesis grounded in current signals + falsifiable
 * predictions. The three array fields are arrays of non-empty strings; an empty array is structurally
 * valid (count/quality is the critics' and kernel's concern, not the contract's).
 */
export const ZeitgeistSynthesisPayload = z.strictObject({
  thesis: z.string().min(1),
  audience: z.string().min(1),
  currentSignals: z.array(z.string().min(1)),
  whyNow: z.string().min(1),
  falsifiablePredictions: z.array(z.string().min(1)),
  comparablePriorArt: z.array(z.string().min(1)),
});

export type ZeitgeistSynthesisPayload = z.infer<typeof ZeitgeistSynthesisPayload>;
